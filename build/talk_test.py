"""The characters talking, in the page: hello and rematch lines, a blunder the referee confirms, the result line,
the line never covering the board (desk and phone, strip above and below the board), a game picked up again
going on where it was, takebacks, chat off, and the character sheet's About and How they play.
    python3 build/talk_test.py
"""
import asyncio, json, os
from playwright.async_api import async_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CHROME = os.environ.get('CHROME') or ('/usr/bin/google-chrome' if os.path.exists('/usr/bin/google-chrome') else None)
URL = os.environ.get('TEMPO_URL') or 'file://' + ROOT + '/dist/Tempo.html'
fails, checks = [], 0

def check(what, cond, extra=None):
    global checks
    checks += 1
    print(('PASS ' if cond else 'FAIL ') + what + ('' if cond or extra is None else '  ' + json.dumps(extra)[:400]))
    if not cond: fails.append(what)

async def click_sq(pg, sq):
    o = await pg.evaluate("document.querySelector('.board').__board.orient")
    box = await pg.locator('.board').first.bounding_box()
    f = ord(sq[0]) - 97; r = int(sq[1]) - 1
    x = (f if o == 'w' else 7 - f) + 0.5; y = (7 - r if o == 'w' else r) + 0.5
    await pg.mouse.click(box['x'] + box['width'] * x / 8, box['y'] + box['height'] * y / 8)

async def play(pg, uci):
    await click_sq(pg, uci[:2]); await pg.wait_for_timeout(80); await click_sq(pg, uci[2:4])

async def page(browser, w, h, errors):
    ctx = await browser.new_context(viewport={'width': w, 'height': h})
    pg = await ctx.new_page()
    pg.on('pageerror', lambda e: errors.append('pageerror: ' + str(e)))
    pg.on('console', lambda m: errors.append(m.type + ': ' + m.text[:200]) if m.type == 'error' else None)
    await pg.goto(URL); await pg.wait_for_timeout(2500)
    await pg.evaluate("""() => { const s = Store.state.settings; s.chat = 'lots'; s.botChat = true; s.unlockAll = true; s.coach = false; s.hanging = false;
      s.takebacks = true; s.clock = 'none'; Store.touch('settings'); }""")
    return ctx, pg

# a game set up by hand, as the store keeps it, from a position you choose
def crafted(bot, fen, color='w'):
    return """() => { Store.state.current = { id: 'talk-' + Math.random().toString(36).slice(2), bot: '%s', color: '%s', startFen: '%s', moves: [], sans: [],
      coach: false, ask: false, hanging: false, takebacks: true, clock: null, times: null, hints: 0, undos: 0, warned: 0, result: null, reason: null,
      startedAt: Date.now(), rematch: false, talk: null }; Store.touch(); Play.resume(); }""" % (bot, color, fen)

async def bubble(pg):
    return await pg.evaluate("""() => { const b = document.querySelector('.player .bubble'); if (!b || b.hidden) return null;
      const r = b.getBoundingClientRect(), q = document.querySelector('.board').getBoundingClientRect();
      return { text: b.textContent, top: r.top, bottom: r.bottom, left: r.left, right: r.right, bt: q.top, bb: q.bottom,
        overlaps: !(r.bottom <= q.top + 0.5 || r.top >= q.bottom - 0.5 || r.right <= q.left || r.left >= q.right) }; }""")

async def wait_bubble(pg, ms=6000, not_text=None):
    for _ in range(ms // 150):
        b = await bubble(pg)
        if b and (not_text is None or not_text not in b['text']): return b
        await pg.wait_for_timeout(150)
    return None

async def test_game(browser):
    errors = []
    ctx, pg = await page(browser, 1200, 860, errors)
    lines = await pg.evaluate("TempoTalk.voice('velma-dinkley').lines")
    # hello, in Velma's words, beside the board and not on it
    await pg.evaluate(crafted('velma-dinkley', 'rnbqkb1r/pppp1ppp/5n2/4p3/4P3/2N5/PPPP1PPP/R1BQKBNR w KQkq - 2 3'))
    b = await wait_bubble(pg)
    check('a new game opens with the character’s hello', b and lines['greeting'] in b['text'], b)
    check('the line is beside the board, not on it (desk)', b and not b['overlaps'], b)
    # you hang your queen; she takes it, and the referee backs her remark
    await pg.wait_for_timeout(2400)
    await play(pg, 'd1h5')
    said = None
    for _ in range(60):
        await pg.wait_for_timeout(200)
        cur = await pg.evaluate("Store.state.current && Store.state.current.moves")
        b = await bubble(pg)
        if cur and len(cur) >= 2 and b and lines['greeting'] not in b['text']: said = b; break
    took = await pg.evaluate("Store.state.current && Store.state.current.moves[1]")
    log = await pg.evaluate("Store.state.current && Store.state.current.talk && Store.state.current.talk.log")
    check('she takes the queen', took == 'f6h5', took)
    check('and calls it the blunder it was (the referee agreed)', said and lines['opponent_blunder'] in said['text'], {'said': said, 'log': log})
    # picked up again after a reload: no second hello, the log is kept
    before = await pg.evaluate("JSON.stringify(Store.state.current.talk)")
    await pg.reload(); await pg.wait_for_timeout(2500)
    await pg.evaluate("Play.resume()"); await pg.wait_for_timeout(1200)
    b = await bubble(pg)
    after = await pg.evaluate("JSON.stringify(Store.state.current && Store.state.current.talk)")
    check('a game picked up again doesn’t say hello twice', not b or lines['greeting'] not in b['text'], b)
    check('and keeps what was said', before == after, {'before': before, 'after': after})
    # a takeback: the log follows the moves on the board
    await play(pg, 'f1c4'); await pg.wait_for_timeout(2600)
    n = await pg.evaluate("Store.state.current.moves.length")
    await pg.locator('button[aria-label="Take back your last move"]').click(); await pg.wait_for_timeout(1500)
    t = await pg.evaluate("({ n: Store.state.current.moves.length, log: Store.state.current.talk.log })")
    check('a takeback cuts the story back to the board', all(x[0] <= t['n'] for x in t['log']) and t['n'] < n, t)
    # resign: her word on the result is on the end sheet
    await pg.locator('button[aria-label="Resign the game"]').click(); await pg.wait_for_timeout(300)
    await pg.locator('.sheet button', has_text='Resign').last.click(); await pg.wait_for_timeout(900)
    end = await pg.locator('.sheet').inner_text()
    check('the end sheet has her line for winning', lines['victory'] in end, end[:300])
    # rematch: the first thing she says is her rematch line
    await pg.locator('.sheet button', has_text='Rematch').click(); await pg.wait_for_timeout(400)
    await pg.locator('.sheet button', has_text='Start game').click()
    b = await wait_bubble(pg)
    check('a rematch starts with the rematch line', b and lines['rematch'] in b['text'], b)
    check('page errors', not errors, errors[:4])
    await ctx.close()

async def test_layout(browser):
    for name, w, h in (('phone', 390, 844), ('small phone', 360, 640), ('phone on its side', 844, 390), ('desk', 1366, 768)):
        errors = []
        ctx, pg = await page(browser, w, h, errors)
        await pg.evaluate(crafted('lisa-simpson', 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'))
        b = await wait_bubble(pg)
        long = await pg.evaluate("TempoTalk.voice('dr-eggman').lines.queen_lost + ' ' + TempoTalk.voice('lisa-simpson').lines.greeting")
        check(name + ': the hello shows', b is not None)
        check(name + ': above the board, it grows up and stays off the board', b and not b['overlaps'] and b['bottom'] <= b['bt'] + 0.5, b)
        await pg.evaluate("(t) => Play._say(t)", long); await pg.wait_for_timeout(2600)
        b = await bubble(pg)
        check(name + ': a long line stays off the board too', b and not b['overlaps'], b)
        await pg.locator('button[aria-label="Flip the board"]').click(); await pg.wait_for_timeout(400)
        await pg.evaluate("(t) => Play._say(t)", long); await pg.wait_for_timeout(2600)
        b = await bubble(pg)
        check(name + ': below the board, it grows down and stays off it', b and not b['overlaps'] and b['top'] >= b['bb'] - 0.5, b)
        await pg.screenshot(path=ROOT + '/build/shots/talk-' + name.replace(' ', '-') + '.png')
        check(name + ': page errors', not errors, errors[:3])
        await ctx.close()

async def test_off(browser):
    errors = []
    ctx, pg = await page(browser, 1200, 860, errors)
    await pg.evaluate("Store.state.settings.chat = 'off'; Store.state.settings.botChat = false; Store.touch('settings')")
    await pg.evaluate(crafted('goofy', 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'))
    await pg.wait_for_timeout(800)
    await play(pg, 'e2e4'); await pg.wait_for_timeout(2600)
    await play(pg, 'g1f3'); await pg.wait_for_timeout(2600)
    b = await bubble(pg)
    t = await pg.evaluate("Store.state.current && Store.state.current.talk")
    check('chat off: the character says nothing', b is None and (not t or not t['log']), {'b': b, 't': t})
    check('chat off: page errors', not errors, errors[:3])
    await ctx.close()

async def test_sheet(browser):
    errors = []
    ctx, pg = await page(browser, 1200, 860, errors)
    await pg.evaluate("App.go('play')"); await pg.wait_for_timeout(300)
    await pg.locator('.tier-fold', has_text='The Contenders').click(); await pg.wait_for_timeout(450)
    await pg.locator('#tier-B .char', has_text='Wednesday').click(); await pg.wait_for_timeout(400)
    sheet = await pg.locator('.sheet').inner_text()
    card = await pg.evaluate("TempoTalk.voice('wednesday-addams').card")
    check('About: who she is, Tempo’s take, why she plays this way, her running joke', all(x in sheet for x in ['Who they are', card['canon'][:40], 'Tempo’s take', card['assessment'][:30], 'Why Wednesday Addams plays this way', 'Running joke', card['bit'][:30]]), sheet[:600])
    check('a few of her lines, with what they’re for', 'Saying hello' in sheet and 'After winning' in sheet, sheet[:800])
    check('the sheet says what comes from her story and what Tempo made up', 'made up for Tempo' in sheet and 'From The Addams Family' in sheet, sheet[:300])
    await pg.locator('.sheet .seg button', has_text='How they play').click(); await pg.wait_for_timeout(200)
    sheet2 = await pg.locator('.sheet').inner_text()
    check('How they play: plan, tricks, weak spot, openings and the radar', all(x in sheet2 for x in ['How Wednesday Addams plays', 'Favorite tricks', 'Weak spot', 'Against 1.e4']) and await pg.evaluate("document.querySelectorAll('.sheet svg.radar text.lbl').length === 7"), sheet2[:300])
    await pg.locator('.sheet button', has_text='Start game').click(); await pg.wait_for_timeout(600)
    check('the sheet still starts a game', await pg.evaluate("!!Store.state.current && Store.state.current.bot === 'wednesday-addams'"))
    check('sheet: page errors', not errors, errors[:3])
    await ctx.close()

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=CHROME, args=['--no-sandbox'])
        os.makedirs(ROOT + '/build/shots', exist_ok=True)
        await test_game(b)
        await test_layout(b)
        await test_off(b)
        await test_sheet(b)
        await b.close()
    print('%d checks, %d failed' % (checks, len(fails)))
    if fails: raise SystemExit(1)

asyncio.run(main())
