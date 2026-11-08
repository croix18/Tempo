# The games you added are reviewed in the background: on any screen and while you play, without slowing a character
# down. The screen you're on always gets the engine first; leaving the reviews' page doesn't stop them (Stop does); a
# note says when they're done, after the game you're in; and where workers are blocked they wait while you're away.
# Usage: python3 build/bg_review_test.py
import asyncio, os, statistics, sys
from playwright.async_api import async_playwright
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from testutil import ROOT
TEMPO_URL = os.environ.get('TEMPO_URL') or 'file://' + ROOT + '/dist/Tempo.html'
CHROME = os.environ.get('CHROME') or ('/usr/bin/google-chrome' if os.path.exists('/usr/bin/google-chrome') else None)

FAILS = []; COUNT = [0]
def check(name, ok, info=''):
    COUNT[0] += 1
    print(('PASS ' if ok else 'FAIL ') + name + ('' if ok else '  :: ' + str(info)[:400]))
    if not ok: FAILS.append(name)

def cc(white, black, result, date, start, end, welo, belo, term, link, moves, tc='600'):
    return '\n'.join([
        '[Event "Live Chess"]', '[Site "Chess.com"]', '[Date "%s"]' % date, '[Round "-"]', '[White "%s"]' % white, '[Black "%s"]' % black,
        '[Result "%s"]' % result, '[Timezone "UTC"]', '[UTCDate "%s"]' % date, '[UTCTime "%s"]' % start,
        '[WhiteElo "%s"]' % welo, '[BlackElo "%s"]' % belo, '[TimeControl "%s"]' % tc, '[Termination "%s"]' % term,
        '[EndDate "%s"]' % date, '[EndTime "%s"]' % end, '[Link "%s"]' % link, '', moves, ''])

G1 = cc('Croix181', 'tjtj253', '1-0', '2026.11.05', '18:02:11', '18:05:40', '612', '598', 'Croix181 won by checkmate', 'https://www.chess.com/game/live/111111111',
        '1. e4 e5 2. Bc4 Nc6 3. Qh5 Nf6 4. Qxf7# 1-0')
G2 = cc('rookie_77', 'Croix181', '1-0', '2026.11.06', '19:10:00', '19:14:30', '640', '608', 'rookie_77 won by checkmate', 'https://www.chess.com/game/live/222222222',
        '1. e4 e5 2. Nf3 d6 3. Bc4 Bg4 4. Nc3 g6 5. Nxe5 Bxd1 6. Bxf7+ Ke7 7. Nd5# 1-0')
G3 = cc('Croix181', 'qgd_fan', '0-1', '2026.11.07', '20:00:00', '20:09:00', '604', '615', 'qgd_fan won by resignation', 'https://www.chess.com/game/live/333333333',
        '1. d4 d5 2. c4 e6 3. Nc3 Nf6 4. Bg5 Nbd7 5. cxd5 exd5 6. Nxd5 Nxd5 7. Bxd8 Bb4+ 8. Qd2 Bxd2+ 9. Kxd2 Kxd8 0-1')
G4 = cc('Croix181', 'blitzer', '1/2-1/2', '2026.11.08', '09:00:00', '09:03:00', '598', '601', 'Game drawn by repetition', 'https://www.chess.com/game/live/444444444',
        '1. e4 e5 2. Nf3 Nc6 3. Ng1 Nb8 4. Nf3 Nc6 5. Ng1 Nb8 1/2-1/2', tc='180+2')
G5 = cc('Croix181', 'hanger', '1-0', '2026.11.08', '10:00:00', '10:04:00', '600', '590', 'hanger resigned', 'https://www.chess.com/game/live/555555555',
        '1. e4 e5 2. Nf3 Qf6 3. Nc3 Bc5 4. Nd5 Qd6 5. d4 exd4 6. Bf4 1-0')
MIDDLE = 'r1bq1rk1/pp2bppp/2n1pn2/3p4/2PP4/2N1PN2/PP3PPP/R2QKB1R w KQ - 0 9'
NO_WORKERS = "window.Worker = function () { throw new DOMException('Workers are blocked here.', 'SecurityError'); };"
# every 5 ms: the background never runs (unstopped) while a character thinks or a screen's search waits
SAMPLER = """() => { window.__viol = []; window.__samples = 0; clearInterval(window.__sampT);
  window.__sampT = setInterval(() => { const s = Engines._bg(); window.__samples++;
    if ((s.fgBusy > 0 || s.fgQueued > 0) && s.running && !s.yielding) window.__viol.push(JSON.stringify(s)); }, 5); }"""

async def fresh(b, init=None):
    # bypass_csp: the site's copy forbids eval, which these checks' waits use (run against it with TEMPO_URL)
    ctx = await b.new_context(viewport={'width': 1200, 'height': 900}, bypass_csp=True)
    pg = await ctx.new_page()
    errs = []
    pg.on('pageerror', lambda e: errs.append('pageerror: ' + str(e)))
    pg.on('console', lambda m: errs.append(m.type + ': ' + m.text[:200]) if m.type == 'error' and 'Failed to load resource' not in m.text and 'Workers are blocked' not in m.text else None)
    if init: await pg.add_init_script(init)
    await pg.goto(TEMPO_URL)
    await pg.wait_for_function("window.App && (Engines.status === 'ready' || Engines.status === 'failed')", timeout=90000)
    return pg, errs

async def until(pg, js, t):
    for _ in range(int(t * 4)):
        if await pg.evaluate(js): return True
        await pg.wait_for_timeout(250)
    return False

async def click_sq(pg, sq):
    o = await pg.evaluate("document.querySelector('.board').__board.orient")
    box = await pg.locator('.board').first.bounding_box()
    f = ord(sq[0]) - 97; r = int(sq[1]) - 1
    x = (f if o == 'w' else 7 - f) + 0.5; y = (7 - r if o == 'w' else r) + 0.5
    await pg.mouse.click(box['x'] + box['width'] * x / 8, box['y'] + box['height'] * y / 8)

async def my_move(pg):
    """your move, when it's your turn: a quick look on the page itself, so the engines' queue sees only the game's own searches"""
    cur = await pg.evaluate("Store.state.current ? { moves: Store.state.current.moves, color: Store.state.current.color, result: Store.state.current.result } : null")
    if not cur or cur['result']: return None
    side = 'w' if len(cur['moves']) % 2 == 0 else 'b'
    if side != cur['color']: return False
    best = await pg.evaluate("(mv) => TempoEngine.handle({ cmd: 'analyse', fen: TempoCore.START_FEN, moves: mv, depth: 3, movetime: 0 }).best", cur['moves'])
    if not best: return None
    n = len(cur['moves'])
    await click_sq(pg, best[:2]); await pg.wait_for_timeout(80); await click_sq(pg, best[2:4])
    if len(best) == 5:
        await pg.wait_for_timeout(200)
        q = pg.locator('.promo-btn[aria-label="Queen"]')
        if await q.count(): await q.click()
    await until(pg, "Store.state.current ? Store.state.current.moves.length > %d : true" % n, 4)
    return True

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=CHROME, args=['--no-sandbox'])
        pg, errs = await fresh(b)
        strong = await pg.evaluate("Engines.strong")
        check('Stockfish runs here (the build these checks are about)', strong, await pg.evaluate("Engines.status"))

        # ---------- the engines: the screen first, the background after ----------
        a = await pg.evaluate("""async (FEN) => {
          const out = {}, wait = ms => new Promise(r => setTimeout(r, ms));
          const t0 = performance.now();
          const bg = Engines.analyse({ fen: FEN, movetime: 2500, depth: 40, bg: true }).then(r => ({ ms: performance.now() - t0, depth: r.lines[0] && r.lines[0].depth, cancelled: !!r.cancelled }));
          await wait(400);
          out.bgRan = Engines._bg().running;
          const t1 = performance.now();
          await Engines.analyse({ fen: FEN, movetime: 300, depth: 30 });
          out.fgMs = performance.now() - t1;
          Engines.stopAll();
          out.bg = await bg;
          const bg2 = Engines.analyse({ fen: FEN, movetime: 2500, depth: 40, bg: true });
          await wait(500);
          const t2 = performance.now(); Engines.stopBackground(); const r2 = await bg2;
          out.stop = { ms: performance.now() - t2, cancelled: !!r2.cancelled };
          return out;
        }""", MIDDLE)
        check('a screen’s search goes first: it takes no longer than its own time while a long background search was running', a['bgRan'] and a['fgMs'] < 300 + 150, a)
        check('the background search then runs again and finishes in full, and leaving a screen doesn’t stop it', not a['bg']['cancelled'] and (a['bg']['depth'] or 0) >= 15, a['bg'])
        check('stopping the background stops its search at once', a['stop']['cancelled'] and a['stop']['ms'] < 300, a['stop'])

        # a character's move takes as long with the background busy as without it: on the built-in engine (Gru), and on Stockfish (Batman)
        t = await pg.evaluate("""async (FEN) => {
          const wait = ms => new Promise(r => setTimeout(r, ms));
          const gru = TempoBots.find('gru'), batman = TempoBots.find('batman');
          const spots = [['e2e4', 'e7e5', 'g1f3'], ['d2d4', 'd7d5', 'c2c4', 'e7e6'], ['e2e4', 'c7c5', 'g1f3', 'd7d6', 'd2d4']];
          const gruMs = async (m) => { const t = performance.now(); await Engines.tempo({ cmd: 'bot', fen: TempoCore.START_FEN, moves: m, cfg: gru.cfg, seed: 7, ctx: { last: null } }); return performance.now() - t; };
          const batMs = async () => { const t = performance.now(); await Engines.botDecide(batman, { fen: FEN, moves: [], sans: [] }, {}); return performance.now() - t; };
          const busy = async (fn) => {
            const bg = Engines.analyse({ fen: FEN, movetime: 4000, depth: 40, bg: true });
            await wait(350);
            const was = Engines._bg().running, ms = await fn(), after = Engines._bg();
            Engines.stopBackground(); await bg;
            return { ms, was, after };
          };
          const out = { gru: [], gruBg: [], bat: [], batBg: [] };
          for (const m of spots) out.gru.push(await gruMs(m));
          for (const m of spots) out.gruBg.push(await busy(() => gruMs(m)));
          for (let i = 0; i < 2; i++) out.bat.push(await batMs());
          for (let i = 0; i < 2; i++) out.batBg.push(await busy(batMs));
          out.overlap = Engines._bg().overlap;
          return out;
        }""", MIDDLE)
        g0 = statistics.median(t['gru']); g1 = statistics.median([x['ms'] for x in t['gruBg']])
        s0 = statistics.median(t['bat']); s1 = statistics.median([x['ms'] for x in t['batBg']])
        check('Gru (the built-in engine) thinks as quickly with the background busy as without it', all(x['was'] for x in t['gruBg']) and g1 <= g0 * 1.3 + 60, [round(g0), round(g1), t['gruBg']])
        check('Batman (Stockfish) thinks as quickly with the background busy as without it', all(x['was'] for x in t['batBg']) and s1 <= s0 * 1.15 + 80, [round(s0), round(s1)])
        check('a background search never started while a character was thinking', t['overlap'] == 0, t['overlap'])

        # ---------- add five games: they review one after another, and you don't have to stay ----------
        # two of them long (about 70 moves each, with some careless ones), so the reviews are still going well into your game
        longs = []
        for k, seed in enumerate([11, 23]):
            sans = await pg.evaluate("""(seed) => {
              let s = seed; const rnd = () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648;
              const C = TempoCore, p = new C.Pos(C.START_FEN), out = [];
              for (let i = 0; i < 70 && !p.status().over; i++) {
                const legal = p.legalMoves(); let m = null;
                if (rnd() < 0.8) m = p.parseMove(TempoEngine.handle({ cmd: 'analyse', fen: p.fen(), moves: [], depth: 2, movetime: 0 }).best);
                if (!m) m = legal[Math.floor(rnd() * legal.length)];
                out.push(p.san(m)); p.make(m);
              }
              return out;
            }""", seed)
            text = ' '.join(('%d. ' % (i // 2 + 1) if i % 2 == 0 else '') + s for i, s in enumerate(sans)) + ' 1-0'
            longs.append(cc('Croix181', 'longhaul%d' % k, '1-0', '2026.11.0%d' % (2 + k), '12:00:00', '12:40:00', '610', '605', 'Croix181 won on time', 'https://www.chess.com/game/live/90%d' % k, text))
        await pg.evaluate("App.go('review')"); await pg.wait_for_timeout(300)
        await pg.locator('#cc-name').fill('Croix181')
        await pg.locator('#pgn-in').fill('\n'.join([G1, G2, G3] + longs))
        await pg.locator('#pgn-go').click(); await pg.wait_for_timeout(500)
        await pg.locator('.sheet button', has_text='Add all 5').click(); await pg.wait_for_timeout(600)
        head = await pg.locator('.rv-batch-head').inner_text()
        page = await pg.locator('.rv-batch').inner_text()
        check('Add all starts the reviews, one after another', 'Reviewing game 1 of 5' in head, head)
        check('the page says you don’t have to wait there, and offers a game and a way to stop',
              'You don’t have to wait here' in page and 'won’t slow your game down' in page and await pg.locator('.rv-batch button', has_text='Play a game').count() == 1
              and await pg.locator('.rv-batch button', has_text='Stop reviewing').count() == 1, page[:400])
        check('the page doesn’t hide the menus, so you can go anywhere', not await pg.evaluate("document.body.classList.contains('focus')"))
        side = await pg.locator('#bg-note').inner_text() if await pg.locator('#bg-note').is_visible() else ''
        check('the sidebar shows the reviews going', side.startswith('Reviewing your games') and 'Game 1 of 5' in side, side)
        ids = await pg.evaluate("Review._run().ids")

        await pg.evaluate("App.go('home')"); await pg.wait_for_timeout(500)
        home = await pg.evaluate("document.querySelector('.view').innerText")
        check('leaving the page keeps them going, and Home says so', await pg.evaluate("!!Review.reviewing()") and 'Reviewing the games you added' in home and 'It keeps going while you play' in home, home[:300])
        await pg.evaluate("App.go('review')"); await pg.wait_for_timeout(400)
        ban = await pg.locator('.rv-waiting').inner_text()
        check('Your games says so too, with a way to look', ban.startswith('Reviewing the games you added') and 'See how it’s going' in ban, ban)

        # ---------- play while they review ----------
        await pg.evaluate("() => { const s = Store.state.settings; Object.assign(s, { unlockAll: true, coach: false, coachAsk: false, hanging: false, clock: 'none', color: 'w' }); Store.touch('settings'); }")
        await pg.evaluate(SAMPLER)
        await pg.evaluate("App.go('play')"); await pg.wait_for_timeout(400)
        await pg.evaluate("Play.setup(TempoBots.find('gru'))"); await pg.wait_for_timeout(400)
        await pg.locator('.sheet button', has_text='Start game').click(); await pg.wait_for_timeout(1500)
        going = await pg.evaluate("Review.reviewing()")
        check('the reviews are still going when your game starts', going is not None, going)
        toast_in_game = []
        moves_made = 0
        for i in range(120):
            run = await pg.evaluate("Review._run()")
            if not run['running']: break
            r = await my_move(pg)
            if r is None:   # the game ended: another one, once its result has been shown
                await pg.wait_for_timeout(2500)
                await pg.evaluate("App.closeSheet()"); await pg.wait_for_timeout(600)
                await pg.evaluate("Play.setup(TempoBots.find('gru'))"); await pg.wait_for_timeout(400)
                try: await pg.locator('.sheet button', has_text='Start game').click(timeout=5000)
                except Exception: pass
                await pg.wait_for_timeout(1500)
                continue
            if r: moves_made += 1
            # you think for a moment; a note about the reviews mustn't appear in the middle of your game
            for _ in range(10):
                tx = await pg.evaluate("(document.querySelector('#layer .toast') || {}).textContent || ''")
                if 'reviewed' in tx and await pg.evaluate("!!(Store.state.current && !Store.state.current.result)"): toast_in_game.append(tx)
                await pg.wait_for_timeout(250)
        # still in the game a little after they finished: still no note
        for _ in range(8):
            tx = await pg.evaluate("(document.querySelector('#layer .toast') || {}).textContent || ''")
            if 'reviewed' in tx and await pg.evaluate("!!(Store.state.current && !Store.state.current.result)"): toast_in_game.append(tx)
            await pg.wait_for_timeout(250)
        run = await pg.evaluate("Review._run()")
        viol = await pg.evaluate("window.__viol.slice(0, 3)"); samples = await pg.evaluate("window.__samples")
        gru_moves = await pg.evaluate("Engines.log().filter(x => x.bot === 'gru' && x.via === 'tempo').length")
        check('the reviews finish while you play', not run['running'] and run['done'] == 5 and moves_made >= 8, [run, moves_made])
        check('while you played, the background never ran while Gru was thinking or the game needed the engine', not viol and samples > 500 and gru_moves >= 2, [viol, samples, gru_moves])
        check('the note that they’re done waits until you’re out of the game', not toast_in_game, toast_in_game[:2])
        in_game = await pg.evaluate("!!(Store.state.current && !Store.state.current.result)")
        await pg.evaluate("App.go('home')")
        got = await until(pg, "/The 5 games you added are reviewed/.test((document.querySelector('#layer .toast') || {}).textContent || '')", 4)
        tx = await pg.evaluate("(document.querySelector('#layer .toast') || {}).textContent || ''")
        check('then it says they’re done, and how many mistakes are in your practice', in_game and got and 'in your practice now' in tx, [in_game, tx])

        gl = await pg.evaluate("(ids) => ids.map(id => { const g = Store.state.games.list.find(x => x.id === id); return g && [g.opp, g.reviewed, Math.round(g.acc)]; })", ids)
        mids = await pg.evaluate("Store.state.mistakes.items.filter(x => !x.gone).map(x => x.id)")
        check('every game is saved reviewed, with its accuracy', all(x and x[1] for x in gl), gl)
        mine = await pg.evaluate("['rookie_77', 'qgd_fan'].map(o => Store.state.games.list.find(g => g.opp === o).id)")
        check('your mistakes from them are in the practice queue', all(any(m.startswith('g' + i + '-') for m in mids) for i in mine), [mine, mids[:6]])
        home = await pg.evaluate("document.querySelector('.view').innerText")
        check('Home no longer offers them', 'you added' not in home, home[:300])
        side = await pg.locator('#bg-note').inner_text() if await pg.locator('#bg-note').is_visible() else ''
        check('the sidebar says they’re done until you look', side.startswith('Your 5 games are reviewed') and 'See how they went' in side, side)
        await pg.locator('#bg-note').click(); await pg.wait_for_timeout(500)
        head = await pg.locator('.rv-batch-head').inner_text()
        check('which shows how they went: all reviewed, and what’s in your practice', head.startswith('All 5 games reviewed.') and 'in your practice now' in head and await pg.locator('.rv-batch .pattern').count() <= 1, head)
        check('and then the sidebar line goes', not await pg.locator('#bg-note').is_visible())
        await pg.evaluate("App.go('home')"); await pg.wait_for_timeout(300)

        # ---------- Stop, and starting again ----------
        await pg.evaluate("""(pgn) => { const t = Imports._records([pgn], { name: 'Croix181' }); const r = Store.addGames(t.recs); Review.openBatch(r.added.map(g => g.id)); }""", G4)
        await pg.wait_for_timeout(500)
        await pg.locator('.rv-batch button', has_text='Stop reviewing').click(); await pg.wait_for_timeout(500)
        head = await pg.locator('.rv-batch-head').inner_text()
        g4 = await pg.evaluate("Store.state.games.list[0]")
        check('Stop stops them: the game waits in Your games, and the page offers to review it', head.startswith('Stopped. The game is waiting in Your games.') and not g4.get('reviewed')
              and await pg.locator('.rv-batch button', has_text='Review it').count() == 1 and not await pg.evaluate("!!Review.reviewing()") and await pg.evaluate("Engines._bg().queued + (Engines._bg().running ? 1 : 0)") == 0, [head, g4.get('reviewed')])
        await pg.evaluate("App.go('home')"); await pg.wait_for_timeout(400)
        home = await pg.evaluate("document.querySelector('.view').innerText")
        check('Home offers it again, and says it reviews while you play', 'Review 1 game you added' in home and 'Tempo reviews it while you play' in home, home[:300])
        await pg.locator('.menu-row', has_text='Review 1 game you added').click(); await pg.wait_for_timeout(400)
        await pg.evaluate("App.go('learn')")
        ok = await until(pg, "Store.state.games.list[0].reviewed", 120)
        check('started from Home, it finishes while you’re somewhere else', ok)

        # ---------- leaving a game's own review halfway: the background finishes it ----------
        await pg.evaluate("App.go('review')"); await pg.wait_for_timeout(300)
        await pg.locator('#pgn-in').fill(G5)
        await pg.locator('#pgn-go').click(); await pg.wait_for_timeout(700)
        opened = await pg.evaluate("!!Review._state() && !Review._state().done")
        await pg.evaluate("App.go('play')"); await pg.wait_for_timeout(300)
        tx = await pg.evaluate("(document.querySelector('#layer .toast') || {}).textContent || ''")
        check('leaving an added game’s review before it’s done hands it to the background, and says so', opened and 'finish this review in the background' in tx and await pg.evaluate("!!Review.reviewing()"), [opened, tx])
        ok = await until(pg, "Store.state.games.list.find(g => g.opp === 'hanger').reviewed", 120)
        check('and it gets finished', ok)
        await pg.evaluate("clearInterval(window.__sampT)")
        check('no page errors (reviewing in the background)', not errs, errs[:3])
        await pg.close()

        # ---------- where workers are blocked, the reviews wait while you're away from Review ----------
        pg, errs = await fresh(b, NO_WORKERS)
        await pg.evaluate("""(pgn) => { const t = Imports._records([pgn], { name: 'Croix181' }); const r = Store.addGames(t.recs); Review.openBatch(r.added.map(g => g.id)); }""", G1)
        await pg.wait_for_timeout(800)
        note = await pg.locator('.rv-batch-note').inner_text()
        check('with no workers, the page says the reviews pause while you’re away from Review', await pg.evaluate("Engines.inline") and 'pause while you’re away from Review' in note, note)
        await pg.evaluate("App.go('home')"); await pg.wait_for_timeout(1500)
        s1 = await pg.evaluate("[Engines._bg().held, Review._run().at, Review.reviewing() && Review.reviewing().pct]")
        await pg.wait_for_timeout(3000)
        s2 = await pg.evaluate("[Engines._bg().held, Review._run().at, Review.reviewing() && Review.reviewing().pct]")
        check('away from Review they wait, so the page stays responsive', s1[0] and s1 == s2, [s1, s2])
        await pg.evaluate("App.go('review')")
        ok = await until(pg, "!Review.reviewing() && Store.state.games.list[0].reviewed", 150)
        check('back on Review, they carry on and finish', ok and not await pg.evaluate("Engines._bg().held"), await pg.evaluate("Review._run()"))
        check('no page errors (no workers)', not errs, errs[:3])
        await pg.close()
        await b.close()
    print('\n%d checks, %d failed' % (COUNT[0], len(FAILS)))
    sys.exit(1 if FAILS else 0)

asyncio.run(main())
