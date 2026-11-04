"""The end of a game and promotion, with a mouse and with a finger.
  - Promotion asks which piece: tapping the square opens the menu and the piece you pick is the piece you get (on a
    phone, the click the browser makes up after a tap used to land on the queen at once).
  - The end shows on the board first: a crown on the winner's king, # (checkmate), a flag (resigned) or a clock (time)
    on the loser's, a half on both for a draw, and the result above the buttons. The result sheet comes a moment
    later, so the tap that ended the game can't close it; closed, the result stays, and a tap on it opens it again.
    Looking back at an earlier move takes the marks away; back at the end, they return.
    python3 build/endgame_test.py
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

def game(fen, color='w', moves=(), sans=()):
    return """() => { Store.state.current = { id: 'end-' + Math.random(), bot: 'patrick-star', color: '%s', startFen: '%s', moves: %s, sans: %s,
      coach: false, ask: false, hanging: false, takebacks: true, clock: null, times: null, hints: 0, undos: 0, warned: 0, result: null, reason: null,
      startedAt: Date.now(), rematch: false, talk: null }; Store.touch(); Play.resume(); }""" % (color, fen, json.dumps(list(moves)), json.dumps(list(sans)))

STATE = """() => ({ sheet: !!document.querySelector('.sheet'), big: (document.querySelector('.sheet .big') || {}).textContent || null,
  card: (document.querySelector('.game-result .gr-title') || {}).textContent || null, why: (document.querySelector('.game-result .gr-why') || {}).textContent || null,
  cardSeen: (() => { const c = document.querySelector('.game-result'); if (!c) return false; const r = c.getBoundingClientRect(); return r.height > 0 && r.top >= 0 && r.bottom <= innerHeight; })(),
  marks: [...document.querySelectorAll('.badge')].map(b => { const sq = b.parentElement, B = document.querySelector('.board').__board;
    return { kind: b.className.replace('badge ', '').replace(/ edge-[a-z]/g, ''), inside: (() => { const r = b.getBoundingClientRect(), o = document.querySelector('.board').getBoundingClientRect(); return r.left >= o.left - 0.5 && r.right <= o.right + 0.5 && r.top >= o.top - 0.5 && r.bottom <= o.bottom + 0.5; })(), mark: b.textContent || (b.querySelector('.ic') ? b.querySelector('.ic').className.replace('ic ', '') : ''),
      piece: (B.pos.b[+sq.dataset.sq] || 0) }; }),
  buttons: [...document.querySelectorAll('.controls .btn')].map(b => b.textContent) })"""

async def xy(pg, sq):
    o = await pg.evaluate("document.querySelector('.board').__board.orient")
    box = await pg.locator('.board').first.bounding_box()
    f = ord(sq[0]) - 97; r = int(sq[1]) - 1
    x = (f if o == 'w' else 7 - f) + 0.5; y = (7 - r if o == 'w' else r) + 0.5
    return box['x'] + box['width'] * x / 8, box['y'] + box['height'] * y / 8

async def press(pg, sq, touch):
    x, y = await xy(pg, sq)
    if touch: await pg.touchscreen.tap(x, y)
    else: await pg.mouse.click(x, y)

async def move(pg, a, b, touch):
    await press(pg, a, touch); await pg.wait_for_timeout(250); await press(pg, b, touch)

async def main():
    async with async_playwright() as p:
        br = await p.chromium.launch(executable_path=CHROME, args=['--no-sandbox'])
        for name, vp, touch in (('phone', {'width': 390, 'height': 844}, True), ('desk', {'width': 1280, 'height': 860}, False)):
            kw = dict(viewport=vp)
            if touch: kw.update(has_touch=True, is_mobile=True)
            ctx = await br.new_context(**kw); pg = await ctx.new_page(); errors = []
            pg.on('pageerror', lambda e: errors.append(str(e)))
            await pg.goto(URL); await pg.wait_for_timeout(2000)
            await pg.evaluate("() => { const s = Store.state.settings; s.unlockAll = true; s.chat = 'off'; s.clock = 'none'; Store.touch('settings'); }")
            n = name + ': '

            # promotion: the menu opens and stays, and the piece picked is the piece played
            for piece, letter in (('Knight', 'n'), ('Rook', 'r')):
                # (black keeps a pawn, so a knight doesn't end the game as a draw on the spot)
                await pg.evaluate(game('8/1P6/8/8/8/7p/k7/4K3 w - - 0 1')); await pg.wait_for_timeout(1200)
                await move(pg, 'b7', 'b8', touch); await pg.wait_for_timeout(700)
                r = await pg.evaluate("({ menu: document.querySelectorAll('.promo-btn').length, moves: Store.state.current && Store.state.current.moves.slice() })")
                check(n + 'promotion asks which piece (' + piece.lower() + ')', r['menu'] == 4 and r['moves'] == [], r)
                bb = await pg.locator('.promo-btn[aria-label="%s"]' % piece).bounding_box()
                if touch: await pg.touchscreen.tap(bb['x'] + bb['width'] / 2, bb['y'] + bb['height'] / 2)
                else: await pg.mouse.click(bb['x'] + bb['width'] / 2, bb['y'] + bb['height'] / 2)
                await pg.wait_for_timeout(500)
                got = await pg.evaluate("Store.state.current && Store.state.current.moves[0]")
                check(n + 'and the ' + piece.lower() + ' is the piece you get', got == 'b7b8' + letter, got)
            # the menu closes without a move when you tap away
            await pg.evaluate(game('8/1P6/8/8/8/8/k7/4K3 w - - 0 1')); await pg.wait_for_timeout(1200)
            await move(pg, 'b7', 'b8', touch); await pg.wait_for_timeout(600)
            await press(pg, 'e4', touch); await pg.wait_for_timeout(500)
            r = await pg.evaluate("({ menu: document.querySelectorAll('.promo-btn').length, moves: Store.state.current && Store.state.current.moves.slice() })")
            check(n + 'tapping away from the menu plays nothing', r['menu'] == 0 and r['moves'] == [], r)

            # checkmate with a tap: the board first, the sheet a moment later, and it stays
            await pg.evaluate(game('6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1')); await pg.wait_for_timeout(1300)
            await move(pg, 'd1', 'd8', touch); await pg.wait_for_timeout(350)
            s = await pg.evaluate(STATE)
            check(n + 'the end shows on the board first (no sheet yet)', not s['sheet'], s)
            check(n + 'a crown on your king, # on theirs', sorted((m['kind'], m['mark'], m['piece']) for m in s['marks']) == [('k-end-lose', '#', -6), ('k-end-win', 'i-crown', 6)], s['marks'])
            check(n + 'the result above the buttons, in view', s['card'] == 'You won' and s['why'] == 'by checkmate' and s['cardSeen'] and s['buttons'] == ['Review game', 'Rematch'], s)
            await pg.wait_for_timeout(1500)
            s = await pg.evaluate(STATE)
            check(n + 'then the result sheet', s['sheet'] and s['big'] == 'You won', s)
            await pg.wait_for_timeout(1500)
            check(n + 'which stays open', (await pg.evaluate(STATE))['sheet'])
            await pg.keyboard.press('Escape'); await pg.wait_for_timeout(600)
            s = await pg.evaluate(STATE)
            check(n + 'closed, the result and the marks stay', not s['sheet'] and s['card'] == 'You won' and len(s['marks']) == 2, s)
            await pg.locator('.game-result').click(); await pg.wait_for_timeout(700)
            check(n + 'a tap on the result opens the sheet again', (await pg.evaluate(STATE))['sheet'])
            await pg.keyboard.press('Escape'); await pg.wait_for_timeout(500)

            # as black, on a flipped board: looking back takes the marks away, and they come back at the end
            await pg.evaluate(game('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', 'b', ['f2f3', 'e7e5', 'g2g4'], ['f3', 'e5', 'g4'])); await pg.wait_for_timeout(1300)
            await move(pg, 'd8', 'h4', touch); await pg.wait_for_timeout(2000)
            s = await pg.evaluate(STATE)
            check(n + 'mate as black: the crown on your king (black), # on white’s', sorted((m['kind'], m['piece']) for m in s['marks']) == [('k-end-lose', 6), ('k-end-win', -6)] and s['sheet'], s)
            await pg.keyboard.press('Escape'); await pg.wait_for_timeout(500)
            await pg.locator('.mv').first.click(); await pg.wait_for_timeout(300)
            check(n + 'looking at an earlier move: no end marks', (await pg.evaluate(STATE))['marks'] == [])
            await pg.locator('button', has_text='Back to the game').first.click(); await pg.wait_for_timeout(300)
            check(n + 'back at the end: the marks again', len((await pg.evaluate(STATE))['marks']) == 2)

            # stalemate: a half on both kings
            await pg.evaluate(game('7k/8/6Q1/8/8/8/8/K7 w - - 0 1')); await pg.wait_for_timeout(1300)
            await move(pg, 'g6', 'f7', touch); await pg.wait_for_timeout(400)
            s = await pg.evaluate(STATE)
            check(n + 'a mark in the corner of the board isn’t cut off', all(m['inside'] for m in s['marks']), s['marks'])
            check(n + 'stalemate: ½ on both kings, "Draw by stalemate"', [m['mark'] for m in s['marks']] == ['½', '½'] and s['card'] == 'Draw' and s['why'] == 'by stalemate', s)
            await pg.wait_for_timeout(1500); await pg.keyboard.press('Escape'); await pg.wait_for_timeout(500)

            # resigning: a flag on your king, the crown on theirs
            await pg.evaluate(game('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1', 'b')); await pg.wait_for_timeout(1300)
            await pg.locator('.controls .btn', has_text='Resign').click(); await pg.wait_for_timeout(600)
            await pg.locator('.sheet .btn', has_text='Resign').click(); await pg.wait_for_timeout(400)
            s = await pg.evaluate(STATE)
            check(n + 'resigning: a flag on your king, the crown on theirs', sorted((m['kind'], m['mark'], m['piece']) for m in s['marks']) == [('k-end-lose', 'i-flag', -6), ('k-end-win', 'i-crown', 6)] and s['card'] == 'You lost', s)
            await pg.wait_for_timeout(1500)
            check(n + 'and the sheet after it', (await pg.evaluate(STATE))['sheet'])
            await pg.screenshot(path=ROOT + '/build/shots/endgame-' + name + '.png')
            check(n + 'page errors', not errors, errors[:3])
            await ctx.close()
        await br.close()
    print('%d checks, %d failed' % (checks, len(fails)))
    if fails: raise SystemExit(1)

asyncio.run(main())
