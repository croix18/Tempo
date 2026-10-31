# The learning loop: the Play ladder, what keeps going wrong across games, and the coach that asks first.
import asyncio, json, os, sys
from playwright.async_api import async_playwright
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CHROME = os.environ.get('CHROME') or ('/usr/bin/google-chrome' if os.path.exists('/usr/bin/google-chrome') else None)
from testutil import serve_over_http
TEMPO_URL = serve_over_http(os.environ.get('TEMPO_URL') or 'file://' + ROOT + '/dist/Tempo.html')  # a reload keeps its storage there
PHONE = {'viewport': {'width': 390, 'height': 844}, 'has_touch': True, 'is_mobile': True}
DESK = {'viewport': {'width': 1280, 'height': 860}}

results = []
def check(name, ok, detail=''):
    results.append((name, bool(ok)))
    detail = ' | '.join(str(detail).split('\n'))
    print(('PASS  ' if ok else 'FAIL  ') + name + ('  [' + detail + ']' if detail != '' else ''), flush=True)


async def page(browser, opts, errors):
    ctx = await browser.new_context(**opts); pg = await ctx.new_page()
    pg.on('pageerror', lambda e: errors.append(str(e)[:200]))
    await pg.goto(TEMPO_URL); await pg.wait_for_function("() => window.App && App.name", timeout=30000); await pg.wait_for_timeout(300)
    return ctx, pg

async def click_sq(pg, sq):
    o = await pg.evaluate("document.querySelector('.board').__board.orient")
    box = await pg.locator('.board').first.bounding_box()
    f = ord(sq[0]) - 97; r = int(sq[1]) - 1
    x = (f if o == 'w' else 7 - f) + 0.5; y = (7 - r if o == 'w' else r) + 0.5
    await pg.mouse.click(box['x'] + box['width'] * x / 8, box['y'] + box['height'] * y / 8)

# a game in which 4.Bf4 drops the bishop to the queen on c7; the coach always warns here
async def bf4_game(pg, ask):
    await pg.evaluate("App.go('play')"); await pg.wait_for_timeout(300)
    await pg.locator('.rung', has_text='Pip').first.click(); await pg.wait_for_timeout(300)
    sw = pg.locator('#tg-ask-me-first')
    if ask != await sw.is_checked(): await sw.click(force=True)
    await pg.locator('.seg button', has_text='White').first.click()
    await pg.locator('button', has_text='Start game').click(); await pg.wait_for_timeout(600)
    await pg.evaluate("() => { const G = Store.state.current; G.moves = ['d2d4', 'c7c6', 'g1f3', 'd8c7']; G.sans = ['d4', 'c6', 'Nf3', 'Qc7']; Store.touch(); App.go('play', { game: true }); }")
    await pg.wait_for_timeout(900)
    await click_sq(pg, 'c1'); await pg.wait_for_timeout(100); await click_sq(pg, 'f4')
    await pg.wait_for_selector('.coach.decide:not([hidden])', timeout=15000); await pg.wait_for_timeout(200)

def coach(pg): return pg.locator('.coach').inner_text()


async def test_play_ladder(browser):
    errors = []
    ctx, pg = await page(browser, PHONE, errors)
    await pg.evaluate("Store.state.play.unlocked = 3; Store.state.play.bots = { pip: {w:1,d:0,l:0,beaten:true}, rosie: {w:1,d:0,l:1,beaten:true}, theo: {w:1,d:0,l:0,beaten:true} }; Store.touch('play'); App.go('play')")
    await pg.wait_for_timeout(400)
    names = await pg.evaluate("[...document.querySelectorAll('.v-play .rungs.full')].map(l => [...l.querySelectorAll('.rung .who')].map(w => w.textContent))")
    check('Play: your next opponent is first, with the ones you beat below', names[0] == ['Mabel', 'Theo', 'Rosie', 'Pip'], names[0])
    check('Play: the next opponent is marked and sits at the top of the page', await pg.evaluate("(() => { const r = document.querySelector('.rung.next'); return r && r.querySelector('.who').textContent === 'Mabel' && r.getBoundingClientRect().top < 300; })()"))
    folded = await pg.evaluate("(() => { const b = document.querySelector('#locked-bots'); return b && !b.classList.contains('open') && b.getBoundingClientRect().height === 0; })()")
    head = await pg.locator('.locked-head').inner_text()
    check('Play: the locked opponents wait in a folded list that says what unlocks next', folded and '10 more opponents to unlock' in head and 'Beat Mabel to unlock Gus' in head, head)
    await pg.locator('.locked-head').tap(); await pg.wait_for_timeout(450)
    check('Play: opened, the locked list runs nearest-to-unlock first', names[1][:3] == ['Gus', 'Nora', 'Felix'] and names[1][-1] == 'Stockfish' and await pg.evaluate("document.querySelector('#locked-bots').classList.contains('open')"), names[1])
    await pg.locator('#locked-bots .rung', has_text='Gus').tap(); await pg.wait_for_timeout(400)
    check('Play: a locked opponent still explains how to unlock it', await pg.locator('.sheet h2', has_text='Gus is locked').count() == 1)
    await pg.locator('.sheet .close-x').tap(); await pg.wait_for_timeout(300)
    await pg.evaluate("App.go('home')"); await pg.wait_for_timeout(200); await pg.evaluate("App.go('play')"); await pg.wait_for_timeout(300)
    check('Play: the folded list stays the way you left it', await pg.evaluate("document.querySelector('#locked-bots').classList.contains('open')"))
    await pg.evaluate("Store.state.settings.unlockAll = true; App.go('play')"); await pg.wait_for_timeout(300)
    n = await pg.evaluate("document.querySelectorAll('.v-play .rungs.full')[0].querySelectorAll('.rung').length")
    check('Play: with every opponent unlocked there is one full ladder and nothing folded', n == 14 and await pg.locator('#locked-bots').count() == 0, n)
    check('Play ladder: no page errors', not errors, errors[:3])
    await ctx.close()


SEED = """() => { const now = Date.now(), items = [], fen = 'rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2';
  for (let g = 0; g < 5; g++) items.push({ id: 'gG' + g + '-3', fen, played: 'd8h4', best: 'b8c6', kind: 'blunder', topic: g < 4 ? 'safety' : 'fork', ts: now - g * 86400000, box: 0, due: now - 1000, seen: 0 });
  items.push({ id: 'gG1-7', fen, played: 'd8h4', best: 'b8c6', kind: 'mistake', topic: 'fork', ts: now - 86400000, box: 0, due: now, seen: 0 });
  Store.state.mistakes.items = items; Store.touch('mistakes'); return Mistakes.patterns(); }"""

async def test_patterns(browser):
    errors = []
    ctx, pg = await page(browser, DESK, errors)
    check('no pattern before any reviewed game', await pg.evaluate("Mistakes.patterns()") is None)
    pt = await pg.evaluate(SEED)
    check('the pattern is the topic in the most games, not the most mistakes', pt and pt['topic'] == 'safety' and pt['games'] == 4 and pt['of'] == 5, pt)
    await pg.evaluate("App.go('home')"); await pg.wait_for_timeout(500)
    card = pg.locator('.v-home .pattern')
    txt = await card.inner_text() if await card.count() else ''
    check('Home: a pattern card says what keeps going wrong, with the lesson, puzzles and positions that fix it',
          'You left a piece where it could be taken in 4 of your last 5 games.' in txt and 'The Blunder Check' in txt and 'Hanging-piece puzzles' in txt and 'Retry those positions' in txt, txt)
    order = await pg.evaluate("[...document.querySelectorAll('.v-home .home-todo .menu-row .t')].map(e => e.textContent)")
    subs = await pg.evaluate("[...document.querySelectorAll('.v-home .home-todo .menu-row .s')].map(e => e.textContent)")
    check('Home: what fixes your games comes first in the list, each with a rough time', order[0].startswith('Retry 6 mistakes') and all(s.startswith('About ') and 'minute' in s for s in subs), [order, subs])
    pos = await pg.evaluate("(() => { const c = document.querySelector('.v-home .pattern').getBoundingClientRect(), f = document.querySelector('.home-fig').getBoundingClientRect(), t = document.querySelector('.home-todo').getBoundingClientRect(); return [Math.round(f.bottom), Math.round(c.top), Math.round(c.bottom), Math.round(t.top)]; })()")
    check('Home: the pattern card sits between the board and the list', pos[0] <= pos[1] and pos[2] <= pos[3], pos)
    await card.locator('button', has_text='Retry those positions').click(); await pg.wait_for_timeout(500)
    check('Retry those positions opens the mistakes trainer', await pg.evaluate("App.name") == 'train' and await pg.locator('.v-train .board').count() == 1)
    # a real review tags each saved mistake with its topic, and shows the pattern across games when it's done
    pgn = '[Event "Tempo game"]\n[White "You"]\n[Black "Pip"]\n[Result "0-1"]\n\n1. e4 a5 2. h3 b6 3. d4 f6 4. Bg5 c5 5. Be3 Na6 6. Nf3 e5 7. Bf4 b5 8. dxe5 h5 0-1'
    await pg.evaluate("""(pgn) => { Store.state.games.list.unshift({ id: 'tp1', ts: Date.now(), bot: 'pip', color: 'w', result: '0-1', reason: 'resignation', pgn: pgn, plies: 16, rated: false, before: 600, after: 600, reviewed: false }); Store.touch('games'); Review.openGame('tp1'); }""", pgn)
    for _ in range(240):
        if await pg.evaluate("Store.state.games.list[0].reviewed"): break
        await pg.wait_for_timeout(500)
    await pg.wait_for_timeout(800)
    items = await pg.evaluate("Store.state.mistakes.items.filter(i => i.id.indexOf('gtp1-') === 0).map(i => [i.id, i.kind, i.topic])")
    check('a review tags each saved mistake with its topic (the hanging bishops are "safety")', items and all(len(i) == 3 and i[2] for i in items) and any(i[2] == 'safety' for i in items), items)
    rv = pg.locator('.v-review .rv-pattern .pattern')
    check('a finished review shows the pattern across your games', await rv.count() == 1 and 'Across your games' in await rv.inner_text() and '5 of your last 6 games' in await rv.inner_text(), await rv.inner_text() if await rv.count() else 'no card')
    # the end of a game mentions the pattern so far
    await pg.evaluate("App.go('play')"); await pg.wait_for_timeout(300)
    await pg.locator('.rung', has_text='Pip').first.click(); await pg.wait_for_timeout(300)
    await pg.locator('button', has_text='Start game').click(); await pg.wait_for_timeout(600)
    await pg.locator('button[aria-label="Resign the game"]').click(); await pg.wait_for_timeout(300)
    await pg.locator('.sheet button', has_text='Resign').click(); await pg.wait_for_timeout(600)
    sheet = await pg.locator('.sheet').inner_text()
    check('the end of a game shows your pattern so far', 'Your pattern so far: you left a piece where it could be taken in 5 of your last 6 games' in sheet, sheet[:200])
    await ctx.close()
    # a saved topic is checked on load: a made-up one is dropped, a real one kept
    ctx = await browser.new_context(**DESK)
    await ctx.add_init_script("""(() => { try { if (!localStorage.getItem('__seeded')) { localStorage.setItem('__seeded', '1');
      const fen = 'rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2';
      localStorage.setItem('tempo:v1', JSON.stringify({ v: 1, mistakes: { items: [
        { id: 'gA-1', fen, played: 'd8h4', best: 'b8c6', kind: 'blunder', topic: 'nonsense', ts: 1, box: 0, due: 0, seen: 0 },
        { id: 'gB-1', fen, played: 'd8h4', best: 'b8c6', kind: 'blunder', topic: 'fork', ts: 1, box: 0, due: 0, seen: 0 } ] } })); } } catch (e) {} })()""")
    pg = await ctx.new_page(); pg.on('pageerror', lambda e: errors.append(str(e)[:200]))
    await pg.goto(TEMPO_URL); await pg.wait_for_function("() => window.App && App.name", timeout=30000)
    kept = await pg.evaluate("Store.state.mistakes.items.map(i => i.topic || null)")
    check('a saved topic is checked on load: a made-up one is dropped, a real one kept', kept == [None, 'fork'], kept)
    check('patterns: no page errors', not errors, errors[:3])
    await ctx.close()


async def test_ask_first(browser):
    errors = []
    ctx, pg = await page(browser, PHONE, errors)
    await bf4_game(pg, ask=True)
    t = await coach(pg)
    check('ask first: the coach asks you to find the piece in trouble, and draws nothing yet', t.startswith('Hold on.') and 'Tap it.' in t and 'Show me' in t and await pg.evaluate("document.querySelector('.board').__board.arrows.length") == 0, t)
    check('ask first: the game remembers the setting', await pg.evaluate("Store.state.current.ask === true && Store.state.settings.coachAsk === true"))
    await click_sq(pg, 'e2'); await pg.wait_for_timeout(300)
    t = await coach(pg)
    check('a wrong tap says so and asks again', t.startswith('Hold on. Not that one.') and await pg.evaluate("document.querySelector('.board').__board.marks.length") == 1, t)
    await click_sq(pg, 'f4'); await pg.wait_for_timeout(400)
    t = await coach(pg)
    check('the right tap is praised and then explained, with the reply drawn', t.startswith('You found it. This loses your bishop.') and 'Take it back' in t and await pg.evaluate("document.querySelector('.board').__board.arrows.length") == 1, t)
    await pg.locator('.coach button', has_text='Take it back').tap(); await pg.wait_for_timeout(500)
    check('taking it back clears the question and the marks', await pg.evaluate("Store.state.current.sans.length === 4 && !document.querySelector('.board').__board.opts.onSquare && document.querySelector('.board').__board.marks.length === 0"))
    # two wrong taps reveal the answer
    await click_sq(pg, 'c1'); await pg.wait_for_timeout(100); await click_sq(pg, 'f4')
    await pg.wait_for_selector('.coach.decide:not([hidden])', timeout=15000); await pg.wait_for_timeout(200)
    await click_sq(pg, 'a2'); await pg.wait_for_timeout(200); await click_sq(pg, 'h2'); await pg.wait_for_timeout(400)
    t = await coach(pg)
    check('two wrong taps reveal the answer', t.startswith('Not that one. This loses your bishop.'), t)
    await pg.locator('.coach button', has_text='Take it back').tap(); await pg.wait_for_timeout(500)
    # Show me skips the question
    await click_sq(pg, 'c1'); await pg.wait_for_timeout(100); await click_sq(pg, 'f4')
    await pg.wait_for_selector('.coach.decide:not([hidden])', timeout=15000); await pg.wait_for_timeout(200)
    await pg.locator('.coach button', has_text='Show me').tap(); await pg.wait_for_timeout(400)
    t = await coach(pg)
    check('Show me skips straight to the explanation', t.startswith('This loses your bishop.'), t)
    await pg.locator('.coach button', has_text='Play it anyway').tap(); await pg.wait_for_timeout(2500)
    check('playing it anyway goes on with the game', await pg.evaluate("Store.state.current.sans.length >= 5 && !document.querySelector('.board').__board.opts.onSquare"))
    await ctx.close()
    ctx, pg = await page(browser, DESK, errors)
    await bf4_game(pg, ask=False)
    t = await coach(pg)
    check('with Ask me first off (the default), the coach explains straight away', t.startswith('This loses your bishop.') and await pg.evaluate("Store.state.settings.coachAsk === false"), t)
    check('ask first: no page errors', not errors, errors[:3])
    await ctx.close()


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=CHROME, args=['--no-sandbox'])
        for t in (test_play_ladder, test_patterns, test_ask_first):
            try:
                await t(b)
            except Exception as e:
                check(t.__name__ + ' ran to the end', False, repr(e)[:300])
        await b.close()
    failed = [n for n, ok in results if not ok]
    print('\n%d checks, %d failed' % (len(results), len(failed)))
    for n in failed: print('  FAILED:', n)

asyncio.run(main())
