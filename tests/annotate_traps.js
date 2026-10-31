// Works out, for each trap, which side springs it and which move falls into it.
// Writes build/traps_meta.json: { id: { trapper: 'w'|'b', keyPly: n|null } }
const fs = require('fs'), path = require('path');
const C = require('../src/core.js');
const SF = require('./sfnode.js');
const file = path.join(__dirname, '../content/openings.js');
if (!fs.existsSync(file)) { fs.writeFileSync(path.join(__dirname, '../build/traps_meta.json'), '{}'); process.exit(0); }
const data = require(file);
const eng = SF.create();
const val = l => l.mate != null ? (l.mate > 0 ? 100000 - l.mate : -100000 - l.mate) : l.cp;
const win = v => v >= 99000 ? 100 : v <= -99000 ? 0 : 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * Math.max(-1500, Math.min(1500, v)))) - 1);
(async () => {
  const out = {};
  for (const t of data.traps || []) {
    const sans = String(t.moves).trim().split(/\s+/);
    const p = new C.Pos();
    const evals = []; // white-view score before each ply, and after the last
    for (let i = 0; i <= sans.length; i++) {
      const st = p.status();
      if (st.over) evals.push(st.reason === 'checkmate' ? (st.winner === 1 ? 100000 : -100000) : 0);
      else { const a = await eng.analyse(p.fen(), { depth: 12 }); evals.push(val(a.lines[0] || { cp: 0 }) * p.side); }
      if (i < sans.length) { const m = p.parseMove(sans[i]); if (!m) break; p.make(m); }
    }
    const final = evals[evals.length - 1];
    const trapper = final >= 0 ? 'w' : 'b';
    let keyPly = null;
    if (trapper !== t.side && Number.isInteger(t.keyPly)) {
      // the author named the losing move; check it belongs to the victim
      keyPly = t.keyPly;
      const victimWhite = t.side === 'w';
      if (keyPly < 0 || keyPly >= sans.length || (keyPly % 2 === 0) !== victimWhite) { console.log('BAD keyPly for', t.id, keyPly); process.exitCode = 1; }
    } else if (trapper !== t.side) {
      const victim = t.side === 'w' ? 1 : -1;
      for (let i = 0; i < sans.length; i++) {
        const moverWhite = i % 2 === 0;
        if ((victim === 1) !== moverWhite) continue;
        const before = win(evals[i] * victim), after = win(evals[i + 1] * victim);
        if (before - after >= 15) { keyPly = i; break; }
      }
      if (keyPly == null) { // fall back to the victim's last move
        for (let i = sans.length - 1; i >= 0; i--) if ((victim === 1) === (i % 2 === 0)) { keyPly = i; break; }
      }
    }
    out[t.id] = { trapper, keyPly };
    console.log(t.id, 'side', t.side, 'trapper', trapper, 'keyPly', keyPly, keyPly != null ? sans[keyPly] : '');
  }
  fs.writeFileSync(path.join(__dirname, '../build/traps_meta.json'), JSON.stringify(out));
  eng.quit(); process.exit(0);
})();
