/* Tempo trainers: coordinates, board vision, your mistakes, endgame practice, analysis board. */
var Train = (function () {
  'use strict';
  var h = U.h, C = TempoCore;
  var T = null;
  var PIECE = ['', 'pawn', 'knight', 'bishop', 'rook', 'queen', 'king'];
  var VAL = [0, 1, 3, 3, 5, 9, 100];

  function renderHub(root) {
    var S = Store.state;
    root.appendChild(h('div', { class: 'page-head' }, h('h1', null, 'Trainers')));
    var dueN = Mistakes.due().length;
    var list = h('nav', { class: 'menu-list', 'aria-label': 'Trainers', style: { maxWidth: '640px' } });
    list.appendChild(UI.menuRow('refresh', 'Your mistakes', dueN ? (dueN === 1 ? '1 position is ready to retry' : dueN + ' positions are ready to retry') : S.mistakes.items.some(function (x) { return !x.gone; }) ? 'Nothing due right now' : 'None yet',
      function () { App.go('train', { mode: 'mistakes' }); }));
    list.appendChild(UI.menuRow('target', 'Coordinates', S.puzzles.coordBest ? 'Your best is ' + S.puzzles.coordBest : null, function () { App.go('train', { mode: 'coords' }); }));
    list.appendChild(UI.menuRow('eye', 'Board vision', S.puzzles.visionBest ? 'Your best is ' + S.puzzles.visionBest + ' of 10' : null, function () { App.go('train', { mode: 'vision' }); }));
    list.appendChild(UI.menuRow('analyze', 'Analysis board', null, function () { analysis(); }));
    root.appendChild(list);
    var plays = [];
    Data.lessons().forEach(function (u) { u.lessons.forEach(function (l) { if (l.steps.some(function (s) { return s.t === 'play'; })) plays.push({ unit: u, lesson: l }); }); });
    if (plays.length) {
      root.appendChild(h('h2', { style: { margin: '32px 0 14px' } }, 'Play it out'));
      var pl = h('nav', { class: 'menu-list', 'aria-label': 'Play it out', style: { maxWidth: '640px' } });
      plays.forEach(function (x) { pl.appendChild(UI.menuRow('crown', x.lesson.title, 'From ' + x.unit.title, function () { Learn.practice(x.lesson.id); })); });
      root.appendChild(pl);
    }
  }
  function header(root, title) {
    App.focus(true);
    root.appendChild(h('button', { class: 'back', type: 'button', onclick: function () { App.go('train'); } }, U.icon('back'), 'Trainers'));
    root.appendChild(h('h1', { style: { fontSize: '26px', margin: '6px 0 12px' } }, title));
  }
  function arena(board, panel, col) {
    return h('div', { class: 'arena' }, h('div', { class: 'board-col' }, col || board.el), h('div', { class: 'panel' }, panel));
  }
  function piece(pos, sq) { return PIECE[Math.abs(pos.b[sq])] || 'piece'; }
  function fbEl(kind, text, sub) { return h('div', { class: 'feedback ' + kind }, h('div', null, text), sub ? h('div', { class: 'pz-why' }, sub) : null); }

  /* ---------- coordinates ---------- */
  function renderCoords(root) {
    header(root, 'Coordinates');
    var S = Store.state.puzzles;
    var st = { score: 0, running: false, target: null, end: 0, timer: null, orientChoice: 'w' };
    T = st;
    var board = new Board({ orient: 'w', coords: false, onSquare: onSquare });
    var card = h('div', { class: 'card stack' }), bigEl = null, scoreEl = null, timeEl = null;
    root.appendChild(arena(board, card));
    board.setPosition(empty(), { animate: false });
    idle(null);
    function empty() { var p = new C.Pos('4k3/8/8/8/8/8/8/4K3 w - - 0 1'); p.b.fill(0); return p; }
    /* before a round, and after one with its result */
    function idle(result) {
      U.clear(card);
      if (result) {
        card.appendChild(h('div', { class: 'stack', style: { gap: '6px' }, 'aria-live': 'polite' }, h('h2', null, U.plural(result.score, 'square')),
          result.best ? h('p', { class: 'muted' }, 'New best.') : S.coordBest ? h('p', { class: 'muted' }, 'Your best is ' + S.coordBest + '.') : null));
      } else {
        card.appendChild(h('p', { class: 'pz-lede' }, U.touchWords('Click each square as it’s named. You have 30 seconds.')));
        if (S.coordBest) card.appendChild(h('div', { class: 'faint small' }, 'Your best is ' + S.coordBest + '.'));
      }
      card.appendChild(Play.seg([['w', 'White side'], ['b', 'Black side'], ['r', 'Random']], st.orientChoice, function (v) { st.orientChoice = v; }));
      card.appendChild(h('button', { class: 'btn primary block', type: 'button', onclick: begin }, result ? 'Play again' : 'Start'));
    }
    function begin() {
      st.score = 0; st.running = true; st.end = Date.now() + 30000; st.target = null;
      var o = st.orientChoice || 'w'; board.setOrientation(o === 'r' ? (Math.random() < 0.5 ? 'w' : 'b') : o);
      board.clearDecor();
      U.clear(card);
      bigEl = h('div', { class: 'tr-big', 'aria-live': 'assertive' });
      scoreEl = h('b', null, '0'); timeEl = h('b', null, '30');
      card.appendChild(h('div', { class: 'label tr-label' }, 'Find'));
      card.appendChild(bigEl);
      card.appendChild(h('div', { class: 'row between' }, h('div', { class: 'stat' }, h('span', { class: 'label' }, 'Score'), scoreEl),
        h('div', { class: 'stat', style: { textAlign: 'right' } }, h('span', { class: 'label' }, 'Time'), timeEl)));
      newTarget();
      clearInterval(st.timer);
      st.timer = setInterval(function () {
        if (T !== st) { clearInterval(st.timer); return; }
        var left = st.end - Date.now();
        timeEl.textContent = String(Math.max(0, Math.ceil(left / 1000)));
        if (left <= 0) stop();
      }, 100);
    }
    function stop() {
      clearInterval(st.timer); st.running = false;
      var best = st.score > (S.coordBest || 0);
      if (best) { S.coordBest = st.score; Store.touch('puzzles'); }
      Store.activity('p');
      board.clearDecor();
      idle({ score: st.score, best: best });
    }
    function newTarget() {
      var t;
      do { t = 'abcdefgh'.charAt(Math.floor(Math.random() * 8)) + (1 + Math.floor(Math.random() * 8)); } while (t === st.target);
      st.target = t; bigEl.textContent = t;
    }
    function onSquare(name) {
      if (!st.running) return;
      if (name === st.target) { st.score++; U.sound.tick(); scoreEl.textContent = String(st.score); board.setMarks([{ sq: name, kind: 'green' }]); newTarget(); }
      else { U.sound.bad(); board.setMarks([{ sq: name, kind: 'red' }, { sq: st.target, kind: 'ring' }]); }
    }
  }

  /* ---------- board vision ---------- */
  /* captures of the piece on sq by the side to move */
  function capturesOf(pos, sq) { return pos.legalMoves().filter(function (m) { return ((m >> 7) & 127) === sq; }); }
  function times(n) { return n === 1 ? 'once' : n === 2 ? 'twice' : n + ' times'; }
  /* pieces of side `by` that can take part in an exchange on sq, counting the ones lined up behind others */
  function exchangers(pos, sq, by) {
    var b = { b: Int8Array.from(pos.b) }, n = 0;
    for (var round = 0; round < 8; round++) {
      var list = pos.attackersOf.call(b, sq, by);
      if (!list.length) break;
      n += list.length;
      list.forEach(function (s) { b.b[s] = 0; });
    }
    return n;
  }
  /* why the piece on sq can be won */
  function winWhy(pos, sq) {
    var v = pos.b[sq], t = Math.abs(v), owner = v > 0 ? 1 : -1, name = 'The ' + PIECE[t] + ' on ' + C.sqName(sq);
    var caps = capturesOf(pos, sq), defenders = pos.attackersOf(sq, owner).length;
    if (!caps.length) return name + ' can be won.';
    if (!defenders) return name + ' has no defender.';
    var cheapest = 6;
    caps.forEach(function (m) { var x = Math.abs(pos.b[m & 127]); if (VAL[x] < VAL[cheapest]) cheapest = x; });
    if (VAL[cheapest] < VAL[t]) return name + ' can be taken by your ' + PIECE[cheapest] + ', which is worth less.';
    var a = exchangers(pos, sq, pos.side), d = exchangers(pos, sq, owner);
    if (a > d) return name + ' is attacked ' + times(a) + ' and defended only ' + times(d) + '.';
    return name + ' can be won: the trades on ' + C.sqName(sq) + ' come out in your favor.';
  }
  /* why a picked piece can't be won */
  function notWhy(pos, sq) {
    var t = Math.abs(pos.b[sq]), name = 'The ' + PIECE[t] + ' on ' + C.sqName(sq);
    if (t === 6) return 'The king can’t be captured.';
    if (!capturesOf(pos, sq).length) return name + ' isn’t attacked.';
    return name + ' is defended, so taking it doesn’t win anything.';
  }
  function renderVision(root) {
    header(root, 'Board vision');
    var st = { round: 0, score: 0, picked: [], answer: [], checked: false, pos: null };
    T = st;
    var board = new Board({ orient: 'w', coords: Store.state.settings.coords !== false, onSquare: onSquare });
    var text = h('div', { class: 'lesson-text' }), fbBox = h('div', { class: 'stack', style: { gap: '10px' }, 'aria-live': 'polite' }), actions = h('div', { class: 'row' }), meta = h('div', { class: 'faint small' });
    root.appendChild(arena(board, h('div', { class: 'card stack' }, meta, text, fbBox, actions)));
    var pool = null;
    text.appendChild(h('div', { class: 'muted' }, 'Loading…'));
    Data.puzzles().then(function (list) {
      if (T !== st) return;
      var r = Store.state.puzzles.rating;
      pool = list.filter(function (p) { return Math.abs(p.rating - r) < 500; });
      if (pool.length < 50) pool = list;
      nextRound();
    }, function () { U.clear(text); text.appendChild(h('p', { class: 'muted' }, 'The puzzles couldn’t be loaded in this browser.')); });
    function enemy() { return st.pos.side === 1 ? 'black' : 'white'; }
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
      text.appendChild(h('p', { style: { marginTop: '8px' } }, U.touchWords('Click every ' + enemy() + ' piece you could win right now: one with no defender, or one you can take with a cheaper piece.')));
      actions.appendChild(h('button', { class: 'btn primary', type: 'button', onclick: check }, 'Check'));
    }
    function onSquare(name) {
      if (st.checked || !st.pos) return;
      var v = st.pos.b[C.sqIndex(name)];
      if (!v || (v > 0 ? 1 : -1) === st.pos.side) {
        U.clear(fbBox); fbBox.appendChild(h('p', { class: 'muted small' }, 'Pick ' + enemy() + ' pieces only.'));
        return;
      }
      U.clear(fbBox);
      var k = st.picked.indexOf(name);
      if (k >= 0) st.picked.splice(k, 1); else st.picked.push(name);
      board.setPicked(st.picked);
    }
    function check() {
      if (st.checked) return;
      st.checked = true;
      var ok = st.picked.slice().sort().join() === st.answer.slice().sort().join();
      if (ok) { st.score++; U.sound.good(); } else U.sound.bad();
      var wrongPicks = st.picked.filter(function (q) { return st.answer.indexOf(q) < 0; });
      board.setPicked([]);
      board.setMarks(st.answer.map(function (q) { return { sq: q, kind: 'green' }; }).concat(wrongPicks.map(function (q) { return { sq: q, kind: 'red' }; })));
      U.clear(fbBox);
      fbBox.appendChild(fbEl(ok ? 'ok' : 'no', ok ? 'Exactly right.' : 'The green squares were the ones to win.'));
      var why = h('ul', { class: 'why-list' });
      st.answer.forEach(function (q) {
        var found = st.picked.indexOf(q) >= 0;
        why.appendChild(h('li', { class: found ? 'ok' : 'miss' }, U.icon(found ? 'check' : 'target'), h('span', null, winWhy(st.pos, C.sqIndex(q)))));
      });
      wrongPicks.forEach(function (q) { why.appendChild(h('li', { class: 'no' }, U.icon('close'), h('span', null, notWhy(st.pos, C.sqIndex(q))))); });
      fbBox.appendChild(why);
      U.clear(actions);
      actions.appendChild(h('button', { class: 'btn primary', type: 'button', onclick: nextRound }, st.round >= 10 ? 'See your score' : 'Next'));
    }
    function finish() {
      U.clear(text); U.clear(fbBox); U.clear(actions);
      board.clearDecor();
      text.appendChild(h('h2', null, st.score + ' of 10'));
      var S = Store.state.puzzles;
      if (st.score > (S.visionBest || 0)) { S.visionBest = st.score; Store.touch('puzzles'); text.appendChild(h('p', { class: 'muted' }, 'New best.')); }
      else if (S.visionBest) text.appendChild(h('p', { class: 'muted' }, 'Your best is ' + S.visionBest + ' of 10.'));
      Store.activity('p');
      meta.textContent = '';
      actions.appendChild(h('button', { class: 'btn primary', type: 'button', onclick: function () { App.go('train', { mode: 'vision' }, { replace: true }); } }, 'Play again'));
      actions.appendChild(h('button', { class: 'btn', type: 'button', onclick: function () { App.go('train'); } }, 'Done'));
    }
  }

  /* ---------- your mistakes ---------- */
  /* "From your loss to Theo on Oct 28.", when the game is still stored */
  function gameLine(it) {
    var m = /^g(.+)-(\d+)$/.exec(it.id || ''); if (!m) return null;
    var g = Store.state.games.list.filter(function (x) { return x.id === m[1]; })[0];
    if (!g) return null;
    var bot = TempoBots.byId(g.bot), who = bot ? bot.name : 'your opponent';
    var word = g.result === '1/2-1/2' ? 'draw with ' : g.result === '1-0' || g.result === '0-1' ? (((g.result === '1-0') === (g.color === 'w')) ? 'win over ' : 'loss to ') : 'game against ';
    return 'From your ' + word + who + (g.ts ? ' on ' + U.dateShort(g.ts) : '') + '.';
  }
  var KIND_WORDS = { blunder: ', a blunder', mistake: ', a mistake', miss: ' and let your opponent off the hook' };
  /* Explain's sentence about a move, in the present tense, for a move just played */
  function nowTense(t, playedSan) {
    return t.replace(/ was checkmate\.$/, ' is checkmate.').replace(/ started a forced checkmate\.$/, ' starts a forced checkmate.').replace(/ was stronger\.$/, ' is stronger than ' + playedSan + '.');
  }
  /* "It wins a pawn." from "Nf3 wins a pawn.", or null when there's nothing to add */
  function itTense(t, san) {
    if (!t || t.indexOf(san + ' ') !== 0) return null;
    var rest = t.slice(san.length + 1);
    if (/^was stronger/.test(rest)) return null;
    rest = rest.replace(/^was checkmate/, 'is checkmate').replace(/^started /, 'starts ');
    return (/^is /.test(rest) ? 'It’s ' + rest.slice(3) : 'It ' + rest);
  }
  function renderMistakes(root) {
    header(root, 'Your mistakes');
    var items = Mistakes.due();
    var all = Store.state.mistakes.items.filter(function (x) { return !x.gone; }); // a re-review can retire a position
    if (!items.length) items = all.slice().sort(function (a, b) { return a.due - b.due; }).slice(0, 10);
    if (!items.length) { root.appendChild(h('div', { class: 'empty' }, 'Review a game first. Positions where you went wrong are collected here.', h('div', { style: { marginTop: '12px' } }, h('button', { class: 'btn primary', type: 'button', onclick: function () { App.go('review'); } }, 'Review a game')))); return; }
    var st = { k: 0, list: items.slice(0, 12), right: 0, tok: 0 };
    T = st;
    var board = new Board({ orient: 'w', coords: Store.state.settings.coords !== false, autoQueen: false, onMove: onMove });
    var meta = h('div', { class: 'faint small' }), text = h('div', { class: 'lesson-text' }), fbBox = h('div', { 'aria-live': 'polite' }), actions = h('div', { class: 'row' });
    root.appendChild(arena(board, h('div', { class: 'card stack' }, meta, text, fbBox, actions)));
    function side() { return st.pos.side === 1 ? 'w' : 'b'; }
    function feedback(kind, t, sub) { U.clear(fbBox); fbBox.appendChild(fbEl(kind, t, sub)); }
    function show() {
      if (st.k >= st.list.length) return done();
      st.tok++;
      var it = st.list[st.k];
      st.pos = new C.Pos(it.fen); st.item = it; st.tries = 0; st.graded = false; st.over = false; st.hint = 0; st.hintAt = 0; st.hinted = false;
      board.setOrientation(side());
      board.setMovable(side());
      board.setPosition(st.pos, { animate: false, clearLast: true });
      board.clearDecor();
      var played = st.pos.parseMove(it.played);
      st.playedSan = played ? st.pos.san(played) : it.played;
      U.clear(text); U.clear(fbBox); U.clear(actions);
      meta.textContent = (st.k + 1) + ' of ' + st.list.length;
      var from = gameLine(it);
      if (from) text.appendChild(h('p', { class: 'muted small', style: { marginBottom: '8px' } }, from));
      text.appendChild(UI.turnPill(st.pos.side));
      text.appendChild(h('p', { style: { marginTop: '8px' } }, 'On move ' + st.pos.full + ' you played ' + st.playedSan + (KIND_WORDS[it.kind] || '') + '. Find something better.'));
      tools();
    }
    function tools() {
      U.clear(actions);
      actions.appendChild(h('button', { class: 'btn small', type: 'button', disabled: st.hint >= 2, onclick: hint }, U.icon('hint'), 'Hint'));
      actions.appendChild(h('button', { class: 'btn small quiet', type: 'button', onclick: reveal }, 'Show the answer'));
    }
    function nextBtn() {
      U.clear(actions);
      actions.appendChild(h('button', { class: 'btn primary', type: 'button', onclick: function () { st.k++; show(); } }, st.k + 1 >= st.list.length ? 'Finish' : 'Next'));
    }
    function grade(ok) { if (st.graded) return; st.graded = true; Mistakes.grade(st.item, ok); }
    function onMove(uci, m) {
      if (st.over) return;
      var it = st.item, after = st.pos.clone(); after.make(m);
      var tok = ++st.tok;
      board.setMovable(null);
      board.setArrows([]); board.setMarks([]);
      board.setPosition(after, { last: m, animate: false });
      if (uci === it.best || after.status().reason === 'checkmate') return right(uci, m, null);
      feedback('info', 'Checking your move…');
      var depth = Engines.strong ? 13 : 8;
      Engines.analyse({ fen: st.pos.fen(), depth: depth, movetime: 800 }).then(function (r0) {
        if (tok !== st.tok) return;
        return Engines.analyse({ fen: after.fen(), depth: depth, movetime: 800 }).then(function (r1) {
          if (tok !== st.tok) return;
          var b = r0 && r0.lines[0], a = r1 && r1.lines[0];
          if (!b || !a) { wrong(null, m); return; }
          var wb = b.mate != null ? (b.mate > 0 ? 100 : 0) : U.winPct(b.cp);
          var wa = 100 - (a.mate != null ? (a.mate > 0 ? 100 : 0) : U.winPct(a.cp));
          if (wb - wa <= 4) right(uci, m, a); else wrong(a, m);
        });
      }).catch(function () { if (tok === st.tok) wrong(null, m); });
    }
    /* reply: the engine's line after the move, from the opponent's side, when we have it */
    function right(uci, m, reply) {
      if (st.over) return;
      st.over = true;
      U.sound.good(); st.right++;
      grade(!st.tries && !st.hinted);
      var san = st.pos.san(m), tok = st.tok, before = st.pos;
      function say(line) { feedback('ok', 'That’s it. ' + nowTense(Explain.missedInfo(before, uci, line).text, st.playedSan)); }
      var after = before.clone(); after.make(m);
      if (after.status().reason === 'checkmate') feedback('ok', 'That’s it. ' + san + ' is checkmate.');
      else if (reply) say({ pv: [uci].concat(reply.pv || []), mate: reply.mate != null && reply.mate < 0 ? 1 - reply.mate : null });
      else {
        feedback('ok', 'That’s it.');
        Engines.analyse({ fen: before.fen(), depth: Engines.strong ? 12 : 8, movetime: 700 }).then(function (r) {
          if (tok !== st.tok) return;
          var l = r && r.lines[0];
          say(l && l.pv && l.pv[0] === uci ? l : null);
        }, function () { /* the reason is a bonus */ });
      }
      nextBtn();
    }
    function wrong(line, m) {
      if (st.over) return;
      U.sound.bad(); st.tries++;
      var why = line && m ? Explain.bad(st.pos, m, line, st.item.best) : null;
      feedback('no', 'Not this one. Try again.', why ? why.text : null);
      var tok = st.tok;
      setTimeout(function () {
        if (tok !== st.tok || st.over || T !== st) return;
        board.setPosition(st.pos, { animate: true, clearLast: true });
        board.setMovable(side());
        showHint();
      }, 700);
    }
    /* the hint stays on the board until the position is solved */
    function showHint() {
      if (!st.hint) return;
      var u = st.item.best;
      board.setMarks([{ sq: u.slice(0, 2), kind: 'hint' }]);
      board.setArrows(st.hint >= 2 ? [{ from: u.slice(0, 2), to: u.slice(2, 4), color: 'green' }] : []);
    }
    function hint() {
      if (st.over || !board.canMove()) return;
      var now = Date.now();
      if (st.hint >= 2 || now - st.hintAt < 450) return;
      st.hintAt = now; st.hint++; st.hinted = true;
      var u = st.item.best, from = u.slice(0, 2), bm = st.pos.parseMove(u);
      showHint();
      if (st.hint === 1) feedback('info', 'Look at your ' + piece(st.pos, C.sqIndex(from)) + ' on ' + from + '.');
      else feedback('info', 'Play ' + (bm ? st.pos.san(bm) : u) + '.');
      tools();
    }
    function reveal() {
      if (st.over) return;
      st.over = true; st.tok++;
      grade(false);
      board.setMovable(null);
      board.setPosition(st.pos, { animate: true, clearLast: true });
      var best = st.item.best, bm = st.pos.parseMove(best), san = bm ? st.pos.san(bm) : best, before = st.pos, tok = st.tok;
      board.setMarks([]);
      board.setArrows(bm ? [{ from: best.slice(0, 2), to: best.slice(2, 4), color: 'green' }] : []);
      nextBtn();
      if (!bm) { feedback('info', 'The better move was ' + san + '.'); return; }
      var after = before.clone(); after.make(bm);
      if (after.status().reason === 'checkmate') { answer({ text: san + ' was checkmate.', topic: 'mates' }); return; }
      answer(Explain.missedInfo(before, best, null));
      // the engine's line can say more: a fork, or a forced mate
      Engines.analyse({ fen: before.fen(), depth: Engines.strong ? 12 : 8, movetime: 700 }).then(function (r) {
        var l = r && r.lines[0];
        if (tok !== st.tok || T !== st || !l || !l.pv || l.pv[0] !== best) return;
        answer(Explain.missedInfo(before, best, l));
      }, function () { /* the first reason stands */ });
      function answer(info) {
        var more = itTense(info.text, san);
        feedback('info', 'The better move was ' + san + '.' + (more ? ' ' + more : ''));
        var row = info.topic ? Explain.studyRow(info.topic) : null;
        if (row) fbBox.appendChild(row);
      }
    }
    function done() {
      st.tok++;
      U.clear(text); U.clear(fbBox); U.clear(actions);
      board.setMovable(null); board.clearDecor();
      meta.textContent = '';
      text.appendChild(h('h2', null, st.right + ' of ' + st.list.length + ' right'));
      text.appendChild(h('p', { class: 'muted' }, 'Misses come back in a few hours, and the ones you got right in a day or more.'));
      Store.activity('p');
      actions.appendChild(h('button', { class: 'btn primary', type: 'button', onclick: function () { App.go('train'); } }, 'Done'));
    }
    show();
  }

  /* ---------- analysis board ---------- */
  function analysis(fen, moves, ply) {
    var params = { mode: 'analysis' };
    if (fen) { params.fen = fen; params.moves = moves || []; if (ply != null) params.ply = ply; }
    App.go('train', params);
  }
  /* the score in plain words; cp and mate are from White's side */
  function evalWords(cp, mate) {
    if (mate != null && mate !== 0) { var n = Math.abs(mate); return (mate > 0 ? 'White' : 'Black') + ' can force checkmate in ' + n + (n === 1 ? ' move' : ' moves') + '.'; }
    var a = Math.abs(cp || 0) / 100, who = cp > 0 ? 'White' : 'Black';
    if (a < 0.3) return 'The position is about equal.';
    if (a < 0.7) return who + ' is slightly better.';
    if (a < 1.5) return who + ' is ahead by about a pawn.';
    if (a < 2.5) return who + ' is ahead by about two pawns.';
    if (a < 4) return who + ' is ahead by about a knight or bishop.';
    if (a < 6.5) return who + ' is ahead by about a rook.';
    return who + ' is winning.';
  }
  /* SAN moves numbered from a position: "12. Nf3 Nc6 13. Bb5" or "12... Nc6 13. Bb5" */
  function numbered(pos, sans) {
    var full = pos.full, white = pos.side === 1, out = [];
    sans.forEach(function (s, i) {
      var w = (i % 2 === 0) === white;
      if (w) out.push(full + '.'); else if (i === 0) out.push(full + '...');
      out.push(s);
      if (!w) full++;
    });
    return out.join(' ');
  }
  var FEN_WORDS = [[/^missing side to move$/, 'it doesn’t say whose move it is'], [/^needs 8 ranks$/, 'it needs 8 ranks, separated by /'],
    [/^rank (\d) does not have 8 squares$/, 'rank $1 doesn’t add up to 8 squares'], [/^unknown character (.*)$/, '“$1” isn’t a piece or a number'],
    [/^pawn on first or last rank$/, 'a pawn can’t stand on the first or last rank'], [/^side to move must be w or b$/, 'the side to move must be w or b']];
  /* null when a pasted position could come up in a game, else the reason in plain words */
  function fenProblem(f) {
    var err = typeof C.validFen === 'function' ? C.validFen(f) : localFenCheck(f);
    if (!err) { try { new C.Pos(f); } catch (e) { err = 'it can’t be read'; } }
    if (!err) return null;
    FEN_WORDS.forEach(function (x) { err = err.replace(x[0], x[1]); });
    return err;
  }
  function localFenCheck(f) {
    var err = C.Pos.fenError(f); if (err) return err;
    var p; try { p = new C.Pos(f); } catch (e) { return 'it can’t be read'; }
    if (Math.abs((p.wk >> 4) - (p.bk >> 4)) <= 1 && Math.abs((p.wk & 7) - (p.bk & 7)) <= 1) return 'the kings are next to each other';
    if (p.isAttacked(p.side === 1 ? p.bk : p.wk, p.side)) return p.side === 1 ? 'Black is in check, but it’s White’s turn' : 'White is in check, but it’s Black’s turn';
    return null;
  }
  function renderAnalysis(root, params) {
    header(root, 'Analysis board');
    var seed = { fen: C.START_FEN, moves: [] };
    if (params && typeof params.fen === 'string' && !(C.validFen ? C.validFen(params.fen) : C.Pos.fenError(params.fen))) seed = { fen: params.fen, moves: Array.isArray(params.moves) ? params.moves.slice() : [], ply: params.ply };
    var st = { start: seed.fen, moves: seed.moves, ply: seed.ply != null ? seed.ply : seed.moves.length, engineOn: true, tok: 0, thinkT: null, lastEval: null, pos: null };
    T = st;
    var startSide = new C.Pos(seed.fen).side * (st.ply % 2 ? -1 : 1);
    var board = new Board({ orient: startSide === 1 ? 'w' : 'b', coords: Store.state.settings.coords !== false, movable: 'both', onMove: onMove });
    var evalFill = h('i', { style: { height: '50%' } }), evalBar = h('div', { class: 'evalbar' }, evalFill);
    var evalLine = h('div', { class: 'tr-eval', 'aria-live': 'polite' }), engLine = h('div', { class: 'small' }), movesLine = h('div', { class: 'small tr-moves' });
    var input = h('textarea', { id: 'an-fen', class: 'tr-input', rows: '3', spellcheck: 'false', autocomplete: 'off', autocapitalize: 'off', placeholder: 'Paste a FEN, a PGN or a list of moves' });
    var msg = h('div', { class: 'small', role: 'status' });
    var nav = h('div', { class: 'controls' },
      h('button', { class: 'btn icon-only', type: 'button', 'aria-label': 'Back', 'data-repeat': '', onclick: function () { go(st.ply - 1); } }, U.icon('back')),
      h('button', { class: 'btn icon-only', type: 'button', 'aria-label': 'Forward', 'data-repeat': '', onclick: function () { go(st.ply + 1); } }, U.icon('next')),
      h('button', { class: 'btn icon-only', type: 'button', 'aria-label': 'Flip the board', onclick: function () { board.flip(); paintEval(st.lastEval); } }, U.icon('flip')),
      h('button', { class: 'btn', type: 'button', onclick: function () { st.start = C.START_FEN; st.moves = []; note(''); go(0); } }, 'Reset'));
    var engToggle = Play.toggle('Engine', null, true, function (v) { st.engineOn = v; think(); });
    var bestBox = h('div', null, h('div', { class: 'label' }, 'Best line'), engLine);
    var panel = h('div', { class: 'card stack' }, engToggle, evalLine, bestBox,
      h('div', null, h('div', { class: 'label' }, 'Moves'), movesLine),
      h('div', { class: 'stack', style: { gap: '8px' } }, h('label', { class: 'label', for: 'an-fen' }, 'Position or game'), input, msg,
        h('div', { class: 'row' },
          h('button', { class: 'btn small', type: 'button', onclick: load }, 'Load'),
          h('button', { class: 'btn small', type: 'button', onclick: function () { U.copyText(st.pos.fen(), input).then(function (ok) { App.toast(ok ? 'FEN copied' : 'Select the text to copy it'); }); } }, U.icon('copy'), 'Copy FEN'),
          h('button', { class: 'btn small', type: 'button', onclick: copyPgn }, 'Copy PGN'))));
    root.appendChild(arena(board, panel, [h('div', { class: 'with-eval' }, evalBar, board.el), nav]));
    function posAt(n) { var p = new C.Pos(st.start), last = null; for (var i = 0; i < n; i++) { var m = p.parseMove(st.moves[i]); if (!m) break; last = m; p.make(m); } return { pos: p, last: last }; }
    function go(n, jump) {
      n = Math.max(0, Math.min(st.moves.length, n)); st.ply = n;
      var a = posAt(n); st.pos = a.pos;
      board.setPosition(a.pos, { last: a.last, animate: !jump, clearLast: !a.last });
      input.value = a.pos.fen();
      renderMoves();
      think();
    }
    function renderMoves() {
      U.clear(movesLine);
      var p = new C.Pos(st.start), n = 0;
      for (var i = 0; i < st.moves.length; i++) {
        var m = p.parseMove(st.moves[i]); if (!m) break;
        var num = p.side === 1 ? p.full + '. ' : i === 0 ? p.full + '... ' : '';
        movesLine.appendChild(h('span', { class: i < st.ply ? null : 'later' }, num + p.san(m)));
        movesLine.appendChild(document.createTextNode(' '));
        p.make(m); n++;
      }
      if (!n) movesLine.textContent = 'No moves yet';
    }
    function onMove(uci) {
      st.moves = st.moves.slice(0, st.ply); st.moves.push(uci);
      U.sound.move();
      go(st.ply + 1);
    }
    function think() {
      var tok = ++st.tok, p = st.pos;
      clearTimeout(st.thinkT);
      board.setArrows([]);
      if (!st.engineOn) { evalLine.textContent = 'Engine off'; bestBox.hidden = true; return; }
      bestBox.hidden = false;
      if (!p) return;
      var status = p.status();
      if (status.over) {
        evalLine.textContent = status.reason === 'checkmate' ? 'Checkmate. ' + (status.winner === 1 ? 'White' : 'Black') + ' has won.' : status.reason === 'stalemate' ? 'Stalemate. It’s a draw.' : 'It’s a draw by ' + status.reason + '.';
        engLine.textContent = '';
        paintEval({ mate: 0, winner: status.winner });
        return;
      }
      evalLine.textContent = 'Thinking…';
      // wait for the board to settle, so stepping quickly doesn't queue up searches
      st.thinkT = setTimeout(function () {
        if (tok !== st.tok) return;
        Engines.analyse({ fen: st.start, moves: st.moves.slice(0, st.ply), depth: Engines.strong ? 18 : 10, movetime: 1500 }).then(function (r) {
          if (tok !== st.tok || T !== st) return;
          var l = r && r.lines[0]; if (!l) { evalLine.textContent = 'The engine didn’t answer. Make a move to try again.'; return; }
          var sideMul = p.side, cp = l.cp == null ? null : l.cp * sideMul, mate = l.mate == null ? null : l.mate * sideMul;
          st.lastEval = { cp: cp, mate: mate };
          paintEval(st.lastEval);
          U.clear(evalLine);
          evalLine.appendChild(h('b', null, U.evalText(cp, mate)));
          evalLine.appendChild(document.createTextNode(': ' + evalWords(cp, mate)));
          engLine.textContent = numbered(p, Explain.sanLine(p, l.pv.length ? l.pv : [r.best], 8));
          if (r.best) board.setArrows([{ from: r.best.slice(0, 2), to: r.best.slice(2, 4), color: 'green', opacity: '0.75' }]);
        });
      }, 250);
    }
    function paintEval(e) {
      if (!e) return;
      var w = e.mate === 0 ? (e.winner === 1 ? 100 : e.winner === -1 ? 0 : 50) : e.mate != null ? (e.mate > 0 ? 100 : 0) : U.winPct(e.cp);
      var pct = board.orient === 'w' ? w : 100 - w;
      evalFill.style.height = pct + '%';
      evalFill.style.background = board.orient === 'w' ? '#F4EFE4' : '#2A2F3A';
      evalBar.style.background = board.orient === 'w' ? '#2A2F3A' : '#F4EFE4';
    }
    function note(text, bad) { msg.textContent = text; msg.style.color = bad ? 'var(--coral)' : 'var(--ink-2)'; }
    /* the box takes a FEN, a PGN or a plain list of moves */
    function load() {
      var text = input.value.trim(), err;
      if (!text) { note('Paste a FEN, a PGN or a list of moves first.', true); return; }
      if (text.split(/\s+/)[0].indexOf('/') >= 0 && text.charAt(0) !== '[') {
        var f = text.split(/\s+/).length === 1 ? text + ' w - - 0 1' : text;
        err = fenProblem(f);
        if (err) { note('That FEN isn’t valid: ' + err + '.', true); return; }
        var p0 = new C.Pos(f);
        st.start = p0.fen(); st.moves = [];
        board.setOrientation(p0.side === 1 ? 'w' : 'b');
        note('Position loaded.');
        input.blur();
        go(0, true);
        return;
      }
      var g = C.parsePgn(text), fen = g.headers.FEN || C.START_FEN;
      if (g.headers.FEN && (err = fenProblem(fen))) { note('The game’s starting position isn’t valid: ' + err + '.', true); return; }
      if (!g.sans.length) {
        if (!g.headers.FEN) { note('That doesn’t look like a FEN, a PGN or a list of moves.', true); return; }
        st.start = new C.Pos(fen).fen(); st.moves = []; note('Position loaded.'); input.blur(); go(0, true); return;
      }
      var r = C.replay(fen, g.sans), at = new C.Pos(fen);
      r.moves.forEach(function (m) { at.make(m); });
      var bad = r.error ? at.full + (at.side === 1 ? '. ' : '... ') + g.sans[r.moves.length] : null;
      if (!r.moves.length) { note('That game couldn’t be loaded: ' + bad + ' isn’t a legal move there.', true); return; }
      st.start = new C.Pos(fen).fen(); st.moves = r.moves.map(C.uci);
      note(bad ? 'Loaded the moves before ' + bad + ', which isn’t legal there.' : 'Game loaded.', !!bad);
      input.blur();
      go(st.moves.length, true);
    }
    function copyPgn() {
      var p = new C.Pos(st.start), ms = [];
      for (var i = 0; i < st.moves.length; i++) { var m = p.parseMove(st.moves[i]); if (!m) break; ms.push(m); p.make(m); }
      var pgn = C.pgnFromMoves({ Event: 'Analysis' }, st.start, ms);
      U.copyText(pgn, null).then(function (ok) { App.toast(ok ? 'PGN copied' : 'Copying isn’t allowed here'); });
    }
    st.keys = function (e) { if (e.target && /input|textarea|select/i.test(e.target.tagName)) return; if (e.key === 'ArrowLeft') go(st.ply - 1); else if (e.key === 'ArrowRight') go(st.ply + 1); };
    document.addEventListener('keydown', st.keys);
    go(st.ply, true);
  }

  App.register('train', {
    render: function (root, params) {
      var m = params && params.mode;
      if (m === 'coords') renderCoords(root);
      else if (m === 'vision') renderVision(root);
      else if (m === 'mistakes') renderMistakes(root);
      else if (m === 'analysis') renderAnalysis(root, params);
      else renderHub(root);
    },
    leave: function () {
      if (T) { clearInterval(T.timer); clearTimeout(T.thinkT); if (T.keys) document.removeEventListener('keydown', T.keys); T.tok = (T.tok || 0) + 1; }
      T = null;
    },
    busy: function () { return !!T; }
  });
  return { analysis: analysis, evalWords: evalWords, winWhy: winWhy, notWhy: notWhy };
})();
