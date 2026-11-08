/* Tempo learn: units and lessons, the lesson player, practice rounds, and spaced review.

   A lesson is a list of steps, shown one at a time:
     read   a position and a few sentences, sometimes with moves played out
     quiz   a question with choices
     pick   click the squares the text asks for
     move   find the move (and the moves after it); practice puzzles are move steps too
     play   play a position out against the engine for a goal
     walk   step through a line of moves, with a note on each move that matters
     line   play your side of a line while the computer plays the other side: guided by arrows, or from memory
     safe   find a good move: the engine checks it; a tempting bait move is shown failing
     game   a practice game from move 1 against an opponent who varies between the lines you know
   Trap lessons name a trap ({ trap: id }) and their steps are filled in from the trap's data in content/openings.js.

   Every lesson you finish comes back for review on a schedule (boxes: 1, 3, 7, 16, 35 days). A review mixes items from
   the lessons that are due; getting all of one lesson's items right moves it a box up, a miss brings it back tomorrow.
   A lesson in box 4 or higher is locked in. */
var Learn = (function () {
  'use strict';
  var h = U.h, C = TempoCore;
  var L = null; // the player that's running
  var DAY = 86400000, GAPS = [0, 1, 3, 7, 16, 35], LOCKED = 4;
  var INTERACTIVE = { move: 1, pick: 1, quiz: 1, play: 1, line: 1, safe: 1, game: 1 };

  function done(id) { return Store.state.learn.done[id]; }
  function eachLesson(fn) { var n = 0; Data.lessons().forEach(function (u) { u.lessons.forEach(function (l) { fn(u, l, n++); }); }); }
  function nextLesson() {
    var units = Data.lessons();
    for (var i = 0; i < units.length; i++) for (var j = 0; j < units[i].lessons.length; j++) {
      if (!done(units[i].lessons[j].id)) return { unit: units[i], lesson: units[i].lessons[j] };
    }
    return null;
  }
  function open(id, from) { App.go('learn', from ? { lesson: id, from: from } : { lesson: id }); }
  function sans(x) { return Array.isArray(x) ? x.slice() : String(x || '').trim().split(/\s+/).filter(Boolean); }
  function colorName(c) { return c === 'w' ? 'White' : 'Black'; }
  function other(c) { return c === 'w' ? 'b' : 'w'; }
  function sideNum(c) { return c === 'w' ? 1 : -1; }
  function sideOf(pos) { return pos.side === 1 ? 'w' : 'b'; }
  function startPos(s) { return s.fen ? new C.Pos(s.fen) : new C.Pos(); }
  /* a line of moves in the board's own SAN (check marks, castling, disambiguation), so lines written by hand compare
     exactly with the moves played; it stops at the first move that isn't legal */
  function canon(list, fen) {
    var p = fen ? new C.Pos(fen) : new C.Pos(), out = [];
    for (var i = 0; i < list.length; i++) {
      var m = p.parseMove(list[i]);
      if (!m) { if (typeof console !== 'undefined') console.warn('learn: move ' + (i + 1) + ' (' + list[i] + ') is not legal in ' + list.join(' ')); break; }
      out.push(p.san(m)); p.make(m);
    }
    return out;
  }
  /* "1.e4 e5 2.Nf3" for SAN moves played from a position whose first mover is `firstWhite` at full move `full` */
  function movesText(list, pos0) {
    var out = '', white = !pos0 || pos0.side === 1, n = pos0 ? pos0.full || 1 : 1;
    list.forEach(function (m, i) {
      if (white) out += n + '.'; else if (i === 0) out += n + '...';
      out += m.replace(/-/g, '‑') + ' ';
      if (!white) n++;
      white = !white;
    });
    return out.trim();
  }
  function soundFor(pos, m) { if (pos.inCheck()) U.sound.check(); else if ((m >>> 17) & 1) U.sound.capture(); else U.sound.move(); }
  function midnight(now, days) { var d = new Date(now); return new Date(d.getFullYear(), d.getMonth(), d.getDate() + days).getTime(); }

  /* ---------- traps: a trap lesson's steps come from the trap ---------- */
  function trapOf(id) { return Data.reps().traps.filter(function (x) { return x.id === id; })[0] || null; }
  /* who sets the trap: the data says so; older data says it through trapper/side */
  function setterOf(t) { return t.setter || (t.trapper && t.trapper !== t.side ? t.trapper : t.side); }
  function keyOf(t) { return Number.isInteger(t.key) ? t.key : Number.isInteger(t.keyPly) ? t.keyPly : null; }
  function resolve(s) {
    if (!s) return { t: 'read', text: '' };
    if (s.resolved) return s.resolved;
    var r;
    if (s.trap) {
      var t = trapOf(s.trap);
      if (!t) r = { t: 'read', text: 'This trap is missing from this build.' };
      else {
        var moves = sans(t.moves), setter = setterOf(t), victim = other(setter), key = keyOf(t);
        if (s.t === 'walk') r = { t: 'walk', moves: moves, notes: t.notes || {}, orient: t.side, text: t.summary, end: t.lesson };
        else if (s.t === 'line') {
          var defend = s.role === 'defend' || (!!t.noSet && s.role !== 'set');
          var side = defend ? t.side : setter, who = colorName(side);
          r = { t: 'line', moves: moves, side: side, guide: !!s.guide, done: t.lesson,
            text: s.text || (defend
              ? (s.guide ? '**Defend it.** You’re ' + who + '. Play ' + who + '’s moves. The arrows show the way.' : '**From memory.** Play ' + who + '’s moves again, with no arrows.')
              : (s.guide ? '**Set it.** You’re ' + who + '. Play ' + who + '’s moves, and the computer will fall for it. The arrows show the way.' : '**From memory.** Set the trap again as ' + who + ', with no arrows this time.')) };
          if (s.deviate && !defend && key != null && t.safe) r.deviate = { at: key, move: t.safe };
        } else if (s.t === 'safe') {
          if (key == null) r = { t: 'read', text: t.lesson };
          else {
            var custom = !!t.bait;
            // the trap's notes speak to the side the lesson is told from: shown while the trap plays out only when that side is you
            r = { t: 'safe', moves: moves.slice(0, key), side: victim, bait: t.bait || moves[key], punish: custom ? sans(t.punish) : moves.slice(key + 1),
              baitAt: key, notes: custom || t.side !== victim ? {} : (t.notes || {}), aim: t.safe ? [t.safe] : null, note: t.safeNote || '', baitNote: t.baitNote || '',
              text: s.text || ('**Dodge it.** Now you’re ' + colorName(victim) + ', and the computer sets the trap. When it’s your move, don’t take the bait.') };
          }
        } else r = { t: 'read', text: t.summary };
        r.trap = t.id;
      }
    } else {
      r = Object.assign({}, s);
      if (r.t === 'walk' || r.t === 'line' || r.t === 'safe') r.moves = sans(r.moves);
      if (r.t === 'safe') { if (r.punish) r.punish = sans(r.punish); if (r.aim && !Array.isArray(r.aim)) r.aim = [r.aim]; }
      if (r.t === 'game') r.lines = (r.lines || []).map(function (ln) { return canon(sans(ln), r.fen); }).filter(function (ln) { return ln.length; });
    }
    if (s.from) { r.from = s.from; r.fromTitle = s.fromTitle; }
    s.resolved = r;
    return r;
  }

  /* ---------- memory: when each finished lesson comes back ---------- */
  function memAll() { var S = Store.state.learn; if (!S.mem || typeof S.mem !== 'object' || Array.isArray(S.mem)) S.mem = {}; return S.mem; }
  function reviewable(l) { return !!l.trap || l.steps.some(function (s) { return INTERACTIVE[s.t]; }); }
  /* lessons finished before reviews existed join the schedule: three are due today, three more each day after, in course order */
  function settle() {
    var M = memAll(), now = Date.now(), k = 0, changed = false;
    eachLesson(function (u, l) {
      if (!done(l.id) || M[l.id] || !reviewable(l)) return;
      M[l.id] = { box: 1, due: k < 3 ? now - 1000 : midnight(now, Math.floor(k / 3)), n: 0, ok: 0, k: 0 };
      k++; changed = true;
    });
    if (changed) Store.touch('learn');
  }
  function dueList(now) {
    now = now || Date.now();
    var M = memAll(), out = [];
    eachLesson(function (u, l, n) { var r = M[l.id]; if (r && done(l.id) && r.due <= now && reviewable(l)) out.push({ unit: u, lesson: l, rec: r, order: n }); });
    out.sort(function (a, b) { return (a.rec.due - b.rec.due) || (a.order - b.order); });
    return out;
  }
  function nextDueAt() {
    var M = memAll(), best = null;
    eachLesson(function (u, l) { var r = M[l.id]; if (r && done(l.id) && reviewable(l) && (best == null || r.due < best)) best = r.due; });
    return best;
  }
  function lockedIn(id) { var r = memAll()[id]; return !!(r && r.box >= LOCKED && done(id)); }
  /* a lesson finished for the first time comes back tomorrow */
  function learned(id) {
    var M = memAll();
    if (M[id]) return false;
    M[id] = { box: 1, due: midnight(Date.now(), 1), n: 0, ok: 0, k: 0 };
    return true;
  }
  function grade(id, ok) {
    var M = memAll(), r = M[id] || (M[id] = { box: 0, due: 0, n: 0, ok: 0, k: 0 }), now = Date.now();
    r.n = (r.n || 0) + 1; if (ok) r.ok = (r.ok || 0) + 1;
    r.box = ok ? Math.min(5, (r.box || 0) + 1) : 1;
    r.due = midnight(now, GAPS[r.box]);
    r.k = (r.k || 0) + 1;
    Store.touch('learn');
    return r;
  }
  function whenText(due) {
    var days = Math.round((midnight(due, 0) - midnight(Date.now(), 0)) / DAY);
    return days <= 0 ? 'today' : days === 1 ? 'tomorrow' : 'in ' + days + ' days';
  }

  /* ---------- practice puzzles ---------- */
  /* the puzzle theme that practices each lesson */
  var PRACTICE = { 'fork': 'fork', 'pin': 'pin', 'skewer': 'skewer', 'discovered-attack': 'discoveredAttack', 'remove-defender': 'capturingDefender',
    'deflection-decoy': 'deflection', 'trapped-piece': 'trappedPiece', 'back-rank': 'backRankMate', 'smothered-mate': 'smotheredMate', 'mating-patterns': 'mateIn2',
    'free-pieces': 'hangingPiece', 'check-mate-stalemate': 'mateIn1', 'passed-pawns': 'advancedPawn', 'rook-endgames': 'rookEndgame', 'king-pawn': 'pawnEndgame', 'overload': 'deflection' };
  function practiceTheme(id) { return PRACTICE[id] || null; }
  var PROMPT = { fork: 'Find the fork.', pin: 'Use a pin to win something.', skewer: 'Find the skewer.', discoveredAttack: 'Find the discovered attack.',
    capturingDefender: 'Take away a defender, then win what it guarded.', deflection: 'Pull a defender away from its job.', trappedPiece: 'Trap a piece.',
    backRankMate: 'Checkmate on the back rank.', smotheredMate: 'Find the smothered mate.', mateIn1: 'Checkmate in one move.', mateIn2: 'Checkmate in two moves.',
    hangingPiece: 'Win the piece that isn’t defended.', advancedPawn: 'Use your advanced pawn.', rookEndgame: 'Find the best move in this rook endgame.', pawnEndgame: 'Find the move that wins this pawn endgame.' };
  function clamp(x, lo, hi) { return Math.max(lo, Math.min(hi, x)); }
  /* n puzzles on a theme near a rating, unseen ones first, easiest first; they count as seen from now on */
  function pickPuzzles(theme, target, n) {
    return Data.puzzles().then(function (list) {
      var bits = Store.seenBits(), seen = function (p) { return (bits[p.i >> 3] >> (p.i & 7)) & 1; };
      var all = list.filter(function (p) { return p.themes.indexOf(theme) >= 0; });
      var near = all.filter(function (p) { return p.rating <= target + 600; });
      if (near.length < n) near = all.slice().sort(function (a, b) { return a.rating - b.rating; }).slice(0, Math.max(n, 12));
      near.sort(function (a, b) { return Math.abs(a.rating - target) - Math.abs(b.rating - target); });
      var fresh = near.filter(function (p) { return !seen(p); }), pool = (fresh.length >= n ? fresh : near).slice(0, Math.max(4 * n, 16));
      var out = U.shuffle(pool.slice()).slice(0, n).sort(function (a, b) { return a.rating - b.rating; });
      out.forEach(function (p) { bits[p.i >> 3] |= 1 << (p.i & 7); });
      if (out.length) Store.saveBits(bits);
      return out;
    }).catch(function () { return []; });
  }
  /* a Lichess puzzle as a move step: the opponent's move first, then yours */
  function puzzleStep(p, theme) {
    var pos = new C.Pos(p.fen), who = pos.side === 1 ? 'Black' : 'White';
    var mates = p.themes.filter(function (t) { return /^mateIn\d$/.test(t); })[0];
    var ask = mates && mates !== theme ? (mates === 'mateIn1' ? 'Checkmate in one move.' : 'Checkmate in ' + mates.slice(6) + ' moves.') : (PROMPT[theme] || 'Find the best move.');
    return { t: 'move', fen: p.fen, pre: p.moves[0], line: p.moves.slice(1), mate: p.themes.indexOf('mate') >= 0, puzzle: p.id,
      text: '**' + who + ' to move.** ' + ask, done: 'Solved.' };
  }

  /* ---------- the units page ---------- */
  var openUnits = {}, scrollTo = null;
  function renderUnits(root) {
    settle();
    var units = Data.lessons(), total = 0, finished = 0, locked = 0;
    eachLesson(function (u, l) { total++; if (done(l.id)) finished++; if (lockedIn(l.id)) locked++; });
    root.appendChild(h('div', { class: 'page-head' }, h('h1', null, 'Learn'),
      h('div', { class: 'head-note' }, h('b', { class: 'num' }, finished + ' of ' + total), ' lessons done', locked ? h('span', null, ' · ', h('b', { class: 'num' }, String(locked)), ' locked in') : null)));
    var due = dueList();
    if (due.length) {
      var mins = minutesFor(due.slice(0, 5));
      root.appendChild(h('div', { class: 'resume review-due', style: { marginBottom: '12px' } },
        h('span', { class: 'rv-ic', 'aria-hidden': 'true' }, U.icon('refresh')),
        h('p', { class: 'grow' }, h('b', null, 'Review: ' + (due.length === 1 ? '1 lesson is due. ' : due.length + ' lessons are due. ')),
          h('span', { class: 'muted' }, 'About ' + U.plural(mins, 'minute') + '.')),
        h('button', { class: 'btn primary small', type: 'button', onclick: function () { App.go('learn', { review: 1 }); } }, 'Start review')));
    } else if (finished) {
      var at = nextDueAt();
      if (at) root.appendChild(h('p', { class: 'muted small review-none', style: { margin: '-6px 0 14px' } }, 'Nothing to review today. Your next review is ' + whenText(at) + '.'));
    }
    var nx = nextLesson();
    if (nx) root.appendChild(h('div', { class: 'resume', style: { marginBottom: '20px' } },
      h('p', { class: 'grow' }, h('b', null, 'Up next: ' + nx.lesson.title + '. '), h('span', { class: 'muted' }, nx.lesson.summary)),
      h('button', { class: 'btn ' + (due.length ? '' : 'primary ') + 'small', type: 'button', onclick: function () { open(nx.lesson.id); } }, finished ? 'Continue' : 'Start')));
    if (!units.length) root.appendChild(h('div', { class: 'empty' }, 'Lessons are missing from this build.'));
    var col = h('div', { class: 'stack', style: { gap: '12px' } });
    units.forEach(function (u, ui) {
      var n = u.lessons.filter(function (l) { return done(l.id); }).length, all = n === u.lessons.length;
      var lk = u.lessons.filter(function (l) { return lockedIn(l.id); }).length;
      // the unit you're working through starts open; any unit stays the way you left it while the app is open
      var isOpen = openUnits[u.id] != null ? openUnits[u.id] : !!(nx && nx.unit.id === u.id);
      var card = h('div', { class: 'card unit-card', id: 'unit-card-' + u.id });
      // the body folds smoothly: an outer grid row eases between 0 and its content's height, the inner box clips
      var inner = h('div', { class: 'unit-inner' });
      var body = h('div', { class: 'unit-body' + (isOpen ? ' open' : ''), id: 'unit-' + u.id }, inner);
      var sub = all ? 'All ' + u.lessons.length + ' lessons done' : n ? n + ' of ' + u.lessons.length + ' lessons done' : U.plural(u.lessons.length, 'lesson');
      if (lk) sub += ' · ' + (lk === u.lessons.length ? 'all locked in' : lk + ' locked in');
      var head = h('button', { class: 'unit-head', type: 'button', 'aria-expanded': isOpen ? 'true' : 'false', 'aria-controls': 'unit-' + u.id,
        onclick: function () { var on = !body.classList.contains('open'); body.classList.toggle('open', on); head.setAttribute('aria-expanded', on ? 'true' : 'false'); openUnits[u.id] = on; } },
        h('span', { class: 'unit-num' + (all ? ' done' : '') }, all ? U.icon('check') : String(ui + 1)),
        h('span', { class: 'txt' }, h('span', { class: 't' }, u.title), h('span', { class: 's' }, sub)),
        U.icon('next', 'chev'));
      card.appendChild(head);
      inner.appendChild(h('p', { class: 'muted', style: { margin: '0 0 10px' } }, u.summary));
      if (n && !all) inner.appendChild(h('div', { style: { margin: '0 0 6px' } }, UI.meter(n / u.lessons.length, 'green')));
      var list = h('div', { class: 'list' });
      var now = Date.now(), M = memAll();
      u.lessons.forEach(function (l) {
        var d = done(l.id), r = M[l.id], state = d && r ? (r.box >= LOCKED ? 'locked' : r.due <= now ? 'due' : null) : null;
        list.appendChild(h('button', { class: 'list-row lesson-row', type: 'button', onclick: function () { open(l.id); } },
          h('span', { class: 'tick' + (d ? ' done' : '') }, d ? U.icon('check') : null),
          h('div', { class: 'grow' }, h('div', { style: { fontWeight: 600 } }, l.title), h('div', { class: 'muted small' }, l.summary)),
          h('div', { class: 'lesson-end' },
            d ? UI.stars(d.stars) : h('span', { class: 'faint small' }, stepsWord(l)),
            state ? h('span', { class: 'mem ' + state }, state === 'locked' ? 'Locked in' : 'Review due') : null)));
      });
      inner.appendChild(list);
      card.appendChild(body);
      col.appendChild(card);
    });
    root.appendChild(col);
    if (scrollTo) {
      var target = scrollTo; scrollTo = null;
      setTimeout(function () { var el = document.getElementById('unit-card-' + target); if (el) try { el.scrollIntoView({ block: 'start', behavior: U.calm() ? 'auto' : 'smooth' }); } catch (e) { /* old browser */ } }, 30);
    }
  }
  function stepsWord(l) { return l.trap ? U.plural(l.steps.length, 'step') : U.plural(l.steps.length + (PRACTICE[l.id] ? 5 : 0), 'step'); }
  /* open the Learn page with one unit unfolded and in view */
  function openUnit(id) { openUnits[id] = true; scrollTo = id; App.go('learn'); }

  /* ---------- the player ---------- */
  /* spec: { mode: 'lesson' | 'practice' | 'review', id, title, sub, crumb: { label, go }, steps, start, onStep(i, step, ok), onFinish(st) }
     Returns { add(steps) } so a lesson can add its practice round once the puzzles are ready. */
  function player(root, spec) {
    App.focus(true);
    var steps = spec.steps;
    var st = { i: 0, mistakes: 0, hints: 0, tm: 0, th: 0, pTotal: 0, pOk: 0, token: 0, engineTok: 0, board: null, id: spec.id || null, mode: spec.mode,
      practice: spec.mode === 'practice', review: spec.mode === 'review', steps: steps, stepIx: -1, sm: 0, sh: 0, graded: {} };
    L = st;
    var stepper = h('div', { class: 'stepper', 'aria-hidden': 'true' });
    function paintDots() {
      U.clear(stepper);
      steps.forEach(function (s) { stepper.appendChild(h('i', { class: s.practiceRound ? 'pr' : null })); });
    }
    paintDots();
    root.appendChild(h('div', { class: 'row between', style: { marginBottom: '8px' } },
      h('button', { class: 'back', type: 'button', onclick: spec.crumb.go }, U.icon('back'), spec.crumb.label),
      h('span', { class: 'muted small' }, spec.sub || '')));
    root.appendChild(h('h1', { style: { fontSize: '26px', marginBottom: '10px' } }, spec.title));
    root.appendChild(stepper);
    var board = new Board({ orient: 'w', coords: Store.state.settings.coords !== false, onMove: onMove, onSquare: null, autoQueen: false });
    st.board = board;
    var textBox = h('div', { class: 'lesson-text' }), movesEl = h('div', { class: 'line-moves muted small', 'aria-live': 'off' }), feedback = h('div'),
      actions = h('div', { class: 'row lesson-actions' }), stepNo = h('div', { class: 'faint small' });
    var panel = h('div', { class: 'card stack' }, stepNo, textBox, movesEl, feedback, actions);
    root.appendChild(h('div', { class: 'arena', style: { marginTop: '14px' } }, h('div', { class: 'board-col' }, board.el), h('div', { class: 'panel' }, panel)));

    function cur() { return resolve(steps[st.i]); }
    function paintStepper() {
      Array.prototype.forEach.call(stepper.children, function (el, k) { el.className = (steps[k] && steps[k].practiceRound ? 'pr ' : '') + (k < st.i ? 'done' : k === st.i ? 'on' : ''); });
      var s = steps[st.i];
      if (st.review) stepNo.textContent = (st.i + 1) + ' of ' + steps.length + (s.fromTitle ? ' · ' + s.fromTitle : '');
      else if (s && s.practiceRound) {
        var first = steps.findIndex(function (x) { return x.practiceRound; }), all = steps.filter(function (x) { return x.practiceRound; }).length;
        stepNo.textContent = 'Practice ' + (st.i - first + 1) + ' of ' + all;
      } else stepNo.textContent = 'Step ' + (st.i + 1) + ' of ' + steps.length;
    }
    /* the step's own mistakes and hints: kept while you retry it, so a restart still counts the miss */
    function miss() { st.mistakes++; st.sm++; if (!steps[st.i].practiceRound) st.tm++; }
    function hinted() { st.hints++; st.sh++; if (!steps[st.i].practiceRound) st.th++; }
    function stepDone() {
      if (st.graded[st.i]) return;
      st.graded[st.i] = true;
      var ok = st.sm === 0 && st.sh === 0, s = steps[st.i];
      if (s.practiceRound) { st.pTotal++; if (ok) st.pOk++; }
      if (spec.onStep && INTERACTIVE[resolve(s).t]) spec.onStep(st.i, s, ok);
    }
    function orientFor(s, pos) {
      if (s.orient) return s.orient;
      if (s.pre) return pos.side === 1 ? 'b' : 'w';
      return sideOf(pos);
    }
    function show(i) {
      if (i !== st.stepIx) { st.stepIx = i; st.sm = 0; st.sh = 0; }
      st.i = i; st.token++; st.engineTok++; st.ply = 0; st.picked = []; st.tries = 0; st.complete = false; st.hintLevel = 0; st.ready = false;
      st.history = null; st.free = false; st.checking = false; st.played = []; st.lineMiss = {};
      var s = cur();
      paintStepper();
      U.clear(textBox); U.clear(feedback); U.clear(actions); movesEl.textContent = '';
      if (s.text) textBox.appendChild(U.rich(s.text));
      board.opts.onSquare = null;
      board.clearDecor();
      board.setArrows([]);
      if (s.t === 'walk' || s.t === 'line' || s.t === 'safe' || s.t === 'game') {
        st.pos = startPos(s);
        board.setOrientation(s.t === 'walk' ? (s.orient || 'w') : s.side || sideOf(st.pos));
        board.setMovable(null);
        board.setPosition(st.pos, { animate: false, last: null, clearLast: true });
      } else if (s.fen) {
        st.pos = new C.Pos(s.fen);
        board.setOrientation(orientFor(s, st.pos));
        board.setMovable(null);
        board.setPosition(st.pos, { animate: false, last: null, clearLast: true });
        board.setArrows((s.arrows || []).map(function (a) { return { from: a.slice(0, 2), to: a.slice(2, 4), color: 'gold' }; }));
        board.setMarks((s.marks || []).map(function (m) { return { sq: m, kind: 'gold' }; }).concat(boxMarks(s, st.pos)));
      } else {
        st.pos = new C.Pos(C.START_FEN);
        board.setOrientation(s.orient || 'w');
        board.setMovable(null);
        board.setPosition(st.pos, { animate: false, clearLast: true });
      }
      ({ read: stepRead, move: stepMove, pick: stepPick, quiz: stepQuiz, play: stepPlay, walk: stepWalk, line: stepLine, safe: stepSafe, game: stepGame }[s.t] || stepRead)(s);
    }
    function navRow(canNext, label) {
      U.clear(actions);
      if (st.i > 0 && !st.review) actions.appendChild(h('button', { class: 'btn quiet', type: 'button', onclick: function () { show(st.i - 1); } }, U.icon('back'), 'Back'));
      actions.appendChild(h('span', { class: 'grow' }));
      if (!canNext) return null;
      var nx = h('button', { class: 'btn primary', type: 'button', onclick: function () { advance(); } }, label || (st.i === steps.length - 1 ? 'Finish' : 'Next'), U.icon('next'));
      actions.appendChild(nx);
      if (st.complete) setTimeout(function () { if (document.activeElement === document.body || !document.activeElement) try { nx.focus({ preventScroll: true }); } catch (e) { /* ignore */ } }, 0);
      return nx;
    }
    function tool(btn) { actions.insertBefore(btn, actions.querySelector('.grow')); }
    function advance() { if (st.i < steps.length - 1) show(st.i + 1); else finish(); }
    function finish() { st.token++; st.engineTok++; board.setMovable(null); spec.onFinish(st); }
    function fb(kind, text) { U.clear(feedback); if (text) feedback.appendChild(h('div', { class: 'feedback ' + kind }, U.rich(text))); }
    function ourColour() { return sideOf(st.pos); }
    function paintMoves(s) { movesEl.textContent = st.played.length ? movesText(st.played, startPos(s)) : ''; }
    function arrowFor(m, strong) { board.setArrows([{ from: C.sqName(m & 127), to: C.sqName((m >> 7) & 127), color: 'green', opacity: strong ? null : '0.7' }]); }

    /* read */
    function stepRead(s) {
      navRow(true);
      st.complete = true;
      if (s.play && s.play.length) {
        tool(h('button', { class: 'btn small', type: 'button', onclick: function () { animatePlay(s); } }, U.icon('refresh'), 'Replay'));
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
          p.make(m);
          board.setPosition(p, { last: m, animate: true, natural: true, landed: function () { U.sound.move(); } });
          if (s.box) board.setMarks(boxMarks(s, p));
          stepAnim();
        }, k === 0 ? 600 : 850);
      })();
    }

    /* move: a puzzle with one solution; s.pre is a move the other side plays first (how practice puzzles start) */
    function stepMove(s) {
      navRow(false);
      tool(h('button', { class: 'btn small', type: 'button', onclick: function () {
        if (!st.ready || st.complete) return;
        hinted(); st.hintLevel++;
        if (st.hintLevel === 1 && s.hint) fb('info', s.hint);
        else { var mv = s.line[st.ply], pc = PIECE_NAME[Math.abs(st.pos.b[C.sqIndex(mv.slice(0, 2))])] || 'piece'; board.setMarks([{ sq: mv.slice(0, 2), kind: 'hint' }]); fb('info', (s.hint ? s.hint + ' ' : '') + 'Move your ' + pc + ' on ' + mv.slice(0, 2) + '.'); }
      } }, U.icon('hint'), 'Hint'));
      if (!s.pre) { st.ready = true; board.setMovable(ourColour()); return; }
      var tok = st.token;
      setTimeout(function () {
        if (tok !== st.token) return;
        var m = st.pos.parseMove(s.pre); if (!m) { st.ready = true; board.setMovable(ourColour()); return; }
        st.pos.make(m);
        var at = st.pos.clone();
        board.setPosition(st.pos, { last: m, animate: true, natural: true, landed: function () { soundFor(at, m); } });
        st.ready = true;
        board.setMovable(ourColour());
      }, 550);
    }
    function onMove(uci, m) {
      var s = cur();
      if (s.t === 'play') return playMove(uci, m);
      if (s.t === 'line') return lineMove(uci, m);
      if (s.t === 'safe') return safeMove(uci, m);
      if (s.t === 'game') return gameMove(uci, m);
      if (s.t !== 'move' || st.complete || !st.ready) return;
      var expected = s.line[st.ply], extra = (s.accept && s.accept[st.ply]) || [];
      var after = st.pos.clone(); after.make(m);
      var mates = !!s.mate && after.status().reason === 'checkmate';
      var ok = uci === expected || extra.indexOf(uci) >= 0 || mates;
      if (!ok) {
        miss(); st.tries++;
        U.sound.bad();
        board.setMovable(null);
        board.setPosition(after, { last: m, animate: true });
        var msg = (s.wrong && s.wrong[uci]) || wrongWhy(m, after);
        if (!(s.wrong && s.wrong[uci]) && st.tries >= 2 && s.hint && st.hintLevel === 0) { msg += ' Hint: ' + s.hint; st.hintLevel = 1; }
        fb('no', msg);
        var tok = st.token;
        setTimeout(function () { if (tok !== st.token) return; board.setPosition(st.pos, { animate: true, clearLast: true }); board.setMovable(ourColour()); }, 900);
        return;
      }
      st.pos.make(m);
      soundFor(after, m);
      board.setPosition(st.pos, { last: m, animate: true });
      board.setMarks([]); board.setArrows([]);
      st.ply++;
      if (st.ply >= s.line.length || mates) { complete(s); return; }
      board.setMovable(null);
      fb('ok', 'Good. Keep going.');
      var tok2 = st.token;
      setTimeout(function () {
        if (tok2 !== st.token) return;
        var r = st.pos.parseMove(s.line[st.ply]);
        st.pos.make(r); st.ply++;
        var at = st.pos.clone();
        board.setPosition(st.pos, { last: r, animate: true, natural: true, landed: function () { soundFor(at, r); } });
        board.setMovable(ourColour());
        U.clear(feedback);
      }, 550);
    }
    function complete(s, text) {
      st.complete = true;
      board.setMovable(null);
      U.sound.good();
      fb('ok', text || s.done || 'Correct.');
      stepDone();
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
      tool(h('button', { class: 'btn small primary', type: 'button', onclick: function () {
        var want = s.squares.slice().sort().join(','), got = st.picked.slice().sort().join(',');
        if (want === got) {
          st.complete = true; U.sound.good();
          board.setPicked([]);
          board.setMarks(s.squares.map(function (q) { return { sq: q, kind: 'green' }; }));
          fb('ok', s.done || 'Correct.');
          stepDone(); navRow(true);
        } else {
          miss(); st.tries++; U.sound.bad();
          var right = st.picked.filter(function (q) { return s.squares.indexOf(q) >= 0; }).length;
          if (st.tries >= 2) {
            st.complete = true;
            board.setPicked([]);
            board.setMarks(s.squares.map(function (q) { return { sq: q, kind: 'green' }; }));
            fb('info', 'Here are the answers. ' + (s.done || ''));
            stepDone(); navRow(true);
          } else fb('no', pickFeedback(s, right));
        }
      } }, 'Check'));
    }

    /* quiz */
    function stepQuiz(s) {
      navRow(false);
      var box = h('div', { class: 'choices' });
      // a new order each time the question is shown, so where the right answer sits is never a clue
      U.shuffle(s.choices.map(function (c, k) { return k; })).forEach(function (k) {
        var c = s.choices[k];
        var b = h('button', { class: 'choice', type: 'button', 'data-k': String(k), onclick: function () {
          if (st.complete) return;
          if (k === s.answer) {
            b.classList.add('right'); st.complete = true; U.sound.good();
            fb('ok', s.done || 'Correct.'); stepDone(); navRow(true);
          } else { b.classList.add('wrong'); miss(); U.sound.bad(); fb('no', 'Not quite. Try another answer.'); }
        } }, c);
        box.appendChild(b);
      });
      textBox.appendChild(box);
    }

    /* play */
    function stepPlay(s) {
      st.learner = st.pos.side; st.moves = 0; st.history = [];
      board.setMovable(st.learner === 1 ? 'w' : 'b');
      navRow(false);
      var goalText = { mate: 'Checkmate within ' + s.limit + ' moves.', promote: 'Promote a pawn and keep it.', draw: 'Hold the draw' + (s.limit ? ' for ' + s.limit + ' moves.' : '.'), win: 'Win decisively' + (s.limit ? ' within ' + s.limit + ' moves.' : '.') }[s.goal];
      fb('info', goalText);
      var left = h('div', { class: 'moves-left muted small', 'aria-live': 'polite' });
      st.leftEl = left; paintLeft(s);
      feedback.appendChild(left);
      tool(h('button', { class: 'btn small', type: 'button', onclick: function () { show(st.i); } }, U.icon('refresh'), 'Restart'));
      tool(h('button', { class: 'btn small quiet', type: 'button', onclick: function () {
        hinted();
        Engines.analyse({ fen: s.fen, moves: st.history.slice(), depth: 14, movetime: 900 }).then(function (r) { if (r.best && !st.complete) board.setArrows([{ from: r.best.slice(0, 2), to: r.best.slice(2, 4), color: 'green' }]); });
      } }, U.icon('hint'), 'Hint'));
    }
    function playMove(uci, m) {
      var s = cur();
      if (st.complete) return;
      var promo = (m >> 14) & 7;
      st.pos.make(m); st.history.push(uci); st.moves++;
      board.setArrows([]);
      board.setMovable(null);
      if (st.pos.inCheck()) U.sound.check(); else U.sound.move();
      board.setPosition(st.pos, { last: m, animate: true });
      if (s.box) board.setMarks(boxMarks(s, st.pos));
      var status = st.pos.status();
      if (status.over) return judge(status);
      if (s.goal === 'promote' && promo) st.promoted = true;
      var tok = ++st.engineTok, me = st;
      Engines.analyse({ fen: s.fen, moves: st.history.slice(), depth: 16, movetime: 900 }).then(function (r) {
        if (tok !== st.engineTok || L !== me || cur() !== s) return;
        var l = r.lines[0];
        if (s.goal === 'win' && l && ((l.mate != null && l.mate < 0) || (l.cp != null && l.cp <= -500))) return success();
        if (!r.best) return;
        var em = st.pos.parseMove(r.best);
        st.pos.make(em); st.history.push(r.best);
        var at = st.pos.clone();
        board.setPosition(st.pos, { last: em, animate: true, natural: true, landed: function () { soundFor(at, em); } });
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
          return fail('Out of moves. Restart and look for a quicker way.');
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
      var s = cur();
      Engines.analyse({ fen: s.fen, moves: st.history.slice(), depth: 14, movetime: 900 }).then(function (r) {
        var l = r.lines[0] || { cp: 0 };
        var forLearner = (st.pos.side === st.learner ? 1 : -1) * (l.mate != null ? (l.mate > 0 ? 3000 : -3000) : l.cp);
        if (forLearner > -150) success(); else fail('The draw slipped away: the other side is winning now. Restart and stay in front of the pawn.');
      });
    }
    function judge(status) {
      var s = cur();
      if (status.reason === 'checkmate') {
        if (status.winner === st.learner) return success();
        return fail('You were checkmated. Restart and try again.');
      }
      if (s.goal === 'draw') return success();
      return fail(status.reason === 'stalemate' ? 'Stalemate: the defending king had no legal move. Leave it a square.' : 'The game ended in a draw. Restart and try again.');
    }
    function success(text) { st.complete = true; U.sound.good(); board.setMovable(null); fb('ok', text || cur().done || 'Done.'); stepDone(); navRow(true); }
    function fail(msg) { miss(); U.sound.bad(); board.setMovable(null); fb('no', msg); }

    /* walk: Back and Next through a line; Next plays on to the next move that has a note */
    function stepWalk(s) {
      var moves = s.moves, notes = s.notes || {}, walkTok = 0, p0 = startPos(s);
      var nextStop = function (n) { for (var k = n + 1; k < moves.length; k++) if (notes[k - 1] != null) return k; return moves.length; };
      var prevStop = function (n) { for (var k = n - 1; k > 0; k--) if (notes[k - 1] != null) return k; return 0; };
      U.clear(actions);
      var prevB = h('button', { class: 'btn', type: 'button', onclick: function () {
        walkTok++;
        if (st.ply === 0) { if (st.i > 0 && !st.review) show(st.i - 1); return; }
        go(prevStop(st.ply));
      } }, U.icon('back'), 'Back');
      var nextB = h('button', { class: 'btn primary', type: 'button', onclick: function () {
        if (st.ply >= moves.length) { advance(); return; }
        walk(nextStop(st.ply));
      } }, 'Next', U.icon('next'));
      actions.appendChild(prevB); actions.appendChild(h('span', { class: 'grow' })); actions.appendChild(nextB);
      function walk(target) {
        var tok = ++walkTok;
        (function stepOn() {
          if (tok !== walkTok || L !== st) return;
          go(st.ply + 1, st.ply + 1 < target);
          if (st.ply < target) setTimeout(stepOn, 480);
        })();
      }
      function go(n, passing) {
        n = Math.max(0, Math.min(moves.length, n));
        var p = p0.clone(), last = null;
        st.played = [];
        for (var i = 0; i < n; i++) { last = p.parseMove(moves[i]); if (!last) break; st.played.push(p.san(last)); p.make(last); }
        var forward = n === st.ply + 1;
        st.pos = p; st.ply = n;
        var at = p.clone();
        board.setPosition(p, { last: last || null, animate: true, clearLast: !last, natural: forward && !!last, landed: forward && last ? function () { soundFor(at, last); } : null });
        paintMoves(s);
        prevB.disabled = n === 0 && (st.i === 0 || st.review);
        var end = n >= moves.length;
        nextB.firstChild.textContent = end ? (st.i === steps.length - 1 ? 'Finish' : 'Next step') : 'Next';
        if (end && !st.complete) { st.complete = true; stepDone(); }
        if (passing) return; // moves on the way to the next note go by without one
        U.clear(textBox);
        if (n === 0) { if (s.text) textBox.appendChild(U.rich(s.text)); }
        else if (notes[n - 1] != null) textBox.appendChild(U.rich(notes[n - 1]));
        else textBox.appendChild(h('p', { class: 'muted' }, end ? 'That’s the whole line.' : 'Ordinary moves so far. Keep going.'));
        if (end && s.end) textBox.appendChild(h('div', { class: 'feedback ok' }, U.rich(s.end)));
      }
      st.go = go;
      prevB.disabled = st.i === 0 || st.review;
    }

    /* line: you play your side; the other side's moves come from the line */
    function stepLine(s) {
      navRow(false);
      if (!s.guide) tool(h('button', { class: 'btn small', type: 'button', onclick: lineHint }, U.icon('hint'), 'Hint'));
      tool(h('button', { class: 'btn small quiet', type: 'button', onclick: function () { show(st.i); } }, U.icon('refresh'), 'Restart'));
      paintMoves(s);
      lineStep();
    }
    function lineExpected() { var s = cur(); return st.pos.parseMove(s.moves[st.ply]); }
    function lineHint() {
      var s = cur(), exp = lineExpected();
      if (!exp || st.complete || st.free || st.pos.side !== sideNum(s.side)) return;
      hinted(); st.hintLevel++;
      if (st.hintLevel === 1) { var pc = PIECE_NAME[Math.abs(st.pos.b[exp & 127])] || 'piece'; board.setMarks([{ sq: C.sqName(exp & 127), kind: 'hint' }]); fb('info', 'Move your ' + pc + '.'); }
      else { arrowFor(exp, true); fb('info', 'This line plays ' + st.pos.san(exp) + ' here.'); }
    }
    function lineStep() {
      var s = cur(), moves = s.moves, you = sideNum(s.side);
      if (st.ply >= moves.length) return complete(s);
      if (st.pos.side !== you) {
        board.setMovable(null);
        var tok = st.token;
        setTimeout(function () {
          if (tok !== st.token) return;
          var dev = s.deviate && st.ply === s.deviate.at, m = st.pos.parseMove(dev ? s.deviate.move : moves[st.ply]);
          if (!m) return complete(s);
          var san = st.pos.san(m);
          st.pos.make(m); st.ply++; st.played.push(san);
          var at = st.pos.clone();
          board.setPosition(st.pos, { last: m, animate: true, natural: true, landed: function () { soundFor(at, m); } });
          paintMoves(s);
          if (dev) {
            st.free = true;
            fb('info', 'Your opponent didn’t take the bait: they played ' + san + '. Play a good move of your own.');
            board.setMovable(s.side);
            return;
          }
          lineStep();
        }, st.ply === 0 ? 650 : 480);
        return;
      }
      board.setMovable(s.side);
      board.setMarks([]);
      if (s.guide) { var exp = lineExpected(); if (exp) { arrowFor(exp); fb('info', 'Play ' + st.pos.san(exp) + '.'); } }
    }
    function lineMove(uci, m) {
      var s = cur();
      if (st.complete || st.checking) return;
      if (st.free) return checkMove(m, function (good, why, before) {
        if (good) return complete(s, 'Good. When the trap doesn’t work, you just keep playing sound moves. ' + (s.done || ''));
        miss(); U.sound.bad();
        fb('no', (why ? why + ' ' : '') + 'Try another move.');
        var tok = st.token;
        setTimeout(function () { if (tok !== st.token) return; st.pos = before; st.played.pop(); paintMoves(s); board.setPosition(before, { animate: true }); board.setMovable(s.side); }, 900);
      });
      var exp = lineExpected();
      board.setArrows([]); board.setMarks([]);
      if (m === exp) {
        var san = st.pos.san(m);
        st.pos.make(m); st.ply++; st.played.push(san); st.hintLevel = 0;
        soundFor(st.pos, m);
        board.setPosition(st.pos, { last: m, animate: true });
        U.clear(feedback); paintMoves(s);
        lineStep();
        return;
      }
      miss(); U.sound.bad();
      var tries = st.lineMiss[st.ply] = (st.lineMiss[st.ply] || 0) + 1;
      board.setPosition(st.pos, { animate: true });
      if (s.guide || tries >= 2) { fb('info', 'This line plays ' + st.pos.san(exp) + ' here.'); arrowFor(exp, true); }
      else fb('no', 'That’s not the move in this line. Try again.');
      board.setMovable(s.side);
    }
    /* Is move m (in st.pos) a good move? The engine looks at the position before and after it. done(good, why, before) */
    function checkMove(m, done) {
      var before = st.pos.clone(), after = before.clone(); after.make(m);
      var san = before.san(m);
      st.pos = after; st.played.push(san);
      board.setMovable(null);
      soundFor(after, m);
      board.setPosition(after, { last: m, animate: true });
      paintMoves(cur());
      st.checking = true;
      fb('info', 'Checking…');
      var tok = st.token, depth = Engines.strong ? 14 : 8;
      if (after.status().over) {
        st.checking = false;
        var stt = after.status();
        return done(stt.reason === 'checkmate' || stt.reason === 'stalemate' ? stt.reason === 'checkmate' : true, null, before);
      }
      Promise.all([Engines.analyse({ fen: before.fen(), depth: depth, movetime: 900 }), Engines.analyse({ fen: after.fen(), depth: depth, movetime: 900 })]).then(function (res) {
        if (tok !== st.token || L !== st) return;
        st.checking = false;
        var b0 = res[0].lines[0], a0 = res[1].lines[0];
        var wb = b0 ? (b0.mate != null ? (b0.mate > 0 ? 100 : 0) : U.winPct(b0.cp)) : 50;
        var wa = a0 ? 100 - (a0.mate != null ? (a0.mate > 0 ? 100 : 0) : U.winPct(a0.cp)) : 50;
        var mateNext = !!(a0 && a0.mate != null && a0.mate > 0);
        if (wb - wa <= 18 && !mateNext) return done(true, null, before);
        var why = a0 ? Explain.bad(before, m, a0, res[0].best) : null;
        done(false, why ? why.text : null, before);
      });
    }

    /* safe: the computer plays up to the moment; you find a move that doesn't fall for it */
    function stepSafe(s) {
      navRow(false);
      safeStart();
    }
    function safeStart() {
      var s = cur(), tok = ++st.token;
      st.pos = startPos(s); st.ply = 0; st.played = []; st.checking = false;
      board.setMovable(null); board.setArrows([]); board.setMarks([]);
      board.setPosition(st.pos, { animate: false, clearLast: true });
      U.clear(feedback); paintMoves(s);
      navRow(false);
      if (s.aim && s.aim.length) tool(h('button', { class: 'btn small', type: 'button', onclick: safeHint }, U.icon('hint'), 'Hint'));
      (function auto() {
        if (tok !== st.token) return;
        if (st.ply >= s.moves.length) { board.setMovable(s.side); fb('info', s.bait ? 'Your move. Don’t take the bait.' : 'Your move.'); return; }
        setTimeout(function () {
          if (tok !== st.token) return;
          var m = st.pos.parseMove(s.moves[st.ply]); if (!m) return;
          var san = st.pos.san(m);
          st.pos.make(m); st.ply++; st.played.push(san);
          var at = st.pos.clone();
          board.setPosition(st.pos, { last: m, animate: true, natural: true, landed: function () { soundFor(at, m); } });
          paintMoves(s);
          auto();
        }, st.ply === 0 ? 650 : 520);
      })();
    }
    /* what the bait cost, once its punishment has played out: checkmate, or the material lost (trades cancel out) */
    function baitCost(pos, you, lost, won, s, last, takeBack) {
      if (pos.status().reason === 'checkmate') return 'That lets ' + colorName(you === 1 ? 'b' : 'w') + ' give checkmate.';
      if (s.baitNote) return s.baitNote;
      var VAL = [0, 1, 3, 3, 5, 9, 0], gave = lost.slice(), got = won.slice();
      // if the last move took something and you can take that piece back for free, count it
      var to = last ? (last >> 7) & 127 : -1, there = to >= 0 ? Math.abs(pos.b[to]) : 0;
      if (there && takeBack && pos.side === you && pos.legalMoves().some(function (mv) { return ((mv >> 7) & 127) === to && pos.see(mv) >= C.SEE_VAL[there]; })) got.push(there);
      gave = gave.filter(function (p) { var j = got.indexOf(p); if (j >= 0) { got.splice(j, 1); return false; } return true; });
      var sum = function (a) { return a.reduce(function (n, p) { return n + VAL[p]; }, 0); };
      if (gave.length && sum(gave) > sum(got)) return 'You lost ' + pieceWords(gave) + (got.length ? ' for ' + pieceWords(got) : '') + '.';
      return 'That doesn’t work here.';
    }
    /* [4, 1, 1] → "a rook and two pawns" */
    function pieceWords(list) {
      var count = {}, NUM = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight'];
      list.forEach(function (p) { count[p] = (count[p] || 0) + 1; });
      var parts = [5, 4, 3, 2, 1].filter(function (p) { return count[p]; }).map(function (p) { return count[p] === 1 ? 'a ' + PIECE_NAME[p] : NUM[count[p]] + ' ' + PIECE_NAME[p] + 's'; });
      return parts.length > 1 ? parts.slice(0, -1).join(', ') + ' and ' + parts[parts.length - 1] : parts[0];
    }
    /* the first hint marks the piece that one good move uses, the second draws the move */
    function safeHint() {
      var s = cur();
      if (st.complete || st.checking || st.ply < s.moves.length || st.pos.side !== sideNum(s.side)) return;
      var m = st.pos.parseMove(s.aim[0]); if (!m) return;
      hinted(); st.hintLevel++;
      var sq = C.sqName(m & 127), pc = PIECE_NAME[Math.abs(st.pos.b[m & 127])] || 'piece';
      if (st.hintLevel === 1) { board.setMarks([{ sq: sq, kind: 'hint' }]); fb('info', 'Move your ' + pc + ' on ' + sq + '.'); }
      else { board.setMarks([]); arrowFor(m, true); fb('info', 'One good move here is ' + st.pos.san(m) + '.'); }
    }
    function safeMove(uci, m) {
      var s = cur();
      if (st.complete || st.checking) return;
      board.setArrows([]); board.setMarks([]);
      var bait = s.bait ? st.pos.parseMove(s.bait) : 0;
      if (bait && m === bait) {
        miss(); U.sound.bad();
        board.setMovable(null);
        fb('no', s.trap ? 'That’s the move the trap is waiting for. Watch what happens.' : 'That’s the tempting move, and here it’s a mistake. Watch what happens.');
        var tok = st.token, list = [s.bait].concat(s.punish || []), k = 0, notes = s.notes || {}, base = s.baitAt != null ? s.baitAt : -1;
        var you = sideNum(s.side), lost = [], won = [], lastMm = 0, lastCap = false;
        (function rest() {
          if (tok !== st.token) return;
          if (k >= list.length) {
            fb('no', baitCost(st.pos, you, lost, won, s, lastMm, lastCap) + ' Try again.');
            U.clear(actions);
            actions.appendChild(h('span', { class: 'grow' }));
            actions.appendChild(h('button', { class: 'btn primary', type: 'button', onclick: function () { safeStart(); } }, U.icon('refresh'), 'Try again'));
            return;
          }
          setTimeout(function () {
            if (tok !== st.token) return;
            var mm = st.pos.parseMove(list[k]); if (!mm) { k = list.length; rest(); return; }
            var san = st.pos.san(mm), cap = Math.abs(st.pos.moveCaptured(mm));
            if (cap) (st.pos.side === you ? won : lost).push(cap);
            lastMm = mm; lastCap = !!cap && st.pos.side !== you;
            st.pos.make(mm); st.played.push(san);
            var at = st.pos.clone();
            board.setPosition(st.pos, { last: mm, animate: true, natural: k > 0, landed: function () { soundFor(at, mm); } });
            paintMoves(s);
            if (base >= 0 && notes[base + k] != null) { U.clear(textBox); textBox.appendChild(U.rich(notes[base + k])); }
            k++; rest();
          }, k === 0 ? 50 : 900);
        })();
        return;
      }
      checkMove(m, function (good, why, before) {
        if (good) {
          var aim = (s.aim || []).map(function (a) { return before.parseMove(a); });
          var named = aim.indexOf(m) >= 0;
          var lead = s.bait ? (named ? 'Safe. ' : 'That’s safe too. ') : (named ? 'Yes. ' : (s.aim && s.aim.length ? 'That works. The plan here is ' + s.aim.join(' or ') + '. ' : 'Good move. '));
          complete(s, lead + (s.note || ''));
          return;
        }
        miss(); U.sound.bad();
        fb('no', (why ? why + ' ' : '') + 'Try another move.');
        var tok = st.token;
        setTimeout(function () { if (tok !== st.token) return; st.pos = before; st.played.pop(); paintMoves(s); board.setPosition(before, { animate: true, clearLast: true }); board.setMovable(s.side); }, 900);
      });
    }

    /* game: a practice game from move 1. While the game is in the lines, the opponent picks among them and your moves
       have to follow them; after that you play on alone until move `until`, and pass if you're not worse than a pawn. */
    function stepGame(s) {
      st.inBook = true; st.bookLeft = null; st.yourMoves = 0;
      navRow(false);
      tool(h('button', { class: 'btn small quiet', type: 'button', onclick: function () { show(st.i); } }, U.icon('refresh'), 'Restart'));
      fb('info', 'You’re ' + colorName(s.side) + '. Follow your lines while the game stays in them, then keep playing good moves until move ' + s.until + '.');
      paintMoves(s);
      gameStep();
    }
    function bookNext() {
      var s = cur(), n = st.played.length, out = [];
      s.lines.forEach(function (ln) {
        if (ln.length <= n) return;
        for (var i = 0; i < n; i++) if (ln[i] !== st.played[i]) return;
        if (out.indexOf(ln[n]) < 0) out.push(ln[n]);
      });
      return out;
    }
    function gameStep() {
      var s = cur(), you = sideNum(s.side), stt = st.pos.status();
      if (stt.over) return gameEnd(stt);
      var next = bookNext();
      if (!next.length && st.inBook) {
        st.inBook = false; st.bookLeft = st.played.length;
        if (st.yourMoves < s.until) fb('info', 'You’re past the lines now. Play good moves of your own until move ' + s.until + '.');
      }
      if (st.pos.side === you) {
        if (st.yourMoves >= s.until) return gameJudge();
        paintStepper(); stepNo.textContent += ' · move ' + (st.yourMoves + 1) + ' of ' + s.until;
        board.setMovable(s.side);
        return;
      }
      board.setMovable(null);
      var tok = st.token;
      var go = function (uci) {
        if (tok !== st.token) return;
        var m = uci ? st.pos.parseMove(uci) : 0;
        if (!m) return gameJudge();
        var san = st.pos.san(m);
        st.pos.make(m); st.played.push(san);
        var at = st.pos.clone();
        board.setPosition(st.pos, { last: m, animate: true, natural: true, landed: function () { soundFor(at, m); } });
        paintMoves(s);
        gameStep();
      };
      if (next.length) { setTimeout(function () { go(U.pick(next)); }, st.played.length === 0 ? 650 : 520); return; }
      // out of the lines: a sound reply, picked among the engine's best few so games don't repeat
      var t0 = Date.now();
      Engines.analyse({ fen: st.pos.fen(), depth: Engines.strong ? 10 : 6, movetime: 700, multipv: 3 }).then(function (r) {
        if (tok !== st.token) return;
        var lines = (r.lines || []).filter(function (l) { return l.pv && l.pv.length; }), best = lines[0];
        var score = function (l) { return l.mate != null ? (l.mate > 0 ? 100000 - l.mate : -100000 - l.mate) : l.cp; };
        var pool = best ? lines.filter(function (l) { return score(best) - score(l) <= 30; }) : [];
        var uci = pool.length ? U.pick(pool).pv[0] : r.best;
        setTimeout(function () { go(uci); }, Math.max(0, 420 - (Date.now() - t0)));
      });
    }
    function gameMove(uci, m) {
      var s = cur();
      if (st.complete || st.checking) return;
      var next = st.inBook ? bookNext() : [];
      if (next.length) {
        var ok = next.some(function (san) { return st.pos.parseMove(san) === m; });
        if (!ok) {
          miss(); U.sound.bad();
          var exp = st.pos.parseMove(next[0]);
          board.setPosition(st.pos, { animate: true });
          fb('info', 'Your line plays ' + next.map(function (x) { return st.pos.san(st.pos.parseMove(x)); }).join(' or ') + ' here.');
          if (exp) arrowFor(exp, true);
          board.setMovable(s.side);
          return;
        }
        board.setArrows([]);
        var san = st.pos.san(m);
        st.pos.make(m); st.played.push(san); st.yourMoves++;
        soundFor(st.pos, m);
        board.setPosition(st.pos, { last: m, animate: true });
        paintMoves(s); U.clear(feedback);
        gameStep();
        return;
      }
      // on your own: a move that drops a pawn or more ends the game right there, with the reason
      checkMove(m, function (good, why, before) {
        if (!good) {
          miss(); U.sound.bad();
          fb('no', (why ? why + ' ' : '') + 'That ends this game. Restart and try again: the lines are the same, but the game may go another way.');
          board.setMovable(null);
          return;
        }
        st.yourMoves++;
        U.clear(feedback);
        gameStep();
      });
    }
    function gameEnd(stt) {
      var s = cur(), you = sideNum(s.side);
      if (stt.reason === 'checkmate' && stt.winner === you) return complete(s, 'Checkmate. ' + (s.done || ''));
      if (stt.reason === 'checkmate') return fail('You were checkmated. Restart and try again.');
      return gameJudge();
    }
    function gameJudge() {
      var s = cur(), tok = st.token, you = sideNum(s.side);
      board.setMovable(null);
      fb('info', 'Checking your position…');
      Engines.analyse({ fen: st.pos.fen(), depth: Engines.strong ? 14 : 8, movetime: 1200 }).then(function (r) {
        if (tok !== st.token || L !== st) return;
        var l = r.lines[0] || { cp: 0 }, v = l.mate != null ? (l.mate > 0 ? 3000 : -3000) : l.cp;
        var mine = (st.pos.side === you ? 1 : -1) * v, book = st.bookLeft == null ? st.played.length : st.bookLeft;
        var moveNo = Math.ceil(book / 2);
        var where = st.bookLeft == null ? 'You followed your lines all the way.' : 'You followed your lines to move ' + moveNo + ', then played on your own.';
        if (mine >= -100) complete(s, where + ' ' + (mine >= 100 ? 'You’re better here.' : mine >= -40 ? 'The position is fine.' : 'The position is about equal.') + ' ' + (s.done || ''));
        else fail(where + ' The position slipped: you’re worse now. Restart and try again.');
      });
    }

    function pickFeedback(s, right) {
      var wrong = st.picked.filter(function (q) { return s.squares.indexOf(q) < 0; });
      var RANK = ['', 'first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth'];
      if (s.squares.length === 1 && st.picked.length === 1 && wrong.length === 1) {
        var q = s.squares[0];
        return 'That’s ' + wrong[0] + '. ' + q + ' is where the ' + q[0] + '-file meets the ' + RANK[+q[1]] + ' rank. Try again.';
      }
      if (!st.picked.length) return 'Choose at least one square, then Check.';
      var out = right ? 'You found ' + right + ' of ' + s.squares.length + '. ' : 'None of those yet. ';
      if (wrong.length === 1) out += wrong[0] + ' isn’t one of them. ';
      else if (wrong.length > 1) out += wrong.join(', ') + ' aren’t among them. ';
      else out += 'There ' + (s.squares.length - right === 1 ? 'is 1 more' : 'are ' + (s.squares.length - right) + ' more') + ' to find. ';
      return out + 'Try again.';
    }
    /* a reason for a wrong move that we can see without an engine: it leaves the moved piece en prise */
    function wrongWhy(m, after) {
      var to = (m >> 7) & 127, piece = Math.abs(after.b[to]);
      if (piece && piece !== 6 && after.hangingLoss(to) >= 100) return 'Not quite. On ' + C.sqName(to) + ' your ' + PIECE_NAME[piece] + ' can be taken for free. Try again.';
      return 'Not quite. Try again.';
    }

    show(spec.start || 0);
    return {
      add: function (more) {
        if (L !== st || !more.length) return;
        more.forEach(function (x) { steps.push(x); });
        paintDots(); paintStepper();
        if (st.complete) navRow(true);
      },
      state: st
    };
  }

  /* ---------- a lesson ---------- */
  /* from: a step to start at. Starting part-way through is practice: it never changes the lesson's stars. */
  function renderLesson(root, id, from, back) {
    var found = Data.lesson(id);
    if (!found) { renderUnits(root); return; }
    var lesson = found.lesson, unit = found.unit;
    var start = typeof from === 'number' && from > 0 && from < lesson.steps.length ? from : 0;
    var practice = start > 0;
    var crumb = practice ? { label: 'Trainers', go: function () { App.go('train'); } }
      : back === 'openings' ? { label: 'Openings', go: function () { App.go('openings'); } }
      : { label: 'Learn', go: function () { App.go('learn'); } };
    var P = player(root, { mode: practice ? 'practice' : 'lesson', id: id, title: lesson.title, sub: practice ? 'Practice' : unit.title, crumb: crumb,
      steps: lesson.steps.map(function (s) { return Object.assign({}, s); }), start: start,
      onFinish: function (st) { if (practice) finishPractice(st, lesson, start); else finishLesson(st, found); } });
    // the practice round: fresh puzzles on the lesson's idea, added once they're ready
    var theme = !practice && PRACTICE[id];
    if (theme) {
      var target = clamp((Store.state.puzzles.rating || 600) - 150, 450, 1200);
      pickPuzzles(theme, target, 5).then(function (ps) { P.add(ps.map(function (p) { var s = puzzleStep(p, theme); s.practiceRound = true; return s; })); });
    }
  }
  function finishLesson(st, found) {
    var lesson = found.lesson, unit = found.unit;
    var stars = st.tm + st.th === 0 ? 3 : st.tm + st.th <= 2 ? 2 : 1;
    var S = Store.state.learn, prev = S.done[lesson.id];
    var firstTime = !prev;
    S.done[lesson.id] = { stars: Math.max(stars, prev ? prev.stars : 0), ts: Date.now() };
    S.last = lesson.id;
    var scheduled = reviewable(lesson) && learned(lesson.id);
    Store.touch('learn');
    if (firstTime) Store.activity('l');
    U.sound.end();
    // the next lesson in this unit first, then the first unfinished one anywhere
    var li = found.li, nx = li + 1 < unit.lessons.length ? { unit: unit, lesson: unit.lessons[li + 1] } : nextLesson();
    if (nx && nx.lesson.id === lesson.id) nx = null;
    var why = st.tm + st.th === 0 ? 'No mistakes and no hints.'
      : [st.tm ? U.plural(st.tm, 'mistake') : '', st.th ? U.plural(st.th, 'hint') : ''].filter(Boolean).join(' and ') + '. Replay it any time to earn more stars.';
    var rec = memAll()[lesson.id];
    App.sheet(function (box, api) {
      box.appendChild(h('div', { class: 'result-hero' }, h('div', { class: 'big' }, 'Lesson complete'), h('div', { style: { marginTop: '8px' } }, UI.stars(stars))));
      box.appendChild(h('p', { class: 'muted', style: { textAlign: 'center' } }, why));
      if (st.pTotal) box.appendChild(h('p', { class: 'muted', style: { textAlign: 'center', marginTop: '-4px' } }, 'Practice: ' + st.pOk + ' of ' + st.pTotal + ' solved on the first try.'));
      if (scheduled || (rec && reviewable(lesson))) box.appendChild(h('p', { class: 'review-note', style: { textAlign: 'center' } },
        U.icon('refresh'), scheduled ? 'It comes back for a short review tomorrow. Each review you get right spaces the next one further out.' : 'Its next review is ' + whenText(rec.due) + '.'));
      var practiceT = PRACTICE[lesson.id];
      var col = h('div', { class: 'stack', style: { marginTop: '12px' } });
      if (nx) col.appendChild(h('button', { class: 'btn primary block', type: 'button', onclick: function () { api.close(); open(nx.lesson.id); } }, 'Next: ' + nx.lesson.title));
      if (practiceT) col.appendChild(h('button', { class: 'btn block', type: 'button', onclick: function () { api.close(); Puzzles.themed(practiceT); } }, 'Practice with ' + Puzzles.NAMES[practiceT] + ' puzzles'));
      col.appendChild(h('button', { class: 'btn quiet block', type: 'button', onclick: function () { api.close(); App.go('learn'); } }, 'Back to lessons'));
      box.appendChild(col);
    });
  }
  /* a practice run ends without touching the lesson record */
  function finishPractice(st, lesson, start) {
    U.sound.end();
    Store.activity('l');
    App.sheet(function (box, api) {
      box.appendChild(h('div', { class: 'result-hero' }, h('div', { class: 'big' }, 'Well played'),
        h('div', { class: 'muted', style: { marginTop: '8px' } }, st.mistakes + st.hints === 0 ? 'No mistakes and no hints.' : [st.mistakes ? U.plural(st.mistakes, 'mistake') : '', st.hints ? U.plural(st.hints, 'hint') : ''].filter(Boolean).join(' and ') + '.')));
      box.appendChild(h('div', { class: 'stack', style: { marginTop: '12px' } },
        h('button', { class: 'btn primary block', type: 'button', onclick: function () { api.close(); App.go('learn', { lesson: lesson.id, step: start }); } }, 'Play it again'),
        h('button', { class: 'btn block', type: 'button', onclick: function () { api.close(); open(lesson.id); } }, 'Open the whole lesson'),
        h('button', { class: 'btn quiet block', type: 'button', onclick: function () { api.close(); App.go('train'); } }, 'Back to trainers')));
    });
  }

  /* ---------- review ---------- */
  /* what a lesson brings to a review: k counts its reviews, so the items rotate */
  function itemCount(l) { return l.trap ? 1 : PRACTICE[l.id] ? 2 : l.steps.some(function (s) { return s.t === 'game'; }) ? 1 : 2; }
  /* about how long a lesson's review takes: a practice game is a few minutes, a line or a puzzle about half of one */
  function minutesFor(list) { return Math.max(2, Math.round(list.reduce(function (n, d) { return n + (d.lesson.steps.some(function (s) { return s.t === 'game'; }) ? 4 : itemCount(d.lesson) * 0.6); }, 0))); }
  function itemsFor(d, target) {
    var l = d.lesson, k = d.rec.k || 0, tag = function (s) {
      var r = Object.assign({}, s, { from: l.id, fromTitle: l.title, resolved: null });
      // a review is recall: a line that had arrows in the lesson comes back without them
      if (s.t === 'line' && s.guide && !s.trap) { r.guide = false; r.text = '**From memory.** Play ' + colorName(s.side || 'w') + '’s moves in this line, with no arrows.'; }
      return r;
    };
    if (l.trap) {
      var t = trapOf(l.trap);
      if (!t) return Promise.resolve([]);
      if (k % 2 === 1 && keyOf(t) != null) return Promise.resolve([tag({ t: 'safe', trap: l.trap })]);
      return Promise.resolve([tag({ t: 'line', trap: l.trap, role: t.noSet ? 'defend' : 'set', guide: false, deviate: !t.noSet && Math.random() < 0.35 })]);
    }
    var own = l.steps.filter(function (s) { return s.t === 'move' || s.t === 'pick' || s.t === 'quiz' || s.t === 'line' || s.t === 'safe'; });
    var games = l.steps.filter(function (s) { return s.t === 'game'; }), plays = l.steps.filter(function (s) { return s.t === 'play'; });
    var memoryLines = own.filter(function (s) { return s.t === 'line' && !s.guide; });
    var ownAt = function (j) { return own.length ? tag(own[((j % own.length) + own.length) % own.length]) : null; };
    if (games.length) return Promise.resolve([tag(games[k % games.length])]);
    var theme = PRACTICE[l.id];
    if (theme) {
      return pickPuzzles(theme, target, k % 2 === 0 ? 2 : 1).then(function (ps) {
        var out = ps.map(function (p) { return tag(puzzleStep(p, theme)); });
        if (out.length < 2) { var o = ownAt(k); if (o) out.push(o); }
        return out;
      });
    }
    if (plays.length && k % 2 === 0) return Promise.resolve([tag(plays[(k / 2) % plays.length])]);
    // lines from memory come back first: they are what an opening lesson is for
    if (memoryLines.length) {
      // the line from memory, and one thing from the lesson that isn't the same line again
      var ln = tag(memoryLines[k % memoryLines.length]), rest = own.filter(function (s) { return s.t !== 'line'; });
      var extra = rest.length ? tag(rest[k % rest.length]) : null;
      return Promise.resolve([ln, extra].filter(Boolean));
    }
    var a = ownAt(2 * k), b = own.length > 1 ? ownAt(2 * k + 1) : null;
    if (a && b && a.t === 'line' && b.t === 'line' && sans(a.moves).join(' ') === sans(b.moves).join(' ') && (a.fen || '') === (b.fen || '')) b = null;
    return Promise.resolve([a, b].filter(Boolean));
  }
  var reviewSeq = 0;
  function renderReview(root) {
    App.focus(true);
    settle();
    var seq = ++reviewSeq;
    var due = dueList().slice(0, 5);
    var head = function () {
      root.appendChild(h('button', { class: 'back', type: 'button', onclick: function () { App.go('learn'); } }, U.icon('back'), 'Learn'));
      root.appendChild(h('h1', { style: { fontSize: '26px', margin: '6px 0 12px' } }, 'Review'));
    };
    if (!due.length) {
      head();
      var at = nextDueAt();
      root.appendChild(h('div', { class: 'empty' }, at ? 'Nothing to review right now. Your next review is ' + whenText(at) + '.' : 'Finish a lesson and it comes back here for review.'));
      return;
    }
    head();
    root.appendChild(h('p', { class: 'muted' }, 'Getting your review ready…'));
    var target = clamp(Store.state.puzzles.rating || 600, 500, 1500);
    Promise.all(due.map(function (d) { return itemsFor(d, target); })).then(function (lists) {
      if (seq !== reviewSeq || !root.isConnected) return;
      // one item from each lesson in turn, so the same idea never comes twice in a row
      var steps = [], left = lists.map(function (x) { return x.slice(); }), more = true;
      while (more) { more = false; left.forEach(function (x) { if (x.length) { steps.push(x.shift()); more = true; } }); }
      var byLesson = {};
      steps.forEach(function (s) { var r = byLesson[s.from] || (byLesson[s.from] = { n: 0, got: 0, ok: true, rec: null }); r.n++; });
      U.clear(root);
      if (!steps.length) { head(); root.appendChild(h('div', { class: 'empty' }, 'Nothing to review right now.')); return; }
      player(root, { mode: 'review', title: 'Review', sub: U.plural(due.length, 'lesson'), crumb: { label: 'Learn', go: function () { App.go('learn'); } }, steps: steps,
        onStep: function (i, s, ok) {
          var r = byLesson[s.from]; if (!r) return;
          r.got++; if (!ok) r.ok = false;
          if (r.got >= r.n && !r.rec) r.rec = grade(s.from, r.ok);   // a lesson is graded once all its items are done
        },
        onFinish: function () { reviewDone(due, byLesson); } });
    });
  }
  function reviewDone(due, byLesson) {
    U.sound.end();
    Store.activity('l');
    var right = 0, total = 0;
    Object.keys(byLesson).forEach(function (id) { if (byLesson[id].rec) { total++; if (byLesson[id].ok) right++; } });
    var still = dueList().length;
    App.sheet(function (box, api) {
      box.appendChild(h('div', { class: 'result-hero' }, h('div', { class: 'big' }, 'Review done'),
        h('div', { class: 'muted', style: { marginTop: '8px' } }, right === total ? (total === 1 ? 'You got it right.' : 'All ' + total + ' lessons right.') : right + ' of ' + total + ' lessons right.')));
      var list = h('div', { class: 'list review-list' });
      due.forEach(function (d) {
        var r = byLesson[d.lesson.id]; if (!r || !r.rec) return;
        var lockedNow = r.rec.box >= LOCKED;
        list.appendChild(h('div', { class: 'list-row' },
          h('span', { class: 'tick' + (r.ok ? ' done' : ' miss') }, r.ok ? U.icon('check') : U.icon('refresh')),
          h('div', { class: 'grow' }, h('div', { style: { fontWeight: 600 } }, d.lesson.title),
            h('div', { class: 'muted small' }, r.ok ? (lockedNow ? 'Locked in. Next review ' + whenText(r.rec.due) + '.' : 'Next review ' + whenText(r.rec.due) + '.') : 'Back tomorrow for another try.'))));
      });
      box.appendChild(list);
      var col = h('div', { class: 'stack', style: { marginTop: '14px' } });
      if (still) col.appendChild(h('button', { class: 'btn primary block', type: 'button', onclick: function () { api.close(); App.go('learn', { review: 1 }); } }, 'Keep going: ' + U.plural(still, 'more lesson') + ' due'));
      col.appendChild(h('button', { class: 'btn' + (still ? ' quiet' : ' primary') + ' block', type: 'button', onclick: function () { api.close(); App.go('learn'); } }, 'Done'));
      box.appendChild(col);
    });
  }

  App.register('learn', {
    render: function (root, params) {
      if (params && params.review) renderReview(root);
      else if (params && params.lesson) renderLesson(root, params.lesson, params.step, params.from);
      else renderUnits(root);
    },
    leave: function () { if (L) { L.token++; L.engineTok = (L.engineTok || 0) + 1; } L = null; reviewSeq++; },
    busy: function () { return !!L; }
  });

  /* straight to the first play-it-out step of a lesson */
  function practice(id) {
    var found = Data.lesson(id), k = found ? found.lesson.steps.map(function (s) { return s.t; }).indexOf('play') : -1;
    App.go('learn', k > 0 ? { lesson: id, step: k } : { lesson: id });
  }
  /* for Home and the trainers: how many lessons are due, and about how long they take */
  function due() {
    settle();
    var d = dueList(), next = d.length ? null : nextDueAt();
    return { count: d.length, minutes: minutesFor(d.slice(0, 5)), next: next, when: next ? whenText(next) : null };
  }

  return { nextLesson: nextLesson, open: open, practice: practice, openUnit: openUnit, due: due, lockedIn: lockedIn,
    review: function () { App.go('learn', { review: 1 }); },
    _cur: function () {
      if (!L) return null;
      var s = L.steps[L.i], r = resolve(s);
      return { id: L.id, i: L.i, ply: L.ply || 0, complete: !!L.complete, mistakes: L.mistakes, moves: L.history ? L.history.slice() : [], t: r.t,
        mode: L.mode, n: L.steps.length, played: (L.played || []).slice(), free: !!L.free, checking: !!L.checking, inBook: L.inBook, from: s.from || null };
    },
    _steps: function () { return L ? L.steps.map(function (s) { return resolve(s); }) : null; },
    _mem: function () { return JSON.parse(JSON.stringify(memAll())); },
    _grade: grade, _settle: settle };
})();
