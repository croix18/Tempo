import asyncio, json
from playwright.async_api import async_playwright
import os
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CHROME = os.environ.get('CHROME') or ('/usr/bin/google-chrome' if os.path.exists('/usr/bin/google-chrome') else None)
SAMPLE = {"repertoires": [{"id": "white-e4", "name": "White: 1.e4 with the Italian", "side": "w", "summary": "Open games with quick development.",
  "intro": "Take the center with e4, develop knights and bishops, castle, then build slowly with c3 and d3.",
  "lines": [{"id": "giuoco", "name": "Giuoco Piano", "moves": "e4 e5 Nf3 Nc6 Bc4 Bc5 c3 Nf6 d3 d6 O-O O-O", "notes": {"0": "Take the center.", "2": "Attack e5 and develop.", "4": "Aim at f7."}},
            {"id": "two-knights", "name": "Two Knights", "moves": "e4 e5 Nf3 Nc6 Bc4 Nf6 d3 Be7 O-O O-O", "notes": {"6": "Protect e4 calmly."}}]}],
  "traps": [{"id": "scholars", "name": "Scholar's Mate", "side": "b", "summary": "White aims the queen and bishop at f7.", "moves": "e4 e5 Bc4 Nc6 Qh5 Nf6 Qxf7#", "notes": {"4": "Qh5 hits f7 and e5.", "5": "This loses at once.", "6": "Checkmate."}, "lesson": "When the queen and bishop aim at f7, defend it with ...g6 or ...Qe7."}]}
async def click_sq(pg, sq):
    o = await pg.evaluate("document.querySelector('.board').__board.orient")
    box = await pg.locator('.board').first.bounding_box()
    f = ord(sq[0]) - 97; r = int(sq[1]) - 1
    x = (f if o == 'w' else 7 - f) + 0.5; y = (7 - r if o == 'w' else r) + 0.5
    await pg.mouse.click(box['x'] + box['width'] * x / 8, box['y'] + box['height'] * y / 8)
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=CHROME, args=['--no-sandbox'])
        pg = await b.new_page(viewport={'width': 1200, 'height': 860})
        errs = []
        pg.on('pageerror', lambda e: errs.append('pageerror: ' + str(e)))
        pg.on('console', lambda m: errs.append(m.type + ': ' + m.text[:200]) if m.type == 'error' else None)
        await pg.goto('file://' + ROOT + '/dist/Tempo.html'); await pg.wait_for_timeout(1200)
        await pg.evaluate("(s) => { document.getElementById('d-reps').textContent = s; }", json.dumps(SAMPLE))
        await pg.evaluate("App.go('openings')"); await pg.wait_for_timeout(300)
        await pg.screenshot(path=ROOT + '/build/shots/openings-menu.png')
        await pg.locator('button.card.theme').first.click(); await pg.wait_for_timeout(300)
        await pg.screenshot(path=ROOT + '/build/shots/openings-rep.png')
        await pg.locator('button', has_text='Learn next line').click(); await pg.wait_for_timeout(500)
        # play White's moves of the Giuoco line
        line = "e2e4 g1f3 f1c4 c2c3 d2d3 e1g1".split()
        for i, mv in enumerate(line):
            await pg.wait_for_timeout(900)
            if i == 2:  # make one mistake on purpose
                await click_sq(pg, 'b1'); await pg.wait_for_timeout(100); await click_sq(pg, 'c3'); await pg.wait_for_timeout(600)
            await click_sq(pg, mv[:2]); await pg.wait_for_timeout(100); await click_sq(pg, mv[2:])
        await pg.wait_for_timeout(1500)
        await pg.screenshot(path=ROOT + '/build/shots/openings-learn-done.png')
        print('line state', await pg.evaluate("Store.state.openings.lines"))
        # drill
        await pg.evaluate("App.go('openings', {rep: 'white-e4'})"); await pg.wait_for_timeout(300)
        await pg.locator('button', has_text='Drill').click(); await pg.wait_for_timeout(500)
        for mv in line:
            await pg.wait_for_timeout(800)
            await click_sq(pg, mv[:2]); await pg.wait_for_timeout(100); await click_sq(pg, mv[2:])
        await pg.wait_for_timeout(1200)
        await pg.screenshot(path=ROOT + '/build/shots/openings-drill.png')
        print('after drill', await pg.evaluate("Store.state.openings.lines"))
        # trap walkthrough
        await pg.evaluate("App.go('openings', {trap: 'scholars'})"); await pg.wait_for_timeout(400)
        for i in range(8):
            nb = pg.locator('button', has_text='Next')
            if await nb.count(): await nb.last.click(); await pg.wait_for_timeout(250)
        await pg.screenshot(path=ROOT + '/build/shots/openings-trap.png')
        fin = pg.locator('button', has_text='Finish')
        if await fin.count(): await fin.click(); await pg.wait_for_timeout(300)
        await pg.screenshot(path=ROOT + '/build/shots/openings-trap-end.png')
        print('errors', errs)
        await b.close()
asyncio.run(main())
