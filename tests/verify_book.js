// Checks the character opening books with Stockfish: a book move shouldn't throw away much against the best move.
// Loose and deliberately wild families (the Chaos Crew's) are skipped; gambits are allowed a bigger margin.
// Usage: node tests/verify_book.js [depth] > build/book_check.txt
const C = require('../src/core.js'); global.TempoCore = C;
const Book = require('../src/book.js');
const SF = require('./sfnode.js');
const depth = +process.argv[2] || 12;
const SKIP = new Set(['pawns', 'e4-loose', 'e5-loose', 'd5-loose', 'queen-raid', 'e5-queen', 'd5-queen', 'd5-flank', 'e4-offbeat', 'e5-offbeat', 'd5-offbeat', 'e5-wild']);
const GAMBIT = new Set(['kings-gambit', 'evans', 'scotch-gambit', 'gambits', 'fried-liver', 'vienna', 'benoni', 'dutch', 'trompowsky', 'e5-open']);
// every (position, move) pair the books play, with the families that play it
const pairs = new Map();
for (const name of Object.keys(Book.FAM)) {
  const f = Book.FAM[name]; if (f[0] === '=' || SKIP.has(name)) continue;
  const side = f[0] === 'w' ? 1 : -1;
  for (const line of f[1]) {
    const p = new C.Pos(C.START_FEN), toks = line.split(/\s+/);
    for (let i = 0; i < toks.length; i++) {
      const m = p.parseMove(toks[i]);
      if (p.side === side) {
        const fen = p.fen(), k = fen + '|' + C.uci(m);
        if (!pairs.has(k)) pairs.set(k, { fen, uci: C.uci(m), san: toks[i], fams: new Set(), line: toks.slice(0, i + 1).join(' ') });
        pairs.get(k).fams.add(name);
      }
      p.make(m);
    }
  }
}
const byFen = new Map();
for (const v of pairs.values()) { if (!byFen.has(v.fen)) byFen.set(v.fen, []); byFen.get(v.fen).push(v); }
const fens = [...byFen.keys()];
console.error('positions', fens.length, 'book moves', pairs.size);
function score(l) { return l.mate != null ? (l.mate > 0 ? 10000 - l.mate : -10000 - l.mate) : l.cp; }
async function worker(eng, list, out) {
  for (const fen of list) {
    const r = await eng.analyse(fen, { depth, multipv: 5 });
    const best = r.lines.length ? score(r.lines[0]) : 0;
    for (const v of byFen.get(fen)) {
      let ln = r.lines.find(l => l.pv[0] === v.uci), s;
      if (ln) s = score(ln);
      else {
        const p = new C.Pos(fen); p.make(p.parseMove(v.uci));
        const r2 = await eng.analyse(p.fen(), { depth: depth - 1 });
        s = r2.lines.length ? -score(r2.lines[0]) : best;
      }
      const loss = best - s, gambit = [...v.fams].some(f => GAMBIT.has(f)), limit = gambit ? 150 : 80;
      if (loss > limit) out.push({ loss, line: v.line, fams: [...v.fams].join(','), best, s });
    }
  }
}
(async () => {
  const t0 = Date.now(), out = [];
  const a = SF.create(), b = SF.create();
  await Promise.all([worker(a, fens.filter((_, i) => i % 2 === 0), out), worker(b, fens.filter((_, i) => i % 2 === 1), out)]);
  out.sort((x, y) => y.loss - x.loss);
  for (const o of out) console.log(String(o.loss).padStart(6), o.fams.padEnd(28), o.line);
  console.log(out.length + ' book move(s) over the limit; ' + ((Date.now() - t0) / 60000).toFixed(1) + ' min');
  process.exit(0);
})();
