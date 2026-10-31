/* Tempo storage: local first, synced to the viewer's private store when the page runs on claude.ai.
   Everything that comes in from this browser's storage, the account or a backup goes through clean() first,
   which repairs each wrong field on its own. Saved data that can't be read at all is kept under its own key
   before anything is saved over it, and storage failures are reported instead of swallowed. */
var Store = (function () {
  'use strict';
  var KEY = 'tempo:v1', COPY_KEY = 'tempo:v1:unreadable', MAX_COPIES = 5;
  var SYNC = ['settings', 'play', 'puzzles', 'learn', 'openings', 'mistakes', 'days'];
  var SECTIONS = SYNC.concat(['games']);
  var THEMES = ['system', 'light', 'dark'], BOARDS = ['tempo', 'classic', 'walnut', 'slate'];
  var CLOCKS = ['none', '10', '15+10', '30'], COLORS = ['w', 'r', 'b'];
  var FLAGS = ['sound', 'coords', 'dots', 'animate', 'autoQueen', 'coach', 'coachAsk', 'hanging', 'takebacks', 'unlockAll', 'botChat', 'placed'];
  var LIMIT = { playHist: 400, puzzleHist: 600, bots: 100, games: 100, mistakes: 200, days: 400, moves: 1200, seen: 200000 };
  var RESULTS = ['1-0', '0-1', '1/2-1/2', '*'], KINDS = ['blunder', 'mistake', 'miss'], REVIEW_CODES = 'RGBEOKIMSX';
  var TOPICS = ['safety', 'fork', 'threats', 'mates', 'free', 'position'];
  var UCI = /^[a-h][1-8][a-h][1-8][qrbn]?$/, DAY_KEY = /^\d{4}-\d{2}-\d{2}$/, B64 = /^[A-Za-z0-9+\/]*={0,2}$/;
  var NAMES = { settings: 'preferences', play: 'games against the bots', puzzles: 'puzzles', learn: 'lessons', openings: 'openings',
    mistakes: 'saved mistakes', games: 'game history', days: 'practice days' };
  var listeners = [];

  function defaults() {
    return {
      v: 1,
      settings: { rev: 0, theme: 'system', board: 'tempo', sound: true, coords: true, dots: true, animate: true,
        autoQueen: false, coach: true, coachAsk: false, hanging: true, takebacks: true, unlockAll: false, clock: 'none', botChat: true, color: 'w', placed: false,
        otb: '10+0' },
      play: { rev: 0, rating: 600, hist: [], bots: {}, unlocked: 0, lastBot: null },
      puzzles: { rev: 0, rating: 600, count: 0, solved: 0, hist: [], seen: '', themes: {}, streakBest: 0, rushBest: 0, daily: null },
      learn: { rev: 0, done: {}, last: null },
      openings: { rev: 0, srs: {}, lines: {} },
      mistakes: { rev: 0, items: [] },
      games: { rev: 0, list: [] },
      days: { rev: 0, map: {} },
      current: null
    };
  }

  var state = defaults();

  /* ---------- checking and repairing data ---------- */
  function isObj(x) { return !!x && typeof x === 'object' && !Array.isArray(x); }
  function finite(x) { return typeof x === 'number' && isFinite(x); }
  function count(x) { return finite(x) && x > 0 ? Math.round(x) : 0; }
  function within(x, lo, hi, def) { return finite(x) ? Math.min(hi, Math.max(lo, Math.round(x))) : def; }
  function oneOf(x, list, def) { return list.indexOf(x) >= 0 ? x : def; }
  function isUci(x) { return typeof x === 'string' && UCI.test(x); }
  function keysOf(o) { return Object.keys(o).filter(function (k) { return k !== '__proto__'; }); }
  function primitive(v) { return v === null || typeof v === 'string' || typeof v === 'boolean' || finite(v); }
  /* fields this version doesn't know, kept so newer code and other devices don't lose them */
  function extras(src, known, primitivesOnly) {
    var out = {};
    keysOf(src).forEach(function (k) { if (known.indexOf(k) < 0 && (!primitivesOnly || primitive(src[k]))) out[k] = src[k]; });
    return out;
  }
  /* [time, value] pairs, the newest `cap` of them; walks back from the end so a huge list costs no more than a short one */
  function pairs(list, cap) {
    var out = [];
    if (!Array.isArray(list)) return out;
    for (var i = list.length - 1; i >= 0 && out.length < cap; i--) {
      var p = list[i];
      if (Array.isArray(p) && p.length >= 2 && finite(p[0]) && finite(p[1])) out.push([p[0], p[1]]);
    }
    return out.reverse();
  }
  function tally(o) { var out = {}; keysOf(o).forEach(function (k) { if (finite(o[k])) out[k] = count(o[k]); }); return out; }
  function bots() { return (window.TempoBots && TempoBots.BOTS) || []; }
  function botIndex(id) { var b = bots(); for (var i = 0; i < b.length; i++) if (b[i].id === id) return i; return -1; }

  /* the chess clock's time: "10+5", or "10+5/3+2" for White and Black; 1 to 180 minutes, up to 60 seconds a move */
  function otbSpec(x) {
    var m = typeof x === 'string' && /^(\d{1,3})\+(\d{1,2})(?:\/(\d{1,3})\+(\d{1,2}))?$/.exec(x);
    if (!m) return false;
    function ok(a, b) { return +a >= 1 && +a <= 180 && +b <= 60; }
    return ok(m[1], m[2]) && (m[3] == null || ok(m[3], m[4]));
  }
  function cleanSettings(s) {
    var d = defaults().settings, out = extras(s, Object.keys(d), true);
    out.rev = count(s.rev);
    out.theme = oneOf(s.theme, THEMES, d.theme);
    out.board = oneOf(s.board, BOARDS, d.board);
    FLAGS.forEach(function (k) { out[k] = typeof s[k] === 'boolean' ? s[k] : d[k]; });
    out.clock = oneOf(s.clock, CLOCKS, d.clock);
    out.color = oneOf(s.color, COLORS, d.color);
    out.otb = otbSpec(s.otb) ? s.otb : d.otb;
    return out;
  }
  function cleanPlay(p) {
    var d = defaults().play, n = Math.max(1, bots().length), out = extras(p, Object.keys(d)), top = -1;
    out.rev = count(p.rev);
    out.rating = within(p.rating, 100, 4000, d.rating);
    out.hist = pairs(p.hist, LIMIT.playHist);
    out.bots = {};
    if (isObj(p.bots)) keysOf(p.bots).slice(0, LIMIT.bots).forEach(function (id) {
      var r = p.bots[id];
      if (!isObj(r)) return;
      out.bots[id] = { w: count(r.w), d: count(r.d), l: count(r.l), beaten: r.beaten === true };
      if (r.beaten === true) top = Math.max(top, botIndex(id));
    });
    // a level that isn't a number falls back to what the beaten opponents imply
    out.unlocked = finite(p.unlocked) ? within(p.unlocked, 0, n - 1, 0) : Math.min(top + 1, n - 1);
    out.lastBot = typeof p.lastBot === 'string' ? p.lastBot : null;
    return out;
  }
  function cleanPuzzles(p) {
    var d = defaults().puzzles, out = extras(p, Object.keys(d).concat(['coordBest', 'visionBest', 'dailyPick']));
    out.rev = count(p.rev);
    out.rating = within(p.rating, 100, 4000, d.rating);
    out.count = count(p.count);
    out.solved = Math.min(count(p.solved), out.count);
    out.hist = pairs(p.hist, LIMIT.puzzleHist);
    out.seen = typeof p.seen === 'string' && p.seen.length <= LIMIT.seen && p.seen.length % 4 === 0 && B64.test(p.seen) ? p.seen : '';
    out.themes = {};
    if (isObj(p.themes)) keysOf(p.themes).forEach(function (t) {
      var x = p.themes[t];
      if (!Array.isArray(x) || x.length < 2 || !finite(x[0]) || !finite(x[1])) return;
      var tried = count(x[0]);
      out.themes[t] = [tried, Math.min(count(x[1]), tried)];
    });
    out.streakBest = count(p.streakBest);
    out.rushBest = count(p.rushBest);
    out.daily = typeof p.daily === 'string' ? p.daily : null;
    if (finite(p.coordBest)) out.coordBest = count(p.coordBest);
    if (finite(p.visionBest)) out.visionBest = within(p.visionBest, 0, 10, 0);
    if (isObj(p.dailyPick) && typeof p.dailyPick.day === 'string' && typeof p.dailyPick.id === 'string') out.dailyPick = { day: p.dailyPick.day, id: p.dailyPick.id };
    return out;
  }
  function cleanLearn(l) {
    var out = extras(l, ['rev', 'done', 'last']);
    out.rev = count(l.rev);
    out.done = {};
    if (isObj(l.done)) keysOf(l.done).forEach(function (id) {
      var x = l.done[id];
      if (!isObj(x)) return;
      var rec = { stars: within(x.stars, 1, 3, 1) };
      if (finite(x.ts)) rec.ts = x.ts;
      out.done[id] = rec;
    });
    out.last = typeof l.last === 'string' ? l.last : null;
    return out;
  }
  function cleanOpenings(o) {
    var out = extras(o, ['rev', 'srs', 'lines']);
    out.rev = count(o.rev);
    out.srs = isObj(o.srs) ? o.srs : {};
    out.lines = {};
    if (isObj(o.lines)) keysOf(o.lines).forEach(function (k) {
      var x = o.lines[k];
      if (!isObj(x)) return;
      var drills = count(x.drills);
      out.lines[k] = { learned: x.learned === true, box: within(x.box, 0, 5, 0), due: finite(x.due) && x.due > 0 ? x.due : 0, drills: drills, right: Math.min(count(x.right), drills) };
    });
    return out;
  }
  function cleanMistakes(m) {
    var out = extras(m, ['rev', 'items']), C = TempoCore, seen = Object.create(null), pos = null;
    out.rev = count(m.rev);
    out.items = [];
    if (!Array.isArray(m.items)) return out;
    for (var i = 0; i < m.items.length && out.items.length < LIMIT.mistakes; i++) {
      var it = m.items[i];
      if (!isObj(it) || typeof it.id !== 'string' || !it.id || seen[it.id] || !isUci(it.played) || !isUci(it.best) || typeof it.fen !== 'string' || C.validFen(it.fen)) continue;
      if (pos) pos.load(it.fen); else pos = new C.Pos(it.fen);
      if (!pos.parseMove(it.played) || !pos.parseMove(it.best)) continue;
      seen[it.id] = true;
      var rec = { id: it.id, fen: it.fen, played: it.played, best: it.best, kind: oneOf(it.kind, KINDS, 'mistake'),
        ts: finite(it.ts) ? it.ts : 0, box: within(it.box, 0, 5, 0), due: finite(it.due) ? it.due : 0, seen: count(it.seen) };
      if (it.gone === true) rec.gone = true;
      if (TOPICS.indexOf(it.topic) >= 0) rec.topic = it.topic;
      out.items.push(rec);
    }
    return out;
  }
  /* a saved review, in the shape Review reads back: ev[n] numbers, best[n] moves, cls (n - 1 move codes), acc {w, b}, counts {w, b} */
  function cleanReview(rv) {
    if (!isObj(rv) || !Array.isArray(rv.ev) || !Array.isArray(rv.best) || typeof rv.cls !== 'string') return null;
    var n = rv.ev.length;
    if (!n || rv.best.length !== n || rv.cls.length !== n - 1) return null;
    for (var i = 0; i < n; i++) {
      if (!finite(rv.ev[i]) || typeof rv.best[i] !== 'string' || (rv.best[i] && !UCI.test(rv.best[i]))) return null;
      if (i < n - 1 && REVIEW_CODES.indexOf(rv.cls.charAt(i)) < 0) return null;
    }
    if (!isObj(rv.acc) || !finite(rv.acc.w) || !finite(rv.acc.b) || !isObj(rv.counts) || !isObj(rv.counts.w) || !isObj(rv.counts.b)) return null;
    return { ev: rv.ev.slice(), best: rv.best.slice(), cls: rv.cls, acc: { w: rv.acc.w, b: rv.acc.b }, counts: { w: tally(rv.counts.w), b: tally(rv.counts.b) } };
  }
  /* what Review saves beside rv: { v: format version, pv: { ply index: 'uci uci ...' } }, plus anything newer */
  function cleanReviewExtra(x) {
    if (!isObj(x) || !finite(x.v)) return null;
    var out = extras(x, ['v', 'pv']);
    out.v = x.v;
    out.pv = {};
    if (isObj(x.pv)) keysOf(x.pv).forEach(function (k) {
      if (/^\d+$/.test(k) && typeof x.pv[k] === 'string') out.pv[k] = x.pv[k].split(' ').filter(isUci).join(' ');
    });
    return out;
  }
  var GAME_KEYS = ['id', 'ts', 'pgn', 'bot', 'color', 'result', 'reason', 'plies', 'rated', 'before', 'after', 'reviewed', 'acc', 'counts', 'rv', 'rvx'];
  function cleanGame(x) {
    if (!isObj(x) || typeof x.id !== 'string' || !x.id || !finite(x.ts) || typeof x.pgn !== 'string' || !x.pgn.trim()) return null;
    var C = TempoCore, parsed = C.parsePgn(x.pgn);
    if (parsed.headers.FEN != null && C.validFen(parsed.headers.FEN)) return null; // Review couldn't open it
    var out = extras(x, GAME_KEYS);
    out.id = x.id; out.ts = x.ts; out.pgn = x.pgn;
    out.bot = typeof x.bot === 'string' ? x.bot : null;
    out.color = x.color === 'b' ? 'b' : 'w';
    out.result = oneOf(x.result, RESULTS, '*');
    out.reason = typeof x.reason === 'string' ? x.reason : null;
    out.plies = finite(x.plies) && x.plies >= 0 ? Math.round(x.plies) : parsed.sans.length;
    out.rated = x.rated === true;
    out.before = finite(x.before) ? x.before : null;
    out.after = finite(x.after) ? x.after : null;
    out.acc = finite(x.acc) ? x.acc : null;
    out.counts = isObj(x.counts) ? tally(x.counts) : null;
    var rv = cleanReview(x.rv), rvx = rv && cleanReviewExtra(x.rvx);
    if (rv) { out.rv = rv; if (out.acc == null) out.acc = rv.acc[out.color]; }
    if (rvx) out.rvx = rvx; // only worth keeping beside a usable rv
    out.reviewed = x.reviewed === true && out.acc != null;
    return out;
  }
  function cleanGames(g) {
    var out = extras(g, ['rev', 'list']), seen = Object.create(null);
    out.rev = count(g.rev);
    out.list = [];
    if (!Array.isArray(g.list)) return out;
    for (var i = 0; i < g.list.length && out.list.length < LIMIT.games; i++) {
      var x = cleanGame(g.list[i]);
      if (x && !seen[x.id]) { seen[x.id] = true; out.list.push(x); }
    }
    return out;
  }
  function cleanDays(d) {
    var out = extras(d, ['rev', 'map']);
    out.rev = count(d.rev);
    out.map = {};
    if (isObj(d.map)) keysOf(d.map).filter(function (k) { return DAY_KEY.test(k) && isObj(d.map[k]); }).sort().slice(-LIMIT.days).forEach(function (k) {
      var x = d.map[k];
      out.map[k] = { g: count(x.g), p: count(x.p), l: count(x.l) };
    });
    return out;
  }
  /* the unfinished game: null unless its start position is legal and every move replays */
  var CURRENT_KEYS = ['id', 'bot', 'color', 'startFen', 'moves', 'sans', 'coach', 'ask', 'hanging', 'takebacks', 'clock', 'times', 'hints', 'undos', 'warned', 'result', 'reason', 'startedAt'];
  function cleanCurrent(c) {
    if (!isObj(c) || c.result != null) return null;
    var C = TempoCore;
    if (typeof c.bot !== 'string' || botIndex(c.bot) < 0 || (c.color !== 'w' && c.color !== 'b')) return null;
    var fen = c.startFen == null ? C.START_FEN : c.startFen;
    if (typeof fen !== 'string' || C.validFen(fen) || !Array.isArray(c.moves) || c.moves.length > LIMIT.moves) return null;
    var pos = new C.Pos(fen), sans = [];
    for (var i = 0; i < c.moves.length; i++) {
      var m = isUci(c.moves[i]) ? pos.parseMove(c.moves[i]) : 0;
      if (!m) return null;
      sans.push(pos.san(m));
      pos.make(m);
    }
    if (pos.status().over) return null; // a finished game is recorded when it ends, so this one is damaged
    var out = extras(c, CURRENT_KEYS);
    out.id = typeof c.id === 'string' && c.id ? c.id : 'c' + Date.now().toString(36);
    out.bot = c.bot; out.color = c.color; out.startFen = fen;
    out.moves = c.moves.slice(); out.sans = sans;
    out.coach = c.coach !== false; out.ask = c.ask === true; out.hanging = c.hanging !== false; out.takebacks = c.takebacks !== false;
    var timed = isObj(c.clock) && finite(c.clock.base) && c.clock.base > 0 && finite(c.clock.inc) && c.clock.inc >= 0 &&
      isObj(c.times) && finite(c.times.w) && finite(c.times.b);
    out.clock = timed ? { base: c.clock.base, inc: c.clock.inc } : null;
    out.times = timed ? { w: Math.max(0, c.times.w), b: Math.max(0, c.times.b) } : null;
    out.hints = count(c.hints); out.undos = count(c.undos); out.warned = count(c.warned);
    out.result = null; out.reason = null;
    out.startedAt = finite(c.startedAt) ? c.startedAt : Date.now();
    return out;
  }

  var CLEAN = { settings: cleanSettings, play: cleanPlay, puzzles: cleanPuzzles, learn: cleanLearn, openings: cleanOpenings,
    mistakes: cleanMistakes, games: cleanGames, days: cleanDays };
  function cleanSection(k, v) {
    if (!isObj(v)) return null;
    try { return CLEAN[k](v); } catch (e) { console.error(e); return null; }
  }
  /* src: a parsed save with v 1. Returns { state, bad }: bad lists the sections that weren't objects (or couldn't be
     checked) and fell back to their defaults. Missing sections are filled in quietly, as older saves lack some. */
  function clean(src) {
    var d = defaults(), out = extras(src, SECTIONS.concat(['v', 'current'])), bad = [];
    out.v = 1;
    SECTIONS.forEach(function (k) {
      if (src[k] === undefined) { out[k] = d[k]; return; }
      var v = cleanSection(k, src[k]);
      if (v) out[k] = v; else { bad.push(k); out[k] = d[k]; }
    });
    try { out.current = cleanCurrent(src.current); } catch (e) { console.error(e); out.current = null; }
    return { state: out, bad: bad };
  }

  /* ---------- this browser's storage ---------- */
  var saveError = null;  // null, 'full', 'blocked' or 'error'
  var readFailed = false; // reading threw, so what's stored is unknown: never save over it
  var keptInPlace = null; // unreadable text that couldn't be moved aside, so it stays in KEY and nothing is saved over it
  var keptCode = null;

  function quota(e) { return !!e && (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED' || e.code === 22 || e.code === 1014); }
  function peek(key) { try { return localStorage.getItem(key); } catch (e) { return undefined; } }
  function copyKey(i) { return i === 1 ? COPY_KEY : COPY_KEY + ':' + i; }
  function blank(v) { return v == null || v === '' || (Array.isArray(v) ? !v.length : isObj(v) && !Object.keys(v).length); }

  function readLocal() {
    var raw, obj;
    try { raw = localStorage.getItem(KEY); } catch (e) { return { kind: 'blocked' }; }
    if (raw == null || !String(raw).trim()) return { kind: 'empty' };
    try { obj = JSON.parse(raw); } catch (e) { return { kind: 'unreadable', raw: raw }; }
    if (isObj(obj) && obj.v === 1) return { kind: 'ok', obj: obj };
    return blank(obj) ? { kind: 'empty' } : { kind: 'unreadable', raw: raw };
  }
  /* Keep text we couldn't read under a key of its own, never over an earlier copy. Returns true when there is
     something new to tell the person. */
  function keepCopy(raw) {
    for (var i = 1; i <= MAX_COPIES; i++) {
      var have = peek(copyKey(i));
      if (have === raw) return false; // kept on an earlier visit
      if (have !== null) continue;    // taken by another copy, or unreadable itself
      try { localStorage.setItem(copyKey(i), raw); return true; }
      catch (e) { keptCode = quota(e) ? 'full' : 'blocked'; break; }
    }
    // no room for a copy: leave the original where it is and don't save over it
    keptInPlace = raw;
    keptCode = keptCode || 'full';
    return true;
  }
  function tryWrite() {
    if (readFailed) return 'blocked';
    if (keptInPlace != null) return keptCode;
    var text;
    try { text = JSON.stringify(state); } catch (e) { return 'error'; }
    try { localStorage.setItem(KEY, text); return null; } catch (e) { return quota(e) ? 'full' : 'blocked'; }
  }
  function setSaveError(code) {
    if (saveError === code) return;
    var first = !saveError;
    saveError = code;
    emit('storage');
    if (first && code) notice('save');
  }
  function writeLocal() {
    var code = tryWrite();
    setSaveError(code);
    return !code;
  }
  var writeLocalSoon = U.debounce(writeLocal, 250);

  /* Copies of unreadable data, for Preferences: [{ id, size, inPlace }] */
  function copies() {
    var out = [];
    for (var i = 1; i <= MAX_COPIES; i++) { var t = peek(copyKey(i)); if (typeof t === 'string') out.push({ id: copyKey(i), size: t.length, inPlace: false }); }
    if (keptInPlace != null) out.push({ id: KEY, size: keptInPlace.length, inPlace: true });
    return out;
  }
  function copyText(id) {
    if (id === KEY) return keptInPlace;
    if (String(id).indexOf(COPY_KEY) !== 0) return null;
    var t = peek(id);
    return typeof t === 'string' ? t : null;
  }
  function dropCopy(id) {
    if (id === KEY) {
      if (keptInPlace == null) return false;
      keptInPlace = null; keptCode = null;
    } else {
      if (String(id).indexOf(COPY_KEY) !== 0) return false;
      try { localStorage.removeItem(id); } catch (e) { return false; }
    }
    writeLocal(); // the space may be enough to save again
    emit('storage');
    return true;
  }

  /* ---------- telling the person, once each ---------- */
  var MESSAGES = {
    unreadable: 'Your saved progress couldn’t be read. A copy was kept, and you can download it from Preferences.',
    save: 'Your progress can’t be saved in this browser. Back it up from Preferences.'
  };
  var told = {}, notices = [], noticesReady = false, noticeBusy = false;
  function notice(kind) {
    if (told[kind]) return;
    told[kind] = true;
    notices.push(kind);
    flushNotices();
  }
  function flushNotices() {
    if (!noticesReady || noticeBusy || !notices.length) return;
    var kind = notices.shift();
    // the problem cleared before it could be shown: say nothing, but still warn if it comes back
    if (kind === 'save' && !saveError) { told.save = false; flushNotices(); return; }
    // with the account connected, progress is still kept there, so a local problem isn't worth interrupting for
    if (kind === 'save' && remote) { flushNotices(); return; }
    try { if (window.App && typeof App.toast === 'function') App.toast(MESSAGES[kind]); } catch (e) { /* the page isn't built */ }
    noticeBusy = true;
    setTimeout(function () { noticeBusy = false; flushNotices(); }, 3200);
  }

  function init() {
    var r = readLocal();
    state = defaults();
    if (r.kind === 'ok') state = clean(r.obj).state;
    else if (r.kind === 'blocked') { readFailed = true; setSaveError('blocked'); }
    else if (r.kind === 'unreadable') {
      if (keepCopy(r.raw)) notice('unreadable');
      if (keptInPlace == null) writeLocal(); // kept safely, so put a readable save in its place now
      else setSaveError(keptCode);
    }
    var ready = function () { if (!noticesReady) { noticesReady = true; flushNotices(); } };
    // give the account a moment to connect before deciding whether a storage problem is worth a toast
    connectRemote().then(function () { setTimeout(ready, 30); });
    setTimeout(ready, 2000);
  }

  function emit(what) { listeners.forEach(function (fn) { try { fn(what); } catch (e) { console.error(e); } }); }
  function on(fn) { listeners.push(fn); }

  function touch(section) {
    if (section && state[section] && typeof state[section] === 'object') state[section].rev = Date.now();
    writeLocalSoon();
    if (section && (SYNC.indexOf(section) >= 0 || section === 'games')) scheduleRemote(section === 'games' ? 'games' : 'profile');
  }
  function activity(kind) {
    var k = U.dayKey(), d = state.days.map[k] || (state.days.map[k] = { g: 0, p: 0, l: 0 });
    d[kind] = (d[kind] || 0) + 1;
    var keys = Object.keys(state.days.map).sort();
    while (keys.length > LIMIT.days) delete state.days.map[keys.shift()];
    touch('days');
  }
  function streak() {
    var map = state.days.map, n = 0, d = new Date();
    if (!map[U.dayKey(d)]) d.setDate(d.getDate() - 1); // today not started yet: count from yesterday
    while (map[U.dayKey(d)]) { n++; d.setDate(d.getDate() - 1); }
    return n;
  }

  /* ---------- puzzle seen bitset ---------- */
  function seenBits() {
    var s = state.puzzles.seen || '', bytes;
    try { var bin = atob(s); bytes = new Uint8Array(Math.max(bin.length, 1200)); for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i); }
    catch (e) { bytes = new Uint8Array(1200); }
    return bytes;
  }
  function saveBits(bytes) {
    var bin = '';
    for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    state.puzzles.seen = btoa(bin);
  }
  function orBits(a, b) {
    var x, y;
    try { x = atob(a || ''); } catch (e) { x = ''; }
    try { y = atob(b || ''); } catch (e) { y = ''; }
    var n = Math.max(x.length, y.length), out = '';
    for (var i = 0; i < n; i++) out += String.fromCharCode((x.charCodeAt(i) || 0) | (y.charCodeAt(i) || 0));
    return btoa(out);
  }

  /* ---------- remote sync (claude.ai only) ---------- */
  var remote = null, writing = Promise.resolve(), pending = {}, lastSent = { profile: '', games: '' };
  var scheduleRemote = function (doc) { pending[doc] = true; flushSoon(); };
  var flushSoon = U.debounce(flush, 2000);

  function profilePayload() {
    var out = { v: 1 };
    SYNC.forEach(function (k) { out[k] = state[k]; });
    return JSON.parse(JSON.stringify(out));
  }
  function gamesPayload() { return JSON.parse(JSON.stringify(state.games)); }

  function flush() {
    if (!remote) return;
    var docs = Object.keys(pending); pending = {};
    docs.forEach(function (doc) {
      writing = writing.then(function () {
        if (!remote) return;
        var body = doc === 'games' ? gamesPayload() : profilePayload();
        var text = JSON.stringify(body);
        if (text === lastSent[doc]) return;
        if (text.length > 240000) { trimForRemote(doc); body = doc === 'games' ? gamesPayload() : profilePayload(); text = JSON.stringify(body); }
        return (doc === 'games' ? remote.games : remote.profile).set(body).then(function () { lastSent[doc] = text; }, function (e) {
          if (e && (e.code === 'revoked' || e.code === 'not_granted' || e.code === 'invalid_argument' || e.code === 'capability_disabled')) setRemote(null);
        });
      });
    });
  }
  function trimForRemote(doc) {
    if (doc === 'games') { while (JSON.stringify(state.games).length > 230000 && state.games.list.length > 10) state.games.list.pop(); }
    else {
      state.puzzles.hist = state.puzzles.hist.slice(-300);
      state.play.hist = state.play.hist.slice(-300);
      state.mistakes.items = state.mistakes.items.slice(0, 150);
    }
  }
  function setRemote(r) { var was = !!remote; remote = r; if (was !== !!r) emit('storage'); }

  /* Merge the account's copy into ours. Each section is checked first; one that isn't readable counts as missing. */
  function mergeProfile(r) {
    if (!isObj(r)) return false;
    var changed = false, localNewer = false;
    SYNC.forEach(function (k) {
      var rv = cleanSection(k, r[k]), lv = state[k];
      if (!rv) { if (lv && lv.rev) localNewer = true; return; }
      var rRev = rv.rev || 0, lRev = lv.rev || 0, base = rRev > lRev ? rv : lv;
      if (k === 'learn') {
        var done = Object.assign({}, rv.done);
        Object.keys(lv.done).forEach(function (id) {
          var a = lv.done[id], b = done[id];
          if (!b || a.stars > b.stars) done[id] = a;
        });
        var merged = Object.assign({}, base, { rev: Math.max(rRev, lRev), done: done, last: base.last });
        if (JSON.stringify(merged.done) !== JSON.stringify(lv.done) || merged.last !== lv.last) changed = true;
        if (JSON.stringify(merged.done) !== JSON.stringify(rv.done)) localNewer = true;
        state.learn = merged;
        return;
      }
      if (k === 'days') {
        var map = Object.assign({}, rv.map);
        Object.keys(lv.map).forEach(function (d) {
          var a = lv.map[d], b = map[d];
          if (!b) { map[d] = a; localNewer = true; return; }
          map[d] = { g: Math.max(a.g, b.g), p: Math.max(a.p, b.p), l: Math.max(a.l, b.l) };
        });
        if (JSON.stringify(map) !== JSON.stringify(lv.map)) changed = true;
        state.days = Object.assign({}, base, { rev: Math.max(rRev, lRev), map: map });
        return;
      }
      if (k === 'mistakes') {
        var byId = Object.create(null);
        rv.items.forEach(function (it) { byId[it.id] = it; });
        lv.items.forEach(function (it) { var o = byId[it.id]; if (!o || it.seen > o.seen) byId[it.id] = it; });
        var items = Object.keys(byId).map(function (id) { return byId[id]; }).filter(function (it) { return !it.gone; });
        items.sort(function (a, b) { return b.ts - a.ts; });
        items = items.slice(0, LIMIT.mistakes);
        if (JSON.stringify(items) !== JSON.stringify(lv.items)) changed = true;
        if (JSON.stringify(items) !== JSON.stringify(rv.items)) localNewer = true;
        state.mistakes = Object.assign({}, base, { rev: Math.max(rRev, lRev), items: items });
        return;
      }
      if (rRev > lRev) {
        if (k === 'puzzles') rv.seen = orBits(rv.seen, lv.seen);
        state[k] = rv;
        changed = true;
      } else if (lRev > rRev) localNewer = true;
      else if (k === 'puzzles' && rv.seen !== lv.seen) { lv.seen = orBits(rv.seen, lv.seen); localNewer = true; }
    });
    if (localNewer) scheduleRemote('profile');
    return changed;
  }
  function mergeGames(r) {
    if (!isObj(r) || !Array.isArray(r.list)) return false;
    r = cleanSection('games', r);
    if (!r) return false;
    var byId = Object.create(null), changed = false, localExtra = false;
    r.list.forEach(function (g) { byId[g.id] = g; });
    state.games.list.forEach(function (g) {
      var o = byId[g.id];
      if (!o) { byId[g.id] = g; localExtra = true; }
      else if (g.reviewed && !o.reviewed) { byId[g.id] = g; localExtra = true; }
    });
    var list = Object.keys(byId).map(function (id) { return byId[id]; }).sort(function (a, b) { return b.ts - a.ts; }).slice(0, LIMIT.games);
    if (JSON.stringify(list) !== JSON.stringify(state.games.list)) changed = true;
    state.games = Object.assign({}, state.games, { rev: Math.max(r.rev || 0, state.games.rev || 0), list: list });
    if (localExtra) scheduleRemote('games');
    return changed;
  }

  /* Resolves once the account is connected, or it's clear there isn't one. */
  function connectRemote() {
    var C = window.claude, start;
    if (!C || typeof C.use !== 'function') return Promise.resolve();
    try { start = Promise.all([C.use('user'), C.use('db')]); } catch (e) { return Promise.resolve(); }
    return start.then(function (res) {
      var user = res[0], db = res[1];
      if (!user || !db) return;
      return user.id().then(function (id) {
        if (!id) return;
        var base = 'data/users/' + id + '/';
        setRemote({ profile: db.doc(base + 'profile'), games: db.doc(base + 'games') });
        remote.profile.onSnapshot(function (snap) {
          if (!snap.exists) { if (!snap.metadata || !snap.metadata.fromCache) scheduleRemote('profile'); return; }
          if (snap.metadata && snap.metadata.hasPendingWrites) return;
          var data = snap.data();
          lastSent.profile = JSON.stringify(data);
          if (mergeProfile(data)) { writeLocal(); emit('remote'); }
        }, function () { setRemote(null); });
        remote.games.onSnapshot(function (snap) {
          if (!snap.exists) { if (state.games.list.length && (!snap.metadata || !snap.metadata.fromCache)) scheduleRemote('games'); return; }
          if (snap.metadata && snap.metadata.hasPendingWrites) return;
          var data = snap.data();
          lastSent.games = JSON.stringify(data);
          if (mergeGames(data)) { writeLocal(); emit('remote'); }
        }, function () { /* games sync unavailable */ });
      });
    }).catch(function () { setRemote(null); });
  }

  /* ---------- backup ---------- */
  var NOT_BACKUP = 'That doesn’t look like a Tempo backup.';
  var SAVE_FAILED = {
    full: 'There isn’t enough room in this browser’s storage, so the backup wasn’t restored.',
    blocked: 'This browser isn’t letting Tempo save, so the backup wasn’t restored.',
    error: 'The backup couldn’t be saved, so it wasn’t restored.'
  };
  function exportJson() {
    var copy = JSON.parse(JSON.stringify(state));
    copy.current = null;
    copy.exported = new Date().toISOString();
    return JSON.stringify(copy);
  }
  /* { state } for a usable backup, or { error } in words for the person */
  function readBackup(text) {
    var obj, c;
    try { obj = JSON.parse(String(text == null ? '' : text).replace(/^﻿/, '').trim()); } catch (e) { return { error: NOT_BACKUP }; }
    if (!isObj(obj) || obj.v !== 1 || obj.settings === undefined || obj.play === undefined) return { error: NOT_BACKUP };
    c = clean(obj);
    if (c.bad.length) {
      var names = c.bad.map(function (k) { return NAMES[k]; });
      var list = names.length === 1 ? names[0] : names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1];
      return { error: 'This backup is damaged, so nothing was restored. Tempo couldn’t read its ' + list + '.' };
    }
    delete c.state.exported;
    return { state: c.state };
  }
  /* Returns null once the backup is saved, or what went wrong. On failure nothing changes. */
  function importJson(text) {
    var b = readBackup(text);
    if (b.error) return b.error;
    var prev = state, now = Date.now();
    state = b.state;
    SECTIONS.forEach(function (k) { state[k].rev = now; });
    state.current = null;
    var code = tryWrite();
    // saved here, or the account will keep it; otherwise put everything back as it was
    if (code && !remote) { state = prev; return SAVE_FAILED[code] || SAVE_FAILED.error; }
    setSaveError(code);
    scheduleRemote('profile'); scheduleRemote('games');
    if (code) flush();
    emit('import');
    return null;
  }
  function reset() {
    var keepSettings = state.settings;
    state = defaults();
    state.settings = keepSettings;
    var now = Date.now();
    SECTIONS.forEach(function (k) { state[k].rev = now; });
    writeLocal();
    scheduleRemote('profile'); scheduleRemote('games');
    emit('reset');
  }
  function synced() { return !!remote; }

  return {
    init: init, on: on, touch: touch, activity: activity, streak: streak,
    get state() { return state; },
    seenBits: seenBits, saveBits: saveBits,
    exportJson: exportJson, importJson: importJson, reset: reset, synced: synced,
    /* null when text is a backup that can be restored, otherwise the reason it can't */
    checkBackup: function (text) { return readBackup(text).error || null; },
    saveNow: function () { writeLocal(); flush(); },
    /* null, 'full', 'blocked' or 'error': why the last save to this browser failed */
    get saveError() { return saveError; },
    /* try saving now, so a status shown to the person is current; returns saveError */
    verify: function () { writeLocal(); return saveError; },
    copies: copies, copyText: copyText, dropCopy: dropCopy,
    clean: clean,
    THEMES: THEMES, BOARDS: BOARDS, KEY: KEY, COPY_KEY: COPY_KEY
  };
})();
