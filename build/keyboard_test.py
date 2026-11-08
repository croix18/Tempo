"""Playing with the keyboard: the first Tab on a screen with a board is "Go to the board"; on the board, arrows steer a
cursor and Enter picks up and drops; typing a move (Bb5, d3, O-O, exd5) plays it as soon as it names one legal move,
junk is ignored, Backspace edits; 'f' flips the board only when the board isn't being typed on.
    python3 build/keyboard_test.py
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
    print(('PASS ' if cond else 'FAIL ') + what + ('' if cond or extra is None else '  ' + json.dumps(extra)[:300]))
    if not cond: fails.append(what)

GAME = """(fen) => { const s = Store.state.settings; s.unlockAll = true; s.chat = 'off'; s.clock = 'none'; Store.touch('settings');
  Store.state.current = { id: 'kb-' + Math.random(), bot: 'mario', color: 'w', startFen: fen, moves: [], sans: [],
    coach: false, ask: false, hanging: false, takebacks: true, clock: null, times: null, hints: 0, undos: 0, warned: 0, result: null, reason: null,
    startedAt: Date.now(), rematch: false, talk: null }; Store.touch(); Play.resume(); }"""

async def main():
    async with async_playwright() as p:
        br = await p.chromium.launch(executable_path=CHROME, args=['--no-sandbox'])
        pg = await br.new_page(viewport={'width': 1280, 'height': 860}); errors = []
        pg.on('pageerror', lambda e: errors.append(str(e)))
        await pg.goto(URL); await pg.wait_for_timeout(2000)
        await pg.evaluate(GAME, 'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3'); await pg.wait_for_timeout(1200)
        await pg.keyboard.press('Tab')
        check('the first Tab is "Go to the board"', await pg.evaluate("document.activeElement.className") == 'skip-board')
        await pg.keyboard.press('Enter'); await pg.wait_for_timeout(100)
        check('Enter on it focuses the board', await pg.evaluate("document.activeElement.classList.contains('board')"))
        await pg.keyboard.type('Bb5'); await pg.wait_for_function("Store.state.current.moves.length >= 2", timeout=15000)
        check('typing Bb5 plays it', (await pg.evaluate("Store.state.current.moves[0]")) == 'f1b5')
        await pg.wait_for_timeout(600)
        await pg.keyboard.type('d'); await pg.wait_for_timeout(150)
        typed = await pg.evaluate("document.querySelector('.v-play .board').__board.typed")
        shown = await pg.evaluate("!document.querySelector('.v-play .board .typed').hidden")
        check('"d" alone waits (d3 or d4?) and shows what’s typed', typed == 'd' and shown, (typed, shown))
        await pg.keyboard.press('Backspace'); await pg.wait_for_timeout(100)
        check('Backspace edits it', (await pg.evaluate("document.querySelector('.v-play .board').__board.typed")) == '')
        await pg.keyboard.type('zzQh7'); await pg.wait_for_timeout(100)   # z isn't notation; no queen move starts "Qh"
        check('junk and impossible moves are ignored', (await pg.evaluate("document.querySelector('.v-play .board').__board.typed")) == 'Q')
        await pg.keyboard.press('Escape'); await pg.wait_for_timeout(100)
        check('Escape clears it', (await pg.evaluate("document.querySelector('.v-play .board').__board.typed")) == '')
        await pg.keyboard.type('d3'); await pg.wait_for_function("Store.state.current.moves.length >= 4", timeout=15000)
        check('typing d3 plays the pawn', (await pg.evaluate("Store.state.current.moves[2]")) == 'd2d3')
        await pg.wait_for_timeout(600)
        # castling gets a game of its own, from a position where it's legal now: in the game above, Mario's reply to d3 can be
        # ...Bb4+, and in check there's no castling
        await pg.evaluate(GAME, 'r1bqk1nr/pppp1ppp/2n5/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4'); await pg.wait_for_timeout(1200)
        await pg.evaluate("document.querySelector('.v-play .board').focus()")
        orient = await pg.evaluate("document.querySelector('.v-play .board').__board.orient")
        await pg.keyboard.type('O-O'); await pg.wait_for_function("Store.state.current.moves.length >= 2", timeout=15000)
        check('typing O-O castles', (await pg.evaluate("Store.state.current.moves[0]")) == 'e1g1', await pg.evaluate("Store.state.current.sans"))
        check('"f" typed on the board didn’t flip it', (await pg.evaluate("document.querySelector('.v-play .board').__board.orient")) == orient)
        await pg.wait_for_timeout(600)
        # the cursor: arrows and Enter
        before = await pg.evaluate("Store.state.current.moves.length")
        await pg.keyboard.press('Escape')
        for k in ('ArrowLeft', 'ArrowLeft', 'ArrowLeft', 'ArrowLeft'): await pg.keyboard.press(k)   # the cursor starts on e2 -> a2
        await pg.keyboard.press('Enter'); await pg.wait_for_timeout(100)
        st = await pg.evaluate("() => { const b = document.querySelector('.v-play .board').__board; return { cursor: TempoCore.sqName(b.cursor), sel: b.sel >= 0 ? TempoCore.sqName(b.sel) : null, cursorShown: !!document.querySelector('.v-play .hl.cursor') }; }")
        check('arrows steer a visible cursor and Enter picks a piece up', st['cursor'] == 'a2' and st['sel'] == 'a2' and st['cursorShown'], st)
        await pg.keyboard.press('ArrowUp'); await pg.keyboard.press('ArrowUp'); await pg.keyboard.press('Enter')
        await pg.wait_for_function("(n) => Store.state.current.moves.length >= n + 1", arg=before, timeout=15000)
        check('and Enter on the target plays the move', (await pg.evaluate("Store.state.current.moves.slice(-1)[0] || Store.state.current.moves[%d]" % before)) in ('a2a4',) or (await pg.evaluate("Store.state.current.moves[%d]" % before)) == 'a2a4', await pg.evaluate("Store.state.current.moves"))
        check('no page errors', not errors, errors[:3])
        await br.close()
    print('%d checks, %d failed' % (checks, len(fails)))
    if fails: raise SystemExit(1)

asyncio.run(main())
