const C = require('../src/core.js');
const bufs = []; for (let i = 0; i < 16; i++) bufs.push(new Int32Array(256));
function perft(pos, depth, ply = 0) {
  if (depth === 0) return 1;
  const buf = bufs[ply];
  const n = pos.gen(buf, 0, false);
  let total = 0;
  for (let i = 0; i < n; i++) {
    pos.make(buf[i]);
    if (!pos.leftInCheck()) total += perft(pos, depth - 1, ply + 1);
    pos.unmake();
  }
  return total;
}
const cases = [
  ['rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', [20, 400, 8902, 197281, 4865609]],
  ['r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1', [48, 2039, 97862, 4085603]],
  ['8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1', [14, 191, 2812, 43238, 674624]],
  ['r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1', [6, 264, 9467, 422333]],
  ['rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8', [44, 1486, 62379, 2103487]],
  ['r4rk1/1pp1qppp/p1np1n2/2b1p1B1/2B1P1b1/P1NP1N2/1PP1QPPP/R4RK1 w - - 0 10', [46, 2079, 89890, 3894594]],
];
let ok = true;
for (const [fen, exp] of cases) {
  const pos = new C.Pos(fen);
  for (let d = 1; d <= exp.length; d++) {
    const t = Date.now();
    const got = perft(pos, d);
    const pass = got === exp[d - 1];
    if (!pass) ok = false;
    console.log((pass ? 'ok  ' : 'FAIL') + ' d' + d + ' ' + got + ' (exp ' + exp[d - 1] + ') ' + (Date.now() - t) + 'ms  ' + fen.slice(0, 30));
  }
  if (pos.fen() !== new C.Pos(fen).fen()) { ok = false; console.log('FEN changed after perft'); }
}
// hash consistency during random games
let seed = 12345; const rand = n => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };
for (let g = 0; g < 200; g++) {
  const pos = new C.Pos();
  for (let ply = 0; ply < 200; ply++) {
    const st = pos.status();
    if (st.over) break;
    const m = st.legal[rand(st.legal.length)];
    const san = pos.san(m);
    const back = pos.parseMove(san);
    if (back !== m) { ok = false; console.log('SAN roundtrip fail', san, pos.fen()); break; }
    pos.make(m);
    const lo = pos.keyLo, hi = pos.keyHi; pos.computeKey();
    if (lo !== pos.keyLo || hi !== pos.keyHi) { ok = false; console.log('hash mismatch after', san, pos.fen()); break; }
    const fen = pos.fen(); const p2 = new C.Pos(fen);
    if (p2.fen() !== fen || p2.keyLo !== pos.keyLo) { ok = false; console.log('FEN roundtrip/key mismatch', fen); break; }
  }
}
// PGN round trip
const pgn = `[Event "Test"]\n[White "A"]\n[Black "B"]\n[Result "1-0"]\n\n1. e4 e5 2. Nf3 Nc6 3. Bc4 {Italian} Nd4?! (3... Nf6 4. Ng5) 4. Nxe5 Qg5 5. Nxf7 Qxg2 6. Rf1 Qxe4+ 7. Be2 Nf3# 0-1`;
const parsed = C.parsePgn(pgn);
const r = C.replay(null, parsed.sans);
console.log('pgn moves', parsed.sans.length, 'error', r.error, 'status', JSON.stringify(r.pos.status().reason));
if (r.error || r.pos.status().reason !== 'checkmate') ok = false;
const out = C.pgnFromMoves({ White: 'A', Black: 'B', Result: '0-1' }, null, r.moves);
const again = C.replay(null, C.parsePgn(out).sans);
if (again.pos.fen() !== r.pos.fen()) { ok = false; console.log('PGN export roundtrip failed'); }
// repetition
const rp = new C.Pos();
['Nf3', 'Nf6', 'Ng1', 'Ng8', 'Nf3', 'Nf6', 'Ng1', 'Ng8'].forEach(s => rp.make(rp.parseMove(s)));
console.log('repetition count', rp.repetitions(), rp.status().reason);
if (rp.status().reason !== 'threefold repetition') ok = false;
// SEE checks
const sp = new C.Pos('1k1r4/1pp4p/p7/4p3/8/P5P1/1PP4P/2K1R3 w - - 0 1');
console.log('see Rxe5', sp.see(sp.parseMove('Rxe5')));
const sp2 = new C.Pos('1k1r3q/1ppn3p/p4b2/4p3/8/P2N2P1/1PP1R1BP/2K1Q3 w - - 0 1');
console.log('see Nxe5 (expect -220ish)', sp2.see(sp2.parseMove('Nxe5')));
// hanging
const hp = new C.Pos('r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3');
console.log('e5 hanging loss (defended -> 0):', hp.hangingLoss(C.sqIndex('e5')));
const hp2 = new C.Pos('rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2');
console.log('e5 hanging loss (undefended -> 100):', hp2.hangingLoss(C.sqIndex('e5')));
console.log(ok ? 'ALL OK' : 'FAILURES');
