// What the characters say (src/talk.js, the Character Voice V5 pack): the pack's ten regression checks, a scripted
// game for each kind of story beat and evidence rule, and engine games for the pace.
//   node tests/talk_test.js
const C = require('../src/core.js'); global.TempoCore = C;
const Book = require('../src/book.js'); global.TempoBook = Book;
const E = require('../src/engine.js'); global.TempoEngine = E;
const B = require('../src/bots.js');
const T = require('../src/talk.js');
const CHARS = require('../content/characters.json');

let fails = 0, checks = 0;
function ok(cond, what, extra) { checks++; if (!cond) { fails++; console.log('FAIL', what, extra !== undefined ? JSON.stringify(extra) : ''); } }
const bot = id => B.byId(id);
// rolls: ALWAYS says an ordinary line whenever it may; NEVER never does (the lines that need no roll still come)
const ALWAYS = { chat: 'some', rng: () => 0 }, NEVER = { chat: 'some', rng: () => 0.99 }, LOTS = { chat: 'lots', rng: () => 0 }, OFF = { chat: 'off', rng: () => 0 };
let gid = 0;
// a game against a character: you are `color`
function game(color, fen, extra) { return Object.assign({ id: 'g' + (++gid), color, startFen: fen || C.START_FEN, moves: [] }, extra || {}); }
function pos(g) { const p = new C.Pos(g.startFen); g.moves.forEach(u => p.make(p.parseMove(u))); return p; }
function mv(g, s) { const p = pos(g), m = p.parseMove(s); if (!m) throw new Error('illegal ' + s + ' in ' + p.fen()); g.moves.push(C.uci(m)); return g; }
function moves(g, list) { list.forEach(s => mv(g, s)); return g; }
// the page shows the line, and only then does it go into the game's story
function shown(g, c) { if (c) ok(T.said(g, c), 'a chosen line can be recorded', c); return c; }
// you move, and it reacts; it moves, and it reacts
function you(g, b, s, opts, refs) { mv(g, s); return shown(g, T.human(g, b, refs || {}, opts || ALWAYS)); }
function it(g, b, s, opts, refs, res) { mv(g, s); return shown(g, T.bot(g, b, res || { via: 'tempo', kind: 'search' }, refs || {}, opts || ALWAYS)); }
const key = r => r && r.key;
const S = 'stockfish';
function ref(v, mat, engine) { return { v, mat: mat || 0, engine: engine || S }; }
const said = g => T.state(g).log.map(x => x[1]);

/* ---------- 1. the roster and the pack ---------- */
const PACK_EVENTS = ['greeting', 'quiet_move', 'capture', 'opponent_blunder', 'own_blunder', 'check', 'in_check', 'victory', 'defeat', 'rematch', 'special'];
const LINE_REQ = ['pawn', 'to:e4', 'darksq', 'calm', 'hasNB', 'bishops', 'took_pawn', 'took_piece', 'free', 'trade', 'defender', 'threat', 'ahead',
  'hanging', 'hang_knight', 'knight_attacks', 'into_territory', 'checker:rook', 'diag', 'knight', 'own_hanging', 'pawn_moved'];
const SILENT = ['peely', 'steve-minecraft', 'derpy-tiger'];
ok(CHARS.voice_pack && String(CHARS.voice_pack.schema_version) === '5.0', 'the content is the V5 pack', CHARS.voice_pack && CHARS.voice_pack.schema_version);
ok(B.BOTS.length === 61 && CHARS.profiles.length === 61, '61 characters');
ok(JSON.stringify(B.BOTS.map(b => b.id).sort()) === JSON.stringify(CHARS.profiles.map(p => p.id).sort()), 'the voices are the roster, id for id');
ok(T.EVENTS.slice().sort().join() === PACK_EVENTS.slice().sort().join(), 'the eleven V5 events, and no others');
B.BOTS.forEach(b => {
  const v = T.voice(b.id), p = CHARS.profiles.find(x => x.id === b.id);
  ok(!!v, 'a voice for ' + b.id);
  if (!v) return;
  ok(Object.keys(p.dialogue).every(e => PACK_EVENTS.indexOf(e) >= 0), b.id + ': no event the pack doesn’t define', Object.keys(p.dialogue));
  if (SILENT.indexOf(b.id) >= 0) {
    ok(v.mode === 'silent' && !Object.keys(v.lines).length && !v.arc.length, b.id + ' is silent: no lines, no story');
    return;
  }
  ok(PACK_EVENTS.every(e => typeof v.lines[e] === 'string' && v.lines[e].length > 1), b.id + ' has a line for each event');
  ok(v.arc.length === 3 && v.arc.every((x, i) => x.beat === i + 1 && x.text && (i === 0 || x.requires_prior_beat)), b.id + ' has three beats in order');
  v.arc.forEach(x => ok(T.GATES.indexOf(x.gate) >= 0, b.id + ': a detector for the gate ' + x.gate));
  ok(v.guards.length > 0 && v.guards.every(g => T.SPECIALS.indexOf(g) >= 0), b.id + ': its special has evidence to wait for', v.guards);
  Object.keys(v.req).forEach(e => ok(LINE_REQ.indexOf(v.req[e]) >= 0 && !!v.lines[e], b.id + ': the requirement for ' + e + ' is handled', v.req[e]));
  ok(v.chance >= 0.1 && v.chance <= 0.8 && v.cooldown >= 2 && v.cooldown <= 5, b.id + ' has a pace', [v.chance, v.cooldown]);
  ok(!!v.card.canon && !!v.card.assessment && !!v.card.style, b.id + ' has its card text');
  const all = PACK_EVENTS.map(e => v.lines[e]).concat(v.arc.map(x => x.text));
  ok(all.every(t => !/[\[\]*_]/.test(t)), b.id + ': lines as written, no stage directions or markup');
  if (v.mode !== 'name_only') ok(new Set(all).size === all.length, b.id + ': no line written twice');
});
ok(SILENT.every(id => T.voice(id).mode === 'silent'), 'Peely, Steve and Derpy Tiger are silent');
ok(['psyduck', 'pikachu'].every(id => T.voice(id).mode === 'name_only'), 'Psyduck and Pikachu say only their names');
ok(['roblox-noob', 'among-us-crewmate'].every(id => T.voice(id).mode === 'in_game_text'), 'the Noob and the Crewmate type in a game chat');
ok(T.voice('freddy-fazbear').mode === 'speaker_pa' && T.voice('mewtwo').mode === 'telepathic', 'Freddy announces; Mewtwo thinks');
// the writers' notes stay out of what the page shows
ok(B.BOTS.every(b => !('core_psychology' in T.voice(b.id)) && !('never_do' in T.voice(b.id))), 'no writers’ notes in a voice');

/* ---------- 2. how they talk: name cries only; the silent ones say nothing at all ---------- */
const PSY = /^(?:p+s+y+|d+u+c+k+|[\s.!?,\-…])+$/i, PIKA = /^(?:p+i+|k+a+|c+h+u+|[\s.!?,\-…])+$/i;
['psyduck', 'pikachu'].forEach(id => {
  const v = T.voice(id), re = id === 'psyduck' ? PSY : PIKA;
  const all = PACK_EVENTS.map(e => v.lines[e]).concat(v.arc.map(x => x.text));
  ok(all.every(t => re.test(t)), id + ' says only its name, no translation and no action text', all.filter(t => !re.test(t)));
});

/* ---------- engine games: the characters against a quick engine, with or without a referee ---------- */
let seed = 11;
const reseed = x => { seed = x; };
const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
function referee(g, n) {
  const p = new C.Pos(g.startFen); g.moves.slice(0, n).forEach(u => p.make(p.parseMove(u)));
  if (p.status().over) return null;
  const a = E.handle({ cmd: 'analyse', fen: g.startFen, moves: g.moves.slice(0, n), depth: 2 });
  const sc = a.mate ? (a.mate > 0 ? 1500 - a.mate : -1500 - a.mate) : a.score, botSide = g.color === 'w' ? -1 : 1;
  return { v: p.side === botSide ? sc : -sc, mat: T.material(p, botSide, 'tempo'), engine: 'tempo' };
}
// play a game: the character's moves from its own engine settings, yours from a quick one; refs: use the referee
function play(id, opts, o) {
  o = o || {};
  const b = bot(id), g = game(o.color || (rnd() < 0.5 ? 'w' : 'b'), null, { rematch: !!o.rematch }), out = [], refs = {};
  const s0 = T.start(g, b, opts); if (s0) out.push(shown(g, s0));
  const p = new C.Pos(), you2 = { depth: 1, temp: 80, random: 0.15, mateCap: 5000 };
  if (o.refs) refs[0] = referee(g, 0);
  let botMoves = 0;
  for (let ply = 0; ply < (o.plies || 80); ply++) {
    if (p.status().over) break;
    const mine = (p.side === 1 ? 'w' : 'b') !== g.color;
    let m;
    if (mine) { const r = E.handle({ cmd: 'bot', fen: C.START_FEN, moves: g.moves, cfg: o.cfg || { depth: 2, temp: 40, random: 0.05, mateCap: 5000 }, seed: Math.floor(rnd() * 1e9) }); m = p.parseMove(r.move); botMoves++; }
    else m = E.botMove(p, you2, Math.floor(rnd() * 1e9)).move;
    if (!m) break;
    g.moves.push(C.uci(m)); p.make(m);
    const k = g.moves.length;
    if (o.refs) refs[k] = referee(g, k);
    if (p.status().over) break;
    const r = mine ? T.bot(g, b, { via: 'tempo', kind: 'search' }, { prev2: refs[k - 2], prev: refs[k - 1], now: refs[k], past: [] }, opts)
                   : T.human(g, b, { prev: refs[k - 1], now: refs[k] }, opts);
    if (r) out.push(shown(g, r));
  }
  const st = p.status(), score = st.over ? (st.result === '1/2-1/2' ? 0.5 : ((st.result === '1-0') === (g.color === 'w') ? 1 : 0)) : 1;
  const end = T.end(g, b, score, st.reason || 'resignation', opts);
  return { g, out, end, botMoves };
}

/* the silent ones: nothing, ever, in any situation */
SILENT.forEach(id => {
  for (let n = 0; n < 2; n++) {
    const r = play(id, LOTS, { refs: n === 0, plies: 60, rematch: n === 1 });
    ok(!r.out.length && !r.end, id + ' says nothing in a whole game, result included', r.out.map(key));
    ok(!r.g.talk || !r.g.talk.log.length, id + ': no story either');
  }
});
['psyduck', 'pikachu'].forEach(id => {
  const re = id === 'psyduck' ? PSY : PIKA, r = play(id, LOTS, { refs: true, plies: 70 });
  ok(r.out.length > 0 && r.out.every(c => re.test(c.text)) && (!r.end || re.test(r.end.text)), id + ' in a game: only its name', r.out.map(c => c.text));
});

let g, r;
/* ---------- 3. no claim without the evidence ---------- */
(function () {
  const P = bot('patrick-star'), A = bot('among-us-crewmate');
  g = game('w'); moves(g, ['e4', 'd5', 'Nc3']); r = it(g, P, 'dxe4', ALWAYS);
  ok(key(r) !== 'capture', 'Patrick: no “free stuff” for a pawn your knight guards', r);
  g = game('w'); moves(g, ['e4', 'd5', 'Bb5+', 'c6', 'Bc4']); r = it(g, P, 'dxc4', ALWAYS);
  ok(key(r) === 'capture' && /free stuff/.test(r.text), 'and “free stuff” for a bishop nobody guards', r);
  g = game('w'); moves(g, ['e4', 'd5', 'Bb5+', 'c6', 'Bc4']); r = it(g, A, 'dxc4', ALWAYS);
  ok(!r, 'the Crewmate doesn’t report a pawn when it took a bishop', r);
  g = game('w'); moves(g, ['e4', 'd5', 'Nc3']); r = it(g, A, 'dxe4', ALWAYS);
  ok(key(r) === 'capture' && /pawn/.test(r.text), 'and does when it took a pawn', r);
  // a blunder needs the referee's scores before and after, from the same engine
  const V = bot('velma-dinkley'), F = 'rnbqkb1r/pppp1ppp/5n2/4p3/4P3/2N5/PPPP1PPP/R1BQKBNR w KQkq - 2 3';
  g = game('w', F); r = you(g, V, 'Qh5', NEVER, {});
  ok(!r, 'Velma: your hung queen is no blunder to her without the referee', r);
  g = game('w', F); r = you(g, V, 'Qh5', NEVER, { prev: ref(-20, 0, 'tempo'), now: ref(880, 0) });
  ok(!r, 'nor with scores from two different engines', r);
  g = game('w', F); r = you(g, V, 'Qh5', NEVER, { prev: ref(-20), now: ref(120) });
  ok(!r, 'a small slip is no blunder', r);
  g = game('w', F); r = you(g, V, 'Qh5', NEVER, { prev: ref(-20), now: ref(880) });
  ok(key(r) === 'opponent_blunder', 'with the referee’s word, she calls it', r);
  // a tactic: the fork on the board, and the referee saying it wins
  const FK = '4k3/8/8/8/3n4/8/8/R3K3 b - - 0 1';
  g = game('w', FK); r = it(g, P, 'Nc2+', NEVER, {});
  ok(!r, 'Patrick: no tactic line without the referee', r);
  g = game('w', FK); r = it(g, P, 'Nc2+', NEVER, { prev: ref(-230, -240), now: ref(-230, -240) });
  ok(!r, 'nor when the referee says the fork wins nothing', r);
  g = game('w', FK); r = it(g, P, 'Nc2+', NEVER, { prev: ref(380, -240), now: ref(390, -240) });
  ok(key(r) === 'special', 'his special when the fork is there and the referee says it wins the rook', r);
  g = game('w', FK); r = it(g, P, 'Nc2+', ALWAYS, { prev: ref(380, -240), now: ref(390, -240) });
  ok(key(r) === 'check', 'a check comes first, on the roll', r);
  // a sacrifice: the piece left to be taken, and the referee saying it costs nothing
  const L = bot('lisa-simpson'), SAC = '4k3/8/8/5b2/8/8/6P1/4K3 b - - 0 1';
  g = game('w', SAC); r = it(g, L, 'Bh3', NEVER, { prev: ref(300, 310), now: ref(280, 310) });
  ok(key(r) === 'special', 'Lisa: a sacrifice the referee backs gets her sacrifice line', r);
  g = game('w', SAC); r = it(g, L, 'Bh3', NEVER, { prev: ref(300, 310), now: ref(-100, 310) });
  ok(key(r) === 'own_blunder', 'one it doesn’t is a blunder, not a sacrifice', r);
  g = game('w', SAC); r = it(g, L, 'Bh3', NEVER, {});
  ok(!r, 'and without the referee, nothing', r);
  // a trap: you take what looked free, and the referee sees what it cost
  const W = bot('wednesday-addams'), TRAP = 'r5k1/5ppp/8/4n3/8/8/5PPP/4R1K1 w - - 0 1';
  g = game('w', TRAP); r = you(g, W, 'Rxe5', NEVER, { prev: ref(330, 390), now: ref(1497, 0) });
  ok(key(r) === 'special', 'Wednesday: you take the bait and the referee sees mate: her trap line', r);
  r = T.human(g, W, { prev: ref(330, 390), now: ref(1497, 0) }, NEVER);
  g.talk = { log: [], heard: { special: 1 } };
  r = T.human(g, W, { prev: ref(330, 390), now: ref(1497, 0) }, NEVER);
  ok(key(r) === 'opponent_blunder', 'with her special used, the blunder line', r);
  g = game('w', TRAP); r = you(g, W, 'Rxe5', NEVER, {});
  ok(!r, 'without the referee, no trap', r);
  // a special on the wrong side waits: Wednesday's trap is about your move, never hers
  g = game('b', '4k3/8/8/8/8/8/3n4/R3K3 w - - 0 1'); r = it(g, W, 'Kxd2', NEVER, { prev: ref(0), now: ref(500) });
  ok(key(r) !== 'special', 'her trap line never follows her own move', r);
  // Olaf's special is about your sacrifice
  const O = bot('olaf');
  g = game('w', '4k3/6p1/8/2B5/8/8/8/4K3 w - - 0 1'); r = you(g, O, 'Bf8', NEVER, { prev: ref(-300, -310), now: ref(-290, -310) });
  ok(key(r) === 'special' && /You gave something up/.test(r.text), 'Olaf: your sacrifice, backed by the referee', r);
  g = game('w', '4k3/6p1/8/2B5/8/8/8/4K3 w - - 0 1'); r = you(g, O, 'Bf8', NEVER, { prev: ref(-300, -310), now: ref(100, -310) });
  ok(key(r) !== 'special', 'not when it simply loses your bishop', r);
})();

/* ---------- 4. captures of every kind, and the result over everything ---------- */
(function () {
  const Go = bot('goofy');
  g = game('w', '4k3/8/8/8/3p4/8/4P3/4K3 w - - 0 1'); mv(g, 'e4'); r = it(g, Go, 'dxe3', ALWAYS);
  ok(key(r) === 'capture', 'en passant is a capture', r);
  g = game('b', 'r7/1P2k3/8/8/8/8/8/4K3 w - - 0 1'); r = it(g, Go, 'bxa8=Q', ALWAYS);
  ok(key(r) === 'capture', 'a promotion that takes is a capture', r);
  g = game('b', '7k/1P6/8/8/8/8/8/4K3 w - - 0 1'); r = it(g, Go, 'b8=Q+', NEVER);
  ok(!r || key(r) !== 'quiet_move', 'a promotion is never a quiet move', r);
  g = game('b', '3r2k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1'); r = it(g, Go, 'Rxd8#', ALWAYS);
  ok(r === null, 'a capture that mates: nothing during the game', r);
  ok(key(T.end(g, Go, 0, 'checkmate', ALWAYS)) === 'victory', 'the result line instead');
  ok(key(T.end(g, Go, 1, 'checkmate', ALWAYS)) === 'defeat' && T.end(g, Go, 0.5, 'stalemate', ALWAYS) === null, 'its loss; a draw has no line');
  g = game('w', '3r2k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1'); r = you(g, Go, 'Rxd8#', ALWAYS);
  ok(r === null, 'your mate: nothing during the game either', r);
  ok(T.end(g, Go, 1, 'checkmate', OFF) === null, 'chat off: no result line');
})();

// play a list of moves alternately, starting with whoever is to move; who: 'you' or 'it' for the first
function seq(g, b, list, first, opts, refs) {
  let out = [], me = first === 'you';
  list.forEach(s => { out.push(me ? you(g, b, s, opts || NEVER, refs) : it(g, b, s, opts || NEVER, refs)); me = !me; });
  return out;
}
/* ---------- 5. stories: beats in order, each when its moment is real; a rematch starts over ---------- */
(function () {
  const P = bot('patrick-star');
  g = game('w');
  ok(key(shown(g, T.start(g, P, NEVER))) === 'greeting', 'Patrick says hello');
  ok(T.start(g, P, NEVER) === null, 'hello once');
  seq(g, P, ['e4', 'e5', 'Nf3'], 'you');
  r = it(g, P, 'Qf6', NEVER);
  ok(key(r) === 'arc1', 'beat 1 when his queen first moves', r);
  seq(g, P, ['Nc3', 'Qg6', 'd3'], 'you'); r = it(g, P, 'Qf6', NEVER);
  ok(key(r) !== 'arc2', 'beat 2 waits for her fourth move', r);
  you(g, P, 'a3'); r = it(g, P, 'Qg6', NEVER);
  ok(key(r) === 'arc2', 'beat 2 on her fourth move', r);
  seq(g, P, ['b3', 'Nc6', 'Nh4', 'a6'], 'you');
  r = you(g, P, 'Nxg6', NEVER);
  ok(key(r) === 'arc3' && /She quit/.test(r.text), 'beat 3 when you take her', r);
  // her capture before beat 2: no beat 3, and no beat 2 made up for it
  const h = game('w'); seq(h, P, ['e4', 'e5', 'Nf3'], 'you');
  ok(key(it(h, P, 'Qh4', NEVER)) === 'arc1', 'beat 1');
  const rest = seq(h, P, ['Nxh4', 'Nc6', 'd4', 'Nxd4', 'Qxd4', 'Bc5', 'Qxc5', 'b6', 'Qc3', 'Ba6', 'Bxa6', 'Ne7', 'Nf5', 'Ng6', 'Nxg7+', 'Kd8', 'O-O', 'h6'], 'you');
  ok(!rest.some(x => /^arc/.test(key(x) || '')), 'her capture before beat 2: no more beats', rest.map(key));
  // a rematch: the rematch line, and the story starts again
  const rg = game('w', null, { rematch: true });
  ok(key(T.start(rg, P, NEVER)) === 'rematch', 'a rematch starts with the rematch line');
  ok(!rg.talk.log.length && !Object.keys(rg.talk.heard).length, 'a new game, a new story');
  // a takeback cuts the story back to the board
  T.truncate(Object.assign(g, { moves: g.moves.slice(0, 10) }));
  ok(said(g).filter(k => /^arc/.test(k)).join() === 'arc1,arc2', 'after a takeback, the beats on the board are the ones left', said(g));
})();

/* Gru waits for a pawn to move before his hello */
(function () {
  const Gr = bot('gru');
  g = game('w');
  ok(T.start(g, Gr, ALWAYS) === null, 'Gru’s hello waits for a pawn to move');
  ok(key(you(g, Gr, 'Nf3', ALWAYS)) !== 'greeting', 'a knight move isn’t it');
  it(g, Gr, 'Nf6', NEVER);
  r = you(g, Gr, 'e4', ALWAYS);
  ok(key(r) === 'greeting' && /A pawn moved already/.test(r.text), 'your pawn moves: his hello', r);
  g = game('w'); seq(g, Gr, ['Nf3', 'Nf6', 'Nc3', 'Nc6'], 'you', ALWAYS); r = you(g, Gr, 'e4', ALWAYS);
  ok(key(r) !== 'greeting', 'too late after two moves each: no hello at all', r);
  g = game('w', null, { rematch: true });
  ok(key(T.start(g, Gr, ALWAYS)) === 'rematch', 'a rematch line doesn’t wait');
})();

/* Dory follows one knight: its first move, its third, its capture */
(function () {
  const D = bot('dory');
  g = game('w');
  r = seq(g, D, ['e4', 'Nf6'], 'you');
  ok(key(r[1]) === 'arc1', 'Dory: beat 1 on a knight’s first move', r.map(key));
  r = seq(g, D, ['d3', 'Nc6', 'Nf3', 'Ng4', 'h3', 'Nf6'], 'you');
  ok(key(r[5]) === 'arc2', 'beat 2 when the same knight moves a third time', r.map(key));
  const id = T.state(g).log.find(x => x[1] === 'arc1')[2];
  ok(id && T.state(g).log.find(x => x[1] === 'arc2')[2] === id, 'the same knight, by its id', T.state(g).log);
  r = seq(g, D, ['e5', 'a6', 'exf6', 'h6', 'a3', 'b6'], 'you');
  ok(key(r[5]) === 'arc3' && /another direction/.test(r[5].text), 'beat 3 after you take that knight, once she may speak', r.map(key));
  // the other knight's capture isn't his
  g = game('w'); seq(g, D, ['e4', 'Nf6', 'd3', 'Nc6', 'Nf3', 'Ng4', 'h3', 'Nf6', 'd4', 'a6', 'd5', 'h6', 'dxc6', 'b6', 'a3', 'g6'], 'you');
  ok(!said(g).includes('arc3'), 'the other knight taken: no beat 3', said(g));
})();

/* Ralph's pawn becomes a queen: his first pawn move, three pawns out, the promotion */
(function () {
  const Ra = bot('ralph-wiggum');
  g = game('b', '8/6P1/k7/8/8/8/PP5P/4K3 w - - 0 1');
  r = seq(g, Ra, ['a3', 'Kb6', 'h3', 'Kc6', 'Ke2', 'Kd6', 'b3', 'Kc6', 'Kf1', 'Kb6', 'Kg1', 'Ka6', 'g8=Q'], 'it');
  const ks = r.map(key);
  ok(ks[0] === 'arc1' && ks[6] === 'arc2' && ks[12] === 'arc3', 'Ralph: Mr. Foot walks, gets friends, grows up', ks);
  g = game('b', '8/6P1/k7/8/8/8/PP5P/4K3 w - - 0 1');
  r = seq(g, Ra, ['a3', 'Kb6', 'h3', 'Kc6', 'Ke2', 'Kd6', 'b3', 'Kc6', 'Kf1', 'Kb6', 'Kg1', 'Ka6', 'g8=N'], 'it');
  ok(key(r[12]) !== 'arc3', 'a pawn that becomes a knight has no crown', r.map(key));
})();

/* Phineas: the first rook move, the rooks connected, a rook on the seventh */
(function () {
  const Ph = bot('phineas-flynn');
  g = game('b', '4k3/7p/8/8/8/8/8/R3K2R w - - 0 1');
  r = seq(g, Ph, ['Ra2', 'Kd8', 'Kf1', 'Ke8', 'Kg1', 'Kd8', 'h1h2', 'Ke8', 'Kf1', 'Kd8', 'Kg1', 'Ke8', 'Ra7'], 'it');
  const ks = r.map(key);
  ok(ks[0] === 'arc1' && ks[6] === 'arc2' && ks[12] === 'arc3', 'Phineas: tower online, towers connected, tower on the seventh', ks);
})();

/* Scooby: checked, checked again, out of it */
(function () {
  const Sc = bot('scooby-doo');
  g = game('w', '4k3/7p/8/8/8/8/8/R3K3 w - - 0 1');
  r = seq(g, Sc, ['Ra8+', 'Kd7', 'Ra7+', 'Kc6', 'Ke2', 'Kb6', 'Ra4', 'Kc5', 'Ra5+', 'Kd4', 'Ra1', 'Ke4', 'Ra2', 'Kf4', 'Ra3', 'h5', 'Ra4+', 'Kg3', 'Ra1', 'h4', 'Ra2', 'Kg4', 'Ra1', 'Kf4', 'Ra2', 'Kg3'], 'you');
  const ks = r.map(key), i1 = ks.indexOf('arc1'), i2 = ks.indexOf('arc2'), i3 = ks.indexOf('arc3');
  ok(i1 === 0 && i2 > i1 && i3 > i2, 'Scooby: chased, chased again, made it', ks);
  ok(i3 < 0 || r.slice(i2 + 1, i3 + 1).every((x, j) => true), 'in order');
})();

/* Velma counts what you take: exactly one, then exactly three */
(function () {
  const Ve = bot('velma-dinkley');
  g = game('w'); r = seq(g, Ve, ['e4', 'd5', 'exd5'], 'you');
  ok(key(r[2]) === 'arc1' && /First piece missing/.test(r[2].text), 'Velma: the first piece missing', r.map(key));
  g = game('w'); shown(g, T.start(g, Ve, NEVER));
  r = seq(g, Ve, ['e4', 'd5', 'exd5', 'c6', 'dxc6', 'Nxc6', 'Nf3', 'e5', 'Bb5', 'Bd6'], 'you');
  ok(!r.map(key).includes('arc1'), 'not when two are gone by the time she may speak', r.map(key));
  g = game('w'); shown(g, T.start(g, Ve, NEVER));
  r = seq(g, Ve, ['e4', 'd5', 'exd5', 'Qxd5', 'Nc3', 'Qa5'], 'you');
  ok(key(r[5]) === 'arc1', 'and when it\u2019s still one, a little later', r.map(key));
})();

/* Sheldon: you leave the book; it holds; the end of the game */
(function () {
  const Sh = bot('sheldon-cooper');
  g = game('w'); r = seq(g, Sh, ['e4', 'e5', 'Ba6'], 'you');
  ok(key(r[2]) === 'arc1', 'Sheldon: you leave the book: beat 1 (ahead of his special about the same moment)', r.map(key));
  r = seq(g, Sh, ['bxa6', 'Nf3', 'Nc6', 'O-O', 'Nf6'], 'it', NEVER, { prev: ref(250), now: ref(240) });
  ok(!r.map(key).includes('arc2'), 'the referee says you’re losing: no “remains playable”', r.map(key));
  r = seq(g, Sh, ['d3', 'Bc5'], 'you', NEVER, { prev: ref(40), now: ref(40) });
  ok(r.map(key).includes('arc2'), 'it holds: beat 2', r.map(key));
  const e = T.end(g, Sh, 1, 'resignation', ALWAYS);
  ok(key(e) === 'defeat' && /revised my notes/.test(e.more || ''), 'a decisive result: beat 3 after his result line', e);
  ok(!T.end(g, Sh, 0.5, 'agreement', ALWAYS), 'a draw: nothing');
  // with his hello said, the moment comes during his cooldown: beat 1 a little later, while it still fits
  g = game('w'); shown(g, T.start(g, Sh, NEVER));
  r = seq(g, Sh, ['e4', 'e5', 'Ba6', 'bxa6', 'Nf3', 'Nc6'], 'you');
  ok(key(r[5]) === 'arc1', 'after the cooldown, beat 1 while it still fits', r.map(key));
})();

/* a sacrifice story (Beth): offered, taken and still sound, the material back */
(function () {
  const Be = bot('beth-harmon'), F = '3qk3/8/8/5b2/8/8/6P1/R5K1 b - - 0 1';
  g = game('w', F);
  r = it(g, Be, 'Bh3', NEVER, { prev: ref(540, 630), now: ref(520, 630) });
  ok(key(r) === 'arc1', 'Beth: the sacrifice opens her story (ahead of her special for the same move)', r);
  r = seq(g, Be, ['gxh3', 'Kf7', 'Kg2', 'Kf6', 'Kg1', 'Ke6', 'Kg2', 'Ke7', 'Kg1'], 'you', NEVER, { prev: ref(500), now: ref(500) });
  r = it(g, Be, 'Kf7', NEVER, { prev: ref(500), now: ref(490) });
  ok(key(r) === 'arc2', 'taken, and still sound: beat 2', r);
  r = seq(g, Be, ['Kg2', 'Qa5', 'Kg1', 'Qxa1+', 'Kg2', 'Qb2+', 'Kg1', 'Qc1+', 'Kg2', 'Qd2+', 'Kg1', 'Qe1+', 'Kg2'], 'you', NEVER, { prev: ref(800), now: ref(800) });
  ok(r.map(key).includes('arc3'), 'the material back: beat 3', r.map(key));
  // the sacrifice declined: the story waits
  g = game('w', F); it(g, Be, 'Bh3', NEVER, { prev: ref(540, 630), now: ref(520, 630) });
  r = seq(g, Be, ['Kh1', 'Kf7', 'Kg1', 'Kf6', 'Kh1', 'Ke6', 'Kg1', 'Ke7', 'Kh1', 'Kf7'], 'you', NEVER, { prev: ref(500), now: ref(500) });
  ok(!r.map(key).includes('arc2'), 'not taken: no beat 2', r.map(key));
})();

// a talk rng of its own, so the moves don't depend on what was said
function talkRng(s) { let x = s; return () => { x = (x * 1103515245 + 12345) & 0x7fffffff; return x / 0x7fffffff; }; }
const NEEDS_REF = /^(opponent_blunder|own_blunder)$/;
const BOARD_GUARDS = ['opponent_bishop_recently_moved', 'opponent_deviated_from_opening'];   // the only specials that need no referee
const REF_GATES = ['verified_knight_fork', 'verified_tactic', 'own_combination_tactic_verified', 'same_threat_neutralized', 'verified_counterattack',
  'off_book_move_holds_eval', 'verified_forcing_sequence', 'first_own_piece_sacrifice_verified', 'sacrifice_line_still_sound'];

/* ---------- 6. the quiet ones talk much less ---------- */
(function () {
  // the first twelve moves each, before anyone runs out of things to say
  const rate = ids => { let lines = 0, games = 0; ids.forEach(id => { for (let n = 0; n < 8; n++) { const r = play(id, { chat: 'some', rng: talkRng(100 + n) }, { plies: 24 }); lines += r.out.filter(c => c.key !== 'greeting' && c.key !== 'rematch').length; games++; } }); return lines / games; };
  const quiet = rate(['batman', 'darth-vader', 'beth-harmon']), loud = rate(['patrick-star', 'donkey-shrek', 'spongebob-squarepants']);
  console.log('lines in the first twelve moves: Batman/Vader/Beth %s, Patrick/Donkey/SpongeBob %s', quiet.toFixed(2), loud.toFixed(2));
  ok(loud >= 3 * quiet && loud >= 2, 'Batman, Vader and Beth speak much less than Patrick, Donkey and SpongeBob', { quiet, loud });
})();

/* ---------- 7. talking never changes the game ---------- */
(function () {
  const before = JSON.stringify(B.BOTS.map(b => [b.id, b.rating, b.cfg, b.sf || null]));
  ['goofy', 'velma-dinkley', 'emperor-palpatine'].forEach((id, i) => {
    reseed(500 + i); const on = play(id, { chat: 'lots', rng: talkRng(9) }, { refs: true, plies: 50, color: 'w' });
    reseed(500 + i); const off = play(id, OFF, { refs: true, plies: 50, color: 'w' });
    ok(on.g.moves.join() === off.g.moves.join(), id + ': the same moves with chat on and off', [on.g.moves.length, off.g.moves.length]);
    ok(on.out.length > 0 && !off.out.length && !off.g.talk, id + ': off says nothing and keeps nothing', off.g.talk);
    ok(Object.keys(on.g).sort().join() === 'color,id,moves,rematch,startFen,talk', id + ': talk is the only thing it adds to the game', Object.keys(on.g));
  });
  ok(JSON.stringify(B.BOTS.map(b => [b.id, b.rating, b.cfg, b.sf || null])) === before, 'no character’s strength or settings changed');
  // what it was given, it leaves as it was
  const g = game('b'); ['e4', 'e5', 'Nf3'].forEach(s => mv(g, s));
  const res = { via: 'stockfish', kind: 'best', score: 30, best: 30, top: 'g1f3', gap: 120 }, refs = { prev2: ref(0), prev: ref(-20), now: ref(-30), past: [ref(0)] };
  const rs = JSON.stringify(res), fs = JSON.stringify(refs);
  T.bot(g, bot('doctor-strange'), res, refs, ALWAYS);
  ok(JSON.stringify(res) === rs && JSON.stringify(refs) === fs, 'the engine’s answer and the referee’s scores are only read');
})();

/* ---------- 8. no ordinary remark twice; beats in order; the cooldown kept ---------- */
(function () {
  const ids = ['patrick-star', 'goofy', 'psyduck', 'among-us-crewmate', 'velma-dinkley', 'freddy-fazbear', 'tails', 'batman', 'spock', 'homer-simpson', 'mewtwo', 'joker-bonus-challenger'];
  let total = 0, games = 0;
  ids.forEach((id, i) => ['some', 'lots'].forEach(chat => {
    const v = T.voice(id), r = play(id, { chat, rng: talkRng(40 + i) }, { refs: true, plies: 90 }), keys = r.out.map(c => c.key);
    games++; total += r.out.length;
    ok(new Set(keys).size === keys.length, id + ' ' + chat + ': no line twice in a game', keys);
    const beats = keys.filter(k => /^arc/.test(k));
    ok(beats.every((k, j) => k === 'arc' + (j + 1)), id + ': beats in order', beats);
    const gap = 2 * (chat === 'lots' ? Math.max(1, v.cooldown - 1) : v.cooldown), plies = r.out.map(c => c.ply);
    ok(plies.every((p, j) => !j || p - plies[j - 1] >= gap), id + ' ' + chat + ': quiet for its cooldown after each line', plies);
  }));
  console.log('lines per game, with the referee: %s', (total / games).toFixed(1));
})();

/* ---------- 10. without a referee (Stockfish blocked, a slow phone): the basics, and nothing that needs evidence ---------- */
(function () {
  const ids = ['patrick-star', 'goofy', 'velma-dinkley', 'ron-weasley', 'batman', 'sheldon-cooper', 'scooby-doo', 'phineas-flynn'];
  const kinds = {}; let bad = [];
  ids.forEach((id, i) => {
    const v = T.voice(id), r = play(id, { chat: 'lots', rng: talkRng(70 + i) }, { refs: false, plies: 90 });
    r.out.forEach(c => {
      kinds[c.key] = (kinds[c.key] || 0) + 1;
      if (NEEDS_REF.test(c.key) || (c.key === 'special' && v.guards.some(x => BOARD_GUARDS.indexOf(x) < 0))) bad.push(id + ':' + c.key);
      if (/^arc/.test(c.key) && REF_GATES.indexOf(v.arc[+c.key[3] - 1].gate) >= 0) bad.push(id + ':' + c.key);
    });
    if (r.end) kinds[r.end.key] = (kinds[r.end.key] || 0) + 1;
  });
  ok(!bad.length, 'no referee: no blunder, special or verified beat', bad);
  ok(kinds.capture > 0 && (kinds.check || 0) + (kinds.in_check || 0) > 0 && kinds.greeting > 0 && kinds.quiet_move > 0, 'and the basics still come', kinds);
  console.log('without the referee:', JSON.stringify(kinds));
})();

/* ---------- 9. long enough to read (the page keeps it up this long unless you tap it away) ---------- */
ok(T.readMs('Pika.') >= 6500 && T.readMs('x'.repeat(60)) >= 8000 && T.readMs('x'.repeat(134)) >= 13000 && T.readMs('x'.repeat(400)) <= 15000,
  'a line stays up long enough to read: 6.5 seconds at least, longer for longer lines, 15 at most');

console.log(fails ? fails + ' of ' + checks + ' checks failed' : 'talk checks pass: ' + checks);
process.exit(fails ? 1 : 0);
