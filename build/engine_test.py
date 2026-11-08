"""The engines: the embedded Stockfish 19 Lite starts from the file and answers; a page that names site engines (window.TEMPO_ENGINE)
but isn't cross-origin isolated ignores them and runs the embedded build; Preferences shows the engine and, without a site, no download toggle.
    python3 build/engine_test.py
"""
import asyncio, json, os
from playwright.async_api import async_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
URL = os.environ.get('TEMPO_URL') or 'file://' + ROOT + '/dist/Tempo.html'
fails, checks = [], 0
def check(what, cond, extra=None):
    global checks
    checks += 1
    print(('PASS ' if cond else 'FAIL ') + what + ('' if cond or extra is None else '  ' + json.dumps(extra)[:300]))
    if not cond: fails.append(what)
async def main():
    async with async_playwright() as p:
        br = await p.chromium.launch(args=['--no-sandbox'])
        pg = await br.new_page(); errors = []
        pg.on('pageerror', lambda e: errors.append(str(e)))
        await pg.goto(URL); await pg.wait_for_function("window.App && (Engines.status === 'ready' || Engines.status === 'failed')", timeout=60000)
        check('the embedded engine is ready', await pg.evaluate("Engines.status") == 'ready')
        check('it is Stockfish 19 Lite, the embedded build, one thread', await pg.evaluate("[Engines.kind, Engines.name, Engines.threads]") == ['embedded', 'Stockfish 19 Lite WASM', 1], await pg.evaluate("[Engines.kind, Engines.name, Engines.threads]"))
        r = await pg.evaluate("Engines.analyse({ fen: 'r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4', depth: 12 })")
        check('it finds the mate in one', r['best'] == 'h5f7' and r['lines'][0]['mate'] == 1, r)
        r = await pg.evaluate("Engines.analyse({ fen: TempoCore.START_FEN, moves: ['e2e4', 'e7e5', 'g1f3'], depth: 13, multipv: 2 })")
        check('depth 13 with two lines', len(r['lines']) == 2 and r['lines'][0]['depth'] >= 13 and r['engine'] == 'stockfish', [(l['depth'], l['cp']) for l in r['lines']])
        await pg.evaluate("App.go('prefs')"); await pg.wait_for_timeout(400)
        about = await pg.evaluate("document.getElementById('engine-about').textContent")
        check('Preferences says which engine runs', about == 'Stockfish 19 (the lite build) is running in this browser.', about)
        check('no download toggle without the site’s engines', await pg.locator('.toggle', has_text='Full-strength engine').count() == 0)
        check('no page errors', not errors, errors[:3])
        await pg.close()
        # a page that names site engines but isn't isolated: the embedded build runs
        pg = await br.new_page()
        await pg.add_init_script("window.TEMPO_ENGINE = { base: 'engine/x/', lite: { js: 'nope.js', wasm: 'nope.wasm' }, full: { js: 'nope.js', wasm: ['nope.0'], bytes: 5 } };")
        await pg.goto(URL); await pg.wait_for_function("window.App && (Engines.status === 'ready' || Engines.status === 'failed')", timeout=60000)
        check('without cross-origin isolation the site engines are left alone', await pg.evaluate("[Engines.site, Engines.isolated(), Engines.kind]") == [True, False, 'embedded'], await pg.evaluate("[Engines.site, Engines.isolated(), Engines.kind]"))
        await pg.evaluate("App.go('prefs')"); await pg.wait_for_timeout(400)
        check('and Preferences offers no download there either', await pg.locator('.toggle', has_text='Full-strength engine').count() == 0)
        await br.close()
    print('%d checks, %d failed' % (checks, len(fails)))
    if fails: raise SystemExit(1)
asyncio.run(main())
