# The chess clock: the screen as a two-sided clock for a game on a real board.
# Taps, increments, pausing, running out, the time picker, both orientations, leaving and coming back, and the saved choice.
import asyncio, json, os, re, sys
from playwright.async_api import async_playwright
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from testutil import serve_over_http

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CHROME = os.environ.get('CHROME') or ('/usr/bin/google-chrome' if os.path.exists('/usr/bin/google-chrome') else None)
TEMPO_URL = serve_over_http(os.environ.get('TEMPO_URL') or 'file://' + ROOT + '/dist/Tempo.html')  # a reload keeps its storage there
PHONE = {'viewport': {'width': 390, 'height': 844}, 'has_touch': True, 'is_mobile': True}
TABLET_WIDE = {'viewport': {'width': 1180, 'height': 820}, 'has_touch': True}
DESK = {'viewport': {'width': 1280, 'height': 860}}

results = []
def check(name, ok, detail=''):
    results.append((name, bool(ok)))
    detail = ' | '.join(str(detail).split('\n'))
    print(('PASS  ' if ok else 'FAIL  ') + name + ('  [' + detail + ']' if detail != '' else ''), flush=True)

STATE = "Clock._state()"
SIDES = """() => [...document.querySelectorAll('.ck-side')].map(e => {
  const r = e.getBoundingClientRect(), t = e.querySelector('.ck-time'), tr = t.getBoundingClientRect(), inner = e.querySelector('.ck-in');
  return { side: e.dataset.side, cls: e.className, time: t.textContent, sub: e.querySelector('.ck-sub').textContent, x: Math.round(r.left), y: Math.round(r.top),
    w: Math.round(r.width), h: Math.round(r.height), tw: Math.round(tr.width), th: Math.round(tr.height), turned: getComputedStyle(inner).transform };
})"""
BAR = "[...document.querySelectorAll('.ck-bar .ck-btn')].map(b => b.textContent.trim())"


async def page(browser, opts, errors, url=None, reduced=False):
    ctx = await browser.new_context(reduced_motion='reduce' if reduced else 'no-preference', **opts)
    pg = await ctx.new_page()
    pg.on('pageerror', lambda e: errors.append(str(e)[:200]))
    await pg.goto(url or TEMPO_URL); await pg.wait_for_function("() => window.App && App.name", timeout=30000); await pg.wait_for_timeout(300)
    return ctx, pg


async def tap(pg, side, touch):
    loc = pg.locator('.ck-side[data-side="%s"]' % side)
    if touch: await loc.tap()
    else: await loc.click()


async def test_ways_in(browser):
    errors = []
    ctx, pg = await page(browser, DESK, errors)
    side = await pg.evaluate("[...document.querySelectorAll('.side .nav-item')].map(b => b.textContent.trim())")
    check('the sidebar has Chess clock, right after Play', 'Chess clock' in side and side.index('Chess clock') == side.index('Play') + 1, side)
    await pg.locator('.side .nav-item', has_text='Chess clock').click(); await pg.wait_for_timeout(300)
    check('the sidebar opens the clock', await pg.evaluate("App.name") == 'clock' and await pg.locator('.clock-app').count() == 1)
    await ctx.close()
    ctx, pg = await page(browser, PHONE, errors)
    await pg.evaluate("App.go('play')"); await pg.wait_for_timeout(300)
    row = pg.locator('.v-play .menu-row', has_text='Chess clock')
    check('Play has a Chess clock row', await row.count() == 1)
    await row.tap(); await pg.wait_for_timeout(300)
    check('the Play row opens the clock', await pg.evaluate("App.name") == 'clock')
    await pg.evaluate("App.go('more')"); await pg.wait_for_timeout(300)
    check('More lists the chess clock', await pg.locator('.v-more .menu-row', has_text='Chess clock').count() == 1)
    check('ways in: no page errors', not errors, errors[:3])
    await ctx.close()


async def test_phone_game(browser):
    errors = []
    ctx, pg = await page(browser, PHONE, errors)
    await pg.evaluate("App.go('clock')"); await pg.wait_for_timeout(400)
    s = await pg.evaluate(SIDES)
    top, bottom = s[0], s[1]
    check('phone: two halves fill the screen, Black on top and White below', top['side'] == 'b' and bottom['side'] == 'w' and top['h'] > 300 and bottom['h'] > 300, [(x['side'], x['h']) for x in s])
    check('phone: the far half is turned to face the other player', top['turned'].startswith('matrix(-1') and bottom['turned'] in ('none', 'matrix(1, 0, 0, 1, 0, 0)'), [top['turned'], bottom['turned']])
    check('phone: both start at 10:00 and say Tap to start', all(x['time'] == '10:00' and x['sub'] == 'Tap to start' for x in s), [(x['time'], x['sub']) for x in s])
    check('phone: the digits are big and fit their half', all(x['th'] >= 80 and x['tw'] <= x['w'] - 16 for x in s), [(x['tw'], x['th'], x['w']) for x in s])
    check('phone: no sideways scrolling', await pg.evaluate("document.documentElement.scrollWidth <= innerWidth"))
    check('phone: before the start the strip offers the time, Swap sides and Exit', await pg.evaluate(BAR) == ['10 min', 'Swap sides', 'Exit'], await pg.evaluate(BAR))
    # Black taps first, the way you'd start a real clock: White's time runs
    await tap(pg, 'b', True); await pg.wait_for_timeout(1200)
    st = await pg.evaluate(STATE); s = await pg.evaluate(SIDES)
    check('a first tap starts White’s clock', st['started'] and st['turn'] == 'w' and st['running'] and 'run' in s[1]['cls'] and 'run' not in s[0]['cls'], st)
    check('White’s time goes down, Black’s waits', 598200 < st['left']['w'] < 599300 and st['left']['b'] == 600000, st['left'])
    check('the running half says to tap after your move', s[1]['sub'] == 'Tap here after your move', s[1]['sub'])
    check('while running, the strip is just Pause', await pg.evaluate(BAR) == ['Pause'], await pg.evaluate(BAR))
    # a tap on the waiting half does nothing
    await tap(pg, 'b', True); await pg.wait_for_timeout(150)
    check('tapping the waiting half changes nothing', (await pg.evaluate(STATE))['turn'] == 'w')
    # White moves and taps; a slip on Black's half straight after is ignored
    await pg.evaluate("""() => new Promise(res => {
      const down = side => document.querySelector('.ck-side[data-side="' + side + '"]').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerType: 'touch' }));
      down('w'); setTimeout(() => { down('b'); res(); }, 60);
    })""")
    await pg.wait_for_timeout(400)
    st = await pg.evaluate(STATE)
    check('White’s tap passes the move to Black, and a slip a moment later is ignored', st['turn'] == 'b' and st['moves'] == {'w': 1, 'b': 0}, st)
    s = await pg.evaluate(SIDES)
    check('White’s half shows its move count', s[1]['sub'] == '1 move', s[1]['sub'])
    # pause
    await pg.locator('.ck-btn', has_text='Pause').tap(); await pg.wait_for_timeout(100)
    a = await pg.evaluate(STATE); await pg.wait_for_timeout(900); b = await pg.evaluate(STATE)
    check('Pause stops both clocks', a['paused'] and a['left'] == b['left'], [a['left'], b['left']])
    check('paused, the strip offers Resume, Start over and Exit', await pg.evaluate(BAR) == ['Resume', 'Start over', 'Exit'], await pg.evaluate(BAR))
    await tap(pg, 'b', True); await pg.wait_for_timeout(200)
    check('a tap on a half doesn’t resume by accident', (await pg.evaluate(STATE))['paused'])
    await pg.locator('.ck-btn', has_text='Resume').tap(); await pg.wait_for_timeout(700)
    c = await pg.evaluate(STATE)
    check('Resume carries on with Black’s time', c['running'] and c['turn'] == 'b' and c['left']['b'] < b['left']['b'] - 400, [b['left'], c['left']])
    # nearly out, then out
    await pg.evaluate("Clock._set({ left: { b: 15000 } })"); await pg.wait_for_timeout(300)
    s = await pg.evaluate(SIDES)
    check('under 20 seconds the running half turns coral', 'low' in s[0]['cls'], s[0]['cls'])
    await pg.evaluate("Clock._set({ left: { b: 9800 } })"); await pg.wait_for_timeout(300)
    t = (await pg.evaluate(SIDES))[0]['time']
    check('under 10 seconds it shows tenths', re.match(r'^\d\.\d$', t), t)
    await pg.evaluate("Clock._set({ left: { b: 250 } })"); await pg.wait_for_timeout(800)
    st = await pg.evaluate(STATE); s = await pg.evaluate(SIDES)
    check('when the time runs out, that side is out of time', st['over'] == 'b' and not st['running'] and 'out' in s[0]['cls'] and s[0]['time'] == '0:00' and s[0]['sub'] == 'Out of time', [st, s[0]['time'], s[0]['sub']])
    check('after the flag the strip offers New game, the time and Exit', await pg.evaluate(BAR) == ['New game', '10 min', 'Exit'], await pg.evaluate(BAR))
    before = await pg.evaluate(STATE)
    await tap(pg, 'w', True); await tap(pg, 'b', True); await pg.wait_for_timeout(300)
    check('taps after the flag change nothing', await pg.evaluate(STATE) == before)
    await pg.locator('.ck-btn', has_text='New game').tap(); await pg.wait_for_timeout(200)
    st = await pg.evaluate(STATE)
    check('New game puts both clocks back', not st['started'] and st['left'] == {'w': 600000, 'b': 600000}, st)
    check('phone game: no page errors', not errors, errors[:3])
    await ctx.close()


async def test_increment_and_picker(browser):
    errors = []
    ctx, pg = await page(browser, PHONE, errors)
    await pg.evaluate("App.go('clock')"); await pg.wait_for_timeout(300)
    await pg.locator('.ck-btn.ck-tc').tap(); await pg.wait_for_timeout(400)
    tiles = await pg.evaluate("[...document.querySelectorAll('.ck-preset')].map(b => b.innerText.replace(/\\s+/g, ' ').trim())")
    check('the picker offers the usual times', len(tiles) == 8 and tiles[0].startswith('3 min') and any(t.startswith('10 min No added') for t in tiles), tiles)
    await pg.locator('.ck-preset', has_text='+ 3 sec').tap(); await pg.wait_for_timeout(400)
    st = await pg.evaluate(STATE)
    check('choosing 5 min + 3 sec sets both clocks', st['spec'] == '5+3' and st['left'] == {'w': 300000, 'b': 300000}, st)
    check('the choice is remembered', await pg.evaluate("Store.state.settings.otb") == '5+3')
    check('the strip shows the new time', (await pg.evaluate(BAR))[0] == '5 min +3s', await pg.evaluate(BAR))
    await tap(pg, 'b', True); await pg.wait_for_timeout(700)
    await tap(pg, 'w', True); await pg.wait_for_timeout(100)
    st = await pg.evaluate(STATE)
    check('each move adds 3 seconds to the player who moved', 301500 < st['left']['w'] <= 303000, st['left'])
    # (a second tap on the same spot this soon would count as a double tap, which the app ignores on purpose)
    await pg.locator('.ck-btn', has_text='Pause').tap(); await pg.wait_for_timeout(700)
    await pg.locator('.ck-btn', has_text='Start over').tap(); await pg.wait_for_timeout(300)
    check('Start over asks first', await pg.locator('.sheet h2', has_text='Start over?').count() == 1)
    await pg.locator('.sheet button', has_text='Start over').tap(); await pg.wait_for_timeout(400)
    st = await pg.evaluate(STATE)
    check('…and then puts both clocks back', not st['started'] and st['left'] == {'w': 300000, 'b': 300000}, st)
    # your own, with more time for one player
    await pg.locator('.ck-btn.ck-tc').tap(); await pg.wait_for_timeout(400)
    await pg.locator('label[for="ck-split"]').tap(); await pg.wait_for_timeout(200)
    sides = pg.locator('.ck-own-side')
    check('Give one player more time shows White and Black', await sides.count() == 2)
    black = sides.nth(1)
    for _ in range(2): await black.locator('.ck-step').first.locator('button').first.tap(); await pg.wait_for_timeout(60)
    await black.locator('.ck-step').nth(1).locator('button').nth(1).tap(); await pg.wait_for_timeout(60)
    shown = await black.locator('output').all_inner_texts()
    await pg.locator('.sheet button', has_text='Use this time').tap(); await pg.wait_for_timeout(400)
    st = await pg.evaluate(STATE); s = await pg.evaluate(SIDES)
    check('your own time: White 5 min + 3, Black 3 min + 5', st['spec'] == '5+3/3+5' and st['left'] == {'w': 300000, 'b': 180000} and shown == ['3 min', '5 sec'], [st['spec'], st['left'], shown])
    check('each half shows its own time', {x['side']: x['time'] for x in s} == {'w': '5:00', 'b': '3:00'}, [(x['side'], x['time']) for x in s])
    check('the strip says the players have different times', (await pg.evaluate(BAR))[0] == '5 / 3 min', await pg.evaluate(BAR))
    # swap sides
    await pg.locator('.ck-btn', has_text='Swap sides').tap(); await pg.wait_for_timeout(200)
    s = await pg.evaluate(SIDES)
    check('Swap sides puts White on top', s[0]['side'] == 'w' and s[1]['side'] == 'b' and s[0]['time'] == '5:00')
    check('increments and picker: no page errors', not errors, errors[:3])
    await ctx.close()


async def test_tablet_and_keys(browser):
    errors = []
    ctx, pg = await page(browser, TABLET_WIDE, errors)
    await pg.evaluate("Store.state.settings.otb = '10+0'; App.go('clock')"); await pg.wait_for_timeout(400)
    s = await pg.evaluate(SIDES)
    check('sideways: the halves sit left and right, both upright', s[0]['x'] < s[1]['x'] and abs(s[0]['y'] - s[1]['y']) < 2 and all(x['turned'] in ('none', 'matrix(1, 0, 0, 1, 0, 0)') for x in s), [(x['x'], x['y'], x['turned']) for x in s])
    check('sideways: the digits are big and fit', all(x['th'] >= 120 and x['tw'] <= x['w'] - 16 for x in s), [(x['tw'], x['th'], x['w']) for x in s])
    await ctx.close()
    ctx, pg = await page(browser, DESK, errors)
    await pg.evaluate("App.go('clock')"); await pg.wait_for_timeout(300)
    await pg.keyboard.press('Space'); await pg.wait_for_timeout(400)
    a = await pg.evaluate(STATE)
    await pg.keyboard.press('Space'); await pg.wait_for_timeout(200)
    b = await pg.evaluate(STATE)
    await pg.keyboard.press('p'); await pg.wait_for_timeout(100)
    c = await pg.evaluate(STATE)
    check('keys: Space starts and passes the move, P pauses', a['turn'] == 'w' and a['running'] and b['turn'] == 'b' and c['paused'], [a['turn'], b['turn'], c['paused']])
    await pg.keyboard.press('p'); await pg.wait_for_timeout(100)
    # leaving a running clock asks first; staying keeps it running
    await pg.evaluate("history.back()"); await pg.wait_for_timeout(400)
    asked = await pg.locator('.sheet h2', has_text='Leave the clock?').count()
    await pg.locator('.sheet button', has_text='Cancel').click(); await pg.wait_for_timeout(300)
    st = await pg.evaluate(STATE)
    check('Back during a game asks first, and Cancel keeps the clock running', asked == 1 and await pg.evaluate("App.name") == 'clock' and st['running'], [asked, st['running']])
    # Exit (from pause) keeps the game for later
    await pg.keyboard.press('p'); await pg.wait_for_timeout(100)
    kept = (await pg.evaluate(STATE))['left']
    await pg.locator('.ck-btn', has_text='Exit').click(); await pg.wait_for_timeout(300)
    check('Exit goes back to Play', await pg.evaluate("App.name") == 'play')
    await pg.evaluate("App.go('clock')"); await pg.wait_for_timeout(300)
    st = await pg.evaluate(STATE)
    check('coming back, the game is still there, paused', st['started'] and st['paused'] and st['left'] == kept, [st, kept])
    # a reload in the middle of a game keeps it too, with the time that passed taken off the running side
    await pg.locator('.ck-btn', has_text='Resume').click(); await pg.wait_for_timeout(300)
    before = await pg.evaluate(STATE)
    await pg.wait_for_timeout(500)
    await pg.reload(); await pg.wait_for_function("() => window.App && App.name", timeout=30000); await pg.wait_for_timeout(400)
    after = await pg.evaluate(STATE)
    check('after a reload the game comes back paused, with the running side’s time used', after and after['paused'] and after['turn'] == before['turn']
          and after['left'][before['turn']] < before['left'][before['turn']] - 300 and after['left'][('w' if before['turn'] == 'b' else 'b')] == before['left'][('w' if before['turn'] == 'b' else 'b')],
          [before['left'], after and after['left']])
    check('tablet and keys: no page errors', not errors, errors[:3])
    await ctx.close()


async def test_saved_choice(browser):
    errors = []
    bad = ['abc', '0+0', '200+0', '10+99', '10+5/0+1', 5, None, '10+5/']
    for v in bad + ['10+5/3+2']:
        ctx = await browser.new_context(**DESK)
        await ctx.add_init_script("""(() => { try { if (!localStorage.getItem('__seeded')) { localStorage.setItem('__seeded', '1');
          localStorage.setItem('tempo:v1', JSON.stringify({ v: 1, settings: { otb: %s } })); } } catch (e) {} })()""" % json.dumps(v))
        pg = await ctx.new_page(); pg.on('pageerror', lambda e: errors.append(str(e)[:200]))
        await pg.goto(TEMPO_URL); await pg.wait_for_function("() => window.App && App.name", timeout=30000)
        got = await pg.evaluate("Store.state.settings.otb")
        await pg.evaluate("App.go('clock')"); await pg.wait_for_timeout(200)
        st = await pg.evaluate(STATE)
        want = '10+5/3+2' if v == '10+5/3+2' else '10+0'
        if got != want or st['spec'] != want:
            check('a saved time of %s becomes %s' % (json.dumps(v), want), False, [got, st['spec']])
        await ctx.close()
    check('saved times are checked: bad ones fall back to 10 minutes, a good one with different times is kept', not [r for r in results if r[0].startswith('a saved time') and not r[1]])
    check('saved choice: no page errors', not errors, errors[:3])


async def test_reduced_motion(browser):
    errors = []
    ctx, pg = await page(browser, PHONE, errors, reduced=True)
    await pg.evaluate("App.go('clock')"); await pg.wait_for_timeout(200)
    d = await pg.evaluate("getComputedStyle(document.querySelector('.ck-side')).transitionDuration")
    check('reduced motion: the halves change colour at once', d in ('0s', '0s, 0s'), d)
    await ctx.close()


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=CHROME, args=['--no-sandbox'])
        for t in (test_ways_in, test_phone_game, test_increment_and_picker, test_tablet_and_keys, test_saved_choice, test_reduced_motion):
            try:
                await t(b)
            except Exception as e:
                check(t.__name__ + ' ran to the end', False, repr(e)[:300])
        await b.close()
    failed = [n for n, ok in results if not ok]
    print('\n%d checks, %d failed' % (len(results), len(failed)))
    for n in failed: print('  FAILED:', n)

asyncio.run(main())
