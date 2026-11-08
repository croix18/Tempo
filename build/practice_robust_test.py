# Puzzles and trainers: a regression check for each bug fixed in the practice pass, and smoke checks for
# the new teaching features. Usage: TEMPO_URL=file:///path/to/Tempo.html python3 build/practice_robust_test.py [name ...]
import asyncio, json, os, re, sys, time
from playwright.async_api import async_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CHROME = os.environ.get('CHROME') or ('/usr/bin/google-chrome' if os.path.exists('/usr/bin/google-chrome') else None)
URL = os.environ.get('TEMPO_URL') or 'file://' + ROOT + '/dist/Tempo.html'
PHONE = {'width': 390, 'height': 844}
DESK = {'width': 1280, 'height': 800}
# a clock the test can move forward: Date.now() + window.__off
CLOCK = "(() => { const real = Date.now.bind(Date); window.__off = 0; Date.now = () => real() + window.__off; })();"

RESULTS = []
def check(name, ok, detail=''):
    RESULTS.append((name, bool(ok), detail))
    print(('PASS ' if ok else 'FAIL ') + name + ('' if ok else '  :: ' + str(detail)[:600]), flush=True)


class Page:
    """One fresh browser context and page, with page errors collected."""
    def __init__(self, browser, vp=DESK, scheme='light'):
        self.browser, self.vp, self.scheme, self.errors = browser, vp, scheme, []

    async def __aenter__(self):
        self.ctx = await self.browser.new_context(viewport=self.vp, color_scheme=self.scheme)
        await self.ctx.add_init_script(CLOCK)
        self.pg = await self.ctx.new_page()
        self.pg.on('pageerror', lambda e: self.errors.append('pageerror: ' + str(e)[:300]))
        self.pg.on('console', lambda m: self.errors.append('console: ' + m.text[:300]) if m.type == 'error' else None)
        await self.pg.goto(URL)
        await self.pg.wait_for_function("() => window.App && App.name", timeout=30000)
        await self.pg.wait_for_timeout(300)
        return self

    async def __aexit__(self, *a):
        await self.ctx.close()

    async def ev(self, js, arg=None):
        return await self.pg.evaluate(js, arg) if arg is not None else await self.pg.evaluate(js)

    async def wait(self, ms):
        await self.pg.wait_for_timeout(ms)

    async def until(self, js, timeout=15000):
        await self.pg.wait_for_function(js, timeout=timeout)

    async def movable(self, timeout=15000):
        await self.until("() => { const b = document.querySelector('.view .board'); return !!b && b.__board.canMove(); }", timeout)

    async def can_move(self):
        return await self.ev("(() => { const b = document.querySelector('.view .board'); return !!b && b.__board.canMove(); })()")

    async def click_sq(self, sq):
        o = await self.ev("document.querySelector('.view .board').__board.orient")
        box = await self.pg.locator('.view .board').first.bounding_box()
        f = ord(sq[0]) - 97; r = int(sq[1]) - 1
        x = (f if o == 'w' else 7 - f) + 0.5; y = (7 - r if o == 'w' else r) + 0.5
        await self.pg.mouse.click(box['x'] + box['width'] * x / 8, box['y'] + box['height'] * y / 8)

    async def move(self, u):
        await self.click_sq(u[:2]); await self.wait(90); await self.click_sq(u[2:4])
        if len(u) == 5:
            await self.wait(250)
            names = {'q': 'Queen', 'r': 'Rook', 'b': 'Bishop', 'n': 'Knight'}
            btn = self.pg.locator('.promo-btn[aria-label="%s"]' % names[u[4]])
            if await btn.count(): await btn.click()

    async def start_rush(self):
        """press Start on the rush rules, when there is one"""
        start = self.pg.locator('.view .panel button', has_text='Start')
        if await start.count(): await start.first.click()

    async def panel(self):
        return await self.ev("(() => { const p = document.querySelector('.view .panel'); return p ? p.innerText.replace(/\\s+/g, ' ') : ''; })()")

    async def cur(self):
        return await self.ev("Puzzles._cur()")

    async def state(self):
        return await self.ev("typeof Puzzles._state === 'function' ? Puzzles._state() : null")

    async def wrong_move(self):
        """a legal move that isn't the expected one and doesn't mate"""
        return await self.ev("""(() => { const c = Puzzles._cur(), b = document.querySelector('.view .board').__board, want = c.moves[c.idx];
          const ms = b.legal.filter(m => TempoCore.uci(m).slice(0, 4) !== want.slice(0, 4));
          for (const m of ms) { const p = b.pos.clone(); p.make(m); if (p.status().reason !== 'checkmate') return TempoCore.uci(m); }
          return null; })()""")

    async def solve_current(self):
        c = await self.cur()
        k = c['idx']
        while k < len(c['moves']):
            await self.movable()
            await self.move(c['moves'][k]); k += 2
            await self.wait(150)

    async def only_puzzles(self, filt):
        """make Data.puzzles() return only the puzzles that pass filt (JS source of a predicate)"""
        n = await self.ev("""async (src) => { const all = window.__all || (window.__all = await Data.puzzles()); const f = eval(src);
          const list = all.filter(f); Data.puzzles = () => Promise.resolve(list); return list.length; }""", filt)
        return n


MATE1 = "p => p.moves.length === 2 && p.themes.indexOf('mateIn1') >= 0"
LONG = "p => p.moves.length >= 6 && p.rating < 1400"


# ---------------- bug 1: a rush that ends during a reply or a load stays ended ----------------
async def t_rush_race(b):
    for label, filt in [('right after a solve', MATE1), ('after a correct non-final move', LONG), ('while a puzzle loads', MATE1)]:
        async with Page(b) as P:
            await P.only_puzzles(filt)
            await P.ev("App.go('puzzles')"); await P.wait(200)
            await P.pg.locator('.menu-row', has_text='Rush').first.click(); await P.wait(200)
            await P.start_rush()
            if label == 'while a puzzle loads':
                await P.wait(100)
            else:
                # a mate in one is solved by this move; in the longer puzzles it's a correct first move
                await P.movable()
                c = await P.cur()
                await P.move(c['moves'][c['idx']])
            await P.ev("window.__off += 181000")
            await P.wait(1600)
            movable1 = await P.can_move(); text1 = await P.panel(); c1 = await P.cur()
            await P.wait(1500)
            movable2 = await P.can_move(); text2 = await P.panel(); c2 = await P.cur()
            # over, the board still, and no new puzzle came up behind the results
            ok = not movable1 and not movable2 and 'Time’s up' in text1 and 'Time’s up' in text2 and (c1 or {}).get('id') == (c2 or {}).get('id')
            check('bug 1: rush time-up ' + label + ' stays over', ok and not P.errors, {'movable': [movable1, movable2], 'text': text2[:200], 'errors': P.errors})


# ---------------- bug 2 and 13: the daily is rated once a day, and returns to where it came from ----------------
async def t_daily(b):
    async with Page(b, PHONE) as P:
        await P.ev("Puzzles.daily({ from: 'home' })")
        await P.movable()
        back = await P.ev("document.querySelector('.view .back').innerText.trim()")
        r0 = await P.ev("[Store.state.puzzles.rating, Store.state.puzzles.count]")
        await P.move(await P.wrong_move()); await P.wait(1000)
        r1 = await P.ev("[Store.state.puzzles.rating, Store.state.puzzles.count]")
        c1 = await P.cur()
        await P.pg.locator('.view .back').click(); await P.wait(500)
        at_home = await P.ev("App.name")
        await P.ev("Puzzles.daily({ from: 'home' })"); await P.movable()
        c2 = await P.cur()
        await P.move(await P.wrong_move()); await P.wait(1000)
        r2 = await P.ev("[Store.state.puzzles.rating, Store.state.puzzles.count]")
        await P.solve_current(); await P.wait(800)
        r3 = await P.ev("[Store.state.puzzles.rating, Store.state.puzzles.count]")
        text = await P.panel()
        check('bug 2: the daily puzzle is rated once a day', r1[1] == r0[1] + 1 and r2 == r1 and r3 == r1 and c1['id'] == c2['id'], {'ratings': [r0, r1, r2, r3]})
        check('bug 2: a second try at the daily says it isn’t rated', 'counts once' in text, text[:300])
        check('bug 13: the daily opened from Home goes back to Home', back == 'Home' and at_home == 'home', [back, at_home])
        await P.ev("Puzzles.daily()"); await P.wait(300)
        back2 = await P.ev("document.querySelector('.view .back').innerText.trim()")
        check('bug 13: without an origin the back link goes to Puzzles', back2 == 'Puzzles', back2)
        check('no page errors (daily)', not P.errors, P.errors)


# ---------------- bug 3: underpromotion with "Always promote to a queen" on ----------------
async def t_promotion(b):
    async with Page(b) as P:
        await P.ev("() => { Store.state.settings.autoQueen = true; App.applySettings(); }")
        n = await P.only_puzzles("p => p.id === 'iDoZe'")
        if not n:
            n = await P.only_puzzles("p => p.moves.slice(1).some((m, i) => i % 2 === 0 && /^[a-h][27][a-h][18][nbr]$/.test(m))")
        await P.ev("async () => { const l = await Data.puzzles(); Store.state.puzzles.rating = l[0].rating; }")
        await P.ev("App.go('puzzles')"); await P.wait(200)
        await P.pg.locator('.menu-row', has_text='Rated puzzles').first.click(); await P.movable()
        opt = await P.ev("document.querySelector('.view .board').__board.opts.autoQueen")
        c = await P.cur(); k = c['idx']; menu = False
        while k < len(c['moves']):
            await P.movable()
            u = c['moves'][k]
            if len(u) == 5:
                await P.click_sq(u[:2]); await P.wait(90); await P.click_sq(u[2:4]); await P.wait(300)
                menu = await P.pg.locator('.promo-btn').count() == 4
                if not menu: break  # the pawn became a queen by itself
                names = {'q': 'Queen', 'r': 'Rook', 'b': 'Bishop', 'n': 'Knight'}
                await P.pg.locator('.promo-btn[aria-label="%s"]' % names[u[4]]).click()
            else:
                await P.move(u)
            await P.wait(900); k += 2
        text = await P.panel()
        check('bug 3: puzzle board shows the promotion menu even with auto-queen on', opt is False and menu, {'opt': opt, 'menu': menu})
        check('bug 3: an underpromotion puzzle can be solved with auto-queen on', 'Solved' in text, {'puzzle': c['id'], 'text': text[:200]})
        check('no page errors (promotion)', not P.errors, P.errors)


# ---------------- bug 4 and the mistakes trainer ----------------
SCHOLAR = 'r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5Q2/PPPP1PPP/RNB1K1NR w KQkq - 4 4'
async def t_mistakes(b):
    async with Page(b) as P:
        await P.ev("""(fen) => { const S = Store.state, bot = TempoBots.BOTS[0];
          S.games.list.unshift({ id: 'T1', ts: Date.now() - 86400000, bot: bot.id, color: 'w', result: '0-1', reason: 'checkmate', pgn: '', plies: 20, reviewed: true });
          S.mistakes.items = [
            { id: 'gT1-6', fen: fen, played: 'g1e2', best: 'f3f7', kind: 'blunder', ts: Date.now(), box: 0, due: 0, seen: 0 },
            { id: 'gT1-8', fen: fen, played: 'g1e2', best: 'f3f7', kind: 'mistake', ts: Date.now(), box: 0, due: 0, seen: 0 },
            { id: 'gNONE-3', fen: fen, played: 'g1e2', best: 'f3f7', kind: 'miss', ts: Date.now(), box: 0, due: 0, seen: 0 }];
          Store.touch('mistakes'); }""", SCHOLAR)
        await P.ev("App.go('train')"); await P.wait(300)
        sub = await P.ev("document.querySelector('.menu-row .s').innerText")
        check('trainers menu: mistakes row says how many are due', sub == '3 positions are ready to retry', sub)
        await P.ev("App.go('train', { mode: 'mistakes' })"); await P.movable()
        opt = await P.ev("document.querySelector('.view .board').__board.opts.autoQueen")
        check('bug 3: the mistakes board always asks which piece to promote to', opt is False, opt)
        text = await P.panel()
        check('mistakes: names the game it came from', 'From your loss to ' in text and 'On move 4 you played Ne2, and it cost you.' in text, text[:300])
        # bug 4: a wrong move, then "Show the answer" while the engine is still checking it
        await P.move('a2a3'); await P.wait(250)
        await P.pg.locator('.view button', has_text='Show the answer').click()
        await P.wait(4500)
        text = await P.panel()
        seen = await P.ev("Store.state.mistakes.items[0].seen")
        movable = await P.can_move()
        check('bug 4: the answer stays shown after a quick tap, and the item is graded once',
              'Qxf7#' in text and 'Try again' not in text and not movable and seen == 1, {'text': text[:300], 'seen': seen, 'movable': movable})
        check('mistakes: the answer says what it does', 'The better move was Qxf7#.' in text, text[:300])
        rows = await P.ev("document.querySelectorAll('.view .panel .study button').length")
        check('mistakes: the answer links to a lesson and puzzles on it', rows == 2, rows)
        await P.pg.locator('.view button', has_text='Next').click(); await P.movable()
        await P.move('f3f7'); await P.wait(900)
        text = await P.panel()
        check('mistakes: a right move says why', 'That’s it. Qxf7# is checkmate.' in text, text[:300])
        await P.pg.locator('.view button', has_text='Next').click(); await P.movable()
        text = await P.panel()
        check('mistakes: no game line when the game isn’t stored', 'From your' not in text and 'and missed a winning move' in text, text[:300])
        # hint: the piece, then the move
        await P.pg.locator('.view button', has_text='Hint').click(); await P.wait(600)
        t1 = await P.panel()
        await P.pg.locator('.view button', has_text='Hint').click(); await P.wait(300)
        t2 = await P.panel()
        check('mistakes: hints name the piece, then the move', 'Look at your queen on f3.' in t1 and 'Play Qxf7#.' in t2, [t1[:200], t2[:200]])
        await P.move('f3f7'); await P.wait(600)
        await P.pg.locator('.view button', has_text='Finish').click(); await P.wait(300)
        text = await P.panel()
        check('mistakes: the end shows the score', '2 of 3 right' in text, text[:200])
        check('no page errors (mistakes)', not P.errors, P.errors)


# ---------------- bug 5: a rush lost to three misses ----------------
async def t_rush_strikes(b):
    async with Page(b, PHONE) as P:
        await P.only_puzzles(MATE1)
        await P.ev("App.go('puzzles')"); await P.wait(200)
        await P.pg.locator('.menu-row', has_text='Rush').first.click(); await P.wait(200)
        intro = await P.panel()
        st0 = await P.state()
        check('rush: the rules come first, and the clock waits for Start', 'three minutes' in intro and 'Three misses end the run.' in intro and (st0 or {}).get('started') is False, intro[:200])
        await P.start_rush()
        for i in range(3):
            await P.movable()
            await P.move(await P.wrong_move()); await P.wait(300)
        await P.wait(1200)
        text = await P.panel(); st = await P.state() or {}
        check('bug 5: a rush lost to three misses is titled by the misses', 'Three misses' in text and 'Time’s up' not in text, text[:200])
        rows = await P.pg.locator('.pz-missed .menu-row').count()
        check('rush: the end lists the missed puzzles', rows == 3, rows)
        first = st['missed'][0]
        await P.pg.locator('.pz-missed .menu-row').first.click(); await P.movable()
        st2 = await P.state()
        chip = await P.ev("document.querySelector('.view .chip').innerText")
        check('rush: a missed puzzle can be tried again', st2['retrying'] == first and chip == 'Try again', [st2, chip])
        await P.pg.locator('.view button', has_text='Show the answer').click(); await P.wait(2500)
        text = await P.panel()
        check('retry: after the answer, offers to replay it', 'Replay the answer' in text, text[:300])
        await P.pg.locator('.view button', has_text='Back to results').click(); await P.wait(300)
        text = await P.panel()
        check('retry: back to the results, marked', 'Three misses' in text and 'You saw the answer' in text, text[:300])
        check('no page errors (rush strikes)', not P.errors, P.errors)


# ---------------- bug 6, 7 and 8: hints ----------------
async def t_hints(b):
    async with Page(b) as P:
        await P.only_puzzles(MATE1)
        await P.ev("() => { window.__engineCalls = 0; const a = Engines.analyse; Engines.analyse = function () { window.__engineCalls++; return a.apply(this, arguments); }; }")
        await P.ev("App.go('puzzles')"); await P.wait(200)
        await P.pg.locator('.menu-row', has_text='Rated puzzles').first.click(); await P.movable()
        c = await P.cur()
        r0 = await P.ev("({ r: Store.state.puzzles.rating, n: Store.state.puzzles.count })")
        # six quick taps: one hint
        await P.ev("() => { const b = Array.from(document.querySelectorAll('.view .panel button')).find(x => x.innerText.trim() === 'Hint'); for (let i = 0; i < 6; i++) b.click(); }")
        await P.wait(200)
        st = await P.state()
        text = await P.panel()
        frm = c['moves'][c['idx']][:2]
        piece = await P.ev("""(sq) => ['', 'pawn', 'knight', 'bishop', 'rook', 'queen', 'king'][Math.abs(document.querySelector('.view .board').__board.pos.pieceAt(sq))]""", frm)
        mark = await P.ev("(() => { const b = document.querySelector('.view .board').__board; return b.marks.map(m => m.kind + ':' + m.sq); })()")
        calls = await P.ev("window.__engineCalls")
        check('bug 6: quick repeat taps on Hint count once and search nothing', st['hint'] == 1 and st['hintMax'] == 1 and calls == 0, {'state': st, 'engine calls': calls})
        check('hint: names the piece and marks it', ('Look at your %s on %s.' % (piece, frm)) in text and mark == ['hint:' + frm], {'text': text[:200], 'marks': mark})
        check('hint: says once that a hint lowers what the puzzle is worth', text.count('A hint lowers what this puzzle is worth.') == 1, text[:300])
        await P.wait(400)
        await P.pg.locator('.view .panel button', has_text='Hint').click(); await P.wait(300)
        text = await P.panel()
        arrows = await P.ev("document.querySelectorAll('.view .b-arrows .arrow.green').length")
        disabled = await P.ev("Array.from(document.querySelectorAll('.view .panel button')).find(x => x.innerText.trim() === 'Hint').disabled")
        check('hint: the second shows the move with a green arrow', re.search(r'Play [^ ]+\.', text) is not None and arrows == 1 and disabled, {'text': text[:200], 'arrows': arrows})
        # what a miss would have cost, from the same rating
        miss = await P.ev("""(c) => { const S = Store.state.puzzles, K = S.count < 20 ? 40 : S.count < 60 ? 24 : 16, e = 1 / (1 + Math.pow(10, (c.rating - S.rating) / 400));
          return Math.max(100, Math.round(S.rating + K * (0 - e))) - S.rating; }""", c)
        await P.move(c['moves'][c['idx']]); await P.wait(700)
        r1 = await P.ev("({ r: Store.state.puzzles.rating, n: Store.state.puzzles.count })")
        d = r1['r'] - r0['r']
        text = await P.panel()
        check('bug 8: a hinted solve costs less than a miss and gains nothing', d > miss and d <= 0 and r1['n'] == r0['n'] + 1, {'hinted': d, 'miss would be': miss})
        check('hint: the result says a hint was used', 'Solved with a hint.' in text, text[:200])
        # the note is said once: not on the next puzzle's hint
        await P.pg.locator('.view button', has_text='Next puzzle').click(); await P.movable()
        await P.pg.locator('.view .panel button', has_text='Hint').click(); await P.wait(300)
        text = await P.panel()
        check('hint: the note isn’t repeated on the next puzzle', 'A hint lowers' not in text and 'Look at your' in text, text[:200])
        check('no page errors (hints)', not P.errors, P.errors)


# ---------------- bug 14: leaving a run ----------------
async def t_leaving(b):
    async with Page(b) as P:
        await P.only_puzzles(MATE1)
        await P.ev("App.go('puzzles')"); await P.wait(200)
        await P.pg.locator('.menu-row', has_text='Streak').first.click(); await P.movable()
        text = await P.panel()
        check('streak: the rules show at the start', 'Each puzzle a little harder. One miss ends the run.' in text, text[:200])
        await P.solve_current(); await P.wait(1200); await P.movable()
        best = await P.ev("Store.state.puzzles.streakBest")
        await P.pg.locator('.view .back').click(); await P.wait(400)
        sheet = await P.ev("(document.querySelector('.sheet') || {}).innerText || ''")
        await P.pg.locator('.sheet button', has_text='Cancel').click(); await P.wait(300)
        still = await P.ev("App.name === 'puzzles' && !!document.querySelector('.view .board')")
        await P.pg.locator('.view .back').click(); await P.wait(400)
        await P.pg.locator('.sheet button', has_text='End run').click(); await P.wait(400)
        menu = await P.ev("App.name === 'puzzles' && !!document.querySelector('.view .menu-list')")
        check('bug 14: the back button asks before ending a run, and keeps the best', 'End this run?' in sheet and still and menu and best == 1, {'sheet': sheet[:120], 'still': still, 'menu': menu, 'best': best})
        await P.pg.locator('.menu-row', has_text='Streak').first.click(); await P.movable()
        await P.solve_current(); await P.wait(1200); await P.movable()
        await P.solve_current(); await P.wait(1200); await P.movable()
        await P.ev("App.go('home')"); await P.wait(300)
        best = await P.ev("Store.state.puzzles.streakBest")
        check('bug 14: leaving a run by the tabs keeps its best', best == 2, best)
        await P.ev("App.go('puzzles')"); await P.wait(300)
        sub = await P.ev("Array.from(document.querySelectorAll('.menu-row')).find(r => /Streak/.test(r.innerText)).querySelector('.s').innerText")
        check('puzzles menu: the streak row shows the best', sub == 'Your best is 2', sub)
        check('no page errors (leaving)', not P.errors, P.errors)


# ---------------- items 9, 10, 15: wrong-move reasons, replay, theme chips, naming ----------------
async def t_teaching(b):
    async with Page(b) as P:
        r = await P.ev("""(() => { const C = TempoCore, out = {};
          let p = new C.Pos('6k1/8/4p3/8/8/2N5/8/6K1 w - - 0 1'); out.hang = Puzzles.wrongReason(p, p.parseMove('c3d5'));
          p = new C.Pos('3r2k1/5ppp/8/8/8/8/R4PPP/6K1 w - - 0 1'); out.mate = Puzzles.wrongReason(p, p.parseMove('a2a3'));
          p = new C.Pos('6k1/8/8/8/8/8/8/R5K1 w - - 0 1'); out.none = Puzzles.wrongReason(p, p.parseMove('a1a2'));
          return out; })()""")
        check('wrong move: says when the moved piece can be won', r['hang'] == 'After Nd5, your opponent can win your knight.', r)
        check('wrong move: says when it allows mate', r['mate'] == 'After Ra3, your opponent has checkmate with Rd1#.', r)
        check('wrong move: says nothing when there is nothing cheap to say', r['none'] is None, r)
        # in a real puzzle: find a wrong move that has a reason and play it
        await P.only_puzzles("p => p.moves.length === 2 && p.rating < 1200")
        await P.ev("App.go('puzzles')"); await P.wait(200)
        await P.pg.locator('.menu-row', has_text='Rated puzzles').first.click()
        found = None
        for tries in range(8):
            await P.movable()
            found = await P.ev("""(() => { const c = Puzzles._cur(), C = TempoCore, p = new C.Pos(c.fen); for (let i = 0; i < c.idx; i++) p.make(p.parseMove(c.moves[i]));
              for (const m of p.legalMoves()) { const u = C.uci(m); if (u.slice(0, 4) === c.moves[c.idx].slice(0, 4)) continue; const q = p.clone(); q.make(m); if (q.status().reason === 'checkmate') continue;
                const why = Puzzles.wrongReason(p, m); if (why) return { u: u, why: why }; } return null; })()""")
            if found: break
            await P.pg.locator('.view button', has_text='Show the answer').click(); await P.wait(2000)
            await P.pg.locator('.view button', has_text='Next puzzle').click()
        if found:
            await P.move(found['u']); await P.wait(400)
            text = await P.panel()
            check('wrong move: the reason shows under "Try again"', 'Not the move. Try again.' in text and found['why'] in text, {'want': found, 'text': text[:300]})
        else:
            check('wrong move: the reason shows under "Try again"', False, 'no puzzle with a cheap reason found')
        text = await P.panel()
        check('naming: "Show the answer" and the short instruction', 'Show the answer' in text and re.search(r'(White|Black) to move\. Find the best move\.', text) is not None, text[:200])
        await P.pg.locator('.view button', has_text='Show the answer').click(); await P.wait(2500)
        c = await P.cur()
        final_fen = await P.ev("document.querySelector('.view .board').__board.pos.fen()")
        start_fen = await P.ev("(c) => { const p = new TempoCore.Pos(c.fen); p.make(p.parseMove(c.moves[0])); return p.fen(); }", c)
        await P.pg.locator('.view button', has_text='Replay the answer').click(); await P.wait(300)
        mid = await P.ev("document.querySelector('.view .board').__board.pos.fen()")
        await P.wait(2200)
        end = await P.ev("document.querySelector('.view .board').__board.pos.fen()")
        check('replay: the answer plays again from the start', mid == start_fen and end == final_fen, {'mid': mid, 'start': start_fen, 'end': end, 'final': final_fen})
        link = await P.ev("(() => { const a = document.querySelector('.pz-answer a.pz-link'); return a ? { text: a.innerText, btn: a.classList.contains('btn'), last: a === a.parentNode.lastElementChild } : null; })()")
        check('after a puzzle: "Open on Lichess" is a quiet link at the bottom', link and link['text'] == 'Open on Lichess' and not link['btn'] and link['last'], link)
        chip = await P.ev("(() => { const b = document.querySelector('.pz-answer .pill'); return b ? { tag: b.tagName, label: b.innerText } : null; })()")
        if chip:
            key = await P.ev("(label) => Object.keys(Puzzles.NAMES).find(k => Puzzles.NAMES[k] === label)", chip['label'])
            await P.pg.locator('.pz-answer .pill').first.click(); await P.movable()
            st = await P.state()
            text = await P.panel()
            definition = await P.ev("(k) => Puzzles.DEFS[k] || null", key)
            check('theme chips start that theme', chip['tag'] == 'BUTTON' and st['mode'] == 'theme' and (await P.ev("document.querySelector('.view .chip').innerText")) == chip['label'], {'chip': chip, 'state': st})
            if definition:
                check('a theme session starts with its definition', definition in text, text[:300])
        else:
            check('theme chips start that theme', False, 'no theme chip')
        await P.ev("() => { Data.puzzles = () => Promise.resolve(window.__all); }")
        await P.ev("Puzzles.themed('fork')"); await P.movable()
        text = await P.panel()
        check('a fork session starts with what a fork is', 'Fork. One piece attacks two or more pieces at the same time.' in text, text[:300])
        check('no page errors (teaching)', not P.errors, P.errors)


# ---------------- items 11 and 12: the puzzles and trainers menus ----------------
ALLOWED_SUB = re.compile(r'^(Your rating \d+|Your best is \d+( of 10)?|\d+ positions? (is|are) ready to retry|Nothing due right now|None yet|\d+ lessons? due · about \d+ minutes?|Next review (today|tomorrow|in \d+ days)|From .+)$')
async def t_menus(b):
    async with Page(b, PHONE) as P:
        await P.ev("App.go('puzzles')")
        await P.until("() => !!document.querySelector('.pz-all')")
        m = await P.ev("""(() => { const v = document.querySelector('.view');
          const h3 = Array.from(v.querySelectorAll('h3')).find(x => x.innerText === 'Start with these');
          const first = h3 ? Array.from(h3.nextElementSibling.querySelectorAll('.pill')).map(x => x.firstChild.textContent) : null;
          const all = v.querySelector('.pz-all');
          return { first: first, open: all.open, summary: all.querySelector('summary').innerText.replace(/\\s+/g, ' '),
            groups: Array.from(all.querySelectorAll('.pz-groups h3')).map(x => x.textContent),
            labels: Array.from(all.querySelectorAll('.pill')).map(x => x.firstChild.textContent),
            subs: Array.from(v.querySelectorAll('.menu-row .s')).map(x => x.innerText) }; })()""")
        want = ['Fork', 'Pin', 'Skewer', 'Hanging piece', 'Discovered attack', 'Mate in 1', 'Mate in 2', 'Back-rank mate']
        check('puzzles menu: "Start with these" holds the eight beginner themes', m['first'] == want, m['first'])
        check('puzzles menu: every group sits under one closed "All themes"', not m['open'] and m['summary'].startswith('All themes') and m['groups'] == ['Tactics', 'Checkmates', 'Game phase', 'Length'], m)
        n_all = await P.ev("""async () => { const list = await Data.puzzles(), c = {}; list.forEach(p => p.themes.forEach(t => c[t] = (c[t] || 0) + 1));
          return Object.keys(Puzzles.NAMES).filter(t => t !== 'mate' && (c[t] || 0) >= 10).length; }""")
        check('puzzles menu: no theme was removed', len(m['labels']) == n_all and 'Remove the defender' in m['labels'] and 'Capture the defender' not in m['labels'], [len(m['labels']), n_all])
        empty = await P.ev("""async () => { const list = await Data.puzzles(), c = {}, out = []; list.forEach(p => p.themes.forEach(t => c[t] = (c[t] || 0) + 1));
          for (const t of Object.keys(Puzzles.NAMES)) if ((c[t] || 0) >= 10 && !(await Puzzles._pickFor(t))) out.push(t); return out; }""")
        check('puzzles menu: every listed theme has a puzzle for a 600 player', not empty, empty)
        check('puzzles menu: rows have only stateful lines', m['subs'] == ['Your rating 600'], m['subs'])
        await P.pg.locator('.pz-all summary').click(); await P.wait(200)
        opened = await P.ev("document.querySelector('.pz-all').open")
        tap = await P.ev("Math.min(...Array.from(document.querySelectorAll('.view .pill, .view .menu-row, .pz-all summary')).filter(x => x.offsetParent).map(x => x.getBoundingClientRect().height))")
        check('puzzles menu: "All themes" opens, and targets are 44px or more', opened and tap >= 44, [opened, tap])
        await P.ev("() => { const S = Store.state.puzzles; S.streakBest = 12; S.rushBest = 9; S.coordBest = 8; S.visionBest = 7; }")
        await P.ev("App.go('puzzles')"); await P.wait(300)
        subs = await P.ev("Array.from(document.querySelectorAll('.view .menu-row .s')).map(x => x.innerText)")
        check('puzzles menu: bests show as stateful lines', subs == ['Your rating 600', 'Your best is 12', 'Your best is 9'], subs)
        await P.ev("App.go('train')"); await P.wait(300)
        subs = await P.ev("Array.from(document.querySelectorAll('.view .menu-row .s')).map(x => x.innerText)")
        check('trainers menu: only stateful lines', all(ALLOWED_SUB.match(s) for s in subs) and 'Your best is 8' in subs and 'Your best is 7 of 10' in subs, subs)
        caption = await P.ev("Array.from(document.querySelectorAll('.view p')).map(p => p.innerText)")
        check('trainers menu: no how-it-works captions', not caption, caption)
        check('no page errors (menus)', not P.errors, P.errors)


# ---------------- item 16: trainers ----------------
async def t_trainers(b):
    async with Page(b) as P:
        # coordinates: score some squares, let the clock run out
        await P.ev("App.go('train', { mode: 'coords' })"); await P.wait(300)
        await P.pg.locator('.view button', has_text='Start').click(); await P.wait(200)
        for i in range(5):
            t = await P.ev("document.querySelector('.tr-big').innerText.trim()")
            await P.click_sq(t); await P.wait(120)
        await P.ev("window.__off += 31000"); await P.wait(600)
        text = await P.panel()
        check('coordinates: the end says the score and the new best', re.search(r'5 squares\s*New best\.', text) is not None and 'Find' not in text and 'Best: 0' not in text, text[:200])
        await P.ev("App.go('train')"); await P.wait(200)
        sub = await P.ev("Array.from(document.querySelectorAll('.view .menu-row')).find(r => /Coordinates/.test(r.innerText)).querySelector('.s').innerText")
        check('coordinates: the menu row shows the best', sub == 'Your best is 5', sub)
        # board vision: check with nothing picked, then read the reasons
        await P.ev("App.go('train', { mode: 'vision' })")
        await P.until("() => !!Array.from(document.querySelectorAll('.view button')).find(b => b.innerText.trim() === 'Check')", 20000)
        await P.pg.locator('.view button', has_text='Check').click(); await P.wait(300)
        why = await P.ev("Array.from(document.querySelectorAll('.why-list li')).map(li => li.innerText.trim())")
        greens = await P.ev("document.querySelector('.view .board').__board.marks.filter(m => m.kind === 'green').length")
        pat = re.compile(r'^The (pawn|knight|bishop|rook|queen) on [a-h][1-8] (has no defender|can be taken by your (pawn|knight|bishop|rook|queen), which is worth less|is attacked (once|twice|\d+ times) and defended only (once|twice|\d+ times)|can be won: the trades on [a-h][1-8] come out in your favor)\.$')
        check('board vision: each winnable piece is named with the reason', why and len(why) == greens and all(pat.match(w) for w in why), why)
        bad = [w for w in why if re.search(r'attacked (once|twice|\d+ times) and defended only \1', w)]
        check('board vision: a reason never says attacked and defended equally', not bad, bad)
        xray = await P.ev("""(() => { const C = TempoCore, p = new C.Pos('r1r3k1/2R2ppp/8/8/8/8/5PPP/2R3K1 w - - 0 1');
          return [p.hangingLoss(C.sqIndex('c8')), Train.winWhy(p, C.sqIndex('c8')), Train.notWhy(p, C.sqIndex('h7')), Train.notWhy(p, C.sqIndex('f7'))]; })()""")
        check('board vision: two rooks lined up count as two attackers', xray[0] >= 100 and xray[1] == 'The rook on c8 is attacked twice and defended only once.', xray)
        check('board vision: says why a picked piece can’t be won', xray[2] == 'The pawn on h7 isn’t attacked.' and xray[3] == 'The pawn on f7 is defended, so taking it doesn’t win anything.', xray)
        # analysis board: a pasted game, a move list, an illegal position
        await P.ev("Train.analysis()"); await P.wait(400)
        rep = await P.ev("Array.from(document.querySelectorAll('.view .controls button')).filter(b => b.hasAttribute('data-repeat')).map(b => b.getAttribute('aria-label'))")
        check('analysis: the step buttons repeat on fast taps', rep == ['Back', 'Forward'], rep)
        await P.pg.fill('#an-fen', '[Event "Test"]\n[White "A"]\n[Black "B"]\n\n1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 *')
        await P.pg.locator('.view button', has_text='Load').click(); await P.wait(400)
        fen = await P.ev("document.querySelector('.view .board').__board.pos.fen()")
        moves = await P.ev("document.querySelector('.tr-moves').innerText")
        check('analysis: a pasted PGN loads', fen.startswith('r1bqkbnr/1ppp1ppp/p1n5/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R w') and '3. Bb5 a6' in moves, [fen, moves])
        await P.pg.fill('#an-fen', 'd4 d5 c4 e6')
        await P.pg.locator('.view button', has_text='Load').click(); await P.wait(400)
        fen = await P.ev("document.querySelector('.view .board').__board.pos.fen()")
        check('analysis: a plain move list loads', fen.startswith('rnbqkbnr/ppp2ppp/4p3/3p4/2PP4/8/PP2PPPP/RNBQKBNR w'), fen)
        await P.pg.fill('#an-fen', 'e4 e5 Nf3 Nc6 Qxf7')
        await P.pg.locator('.view button', has_text='Load').click(); await P.wait(400)
        msg = await P.panel()
        n = await P.ev("document.querySelectorAll('.tr-moves span').length")
        check('analysis: a game with an illegal move loads up to it and says so', 'Loaded the moves before 3. Qxf7, which isn’t legal there.' in msg and n == 4, [msg[-200:], n])
        before = await P.ev("document.querySelector('.view .board').__board.pos.fen()")
        await P.pg.fill('#an-fen', '8/8/8/8/8/8/8/Kk6 w - - 0 1')
        await P.pg.locator('.view button', has_text='Load').click(); await P.wait(300)
        msg = await P.panel()
        after = await P.ev("document.querySelector('.view .board').__board.pos.fen()")
        check('analysis: an impossible position is refused with a reason', 'That FEN isn’t valid: the kings are next to each other.' in msg and after == before, msg[-200:])
        await P.pg.fill('#an-fen', 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP w KQkq - 0 1')
        await P.pg.locator('.view button', has_text='Load').click(); await P.wait(300)
        msg = await P.panel()
        check('analysis: a malformed FEN gets a plain reason', 'That FEN isn’t valid: it needs 8 ranks' in msg, msg[-200:])
        await P.pg.locator('.view .controls button', has_text='Reset').click()
        await P.until("() => /^[+\\u2212#].*: /.test((document.querySelector('.tr-eval') || {}).innerText || '')", 30000)
        ev = await P.ev("document.querySelector('.tr-eval').innerText")
        arrows = await P.ev("[document.querySelectorAll('.view .b-arrows .arrow.green').length, document.querySelectorAll('.view .b-arrows .arrow.blue').length]")
        check('analysis: the score comes with plain words, and the best move is a green arrow', re.search(r': (The position is about equal|(White|Black) (is slightly better|is ahead by about|is winning|can force))', ev) is not None and arrows == [1, 0], [ev, arrows])
        words = await P.ev("[Train.evalWords(100, null), Train.evalWords(-20, null), Train.evalWords(null, -3), Train.evalWords(900, null)]")
        check('analysis: score words', words == ['White is ahead by about a pawn.', 'The position is about equal.', 'Black can force checkmate in 3 moves.', 'White is winning.'], words)
        check('no page errors (trainers)', not P.errors, P.errors)


# ---------------- house style on the practice screens ----------------
async def t_style(b):
    for scheme in ['light', 'dark']:
        async with Page(b, PHONE, scheme) as P:
            bad = []
            for js in ["App.go('puzzles')", "App.go('train')", "App.go('train', { mode: 'coords' })", "App.go('train', { mode: 'vision' })", "Train.analysis()", "Puzzles.themed('pin')"]:
                await P.ev(js); await P.wait(1200)
                t = await P.ev("document.querySelector('.view').innerText")
                for ch, name in [('·', 'middle dot'), ('—', 'em dash'), ('!', 'exclamation mark'), ("'", 'straight apostrophe')]:
                    if ch in t: bad.append((js, name))
                over = await P.ev("document.documentElement.scrollWidth > innerWidth + 1")
                if over: bad.append((js, 'sideways scroll'))
                caps = await P.ev("Array.from(document.querySelectorAll('.view *')).filter(e => getComputedStyle(e).textTransform === 'uppercase' && e.innerText.trim()).length")
                if caps: bad.append((js, 'all-caps labels'))
            check('house style (%s): no dots, dashes, exclamations, straight quotes, caps or sideways scroll' % scheme, not bad, bad)
            check('no page errors (style %s)' % scheme, not P.errors, P.errors)


# ---------------- the phone's Back button and the tab bar ask before ending a run, like the on-screen back link ----------------
async def t_back_guard(b):
    async with Page(b) as P:  # laptop size: during a run the phone's tab bar is hidden, the sidebar isn't
        await P.only_puzzles(MATE1)
        await P.ev("App.go('puzzles')"); await P.wait(200)
        await P.pg.locator('.menu-row', has_text='Streak').first.click(); await P.movable()
        await P.solve_current(); await P.wait(1200); await P.movable()
        sheet_text = "(document.querySelector('.sheet') || {}).innerText || ''"
        on_run = "App.name === 'puzzles' && !!document.querySelector('.view .board')"
        await P.pg.go_back(); await P.wait(600)
        s1 = await P.ev(sheet_text)
        await P.pg.locator('.sheet button', has_text='Cancel').click(); await P.wait(300)
        still1 = await P.ev(on_run)
        await P.pg.locator('.side .nav-item', has_text='Home').click(); await P.wait(500)
        s2 = await P.ev(sheet_text)
        await P.pg.locator('.sheet button', has_text='Cancel').click(); await P.wait(300)
        still2 = await P.ev(on_run)
        await P.pg.go_back(); await P.wait(600)
        await P.pg.locator('.sheet button', has_text='End run').click(); await P.wait(900)
        left = await P.ev("App.name === 'puzzles' && !!document.querySelector('.view .menu-list')")
        check('leaving a run: Back and the sidebar ask first, Cancel stays, End run leaves',
              'End this run?' in s1 and still1 and 'End this run?' in s2 and still2 and left,
              {'back': s1[:60], 'still1': still1, 'tab': s2[:60], 'still2': still2, 'left': left})
        check('no page errors (back guard)', not P.errors, P.errors)


TESTS = [('race', t_rush_race), ('daily', t_daily), ('promo', t_promotion), ('mistakes', t_mistakes), ('strikes', t_rush_strikes),
         ('hints', t_hints), ('leaving', t_leaving), ('backguard', t_back_guard), ('teaching', t_teaching), ('menus', t_menus), ('trainers', t_trainers), ('style', t_style)]

async def main():
    which = sys.argv[1:]
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=CHROME, args=['--no-sandbox'])
        for name, fn in TESTS:
            if which and name not in which: continue
            t0 = time.time()
            try:
                await fn(b)
            except Exception as e:
                check(name + ' ran without a harness error', False, repr(e)[:500])
            print('  (%s took %.0fs)' % (name, time.time() - t0), flush=True)
        await b.close()
    failed = [r for r in RESULTS if not r[1]]
    print('\n%d checks, %d failed' % (len(RESULTS), len(failed)))
    sys.exit(1 if failed else 0)

asyncio.run(main())
