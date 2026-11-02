/* What the characters say during a game.

   Each character has one line for each of fifteen moments (meeting you, a quiet move, a capture, a check either way,
   a blunder either way, a real tactic, losing its queen, you thinking a long time, the result and a rematch) and a
   running joke in three beats that unfolds in order, only when its moment really happens on the board. The lines
   are the Deep Dialogue pack in content/characters.json: original writing for Tempo, not quotes.

   This file decides which line, if any, goes with the move that was just played; src/ui/play.js shows it. Rules:
   - one remark at most per move, the most important first (a story beat that just came true, a tactic, a check,
     a blunder, a big capture, a pawn, then the quiet things);
   - a line is never said twice in a game, and a beat never comes before the one ahead of it;
   - ordinary remarks follow the character's own pace (its chance per move and the moves between remarks; Lots
     talks half as often again), while a confirmed tactic, a blunder, a lost queen and a beat that just came true
     are said when they happen;
   - a chess claim needs evidence: a fork, a pin or a sacrifice must be on the board and the referee engine must
     agree it works; a blunder needs the referee's scores before and after; a line that names a piece (a rook,
     a bishop, a knight) waits for that piece.
   The referee is a quick, separate analysis of each position (Stockfish where it runs); its scores come in as
   refs, from the character's side. Without them, no claim that needs them is made.

   The game's talk state lives in game.talk, so a game picked up again later goes on where it was:
   { log: [[ply, key, data], ...], heard: { key: 1 }, think: 0|1 }. A takeback cuts the log back to the
   position, so the story follows the moves on the board; lines once heard stay heard. */
(function (G) {
'use strict';
var node = typeof module !== 'undefined' && module.exports;
var C = G.TempoCore || (node ? require('./core.js') : null);
var E = G.TempoEngine || (node ? require('./engine.js') : null);
var Book = G.TempoBook || (node ? require('./book.js') : null);

var PAWN = 1, KNIGHT = 2, BISHOP = 3, ROOK = 4, QUEEN = 5, KING = 6;
var EVENTS = ['greeting', 'quiet_move', 'capture_pawn', 'capture_major', 'opponent_blunder', 'own_blunder', 'check', 'in_check',
  'tactical_success', 'queen_lost', 'player_thinking', 'victory', 'defeat', 'draw', 'rematch'];
var VOICE_FIELDS = ['franchise', 'canon_background', 'tempo_assessment', 'character_interpretation', 'on_board_personality', 'voice_direction',
  'running_bit_description', 'dialogue', 'dialogue_arcs', 'dialogue_style', 'dialogue_requires', 'arc_requires', 'editorial_note'];
var PHASE = { early_game: 1, opening_after_move_3: 1, middlegame: 1, middle_game: 1, late_game: 1 };
// beats that wait for a state of the board, said at the character's own pace while it lasts
var STATE = { bot_has_pawn_chain: 1, rook_endgame: 1, bot_material_down: 1, nonbook_human_move_again: 1, verified_sound_nonbook_move: 1 };
// the rest are events: said on the move they happen
var CLAIM = 200;     // a blunder: the referee's score moves this far (centipawns)
var PAYOFF = 150;    // a tactic: the position is worth this much more than the material on the board says
var THINK_MS = 25000;

/* ---------- the voices ---------- */
var VOICES = null;
function voices() {
  if (VOICES) return VOICES;
  VOICES = {};
  var src = null;
  try {
    if (G.document) { var el = G.document.getElementById('d-voices'); if (el) src = JSON.parse(el.textContent); }
  } catch (e) { src = null; }
  if (!src && node) {
    var d = require('../content/characters.json'); src = { profiles: {} };
    d.profiles.forEach(function (p) { var v = {}; VOICE_FIELDS.forEach(function (k) { if (p[k] != null) v[k] = p[k]; }); src.profiles[p.id] = v; });
  }
  var P = (src && src.profiles) || {};
  Object.keys(P).forEach(function (id) {
    var v = P[id], st = v.dialogue_style || {}, arc = (v.dialogue_arcs || [])[0] || null;
    VOICES[id] = {
      id: id, lines: v.dialogue || {}, req: v.dialogue_requires || {}, arcReq: v.arc_requires || {},
      beats: arc ? arc.beats.slice().sort(function (a, b) { return a.index - b.index; }) : [], theme: arc ? arc.theme : '',
      chance: typeof st.ordinary_turn_chance === 'number' ? st.ordinary_turn_chance : 0.2,
      gap: typeof st.minimum_full_moves_between_ordinary_lines === 'number' ? st.minimum_full_moves_between_ordinary_lines : 4,
      cadence: st.cadence || 'moderate', delivery: st.delivery || 'spoken',
      card: { franchise: v.franchise || '', canon: v.canon_background || '', assessment: v.tempo_assessment || '', why: v.character_interpretation || '',
        board: v.on_board_personality || '', voice: v.voice_direction || '', bit: v.running_bit_description || '' }
    };
  });
  return VOICES;
}
function voice(id) { return voices()[id] || null; }

/* ---------- the game, replayed: who moved what, and which unit is which ---------- */
var cache = { key: null, R: null };
function replay(game) {
  var key = (game.id || '') + '|' + (game.startFen || '') + '|' + game.moves.join(' ');
  if (cache.key === key) return cache.R;
  var p = new C.Pos(game.startFen || C.START_FEN), botSide = game.color === 'w' ? -1 : 1;
  var ids = {}, s;
  for (s = 0; s < 120; s++) { if (s & 8) { s += 7; continue; } if (p.b[s]) ids[s] = 'u' + s; }
  var hist = [], pos = [p.clone()];
  for (var i = 0; i < game.moves.length; i++) {
    var m = p.parseMove(game.moves[i]); if (!m) break;
    var from = m & 127, to = (m >> 7) & 127, fl = m >>> 17, piece = Math.abs(p.b[from]);
    var e = { ply: i + 1, mover: p.side === botSide ? 'bot' : 'human', side: p.side, piece: piece, from: from, to: to, id: ids[from],
      cap: Math.abs(p.moveCaptured(m)), capId: null, promo: (fl & 16) ? ((m >> 14) & 7) : 0, castle: (fl & 4) !== 0, m: m, uci: game.moves[i] };
    var capSq = (fl & 2) ? to - 16 * p.side : to;
    if (e.cap) { e.capId = ids[capSq]; delete ids[capSq]; }
    ids[to] = ids[from]; delete ids[from];
    if (e.castle) { // the rook's move, by the king's
      var rf = to > from ? to + 1 : to - 2, rt = to > from ? to - 1 : to + 1;
      ids[rt] = ids[rf]; delete ids[rf];
    }
    p.make(m);
    e.check = p.inCheck();
    hist.push(e); pos.push(p.clone());
  }
  var R = { hist: hist, pos: pos, botSide: botSide, ids: ids };
  cache = { key: key, R: R };
  return R;
}

/* ---------- small board facts ---------- */
var TEMPO_V = [0, 100, 320, 330, 500, 900, 0], SF_V = [0, 100, 390, 410, 630, 1230, 0];
/* material from `side`'s point of view, in the scale of the engine that scored the position */
function material(p, side, engine) {
  var V = engine === 'stockfish' ? SF_V : TEMPO_V, sum = 0;
  for (var s = 0; s < 120; s++) { if (s & 8) { s += 7; continue; } var x = p.b[s]; if (x) sum += (x > 0 ? 1 : -1) * side * V[Math.abs(x)]; }
  return sum;
}
function squaresOf(p, side, type) {
  var out = [];
  for (var s = 0; s < 120; s++) { if (s & 8) { s += 7; continue; } if (p.b[s] === type * side) out.push(s); }
  return out;
}
function has(p, side, type) { return squaresOf(p, side, type).length > 0; }
/* the longest diagonal chain of `side`'s pawns, each one defended by the one behind it */
function chain(p, side) {
  var pawns = squaresOf(p, side, PAWN), memo = {};
  function len(s) {
    if (memo[s] != null) return memo[s];
    var best = 1;
    [15, 17].forEach(function (o) { var t = s + o * side; if (!(t & 0x88) && p.b[t] === PAWN * side) best = Math.max(best, 1 + len(t)); });
    return (memo[s] = best);
  }
  return pawns.reduce(function (a, s) { return Math.max(a, len(s)); }, 0);
}
function rookEnding(p) {
  var rooks = { 1: 0, '-1': 0 };
  for (var s = 0; s < 120; s++) {
    if (s & 8) { s += 7; continue; }
    var x = p.b[s], t = Math.abs(x); if (!x) continue;
    if (t === KNIGHT || t === BISHOP || t === QUEEN) return false;
    if (t === ROOK) rooks[x > 0 ? 1 : -1]++;
  }
  return rooks[1] > 0 && rooks[-1] > 0;
}
/* a piece of `side` (not a pawn or the king) with no legal move */
function stuckPiece(p, side) {
  var q = p.clone();
  if (q.side !== side) { if (q.inCheck()) return false; q.makeNull(); }
  var moving = {};
  q.legalMoves().forEach(function (m) { moving[m & 127] = 1; });
  for (var s = 0; s < 120; s++) {
    if (s & 8) { s += 7; continue; }
    var x = q.b[s] * side;
    if (x >= KNIGHT && x <= QUEEN && !moving[s]) return true;
  }
  return false;
}
function defenders(p, sq, side) { return p.attackersOf(sq, side).map(function (s) { return { sq: s, type: Math.abs(p.b[s]) }; }); }
/* was the move theory? the position before it is in Tempo's book, and the move isn't one of the book's moves there */
function leftBook(before, uci) {
  if (!Book || !Book.known) return false;
  return Book.known(before) && !Book.known(before, uci);
}
function phase(k, after) {
  var end = E.isEndgame(after);
  return { early_game: k <= 20 && !end, opening_after_move_3: k >= 6 && k <= 24 && !end, middlegame: k > 20 && !end, middle_game: k > 20 && !end, late_game: end || k >= 60 };
}
function forward(e, botSide) { return ((e.to >> 4) - (e.from >> 4)) * botSide > 0; }

/* ---------- the game's talk state ---------- */
function state(game) {
  var t = game.talk;
  if (!t || typeof t !== 'object' || !Array.isArray(t.log)) t = game.talk = { log: [], heard: {}, think: 0 };
  t.log = t.log.filter(function (x) { return Array.isArray(x) && typeof x[0] === 'number' && typeof x[1] === 'string'; });
  if (!t.heard || typeof t.heard !== 'object') t.heard = {};
  return t;
}
function upto(t, k) { return t.log.filter(function (x) { return x[0] <= k; }); }
function lastSaid(t, k) { return upto(t, k).reduce(function (a, x) { return Math.max(a, x[0]); }, -99); }
function beatsSaid(t, k) { return upto(t, k).filter(function (x) { return /^arc\d$/.test(x[1]); }); }
/* after a takeback: what was said beyond the position on the board didn't happen */
function truncate(game) {
  var t = state(game), n = game.moves.length;
  t.log = t.log.filter(function (x) { return x[0] <= n; });
  return t;
}
function mark(t, k, c) {
  t.log.push(c.data != null ? [k, c.key, c.data] : [k, c.key]);
  if (!/^arc/.test(c.key)) t.heard[c.key] = 1;
  return { key: c.key, text: c.text, beat: c.beat || 0 };
}

/* ---------- requirements written next to the lines ---------- */
function lineOk(req, x) {
  if (!req) return true;
  var e = x.e, f = x.f || {};
  switch (req) {
    case 'pawn': return e.piece === PAWN;
    case 'pawn1': return e.piece === PAWN && Math.abs(e.to - e.from) === 16;
    case 'knight': return e.piece === KNIGHT;
    case 'retreat': return !!f.retreat;
    case 'develop': return !!f.develop;
    case 'best': return !x.res || ['book', 'best', 'search'].indexOf(x.res.kind) >= 0;
    case 'forward': return forward(e, x.botSide);
    case 'step': return Math.max(Math.abs((e.to & 7) - (e.from & 7)), Math.abs((e.to >> 4) - (e.from >> 4))) === 1;
    case 'rook': return e.cap === ROOK;
    case 'free': return x.before.attackersOf(e.to, -e.side).length === 0;
    case 'bishop': { var k = x.botSide === 1 ? x.after.wk : x.after.bk; return x.after.attackersOf(k, -x.botSide).some(function (s) { return Math.abs(x.after.b[s]) === BISHOP; }); }
    case 'hasrook': return has(x.after, x.botSide, ROOK);
    case 'hasbishop': return has(x.after, x.botSide, BISHOP);
    case 'fork': return !!(f.fork || f.checkFork);
    case 'knightfork': return !!(f.fork || f.checkFork) && e.piece === KNIGHT;
    case 'forkdisc': return !!(f.fork || f.checkFork || f.discovered);
    case 'sac': return !!(f.sac || f.exchangeSac);
    case 'overload': return !!f.removeDefender;
    case 'hanging': return !!x.hangingBefore;
    case 'stalemate': return x.reason === 'stalemate';
  }
  return false;
}

/* ---------- the referee's evidence ---------- */
function clampV(v) { return Math.max(-1000, Math.min(1000, v)); }
function moved(a, b) { // how far the score moved from a to b, if it means anything (same engine, not both decided)
  if (!a || !b || a.engine !== b.engine) return null;
  var x = clampV(a.v), y = clampV(b.v);
  if ((x >= 800 && y >= 800) || (x <= -800 && y <= -800)) return 0;
  return y - x;
}
/* a motif on the board that the referee says pays off: worth more than the material shows, and no worse than before */
function tactic(x, refs) {
  var f = x.f || {};
  if (!(f.fork || f.checkFork || f.pin || f.skewer || f.discovered || f.removeDefender || f.traps || f.sac || f.exchangeSac)) return false;
  var now = refs.now, prev = refs.prev;
  if (!now || !prev || now.engine !== prev.engine) return false;
  if (clampV(now.v) - now.mat < PAYOFF) return false;
  return clampV(now.v) >= clampV(prev.v) - 40;
}

/* ---------- story beats ---------- */
function beatCheck(V, t, R, k, x, refs, res) {
  var said = beatsSaid(t, k), i = said.length;
  if (i >= V.beats.length) return null;
  var beat = V.beats[i], prev = said[i - 1] || null;
  if (prev && k - prev[0] < 4) return null;
  if (i === 0 && k < 1) return null;
  var extra = V.arcReq[String(beat.index)] || '', hint = beat.trigger_hint;
  if (/^hint:/.test(extra)) { hint = extra.slice(5); extra = ''; }
  var e = x.e, bot = R.botSide, mover = e.mover, after = x.after, data = null, ok = false, kind = 'event';
  if (PHASE[hint]) { kind = 'phase'; ok = mover === 'bot' && phase(k, after)[hint]; }
  else if (STATE[hint]) {
    kind = 'state';
    if (mover !== 'bot') ok = false;
    else if (hint === 'bot_has_pawn_chain') ok = chain(after, bot) >= 3;
    else if (hint === 'rook_endgame') ok = rookEnding(after);
    else if (hint === 'bot_material_down') ok = R.hist.slice(0, k).filter(function (h) { return h.mover === 'human' && h.cap; }).length >= 3 && material(after, bot) < 0;
    else if (hint === 'nonbook_human_move_again') ok = !!refs.prev;
    else if (hint === 'verified_sound_nonbook_move') ok = !!refs.prev && clampV(refs.prev.v) <= 50;
  } else {
    switch (hint) {
      case 'bot_queen_moved': case 'bot_queen_moved_again': ok = mover === 'bot' && e.piece === QUEEN; break;
      case 'bot_queen_captured': ok = mover === 'human' && e.cap === QUEEN; break;
      case 'bot_pawn_captured': ok = mover === 'human' && e.cap === PAWN; break;
      case 'bot_bishop_captured': ok = mover === 'human' && e.cap === BISHOP; break;
      case 'piece_captured': ok = !!e.cap; break;
      case 'bishop_moves': ok = mover === 'human' && e.piece === BISHOP; data = e.id; break;
      case 'bishop_moves_again': ok = mover === 'human' && e.piece === BISHOP && !!prev && e.id === prev[2]; data = e.id; break;
      case 'bot_castles': ok = mover === 'bot' && e.castle; break;
      case 'verified_tactic': ok = mover === 'bot' && tactic(x, refs); break;
      case 'bot_pawn_chain_broken': ok = chain(after, bot) < 3 && chain(x.before, bot) >= 3; break;
      case 'nonbook_human_move': case 'human_nonbook_move': ok = mover === 'human' && k <= 24 && leftBook(x.before, e.uci); break;
      case 'bot_tactical_opportunity':
        if (mover === 'bot' && res && res.top && res.top !== e.uci && res.best != null && res.score != null && res.best - res.score >= 50) {
          var tm = x.before.parseMove(res.top), tf = tm ? E.features(x.before, tm, {}, false) : null;
          ok = !!(tf && (tf.sac || tf.exchangeSac));
        }
        break;
      case 'human_same_pawn_moves_twice':
        ok = mover === 'human' && e.piece === PAWN && k <= 24 && R.hist.slice(0, k - 1).some(function (h) { return h.id === e.id; }); data = e.id; break;
      case 'human_pawn_sacrificed':
        ok = mover === 'bot' && e.cap === PAWN && !!prev && e.capId === prev[2] && !!refs.now && clampV(refs.now.v) - refs.now.mat <= -60; break;
      case 'pawn_promotion': ok = !!e.promo; break;
      case 'human_piece_sacrifice': case 'human_sacrifice':
        ok = mover === 'bot' && e.cap >= KNIGHT && e.cap <= QUEEN && !!refs.now && clampV(refs.now.v) - refs.now.mat <= -PAYOFF; break;
      default: ok = false; // a hint Tempo doesn't know: the beat waits rather than guessing
    }
  }
  if (ok && extra) {
    var hq, hside = -bot;
    switch (extra) {
      case 'third_move': ok = R.hist.slice(0, k).filter(function (h) { return h.mover === 'human'; }).length === 3; break;
      case 'playable': ok = !!refs.prev && Math.abs(clampV(refs.prev.v)) <= 120; break;
      case 'pawn_takes_pawn': ok = e.piece === PAWN && e.cap === PAWN; break;
      case 'rooks_still': ok = !R.hist.slice(prev ? prev[0] : 0, k).some(function (h) { return h.mover === 'human' && h.piece === ROOK; }); break;
      case 'bot_was_on_e4': { var e4 = C.sqIndex('e4'); ok = R.hist.slice(0, k).some(function (h) { return h.mover === 'bot' && h.to === e4; }) || after.b[e4] * bot > 0; break; }
      case 'human_queen': ok = has(after, hside, QUEEN); break;
      case 'human_knight': ok = has(after, hside, KNIGHT); break;
      case 'bot_piece_stuck': ok = stuckPiece(after, bot); break;
      case 'queen_by_knight': case 'queen_guard_changed': case 'queen_by_pawn_only':
        hq = squaresOf(after, hside, QUEEN)[0];
        if (hq == null) { ok = false; break; }
        var d = defenders(after, hq, hside), ids = R.ids;
        if (k !== R.hist.length) { ok = false; break; } // the queen's guards are only known for the position on the board
        if (extra === 'queen_by_knight') { var kn = d.filter(function (q) { return q.type === KNIGHT; })[0]; ok = !!kn; data = kn ? ids[kn.sq] : null; }
        else if (extra === 'queen_guard_changed') ok = !!prev && d.length > 0 && !d.some(function (q) { return ids[q.sq] === prev[2]; });
        else ok = d.length > 0 && d.every(function (q) { return q.type === PAWN; });
        break;
      default: ok = false;
    }
  }
  if (!ok) return null;
  return { key: 'arc' + (i + 1), text: beat.line, beat: i + 1, data: data, kind: kind, crit: kind === 'event' };
}

/* ---------- choosing ---------- */
function pace(V, opts) {
  var lots = opts && opts.chat === 'lots';
  return { chance: Math.min(0.55, V.chance * (lots ? 1.5 : 1)), gap: 2 * Math.max(1, V.gap - (lots ? 1 : 0)) };
}
function choose(cands, V, t, k, opts) {
  var p = pace(V, opts), last = lastSaid(t, k), rolled = null, rng = (opts && opts.rng) || Math.random;
  for (var i = 0; i < cands.length; i++) {
    var c = cands[i];
    if (!c || !c.text) continue;
    if (!/^arc/.test(c.key) && t.heard[c.key]) continue;
    if (c.crit) { if (k > last) return c; continue; }
    if (k - last < p.gap) continue;
    if (rolled === null) rolled = rng() < p.chance;
    if (rolled) return c;
  }
  return null;
}
function off(opts) { return !opts || opts.chat === 'off'; }
function line(V, x, ev) {
  var text = V.lines[ev];
  if (!text || !lineOk(V.req[ev], x)) return null;
  return text;
}
function factsAt(game, R, k, extra) {
  var e = R.hist[k - 1]; if (!e) return null;
  var before = R.pos[k - 1], after = R.pos[k], last = 0;
  for (var j = k - 2; j >= 0; j--) if (R.hist[j].mover === e.mover) { last = R.hist[j].m; break; }
  var x = { e: e, before: before, after: after, botSide: R.botSide, f: E.features(before, e.m, { last: last }, true) };
  if (extra) Object.keys(extra).forEach(function (key) { x[key] = extra[key]; });
  return x;
}

/* ---------- the moments ---------- */
/* the first thing said: hello, or "again?" on a rematch */
function start(game, bot, opts) {
  var V = voice(bot.id), t = state(game);
  if (off(opts) || !V || t.log.length || game.moves.length) return null;
  var key = game.rematch && V.lines.rematch ? 'rematch' : 'greeting';
  return V.lines[key] ? mark(t, 0, { key: key, text: V.lines[key] }) : null;
}
/* after your move: you checked it, took its queen, or made one of its beats come true */
function human(game, bot, opts) {
  var V = voice(bot.id), t = state(game), k = game.moves.length;
  if (off(opts) || !V || !k) return null;
  var R = replay(game), x = factsAt(game, R, k);
  if (!x || x.e.mover !== 'human' || x.after.status().over) return null;
  var beat = beatCheck(V, t, R, k, x, {}, null), cands = [];
  if (beat && beat.crit) cands.push(beat);
  if (x.e.cap === QUEEN) cands.push({ key: 'queen_lost', text: line(V, x, 'queen_lost'), crit: true });
  if (x.e.check) cands.push({ key: 'in_check', text: line(V, x, 'in_check') });
  var c = choose(cands, V, t, k, opts);
  return c ? mark(t, k, c) : null;
}
/* after its own move. res: what its engine said about the move ({ kind, score, best, top }); refs: the referee's
   scores from its side for the positions before your last move (prev2), before its move (prev) and now (now) */
function botMove(game, bot, res, refs, opts) {
  var V = voice(bot.id), t = state(game), k = game.moves.length;
  if (off(opts) || !V || !k) return null;
  refs = refs || {};
  var R = replay(game), x = factsAt(game, R, k, { res: res || null });
  if (!x || x.e.mover !== 'bot' || x.after.status().over) return null;
  x.hangingBefore = E.prepare(x.before).theirs.total >= 100;
  var e = x.e, cands = [], beat = beatCheck(V, t, R, k, x, refs, res);
  if (beat && beat.crit) cands.push(beat);
  if (tactic(x, refs)) cands.push({ key: 'tactical_success', text: line(V, x, 'tactical_success'), crit: true });
  if (e.check) cands.push({ key: 'check', text: line(V, x, 'check') });
  var swing = moved(refs.prev2, refs.prev), drop = moved(refs.prev, refs.now);
  if (swing != null && swing >= CLAIM) cands.push({ key: 'opponent_blunder', text: line(V, x, 'opponent_blunder'), crit: true });
  if (drop != null && -drop >= CLAIM) cands.push({ key: 'own_blunder', text: line(V, x, 'own_blunder'), crit: true });
  if (e.cap === ROOK || e.cap === QUEEN) cands.push({ key: 'capture_major', text: line(V, x, 'capture_major') });
  if (e.cap === PAWN) cands.push({ key: 'capture_pawn', text: line(V, x, 'capture_pawn') });
  if (beat && !beat.crit) cands.push(beat);
  var quiet = !e.cap && !e.check && !e.promo && !e.castle && !tactic(x, refs);
  if (quiet) cands.push({ key: 'quiet_move', text: line(V, x, 'quiet_move') });
  var c = choose(cands, V, t, k, opts);
  return c ? mark(t, k, c) : null;
}
/* you've been thinking a while: once a game */
function thinking(game, bot, opts) {
  var V = voice(bot.id), t = state(game), k = game.moves.length;
  if (off(opts) || !V || t.think || t.heard.player_thinking || !V.lines.player_thinking) return null;
  t.think = 1;
  return mark(t, k, { key: 'player_thinking', text: V.lines.player_thinking, crit: true });
}
/* the result, from the character's side: score is yours (1 you won, 0.5 a draw, 0 it won) */
function end(game, bot, score, reason, opts) {
  var V = voice(bot.id);
  if (off(opts) || !V) return null;
  var key = score === 1 ? 'defeat' : score === 0.5 ? 'draw' : 'victory', text = V.lines[key];
  if (!text || !lineOk(V.req[key], { reason: reason })) return null;
  return { key: key, text: text };
}
/* stage directions in brackets come apart from the spoken words */
function parts(text) {
  var out = [], re = /\[([^\]]+)\]/g, at = 0, m;
  while ((m = re.exec(text))) {
    if (m.index > at) out.push({ act: false, text: text.slice(at, m.index).trim() });
    out.push({ act: true, text: m[1].trim() });
    at = re.lastIndex;
  }
  if (at < text.length) out.push({ act: false, text: text.slice(at).trim() });
  return out.filter(function (x) { return x.text; });
}
/* how long a line stays up: long enough to read */
function readMs(text) { return Math.max(4000, Math.min(9500, 2200 + 58 * (text || '').length)); }

var Talk = { EVENTS: EVENTS, VOICE_FIELDS: VOICE_FIELDS, THINK_MS: THINK_MS, voice: voice, voices: voices, state: state, truncate: truncate,
  start: start, human: human, bot: botMove, thinking: thinking, end: end, parts: parts, readMs: readMs, material: material,
  _replay: replay, _chain: chain, _lineOk: lineOk, _pace: pace };
G.TempoTalk = Talk;
if (node) module.exports = Talk;
})(typeof self !== 'undefined' ? self : (typeof globalThis !== 'undefined' ? globalThis : this));
