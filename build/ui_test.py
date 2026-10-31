import asyncio, sys, json
from playwright.async_api import async_playwright
import os
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CHROME = os.environ.get('CHROME') or ('/usr/bin/google-chrome' if os.path.exists('/usr/bin/google-chrome') else None)

URL = 'file://' + ROOT + '/dist/Tempo.html'
OUT = ROOT + '/build/shots/'

async def click_sq(pg, sq, orient='w'):
    box = await pg.locator('.board').first.bounding_box()
    f = ord(sq[0]) - 97; r = int(sq[1]) - 1
    x = (f if orient == 'w' else 7 - f) + 0.5; y = (7 - r if orient == 'w' else r) + 0.5
    await pg.mouse.click(box['x'] + box['width'] * x / 8, box['y'] + box['height'] * y / 8)

async def run(width, height, tag, full):
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=CHROME, args=['--no-sandbox'])
        ctx = await b.new_context(viewport={'width': width, 'height': height}, device_scale_factor=1)
        pg = await ctx.new_page()
        errors = []
        pg.on('console', lambda m: errors.append('console.' + m.type + ': ' + m.text) if m.type in ('error', 'warning') else None)
        pg.on('pageerror', lambda e: errors.append('pageerror: ' + str(e)))
        await pg.goto(URL)
        await pg.wait_for_timeout(1500)
        await pg.screenshot(path=OUT + tag + '-home.png')
        for v in (['play', 'puzzles', 'learn', 'openings', 'train', 'review', 'progress', 'prefs'] if full else ['play', 'puzzles']):
            await pg.evaluate("App.go('%s')" % v)
            await pg.wait_for_timeout(700 if v == 'puzzles' else 300)
            await pg.screenshot(path=OUT + tag + '-' + v + '.png', full_page=False)
        status = await pg.evaluate('Engines.status')
        # start a game vs Pip as White
        await pg.evaluate("App.go('play')")
        await pg.wait_for_timeout(200)
        await pg.locator('.rung', has_text='Pip').first.click()
        await pg.wait_for_timeout(300)
        await pg.screenshot(path=OUT + tag + '-setup.png')
        await pg.locator('.seg button', has_text='White').first.click()
        await pg.locator('button', has_text='Start game').click()
        await pg.wait_for_timeout(500)
        await click_sq(pg, 'e2'); await pg.wait_for_timeout(150); await click_sq(pg, 'e4')
        await pg.wait_for_timeout(3500)
        await pg.screenshot(path=OUT + tag + '-game.png')
        moves = await pg.evaluate("Store.state.current ? Store.state.current.sans : null")
        print(tag, 'engine:', status, 'moves:', moves)
        print('\n'.join(errors) if errors else 'no console errors')
        await b.close()

async def main():
    full = len(sys.argv) > 1 and sys.argv[1] == 'full'
    await run(1280, 860, 'desk', full)
    await run(390, 844, 'phone', full)
asyncio.run(main())
