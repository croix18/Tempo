import asyncio
from playwright.async_api import async_playwright
import os
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CHROME = os.environ.get('CHROME') or ('/usr/bin/google-chrome' if os.path.exists('/usr/bin/google-chrome') else None)
# Builds two copies of dist/Tempo.html under strict Content-Security-Policies:
# nowasm blocks WebAssembly (Stockfish), noworker blocks Web Workers entirely.
POLICIES = {
    'nowasm': "default-src 'self'; script-src 'unsafe-inline' blob:; worker-src blob:; style-src 'unsafe-inline'; img-src data: blob:; font-src data:",
    'noworker': "default-src 'self'; script-src 'unsafe-inline'; worker-src 'none'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:",
}
def make_pages():
    src = open(os.path.join(ROOT, 'dist/Tempo.html'), encoding='utf-8').read()
    os.makedirs(os.path.join(ROOT, 'build/csp'), exist_ok=True)
    for name, pol in POLICIES.items():
        page = src.replace('<meta charset="utf-8">', '<meta charset="utf-8">\n<meta http-equiv="Content-Security-Policy" content="%s">' % pol, 1)
        open(os.path.join(ROOT, 'build/csp/%s.html' % name), 'w', encoding='utf-8').write(page)
async def run(name):
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=CHROME, args=['--no-sandbox'])
        pg = await b.new_page(viewport={'width': 1200, 'height': 850})
        errs = []
        pg.on('pageerror', lambda e: errs.append('pageerror: ' + str(e)))
        pg.on('console', lambda m: errs.append(m.type + ': ' + m.text[:160]) if m.type == 'error' else None)
        await pg.goto('file://' + ROOT + '/build/csp/%s.html' % name)
        await pg.wait_for_timeout(13500)
        status = await pg.evaluate('Engines.status')
        # bot move through whichever engine path is available
        r = await pg.evaluate("""() => Engines.botMove(TempoBots.byId('nora'), {fen: TempoCore.START_FEN, moves: ['e2e4','e7e5','g1f3','b8c6','f1c4','g8f6','d2d3'], sans: ['e4','e5','Nf3','Nc6','Bc4','Nf6','d3']})""")
        r2 = await pg.evaluate("""() => Engines.botMove(TempoBots.byId('stockfish'), {fen: TempoCore.START_FEN, moves: ['e2e4'], sans: ['e4']})""")
        a = await pg.evaluate("""() => Engines.analyse({fen: TempoCore.START_FEN, moves: ['e2e4','e7e5'], depth: 12, movetime: 600})""")
        print(name, 'status', status, '| nora', r, '| stockfish-bot', r2, '| analyse best', a.get('best'), a.get('engine'), a['lines'][0] if a.get('lines') else None)
        print('   errors:', errs[:6])
        await b.close()
async def main():
    make_pages()
    await run('nowasm'); await run('noworker')
asyncio.run(main())
