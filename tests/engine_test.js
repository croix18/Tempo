const C = require('../src/core.js');
global.TempoCore = C;
const E = require('../src/engine.js');
const wac = [
  ['2rr3k/pp3pp1/1nnqbN1p/3pN3/2pP4/2P3Q1/PPB4P/R4RK1 w - - 0 1', 'Qg6'],
  ['8/7p/5k2/5p2/p1p2P2/Pr1pPK2/1P1R3P/8 b - - 0 1', 'Rxb2'],
  ['5rk1/1ppb3p/p1pb4/6q1/3P1p1r/2P1R2P/PP1BQ1P1/5RKN w - - 0 1', 'Rg3'],
  ['r1bq2rk/pp3pbp/2p1p1pQ/7P/3P4/2PB1N2/PP3PPR/2KR4 w - - 0 1', 'Qxh7+'],
  ['5k2/6pp/p1qN4/1p1p4/3P4/2PKP2Q/PP3r2/3R4 b - - 0 1', 'Qc4+'],
  ['7k/p7/1R5K/6r1/6p1/6P1/8/8 w - - 0 1', 'Rb7'],
  ['rnbqkb1r/pppp1ppp/8/4P3/6n1/7P/PPPNPPP1/R1BQKBNR b KQkq - 0 1', 'Ne3'],
  ['r4q1k/p2bR1rp/2p2Q1N/5p2/5p2/2P5/PP3PPP/R5K1 w - - 0 1', 'Rf7'],
  ['3q1rk1/p4pp1/2pb3p/3p4/6Pr/1PNQ4/P1PB1PP1/4RRK1 b - - 0 1', 'Bh2+'],
  ['2br2k1/2q3rn/p2NppQ1/2p1P3/Pp5R/4P3/1P3PPP/3R2K1 w - - 0 1', 'Rh7'],
];
let found = 0;
for (const [fen, best] of wac) {
  const p = new C.Pos(fen);
  const r = E.think(p, { movetime: 1000 });
  const san = p.san(r.best);
  const ok = san.replace(/[+#]/, '') === best.replace(/[+#]/, '');
  if (ok) found++;
  console.log((ok ? 'ok  ' : 'miss') + ' ' + best + ' got ' + san + ' d' + r.depth + ' sc ' + r.score + ' ' + Math.round(r.nodes / (r.ms / 1000)) + ' nps');
}
console.log('WAC found', found, '/', wac.length);
// start position speed
let p = new C.Pos();
let r = E.think(p, { movetime: 1000 });
console.log('start: d' + r.depth + ' ' + p.san(r.best) + ' sc ' + r.score + ' nodes ' + r.nodes + ' (' + Math.round(r.nodes / r.ms * 1000) + ' nps)');
// mate tests
p = new C.Pos('6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1');
r = E.think(p, { depth: 6 });
console.log('back rank mate: ' + p.san(r.best) + ' score ' + r.score);
p = new C.Pos('8/8/8/4k3/8/8/8/4K2Q w - - 0 1');
r = E.think(p, { movetime: 1000 });
console.log('KQK: ' + p.san(r.best) + ' score ' + r.score + ' d' + r.depth);
// KQK conversion: engine vs engine should mate within 30 moves
p = new C.Pos('8/8/8/4k3/8/8/8/4K2Q w - - 0 1');
let n = 0;
while (!p.status().over && n < 120) { const rr = E.think(p, { movetime: 150 }); p.make(rr.best); n++; }
console.log('KQK result after', n, 'plies:', p.status().reason || 'not over', p.fen());
p = new C.Pos('8/8/8/4k3/8/8/8/R3K3 w - - 0 1');
n = 0;
while (!p.status().over && n < 160) { const rr = E.think(p, { movetime: 200 }); p.make(rr.best); n++; }
console.log('KRK result after', n, 'plies:', p.status().reason || 'not over');
