import asyncio
from playwright.async_api import async_playwright
import os
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CHROME = os.environ.get('CHROME') or ('/usr/bin/google-chrome' if os.path.exists('/usr/bin/google-chrome') else None)
TEMPO_URL = os.environ.get('TEMPO_URL') or 'file://' + ROOT + '/dist/Tempo.html'
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=CHROME, args=['--no-sandbox'])
        ctx = await b.new_context(viewport={'width': 1180, 'height': 820}, color_scheme='dark')
        pg = await ctx.new_page()
        await pg.goto(TEMPO_URL); await pg.wait_for_timeout(1200)
        await pg.screenshot(path=ROOT + '/build/shots/dark-home.png')
        await pg.evaluate("Learn.open('free-pieces')"); await pg.wait_for_timeout(600)
        await pg.screenshot(path=ROOT + '/build/shots/dark-lesson.png')
        await b.close()
asyncio.run(main())
