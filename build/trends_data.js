/* Synthetic games for Trends' tests and screenshots (no real games or students): legal games from real openings, each
   with a consistent saved review (evals, best moves, move kinds, accuracy), getting better over time. Run in the page:
   page.evaluate(TRENDS_DATA, { seed, n, now }) returns { added, items } after adding the games and their practice items.
   Some games keep no saved review (reviewed before Tempo kept one), some aren't reviewed at all. */
(opts) => {
  let s = opts.seed || 7;
  const rnd = () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648;
  const C = TempoCore, N = opts.n || 40, now = opts.now || Date.now(), DAY = 86400000;
  const OPENINGS = [
    ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1c4', 'f8c5'],          // Italian Game
    ['e2e4', 'c7c5', 'g1f3', 'd7d6', 'd2d4', 'c5d4'],          // Sicilian Defense
    ['d2d4', 'd7d5', 'c2c4', 'e7e6', 'b1c3', 'g8f6'],          // Queen's Gambit Declined
    ['e2e4', 'e7e6', 'd2d4', 'd7d5'],                          // French Defense
    ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1b5', 'a7a6'],          // Ruy Lopez
    ['d2d4', 'g8f6', 'c2c4', 'g7g6']                           // an Indian defense
  ];
  const winPct = (cp) => 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * cp)) - 1);
  const cpOf = (w) => { w = Math.max(1, Math.min(99, w)); return -Math.log(2 / ((w - 50) / 50 + 1) - 1) / 0.00368208; };
  const moveAcc = (loss) => Math.max(0, Math.min(100, 103.1668 * Math.exp(-0.04354 * loss) - 3.1669));
  const blend = (xs) => { if (!xs.length) return null; const m = xs.reduce((a, b) => a + b, 0) / xs.length; const hm = xs.length / xs.reduce((a, b) => a + 1 / Math.max(b, 5), 0); return (m + hm) / 2; };
  const bots = TempoBots.BOTS.filter((b) => b.rating <= 1300 && !b.bonus);
  const TOPICS = ['safety', 'safety', 'fork', 'free', 'threats', 'mates'];
  const games = [], items = [];
  for (let k = 0; k < N; k++) {
    const skill = k / Math.max(1, N - 1);                       // 0: the first game, 1: the latest
    const color = rnd() < 0.5 ? 'w' : 'b', me = color === 'w' ? 1 : -1;
    const book = OPENINGS[k % OPENINGS.length], plies = 26 + Math.floor(rnd() * 44);
    const pos = new C.Pos(C.START_FEN), moves = [], sans = [];
    for (let i = 0; i < plies; i++) {
      if (pos.status().over) break;
      let m = i < book.length ? pos.parseMove(book[i]) : null;
      if (!m) {
        const legal = pos.legalMoves();
        if (!legal.length) break;
        m = rnd() < 0.7 ? pos.parseMove(TempoEngine.handle({ cmd: 'analyse', fen: pos.fen(), moves: [], depth: 1, movetime: 0 }).best) : null;
        if (!m) m = legal[Math.floor(rnd() * legal.length)];
      }
      sans.push(pos.san(m)); moves.push(C.uci(m)); pos.make(m);
    }
    // the review: a walk of evals, each move given a kind by the winning chances it gave away
    let cp = 20; const ev = [Math.round(cp)], best = [], cls = [];
    const acc = { w: [], b: [] }, counts = { w: {}, b: {} };
    for (let i = 0; i < moves.length; i++) {
      const mover = i % 2 === 0 ? 1 : -1, mine = mover === me, before = winPct(cp * mover);
      let loss, code;
      if (i < book.length) { loss = 0; code = 'K'; }
      else {
        const r = rnd(), blunder = mine ? 0.10 - 0.07 * skill : 0.07, mistake = mine ? 0.12 - 0.06 * skill : 0.08, inacc = mine ? 0.16 - 0.06 * skill : 0.14;
        if (r < blunder) { loss = 25 + rnd() * 20; code = 'X'; }
        else if (r < blunder + mistake) { loss = 11 + rnd() * 8; code = 'M'; }
        else if (r < blunder + mistake + inacc) { loss = 5.5 + rnd() * 4; code = 'I'; }
        else if (r < 0.75) { loss = rnd() * 1.8; code = 'E'; }
        else { loss = 0; code = 'B'; }
      }
      const after = Math.max(1, before - loss);
      if (code !== 'K' && code !== 'B') loss = before - after;
      cp = mover * cpOf(after);
      ev.push(Math.max(-9000, Math.min(9000, Math.round(cp))));
      best.push(code === 'B' ? moves[i] : '');
      cls.push(code);
      const side = mover === 1 ? 'w' : 'b', kind = { K: 'book', B: 'best', E: 'excellent', O: 'good', I: 'inaccuracy', M: 'mistake', X: 'blunder' }[code];
      counts[side][kind] = (counts[side][kind] || 0) + 1;
      acc[side].push(moveAcc(code === 'K' || code === 'B' ? 0 : loss));
      if (mine && (code === 'M' || code === 'X')) items.push({ g: k, ply: i, fen: '', kind: kind, topic: TOPICS[Math.floor(rnd() * (skill > 0.6 ? 3 : TOPICS.length))] });
    }
    best.push('');
    const meCp = cp * me, result = meCp > 250 ? (color === 'w' ? '1-0' : '0-1') : meCp < -250 ? (color === 'w' ? '0-1' : '1-0') : '1/2-1/2';
    const won = (result === '1-0') === (color === 'w') && result !== '1/2-1/2', drawn = result === '1/2-1/2';
    const reason = drawn ? (rnd() < 0.5 ? 'agreement' : 'threefold repetition') : rnd() < 0.45 ? 'checkmate' : rnd() < 0.8 ? 'resignation' : 'time';
    const fromCC = k % 3 === 0, bot = bots[k % bots.length], ts = now - (N - k) * 1.6 * DAY;
    const white = color === 'w' ? 'Croix181' : fromCC ? 'opponent' + k : bot.name, black = color === 'b' ? 'Croix181' : fromCC ? 'opponent' + k : bot.name;
    const text = sans.map((x, i) => (i % 2 === 0 ? (i / 2 + 1) + '. ' : '') + x).join(' ');
    const pgn = '[White "' + white + '"]\n[Black "' + black + '"]\n[Result "' + result + '"]\n\n' + text + ' ' + result + '\n';
    const g = { id: 'td' + k + '-' + opts.seed, ts: ts, pgn: pgn, color: color, result: result, reason: reason, plies: moves.length };
    if (fromCC) Object.assign(g, { src: 'chesscom', opp: 'opponent' + k, oppElo: 560 + Math.floor(rnd() * 160), myElo: 590 + k * 2, tc: '600', tcl: 'rapid', key: 'link:https://www.chess.com/game/live/9' + k + opts.seed });
    else Object.assign(g, { bot: bot.id, rated: true, before: 560 + k * 4, after: 560 + k * 4 + (won ? 8 : drawn ? 0 : -8) });
    // most are reviewed; some long ago (no saved review); some not at all
    if (k % 11 !== 5) {
      const a = { w: blend(acc.w) ?? 100, b: blend(acc.b) ?? 100 };
      g.reviewed = true; g.acc = a[color]; g.counts = counts[color];
      if (k % 7 !== 3) g.rv = { ev: ev, best: best, cls: cls.join(''), acc: a, counts: counts };
    }
    games.push(g);
  }
  const res = Store.addGames(games);
  // their mistakes in the practice queue, with their kinds (the newest first, as Review keeps them)
  const st = Store.state.mistakes;
  items.forEach((it) => {
    const g = games[it.g]; if (!g.reviewed) return;
    st.items.unshift({ id: 'g' + g.id + '-' + it.ply, fen: C.START_FEN, played: 'e2e4', best: 'd2d4', kind: it.kind, topic: it.topic, ts: g.ts, box: 0, due: Date.now(), seen: 0 });
  });
  if (st.items.length > 200) st.items.length = 200;
  Store.touch('mistakes');
  return { added: res.added.length, items: items.length };
}
