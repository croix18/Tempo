// Stockfish 10 in Node for build-time checks. analyse(fen, {depth, multipv}) -> lines
const path = require('path');
const SF = require(path.join(__dirname, '../assets/sf10.js'));
function create() {
  const eng = SF(path.join(__dirname, '../assets/sf10.wasm'));
  let listener = null;
  eng.onmessage = (line) => { if (listener) listener(String(line)); };
  const send = (c) => eng.postMessage(c, true);
  let chain = Promise.resolve();
  function run(cmds, until) {
    const p = chain.then(() => new Promise((res) => {
      const lines = [];
      listener = (l) => { lines.push(l); if (until(l)) { listener = null; res(lines); } };
      cmds.forEach(send);
    }));
    chain = p.catch(() => {});
    return p;
  }
  const ready = run(['uci'], l => l === 'uciok').then(() => run(['setoption name Hash value 64', 'isready'], l => l === 'readyok'));
  let curMpv = 1;
  async function analyse(fen, opts = {}) {
    await ready;
    const mpv = opts.multipv || 1, cmds = [];
    if (mpv !== curMpv) { cmds.push('setoption name MultiPV value ' + mpv); curMpv = mpv; }
    cmds.push('position fen ' + fen, opts.movetime ? 'go movetime ' + opts.movetime : 'go depth ' + (opts.depth || 16));
    const lines = await run(cmds, l => l.startsWith('bestmove'));
    const byPv = {};
    for (const l of lines) {
      if (!l.startsWith('info ') || l.indexOf(' pv ') < 0) continue;
      const m = /multipv (\d+)/.exec(l), k = m ? +m[1] : 1;
      const d = +(/ depth (\d+)/.exec(l) || [0, 0])[1];
      const cp = /score cp (-?\d+)/.exec(l), mt = /score mate (-?\d+)/.exec(l);
      if (/(lowerbound|upperbound)/.test(l)) continue;
      byPv[k] = { depth: d, cp: cp ? +cp[1] : null, mate: mt ? +mt[1] : null, pv: l.split(' pv ')[1].trim().split(' ').filter(t => /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(t)) };
    }
    const best = (lines.find(l => l.startsWith('bestmove')) || '').split(' ')[1];
    return { best, lines: Object.keys(byPv).sort((a, b) => a - b).map(k => byPv[k]) };
  }
  return { analyse, quit: () => send('quit') };
}
module.exports = { create };
if (require.main === module) {
  (async () => {
    const e = create();
    const r = await e.analyse('r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5Q2/PPPP1PPP/RNB1K1NR w KQkq - 2 3', { depth: 12, multipv: 3 });
    console.log(JSON.stringify(r, null, 0));
    const r2 = await e.analyse('6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1', { depth: 10 });
    console.log(JSON.stringify(r2));
    process.exit(0);
  })();
}
