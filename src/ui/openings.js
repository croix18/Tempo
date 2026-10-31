/* Tempo openings: a beginner repertoire with notes, drills with spaced repetition, and traps. */
var Openings = (function () {
  'use strict';
  var h = U.h, C = TempoCore;
  var O = null;
  var DAY = 86400000, GAPS = [0, 1, 3, 7, 16, 35];

  function lineKey(rep, line) { return rep.id + '/' + line.id; }
  function lineState(rep, line) { return Store.state.openings.lines[lineKey(rep, line)] || null; }
  function sans(line) { return String(line.moves).trim().split(/\s+/); }
  function sideNum(side) { return side === 'w' ? 1 : -1; }

  function renderMenu(root) {
    var D = Data.reps();
    root.appendChild(h('div', { class: 'page-head' }, h('div', null, h('h1', null, 'Openings'))));
    if (!D.repertoires.length) { root.appendChild(h('div', { class: 'empty' }, 'Opening lines are missing from this build.')); return; }
    var grid = h('div', { class: 'grid two' });
    D.repertoires.forEach(function (rep) {
      var learned = 0, due = 0, now = Date.now();
      rep.lines.forEach(function (ln) { var s = lineState(rep, ln); if (s && s.learned) { learned++; if ((s.due || 0) <= now) due++; } });
      grid.appendChild(h('button', { class: 'card theme', type: 'button', style: { padding: '18px' }, onclick: function () { App.go('openings', { rep: rep.id }); } },
        h('div', { class: 'row tight' }, UI.turnPill(sideNum(rep.side), rep.side === 'w' ? 'As White' : 'As Black')),
        h('b', { style: { fontSize: '18px', fontFamily: 'var(--serif)', fontWeight: 400 } }, rep.name),
        h('span', { class: 'muted small' }, rep.summary),
        h('div', { class: 'row', style: { marginTop: '6px' } }, h('div', { class: 'grow' }, UI.meter(learned / rep.lines.length, 'green')), h('span', { class: 'faint small' }, learned + '/' + rep.lines.length + ' lines')),
        due ? h('span', { class: 'chip gold' }, U.plural(due, 'line') + ' ready to drill') : null));
    });
    root.appendChild(grid);
    if (D.traps.length) {
      root.appendChild(h('h2', { style: { margin: '26px 0 12px' } }, 'Traps to know'));
      var tg = h('div', { class: 'theme-grid' });
      D.traps.forEach(function (t) {
        var seen = Store.state.openings.lines['trap/' + t.id];
        tg.appendChild(h('button', { class: 'theme', type: 'button', onclick: function () { App.go('openings', { trap: t.id }); } },
          h('b', null, t.name), h('span', { class: 'muted small' }, t.summary),
          h('div', { class: 'row tight' }, h('span', { class: 'chip' }, t.side === 'w' ? 'For White' : 'For Black'), seen ? h('span', { class: 'chip green' }, U.icon('check'), 'Done') : null)));
      });
      root.appendChild(tg);
    }
  }

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
    ms.forEach(function (m, i) { if (i % 2 === 0) out += (i / 2 + 1) + '.'; out += m + ' '; });
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
    var board = new Board({ orient: side, coords: Store.state.settings.coords !== false, onMove: onMove });
    var noteBox = h('div', { class: 'lesson-text' }), fbBox = h('div'), actions = h('div', { class: 'row' }), movesLine = h('div', { class: 'muted small' });
    root.appendChild(h('div', { class: 'arena' }, h('div', { class: 'board-col' }, board.el),
      h('div', { class: 'panel' }, h('div', { class: 'card stack' }, movesLine, noteBox, fbBox, actions))));

    function paint(last) {
      board.setPosition(st.pos, { last: last || null, animate: true, clearLast: !last });
      movesLine.textContent = movesText(moves.slice(0, st.ply)) || 'Starting position';
    }
    function note(ply) {
      U.clear(noteBox);
      var text = notes[ply] != null ? notes[ply] : null;
      if (text) noteBox.appendChild(U.rich(text));
      else if (mode === 'drill') noteBox.appendChild(h('p', { class: 'muted' }, st.ply < moves.length ? 'Play the repertoire move.' : ''));
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
          sound(m); paint(m);
          if (mode !== 'drill') note(st.ply - 1);
          step();
        }, mode === 'drill' ? 450 : 700);
        return;
      }
      board.setMovable(side);
      if (mode === 'learn' || mode === 'trap-practice') {
        var exp = st.pos.parseMove(moves[st.ply]);
        if (exp && (st.misses[st.ply] || mode === 'learn' && st.ply < 2)) board.setArrows([{ from: C.sqName(exp & 127), to: C.sqName((exp >> 7) & 127), color: 'gold', opacity: '0.55' }]);
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
        fb('no', mode === 'drill' ? 'The repertoire move is ' + san + '.' : 'In this line, play ' + san + '.');
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
      if (mode === 'learn') { rec.learned = true; rec.due = rec.due || Date.now(); }
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
        actions.appendChild(h('button', { class: 'btn', type: 'button', onclick: function () { playLine(rep, line, 'learn'); } }, 'Again'));
      } else actions.appendChild(h('button', { class: 'btn primary', type: 'button', onclick: function () { App.go('openings'); } }, 'Done'));
    }

    // trap walkthrough uses Back / Next buttons
    if (mode === 'trap') {
      var prevB = h('button', { class: 'btn', type: 'button', onclick: function () { go(st.ply - 1); } }, U.icon('back'), 'Back');
      var nextB = h('button', { class: 'btn primary', type: 'button', onclick: function () { if (st.ply >= moves.length) finished(); else go(st.ply + 1); } }, 'Next', U.icon('next'));
      actions.appendChild(prevB); actions.appendChild(h('span', { class: 'grow' })); actions.appendChild(nextB);
      var go = function (n) {
        n = Math.max(0, Math.min(moves.length, n));
        st.pos = new C.Pos(); var last = null;
        for (var i = 0; i < n; i++) { last = st.pos.parseMove(moves[i]); st.pos.make(last); }
        st.ply = n;
        if (last) sound(last);
        paint(last);
        U.clear(noteBox);
        if (n === 0) noteBox.appendChild(U.rich(line.summary));
        else note(n - 1);
        prevB.disabled = n === 0;
        nextB.firstChild.textContent = n >= moves.length ? 'Finish' : 'Next';
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
          var m = st.pos.parseMove(moves[st.ply]); st.pos.make(m); st.ply++; sound(m); paint(m); auto();
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
            var mm = st.pos.parseMove(moves[st.ply]); st.pos.make(mm); st.ply++; sound(mm); paint(mm); note(st.ply - 1); rest();
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
    if (mode === 'trap-practice') { U.clear(noteBox); noteBox.appendChild(h('p', null, 'Play the ' + (side === 'w' ? 'White' : 'Black') + ' moves. The other side plays the trap line.')); }
    if (mode === 'drill') note(0);
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
  return {};
})();
