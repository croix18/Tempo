// Opening books: every line is legal, every family a character names exists, and lookups are side-aware.
// Usage: node tests/book_test.js
const C = require('../src/core.js'); global.TempoCore = C;
const Book = require('../src/book.js');
const chars = require('../content/characters.json').profiles;
let bad = 0;
function check(name, ok, info) { if (!ok) { bad++; console.log('FAIL', name, info === undefined ? '' : info); } }

const errs = Book.errors();
check('every book line is legal', errs.length === 0, '\n  ' + errs.join('\n  '));
for (const p of chars) for (const k of ['white', 'black_vs_e4', 'black_vs_d4'])
  for (const f of p.book[k]) check(p.id + ' ' + k + ' family ' + f + ' exists', Book.has(f));
// side-aware: a White family never answers for Black, and the reverse
const start = new C.Pos(C.START_FEN);
check('White families give a first move', Book.moves(start, ['italian']).length > 0);
check('Black families give nothing at the start', Book.moves(start, ['najdorf', 'caro', 'qgd']).length === 0);
const e4 = new C.Pos(C.START_FEN); e4.make(e4.parseMove('e4'));
check('a Sicilian player answers 1.e4 with ...c5', Book.moves(e4, ['najdorf']).map(x => x.uci).join() === 'c7c5', Book.moves(e4, ['najdorf']));
check('a White family has nothing for Black after 1.e4', Book.moves(e4, ['italian']).length === 0);
// a deviation leaves the book: 1.e4 c5 2.Nf3 d6 3.a4 is not in the Najdorf family
const dev = new C.Pos(C.START_FEN); ['e4', 'c5', 'Nf3', 'd6', 'a4'].forEach(s => dev.make(dev.parseMove(s)));
check('a deviation leaves the book', Book.moves(dev, ['najdorf']).length === 0, Book.moves(dev, ['najdorf']));
// transposition: 1.Nf3 d5 2.d4 Nf6 3.c4 e6 reaches the QGD by another order
const tr = new C.Pos(C.START_FEN); ['Nf3', 'd5', 'd4', 'Nf6', 'c4', 'e6'].forEach(s => tr.make(tr.parseMove(s)));
check('a transposition finds the book again', Book.moves(tr, ['qg']).length > 0);
// stats
Book.build();
let positions = 0, lines = 0;
for (const n of Object.keys(Book.FAM)) if (Book.FAM[n][0] !== '=') lines += Book.FAM[n][1].length;
console.log('families', Object.keys(Book.FAM).length, 'lines', lines);
console.log(bad ? bad + ' book check(s) failed' : 'book checks pass');
process.exit(bad ? 1 : 0);
