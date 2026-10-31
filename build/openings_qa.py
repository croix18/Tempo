# Walks through every repertoire line and every trap in the browser, the way a learner would.
# Usage: python3 build/openings_qa.py [rep-or-trap-id ...]
import asyncio, json, sys
from playwright.async_api import async_playwright
import os
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CHROME = os.environ.get('CHROME') or ('/usr/bin/google-chrome' if os.path.exists('/usr/bin/google-chrome') else None)
TEMPO_URL = os.environ.get('TEMPO_URL') or 'file://' + ROOT + '/dist/Tempo.html'
URL = TEMPO_URL
ONLY = set(sys.argv[1:])
PAGES = 4

async def click_sq(pg, sq):
    o = await pg.evaluate("document.querySelector('.board').__board.orient")
    box = await pg.locator('.board').first.bounding_box()
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

REPLAY = """(moves) => { const p = new TempoCore.Pos(); const out = [];
  for (const s of moves) { const f = p.fen(); const m = p.parseMove(s); if (!m) { out.push({ fen: f, uci: null, san: s }); break; }
    out.push({ fen: f, uci: TempoCore.uci(m), san: s }); p.make(m); }
  return out; }"""

async def wait_turn(pg, fen, timeout=8000):
    """Wait until the board shows `fen` (ignoring move counters) and accepts a move."""
    want = ' '.join(fen.split(' ')[:4])
    t = 0
    while t < timeout:
        ok = await pg.evaluate("""(want) => { const b = document.querySelector('.board'); if (!b || !b.__board || !b.__board.pos) return false;
          return b.__board.canMove() && b.__board.pos.fen().split(' ').slice(0, 4).join(' ') === want; }""", want)
        if ok: return True
        await pg.wait_for_timeout(100); t += 100
    return False

async def feedback(pg):
    loc = pg.locator('.feedback')
    return (await loc.last.inner_text()) if await loc.count() else ''

async def wait_feedback(pg, needle, timeout=12000):
    t = 0
    while t < timeout:
        fb = await feedback(pg)
        if needle in fb: return fb
        await pg.wait_for_timeout(150); t += 150
    return None

async def play_side(pg, plies, you_white, label, problems):
    for i, p in enumerate(plies):
        if (i % 2 == 0) != you_white: continue
        if p['uci'] is None: problems.append((label, i, 'illegal SAN ' + p['san'])); return False
        if not await wait_turn(pg, p['fen']):
            problems.append((label, i, 'board never ready for ' + p['san'] + ' | fb: ' + await feedback(pg))); return False
        await play(pg, p['uci'])
    return True

async def do_line(pg, rep, line, problems):
    label = rep['id'] + '/' + line['id']
    await pg.evaluate("""([r, l]) => { const D = Data.reps(); const rep = D.repertoires.find(x => x.id === r);
      App.go('openings', { play: { rep: rep, line: rep.lines.find(x => x.id === l), mode: 'learn' } }); }""", [rep['id'], line['id']])
    await pg.wait_for_timeout(300)
    plies = await pg.evaluate(REPLAY, line['moves'].split())
    if not await play_side(pg, plies, rep['side'] == 'w', label, problems): return
    fb = await wait_feedback(pg, 'Line complete')
    if not fb: problems.append((label, 'end', 'no completion message | fb: ' + await feedback(pg))); return
    learned = await pg.evaluate("(k) => !!(Store.state.openings.lines[k] && Store.state.openings.lines[k].learned)", label)
    if not learned: problems.append((label, 'end', 'line not marked learned'))
    text = await pg.locator('.lesson-text').last.inner_text()
    if 'undefined' in text or 'null' in text: problems.append((label, 'end', 'bad note text: ' + text[:120]))

async def do_trap(pg, t, problems):
    label = 'trap/' + t['id']
    await pg.evaluate("(id) => App.go('openings', { trap: id })", t['id']); await pg.wait_for_timeout(300)
    n = len(t['moves'].split())
    for i in range(n + 1):
        nb = pg.locator('.panel button.btn.primary').last
        txt = (await nb.inner_text()).strip()
        if i == n and txt != 'Finish': problems.append((label, i, 'expected Finish, got ' + txt))
        await nb.click(); await pg.wait_for_timeout(120)
        note = await pg.locator('.lesson-text').last.inner_text()
        if 'undefined' in note: problems.append((label, i, 'bad note text'))
    victim = t.get('trapper') and t['trapper'] != t['side'] and t.get('keyPly') is not None
    want = 'Now avoid it' if victim else 'Now you play it'
    btn = pg.locator('button', has_text=want)
    if not await btn.count(): problems.append((label, 'end', 'missing button ' + want)); return
    await btn.click(); await pg.wait_for_timeout(300)
    plies = await pg.evaluate(REPLAY, t['moves'].split())
    you_white = t['side'] == 'w'
    if not victim:
        if not await play_side(pg, plies, you_white, label, problems): return
        if not await wait_feedback(pg, 'Well played'): problems.append((label, 'end', 'practice not completed | fb: ' + await feedback(pg)))
        return
    key = t['keyPly']
    # first fall for it on purpose, then try again and find a safe move
    if not await wait_turn(pg, plies[key]['fen']): problems.append((label, key, 'avoid: board never ready')); return
    await play(pg, plies[key]['uci'])
    if not await wait_feedback(pg, 'waiting for', 4000): problems.append((label, key, 'avoid: trap move not caught | fb: ' + await feedback(pg)))
    t0 = 0
    while t0 < 30000 and not await pg.locator('button', has_text='Try again').count():
        await pg.wait_for_timeout(200); t0 += 200
    if not await pg.locator('button', has_text='Try again').count(): problems.append((label, key, 'avoid: no Try again button')); return
    await pg.locator('button', has_text='Try again').click()
    if not await wait_turn(pg, plies[key]['fen']): problems.append((label, key, 'avoid: board not ready after retry')); return
    best = await pg.evaluate("(fen) => Engines.analyse({ fen: fen, depth: 14 }).then(r => r.best)", plies[key]['fen'])
    if best == plies[key]['uci']: problems.append((label, key, 'avoid: engine best move IS the trap move ' + best)); return
    await play(pg, best)
    fb = await wait_feedback(pg, 'Safe', 15000)
    if not fb: problems.append((label, key, 'avoid: engine best %s not accepted | fb: %s' % (best, await feedback(pg))))

async def do_drill(pg, rep, problems):
    label = 'drill/' + rep['id']
    await pg.evaluate("(id) => App.go('openings', { rep: id })", rep['id']); await pg.wait_for_timeout(300)
    await pg.locator('.btn', has_text='Drill').first.click(); await pg.wait_for_timeout(400)
    by_name = {l['name']: l for l in rep['lines']}
    done = 0
    for k in range(len(rep['lines']) + 1):
        name = (await pg.locator('h1').last.inner_text()).strip()
        line = by_name.get(name)
        if not line: problems.append((label, k, 'unknown drill title ' + name)); return
        plies = await pg.evaluate(REPLAY, line['moves'].split())
        if not await play_side(pg, plies, rep['side'] == 'w', label + '/' + line['id'], problems): return
        if not await wait_feedback(pg, 'Perfect'): problems.append((label, k, 'drill line not perfect | fb: ' + await feedback(pg))); return
        done += 1
        nxt = pg.locator('button', has_text='Next line')
        if await nxt.count(): await nxt.click(); await pg.wait_for_timeout(400)
        else: break
    want = min(6, len(rep['lines']))  # a drill session holds at most 6 lines
    if done != want: problems.append((label, 'end', 'drilled %d of %d lines' % (done, want)))

async def worker(b, jobs, problems, errs):
    ctx = await b.new_context(viewport={'width': 1200, 'height': 900})
    pg = await ctx.new_page()
    pg.on('pageerror', lambda e: errs.append('pageerror: ' + str(e)))
    pg.on('console', lambda m: errs.append(m.type + ': ' + m.text[:200]) if m.type == 'error' else None)
    await pg.goto(URL); await pg.wait_for_timeout(2500)
    await pg.evaluate("Engines.sfReady()")
    while jobs:
        kind, a = jobs.pop(0)
        try:
            if kind == 'rep':
                for line in a['lines']: await do_line(pg, a, line, problems)
                await do_drill(pg, a, problems)
            else: await do_trap(pg, a, problems)
        except Exception as e:
            problems.append((a['id'], 'exception', str(e)[:300]))
        print('done', kind, a['id'], flush=True)
    await ctx.close()

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=CHROME, args=['--no-sandbox'])
        pg = await b.new_page(); await pg.goto(URL); await pg.wait_for_timeout(1500)
        D = await pg.evaluate("Data.reps()")
        # the menu and every repertoire page render
        await pg.evaluate("App.go('openings')"); await pg.wait_for_timeout(300)
        cards = await pg.locator('button.card.theme').count()
        await pg.close()
        jobs = [('rep', r) for r in D['repertoires'] if not ONLY or r['id'] in ONLY] + \
               [('trap', t) for t in D['traps'] if not ONLY or t['id'] in ONLY]
        problems, errs = [], []
        print('repertoires', len(D['repertoires']), 'lines', sum(len(r['lines']) for r in D['repertoires']), 'traps', len(D['traps']), 'menu cards', cards, flush=True)
        await asyncio.gather(*[worker(b, jobs, problems, errs) for _ in range(PAGES)])
        print('problems:', json.dumps(problems, indent=1) if problems else 'none')
        print('errors:', errs if errs else 'none')
        await b.close()
asyncio.run(main())
