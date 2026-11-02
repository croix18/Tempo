# The characters and their tiers: records and promotion, the bonus challenger, the championship, old saves,
# opening books, signature moments, the chat level, portraits and the Stockfish characters.
import asyncio, json, os, sys
from playwright.async_api import async_playwright
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CHROME = os.environ.get('CHROME') or ('/usr/bin/google-chrome' if os.path.exists('/usr/bin/google-chrome') else None)
from testutil import serve_over_http
TEMPO_URL = serve_over_http(os.environ.get('TEMPO_URL') or 'file://' + ROOT + '/dist/Tempo.html')
PHONE = {'viewport': {'width': 390, 'height': 844}, 'has_touch': True, 'is_mobile': True}
DESK = {'viewport': {'width': 1280, 'height': 860}}

results = []
def check(name, ok, detail=''):
    results.append((name, bool(ok)))
    detail = ' | '.join(str(detail).split('\n'))
    print(('PASS  ' if ok else 'FAIL  ') + name + ('  [' + detail + ']' if detail != '' else ''), flush=True)

async def page(browser, opts, errors, init=None):
    ctx = await browser.new_context(**opts)
    if init: await ctx.add_init_script(init)
    pg = await ctx.new_page()
    pg.on('pageerror', lambda e: errors.append(str(e)[:200]))
    await pg.goto(TEMPO_URL); await pg.wait_for_function("() => window.App && App.name", timeout=30000); await pg.wait_for_timeout(300)
    return ctx, pg

# a finished game against a character, recorded the way the end of a real game records it
RECORD = """(a) => { const b = TempoBots.byId(a.id), moves = ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1c4', 'f8c5'];
  const g = { id: 'g' + Math.random().toString(36).slice(2), bot: a.id, color: 'w', startFen: TempoCore.START_FEN, moves: moves, sans: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5'],
    result: a.res, reason: a.res === '1/2-1/2' ? 'agreement' : 'resignation', hints: 0, undos: 0 };
  const r = Play.record(g, b); return { news: r.news.map(n => n.kind + ': ' + n.text), unlocked: r.unlocked && r.unlocked.id, tier: Store.state.play.tier, champ: Store.state.play.champ }; }"""

async def test_promotion(browser):
    errors = []
    ctx, pg = await page(browser, DESK, errors)
    r = await pg.evaluate("(() => { const S = Store.state.play; return { top: TempoBots.topTier(S), next: TempoBots.nextFor(S, false).id, boss: TempoBots.access(S, 'among-us-crewmate', false), d: TempoBots.access(S, 'goofy', false) }; })()")
    check('a new player starts in the Chaos Crew, with Patrick next and the promotion match closed', r == {'top': 0, 'next': 'patrick-star', 'boss': 'boss-locked', 'd': 'tier-locked'}, r)
    w1 = await pg.evaluate(RECORD, {'id': 'patrick-star', 'res': '1-0'})
    await pg.evaluate(RECORD, {'id': 'patrick-star', 'res': '1-0'})
    check('one win, and a second against the same character, still leave the match closed', await pg.evaluate("TempoBots.winsIn(Store.state.play, 0) === 1 && TempoBots.access(Store.state.play, 'among-us-crewmate', false) === 'boss-locked'"), w1)
    await pg.evaluate(RECORD, {'id': 'dory', 'res': '1-0'})
    draw = await pg.evaluate(RECORD, {'id': 'psyduck', 'res': '1/2-1/2'})
    check('a draw is not a win', await pg.evaluate("TempoBots.winsIn(Store.state.play, 0) === 2") and not draw['news'], draw)
    w3 = await pg.evaluate(RECORD, {'id': 'forky', 'res': '1-0'})
    check('the third win opens the promotion match, and says so', w3['unlocked'] == 'among-us-crewmate' and any('Promotion match open: beat Among Us Crewmate to reach Tier D' in n for n in w3['news']), w3)
    await pg.evaluate("App.go('home')"); await pg.wait_for_timeout(300)
    hero = await pg.locator('.home-hero').inner_text()
    check('Home offers the promotion match', 'Among Us Crewmate' in hero and 'Your promotion match' in hero, hero)
    up = await pg.evaluate(RECORD, {'id': 'among-us-crewmate', 'res': '1-0'})
    check('beating the tier’s top character promotes you, and the next opponent is the new tier’s first', up['tier'] == 1 and up['unlocked'] == 'goofy' and any('Promoted to Tier D' in n for n in up['news']), up)
    check('the tier below stays open to play', await pg.evaluate("TempoBots.access(Store.state.play, 'peely', false) === 'open'"))
    # the bonus challenger and the championship
    j = await pg.evaluate(RECORD, {'id': 'batman', 'res': '1-0'})
    check('beating Batman (played anyway) brings out the bonus challenger', any('bonus challenger has appeared: Joker' in n for n in j['news']) and await pg.evaluate("TempoBots.access(Store.state.play, 'joker-bonus-challenger', false) === 'open'"), j)
    c = await pg.evaluate(RECORD, {'id': 'homer-simpson', 'res': '1/2-1/2'})
    check('a draw with Homer is enough to be the Tempo Champion', c['champ'] and any('Tempo Champion' in n for n in c['news']), c)
    await pg.evaluate("App.go('play')"); await pg.wait_for_timeout(400)
    check('Play says so', 'Tempo Champion' in await pg.locator('.tier-now').inner_text())
    # end of game: the news and a button to the character it opened
    await pg.evaluate("Store.state.play.bots = {}; Store.state.play.tier = 0; Store.state.play.champ = false; ['patrick-star', 'dory'].forEach(id => Store.state.play.bots[id] = { w: 1, d: 0, l: 0, beaten: true }); Store.touch('play')")
    await pg.evaluate("App.go('play')"); await pg.wait_for_timeout(300)
    await pg.locator('.char', has_text='Ralph Wiggum').first.click(); await pg.wait_for_timeout(300)
    await pg.locator('.sheet button', has_text='Start game').click(); await pg.wait_for_timeout(1200)
    await pg.evaluate("() => { const G = Store.state.current; G.moves = ['e2e4', 'e7e5', 'f1c4', 'a7a6', 'd1h5', 'b8c6']; G.sans = ['e4', 'e5', 'Bc4', 'a6', 'Qh5', 'Nc6']; Store.touch(); App.go('play', { game: true }); }")
    await pg.wait_for_timeout(1200)
    await pg.evaluate("() => { const b = document.querySelector('.board').__board; }")
    # mate with Qxf7
    box = await pg.locator('.board').first.bounding_box()
    async def sq(n):
        f = ord(n[0]) - 97; r = int(n[1]) - 1
        await pg.mouse.click(box['x'] + box['width'] * (f + 0.5) / 8, box['y'] + box['height'] * (7 - r + 0.5) / 8)
    await sq('h5'); await pg.wait_for_timeout(120); await sq('f7')
    await pg.wait_for_selector('.sheet .result-hero', timeout=15000); await pg.wait_for_timeout(300)
    end = await pg.locator('.sheet').inner_text()
    check('the end of the game says the promotion match is open, with a button to play it', 'Promotion match open' in end and await pg.locator('.sheet button', has_text='Play Among Us Crewmate').count() == 1, end)
    lost = await pg.evaluate("TempoTalk.voice('ralph-wiggum').lines.defeat")
    check('…and the character says its losing line', lost in end, end)
    check('promotion: no page errors', not errors, errors[:3])
    await ctx.close()

OLD_SAVE = {'v': 1, 'settings': {'rev': 1, 'placed': True, 'botChat': True},
            'play': {'rev': 1, 'rating': 1210, 'hist': [[1700000000000, 1210]], 'unlocked': 6, 'lastBot': 'nora',
                     'bots': {'pip': {'w': 2, 'd': 0, 'l': 0, 'beaten': True}, 'nora': {'w': 1, 'd': 1, 'l': 2, 'beaten': True}}},
            'games': {'rev': 1, 'list': [{'id': 'old1', 'ts': 1700000000000, 'bot': 'nora', 'color': 'w', 'result': '0-1', 'reason': 'resignation',
                      'pgn': '[Event "Tempo game"]\n[White "You"]\n[Black "Wren"]\n[Result "0-1"]\n\n1. e4 e5 2. Nf3 Nc6 0-1\n', 'plies': 4, 'rated': True,
                      'before': 1200, 'after': 1210, 'reviewed': False, 'acc': None, 'counts': None}]},
            'current': {'id': 'c9', 'bot': 'felix', 'color': 'w', 'startFen': 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', 'moves': ['e2e4', 'e7e5'], 'sans': ['e4', 'e5'],
                        'coach': True, 'hanging': True, 'takebacks': True, 'clock': None, 'times': None, 'hints': 0, 'undos': 0, 'warned': 0, 'result': None, 'reason': None, 'startedAt': 1700000000000}}

async def test_old_save(browser):
    errors = []
    init = "try { localStorage.setItem('tempo:v1', %s); } catch (e) {}" % json.dumps(json.dumps(OLD_SAVE))
    ctx, pg = await page(browser, DESK, errors, init)
    s = await pg.evaluate("(() => { const S = Store.state; return { tier: S.play.tier, unlocked: S.play.unlocked, pip: S.play.bots.pip, cur: S.current && S.current.bot }; })()")
    check('an old save keeps its level: next on the old ladder was Felix (1150), so the Club Players are open', s['tier'] == 2 and s['unlocked'] == 6, s)
    check('old records are kept', s['pip'] == {'w': 2, 'd': 0, 'l': 0, 'beaten': True}, s)
    check('the unfinished game against Felix carries on against the character nearest his strength', s['cur'] == 'mario', s)
    await pg.evaluate("App.go('review')"); await pg.wait_for_timeout(400)
    rv = await pg.locator('.v-review .list-row').first.inner_text()
    check('Review still names the old opponent', 'Loss to Wren' in rv, rv)
    await pg.evaluate("App.go('progress')"); await pg.wait_for_timeout(400)
    pr = await pg.locator('.v-progress').inner_text()
    check('Progress lists the original ladder’s records under their own heading', 'The original ladder' in pr and 'Wren' in pr and 'Pip' in pr and 'Tier C' in pr, pr[:400])
    await pg.evaluate("App.go('play')"); await pg.wait_for_timeout(400)
    check('Play resumes the carried-over game', 'Mario' in await pg.locator('.resume').inner_text())
    check('old save: no page errors', not errors, errors[:3])
    await ctx.close()

async def test_characters(browser):
    errors = []
    ctx, pg = await page(browser, DESK, errors)
    r = await pg.evaluate("""(() => { const B = TempoBots, out = {};
      out.n = B.BOTS.length; out.tiers = B.TIERS.map(t => t.members.length); out.bosses = B.TIERS.map(t => t.boss);
      const svgs = B.BOTS.map(b => TempoAvatars.svg(b)); out.svg = svgs.every(s => s.indexOf('<svg') === 0) && new Set(svgs).size === svgs.length;
      out.old = !!TempoAvatars.svg(B.find('pip')) && B.find('pip').name === 'Pip';
      out.lines = B.BOTS.every(b => { const v = TempoTalk.voice(b.id); return v && (v.mode === 'silent' ? !Object.keys(v.lines).length && !v.arc.length : TempoTalk.EVENTS.every(e => v.lines[e]) && v.arc.length === 3); });
      out.books = B.BOTS.every(b => b.book.w.length && b.book.e4.length && b.book.d4.length && b.book.w.concat(b.book.e4, b.book.d4).every(f => TempoBook.has(f)));
      out.sf = B.BOTS.filter(b => b.sf).map(b => b.id).length;
      return out; })()""")
    check('61 characters: six tiers of ten and the Joker', r['n'] == 61 and r['tiers'] == [10] * 6, r)
    check('each tier’s promotion match is its top character', r['bosses'] == ['among-us-crewmate', 'bowser', 'freddy-fazbear', 'princess-peach', 'dr-eggman', 'homer-simpson'], r['bosses'])
    check('every character has its own badge, and the old ladder bots keep their portraits', r['svg'] and r['old'], r)
    check('every character has its fifteen lines and its three-beat story', r['lines'])
    check('every character’s opening families exist', r['books'])
    check('the Masters, the Legends and the Joker play with Stockfish', r['sf'] == 21, r['sf'])
    # opening books: side-aware, and they never force a move after you leave them
    b = await pg.evaluate("""(() => { const B = TempoBots, ron = B.byId('ron-weasley'), sh = B.byId('sheldon-cooper'), pat = B.byId('patrick-star'), z = () => 0, C = TempoCore;
      return {
        ronWhite: B.plan(ron, { fen: C.START_FEN, moves: [], sans: [] }, z).book,
        ronVsE4: B.plan(ron, { fen: C.START_FEN, moves: ['e2e4'], sans: ['e4'] }, z).book,
        ronVsD4: B.plan(ron, { fen: C.START_FEN, moves: ['d2d4'], sans: ['d4'] }, z).book,
        sheldonPetrov: B.plan(sh, { fen: C.START_FEN, moves: ['e2e4', 'e7e5', 'g1f3'], sans: ['e4', 'e5', 'Nf3'] }, z).book,
        deviated: B.plan(ron, { fen: C.START_FEN, moves: ['e2e4', 'c7c5', 'a2a3', 'd7d6', 'h2h3'], sans: ['e4', 'c5', 'a3', 'd6', 'h3'] }, z).book || null,
        patrickDeep: B.plan(pat, { fen: C.START_FEN, moves: ['e2e4', 'e7e5', 'g1f3', 'b8c6'], sans: ['e4', 'e5', 'Nf3', 'Nc6'] }, z).book || null,
        fromFen: B.plan(sh, { fen: '4k3/8/8/8/8/8/8/4K3 w - - 0 1', moves: [], sans: [] }, z).book || null };
    })()""")
    check('Ron opens 1.e4 for his gambits, answers 1.e4 with the Sicilian and 1.d4 with the King’s Indian', b['ronWhite'] == 'e2e4' and b['ronVsE4'] == 'c7c5' and b['ronVsD4'] == 'g8f6', b)
    check('Sheldon answers 2.Nf3 with the Petrov', b['sheldonPetrov'] == 'g8f6', b)
    check('a position the book doesn’t know leaves the book', b['deviated'] is None, b)
    check('the Chaos Crew drop their book after a few moves', b['patrickDeep'] is None, b)
    check('a game from another position never uses the book', b['fromFen'] is None, b)
    # Ralph's special (a knight fork) needs the fork on the board and the referee's word that it works
    m = await pg.evaluate("""(() => { const C = TempoCore, T = TempoTalk, ralph = TempoBots.byId('ralph-wiggum');
      const g = () => ({ id: 'tt' + Math.random(), color: 'b', startFen: 'r3k3/8/8/1N6/8/8/8/4K3 w - - 0 1', moves: ['b5c7'] });
      const yes = T.bot(g(), ralph, { kind: 'search' }, { prev: { v: 0, mat: -240, engine: 'stockfish' }, now: { v: 420, mat: -240, engine: 'stockfish' } }, { chat: 'some', rng: () => 0.99 });
      const no = T.bot(g(), ralph, { kind: 'search' }, {}, { chat: 'some', rng: () => 0.99 });
      return { yes: yes && yes.key, no: no && no.key }; })()""")
    check('a knight fork the referee backs gets Ralph\u2019s special; without the referee, no claim', m['yes'] == 'special' and m['no'] != 'special', m)
    # chat: Off is silent; Occasional says hello
    await pg.evaluate("Store.state.settings.chat = 'off'; Store.state.settings.botChat = false; Store.touch('settings'); App.go('play')"); await pg.wait_for_timeout(300)
    await pg.locator('.char', has_text='Dory').first.click(); await pg.wait_for_timeout(300)
    await pg.locator('.sheet button', has_text='Start game').click(); await pg.wait_for_timeout(900)
    silent = await pg.evaluate("document.querySelector('.player .bubble').hidden")
    await pg.evaluate("Store.state.current = null; Store.state.settings.chat = 'some'; Store.state.settings.botChat = true; Store.touch(); App.go('play')"); await pg.wait_for_timeout(300)
    await pg.locator('.char', has_text='Dory').first.click(); await pg.wait_for_timeout(300)
    await pg.locator('.sheet button', has_text='Start game').click(); await pg.wait_for_timeout(900)
    said = await pg.evaluate("document.querySelector('.player .bubble').textContent")
    hello = await pg.evaluate("TempoTalk.voice('dory').lines.greeting")
    check('with chat off the character says nothing; with Occasional it says hello', silent and hello in said, (silent, said))
    await pg.evaluate("Store.state.current = null; Store.touch(); App.go('prefs')"); await pg.wait_for_timeout(300)
    await pg.locator('.v-prefs .seg button', has_text='Frequent').click(); await pg.wait_for_timeout(200)
    check('Preferences sets the chat level', await pg.evaluate("Store.state.settings.chat === 'lots' && Store.state.settings.botChat === true"))
    # the character sheet
    await pg.evaluate("Store.state.settings.unlockAll = true; App.go('play')"); await pg.wait_for_timeout(300)
    await pg.locator('.tier-fold', has_text='The Contenders').click(); await pg.wait_for_timeout(450)
    await pg.locator('#tier-B .char', has_text='Wednesday').click(); await pg.wait_for_timeout(400)
    await pg.locator('.sheet .seg button', has_text='How they play').click(); await pg.wait_for_timeout(200)
    sheet = await pg.locator('.sheet').inner_text()
    check('the character sheet shows tier, rating, plan, tricks, weak spot and openings', all(x in sheet for x in ['Tier B', 'about 1700', 'How Wednesday Addams plays', 'Favorite tricks', 'Weak spot', 'Against 1.e4: French Defense']), sheet[:300])
    check('…and the radar of its seven traits', await pg.evaluate("document.querySelectorAll('.sheet svg.radar text.lbl').length === 7 && /Tricks 95/.test(document.querySelector('.sheet svg.radar').getAttribute('aria-label'))"))
    # a Stockfish character chooses among Stockfish's moves
    ready = await pg.evaluate("Engines.sfReady().then(ok => ok)")
    if ready:
        d = await pg.evaluate("""Engines.botDecide(TempoBots.byId('batman'), { fen: TempoCore.START_FEN, moves: ['e2e4', 'a7a6', 'd2d4', 'h7h6', 'g1f3', 'g7g5'], sans: ['e4', 'a6', 'd4', 'h6', 'Nf3', 'g5'] }, {})
          .then(r => ({ r, log: Engines.log().slice(-1)[0] }))""")
        check('Batman’s move comes from Stockfish’s candidates, chosen by style within his margin', d['r']['via'] == 'stockfish' and d['r']['kind'] in ('best', 'style', 'slip') and len(d['log']['cands']) >= 2, d)
    else:
        check('Stockfish is ready for the Masters', False, 'not ready')
    check('characters: no page errors', not errors, errors[:3])
    await ctx.close()

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=CHROME, args=['--no-sandbox'])
        for t in (test_promotion, test_old_save, test_characters):
            try:
                await t(b)
            except Exception as e:
                check(t.__name__ + ' ran to the end', False, repr(e)[:300])
        await b.close()
    failed = [n for n, ok in results if not ok]
    print('\n%d checks, %d failed' % (len(results), len(failed)))
    for n in failed: print('  FAILED:', n)

asyncio.run(main())
