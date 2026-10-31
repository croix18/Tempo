// Verifies and packs the puzzle and opening data.
const fs = require('fs'), zlib = require('zlib');
const C = require('../src/core.js');

// ---- puzzles ----
const lines = fs.readFileSync(__dirname + '/../data/puzzles_src.csv', 'utf8').trim().split(/\r?\n/);
const head = lines.shift().split(',');
const iId = head.indexOf('PuzzleId'), iFen = head.indexOf('FEN'), iMoves = head.indexOf('Moves'), iR = head.indexOf('Rating'), iT = head.indexOf('Themes');
const out = [], bad = [], themeCount = {};
for (const ln of lines) {
  const f = ln.split(',');
  const id = f[iId], fen = f[iFen], moves = f[iMoves].trim().split(' '), rating = +f[iR], themes = (f[iT] || '').trim();
  let ok = true;
  try {
    const p = new C.Pos(fen);
    for (const u of moves) { const m = p.parseMove(u); if (!m || C.uci(m) !== u) { ok = false; break; } p.make(m); }
    // last solution move should not leave the puzzle unfinished
    if (ok && moves.length < 2) ok = false;
  } catch (e) { ok = false; }
  if (!ok) { bad.push(id); continue; }
  themes.split(' ').forEach(t => { if (t) themeCount[t] = (themeCount[t] || 0) + 1; });
  out.push({ id, fen, moves: moves.join(' '), rating, themes });
}
out.sort((a, b) => a.rating - b.rating);
const csv = out.map(p => [p.id, p.fen, p.moves, p.rating, p.themes].join(',')).join('\n');
fs.writeFileSync(__dirname + '/../data/puzzles.csv', csv);
const gz = zlib.gzipSync(Buffer.from(csv), { level: 9 });
fs.writeFileSync(__dirname + '/../build/puzzles.b64', gz.toString('base64'));
console.log('puzzles ok', out.length, 'bad', bad.length, bad.slice(0, 5), 'gz', gz.length, 'b64', gz.toString('base64').length);

// ---- openings ----
const ol = fs.readFileSync(__dirname + '/../data/openings_src.tsv', 'utf8').trim().split(/\r?\n/);
const ops = [], badO = [];
for (const ln of ol) {
  const [eco, name, pgn] = ln.split('\t');
  if (!pgn) continue;
  const r = C.replay(null, C.parsePgn(pgn).sans);
  if (r.error) { badO.push(name); continue; }
  const epd = r.pos.fen().split(' ').slice(0, 4).join(' ');
  ops.push([eco, name, pgn, epd].join('\t'));
}
const otext = ops.join('\n');
const ogz = zlib.gzipSync(Buffer.from(otext), { level: 9 });
fs.writeFileSync(__dirname + '/../data/openings.tsv', otext);
fs.writeFileSync(__dirname + '/../build/openings.b64', ogz.toString('base64'));
console.log('openings ok', ops.length, 'bad', badO.length, 'gz', ogz.length);

// ---- engine binaries and fonts ----
const sf = fs.readFileSync(__dirname + '/../assets/sf10.js', 'utf8');
const needle = 'var Module={wasmBinaryFile:WasmPath};';
if (sf.split(needle).length !== 2) throw new Error('Stockfish loader patch point not found');
const sfp = sf.replace(needle, 'var Module={wasmBinaryFile:WasmPath,wasmBinary:self.__SFWASM};');
fs.writeFileSync(__dirname + '/../build/sfjs.b64', zlib.gzipSync(Buffer.from(sfp), { level: 9 }).toString('base64'));
fs.writeFileSync(__dirname + '/../build/sfwasm.b64', zlib.gzipSync(fs.readFileSync(__dirname + '/../assets/sf10.wasm'), { level: 9 }).toString('base64'));
fs.writeFileSync(__dirname + '/../build/dmsans.b64', fs.readFileSync(__dirname + '/../assets/dmsans.woff2').toString('base64'));
fs.writeFileSync(__dirname + '/../build/dmserif.b64', fs.readFileSync(__dirname + '/../assets/dmserif.woff2').toString('base64'));
console.log('themes:', Object.keys(themeCount).length);
fs.writeFileSync(__dirname + '/../build/themes.json', JSON.stringify(themeCount, null, 0));
