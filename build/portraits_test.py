"""A copy of Tempo with pictures for the characters (tools/with_portraits.py): a picture that loads covers the badge,
a link that doesn't load leaves the badge (never a broken image), the picture fills the circle at every size, and the
main build has no pictures at all.
    python3 build/portraits_test.py
"""
import asyncio, base64, io, json, os, subprocess, sys, tempfile
from playwright.async_api import async_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CHROME = os.environ.get('CHROME') or ('/usr/bin/google-chrome' if os.path.exists('/usr/bin/google-chrome') else None)
fails, checks = [], 0

def check(what, cond, extra=None):
    global checks
    checks += 1
    print(('PASS ' if cond else 'FAIL ') + what + ('' if cond or extra is None else '  ' + json.dumps(extra)[:400]))
    if not cond: fails.append(what)

# made-up pictures: a coloured head above a grey body, one tall and one square
def pic(color, tall):
    w, h = (60, 120) if tall else (80, 80)
    rows = []
    for y in range(h):
        row = b''
        for x in range(w):
            head = (x - w / 2) ** 2 + (y - w / 2.6) ** 2 < (w / 3.2) ** 2
            body = y > w * 0.8 and w * 0.3 < x < w * 0.7
            row += bytes(color + (255,)) if head else bytes((70, 70, 70, 255)) if body else bytes((0, 0, 0, 0))
        rows.append(b'\x00' + row)
    import zlib, struct
    def chunk(t, d): return struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
    png = b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 6, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(b''.join(rows))) + chunk(b'IEND', b'')
    return 'data:image/png;base64,' + base64.b64encode(png).decode()

SHOWN = {'patrick-star': pic((240, 140, 170), True), 'velma-dinkley': pic((230, 120, 40), False), 'freddy-fazbear': pic((150, 100, 60), True)}
BLOCKED = {'goofy': 'https://127.0.0.1:9/goofy.png'}   # a link that can't load
SPARE = {'ralph-wiggum': ['https://127.0.0.1:9/ralph.png', pic((250, 210, 60), True)]}   # a link that fails, then a spare that loads

async def avatars(pg):
    return await pg.evaluate("""() => [...document.querySelectorAll('.avatar')].filter(a => a.offsetParent).map(a => {
      const r = a.getBoundingClientRect(), img = a.querySelector('img.photo'), ir = img && img.getBoundingClientRect();
      return { cls: a.className, w: Math.round(r.width), img: !!img, loaded: !!img && img.complete && img.naturalWidth > 0,
        fits: !img || (Math.abs(ir.width - r.width) < 1.5 && Math.abs(ir.height - r.height) < 1.5 && Math.abs(ir.left - r.left) < 1.5 && Math.abs(ir.top - r.top) < 1.5),
        opacity: img ? getComputedStyle(img).opacity : null, badge: !!a.querySelector('svg') || a.textContent.length > 0 }; })""")

async def main():
    tmp = tempfile.mkdtemp()
    src = os.path.join(tmp, 'pics.json')
    json.dump({'format': 'tempo-chess-portrait-studio-v1', 'roster': [{'id': k, 'image': v} for k, v in {**SHOWN, **BLOCKED}.items()]}, open(src, 'w'))
    src2 = os.path.join(tmp, 'spares.json')
    json.dump([{'id': k, 'images': v} for k, v in SPARE.items()], open(src2, 'w'))
    out = os.path.join(tmp, 'Tempo pictures.html')
    subprocess.run([sys.executable, os.path.join(ROOT, 'tools', 'with_portraits.py'), src, src2, out], check=True, capture_output=True)
    main_html = open(os.path.join(ROOT, 'dist', 'Tempo.html'), encoding='utf-8').read()
    check('the main build carries no pictures', '<script>window.TEMPO_PORTRAITS = ' not in main_html)
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=CHROME, args=['--no-sandbox'])
        for name, w, h in (('desk', 1280, 860), ('phone', 390, 844)):
            ctx = await b.new_context(viewport={'width': w, 'height': h}, device_scale_factor=2)
            pg = await ctx.new_page(); errors = []
            pg.on('pageerror', lambda e: errors.append(str(e)))
            await pg.goto('file://' + out); await pg.wait_for_timeout(2200)
            await pg.evaluate("""() => { const s = Store.state.settings; s.unlockAll = true; s.chat = 'off'; s.clock = 'none'; Store.touch('settings'); App.go('play'); }""")
            await pg.wait_for_timeout(500)
            await pg.locator('.tier-fold', has_text='The Chaos Crew').first.click(); await pg.wait_for_timeout(700)
            av = await avatars(pg)
            ids = await pg.evaluate("[...document.querySelectorAll('.char')].filter(c => c.offsetParent).map(c => c.textContent)")
            shown = [a for a in av if 'has-photo' in a['cls']]
            check(name + ': pictures that load cover the badge', len(shown) >= 2 and all(a['loaded'] and a['opacity'] == '1' for a in shown), av[:6])
            check(name + ': and fill the circle exactly', all(a['fits'] for a in av), [a for a in av if not a['fits']][:3])
            goofy = await pg.evaluate("""() => { const c = [...document.querySelectorAll('.char')].find(x => /Goofy/.test(x.textContent)); const a = c && c.querySelector('.avatar');
              return a ? { img: !!a.querySelector('img'), photo: a.classList.contains('has-photo'), badge: !!a.querySelector('svg') } : null; }""")
            check(name + ': a link that doesn’t load leaves the badge, no broken image', goofy and not goofy['img'] and not goofy['photo'] and goofy['badge'], goofy)
            ralph = await pg.evaluate("""() => { const c = [...document.querySelectorAll('.char')].find(x => /Ralph/.test(x.textContent)); const a = c && c.querySelector('.avatar'), i = a && a.querySelector('img');
              return a ? { photo: a.classList.contains('has-photo'), src: i ? i.src.slice(0, 22) : null } : null; }""")
            check(name + ': a link that fails falls back to the spare picture', ralph and ralph['photo'] and ralph['src'] == 'data:image/png;base64,', ralph)
            check(name + ': no broken image anywhere', not await pg.evaluate("[...document.querySelectorAll('img')].some(i => i.offsetParent && i.complete && i.naturalWidth === 0)"))
            await pg.screenshot(path=ROOT + '/build/shots/portraits-list-' + name + '.png')
            # in a game and on the sheet: the same picture, at the strip's and the sheet's sizes
            await pg.evaluate("""() => { Store.state.current = { id: 'pic-' + Date.now(), bot: 'patrick-star', color: 'w', startFen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', moves: [], sans: [],
              coach: false, ask: false, hanging: false, takebacks: true, clock: null, times: null, hints: 0, undos: 0, warned: 0, result: null, reason: null,
              startedAt: Date.now(), rematch: false, talk: null }; Store.touch(); Play.resume(); }""")
            await pg.wait_for_timeout(900)
            strip = await pg.evaluate("""() => { const a = document.querySelector('.player .avatar'); const i = a && a.querySelector('img.photo');
              return a ? { photo: a.classList.contains('has-photo'), w: a.getBoundingClientRect().width, iw: i && i.getBoundingClientRect().width } : null; }""")
            check(name + ': Patrick’s picture in the game', strip and strip['photo'] and abs(strip['w'] - strip['iw']) < 1.5, strip)
            await pg.screenshot(path=ROOT + '/build/shots/portraits-game-' + name + '.png')
            await pg.evaluate("(id) => App.sheet((box) => box.appendChild(Play.profile(TempoBots.byId(id))))", 'velma-dinkley'); await pg.wait_for_timeout(500)
            lg = await pg.evaluate("""() => { const a = document.querySelector('.sheet .avatar.lg'); return a ? { photo: a.classList.contains('has-photo'), w: a.getBoundingClientRect().width } : null; }""")
            check(name + ': Velma’s picture on her sheet', lg and lg['photo'] and lg['w'] >= 60, lg)
            check(name + ': page errors', not errors, errors[:3])
            await ctx.close()
        # the main build: badges only
        ctx = await b.new_context(viewport={'width': 1280, 'height': 860}); pg = await ctx.new_page()
        await pg.goto('file://' + os.path.join(ROOT, 'dist', 'Tempo.html')); await pg.wait_for_timeout(2000)
        await pg.evaluate("() => { Store.state.settings.unlockAll = true; Store.touch('settings'); App.go('play'); }"); await pg.wait_for_timeout(500)
        check('the main build: badges only', await pg.evaluate("document.querySelectorAll('.avatar').length > 5 && !document.querySelector('.avatar img')"))
        await ctx.close()
        await b.close()
    print('%d checks, %d failed' % (checks, len(fails)))
    if fails: raise SystemExit(1)

asyncio.run(main())
