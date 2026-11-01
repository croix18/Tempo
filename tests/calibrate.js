// Strength calibration for the characters that use the built-in engine.
// Each character plays the two original ladder bots that bracket its rating. Results are read on the ladder's
// measured scale (bot-against-bot Elo from tests/ladder.js, which spreads the bots far wider than their nominal
// ratings) and mapped back to the nominal scale the ratings are written in. Writes one JSON line per character.
//   node tests/calibrate.js [games] [seed] id...      (no ids: every character below 2000)
const { execFileSync } = require('child_process');
const B = require('../src/bots.js');
// measured (bot-vs-bot) scale for the yardsticks, from the 20-games-a-pair ladder run, and their nominal ratings
const EMP = { pip: 0, rosie: 450, theo: 670, mabel: 945, gus: 1115, nora: 1245, felix: 1590, iris: 2100, silas: 2480, vera: 2860, otto: 3310, celeste: 3985 };
const NOM = Object.fromEntries(B.LEGACY.map(b => [b.id, b.rating]));
const PAIRS = Object.keys(EMP).map(k => [EMP[k], NOM[k]]).sort((a, b) => a[0] - b[0]);
function nominal(e) {
  if (e <= PAIRS[0][0]) return PAIRS[0][1] + (e - PAIRS[0][0]) / 3;
  for (let i = 0; i + 1 < PAIRS.length; i++) if (e < PAIRS[i + 1][0]) { const [e0, n0] = PAIRS[i], [e1, n1] = PAIRS[i + 1]; return n0 + (n1 - n0) * (e - e0) / (e1 - e0); }
  const [e0, n0] = PAIRS[PAIRS.length - 1]; return n0 + (e - e0) / 3;
}
function bracket(r) {
  const ys = Object.keys(EMP).sort((a, b) => NOM[a] - NOM[b]);
  let lo = ys[0], hi = ys[ys.length - 1];
  for (const y of ys) { if (NOM[y] <= r) lo = y; }
  for (const y of ys.slice().reverse()) { if (NOM[y] > r) hi = y; }
  if (lo === hi) hi = ys[Math.min(ys.length - 1, ys.indexOf(lo) + 1)];
  return [lo, hi];
}
function eloDiff(p) { p = Math.min(0.97, Math.max(0.03, p)); return -400 * Math.log10(1 / p - 1); }
const games = +process.argv[2] || 12, seed = +process.argv[3] || 7;
const ids = process.argv.slice(4).length ? process.argv.slice(4) : B.BOTS.filter(b => !b.sf).map(b => b.id);
for (const id of ids) {
  const bot = B.byId(id), t0 = Date.now(), out = [];
  for (const y of bracket(bot.rating)) {
    const r = JSON.parse(execFileSync('node', [__dirname + '/chars.js', 'match', id, y, String(games), String(seed)], { encoding: 'utf8', env: Object.assign({}, process.env, { NO_SF: '1' }) }).trim().split('\n').pop());
    out.push({ vs: y, p: r.p, est: Math.round(nominal(EMP[y] + eloDiff(r.p))) });
  }
  // weight each estimate by how much a score that far from 0 or 1 says
  const w = out.map(o => 0.15 + o.p * (1 - o.p)), perf = Math.round(out.reduce((a, o, i) => a + o.est * w[i], 0) / w.reduce((a, b) => a + b, 0));
  console.log(JSON.stringify({ id, target: bot.rating, perf, err: perf - bot.rating, out, s: Math.round((Date.now() - t0) / 1000) }));
}
