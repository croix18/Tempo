import asyncio, json
from playwright.async_api import async_playwright
import os
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CHROME = os.environ.get('CHROME') or ('/usr/bin/google-chrome' if os.path.exists('/usr/bin/google-chrome') else None)
TEMPO_URL = os.environ.get('TEMPO_URL') or 'file://' + ROOT + '/dist/Tempo.html'
GAME = {"id": "capstest", "bot": "rosie", "color": "w", "startFen": "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
  "moves": ["e2e4","d7d5","e4d5","d8d5","b1c3","d5e5","f1e2","e5e4","c3e4","c8f5","e4c5","b7b6","c5a6","b8a6"],
  "sans": [], "coach": False, "hanging": True, "takebacks": True, "clock": None, "times": None, "hints": 0, "undos": 0, "warned": 0, "result": None, "reason": None, "startedAt": 0}
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=CHROME, args=['--no-sandbox'])
        for (w, h, tag, scheme) in [(390, 844, 'phone', 'light'), (1280, 860, 'desk', 'light'), (390, 844, 'phone-dark', 'dark'), (1280, 860, 'desk-dark', 'dark')]:
            pg = await b.new_page(viewport={'width': w, 'height': h}, color_scheme=scheme, device_scale_factor=2)
            await pg.goto(TEMPO_URL); await pg.wait_for_timeout(800)
            await pg.evaluate("""(g) => { const C = TempoCore, p = new C.Pos(); g.sans = g.moves.map(u => { const m = p.parseMove(u); const s = p.san(m); p.make(m); return s; }); Store.state.current = g; Store.touch(); Play.resume(); }""", GAME)
            await pg.wait_for_timeout(1500)
            await pg.screenshot(path=ROOT + '/build/shots/caps-%s.png' % tag)
            await pg.close()
        await b.close()
asyncio.run(main())
