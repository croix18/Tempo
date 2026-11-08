# Games played somewhere else: pasted from Chess.com, read from a file of several games, or fetched from Chess.com's public
# data (faked here), saved with your games, reviewed one after another, and counted in Your pattern, Progress and Home.
# Usage: python3 build/import_test.py
import asyncio, json, os, re, sys
from playwright.async_api import async_playwright
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from testutil import ROOT
import calendar
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
        '[Result "%s"]' % result, '[CurrentPosition "x"]', '[Timezone "UTC"]', '[ECO "C20"]', '[UTCDate "%s"]' % date, '[UTCTime "%s"]' % start,
        '[WhiteElo "%s"]' % welo, '[BlackElo "%s"]' % belo, '[TimeControl "%s"]' % tc, '[Termination "%s"]' % term, '[StartTime "%s"]' % start,
        '[EndDate "%s"]' % date, '[EndTime "%s"]' % end, '[Link "%s"]' % link, '', moves, ''])

# You win quickly as White; you fall for Legal's mate as Black; you grab the d5 pawn and walk into the Elephant Trap as White
G1 = cc('Croix181', 'tjtj253', '1-0', '2026.11.05', '18:02:11', '18:05:40', '612', '598', 'Croix181 won by checkmate', 'https://www.chess.com/game/live/111111111',
        '1. e4 {[%clk 0:09:58.1]} 1... e5 {[%clk 0:09:57.2]} 2. Bc4 {[%clk 0:09:55]} 2... Nc6 {[%clk 0:09:51]} 3. Qh5 {[%clk 0:09:50]} 3... Nf6 {[%clk 0:09:40]} 4. Qxf7# {[%clk 0:09:49]} 1-0')
G2 = cc('rookie_77', 'Croix181', '1-0', '2026.11.06', '19:10:00', '19:14:30', '640', '608', 'rookie_77 won by checkmate', 'https://www.chess.com/game/live/222222222',
        '1. e4 e5 2. Nf3 d6 3. Bc4 Bg4 4. Nc3 g6 5. Nxe5 Bxd1 6. Bxf7+ Ke7 7. Nd5# 1-0')
G3 = cc('Croix181', 'qgd_fan', '0-1', '2026.11.07', '20:00:00', '20:09:00', '604', '615', 'qgd_fan won by resignation', 'https://www.chess.com/game/live/333333333',
        '1. d4 d5 2. c4 e6 3. Nc3 Nf6 4. Bg5 Nbd7 5. cxd5 exd5 6. Nxd5 Nxd5 7. Bxd8 Bb4+ 8. Qd2 Bxd2+ 9. Kxd2 Kxd8 0-1')
G4 = cc('Croix181', 'blitzer', '1/2-1/2', '2026.11.08', '09:00:00', '09:03:00', '598', '601', 'Game drawn by repetition', 'https://www.chess.com/game/live/444444444',
        '1. e4 e5 2. Nf3 Nc6 3. Ng1 Nb8 4. Nf3 Nc6 5. Ng1 Nb8 1/2-1/2', tc='180+2')

async def fresh(b):
    pg = await b.new_page(viewport={'width': 1200, 'height': 900})
    errs = []
    pg.on('pageerror', lambda e: errs.append('pageerror: ' + str(e)))
    pg.on('console', lambda m: errs.append(m.type + ': ' + m.text[:200]) if m.type == 'error' and 'api.chess.com' not in m.text and 'Failed to load resource' not in m.text else None)
    await pg.goto(TEMPO_URL)
    await pg.wait_for_function("window.App && (Engines.status === 'ready' || Engines.status === 'failed')", timeout=60000)
    return pg, errs

async def review_done(pg, t=240):
    for _ in range(t * 2):
        if await pg.evaluate("!!(Review._state() && Review._state().done)"): return True
        await pg.wait_for_timeout(500)
    return False

async def batch_done(pg, t=400):
    for _ in range(t * 2):
        if await pg.evaluate("!Review._batch() && /reviewed/.test((document.querySelector('.rv-batch-head') || {}).textContent || '')"): return True
        await pg.wait_for_timeout(500)
    return False

def api_route(games, status=200):
    async def handle(route):
        url = route.request.url
        hdr = {'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json'}
        if status != 200: await route.fulfill(status=status, headers=hdr, body='{"code":0,"message":"User not found."}'); return
        if url.endswith('/games/archives'):
            await route.fulfill(status=200, headers=hdr, body=json.dumps({'archives': ['https://api.chess.com/pub/player/croix181/games/2026/10', 'https://api.chess.com/pub/player/croix181/games/2026/11']}))
        elif url.endswith('/games/2026/11'):
            await route.fulfill(status=200, headers=hdr, body=json.dumps({'games': games}))
        else:
            await route.fulfill(status=200, headers=hdr, body=json.dumps({'games': []}))
    return handle

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=CHROME, args=['--no-sandbox'])
        pg, errs = await fresh(b)

        # ---------- the card ----------
        await pg.evaluate("App.go('review')"); await pg.wait_for_timeout(300)
        have = await pg.evaluate("['#cc-name', '#cc-get', '#pgn-in', '#pgn-go', '#pgn-keep'].map(s => !!document.querySelector(s))")
        check('the Review page offers your Chess.com username, Get my games, and a PGN to paste', all(have) and await pg.evaluate('Imports.online'), have)

        # ---------- one game, pasted with your username ----------
        await pg.locator('#cc-name').fill('Croix181')
        await pg.locator('#pgn-in').fill(G1)
        await pg.locator('#pgn-go').click(); await pg.wait_for_timeout(500)
        st = await pg.evaluate("Review._state()")
        check('Add and review opens the review of the saved game', st is not None and await review_done(pg), st)
        g = await pg.evaluate("Store.state.games.list[0]")
        check('the game is saved with your games: from Chess.com, your side from your username, the opponent and both ratings',
              g['src'] == 'chesscom' and g['color'] == 'w' and g['opp'] == 'tjtj253' and g['oppElo'] == 598 and g['myElo'] == 612 and g['id'].startswith('x'), g)
        check('its result, how it ended, the time control and its address on Chess.com come along',
              g['result'] == '1-0' and g['reason'] == 'checkmate' and g['tc'] == '600' and g['tcl'] == 'rapid' and g['link'] == 'https://www.chess.com/game/live/111111111', g)
        check('the review is saved on the game: reviewed, with your accuracy and counts', g['reviewed'] and isinstance(g['acc'], (int, float)) and g.get('counts') and g.get('rv'), [g['reviewed'], g['acc']])
        check('the game sits at its own time (when it ended on Chess.com)', g['ts'] == calendar.timegm((2026, 11, 5, 18, 5, 40, 0, 0, 0)) * 1000, g['ts'])
        day = await pg.evaluate("Store.state.days.map['2026-11-05']")
        name = await pg.evaluate("Store.state.settings.chessName")
        check('it counts as practice on the day you played it, and your username is remembered', day and day['g'] >= 1 and name == 'Croix181', [day, name])
        n1 = await pg.evaluate("Store.state.games.list.length")

        # ---------- the same game again: no copy ----------
        await pg.evaluate("App.go('review')"); await pg.wait_for_timeout(300)
        await pg.locator('#pgn-in').fill(G1)
        await pg.locator('#pgn-go').click(); await pg.wait_for_timeout(800)
        n2 = await pg.evaluate("Store.state.games.list.length")
        check('adding a game you already added opens it instead of saving it twice, with its saved review', n2 == n1 and await review_done(pg, 10), [n1, n2])

        # ---------- a file of several games: the name in every game is yours ----------
        await pg.evaluate("() => { Store.state.settings.chessName = ''; Store.touch('settings'); App.go('review'); }"); await pg.wait_for_timeout(300)
        await pg.locator('#pgn-in').fill(G1 + '\n' + G2 + '\n' + G3)
        await pg.locator('#pgn-go').click(); await pg.wait_for_timeout(500)
        sheet = await pg.locator('.sheet').inner_text() if await pg.locator('.sheet').count() else ''
        check('several games show as a list: the one already added is marked, the rest can all be added',
              '3 games in this PGN' in sheet and 'Reviewed' in sheet and 'Add all 2 and review them' in sheet and 'rookie_77 (640)' in sheet and 'qgd_fan (615)' in sheet, sheet[:300])
        check('with no username given, the name in every game is taken as yours and remembered', await pg.evaluate("Store.state.settings.chessName") == 'Croix181')
        await pg.locator('.sheet button', has_text='Add all 2').click(); await pg.wait_for_timeout(500)
        check('adding them all starts reviewing them one after another', await pg.locator('.rv-batch').count() == 1 and 'Reviewing game 1 of 2' in (await pg.locator('.rv-batch-head').inner_text()))
        ok = await batch_done(pg)
        head = await pg.locator('.rv-batch-head').inner_text()
        check('the batch finishes: every game reviewed, and it says their mistakes are in your practice', ok and 'All 2 games reviewed' in head, head)
        gl = await pg.evaluate("Store.state.games.list.map(g => [g.opp, g.color, g.result, g.reviewed, g.ts])")
        check('the games are saved in date order, newest first, each reviewed, with your side right', [x[0] for x in gl[:3]] == ['qgd_fan', 'rookie_77', 'tjtj253'] and all(x[3] for x in gl[:3]) and gl[1][1] == 'b', gl)
        mids = await pg.evaluate("Store.state.mistakes.items.filter(x => !x.gone).map(x => x.id)")
        ids = await pg.evaluate("Store.state.games.list.slice(0, 2).map(g => g.id)")
        check('your mistakes from those games are in the practice queue', any(m.startswith('g' + ids[0] + '-') for m in mids) and any(m.startswith('g' + ids[1] + '-') for m in mids), [mids, ids])
        tops = await pg.evaluate("Mistakes.topics(10)")
        check('they count toward what keeps going wrong', len(tops) >= 1, tops)

        # ---------- where they show ----------
        await pg.evaluate("App.go('review')"); await pg.wait_for_timeout(300)
        rows = await pg.evaluate("[...document.querySelectorAll('.v-review .list .list-row')].slice(0, 3).map(r => r.innerText.replace(/\\s+/g, ' ').trim())")
        check('Your games lists them with the result, the opponent, their rating and Chess.com', len(rows) == 3 and rows[0].startswith('Q Loss to qgd_fan (615)') and 'Chess.com rapid' in rows[0] and 'Reviewed' in rows[0], rows)
        await pg.evaluate("App.go('train', { mode: 'mistakes' })"); await pg.wait_for_timeout(600)
        tx = await pg.evaluate("document.querySelector('.view').innerText")
        check('a retry position says which Chess.com game it came from', re.search(r'From your (loss to|win over|draw with) \w+ on Chess\.com on', tx) is not None, tx[:300])
        await pg.evaluate("App.go('progress')"); await pg.wait_for_timeout(600)
        card = await pg.locator('.games-card').inner_text()
        check('Progress has Your games: how many reviewed and from Chess.com, accuracy, mistakes a game, and the chart',
              re.search(r'3\s*reviewed, 3 from Chess\.com', card) and 'Accuracy' in card and 'Mistakes a game' in card and await pg.locator('.games-card svg.chart').count() >= 1, card[:300])
        check('and what to work on, with your Chess.com rating from the games you added', 'What to work on' in card and re.search(r'Chess\.com rapid rating\s*604', card) is not None, card[-300:])

        # ---------- Home offers the games still waiting ----------
        await pg.evaluate("""() => { const t = Imports._records([%s], { name: 'Croix181' }); Store.addGames(t.recs); App.go('home'); }""" % json.dumps(G4)); await pg.wait_for_timeout(600)
        home = await pg.evaluate("document.querySelector('.view').innerText")
        g4 = await pg.evaluate("Store.state.games.list[0]")
        check('a game added but not reviewed yet: Home offers to review it', 'Review 1 game you added' in home and g4['tcl'] == 'blitz' and g4['reason'] == 'threefold repetition' and g4['result'] == '1/2-1/2', [home[:200], g4['tcl'], g4['reason']])
        await pg.evaluate("App.go('review')"); await pg.wait_for_timeout(300)
        check('and so does the Review page', '1 added game is waiting for its review.' in await pg.evaluate("document.querySelector('.view').innerText"))
        check('no page errors (pasting, a batch, the lists)', not errs, errs[:3])
        await pg.close()

        # ---------- straight from Chess.com (its public data, faked here) ----------
        pg, errs = await fresh(b)
        api = [{'url': 'https://www.chess.com/game/live/555555555', 'pgn': G1.replace('111111111', '555555555').replace('18:05:40', '21:05:40'), 'end_time': 1762549540, 'time_class': 'rapid', 'rules': 'chess'},
               {'url': 'https://www.chess.com/game/live/666666666', 'pgn': G2.replace('222222222', '666666666'), 'end_time': 1762457670, 'time_class': 'rapid', 'rules': 'chess'},
               {'url': 'https://www.chess.com/game/daily/7', 'pgn': '[Variant "Chess960"]\n\n1. e4 *', 'end_time': 1762457000, 'time_class': 'daily', 'rules': 'chess960'}]
        await pg.route('https://api.chess.com/**', api_route(api))
        await pg.evaluate("App.go('review')"); await pg.wait_for_timeout(300)
        await pg.locator('#cc-name').fill('Croix181')
        await pg.locator('#cc-get').click()
        await pg.wait_for_selector('.sheet', timeout=15000)
        sheet = await pg.locator('.sheet').inner_text()
        check('Get my games lists your recent Chess.com games, newest first, leaving out variants', 'Your recent games on Chess.com' in sheet and 'Add all 2 and review them' in sheet
              and sheet.index('tjtj253') < sheet.index('rookie_77') and 'Chess960' not in sheet, sheet[:300])
        await pg.locator('.sheet .list-row').first.click(); await pg.wait_for_timeout(500)
        ok = await review_done(pg)
        g = await pg.evaluate("Store.state.games.list[0]")
        check('tapping one adds it and opens its review', ok and g['link'] == 'https://www.chess.com/game/live/555555555' and g['reviewed'], g)
        # Chess.com can't be reached, or there's no such player
        await pg.unroute('https://api.chess.com/**')
        await pg.route('https://api.chess.com/**', lambda r: r.abort())
        await pg.evaluate("App.go('review')"); await pg.wait_for_timeout(300)
        await pg.locator('#cc-get').click(); await pg.wait_for_timeout(1500)
        msg = await pg.locator('.imp-card .feedback').inner_text()
        check('when Chess.com can’t be reached, it says so and how to paste the game instead', msg.startswith('Tempo couldn’t reach Chess.com from here.') and 'paste' in msg, msg)
        await pg.unroute('https://api.chess.com/**')
        await pg.route('https://api.chess.com/**', api_route([], status=404))
        await pg.locator('#cc-name').fill('nobody_here_42')
        await pg.locator('#cc-get').click(); await pg.wait_for_timeout(1500)
        msg = await pg.locator('.imp-card .feedback').inner_text()
        check('a username Chess.com doesn’t know is named', msg == 'There’s no Chess.com player named nobody_here_42.', msg)

        # ---------- reviewing without saving ----------
        await pg.evaluate("App.go('review')"); await pg.wait_for_timeout(300)
        n1 = await pg.evaluate("Store.state.games.list.length")
        await pg.locator('#pgn-keep').uncheck()
        await pg.locator('#pgn-in').fill('[White "Morphy"]\n[Black "Duke"]\n\n1. e4 e5 2. Nf3 d6 3. d4 Bg4 *')
        await pg.locator('.v-review .seg button', has_text='I played White').click()
        await pg.locator('#pgn-go').click(); await pg.wait_for_timeout(500)
        ok = await review_done(pg)
        check('with Save it with my games unticked, the game is reviewed but not saved', ok and await pg.evaluate("Store.state.games.list.length") == n1)

        # ---------- a saved copy with bad fields is repaired ----------
        res = await pg.evaluate("""() => { const s = JSON.parse(Store.exportJson()); const g = s.games.list[0];
          g.oppElo = 'abc'; g.link = 'javascript:alert(1)'; g.tcl = 'hyper'; g.src = 'chesscom'; g.opp = 'x'.repeat(200); s.settings.chessName = 'bad name!';
          const r = Store.importJson(JSON.stringify(s)); const h = Store.state.games.list[0];
          return { r: r, oppElo: h.oppElo, link: h.link, tcl: h.tcl, opp: h.opp.length, name: Store.state.settings.chessName }; }""")
        check('a restored backup with broken game fields is repaired, and a bad username dropped',
              res['oppElo'] is None and res['link'] is None and res['tcl'] is None and res['opp'] <= 60 and res['name'] == '', res)
        check('no page errors (Chess.com)', not errs, errs[:3])
        await pg.close()
        await b.close()
    print('\n%d checks, %d failed' % (COUNT[0], len(FAILS)))
    sys.exit(1 if FAILS else 0)

asyncio.run(main())
