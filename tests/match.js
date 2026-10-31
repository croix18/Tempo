// Usage: node tests/match.js botA botB games [seed]
const C = require('../src/core.js'); global.TempoCore = C;
const E = require('../src/engine.js');
const B = require('../src/bots.js');
const [, , aId, bId, gamesArg, seedArg] = process.argv;
const games = +gamesArg || 20;
let seed = +seedArg || 7;
const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
const A = B.byId(aId), Bb = B.byId(bId);
if (process.env.OVR) { const o = JSON.parse(require('fs').readFileSync(process.env.OVR, 'utf8')); for (const bt of [A, Bb]) if (o[bt.id]) bt.cfg = Object.assign({}, bt.cfg, o[bt.id]); }

function botPlay(bot, pos, sans) {
  if (bot.cfg.book && sans.length < 16) {
    const bm = B.bookMove(sans, bot.cfg.book, rnd);
    if (bm) { const m = pos.parseMove(bm); if (m) return m; }
  }
  const r = E.botMove(pos, bot.cfg, Math.floor(rnd() * 1e9));
  return r.move;
}

function playGame(white, black) {
  const pos = new C.Pos();
  const sans = [];
  let bigFor = 0, bigSide = 0;
  for (let ply = 0; ply < 220; ply++) {
    const st = pos.status();
    if (st.over) return { result: st.result, reason: st.reason, plies: ply };
    const bot = pos.side === 1 ? white : black;
    const m = botPlay(bot, pos, sans);
    sans.push(pos.sanCore(m));
    pos.make(m);
    if (ply > 30 && ply % 2 === 0) {
      const ev = E.evaluate(pos) * pos.side; // white view
      if (Math.abs(ev) > 1200) { const s = ev > 0 ? 1 : -1; if (s === bigSide) bigFor++; else { bigSide = s; bigFor = 1; } }
      else bigFor = 0;
      if (bigFor >= 6) return { result: bigSide > 0 ? '1-0' : '0-1', reason: 'adjudicated', plies: ply };
    }
  }
  const r = E.think(pos, { movetime: 300 });
  const ev = r.score * pos.side;
  return { result: ev > 300 ? '1-0' : ev < -300 ? '0-1' : '1/2-1/2', reason: 'move cap', plies: 220 };
}

let scoreA = 0, wins = 0, draws = 0, losses = 0, plies = 0;
const t0 = Date.now();
for (let g = 0; g < games; g++) {
  const aWhite = g % 2 === 0;
  const r = playGame(aWhite ? A : Bb, aWhite ? Bb : A);
  plies += r.plies;
  let s = r.result === '1/2-1/2' ? 0.5 : ((r.result === '1-0') === aWhite ? 1 : 0);
  scoreA += s; if (s === 1) wins++; else if (s === 0) losses++; else draws++;
}
const pct = scoreA / games;
const elo = pct <= 0 ? -800 : pct >= 1 ? 800 : Math.round(-400 * Math.log10(1 / pct - 1));
console.log(`${aId} vs ${bId}: ${aId} +${wins} =${draws} -${losses}  score ${(pct * 100).toFixed(0)}%  elo diff ${elo}  avg plies ${(plies / games).toFixed(0)}  ${((Date.now() - t0) / 1000).toFixed(0)}s`);
