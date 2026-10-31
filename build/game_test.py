import asyncio, json
from playwright.async_api import async_playwright
import os
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CHROME = os.environ.get('CHROME') or ('/usr/bin/google-chrome' if os.path.exists('/usr/bin/google-chrome') else None)
TEMPO_URL = os.environ.get('TEMPO_URL') or 'file://' + ROOT + '/dist/Tempo.html'
URL = TEMPO_URL
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
        await pg.goto(URL); await pg.wait_for_timeout(2500)
        # coach checks
        res = await pg.evaluate("""async () => {
          const C = TempoCore, out = [];
          const cases = [
            ['r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3', 'f3e5'],
            ['rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2', 'd1h5'],
            ['r1bqkbnr/pppp1ppp/2n5/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR b KQkq - 3 3', 'g8f6'],
            ['rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2', 'b8c6'],
            ['r1bqkb1r/pppp1ppp/2n2n2/4p3/4P3/2N2N2/PPPP1PPP/R1BQKB1R w KQkq - 4 4', 'c3d5'],
          ];
          for (const [fen, u] of cases) { const p = new C.Pos(fen); const m = p.parseMove(u); const r = await Coach.check(p, m, null); out.push([u, r.warn, r.title || '', r.text || '']); }
          return out; }""")
        for r in res: print('coach', r)
        # game flow vs Pip: moves, hint, undo, resign
        await pg.evaluate("App.go('play')"); await pg.wait_for_timeout(300)
        await pg.locator('.rung', has_text='Pip').first.click(); await pg.wait_for_timeout(300)
        await pg.locator('.seg button', has_text='White').first.click()
        await pg.locator('button', has_text='Start game').click(); await pg.wait_for_timeout(600)
        for mv in ['d2d4', 'g1f3', 'c1f4']:
            legal = await pg.evaluate("(u) => { const g = Store.state.current; const p = new TempoCore.Pos(); g.moves.forEach(x => p.make(p.parseMove(x))); return !!p.parseMove(u); }", mv)
            if not legal: continue
            await click_sq(pg, mv[:2]); await pg.wait_for_timeout(100); await click_sq(pg, mv[2:])
            await pg.wait_for_timeout(2600)
            # the coach's warning sits under the board and waits for a choice
            if await pg.locator('.coach.decide').count():
                print('coach warned:', (await pg.locator('.coach.decide').inner_text()).split('\n')[0])
                await pg.locator('.coach.decide button', has_text='Play it anyway').click(); await pg.wait_for_timeout(2500)
        print('moves', await pg.evaluate("Store.state.current.sans"))
        await pg.locator('button', has_text='Hint').click(); await pg.wait_for_timeout(1800)
        print('coach text after hint 1:', await pg.locator('.coach').inner_text())
        await pg.locator('button', has_text='Hint').click(); await pg.wait_for_timeout(400)
        print('coach text after hint 2:', await pg.locator('.coach').inner_text())
        await pg.locator('button', has_text='Undo').click(); await pg.wait_for_timeout(1500)
        print('moves after undo', await pg.evaluate("Store.state.current.sans"))
        await pg.locator('button[aria-label="Resign the game"]').click(); await pg.wait_for_timeout(300)
        await pg.locator('.sheet button', has_text='Resign').click(); await pg.wait_for_timeout(800)
        await pg.screenshot(path=ROOT + '/build/shots/end-sheet.png')
        g = await pg.evaluate("Store.state.games.list[0]")
        print('saved game:', g['result'], g['reason'], 'rated', g['rated'], 'plies', g['plies'])
        print('pip record', await pg.evaluate("Store.state.play.bots.pip"), 'rating', await pg.evaluate("Store.state.play.rating"))
        print('errors:', errs)
        await b.close()
asyncio.run(main())
