# The way back to the site a copy of Tempo lives on (8 Nov 2026, Croix, from his tablet: "Can you move the return to
# mrshaffer.org tab. It's blocking info"): when the page sets window.TEMPO_HOME, Tempo shows it as a link at the foot of
# its sidebar and as the last row of More, so nothing floats over the page. Without it, or with an address it won't
# follow, there's no link at all.
# Usage: python3 build/home_link_test.py
import asyncio, os, sys
from playwright.async_api import async_playwright
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from testutil import ROOT
TEMPO_URL = os.environ.get('TEMPO_URL') or 'file://' + ROOT + '/dist/Tempo.html'
CHROME = os.environ.get('CHROME') or ('/usr/bin/google-chrome' if os.path.exists('/usr/bin/google-chrome') else None)
HOME = "window.TEMPO_HOME = { href: '/teacher/', label: 'mrshaffer.org', title: 'Back to the Teacher page on mrshaffer.org' };"

FAILS = []; COUNT = [0]
def check(name, ok, info=''):
    COUNT[0] += 1
    print(('PASS ' if ok else 'FAIL ') + name + ('' if ok else '  :: ' + str(info)[:300]))
    if not ok: FAILS.append(name)

async def page(b, init, w=1280, h=800):
    pg = await b.new_page(viewport={'width': w, 'height': h})
    errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    if init: await pg.add_init_script(init)
    await pg.goto(TEMPO_URL)
    await pg.wait_for_function("window.App && document.querySelector('.side')", timeout=60000)
    return pg, errs

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=CHROME, args=['--no-sandbox'])
        # on its own (the file, the artifact, the Game Lab): no way home to show
        pg, errs = await page(b, None)
        await pg.evaluate("App.go('more')"); await pg.wait_for_timeout(200)
        check('a copy that isn’t told where home is shows no link', await pg.locator('.side-home').count() == 0 and await pg.locator('.more-home').count() == 0)
        await pg.close()

        # on mrshaffer.org: at the foot of the sidebar
        pg, errs = await page(b, HOME)
        a = pg.locator('.side .side-home')
        info = await pg.evaluate("""() => { const a = document.querySelector('.side .side-home'), f = document.querySelector('.side .side-foot');
          const r = a.getBoundingClientRect(), q = f.getBoundingClientRect(), last = [...document.querySelectorAll('.side .nav-item:not(.side-home)')].pop().getBoundingClientRect();
          return { tag: a.tagName, href: a.getAttribute('href'), text: a.textContent.trim(), name: a.getAttribute('aria-label'), above: r.bottom <= q.top + 1, below: r.top > last.bottom,
                   fixed: [...document.querySelectorAll('body *')].some(e => getComputedStyle(e).position === 'fixed' && /home/.test(e.className) && e.getBoundingClientRect().width > 0) }; }""")
        check('on the site, the sidebar ends with a link home: below the menu, above the engine’s status',
              info['tag'] == 'A' and info['href'] == '/teacher/' and info['text'] == 'mrshaffer.org' and info['above'] and info['below'], info)
        check('it says where it goes, for a screen reader too', info['name'] == 'Back to the Teacher page on mrshaffer.org', info['name'])
        check('nothing of it floats over the page', not info['fixed'], info)
        await pg.close()

        # a tablet or phone: the last row of More
        pg, errs2 = await page(b, HOME, 834, 1194)
        await pg.evaluate("App.go('more')"); await pg.wait_for_timeout(300)
        rows = await pg.evaluate("[...document.querySelectorAll('.v-more .menu-row')].map(r => r.innerText.replace(/\\s+/g, ' ').trim())")
        last = await pg.evaluate("(() => { const r = [...document.querySelectorAll('.v-more .menu-row')].pop(); return { tag: r.tagName, href: r.getAttribute('href') }; })()")
        check('on a tablet or phone it’s the last row of More', rows and rows[-1].startswith('mrshaffer.org') and 'Back to the Teacher page' in rows[-1] and last == {'tag': 'A', 'href': '/teacher/'}, [rows[-1:], last])
        check('and the sidebar (hidden there) doesn’t show it twice', not await pg.locator('.side-home').is_visible())
        await pg.close()

        # an address Tempo won't follow: no link
        for bad in ["javascript:alert(1)", "//evil.example/", "http://plain.example/", "/\\\\evil.example"]:
            pg, errs3 = await page(b, "window.TEMPO_HOME = { href: %r, label: 'x' };" % bad)
            n = await pg.locator('.side-home').count()
            check('an address like %s is refused' % bad, n == 0)
            await pg.close()
        check('no page errors', not errs and not errs2, (errs + errs2)[:3])
        await b.close()
    print('\n%d checks, %d failed' % (COUNT[0], len(FAILS)))
    sys.exit(1 if FAILS else 0)

asyncio.run(main())
