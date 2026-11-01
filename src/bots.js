/* Tempo characters: 60 opponents in six tiers plus the Joker, built from content/characters.json.
   Shared by the page, the engine worker and the test harness.

   Each character has two separate contracts. Strength (tier, rating, search budget, how often it slips) comes from
   the rating alone, on the scale the original ladder bots were tuned to. Personality (style weights, opening books,
   signature events, dialogue) comes from the profile: its archetype, its seven traits and a few notes on how it plays.
   Style only ever chooses among moves its strength allows. */
(function (G) {
'use strict';
var NODE = typeof require === 'function' && typeof module !== 'undefined';
var PROFILES = (typeof TEMPO_PROFILES !== 'undefined' ? TEMPO_PROFILES : null) || (NODE ? require('../content/characters.json') : { profiles: [] });
if (NODE && !G.TempoBook) { try { G.TempoCore = G.TempoCore || require('./core.js'); G.TempoBook = require('./book.js'); } catch (e) { /* the book is optional here */ } }

/* ---------- the original ladder: retired from play, kept as yardsticks and for old games' names ---------- */
var BOOK = [
  'e4 e5 Nf3 Nc6 Bc4 Bc5 c3 Nf6 d3 d6 O-O O-O Re1 a6 Bb3 Ba7',
  'e4 e5 Nf3 Nc6 Bc4 Bc5 d3 Nf6 c3 d6 O-O O-O Nbd2 a6',
  'e4 e5 Nf3 Nc6 Bc4 Nf6 d3 Be7 O-O O-O Re1 d6 c3',
  'e4 e5 Nf3 Nc6 Bc4 Nf6 Ng5 d5 exd5 Na5 Bb5+ c6 dxc6 bxc6 Be2 h6',
  'e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 O-O Be7 Re1 b5 Bb3 d6 c3 O-O h3',
  'e4 e5 Nf3 Nc6 Bb5 Nf6 O-O Nxe4 d4 Nd6 Bxc6 dxc6 dxe5 Nf5',
  'e4 e5 Nf3 Nc6 d4 exd4 Nxd4 Nf6 Nxc6 bxc6 e5 Qe7 Qe2 Nd5',
  'e4 e5 Nf3 Nc6 d4 exd4 Nxd4 Bc5 Be3 Qf6 c3 Nge7',
  'e4 e5 Nf3 d6 d4 exd4 Nxd4 Nf6 Nc3 Be7 Be2 O-O O-O',
  'e4 e5 Nf3 Nf6 Nxe5 d6 Nf3 Nxe4 d4 d5 Bd3 Nc6',
  'e4 e5 Nc3 Nf6 Nf3 Nc6 Bb5 Bb4 O-O O-O d3 d6',
  'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6 Be3 e5 Nb3 Be6',
  'e4 c5 Nf3 Nc6 d4 cxd4 Nxd4 Nf6 Nc3 e5 Ndb5 d6',
  'e4 c5 Nf3 e6 d4 cxd4 Nxd4 Nc6 Nc3 Qc7 Be2 a6',
  'e4 c5 c3 Nf6 e5 Nd5 d4 cxd4 Nf3 Nc6 cxd4 d6',
  'e4 c5 Nc3 Nc6 g3 g6 Bg2 Bg7 d3 d6',
  'e4 e6 d4 d5 Nc3 Nf6 Bg5 Be7 e5 Nfd7 Bxe7 Qxe7 f4 O-O',
  'e4 e6 d4 d5 e5 c5 c3 Nc6 Nf3 Qb6 a3 c4',
  'e4 e6 d4 d5 exd5 exd5 Nf3 Nf6 Bd3 Bd6 O-O O-O',
  'e4 c6 d4 d5 e5 Bf5 Nf3 e6 Be2 c5 O-O Nc6',
  'e4 c6 d4 d5 Nc3 dxe4 Nxe4 Bf5 Ng3 Bg6 h4 h6 Nf3 Nd7',
  'e4 d5 exd5 Qxd5 Nc3 Qa5 d4 Nf6 Nf3 Bf5 Bc4 e6',
  'e4 d6 d4 Nf6 Nc3 g6 Nf3 Bg7 Be2 O-O O-O',
  'e4 g6 d4 Bg7 Nc3 d6 Be3 a6',
  'd4 d5 c4 e6 Nc3 Nf6 Bg5 Be7 e3 O-O Nf3 h6 Bh4 b6',
  'd4 d5 c4 c6 Nf3 Nf6 Nc3 dxc4 a4 Bf5 e3 e6 Bxc4',
  'd4 d5 c4 dxc4 Nf3 Nf6 e3 e6 Bxc4 c5 O-O a6',
  'd4 Nf6 c4 e6 Nc3 Bb4 e3 O-O Bd3 d5 Nf3 c5',
  'd4 Nf6 c4 g6 Nc3 Bg7 e4 d6 Nf3 O-O Be2 e5 O-O Nc6',
  'd4 Nf6 c4 e6 Nf3 b6 g3 Bb7 Bg2 Be7 O-O O-O',
  'd4 d5 Bf4 Nf6 e3 c5 c3 Nc6 Nd2 e6 Ngf3 Bd6 Bg3 O-O Bd3',
  'd4 d5 Nf3 Nf6 Bf4 e6 e3 c5 c3 Nc6 Nbd2 Bd6',
  'd4 Nf6 Nf3 g6 Bf4 Bg7 e3 O-O h3 d6 Be2',
  'c4 e5 Nc3 Nf6 Nf3 Nc6 g3 d5 cxd5 Nxd5 Bg2',
  'c4 Nf6 Nc3 e6 e4 d5 e5 d4',
  'Nf3 d5 g3 Nf6 Bg2 e6 O-O Be7 d3 O-O',
  'Nf3 Nf6 c4 g6 Nc3 Bg7 e4 d6 d4 O-O'
];
var LEGACY = [
  { id: 'pip', name: 'Pip', rating: 250, tone: 'cream', cfg: { depth: 1, qs: false, temp: 220, random: 0.42, mateCap: 250, jitter: 60, style: { captures: 70, checks: 45, center: 15, earlyQueen: 40, develop: 5 } } },
  { id: 'rosie', name: 'Rosie', rating: 400, tone: 'gold', cfg: { depth: 2, qs: false, temp: 150, random: 0.22, blunder: 0.8, mateCap: 800, jitter: 40, style: { captures: 60, checks: 30, center: 15, develop: 15, earlyQueen: 20 } } },
  { id: 'theo', name: 'Theo', rating: 550, tone: 'navy', cfg: { depth: 2, qs: false, temp: 130, random: 0.18, blunder: 0.72, mateCap: 1500, jitter: 30, style: { captures: 30, checks: 35, center: 15, develop: 20, earlyQueen: 15 } } },
  { id: 'mabel', name: 'Mabel', rating: 700, tone: 'cream', cfg: { depth: 2, qs: true, temp: 110, random: 0.13, blunder: 0.66, jitter: 20, style: { checks: 45, captures: 20, center: 10, develop: 20, castle: 20 } } },
  { id: 'gus', name: 'Gus', rating: 850, tone: 'gold', cfg: { depth: 2, qs: true, temp: 85, random: 0.08, blunder: 0.55, book: true, style: { center: 10, develop: 25, castle: 30, kingShy: 20 } } },
  { id: 'nora', name: 'Wren', rating: 1000, tone: 'navy', cfg: { depth: 2, qs: true, temp: 70, random: 0.05, blunder: 0.5, book: true, style: { develop: 25, castle: 30, center: 10, kingShy: 20 } } },
  { id: 'felix', name: 'Felix', rating: 1150, tone: 'cream', cfg: { depth: 3, qs: true, temp: 45, random: 0.02, blunder: 0.42, book: true, style: { captures: 10, checks: 10, develop: 20, castle: 25, kingShy: 20 } } },
  { id: 'iris', name: 'Iris', rating: 1300, tone: 'gold', cfg: { depth: 3, qs: true, temp: 28, blunder: 0.24, book: true, style: { develop: 15, castle: 20, kingShy: 15 } } },
  { id: 'silas', name: 'Silas', rating: 1450, tone: 'navy', cfg: { depth: 4, qs: true, temp: 22, blunder: 0.18, book: 'italian', style: { develop: 10, castle: 15 } } },
  { id: 'vera', name: 'Vera', rating: 1600, tone: 'cream', cfg: { depth: 5, qs: true, inaccuracy: 0.3, margin: 60, blunder: 0.06, book: 'sicilian' } },
  { id: 'otto', name: 'Otto', rating: 1800, tone: 'gold', cfg: { depth: 5, qs: true, inaccuracy: 0.15, margin: 40, blunder: 0.03, book: true } },
  { id: 'celeste', name: 'Celeste', rating: 2000, tone: 'navy', cfg: { depth: 9, movetime: 2000, qs: true, inaccuracy: 0.06, margin: 20, blunder: 0.006, book: true } },
  { id: 'admiral', name: 'The Admiral', rating: 2300, tone: 'gold', cfg: { depth: 30, movetime: 1500, qs: true, book: true }, sf: { skill: 11, movetime: 800 } },
  { id: 'stockfish', name: 'Stockfish', rating: 3000, tone: 'navy', cfg: { depth: 40, movetime: 3000, qs: true }, sf: { skill: 20, movetime: 1500 } }
];
function bookMove(history, kind, rng) {
  // the old ladder's book: history is the SAN list so far; kind is true for any line, or a line family name
  var lines = BOOK;
  if (kind === 'italian') lines = BOOK.filter(function (l) { return /^e4 e5 Nf3 Nc6 Bc4/.test(l) || /^d4 d5/.test(l) || /^e4 c5/.test(l) || /^e4 e6/.test(l) || /^e4 c6/.test(l) || /^e4 d5/.test(l) || /^d4 Nf6/.test(l) || /^c4/.test(l) || /^Nf3/.test(l); });
  if (kind === 'sicilian') lines = BOOK.filter(function (l) { return /^e4 c5/.test(l) || /^d4/.test(l) || /^c4/.test(l) || /^Nf3/.test(l) || !/^e4/.test(l); });
  var n = history.length, cands = [];
  for (var i = 0; i < lines.length; i++) {
    var toks = lines[i].split(' ');
    if (toks.length <= n) continue;
    var ok = true;
    for (var j = 0; j < n; j++) if (toks[j] !== history[j]) { ok = false; break; }
    if (ok) cands.push(toks[n]);
  }
  if (!cands.length) return null;
  return cands[Math.floor(rng() * cands.length)];
}

/* ---------- tiers ---------- */
var TIERS = [
  { id: 'F', name: 'The Chaos Crew', lo: 200, hi: 599 },
  { id: 'D', name: 'The Beginners', lo: 600, hi: 999 },
  { id: 'C', name: 'The Club Players', lo: 1000, hi: 1499 },
  { id: 'B', name: 'The Contenders', lo: 1500, hi: 1999 },
  { id: 'A', name: 'The Masters', lo: 2000, hi: 2499 },
  { id: 'S', name: 'The Legends', lo: 2500, hi: 3100 }
];
var WINS_FOR_BOSS = 3; // wins against different characters in a tier that open its promotion match
function tierOfRating(r) { for (var i = TIERS.length - 1; i >= 0; i--) if (r >= TIERS[i].lo) return i; return 0; }

/* ---------- strength: from the rating alone ----------
   Anchors are the original ladder's tuned settings (Pip 250, Rosie 400, Theo 550, Mabel 700, Gus 850, Wren 1000,
   Felix 1150, Iris 1300, Silas 1450, Vera 1600, Otto 1800, Celeste 2000), with Patrick's 200 below them. Between two
   anchors the smooth settings are interpolated and the stepped ones (depth, quiescence) come from the lower anchor. */
var SOFT = [
  [100, { depth: 1, qs: false, temp: 320, random: 0.62, blunder: 0, mateCap: 150, jitter: 90 }],
  [200, { depth: 1, qs: false, temp: 260, random: 0.5, blunder: 0, mateCap: 200, jitter: 70 }],
  [250, { depth: 1, qs: false, temp: 220, random: 0.42, blunder: 0, mateCap: 250, jitter: 60 }],
  [325, { depth: 2, qs: false, temp: 185, random: 0.32, blunder: 0.85, mateCap: 500, jitter: 50 }],
  [400, { depth: 2, qs: false, temp: 150, random: 0.22, blunder: 0.8, mateCap: 800, jitter: 40 }],
  [550, { depth: 2, qs: false, temp: 130, random: 0.18, blunder: 0.72, mateCap: 1500, jitter: 30 }],
  [700, { depth: 2, qs: true, temp: 110, random: 0.13, blunder: 0.66, mateCap: 5000, jitter: 20 }],
  [850, { depth: 2, qs: true, temp: 85, random: 0.08, blunder: 0.55, mateCap: 5000, jitter: 12 }],
  [1000, { depth: 2, qs: true, temp: 70, random: 0.05, blunder: 0.5, mateCap: 5000, jitter: 8 }],
  [1150, { depth: 3, qs: true, temp: 45, random: 0.02, blunder: 0.42, mateCap: 5000, jitter: 4 }],
  [1300, { depth: 3, qs: true, temp: 28, random: 0, blunder: 0.24, mateCap: 5000, jitter: 0 }],
  [1450, { depth: 4, qs: true, temp: 22, random: 0, blunder: 0.18, mateCap: 5000, jitter: 0 }],
  [1549, { depth: 4, qs: true, temp: 16, random: 0, blunder: 0.12, mateCap: 5000, jitter: 0 }]
];
/* In the search picker most of a character's freedom goes to style (choosing among moves close to the best by what it
   likes) rather than to slips (a random near move), so the Contenders play like themselves, not like noise.
   Calibrated against the yardsticks: the bottom anchors are looser than Vera's settings because style picks made
   them play about 60 points above their ratings, and depth 5 tops out a little above 1800, so 1850 and 1900 search
   a ply and two plies deeper on the way to Celeste's depth 9. */
var SEARCH = [
  [1550, { depth: 5, slip: 0.17, margin: 85, blunder: 0.085, styleRate: 0.75, styleMargin: 55 }],
  [1650, { depth: 5, slip: 0.12, margin: 60, blunder: 0.06, styleRate: 0.75, styleMargin: 45 }],
  [1800, { depth: 5, slip: 0.05, margin: 40, blunder: 0.03, styleRate: 0.7, styleMargin: 35 }],
  [1850, { depth: 6, movetime: 1200, slip: 0.045, margin: 36, blunder: 0.025, styleRate: 0.68, styleMargin: 33 }],
  [1900, { depth: 7, movetime: 1500, slip: 0.04, margin: 32, blunder: 0.02, styleRate: 0.66, styleMargin: 31 }],
  [2000, { depth: 9, movetime: 2000, slip: 0.02, margin: 20, blunder: 0.006, styleRate: 0.6, styleMargin: 25 }],
  [2500, { depth: 12, movetime: 2500, slip: 0.01, margin: 15, blunder: 0, styleRate: 0.5, styleMargin: 15 }],
  [3100, { depth: 30, movetime: 3000, slip: 0, margin: 0, blunder: 0, styleRate: 0.3, styleMargin: 6 }]
];
function lerpTable(table, r) {
  if (r <= table[0][0]) return Object.assign({}, table[0][1]);
  for (var i = 0; i < table.length - 1; i++) {
    var a = table[i], b = table[i + 1];
    if (r >= a[0] && r < b[0]) {
      var t = (r - a[0]) / (b[0] - a[0]), out = {};
      Object.keys(a[1]).forEach(function (k) {
        var x = a[1][k], y = b[1][k];
        out[k] = (typeof x === 'number' && typeof y === 'number' && k !== 'depth') ? x + (y - x) * t : x;
      });
      return out;
    }
  }
  return Object.assign({}, table[table.length - 1][1]);
}
/* `base` (the character's own rating) picks the picker, so a small correction never moves a character from one
   kind of play to the other; past the end of a table the settings stay at its last anchor. */
function strength(r, base) {
  var c = (base != null ? base : r) < 1550 ? lerpTable(SOFT, r) : lerpTable(SEARCH, r);
  ['temp', 'jitter', 'mateCap', 'margin', 'styleMargin'].forEach(function (k) { if (c[k] != null) c[k] = Math.round(c[k]); });
  c.qs = c.qs !== false;
  return c;
}
/* Stockfish for the Masters and Legends: it analyses several moves at full skill, and the character chooses among
   the ones within `margin` centipawns of the best. `err` is how often it allows itself a wider margin (`errMargin`),
   the slips a strong human still makes; stronger characters slip less and see further. The Masters search to a set
   depth (with a time cap for slow devices), one ply more every 100 points: against Celeste, the original 2000,
   Batman scored about a third at depth 8 and nearly every game with a quarter of a second, so he starts at depth 9.
   The Legends search deeper still, so on a slow device, where the time cap cuts every search short, each tier still
   sees at least as far as the one below it. */
var SF = [
  [2000, { depth: 9, movetime: 1100, multipv: 4, margin: 80, err: 0.17, errMargin: 210, blunder: 0.02 }],
  [2100, { depth: 10, movetime: 1200, multipv: 4, margin: 71, err: 0.146, errMargin: 194, blunder: 0.016 }],
  [2200, { depth: 11, movetime: 1300, multipv: 4, margin: 62, err: 0.122, errMargin: 178, blunder: 0.012 }],
  [2300, { depth: 12, movetime: 1400, multipv: 4, margin: 54, err: 0.099, errMargin: 160, blunder: 0.0085 }],
  [2400, { depth: 13, movetime: 1500, multipv: 4, margin: 46, err: 0.076, errMargin: 140, blunder: 0.0055 }],
  [2450, { depth: 13, movetime: 1500, multipv: 4, margin: 42, err: 0.065, errMargin: 130, blunder: 0.004 }],
  [2500, { depth: 14, movetime: 1700, multipv: 3, margin: 34, err: 0.05, errMargin: 115, blunder: 0.002 }],
  [2800, { depth: 16, movetime: 2000, multipv: 3, margin: 18, err: 0.02, errMargin: 80, blunder: 0 }],
  [3100, { depth: 18, movetime: 2200, multipv: 2, margin: 6, err: 0, errMargin: 0, blunder: 0 }]
];
function sfFor(r) {
  var c = lerpTable(SF, r);
  ['movetime', 'margin', 'errMargin'].forEach(function (k) { c[k] = Math.round(c[k]); });
  if (c.depth == null) c.depth = 0;
  c.multipv = Math.round(c.multipv);
  return c;
}

/* ---------- personality: style weights from the archetype, the traits and a few notes per character ---------- */
function styleFor(p) {
  var tr = p.behavior_traits_0_to_100 || {};
  var A = (tr.aggression || 50) / 100, R = (tr.risk || 50) / 100, T = (tr.opening_preparation || 50) / 100, D = (tr.defense || 50) / 100,
    K = (tr.trickery || 50) / 100, X = (tr.trade_preference || 50) / 100, E = (tr.endgame || 50) / 100;
  var s = {
    check: 8 + 30 * A, capture: 4 + 18 * A - 8 * D, threat: 6 + 16 * A + 14 * K, fork: 12 + 34 * K, pin: 8 + 26 * K, discovered: 8 + 24 * K,
    zone: 3 + 16 * A, storm: 4 + 22 * A * R, sac: -50 + 75 * R, pawnSac: -30 + 55 * R, exchangeSac: -40 + 60 * R,
    develop: 8 + 16 * T, castle: 6 + 30 * D, center: 4 + 8 * T, kingWalk: -(8 + 30 * D), earlyQueen: 20 * R - 28 * T, queenOut: 0,
    retreat: -6 + 18 * D - 22 * A, advance: -4 + 14 * A, flee: 6 + 22 * D, defend: 6 + 24 * D, trade: -18 + 34 * X, simplify: 8 + 28 * X + 18 * E,
    swap: 0, queenTrade: -24 + 46 * X, chain: 2 + 14 * D, outpost: 6 + 12 * T + 10 * D, brk: 4 + 16 * A, flank: -10, restrict: 0,
    passed: 8 + 30 * E, kingActive: 6 + 26 * E, repeat: 0, samePiece: 0, undefend: -(4 + 26 * D), mateThreat: 0, traps: 0, grab: -10 - 20 * D, punishQueen: 0
  };
  var add = function (o) { Object.keys(o).forEach(function (k) { s[k] = (s[k] || 0) + o[k]; }); };
  var ARCH = {
    chaos: { flank: 22, earlyQueen: 10, grab: 10, undefend: 10 },
    surprise: { threat: 10, fork: 16 },
    hunter: { capture: 40, grab: 45 },
    retreater: { retreat: 32, flee: 26, defend: 10, check: -8, advance: -10 },
    reckless: { check: 14, sac: 22, pawnSac: 10, castle: -10, zone: 6 },
    attacker: { zone: 8, storm: 12, check: 6, advance: 6 },
    defender: { defend: 12, castle: 10, restrict: 10, flee: 6 },
    investigator: { threat: 10, pin: 10, fork: 8, removeDefender: 16 },
    inventor: { outpost: 8, discovered: 10, exchangeSac: 14 },
    theorist: { center: 4, develop: 6, earlyQueen: -10, sac: -14 },
    allrounder: {},
    builder: { chain: 24, outpost: 18, brk: -14, defend: 6 },
    adaptive: { threat: 6, flee: 6, swap: 22 },
    trapper: { pin: 10, discovered: 12, mateThreat: 22, pawnSac: 10, traps: 14, removeDefender: 10 },
    gambiteer: { sac: 22, pawnSac: 30, discovered: 8, develop: 8, zone: 4 },
    calculator: { fork: 6, threat: 6, discovered: 4, removeDefender: 10 },
    technician: { simplify: 20, passed: 14, kingActive: 10, queenTrade: 8 },
    positional: { restrict: 14, outpost: 10, simplify: 8 },
    champion: {}
  };
  add(ARCH[p.archetype] || {});
  // what the profile says about this character in particular
  var NOTE = {
    'patrick-star': { castle: -20, kingWalk: 20 },
    'dory': { repeat: 40, samePiece: 10 },
    'ralph-wiggum': { earlyQueen: 30, queenOut: 34, undefend: 14 },
    'bob-minions': { capture: 50, grab: 40 },
    'peely': { flank: 26 },
    'forky': { retreat: 20, flee: 14, advance: -14 },
    'roblox-noob': { earlyQueen: 40, queenOut: 44, samePiece: 24, develop: -14 },
    'derpy-tiger': { threat: 22, fork: 22, undefend: 14 },
    'among-us-crewmate': { capture: -40, grab: -20, flee: 30 },
    'goofy': { check: 16, sac: 16 },
    'olaf': { check: 30, sac: 12 },
    'spongebob-squarepants': { zone: 10, check: 10, chain: -6 },
    'scooby-doo': { retreat: 16, trade: 26 },
    'luigi': { castle: 24, defend: 14 },
    'donkey-shrek': { zone: 10, check: 16, capture: 12 },
    'anger-inside-out': { brk: 26, check: 20, pawnSac: 26, retreat: -24 },
    'stitch': { brk: 32, sac: 14, fork: 14 },
    'pikachu': { fork: 26, check: 12, develop: 14 },
    'bowser': { zone: 16, storm: 24, trade: -20, simplify: -20, queenTrade: -24 },
    'velma-dinkley': { threat: 16, fork: 16, pin: 12 },
    'phineas-flynn': { outpost: 22, discovered: 14 },
    'lisa-simpson': { center: 8, develop: 10, punishQueen: 30, earlyQueen: -24 },
    'steve-minecraft': { chain: 10, outpost: 10 },
    'sonic-the-hedgehog': { check: 16, capture: 8, threat: 16, develop: 14 },
    'moana': { swap: 18 },
    'judy-hopps': { traps: 26, threat: 12 },
    'elsa': { defend: 16, restrict: 8, trade: 12 },
    'freddy-fazbear': { mateThreat: 30, discovered: 12 },
    'ron-weasley': { pawnSac: 16, sac: 12, fork: 12, discovered: 10 },
    'sheldon-cooper': { sac: -26, earlyQueen: -20, center: 6, develop: 8 },
    'tony-stark': { exchangeSac: 30, zone: 8 },
    'hermione-granger': { sac: -16, pin: 10 },
    'wednesday-addams': { pawnSac: 18, pin: 16, mateThreat: 12 },
    'gru': { pawnSac: 20, discovered: 18 },
    'tails': { defend: 16, fork: 10 },
    'rumi': { swap: 0, sac: 10 },
    'miles-morales': { fork: 12, check: 8 },
    'princess-peach': { simplify: 26, passed: 22, kingActive: 12 },
    'batman': { defend: 14, restrict: 10, threat: 6 },
    'sherlock-holmes': { threat: 12, pin: 10, discovered: 10 },
    'yoda': { restrict: 10, kingActive: 10, passed: 8 },
    'loki': { pawnSac: 18, sac: 14 },
    'doctor-strange': { fork: 8, mateThreat: 10 },
    'shuri': { exchangeSac: 26 },
    'darth-vader': { restrict: 14, traps: 24 },
    'shadow-the-hedgehog': { check: 10, zone: 10 },
    'dumbledore': { pawnSac: 22, center: 8 },
    'dr-eggman': {},
    'magneto': { pin: 22, restrict: 8 },
    'thanos': { queenTrade: 26, simplify: 18 },
    'mewtwo': { mateThreat: 14, sac: 8 },
    'professor-x': { defend: 14, restrict: 10 },
    'joker-bonus-challenger': { pawnSac: 24, discovered: 16, sac: 10 }
  };
  add(NOTE[p.id] || {});
  Object.keys(s).forEach(function (k) { s[k] = Math.round(s[k]); if (!s[k]) delete s[k]; });
  return s;
}
/* how loudly style speaks at each strength: the weaker the character, the more its habits show */
function styleScaleFor(r) { return r < 600 ? 1.1 : r < 1000 ? 1 : r < 1500 ? 0.8 : 1; }

/* Measured corrections: a character's style changes how well it plays (a retreater blunders less, a reckless attacker
   more), so each one's engine settings come from its rating plus this nudge, found by playing it against the original
   ladder bots (tests/calibrate.js). The rating shown is unchanged. */
var NUDGE = {
  'patrick-star': -95, 'psyduck': -100, 'among-us-crewmate': -20, 'scooby-doo': -150, 'luigi': -50, 'velma-dinkley': -40,
  'derpy-tiger': 35, 'olaf': 55, 'donkey-shrek': 50, 'stitch': 155, 'pikachu': 65, 'bowser': 105, 'ron-weasley': 30, 'gru': 60
};
/* random moves and oversights shift a little with the archetype, inside the strength they were tuned for */
var EXTRA = { chaos: { random: 0.06, jitter: 20 }, surprise: { random: 0.03 }, reckless: { blunder: 0.04 }, retreater: { random: -0.02 } };

/* ---------- opening books: families from the profile, plus fill-ins for the defences they don't cover ---------- */
function bookFor(p, style) {
  var w = p.book.white.slice(), e4 = p.book.black_vs_e4.slice(), d4 = p.book.black_vs_d4.slice();
  var sharp = (p.behavior_traits_0_to_100 || {}).aggression >= 60;
  // White: answers to whatever Black plays that the main families don't cover
  var B = G.TempoBook, firstMoves = {};
  if (B) B.expand(w).forEach(function (n) { B.FAM[n][1].forEach(function (l) { firstMoves[l.split(' ')[0]] = true; }); });
  var wFill = [];
  if (firstMoves.e4) wFill = wFill.concat([sharp ? 'vs-sicilian-open' : 'vs-sicilian-alapin', sharp ? 'vs-french' : 'vs-french-advance', 'vs-caro', 'vs-scandi', 'vs-pirc', 'vs-modern', 'vs-alekhine', 'vs-rare-e4', sharp ? 'vs-e5-sharp' : 'vs-e5-main']);
  if (firstMoves.d4) wFill = wFill.concat(['qg', 'london', 'vs-flank-d4']);
  if (firstMoves.c4 || firstMoves.Nf3) wFill = wFill.concat(['english', 'reti']);
  var e4Fill = ['sicilian-anti', 'e5-classical'], d4Fill = ['qgd', 'nimzo', 'vs-flank-black'];
  return { w: w, wFill: wFill, e4: e4, e4Fill: e4Fill, d4: d4, d4Fill: d4Fill };
}
var BOOK_CAP = { F: 4, D: 8, C: 12, B: 16, A: 20, S: 26 }, FOLLOW = { F: 0.5, D: 0.65, C: 0.8, B: 0.88, A: 0.94, S: 0.97 };

/* ---------- the roster ---------- */
var TONE = { F: 'cream', D: 'cream', C: 'gold', B: 'gold', A: 'navy', S: 'navy' };
var BOTS = [], BY = {};
PROFILES.profiles.forEach(function (p) {
  var ti = TIERS.map(function (t) { return t.id; }).indexOf(p.tier); if (ti < 0) return;
  var r = p.tempo_elo, st = strength(r + (NUDGE[p.id] || 0), r), ex = EXTRA[p.archetype] || {}, style = styleFor(p);
  Object.keys(ex).forEach(function (k) { if (st[k] != null) st[k] = Math.max(0, st[k] + ex[k]); });
  var cfg = Object.assign({ persona: true, style: style, styleScale: styleScaleFor(r), styleCap: r < 1000 ? 140 : 100 }, st);
  var theory = (p.behavior_traits_0_to_100 || {}).opening_preparation || 50, cap = BOOK_CAP[p.tier];
  var bot = {
    id: p.id, name: p.name, short: p.short || p.name, from: p.from || null, rating: r, tone: TONE[p.tier], tier: p.tier, tierIdx: ti,
    boss: !!p.boss, bonus: !!p.bonus, mono: p.mono, arche: p.archetype, bio: p.subtitle,
    plan: (p.shown && p.shown.strategic_plan) || p.strategic_plan, weakness: (p.shown && p.shown.exploitable_weakness) || p.exploitable_weakness,
    signature: p.signature_event, tactics: p.tactical_preferences, openings: p.openings, traits: p.behavior_traits_0_to_100,
    sig: p.signature_triggers || [], book: bookFor(p, style),
    bookPly: Math.round(2 + (cap - 2) * (0.35 + 0.65 * theory / 100)), bookFollow: Math.min(0.99, FOLLOW[p.tier] + 0.08 * (theory - 50) / 50),
    lines: { hello: p.dialogue.start, win: p.dialogue.win, lose: p.dialogue.loss, tactic: p.dialogue.tactical_moment },
    cfg: cfg
  };
  // the Masters and Legends play with Stockfish where it runs; the built-in engine stands in where it doesn't
  if (r >= 2000) bot.sf = sfFor(r);
  // Psyduck: mostly lost, then a few clear moves in a row
  if (p.id === 'psyduck') bot.surge = { chance: 0.05, len: 3, cfg: Object.assign({}, cfg, strength(1000), { persona: true }) };
  // Homer: no slips at all
  if (p.archetype === 'champion') { bot.cfg.slip = 0; bot.cfg.blunder = 0; }
  BOTS.push(bot); BY[bot.id] = bot;
});
// tier order, weakest first inside each tier, the bonus challenger last
BOTS.sort(function (a, b) { return (a.bonus - b.bonus) || (a.tierIdx - b.tierIdx) || (a.rating - b.rating); });
TIERS.forEach(function (t, i) {
  t.members = BOTS.filter(function (b) { return b.tierIdx === i && !b.bonus; }).map(function (b) { return b.id; });
  var boss = BOTS.filter(function (b) { return b.tierIdx === i && b.boss; })[0];
  t.boss = boss ? boss.id : t.members[t.members.length - 1];
});
var BONUS = BOTS.filter(function (b) { return b.bonus; }).map(function (b) { return b.id; });
// the Joker appears once Batman is beaten
var UNLOCKS = { 'joker-bonus-challenger': 'batman' };
var CHAMPION = TIERS[TIERS.length - 1].boss;

var RETIRED = {};
LEGACY.forEach(function (b) { RETIRED[b.id] = { id: b.id, name: b.name, short: b.name, rating: b.rating, tone: b.tone, retired: true }; });
/* the character nearest an old ladder bot's rating, for an unfinished game against one */
function successor(oldId) {
  var old = RETIRED[oldId]; if (!old) return null;
  var best = null;
  BOTS.forEach(function (b) { if (b.boss || b.bonus) return; if (!best || Math.abs(b.rating - old.rating) < Math.abs(best.rating - old.rating)) best = b; });
  return best ? best.id : null;
}

/* ---------- choosing a move: the book, Stockfish, or the built-in engine ----------
   game: { fen, moves (uci), sans }. ctx: { last (this character's previous move), surge } from the game in progress.
   Returns { book: uci } for a book move, { sf: settings } for Stockfish (the page asks it and chooses), or
   { tempo: cfg } for the engine worker. */
function plan(bot, game, rng, ctx) {
  rng = rng || Math.random; ctx = ctx || {};
  var B = G.TempoBook, C = G.TempoCore;
  var startFen = game.fen || (C && C.START_FEN), n = (game.moves || []).length;
  if (B && C && startFen === C.START_FEN && n < bot.bookPly && rng() < bot.bookFollow) {
    var p = new C.Pos(C.START_FEN);
    for (var i = 0; i < n; i++) { var m = p.parseMove(game.moves[i]); if (!m) { p = null; break; } p.make(m); }
    if (p) {
      var asWhite = p.side === 1, first = game.moves[0], fams, fill;
      if (asWhite) { fams = bot.book.w; fill = bot.book.wFill; }
      else if (first === 'e2e4') { fams = bot.book.e4; fill = bot.book.e4Fill; }
      else if (first === 'd2d4') { fams = bot.book.d4; fill = bot.book.d4Fill; }
      else { fams = bot.book.d4.concat(bot.book.e4); fill = bot.book.d4Fill.concat(bot.book.e4Fill); }
      var opts = B.moves(p, fams);
      if (!opts.length) opts = B.moves(p, fill);
      if (opts.length) {
        var total = opts.reduce(function (a, o) { return a + o.w; }, 0), r = rng() * total;
        for (var j = 0; j < opts.length; j++) { r -= opts[j].w; if (r <= 0) return { book: opts[j].uci }; }
        return { book: opts[0].uci };
      }
    }
  }
  if (bot.sf && ctx.sfReady) return { sf: bot.sf, cfg: bot.cfg };
  var cfg = bot.surge && ctx.surge > 0 ? bot.surge.cfg : bot.cfg;
  return { tempo: cfg };
}

/* Stockfish's lines for the position p (scores for the side to move, the character), and the character's choice among
   them: the moves within its margin of the best, chosen by style. A forced mate is always played, the quickest first,
   a clear win is never given back for style, and a slip (a wider margin) comes only as often as its strength allows.
   Returns { uci, kind: 'best' | 'style' | 'slip', score, best, mate, cands }. */
function lineValue(l) { return l.mate != null ? (l.mate > 0 ? 10000 - 10 * l.mate : -10000 - 10 * l.mate) : (l.cp || 0); }
function sfPick(bot, p, lines, rng, lastUci) {
  var E = G.TempoEngine, C = G.TempoCore, st = bot.sf, seen = {}, cands = [];
  rng = rng || Math.random;
  var top = lines.reduce(function (a, l) { return Math.max(a, (l && l.depth) || 0); }, 0);
  lines.forEach(function (l) {
    if (!l || !l.pv || !l.pv.length || seen[l.pv[0]] || (l.depth || 0) < top - 2) return;
    var m = p.parseMove(l.pv[0]); if (!m) return;
    seen[l.pv[0]] = true; cands.push({ uci: l.pv[0], m: m, score: lineValue(l), mate: l.mate, depth: l.depth });
  });
  if (!cands.length) return null;
  cands.sort(function (a, b) { return b.score - a.score; });
  var best = cands[0], chosen = best, kind = 'best';
  if (!(best.mate != null && best.mate > 0) && cands.length > 1) {
    var roll = rng(), margin = st.margin;
    if (st.blunder && roll < st.blunder) { margin = 400; kind = 'slip'; } else if (st.err && roll < st.blunder + st.err) { margin = st.errMargin; kind = 'slip'; }
    var floor = best.score >= 250 ? Math.max(best.score - margin, 150) : best.score - margin;
    var pool = cands.filter(function (c) { return c.score >= floor && !(c.mate != null && c.mate < 0 && !(best.mate != null && best.mate < 0)); });
    if (pool.length > 1 && E) {
      var pre = E.prepare(p), sum = 0, last = 0;
      if (lastUci && lastUci.length >= 4) last = C.mk(C.sqIndex(lastUci.slice(0, 2)), C.sqIndex(lastUci.slice(2, 4)), 0, 0);
      pool.forEach(function (c) { c.f = E.features(p, c.m, { last: last }, true, pre); sum += c.f.mobility || 0; });
      pool.forEach(function (c) {
        c.f.avgMobility = sum / pool.length;
        c.bonus = Math.max(-margin, Math.min(margin, E.styleScore(c.f, bot.cfg.style, pre.ahead) * 0.6));
        c.u = c.score + c.bonus + (rng() - 0.5) * margin * 0.3;
      });
      pool.sort(function (a, b) { return b.u - a.u; });
      chosen = pool[0];
      if (kind !== 'slip') kind = chosen === best ? 'best' : 'style';
      else if (chosen === best) kind = 'best';
    }
  }
  return { uci: chosen.uci, kind: kind, score: chosen.score, best: best.score, mate: chosen.mate,
    cands: cands.map(function (c) { return { uci: c.uci, score: c.score, bonus: c.bonus == null ? null : Math.round(c.bonus) }; }) };
}

/* ---------- progress: what is open to play ----------
   play: the store's play section ({ tier, bots: { id: { w, d, l, beaten } } }); all: Unlock all. */
function winsIn(play, ti) {
  var t = TIERS[ti], n = 0;
  t.members.concat(BONUS.filter(function (id) { return BY[id].tierIdx === ti; })).forEach(function (id) { var r = play.bots[id]; if (r && r.beaten && id !== t.boss) n++; });
  return n;
}
function topTier(play) {
  var top = Math.max(0, Math.min(TIERS.length - 1, play.tier || 0));
  // beating a tier's promotion match opens the tier above (and beating the last one keeps the last one open)
  TIERS.forEach(function (t, i) { var r = play.bots[t.boss]; if (r && r.beaten) top = Math.max(top, Math.min(i + 1, TIERS.length - 1)); });
  return top;
}
/* 'open', 'boss-locked' (a promotion match not yet earned), 'tier-locked' or 'hidden' (a bonus not yet unlocked) */
function access(play, id, all) {
  var b = BY[id]; if (!b) return 'hidden';
  if (b.bonus) { var key = UNLOCKS[id], r = key && play.bots[key]; return all || (r && r.beaten) ? 'open' : 'hidden'; }
  if (all) return 'open';
  var top = topTier(play);
  if (b.tierIdx > top) return 'tier-locked';
  if (b.tierIdx === top && b.id === TIERS[top].boss && winsIn(play, top) < WINS_FOR_BOSS && !(play.bots[id] && play.bots[id].beaten)) return 'boss-locked';
  return 'open';
}
/* who to play next: the weakest unbeaten character in your top tier, its promotion match once that's open,
   then the tier above */
function nextFor(play, all) {
  var top = topTier(play), t = TIERS[top];
  var unbeaten = t.members.filter(function (id) { var r = play.bots[id]; return !(r && r.beaten) && access(play, id, all) === 'open'; });
  var boss = t.boss, bossOpen = access(play, boss, all) === 'open' && !(play.bots[boss] && play.bots[boss].beaten);
  if (bossOpen && winsIn(play, top) >= WINS_FOR_BOSS) return BY[boss];
  var others = unbeaten.filter(function (id) { return id !== boss; });
  if (others.length) return BY[others[0]];
  if (bossOpen) return BY[boss];
  return BY[t.members[t.members.length - 1]];
}

var Bots = {
  BOTS: BOTS, TIERS: TIERS, BONUS: BONUS, UNLOCKS: UNLOCKS, CHAMPION: CHAMPION, WINS_FOR_BOSS: WINS_FOR_BOSS, RETIRED: RETIRED, LEGACY: LEGACY,
  BOOK: BOOK, bookMove: bookMove, plan: plan, sfPick: sfPick, NUDGE: NUDGE, strength: strength, sfFor: sfFor, styleFor: styleFor, tierOfRating: tierOfRating,
  successor: successor, topTier: topTier, access: access, winsIn: winsIn, nextFor: nextFor,
  byId: function (id) { return BY[id] || null; },
  /* any opponent a game might name: a character, or one of the original ladder bots */
  find: function (id) { return BY[id] || RETIRED[id] || null; }
};
G.TempoBots = Bots;
if (typeof module !== 'undefined' && module.exports) module.exports = Bots;
})(typeof self !== 'undefined' ? self : (typeof globalThis !== 'undefined' ? globalThis : this));
