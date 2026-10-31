import asyncio, sys, json
from playwright.async_api import async_playwright
import os
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CHROME = os.environ.get('CHROME') or ('/usr/bin/google-chrome' if os.path.exists('/usr/bin/google-chrome') else None)
TEMPO_URL = os.environ.get('TEMPO_URL') or 'file://' + ROOT + '/dist/Tempo.html'
URL = TEMPO_URL
OUT = ROOT + '/build/shots/'

async def click_sq(pg, sq):
    o = await pg.evaluate("document.querySelector('.board').__board.orient")
    box = await pg.locator('.board').first.bounding_box()
    f = ord(sq[0]) - 97; r = int(sq[1]) - 1
    x = (f if o == 'w' else 7 - f) + 0.5; y = (7 - r if o == 'w' else r) + 0.5
    await pg.mouse.click(box['x'] + box['width'] * x / 8, box['y'] + box['height'] * y / 8)

async def play_uci(pg, u):
    await click_sq(pg, u[:2]); await pg.wait_for_timeout(120); await click_sq(pg, u[2:4])
    if len(u) == 5:
        await pg.wait_for_timeout(200)
        names = {'q': 'Queen', 'r': 'Rook', 'b': 'Bishop', 'n': 'Knight'}
        btn = pg.locator('.promo-btn[aria-label="%s"]' % names[u[4]])
        if await btn.count(): await btn.click()

async def main(width, height, tag):
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=CHROME, args=['--no-sandbox'])
        ctx = await b.new_context(viewport={'width': width, 'height': height})
        pg = await ctx.new_page()
        errors = []
        pg.on('console', lambda m: errors.append(m.type + ': ' + m.text) if m.type in ('error',) else None)
        pg.on('pageerror', lambda e: errors.append('pageerror: ' + str(e)))
        await pg.goto(URL); await pg.wait_for_timeout(1200)
        # ---- puzzles: solve 3 rated puzzles by reading the answer
        await pg.evaluate("App.go('puzzles')"); await pg.wait_for_timeout(500)
        await pg.locator('.menu-row', has_text='Rated puzzles').first.click()
        solved = 0
        for k in range(3):
            await pg.wait_for_timeout(1300)
            for step in range(8):
                cur = await pg.evaluate("Puzzles._cur()")
                if not cur or cur['idx'] >= len(cur['moves']): break
                await play_uci(pg, cur['moves'][cur['idx']])
                await pg.wait_for_timeout(900)
            if k == 0: await pg.screenshot(path=OUT + tag + '-puzzle-solved.png')
            nxt = pg.locator('button', has_text='Next puzzle')
            if await nxt.count(): solved += 1; await nxt.click()
        rating = await pg.evaluate("Store.state.puzzles.rating")
        print(tag, 'puzzles solved', solved, 'rating', rating)
        # ---- lesson: open the first lesson and click through
        await pg.evaluate("Learn.open('attacked-defended')"); await pg.wait_for_timeout(500)
        await pg.screenshot(path=OUT + tag + '-lesson.png')
        # ---- review: inject a finished game and open it
        pgn = '[Event "Test"]\n[White "You"]\n[Black "Pip"]\n[Result "1-0"]\n\n1. e4 e5 2. Nf3 Nc6 3. Bc4 Nd4 4. Nxe5 Qg5 5. Nxf7 Qxg2 6. Rf1 Qxe4+ 7. Be2 Nf3# 0-1'
        await pg.evaluate("""(pgn) => { Store.state.games.list.unshift({ id: 'test1', ts: Date.now(), bot: 'pip', color: 'w', result: '0-1', reason: 'checkmate', pgn: pgn, plies: 14, rated: false, before: 600, after: 600, reviewed: false }); Review.openGame('test1'); }""", pgn)
        for i in range(60):
            await pg.wait_for_timeout(1000)
            done = await pg.evaluate("Store.state.games.list[0].reviewed")
            if done: break
        await pg.wait_for_timeout(800)
        await pg.screenshot(path=OUT + tag + '-review.png')
        g = await pg.evaluate("Store.state.games.list[0]")
        print(tag, 'review done', g.get('reviewed'), 'acc', g.get('acc'), 'counts', g.get('counts'), 'mistakes saved', await pg.evaluate("Store.state.mistakes.items.length"))
        # ---- trainers
        await pg.evaluate("App.go('train', {mode:'coords'})"); await pg.wait_for_timeout(300)
        await pg.screenshot(path=OUT + tag + '-coords.png')
        await pg.evaluate("App.go('train', {mode:'vision'})"); await pg.wait_for_timeout(1200)
        await pg.screenshot(path=OUT + tag + '-vision.png')
        await pg.evaluate("Train.analysis()"); await pg.wait_for_timeout(2500)
        await pg.screenshot(path=OUT + tag + '-analysis.png')
        await pg.evaluate("App.go('train', {mode:'mistakes'})"); await pg.wait_for_timeout(600)
        await pg.screenshot(path=OUT + tag + '-mistakes.png')
        await pg.evaluate("App.go('progress')"); await pg.wait_for_timeout(300)
        await pg.screenshot(path=OUT + tag + '-progress.png', full_page=True)
        await pg.evaluate("App.go('prefs')"); await pg.wait_for_timeout(300)
        await pg.screenshot(path=OUT + tag + '-prefs.png', full_page=True)
        print('\n'.join(errors) if errors else 'no errors')
        await b.close()

asyncio.run(main(1280, 860, 'desk'))
asyncio.run(main(390, 844, 'phone'))
