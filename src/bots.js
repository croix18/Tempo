/* Tempo bot roster and opening book. Shared by the page, the worker and the test harness. */
(function (G) {
'use strict';

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

/* Each bot: rating is the approximate strength in Chess.com-style rapid points.
   Engine settings are tuned by bot-vs-bot matches so every step up is stronger. */
var BOTS = [
  { id: 'pip', name: 'Pip', rating: 250, tone: 'cream',
    bio: 'Just learned how the knight moves. Mostly.',
    cfg: { depth: 1, qs: false, temp: 220, random: 0.42, mateCap: 250, jitter: 60,
      style: { captures: 70, checks: 45, center: 15, earlyQueen: 40, develop: 5 } },
    lines: { hello: 'Hi! I like moving my queen a lot.', win: 'I won? I won!', lose: 'Good game! Can we play again?', capture: 'Ooh, mine now.' } },
  { id: 'rosie', name: 'Rosie', rating: 400, tone: 'gold',
    bio: 'Loves trading pieces. Doesn’t always count first.',
    cfg: { depth: 2, qs: false, temp: 150, random: 0.22, blunder: 0.8, mateCap: 800, jitter: 40,
      style: { captures: 60, checks: 30, center: 15, develop: 15, earlyQueen: 20 } },
    lines: { hello: 'Trade everything, sort it out later.', win: 'The trades worked out!', lose: 'I should have counted that one.', capture: 'Trade!' } },
  { id: 'theo', name: 'Theo', rating: 550, tone: 'navy',
    bio: 'Attacks early and attacks often.',
    cfg: { depth: 2, qs: false, temp: 130, random: 0.18, blunder: 0.72, mateCap: 1500, jitter: 30,
      style: { captures: 30, checks: 35, center: 15, develop: 20, earlyQueen: 15 } },
    lines: { hello: 'Your king looks lonely.', win: 'Attack wins again.', lose: 'My attack ran out of steam.', capture: 'Charge!' } },
  { id: 'mabel', name: 'Mabel', rating: 700, tone: 'cream',
    bio: 'Never met a check she didn’t give.',
    cfg: { depth: 2, qs: true, temp: 110, random: 0.13, blunder: 0.66, jitter: 20,
      style: { checks: 45, captures: 20, center: 10, develop: 20, castle: 20 } },
    lines: { hello: 'Check is my favorite word.', win: 'All those checks paid off.', lose: 'Out of checks. Well played.', capture: 'Thank you kindly.' } },
  { id: 'gus', name: 'Gus', rating: 850, tone: 'gold',
    bio: 'Solid and steady, until he isn’t.',
    cfg: { depth: 2, qs: true, temp: 85, random: 0.08, blunder: 0.55, book: true,
      style: { center: 10, develop: 25, castle: 30, kingShy: 20 } },
    lines: { hello: 'Let’s keep it steady.', win: 'Slow and steady.', lose: 'Steady wasn’t enough today.', capture: 'I’ll take that.' } },
  { id: 'nora', name: 'Nora', rating: 1000, tone: 'navy',
    bio: 'New to the club and studying her openings.',
    cfg: { depth: 2, qs: true, temp: 70, random: 0.05, blunder: 0.5, book: true,
      style: { develop: 25, castle: 30, center: 10, kingShy: 20 } },
    lines: { hello: 'I’ve been studying. Let’s see.', win: 'The studying paid off.', lose: 'Back to the books for me.', capture: 'Noted.' } },
  { id: 'felix', name: 'Felix', rating: 1150, tone: 'cream',
    bio: 'Tricky. Watch out for forks.',
    cfg: { depth: 3, qs: true, temp: 45, random: 0.02, blunder: 0.42, book: true,
      style: { captures: 10, checks: 10, develop: 20, castle: 25, kingShy: 20 } },
    lines: { hello: 'Keep an eye on your knights.', win: 'Got you with a trick.', lose: 'You saw through it. Nice.', capture: 'Gotcha.' } },
  { id: 'iris', name: 'Iris', rating: 1300, tone: 'gold',
    bio: 'Patient. Waits for you to slip.',
    cfg: { depth: 3, qs: true, temp: 28, blunder: 0.24, book: true,
      style: { develop: 15, castle: 20, kingShy: 15 } },
    lines: { hello: 'Take your time.', win: 'Patience wins.', lose: 'You didn’t slip. Impressive.', capture: 'Thank you.' } },
  { id: 'silas', name: 'Silas', rating: 1450, tone: 'navy',
    bio: 'Plays the Italian every single game.',
    cfg: { depth: 4, qs: true, temp: 22, blunder: 0.18, book: 'italian',
      style: { develop: 10, castle: 15 } },
    lines: { hello: 'Bishop to c4. Always.', win: 'The Italian never lets me down.', lose: 'Even the Italian has bad days.', capture: 'Classic.' } },
  { id: 'vera', name: 'Vera', rating: 1600, tone: 'cream',
    bio: 'Tournament regular with sharp tactics.',
    cfg: { depth: 5, qs: true, inaccuracy: 0.3, margin: 60, blunder: 0.06, book: 'sicilian' },
    lines: { hello: 'Good luck. You’ll need it.', win: 'Sharp play wins.', lose: 'Well played. Rematch soon.', capture: 'Thanks.' } },
  { id: 'otto', name: 'Otto', rating: 1800, tone: 'gold',
    bio: 'Grinds out endgames for fun.',
    cfg: { depth: 5, qs: true, inaccuracy: 0.15, margin: 40, blunder: 0.03, book: true },
    lines: { hello: 'Trade down and let’s see who knows endgames.', win: 'Endgames, my friend.', lose: 'You out-ground me.', capture: 'Simplifying.' } },
  { id: 'celeste', name: 'Celeste', rating: 2000, tone: 'navy',
    bio: 'Expert. Punishes loose pieces.',
    cfg: { depth: 9, movetime: 2000, qs: true, inaccuracy: 0.06, margin: 20, blunder: 0.006, book: true },
    lines: { hello: 'Keep your pieces protected.', win: 'Loose pieces drop off.', lose: 'Excellent game.', capture: 'Loose.' } },
  { id: 'admiral', name: 'The Admiral', rating: 2300, tone: 'gold',
    bio: 'Master-level calculation and quiet confidence.',
    cfg: { depth: 30, movetime: 1500, qs: true, book: true },
    sf: { skill: 11, movetime: 800 },
    lines: { hello: 'All hands on deck.', win: 'Steady as she goes.', lose: 'A fine victory. Well earned.', capture: 'Noted in the log.' } },
  { id: 'stockfish', name: 'Stockfish', rating: 3000, tone: 'navy',
    bio: 'The full-strength engine. Draws count as wins.',
    cfg: { depth: 40, movetime: 3000, qs: true },
    sf: { skill: 20, movetime: 1500 },
    lines: { hello: '', win: '', lose: '', capture: '' } }
];

function bookMove(history, kind, rng) {
  // history: SAN list so far; kind: true for any line, or a line family name
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

var Bots = { BOTS: BOTS, BOOK: BOOK, bookMove: bookMove,
  byId: function (id) { for (var i = 0; i < BOTS.length; i++) if (BOTS[i].id === id) return BOTS[i]; return null; } };
G.TempoBots = Bots;
if (typeof module !== 'undefined' && module.exports) module.exports = Bots;
})(typeof self !== 'undefined' ? self : (typeof globalThis !== 'undefined' ? globalThis : this));
