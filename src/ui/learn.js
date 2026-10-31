/* Tempo learn: units, lessons and the interactive lesson player. */
var Learn = (function () {
  'use strict';
  var h = U.h, C = TempoCore;
  var L = null; // active lesson state

  function done(id) { return Store.state.learn.done[id]; }
  function nextLesson() {
    var units = Data.lessons();
    for (var i = 0; i < units.length; i++) for (var j = 0; j < units[i].lessons.length; j++) {
      if (!done(units[i].lessons[j].id)) return { unit: units[i], lesson: units[i].lessons[j] };
    }
    return null;
  }
  function open(id) { App.go('learn', { lesson: id }); }

  function renderUnits(root) {
    var units = Data.lessons(), total = 0, finished = 0;
    units.forEach(function (u) { u.lessons.forEach(function (l) { total++; if (done(l.id)) finished++; }); });
    root.appendChild(h('div', { class: 'page-head' }, h('h1', null, 'Learn'),
      h('div', { class: 'head-note' }, h('b', { class: 'num' }, finished + ' of ' + total), ' lessons done')));
    var nx = nextLesson();
    if (nx) root.appendChild(h('div', { class: 'resume', style: { marginBottom: '20px' } },
      h('p', { class: 'grow' }, h('b', null, 'Up next: ' + nx.lesson.title + '. '), h('span', { class: 'muted' }, nx.lesson.summary)),
      h('button', { class: 'btn primary small', type: 'button', onclick: function () { open(nx.lesson.id); } }, finished ? 'Continue' : 'Start')));
    if (!units.length) root.appendChild(h('div', { class: 'empty' }, 'Lessons are missing from this build.'));
    var col = h('div', { class: 'stack', style: { gap: '12px' } });
    units.forEach(function (u, ui) {
      var n = u.lessons.filter(function (l) { return done(l.id); }).length, all = n === u.lessons.length;
      // the unit you're working through starts open; any unit stays the way you left it while the app is open
      var isOpen = openUnits[u.id] != null ? openUnits[u.id] : !!(nx && nx.unit.id === u.id);
      var card = h('div', { class: 'card unit-card' });
      var body = h('div', { class: 'unit-body', id: 'unit-' + u.id });
      body.hidden = !isOpen;
      var head = h('button', { class: 'unit-head', type: 'button', 'aria-expanded': isOpen ? 'true' : 'false', 'aria-controls': 'unit-' + u.id,
        onclick: function () { var on = body.hidden; body.hidden = !on; head.setAttribute('aria-expanded', on ? 'true' : 'false'); openUnits[u.id] = on; } },
        h('span', { class: 'unit-num' + (all ? ' done' : '') }, all ? U.icon('check') : String(ui + 1)),
        h('span', { class: 'txt' }, h('span', { class: 't' }, u.title),
          h('span', { class: 's' }, all ? 'All ' + u.lessons.length + ' lessons done' : n ? n + ' of ' + u.lessons.length + ' lessons done' : U.plural(u.lessons.length, 'lesson'))),
        U.icon('next', 'chev'));
      card.appendChild(head);
      body.appendChild(h('p', { class: 'muted', style: { margin: '0 0 10px' } }, u.summary));
      if (n && !all) body.appendChild(h('div', { style: { margin: '0 0 6px' } }, UI.meter(n / u.lessons.length, 'green')));
      var list = h('div', { class: 'list' });
      u.lessons.forEach(function (l) {
        var d = done(l.id);
        list.appendChild(h('button', { class: 'list-row lesson-row', type: 'button', onclick: function () { open(l.id); } },
          h('span', { class: 'tick' + (d ? ' done' : '') }, d ? U.icon('check') : null),
          h('div', { class: 'grow' }, h('div', { style: { fontWeight: 600 } }, l.title), h('div', { class: 'muted small' }, l.summary)),
          d ? UI.stars(d.stars) : h('span', { class: 'faint small' }, l.steps.length + ' steps')));
      });
      body.appendChild(list);
      card.appendChild(body);
      col.appendChild(card);
    });
    root.appendChild(col);
  }
  var openUnits = {};

  /* ---------- lesson player ---------- */
  function renderLesson(root, id) {
    var found = Data.lesson(id);
    if (!found) { renderUnits(root); return; }
    App.focus(true);
    var lesson = found.lesson, unit = found.unit;
    var st = { i: 0, mistakes: 0, hints: 0, token: 0, board: null, id: id };
    L = st;
    var stepper = h('div', { class: 'stepper', 'aria-hidden': 'true' });
    lesson.steps.forEach(function () { stepper.appendChild(h('i')); });
    root.appendChild(h('div', { class: 'row between', style: { marginBottom: '8px' } },
      h('button', { class: 'back', type: 'button', onclick: function () { App.go('learn'); } }, U.icon('back'), 'Learn'),
      h('span', { class: 'muted small' }, unit.title)));
    root.appendChild(h('h1', { style: { fontSize: '26px', marginBottom: '10px' } }, lesson.title));
    root.appendChild(stepper);
    var board = new Board({ orient: 'w', coords: Store.state.settings.coords !== false, onMove: onMove, onSquare: null, autoQueen: false });
    st.board = board;
    var textBox = h('div', { class: 'lesson-text' }), feedback = h('div'), actions = h('div', { class: 'row lesson-actions' }), stepNo = h('div', { class: 'faint small' });
    var panel = h('div', { class: 'card stack' }, stepNo, textBox, feedback, actions);
    root.appendChild(h('div', { class: 'arena', style: { marginTop: '14px' } }, h('div', { class: 'board-col' }, board.el), h('div', { class: 'panel' }, panel)));

    function paintStepper() {
      Array.prototype.forEach.call(stepper.children, function (el, k) { el.className = k < st.i ? 'done' : k === st.i ? 'on' : ''; });
      stepNo.textContent = 'Step ' + (st.i + 1) + ' of ' + lesson.steps.length;
    }
    function orientFor(s, pos) { return s.orient || (pos.side === 1 ? 'w' : 'b'); }
    function show(i) {
      st.i = i; st.token++; st.ply = 0; st.picked = []; st.tries = 0; st.complete = false; st.hintLevel = 0;
      var s = lesson.steps[i];
      paintStepper();
      U.clear(textBox); U.clear(feedback); U.clear(actions);
      textBox.appendChild(U.rich(s.text));
      board.opts.onSquare = null;
      board.clearDecor();
      if (s.fen) {
        st.pos = new C.Pos(s.fen);
        board.setOrientation(orientFor(s, st.pos));
        board.setMovable(null);
        board.setPosition(st.pos, { animate: false, last: null, clearLast: true });
        board.setArrows((s.arrows || []).map(function (a) { return { from: a.slice(0, 2), to: a.slice(2, 4), color: 'gold' }; }));
        board.setMarks((s.marks || []).map(function (m) { return { sq: m, kind: 'gold' }; }).concat(boxMarks(s, st.pos)));
      } else {
        st.pos = new C.Pos(C.START_FEN);
        board.setOrientation('w');
        board.setMovable(null);
        board.setPosition(st.pos, { animate: false, clearLast: true });
      }
      ({ read: stepRead, move: stepMove, pick: stepPick, quiz: stepQuiz, play: stepPlay }[s.t] || stepRead)(s);
    }
    function navRow(canNext, label) {
      U.clear(actions);
      if (st.i > 0) actions.appendChild(h('button', { class: 'btn quiet', type: 'button', onclick: function () { show(st.i - 1); } }, U.icon('back'), 'Back'));
      actions.appendChild(h('span', { class: 'grow' }));
      if (!canNext) return null;
      var nx = h('button', { class: 'btn primary', type: 'button', onclick: function () { advance(); } }, label || (st.i === lesson.steps.length - 1 ? 'Finish' : 'Next'), U.icon('next'));
      actions.appendChild(nx);
      if (st.complete) setTimeout(function () { if (document.activeElement === document.body || !document.activeElement) try { nx.focus({ preventScroll: true }); } catch (e) { /* ignore */ } }, 0);
      return nx;
    }
    function advance() { if (st.i < lesson.steps.length - 1) show(st.i + 1); else finish(); }
    function fb(kind, text) { U.clear(feedback); if (text) feedback.appendChild(h('div', { class: 'feedback ' + kind }, U.rich(text))); }

    /* read */
    function stepRead(s) {
      navRow(true);
      if (s.play && s.play.length) {
        var replay = h('button', { class: 'btn small', type: 'button', onclick: function () { animatePlay(s); } }, U.icon('refresh'), 'Replay');
        actions.insertBefore(replay, actions.querySelector('.grow'));
        animatePlay(s);
      }
    }
    function animatePlay(s) {
      var tok = ++st.token, p = new C.Pos(s.fen), k = 0;
      board.setPosition(p, { animate: false, clearLast: true });
      board.setArrows([]);
      if (s.box) board.setMarks(boxMarks(s, p));
      (function stepAnim() {
        if (tok !== st.token) return;
        if (k >= s.play.length) {
          board.setArrows((s.arrows || []).map(function (a) { return { from: a.slice(0, 2), to: a.slice(2, 4), color: 'gold' }; }));
          return;
        }
        setTimeout(function () {
          if (tok !== st.token) return;
          var m = p.parseMove(s.play[k++]); if (!m) return;
          p.make(m); U.sound.move();
          board.setPosition(p, { last: m, animate: true });
          if (s.box) board.setMarks(boxMarks(s, p));
          stepAnim();
        }, k === 0 ? 600 : 850);
      })();
    }

    /* move */
    function stepMove(s) {
      var learner = st.pos.side;
      board.setMovable(learner === 1 ? 'w' : 'b');
      navRow(false);
      var hintBtn = h('button', { class: 'btn small', type: 'button', onclick: function () {
        st.hints++; st.hintLevel++;
        if (st.hintLevel === 1 && s.hint) fb('info', s.hint);
        else { var mv = s.line[st.ply], pc = PIECE_NAME[Math.abs(st.pos.b[C.sqIndex(mv.slice(0, 2))])] || 'piece'; board.setMarks([{ sq: mv.slice(0, 2), kind: 'hint' }]); fb('info', (s.hint ? s.hint + ' ' : '') + 'Move your ' + pc + ' on ' + mv.slice(0, 2) + '.'); }
      } }, U.icon('hint'), 'Hint');
      actions.insertBefore(hintBtn, actions.querySelector('.grow'));
    }
    function onMove(uci, m) {
      var s = lesson.steps[st.i];
      if (s.t === 'play') return playMove(uci, m);
      if (s.t !== 'move' || st.complete) return;
      var expected = s.line[st.ply], extra = (s.accept && s.accept[st.ply]) || [];
      var after = st.pos.clone(); after.make(m);
      var finalPly = st.ply === s.line.length - 1;
      var ok = uci === expected || extra.indexOf(uci) >= 0 || (finalPly && s.mate && after.status().reason === 'checkmate');
      if (!ok) {
        st.mistakes++; st.tries++;
        U.sound.bad();
        board.setMovable(null);
        board.setPosition(after, { last: m, animate: false });
        var msg = (s.wrong && s.wrong[uci]) || wrongWhy(m, after);
        if (!(s.wrong && s.wrong[uci]) && st.tries >= 2 && s.hint && st.hintLevel === 0) { msg += ' Hint: ' + s.hint; st.hintLevel = 1; }
        fb('no', msg);
        var tok = st.token;
        setTimeout(function () { if (tok !== st.token) return; board.setPosition(st.pos, { animate: true, clearLast: true }); board.setMovable(st.pos.side === 1 ? 'w' : 'b'); }, 900);
        return;
      }
      st.pos.make(m);
      if (after.inCheck()) U.sound.check(); else if ((m >>> 17) & 1) U.sound.capture(); else U.sound.move();
      board.setPosition(st.pos, { last: m, animate: false });
      board.setMarks([]); board.setArrows([]);
      st.ply++;
      if (st.ply >= s.line.length) { complete(s); return; }
      board.setMovable(null);
      fb('ok', 'Good. Keep going.');
      var tok2 = st.token;
      setTimeout(function () {
        if (tok2 !== st.token) return;
        var r = st.pos.parseMove(s.line[st.ply]);
        st.pos.make(r); st.ply++;
        if (st.pos.inCheck()) U.sound.check(); else U.sound.move();
        board.setPosition(st.pos, { last: r, animate: true });
        board.setMovable(st.pos.side === 1 ? 'w' : 'b');
        U.clear(feedback);
      }, 550);
    }
    function complete(s) {
      st.complete = true;
      board.setMovable(null);
      U.sound.good();
      fb('ok', s.done || 'Correct.');
      navRow(true);
    }

    /* pick */
    function stepPick(s) {
      navRow(false);
      board.opts.onSquare = function (name) {
        if (st.complete) return;
        var k = st.picked.indexOf(name);
        if (k >= 0) st.picked.splice(k, 1); else st.picked.push(name);
        board.setPicked(st.picked);
      };
      var check = h('button', { class: 'btn small primary', type: 'button', onclick: function () {
        var want = s.squares.slice().sort().join(','), got = st.picked.slice().sort().join(',');
        if (want === got) {
          st.complete = true; U.sound.good();
          board.setPicked([]);
          board.setMarks(s.squares.map(function (q) { return { sq: q, kind: 'green' }; }));
          fb('ok', s.done || 'Correct.');
          navRow(true);
        } else {
          st.mistakes++; st.tries++; U.sound.bad();
          var right = st.picked.filter(function (q) { return s.squares.indexOf(q) >= 0; }).length;
          if (st.tries >= 2) {
            st.complete = true;
            board.setPicked([]);
            board.setMarks(s.squares.map(function (q) { return { sq: q, kind: 'green' }; }));
            fb('info', 'Here are the answers. ' + (s.done || ''));
            navRow(true);
          } else fb('no', pickFeedback(s, right));
        }
      } }, 'Check');
      actions.insertBefore(check, actions.querySelector('.grow'));
    }

    /* quiz */
    function stepQuiz(s) {
      navRow(false);
      var box = h('div', { class: 'choices' });
      s.choices.forEach(function (c, k) {
        var b = h('button', { class: 'choice', type: 'button', onclick: function () {
          if (st.complete) return;
          if (k === s.answer) {
            b.classList.add('right'); st.complete = true; U.sound.good();
            fb('ok', s.done || 'Correct.'); navRow(true);
          } else { b.classList.add('wrong'); st.mistakes++; U.sound.bad(); fb('no', 'Not quite. Try another answer.'); }
        } }, c);
        box.appendChild(b);
      });
      textBox.appendChild(box);
    }

    /* play */
    function stepPlay(s) {
      st.learner = st.pos.side; st.moves = 0; st.engineTok = 0; st.start = s.fen; st.history = [];
      board.setMovable(st.learner === 1 ? 'w' : 'b');
      navRow(false);
      var goalText = { mate: 'Checkmate within ' + s.limit + ' moves.', promote: 'Promote a pawn and keep it.', draw: 'Hold the draw' + (s.limit ? ' for ' + s.limit + ' moves.' : '.'), win: 'Win decisively' + (s.limit ? ' within ' + s.limit + ' moves.' : '.') }[s.goal];
      fb('info', goalText);
      var left = h('div', { class: 'moves-left muted small', 'aria-live': 'polite' });
      st.leftEl = left; paintLeft(s);
      feedback.appendChild(left);
      actions.insertBefore(h('button', { class: 'btn small', type: 'button', onclick: function () { show(st.i); } }, U.icon('refresh'), 'Restart'), actions.querySelector('.grow'));
      actions.insertBefore(h('button', { class: 'btn small quiet', type: 'button', onclick: function () {
        st.hints++;
        Engines.analyse({ fen: s.fen, moves: st.history.slice(), depth: 14, movetime: 900 }).then(function (r) { if (r.best && !st.complete) board.setArrows([{ from: r.best.slice(0, 2), to: r.best.slice(2, 4), color: 'green' }]); });
      } }, U.icon('hint'), 'Hint'), actions.querySelector('.grow'));
    }
    function playMove(uci, m) {
      var s = lesson.steps[st.i];
      if (st.complete) return;
      var promo = (m >> 14) & 7;
      st.pos.make(m); st.history.push(uci); st.moves++;
      board.setArrows([]);
      board.setMovable(null);
      if (st.pos.inCheck()) U.sound.check(); else U.sound.move();
      board.setPosition(st.pos, { last: m, animate: false });
      if (s.box) board.setMarks(boxMarks(s, st.pos));
      var status = st.pos.status();
      if (status.over) return judge(status);
      if (s.goal === 'promote' && promo) st.promoted = true;
      var tok = ++st.engineTok;
      Engines.analyse({ fen: s.fen, moves: st.history.slice(), depth: 16, movetime: 900 }).then(function (r) {
        if (tok !== st.engineTok || L !== st || lesson.steps[st.i] !== s) return;
        var l = r.lines[0];
        if (s.goal === 'win' && l && ((l.mate != null && l.mate < 0) || (l.cp != null && l.cp <= -500))) return success();
        if (!r.best) return;
        var em = st.pos.parseMove(r.best);
        st.pos.make(em); st.history.push(r.best);
        if (st.pos.inCheck()) U.sound.check(); else if ((em >>> 17) & 1) U.sound.capture(); else U.sound.move();
        board.setPosition(st.pos, { last: em, animate: true });
        if (s.box) board.setMarks(boxMarks(s, st.pos));
        var st2 = st.pos.status();
        if (st2.over) return judge(st2);
        if (s.goal === 'promote' && st.promoted) {
          var has = false;
          for (var q = 0; q < 120; q++) { if (q & 8) { q += 7; continue; } if (st.pos.b[q] === 5 * st.learner) has = true; }
          if (has) return success();
          st.promoted = false;
        }
        paintLeft(s);
        if (s.limit && st.moves >= s.limit) {
          if (s.goal === 'draw') return evalDraw();
          return fail('Out of moves. Restart and try a faster plan.');
        }
        board.setMovable(st.learner === 1 ? 'w' : 'b');
      });
    }
    /* The "box" the mating lessons talk about: the part of the board the lone king is shut into
       by the files and ranks your queen or rooks control. */
    function boxMarks(s, pos) {
      if (!s.box) return [];
      var side = s.box === 'w' ? 1 : -1, ksq = side === 1 ? pos.wk : pos.bk;
      if (ksq == null || ksq < 0) return [];
      var b = pos.b.slice(); b[ksq] = 0;
      function walled(t) {
        if (b[t]) return true;
        for (var k = 0; k < 4; k++) {
          var d = [16, -16, 1, -1][k], x = t + d;
          while (!(x & 0x88)) { var pc = b[x]; if (pc) { if (pc === -4 * side || pc === -5 * side) return true; break; } x += d; }
        }
        return false;
      }
      var seen = {}, inBox = {}, queue = [ksq], squares = [], DIRS = [-17, -16, -15, -1, 1, 15, 16, 17];
      seen[ksq] = true;
      while (queue.length) {
        var q = queue.shift();
        squares.push(q); inBox[q] = true;
        for (var i = 0; i < 8; i++) {
          var t = q + DIRS[i];
          if ((t & 0x88) || seen[t]) continue;
          seen[t] = true;
          if (!walled(t)) queue.push(t);
        }
      }
      // fence the box: a line on each side that borders a square the king can't reach
      return squares.map(function (q) {
        var edges = '';
        [['n', 16], ['s', -16], ['e', 1], ['w', -1]].forEach(function (d) { var t = q + d[1]; if (!(t & 0x88) && !inBox[t]) edges += d[0]; });
        return { sq: q, kind: 'area', edges: edges };
      });
    }
    function paintLeft(s) {
      if (!st.leftEl || !s.limit) return;
      var n = Math.max(0, s.limit - st.moves);
      st.leftEl.textContent = s.goal === 'draw' ? (n ? 'Hold for ' + U.plural(n, 'more move') + '.' : 'Last move.') : U.plural(n, 'move') + ' left.';
    }
    function evalDraw() {
      var s = lesson.steps[st.i];
      Engines.analyse({ fen: s.fen, moves: st.history.slice(), depth: 14, movetime: 900 }).then(function (r) {
        var l = r.lines[0] || { cp: 0 };
        var forLearner = (st.pos.side === st.learner ? 1 : -1) * (l.mate != null ? (l.mate > 0 ? 3000 : -3000) : l.cp);
        if (forLearner > -150) success(); else fail('The position slipped. Restart and keep your defense tight.');
      });
    }
    function judge(status) {
      var s = lesson.steps[st.i];
      if (status.reason === 'checkmate') {
        if (status.winner === st.learner) return (s.goal === 'mate' || s.goal === 'win') ? success() : success();
        return fail('You were checkmated. Restart and try again.');
      }
      if (s.goal === 'draw') return success();
      return fail(status.reason === 'stalemate' ? 'Stalemate: the defending king had no legal move. Leave it a square.' : 'The game ended in a draw. Restart and try again.');
    }
    function success() { st.complete = true; U.sound.good(); board.setMovable(null); fb('ok', lesson.steps[st.i].done || 'Done.'); navRow(true); }
    function pickFeedback(s, right) {
      var wrong = st.picked.filter(function (q) { return s.squares.indexOf(q) < 0; });
      var RANK = ['', 'first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth'];
      if (s.squares.length === 1 && st.picked.length === 1 && wrong.length === 1) {
        var q = s.squares[0];
        return 'That\u2019s ' + wrong[0] + '. ' + q + ' is where the ' + q[0] + '-file meets the ' + RANK[+q[1]] + ' rank. Try again.';
      }
      if (!st.picked.length) return 'Choose at least one square, then Check.';
      var out = right ? 'You found ' + right + ' of ' + s.squares.length + '. ' : 'None of those yet. ';
      if (wrong.length === 1) out += wrong[0] + ' isn\u2019t one of them. ';
      else if (wrong.length > 1) out += wrong.join(', ') + ' aren\u2019t among them. ';
      else out += 'There ' + (s.squares.length - right === 1 ? 'is 1 more' : 'are ' + (s.squares.length - right) + ' more') + ' to find. ';
      return out + 'Try again.';
    }
    /* a reason for a wrong move that we can see without an engine: it leaves the moved piece en prise */
    function wrongWhy(m, after) {
      var to = (m >> 7) & 127, piece = Math.abs(after.b[to]);
      if (piece && piece !== 6 && after.hangingLoss(to) >= 100) return 'Not quite. On ' + C.sqName(to) + ' your ' + PIECE_NAME[piece] + ' can be taken for free. Try again.';
      return 'Not quite. Try again.';
    }
    function fail(msg) { st.mistakes++; U.sound.bad(); board.setMovable(null); fb('no', msg); }

    function finish() {
      var stars = st.mistakes + st.hints === 0 ? 3 : st.mistakes + st.hints <= 2 ? 2 : 1;
      var S = Store.state.learn, prev = S.done[lesson.id];
      var firstTime = !prev;
      S.done[lesson.id] = { stars: Math.max(stars, prev ? prev.stars : 0), ts: Date.now() };
      S.last = lesson.id;
      Store.touch('learn');
      if (firstTime) Store.activity('l');
      U.sound.end();
      // the next lesson in this unit first, then the first unfinished one anywhere
      var li = found.li, nx = li + 1 < unit.lessons.length ? { unit: unit, lesson: unit.lessons[li + 1] } : nextLesson();
      if (nx && nx.lesson.id === lesson.id) nx = null;
      var why = st.mistakes + st.hints === 0 ? 'No mistakes and no hints.'
        : [st.mistakes ? U.plural(st.mistakes, 'mistake') : '', st.hints ? U.plural(st.hints, 'hint') : ''].filter(Boolean).join(' and ') + '. Replay it any time to earn more stars.';
      App.sheet(function (box, api) {
        box.appendChild(h('div', { class: 'result-hero' }, h('div', { class: 'big' }, 'Lesson complete'), h('div', { style: { marginTop: '8px' } }, UI.stars(stars))));
        box.appendChild(h('p', { class: 'muted', style: { textAlign: 'center' } }, why));
        var practice = practiceTheme(lesson.id);
        var col = h('div', { class: 'stack', style: { marginTop: '12px' } });
        if (nx) col.appendChild(h('button', { class: 'btn primary block', type: 'button', onclick: function () { api.close(); open(nx.lesson.id); } }, 'Next: ' + nx.lesson.title));
        if (practice) col.appendChild(h('button', { class: 'btn block', type: 'button', onclick: function () { api.close(); Puzzles.themed(practice); } }, 'Practice with ' + Puzzles.NAMES[practice] + ' puzzles'));
        col.appendChild(h('button', { class: 'btn quiet block', type: 'button', onclick: function () { api.close(); App.go('learn'); } }, 'Back to lessons'));
        box.appendChild(col);
      });
    }

    show(0);
  }

  var PRACTICE = { 'fork': 'fork', 'pin': 'pin', 'skewer': 'skewer', 'discovered-attack': 'discoveredAttack', 'remove-defender': 'capturingDefender',
    'deflection-decoy': 'deflection', 'trapped-piece': 'trappedPiece', 'back-rank': 'backRankMate', 'smothered-mate': 'smotheredMate', 'mating-patterns': 'mateIn2',
    'free-pieces': 'hangingPiece', 'check-mate-stalemate': 'mateIn1', 'passed-pawns': 'advancedPawn', 'rook-endgames': 'rookEndgame', 'king-pawn': 'pawnEndgame', 'overload': 'deflection' };
  function practiceTheme(id) { return PRACTICE[id] || null; }

  App.register('learn', {
    render: function (root, params) {
      if (params && params.lesson) renderLesson(root, params.lesson);
      else renderUnits(root);
    },
    leave: function () { if (L) { L.token++; L.engineTok = (L.engineTok || 0) + 1; } L = null; },
    busy: function () { return !!L; }
  });

  return { nextLesson: nextLesson, open: open,
    _cur: function () { return L ? { id: L.id, i: L.i, ply: L.ply || 0, complete: !!L.complete, mistakes: L.mistakes, moves: L.history ? L.history.slice() : [] } : null; } };
})();
