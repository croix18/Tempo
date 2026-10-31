import asyncio, json, sys
from playwright.async_api import async_playwright
import os
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, 'build'))
from testutil import page_with_reps
CHROME = os.environ.get('CHROME') or ('/usr/bin/google-chrome' if os.path.exists('/usr/bin/google-chrome') else None)
TEMPO_URL = os.environ.get('TEMPO_URL') or 'file://' + ROOT + '/dist/Tempo.html'
SAMPLE = {"repertoires": [], "traps": [{"id": "scholars", "name": "Scholar's Mate", "side": "b", "trapper": "w", "keyPly": 5, "summary": "White aims the queen and bishop at f7.", "moves": "e4 e5 Bc4 Nc6 Qh5 Nf6 Qxf7#", "notes": {"4": "Qh5 hits f7 and e5.", "5": "This loses at once.", "6": "Checkmate."}, "lesson": "When the queen and bishop aim at f7, defend it with ...g6 or ...Qe7."}]}
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
        await pg.goto(page_with_reps(TEMPO_URL, SAMPLE)); await pg.wait_for_timeout(2500)
        await pg.evaluate("App.go('openings', {play: {rep: null, line: Data.reps().traps[0], mode: 'trap-avoid'}})")
        await pg.wait_for_timeout(3600)
        # first fall for it
        await click_sq(pg, 'g8'); await pg.wait_for_timeout(100); await click_sq(pg, 'f6'); await pg.wait_for_timeout(2600)
        print('after blunder:', await pg.locator('.feedback').first.inner_text())
        await pg.locator('button', has_text='Try again').click(); await pg.wait_for_timeout(3600)
        await click_sq(pg, 'g7'); await pg.wait_for_timeout(100); await click_sq(pg, 'g6'); await pg.wait_for_timeout(2500)
        print('after g6:', await pg.locator('.feedback').first.inner_text())
        await pg.screenshot(path=ROOT + '/build/shots/trap-avoid.png')
        print('errors', errs)
        await b.close()
asyncio.run(main())
