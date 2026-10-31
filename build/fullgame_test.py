import asyncio
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
        await pg.evaluate("App.go('play')"); await pg.wait_for_timeout(300)
        await pg.locator('.rung', has_text='Pip').first.click(); await pg.wait_for_timeout(300)
        await pg.locator('.seg button', has_text='Black').first.click()
        await pg.locator('button', has_text='Start game').click(); await pg.wait_for_timeout(2500)
        for i in range(80):
            cur = await pg.evaluate("Store.state.current ? {moves: Store.state.current.moves, color: Store.state.current.color} : null")
            if not cur: break
            side = 'w' if len(cur['moves']) % 2 == 0 else 'b'
            if side != cur['color']: await pg.wait_for_timeout(700); continue
            best = await pg.evaluate("(mv) => Engines.analyse({fen: TempoCore.START_FEN, moves: mv, depth: 8}).then(r => r.best)", cur['moves'])
            await click_sq(pg, best[:2]); await pg.wait_for_timeout(80); await click_sq(pg, best[2:4])
            if len(best) == 5:
                await pg.wait_for_timeout(200)
                q = pg.locator('.promo-btn[aria-label="Queen"]')
                if await q.count(): await q.click()
            await pg.wait_for_timeout(2400)
            if await pg.locator('.sheet .big').count(): break
        await pg.wait_for_timeout(800)
        await pg.screenshot(path=ROOT + '/build/shots/fullgame-end.png')
        g = await pg.evaluate("Store.state.games.list[0]")
        print('result', g['result'], g['reason'], 'plies', g['plies'], 'rated', g['rated'], 'rating', g['before'], '->', g['after'])
        print('unlocked index', await pg.evaluate("Store.state.play.unlocked"), 'pip', await pg.evaluate("Store.state.play.bots.pip"))
        print('errors', errs)
        await b.close()
asyncio.run(main())
