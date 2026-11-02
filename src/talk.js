/* What the characters say during a game: the Character Voice V5 pack in content/characters.json, original writing
   for Tempo, not quotes.

   Each character has a line for each of its moments (hello, a rematch, a quiet move, a capture, a check either way,
   a blunder either way, its special, winning and losing) and a story in three beats, each played only when its
   moment really happens on the board, in order. Each also has a way of talking (voice.mode): spoken; only its own
   name (Psyduck, Pikachu); typed into a game chat (Roblox Noob, the Crewmate); announced over a speaker (Freddy);
   thought (Mewtwo); or silent (Peely, Steve, Derpy Tiger), who never say anything at all.

   This file decides which line, if any, goes with the move just played; src/ui/play.js shows it. The pack's rules:
   - one remark at most per move, the most important: a check (either way), then a special the evidence backs, then
     a blunder the referee confirms, then a story beat that just came true, then a capture, then a quiet move. When a
     beat and the special come true on the same move the beat goes first, since a story can't skip its beats;
   - after any remark the character is quiet for its cooldown (voice.cooldown_full_moves, in full moves); a check,
     a capture or a quiet move is said only on a roll of its chance (voice.baseline_line_chance). Frequent talks
     half as often again and rests a move less;
   - a line is said once a game at most; a beat never comes before the one ahead of it;
   - a chess claim needs evidence: a fork, a pin, a sacrifice or a trap must be on the board and the referee must
     agree it works; a blunder needs the referee's scores before and after; a line that describes the board
     (dialogue_requires) waits for the board to match. Without the evidence the character says nothing, never
     something close instead.
   The referee is a quick, separate look at each position (Stockfish where it runs, else the built-in engine). Its
   scores come in as refs, from the character's side: { prev2, prev, now, past }. Without them, nothing that needs
   them is said; captures, checks, quiet moves and results don't need them.

   The game's talk state lives in game.talk, so a game picked up again goes on where it was:
   { log: [[ply, key, data], ...], heard: { key: 1 } }. A line goes into the log only when it was really shown
   (said()). A takeback cuts the log back to the position, so the story follows the moves on the board; lines once
   heard stay heard. Dialogue never changes a move, a rating or a saved record. */
(function (G) {
'use strict';
var node = typeof module !== 'undefined' && module.exports;
var C = G.TempoCore || (node ? require('./core.js') : null);
var E = G.TempoEngine || (node ? require('./engine.js') : null);
var Book = G.TempoBook || (node ? require('./book.js') : null);

var PAWN = 1, KNIGHT = 2, BISHOP = 3, ROOK = 4, QUEEN = 5, KING = 6;
var EVENTS = ['greeting', 'rematch', 'quiet_move', 'capture', 'check', 'in_check', 'opponent_blunder', 'own_blunder', 'special', 'victory', 'defeat'];
var MODES = ['spoken', 'name_only', 'in_game_text', 'speaker_pa', 'telepathic', 'silent'];
var VOICE_FIELDS = ['franchise', 'canon_bio', 'tempo_assessment', 'chess_style', 'voice', 'dialogue', 'line_guards', 'story_arc',
  'dialogue_requires', 'arc_requires', 'special_guards'];
var ORDINARY = { check: 1, in_check: 1, capture: 1, quiet_move: 1 };   // said on a roll of the character's chance
var CLAIM = 200;     // a blunder: the referee's score moves this far (centipawns)
var PAYOFF = 150;    // a tactic: the position is worth this much more than the material on the board says
var BEAT_GAP = 4;    // plies at least between two beats of a story

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
    var v = P[id], vo = v.voice || {}, mode = MODES.indexOf(vo.mode) >= 0 ? vo.mode : 'spoken';
    var arc = (v.story_arc || []).slice().sort(function (a, b) { return a.beat - b.beat; });
    VOICES[id] = {
      id: id, mode: mode, lines: mode === 'silent' ? {} : (v.dialogue || {}), req: v.dialogue_requires || {}, arcReq: v.arc_requires || {},
      // the evidence a special waits for: the pack's guards, or Tempo's where the pack gave none
      guards: (v.special_guards && v.special_guards.length) ? v.special_guards : ((v.line_guards && v.line_guards.special) || []),
      arc: mode === 'silent' ? [] : arc,
      chance: typeof vo.baseline_line_chance === 'number' ? vo.baseline_line_chance : 0.3,
      cooldown: typeof vo.cooldown_full_moves === 'number' ? vo.cooldown_full_moves : 3,
      card: { franchise: v.franchise || '', canon: v.canon_bio || '', assessment: v.tempo_assessment || '', style: v.chess_style || '' }
    };
  });
  return VOICES;
}
function voice(id) { return voices()[id] || null; }
function mode(id) { var V = voice(id); return V ? V.mode : 'spoken'; }

/* ---------- the game, replayed: who moved what, and which unit is which ---------- */
var cache = { key: null, R: null };
function replay(game) {
  var key = (game.id || '') + '|' + (game.startFen || '') + '|' + (game.color || '') + '|' + game.moves.join(' ');
  if (cache.key === key) return cache.R;
  var p = new C.Pos(game.startFen || C.START_FEN), botSide = game.color === 'w' ? -1 : 1;
  var ids = {}, s;
  for (s = 0; s < 120; s++) { if (s & 8) { s += 7; continue; } if (p.b[s]) ids[s] = 'u' + s; }
  var hist = [], pos = [p.clone()], idAt = [copy(ids)];
  for (var i = 0; i < game.moves.length; i++) {
    var m = p.parseMove(game.moves[i]); if (!m) break;
    var from = m & 127, to = (m >> 7) & 127, fl = m >>> 17, piece = Math.abs(p.b[from]);
    var capSq = (fl & 2) ? to - 16 * p.side : to;
    var e = { ply: i + 1, mover: p.side === botSide ? 'bot' : 'human', side: p.side, piece: piece, from: from, to: to, id: ids[from],
      cap: Math.abs(p.moveCaptured(m)), capSq: capSq, capId: null, promo: (fl & 16) ? ((m >> 14) & 7) : 0, castle: (fl & 4) !== 0, m: m, uci: game.moves[i] };
    if (e.cap) { e.capId = ids[capSq]; delete ids[capSq]; }
    ids[to] = ids[from]; if (to !== from) delete ids[from];
    if (e.castle) { // the rook's move, by the king's
      var rf = to > from ? to + 1 : to - 2, rt = to > from ? to - 1 : to + 1;
      ids[rt] = ids[rf]; delete ids[rf];
    }
    p.make(m);
    e.check = p.inCheck();
    hist.push(e); pos.push(p.clone()); idAt.push(copy(ids));
  }
  var R = { hist: hist, pos: pos, idAt: idAt, botSide: botSide };
  cache = { key: key, R: R };
  return R;
}
function copy(o) { var c = {}; for (var k in o) c[k] = o[k]; return c; }

/* ---------- small board facts ---------- */
var TEMPO_V = [0, 100, 320, 330, 500, 900, 0], SF_V = [0, 100, 390, 410, 630, 1230, 0];
/* material from `side`'s point of view, in the scale of the engine that scored the position */
function material(p, side, engine) {
  var V = engine === 'stockfish' ? SF_V : TEMPO_V, sum = 0;
  for (var s = 0; s < 120; s++) { if (s & 8) { s += 7; continue; } var x = p.b[s]; if (x) sum += (x > 0 ? 1 : -1) * side * V[Math.abs(x)]; }
  return sum;
}
function each(p, side, fn) { // every square holding one of `side`'s pieces
  for (var s = 0; s < 120; s++) { if (s & 8) { s += 7; continue; } var x = p.b[s]; if (x && (x > 0) === (side === 1)) fn(s, Math.abs(x)); }
}
function has(p, side, type) { var n = 0; each(p, side, function (s, t) { if (t === type) n++; }); return n > 0; }
function relRank(sq, side) { return side === 1 ? sq >> 4 : 7 - (sq >> 4); }
function kingSq(p, side) { return side === 1 ? p.wk : p.bk; }
function nonPawn(p, side) { var v = 0; each(p, side, function (s, t) { if (t >= KNIGHT && t <= QUEEN) v += TEMPO_V[t]; }); return v; }
/* two of `side`'s rooks see each other along a rank or a file */
function rooksConnected(p, side) {
  var r = []; each(p, side, function (s, t) { if (t === ROOK) r.push(s); });
  for (var i = 0; i < r.length; i++) for (var j = i + 1; j < r.length; j++) {
    var a = r[i], b = r[j], d = (a >> 4) === (b >> 4) ? 1 : (a & 7) === (b & 7) ? 16 : 0;
    if (!d) continue;
    var lo = Math.min(a, b), hi = Math.max(a, b), clear = true;
    for (var q = lo + d; q < hi; q += d) if (p.b[q]) { clear = false; break; }
    if (clear) return true;
  }
  return false;
}
function openFile(p, file) { for (var r = 0; r < 8; r++) if (Math.abs(p.b[(r << 4) | file]) === PAWN) return false; return true; }
function heavyOn(p, file, side) { for (var r = 0; r < 8; r++) { var x = p.b[(r << 4) | file] * side; if (x === ROOK || x === QUEEN) return true; } return false; }
/* a piece of `side` (worth `min` or more) that hangs in `after` and didn't in `before`: its square, the most valuable first */
function newlyHanging(before, after, side, min) {
  var best = null, bv = 0;
  each(after, side, function (s, t) {
    if (t === KING || TEMPO_V[t] < min) return;
    if (!(after.hangingLoss(s) > 0)) return;
    if (before.b[s] === after.b[s] && before.hangingLoss(s) > 0) return;
    if (TEMPO_V[t] > bv) { bv = TEMPO_V[t]; best = s; }
  });
  return best;
}
/* was the move theory? the position before it is in Tempo's book, and the move isn't one of the book's moves there */
function leftBook(before, uci) {
  if (!Book || !Book.known) return false;
  return Book.known(before) && !Book.known(before, uci);
}

/* ---------- the game's talk state ---------- */
function state(game) {
  var t = game.talk;
  if (!t || typeof t !== 'object' || !Array.isArray(t.log)) t = game.talk = { log: [], heard: {} };
  t.log = t.log.filter(function (x) { return Array.isArray(x) && typeof x[0] === 'number' && typeof x[1] === 'string'; });
  if (!t.heard || typeof t.heard !== 'object') t.heard = {};
  delete t.think;
  return t;
}
function upto(t, k) { return t.log.filter(function (x) { return x[0] <= k; }); }
function lastSaid(t, k) { return upto(t, k).reduce(function (a, x) { return Math.max(a, x[0]); }, -99); }
/* the beats said so far, in order: arc1, arc2, arc3 (anything out of order ends the story there) */
function beatsSaid(t, k) {
  var out = [];
  upto(t, k).forEach(function (x) { if (x[1] === 'arc' + (out.length + 1)) out.push(x); });
  return out;
}
/* after a takeback: what was said beyond the position on the board didn't happen */
function truncate(game) {
  var t = state(game), n = game.moves.length;
  t.log = t.log.filter(function (x) { return x[0] <= n; });
  return t;
}
/* the line was shown: it goes into the game's story (a line for a position that's gone isn't) */
function said(game, c) {
  if (!c || !game || game.moves.length !== c.ply) return false;
  var t = state(game);
  t.log.push(c.data != null ? [c.ply, c.key, c.data] : [c.ply, c.key]);
  if (!/^arc/.test(c.key)) t.heard[c.key] = 1;
  return true;
}

/* ---------- the referee's evidence ---------- */
function clampV(v) { return Math.max(-1000, Math.min(1000, v)); }
function same(a, b) { return !!(a && b && a.engine === b.engine); }
function moved(a, b) { // how far the score moved from a to b, if it means anything (same engine, not both decided)
  if (!same(a, b)) return null;
  var x = clampV(a.v), y = clampV(b.v);
  if ((x >= 800 && y >= 800) || (x <= -800 && y <= -800)) return 0;
  return y - x;
}
/* its move cost it no more than `tol` by the referee */
function sound(r, tol) { var d = moved(r.prev, r.now); return d != null && d >= -tol; }
/* how much more the position is worth than its material says */
function payoff(r) { return clampV(r.v) - r.mat; }
function motif(f) { return !!(f.fork || f.checkFork || f.pin || f.skewer || f.discovered || f.removeDefender || f.traps); }
/* a tactic of its own: a motif on the board that the referee says pays, and no worse than before */
function vTactic(x, r) { return x.e.mover === 'bot' && motif(x.f) && same(r.prev, r.now) && payoff(r.now) >= PAYOFF && sound(r, 40); }
/* a sacrifice it made: the piece (or a pawn) left to be taken, and the referee says it costs nothing */
function sacOf(x) { var f = x.f; return (f.sac || f.exchangeSac) ? 'piece' : (f.pawnSac && x.e.piece === PAWN) ? 'pawn' : null; }
function vSac(x, r) { return x.e.mover === 'bot' && !!sacOf(x) && sound(r, 60); }
/* out of trouble: in check with few ways out, or a piece hanging; after the move nothing hangs and nothing was lost.
   by: the trouble came from that kind of piece */
function vEscape(x, r, by) {
  var before = x.before, after = x.after, bot = x.botSide;
  var mine = E.prepare(before).mine, inCheck = before.inCheck();
  if (!(mine.total >= 100 || (inCheck && before.legalMoves().length <= 3))) return false;
  if (by) {
    var src = inCheck ? before.attackersOf(kingSq(before, bot), -bot) : [];
    mine.list.forEach(function (s) { src = src.concat(before.attackersOf(s, -bot)); });
    if (!src.some(function (s) { return Math.abs(before.b[s]) === by; })) return false;
  }
  return E.prepare(after).theirs.total === 0 && !E.mateInOne(after) && sound(r, 30);
}
/* you took something that looked free, and the referee says it cost you at least `need` */
function vTrap(x, r, need) {
  var e = x.e;
  if (e.mover !== 'human' || !e.cap || !(x.before.hangingLoss(e.capSq) > 0)) return false;
  var d = moved(r.prev, r.now);
  return d != null && d >= need;
}

/* ---------- specials: the evidence each kind waits for ---------- */
function onBot(fn) { fn.side = 'bot'; return fn; }
function onYou(fn) { fn.side = 'human'; return fn; }
var SPECIALS = {
  verified_tactic: onBot(function (x, r) { return vTactic(x, r); }),
  verified_knight_fork: onBot(function (x, r) { return x.e.piece === KNIGHT && !!(x.f.fork || x.f.checkFork) && vTactic(x, r); }),
  verified_knight_tactic: onBot(function (x, r) { return x.e.piece === KNIGHT && vTactic(x, r); }),
  verified_quiet_tactic: onBot(function (x, r) { return !x.e.cap && !x.e.check && vTactic(x, r); }),
  verified_capture_tactic: onBot(function (x, r) { return !!x.e.cap && vTactic(x, r); }),
  verified_sacrifice: onBot(function (x, r) { return vSac(x, r); }),
  verified_escape: onBot(function (x, r) { return vEscape(x, r, 0); }),
  verified_escape_or_tactic: onBot(function (x, r) { return vEscape(x, r, 0) || vTactic(x, r); }),
  verified_escape_from_knight: onBot(function (x, r) { return vEscape(x, r, KNIGHT); }),
  // a pawn breaking into your pawns, and the referee says it holds
  verified_pawn_break: onBot(function (x, r) { return x.e.piece === PAWN && !!x.f.brk && sound(r, 40) && clampV(r.now.v) >= -50; }),
  // back from a bad spot: the referee had it 150 or more behind in the last six plies, and now it's level or better
  verified_recovery: onBot(function (x, r) {
    if (!r.now || clampV(r.now.v) < 0 || !sound(r, 40)) return false;
    return (r.past || []).some(function (p) { return same(p, r.now) && clampV(p.v) <= -150; });
  }),
  // the piece it moved and another of its pieces both hit one of your pieces, and the referee says it pays
  multi_piece_coordination: onBot(function (x, r) {
    var hit = false, bot = x.botSide;
    each(x.after, -bot, function (s, t) {
      if (t === KING || t === PAWN) return;
      var a = x.after.attackersOf(s, bot);
      if (a.length >= 2 && a.indexOf(x.e.to) >= 0) hit = true;
    });
    return hit && same(r.prev, r.now) && payoff(r.now) >= 100 && sound(r, 40);
  }),
  // three or more of its pieces hitting the squares around your king, and the referee says it's clearly better
  strong_coordinated_attack: onBot(function (x, r) {
    var after = x.after, bot = x.botSide, k = kingSq(after, -bot), zone = [k], by = {};
    [-17, -16, -15, -1, 1, 15, 16, 17].forEach(function (d) { if (!((k + d) & 0x88)) zone.push(k + d); });
    zone.forEach(function (z) { after.attackersOf(z, bot).forEach(function (s) { if (Math.abs(after.b[s]) !== KING) by[s] = 1; }); });
    return Object.keys(by).length >= 3 && !!r.now && clampV(r.now.v) >= 150 && sound(r, 40);
  }),
  // its move goes after a piece of yours that can be taken, and the referee says it pays
  verified_opponent_weakness: onBot(function (x, r) {
    var hit = (x.f.targets || []).some(function (t) { return t.type !== KING && x.after.hangingLoss(t.sq) > 0; });
    return hit && same(r.prev, r.now) && payoff(r.now) >= 100 && sound(r, 40);
  }),
  // the only good move: the best of Stockfish's choices by 100 or more, and it found it
  verified_branch_choice: onBot(function (x, r, R, k, res) {
    if (!res || res.via !== 'stockfish' || res.gap == null || res.top !== x.e.uci) return false;
    return res.gap >= 100 && Math.abs(res.best || 0) < 800 && sound(r, 40);
  }),
  // your choices shrink by a third or more (six moves at least) since your last turn, and it stands better
  verified_restriction: onBot(function (x, r, R, k) {
    if (x.e.check || k < 2) return false;
    var now = x.after.legalMoves().length, then = R.pos[k - 2].legalMoves().length;
    return then - now >= 6 && now <= 0.7 * then && !!r.now && clampV(r.now.v) >= 50 && sound(r, 40);
  }),
  // after your move
  verified_trap: onYou(function (x, r) { return vTrap(x, r, 200); }),
  verified_decoy: onYou(function (x, r) { return vTrap(x, r, 150); }),
  opponent_bishop_recently_moved: onYou(function (x) { return x.e.piece === BISHOP; }),
  opponent_deviated_from_opening: onYou(function (x) { return x.e.ply <= 30 && leftBook(x.before, x.e.uci); }),
  // your tactic: a motif that the referee says pays you 150 or more, and that cost you nothing
  opponent_verified_tactic: onYou(function (x, r) {
    if (!motif(x.f) || !same(r.prev, r.now)) return false;
    return payoff(r.now) <= -PAYOFF && clampV(r.now.v) <= clampV(r.prev.v) + 40;
  }),
  // you took or checked, and the referee says it cost you 100 or more
  verified_eval_difference: onYou(function (x, r) { var d = moved(r.prev, r.now); return !!(x.e.cap || x.e.check) && d != null && d >= 100; }),
  // you gave something up, and the referee says it costs you nothing
  verified_opponent_sacrifice: onYou(function (x, r) {
    var f = x.f, d = moved(r.prev, r.now);
    return !!(f.sac || f.exchangeSac || (f.pawnSac && x.e.piece === PAWN)) && d != null && d <= 60;
  })
};
function special(V, x, refs, R, k, side, res) {
  var text = V.lines.special;
  if (!text || !V.guards.length) return null;
  for (var i = 0; i < V.guards.length; i++) {
    var g = SPECIALS[V.guards[i]];
    if (!g || g.side !== side || !g(x, refs, R, k, res)) return null;
  }
  return { key: 'special', text: text };
}

/* ---------- story beats: when each gate is really true ----------
   g: { k (ply), x (the move just played), R (the replay), refs, prev (the last beat said: [ply, key, data]), req }.
   A gate answers false, true or { data } (what the next beat needs to know: the knight its story follows, say). */
function count(R, k, fn) { var n = 0; for (var i = 0; i < k; i++) if (fn(R.hist[i])) n++; return n; }
function lastPly(R, k, fn) { for (var i = k - 1; i >= 0; i--) if (fn(R.hist[i])) return i + 1; return 0; }
/* the most recent ply, within `w` plies and since the last beat, where fn was true */
function recent(g, w, fn) {
  var since = g.prev ? g.prev[0] : 0;
  for (var j = g.k; j > Math.max(since, g.k - w - 1, 0); j--) if (fn(g.R.hist[j - 1], j)) return j;
  return 0;
}
function unitMoves(R, k, id) { return count(R, k, function (h) { return h.id === id; }); }
function firstMove(R, k, id) { return unitMoves(R, k, id) === 1; }
function alive(R, id, k) { for (var s in R.idAt[k]) if (R.idAt[k][s] === id) return true; return false; }
function dataOf(prev) { return prev && typeof prev[2] === 'string' ? prev[2] : null; }
function sacData(prev) {
  var d = dataOf(prev); if (!d) return null;
  var p = d.split('|'); if (p.length < 4) return null;
  return { id: p[0], v: +p[1], engine: p[2], mat: +p[3] };
}
var humanCap = function (h) { return h.mover === 'human' && h.cap > 0; };
var botCap = function (h) { return h.mover === 'bot' && h.cap > 0; };
function capCount(g, fn, n) {
  var c = count(g.R, g.k, fn);
  if (g.req === 'exact' ? c !== n : c < n) return false;
  return g.k - lastPly(g.R, g.k, fn) <= 6; // and the last one recent: a remark about it still fits
}
var GATES = {
  // pawns
  first_own_pawn_move: function (g) { var e = g.x.e; return e.mover === 'bot' && e.piece === PAWN && !e.promo && firstMove(g.R, g.k, e.id); },
  own_pawns_advanced_at_least_3: function (g) {
    var e = g.x.e, seen = {};
    if (e.mover !== 'bot' || e.piece !== PAWN || e.promo) return false;
    for (var i = 0; i < g.k; i++) { var h = g.R.hist[i]; if (h.mover === 'bot' && h.piece === PAWN) seen[h.id] = 1; }
    return Object.keys(seen).length >= 3;
  },
  own_pawn_promoted: function (g) {
    var j = recent(g, 4, function (h) { return h.mover === 'bot' && h.promo === QUEEN; });
    return !!j && alive(g.R, g.R.hist[j - 1].id, g.k);
  },
  // knights: the story follows the knight that moved first (data: its id)
  first_own_knight_move: function (g) { var e = g.x.e; return e.mover === 'bot' && e.piece === KNIGHT ? { data: e.id } : false; },
  own_knight_moves_at_least_3: function (g) {
    var e = g.x.e, id = dataOf(g.prev) || e.id;
    return e.mover === 'bot' && e.piece === KNIGHT && e.id === id && unitMoves(g.R, g.k, id) >= 3 ? { data: id } : false;
  },
  own_knight_captured: function (g) {
    var id = dataOf(g.prev);
    return !!recent(g, 8, function (h) { return h.mover === 'human' && h.cap === KNIGHT && (!id || h.capId === id); });
  },
  verified_knight_fork: function (g) { return g.x.e.piece === KNIGHT && !!(g.x.f.fork || g.x.f.checkFork) && vTactic(g.x, g.refs); },
  // the queen: the story follows the queen that moved first
  first_own_queen_move: function (g) { var e = g.x.e; return e.mover === 'bot' && e.piece === QUEEN ? { data: e.id } : false; },
  own_queen_moves_at_least_4: function (g) {
    var e = g.x.e, id = dataOf(g.prev) || e.id;
    return e.mover === 'bot' && e.piece === QUEEN && e.id === id && unitMoves(g.R, g.k, id) >= 4 ? { data: id } : false;
  },
  own_queen_captured: function (g) {
    var id = dataOf(g.prev);
    return !!recent(g, 8, function (h) { return h.mover === 'human' && h.cap === QUEEN && (!id || h.capId === id); });
  },
  // rooks
  first_own_rook_move: function (g) { return g.x.e.mover === 'bot' && g.x.e.piece === ROOK; },
  own_rooks_connected: function (g) { return g.x.e.mover === 'bot' && rooksConnected(g.x.after, g.R.botSide); },
  own_rook_on_seventh: function (g) { var e = g.x.e; return e.mover === 'bot' && e.piece === ROOK && relRank(e.to, g.R.botSide) === 6; },
  // knights and bishops off the back rank
  first_own_minor_piece_developed: function (g) { return g.x.e.mover === 'bot' && !!g.x.f.develop; },
  own_minor_pieces_developed_at_least_3: function (g) {
    var e = g.x.e, seen = {};
    if (e.mover !== 'bot' || (e.piece !== KNIGHT && e.piece !== BISHOP)) return false;
    for (var i = 0; i < g.k; i++) { var h = g.R.hist[i]; if (h.mover === 'bot' && (h.piece === KNIGHT || h.piece === BISHOP)) seen[h.id] = 1; }
    return Object.keys(seen).length >= 3;
  },
  own_combination_tactic_verified: function (g) { return vTactic(g.x, g.refs); },
  verified_tactic: function (g) { return vTactic(g.x, g.refs); },
  // checks
  first_own_king_checked: function (g) { return g.x.e.mover === 'human' && g.x.e.check; },
  own_king_checked_at_least_2: function (g) {
    var e = g.x.e;
    return e.mover === 'human' && e.check && count(g.R, g.k, function (h) { return h.mover === 'human' && h.check; }) >= 2;
  },
  own_king_escaped_check_sequence: function (g) {
    if (g.x.e.mover !== 'bot' || !g.prev || g.x.after.inCheck()) return false;
    var last = lastPly(g.R, g.k, function (h) { return h.mover === 'human' && h.check; });
    return last > 0 && g.k - last >= 6 && g.k - g.prev[0] >= 6;
  },
  opponent_king_checked_at_least_2: function (g) {
    var e = g.x.e;
    return e.mover === 'bot' && e.check && count(g.R, g.k, function (h) { return h.mover === 'bot' && h.check; }) >= 2;
  },
  // captures: yours of its pieces, and its of yours
  first_opponent_capture: function (g) { return capCount(g, humanCap, 1); },
  opponent_captures_at_least_3: function (g) { return capCount(g, humanCap, 3); },
  first_opponent_piece_captured: function (g) { return capCount(g, botCap, 1); },
  opponent_pieces_captured_at_least_3: function (g) { return capCount(g, botCap, 3); },
  opponent_queen_captured: function (g) { return !!recent(g, 8, function (h) { return h.mover === 'bot' && h.cap === QUEEN; }); },
  // how long the game has gone on
  game_reaches_move_10: function (g) { return g.k >= 18; },
  game_reaches_move_20: function (g) { return g.k >= 38; },
  game_reaches_move_30: function (g) { return g.k >= 58; },
  // threats against it: a piece of its (a knight or more) that your move left hanging (data: its id)
  first_own_piece_threatened: function (g) {
    var x = g.x; if (x.e.mover !== 'human') return false;
    var s = newlyHanging(x.before, x.after, g.R.botSide, 300);
    return s != null ? { data: g.R.idAt[g.k][s] || null } : false;
  },
  own_piece_captured: function (g) { return !!recent(g, 6, function (h) { return h.mover === 'human' && h.cap >= KNIGHT && h.cap <= QUEEN; }); },
  // a threat of yours: a piece of its (a knight or more) that can now be taken for profit, or mate next move
  first_opponent_threat_verified: function (g) {
    var x = g.x; if (x.e.mover !== 'human') return false;
    var s = newlyHanging(x.before, x.after, g.R.botSide, 300);
    if (s != null) return { data: g.R.idAt[g.k][s] || 'piece' };
    return x.f.mateThreat ? { data: 'mate' } : false;
  },
  // it answered a threat your last move made: nothing of its hangs, no mate, and the referee agrees
  same_threat_neutralized: function (g) {
    var x = g.x; if (x.e.mover !== 'bot' || g.k < 2) return false;
    var hx = factsAt(g.R, g.k - 1); if (!hx || hx.e.mover !== 'human') return false;
    if (newlyHanging(hx.before, hx.after, g.R.botSide, 300) == null && !hx.f.mateThreat) return false;
    return E.prepare(x.after).theirs.total === 0 && !E.mateInOne(x.after) && sound(g.refs, 40);
  },
  // its move makes a real threat of its own (a piece of yours to win, check or mate), and the referee agrees
  verified_counterattack: function (g) {
    var x = g.x, f = x.f; if (x.e.mover !== 'bot') return false;
    var hits = (f.targets || []).some(function (t) { return t.type !== KING && x.after.hangingLoss(t.sq) > 0; });
    return (hits || f.check || !!f.mateThreat) && sound(g.refs, 40) && clampV(g.refs.now.v) >= 0;
  },
  // the opening book
  opponent_deviates_from_book: function (g) {
    return !!recent(g, 4, function (h, j) { return h.mover === 'human' && j <= 30 && leftBook(g.R.pos[j - 1], h.uci); });
  },
  // four plies or more after you left the book, the referee says you're fine (no more than 60 behind)
  off_book_move_holds_eval: function (g) {
    if (!g.prev || g.k - g.prev[0] < 4 || g.k - g.prev[0] > 16 || !g.refs.now) return false;
    return clampV(g.refs.now.v) <= 60;
  },
  // files and room
  first_own_file_control: function (g) {
    var e = g.x.e; if (e.mover !== 'bot' || (e.piece !== ROOK && e.piece !== QUEEN)) return false;
    return openFile(g.x.after, e.to & 7) && !heavyOn(g.x.after, e.to & 7, -g.R.botSide);
  },
  // your legal moves down to 70% or less of what they were ten plies ago (25 at most), with none of your pieces lost
  opponent_mobility_reduced: function (g) {
    if (g.x.e.mover !== 'bot' || g.k < 10) return false;
    var then = g.R.pos[g.k - 10], now = g.x.after, hum = -g.R.botSide;
    var a = now.legalMoves().length, b = then.legalMoves().length;
    return a <= 25 && a <= 0.7 * b && nonPawn(now, hum) === nonPawn(then, hum);
  },
  // mate on the way (the referee sees it), or three captures and checks in a row that leave it 300 ahead
  verified_forcing_sequence: function (g) {
    var x = g.x; if (x.e.mover !== 'bot' || !g.refs.now) return false;
    if (g.refs.now.v >= 1450) return true;
    var mine = [];
    for (var i = g.k - 1; i >= 0 && mine.length < 3; i--) if (g.R.hist[i].mover === 'bot') mine.push(g.R.hist[i]);
    return mine.length === 3 && mine.every(function (h) { return h.check || h.cap; }) && clampV(g.refs.now.v) >= 300;
  },
  // a sacrifice: the story follows the first one the referee backs (data: the unit, the score after, its engine,
  // and the material before), then waits for you to take it, then for the material to come back
  first_own_piece_sacrifice_verified: function (g) {
    var x = g.x, kind = sacOf(x);
    if (x.e.mover !== 'bot' || !kind || (g.req === 'pawn' && kind !== 'pawn') || !vSac(x, g.refs)) return false;
    return { data: [x.e.id, Math.round(clampV(g.refs.now.v)), g.refs.now.engine, material(x.before, g.R.botSide, 'tempo')].join('|') };
  },
  sacrifice_line_still_sound: function (g) {
    var d = sacData(g.prev);
    if (!d || g.k - g.prev[0] < 4 || !g.refs.now || g.refs.now.engine !== d.engine) return false;
    var taken = count(g.R, g.k, function (h) { return h.ply > g.prev[0] && h.capId === d.id; }) > 0;
    return taken && clampV(g.refs.now.v) >= d.v - 60 ? { data: g.prev[2] } : false;
  },
  compensation_realized: function (g) {
    var d = sacData(g.prev);
    if (!d || g.k - g.prev[0] < 4) return false;
    return material(g.x.after, g.R.botSide, 'tempo') >= d.mat && (!g.refs.now || clampV(g.refs.now.v) >= 0);
  }
  // non_book_win_or_loss: the result itself, on the end sheet (see end())
};
var GATE_NAMES = Object.keys(GATES).concat(['non_book_win_or_loss']);

function beatCheck(V, t, R, k, x, refs) {
  if (!V.arc.length) return null;
  var said = beatsSaid(t, k), i = said.length;
  if (i >= V.arc.length) return null;
  var beat = V.arc[i], prev = said[i - 1] || null;
  if (prev && k - prev[0] < BEAT_GAP) return null;
  var gate = GATES[beat.gate]; if (!gate) return null;
  var r = gate({ k: k, x: x, R: R, refs: refs, prev: prev, req: V.arcReq[String(beat.beat)] || '' });
  if (!r) return null;
  return { key: 'arc' + (i + 1), text: beat.text, beat: i + 1, data: r && r.data != null ? r.data : null };
}

/* ---------- requirements written next to the lines (dialogue_requires) ---------- */
function lineOk(req, x) {
  if (!req) return true;
  var e = x.e, f = x.f || {}, bot = x.botSide, hum = -bot, before = x.before, after = x.after, R = x.R, k = e.ply;
  switch (req) {
    case 'pawn': return e.piece === PAWN && !e.promo;
    case 'to:e4': return e.to === C.sqIndex('e4');
    case 'darksq': return ((e.to >> 4) + (e.to & 7)) % 2 === 0;
    case 'calm': { var h = R && R.hist[k - 2]; return !!h && h.mover === 'human' && !h.cap && !h.check; }
    case 'hasNB': return has(after, bot, KNIGHT) && has(after, bot, BISHOP);
    case 'bishops': return has(after, 1, BISHOP) || has(after, -1, BISHOP);
    case 'took_pawn': return e.cap === PAWN;
    case 'took_piece': return e.cap >= KNIGHT && e.cap <= QUEEN;
    case 'free': return !!e.cap && before.attackersOf(e.to, hum).length === 0;
    case 'trade': { var hp = R && R.hist[k - 2]; return !!e.cap && (!!f.trade || (!!hp && hp.mover === 'human' && hp.cap > 0 && hp.to === e.to)); }
    case 'defender': return !!e.cap && !!f.removeDefender;
    case 'threat': { // the piece it took was attacking one of its pieces
      var hit = false;
      each(before, bot, function (s) { if (before.attackersOf(s, hum).indexOf(e.capSq) >= 0) hit = true; });
      return !!e.cap && hit;
    }
    case 'ahead': return material(after, bot, 'tempo') > 0;
    case 'hanging': return E.prepare(after).theirs.total >= 100;   // after your move: a piece of yours it can take
    case 'hang_knight': { var kn = false; each(after, hum, function (s, t) { if (t === KNIGHT && after.hangingLoss(s) > 0) kn = true; }); return kn; }
    case 'knight_attacks': {
      var ka = false;
      each(after, hum, function (s, t) {
        if (t === KING || !(after.hangingLoss(s) > 0)) return;
        if (after.attackersOf(s, bot).some(function (q) { return Math.abs(after.b[q]) === KNIGHT; })) ka = true;
      });
      return ka;
    }
    case 'into_territory': return relRank(e.to, bot) <= 3 && after.hangingLoss(e.to) > 0;
    case 'checker:rook': return after.attackersOf(kingSq(after, bot), hum).some(function (s) { return Math.abs(after.b[s]) === ROOK; });
    case 'diag': {
      var kq = kingSq(after, bot);
      return after.attackersOf(kq, hum).some(function (s) {
        var t = Math.abs(after.b[s]);
        return t === BISHOP || t === PAWN || (t === QUEEN && (s & 7) !== (kq & 7) && (s >> 4) !== (kq >> 4));
      });
    }
    case 'knight': { // its own blunder: a knight moved, or one of its knights is left hanging
      if (e.piece === KNIGHT) return true;
      return E.prepare(after).theirs.list.some(function (s) { return Math.abs(after.b[s]) === KNIGHT; });
    }
    case 'own_hanging': return E.prepare(after).theirs.total >= 100; // after its move: a piece of its you can take
    case 'pawn_moved': return !!R && count(R, k, function (h2) { return h2.piece === PAWN; }) > 0;
  }
  return false; // a requirement Tempo doesn't know: the line waits rather than guessing
}

/* ---------- choosing ---------- */
function pace(V, opts) {
  var lots = opts && opts.chat === 'lots';
  return { chance: lots ? Math.min(0.9, V.chance * 1.5) : V.chance, gap: 2 * (lots ? Math.max(1, V.cooldown - 1) : V.cooldown) };
}
/* the first candidate that may be said: nothing during the cooldown; an ordinary one only on the roll (one roll a move) */
function choose(cands, V, t, k, opts) {
  var p = pace(V, opts), last = lastSaid(t, k), rolled = null, rng = (opts && opts.rng) || Math.random;
  if (last > -99 && k - last < p.gap) return null;
  for (var i = 0; i < cands.length; i++) {
    var c = cands[i];
    if (!c || !c.text || t.heard[c.key]) continue;
    if (ORDINARY[c.key]) {
      if (rolled === null) rolled = rng() < p.chance;
      if (!rolled) continue;
    }
    c.ply = k;
    return c;
  }
  return null;
}
function off(opts) { return !opts || opts.chat === 'off'; }
function line(V, x, ev) {
  var text = V.lines[ev];
  if (!text || !lineOk(V.req[ev], x)) return null;
  return { key: ev, text: text };
}
function factsAt(R, k) {
  var e = R.hist[k - 1]; if (!e) return null;
  if (e.facts) return e.facts;
  var before = R.pos[k - 1], after = R.pos[k], last = 0;
  for (var j = k - 2; j >= 0; j--) if (R.hist[j].mover === e.mover) { last = R.hist[j].m; break; }
  return (e.facts = { e: e, before: before, after: after, botSide: R.botSide, R: R, f: E.features(before, e.m, { last: last }, true) });
}
/* Gru's hello waits for a pawn to move ("oh. A pawn moved already."): said in the first two moves, or not at all */
function lateHello(V, t, R, k) {
  if (!V.req.greeting || k > 4 || t.heard.greeting || t.heard.rematch || !V.lines.greeting) return null;
  return lineOk(V.req.greeting, { e: { ply: k }, R: R }) ? { key: 'greeting', text: V.lines.greeting } : null;
}
function ready(game, bot, opts) {
  var V = voice(bot && bot.id);
  if (off(opts) || !V || V.mode === 'silent') return null;
  return V;
}

/* ---------- the moments ---------- */
/* the first thing said: hello, or the rematch line on a rematch */
function start(game, bot, opts) {
  var V = ready(game, bot, opts); if (!V) return null;
  var t = state(game);
  if (t.log.length || game.moves.length) return null;
  var key = game.rematch && V.lines.rematch ? 'rematch' : 'greeting';
  if (key === 'greeting' && V.req.greeting) return null; // a hello that waits for its moment
  return V.lines[key] ? { key: key, text: V.lines[key], ply: 0 } : null;
}
/* after your move, before it answers: you checked it, a special of yours, your blunder, a beat of its story.
   refs: the referee's scores before your move (prev) and after it (now) */
function human(game, bot, refs, opts) {
  var V = ready(game, bot, opts); if (!V) return null;
  var k = game.moves.length; if (!k) return null;
  var t = state(game), R = replay(game);
  if (R.hist.length !== k) return null;
  var x = factsAt(R, k);
  if (!x || x.e.mover !== 'human' || x.after.status().over) return null;
  refs = refs || {};
  var cands = [lateHello(V, t, R, k)];
  if (x.e.check) cands.push(line(V, x, 'in_check'));
  var sp = special(V, x, refs, R, k, 'human', null), beat = beatCheck(V, t, R, k, x, refs);
  if (sp && beat) cands.push(beat);
  cands.push(sp);
  var swing = moved(refs.prev, refs.now);
  if (swing != null && swing >= CLAIM) cands.push(line(V, x, 'opponent_blunder'));
  cands.push(beat);
  return choose(cands, V, t, k, opts);
}
/* after its own move. res: what its engine said about the move ({ via, kind, score, best, top, gap });
   refs: the referee's scores before your last move (prev2), before its move (prev), now, and the plies before (past) */
function botMove(game, bot, res, refs, opts) {
  var V = ready(game, bot, opts); if (!V) return null;
  var k = game.moves.length; if (!k) return null;
  var t = state(game), R = replay(game);
  if (R.hist.length !== k) return null;
  var x = factsAt(R, k);
  if (!x || x.e.mover !== 'bot' || x.after.status().over) return null;
  refs = refs || {};
  var e = x.e, cands = [lateHello(V, t, R, k)];
  if (e.check) cands.push(line(V, x, 'check'));
  var sp = special(V, x, refs, R, k, 'bot', res || null), beat = beatCheck(V, t, R, k, x, refs);
  if (sp && beat) cands.push(beat);
  cands.push(sp);
  var drop = moved(refs.prev, refs.now), blunder = drop != null && -drop >= CLAIM;
  if (blunder) cands.push(line(V, x, 'own_blunder'));
  cands.push(beat);
  if (e.cap) cands.push(line(V, x, 'capture'));
  // a quiet move: no capture, no check, no promotion, and nothing bigger happened
  if (!e.cap && !e.check && !e.promo && !sp && !beat && !blunder && !vTactic(x, refs)) cands.push(line(V, x, 'quiet_move'));
  return choose(cands, V, t, k, opts);
}
/* the result, from its side: score is yours (1 you won, 0.5 a draw, 0 it won). A draw has no line in the pack.
   Sheldon's story ends on a decisive result after his second beat (more: the beat, shown after the result line). */
function end(game, bot, score, reason, opts) {
  var V = ready(game, bot, opts); if (!V) return null;
  var key = score === 1 ? 'defeat' : score === 0 ? 'victory' : null, text = key && V.lines[key];
  if (!text) return null;
  var out = { key: key, text: text };
  var t = state(game), said2 = beatsSaid(t, game.moves.length), next = V.arc[said2.length];
  if (next && next.gate === 'non_book_win_or_loss' && said2.length === 2) out.more = next.text;
  return out;
}
/* how long a line stays up: long enough to notice it and read it at an easy pace (6.5 to 15 seconds); a tap puts it
   away sooner */
function readMs(text) { return Math.max(6500, Math.min(15000, 3500 + 80 * (text || '').length)); }

var Talk = { EVENTS: EVENTS, MODES: MODES, VOICE_FIELDS: VOICE_FIELDS, GATES: GATE_NAMES, SPECIALS: Object.keys(SPECIALS),
  voice: voice, voices: voices, mode: mode, state: state, truncate: truncate, said: said,
  start: start, human: human, bot: botMove, end: end, readMs: readMs, material: material,
  _replay: replay, _lineOk: lineOk, _pace: pace, _facts: factsAt };
G.TempoTalk = Talk;
if (node) module.exports = Talk;
})(typeof self !== 'undefined' ? self : (typeof globalThis !== 'undefined' ? globalThis : this));
