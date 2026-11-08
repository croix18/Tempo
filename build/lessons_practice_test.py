"""Lessons that make you practice: the practice round of puzzles at the end of a tactics lesson, trap lessons (watch it, set it,
dodge it, set it from memory), the line, safe and game steps, and the spaced review that brings every finished lesson back
(boxes of 1, 3, 7, 16 and 35 days; a miss means tomorrow), with its entry points on Learn, Home, Trainers and Openings.
    python3 build/lessons_practice_test.py
"""
import asyncio, json, os, re
from playwright.async_api import async_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CHROME = os.environ.get('CHROME') or ('/usr/bin/google-chrome' if os.path.exists('/usr/bin/google-chrome') else None)
URL = os.environ.get('TEMPO_URL') or 'file://' + ROOT + '/dist/Tempo.html'
fails, checks = [], 0

def check(what, cond, extra=None):
    global checks
    checks += 1
    print(('PASS ' if cond else 'FAIL ') + what + ('' if cond or extra is None else '  ' + json.dumps(extra, default=str)[:400]), flush=True)
    if not cond: fails.append(what)

async def click_sq(pg, sq):
    o = await pg.evaluate("document.querySelector('.view .board').__board.orient")
    box = await pg.locator('.view .board').first.bounding_box()
    f = ord(sq[0]) - 97; r = int(sq[1]) - 1
    x = (f if o == 'w' else 7 - f) + 0.5; y = (7 - r if o == 'w' else r) + 0.5
    await pg.mouse.click(box['x'] + box['width'] * x / 8, box['y'] + box['height'] * y / 8)

async def play(pg, u):
    await click_sq(pg, u[:2]); await pg.wait_for_timeout(80); await click_sq(pg, u[2:4])
    if len(u) == 5:
        await pg.wait_for_timeout(200)
        names = {'q': 'Queen', 'r': 'Rook', 'b': 'Bishop', 'n': 'Knight'}
        btn = pg.locator('.promo-btn[aria-label="%s"]' % names[u[4]])
        if await btn.count(): await btn.click()

async def movable(pg, t=15000):
    await pg.wait_for_function("() => { const b = document.querySelector('.view .board'); return b && b.__board.canMove(); }", timeout=t)

CUR = "Learn._cur()"
NEXT = """() => { const L = Learn._cur(), s = Learn._steps()[L.i], p = document.querySelector('.view .board').__board.pos;
  const u = m => m ? TempoCore.uci(m) : null, strip = x => x.replace(/[+#!?]/g, '');
  if (s.t === 'move') return s.line[L.ply];
  if (s.t === 'line') return L.free ? null : u(p.parseMove(s.moves[L.played.length]));
  if (s.t === 'safe') return s.aim && s.aim.length ? u(p.parseMove(s.aim[0])) : null;
  if (s.t === 'game' && L.inBook) { for (const ln of s.lines) if (ln.length > L.played.length && L.played.every((x, i) => strip(ln[i]) === strip(x))) return u(p.parseMove(ln[L.played.length])); }
  return null; }"""

async def best(pg):
    fen = await pg.evaluate("document.querySelector('.view .board').__board.pos.fen()")
    return await pg.evaluate("(f) => Engines.analyse({fen: f, depth: 14, movetime: 1200}).then(r => r.best)", fen)

async def solve_step(pg, limit=60):
    for k in range(limit):
        c = await pg.evaluate(CUR)
        if c['complete']: return c
        if c['t'] == 'walk':
            await pg.locator('.lesson-actions button.btn.primary').click(); await pg.wait_for_timeout(700); continue
        if c['t'] == 'quiz':
            a = await pg.evaluate("Learn._steps()[Learn._cur().i].answer")
            await pg.locator('.choice[data-k="%d"]' % a).click(); await pg.wait_for_timeout(250); continue
        if c['t'] == 'pick':
            for q in await pg.evaluate("Learn._steps()[Learn._cur().i].squares"): await click_sq(pg, q); await pg.wait_for_timeout(50)
            await pg.locator('button', has_text='Check').click(); await pg.wait_for_timeout(250); continue
        try: await movable(pg)
        except Exception:
            c = await pg.evaluate(CUR)
            if c['complete']: return c
            raise
        mv = await pg.evaluate(NEXT) or await best(pg)
        await play(pg, mv); await pg.wait_for_timeout(900)
    for k in range(30):
        c = await pg.evaluate(CUR)
        if c['complete']: break
        await pg.wait_for_timeout(300)
    return await pg.evaluate(CUR)

async def next_btn(pg):
    await pg.locator('.lesson-actions button.btn.primary').click(); await pg.wait_for_timeout(400)

async def feedback(pg):
    return await pg.locator('.view .feedback').last.inner_text() if await pg.locator('.view .feedback').count() else ''

TEST_LESSON = """() => { const us = Data.lessons(); if (us.some(u => u.id === 'zz')) return;
  us.push({ id: 'zz', title: 'Test unit', summary: 'For the test.', lessons: [{ id: 'zz-game', title: 'Game test', summary: 'A test lesson.', steps: [
   { t: 'walk', moves: 'e4 e5 Nf3', orient: 'w', text: 'Intro text', notes: { 0: 'Note on e4.', 2: 'Note on Nf3.' }, end: 'The end text.' },
   { t: 'safe', moves: 'e4 e5 Nf3 Nc6 Bc4 Bc5 c3 Nf6', side: 'w', text: 'Protect e4.', aim: ['d3'], note: 'd3 keeps the center solid.' },
   { t: 'game', side: 'w', lines: ['e4 e5 Nf3 Nc6 Bc4 Bc5 c3 Nf6 d3', 'e4 e5 Nf3 Nc6 Bc4 Nf6 d3 Be7'], until: 7, text: 'Play it.', done: 'Well done.' } ] }] }); }"""

async def fresh(b, init=None):
    pg = await b.new_page(viewport={'width': 1280, 'height': 900})
    errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.on('console', lambda m: errs.append(m.type + ': ' + m.text[:200]) if m.type == 'error' else None)
    if init: await pg.add_init_script(init)
    await pg.goto(URL)
    await pg.wait_for_function("window.App && (Engines.status === 'ready' || Engines.status === 'failed')", timeout=60000)
    await pg.evaluate("Store.state.settings.unlockAll = true")
    return pg, errs

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=CHROME, args=['--no-sandbox'])

        # ---------- the practice round ----------
        pg, errs = await fresh(b)
        await pg.evaluate("Learn.open('fork')"); await pg.wait_for_timeout(1500)
        steps = await pg.evaluate("Learn._steps()")
        practice = [s for s in steps if s.get('puzzle')]
        base = await pg.evaluate("Data.lesson('fork').lesson.steps.length")
        check('a tactics lesson ends with a practice round of 5 fork puzzles', len(practice) == 5 and len(steps) == base + 5 and all(s.get('pre') for s in practice), [s.get('puzzle') for s in steps])
        dots = await pg.evaluate("document.querySelectorAll('.view .stepper i.pr').length")
        check('the practice round shows in the stepper', dots == 5, dots)
        ratings = await pg.evaluate("(ids) => Data.puzzles().then(l => ids.map(id => l.find(p => p.id === id)).map(p => [p.rating, p.themes.includes('fork')]))", [s['puzzle'] for s in practice])
        check('practice puzzles are on the lesson’s idea, easiest first, and not far above a beginner', all(t for _, t in ratings) and [r for r, _ in ratings] == sorted(r for r, _ in ratings) and max(r for r, _ in ratings) <= 1700, ratings)
        for i in range(base): await solve_step(pg); await next_btn(pg)
        c = await pg.evaluate(CUR)
        label = await pg.locator('.view .card .faint.small').first.inner_text()
        check('the first practice puzzle is labeled Practice 1 of 5 and starts with the other side’s move', c['i'] == base and label.startswith('Practice 1 of 5'), [c, label])
        await movable(pg)
        moved = await pg.evaluate("document.querySelector('.view .board').__board.pos.fen() !== Learn._steps()[Learn._cur().i].fen")
        check('the opponent’s move was played before your turn', moved)
        # a wrong move in the first puzzle, then solve them all
        right = await pg.evaluate(NEXT)
        bad = await pg.evaluate("(r) => { const p = document.querySelector('.view .board').__board.pos; return p.legalMoves().map(m => TempoCore.uci(m)).filter(u => u !== r)[0]; }", right)
        await play(pg, bad); await pg.wait_for_timeout(1300)
        check('a wrong move in practice is a miss', (await pg.evaluate(CUR))['mistakes'] == 1)
        for i in range(5): await solve_step(pg); await next_btn(pg)
        sheet = await pg.locator('.sheet').inner_text()
        check('the end card counts the practice round and says the lesson comes back tomorrow',
              'Practice: 4 of 5 solved on the first try.' in sheet and 'comes back for a short review tomorrow' in sheet and 'No mistakes and no hints.' in sheet, sheet[:400])
        mem = await pg.evaluate("Learn._mem()['fork']")
        tomorrow = await pg.evaluate("(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime(); })()")
        check('the finished lesson is scheduled: box 1, due at midnight tonight', mem and mem['box'] == 1 and mem['due'] == tomorrow, mem)
        check('no page errors (practice round)', not errs, errs[:3])
        await pg.close()

        # ---------- a trap lesson ----------
        pg, errs = await fresh(b)
        await pg.evaluate("Learn.open('trap-blackburne-shilling', 'openings')"); await pg.wait_for_timeout(500)
        types = [s['t'] for s in await pg.evaluate("Learn._steps()")]
        crumb = await pg.locator('.view .back').first.inner_text()
        check('a trap lesson: watch it, set it, dodge it, set it from memory', types == ['walk', 'line', 'safe', 'line'], types)
        check('opened from Openings, its back link goes to Openings', crumb.strip() == 'Openings', crumb)
        await solve_step(pg); await next_btn(pg)
        st = (await pg.evaluate("Learn._steps()"))[1]
        await movable(pg)
        arrows = await pg.evaluate("document.querySelectorAll('.view .board .arrows line, .view .board svg.arrows path, .view .board .arrow').length")
        fbt = await feedback(pg)
        check('Set it: you play the trap-setter’s side, guided move by move', st['side'] == 'b' and st['guide'] and fbt.startswith('Play '), [st['side'], fbt])
        await solve_step(pg)
        c = await pg.evaluate(CUR)
        check('Set it: the line plays out to the checkmate', c['complete'] and c['played'][-1] == 'Nf3#', c['played'])
        await next_btn(pg)
        s3 = (await pg.evaluate("Learn._steps()"))[2]
        await movable(pg)
        orient = await pg.evaluate("document.querySelector('.view .board').__board.orient")
        bait = await pg.evaluate("(san) => TempoCore.uci(document.querySelector('.view .board').__board.pos.parseMove(san))", s3['bait'])
        check('Dodge it: you’re the other side, at the moment the bait is offered', s3['side'] == 'w' and orient == 'w' and (await pg.evaluate(CUR))['played'][-1] == 'Nd4', [s3['side'], orient])
        await play(pg, bait); await pg.wait_for_timeout(9500)
        c = await pg.evaluate(CUR)
        check('taking the bait plays out the punishment and offers a retry', c['played'][-1] == 'Nf3#' and await pg.locator('button', has_text='Try again').count() == 1 and c['mistakes'] >= 1, c['played'])
        fbt = await feedback(pg)
        check('then it says what the bait cost', fbt.startswith('That lets Black give checkmate.'), fbt)
        await pg.locator('button', has_text='Try again').click()
        await movable(pg)
        await pg.locator('.view button', has_text='Hint').click(); await pg.wait_for_timeout(200)
        h1 = await feedback(pg)
        await pg.locator('.view button', has_text='Hint').click(); await pg.wait_for_timeout(200)
        h2 = await feedback(pg)
        arrows2 = await pg.evaluate("document.querySelector('.view .board').__board.arrows ? document.querySelector('.view .board').__board.arrows.length : -1")
        check('Hint: first the piece, then the move', h1 == 'Move your knight on f3.' and h2 == 'One good move here is Nxd4.' and arrows2 == 1, [h1, h2, arrows2])
        await play(pg, 'f3d4'); await pg.wait_for_timeout(300)
        for k in range(30):
            if (await pg.evaluate(CUR))['complete']: break
            await pg.wait_for_timeout(300)
        fbt = await feedback(pg)
        check('a safe move is accepted and the reason is given', (await pg.evaluate(CUR))['complete'] and (fbt.startswith('Safe.') or fbt.startswith('That’s safe too.')), fbt)
        await next_btn(pg)
        await movable(pg)
        right = await pg.evaluate(NEXT)
        bad = await pg.evaluate("(r) => { const p = document.querySelector('.view .board').__board.pos; return p.legalMoves().map(m => TempoCore.uci(m)).filter(u => u !== r)[0]; }", right)
        await play(pg, bad); await pg.wait_for_timeout(500)
        f1 = await feedback(pg)
        await play(pg, bad); await pg.wait_for_timeout(500)
        f2 = await feedback(pg)
        check('From memory: no arrows; a wrong move is caught, the second time the move is shown',
              'not the move in this line' in f1 and f2.startswith('This line plays'), [f1, f2])
        await solve_step(pg); await next_btn(pg)
        done = await pg.evaluate("Store.state.learn.done['trap-blackburne-shilling']")
        check('the trap lesson is done, with stars for the misses', done and done['stars'] < 3, done)
        # a trap told from the setter's side: its notes don't talk to you while you dodge it
        await pg.evaluate("App.go('learn', { lesson: 'trap-petrov-copycat', step: 2 })"); await pg.wait_for_timeout(300)
        await movable(pg)
        before = await pg.locator('.view .lesson-text').inner_text()
        await play(pg, 'e4f6')
        await pg.wait_for_selector('.view button:has-text("Try again")', timeout=20000)
        after = await pg.locator('.view .lesson-text').inner_text(); fbt = await feedback(pg)
        check('Dodge it, setter-side trap: the text stays yours, and the cost counts your recapture', after == before and before.startswith('Dodge it.') and fbt.startswith('You lost a queen for a knight.'), [after[:60], fbt])
        # quiz choices come in a new order
        seen = set()
        for k in range(12):
            await pg.evaluate("App.go('learn', { lesson: 'italian-first-moves', step: 2 })"); await pg.wait_for_timeout(120)
            ks = await pg.evaluate("[...document.querySelectorAll('.view .choice')].map(b => b.dataset.k)")
            seen.add(ks.index('0') if '0' in ks else -1)
        check('quiz choices are shuffled each time', len(seen) >= 2 and -1 not in seen, seen)
        check('no page errors (trap lesson)', not errs, errs[:3])
        await pg.close()

        # ---------- walk, safe and game steps ----------
        pg, errs = await fresh(b)
        await pg.evaluate(TEST_LESSON)
        await pg.evaluate("Learn.open('zz-game')"); await pg.wait_for_timeout(400)
        texts = []
        for i in range(5):
            texts.append(await pg.locator('.lesson-text').inner_text())
            if (await pg.evaluate(CUR))['complete']: break
            await pg.locator('.lesson-actions button.btn.primary').click(); await pg.wait_for_timeout(1300)
        check('walk: the intro, then the note on each move that has one, then the takeaway', texts[0] == 'Intro text' and 'Note on e4.' in texts[1] and 'The end text.' in texts[-1], texts)
        await next_btn(pg)
        await movable(pg)
        await play(pg, 'h2h4'); await pg.wait_for_timeout(300)
        for k in range(30):
            if not (await pg.evaluate(CUR))['checking']: break
            await pg.wait_for_timeout(250)
        f = await feedback(pg)
        check('safe: a move that drops the e4 pawn is turned down with the reason', 'Try another move' in f and 'e4' in f, f)
        await movable(pg)
        await play(pg, 'd2d3'); await pg.wait_for_timeout(300)
        for k in range(30):
            if (await pg.evaluate(CUR))['complete']: break
            await pg.wait_for_timeout(250)
        check('safe: the planned move is praised with the note', (await feedback(pg)).startswith('Yes. d3 keeps the center solid.'), await feedback(pg))
        await next_btn(pg)
        await movable(pg)
        stepno = await pg.locator('.view .panel .card > .faint.small').first.inner_text()
        check('game: the step says which move you are on', stepno.endswith('· move 1 of 7'), stepno)
        await play(pg, 'a2a3'); await pg.wait_for_timeout(500)
        f = await feedback(pg)
        check('game: a move off your line is corrected while the game is in the lines', f.startswith('Your line plays e4 here.'), f)
        c = await solve_step(pg, 40)
        f = await feedback(pg)
        check('game: you follow the lines, play on alone to move 7, and pass', c['complete'] and 'You followed your lines' in f and 'Well done.' in f, [c, f])
        check('no page errors (step types)', not errs, errs[:3])
        await pg.close()

        # ---------- review ----------
        pg, errs = await fresh(b)
        await pg.evaluate("""() => { const S = Store.state.learn; ['fork', 'pin', 'attacked-defended', 'center', 'trap-blackburne-shilling', 'free-pieces', 'skewer'].forEach(id => S.done[id] = { stars: 2, ts: Date.now() - 9e8 }); Store.touch('learn'); }""")
        await pg.evaluate("App.go('learn')"); await pg.wait_for_timeout(500)
        mem = await pg.evaluate("Learn._mem()")
        now = await pg.evaluate("Date.now()")
        due_now = sorted(k for k, v in mem.items() if v['due'] <= now)
        check('lessons finished before reviews existed join the schedule: three due today, the rest spread over the next days',
              len(mem) == 7 and len(due_now) == 3 and all(v['box'] == 1 for v in mem.values()), mem)
        card = await pg.locator('.view .review-due').inner_text() if await pg.locator('.view .review-due').count() else ''
        check('Learn shows what’s due and how long it takes', card.startswith('Review: 3 lessons are due.') and 'minute' in card, card)
        await pg.evaluate("App.go('home')"); await pg.wait_for_timeout(500)
        home = await pg.locator('.view').inner_text()
        check('Home lists the review', 'Review 3 lessons so they stick' in home, home[:300])
        await pg.evaluate("App.go('train')"); await pg.wait_for_timeout(300)
        tr = await pg.locator('.view').inner_text()
        check('Trainers lists the review', 'Lesson review' in tr and '3 lessons due' in tr, tr[:300])
        await pg.evaluate("App.go('learn')"); await pg.wait_for_timeout(300)
        await pg.locator('.view .review-due button', has_text='Start review').click(); await pg.wait_for_timeout(1500)
        steps = await pg.evaluate("Learn._steps()")
        froms = [s['from'] for s in steps]
        check('a review mixes the due lessons, never the same one twice in a row',
              set(froms) == set(due_now) and all(froms[i] != froms[i + 1] for i in range(len(froms) - 1)), froms)
        first_of = {}
        for i, s in enumerate(steps): first_of.setdefault(s['from'], i)
        miss_lesson = steps[1]['from']
        for i in range(len(steps)):
            if i == 1:
                await movable(pg) if steps[i]['t'] in ('move', 'line', 'safe') else None
                if steps[i]['t'] == 'quiz':
                    a = steps[i]['answer']; await pg.locator('.choice[data-k="%d"]' % ((a + 1) % len(steps[i]['choices']))).click(); await pg.wait_for_timeout(200)
                elif steps[i]['t'] == 'pick':
                    await click_sq(pg, 'a1' if 'a1' not in steps[i]['squares'] else 'h8'); await pg.locator('button', has_text='Check').click(); await pg.wait_for_timeout(200)
                else:
                    right = await pg.evaluate(NEXT)
                    bad = await pg.evaluate("(r) => { const p = document.querySelector('.view .board').__board.pos; return p.legalMoves().map(m => TempoCore.uci(m)).filter(u => u !== r).slice(-1)[0]; }", right)
                    await play(pg, bad); await pg.wait_for_timeout(6000)
            await solve_step(pg); await next_btn(pg)
        sheet = await pg.locator('.sheet').inner_text()
        mem = await pg.evaluate("Learn._mem()")
        three = await pg.evaluate("(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 3).getTime(); })()")
        tomorrow = await pg.evaluate("(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime(); })()")
        good = [k for k in due_now if k != miss_lesson]
        check('right: up a box, back in 3 days; a miss: back to box 1, tomorrow',
              all(mem[k]['box'] == 2 and mem[k]['due'] == three and mem[k]['n'] == 1 and mem[k]['ok'] == 1 for k in good) and mem[miss_lesson]['box'] == 1 and mem[miss_lesson]['due'] == tomorrow and mem[miss_lesson]['ok'] == 0, mem)
        check('the end card says how each lesson went and when it comes back', 'Review done' in sheet and '2 of 3 lessons right.' in sheet and 'Back tomorrow for another try.' in sheet and 'Next review in 3 days.' in sheet, sheet[:400])
        await pg.locator('.sheet button', has_text='Done').click(); await pg.wait_for_timeout(300)
        await pg.evaluate("Data.lessons().forEach(u => u.lessons.forEach(l => {}))")
        rows = await pg.evaluate("Array.from(document.querySelectorAll('.view .lesson-row .mem')).map(e => e.textContent)")
        check('nothing is due after the review', await pg.locator('.view .review-due').count() == 0)
        # locked in: four reviews in a row
        await pg.evaluate("() => { const r = Store.state.learn.mem.pin; r.box = 3; Learn._grade('pin', true); App.go('learn'); }"); await pg.wait_for_timeout(300)
        await pg.evaluate("() => { document.querySelectorAll('.view .unit-body').forEach(b => b.classList.add('open')); }")
        lk = await pg.evaluate("Array.from(document.querySelectorAll('.view .lesson-row')).filter(r => r.textContent.includes('Pins')).map(r => r.textContent)")
        head = await pg.locator('.view .page-head').inner_text()
        check('a lesson in box 4 is locked in, and Learn says so', any('Locked in' in x for x in lk) and '1 locked in' in head, [lk, head])
        # a review of a trap where the opponent doesn't take the bait
        await pg.evaluate("() => { Store.state.learn.mem['trap-blackburne-shilling'].due = Date.now() - 1000; Store.state.learn.mem['trap-blackburne-shilling'].k = 0; Store.touch('learn'); }")
        await pg.evaluate("() => { const t = Data.reps().traps.find(x => x.id === 'blackburne-shilling'); if (!t.safe) t.safe = 'Nxd4'; }")   # the data names the safe move
        await pg.evaluate("() => { const r = Math.random; Math.random = () => 0.01; Learn.review(); setTimeout(() => { Math.random = r; }, 3000); }"); await pg.wait_for_timeout(1500)
        steps = await pg.evaluate("Learn._steps()")
        trap = [i for i, s in enumerate(steps) if s['from'] == 'trap-blackburne-shilling']
        check('a trap comes back as its line, from memory', trap and steps[trap[0]]['t'] == 'line' and not steps[trap[0]]['guide'], steps)
        for i in range(trap[0]): await solve_step(pg); await next_btn(pg)
        dev = steps[trap[0]].get('deviate')
        for k in range(30):
            c = await pg.evaluate(CUR)
            if c['free'] or c['complete']: break
            await movable(pg); await play(pg, await pg.evaluate(NEXT)); await pg.wait_for_timeout(900)
        await pg.wait_for_timeout(1200)
        f = await feedback(pg)
        check('sometimes the opponent doesn’t take the bait, and you have to play on well', dev and (await pg.evaluate(CUR))['free'] and 'didn’t take the bait' in f, [dev, f])
        await movable(pg); await play(pg, await best(pg))
        for k in range(30):
            if (await pg.evaluate(CUR))['complete']: break
            await pg.wait_for_timeout(300)
        check('a good move after the deviation completes the item', (await pg.evaluate(CUR))['complete'] and 'trap doesn’t work' in await feedback(pg), await feedback(pg))
        check('no page errors (review)', not errs, errs[:3])

        # ---------- the store keeps the schedule, and repairs it ----------
        out = await pg.evaluate("""() => {
          const S = JSON.parse(Store.exportJson());
          S.learn.mem.ghost = { box: 2, due: 5, n: 1, ok: 1, k: 1 };          // a lesson that isn't done
          S.learn.mem.fork = { box: 99, due: 'soon', n: -3, ok: 7, k: 1.6 };  // nonsense
          const err = Store.importJson(JSON.stringify(S));
          return { err, mem: Store.state.learn.mem }; }""")
        m = out['mem']
        check('a restored backup keeps the schedule and repairs bad records', not out['err'] and 'ghost' not in m and m['fork']['box'] == 5 and m['fork']['due'] == 0 and m['fork']['n'] == 0 and m['fork']['ok'] == 0 and m['pin']['box'] == 4, m)
        await pg.close()

        # ---------- Openings: courses and trap lessons ----------
        pg, errs = await fresh(b)
        await pg.evaluate("App.go('openings')"); await pg.wait_for_timeout(400)
        txt = await pg.locator('.view').inner_text()
        has_courses = await pg.evaluate("Data.lessons().some(u => u.id === 'italian' || u.id === 'queens-gambit')")
        check('Openings lists the courses first when they exist', ('Courses' in txt) == has_courses, txt[:300])
        await pg.locator('.view .menu-list button', has_text='Blackburne Shilling Trap').click(); await pg.wait_for_timeout(400)
        check('a trap in Openings opens its lesson', (await pg.evaluate(CUR) or {}).get('id') == 'trap-blackburne-shilling')
        check('no page errors (openings)', not errs, errs[:3])
        await pg.close()
        await b.close()
    print('%d checks, %d failed' % (checks, len(fails)))
    if fails: raise SystemExit(1)

asyncio.run(main())
