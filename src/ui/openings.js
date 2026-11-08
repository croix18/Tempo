/* Tempo openings: a beginner repertoire with notes, drills with spaced repetition, and traps. */
var Openings = (function () {
  'use strict';
  var h = U.h, C = TempoCore;
  var O = null;
  var DAY = 86400000, GAPS = [0, 1, 3, 7, 16, 35];
  var COURSES = ['italian', 'queens-gambit'];   // Learn units that teach an opening from the ground up

  function lineKey(rep, line) { return rep.id + '/' + line.id; }
  function lineState(rep, line) { return Store.state.openings.lines[lineKey(rep, line)] || null; }
  function sans(line) { return String(line.moves).trim().split(/\s+/); }
  function sideNum(side) { return side === 'w' ? 1 : -1; }

  function renderMenu(root) {
    var D = Data.reps();
    root.appendChild(h('div', { class: 'page-head' }, h('h1', null, 'Openings')));
    if (!D.repertoires.length) { root.appendChild(h('div', { class: 'empty' }, 'Opening lines are missing from this build.')); return; }
    // the opening courses in Learn come first: they teach the ideas and plans, and the lines below are drilled from them
    var courses = Data.lessons().filter(function (u) { return COURSES.indexOf(u.id) >= 0; });
    if (courses.length) {
      var cl = h('nav', { class: 'menu-list', 'aria-label': 'Opening courses', style: { maxWidth: '640px', marginBottom: '28px' } });
      courses.forEach(function (u) {
        var n = u.lessons.filter(function (l) { return Store.state.learn.done[l.id]; }).length, lk = u.lessons.filter(function (l) { return Learn.lockedIn(l.id); }).length;
        var sub = n ? n + ' of ' + u.lessons.length + ' lessons done' + (lk ? ' · ' + lk + ' locked in' : '') : U.plural(u.lessons.length, 'lesson') + ', from the first moves to practice games';
        cl.appendChild(UI.menuRow('book', u.title, sub, function () { Learn.openUnit(u.id); }));
      });
      root.appendChild(h('h2', { style: { margin: '0 0 12px' } }, 'Courses'));
      root.appendChild(cl);
      root.appendChild(h('h2', { style: { margin: '0 0 12px' } }, 'Repertoires'));
    }
    var list = h('nav', { class: 'menu-list', 'aria-label': 'Repertoires', style: { maxWidth: '640px' } });
    D.repertoires.forEach(function (rep) {
      var learned = 0, due = 0, now = Date.now();
      rep.lines.forEach(function (ln) { var s = lineState(rep, ln); if (s && s.learned) { learned++; if ((s.due || 0) <= now) due++; } });
      var sub = learned ? learned + ' of ' + rep.lines.length + ' lines learned.' + (due ? ' ' + U.plural(due, 'line') + ' ready to drill.' : '') : U.plural(rep.lines.length, 'line') + ' to learn.';
      list.appendChild(UI.menuRow(kingIcon(rep.side), rep.name, sub, function () { App.go('openings', { rep: rep.id }); }));
    });
    root.appendChild(list);
    if (D.traps.length) {
      root.appendChild(h('h2', { style: { margin: '32px 0 12px' } }, 'Traps to know'));
      var tl = h('nav', { class: 'menu-list', 'aria-label': 'Traps', style: { maxWidth: '640px' } });
      D.traps.forEach(function (t) {
        var seen = Store.state.openings.lines['trap/' + t.id], victim = t.trapper && t.trapper !== t.side && t.keyPly != null;
        var who = t.side === 'w' ? 'White' : 'Black';
        // each trap has a lesson in Learn (watch it, set it, dodge it, set it from memory); the walkthrough here is the fallback
        var les = Data.lesson('trap-' + t.id), ld = les && Store.state.learn.done[les.lesson.id];
        if (les) tl.appendChild(UI.menuRow(kingIcon(t.side), t.name, (ld ? (Learn.lockedIn(les.lesson.id) ? 'Locked in.' : 'Lesson done.') : t.noSet || t.defend ? 'Learn to stop it.' : 'Learn to set it and to dodge it.'), function () { Learn.open('trap-' + t.id, 'openings'); }));
        // three kinds: a trap you set, one you must not fall into, and an attack you learn to stop
        else tl.appendChild(UI.menuRow(kingIcon(t.side), t.name, (victim ? 'Learn to avoid it as ' : t.defend ? 'Learn to stop it as ' : 'Learn to set it as ') + who + '.' + (seen ? ' Done.' : ''), function () { App.go('openings', { trap: t.id }); }));
      });
      root.appendChild(tl);
    }
  }
  function kingIcon(side) { return h('span', { class: 'cp ' + side + 'k row-king', 'aria-hidden': 'true' }); }
  function renderRep(root, rep) {
    root.appendChild(h('button', { class: 'back', type: 'button', onclick: function () { App.go('openings'); } }, U.icon('back'), 'Openings'));
    root.appendChild(h('div', { class: 'page-head' }, h('div', null, h('h1', null, rep.name), h('div', { class: 'sub' }, rep.intro))));
    var now = Date.now(), dueLines = rep.lines.filter(function (ln) { var s = lineState(rep, ln); return s && s.learned && (s.due || 0) <= now; });
    var nextNew = rep.lines.filter(function (ln) { var s = lineState(rep, ln); return !s || !s.learned; })[0];
    root.appendChild(h('div', { class: 'row', style: { marginBottom: '16px' } },
      nextNew ? h('button', { class: 'btn primary', type: 'button', onclick: function () { playLine(rep, nextNew, 'learn'); } }, U.icon('book'), 'Learn next line') : null,
      h('button', { class: 'btn' + (nextNew ? '' : ' primary'), type: 'button', disabled: !rep.lines.some(function (ln) { var s = lineState(rep, ln); return s && s.learned; }),
        onclick: function () { drill(rep); } }, U.icon('target'), dueLines.length ? 'Drill ' + U.plural(dueLines.length, 'due line') : 'Drill all')));
    var list = h('div', { class: 'card list' });
    rep.lines.forEach(function (ln) {
      var s = lineState(rep, ln), moves = sans(ln);
      list.appendChild(h('button', { class: 'list-row lesson-row', type: 'button', onclick: function () { playLine(rep, ln, 'learn'); } },
        h('span', { class: 'tick' + (s && s.learned ? ' done' : '') }, s && s.learned ? U.icon('check') : null),
        h('div', { class: 'grow' }, h('div', { style: { fontWeight: 600 } }, ln.name), h('div', { class: 'muted small' }, movesText(moves.slice(0, 8)) + (moves.length > 8 ? ' …' : ''))),
        s && s.drills ? h('span', { class: 'faint small' }, Math.round(100 * (s.right || 0) / s.drills) + '%') : null));
    });
    root.appendChild(list);
  }
  function movesText(ms) {
    var out = '';
    ms.forEach(function (m, i) { if (i % 2 === 0) out += (i / 2 + 1) + '.'; out += m.replace(/-/g, '\u2011') + ' '; });
    return out.trim();
  }

  function drill(rep) {
    var now = Date.now();
    var learned = rep.lines.filter(function (ln) { var s = lineState(rep, ln); return s && s.learned; });
    var due = learned.filter(function (ln) { return (lineState(rep, ln).due || 0) <= now; });
    var queue = U.shuffle(due.length ? due : learned.slice()).slice(0, 6);
    if (!queue.length) return;
    O = { queue: queue, rep: rep, results: [] };
    playLine(rep, queue[0], 'drill');
  }

  /* line player: learn (guided, with notes), drill (from memory), trap (step through, then practice) */
  function playLine(rep, line, mode) { App.go('openings', { play: { rep: rep, line: line, mode: mode } }); }

  function renderPlayer(root, cfg) {
    App.focus(true);
    var rep = cfg.rep, line = cfg.line, mode = cfg.mode, isTrap = mode === 'trap' || mode === 'trap-practice' || mode === 'trap-avoid';
    var side = isTrap ? line.side : rep.side, you = sideNum(side);
    var moves = sans(line), notes = line.notes || {};
    var st = { ply: 0, pos: new C.Pos(), mistakes: 0, token: 0, misses: {} };
    if (!O || mode !== 'drill') O = O && mode === 'drill' ? O : { results: [] };
    O.player = st;
    var title = isTrap ? line.name : line.name;
    root.appendChild(h('div', { class: 'row between', style: { marginBottom: '8px' } },
      h('button', { class: 'back', type: 'button', onclick: function () { App.go('openings', isTrap ? {} : { rep: rep.id }); } }, U.icon('back'), isTrap ? 'Openings' : rep.name),
      h('span', { class: 'chip' }, { learn: 'Learn', drill: 'Drill', trap: 'Walkthrough', 'trap-practice': 'Your turn', 'trap-avoid': 'Avoid the trap' }[mode])));
    root.appendChild(h('h1', { style: { fontSize: '26px', marginBottom: '12px' } }, title));
    var board = new Board({ orient: side, coords: Store.state.settings.coords !== false, onMove: onMove, autoQueen: false });
    var noteBox = h('div', { class: 'lesson-text' }), fbBox = h('div'), actions = h('div', { class: 'row' }), movesLine = h('div', { class: 'muted small' });
    root.appendChild(h('div', { class: 'arena' }, h('div', { class: 'board-col' }, board.el),
      h('div', { class: 'panel' }, h('div', { class: 'card stack' }, movesLine, noteBox, fbBox, actions))));

    // landed: a move by the other side (or a walkthrough's), carried across naturally; its sound as the piece lands
    function paint(last, landed) {
      board.setPosition(st.pos, { last: last || null, animate: true, clearLast: !last, natural: !!landed, landed: landed });
      movesLine.textContent = movesText(moves.slice(0, st.ply)) || 'Starting position';
    }
    function note(ply) {
      U.clear(noteBox);
      var text = notes[ply] != null ? notes[ply] : null;
      if (text) noteBox.appendChild(U.rich(text));
      else if (mode === 'drill') noteBox.appendChild(h('p', { class: 'muted' }, st.ply < moves.length ? 'Play the next move from your line.' : ''));
    }
    function fb(kind, text) { U.clear(fbBox); if (text) fbBox.appendChild(h('div', { class: 'feedback ' + kind }, text)); }
    function ourTurn() { return st.pos.side === you; }

    function step() {
      if (st.ply >= moves.length) return finished();
      if (mode === 'trap') { board.setMovable(null); return; }
      if (!ourTurn()) {
        board.setMovable(null);
        var tok = ++st.token;
        setTimeout(function () {
          if (tok !== st.token) return;
          var m = st.pos.parseMove(moves[st.ply]);
          if (!m) return finished();
          st.pos.make(m); st.ply++;
          paint(m, function () { sound(m); });
          if (mode !== 'drill') note(st.ply - 1);
          step();
        }, mode === 'drill' ? 450 : 700);
        return;
      }
      board.setMovable(side);
      if (mode === 'learn' || mode === 'trap-practice') {
        var exp = st.pos.parseMove(moves[st.ply]);
        if (exp && (mode === 'learn' || st.misses[st.ply])) board.setArrows([{ from: C.sqName(exp & 127), to: C.sqName((exp >> 7) & 127), color: 'green', opacity: '0.7' }]);
        if (mode === 'learn' && exp) {
          U.clear(noteBox);
          noteBox.appendChild(h('p', { class: 'small muted' }, 'Play ' + st.pos.san(exp) + '.'));
          if (notes[st.ply] != null) noteBox.appendChild(U.rich(notes[st.ply]));
        }
      }
    }
    function onMove(uci, m) {
      if (mode === 'trap-avoid') return avoidMove(uci, m);
      var exp = st.pos.parseMove(moves[st.ply]);
      board.setArrows([]);
      if (m === exp) {
        st.pos.make(m); st.ply++;
        sound(m); paint(m);
        fb(null);
        note(st.ply - 1);
        step();
      } else {
        st.mistakes++; st.misses[st.ply] = true;
        U.sound.bad();
        var san = st.pos.san(exp);
        fb('info', mode === 'drill' ? 'Your line plays ' + san + ' here. Play it to go on.' : 'This line plays ' + san + ' here.');
        board.setPosition(st.pos, { animate: true });
        board.setArrows([{ from: C.sqName(exp & 127), to: C.sqName((exp >> 7) & 127), color: 'green' }]);
        board.setMovable(side);
      }
    }
    function sound(m) { if (st.pos.inCheck()) U.sound.check(); else if ((m >>> 17) & 1) U.sound.capture(); else U.sound.move(); }

    function finished() {
      board.setMovable(null);
      U.clear(actions);
      var key = isTrap ? 'trap/' + line.id : lineKey(rep, line);
      var S = Store.state.openings, rec = S.lines[key] || (S.lines[key] = { learned: false, box: 0, due: 0, drills: 0, right: 0 });
      if (mode === 'learn') { rec.learned = true; rec.due = rec.due || Date.now() + DAY; } // the first drill is tomorrow, as the end card says
      if (mode === 'trap-practice' || mode === 'trap') rec.learned = true;
      if (mode === 'drill') {
        rec.drills++; if (!st.mistakes) rec.right++;
        rec.box = st.mistakes ? 0 : Math.min(5, (rec.box || 0) + 1);
        rec.due = Date.now() + GAPS[rec.box] * DAY;
      }
      Store.touch('openings');
      if (mode === 'trap') {
        fb('info', line.lesson);
        var victim = line.trapper && line.trapper !== line.side && line.keyPly != null;
        actions.appendChild(h('button', { class: 'btn primary', type: 'button', onclick: function () { App.go('openings', { play: { rep: null, line: line, mode: victim ? 'trap-avoid' : 'trap-practice' } }); } }, victim ? 'Now avoid it' : 'Now you play it'));
        actions.appendChild(h('button', { class: 'btn quiet', type: 'button', onclick: function () { App.go('openings'); } }, 'Done'));
        return;
      }
      if (mode === 'drill') {
        O.results.push(!st.mistakes);
        var rest = O.queue ? O.queue.slice(O.results.length) : [];
        fb(st.mistakes ? 'no' : 'ok', st.mistakes ? 'You missed ' + U.plural(st.mistakes, 'move') + '. This line comes back soon.' : 'Perfect. This line comes back in ' + U.plural(GAPS[rec.box], 'day') + '.');
        if (rest.length) actions.appendChild(h('button', { class: 'btn primary', type: 'button', onclick: function () { playLine(rep, rest[0], 'drill'); } }, 'Next line (' + rest.length + ' left)'));
        else {
          var right = O.results.filter(Boolean).length;
          actions.appendChild(h('div', { class: 'grow muted' }, 'Drill done: ' + right + ' of ' + O.results.length + ' lines perfect.'));
          actions.appendChild(h('button', { class: 'btn primary', type: 'button', onclick: function () { O = null; App.go('openings', { rep: rep.id }); } }, 'Done'));
        }
        Store.activity('l');
        return;
      }
      U.sound.good();
      fb('ok', mode === 'trap-practice' ? 'Well played. ' + (line.lesson || '') : 'Line complete. Drill it tomorrow to lock it in.');
      if (mode === 'learn') {
        var nxt = rep.lines.filter(function (ln) { var s2 = lineState(rep, ln); return !s2 || !s2.learned; })[0];
        if (nxt) actions.appendChild(h('button', { class: 'btn primary', type: 'button', onclick: function () { playLine(rep, nxt, 'learn'); } }, 'Next line'));
        actions.appendChild(h('button', { class: 'btn', type: 'button', onclick: function () { playLine(rep, line, 'learn'); } }, 'Repeat this line'));
      } else actions.appendChild(h('button', { class: 'btn primary', type: 'button', onclick: function () { App.go('openings'); } }, 'Done'));
    }

    // trap walkthrough uses Back / Next buttons
    if (mode === 'trap') {
      // Next plays on to the next move that has something to say, one move at a time; Back returns to the previous one
      var walkTok = 0;
      var nextStop = function (n) { for (var k = n + 1; k < moves.length; k++) if (notes[k - 1] != null) return k; return moves.length; };
      var prevStop = function (n) { for (var k = n - 1; k > 0; k--) if (notes[k - 1] != null) return k; return 0; };
      var walk = function (target) {
        var tok = ++walkTok;
        (function stepOn() {
          if (tok !== walkTok) return;
          go(st.ply + 1, st.ply + 1 < target);
          if (st.ply < target) setTimeout(stepOn, 480);
        })();
      };
      var prevB = h('button', { class: 'btn', type: 'button', onclick: function () { walkTok++; go(prevStop(st.ply)); } }, U.icon('back'), 'Back');
      var nextB = h('button', { class: 'btn primary', type: 'button', onclick: function () { if (st.ply >= moves.length) finished(); else walk(nextStop(st.ply)); } }, 'Next', U.icon('next'));
      actions.appendChild(prevB); actions.appendChild(h('span', { class: 'grow' })); actions.appendChild(nextB);
      var go = function (n, passing) {
        n = Math.max(0, Math.min(moves.length, n));
        st.pos = new C.Pos(); var last = null;
        for (var i = 0; i < n; i++) { last = st.pos.parseMove(moves[i]); st.pos.make(last); }
        st.ply = n;
        paint(last, last ? function () { sound(last); } : null);
        prevB.disabled = n === 0;
        nextB.firstChild.textContent = n >= moves.length ? 'Finish' : 'Next';
        if (passing) return; // moves on the way to the next note go by without one
        U.clear(noteBox);
        if (n === 0) noteBox.appendChild(U.rich(line.summary));
        else if (notes[n - 1] != null) note(n - 1);
        else noteBox.appendChild(h('p', { class: 'muted' }, n >= moves.length ? 'That\u2019s the whole line.' : 'Ordinary opening moves so far. Keep going.'));
      };
      board.setMovable(null);
      paint(null);
      noteBox.appendChild(U.rich(line.summary));
      prevB.disabled = true;
      return;
    }
    /* avoid a trap: play up to the critical moment, then the learner must find a safe move */
    function avoidStart() {
      var key = line.keyPly, tok = ++st.token;
      st.pos = new C.Pos(); st.ply = 0; paint(null);
      board.setMovable(null); board.setArrows([]);
      U.clear(noteBox); noteBox.appendChild(h('p', null, 'Your opponent is setting a trap. When it\u2019s your move, find a safe one.'));
      fb(null);
      (function auto() {
        if (tok !== st.token) return;
        if (st.ply >= key) { board.setMovable(side); fb('info', 'Your move. Don\u2019t fall for it.'); return; }
        setTimeout(function () {
          if (tok !== st.token) return;
          var m = st.pos.parseMove(moves[st.ply]); st.pos.make(m); st.ply++; paint(m, function () { sound(m); }); auto();
        }, 520);
      })();
    }
    function avoidMove(uci, m) {
      var key = line.keyPly, trapMove = st.pos.parseMove(moves[key]);
      var before = st.pos.clone();
      board.setMovable(null);
      if (m === trapMove) {
        st.mistakes++; U.sound.bad();
        fb('no', 'That\u2019s the move the trap is waiting for. Watch what happens.');
        var tok = ++st.token;
        (function rest() {
          if (tok !== st.token) return;
          if (st.ply >= moves.length) {
            U.clear(actions);
            actions.appendChild(h('button', { class: 'btn primary', type: 'button', onclick: function () { U.clear(actions); avoidStart(); } }, U.icon('refresh'), 'Try again'));
            return;
          }
          setTimeout(function () {
            if (tok !== st.token) return;
            var mm = st.pos.parseMove(moves[st.ply]); st.pos.make(mm); st.ply++; paint(mm, function () { sound(mm); }); note(st.ply - 1); rest();
          }, 900);
        })();
        return;
      }
      var after = before.clone(); after.make(m);
      st.pos = after; sound(m); paint(m);
      fb('info', 'Checking\u2026');
      Promise.all([Engines.analyse({ fen: before.fen(), depth: Engines.strong ? 14 : 8, movetime: 900 }), Engines.analyse({ fen: after.fen(), depth: Engines.strong ? 14 : 8, movetime: 900 })]).then(function (res) {
        var b0 = res[0].lines[0], a0 = res[1].lines[0];
        var wb = b0 ? (b0.mate != null ? (b0.mate > 0 ? 100 : 0) : U.winPct(b0.cp)) : 50;
        var wa = a0 ? 100 - (a0.mate != null ? (a0.mate > 0 ? 100 : 0) : U.winPct(a0.cp)) : 50;
        var mateNext = a0 && a0.mate != null && a0.mate > 0;
        if (wb - wa <= 18 && !mateNext) {
          U.sound.good();
          fb('ok', 'Safe. ' + (line.lesson || ''));
          finishedAvoid();
        } else {
          st.mistakes++; U.sound.bad();
          var why = a0 ? Explain.bad(before, m, a0, res[0].best) : null;
          fb('no', (why ? why.text + ' ' : '') + 'Try another move.');
          setTimeout(function () { st.pos = before; paint(null); board.setPosition(before, { animate: true, clearLast: true }); board.setMovable(side); }, 900);
        }
      });
    }
    function finishedAvoid() {
      var rec = Store.state.openings.lines['trap/' + line.id] || (Store.state.openings.lines['trap/' + line.id] = { learned: false, box: 0, due: 0, drills: 0, right: 0 });
      rec.learned = true; Store.touch('openings');
      U.clear(actions);
      actions.appendChild(h('button', { class: 'btn primary', type: 'button', onclick: function () { App.go('openings'); } }, 'Done'));
    }
    if (mode === 'trap-avoid') { avoidStart(); return; }

    paint(null);
    if (mode === 'learn') { U.clear(noteBox); noteBox.appendChild(U.rich(rep.intro)); }
    if (mode === 'trap-practice') { U.clear(noteBox); noteBox.appendChild(h('p', null, 'Play the ' + (side === 'w' ? 'White' : 'Black') + ' moves. ' + (line.defend ? 'The other side tries the attack.' : 'The other side plays the trap line.'))); }
    if (mode === 'drill') { U.clear(noteBox); noteBox.appendChild(h('p', { class: 'muted' }, 'Play ' + (side === 'w' ? 'White' : 'Black') + '\u2019s moves from memory. Each note appears after you play the move.')); }
    step();
  }

  App.register('openings', {
    render: function (root, params) {
      var D = Data.reps();
      if (params && params.play) {
        var cfg = params.play;
        if (cfg.mode === 'trap-practice' || cfg.mode === 'trap' || cfg.mode === 'trap-avoid') renderPlayer(root, { rep: null, line: cfg.line, mode: cfg.mode });
        else renderPlayer(root, cfg);
      } else if (params && params.trap) {
        var t = D.traps.filter(function (x) { return x.id === params.trap; })[0];
        if (t) renderPlayer(root, { rep: null, line: t, mode: 'trap' }); else renderMenu(root);
      } else if (params && params.rep) {
        var r = D.repertoires.filter(function (x) { return x.id === params.rep; })[0];
        if (r) renderRep(root, r); else renderMenu(root);
      } else renderMenu(root);
    },
    leave: function () { if (O && O.player) { O.player.token++; O.player = null; } },
    busy: function () { return !!(O && O.player); }
  });

  /* ---------- your games against your repertoire ---------- */

  /* How far a game from the normal start followed a line you've learned, for your colour.
     Returns null when no learned line applies, or { rep, line, key, k, len, expected, agree, options }:
     k plies of the game matched the line position by position, len is the line's length, expected is the
     move the line plays at ply k (null past its end), and agree is false when other lines that matched as far
     expect a different move there (options lists every move they expect). */
  function followed(startFen, moves, color) {
    var start = new C.Pos();
    if (!startFen || epdOf(new C.Pos(startFen)) !== epdOf(start)) return null;
    var D = Data.reps(), S = Store.state.openings.lines, best = null;
    var p = new C.Pos(), game = [epdOf(p)];
    for (var i = 0; i < moves.length && i < 40; i++) { var m = p.parseMove(moves[i]); if (!m) break; p.make(m); game.push(epdOf(p)); }
    D.repertoires.forEach(function (rep) {
      if (rep.side !== color) return;
      rep.lines.forEach(function (ln) {
        var rec = S[lineKey(rep, ln)]; if (!rec || !rec.learned) return;
        var lp = new C.Pos(), ls = sans(ln), k = 0;
        while (k < ls.length && k + 1 < game.length) {
          var lm = lp.parseMove(ls[k]); if (!lm) break;
          lp.make(lm);
          if (epdOf(lp) !== game[k + 1]) break;
          k++;
        }
        var expected = k < ls.length ? ls[k] : null;
        if (!best || k > best.k) best = { rep: rep, line: ln, key: lineKey(rep, ln), k: k, len: ls.length, expected: expected, agree: true, options: expected ? [expected] : [] };
        else if (k === best.k && expected !== best.expected) {
          best.agree = false;
          if (expected && best.options.indexOf(expected) < 0) best.options.push(expected);
        }
      });
    });
    return best;
  }
  /* put a line first in the drill queue: it comes back today, starting over */
  function queueLine(key) {
    var rec = Store.state.openings.lines[key];
    if (!rec) return false;
    rec.box = 0; rec.due = Date.now() - 1000;
    Store.touch('openings');
    return true;
  }
  /* drill one line straight away */
  function drillLine(key) {
    var D = Data.reps(), parts = String(key).split('/');
    var rep = D.repertoires.filter(function (r) { return r.id === parts[0]; })[0];
    var line = rep && rep.lines.filter(function (l) { return l.id === parts[1]; })[0];
    if (!line) { App.go('openings'); return; }
    O = { queue: [line], rep: rep, results: [] };
    playLine(rep, line, 'drill');
  }
  return { followed: followed, queueLine: queueLine, drillLine: drillLine };
})();
