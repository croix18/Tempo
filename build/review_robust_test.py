"""Game review robustness: good moves aren't called mistakes, the mistake navigator keeps the board in view,
Show best move uses the position before the mistake, retry grading, stale engine answers, empty games and long names.

    TEMPO_URL=file:///path/to/Tempo.html python3 build/review_robust_test.py
"""
import asyncio, os, re, sys, time
from playwright.async_api import async_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CHROME = os.environ.get('CHROME') or ('/usr/bin/google-chrome' if os.path.exists('/usr/bin/google-chrome') else None)
URL = os.environ.get('TEMPO_URL') or 'file://' + ROOT + '/dist/Tempo.html'
PHONE = dict(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True, device_scale_factor=1)
DESK = dict(viewport={'width': 1280, 'height': 800}, device_scale_factor=1)
FLAGGED = ('inaccuracy', 'mistake', 'blunder', 'miss')

OPERA = ('[Event "Paris"]\n[White "Paul Morphy"]\n[Black "Duke Karl / Count Isouard"]\n[Result "1-0"]\n\n'
         '1.e4 e5 2.Nf3 d6 3.d4 Bg4 4.dxe5 Bxf3 5.Qxf3 dxe5 6.Bc4 Nf6 7.Qb3 Qe7 8.Nc3 c6 9.Bg5 b5 10.Nxb5 cxb5 '
         '11.Bxb5+ Nbd7 12.O-O-O Rd8 13.Rxd7 Rxd7 14.Rd1 Qe6 15.Bxd7+ Nxd7 16.Qb8+ Nxb8 17.Rd8# 1-0')
# a beginner game against Pip: 4.Bg5 hangs the bishop, 7.Bf4 hangs it again
PIP = ['e2e4', 'a7a5', 'h2h3', 'b7b6', 'd2d4', 'f7f6', 'c1g5', 'c7c5', 'g5e3', 'b8a6', 'g1f3', 'e7e5', 'e3f4', 'b6b5', 'd4e5', 'h7h5']
BG5 = 7  # the ply after 4.Bg5
LONG = 'W' * 160

ADD_GAME = """(a) => {
  const C = TempoCore, p = new C.Pos(), ms = [];
  for (const u of a.moves) { const m = p.parseMove(u); ms.push(m); p.make(m); }
  const pgn = C.pgnFromMoves({ Event: 'Tempo game', White: 'You', Black: 'Pip', Result: a.result }, C.START_FEN, ms);
  Store.state.games.list.unshift({ id: a.id, ts: Date.now(), bot: 'pip', color: 'w', result: a.result, reason: 'resignation', pgn: pgn,
    plies: ms.length, rated: false, before: 600, after: 600, reviewed: false, acc: null, counts: null });
  Store.touch('games');
}"""
FEN_AT = """(n) => { const C = TempoCore, s = Review._state(), p = new C.Pos(); for (const u of s.moves.slice(0, n)) p.make(p.parseMove(u)); return p.fen(); }"""
BOARD = """() => { const b = document.querySelector('.v-review .board').__board, r = b.el.getBoundingClientRect();
  return { fen: b.pos.fen(), arrows: b.arrows.map(a => ({ from: a.from, to: a.to, color: a.color })), badge: b.badge, movable: b.movable,
    top: r.top, bottom: r.bottom, vh: innerHeight }; }"""

results = []
def check(name, ok, detail=''):
    results.append((name, bool(ok)))
    detail = ' | '.join(str(detail).split('\n'))
    print(('PASS  ' if ok else 'FAIL  ') + name + ('  [' + detail + ']' if detail != '' else ''), flush=True)


async def open_page(browser, opts, dark=False):
    ctx = await browser.new_context(color_scheme='dark' if dark else 'light', **opts)
    pg = await ctx.new_page()
    errors = []
    pg.on('pageerror', lambda e: errors.append('pageerror: ' + str(e)))
    pg.on('console', lambda m: errors.append('console.error: ' + m.text) if m.type == 'error' else None)
    await pg.goto(URL)
    await pg.wait_for_function("window.App && App.name && (Engines.status === 'ready' || Engines.status === 'failed')", timeout=30000)
    return ctx, pg, errors


async def wait_review(pg, timeout=300000):
    await pg.wait_for_function("() => Review._state() && Review._state().done", timeout=timeout, polling=250)
    await pg.wait_for_timeout(400)


async def card_text(pg):
    return (await pg.evaluate("(document.querySelector('.rv-card') || {}).innerText || ''")).replace('\n', ' ').strip()


async def click_sq(pg, sq):
    o = await pg.evaluate("document.querySelector('.v-review .board').__board.orient")
    box = await pg.locator('.v-review .board').first.bounding_box()
    f = ord(sq[0]) - 97; r = int(sq[1]) - 1
    x = (f if o == 'w' else 7 - f) + 0.5; y = (7 - r if o == 'w' else r) + 0.5
    await pg.mouse.click(box['x'] + box['width'] * x / 8, box['y'] + box['height'] * y / 8)


async def play(pg, u):
    await click_sq(pg, u[:2]); await pg.wait_for_timeout(120); await click_sq(pg, u[2:4])


async def go(pg, ply):
    await pg.evaluate("(n) => { const b = document.querySelectorAll('.v-review .moves .mv')[n - 1]; b.click(); }", ply)
    await pg.wait_for_timeout(500)


def board_in_view(b):
    return b['top'] >= -1 and b['bottom'] <= b['vh'] + 1


async def test_opera(browser):
    """15.Bxd7+ is Stockfish's first choice: never a mistake, and White's whole combination comes out clean."""
    ctx, pg, errors = await open_page(browser, DESK)
    await pg.evaluate("App.go('review')"); await pg.wait_for_timeout(300)
    await pg.locator('#pgn-in').fill(OPERA)
    await pg.locator('.v-review .seg button', has_text='I played White').click()
    t0 = time.time()
    await pg.locator('.v-review button.btn.primary', has_text='Review').click()
    await wait_review(pg)
    secs = time.time() - t0
    s = await pg.evaluate("Review._state()")
    cls = s['cls']
    check('opera: review finished', len(cls) == 33, '%d plies in %.0fs' % (len(cls), secs))
    check('opera: 15.Bxd7+ is not a mistake', cls[28] not in FLAGGED, cls[28])
    white = [(i, k) for i, k in enumerate(cls) if i % 2 == 0]
    check('opera: no blunder for White', not [x for x in white if x[1] == 'blunder'], [x for x in white if x[1] == 'blunder'])
    combo = [(i, k) for i, k in white if i >= 18 and k in FLAGGED]
    check('opera: the winning combination (10.Nxb5 to 17.Rd8#) has no flagged move', not combo, combo or cls[18::2])
    await go(pg, 29)
    chip = await pg.evaluate("(document.querySelector('.rv-card .rv-chip') || {}).innerText || ''")
    check('opera: the card for 15.Bxd7+ calls it good', chip.strip() not in ('Inaccuracy', 'Mistake', 'Blunder', 'Missed win') and chip.strip(), chip)
    check('opera: no page errors', not errors, errors[:3])
    await ctx.close()


async def test_phone(browser):
    ctx, pg, errors = await open_page(browser, PHONE)
    await pg.evaluate(ADD_GAME, {'moves': PIP, 'id': 'rv-pip', 'result': '1-0'})
    await pg.evaluate("Review.openGame('rv-pip')")
    await wait_review(pg)
    s = await pg.evaluate("Review._state()")
    keys = s['keyPlies']
    check('pip: 4.Bg5 is a blunder', s['cls'][BG5 - 1] == 'blunder', s['cls'][BG5 - 1])
    check('pip: at least two mistakes to fix', len(keys) >= 2 and BG5 in keys, keys)
    check('pip: review opens on the first mistake', s['ply'] == keys[0], s['ply'])
    txt = await card_text(pg)
    check('pip: navigator says "Mistake 1 of N"', ('Mistake 1 of %d' % len(keys)) in txt, txt[:40])

    # wording from the right side's view
    await go(pg, BG5 + 1)  # Pip's 4...c5, which leaves the bishop on g5 alone
    txt = await card_text(pg)
    s = await pg.evaluate("Review._state()")
    if s['cls'][BG5] == 'miss':
        check('pip: the opponent’s miss names Pip and your piece', re.search(r'Pip missed fxg5, which wins your bishop', txt), txt[:160])
    check('pip: no "your opponent had just made a mistake" template', 'off the hook' not in txt, txt[:160])

    # tap targets on a touch screen
    sizes = await pg.evaluate("""() => {
      const q = (s) => Array.from(document.querySelectorAll(s)).map(e => { const r = e.getBoundingClientRect(); return [s, Math.round(r.width), Math.round(r.height)]; });
      return [].concat(q('.rv-nav button'), q('.rv-controls button'), q('.rv-card .rv-actions button')); }""")
    await go(pg, BG5)
    sizes += await pg.evaluate("""() => Array.from(document.querySelectorAll('.rv-card .rv-actions button')).map(e => { const r = e.getBoundingClientRect(); return [e.innerText, Math.round(r.width), Math.round(r.height)]; })""")
    small = [x for x in sizes if x[2] < 44 or x[1] < 44]
    check('touch: navigator, step arrows, Find a better move and Show best move are at least 44px', not small and len(sizes) >= 10, small or len(sizes))

    # navigator from further down the page: the board comes back into view
    await go(pg, keys[0])
    await pg.evaluate("window.scrollTo(0, document.documentElement.scrollHeight)"); await pg.wait_for_timeout(400)
    await pg.locator('.rv-nav button[aria-label="Next mistake"]').click(); await pg.wait_for_timeout(1200)
    s = await pg.evaluate("Review._state()"); b = await pg.evaluate(BOARD)
    check('navigator: next jumps to mistake 2', s['ply'] == keys[1], s['ply'])
    check('navigator: board is in view after the jump', board_in_view(b), b)
    check('navigator: label follows', ('Mistake 2 of %d' % len(keys)) in await card_text(pg))
    await pg.evaluate("window.scrollTo(0, document.documentElement.scrollHeight)"); await pg.wait_for_timeout(400)
    await pg.locator('.rv-nav button[aria-label="Previous mistake"]').click(); await pg.wait_for_timeout(1200)
    s = await pg.evaluate("Review._state()"); b = await pg.evaluate(BOARD)
    check('navigator: previous jumps back', s['ply'] == keys[0], s['ply'])
    check('navigator: board in view after previous', board_in_view(b), b)

    # Show best move: the position before 4.Bg5, the best move in green, the line, no badge
    await go(pg, BG5)
    s = await pg.evaluate("Review._state()")
    best = s['evals'][BG5 - 1]['best']
    await pg.locator('.rv-card button', has_text='Show best move').click(); await pg.wait_for_timeout(700)
    b = await pg.evaluate(BOARD)
    before_fen = await pg.evaluate(FEN_AT, BG5 - 1)
    check('show best: board shows the position before the mistake', b['fen'] == before_fen, b['fen'])
    check('show best: green arrow for the best move', any(a['color'] == 'green' and a['from'] + a['to'] == best[:4] for a in b['arrows']), b['arrows'])
    check('show best: no badge on the board', not b['badge'], b['badge'])
    txt = await card_text(pg)
    check('show best: says the best move and the line', 'Best was' in txt and 'The line goes' in txt, txt[:200])

    # Find a better move: the best move
    best_san = await pg.evaluate("(a) => { const p = new TempoCore.Pos(); for (const u of a.pre) p.make(p.parseMove(u)); return p.san(p.parseMove(a.best)); }", {'pre': PIP[:BG5 - 1], 'best': best})
    await go(pg, BG5)
    await pg.locator('.rv-card button', has_text='Find a better move').click(); await pg.wait_for_timeout(600)
    await play(pg, best); await pg.wait_for_timeout(1500)
    txt = await card_text(pg)
    check('retry: the best move gets "Yes, X is the best move here."', ('Yes, %s is the best move here.' % best_san) in txt, txt[:160])
    b = await pg.evaluate(BOARD)
    check('retry: then shows the best move in green', any(a['color'] == 'green' for a in b['arrows']), b['arrows'])

    # Find a better move: safe but clearly worse (a3 instead of Nf3)
    await go(pg, BG5)
    await pg.locator('.rv-card button', has_text='Find a better move').click(); await pg.wait_for_timeout(600)
    await play(pg, 'a2a3')
    await pg.wait_for_function("() => !document.querySelector('.rv-card .thinking')", timeout=20000)
    await pg.wait_for_timeout(300)
    txt = await card_text(pg)
    check('retry: a safe but worse move is not praised', not re.search(r'Yes, a3', txt), txt[:160])
    check('retry: "a3 is safe, but %s was best: it ..."' % best_san, re.search(r'a3 is safe, but %s was best(: it [^.]+)?\.' % re.escape(best_san), txt), txt[:200])

    # stale verdict: play a move, then go to the start before the engine answers
    await go(pg, BG5)
    await pg.locator('.rv-card button', has_text='Find a better move').click(); await pg.wait_for_timeout(600)
    await play(pg, 'b1c3')
    await pg.keyboard.press('Home')
    await pg.wait_for_timeout(4000)
    s = await pg.evaluate("Review._state()"); b = await pg.evaluate(BOARD)
    txt = await card_text(pg)
    start_fen = await pg.evaluate(FEN_AT, 0)
    check('race: still at the start after the late engine answer', s['ply'] == 0 and s['mode'] == 'game', (s['ply'], s['mode']))
    check('race: no verdict shown', not re.search(r'Yes, |is safe, but|doesn’t work|Try again', txt), txt[:160])
    check('race: board untouched by the late answer', b['fen'] == start_fen and not b['arrows'] and not b['movable'], b)
    # the same race with a mouse tap on the arrows instead of the keyboard
    await go(pg, BG5)
    await pg.locator('.rv-card button', has_text='Find a better move').click(); await pg.wait_for_timeout(600)
    await play(pg, 'c2c3')
    await pg.locator('.rv-controls button[aria-label="Next move"]').click()
    await pg.wait_for_timeout(4000)
    s = await pg.evaluate("Review._state()"); txt = await card_text(pg)
    check('race: next-move tap before the verdict lands on the next move', s['ply'] == BG5 and s['mode'] == 'game' and not re.search(r'Yes, |is safe, but|doesn’t work', txt), (s['ply'], s['mode'], txt[:80]))
    check('phone: no page errors', not errors, errors[:3])
    await ctx.close()


async def test_empty(browser):
    ctx, pg, errors = await open_page(browser, DESK)
    await pg.evaluate(ADD_GAME, {'moves': [], 'id': 'rv-empty', 'result': '0-1'})
    await pg.evaluate(ADD_GAME, {'moves': ['e2e4'], 'id': 'rv-one', 'result': '1-0'})
    await pg.evaluate("Review.openGame('rv-empty')"); await pg.wait_for_timeout(1500)
    txt = await pg.evaluate("document.querySelector('#main').innerText")
    check('empty game: says there are no moves to review', 'There are no moves to review.' in txt, txt[:120])
    check('empty game: no accuracy shown', '%' not in txt and 'ccuracy' not in txt, txt[:200])
    g = await pg.evaluate("Store.state.games.list.find(x => x.id === 'rv-empty')")
    check('empty game: not marked reviewed', not g.get('reviewed'), g.get('reviewed'))
    await pg.evaluate("App.go('review')"); await pg.wait_for_timeout(400)
    rows = await pg.evaluate("Array.from(document.querySelectorAll('.v-review .list-row')).map(r => r.innerText.replace(/\\s+/g, ' '))")
    check('list: one-ply game says "1 move"', any('1 move' in r and '1 moves' not in r for r in rows), rows[:2])
    check('list: no "1 moves" anywhere', not any('1 moves' in r for r in rows), rows[:2])
    check('empty game: no page errors', not errors, errors[:3])
    await ctx.close()


async def test_long_names(browser):
    ctx, pg, errors = await open_page(browser, PHONE, dark=True)
    pgn = '[White "%s"]\n[Black "%s"]\n\n1. e4 e5 2. Nf3 Nc6 3. Bc4 Nd4 4. Nxe5 *' % (LONG, 'Maximilian Alexander von Habsburg-Lothringen ' * 4)
    await pg.evaluate("App.go('review')"); await pg.wait_for_timeout(300)
    await pg.locator('#pgn-in').fill(pgn)
    await pg.locator('.v-review .seg button', has_text='I played Black').click()
    await pg.locator('.v-review button.btn.primary', has_text='Review').click(); await pg.wait_for_timeout(800)
    sw = await pg.evaluate("[document.documentElement.scrollWidth, innerWidth]")
    check('long names: no horizontal scroll at 390px while reviewing', sw[0] <= sw[1], sw)
    await wait_review(pg)
    await pg.locator('.rv-details summary').click(); await pg.wait_for_timeout(300)
    for p in range(1, 8):
        await go(pg, p)
        sw = await pg.evaluate("[document.documentElement.scrollWidth, innerWidth]")
        if sw[0] > sw[1]: break
    check('long names: no horizontal scroll after the review, on every move, details open', sw[0] <= sw[1], sw)
    fill = await pg.evaluate("getComputedStyle(document.querySelector('.evalgraph .eg-white')).fill")
    check('dark mode: the graph’s White share is a muted cream, not the bright light-mode cream', fill.replace(' ', '') != 'rgb(244,239,228)', fill)
    key = await pg.evaluate("(() => { const k = document.querySelector('.rv-key'); return k ? [k.innerText.replace(/\\s+/g, ' '), k.getBoundingClientRect().height] : null; })()")
    check('graph key stays one line on a phone', key and key[1] < 26, key)
    check('long names: no page errors', not errors, errors[:3])
    await ctx.close()


async def test_repertoire(browser):
    """A game that leaves a learned opening line: review says where, and the line goes first in the drill queue."""
    ctx, pg, errors = await open_page(browser, PHONE)
    pgn = '[Event "Test"]\n[White "You"]\n[Black "Pip"]\n[Result "1/2-1/2"]\n\n1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. Nc3 Nf6 5. d3 d6 6. O-O O-O 1/2-1/2'
    await pg.evaluate("""(pgn) => {
      Store.state.openings.lines['white-e4/giuoco-piano'] = { learned: true, box: 3, due: Date.now() + 5 * 864e5, drills: 3, right: 3 };
      Store.touch('openings');
      Store.state.games.list.unshift({ id: 'rep1', ts: Date.now(), bot: 'pip', color: 'w', result: '1/2-1/2', reason: 'agreement', pgn: pgn, plies: 12, rated: false, before: 600, after: 600, reviewed: false });
      Review.openGame('rep1'); }""", pgn)
    await wait_review(pg)
    note = (await pg.evaluate("(document.querySelector('.rv-opening:not([hidden])') || {}).innerText || ''")).replace('\n', ' ')
    check('repertoire: review says where you left the line, and what it plays', 'You left your Giuoco Piano line with 4.Nc3' in note and 'The line plays 4.c3' in note, note)
    rec = await pg.evaluate("Store.state.openings.lines['white-e4/giuoco-piano']")
    due_now = await pg.evaluate("(r) => r.due <= Date.now()", rec)
    check('repertoire: the line you left is first in the drill queue', due_now and rec['box'] == 0, rec)
    await pg.locator('.rv-opening button', has_text='Show the move').click(); await pg.wait_for_timeout(500)
    card = await card_text(pg)
    check('repertoire: the move card says the move left the line', 'This left your Giuoco Piano line' in card, card[:200])
    await pg.locator('.rv-opening button', has_text='Drill this line').click(); await pg.wait_for_timeout(800)
    where = await pg.evaluate("[App.name, (document.querySelector('.view h1') || {}).innerText || '']")
    check('repertoire: Drill this line opens that line\'s drill', where[0] == 'openings' and 'Giuoco Piano' in where[1], where)
    check('repertoire: no page errors', not errors, errors[:3])
    await ctx.close()


async def main():
    which = sys.argv[1:] or ['opera', 'phone', 'empty', 'long', 'repertoire']
    async with async_playwright() as p:
        browser = await p.chromium.launch(executable_path=CHROME, args=['--no-sandbox'])
        for name, fn in [('opera', test_opera), ('phone', test_phone), ('empty', test_empty), ('long', test_long_names), ('repertoire', test_repertoire)]:
            if name not in which: continue
            try:
                await fn(browser)
            except Exception as e:
                check(name + ': ran to the end', False, repr(e)[:300])
        await browser.close()
    bad = [n for n, ok in results if not ok]
    print('\n%d checks, %d failed' % (len(results), len(bad)))
    sys.exit(1 if bad else 0)

asyncio.run(main())
