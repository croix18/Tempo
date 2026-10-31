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
    var col = h('div', { class: 'stack', style: { gap: '16px' } });
    units.forEach(function (u, ui) {
      var n = u.lessons.filter(function (l) { return done(l.id); }).length;
      var card = h('div', { class: 'card' });
      card.appendChild(h('div', { class: 'unit' }, h('div', { class: 'unit-num' }, String(ui + 1)),
        h('div', null, h('h2', null, u.title), h('div', { class: 'muted small' }, u.summary))));
      card.appendChild(h('div', { class: 'row', style: { margin: '12px 0 4px' } }, h('div', { class: 'grow' }, UI.meter(n / u.lessons.length, 'green')), h('span', { class: 'faint small' }, n + '/' + u.lessons.length)));
      var list = h('div', { class: 'list' });
      u.lessons.forEach(function (l) {
        var d = done(l.id);
        list.appendChild(h('button', { class: 'list-row lesson-row', type: 'button', onclick: function () { open(l.id); } },
          h('span', { class: 'tick' + (d ? ' done' : '') }, d ? U.icon('check') : null),
          h('div', { class: 'grow' }, h('div', { style: { fontWeight: 600 } }, l.title), h('div', { class: 'muted small' }, l.summary)),
          d ? UI.stars(d.stars) : h('span', { class: 'faint small' }, l.steps.length + ' steps')));
      });
      card.appendChild(list);
      col.appendChild(card);
    });
    root.appendChild(col);
  }

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
    var board = new Board({ orient: 'w', coords: Store.state.settings.coords !== false, onMove: onMove, onSquare: null });
    st.board = board;
    var textBox = h('div', { class: 'lesson-text' }), feedback = h('div'), actions = h('div', { class: 'row' }), stepNo = h('div', { class: 'faint small' });
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
        board.setMarks((s.marks || []).map(function (m) { return { sq: m, kind: 'gold' }; }));
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
      var nx = h('button', { class: 'btn primary', type: 'button', disabled: !canNext, onclick: function () { advance(); } }, label || (st.i === lesson.steps.length - 1 ? 'Finish' : 'Next'), U.icon('next'));
      actions.appendChild(h('span', { class: 'grow' }));
      actions.appendChild(nx);
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
        else { var mv = s.line[st.ply]; board.setMarks([{ sq: mv.slice(0, 2), kind: 'gold' }]); fb('info', (s.hint ? s.hint + ' ' : '') + 'Move the highlighted piece.'); }
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
          } else fb('no', 'You have ' + right + ' of ' + s.squares.length + (st.picked.length > right ? ', plus ' + (st.picked.length - right) + ' that don’t belong' : '') + '. Try again.');
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
        var st2 = st.pos.status();
        if (st2.over) return judge(st2);
        if (s.goal === 'promote' && st.promoted) {
          var has = false;
          for (var q = 0; q < 120; q++) { if (q & 8) { q += 7; continue; } if (st.pos.b[q] === 5 * st.learner) has = true; }
          if (has) return success();
          st.promoted = false;
        }
        if (s.limit && st.moves >= s.limit) {
          if (s.goal === 'draw') return evalDraw();
          return fail('Out of moves. Restart and try a faster plan.');
        }
        board.setMovable(st.learner === 1 ? 'w' : 'b');
      });
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
      var nx = nextLesson();
      App.sheet(function (box, api) {
        box.appendChild(h('div', { class: 'result-hero' }, h('div', { class: 'big' }, 'Lesson complete'), h('div', { style: { marginTop: '8px' } }, UI.stars(stars))));
        box.appendChild(h('p', { class: 'muted', style: { textAlign: 'center' } }, stars === 3 ? 'No mistakes and no hints.' : 'Replay it any time to earn more stars.'));
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
