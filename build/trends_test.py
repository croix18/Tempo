# Trends (Progress's second page): how you play, game after game, from your saved games. Each number on the page is
# worked out again here, independently, from the games themselves; the charts answer hover, tap and the keyboard and open
# a game's review; the filter scopes everything; a real review keeps the numbers Trends needs (and they survive a reload);
# games reviewed before that get them from their saved review; and the page fits a phone.
# The games are synthetic (build/trends_data.js): no real games or students.
# Usage: python3 build/trends_test.py
import asyncio, os, re, sys
from playwright.async_api import async_playwright
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from testutil import ROOT
TEMPO_URL = os.environ.get('TEMPO_URL') or 'file://' + ROOT + '/dist/Tempo.html'
CHROME = os.environ.get('CHROME') or ('/usr/bin/google-chrome' if os.path.exists('/usr/bin/google-chrome') else None)
DATA = open(os.path.join(ROOT, 'build', 'trends_data.js')).read()

FAILS = []; COUNT = [0]
def check(name, ok, info=''):
    COUNT[0] += 1
    print(('PASS ' if ok else 'FAIL ') + name + ('' if ok else '  :: ' + str(info)[:400]))
    if not ok: FAILS.append(name)

# the numbers, worked out again from the stored games (none of Trends' code)
EXPECT = """() => {
  const S = Store.state, C = TempoCore;
  const score = (g) => g.result === '1/2-1/2' ? 0.5 : g.result === '1-0' ? (g.color === 'w' ? 1 : 0) : g.result === '0-1' ? (g.color === 'b' ? 1 : 0) : null;
  const games = S.games.list.filter((g) => score(g) != null).sort((a, b) => a.ts - b.ts);
  const rev = games.filter((g) => g.reviewed && g.acc != null);
  const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const kinds = (g) => { const c = g.counts || {}; return { x: c.blunder || 0, m: (c.mistake || 0) + (c.miss || 0), i: c.inaccuracy || 0 }; };
  const last = (xs, k) => xs.slice(-k);
  const r10 = last(rev, 10), g10 = last(games, 10);
  const wdl = (gs) => gs.reduce((t, g) => { const s = score(g); t[s === 1 ? 'w' : s === 0 ? 'l' : 'd']++; return t; }, { w: 0, d: 0, l: 0 });
  const facts = rev.filter((g) => g.tr && g.tr.ph);
  const ph = {};
  ['o', 'm', 'e'].forEach((k) => { const gs = facts.filter((g) => g.tr.ph[k]); ph[k] = gs.length ? Math.round(mean(gs.map((g) => g.tr.ph[k][0]))) : null; });
  const up = facts.filter((g) => g.tr.hi >= 300), down = facts.filter((g) => g.tr.lo <= -300);
  return {
    n: games.length, rev: rev.length, facts: facts.length,
    acc: Math.round(mean(r10.map((g) => g.acc))), blunders: mean(r10.map((g) => kinds(g).x)).toFixed(1), mistakes: mean(r10.map((g) => kinds(g).m)).toFixed(1),
    score: wdl(g10), all: wdl(games), ph: ph,
    won: [up.filter((g) => score(g) === 1).length, up.length], saved: [down.filter((g) => score(g) !== 0).length, down.length],
    mm: facts.reduce((t, g) => t + g.tr.mm.length, 0),
    white: wdl(games.filter((g) => g.color === 'w')), black: wdl(games.filter((g) => g.color === 'b')),
    bots: games.filter((g) => g.bot).length, added: games.filter((g) => !g.bot && g.src).length,
    lastTitle: Review.gameTitle(rev[rev.length - 1]), lastAcc: Math.round(rev[rev.length - 1].acc), lastId: rev[rev.length - 1].id,
    prevTitle: Review.gameTitle(rev[rev.length - 2]), prevId: rev[rev.length - 2].id,
    withRv: rev.filter((g) => g.rv).length, withTr: rev.filter((g) => g.tr).length, rvNoTr: rev.filter((g) => g.rv && !g.tr).length
  };
}"""
# a game's numbers, worked out again from its saved review: the phases by counting pieces, the losses by winning chances
FACTS_AGAIN = """(id) => {
  const g = Store.state.games.list.find((x) => x.id === id), C = TempoCore, me = g.color === 'w' ? 1 : -1;
  const win = (v) => v >= 20000 ? 100 : v <= -20000 ? 0 : v > 9000 ? 100 : v < -9000 ? 0 : 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * v)) - 1);
  const parsed = C.parsePgn(g.pgn), r = C.replay(C.START_FEN, parsed.sans), moves = r.moves.map(C.uci);
  const pos = new C.Pos(C.START_FEN), acc = { o: [], m: [], e: [] }, err = { o: 0, m: 0, e: 0 }, mm = [];
  let hi = -2000, lo = 2000;
  const blend = (xs) => { const m = xs.reduce((a, b) => a + b, 0) / xs.length, hm = xs.length / xs.reduce((a, b) => a + 1 / Math.max(b, 5), 0); return (m + hm) / 2; };
  for (let i = 0; i < moves.length; i++) {
    const pieces = pos.fen().split(' ')[0].replace(/[^nbrqNBRQ]/g, '').length;
    const phase = pieces <= 6 ? 'e' : i < 20 ? 'o' : 'm', mover = pos.side, mine = (mover === 1) === (g.color === 'w');
    if (mine) {
      const c = g.rv.cls[i], best = g.rv.best[i] === moves[i];
      const before = mover === 1 ? win(g.rv.ev[i]) : 100 - win(g.rv.ev[i]), after = mover === 1 ? win(g.rv.ev[i + 1]) : 100 - win(g.rv.ev[i + 1]);
      const loss = c === 'K' || best ? 0 : Math.max(0, before - after);
      acc[phase].push(Math.max(0, Math.min(100, 103.1668 * Math.exp(-0.04354 * loss) - 3.1669)));
      if ('MSX'.indexOf(c) >= 0) { err[phase]++; mm.push(Math.floor(i / 2) + 1); }
    }
    pos.make(pos.parseMove(moves[i]));
    const v = g.rv.ev[i + 1], forMe = Math.abs(v) > 9000 ? (v > 0 ? 2000 : -2000) * me : Math.max(-2000, Math.min(2000, Math.round(v * me)));
    hi = Math.max(hi, forMe); lo = Math.min(lo, forMe);
  }
  const one = (k) => acc[k].length ? [Math.round(10 * blend(acc[k])) / 10, acc[k].length, err[k]] : null;
  return { want: { o: one('o'), m: one('m'), e: one('e'), hi: hi, lo: lo, mm: mm }, got: { o: g.tr.ph.o, m: g.tr.ph.m, e: g.tr.ph.e, hi: g.tr.hi, lo: g.tr.lo, mm: g.tr.mm } };
}"""

async def page(b, w=1280, h=900, scheme='light'):
    ctx = await b.new_context(viewport={'width': w, 'height': h}, color_scheme=scheme, has_touch=w < 600)
    pg = await ctx.new_page(); errs = []
    pg.on('pageerror', lambda e: errs.append('pageerror: ' + str(e)))
    pg.on('console', lambda m: errs.append(m.type + ': ' + m.text[:200]) if m.type == 'error' and 'Failed to load resource' not in m.text else None)
    await pg.goto(TEMPO_URL)
    await pg.wait_for_function("window.App && window.Store && Store.state && document.querySelector('.side')", timeout=60000)
    return ctx, pg, errs

async def text(pg, sel):
    return await pg.evaluate("(s) => { const e = document.querySelector(s); return e ? e.innerText : ''; }", sel)

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=CHROME, args=['--no-sandbox'])

        # ---------- a profile with no games: what Trends needs ----------
        ctx, pg, errs = await page(b)
        await pg.evaluate("App.go('progress')"); await pg.wait_for_timeout(300)
        tabs = await pg.evaluate("[...document.querySelectorAll('.progress-tabs button')].map(x => x.textContent + (x.classList.contains('on') ? '*' : ''))")
        check('Progress has two pages, Overview and Trends', tabs == ['Overview*', 'Trends'], tabs)
        await pg.locator('.progress-tabs button', has_text='Trends').click(); await pg.wait_for_timeout(400)
        on = await pg.evaluate("[App.name, (document.querySelector('.side .nav-item.on') || {}).textContent]")
        check('Trends opens, and the sidebar still marks Progress', on[0] == 'trends' and 'Progress' in (on[1] or ''), on)
        body = await text(pg, '.v-trends')
        check('with no games yet it says how to start, with Play and Add your games',
              'Your trends start with your games' in body and await pg.locator('.v-trends button', has_text='Play a game').count() == 1
              and await pg.locator('.v-trends button', has_text='Add your games').count() == 1, body[:300])
        check('no page errors (no games)', not errs, errs[:3])
        await ctx.close()

        # ---------- forty-six games, most reviewed, some long ago ----------
        ctx, pg, errs = await page(b)
        made = await pg.evaluate(DATA, {'seed': 7, 'n': 46})
        before = await pg.evaluate("Store.state.games.list.filter(g => g.reviewed && g.rv && !g.tr).length")
        await pg.evaluate("App.go('trends')"); await pg.wait_for_timeout(1500)
        E = await pg.evaluate(EXPECT)
        check('the games are in: 46, with reviews (some kept whole, some not) and practice items', made['added'] == 46 and E['rev'] > 30 and E['withRv'] < E['rev'] and made['items'] > 20, [made, E['rev'], E['withRv']])
        check('games reviewed before Trends got their numbers from their saved review, when they have one', before == E['withRv'] and E['withTr'] == E['withRv'] and E['rvNoTr'] == 0, [before, E['withRv'], E['withTr']])
        samples = await pg.evaluate("Store.state.games.list.filter(g => g.tr).slice(0, 6).map(g => g.id)")
        bad = []
        for gid in samples:
            r = await pg.evaluate(FACTS_AGAIN, gid)
            if r['want'] != r['got']: bad.append(r)
        check('each game\'s numbers match, worked out again: accuracy and mistakes by phase, best and worst, mistake moves', not bad and len(samples) == 6, bad[:1])
        scope = await text(pg, '.tr-scope')
        check('it says which games it covers', scope.startswith('46 games, %d of them reviewed' % E['rev']), scope)

        # at a glance
        tiles = await pg.evaluate("[...document.querySelectorAll('.tr-stat')].map(t => t.innerText.replace(/\\s+/g, ' '))")
        sc = E['score']
        check('Accuracy: the average of the last 10 reviewed games', tiles[0].startswith('Accuracy %d%%' % E['acc']), [tiles[0], E['acc']])
        check('Blunders and mistakes a game: the last 10 reviewed games', tiles[1].startswith('Blunders a game ' + E['blunders']) and tiles[2].startswith('Mistakes a game ' + E['mistakes']), tiles[1:3])
        check('Score: the last 10 games, with their record', tiles[3].startswith('Score %d%%' % round(100 * (sc['w'] + sc['d'] / 2) / 10)) and '%d–%d–%d' % (sc['w'], sc['d'], sc['l']) in tiles[3], [tiles[3], sc])
        deltas = await pg.evaluate("[...document.querySelectorAll('.tr-glance .tr-delta')].map(d => [d.className, d.textContent])")
        check('each compares with the 10 before, colored by better or worse, in words too', len(deltas) == 4 and all(re.search(r'(Up|Down) .+ from the 10 before|About the same as the 10 before', d[1]) for d in deltas)
              and all(('good' in d[0]) or ('bad' in d[0]) or ('same' in d[0]) for d in deltas), deltas)

        # accuracy, game by game
        dots = await pg.locator('.tr-card[aria-label="Accuracy, game by game"] .tr-dot').count()
        check('the accuracy chart has a dot for every reviewed game and an average line', dots == E['rev'] and await pg.locator('.tr-card[aria-label="Accuracy, game by game"] .tr-line').count() == 1, [dots, E['rev']])
        box = await pg.evaluate("(() => { const d = [...document.querySelectorAll('.tr-card[aria-label=\"Accuracy, game by game\"] .tr-dot')].pop().getBoundingClientRect(); return [d.x + d.width / 2, d.y + d.height / 2]; })()")
        await pg.mouse.move(box[0], box[1]); await pg.wait_for_timeout(150)
        tip = await text(pg, '.tr-card[aria-label="Accuracy, game by game"] .tr-tip')
        check('hovering a game shows which it was and its accuracy', E['lastTitle'] in tip and '%d%%' % E['lastAcc'] in tip and 'accuracy' in tip, [tip, E['lastTitle']])
        await pg.mouse.click(box[0], box[1]); await pg.wait_for_timeout(500)
        st = await pg.evaluate("[App.name, history.state && history.state.p && history.state.p.gameId]")
        check('clicking it opens that game\'s review', st == ['review', E['lastId']], st)
        await pg.go_back(); await pg.wait_for_timeout(800)
        check('Back returns to Trends', await pg.evaluate("App.name") == 'trends')
        await pg.focus('.tr-card[aria-label="Accuracy, game by game"] .tr-plot'); await pg.wait_for_timeout(100)
        await pg.keyboard.press('ArrowLeft'); await pg.wait_for_timeout(100)
        tip = await text(pg, '.tr-card[aria-label="Accuracy, game by game"] .tr-tip')
        await pg.keyboard.press('Enter'); await pg.wait_for_timeout(500)
        st = await pg.evaluate("[App.name, history.state && history.state.p && history.state.p.gameId]")
        check('the keyboard works it too: the arrows move between games, Enter opens one', E['prevTitle'] in tip and st == ['review', E['prevId']], [tip[:80], st])
        await pg.go_back(); await pg.wait_for_timeout(800)

        # mistakes, game by game
        cols = await pg.locator('.tr-card[aria-label="Mistakes, game by game"] .tr-col').count()
        want = await pg.evaluate("(() => { const g = Store.state.games.list.filter(g => g.reviewed && g.acc != null).sort((a, b) => a.ts - b.ts).pop(); const c = g.counts || {}; return [c.blunder || 0, (c.mistake || 0) + (c.miss || 0), c.inaccuracy || 0]; })()")
        await pg.hover('.tr-card[aria-label="Mistakes, game by game"] .tr-plot', position={'x': 0, 'y': 0})
        r = await pg.evaluate("(() => { const p = document.querySelector('.tr-card[aria-label=\"Mistakes, game by game\"] svg').getBoundingClientRect(); return [p.right - 16, p.top + p.height / 2]; })()")
        await pg.mouse.move(r[0], r[1]); await pg.wait_for_timeout(150)
        tip = await text(pg, '.tr-card[aria-label="Mistakes, game by game"] .tr-tip')
        words = [('%d blunder' % want[0]) if want[0] else '', ('%d mistake' % want[1]) if want[1] else '', ('%d inaccurac' % want[2]) if want[2] else '']
        flat = re.sub(r'\s+', ' ', tip)
        check('the mistakes chart has a column for each of the last 30 reviewed games, and says what each holds', cols == min(30, E['rev']) and all(w in flat for w in words if w), [cols, flat, want])
        rows = await pg.evaluate("document.querySelectorAll('.tr-card[aria-label=\"Mistakes, game by game\"] .tr-table tbody tr').length")
        check('its numbers are in a table too, one row per reviewed game', rows == E['rev'], rows)

        # where games go wrong
        phases = await pg.evaluate("[...document.querySelectorAll('.tr-phase')].map(r => r.querySelector('.row b.num').textContent)")
        want_ph = [('%d%%' % E['ph'][k]) if E['ph'][k] is not None else '—' for k in 'ome']
        check('accuracy in the opening, middlegame and endgame, across the reviewed games that reached each', phases == want_ph, [phases, want_ph])
        hist_total = await pg.evaluate("[...document.querySelectorAll('.tr-hist .tr-table tbody tr')].reduce((t, r) => t + +r.children[1].textContent, 0)")
        cap = await pg.evaluate("(document.querySelector('.tr-hist .tr-cap') || {}).textContent")
        check('when the serious mistakes come: every one counted once, the busiest stretch labeled', hist_total == E['mm'] and cap and cap.endswith('%'), [hist_total, E['mm'], cap])

        # winning and saving
        close = await text(pg, '.tr-close-grid')
        check('winning positions won and losing positions saved, counted from the games', ('%d of %d' % tuple(E['won'])) in close and ('%d of %d' % tuple(E['saved'])) in close, [close[:200], E['won'], E['saved']])

        # results
        res = await text(pg, '.tr-card[aria-label="Results"]')
        a = E['all']
        def plural(n, one, many=None): return '%d %s' % (n, one if n == 1 else (many or one + 's'))
        check('results: wins, draws and losses, and the share of the points', ', '.join([plural(a['w'], 'win'), plural(a['d'], 'draw'), plural(a['l'], 'loss', 'losses')]) in res, [res[:200], a])
        wrow = '%d–%d–%d' % (E['white']['w'], E['white']['d'], E['white']['l']); brow = '%d–%d–%d' % (E['black']['w'], E['black']['d'], E['black']['l'])
        check('as White and as Black', wrow in res and brow in res, [wrow, brow])
        ends = await pg.evaluate("[...document.querySelectorAll('.tr-end-list b')].reduce((t, b) => t + +b.textContent, 0)")
        check('how the games end: every game in one of them', ends == E['n'], [ends, E['n']])

        # mistake themes
        themes = await pg.evaluate("[...document.querySelectorAll('.tr-theme')].map(t => t.innerText.replace(/\\s+/g, ' '))")
        want_th = await pg.evaluate("""(() => { const gs = Store.state.games.list.filter(g => g.reviewed && g.acc != null && g.tr && g.tr.ph && g.tr.tp).sort((a, b) => a.ts - b.ts);
          const k = Math.min(10, Math.floor(gs.length / 2)), now = gs.slice(-k), before = gs.slice(-2 * k, -k);
          return Object.keys(Mistakes.SAYS).map(t => [Mistakes.SAYS[t], now.filter(g => g.tr.tp[t]).length, before.filter(g => g.tr.tp[t]).length]).filter(x => x[1] || x[2]); })()""")
        okt = all(any(t.startswith('You ' + x[0]) and ('In %d of your last' % x[1]) in t and (('rom %d' % x[2]) in t or ('Same as' in t and x[1] == x[2])) for t in themes) for x in want_th)
        check('the mistakes that keep coming back: in how many of the last games, against the games before', okt and len(themes) == len(want_th), [themes[:2], want_th[:2]])

        # the filter scopes everything
        await pg.locator('.tr-filters button', has_text='The characters').click(); await pg.wait_for_timeout(500)
        s1 = await text(pg, '.tr-scope')
        await pg.locator('.tr-filters button', has_text='Chess.com').click(); await pg.wait_for_timeout(500)
        s2 = await text(pg, '.tr-scope')
        await pg.locator('.tr-filters button', has_text='All games').click(); await pg.locator('.tr-filters button', has_text='Last 20').click(); await pg.wait_for_timeout(500)
        s3 = await text(pg, '.tr-scope'); res3 = await text(pg, '.tr-card[aria-label="Results"]')
        check('the filter: the characters\' games, the Chess.com ones, the last 20', s1.startswith('%d games' % E['bots']) and s2.startswith('%d games' % E['added']) and s3.startswith('20 games') and '20 games' in res3, [s1, s2, s3])
        await pg.locator('.tr-filters button', has_text='All').last.click(); await pg.wait_for_timeout(400)
        check('no page errors (Trends)', not errs, errs[:3])
        await ctx.close()

        # ---------- openings, from three known games ----------
        ctx, pg, errs = await page(b)
        await pg.evaluate("""() => {
          const mk = (id, ts, color, result, sans) => ({ id, ts, color, result, reason: 'resignation', src: 'pgn', opp: 'x' + id, key: 'pgn:' + id,
            pgn: '[White "a"]\\n[Black "b"]\\n[Result "' + result + '"]\\n\\n' + sans + ' ' + result + '\\n' });
          const t = Date.now();
          Store.addGames([mk('o1', t - 3e6, 'w', '1-0', '1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. c3 Nf6'), mk('o2', t - 2e6, 'w', '1/2-1/2', '1. e4 e5 2. Nf3 Nc6 3. Bc4 Nf6 4. d3 Be7'),
            mk('o3', t - 1e6, 'b', '1-0', '1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6')]);
        }""")
        await pg.evaluate("App.go('trends')"); await pg.wait_for_timeout(1500)
        op = await pg.evaluate("[...document.querySelectorAll('.tr-open')].map(b => b.innerText.replace(/\\s+/g, ' '))")
        check('your openings: named from the moves, by color, with games and score', len(op) == 2 and 'As White Italian Game 2 games 75%' in op[0] and 'As Black Sicilian Defense 1 game 0%' in op[1], op)
        await ctx.close()

        # ---------- a real review keeps what Trends needs, and it lasts ----------
        ctx, pg, errs = await page(b)
        await pg.wait_for_function("Engines.status === 'ready' || Engines.status === 'failed'", timeout=90000)
        gid = await pg.evaluate("""() => { const t = Imports._records(['[Event "Live Chess"]\\n[Site "Chess.com"]\\n[White "rookie_77"]\\n[Black "Croix181"]\\n[Result "1-0"]\\n[UTCDate "2026.11.06"]\\n[UTCTime "19:10:00"]\\n[Termination "rookie_77 won by checkmate"]\\n[Link "https://www.chess.com/game/live/222222222"]\\n\\n1. e4 e5 2. Nf3 d6 3. Bc4 Bg4 4. Nc3 g6 5. Nxe5 Bxd1 6. Bxf7+ Ke7 7. Nd5# 1-0\\n'], { name: 'Croix181' });
          const r = Store.addGames(t.recs); Review.openBatch(r.added.map(g => g.id)); return r.added[0].id; }""", )
        ok = await pg.wait_for_function("(id) => { const g = Store.state.games.list.find(x => x.id === id); return g && g.reviewed && g.tr; }", arg=gid, timeout=180000)
        tr = await pg.evaluate("(id) => Store.state.games.list.find(x => x.id === id).tr", gid)
        check('a review keeps Trends\' numbers: accuracy by phase, best and worst, mistake moves and kinds',
              tr['v'] >= 1 and tr['ph']['o'] and tr['ph']['o'][1] >= 1 and tr['lo'] == -2000 and tr['mm'] and sum(tr['tp'].values()) >= 1, tr)
        await pg.wait_for_timeout(1200)  # the save
        await pg.reload(); await pg.wait_for_function("window.App && Store.state", timeout=60000)
        tr2 = await pg.evaluate("(id) => (Store.state.games.list.find(x => x.id === id) || {}).tr", gid)
        check('and they last: the same after a reload', tr2 == tr, [tr2, tr])
        check('no page errors (a real review)', not errs, errs[:3])
        await ctx.close()

        # ---------- a phone ----------
        ctx, pg, errs = await page(b, 390, 844)
        await pg.evaluate(DATA, {'seed': 3, 'n': 30})
        await pg.evaluate("App.go('trends')"); await pg.wait_for_timeout(1200)
        fit = await pg.evaluate("""() => ({ over: document.documentElement.scrollWidth - innerWidth,
          charts: [...document.querySelectorAll('.tr-chart')].map(s => Math.abs(s.viewBox.baseVal.width - s.getBoundingClientRect().width)) })""")
        check('on a phone: nothing runs off the side, and the charts are drawn at their real width (their text stays readable)', fit['over'] <= 0 and fit['charts'] and max(fit['charts']) <= 2, fit)
        # a tap shows a game first; a second tap on it opens its review
        dot = await pg.evaluate("(() => { const d = [...document.querySelectorAll('.tr-card[aria-label=\"Accuracy, game by game\"] .tr-dot')].pop().getBoundingClientRect(); return [d.x + d.width / 2, d.y + d.height / 2]; })()")
        await pg.evaluate("window.scrollTo(0, 0)")
        el = pg.locator('.tr-card[aria-label="Accuracy, game by game"] .tr-plot')
        await el.scroll_into_view_if_needed(); await pg.wait_for_timeout(200)
        dot = await pg.evaluate("(() => { const d = [...document.querySelectorAll('.tr-card[aria-label=\"Accuracy, game by game\"] .tr-dot')].pop().getBoundingClientRect(); return [d.x + d.width / 2, d.y + d.height / 2]; })()")
        await pg.touchscreen.tap(dot[0], dot[1]); await pg.wait_for_timeout(300)
        first = await pg.evaluate("[App.name, !document.querySelector('.tr-card[aria-label=\"Accuracy, game by game\"] .tr-tip').hidden]")
        await pg.touchscreen.tap(dot[0], dot[1]); await pg.wait_for_timeout(500)
        second = await pg.evaluate("App.name")
        check('on a phone a tap shows the game, and a second tap opens it', first == ['trends', True] and second == 'review', [first, second])
        await pg.go_back(); await pg.wait_for_timeout(800)
        tab = await pg.evaluate("(document.querySelector('.tabs .tab.on') || {}).textContent")
        check('the More tab is lit on Trends', 'More' in (tab or ''), tab)
        await pg.set_viewport_size({'width': 1200, 'height': 900}); await pg.wait_for_timeout(700)
        fit2 = await pg.evaluate("[...document.querySelectorAll('.tr-chart')].map(s => Math.abs(s.viewBox.baseVal.width - s.getBoundingClientRect().width))")
        check('turned wider, the charts are drawn again to fit', fit2 and max(fit2) <= 2, fit2)
        check('no page errors (phone)', not errs, errs[:3])
        await ctx.close()
        await b.close()
    print('\n%d checks, %d failed' % (COUNT[0], len(FAILS)))
    sys.exit(1 if FAILS else 0)

asyncio.run(main())
