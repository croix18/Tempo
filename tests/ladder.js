// Ladder sanity check: every original ladder bot (the yardsticks) should beat the one below it.
// Plays each neighbouring pair (half the games with each colour) and compares the result with the rating gap.
// Usage: node tests/ladder.js [gamesPerPair] [seed]
const C = require('../src/core.js'); global.TempoCore = C;
const E = require('../src/engine.js');
const B = require('../src/bots.js');
const games = +process.argv[2] || 20;
let seed = +process.argv[3] || 11;
const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };

function botPlay(bot, pos, sans) {
  if (bot.cfg.book && sans.length < 16) {
    const bm = B.bookMove(sans, bot.cfg.book, rnd);
    if (bm) { const m = pos.parseMove(bm); if (m) return m; }
  }
  return E.botMove(pos, bot.cfg, Math.floor(rnd() * 1e9)).move;
}
function playGame(white, black) {
  const pos = new C.Pos(), sans = [];
  let bigFor = 0, bigSide = 0;
  for (let ply = 0; ply < 220; ply++) {
    const st = pos.status();
    if (st.over) return st.result;
    const m = botPlay(pos.side === 1 ? white : black, pos, sans);
    sans.push(pos.sanCore(m)); pos.make(m);
    if (ply > 30 && ply % 2 === 0) {
      const ev = E.evaluate(pos) * pos.side;
      if (Math.abs(ev) > 1200) { const s = ev > 0 ? 1 : -1; if (s === bigSide) bigFor++; else { bigSide = s; bigFor = 1; } } else bigFor = 0;
      if (bigFor >= 6) return bigSide > 0 ? '1-0' : '0-1';
    }
  }
  const ev = E.think(pos, { movetime: 300 }).score * pos.side;
  return ev > 300 ? '1-0' : ev < -300 ? '0-1' : '1/2-1/2';
}
function expected(gap) { return 1 / (1 + Math.pow(10, -gap / 400)); }

// the original ladder, which the characters are measured against (tests/calibrate.js); the two Stockfish bots need tests/chars.js
const bots = B.LEGACY.filter(b => !b.sf);
let bad = 0;
console.log('pair                       games  upper scores  expected  implied gap  rating gap');
for (let i = 0; i < bots.length - 1; i++) {
  const lo = bots[i], hi = bots[i + 1];
  let score = 0;
  for (let g = 0; g < games; g++) {
    const hiWhite = g % 2 === 0;
    const r = playGame(hiWhite ? hi : lo, hiWhite ? lo : hi);
    score += r === '1/2-1/2' ? 0.5 : ((r === '1-0') === hiWhite ? 1 : 0);
  }
  const pct = score / games, gap = hi.rating - lo.rating, exp = expected(gap);
  const implied = pct <= 0.02 ? 700 : pct >= 0.98 ? 700 : Math.round(-400 * Math.log10(1 / pct - 1));
  // the upper bot must win clearly; the implied gap should be within reason of the rating gap
  const ok = pct >= 0.6;
  if (!ok) bad++;
  console.log((hi.name + ' over ' + lo.name).padEnd(27) + String(games).padStart(5) + '  ' + (pct * 100).toFixed(0).padStart(8) + '%  ' + (exp * 100).toFixed(0).padStart(7) + '%  ' + String(implied).padStart(11) + '  ' + String(gap).padStart(10) + (ok ? '' : '   <- out of order'));
}
console.log(bad ? bad + ' pair(s) out of order' : 'every bot beats the one below it');
process.exit(bad ? 1 : 0);
