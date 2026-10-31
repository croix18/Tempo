# Walks through every lesson step in the browser and completes it the way a learner would.
import asyncio, json, sys
from playwright.async_api import async_playwright
import os
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CHROME = os.environ.get('CHROME') or ('/usr/bin/google-chrome' if os.path.exists('/usr/bin/google-chrome') else None)
URL = 'file://' + ROOT + '/dist/Tempo.html'
ONLY = sys.argv[1] if len(sys.argv) > 1 else None
async def click_sq(pg, sq):
    o = await pg.evaluate("document.querySelector('.board').__board.orient")
    box = await pg.locator('.board').first.bounding_box()
    f = ord(sq[0]) - 97; r = int(sq[1]) - 1
    x = (f if o == 'w' else 7 - f) + 0.5; y = (7 - r if o == 'w' else r) + 0.5
    await pg.mouse.click(box['x'] + box['width'] * x / 8, box['y'] + box['height'] * y / 8)
async def play(pg, u):
    await click_sq(pg, u[:2]); await pg.wait_for_timeout(90); await click_sq(pg, u[2:4])
    if len(u) == 5:
        await pg.wait_for_timeout(200)
        names = {'q': 'Queen', 'r': 'Rook', 'b': 'Bishop', 'n': 'Knight'}
        btn = pg.locator('.promo-btn[aria-label="%s"]' % names[u[4]])
        if await btn.count(): await btn.click()
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=CHROME, args=['--no-sandbox'])
        pg = await b.new_page(viewport={'width': 1200, 'height': 900})
        errs = []
        pg.on('pageerror', lambda e: errs.append('pageerror: ' + str(e)))
        pg.on('console', lambda m: errs.append(m.type + ': ' + m.text[:200]) if m.type == 'error' else None)
        await pg.goto(URL); await pg.wait_for_timeout(2500)
        units = await pg.evaluate("Data.lessons()")
        problems = []
        for u in units:
            for les in u['lessons']:
                if ONLY and les['id'] != ONLY and u['id'] != ONLY: continue
                await pg.evaluate("(id) => Learn.open(id)", les['id']); await pg.wait_for_timeout(400)
                for i, st in enumerate(les['steps']):
                    cur = await pg.evaluate("Learn._cur()")
                    if not cur or cur['i'] != i: problems.append((les['id'], i, 'not on expected step', cur)); break
                    t = st['t']
                    if t == 'move':
                        line = st['line']
                        for k in range(0, len(line), 2):
                            await pg.wait_for_timeout(250)
                            await play(pg, line[k])
                            await pg.wait_for_timeout(800 if k + 1 < len(line) else 400)
                        c2 = await pg.evaluate("Learn._cur()")
                        if not c2['complete']: problems.append((les['id'], i, 'move step not completed'))
                    elif t == 'pick':
                        for q in st['squares']: await click_sq(pg, q); await pg.wait_for_timeout(60)
                        await pg.locator('button', has_text='Check').click(); await pg.wait_for_timeout(300)
                        c2 = await pg.evaluate("Learn._cur()")
                        if not c2['complete']: problems.append((les['id'], i, 'pick step not completed'))
                    elif t == 'quiz':
                        await pg.locator('.choice').nth(st['answer']).click(); await pg.wait_for_timeout(250)
                    elif t == 'play':
                        # learner moves come from the engine at full strength
                        for n in range(70):
                            c2 = await pg.evaluate("Learn._cur()")
                            if c2['complete']: break
                            fb = await pg.locator('.feedback').last.inner_text() if await pg.locator('.feedback').count() else ''
                            if 'Restart' in fb or 'Out of moves' in fb or 'checkmated' in fb or 'slipped' in fb or 'Stalemate' in fb or 'ended in a draw' in fb:
                                problems.append((les['id'], i, 'play step failed: ' + fb)); break
                            movable = await pg.evaluate("document.querySelector('.board').__board.canMove()")
                            if not movable: await pg.wait_for_timeout(500); continue
                            fen = await pg.evaluate("document.querySelector('.board').__board.pos.fen()")
                            best = await pg.evaluate("(f) => Engines.analyse({fen: f, depth: 18, movetime: 1500}).then(r => r.best)", fen)
                            if not best: break
                            await play(pg, best); await pg.wait_for_timeout(1200)
                        c2 = await pg.evaluate("Learn._cur()")
                        if not c2['complete']: problems.append((les['id'], i, 'play step not completed'))
                    nxt = pg.locator('button.btn.primary', has_text='Next')
                    fin = pg.locator('button.btn.primary', has_text='Finish')
                    if i < len(les['steps']) - 1:
                        if await nxt.count() and await nxt.is_enabled(): await nxt.click()
                        else: problems.append((les['id'], i, 'Next not available')); break
                    else:
                        if await fin.count() and await fin.is_enabled(): await fin.click()
                        else: problems.append((les['id'], i, 'Finish not available'))
                    await pg.wait_for_timeout(300)
                done = await pg.evaluate("(id) => Store.state.learn.done[id] || null", les['id'])
                print(('OK  ' if done else 'FAIL') + ' ' + u['id'] + '/' + les['id'] + ' stars=' + str(done and done['stars']))
                await pg.evaluate("App.closeSheet()")
        print('problems:', json.dumps(problems, indent=1) if problems else 'none')
        print('errors:', errs if errs else 'none')
        await b.close()
asyncio.run(main())
