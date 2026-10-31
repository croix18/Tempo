// node tests/board.js "<fen>" -> ascii board, hanging pieces, legal captures with SEE
const C = require('../src/core.js');
const fen = process.argv[2];
const p = new C.Pos(fen);
for (let r = 7; r >= 0; r--) { let row = (r + 1) + ' '; for (let f = 0; f < 8; f++) { const v = p.b[(r << 4) | f]; row += v ? (v > 0 ? ' PNBRQK'[v] : ' pnbrqk'[-v]) : '.'; row += ' '; } console.log(row); }
console.log('  a b c d e f g h   ' + (p.side === 1 ? 'white' : 'black') + ' to move');
const hang = { w: [], b: [] };
for (let s = 0; s < 128; s++) { if (s & 0x88) continue; const v = p.b[s]; if (!v || Math.abs(v) === 6) continue; const loss = p.hangingLoss(s); if (loss > 0) hang[v > 0 ? 'w' : 'b'].push(C.sqName(s) + '(' + loss + ')'); }
console.log('hanging white:', hang.w.join(' ') || '-', ' black:', hang.b.join(' ') || '-');
const caps = p.legalMoves().filter(m => (m >>> 17) & 1).map(m => p.san(m) + ':' + p.see(m));
console.log('captures:', caps.join(' ') || '-', ' inCheck:', p.inCheck(), ' status:', p.status().reason || 'live');
