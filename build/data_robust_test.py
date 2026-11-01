#!/usr/bin/env python3
"""Stored-data robustness for Tempo.

Seeds bad, unreadable, huge or blocked storage (and bad account data and backups), loads the app, visits every
view and checks there are no page errors, no "Something went wrong", and that the data was kept or repaired
as specified. Also checks the inline engine cap when workers are blocked and the practice calendar's fit.

  TEMPO_URL=file:///path/to/Tempo.html python3 build/data_robust_test.py [name filter]
"""
import asyncio, json, os, sys, tempfile, time
from playwright.async_api import async_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CHROME = os.environ.get('CHROME') or ('/usr/bin/google-chrome' if os.path.exists('/usr/bin/google-chrome') else None)
TEMPO_URL = os.environ.get('TEMPO_URL') or 'file://' + ROOT + '/dist/Tempo.html'


sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from testutil import serve_over_http
TEMPO_URL = serve_over_http(TEMPO_URL)  # reloads keep their storage on a real origin (see testutil)
ONLY = sys.argv[1] if len(sys.argv) > 1 else None
VIEWS = ['home', 'play', 'puzzles', 'learn', 'openings', 'train', 'review', 'progress', 'prefs', 'more']
DESK = {'width': 1280, 'height': 860}
PHONE = {'width': 390, 'height': 844}
KEY = 'tempo:v1'
COPY = 'tempo:v1:unreadable'
UNREADABLE_TOAST = 'Your saved progress couldn’t be read. A copy was kept, and you can download it from Preferences.'
SAVE_TOAST = 'Your progress can’t be saved in this browser. Back it up from Preferences.'

START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
AFTER_E4 = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1'
GAME_PGN = ('[Event "Tempo game"]\n[Site "Tempo"]\n[Date "2026.10.30"]\n[Round "-"]\n[White "You"]\n[Black "Pip"]\n[Result "1-0"]\n\n'
            '1. e4 e5 2. Qh5 Nc6 3. Bc4 Nf6 4. Qxf7# 1-0\n')
RV = {'ev': [20, 30, 25, 40, -20, 300, 9999, 20000], 'best': ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1c4', 'g7g6', 'h5f7', ''],
      'cls': 'BBIBBXB', 'acc': {'w': 91.5, 'b': 40.2}, 'counts': {'w': {'best': 3, 'inaccuracy': 1}, 'b': {'best': 2, 'blunder': 1}}}
GAME = {'id': 'g1', 'ts': 1700000000000, 'bot': 'pip', 'color': 'w', 'result': '1-0', 'reason': 'checkmate', 'pgn': GAME_PGN, 'plies': 7,
        'rated': True, 'before': 900, 'after': 950, 'reviewed': True, 'acc': 91.5, 'counts': {'best': 3}, 'rv': RV}
BASE = {
    'v': 1,
    'settings': {'rev': 5, 'theme': 'dark', 'board': 'walnut', 'sound': False, 'coords': True, 'dots': True, 'animate': True, 'autoQueen': False,
                 'coach': True, 'hanging': True, 'takebacks': True, 'unlockAll': False, 'clock': 'none', 'botChat': True, 'color': 'w', 'placed': True},
    'play': {'rev': 5, 'rating': 950, 'hist': [[1700000000000, 900], [1700000100000, 950]], 'bots': {'pip': {'w': 3, 'd': 0, 'l': 1, 'beaten': True}},
             'unlocked': 2, 'lastBot': 'pip'},
    'puzzles': {'rev': 5, 'rating': 1100, 'count': 10, 'solved': 7, 'hist': [[1700000000000, 1050], [1700000100000, 1100]], 'seen': '',
                'themes': {'fork': [6, 3]}, 'streakBest': 4, 'rushBest': 9, 'daily': None},
    'learn': {'rev': 5, 'done': {'board-notation': {'stars': 3, 'ts': 1700000000000}}, 'last': 'board-notation'},
    'openings': {'rev': 5, 'srs': {}, 'lines': {'italian/main': {'learned': True, 'box': 2, 'due': 1700000000000, 'drills': 3, 'right': 2}}},
    'mistakes': {'rev': 5, 'items': [{'id': 'gx-1', 'fen': AFTER_E4, 'played': 'e7e5', 'best': 'c7c5', 'kind': 'mistake', 'ts': 1700000000000, 'box': 0, 'due': 0, 'seen': 0}]},
    'games': {'rev': 5, 'list': [GAME]},
    'days': {'rev': 5, 'map': {'2026-10-30': {'g': 1, 'p': 2, 'l': 0}}},
    'current': {'id': 'c1', 'bot': 'rosie', 'color': 'w', 'startFen': START, 'moves': ['e2e4', 'e7e5'], 'sans': ['e4', 'e5'], 'coach': True, 'hanging': True,
                'takebacks': True, 'clock': None, 'times': None, 'hints': 0, 'undos': 0, 'warned': 0, 'result': None, 'reason': None, 'startedAt': 1700000000000},
}
# what holds for each section when it came through intact, and when it fell back to its defaults
INTACT = {
    'settings': "S.settings.theme === 'dark' && S.settings.board === 'walnut' && S.settings.placed === true && S.settings.sound === false",
    'play': "S.play.rating === 950 && S.play.bots.pip.beaten === true && S.play.tier === 0 && S.play.unlocked === 2 && S.play.hist.length === 2",
    'puzzles': "S.puzzles.rating === 1100 && S.puzzles.themes.fork[0] === 6 && S.puzzles.rushBest === 9",
    'learn': "!!S.learn.done['board-notation'] && S.learn.done['board-notation'].stars === 3",
    'openings': "S.openings.lines['italian/main'].learned === true && S.openings.lines['italian/main'].box === 2",
    'mistakes': "S.mistakes.items.length === 1 && S.mistakes.items[0].id === 'gx-1'",
    'games': "S.games.list.length === 1 && S.games.list[0].id === 'g1' && !!S.games.list[0].rv",
    'days': "S.days.map['2026-10-30'].p === 2",
    'current': "!!S.current && S.current.bot === TempoBots.successor('rosie') && !!TempoBots.byId(S.current.bot) && S.current.moves.length === 2",
}
DEFAULTED = {
    'settings': "S.settings.theme === 'system' && S.settings.board === 'tempo' && S.settings.placed === false && S.settings.sound === true",
    'play': "S.play.rating === 600 && S.play.hist.length === 0 && S.play.tier === 0 && Object.keys(S.play.bots).length === 0",
    'puzzles': "S.puzzles.rating === 600 && S.puzzles.hist.length === 0 && Object.keys(S.puzzles.themes).length === 0",
    'learn': "Object.keys(S.learn.done).length === 0",
    'openings': "Object.keys(S.openings.lines).length === 0",
    'mistakes': "S.mistakes.items.length === 0",
    'games': "S.games.list.length === 0",
    'days': "Object.keys(S.days.map).length === 0",
    'current': "S.current === null",
}


def init_script(seed='', hook='', extra=''):
    """Runs before the page: records toasts, keeps the real storage functions, seeds once per context, then hooks."""
    return """(() => {
  window.__toasts = [];
  try { new MutationObserver(ms => { for (const m of ms) for (const n of m.addedNodes) if (n.nodeType === 1 && n.classList && n.classList.contains('toast')) window.__toasts.push(n.textContent); })
    .observe(document, { childList: true, subtree: true }); } catch (e) {}
  window.__realGet = Storage.prototype.getItem; window.__realSet = Storage.prototype.setItem;
  window.__ls = (() => { try { return window.localStorage; } catch (e) { return null; } })();
  window.__raw = k => window.__realGet.call(window.__ls, k);
  window.__put = (k, v) => window.__realSet.call(window.__ls, k, v);
  try { if (!window.__raw('__seeded')) { window.__put('__seeded', '1'); %s } } catch (e) { console.log('seed failed: ' + e); }
  %s
  %s
})();""" % (seed, hook, extra)


def seed_obj(mutate=''):
    return "var d = %s; %s; window.__put(%s, JSON.stringify(d));" % (json.dumps(BASE), mutate, json.dumps(KEY))


def seed_raw(text):
    return "window.__put(%s, %s);" % (json.dumps(KEY), json.dumps(text))


TOUR = """async (views) => {
  const sleep = ms => new Promise(r => setTimeout(r, ms)), out = [];
  for (const v of views) {
    try { App.go(v); } catch (e) { out.push(v + ' threw ' + e); continue; }
    await sleep(160);
    if (App.name !== v) out.push(v + ' showed ' + App.name);
    if (Array.from(document.querySelectorAll('#main .empty')).some(e => /Something went wrong/.test(e.textContent))) out.push(v + ' says Something went wrong');
  }
  await sleep(250);
  return out;
}"""

CHECK = """() => { const P = [], S = Store.state, raw = k => window.__raw(k), toasts = window.__toasts;
  const want = (c, m) => { if (!c) P.push(m); };
  const stored = () => { try { return JSON.parse(raw('tempo:v1')); } catch (e) { return null; } };
  try { %s } catch (e) { P.push('check threw: ' + e); }
  return P; }"""

results = []


def report(name, problems):
    results.append((name, problems))
    print(('PASS ' if not problems else 'FAIL ') + name + ('' if not problems else '\n     ' + '\n     '.join(problems)), flush=True)


class Run:
    """One scenario in a fresh browser context."""
    def __init__(self, browser, name, script, vp=DESK):
        self.browser, self.name, self.script, self.vp = browser, name, script, vp
        self.errors, self.problems = [], []

    async def __aenter__(self):
        self.ctx = await self.browser.new_context(viewport=self.vp, accept_downloads=True)
        await self.ctx.add_init_script(self.script)
        self.pg = await self.ctx.new_page()
        self.pg.on('pageerror', lambda e: self.errors.append('pageerror: ' + str(e)[:240]))
        self.pg.on('console', lambda m: self.errors.append('console.error: ' + m.text[:240]) if m.type == 'error' else None)
        return self

    async def boot(self):
        await self.pg.goto(TEMPO_URL)
        await self.pg.wait_for_function("() => window.App && App.name", timeout=30000)
        await self.pg.wait_for_timeout(120)

    async def tour(self):
        broken = await asyncio.wait_for(self.pg.evaluate(TOUR, VIEWS), 120)
        self.problems += broken

    async def check(self, body):
        self.problems += await self.pg.evaluate(CHECK % body)

    def want(self, cond, msg):
        if not cond: self.problems.append(msg)

    async def __aexit__(self, et, ev, tb):
        if ev is not None: self.problems.append('harness: %s: %s' % (et.__name__, str(ev)[:300]))
        if self.errors: self.problems.append('page errors: ' + ' | '.join(self.errors[:4]))
        await self.ctx.close()
        report(self.name, self.problems)
        return True


def wanted(name):
    return not ONLY or ONLY.lower() in name.lower()


async def simple(browser, name, seed, check, hook='', extra='', wait=0, vp=DESK):
    """Seed, boot, visit every view, then check."""
    if not wanted(name): return
    async with Run(browser, name, init_script(seed, hook, extra), vp) as r:
        await r.boot()
        await r.tour()
        if wait: await r.pg.wait_for_timeout(wait)
        await r.check(check)


# ---------------------------------------------------------------- unreadable and empty saves
async def unreadable(browser):
    raw = '{"v":1,"settings":{"theme":"dark"},"play":{"rating":1234'
    name = 'invalid JSON: copy kept, told once, readable save written, download and delete from Preferences'
    if wanted(name):
        async with Run(browser, name, init_script(seed_raw(raw))) as r:
            await r.boot()
            await r.tour()
            await r.check("""
              want(raw('tempo:v1:unreadable') === %s, 'the unreadable text was not kept word for word');
              const s = stored(); want(s && s.v === 1 && s.play && typeof s.play === 'object', 'no readable save was written in its place');
              want(toasts.filter(t => t === %s).length === 1, 'expected the unreadable toast once, saw ' + JSON.stringify(toasts));
              want(!toasts.some(t => /can’t be saved/.test(t)), 'a save warning showed although saving works');
              want(Store.copies().length === 1 && Store.saveError === null, 'copies/saveError wrong: ' + JSON.stringify(Store.copies()) + ' ' + Store.saveError);
            """ % (json.dumps(raw), json.dumps(UNREADABLE_TOAST)))
            # Preferences offers the copy
            await r.pg.evaluate("App.go('prefs')"); await r.pg.wait_for_timeout(200)
            card = r.pg.locator('#kept-copies .card')
            r.want(await card.count() == 1, 'Preferences has no card for the kept copy')
            async with r.pg.expect_download(timeout=10000) as dl:
                await r.pg.locator('#kept-copies button', has_text='Download').click()
            d = await dl.value
            got = open(await d.path(), encoding='utf-8').read()
            r.want(got == raw, 'downloaded copy differs from the stored text')
            r.want(d.suggested_filename.startswith('tempo-unreadable-'), 'download name: ' + d.suggested_filename)
            # a later visit: nothing new to tell, the copy is still there
            await r.pg.wait_for_timeout(600); await r.pg.reload(); await r.pg.wait_for_function("() => window.App && App.name", timeout=30000); await r.pg.wait_for_timeout(400)
            await r.check("""
              want(!toasts.length, 'toasted again on the next visit: ' + JSON.stringify(toasts));
              want(raw('tempo:v1:unreadable') === %s, 'copy changed on the next visit');
            """ % json.dumps(raw))
            await r.pg.evaluate("App.go('prefs')"); await r.pg.wait_for_timeout(200)
            await r.pg.locator('#kept-copies button', has_text='Delete').click()
            await r.pg.wait_for_selector('.sheet h2:has-text("Delete this copy?")', timeout=5000)
            await r.pg.locator('.sheet button', has_text='Delete').click(); await r.pg.wait_for_timeout(300)
            await r.check("want(raw('tempo:v1:unreadable') === null, 'copy not deleted'); want(!document.querySelector('#kept-copies .card'), 'card still shown after delete');")
            await r.tour()

    for label, text in [('no v but real data', json.dumps({k: v for k, v in BASE.items() if k != 'v'})), ('v 2 from a newer version', json.dumps(dict(BASE, v=2))),
                        ('v "1" as text', json.dumps(dict(BASE, v='1'))), ('a bare number', '42')]:
        await simple(browser, 'unreadable (%s): copy kept and told' % label, seed_raw(text), """
          want(raw('tempo:v1:unreadable') === %s, 'copy not kept');
          want(toasts.includes(%s), 'not told: ' + JSON.stringify(toasts));
          want(S.play.rating === 600, 'did not start fresh');
          const s = stored(); want(s && s.v === 1, 'main key not replaced with a readable save');
        """ % (json.dumps(text), json.dumps(UNREADABLE_TOAST)))

    for label, text in [('{}', '{}'), ('null', 'null'), ('[]', '[]'), ('empty text', ''), ('spaces', '   ')]:
        await simple(browser, 'empty save (%s): starts fresh quietly' % label, seed_raw(text), """
          want(raw('tempo:v1:unreadable') === null, 'kept a copy of nothing');
          want(!toasts.length, 'toasted for an empty save: ' + JSON.stringify(toasts));
          want(S.play.rating === 600 && S.settings.theme === 'system', 'defaults not used');
        """)

    first = 'old unreadable text'
    await simple(browser, 'a second unreadable save goes next to the first copy, never over it',
                 "window.__put(%s, %s); %s" % (json.dumps(COPY), json.dumps(first), seed_raw('{"v":1, broken')), """
      want(raw('tempo:v1:unreadable') === %s, 'the earlier copy was overwritten');
      want(raw('tempo:v1:unreadable:2') === '{"v":1, broken', 'the new copy is not under :2');
      want(Store.copies().length === 2, 'Preferences would not list both copies');
      want(toasts.includes(%s), 'not told');
    """ % (json.dumps(first), json.dumps(UNREADABLE_TOAST)))

    name = 'no room to move unreadable data aside: it stays in place and is never saved over'
    if wanted(name):
        hook = """Storage.prototype.setItem = function (k, v) { if (String(k).indexOf('tempo:v1:unreadable') === 0) throw new DOMException('The quota has been exceeded.', 'QuotaExceededError'); return window.__realSet.call(this, k, v); };"""
        async with Run(browser, name, init_script(seed_raw('{"v":1,"play":{"rating":1500'), hook)) as r:
            await r.boot()
            await r.tour()
            await r.pg.evaluate("() => { Store.state.puzzles.rating = 1700; Store.touch('puzzles'); Store.saveNow(); }")
            await r.pg.wait_for_timeout(3600)  # both notices have had time to show
            await r.check("""
              want(raw('tempo:v1') === '{"v":1,"play":{"rating":1500', 'the unreadable original was saved over');
              want(Store.saveError === 'full', 'saveError: ' + Store.saveError);
              want(toasts.includes(%s) && toasts.includes(%s), 'toasts: ' + JSON.stringify(toasts));
            """ % (json.dumps(UNREADABLE_TOAST), json.dumps(SAVE_TOAST)))
            await r.pg.evaluate("App.go('prefs')"); await r.pg.wait_for_timeout(200)
            r.want('There wasn’t room to move it aside' in await r.pg.locator('#kept-copies').inner_text(), 'Preferences does not explain the copy kept in place')
            r.want('feedback no' in (await r.pg.locator('#save-status').get_attribute('class') or ''), 'save status is not shown as an alert')
            await r.pg.locator('#kept-copies button', has_text='Delete').click()
            await r.pg.locator('.sheet button', has_text='Delete').click(); await r.pg.wait_for_timeout(300)
            await r.check("""
              const s = stored(); want(s && s.v === 1 && s.puzzles.rating === 1700, 'saving did not resume after deleting the copy');
              want(Store.saveError === null, 'saveError still ' + Store.saveError);
              want(/saved in this browser/.test(document.getElementById('save-status').textContent), 'status line not updated');
            """)


# ---------------------------------------------------------------- sections missing or the wrong type
async def sections(browser):
    for sec in ['settings', 'play', 'puzzles', 'learn', 'openings', 'mistakes', 'games', 'days', 'current']:
        for label, js in [('missing', None), ('"x"', '"x"'), ('[]', '[]'), ('null', 'null'), ('5', '5')]:
            mutate = ("delete d[%s]" % json.dumps(sec)) if js is None else ("d[%s] = %s" % (json.dumps(sec), js))
            others = ' '.join("want(%s, %s);" % (INTACT[o], json.dumps(o + ' was not kept'))
                              for o in INTACT if o != sec)
            await simple(browser, '%s %s: falls back for that section only' % (sec, label), seed_obj(mutate), """
              want(%s, %s);
              %s
              Store.saveNow();
              const s = stored();
              want(s && s.v === 1, 'nothing readable was saved');
              want(%s, 'saved %s has the wrong type: ' + JSON.stringify(s && s[%s]));
              want(!toasts.length, 'toasted: ' + JSON.stringify(toasts));
            """ % (DEFAULTED[sec], json.dumps(sec + ' did not fall back to its defaults'), others,
                   "s.current === null" if sec == 'current' else "s[%s] && typeof s[%s] === 'object' && !Array.isArray(s[%s]) && typeof s[%s].rev === 'number'" % ((json.dumps(sec),) * 4),
                   sec, json.dumps(sec)))


# ---------------------------------------------------------------- individual fields
FIELDS = [
    ('settings.board "dark wood" (blanked the app before)', "d.settings.board = 'dark wood'", """
      want(S.settings.board === 'tempo', 'board ' + S.settings.board);
      want(S.settings.theme === 'dark' && document.documentElement.getAttribute('data-theme') === 'dark', 'theme not kept');
      want(!/bt-dark/.test(document.body.className), 'body class ' + document.body.className);"""),
    ('settings with wrong values, unknown keys and placed', """Object.assign(d.settings, { theme: 5, sound: 'yes', clock: 'abc', color: 'z', placed: 'x', coords: 0,
        futureFlag: 'on', futureCount: 3, futureObj: { a: 1 }, futureList: [1] })""", """
      const s = S.settings;
      want(s.theme === 'system' && s.sound === true && s.clock === 'none' && s.color === 'w' && s.placed === false && s.coords === true, 'not repaired: ' + JSON.stringify(s));
      want(s.futureFlag === 'on' && s.futureCount === 3, 'unknown primitive settings were dropped');
      want(!('futureObj' in s) && !('futureList' in s), 'unknown object settings were kept');
      want(s.board === 'walnut' && s.dots === true, 'good settings changed');"""),
    ('settings.placed true is kept', "d.settings.placed = true", "want(S.settings.placed === true, 'placed lost');"),
    ('an old ladder level of -5 (broke Home before) opens the first tier', "d.play.unlocked = -5", """
      want(S.play.tier === 0, 'tier ' + S.play.tier);
      App.go('home'); want(document.querySelector('.home-ladder .char'), 'Home has no tier card');"""),
    ('an old ladder level of 99 is clamped to the top of the old ladder', "d.play.unlocked = 99", "want(S.play.tier === TempoBots.TIERS.length - 1, 'tier ' + S.play.tier);"),
    ('an old ladder level of 5 (Wren, 1000) opens the Club Players', "d.play.unlocked = 5", "want(S.play.tier === 2 && S.play.unlocked === 5, 'tier ' + S.play.tier);"),
    ('an old ladder level that is not a number falls back to what was beaten', "d.play.unlocked = 'abc'; d.play.bots.otto = { w: 1, d: 0, l: 0, beaten: true }", "want(S.play.tier === 3, 'tier ' + S.play.tier);"),
    ('a tier out of range is clamped; one that is not a number uses the old level', "d.play.tier = 99", """
      want(S.play.tier === TempoBots.TIERS.length - 1, 'tier ' + S.play.tier);"""),
    ('a won promotion match always opens the tier above', "d.play.tier = 0; d.play.unlocked = 0; d.play.bots['among-us-crewmate'] = { w: 1, d: 0, l: 0, beaten: true }", """
      want(S.play.tier === 1, 'tier ' + S.play.tier); want(TempoBots.access(S.play, 'goofy', false) === 'open', 'Goofy not open');"""),
    ('beating Homer makes you the champion, even in an old save', "d.play.bots['homer-simpson'] = { w: 0, d: 1, l: 0, beaten: true }", "want(S.play.champ === true && S.play.tier === TempoBots.TIERS.length - 1, JSON.stringify(S.play));"),
    ('an unfinished game against an old ladder bot carries on against the nearest character', "d.current.bot = 'theo'", "want(S.current && S.current.bot === TempoBots.successor('theo') && TempoBots.byId(S.current.bot).rating < 600, 'current ' + JSON.stringify(S.current && S.current.bot));"),
    ('an unfinished game against an unknown opponent is dropped', "d.current.bot = 'nobody'", "want(S.current === null, 'kept');"),
    ('the chat level: the old switch off means off; a made-up level means the default', "d.settings.botChat = false; d.settings.chat = 'lots'", "want(S.settings.chat === 'off' && S.settings.botChat === false, S.settings.chat);"),
    ('the chat level: a made-up level means the default', "d.settings.chat = 'shouting'", "want(S.settings.chat === 'some' && S.settings.botChat === true, S.settings.chat);"),
    ('play.rating not a number, then out of range', "d.play.rating = 'abc'; d.puzzles.rating = 1e9", """
      want(S.play.rating === 600, 'play rating ' + S.play.rating); want(S.puzzles.rating === 4000, 'puzzle rating ' + S.puzzles.rating);"""),
    ('play.bots, hist pairs and lastBot repaired', """d.play.bots = { pip: null, rosie: { w: 'x', d: 2, l: -1, beaten: 'yes' }, theo: { w: 1, d: 0, l: 0, beaten: true } };
        d.play.hist = [[1, 2], 'x', [3], [4, 'y'], null, [5, 6]]; d.play.lastBot = 7""", """
      want(!S.play.bots.pip, 'null bot record kept');
      want(JSON.stringify(S.play.bots.rosie) === '{"w":0,"d":2,"l":0,"beaten":false}', 'rosie ' + JSON.stringify(S.play.bots.rosie));
      want(S.play.bots.theo.beaten === true, 'theo lost');
      want(JSON.stringify(S.play.hist) === '[[1,2],[5,6]]', 'hist ' + JSON.stringify(S.play.hist));
      want(S.play.lastBot === null, 'lastBot ' + S.play.lastBot);"""),
    ('a 150k-entry hist is capped (crashed Progress before)', """var h = []; for (var i = 0; i < 150000; i++) h.push([1600000000000 + i * 1000, 500 + (i % 900)]);
        d.puzzles.hist = h; d.play.hist = h.slice(0, 40000)""", """
      want(S.puzzles.hist.length === 600 && S.play.hist.length === 400, 'not capped: ' + S.puzzles.hist.length + ' ' + S.play.hist.length);
      want(S.puzzles.hist[599][0] === 1600000000000 + 149999 * 1000, 'the newest entries were not the ones kept');
      App.go('progress'); want(document.querySelectorAll('.v-progress svg.chart path.lineplot').length === 2, 'Progress charts missing');
      Store.saveNow(); want(raw('tempo:v1').length < 100000, 'saved size ' + raw('tempo:v1').length);"""),
    ('puzzles fields repaired', """Object.assign(d.puzzles, { themes: { fork: 'x', pin: [3, 9], skewer: [5], mateIn1: [8, 4] }, seen: '!!!', daily: 5, count: 'x', solved: 4,
        streakBest: -3, dailyPick: { id: 'nope' }, coordBest: 'x', visionBest: 12 })""", """
      const p = S.puzzles;
      want(!p.themes.fork && !p.themes.skewer && JSON.stringify(p.themes.pin) === '[3,3]' && JSON.stringify(p.themes.mateIn1) === '[8,4]', 'themes ' + JSON.stringify(p.themes));
      want(p.seen === '' && p.daily === null && p.count === 0 && p.solved === 0 && p.streakBest === 0, 'fields ' + JSON.stringify(p));
      want(!('dailyPick' in p) && !('coordBest' in p) && p.visionBest === 10, 'extras ' + JSON.stringify([p.dailyPick, p.coordBest, p.visionBest]));"""),
    ('learn.done entries repaired', "d.learn.done = { a: null, b: { stars: 9 }, c: { stars: 2, ts: 5 }, d: 'x', e: { stars: 'x' } }; d.learn.last = 5", """
      want(JSON.stringify(S.learn.done) === '{"b":{"stars":3},"c":{"stars":2,"ts":5},"e":{"stars":1}}', 'done ' + JSON.stringify(S.learn.done));
      want(S.learn.last === null, 'last ' + S.learn.last);"""),
    ('openings.lines entries repaired', "d.openings.lines = { 'italian/main': null, 'italian/x': { learned: 'yes', box: 9, due: 'x', drills: 3, right: 7 } }; d.openings.srs = 'x'", """
      want(!S.openings.lines['italian/main'], 'null line kept');
      want(JSON.stringify(S.openings.lines['italian/x']) === '{"learned":false,"box":5,"due":0,"drills":3,"right":3}', 'line ' + JSON.stringify(S.openings.lines['italian/x']));
      want(typeof S.openings.srs === 'object', 'srs');"""),
    ('mistakes with bad FENs, bad moves and duplicates are dropped', """d.mistakes.items.push({ id: 'x', fen: 'bad fen', played: 'zz', best: 'yy', due: 0 },
        { id: 'y', fen: '%s', played: 'e7e5', best: 'a1a8' }, { id: 'gx-1', fen: '%s', played: 'd7d5', best: 'c7c5' },
        { id: 'z', fen: '8/8/8/8/8/8/8/kK6 b - - 0 1', played: 'a1a2', best: 'a1a2' }, 'junk', { id: 'w', fen: '%s', played: ['e7e5'], best: 'c7c5' },
        { id: 'ok2', fen: '%s', played: 'g8f6', best: 'c7c5', kind: 'odd', box: 9, due: 'x', ts: 'x', seen: -1 })""" % (AFTER_E4, AFTER_E4, AFTER_E4, AFTER_E4), """
      want(S.mistakes.items.map(x => x.id).join() === 'gx-1,ok2', 'items ' + S.mistakes.items.map(x => x.id).join());
      const o = S.mistakes.items[1]; want(o.kind === 'mistake' && o.box === 5 && o.due === 0 && o.ts === 0 && o.seen === 0, 'ok2 ' + JSON.stringify(o));
      App.go('train', { mode: 'mistakes' }); want(document.querySelector('.v-train .board'), 'mistakes trainer did not open');"""),
    ('games without id, timestamp or pgn, or with a bad FEN, are dropped', """d.games.list.push({ id: 'g-nopgn', ts: 1 }, { id: 'g-badts', ts: 'x', pgn: '1. e4' },
        { id: 'g-badfen', ts: 1, pgn: '[FEN "garbage"]\\n\\n1. e4' }, { id: 'g1', ts: 2, pgn: '1. d4' }, 'junk', null,
        { id: 'g-ok', ts: 1600000000000, pgn: '1. d4 d5 *', bot: 7, color: 'q', result: 'x', plies: 'x', acc: 'x', reviewed: true, counts: 'x', opp: 'Lichess friend' })""", """
      want(S.games.list.map(g => g.id).join() === 'g1,g-ok', 'list ' + S.games.list.map(g => g.id).join());
      const g = S.games.list[1];
      want(g.bot === null && g.color === 'w' && g.result === '*' && g.plies === 2 && g.acc === null && g.reviewed === false && g.counts === null && g.opp === 'Lichess friend', 'g-ok ' + JSON.stringify(g));"""),
    ('a malformed saved review is dropped (crashed Review before)', """d.games.list[0].rv = { ev: [0, 0, 0, 0, 0, 0, 0, 0], best: ['', '', '', '', '', '', '', ''], cls: 'ZZZZZZZ', acc: { w: 1, b: 1 }, counts: { w: {}, b: {} } };
        d.games.list.push(Object.assign({}, d.games.list[0], { id: 'g2', rv: { ev: [1, 2], best: 'x', cls: 'B', acc: {}, counts: {} } }));
        d.games.list.push(Object.assign({}, d.games.list[0], { id: 'g3', acc: null, rv: d.games.list[0].rv }))""", """
      want(S.games.list.length === 3 && S.games.list.every(g => !g.rv), 'rv kept: ' + JSON.stringify(S.games.list.map(g => !!g.rv)));
      want(S.games.list[0].reviewed === true && S.games.list[2].reviewed === false, 'reviewed flags ' + JSON.stringify(S.games.list.map(g => g.reviewed)));
      Review.openGame('g1');
      want(document.querySelector('.v-review .arena'), 'Review did not open the game');
      want(!Array.from(document.querySelectorAll('#main .empty')).some(e => /Something went wrong/.test(e.textContent)), 'Review says Something went wrong');
      App.go('home');"""),
    ('saved review extras (rvx) are checked with their review', """d.games.list[0].rvx = { v: 2, pv: { 3: 'e2e4 zz e7e5', x: 'e2e4', 5: 7 }, note: 'kept' };
        d.games.list.push(Object.assign({}, d.games.list[0], { id: 'g2', rvx: 'junk' }), Object.assign({}, d.games.list[0], { id: 'g3', rv: null, rvx: { v: 2, pv: {} } }))""", """
      const [a, b, c] = S.games.list;
      want(JSON.stringify(a.rvx) === '{"note":"kept","v":2,"pv":{"3":"e2e4 e7e5"}}', 'rvx ' + JSON.stringify(a.rvx));
      want(a.rv && b.rv && !('rvx' in b), 'junk rvx kept'); want(!c.rv && !('rvx' in c), 'rvx kept without a review');
      Review.openGame('g1'); want(document.querySelector('.v-review .arena'), 'Review did not open'); App.go('home');"""),
    ('days.map entries repaired', "d.days.map = { '2026-10-30': { g: 'x', p: 2 }, 'junk': { g: 1 }, '2026-10-29': null, '2026-10-28': [1] }", """
      want(JSON.stringify(S.days.map) === '{"2026-10-30":{"g":0,"p":2,"l":0}}', 'map ' + JSON.stringify(S.days.map));"""),
    ('20k days are capped to the most recent 400', """var m = {}; for (var i = 0; i < 20000; i++) { var dt = new Date(2026, 9, 30); dt.setDate(dt.getDate() - i);
        m[dt.getFullYear() + '-' + String(dt.getMonth() + 1).padStart(2, '0') + '-' + String(dt.getDate()).padStart(2, '0')] = { g: 1, p: 1, l: 1 }; } d.days.map = m""", """
      const k = Object.keys(S.days.map).sort(); want(k.length === 400 && k[399] === '2026-10-30', 'days ' + k.length + ' ' + k[399]);"""),
    ('current with a bad startFen becomes null', "d.current.startFen = 'garbage'", "want(S.current === null, 'current kept');"),
    ('current with an illegal position becomes null', "d.current.startFen = '8/8/8/8/8/8/8/kK6 w - - 0 1'; d.current.moves = []; d.current.sans = []", "want(S.current === null, 'current kept');"),
    ('current with a move that does not replay becomes null', "d.current.moves = ['e2e4', 'zz']", "want(S.current === null, 'current kept');"),
    ('current for an unknown bot or a finished game becomes null', "d.current.bot = 'nobody'", "want(S.current === null, 'current kept');"),
    ('current that is already finished becomes null', "d.current.result = '1-0'", "want(S.current === null, 'current kept');"),
    ('current without sans gets them back and resumes', "delete d.current.sans; d.current.clock = { base: 600000, inc: 0 }; d.current.times = null; d.current.hints = 'x'", """
      want(S.current && JSON.stringify(S.current.sans) === '["e4","e5"]', 'sans ' + JSON.stringify(S.current && S.current.sans));
      want(S.current.clock === null && S.current.times === null && S.current.hints === 0, 'clock/times/hints ' + JSON.stringify([S.current.clock, S.current.times, S.current.hints]));
      App.go('home'); want(/Resume game/.test(document.querySelector('.home-hero').textContent), 'Home does not offer to resume');
      Play.resume(); want(document.querySelector('.v-play .arena'), 'game did not open');
      App.go('home');"""),
    ('unknown top-level keys are kept', "d.future = { a: 1 }", "want(S.future && S.future.a === 1, 'unknown section dropped');"),
]


async def fields(browser):
    for name, mutate, check in FIELDS:
        await simple(browser, name, seed_obj(mutate), check + "\n want(!toasts.length, 'toasted: ' + JSON.stringify(toasts));")

    # a review saved by the current Review code, whatever its format, must come back unchanged and be reused
    name = 'a review saved by Review survives a reload and is reused'
    if wanted(name):
        async with Run(browser, name, init_script(seed_obj("delete d.games.list[0].rv; d.games.list[0].reviewed = false; d.games.list[0].acc = null"))) as r:
            await r.boot()
            await r.pg.wait_for_function("Engines.status === 'ready' || Engines.status === 'failed'", timeout=30000)
            await r.pg.evaluate("Review.openGame('g1')")
            await r.pg.wait_for_function("() => !!Store.state.games.list[0].rv", timeout=150000)
            await r.pg.evaluate("Store.saveNow()")
            snap = "() => JSON.stringify([Store.state.games.list[0].rv, Store.state.games.list[0].rvx || null])"
            before = await r.pg.evaluate(snap)
            await r.pg.evaluate("App.go('home')")
            await r.pg.wait_for_timeout(600); await r.pg.reload(); await r.pg.wait_for_function("() => window.App && App.name", timeout=30000)
            r.want(before == await r.pg.evaluate(snap), 'the saved review changed on load')
            await r.pg.evaluate("Review.openGame('g1')"); await r.pg.wait_for_timeout(300)
            await r.check("want(document.querySelector('.v-review .arena') && !document.getElementById('rv-progress'), 'the saved review was not reused'); App.go('home');")
            await r.tour()


# ---------------------------------------------------------------- storage that throws
REAL_RAW = json.dumps(dict(BASE, play=dict(BASE['play'], rating=1337)))
QUOTA = "Storage.prototype.setItem = function () { throw new DOMException('The quota has been exceeded.', 'QuotaExceededError'); };"
SECURITY_GET = "Storage.prototype.getItem = function (k) { if (k === 'tempo:v1') throw new DOMException('The operation is insecure.', 'SecurityError'); return window.__realGet.call(this, k); };"
GETTER = "Object.defineProperty(window, 'localStorage', { configurable: true, get: function () { throw new DOMException('Access is denied for this document.', 'SecurityError'); } });"


async def throwing(browser):
    for label, hook, loads, code, line in [
        ('setItem throws QuotaExceededError', QUOTA, True, 'full', 'its storage is full'),
        ('getItem throws SecurityError', SECURITY_GET, False, 'blocked', 'blocking storage'),
        ('the localStorage getter throws', GETTER, False, 'blocked', 'blocking storage'),
    ]:
        name = '%s: warned once, status line honest, stored data untouched' % label
        if not wanted(name): continue
        async with Run(browser, name, init_script(seed_raw(REAL_RAW), hook)) as r:
            await r.boot()
            await r.tour()
            await r.pg.evaluate("() => { Store.state.puzzles.rating = 1999; Store.touch('puzzles'); Store.activity('p'); Store.saveNow(); }")
            await r.pg.wait_for_timeout(500)
            await r.check("""
              want(S.play.rating === %s, 'loaded rating ' + S.play.rating);
              want(Store.saveError === %s, 'saveError ' + Store.saveError);
              want(toasts.filter(t => t === %s).length === 1, 'toasts ' + JSON.stringify(toasts));
            """ % (1337 if loads else 600, json.dumps(code), json.dumps(SAVE_TOAST)))
            await r.pg.evaluate("App.go('prefs')"); await r.pg.wait_for_timeout(200)
            status = await r.pg.locator('#save-status').inner_text()
            r.want(line in status and 'can’t be saved' in status, 'status line: ' + status)
            r.want('feedback no' in (await r.pg.locator('#save-status').get_attribute('class') or ''), 'status line not shown as an alert')
            # leaving the page saves: fire the app's pagehide handler, then really reload and look again
            await r.pg.evaluate("() => window.dispatchEvent(new Event('pagehide'))"); await r.pg.wait_for_timeout(200)
            raw = await r.pg.evaluate("() => window.__raw('tempo:v1')")
            r.want(raw == REAL_RAW, 'stored data changed on leaving: ' + str(raw)[:120])
            await r.pg.wait_for_timeout(600); await r.pg.reload(); await r.pg.wait_for_function("() => window.App && App.name", timeout=30000); await r.pg.wait_for_timeout(200)
            raw = await r.pg.evaluate("() => window.__raw('tempo:v1')")
            r.want(raw == REAL_RAW, 'stored data changed after a reload: ' + str(raw)[:120])

    name = 'a save failure that clears updates the status line'
    if wanted(name):
        hook = "window.__full = true; Storage.prototype.setItem = function (k, v) { if (window.__full) throw new DOMException('quota', 'QuotaExceededError'); return window.__realSet.call(this, k, v); };"
        async with Run(browser, name, init_script(seed_raw(REAL_RAW), hook)) as r:
            await r.boot()
            await r.pg.evaluate("App.go('prefs')"); await r.pg.wait_for_timeout(200)
            r.want('its storage is full' in await r.pg.locator('#save-status').inner_text(), 'status not full')
            await r.pg.evaluate("() => { window.__full = false; Store.saveNow(); }"); await r.pg.wait_for_timeout(100)
            r.want('saved in this browser' in await r.pg.locator('#save-status').inner_text(), 'status line did not recover')
            await r.check("want(Store.saveError === null, 'saveError ' + Store.saveError);")


# ---------------------------------------------------------------- account sync merges
FAKE = """
(() => {
  const docs = {}; const subs = {};
  function snap(path) { const d = docs[path]; return { exists: !!d, data: () => d ? JSON.parse(JSON.stringify(d)) : undefined, metadata: { fromCache: false, hasPendingWrites: false } }; }
  function notify(path) { (subs[path] || []).forEach(fn => setTimeout(() => fn(snap(path)), 5)); }
  const db = { doc(path) { return {
      path, get: async () => snap(path),
      set: async (data) => { docs[path] = JSON.parse(JSON.stringify(data)); notify(path); },
      onSnapshot(next, err) { (subs[path] = subs[path] || []).push(next); setTimeout(() => next(snap(path)), 20); return () => {}; }
  }; } };
  const user = { id: async () => 'u_test' };
  window.__fakeDocs = docs; window.__fakeNotify = notify;
  window.claude = { use: async (name) => name === 'db' ? db : name === 'user' ? user : null };
})();
"""


async def remote(browser):
    big = 9e12
    prof = {'v': 1, 'settings': 'x', 'openings': [],
            'play': {'rev': big, 'rating': 'abc', 'hist': 'x', 'bots': None, 'unlocked': -5, 'lastBot': 7},
            'puzzles': {'rev': big, 'rating': 1234, 'hist': 5, 'themes': None, 'seen': '%%%'},
            'learn': {'rev': big, 'done': {'x': None, 'y': {'stars': 2}}, 'last': 5},
            'days': {'rev': big, 'map': {'2026-10-01': {'g': 'x', 'p': 2}, 'bad': 1}},
            'mistakes': {'rev': big, 'items': 'x'}}
    games = {'rev': big, 'list': ['junk', None, dict(GAME, id='g2', ts=1700000500000, rv={'ev': [1], 'best': 'x', 'cls': 'ZZ'})]}
    extra = FAKE + "window.__fakeDocs['data/users/u_test/profile'] = %s; window.__fakeDocs['data/users/u_test/games'] = %s;" % (json.dumps(prof), json.dumps(games))
    await simple(browser, 'account data with wrong types is repaired on merge', seed_obj(), """
      want(Store.synced(), 'not synced');
      want(S.settings.theme === 'dark', 'a broken remote settings section replaced good local settings');
      want(S.play.rating === 600 && S.play.hist.length === 0 && S.play.tier === 0 && S.play.lastBot === null, 'play ' + JSON.stringify(S.play));
      want(S.puzzles.rating === 1234 && Array.isArray(S.puzzles.hist) && typeof S.puzzles.themes === 'object', 'puzzles ' + JSON.stringify(S.puzzles));
      want(S.learn.done.y && S.learn.done['board-notation'] && !('x' in S.learn.done), 'learn ' + JSON.stringify(S.learn.done));
      want(S.days.map['2026-10-01'].p === 2 && S.days.map['2026-10-30'].p === 2 && !S.days.map.bad, 'days ' + JSON.stringify(S.days.map));
      want(S.mistakes.items.length === 1, 'mistakes ' + S.mistakes.items.length);
      want(S.games.list.map(g => g.id).join() === 'g2,g1' && !S.games.list[0].rv, 'games ' + JSON.stringify(S.games.list.map(g => [g.id, !!g.rv])));
      want(/saved to your account/.test((App.go('prefs'), document.getElementById('save-status').textContent)), 'prefs line does not mention the account');
    """, extra=extra, wait=300)


# ---------------------------------------------------------------- backup restores
def big_backup(n=2000):
    b = json.loads(json.dumps(BASE))
    b['play']['rating'] = 777
    b['current'] = None
    b['exported'] = '2026-10-31T00:00:00.000Z'
    b['games'] = {'rev': 1, 'list': [{'id': 'g%d' % i, 'ts': 1700000000000 - i, 'bot': 'pip', 'color': 'w', 'result': '1-0', 'reason': 'checkmate',
                                      'pgn': '1. e4 e5 ' * 400, 'plies': 800, 'rated': True, 'before': 600, 'after': 610, 'reviewed': False, 'acc': None, 'counts': None}
                                     for i in range(n)]}
    return json.dumps(b)


async def paste_restore(pg, text):
    await pg.evaluate("App.go('prefs')"); await pg.wait_for_timeout(150)
    await pg.evaluate("(t) => { document.getElementById('backup-io').value = t; }", text)
    await pg.locator('.v-prefs button', has_text='Restore').last.click(); await pg.wait_for_timeout(250)
    sheet = await pg.locator('.sheet h2', has_text='Restore this backup?').count()
    if sheet:
        await pg.locator('.sheet button', has_text='Restore').click(); await pg.wait_for_timeout(500)
    msg = await pg.evaluate("(() => { const e = document.querySelector('.v-prefs .feedback.no[role=alert]'); return e && !e.hidden ? e.textContent : null; })()")
    return sheet, msg


async def restores(browser):
    bad = [
        ('sections of the wrong type', '{"v":1,"settings":"x","play":"y"}', 'This backup is damaged, so nothing was restored. Tempo couldn’t read its preferences and games against the bots.'),
        ('games and days of the wrong type', '{"v":1,"settings":{},"play":{},"games":"x","days":[],"puzzles":{"hist":5}}',
         'This backup is damaged, so nothing was restored. Tempo couldn’t read its practice days and game history.'),
        ('a section restored as []', '{"v":1,"settings":{},"play":[]}', 'This backup is damaged, so nothing was restored. Tempo couldn’t read its games against the bots.'),
        ('truncated JSON', '{"v":1, "settings": {"theme": "dark"', 'That doesn’t look like a Tempo backup.'),
        ('only v', '{"v":1}', 'That doesn’t look like a Tempo backup.'),
        ('another app', '{"name":"some other app","version":3}', 'That doesn’t look like a Tempo backup.'),
    ]
    name = 'malformed backups are rejected with a clear message and change nothing'
    if wanted(name):
        async with Run(browser, name, init_script(seed_obj())) as r:
            await r.boot()
            for label, text, want_msg in bad:
                sheet, msg = await paste_restore(r.pg, text)
                r.want(not sheet, label + ': asked to confirm a backup that cannot be restored')
                r.want(msg == want_msg, label + ': message ' + repr(msg))
                await r.check("want(%s && %s, %s);" % (INTACT['play'], INTACT['settings'], json.dumps(label + ': progress changed')))
            await r.tour()
            await r.check("want(!toasts.includes('Backup restored'), 'said restored');")

    name = 'a 7.6 MB backup restores within the app’s limits and survives a reload'
    if wanted(name):
        async with Run(browser, name, init_script(seed_obj())) as r:
            await r.boot()
            sheet, msg = await paste_restore(r.pg, big_backup())
            r.want(sheet and msg is None, 'restore flow: sheet %s, message %r' % (sheet, msg))
            await r.check("""want(toasts.includes('Backup restored'), 'toasts ' + JSON.stringify(toasts));
              want(S.games.list.length === 100 && S.play.rating === 777 && S.current === null && !('exported' in S), 'state after restore');
              want(raw('tempo:v1').length < 1000000, 'stored ' + raw('tempo:v1').length);""")
            await r.pg.wait_for_timeout(600); await r.pg.reload(); await r.pg.wait_for_function("() => window.App && App.name", timeout=30000)
            await r.check("want(S.games.list.length === 100 && S.play.rating === 777, 'lost after reload: ' + S.games.list.length + ' ' + S.play.rating);")
            await r.tour()

    name = 'a restore that can’t be saved says so and leaves progress as it was'
    if wanted(name):
        hook = "Storage.prototype.setItem = function (k, v) { if (String(v).length > 300000) throw new DOMException('quota', 'QuotaExceededError'); return window.__realSet.call(this, k, v); };"
        async with Run(browser, name, init_script(seed_obj(), hook)) as r:
            await r.boot()
            sheet, msg = await paste_restore(r.pg, big_backup())
            r.want(msg == 'There isn’t enough room in this browser’s storage, so the backup wasn’t restored.', 'message ' + repr(msg))
            await r.check("""want(!toasts.includes('Backup restored'), 'said restored');
              want(%s && %s, 'progress changed');
              want(Store.saveError === null, 'saveError ' + Store.saveError);
              want(!toasts.some(t => /can’t be saved/.test(t)), 'save warning shown for a refused restore');""" % (INTACT['play'], INTACT['games']))
            await r.pg.wait_for_timeout(600); await r.pg.reload(); await r.pg.wait_for_function("() => window.App && App.name", timeout=30000)
            await r.check("want(%s, 'stored progress changed');" % INTACT['play'])
            await r.tour()

    name = 'a valid backup round-trips through Copy backup, Reset and Restore'
    if wanted(name):
        async with Run(browser, name, init_script(seed_obj())) as r:
            await r.boot()
            before = await r.pg.evaluate("() => { const s = JSON.parse(JSON.stringify(Store.state)); for (const k in s) if (s[k] && s[k].rev != null) delete s[k].rev; s.current = null; return JSON.stringify(s); }")
            await r.pg.evaluate("App.go('prefs')"); await r.pg.wait_for_timeout(150)
            await r.pg.locator('button', has_text='Copy backup').click(); await r.pg.wait_for_timeout(300)
            text = await r.pg.locator('#backup-io').input_value()
            await r.pg.evaluate("Store.reset()"); await r.pg.wait_for_timeout(150)
            await r.check("want(S.play.rating === 600, 'reset did not clear');")
            sheet, msg = await paste_restore(r.pg, text)
            after = await r.pg.evaluate("() => { const s = JSON.parse(JSON.stringify(Store.state)); for (const k in s) if (s[k] && s[k].rev != null) delete s[k].rev; return JSON.stringify(s); }")
            r.want(sheet and msg is None, 'restore flow: sheet %s, message %r' % (sheet, msg))
            r.want(before == after, 'state differs after the round trip')
            await r.tour()

    name = 'Open file goes straight to the restore confirmation'
    if wanted(name):
        d = tempfile.mkdtemp()
        good, damaged = os.path.join(d, 'good.json'), os.path.join(d, 'damaged.json')
        b = json.loads(json.dumps(BASE)); b['play']['rating'] = 1444
        open(good, 'w', encoding='utf-8').write(json.dumps(b))
        open(damaged, 'w', encoding='utf-8').write('{"v":1,"settings":"x","play":"y"}')
        async with Run(browser, name, init_script(seed_obj())) as r:
            await r.boot()
            await r.pg.evaluate("App.go('prefs')"); await r.pg.wait_for_timeout(150)
            async with r.pg.expect_file_chooser() as fc:
                await r.pg.locator('button', has_text='Open file').click()
            await (await fc.value).set_files(good)
            await r.pg.wait_for_selector('.sheet h2:has-text("Restore this backup?")', timeout=5000)
            r.want(await r.pg.locator('.sheet p').inner_text() == 'It replaces your current progress.', 'confirm text')
            r.want(await r.pg.locator('#backup-io').input_value() == '', 'the file was dumped into the text box')
            await r.pg.locator('.sheet button', has_text='Restore').click(); await r.pg.wait_for_timeout(400)
            await r.check("want(S.play.rating === 1444 && toasts.includes('Backup restored'), 'not restored: ' + S.play.rating + ' ' + JSON.stringify(toasts));")
            async with r.pg.expect_file_chooser() as fc:
                await r.pg.locator('button', has_text='Open file').click()
            await (await fc.value).set_files(damaged)
            await r.pg.wait_for_timeout(400)
            r.want(await r.pg.locator('.sheet').count() == 0, 'asked to confirm a damaged file')
            r.want('This backup is damaged' in (await r.pg.locator('.v-prefs .feedback.no[role=alert]').inner_text()), 'no message for a damaged file')
            await r.check("want(S.play.rating === 1444, 'damaged file changed progress');")


# ---------------------------------------------------------------- engine on the page, positions, calendar
async def engine(browser):
    name = 'with workers blocked, each built-in search is capped and the page keeps responding'
    if not wanted(name): return
    hook = "window.Worker = function () { throw new DOMException('Workers are blocked here.', 'SecurityError'); };"
    async with Run(browser, name, init_script(seed_obj(), hook)) as r:
        await r.boot()
        await r.pg.wait_for_function("Engines.status === 'failed'", timeout=20000)
        res = await r.pg.evaluate("""async () => {
          let last = performance.now(), worst = 0, run = true;
          const tick = () => { const t = performance.now(); worst = Math.max(worst, t - last); last = t; if (run) setTimeout(tick, 10); };
          setTimeout(tick, 10);
          const C = TempoCore, t0 = performance.now(), times = {};
          let t = performance.now();
          // the Legends and Masters fall back to the built-in engine; out of their books, so the engine really searches
          const sf = await Engines.botMove(TempoBots.byId('homer-simpson'), { fen: C.START_FEN, moves: ['e2e4', 'a7a6', 'd2d4', 'h7h6'], sans: ['e4', 'a6', 'd4', 'h6'] }); times.homer = performance.now() - t; t = performance.now();
          const adm = await Engines.botMove(TempoBots.byId('darth-vader'), { fen: C.START_FEN, moves: ['d2d4', 'g8f6', 'c2c4', 'h7h6'], sans: ['d4', 'Nf6', 'c4', 'h6'] }); times.vader = performance.now() - t; t = performance.now();
          const an = await Engines.analyse({ fen: C.START_FEN, depth: 18, movetime: 1500 }); times.analyse = performance.now() - t; t = performance.now();
          const two = await Promise.all([Engines.analyse({ fen: C.START_FEN, depth: 12, movetime: 1200 }), Engines.analyse({ fen: C.START_FEN, moves: ['e2e4'], depth: 12, movetime: 1200 })]);
          times.two = performance.now() - t;
          run = false;
          return { sf, adm, an: an.best, two: two.map(x => x.best), worst: Math.round(worst), times, inline: Engines.inline };
        }""")
        r.want(res['inline'], 'not running on the page')
        r.want(bool(res['sf']) and bool(res['adm']) and bool(res['an']) and all(res['two']), 'missing results: ' + json.dumps(res))
        r.want(res['worst'] < 1200, 'longest freeze %d ms' % res['worst'])
        print('     inline engine: longest freeze %d ms, times %s' % (res['worst'], {k: round(v) for k, v in res['times'].items()}))
        await r.tour()
        await r.pg.evaluate("App.go('prefs')"); await r.pg.wait_for_timeout(100)
        r.want('built-in engine' in await r.pg.locator('#engine-about').inner_text(), 'About does not say the built-in engine is used')


async def positions(browser):
    cases = [(START, True), ('8/8/8/8/8/8/8/kK6 w - - 0 1', False), ('k7/8/8/8/8/8/8/R3K3 w - - 0 1', False), ('4k3/8/8/8/8/8/8/4K2R w KQ - 0 1', False),
             ('P3k3/8/8/8/8/8/8/4K3 w - - 0 1', False), ('QQQQQQQQ/QQQQQQQQ/QQQQQQQQ/8/8/8/8/k6K w - - 0 1', False), ('4kk2/8/8/8/8/8/8/4K3 w - - 0 1', False),
             ('rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq e6 0 2', True), ('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq e3 0 1', False)]
    await simple(browser, 'TempoCore.validFen accepts legal positions and explains the rest', '', ' '.join(
        "want((TempoCore.validFen(%s) === null) === %s, %s + ' -> ' + TempoCore.validFen(%s));" % (json.dumps(f), 'true' if ok else 'false', json.dumps(f), json.dumps(f)) for f, ok in cases)
        + " want(typeof TempoCore.validFen('8/8/8/8/8/8/8/kK6 w - - 0 1') === 'string', 'reason is not text');")
    name = 'About follows the engine status'
    if wanted(name):
        async with Run(browser, name, init_script()) as r:
            await r.boot()
            await r.pg.evaluate("App.go('prefs')")
            await r.pg.wait_for_function("Engines.status === 'ready' || Engines.status === 'failed'", timeout=30000)
            await r.pg.wait_for_timeout(100)
            txt, st = await r.pg.locator('#engine-about').inner_text(), await r.pg.evaluate('Engines.status')
            r.want(('running in this browser' in txt) if st == 'ready' else ('built-in engine' in txt), 'About says %r while status is %s' % (txt, st))


async def calendar(browser):
    for vp in [DESK, PHONE]:
        name = 'practice calendar fits the card at %dpx, today ringed, days labelled' % vp['width']
        if not wanted(name): continue
        async with Run(browser, name, init_script(seed_obj("var t = new Date(); d.days.map[t.getFullYear() + '-' + String(t.getMonth() + 1).padStart(2, '0') + '-' + String(t.getDate()).padStart(2, '0')] = { g: 1, p: 3, l: 0 }")), vp) as r:
            await r.boot()
            await r.pg.evaluate("App.go('progress')"); await r.pg.wait_for_timeout(250)
            await r.check("""
              const cal = document.querySelector('.cal'), card = cal.closest('.card'), cr = card.getBoundingClientRect(), wrap = cal.parentElement.getBoundingClientRect();
              want(wrap.right <= cr.right - 10 && wrap.left >= cr.left, 'calendar overflows its card');
              want(document.documentElement.scrollWidth <= innerWidth, 'page scrolls sideways');
              const rows = new Set(Array.from(cal.querySelectorAll('i')).map(i => i.style.gridRow)); want(rows.size === 7, 'rows ' + rows.size);
              const today = cal.querySelectorAll('i.today'); want(today.length === 1, 'today cells ' + today.length);
              want(/^Today, .+: 3 puzzles, 1 game$/.test(today[0].getAttribute('aria-label')), 'today label ' + today[0].getAttribute('aria-label'));
              want(cal.querySelectorAll('.cal-month').length >= 3, 'month labels ' + cal.querySelectorAll('.cal-month').length);
              want(Array.from(cal.querySelectorAll('.cal-day')).map(e => e.textContent).join('') === 'MWF', 'day labels');
              want(/in a row/.test(card.querySelector('.head-note').textContent), 'streak note missing');
            """)
            await r.pg.evaluate("App.go('prefs')"); await r.pg.wait_for_timeout(150)
            await r.check("want(document.documentElement.scrollWidth <= innerWidth, 'Preferences scrolls sideways');")


async def main():
    t0 = time.time()
    async with async_playwright() as p:
        browser = await p.chromium.launch(executable_path=CHROME, args=['--no-sandbox'])
        for part in [unreadable, sections, fields, throwing, remote, restores, engine, positions, calendar]:
            await part(browser)
        await browser.close()
    failed = [n for n, pr in results if pr]
    print('\n%d scenarios, %d failed, %.0fs' % (len(results), len(failed), time.time() - t0))
    for n in failed: print('  FAILED: ' + n)
    sys.exit(1 if failed else 0)


if __name__ == '__main__':
    asyncio.run(main())
