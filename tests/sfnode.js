// Stockfish in Node for build-time checks. analyse(fen, {depth, movetime, multipv, skill}) -> { best, lines }
// The engine is a UCI process: the native binary named by SF_BIN when that's set (fast, e.g. Stockfish 17.1 or 19 for
// a deep check), otherwise the Stockfish 19 Lite that Tempo itself embeds, run by Node from assets/ (it speaks UCI on
// stdin and stdout there), so the checks need nothing outside the repo.
const path = require('path');
const { spawn } = require('child_process');
function create(opts = {}) {
  const bin = opts.bin || process.env.SF_BIN || null;
  const proc = bin ? spawn(bin, [], { stdio: ['pipe', 'pipe', 'ignore'] })
    : spawn(process.execPath, [path.join(__dirname, '../assets/sf19-lite-single.js')], { stdio: ['pipe', 'pipe', 'ignore'] });
  let listener = null, buf = '';
  proc.stdout.setEncoding('utf8');
  proc.stdout.on('data', (chunk) => {
    buf += chunk;
    let i;
    while ((i = buf.indexOf('\n')) >= 0) { const line = buf.slice(0, i).replace(/\r$/, ''); buf = buf.slice(i + 1); if (listener) listener(line); }
  });
  const send = (c) => proc.stdin.write(c + '\n');
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
  const threads = Math.max(1, +(process.env.SF_THREADS || 1));
  const ready = run(['uci'], l => l === 'uciok').then(() => run(['setoption name Hash value ' + (bin ? 256 : 64)].concat(bin && threads > 1 ? ['setoption name Threads value ' + threads] : []).concat(['isready']), l => l === 'readyok'));
  let curMpv = 1, curSkill = 20;
  async function analyse(fen, o = {}) {
    await ready;
    const mpv = o.multipv || 1, skill = o.skill == null ? 20 : o.skill, cmds = [];
    if (mpv !== curMpv) { cmds.push('setoption name MultiPV value ' + mpv); curMpv = mpv; }
    if (skill !== curSkill) { cmds.push('setoption name Skill Level value ' + skill); curSkill = skill; }
    cmds.push('position fen ' + fen, 'go' + (o.depth ? ' depth ' + o.depth : '') + (o.movetime ? ' movetime ' + o.movetime : '') + (!o.depth && !o.movetime ? ' depth 16' : ''));
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
  return { analyse, quit: () => { try { send('quit'); proc.stdin.end(); } catch (e) { /* gone */ } } };
}
module.exports = { create };
if (require.main === module) {
  (async () => {
    const e = create();
    const r = await e.analyse('r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5Q2/PPPP1PPP/RNB1K1NR w KQkq - 2 3', { depth: 12, multipv: 3 });
    console.log(JSON.stringify(r, null, 0));
    const r2 = await e.analyse('6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1', { depth: 10 });
    console.log(JSON.stringify(r2));
    e.quit();
    process.exit(0);
  })();
}
