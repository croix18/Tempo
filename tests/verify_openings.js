// node tests/verify_openings.js content/openings.js
const path = require('path');
const C = require('../src/core.js');
const SF = require('./sfnode.js');
const data = require(path.resolve(process.argv[2] || 'content/openings.js'));
const eng = SF.create();
let errors = 0, warns = 0;
const err = (w, m) => { errors++; console.log('ERROR ' + w + ': ' + m); };
const warn = (w, m) => { warns++; console.log('WARN  ' + w + ': ' + m); };
const val = l => l.mate != null ? (l.mate > 0 ? 100000 - l.mate : -100000 - l.mate) : l.cp;
const words = s => String(s || '').trim().split(/\s+/).filter(Boolean).length;
const ids = new Set();

async function checkLine(where, side, movesText, notes, deep) {
  const sans = String(movesText || '').trim().split(/\s+/).filter(Boolean);
  if (!sans.length) { err(where, 'no moves'); return null; }
  const pos = new C.Pos();
  const keys = [];
  for (let i = 0; i < sans.length; i++) {
    const m = pos.parseMove(sans[i]);
    if (!m) { err(where, 'move ' + (i + 1) + ' "' + sans[i] + '" is illegal after ' + sans.slice(0, i).join(' ')); return null; }
    const ours = (side === 'w') === (i % 2 === 0);
    keys.push({ key: pos.fen().split(' ').slice(0, 4).join(' '), san: pos.san(m), ours });
    if (ours && deep) {
      const a = await eng.analyse(pos.fen(), { depth: 14, multipv: 3 });
      const best = a.lines[0];
      const u = C.uci(m);
      const hit = a.lines.find(l => l.pv[0] === u);
      let v;
      if (hit) v = val(hit);
      else { pos.make(m); const b = await eng.analyse(pos.fen(), { depth: 13 }); pos.unmake(); v = -val(b.lines[0] || { cp: 0 }); }
      // Stockfish 10 at this depth is noisy in the opening (it rates 3.Bc4 a pawn below 3.Bb5),
      // so mainline theory only fails when it drops a lot or walks into mate.
      const gap = best ? val(best) - v : 0, desc = ' (' + (v / 100).toFixed(2) + ' vs best ' + (best ? pos.san(pos.parseMove(best.pv[0])) + ' ' + (val(best) / 100).toFixed(2) : '') + ')';
      if (best && (gap > 150 || v <= -99000)) err(where, 'move ' + (i + 1) + ' ' + sans[i] + ' is a mistake' + desc);
      else if (best && gap > 70) warn(where, 'move ' + (i + 1) + ' ' + sans[i] + ' is not the engine\'s choice' + desc);
    }
    pos.make(m);
  }
  for (const k of Object.keys(notes || {})) {
    const n = +k;
    if (!(n >= 0 && n < sans.length)) err(where, 'note key ' + k + ' is outside the line');
    if (words(notes[k]) > 50) warn(where, 'note ' + k + ' is long (' + words(notes[k]) + ' words)');
    if (/—/.test(notes[k])) warn(where, 'em dash in note ' + k);
  }
  return { keys, end: pos };
}

(async () => {
  const reps = data.repertoires || [], traps = data.traps || [];
  if (!reps.length) err('file', 'no repertoires');
  for (const r of reps) {
    const w = 'rep ' + r.id;
    if (!r.id || !r.name || !r.side || !r.summary || !r.intro || !Array.isArray(r.lines)) { err(w, 'needs id, name, side, summary, intro, lines'); continue; }
    if (ids.has(r.id)) err(w, 'duplicate id'); ids.add(r.id);
    const answer = {};
    for (const ln of r.lines) {
      const lw = w + '/' + ln.id;
      if (!ln.id || !ln.name || !ln.moves) { err(lw, 'line needs id, name, moves'); continue; }
      if (ids.has(r.id + '/' + ln.id)) err(lw, 'duplicate line id'); ids.add(r.id + '/' + ln.id);
      const res = await checkLine(lw, r.side, ln.moves, ln.notes, true);
      if (!res) continue;
      for (const k of res.keys) {
        if (!k.ours) continue;
        if (answer[k.key] && answer[k.key].san !== k.san) err(lw, 'conflict: in the same position this line plays ' + k.san + ' but line ' + answer[k.key].line + ' plays ' + answer[k.key].san);
        else answer[k.key] = { san: k.san, line: ln.id };
      }
      const st = res.end.status();
      if (!st.over) {
        const a = await eng.analyse(res.end.fen(), { depth: 14 });
        const l = a.lines[0];
        if (l) {
          const forSide = (res.end.side === 1) === (r.side === 'w') ? val(l) : -val(l);
          if (forSide < -60) warn(lw, 'line ends worse for the repertoire side (' + (forSide / 100).toFixed(2) + ')');
        }
      }
      if (!ln.notes || Object.keys(ln.notes).length < 3) warn(lw, 'fewer than 3 notes');
    }
  }
  for (const t of traps) {
    const w = 'trap ' + t.id;
    if (!t.id || !t.name || !t.side || !t.summary || !t.moves || !t.lesson) { err(w, 'needs id, name, side, summary, moves, lesson'); continue; }
    if (ids.has('trap:' + t.id)) err(w, 'duplicate id'); ids.add('trap:' + t.id);
    await checkLine(w, t.side, t.moves, t.notes, false);
  }
  console.log('\n' + errors + ' errors, ' + warns + ' warnings');
  eng.quit();
  process.exit(errors ? 1 : 0);
})();
