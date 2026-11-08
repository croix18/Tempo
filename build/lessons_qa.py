# Walks through every lesson step in the browser and completes it the way a learner would, practice rounds included.
# Usage: python3 build/lessons_qa.py [lesson-or-unit-id]
import asyncio, json, sys
from playwright.async_api import async_playwright
import os
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CHROME = os.environ.get('CHROME') or ('/usr/bin/google-chrome' if os.path.exists('/usr/bin/google-chrome') else None)
TEMPO_URL = os.environ.get('TEMPO_URL') or 'file://' + ROOT + '/dist/Tempo.html'
URL = TEMPO_URL
ONLY = sys.argv[1] if len(sys.argv) > 1 else None
async def click_sq(pg, sq):
    o = await pg.evaluate("document.querySelector('.view .board').__board.orient")
    box = await pg.locator('.view .board').first.bounding_box()
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
async def movable(pg, t):
    try:
        await pg.wait_for_function("() => { const b = document.querySelector('.view .board'); return b && b.__board.canMove(); }", timeout=t)
        return True
    except Exception: return False
# the move a learner who knows the lesson plays now
NEXT = """() => { const L = Learn._cur(), s = Learn._steps()[L.i], b = document.querySelector('.view .board').__board, p = b.pos;
  const u = m => m ? TempoCore.uci(m) : null, strip = x => x.replace(/[+#!?]/g, '');
  if (s.t === 'move') return s.line[L.ply];
  if (s.t === 'line') return L.free ? null : u(p.parseMove(s.moves[L.played.length]));
  if (s.t === 'safe') return s.aim && s.aim.length ? u(p.parseMove(s.aim[0])) : null;
  if (s.t === 'game' && L.inBook) { for (const ln of s.lines) if (ln.length > L.played.length && L.played.every((x, i) => strip(ln[i]) === strip(x))) return u(p.parseMove(ln[L.played.length])); }
  return null; }"""
async def best(pg):
    fen = await pg.evaluate("document.querySelector('.view .board').__board.pos.fen()")
    return await pg.evaluate("(f) => Engines.analyse({fen: f, depth: 16, movetime: 1500}).then(r => r.best)", fen)
async def fb_text(pg):
    return await pg.locator('.view .feedback').last.inner_text() if await pg.locator('.view .feedback').count() else ''
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=CHROME, args=['--no-sandbox'])
        pg = await b.new_page(viewport={'width': 1200, 'height': 900})
        errs = []
        pg.on('pageerror', lambda e: errs.append('pageerror: ' + str(e)))
        pg.on('console', lambda m: errs.append(m.type + ': ' + m.text[:200]) if m.type == 'error' else None)
        await pg.goto(URL); await pg.wait_for_function("window.App && (Engines.status === 'ready' || Engines.status === 'failed')", timeout=60000)
        units = await pg.evaluate("Data.lessons()")
        problems = []
        for u in units:
            for les in u['lessons']:
                if ONLY and les['id'] != ONLY and u['id'] != ONLY: continue
                await pg.evaluate("(id) => Learn.open(id)", les['id']); await pg.wait_for_timeout(1200)   # the practice round arrives a moment later
                i = 0
                while True:
                    cur = await pg.evaluate("Learn._cur()")
                    if not cur or cur['i'] != i: problems.append((les['id'], i, 'not on expected step', cur)); break
                    n = cur['n']; t = cur['t']; ok = True
                    if t == 'walk':
                        for k in range(60):
                            if (await pg.evaluate("Learn._cur()"))['complete']: break
                            await pg.locator('.lesson-actions button.btn.primary').click(); await pg.wait_for_timeout(700)
                    elif t in ('move', 'line', 'safe', 'game'):
                        for k in range(90):
                            c = await pg.evaluate("Learn._cur()")
                            if c['complete']: break
                            f = await fb_text(pg)
                            if 'Restart' in f or 'ends this game' in f or 'slipped' in f or 'Try another' in f or 'Not quite' in f or 'not the move' in f:
                                problems.append((les['id'], i, t + ' step went wrong: ' + f)); ok = False; break
                            if not await movable(pg, 15000):
                                if (await pg.evaluate("Learn._cur()"))['complete']: break
                                problems.append((les['id'], i, t + ' step never became playable')); ok = False; break
                            mv = await pg.evaluate(NEXT) or await best(pg)
                            if not mv: problems.append((les['id'], i, 'no move to play')); ok = False; break
                            await play(pg, mv); await pg.wait_for_timeout(900 if t != 'safe' else 300)
                        for k in range(30):
                            if (await pg.evaluate("Learn._cur()"))['complete']: break
                            await pg.wait_for_timeout(300)
                        if ok and not (await pg.evaluate("Learn._cur()"))['complete']: problems.append((les['id'], i, t + ' step not completed'))
                    elif t == 'pick':
                        st = (await pg.evaluate("Learn._steps()"))[i]
                        for q in st['squares']: await click_sq(pg, q); await pg.wait_for_timeout(60)
                        await pg.locator('button', has_text='Check').click(); await pg.wait_for_timeout(300)
                        if not (await pg.evaluate("Learn._cur()"))['complete']: problems.append((les['id'], i, 'pick step not completed'))
                    elif t == 'quiz':
                        st = (await pg.evaluate("Learn._steps()"))[i]
                        await pg.locator('.choice[data-k="%d"]' % st['answer']).click(); await pg.wait_for_timeout(250)
                    elif t == 'play':
                        # learner moves come from the engine at full strength
                        for k in range(70):
                            c2 = await pg.evaluate("Learn._cur()")
                            if c2['complete']: break
                            f = await fb_text(pg)
                            if 'Restart' in f or 'Out of moves' in f or 'checkmated' in f or 'slipped' in f or 'Stalemate' in f or 'ended in a draw' in f:
                                problems.append((les['id'], i, 'play step failed: ' + f)); break
                            if not await pg.evaluate("document.querySelector('.view .board').__board.canMove()"): await pg.wait_for_timeout(500); continue
                            mv = await best(pg)
                            if not mv: break
                            await play(pg, mv); await pg.wait_for_timeout(1200)
                        if not (await pg.evaluate("Learn._cur()"))['complete']: problems.append((les['id'], i, 'play step not completed'))
                    n = (await pg.evaluate("Learn._cur()"))['n']
                    nxt = pg.locator('.lesson-actions button.btn.primary')
                    if await nxt.count() and await nxt.is_enabled(): await nxt.click()
                    else: problems.append((les['id'], i, 'Next not available')); break
                    await pg.wait_for_timeout(350)
                    i += 1
                    if i >= n: break
                done = await pg.evaluate("(id) => Store.state.learn.done[id] || null", les['id'])
                print(('OK  ' if done else 'FAIL') + ' ' + u['id'] + '/' + les['id'] + ' stars=' + str(done and done['stars']) + ' steps=' + str(i), flush=True)
                await pg.evaluate("App.closeSheet()")
        print('problems:', json.dumps(problems, indent=1) if problems else 'none')
        print('errors:', errs if errs else 'none')
        await b.close()
asyncio.run(main())
