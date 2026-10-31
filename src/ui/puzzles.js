/* Tempo puzzles: rated, themed, streak, timed rush and the daily puzzle. */
var Puzzles = (function () {
  'use strict';
  var h = U.h, C = TempoCore;
  var THEMES = {
    tactics: { label: 'Tactics', items: { fork: 'Fork', pin: 'Pin', skewer: 'Skewer', discoveredAttack: 'Discovered attack', doubleCheck: 'Double check', hangingPiece: 'Hanging piece',
      trappedPiece: 'Trapped piece', deflection: 'Deflection', attraction: 'Attraction', capturingDefender: 'Capture the defender', clearance: 'Clearance', interference: 'Interference',
      intermezzo: 'In-between move', xRayAttack: 'X-ray attack', sacrifice: 'Sacrifice', quietMove: 'Quiet move', defensiveMove: 'Defensive move', discoveredCheck: 'Discovered check',
      exposedKing: 'Exposed king', kingsideAttack: 'Kingside attack', queensideAttack: 'Queenside attack', attackingF2F7: 'Attacking f2 or f7', advancedPawn: 'Advanced pawn', promotion: 'Promotion',
      zugzwang: 'Zugzwang', underPromotion: 'Underpromotion', enPassant: 'En passant' } },
    mates: { label: 'Checkmates', items: { mateIn1: 'Mate in 1', mateIn2: 'Mate in 2', mateIn3: 'Mate in 3', mateIn4: 'Mate in 4', mateIn5: 'Mate in 5 or more', backRankMate: 'Back-rank mate',
      smotheredMate: 'Smothered mate', anastasiaMate: 'Anastasia’s mate', arabianMate: 'Arabian mate', bodenMate: 'Boden’s mate', hookMate: 'Hook mate', operaMate: 'Opera mate',
      pillsburysMate: 'Pillsbury’s mate', epauletteMate: 'Epaulette mate', dovetailMate: 'Dovetail mate', cornerMate: 'Corner mate', morphysMate: 'Morphy’s mate', triangleMate: 'Triangle mate',
      swallowstailMate: 'Swallow’s tail mate', blindSwineMate: 'Blind swine mate' } },
    phases: { label: 'Game phase', items: { opening: 'Opening', middlegame: 'Middlegame', endgame: 'Endgame', rookEndgame: 'Rook endgame', pawnEndgame: 'Pawn endgame', bishopEndgame: 'Bishop endgame',
      knightEndgame: 'Knight endgame', queenEndgame: 'Queen endgame', queenRookEndgame: 'Queen and rook endgame' } },
    length: { label: 'Length', items: { oneMove: 'One move', short: 'Two moves', long: 'Three moves', veryLong: 'Four or more moves', crushing: 'Win decisively', advantage: 'Win an advantage', master: 'From master games' } }
  };
  var NAMES = {}; Object.keys(THEMES).forEach(function (g) { Object.assign(NAMES, THEMES[g].items); });
  NAMES.mate = 'Checkmate';

  var mode = 'rated', theme = null, P = null; // P: active player state

  /* ---------- selection ---------- */
  function pickNear(list, target, opts) {
    opts = opts || {};
    var bits = Store.seenBits(), lo = 0, hi = list.length - 1;
    while (lo < hi) { var mid = (lo + hi) >> 1; if (list[mid].rating < target) lo = mid + 1; else hi = mid; }
    for (var w = 75; w <= 1600; w *= 2) {
      var cands = [];
      for (var i = Math.max(0, lo - 400); i < Math.min(list.length, lo + 400); i++) {
        var p = list[i];
        if (Math.abs(p.rating - target) > w) continue;
        if (opts.theme && p.themes.indexOf(opts.theme) < 0) continue;
        if (!opts.allowSeen && (bits[p.i >> 3] >> (p.i & 7)) & 1) continue;
        if (opts.exclude && opts.exclude[p.id]) continue;
        cands.push(p);
      }
      if (cands.length) return (opts.rng ? cands[Math.floor(opts.rng() * cands.length)] : U.pick(cands));
    }
    if (!opts.allowSeen) return pickNear(list, target, Object.assign({}, opts, { allowSeen: true }));
    return null;
  }
  function dailyPuzzle(list) {
    var S = Store.state.puzzles, k = U.dayKey();
    if (S.dailyPick && S.dailyPick.day === k) {
      var hit = list.filter(function (x) { return x.id === S.dailyPick.id; })[0];
      if (hit) return hit;
    }
    var seed = 0; for (var i = 0; i < k.length; i++) seed = (seed * 31 + k.charCodeAt(i)) >>> 0;
    var p = pickNear(list, S.rating, { allowSeen: false, rng: U.rng(seed) }) || pickNear(list, S.rating, { allowSeen: true, rng: U.rng(seed) });
    if (p) { S.dailyPick = { day: k, id: p.id }; Store.touch('puzzles'); }
    return p;
  }
  function markSeen(p) { var bits = Store.seenBits(); bits[p.i >> 3] |= 1 << (p.i & 7); Store.saveBits(bits); }
  function themeList(list) {
    if (!theme) return list;
    return list.filter(function (p) { return p.themes.indexOf(theme) >= 0; });
  }

  /* ---------- rating ---------- */
  function rate(p, won) {
    var S = Store.state.puzzles, before = S.rating, n = S.count;
    var K = n < 20 ? 40 : n < 60 ? 24 : 16;
    var exp = 1 / (1 + Math.pow(10, (p.rating - before) / 400));
    S.rating = Math.max(100, Math.round(before + K * ((won ? 1 : 0) - exp)));
    S.count++; if (won) S.solved++;
    S.hist.push([Date.now(), S.rating]); if (S.hist.length > 600) S.hist.shift();
    p.themes.forEach(function (t) { if (!NAMES[t]) return; var x = S.themes[t] || (S.themes[t] = [0, 0]); x[0]++; if (won) x[1]++; });
    Store.touch('puzzles');
    Store.activity('p');
    return S.rating - before;
  }

  /* ---------- menu ---------- */
  function renderMenu(root) {
    var S = Store.state.puzzles;
    root.appendChild(h('div', { class: 'page-head' },
      h('div', null, h('h1', null, 'Puzzles')),
      h('span', { class: 'chip gold' }, 'Puzzle rating ' + S.rating)));
    var grid = h('div', { class: 'grid three' });
    grid.appendChild(modeCard('Rated', 'Puzzles matched to your rating. Your rating goes up as you solve.', 'puzzle', function () { mode = 'rated'; theme = null; startLoop(); }));
    grid.appendChild(modeCard('Streak', 'Puzzles get harder until you miss one. Best: ' + S.streakBest + '.', 'fire', function () { mode = 'streak'; theme = null; startLoop(); }));
    grid.appendChild(modeCard('Rush', 'Three minutes, three strikes. Best: ' + S.rushBest + '.', 'clock', function () { mode = 'rush'; theme = null; startLoop(); }));
    root.appendChild(grid);
    var weak = weakest();
    if (weak) root.appendChild(h('div', { class: 'card row between', style: { marginTop: '14px' } },
      h('div', null, h('div', { class: 'label' }, 'Worth practicing'), h('b', null, NAMES[weak.t]), h('span', { class: 'muted small' }, '  solved ' + Math.round(weak.rate * 100) + '% of ' + weak.n)),
      h('button', { class: 'btn small', type: 'button', onclick: function () { mode = 'theme'; theme = weak.t; startLoop(); } }, 'Practice')));
    root.appendChild(h('h2', { style: { margin: '26px 0 12px' } }, 'By theme'));
    var box = h('div', { class: 'stack' });
    root.appendChild(box);
    box.appendChild(h('div', { class: 'muted' }, 'Loading puzzles…'));
    Data.puzzles().then(function (list) {
      U.clear(box);
      var counts = {};
      list.forEach(function (p) { p.themes.forEach(function (t) { counts[t] = (counts[t] || 0) + 1; }); });
      Object.keys(THEMES).forEach(function (g) {
        var tg = h('div', { class: 'theme-grid' });
        Object.keys(THEMES[g].items).forEach(function (t) {
          if ((counts[t] || 0) < 10) return;
          var mine = S.themes[t];
          tg.appendChild(h('button', { class: 'theme', type: 'button', onclick: function () { mode = 'theme'; theme = t; startLoop(); } },
            h('b', null, THEMES[g].items[t]),
            h('span', { class: 'faint small' }, counts[t] + ' puzzles' + (mine ? ' · ' + Math.round(mine[1] / mine[0] * 100) + '% solved' : '')),
            mine ? UI.meter(mine[1] / mine[0], 'green') : null));
        });
        if (tg.children.length) { box.appendChild(h('div', { class: 'label', style: { marginTop: '6px' } }, THEMES[g].label)); box.appendChild(tg); }
      });
    });
  }
  function modeCard(title, text, icon, fn) {
    return h('button', { class: 'card theme', type: 'button', onclick: fn, style: { padding: '18px' } },
      h('span', { class: 'row tight' }, U.icon(icon), h('b', { style: { fontSize: '17px' } }, title)),
      h('span', { class: 'muted small' }, text));
  }
  function weakest() {
    var S = Store.state.puzzles.themes, best = null;
    Object.keys(S).forEach(function (t) {
      var x = S[t]; if (!NAMES[t] || x[0] < 6 || /^(short|long|veryLong|oneMove|middlegame|endgame|opening|advantage|crushing|master|mate)$/.test(t)) return;
      var r = x[1] / x[0];
      if (!best || r < best.rate) best = { t: t, rate: r, n: x[0] };
    });
    return best && best.rate < 0.8 ? best : null;
  }

  /* ---------- solving loop ---------- */
  var session = null;
  function startLoop(single) {
    session = { mode: mode, theme: theme, streak: 0, target: null, strikes: 0, solved: 0, endAt: null, single: single || null, done: false, history: [] };
    if (mode === 'streak') session.target = Math.max(400, Store.state.puzzles.rating - 300);
    if (mode === 'rush') { session.target = Math.max(400, Store.state.puzzles.rating - 400); }
    App.go('puzzles', { solving: true });
  }

  function renderSolve(root) {
    App.focus(true);
    var s = session;
    var head = h('div', { class: 'row between', style: { marginBottom: '10px' } },
      h('button', { class: 'back', type: 'button', onclick: function () { stopSession(); App.go('puzzles'); } }, U.icon('back'), 'Puzzles'),
      h('div', { class: 'row tight' }, h('span', { class: 'chip' }, title())));
    root.appendChild(head);
    var board = new Board({ orient: 'w', coords: Store.state.settings.coords !== false, onMove: onMove });
    var status = h('div', { class: 'card stack' }), extra = h('div', { class: 'stack' });
    var arena = h('div', { class: 'arena' }, h('div', { class: 'board-col' }, board.el), h('div', { class: 'panel' }, status, extra));
    root.appendChild(arena);
    var st = { board: board, p: null, pos: null, idx: 0, failed: false, hinted: false, token: 0, timer: null };
    P = st;

    function title() {
      if (s.single === 'daily') return 'Daily puzzle';
      if (s.mode === 'streak') return 'Streak';
      if (s.mode === 'rush') return 'Rush';
      if (s.mode === 'theme') return NAMES[s.theme] || 'Theme';
      return 'Rated';
    }

    function next() {
      st.token++;
      Data.puzzles().then(function (list) {
        var p, S = Store.state.puzzles;
        if (s.single === 'daily') {
          p = dailyPuzzle(list);
        } else if (s.mode === 'streak' || s.mode === 'rush') {
          var ex = {}; s.history.forEach(function (x) { ex[x] = 1; });
          p = pickNear(list, s.target, { exclude: ex });
        } else p = pickNear(list, S.rating, { theme: s.mode === 'theme' ? s.theme : null });
        if (!p) { U.clear(status); status.appendChild(h('div', { class: 'empty' }, 'No more puzzles here right now.')); return; }
        load(p);
      });
    }
    function load(p) {
      st.p = p; st.idx = 0; st.failed = false; st.hinted = false; st.solvedNow = false;
      s.history.push(p.id);
      st.pos = new C.Pos(p.fen);
      var userSide = -st.pos.side;
      board.setOrientation(userSide === 1 ? 'w' : 'b');
      board.setMovable(null);
      board.setPosition(st.pos, { animate: false, last: null, clearLast: true });
      board.clearDecor();
      renderStatus('wait');
      var tok = st.token;
      setTimeout(function () {
        if (tok !== st.token) return;
        var m = st.pos.parseMove(p.moves[0]);
        st.pos.make(m); st.idx = 1;
        U.sound.move();
        board.setPosition(st.pos, { last: m, animate: true });
        board.setMovable(userSide === 1 ? 'w' : 'b');
        renderStatus('turn');
      }, 550);
    }
    function onMove(uci, m) {
      var p = st.p, expected = p.moves[st.idx];
      var after = st.pos.clone(); after.make(m);
      var finalPly = st.idx === p.moves.length - 1;
      var mateAlt = finalPly && after.status().reason === 'checkmate';
      if (uci === expected || mateAlt) {
        st.pos.make(m); st.idx++;
        playSound(m);
        board.setPosition(st.pos, { last: m, animate: false });
        board.setArrows([]); board.setMarks([]);
        if (st.idx >= p.moves.length) return solved();
        board.setMovable(null);
        renderStatus('good');
        var tok = st.token;
        setTimeout(function () {
          if (tok !== st.token) return;
          var r = st.pos.parseMove(p.moves[st.idx]);
          st.pos.make(r); st.idx++;
          playSound(r);
          board.setPosition(st.pos, { last: r, animate: true });
          board.setMovable(st.pos.side === 1 ? 'w' : 'b');
          renderStatus('turn');
        }, 420);
      } else {
        U.sound.bad();
        board.setMovable(null);
        board.setPosition(after, { last: m, animate: false });
        var tok2 = st.token;
        var first = !st.failed;
        st.failed = true;
        if (first) failedOnce();
        setTimeout(function () {
          if (tok2 !== st.token) return;
          board.setPosition(st.pos, { last: null, animate: true });
          if (s.mode === 'streak' || s.mode === 'rush') { if (s.mode === 'streak') endStreak(); else if (!s.done) next(); return; }
          board.setMovable(st.pos.side === 1 ? 'w' : 'b');
          renderStatus('wrong');
        }, 650);
      }
    }
    function playSound(m) { var fl = m >>> 17; if (st.pos.inCheck()) U.sound.check(); else if (fl & 1) U.sound.capture(); else U.sound.move(); }

    function failedOnce() {
      var p = st.p;
      markSeen(p);
      if (s.mode === 'rated' || s.mode === 'theme' || s.single === 'daily') st.delta = rate(p, false);
      if (s.mode === 'rush') { s.strikes++; renderStatus('wrong'); if (s.strikes >= 3) endRush(); }
    }
    function solved() {
      var p = st.p;
      board.setMovable(null);
      U.sound.good();
      st.solvedNow = true;
      if (!st.failed) {
        markSeen(p);
        if (s.mode === 'rated' || s.mode === 'theme' || s.single === 'daily') st.delta = st.hinted ? rate(p, false) : rate(p, true);
      }
      if (s.single === 'daily') { Store.state.puzzles.daily = U.dayKey(); Store.touch('puzzles'); }
      if (s.mode === 'streak') { if (!st.failed) { s.streak++; s.target += 30; } }
      if (s.mode === 'rush') { if (!st.failed) { s.solved++; s.target += 40; } Store.activity('p'); next(); renderStatus('turn'); return; }
      renderStatus('solved');
      if (s.mode === 'streak' && !st.failed) { var tok = st.token; setTimeout(function () { if (tok === st.token) next(); }, 900); }
    }
    function endStreak() {
      var S = Store.state.puzzles;
      s.done = true;
      if (s.streak > S.streakBest) { S.streakBest = s.streak; Store.touch('puzzles'); }
      Store.activity('p');
      renderStatus('over');
    }
    function endRush() {
      var S = Store.state.puzzles;
      if (s.done) return;
      s.done = true; clearInterval(st.timer);
      if (s.solved > S.rushBest) { S.rushBest = s.solved; Store.touch('puzzles'); }
      board.setMovable(null);
      renderStatus('over');
    }

    function hint() {
      if (!st.p || st.idx >= st.p.moves.length) return;
      st.hinted = true;
      var mv = st.p.moves[st.idx];
      board.setMarks([{ sq: mv.slice(0, 2), kind: 'gold' }]);
    }
    function showSolution() {
      var p = st.p; if (!p) return;
      if (!st.failed && !st.solvedNow) { st.failed = true; failedOnce(); }
      board.setMovable(null);
      var tok = ++st.token;
      (function stepSol() {
        if (tok !== st.token || st.idx >= p.moves.length) { if (tok === st.token) renderStatus('shown'); return; }
        var m = st.pos.parseMove(p.moves[st.idx]); st.pos.make(m); st.idx++;
        playSound(m); board.setPosition(st.pos, { last: m, animate: true });
        setTimeout(stepSol, 650);
      })();
    }

    function renderStatus(phase) {
      U.clear(status); U.clear(extra);
      var p = st.p, S = Store.state.puzzles;
      if (s.mode === 'rush') {
        status.appendChild(h('div', { class: 'row between' }, h('div', { class: 'stat' }, h('span', { class: 'label' }, 'Solved'), h('b', null, String(s.solved))),
          h('div', { class: 'stat', style: { textAlign: 'right' } }, h('span', { class: 'label' }, 'Time'), h('b', { id: 'rush-clock' }, U.clockText(Math.max(0, (s.endAt || Date.now() + 180000) - Date.now()))))));
        var strikes = h('div', { class: 'row tight' });
        for (var i = 0; i < 3; i++) strikes.appendChild(h('span', { class: 'chip ' + (i < s.strikes ? 'coral' : '') }, i < s.strikes ? '×' : '•'));
        status.appendChild(strikes);
      }
      if (s.mode === 'streak') status.appendChild(h('div', { class: 'row between' }, h('div', { class: 'stat' }, h('span', { class: 'label' }, 'Streak'), h('b', null, String(s.streak))), h('span', { class: 'faint small' }, 'Best ' + S.streakBest)));
      if (phase === 'over') {
        status.appendChild(h('h2', null, s.mode === 'rush' ? 'Time’s up' : 'Streak over'));
        status.appendChild(h('p', { class: 'muted' }, s.mode === 'rush' ? 'You solved ' + U.plural(s.solved, 'puzzle') + '.' : 'You solved ' + U.plural(s.streak, 'puzzle') + ' in a row.'));
        status.appendChild(h('div', { class: 'row' }, h('button', { class: 'btn primary', type: 'button', onclick: function () { startLoop(); } }, 'Play again'),
          h('button', { class: 'btn', type: 'button', onclick: function () { App.go('puzzles'); } }, 'Done')));
        if (p) extra.appendChild(solutionCard(p));
        return;
      }
      if (!p) { status.appendChild(h('div', { class: 'muted' }, 'Loading…')); return; }
      var userSide = new C.Pos(p.fen).side * -1;
      if (phase === 'wait') status.appendChild(h('div', { class: 'muted' }, 'Watch your opponent’s move…'));
      if (phase === 'turn' || phase === 'good' || phase === 'wrong') {
        status.appendChild(UI.turnPill(userSide, 'Find the best move for ' + (userSide === 1 ? 'White' : 'Black')));
        if (phase === 'good') status.appendChild(h('div', { class: 'feedback ok' }, 'Correct. Keep going.'));
        if (phase === 'wrong') status.appendChild(h('div', { class: 'feedback no' }, s.mode === 'rush' ? 'Strike ' + s.strikes + '.' : 'Not the move. Try again.'));
        if (s.mode !== 'rush' && s.mode !== 'streak') {
          status.appendChild(h('div', { class: 'row' },
            h('button', { class: 'btn small', type: 'button', onclick: hint }, U.icon('hint'), 'Hint'),
            h('button', { class: 'btn small quiet', type: 'button', onclick: showSolution }, 'Show solution')));
        }
        if (s.mode !== 'rush') status.appendChild(h('div', { class: 'faint small' }, 'Puzzle rated ' + (s.mode === 'streak' ? 'about ' + Math.round(p.rating / 50) * 50 : p.rating)));
      }
      if (phase === 'solved' || phase === 'shown') {
        var ok = phase === 'solved' && !st.failed;
        status.appendChild(h('div', { class: 'feedback ' + (ok ? 'ok' : 'info') }, ok ? 'Solved' + (st.hinted ? ' with a hint' : '') + '.' : 'Here’s the solution.'));
        if (st.delta != null && s.mode !== 'streak') status.appendChild(h('div', null, 'Puzzle rating ', h('b', null, String(S.rating)), ' ', h('span', { class: 'delta ' + (st.delta >= 0 ? 'up' : 'down') }, (st.delta >= 0 ? '+' : '') + st.delta)));
        st.delta = null;
        var row = h('div', { class: 'row' });
        if (s.single === 'daily') row.appendChild(h('button', { class: 'btn primary', type: 'button', onclick: function () { s.single = null; s.mode = 'rated'; mode = 'rated'; next(); } }, 'More puzzles'));
        else if (s.mode !== 'streak' || st.failed) row.appendChild(h('button', { class: 'btn primary', type: 'button', onclick: function () { if (s.mode === 'streak') endStreak(); else next(); } }, s.mode === 'streak' ? 'Finish' : 'Next puzzle'));
        status.appendChild(row);
        extra.appendChild(solutionCard(p));
      }
    }
    function solutionCard(p) {
      var themes = p.themes.filter(function (t) { return NAMES[t] && !/^(short|long|veryLong|oneMove|middlegame|endgame|opening|advantage|crushing|master|masterVsMaster|superGM)$/.test(t); });
      var card = h('div', { class: 'card stack' });
      if (themes.length) {
        var chips = h('div', { class: 'row tight' });
        themes.slice(0, 5).forEach(function (t) { chips.appendChild(h('span', { class: 'chip' }, NAMES[t])); });
        card.appendChild(h('div', { class: 'label' }, 'Themes')); card.appendChild(chips);
      }
      var pos = new C.Pos(p.fen); pos.make(pos.parseMove(p.moves[0]));
      var sol = Explain.sanLine(pos, p.moves.slice(1), 20);
      var start = pos.full, white = pos.side === 1, text = '';
      sol.forEach(function (san, i) {
        var isW = (i % 2 === 0) === white;
        if (isW) text += (start + Math.floor((i + (white ? 0 : 1)) / 2)) + '. ';
        else if (i === 0) text += start + '... ';
        text += san + ' ';
      });
      card.appendChild(h('div', { class: 'label' }, 'Solution'));
      card.appendChild(h('div', { style: { fontWeight: 600 } }, text.trim()));
      card.appendChild(h('div', { class: 'row' },
        h('button', { class: 'btn small', type: 'button', onclick: function () { Train.analysis(p.fen, p.moves.slice(), 1); } }, U.icon('analyze'), 'Analyze'),
        h('a', { class: 'btn small quiet', href: 'https://lichess.org/training/' + p.id, target: '_blank', rel: 'noopener' }, 'Open on Lichess')));
      return card;
    }

    if (s.mode === 'rush') {
      s.endAt = Date.now() + 180000;
      st.timer = setInterval(function () {
        var left = s.endAt - Date.now(), el = document.getElementById('rush-clock');
        if (el) el.textContent = U.clockText(Math.max(0, left));
        if (left <= 0) endRush();
      }, 200);
    }
    next();
  }
  function stopSession() { if (P) { clearInterval(P.timer); P.token++; } P = null; }

  App.register('puzzles', {
    render: function (root, params) {
      if (params && params.solving && session) renderSolve(root);
      else renderMenu(root);
    },
    leave: function () { stopSession(); },
    busy: function () { return !!P; }
  });

  return {
    daily: function () {
      if (Store.state.puzzles.daily === U.dayKey()) { mode = 'rated'; theme = null; startLoop(); }
      else { mode = 'rated'; theme = null; startLoop('daily'); }
    },
    themed: function (t) { mode = 'theme'; theme = t; startLoop(); },
    dailyInfo: function () { return Data.puzzles().then(function (list) { var p = dailyPuzzle(list); return p ? { rating: p.rating, themes: p.themes.filter(function (t) { return NAMES[t] && !/^(short|long|veryLong|oneMove|middlegame|endgame|opening|advantage|crushing|master|masterVsMaster|superGM|mate)$/.test(t); }).map(function (t) { return NAMES[t]; }) } : null; }); },
    /* the position the solver sees for today's puzzle */
    dailyPosition: function () {
      return Data.puzzles().then(function (list) {
        var p = dailyPuzzle(list); if (!p) return null;
        var pos = new C.Pos(p.fen), m = pos.parseMove(p.moves[0]); if (!m) return null;
        pos.make(m);
        return { fen: pos.fen(), side: pos.side, last: m, rating: p.rating };
      });
    },
    _cur: function () { return P && P.p ? { id: P.p.id, moves: P.p.moves, idx: P.idx } : null; },
    NAMES: NAMES
  };
})();
