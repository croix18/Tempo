// The characters in Node: games between characters and the original ladder bots (the yardsticks), for strength
// and for style. Uses the same roster, books, engine picker and Stockfish choice as the page.
//   node tests/chars.js perf <id> [games] [seed]        performance against the yardsticks around its rating
//   node tests/chars.js match <idA> <idB> [games] [seed] one pairing (an id may be a character or a yardstick)
//   node tests/chars.js tiers [games] [seed]            each tier's middle beats the tier below's middle
//   node tests/chars.js style [games] [seed] [id...]    how often each character does what it says it likes
//                                                       (STYLE_VS=<id> plays them all against the same opponent)
const C = require('../src/core.js'); global.TempoCore = C;
const Book = require('../src/book.js'); global.TempoBook = Book;
const E = require('../src/engine.js'); global.TempoEngine = E;
const B = require('../src/bots.js');
let sf = null;
function engineSF() { if (!sf) sf = require('./sfnode.js').create(); return sf; }

let seed = 7;
const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
const legacy = Object.fromEntries(B.LEGACY.map(b => [b.id, b]));
function who(id) { return B.byId(id) || legacy[id] || null; }
function rating(id) { const b = who(id); return b ? b.rating : 0; }

async function move(bot, pos, game, st) {
  if (bot.cfg && bot.cfg.persona) {
    const useSf = !!bot.sf && !process.env.NO_SF;
    if (bot.surge) { if (st.surge > 0) st.surge--; else if (rnd() < bot.surge.chance) st.surge = bot.surge.len; }
    const plan = B.plan(bot, game, rnd, { sfReady: useSf, surge: st.surge });
    if (plan.book) { const m = pos.parseMove(plan.book); if (m) return { m, via: 'book' }; }
    if (plan.sf) {
      const r = await engineSF().analyse(pos.fen(), { movetime: plan.sf.movetime, multipv: plan.sf.multipv });
      const pick = B.sfPick(bot, pos, r.lines, rnd, st.last);
      if (pick) { const m = pos.parseMove(pick.uci); if (m) return { m, via: 'sf', kind: pick.kind }; }
    }
    const r = E.botMove(pos, plan.tempo || bot.cfg, Math.floor(rnd() * 1e9), { last: st.last });
    return { m: r.move, via: 'tempo', kind: r.kind };
  }
  // a yardstick: the original ladder bot, exactly as it played
  const cfg = bot.cfg;
  if (cfg.book && game.sans.length < 16) { const bm = B.bookMove(game.sans.map(s => s.replace(/[+#]/g, '')), cfg.book, rnd); if (bm) { const m = pos.parseMove(bm); if (m) return { m, via: 'book' }; } }
  if (bot.sf) {
    const r = await engineSF().analyse(pos.fen(), { movetime: bot.sf.movetime, skill: bot.sf.skill });
    const m = r.best && pos.parseMove(r.best); if (m) return { m, via: 'sf' };
  }
  return { m: E.botMove(pos, cfg, Math.floor(rnd() * 1e9)).move, via: 'tempo' };
}

const STYLE_TALLY = ['check', 'cap', 'fork', 'pin', 'discovered', 'sac', 'pawnSac', 'exchangeSac', 'retreat', 'flee', 'trade', 'queenTrade', 'chain', 'outpost', 'brk', 'flank', 'storm', 'earlyQueen', 'queenOut', 'castle', 'kingWalk', 'grab', 'repeat'];
async function playGame(wId, bId, tally) {
  const pos = new C.Pos(), game = { fen: C.START_FEN, moves: [], sans: [] };
  const st = { 1: { surge: 0, last: null }, '-1': { surge: 0, last: null } };
  let bigFor = 0, bigSide = 0;
  for (let ply = 0; ply < 220; ply++) {
    const s = pos.status();
    if (s.over) return s.result;
    const id = pos.side === 1 ? wId : bId, bot = who(id), side = String(pos.side);
    const r = await move(bot, pos, game, st[side]);
    if (!r.m) { const l = pos.legalMoves(); r.m = l[0]; }
    if (tally && tally[id]) {
      const f = E.features(pos, r.m, { last: st[side].last ? C.mk(C.sqIndex(st[side].last.slice(0, 2)), C.sqIndex(st[side].last.slice(2, 4)), 0, 0) : 0 }, false);
      const t = tally[id]; t.moves++;
      for (const k of STYLE_TALLY) if (f[k]) t[k] = (t[k] || 0) + 1;
      if (r.via === 'book') t.book = (t.book || 0) + 1;
      if (f.castle) t.castlePly = (t.castlePly || 0) + ply;
    }
    const u = C.uci(r.m);
    game.sans.push(pos.sanCore(r.m)); game.moves.push(u); st[side].last = u;
    pos.make(r.m);
    if (ply > 30 && ply % 2 === 0) {
      const ev = E.evaluate(pos) * pos.side;
      if (Math.abs(ev) > 1200) { const sgn = ev > 0 ? 1 : -1; if (sgn === bigSide) bigFor++; else { bigSide = sgn; bigFor = 1; } } else bigFor = 0;
      if (bigFor >= 6) return bigSide > 0 ? '1-0' : '0-1';
    }
  }
  const ev = E.think(pos, { movetime: 300 }).score * pos.side;
  return ev > 300 ? '1-0' : ev < -300 ? '0-1' : '1/2-1/2';
}
async function match(a, b, games, tally) {
  let score = 0;
  for (let g = 0; g < games; g++) {
    const aWhite = g % 2 === 0, r = await playGame(aWhite ? a : b, aWhite ? b : a, tally);
    score += r === '1/2-1/2' ? 0.5 : ((r === '1-0') === aWhite ? 1 : 0);
  }
  return score / games;
}
function eloDiff(p) { p = Math.min(0.97, Math.max(0.03, p)); return -400 * Math.log10(1 / p - 1); }
function yardsticksFor(r) {
  const ys = B.LEGACY.filter(y => !y.sf || !process.env.NO_SF).slice().sort((x, y) => Math.abs(x.rating - r) - Math.abs(y.rating - r));
  return ys.slice(0, 2);
}

(async () => {
  const [, , mode, ...args] = process.argv, t0 = Date.now();
  if (mode === 'perf') {
    const id = args[0], games = +args[1] || 10; seed = +args[2] || 7;
    const bot = who(id), out = [];
    for (const y of yardsticksFor(bot.rating)) { const p = await match(id, y.id, games); out.push({ vs: y.id, r: y.rating, p, perf: Math.round(y.rating + eloDiff(p)) }); }
    const perf = Math.round(out.reduce((a, o) => a + o.perf, 0) / out.length);
    console.log(JSON.stringify({ id, target: bot.rating, perf, out, s: Math.round((Date.now() - t0) / 1000) }));
  } else if (mode === 'match') {
    const games = +args[2] || 10; seed = +args[3] || 7;
    const p = await match(args[0], args[1], games);
    console.log(JSON.stringify({ a: args[0], b: args[1], p, gap: rating(args[0]) - rating(args[1]), implied: Math.round(eloDiff(p)), s: Math.round((Date.now() - t0) / 1000) }));
  } else if (mode === 'tiers') {
    const games = +args[0] || 10; seed = +args[1] || 7;
    const mid = t => t.members[4], rows = [];
    for (let i = 0; i + 1 < B.TIERS.length; i++) {
      if (process.env.NO_SF && i + 1 >= 4) break;
      const lo = mid(B.TIERS[i]), hi = mid(B.TIERS[i + 1]), p = await match(hi, lo, games);
      rows.push({ upper: hi, lower: lo, p }); console.log(JSON.stringify(rows[rows.length - 1]));
    }
  } else if (mode === 'style') {
    const games = +args[0] || 4; seed = +args[1] || 7, ids = args.slice(2);
    const list = ids.length ? ids : B.BOTS.filter(b => !b.sf).map(b => b.id), tally = {};
    for (const id of list) {
      tally[id] = { moves: 0 };
      const y = process.env.STYLE_VS ? { id: process.env.STYLE_VS } : yardsticksFor(rating(id))[0];
      await match(id, y.id, games, tally);
      const t = tally[id], per = k => +(100 * (t[k] || 0) / t.moves).toFixed(1);
      console.log(JSON.stringify(Object.assign({ id, moves: t.moves }, Object.fromEntries(STYLE_TALLY.concat(['book']).map(k => [k, per(k)])))));
    }
  }
  if (sf) sf.quit();
  process.exit(0);
})();
