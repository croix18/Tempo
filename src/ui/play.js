/* Tempo play: bot ladder, game setup, live games with the coach. */
var Play = (function () {
  'use strict';
  var h = U.h, C = TempoCore, BOTS = TempoBots.BOTS;
  var G = null, view = null;

  function botIndex(id) { for (var i = 0; i < BOTS.length; i++) if (BOTS[i].id === id) return i; return -1; }
  function unlockedIdx() { var S = Store.state; return S.settings.unlockAll ? BOTS.length - 1 : Math.min(S.play.unlocked || 0, BOTS.length - 1); }

  /* ---------- ladder ---------- */
  function renderLadder(root) {
    var S = Store.state, un = unlockedIdx();
    root.appendChild(h('div', { class: 'page-head' },
      h('div', null, h('h1', null, 'Play')),
      h('div', { class: 'row' }, h('span', { class: 'chip gold' }, 'Your rating ' + S.play.rating))));
    if (S.current && S.current.moves && !S.current.result) {
      var cb = TempoBots.byId(S.current.bot);
      if (cb) root.appendChild(h('div', { class: 'card raised row between', style: { marginBottom: '16px' } },
        h('div', { class: 'row' }, UI.avatar(cb, 'sm'), h('div', null, h('b', null, 'Game in progress'), h('div', { class: 'muted small' }, 'vs ' + cb.name + ' · move ' + (Math.floor(S.current.moves.length / 2) + 1)))),
        h('div', { class: 'row tight' },
          h('button', { class: 'btn quiet small', type: 'button', onclick: function () { App.confirm('Abandon this game?', 'It won’t be saved or rated.', 'Abandon', true).then(function (ok) { if (ok) { Store.state.current = null; Store.touch(); App.refresh(); } }); } }, 'Abandon'),
          h('button', { class: 'btn primary small', type: 'button', onclick: function () { resume(); } }, 'Resume'))));
    }
    var grid = h('div', { class: 'bot-grid' });
    BOTS.forEach(function (bot, i) {
      var rec = S.play.bots[bot.id] || { w: 0, d: 0, l: 0 };
      var locked = i > un, isNext = i === Math.min(S.play.unlocked || 0, BOTS.length - 1) && !rec.beaten;
      var meta = h('div', { class: 'meta' }, h('span', { class: 'chip' }, bot.id === 'stockfish' ? 'Full strength' : 'About ' + bot.rating));
      if (rec.beaten) meta.appendChild(h('span', { class: 'chip green' }, U.icon('check'), 'Beaten'));
      if (rec.w + rec.d + rec.l) meta.appendChild(h('span', { class: 'chip' }, rec.w + '–' + rec.d + '–' + rec.l));
      if (locked) meta.appendChild(h('span', { class: 'chip' }, U.icon('lock'), 'Locked'));
      grid.appendChild(h('button', { class: 'bot' + (locked ? ' locked' : '') + (isNext ? ' next' : ''), type: 'button',
        'aria-label': bot.name + (locked ? ', locked' : ''),
        onclick: function () { if (locked) App.toast('Beat ' + BOTS[i - 1].name + ' to unlock ' + bot.name + '.'); else setup(bot); } },
        UI.avatar(bot), h('div', { class: 'info' }, h('div', { class: 'nm' }, bot.name), h('div', { class: 'bio' }, bot.bio), meta)));
    });
    root.appendChild(grid);
    root.appendChild(h('p', { class: 'faint small', style: { marginTop: '16px' } },
      'Ratings are rough guides on the Chess.com scale. ' + (Engines.status === 'failed' ? 'Stockfish isn’t available in this browser, so the top two opponents use the built-in engine.' : 'The Admiral and Stockfish use the Stockfish engine.')));
  }

  /* ---------- setup ---------- */
  function setup(bot) {
    var S = Store.state.settings;
    var choice = { color: S.color || 'w', coach: S.coach !== false, takebacks: S.takebacks !== false, hanging: S.hanging !== false, clock: S.clock || 'none' };
    App.sheet(function (box, api) {
      box.appendChild(h('div', { class: 'row', style: { marginBottom: '12px' } }, UI.avatar(bot, 'lg'),
        h('div', null, h('h2', null, bot.name), h('div', { class: 'muted' }, bot.id === 'stockfish' ? 'Full strength' : 'About ' + bot.rating))));
      box.appendChild(h('p', { class: 'muted' }, bot.bio));
      box.appendChild(h('div', { class: 'label', style: { margin: '16px 0 8px' } }, 'You play'));
      box.appendChild(seg([['w', 'White'], ['r', 'Random'], ['b', 'Black']], choice.color, function (v) { choice.color = v; }));
      box.appendChild(h('div', { class: 'label', style: { margin: '16px 0 8px' } }, 'Clock'));
      box.appendChild(seg([['none', 'No clock'], ['10', '10 min'], ['15+10', '15 | 10'], ['30', '30 min']], choice.clock, function (v) { choice.clock = v; }));
      var tg = h('div', { style: { marginTop: '10px' } });
      tg.appendChild(toggle('Coach', 'Warns you before a move that loses material.', choice.coach, function (v) { choice.coach = v; }));
      tg.appendChild(toggle('Show hanging pieces', 'Marks your pieces that can be taken for free.', choice.hanging, function (v) { choice.hanging = v; }));
      tg.appendChild(toggle('Takebacks', 'Lets you undo a move. Assisted games aren’t rated.', choice.takebacks, function (v) { choice.takebacks = v; }));
      box.appendChild(tg);
      box.appendChild(h('div', { class: 'row end', style: { marginTop: '18px' } },
        h('button', { class: 'btn primary block', type: 'button', onclick: function () {
          var s = Store.state.settings;
          s.color = choice.color; s.coach = choice.coach; s.takebacks = choice.takebacks; s.hanging = choice.hanging; s.clock = choice.clock;
          Store.touch('settings');
          api.close();
          start(bot, choice);
        } }, 'Start game')));
    });
  }
  function seg(options, value, onChange) {
    var el = h('div', { class: 'seg', role: 'radiogroup' });
    options.forEach(function (o) {
      var b = h('button', { type: 'button', class: o[0] === value ? 'on' : '', role: 'radio', 'aria-checked': o[0] === value ? 'true' : 'false',
        onclick: function () { Array.prototype.forEach.call(el.children, function (c) { c.classList.remove('on'); c.setAttribute('aria-checked', 'false'); }); b.classList.add('on'); b.setAttribute('aria-checked', 'true'); onChange(o[0]); } }, o[1]);
      el.appendChild(b);
    });
    return el;
  }
  function toggle(title, sub, value, onChange) {
    var id = 'tg-' + title.replace(/\W+/g, '-').toLowerCase();
    var inp = h('input', { type: 'checkbox', id: id, role: 'switch' });
    inp.checked = !!value;
    inp.addEventListener('change', function () { onChange(inp.checked); });
    return h('div', { class: 'toggle' }, h('label', { for: id, class: 'grow' }, h('div', { style: { fontWeight: 600 } }, title), sub ? h('div', { class: 'muted small' }, sub) : null), h('span', { class: 'switch' }, inp, h('span')));
  }

  /* ---------- game ---------- */
  function clockSpec(c) {
    if (!c || c === 'none') return null;
    var p = String(c).split('+');
    return { base: (+p[0]) * 60000, inc: (+(p[1] || 0)) * 1000 };
  }
  function start(bot, choice) {
    var color = choice.color === 'r' ? (Math.random() < 0.5 ? 'w' : 'b') : choice.color;
    var spec = clockSpec(choice.clock);
    G = { id: U.uid(), bot: bot.id, color: color, startFen: C.START_FEN, moves: [], sans: [], coach: choice.coach, hanging: choice.hanging,
      takebacks: choice.takebacks, clock: spec, times: spec ? { w: spec.base, b: spec.base } : null, hints: 0, undos: 0, warned: 0,
      result: null, reason: null, startedAt: Date.now() };
    Store.state.current = G; Store.touch();
    Store.state.play.lastBot = bot.id;
    App.go('play', { game: true });
  }
  function resume() {
    var cur = Store.state.current;
    if (!cur || cur.result) { App.go('play'); return; }
    G = cur;
    App.go('play', { game: true });
  }

  function renderGame(root) {
    var bot = TempoBots.byId(G.bot), S = Store.state;
    App.focus(true);
    var pos = new C.Pos(G.startFen);
    G.moves.forEach(function (u) { pos.make(pos.parseMove(u)); });
    var you = G.color === 'w' ? 1 : -1;
    var st = { pos: pos, viewPly: null, thinking: false, token: 0, hintStage: 0, hintMove: null, pre: null, ended: !!G.result, clockT: null, lastTick: 0, bubbleT: null, epds: [] };
    view = st;

    var head = h('div', { class: 'row between', style: { marginBottom: '10px' } },
      h('button', { class: 'back', type: 'button', onclick: function () { leaveGame(); } }, U.icon('back'), 'Opponents'),
      h('div', { class: 'opening-name', id: 'opening' }));
    root.appendChild(head);

    var board = new Board({ orient: G.color, movable: null, coords: S.settings.coords !== false, onMove: userMove });
    st.board = board;
    var oppBar = h('div', { class: 'player' }), youBar = h('div', { class: 'player' });
    var bubble = h('div', { class: 'bubble', hidden: true });
    var coach = h('div', { class: 'coach', hidden: true });
    var movesBox = h('div');
    var controls = h('div', { class: 'controls' });
    var arena = h('div', { class: 'arena' },
      h('div', { class: 'board-col' }, oppBar, board.el, youBar),
      h('div', { class: 'panel' }, bubble, coach, controls, movesBox));
    root.appendChild(arena);

    function bars() {
      var mat = UI.material(st.pos);
      U.clear(oppBar); U.clear(youBar);
      var oppCaps = G.color === 'w' ? mat.byBlack : mat.byWhite, myCaps = G.color === 'w' ? mat.byWhite : mat.byBlack;
      var bal = mat.balance * you;
      oppBar.appendChild(UI.avatar(bot, 'sm'));
      oppBar.appendChild(h('div', { class: 'who' }, h('div', { class: 'name' }, bot.name, h('span', { class: 'rating' }, bot.id === 'stockfish' ? '' : String(bot.rating)),
        st.thinking ? h('span', { class: 'thinking', 'aria-label': 'thinking' }, h('i'), h('i'), h('i')) : null), UI.capturedRow(oppCaps, bal < 0 ? -bal : 0)));
      youBar.appendChild(h('span', { class: 'avatar sm tone-you', 'aria-hidden': 'true' }, 'Y'));
      youBar.appendChild(h('div', { class: 'who' }, h('div', { class: 'name' }, 'You', h('span', { class: 'rating' }, String(Store.state.play.rating))), UI.capturedRow(myCaps, bal > 0 ? bal : 0)));
      if (G.times) {
        var oppC = G.color === 'w' ? 'b' : 'w';
        oppBar.appendChild(h('div', { class: 'clock' + (clockRunning(oppC) ? ' run' : '') + (G.times[oppC] < 20000 ? ' low' : ''), id: 'clock-opp' }, U.clockText(G.times[oppC])));
        youBar.appendChild(h('div', { class: 'clock' + (clockRunning(G.color) ? ' run' : '') + (G.times[G.color] < 20000 ? ' low' : ''), id: 'clock-you' }, U.clockText(G.times[G.color])));
      }
    }
    function clockRunning(c) { return !!G.times && !G.result && G.moves.length >= 2 && (st.pos.side === 1 ? 'w' : 'b') === c && st.viewPly == null; }

    function renderMoves() {
      U.clear(movesBox);
      var wide = window.matchMedia('(min-width: 980px)').matches;
      var startSide = new C.Pos(G.startFen).side;
      if (wide) {
        var box = h('div', { class: 'moves' }), tb = h('table');
        var row = null, num = new C.Pos(G.startFen).full;
        G.sans.forEach(function (san, i) {
          var white = (i % 2 === 0) === (startSide === 1);
          if (white || !row) { row = h('tr', null, h('td', { class: 'n' }, num + '.')); tb.appendChild(row); if (!white) row.appendChild(h('td')); num++; }
          row.appendChild(h('td', null, h('button', { class: 'mv' + (st.viewPly === i + 1 ? ' on' : ''), type: 'button', onclick: function () { showPly(i + 1); } }, san)));
        });
        box.appendChild(tb);
        movesBox.appendChild(box);
        box.scrollTop = box.scrollHeight;
      } else {
        var strip = h('div', { class: 'strip' }), n = new C.Pos(G.startFen).full;
        G.sans.forEach(function (san, i) {
          var white = (i % 2 === 0) === (startSide === 1);
          if (white) strip.appendChild(h('span', { class: 'n' }, (n++) + '.'));
          strip.appendChild(h('button', { class: 'mv' + (st.viewPly === i + 1 ? ' on' : ''), type: 'button', onclick: function () { showPly(i + 1); } }, san));
        });
        movesBox.appendChild(strip);
        strip.scrollLeft = strip.scrollWidth;
      }
      if (st.viewPly != null) movesBox.appendChild(h('div', { class: 'row', style: { marginTop: '8px' } }, h('button', { class: 'btn small', type: 'button', onclick: function () { showPly(null); } }, 'Back to the game')));
    }
    function showPly(n) {
      if (n != null && n >= G.moves.length) n = null;
      st.viewPly = n;
      var p = new C.Pos(G.startFen), last = null;
      var upto = n == null ? G.moves.length : n;
      for (var i = 0; i < upto; i++) { last = p.parseMove(G.moves[i]); p.make(last); }
      if (n == null) { st.pos = p; board.setMovable(myTurn() ? G.color : null); }
      else board.setMovable(null);
      board.setPosition(p, { last: last, animate: false, clearLast: !last });
      if (n == null) markHanging(); else board.setMarks([]);
      renderMoves(); bars();
    }

    function renderControls() {
      U.clear(controls);
      if (G.result) {
        controls.appendChild(h('button', { class: 'btn primary', type: 'button', onclick: function () { Review.openGame(G.id); } }, U.icon('review'), 'Review game'));
        controls.appendChild(h('button', { class: 'btn', type: 'button', onclick: function () { setup(bot); } }, 'Rematch'));
        return;
      }
      controls.appendChild(h('button', { class: 'btn', type: 'button', onclick: hint, disabled: !myTurn() || st.thinking }, U.icon('hint'), 'Hint'));
      if (G.takebacks) controls.appendChild(h('button', { class: 'btn', type: 'button', onclick: takeback, disabled: !canTakeback() }, U.icon('undo'), 'Undo'));
      controls.appendChild(h('button', { class: 'btn icon-only', type: 'button', 'aria-label': 'Flip board', onclick: function () { board.flip(); } }, U.icon('flip')));
      controls.appendChild(h('button', { class: 'btn icon-only', type: 'button', 'aria-label': 'Offer a draw', onclick: offerDraw, disabled: st.thinking }, U.icon('draw')));
      controls.appendChild(h('button', { class: 'btn icon-only danger', type: 'button', 'aria-label': 'Resign', onclick: resign }, U.icon('flag')));
    }

    function say(text, kind) {
      if (!text) { coach.hidden = true; return; }
      U.clear(coach);
      coach.className = 'coach' + (kind ? ' ' + kind : '');
      coach.appendChild(U.icon(kind === 'alert' ? 'shield' : kind === 'good' ? 'check' : 'hint'));
      coach.appendChild(h('div', { class: 'grow' }, text));
      coach.hidden = false;
    }
    function botSays(text) {
      if (!text || Store.state.settings.botChat === false) return;
      U.clear(bubble); bubble.appendChild(h('b', null, bot.name + ': ')); bubble.appendChild(document.createTextNode(text));
      bubble.hidden = false;
      clearTimeout(st.bubbleT); st.bubbleT = setTimeout(function () { bubble.hidden = true; }, 5000);
    }

    function myTurn() { return !G.result && (st.pos.side === 1 ? 'w' : 'b') === G.color && st.viewPly == null; }
    function canTakeback() { return G.takebacks && !G.result && G.moves.length >= (G.color === 'w' ? 1 : 2) && !st.thinking; }

    function markHanging() {
      if (!G.hanging || G.result || !myTurn()) { board.setMarks([]); return; }
      var marks = [];
      for (var s = 0; s < 120; s++) {
        if (s & 8) { s += 7; continue; }
        var p = st.pos.b[s];
        if (!p || (p > 0) !== (you === 1) || Math.abs(p) === 6) continue;
        if (st.pos.hangingLoss(s) >= 100) marks.push({ sq: s, kind: 'danger' });
      }
      board.setMarks(marks);
    }

    function updateOpening() {
      Data.openings().then(function (map) {
        var p = new C.Pos(G.startFen), epds = [epdOf(p)];
        for (var i = 0; i < Math.min(G.moves.length, 30); i++) { p.make(p.parseMove(G.moves[i])); epds.push(epdOf(p)); }
        var o = openingFor(map, epds), el = document.getElementById('opening');
        if (el) el.textContent = o ? o.eco + ' · ' + o.name : '';
      });
    }

    function sync(last, animate) {
      board.setMovable(myTurn() ? G.color : null);
      board.setPosition(st.pos, { last: last, animate: animate });
      board.setArrows([]);
      markHanging(); bars(); renderMoves(); renderControls(); updateOpening();
    }

    function playSound(m, p) {
      var fl = m >>> 17;
      if (p.inCheck()) U.sound.check();
      else if (fl & 4) U.sound.castle();
      else if (fl & 1) U.sound.capture();
      else U.sound.move();
    }

    function commit(uci, by) {
      var m = st.pos.parseMove(uci);
      if (!m) return false;
      var san = st.pos.san(m);
      var captured = st.pos.moveCaptured(m);
      st.pos.make(m);
      G.moves.push(uci); G.sans.push(san);
      if (G.times) {
        var mover = by;
        if (G.moves.length > 2) G.times[mover] += G.clock.inc;
      }
      st.lastTick = performance.now();
      Store.touch();
      playSound(m, st.pos);
      sync(m, true);
      if (by !== G.color && Math.abs(captured) === 5) botSays(bot.lines.capture);
      var status = st.pos.status();
      if (status.over) finish(status.result, status.reason);
      return true;
    }

    /* ---------- the user's move ---------- */
    function userMove(uci, m) {
      if (!myTurn()) return;
      st.hintStage = 0; st.hintMove = null; board.setArrows([]);
      var before = st.pos.clone();
      if (G.coach && !st.ended) {
        board.setMovable(null);
        var tok = ++st.token;
        // show the move right away, then check it
        var temp = before.clone(); temp.make(m);
        board.setPosition(temp, { last: m, animate: false });
        Coach.check(before, m, st.pre).then(function (res) {
          if (tok !== st.token) return;
          if (res && res.warn && G.result == null) {
            G.warned++;
            warnSheet(res, function (takeBack) {
              if (takeBack) { G.undos++; board.setMovable(G.color); board.setPosition(st.pos, { animate: true }); markHanging(); say('Taken back. ' + res.short, 'alert'); }
              else { commit(uci, G.color); if (!G.result) botTurn(); }
            });
          } else {
            commit(uci, G.color);
            if (!G.result) botTurn();
          }
        });
        return;
      }
      commit(uci, G.color);
      if (!G.result) botTurn();
    }

    function warnSheet(res, cb) {
      var decided = false;
      App.sheet(function (box, api) {
        box.appendChild(h('div', { class: 'label', style: { color: 'var(--coral)' } }, 'Coach'));
        box.appendChild(h('h2', { style: { margin: '4px 0 8px' } }, res.title));
        box.appendChild(h('p', { class: 'muted' }, res.text));
        box.appendChild(h('div', { class: 'row end', style: { marginTop: '18px' } },
          h('button', { class: 'btn', type: 'button', onclick: function () { decided = true; api.close(); cb(false); } }, 'Play it anyway'),
          h('button', { class: 'btn primary', type: 'button', onclick: function () { decided = true; api.close(); cb(true); } }, 'Take it back')));
      }, { modal: true, onClose: function () { if (!decided) cb(true); } });
    }

    /* ---------- the bot's move ---------- */
    function botTurn() {
      if (G.result) return;
      st.thinking = true; bars(); renderControls();
      var tok = ++st.token, t0 = performance.now();
      var idx = botIndex(bot.id);
      var minDelay = idx < 8 ? 450 + Math.random() * 700 : 250;
      Engines.botMove(bot, { fen: G.startFen, moves: G.moves.slice(), sans: G.sans.slice() }).then(function (uci) {
        var wait = Math.max(0, minDelay - (performance.now() - t0));
        setTimeout(function () {
          if (tok !== st.token || G.result || st.ended) return;
          st.thinking = false;
          if (!uci || !commit(uci, G.color === 'w' ? 'b' : 'w')) {
            // engine failed: play any legal move rather than freezing
            var legal = st.pos.legalMoves();
            if (legal.length) commit(C.uci(legal[Math.floor(Math.random() * legal.length)]), G.color === 'w' ? 'b' : 'w');
          }
          if (!G.result) startMyTurn();
        }, wait);
      });
    }
    function startMyTurn() {
      st.pre = null;
      say(null);
      if (G.coach) st.pre = Coach.prepare(st.pos);
      renderControls();
    }

    /* ---------- tools ---------- */
    function hint() {
      if (!myTurn()) return;
      if (st.hintStage === 0) {
        G.hints++; Store.touch();
        say('Thinking about a hint…');
        var tok = st.token;
        Engines.analyse({ fen: st.pos.fen(), depth: 14, movetime: 1200 }).then(function (r) {
          if (tok !== st.token || !myTurn() || !r.best) return;
          st.hintMove = r.best; st.hintStage = 1;
          board.setMarks([{ sq: r.best.slice(0, 2), kind: 'gold' }]);
          say('Look at this piece. Tap Hint again to see the move.');
        });
      } else if (st.hintStage === 1 && st.hintMove) {
        st.hintStage = 2;
        board.setArrows([{ from: st.hintMove.slice(0, 2), to: st.hintMove.slice(2, 4), color: 'green' }]);
        var mv = st.pos.parseMove(st.hintMove);
        say('Try ' + (mv ? st.pos.san(mv) : st.hintMove) + '.');
      }
    }
    function takeback() {
      if (!canTakeback()) return;
      st.token++;
      var n = (st.pos.side === 1 ? 'w' : 'b') === G.color ? 2 : 1;
      if (G.moves.length < n) n = G.moves.length;
      G.moves.splice(G.moves.length - n, n); G.sans.splice(G.sans.length - n, n);
      G.undos++;
      st.pos = new C.Pos(G.startFen);
      var last = null;
      G.moves.forEach(function (u) { last = st.pos.parseMove(u); st.pos.make(last); });
      st.thinking = false;
      Store.touch();
      sync(last, false);
      say(null);
      if (!myTurn()) botTurn(); else startMyTurn();
    }
    function resign() {
      App.confirm('Resign this game?', null, 'Resign', true).then(function (ok) { if (ok) finish(G.color === 'w' ? '0-1' : '1-0', 'resignation'); });
    }
    function offerDraw() {
      if (G.moves.length < 20) { botSays('It’s a bit early for a draw. Let’s play on.'); return; }
      say('Your opponent is considering the draw offer…');
      Engines.analyse({ fen: st.pos.fen(), depth: 12, movetime: 800 }).then(function (r) {
        var l = r.lines[0] || { cp: 0 };
        var forSideToMove = l.mate != null ? (l.mate > 0 ? 3000 : -3000) : l.cp;
        var botSide = G.color === 'w' ? -1 : 1;
        var forBot = (st.pos.side === botSide) ? forSideToMove : -forSideToMove;
        if (forBot <= 30) { finish('1/2-1/2', 'agreement'); }
        else { say(null); botSays('No thanks. I like my position.'); }
      });
    }

    /* ---------- clock ---------- */
    function tick() {
      if (!G.times || G.result) return;
      var now = performance.now(), dt = now - (st.lastTick || now);
      st.lastTick = now;
      if (G.moves.length >= 2) {
        var c = st.pos.side === 1 ? 'w' : 'b';
        G.times[c] -= dt;
        if (G.times[c] <= 0) {
          G.times[c] = 0;
          var other = c === 'w' ? -1 : 1, canMate = hasMatingMaterial(st.pos, other);
          finish(canMate ? (c === 'w' ? '0-1' : '1-0') : '1/2-1/2', canMate ? 'time' : 'timeout vs insufficient material');
        }
      }
      var co = document.getElementById('clock-opp'), cy = document.getElementById('clock-you');
      var oppC = G.color === 'w' ? 'b' : 'w';
      if (co) { co.textContent = U.clockText(G.times[oppC]); co.className = 'clock' + (clockRunning(oppC) ? ' run' : '') + (G.times[oppC] < 20000 ? ' low' : ''); }
      if (cy) { cy.textContent = U.clockText(G.times[G.color]); cy.className = 'clock' + (clockRunning(G.color) ? ' run' : '') + (G.times[G.color] < 20000 ? ' low' : ''); }
    }
    function hasMatingMaterial(pos, side) {
      var n = 0, b = pos.b;
      for (var s = 0; s < 120; s++) {
        if (s & 8) { s += 7; continue; }
        var p = b[s] * side;
        if (p === 1 || p === 4 || p === 5) return true;
        if (p === 2 || p === 3) n++;
      }
      return n >= 2;
    }
    if (G.times) { st.lastTick = performance.now(); st.clockT = setInterval(tick, 200); }

    /* ---------- the end ---------- */
    function finish(result, reason) {
      if (G.result) return;
      st.token++; st.thinking = false; st.ended = true;
      G.result = result; G.reason = reason;
      clearInterval(st.clockT);
      var record = Play.record(G, bot);
      Store.state.current = null; Store.touch();
      board.setMovable(null);
      U.sound.end();
      bars(); renderControls(); renderMoves(); board.setMarks([]);
      say(null);
      endSheet(record);
    }
    function endSheet(rec) {
      var won = rec.score === 1, drew = rec.score === 0.5;
      var why = { checkmate: 'by checkmate', resignation: 'by resignation', time: 'on time', stalemate: 'by stalemate', agreement: 'by agreement',
        'insufficient material': 'by insufficient material', 'fifty-move rule': 'by the fifty-move rule', 'threefold repetition': 'by repetition' }[rec.reason] || rec.reason;
      App.sheet(function (box, api) {
        box.appendChild(h('div', { class: 'result-hero' },
          h('div', { class: 'big' }, won ? 'You won' : drew ? 'Draw' : 'You lost'),
          h('div', { class: 'muted' }, why)));
        var line = won ? bot.lines.lose : drew ? '' : bot.lines.win;
        if (line && Store.state.settings.botChat !== false) box.appendChild(h('div', { class: 'row', style: { justifyContent: 'center', marginBottom: '10px' } }, UI.avatar(bot, 'sm'), h('div', { class: 'bubble' }, line)));
        if (rec.rated) {
          var d = rec.after - rec.before;
          box.appendChild(h('p', { style: { textAlign: 'center' } }, 'Rating ', h('b', null, String(rec.after)), ' ', h('span', { class: 'delta ' + (d >= 0 ? 'up' : 'down') }, (d >= 0 ? '+' : '') + d)));
        } else box.appendChild(h('p', { class: 'muted small', style: { textAlign: 'center' } }, 'Not rated: you used ' + (G.undos ? 'takebacks' : 'hints') + '.'));
        if (rec.unlocked) box.appendChild(h('div', { class: 'feedback ok', style: { textAlign: 'center', marginBottom: '8px' } }, rec.unlocked.name + ' is now unlocked.'));
        var row = h('div', { class: 'stack', style: { marginTop: '14px' } },
          h('button', { class: 'btn primary block', type: 'button', onclick: function () { api.close(); Review.openGame(G.id); } }, U.icon('review'), 'Review this game'));
        var row2 = h('div', { class: 'row' }, h('button', { class: 'btn grow', type: 'button', onclick: function () { api.close(); setup(bot); } }, 'Rematch'));
        if (rec.unlocked) row2.appendChild(h('button', { class: 'btn grow', type: 'button', onclick: function () { api.close(); setup(rec.unlocked); } }, 'Play ' + rec.unlocked.name));
        else row2.appendChild(h('button', { class: 'btn grow', type: 'button', onclick: function () { api.close(); leaveGame(); } }, 'Opponents'));
        row.appendChild(row2);
        box.appendChild(row);
      });
    }

    function leaveGame() {
      if (!G.result && G.moves.length) { Store.touch(); }
      G = null; App.go('play');
    }

    // keyboard: arrows browse moves
    st.keys = function (e) {
      if (e.target && /input|textarea|select/i.test(e.target.tagName)) return;
      if (e.key === 'ArrowLeft') { var n = st.viewPly == null ? G.moves.length - 1 : st.viewPly - 1; if (n >= 0) showPly(n); }
      else if (e.key === 'ArrowRight') { if (st.viewPly != null) showPly(st.viewPly + 1); }
      else if (e.key === 'f') board.flip();
    };
    document.addEventListener('keydown', st.keys);

    // first paint
    var lastMove = null;
    if (G.moves.length) { var tp = new C.Pos(G.startFen); G.moves.forEach(function (u) { lastMove = tp.parseMove(u); tp.make(lastMove); }); }
    sync(lastMove, false);
    if (!G.moves.length) botSays(bot.lines.hello);
    if (G.coach && !G.moves.length) say('Coach is on. You’ll get a warning before a move that loses material.');
    if (G.result) { finishView(); }
    else if (myTurn()) startMyTurn();
    else botTurn();
    function finishView() { board.setMovable(null); renderControls(); }
  }

  /* Save a finished game: ratings, ladder, history. Returns a summary for the end screen. */
  function record(g, bot) {
    var S = Store.state, idx = botIndex(bot.id);
    var score = g.result === '1/2-1/2' ? 0.5 : ((g.result === '1-0') === (g.color === 'w') ? 1 : 0);
    var rated = !g.undos && !g.hints && g.moves.length >= 6;
    var before = S.play.rating, after = before;
    if (rated) {
      var games = S.play.hist.length, K = games < 10 ? 40 : games < 30 ? 28 : 20;
      var exp = 1 / (1 + Math.pow(10, (bot.rating - before) / 400));
      after = Math.max(100, Math.round(before + K * (score - exp)));
      S.play.rating = after;
      S.play.hist.push([Date.now(), after]);
      if (S.play.hist.length > 400) S.play.hist.shift();
    }
    var rec = S.play.bots[bot.id] || (S.play.bots[bot.id] = { w: 0, d: 0, l: 0 });
    if (score === 1) rec.w++; else if (score === 0.5) rec.d++; else rec.l++;
    var unlocked = null;
    var beat = score === 1 || (bot.id === 'stockfish' && score === 0.5);
    if (beat && !rec.beaten) rec.beaten = true;
    if (beat && idx >= (S.play.unlocked || 0) && idx + 1 < BOTS.length) { S.play.unlocked = idx + 1; unlocked = BOTS[idx + 1]; }
    Store.touch('play');
    var pgn = C.pgnFromMoves({
      Event: 'Tempo game', Site: 'Tempo', Date: new Date().toISOString().slice(0, 10).replace(/-/g, '.'),
      White: g.color === 'w' ? 'You' : bot.name, Black: g.color === 'b' ? 'You' : bot.name,
      WhiteElo: String(g.color === 'w' ? before : bot.rating), BlackElo: String(g.color === 'b' ? before : bot.rating),
      Result: g.result, Termination: g.reason
    }, g.startFen, movesInts(g));
    S.games.list.unshift({ id: g.id, ts: Date.now(), bot: bot.id, color: g.color, result: g.result, reason: g.reason, pgn: pgn,
      plies: g.moves.length, rated: rated, before: before, after: after, reviewed: false, acc: null, counts: null });
    if (S.games.list.length > 100) S.games.list.length = 100;
    Store.touch('games');
    Store.activity('g');
    return { score: score, rated: rated, before: before, after: after, reason: g.reason, unlocked: unlocked };
  }
  function movesInts(g) {
    var p = new C.Pos(g.startFen), out = [];
    g.moves.forEach(function (u) { var m = p.parseMove(u); out.push(m); p.make(m); });
    return out;
  }

  App.register('play', {
    render: function (root, params) {
      if (params && params.game && G) renderGame(root);
      else { G = null; renderLadder(root); }
    },
    leave: function () {
      if (view) { clearInterval(view.clockT); document.removeEventListener('keydown', view.keys); view.token++; view = null; }
      Engines.stopAll();
    },
    busy: function () { return !!view; }
  });

  return { setup: setup, resume: resume, record: record, toggle: toggle, seg: seg };
})();
