// What the characters say: scripted games for each rule in src/talk.js, and a few hundred engine games to check the
// pace (no line twice, beats in order, Lots talks more than Some, Off says nothing).
//   node tests/talk_test.js
const C = require('../src/core.js'); global.TempoCore = C;
const Book = require('../src/book.js'); global.TempoBook = Book;
const E = require('../src/engine.js'); global.TempoEngine = E;
const B = require('../src/bots.js');
const T = require('../src/talk.js');

let fails = 0, checks = 0;
function ok(cond, what, extra) { checks++; if (!cond) { fails++; console.log('FAIL', what, extra !== undefined ? JSON.stringify(extra) : ''); } }
const bot = id => B.byId(id);
const SOME = { chat: 'some', rng: () => 0 }, LOTS = { chat: 'lots', rng: () => 0 }, OFF = { chat: 'off', rng: () => 0 }, NEVER = { chat: 'some', rng: () => 0.99 };
let gid = 0;
// a game you play against `id`: you are `color`; moves in SAN or UCI
function game(color, fen) { return { id: 'g' + (++gid), color, startFen: fen || C.START_FEN, moves: [] }; }
function pos(g) { const p = new C.Pos(g.startFen); g.moves.forEach(u => p.make(p.parseMove(u))); return p; }
function mv(g, s) { const p = pos(g), m = p.parseMove(s); if (!m) throw new Error('illegal ' + s + ' in ' + p.fen()); g.moves.push(C.uci(m)); return g; }
// play a move and let the character react: yours through human(), its own through bot()
function you(g, b, s, opts) { mv(g, s); return T.human(g, b, opts || SOME); }
function it(g, b, s, opts, refs, res) { mv(g, s); return T.bot(g, b, res || { kind: 'search' }, refs || {}, opts || SOME); }
const key = r => r && r.key;

// ---------- every character has a full voice ----------
const KNOWN_HINTS = ['early_game', 'opening_after_move_3', 'middlegame', 'middle_game', 'late_game', 'bot_has_pawn_chain', 'rook_endgame', 'bot_material_down',
  'nonbook_human_move_again', 'verified_sound_nonbook_move', 'bot_queen_moved', 'bot_queen_moved_again', 'bot_queen_captured', 'bot_pawn_captured',
  'bot_bishop_captured', 'piece_captured', 'bishop_moves', 'bishop_moves_again', 'bot_castles', 'verified_tactic', 'bot_pawn_chain_broken',
  'nonbook_human_move', 'human_nonbook_move', 'bot_tactical_opportunity', 'human_same_pawn_moves_twice', 'human_pawn_sacrificed', 'pawn_promotion',
  'human_piece_sacrifice', 'human_sacrifice'];
const LINE_REQ = ['pawn', 'pawn1', 'knight', 'retreat', 'develop', 'best', 'forward', 'step', 'rook', 'free', 'bishop', 'hasrook', 'hasbishop',
  'fork', 'knightfork', 'forkdisc', 'sac', 'overload', 'hanging', 'stalemate'];
const ARC_REQ = ['third_move', 'playable', 'pawn_takes_pawn', 'rooks_still', 'bot_was_on_e4', 'human_queen', 'human_knight', 'bot_piece_stuck',
  'queen_by_knight', 'queen_guard_changed', 'queen_by_pawn_only'];
ok(B.BOTS.length === 61, '61 characters');
B.BOTS.forEach(b => {
  const v = T.voice(b.id);
  ok(!!v, 'a voice for ' + b.id);
  if (!v) return;
  ok(T.EVENTS.every(e => typeof v.lines[e] === 'string' && v.lines[e].length > 3), b.id + ' has all fifteen lines');
  ok(v.beats.length === 3 && v.beats.every((x, i) => x.index === i + 1 && x.line), b.id + ' has three beats in order');
  v.beats.forEach(x => ok(KNOWN_HINTS.indexOf(x.trigger_hint) >= 0, b.id + ' beat hint is handled: ' + x.trigger_hint));
  Object.keys(v.req).forEach(e => ok(LINE_REQ.indexOf(v.req[e]) >= 0, b.id + ' line requirement is handled: ' + v.req[e]));
  Object.keys(v.arcReq).forEach(i => { const r = v.arcReq[i].replace(/^hint:/, ''); ok(ARC_REQ.indexOf(r) >= 0 || KNOWN_HINTS.indexOf(r) >= 0, b.id + ' beat requirement is handled: ' + r); });
  ok(v.chance > 0 && v.chance <= 0.3 && v.gap >= 3 && v.gap <= 5, b.id + ' has a pace');
  ok(!!v.card.canon && !!v.card.assessment && !!v.card.why && !!v.card.bit, b.id + ' has its card text');
});

// ---------- Patrick's queen: moves, moves again, is taken ----------
(function () {
  const P = bot('patrick-star'), g = game('w');
  ok(key(T.start(g, P, SOME)) === 'greeting', 'Patrick says hello');
  ok(T.start(g, P, SOME) === null, 'hello only once');
  you(g, P, 'e4'); it(g, P, 'e5', NEVER); you(g, P, 'Nf3');
  let r = it(g, P, 'Qf6', NEVER);
  ok(key(r) === 'arc1', 'beat 1 when the queen first moves, even on a quiet turn', r);
  you(g, P, 'Nc3');
  r = it(g, P, 'Qg6', NEVER); ok(key(r) !== 'arc2', 'beat 2 waits four plies', r);
  you(g, P, 'd3');
  r = it(g, P, 'Qf6', NEVER); ok(key(r) === 'arc2', 'beat 2 when it moves again', r);
  you(g, P, 'a3'); it(g, P, 'a6', NEVER); you(g, P, 'b3'); it(g, P, 'Nc6', NEVER); you(g, P, 'Bg5'); it(g, P, 'b6', NEVER);
  r = you(g, P, 'Bxf6', NEVER);
  ok(key(r) === 'arc3' && /She quit/.test(r.text), 'beat 3 when you take her, ahead of the lost-queen line', r);
  ok(T.state(g).heard.queen_lost !== 1, 'the lost-queen line is still unused');
})();
(function () {
  const P = bot('patrick-star'), g = game('w'); T.start(g, P, SOME);
  const said = [];
  [['e4', 'e5'], ['Nf3', 'Nc6'], ['Bc4', 'Nf6'], ['d3', 'Be7'], ['O-O', 'O-O']].forEach(([a, b]) => { said.push(you(g, P, a, LOTS)); said.push(it(g, P, b, LOTS)); });
  ok(!said.some(r => r && /^arc/.test(r.key)), 'no beat if the queen never moves', said.map(key));
})();

// ---------- one remark per move, the important one first ----------
(function () {
  const fen = '6k1/5ppp/8/8/3q4/8/5PP1/R5K1 b - - 0 1'; // its queen takes your rook with check (Kh2 gets out)
  let g = game('w', fen), S = bot('spongebob-squarepants');
  let r = it(g, S, 'Qxa1+', SOME);
  ok(key(r) === 'check', 'a check that takes a rook: the check', r);
  g = game('w', fen); T.state(g).heard.check = 1;
  r = it(g, S, 'Qxa1+', SOME);
  ok(key(r) === 'capture_major' && /rook/.test(r.text), 'with the check line used, the rook', r);
  const q = '6k1/5ppp/8/8/3q4/8/5PP1/Q5K1 b - - 0 1'; // now it takes your queen
  g = game('w', q); T.state(g).heard.check = 1;
  r = it(g, S, 'Qxa1+', SOME); ok(r === null, 'a line about a rook is not said for a queen', r);
  g = game('w', q); T.state(g).heard.check = 1;
  r = it(g, bot('goofy'), 'Qxa1+', SOME); ok(key(r) === 'capture_major', 'a general big-capture line is', r);
  // you take its queen: the lost-queen line belongs to it, not to you
  g = game('w', '6k1/5ppp/8/8/8/8/3q1PPP/3R2K1 w - - 0 1');
  r = you(g, bot('goofy'), 'Rxd2', NEVER); ok(key(r) === 'queen_lost', 'you take its queen: queen lost', r);
  g = game('b', '6k1/5ppp/8/8/8/8/3q1PPP/3R2K1 w - - 0 1');
  r = it(g, bot('goofy'), 'Rxd2', SOME); ok(key(r) === 'capture_major', 'it takes your queen: its big capture, not its lost queen', r);
})();

// ---------- the end: results come from end(), never from a move ----------
(function () {
  const g = game('w', '3r2k1/5ppp/8/8/8/8/5PPP/3B2K1 b - - 0 1');
  const r = it(g, bot('bowser'), 'Rxd1#', LOTS);
  ok(r === null, 'a mate that captures says nothing on the move', r);
  ok(key(T.end(g, bot('bowser'), 0, 'checkmate', SOME)) === 'victory', 'it mates you: its victory line');
  ok(key(T.end(g, bot('bowser'), 1, 'resignation', SOME)) === 'defeat', 'you win: its defeat line');
  ok(key(T.end(g, bot('bowser'), 0.5, 'threefold repetition', SOME)) === 'draw', 'a repetition: its draw line');
  ok(key(T.end(g, bot('bowser'), 0, 'time', SOME)) === 'victory', 'you lose on time: its victory line');
  ok(T.end(g, bot('dr-eggman'), 0.5, 'threefold repetition', SOME) === null, 'Eggman says "stalemate" only for a stalemate');
  ok(key(T.end(g, bot('dr-eggman'), 0.5, 'stalemate', SOME)) === 'draw', 'and does for one');
  ok(T.end(g, bot('bowser'), 0, 'checkmate', OFF) === null, 'chat off: no result line either');
})();

// ---------- promotion as the last beat (Dumbledore) ----------
(function () {
  const D = bot('dumbledore'), g = game('w', '6k1/P7/8/8/8/8/6PP/6K1 w - - 0 1');
  you(g, D, 'Kf1'); it(g, D, 'Kf8'); you(g, D, 'Ke1'); it(g, D, 'Kg8'); you(g, D, 'Kd1'); it(g, D, 'Kf7');
  T.state(g).log = [[0, 'greeting'], [1, 'arc1'], [2, 'arc2']]; T.state(g).heard = { greeting: 1 };
  const r = you(g, D, 'a8=Q', NEVER);
  ok(key(r) === 'arc3' && /become almost anything/.test(r.text), 'a promotion completes the story', r);
})();

// ---------- the story follows the moves: takebacks ----------
(function () {
  const P = bot('patrick-star'), g = game('w'); T.start(g, P, SOME);
  you(g, P, 'e4'); it(g, P, 'e5'); you(g, P, 'Nf3');
  ok(key(it(g, P, 'Qf6', NEVER)) === 'arc1', 'beat 1');
  g.moves.splice(g.moves.length - 2, 2); T.truncate(g);
  ok(!T.state(g).log.some(x => x[1] === 'arc1'), 'taken back: beat 1 never happened');
  you(g, P, 'Nc3');
  ok(key(it(g, P, 'Qf6', NEVER)) === 'arc1', 'and comes again when the queen moves again');
})();

// ---------- rematch, Off, thinking ----------
(function () {
  const g = game('w'); g.rematch = true;
  ok(key(T.start(g, bot('luigi'), SOME)) === 'rematch', 'a rematch starts with the rematch line');
  const h = game('w'); ok(T.start(h, bot('luigi'), OFF) === null, 'chat off: no hello');
  ok(you(h, bot('luigi'), 'e4', OFF) === null && it(h, bot('luigi'), 'e5', OFF) === null, 'chat off: nothing during the game');
  const k = game('w'); T.start(k, bot('luigi'), SOME);
  ok(key(T.thinking(k, bot('luigi'), SOME)) === 'player_thinking', 'a long think: once');
  ok(T.thinking(k, bot('luigi'), SOME) === null, 'and only once');
})();

// ---------- lines that name a piece or a motif wait for it ----------
(function () {
  // a knight checks Scooby: his line is about a bishop, so he says nothing; Goofy's line fits any check
  const kn = 'r5k1/5ppp/8/3N4/8/8/5PPP/6K1 w - - 0 1';
  let g = game('w', kn), r = you(g, bot('scooby-doo'), 'Ne7+', SOME); ok(r === null, 'no bishop line for a knight check', r);
  r = you(game('w', kn), bot('goofy'), 'Ne7+', SOME); ok(key(r) === 'in_check', 'a general in-check line for it', r);
  g = game('w', 'r5k1/6pp/8/8/2B5/8/5PPP/6K1 w - - 0 1');
  r = you(g, bot('scooby-doo'), 'Bd5+', SOME); ok(key(r) === 'in_check', 'a bishop check: Scooby\'s bishop line', r);
  // quiet move lines about a pawn need a pawn move
  g = game('b'); mv(g, 'e4'); r = T.bot(g, bot('pikachu'), { kind: 'search' }, {}, SOME); ok(key(r) === 'quiet_move', 'Pikachu\'s pawn push line on a pawn push', r);
  g = game('b'); mv(g, 'Nf3'); r = T.bot(g, bot('pikachu'), { kind: 'search' }, {}, SOME); ok(r === null, 'not on a knight move', r);
  // (Homer's story is done here, so it doesn't take the turn)
  g = game('b'); T.state(g).log = [[-10, 'arc1'], [-10, 'arc2'], [-10, 'arc3']]; mv(g, 'Nf3');
  r = T.bot(g, bot('homer-simpson'), { kind: 'search' }, {}, SOME); ok(key(r) === 'quiet_move', 'Homer\'s horsey line on a knight move', r);
  g = game('b'); T.state(g).log = [[-10, 'arc1'], [-10, 'arc2'], [-10, 'arc3']]; mv(g, 'e4');
  r = T.bot(g, bot('homer-simpson'), { kind: 'search' }, {}, SOME); ok(r === null, 'and not on a pawn move', r);
})();

// ---------- claims need the referee ----------
(function () {
  // a knight fork of king and rook: Nc7+ forks Ke8 and Ra8
  const fen = 'r3k3/8/8/1N6/8/8/8/4K3 w - - 0 1';
  const fork = { prev: { v: 0, mat: 0 }, now: { v: 400, mat: 0 } }, flat = { prev: { v: 0, mat: 0 }, now: { v: 20, mat: 0 } };
  let g = game('b', fen), r = it(g, bot('ralph-wiggum'), 'Nc7+', NEVER, fork);
  ok(key(r) === 'tactical_success', 'a fork the referee backs: the tactic line, even on a quiet turn', r);
  g = game('b', fen); r = it(g, bot('ralph-wiggum'), 'Nc7+', NEVER, {});
  ok(!r || r.key !== 'tactical_success', 'no referee, no tactic claim', r);
  g = game('b', fen); r = it(g, bot('ralph-wiggum'), 'Nc7+', NEVER, flat);
  ok(!r || r.key !== 'tactical_success', 'a fork that doesn\'t pay: no tactic claim', r);
  g = game('b', fen); r = it(g, bot('among-us-crewmate'), 'Nc7+', NEVER, fork);
  ok(key(r) === 'tactical_success' && /knight/.test(r.text), 'the Crewmate\'s knight-fork line on a knight fork', r);
  // a queen fork is not the Crewmate's knight fork
  g = game('b', 'r3k3/8/8/8/8/8/8/3QK3 w - - 0 1'); r = it(g, bot('among-us-crewmate'), 'Qa4+', NEVER, fork);
  ok(!r || r.key !== 'tactical_success', 'a queen fork is not a knight fork', r);
  // your blunder: the referee's score jumps for it
  const blunder = { prev2: { v: 0, mat: 0 }, prev: { v: 320, mat: 0 }, now: { v: 320, mat: 320 } };
  g = game('w'); mv(g, 'e4'); mv(g, 'e5'); mv(g, 'Nf3'); mv(g, 'd6'); mv(g, 'Nc3');
  r = it(g, bot('goofy'), 'Nf6', NEVER, blunder);
  ok(key(r) === 'opponent_blunder', 'your blunder, backed by the referee', r);
  g = game('w'); mv(g, 'e4'); mv(g, 'e5'); mv(g, 'Nf3'); mv(g, 'd6'); mv(g, 'Nc3');
  r = it(g, bot('velma-dinkley'), 'Nf6', NEVER, blunder);
  ok(!r || r.key !== 'opponent_blunder', 'Velma\'s "left that undefended" needs a piece left hanging', r);
  g = game('w'); mv(g, 'e4'); mv(g, 'e5'); mv(g, 'Nf3'); mv(g, 'd6'); mv(g, 'Nh4');
  r = it(g, bot('velma-dinkley'), 'Qxh4', NEVER, blunder);
  ok(key(r) === 'opponent_blunder', 'and says it when one was', r);
  // its own blunder
  g = game('w'); mv(g, 'e4'); r = it(g, bot('luigi'), 'f6', NEVER, { prev: { v: 0, mat: 0 }, now: { v: -300, mat: 0 } });
  ok(key(r) === 'own_blunder', 'its blunder, backed by the referee', r);
  g = game('w'); mv(g, 'e4'); r = it(g, bot('luigi'), 'f6', NEVER, { prev: { v: 900, mat: 900 }, now: { v: 850, mat: 900 } });
  ok(!r || r.key !== 'own_blunder', 'a small slip while winning is no blunder', r);
})();

// ---------- other beats ----------
(function () {
  // Sherlock: you move a pawn twice, then sacrifice it
  const S = bot('sherlock-holmes'), g = game('w'); T.start(g, S, SOME);
  you(g, S, 'e4'); it(g, S, 'c6', NEVER);
  const r1 = you(g, S, 'e5', NEVER); ok(key(r1) === 'arc1', 'Sherlock notices the pawn moved twice', r1);
  it(g, S, 'd6', NEVER); you(g, S, 'd4'); it(g, S, 'Bf5', NEVER); you(g, S, 'f4');
  const r2 = it(g, S, 'dxe5', NEVER, { prev: { v: -40, mat: 0 }, now: { v: -10, mat: 100 } });
  ok(key(r2) === 'arc2', 'and calls it a sacrifice when he takes it and the referee sees compensation', r2);
  // Luigi: the same bishop, twice
  const L = bot('luigi'), h = game('w'); T.start(h, L, SOME);
  you(h, L, 'e4'); it(h, L, 'e5', NEVER);
  ok(key(you(h, L, 'Bc4', NEVER)) === 'arc1', 'Luigi: a bishop moved');
  it(h, L, 'Nc6', NEVER);
  ok(key(you(h, L, 'Bb5', NEVER)) !== 'arc2', 'the same bishop, too soon');
  it(h, L, 'Nf6', NEVER); you(h, L, 'Nf3', NEVER); it(h, L, 'Be7', NEVER);
  ok(key(you(h, L, 'Bxc6', NEVER)) === 'arc2', 'the same bishop again');
  // Sonic: castling after the early beat
  const So = bot('sonic-the-hedgehog'), s = game('w'); T.start(s, So, SOME);
  ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5', 'd3', 'Nf6'].forEach((m, i) => i % 2 ? it(s, So, m, SOME) : you(s, So, m, NEVER));
  ok(T.state(s).log.some(x => x[1] === 'arc1'), 'Sonic\'s early beat came up', T.state(s).log);
  you(s, So, 'Nc3', NEVER); it(s, So, 'd6', NEVER); you(s, So, 'O-O', NEVER);
  ok(key(it(s, So, 'O-O', NEVER)) === 'arc2', 'Sonic castles: found the loophole');
})();

// ---------- the pace, over real games ----------
(function () {
  const ids = ['patrick-star', 'goofy', 'velma-dinkley', 'tails', 'batman', 'spock', 'homer-simpson', 'wednesday-addams'];
  let some = 0, lots = 0, never = 0, games = 0;
  let seed = 11;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  for (const id of ids) for (let n = 0; n < 4; n++) for (const chat of ['some', 'lots', 'off']) {
    const b = bot(id), g = game(n % 2 ? 'w' : 'b'), opts = { chat, rng: rnd }, said = [];
    const p = new C.Pos(); const w = { depth: 2, temp: 60, random: 0.1, mateCap: 5000 };
    const s0 = T.start(g, b, opts); if (s0) said.push(s0);
    for (let ply = 0; ply < 90; ply++) {
      const st = p.status(); if (st.over) break;
      const m = E.botMove(p, w, Math.floor(rnd() * 1e9)).move; if (!m) break;
      g.moves.push(C.uci(m)); p.make(m);
      if (p.status().over) break;
      const mover = (p.side === 1 ? 'b' : 'w') === g.color ? 'human' : 'bot';
      const refs = {};
      const r = mover === 'human' ? T.human(g, b, opts) : T.bot(g, b, { kind: 'search' }, refs, opts);
      if (r) said.push(Object.assign({ ply: g.moves.length }, r));
    }
    games++;
    const keys = said.map(r => r.key);
    ok(new Set(keys).size === keys.length, 'no line twice in a game: ' + id + ' ' + chat, keys);
    const beats = keys.filter(k => /^arc/.test(k));
    ok(beats.every((k, i) => k === 'arc' + (i + 1)), 'beats in order: ' + id, beats);
    if (chat === 'some') some += said.length; else if (chat === 'lots') lots += said.length; else never += said.length;
  }
  console.log('lines per game: some %s, lots %s, off %s', (some / (games / 3)).toFixed(1), (lots / (games / 3)).toFixed(1), never);
  ok(never === 0, 'off says nothing');
  ok(lots > some, 'Lots talks more than Some', { some, lots });
})();

console.log(fails ? fails + ' of ' + checks + ' checks failed' : 'talk checks pass: ' + checks);
process.exit(fails ? 1 : 0);
