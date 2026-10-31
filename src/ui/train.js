/* Tempo trainers: coordinates, board vision, your mistakes, endgame practice, analysis board. */
var Train = (function () {
  'use strict';
  var h = U.h, C = TempoCore;
  var T = null;

  function renderHub(root) {
    var S = Store.state;
    root.appendChild(h('div', { class: 'page-head' }, h('h1', null, 'Trainers')));
    var dueN = Mistakes.due().length;
    var list = h('nav', { class: 'menu-list', 'aria-label': 'Trainers', style: { maxWidth: '640px' } });
    list.appendChild(UI.menuRow('refresh', 'Your mistakes', dueN ? U.plural(dueN, 'position') + ' from your games ' + (dueN === 1 ? 'is' : 'are') + ' ready to retry.' : S.mistakes.items.length ? 'Nothing due right now. Each position comes back on a schedule.' : 'Review a game and its mistakes collect here.', function () { App.go('train', { mode: 'mistakes' }); }));
    list.appendChild(UI.menuRow('target', 'Coordinates', 'Name squares quickly, 30 seconds a round.' + (S.puzzles.coordBest ? ' Your best is ' + S.puzzles.coordBest + '.' : ''), function () { App.go('train', { mode: 'coords' }); }));
    list.appendChild(UI.menuRow('eye', 'Board vision', 'Spot every piece that can be won for free.' + (S.puzzles.visionBest ? ' Your best is ' + S.puzzles.visionBest + ' of 10.' : ''), function () { App.go('train', { mode: 'vision' }); }));
    list.appendChild(UI.menuRow('analyze', 'Analysis board', 'Set up any position or paste a game, and check it with the engine.', function () { analysis(); }));
    root.appendChild(list);
    var plays = [];
    Data.lessons().forEach(function (u) { u.lessons.forEach(function (l) { if (l.steps.some(function (s) { return s.t === 'play'; })) plays.push({ unit: u, lesson: l }); }); });
    if (plays.length) {
      root.appendChild(h('h2', { style: { margin: '32px 0 6px' } }, 'Play it out'));
      root.appendChild(h('p', { class: 'muted', style: { marginBottom: '14px', maxWidth: '60ch' } }, 'Endgames and mates to finish against an engine that defends perfectly.'));
      var pl = h('nav', { class: 'menu-list', 'aria-label': 'Play it out', style: { maxWidth: '640px' } });
      plays.forEach(function (x) { pl.appendChild(UI.menuRow('crown', x.lesson.title, 'From ' + x.unit.title, function () { Learn.open(x.lesson.id); })); });
      root.appendChild(pl);
    }
  }
  function header(root, title) {
    App.focus(true);
    root.appendChild(h('button', { class: 'back', type: 'button', onclick: function () { App.go('train'); } }, U.icon('back'), 'Trainers'));
    root.appendChild(h('h1', { style: { fontSize: '26px', margin: '6px 0 12px' } }, title));
  }

  /* ---------- coordinates ---------- */
  function renderCoords(root) {
    header(root, 'Coordinates');
    var st = { score: 0, running: false, target: null, end: 0, timer: null, orient: 'w' };
    T = st;
    var board = new Board({ orient: 'w', coords: false, onSquare: onSquare });
    var big = h('div', { class: 'big-num', style: { textAlign: 'center' } }, '—');
    var info = h('div', { class: 'row between' }, h('div', { class: 'stat' }, h('span', { class: 'label' }, 'Score'), h('b', { id: 'co-score' }, '0')),
      h('div', { class: 'stat', style: { textAlign: 'right' } }, h('span', { class: 'label' }, 'Time'), h('b', { id: 'co-time' }, '30')));
    var orient = Play.seg([['w', 'White side'], ['b', 'Black side'], ['r', 'Random']], 'w', function (v) { st.orientChoice = v; });
    var startBtn = h('button', { class: 'btn primary block', type: 'button', onclick: begin }, 'Start');
    root.appendChild(h('div', { class: 'arena' }, h('div', { class: 'board-col' }, board.el),
      h('div', { class: 'panel' }, h('div', { class: 'card stack' }, h('div', { class: 'label', style: { textAlign: 'center' } }, 'Find'), big, info, orient, startBtn,
        h('div', { class: 'faint small' }, 'Best: ' + (Store.state.puzzles.coordBest || 0))))));
    board.setPosition(empty(), { animate: false });
    function empty() { var p = new C.Pos('4k3/8/8/8/8/8/8/4K3 w - - 0 1'); p.b.fill(0); return p; }
    function newTarget() { st.target = 'abcdefgh'.charAt(Math.floor(Math.random() * 8)) + (1 + Math.floor(Math.random() * 8)); big.textContent = st.target; }
    function begin() {
      st.score = 0; st.running = true; st.end = Date.now() + 30000;
      var o = st.orientChoice || 'w'; board.setOrientation(o === 'r' ? (Math.random() < 0.5 ? 'w' : 'b') : o);
      startBtn.disabled = true;
      document.getElementById('co-score').textContent = '0';
      newTarget();
      clearInterval(st.timer);
      st.timer = setInterval(function () {
        var left = st.end - Date.now();
        var el = document.getElementById('co-time'); if (el) el.textContent = String(Math.max(0, Math.ceil(left / 1000)));
        if (left <= 0) stop();
      }, 100);
    }
    function stop() {
      clearInterval(st.timer); st.running = false; startBtn.disabled = false; startBtn.textContent = 'Play again';
      big.textContent = String(st.score);
      var S = Store.state.puzzles;
      if (st.score > (S.coordBest || 0)) { S.coordBest = st.score; Store.touch('puzzles'); App.toast('New best: ' + st.score); }
      Store.activity('p');
    }
    function onSquare(name) {
      if (!st.running) return;
      if (name === st.target) { st.score++; U.sound.tick(); document.getElementById('co-score').textContent = String(st.score); board.setMarks([{ sq: name, kind: 'green' }]); newTarget(); }
      else { U.sound.bad(); board.setMarks([{ sq: name, kind: 'red' }, { sq: st.target, kind: 'ring' }]); }
    }
  }

  /* ---------- board vision ---------- */
  function renderVision(root) {
    header(root, 'Board vision');
    var st = { round: 0, score: 0, picked: [], answer: [], checked: false };
    T = st;
    var board = new Board({ orient: 'w', coords: Store.state.settings.coords !== false, onSquare: onSquare });
    var text = h('div', { class: 'lesson-text' }), fbBox = h('div'), actions = h('div', { class: 'row' }), meta = h('div', { class: 'faint small' });
    root.appendChild(h('div', { class: 'arena' }, h('div', { class: 'board-col' }, board.el), h('div', { class: 'panel' }, h('div', { class: 'card stack' }, meta, text, fbBox, actions))));
    var pool = null;
    Data.puzzles().then(function (list) {
      var r = Store.state.puzzles.rating;
      pool = list.filter(function (p) { return Math.abs(p.rating - r) < 500; });
      if (pool.length < 50) pool = list;
      nextRound();
    });
    function nextRound() {
      if (st.round >= 10) return finish();
      st.round++; st.picked = []; st.checked = false;
      var tries = 0, pos, ans;
      do {
        var p = U.pick(pool); pos = new C.Pos(p.fen); pos.make(pos.parseMove(p.moves[0]));
        ans = [];
        for (var s = 0; s < 120; s++) {
          if (s & 8) { s += 7; continue; }
          var v = pos.b[s];
          if (!v || Math.abs(v) === 6 || (v > 0 ? 1 : -1) === pos.side) continue;
          if (pos.hangingLoss(s) >= 100) ans.push(C.sqName(s));
        }
        tries++;
      } while ((ans.length === 0 || ans.length > 3) && tries < 60);
      st.answer = ans; st.pos = pos;
      board.setOrientation(pos.side === 1 ? 'w' : 'b');
      board.setPosition(pos, { animate: false, clearLast: true });
      board.clearDecor();
      U.clear(text); U.clear(fbBox); U.clear(actions);
      meta.textContent = 'Round ' + st.round + ' of 10. Score ' + st.score + '.';
      text.appendChild(UI.turnPill(pos.side));
      text.appendChild(h('p', { style: { marginTop: '8px' } }, 'Click every ' + (pos.side === 1 ? 'black' : 'white') + ' piece you could win right now: undefended, or attacked by something cheaper.'));
      actions.appendChild(h('button', { class: 'btn primary', type: 'button', onclick: check }, 'Check'));
    }
    function onSquare(name) {
      if (st.checked) return;
      var k = st.picked.indexOf(name);
      if (k >= 0) st.picked.splice(k, 1); else st.picked.push(name);
      board.setPicked(st.picked);
    }
    function check() {
      st.checked = true;
      var ok = st.picked.slice().sort().join() === st.answer.slice().sort().join();
      if (ok) { st.score++; U.sound.good(); } else U.sound.bad();
      board.setPicked([]);
      board.setMarks(st.answer.map(function (q) { return { sq: q, kind: 'green' }; }).concat(st.picked.filter(function (q) { return st.answer.indexOf(q) < 0; }).map(function (q) { return { sq: q, kind: 'red' }; })));
      U.clear(fbBox);
      fbBox.appendChild(h('div', { class: 'feedback ' + (ok ? 'ok' : 'no') }, ok ? 'Exactly right.' : 'The green squares were the ones to win.'));
      U.clear(actions);
      actions.appendChild(h('button', { class: 'btn primary', type: 'button', onclick: nextRound }, st.round >= 10 ? 'See score' : 'Next'));
    }
    function finish() {
      U.clear(text); U.clear(fbBox); U.clear(actions);
      text.appendChild(h('h2', null, st.score + ' of 10'));
      var S = Store.state.puzzles;
      if (st.score > (S.visionBest || 0)) { S.visionBest = st.score; Store.touch('puzzles'); text.appendChild(h('p', { class: 'muted' }, 'New best.')); }
      Store.activity('p');
      actions.appendChild(h('button', { class: 'btn primary', type: 'button', onclick: function () { App.go('train', { mode: 'vision' }); } }, 'Play again'));
      actions.appendChild(h('button', { class: 'btn', type: 'button', onclick: function () { App.go('train'); } }, 'Done'));
    }
  }

  /* ---------- your mistakes ---------- */
  function renderMistakes(root) {
    header(root, 'Your mistakes');
    var items = Mistakes.due();
    var all = Store.state.mistakes.items;
    if (!items.length) items = all.slice().sort(function (a, b) { return a.due - b.due; }).slice(0, 10);
    if (!items.length) { root.appendChild(h('div', { class: 'empty' }, 'Review a game first. Positions where you went wrong are collected here.', h('div', { style: { marginTop: '12px' } }, h('button', { class: 'btn primary', type: 'button', onclick: function () { App.go('review'); } }, 'Review a game')))); return; }
    var st = { k: 0, list: items.slice(0, 12), right: 0 };
    T = st;
    var board = new Board({ orient: 'w', coords: Store.state.settings.coords !== false, onMove: onMove });
    var text = h('div', { class: 'lesson-text' }), fbBox = h('div'), actions = h('div', { class: 'row' }), meta = h('div', { class: 'faint small' });
    root.appendChild(h('div', { class: 'arena' }, h('div', { class: 'board-col' }, board.el), h('div', { class: 'panel' }, h('div', { class: 'card stack' }, meta, text, fbBox, actions))));
    function show() {
      if (st.k >= st.list.length) return done();
      var it = st.list[st.k];
      st.pos = new C.Pos(it.fen); st.item = it; st.tries = 0;
      board.setOrientation(st.pos.side === 1 ? 'w' : 'b');
      board.setMovable(st.pos.side === 1 ? 'w' : 'b');
      board.setPosition(st.pos, { animate: false, clearLast: true });
      board.clearDecor();
      var played = st.pos.parseMove(it.played);
      U.clear(text); U.clear(fbBox); U.clear(actions);
      meta.textContent = (st.k + 1) + ' of ' + st.list.length;
      text.appendChild(UI.turnPill(st.pos.side));
      text.appendChild(h('p', { style: { marginTop: '8px' } }, 'In your game you played ' + (played ? st.pos.san(played) : it.played) + '. Find something better.'));
      actions.appendChild(h('button', { class: 'btn small quiet', type: 'button', onclick: reveal }, 'Show the answer'));
    }
    function onMove(uci, m) {
      var it = st.item, after = st.pos.clone(); after.make(m);
      board.setMovable(null);
      board.setPosition(after, { last: m, animate: false });
      if (uci === it.best) return right();
      Engines.analyse({ fen: st.pos.fen(), depth: Engines.strong ? 13 : 8, movetime: 800 }).then(function (r0) {
        Engines.analyse({ fen: after.fen(), depth: Engines.strong ? 13 : 8, movetime: 800 }).then(function (r1) {
          var b = r0.lines[0], a = r1.lines[0];
          var wb = b ? (b.mate != null ? (b.mate > 0 ? 100 : 0) : U.winPct(b.cp)) : 50;
          var wa = a ? 100 - (a.mate != null ? (a.mate > 0 ? 100 : 0) : U.winPct(a.cp)) : 50;
          if (wb - wa <= 4) right(); else wrong(a, m);
        });
      });
    }
    function right() {
      U.sound.good(); st.right++;
      Mistakes.grade(st.item, st.tries === 0);
      U.clear(fbBox); fbBox.appendChild(h('div', { class: 'feedback ok' }, 'That’s it.'));
      U.clear(actions); actions.appendChild(h('button', { class: 'btn primary', type: 'button', onclick: function () { st.k++; show(); } }, 'Next'));
    }
    function wrong(line, m) {
      U.sound.bad(); st.tries++;
      var why = line && m ? Explain.bad(st.pos, m, line, st.item.best) : null;
      U.clear(fbBox); fbBox.appendChild(h('div', { class: 'feedback no' }, (why ? why.text + ' ' : '') + 'Try again.'));
      setTimeout(function () { board.setPosition(st.pos, { animate: true, clearLast: true }); board.setMovable(st.pos.side === 1 ? 'w' : 'b'); }, 700);
    }
    function reveal() {
      Mistakes.grade(st.item, false);
      var bm = st.pos.parseMove(st.item.best);
      board.setArrows(bm ? [{ from: st.item.best.slice(0, 2), to: st.item.best.slice(2, 4), color: 'green' }] : []);
      board.setMovable(null);
      U.clear(fbBox); fbBox.appendChild(h('div', { class: 'feedback info' }, 'Best was ' + (bm ? st.pos.san(bm) : st.item.best) + '. ' + Explain.missed(st.pos, st.item.best, null)));
      U.clear(actions); actions.appendChild(h('button', { class: 'btn primary', type: 'button', onclick: function () { st.k++; show(); } }, 'Next'));
    }
    function done() {
      U.clear(text); U.clear(fbBox); U.clear(actions);
      text.appendChild(h('h2', null, st.right + ' of ' + st.list.length));
      text.appendChild(h('p', { class: 'muted' }, 'Positions you got right come back later; misses come back soon.'));
      Store.activity('p');
      actions.appendChild(h('button', { class: 'btn primary', type: 'button', onclick: function () { App.go('train'); } }, 'Done'));
    }
    show();
  }

  /* ---------- analysis board ---------- */
  var analysisSeed = null;
  function analysis(fen, moves, ply) { analysisSeed = { fen: fen || C.START_FEN, moves: moves || [], ply: ply }; App.go('train', { mode: 'analysis' }); }
  function renderAnalysis(root) {
    header(root, 'Analysis board');
    var seed = analysisSeed || { fen: C.START_FEN, moves: [] };
    analysisSeed = null;
    var st = { start: seed.fen, moves: seed.moves.slice(), ply: seed.ply != null ? seed.ply : seed.moves.length, engineOn: true, tok: 0 };
    T = st;
    var startSide = new C.Pos(seed.fen).side * (st.ply % 2 ? -1 : 1);
    var board = new Board({ orient: startSide === 1 ? 'w' : 'b', coords: Store.state.settings.coords !== false, movable: 'both', onMove: onMove });
    var evalFill = h('i', { style: { height: '50%' } }), evalBar = h('div', { class: 'evalbar' }, evalFill);
    var engLine = h('div', { class: 'small' }), movesLine = h('div', { class: 'muted small' });
    var fenIn = h('input', { type: 'text', id: 'an-fen', 'aria-label': 'FEN' });
    var nav = h('div', { class: 'controls' },
      h('button', { class: 'btn icon-only', type: 'button', 'aria-label': 'Back', onclick: function () { go(st.ply - 1); } }, U.icon('back')),
      h('button', { class: 'btn icon-only', type: 'button', 'aria-label': 'Forward', onclick: function () { go(st.ply + 1); } }, U.icon('next')),
      h('button', { class: 'btn icon-only', type: 'button', 'aria-label': 'Flip', onclick: function () { board.flip(); paintEval(st.lastEval); } }, U.icon('flip')),
      h('button', { class: 'btn', type: 'button', onclick: function () { st.start = C.START_FEN; st.moves = []; go(0); } }, 'Reset'));
    var engToggle = Play.toggle('Engine', 'Shows the best line for the current position.', true, function (v) { st.engineOn = v; think(); });
    var panel = h('div', { class: 'card stack' }, engToggle, h('div', { class: 'label' }, 'Best line'), engLine, h('div', { class: 'label' }, 'Moves'), movesLine,
      h('div', { class: 'label' }, 'Position (FEN)'), fenIn,
      h('div', { class: 'row' },
        h('button', { class: 'btn small', type: 'button', onclick: loadFen }, 'Load FEN'),
        h('button', { class: 'btn small', type: 'button', onclick: function () { U.copyText(fenIn.value, fenIn).then(function (ok) { App.toast(ok ? 'FEN copied' : 'Select the text to copy it'); }); } }, U.icon('copy'), 'Copy'),
        h('button', { class: 'btn small', type: 'button', onclick: copyPgn }, 'Copy PGN')));
    root.appendChild(h('div', { class: 'arena' }, h('div', { class: 'board-col' }, h('div', { class: 'with-eval' }, evalBar, board.el), nav), h('div', { class: 'panel' }, panel)));
    function posAt(n) { var p = new C.Pos(st.start), last = null; for (var i = 0; i < n; i++) { last = p.parseMove(st.moves[i]); if (!last) break; p.make(last); } return { pos: p, last: last }; }
    function go(n) {
      n = Math.max(0, Math.min(st.moves.length, n)); st.ply = n;
      var a = posAt(n); st.pos = a.pos;
      board.setPosition(a.pos, { last: a.last, animate: true, clearLast: !a.last });
      fenIn.value = a.pos.fen();
      var sans = Explain.sanLine(new C.Pos(st.start), st.moves.slice(0, n), 999);
      movesLine.textContent = sans.length ? sans.join(' ') : 'No moves yet';
      think();
    }
    function onMove(uci) {
      st.moves = st.moves.slice(0, st.ply); st.moves.push(uci);
      U.sound.move();
      go(st.ply + 1);
    }
    function think() {
      var tok = ++st.tok;
      board.setArrows([]);
      if (!st.engineOn) { engLine.textContent = 'Engine off'; return; }
      var p = st.pos; if (!p) return;
      var status = p.status();
      if (status.over) { engLine.textContent = status.reason === 'checkmate' ? 'Checkmate' : 'Draw: ' + status.reason; paintEval({ mate: 0, winner: status.winner }); return; }
      engLine.textContent = 'Thinking…';
      Engines.analyse({ fen: st.start, moves: st.moves.slice(0, st.ply), depth: Engines.strong ? 18 : 10, movetime: 1500 }).then(function (r) {
        if (tok !== st.tok) return;
        var l = r.lines[0]; if (!l) { engLine.textContent = 'No result'; return; }
        var sideMul = p.side, cp = l.cp == null ? null : l.cp * sideMul, mate = l.mate == null ? null : l.mate * sideMul;
        st.lastEval = { cp: cp, mate: mate };
        paintEval(st.lastEval);
        var line = Explain.sanLine(p, l.pv.length ? l.pv : [r.best], 8);
        engLine.textContent = U.evalText(cp, mate) + '  ' + line.join(' ');
        if (r.best) board.setArrows([{ from: r.best.slice(0, 2), to: r.best.slice(2, 4), color: 'blue', opacity: '0.7' }]);
      });
    }
    function paintEval(e) {
      if (!e) return;
      var w = e.mate === 0 ? (e.winner === 1 ? 100 : e.winner === -1 ? 0 : 50) : e.mate != null ? (e.mate > 0 ? 100 : 0) : U.winPct(e.cp);
      var pct = board.orient === 'w' ? w : 100 - w;
      evalFill.style.height = pct + '%';
      evalFill.style.background = board.orient === 'w' ? '#F4EFE4' : '#2A2F3A';
      evalBar.style.background = board.orient === 'w' ? '#2A2F3A' : '#F4EFE4';
    }
    function loadFen() {
      var f = fenIn.value.trim(), err = C.Pos.fenError(f);
      if (err) { App.toast('That FEN isn’t valid: ' + err + '.'); return; }
      try { new C.Pos(f); } catch (e) { App.toast('That FEN isn’t valid.'); return; }
      st.start = f; st.moves = []; board.setOrientation(new C.Pos(f).side === 1 ? 'w' : 'b'); go(0);
    }
    function copyPgn() {
      var p = new C.Pos(st.start), ms = [];
      st.moves.forEach(function (u) { var m = p.parseMove(u); ms.push(m); p.make(m); });
      var pgn = C.pgnFromMoves({ Event: 'Analysis' }, st.start, ms);
      U.copyText(pgn, null).then(function (ok) { App.toast(ok ? 'PGN copied' : 'Copying isn’t allowed here'); });
    }
    st.keys = function (e) { if (e.target && /input|textarea/i.test(e.target.tagName)) return; if (e.key === 'ArrowLeft') go(st.ply - 1); else if (e.key === 'ArrowRight') go(st.ply + 1); };
    document.addEventListener('keydown', st.keys);
    go(st.ply);
  }

  App.register('train', {
    render: function (root, params) {
      var m = params && params.mode;
      if (m === 'coords') renderCoords(root);
      else if (m === 'vision') renderVision(root);
      else if (m === 'mistakes') renderMistakes(root);
      else if (m === 'analysis') renderAnalysis(root);
      else renderHub(root);
    },
    leave: function () { if (T) { clearInterval(T.timer); if (T.keys) document.removeEventListener('keydown', T.keys); T.tok = (T.tok || 0) + 1; } T = null; },
    busy: function () { return !!T; }
  });
  return { analysis: analysis };
})();
