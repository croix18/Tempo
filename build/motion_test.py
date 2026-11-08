# Motion and feel: things that move should glide, nothing should jump, and the arrow keys should do what you expect.
# Samples positions frame by frame with requestAnimationFrame and checks the in-between frames.
import asyncio, os
from playwright.async_api import async_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CHROME = os.environ.get('CHROME') or ('/usr/bin/google-chrome' if os.path.exists('/usr/bin/google-chrome') else None)
TEMPO_URL = os.environ.get('TEMPO_URL') or 'file://' + ROOT + '/dist/Tempo.html'
DESK = {'viewport': {'width': 1280, 'height': 900}}
PHONE = {'viewport': {'width': 390, 'height': 844}, 'has_touch': True, 'is_mobile': True}
OPERA = ('[Event "Paris"]\n[White "Paul Morphy"]\n[Black "Duke Karl / Count Isouard"]\n[Result "1-0"]\n\n'
         '1.e4 e5 2.Nf3 d6 3.d4 Bg4 4.dxe5 Bxf3 5.Qxf3 dxe5 6.Bc4 Nf6 7.Qb3 Qe7 8.Nc3 c6 9.Bg5 b5 10.Nxb5 cxb5 '
         '11.Bxb5+ Nbd7 12.O-O-O Rd8 13.Rxd7 Rxd7 14.Rd1 Qe6 15.Bxd7+ Nxd7 16.Qb8+ Nxb8 17.Rd8# 1-0')

results = []
def check(name, ok, detail=''):
    results.append((name, bool(ok)))
    detail = ' | '.join(str(detail).split('\n'))
    print(('PASS  ' if ok else 'FAIL  ') + name + ('  [' + detail + ']' if detail != '' else ''), flush=True)

# press a key on the review board and watch every piece for 400 ms: how many glide, how many fade
STEP = """(key) => new Promise(res => {
  const board = document.querySelector('.v-review .board'), seen = new Map(), t0 = performance.now();
  board.focus();
  document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
  (function f() {
    for (const el of board.querySelectorAll('.pc')) {
      const r = seen.get(el) || { tf: new Set(), op: new Set() };
      r.tf.add(getComputedStyle(el).transform); r.op.add(getComputedStyle(el).opacity.slice(0, 4)); seen.set(el, r);
    }
    if (performance.now() - t0 < 400) return requestAnimationFrame(f);
    let glide = 0, fade = 0;
    for (const r of seen.values()) { if (r.tf.size > 2) glide++; if ([...r.op].some(o => o !== '1' && o !== '0')) fade++; }
    res({ glide, fade });
  })();
})"""

# when the summary appears, follow the moves under it and the summary's opacity for half a second
REVEAL = """() => new Promise(res => {
  const s = document.querySelector('.rv-summary'), card = document.querySelector('.v-review .rv-moves'), fade = document.querySelector('.v-review .rv-extra');
  const ob = new MutationObserver(() => {
    if (s.hidden) return; ob.disconnect();
    const out = [], t0 = performance.now();
    (function f() {
      out.push({ t: performance.now() - t0, top: Math.round(card.getBoundingClientRect().top), op: +getComputedStyle(fade).opacity });
      if (performance.now() - t0 < 560) requestAnimationFrame(f); else res(out);
    })();
  });
  ob.observe(s, { attributes: true });
})"""


async def open_review(pg, pgn, watch=False):
    await pg.evaluate("App.go('review')"); await pg.wait_for_timeout(300)
    await pg.locator('#pgn-in').fill(pgn)
    await pg.locator('.v-review button.btn.primary', has_text='Review').click()
    frames = await pg.evaluate(REVEAL) if watch else None
    for _ in range(240):
        if await pg.evaluate("(() => { const s = document.querySelector('.rv-summary'); return !!s && !s.hidden; })()"): break
        await pg.wait_for_timeout(500)
    # the board replayed the game while the engine read it and now travels to the end: let it land
    for _ in range(20):
        if await pg.evaluate("(() => { const s = Review._state(); return !s || s.at === s.ply; })()"): break
        await pg.wait_for_timeout(300)
    await pg.wait_for_timeout(700)
    return frames


async def test_learn_fold(browser):
    for opts, tag in [(DESK, 'desktop'), (PHONE, 'phone')]:
        ctx = await browser.new_context(**opts); pg = await ctx.new_page()
        errors = []; pg.on('pageerror', lambda e: errors.append(str(e)))
        await pg.goto(TEMPO_URL); await pg.wait_for_timeout(800)
        await pg.evaluate("App.go('learn')"); await pg.wait_for_timeout(400)
        idx = await pg.evaluate("[...document.querySelectorAll('.unit-card')].findIndex(c => !c.querySelector('.unit-body').classList.contains('open'))")
        closed = await pg.evaluate("""(i) => { const c = document.querySelectorAll('.unit-card')[i], b = c.querySelector('.unit-body'), r = c.querySelector('.lesson-row');
          r.focus(); return { h: b.getBoundingClientRect().height, vis: getComputedStyle(r).visibility, focus: document.activeElement === r }; }""", idx)
        check(tag + ': a folded unit takes no room and its lessons can’t be reached by Tab', closed['h'] == 0 and closed['vis'] == 'hidden' and not closed['focus'], closed)
        frames = await pg.evaluate("""(i) => new Promise(res => {
          const c = document.querySelectorAll('.unit-card')[i], b = c.querySelector('.unit-body'), out = [], t0 = performance.now();
          c.querySelector('.unit-head').click();
          (function f() { out.push(b.getBoundingClientRect().height); if (performance.now() - t0 < 450) requestAnimationFrame(f); else res({ out, full: b.firstChild.scrollHeight, exp: c.querySelector('.unit-head').getAttribute('aria-expanded') }); })();
        })""", idx)
        hs = frames['out']; mid = [x for x in hs if 1 < x < frames['full'] - 1]
        check(tag + ': opening a unit eases it open', len(mid) >= 6 and abs(hs[-1] - frames['full']) <= 1 and frames['exp'] == 'true',
              'in-between frames %d, end %d of %d' % (len(mid), hs[-1], frames['full']))
        frames = await pg.evaluate("""(i) => new Promise(res => {
          const c = document.querySelectorAll('.unit-card')[i], b = c.querySelector('.unit-body'), out = [], t0 = performance.now();
          c.querySelector('.unit-head').click();
          (function f() { out.push(b.getBoundingClientRect().height); if (performance.now() - t0 < 450) requestAnimationFrame(f); else res(out); })();
        })""", idx)
        mid = [x for x in frames if 1 < x < frames[0] - 1]
        check(tag + ': closing a unit eases it shut', len(mid) >= 6 and frames[-1] == 0, 'in-between frames %d, end %d' % (len(mid), frames[-1]))
        await pg.evaluate("(i) => document.querySelectorAll('.unit-card')[i].querySelector('.unit-head').focus()", idx)
        await pg.keyboard.press('Enter'); await pg.wait_for_timeout(400); await pg.keyboard.press('Tab')
        nxt = await pg.evaluate("document.activeElement.classList.contains('lesson-row')")
        check(tag + ': Enter opens a unit and Tab goes into its lessons', nxt)
        check(tag + ': unit folding: no page errors', not errors, errors[:3])
        await ctx.close()
    ctx = await browser.new_context(reduced_motion='reduce', **DESK); pg = await ctx.new_page()
    await pg.goto(TEMPO_URL); await pg.wait_for_timeout(800)
    await pg.evaluate("App.go('learn')"); await pg.wait_for_timeout(400)
    r = await pg.evaluate("""() => new Promise(res => { const c = [...document.querySelectorAll('.unit-card')].find(c => !c.querySelector('.unit-body').classList.contains('open'));
      const b = c.querySelector('.unit-body'); c.querySelector('.unit-head').click();
      requestAnimationFrame(() => requestAnimationFrame(() => res([b.getBoundingClientRect().height, b.firstChild.scrollHeight]))); })""")
    check('reduced motion: a unit opens at once', abs(r[0] - r[1]) <= 1, r)
    await ctx.close()


async def test_board_moves(browser):
    ctx = await browser.new_context(**DESK); pg = await ctx.new_page()
    errors = []; pg.on('pageerror', lambda e: errors.append(str(e)))
    await pg.goto(TEMPO_URL); await pg.wait_for_timeout(800)
    await open_review(pg, OPERA)
    home = await pg.evaluate(STEP, 'Home')
    check('a jump across the game cross-fades the changed squares instead of sliding pieces about', home['glide'] == 0 and home['fade'] >= 10, home)
    one = await pg.evaluate(STEP, 'ArrowRight'); await pg.wait_for_timeout(150)
    two = await pg.evaluate(STEP, 'ArrowRight')
    check('one move forward slides that one piece', one['glide'] == 1 and one['fade'] == 0 and two['glide'] == 1, [one, two])
    end = await pg.evaluate(STEP, 'End'); await pg.wait_for_timeout(150)
    back = await pg.evaluate(STEP, 'ArrowLeft')
    check('End cross-fades, one move back slides', end['glide'] == 0 and end['fade'] > 0 and back['glide'] == 1, [end, back])
    check('board motion: no page errors', not errors, errors[:3])
    await ctx.close()


async def test_review_reveal(browser):
    for opts, tag in [(DESK, 'desktop'), (PHONE, 'phone')]:
        ctx = await browser.new_context(**opts); pg = await ctx.new_page()
        errors = []; pg.on('pageerror', lambda e: errors.append(str(e)))
        await pg.goto(TEMPO_URL); await pg.wait_for_timeout(800)
        frames = await open_review(pg, OPERA, watch=True)
        ops = [f['op'] for f in frames]
        check(tag + ': the summary fades in when the review finishes', ops[0] < 0.5 and ops[-1] == 1 and any(0.1 < o < 0.9 for o in ops), [round(o, 2) for o in ops[::4]])
        tops = [f['top'] for f in frames]
        first, last = tops[0], tops[-1]
        if abs(last - first) > 4:
            mid = [t for t in tops if min(first, last) + 2 < t < max(first, last) - 2]
            check(tag + ': the moves glide to their new place instead of jumping', len(mid) >= 6, 'from %d to %d, %d in-between frames' % (first, last, len(mid)))
        else:
            check(tag + ': the moves stay put while the summary arrives', all(abs(t - first) <= 1 for t in tops), tops[::4])
        heads = await pg.evaluate("[...document.querySelectorAll('.rv-sc-players .rv-sc-pname')].map(e => e.innerText.trim())")
        acc = await pg.evaluate("[...document.querySelectorAll('.rv-sc-acc .rv-sc-box')].map(e => e.innerText.trim())")
        check(tag + ': one table, two columns: You and your opponent, each with an accuracy', len(heads) == 2 and heads[0] == 'You' and heads[1] and len(acc) == 2, [heads, acc])
        check(tag + ': review reveal: no page errors', not errors, errors[:3])
        await ctx.close()
    # every label whole at phone and tablet sizes
    ctx = await browser.new_context(**DESK); pg = await ctx.new_page()
    await pg.goto(TEMPO_URL); await pg.wait_for_timeout(800)
    await open_review(pg, '[White "You"]\n[Black "Pip"]\n\n1. e4 e5 2. Nf3 Nc6 *')
    bad = []
    for w in (320, 360, 375, 390, 430, 768, 1024, 1280):
        await pg.set_viewport_size({'width': w, 'height': 900}); await pg.wait_for_timeout(120)
        r = await pg.evaluate("""() => ({ cut: [...document.querySelectorAll('.rv-sc-name, .rv-kind .rv-n, .rv-sc-box')].filter(e => e.getClientRects().length && e.scrollWidth > e.clientWidth + 0.5).map(e => e.innerText),
          wide: document.documentElement.scrollWidth > innerWidth })""")
        if r['cut'] or r['wide']: bad.append((w, r))
    check('summary: no move-kind name or count is cut short from 320 to 1280 px, and no sideways scroll', not bad, bad)
    await ctx.close()


async def click_sq(pg, sq):
    o = await pg.evaluate("document.querySelector('.board').__board.orient")
    box = await pg.locator('.board').first.bounding_box()
    f = ord(sq[0]) - 97; r = int(sq[1]) - 1
    x = (f if o == 'w' else 7 - f) + 0.5; y = (7 - r if o == 'w' else r) + 0.5
    await pg.mouse.click(box['x'] + box['width'] * x / 8, box['y'] + box['height'] * y / 8)

# follow an element's top edge from now until the page has been quiet for a while
FOLLOW = """(sel) => new Promise(res => {
  const el = document.querySelector(sel), out = [], t0 = performance.now();
  (function f() { out.push(Math.round(el.getBoundingClientRect().top)); if (performance.now() - t0 < 3200) requestAnimationFrame(f); else res(out); })();
})"""

FOLLOW_COACH = """(sel) => new Promise(res => {
  const el = document.querySelector(sel), c = document.querySelector('.coach'), out = [], t0 = performance.now();
  (function f() { out.push([Math.round(el.getBoundingClientRect().top), c.hidden]); if (performance.now() - t0 < 900) requestAnimationFrame(f); else res(out); })();
})"""

def glided(tops):
    """(moved, smooth): did the element move, and did it pass through in-between places on the way"""
    lo, hi = min(tops), max(tops)
    if hi - lo < 8: return False, True
    first, last = tops[0], tops[-1]
    span = [t for t in tops if min(first, last) + 3 < t < max(first, last) - 3] if abs(first - last) >= 8 else [t for t in tops if lo + 3 < t < hi - 3]
    return True, len(span) >= 4


async def test_coach_glide(browser):
    for opts, tag in [(PHONE, 'phone'), (DESK, 'desktop')]:
        ctx = await browser.new_context(**opts); pg = await ctx.new_page()
        errors = []; pg.on('pageerror', lambda e: errors.append(str(e)))
        await pg.goto(TEMPO_URL); await pg.wait_for_timeout(1000)
        await pg.evaluate("App.go('play')"); await pg.wait_for_timeout(400)
        await pg.locator('.char', has_text='Patrick Star').first.click(); await pg.wait_for_timeout(300)
        await pg.locator('.seg button', has_text='White').first.click()
        await pg.locator('button', has_text='Start game').click(); await pg.wait_for_timeout(800)
        # 1.d4 c6 2.Nf3 Qc7: now Bf4 drops the bishop to the queen, so the coach steps in
        await pg.evaluate("""() => { const G = Store.state.current; G.moves = ['d2d4', 'c7c6', 'g1f3', 'd8c7']; G.sans = ['d4', 'c6', 'Nf3', 'Qc7']; Store.touch(); App.go('play', { game: true }); }""")
        await pg.wait_for_timeout(1200)
        sel = '.v-play .panel > :last-child'
        if not await pg.locator(sel).count(): sel = '.panel > :last-child'
        await click_sq(pg, 'c1'); await pg.wait_for_timeout(100)
        follow = asyncio.ensure_future(pg.evaluate(FOLLOW, sel)); await asyncio.sleep(0.1)
        await click_sq(pg, 'f4')
        tops = await follow
        shown = await pg.locator('.coach.decide:not([hidden])').count()
        moved, smooth = glided(tops)
        check(tag + ': the coach’s warning appears and the moves below glide out of its way', shown and (not moved or smooth), 'moved %s, %d..%d' % (moved, min(tops), max(tops)))
        follow = asyncio.ensure_future(pg.evaluate(FOLLOW_COACH, sel)); await asyncio.sleep(0.1)
        await pg.locator('.coach.decide button', has_text='Play it anyway').click()
        frames = await follow
        # look at the way back up only: the bot's reply can bring a new note (a threat) a moment later
        tops = [f[0] for f in frames]; low = tops.index(min(tops))
        back = tops[:low + 1]
        mid = [t for t in back if back[-1] + 3 < t < back[0] - 3]
        hidden_at_rest = frames[low][1]
        check(tag + ': choosing closes the warning and the moves glide back up', hidden_at_rest and back[0] - back[-1] > 8 and len(mid) >= 4,
              'from %d to %d, %d in-between frames, warning hidden: %s' % (back[0], back[-1], len(mid), hidden_at_rest))
        check(tag + ': coach motion: no page errors', not errors, errors[:3])
        await ctx.close()


async def test_review_card_glide(browser):
    ctx = await browser.new_context(**DESK); pg = await ctx.new_page()
    errors = []; pg.on('pageerror', lambda e: errors.append(str(e)))
    await pg.goto(TEMPO_URL); await pg.wait_for_timeout(800)
    await open_review(pg, '[White "You"]\n[Black "Pip"]\n\n1. e4 a5 2. h3 b6 3. d4 f6 4. Bg5 c5 5. Be3 Na6 6. Nf3 e5 7. Bf4 b5 8. dxe5 h5 *')
    await pg.wait_for_timeout(500)
    # find two neighbouring moves whose cards differ in height, then step between them
    hs = await pg.evaluate("""async () => { const out = []; const n = Review._state().moves.length;
      for (let p = 0; p <= n; p++) { document.querySelector('.v-review .board').focus(); document.dispatchEvent(new KeyboardEvent('keydown', { key: p ? 'ArrowRight' : 'Home', bubbles: true }));
        await new Promise(r => setTimeout(r, 450)); out.push(Math.round(document.querySelector('.v-review .rv-card').getBoundingClientRect().height)); }
      return out; }""")
    pairs = [i for i in range(1, len(hs)) if abs(hs[i] - hs[i - 1]) >= 20]
    if not pairs:
        check('review: stepping onto a taller card glides the panel below it', True, 'no neighbouring cards differ much in height: %s' % hs)
    else:
        p = pairs[0]
        await pg.evaluate("document.activeElement && document.activeElement.blur()")
        await pg.keyboard.press('Home'); await pg.wait_for_timeout(300)
        for _ in range(p - 1): await pg.keyboard.press('ArrowRight'); await pg.wait_for_timeout(40)
        await pg.wait_for_timeout(500)
        follow = asyncio.ensure_future(pg.evaluate(FOLLOW.replace('3200', '900'), '.v-review .rv-moves')); await asyncio.sleep(0.1)
        await pg.keyboard.press('ArrowRight')
        tops = await follow
        moved, smooth = glided(tops)
        check('review: stepping onto a card of another height glides the moves below it', moved and smooth, 'card %d -> %d px, moves top %d..%d' % (hs[p - 1], hs[p], min(tops), max(tops)))
    check('review card motion: no page errors', not errors, errors[:3])
    await ctx.close()


async def test_arrow_keys(browser):
    """After a click on the board, the arrows still step through a reviewed game; a board reached with Tab can still be played from the keyboard."""
    ctx = await browser.new_context(**DESK); pg = await ctx.new_page()
    errors = []; pg.on('pageerror', lambda e: errors.append(str(e)))
    await pg.goto(TEMPO_URL); await pg.wait_for_timeout(800)
    await open_review(pg, '[White "You"]\n[Black "Pip"]\n\n1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 *')
    await pg.evaluate("document.activeElement && document.activeElement.blur()")
    await pg.keyboard.press('Home'); await pg.wait_for_timeout(250)
    box = await pg.locator('.v-review .board').bounding_box()
    await pg.mouse.click(box['x'] + box['width'] * 0.3, box['y'] + box['height'] * 0.5); await pg.wait_for_timeout(150)
    await pg.keyboard.press('ArrowRight'); await pg.wait_for_timeout(250); await pg.keyboard.press('ArrowRight'); await pg.wait_for_timeout(250)
    r = await pg.evaluate("({ ply: Review._state().ply, kbd: document.querySelector('.v-review .board').__board.kbd })")
    check('review: after a click on the board, the arrows step through the game', r['ply'] == 2 and not r['kbd'], r)
    await ctx.close()
    ctx = await browser.new_context(**DESK); pg = await ctx.new_page()
    await pg.goto(TEMPO_URL); await pg.wait_for_timeout(800)
    await pg.evaluate("App.go('play')"); await pg.wait_for_timeout(400)
    await pg.locator('.char', has_text='Patrick Star').first.click(); await pg.wait_for_timeout(300)
    await pg.locator('.seg button', has_text='White').first.click()
    await pg.locator('button', has_text='Start game').click(); await pg.wait_for_timeout(1000)
    for _ in range(40):
        await pg.keyboard.press('Tab')
        if await pg.evaluate("document.activeElement.classList.contains('board')"): break
    for k in ['ArrowUp', 'ArrowDown', 'Enter', 'ArrowUp', 'ArrowUp', 'Enter']:
        await pg.keyboard.press(k); await pg.wait_for_timeout(120)
    await pg.wait_for_timeout(2500)
    sans = await pg.evaluate("Store.state.current && Store.state.current.sans")
    check('play: a board reached with Tab still plays from the keyboard (e2, Enter, e4, Enter)', sans and sans[0] == 'e4', sans)
    box = await pg.locator('.board').bounding_box()
    await pg.mouse.click(box['x'] + box['width'] * 0.05, box['y'] + box['height'] * 0.45); await pg.wait_for_timeout(200)
    await pg.keyboard.press('ArrowLeft'); await pg.wait_for_timeout(300)
    fen = await pg.evaluate("document.querySelector('.board').__board.pos.fen()")
    check('play: after a click on the board, the left arrow shows the move before', fen.startswith('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b'), fen)
    check('arrow keys: no page errors', not errors, errors[:3])
    await ctx.close()


async def test_toast_and_sheet(browser):
    ctx = await browser.new_context(**DESK); pg = await ctx.new_page()
    await pg.goto(TEMPO_URL); await pg.wait_for_timeout(800)
    xs = await pg.evaluate("""() => new Promise(res => {
      App.toast('Saved'); const out = [], t0 = performance.now();
      (function f() { const t = document.querySelector('.toast'); if (t) { const r = t.getBoundingClientRect(); out.push(Math.round(r.left + r.width / 2)); }
        if (performance.now() - t0 < 400) requestAnimationFrame(f); else res(out); })();
    })""")
    check('a toast rises in place without sliding sideways', xs and max(xs) - min(xs) <= 1, sorted(set(xs)))
    r = await pg.evaluate("""() => new Promise(res => {
      const opener = document.querySelector('.nav a, .nav button, button'); opener && opener.focus();
      const api = App.sheet(box => { box.appendChild(document.createElement('p')).textContent = 'Hello'; });
      setTimeout(() => { api.close(); const during = !!document.querySelector('.sheet-out');
        setTimeout(() => res({ during, after: !!document.querySelector('.sheet-out, .scrim-out, .sheet, .scrim') }), 400); }, 300);
    })""")
    check('a closing sheet fades away, then is gone', r['during'] and not r['after'], r)
    await ctx.close()


async def test_meter(browser):
    ctx = await browser.new_context(**DESK); pg = await ctx.new_page()
    await pg.goto(TEMPO_URL); await pg.wait_for_timeout(800)
    await pg.evaluate("App.go('review')"); await pg.wait_for_timeout(300)
    await pg.locator('#pgn-in').fill(OPERA)
    await pg.locator('.v-review button.btn.primary', has_text='Review').click(); await pg.wait_for_timeout(200)
    d = await pg.evaluate("(() => { const i = document.querySelector('.v-review .meter > i'); return i ? getComputedStyle(i).transitionDuration : null; })()")
    check('the review progress bar fills smoothly', d and d != '0s', d)
    await ctx.close()


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=CHROME, args=['--no-sandbox'])
        for t in (test_learn_fold, test_board_moves, test_review_reveal, test_coach_glide, test_review_card_glide, test_arrow_keys, test_toast_and_sheet, test_meter):
            try:
                await t(b)
            except Exception as e:
                check(t.__name__ + ' ran to the end', False, repr(e)[:300])
        await b.close()
    failed = [n for n, ok in results if not ok]
    print('\n%d checks, %d failed' % (len(results), len(failed)))
    for n in failed: print('  FAILED:', n)

asyncio.run(main())
