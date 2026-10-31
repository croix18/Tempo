/* Tempo play: bot ladder, game setup, live games with the coach. */
var Play = (function () {
  'use strict';
  var h = U.h, C = TempoCore, BOTS = TempoBots.BOTS;
  var G = null, view = null;

  function botIndex(id) { for (var i = 0; i < BOTS.length; i++) if (BOTS[i].id === id) return i; return -1; }
  function unlockedIdx() { var S = Store.state; return S.settings.unlockAll ? BOTS.length - 1 : Math.min(S.play.unlocked || 0, BOTS.length - 1); }

  /* ---------- ladder ---------- */
  function renderLadder(root) {
    var S = Store.state;
    root.appendChild(h('div', { class: 'page-head' }, h('h1', null, 'Play'),
      h('div', { class: 'head-note' }, 'Your rating ', h('b', { class: 'num' }, String(S.play.rating)))));
    var cb = S.current && S.current.moves && S.current.moves.length && !S.current.result ? TempoBots.byId(S.current.bot) : null;
    if (cb) root.appendChild(h('div', { class: 'resume' },
      h('p', { class: 'grow' }, 'Your game against ' + cb.name + ' is still going. You\u2019re on move ' + (Math.floor(S.current.moves.length / 2) + 1) + '.'),
      h('div', { class: 'row tight' },
        h('button', { class: 'btn quiet small', type: 'button', onclick: function () { abandon().then(function (ok) { if (ok) App.refresh(); }); } }, 'Abandon'),
        h('button', { class: 'btn primary small', type: 'button', onclick: function () { resume(); } }, 'Resume'))));
    var list = UI.ladder({ lo: 0, hi: BOTS.length - 1, full: true, playing: cb && cb.id });
    root.appendChild(list);
    var recent = S.games.list.slice(0, 3);
    if (recent.length) {
      root.appendChild(h('h2', { style: { margin: '32px 0 12px' } }, 'Recent games'));
      var rl = h('nav', { class: 'menu-list', 'aria-label': 'Recent games', style: { maxWidth: '720px' } });
      recent.forEach(function (g) {
        var b = TempoBots.byId(g.bot), name = b ? b.name : (g.opp || 'opponent');
        rl.appendChild(UI.menuRow('review', resultPhrase(g, name) + ', ' + U.dateShort(g.ts), g.reviewed && g.acc != null ? Math.round(g.acc) + '% accuracy' : 'Not reviewed yet', function () { Review.openGame(g.id); }));
      });
      rl.appendChild(UI.menuRow('list', 'All games', null, function () { App.go('review'); }));
      root.appendChild(rl);
    }
    root.appendChild(h('p', { class: 'faint small', style: { marginTop: '16px', maxWidth: '62ch' } },
      'Ratings are rough guides on the Chess.com scale. ' + (Engines.status === 'failed' ? 'Stockfish isn\u2019t available in this browser, so the top two opponents use the built-in engine.' : 'The Admiral and Stockfish use the Stockfish engine.')));
    // on a phone the next opponent can sit below the fold; bring it into view
    if (list._next) requestAnimationFrame(function () {
      var r = list._next.getBoundingClientRect();
      if (r.bottom > window.innerHeight - 90) list._next.scrollIntoView({ block: 'center' });
    });
  }
  /* asks before throwing away an unfinished game; resolves true when there is nothing left to lose */
  function abandon() {
    var cur = Store.state.current;
    if (!cur || cur.result || !cur.moves || !cur.moves.length) return Promise.resolve(true);
    var b = TempoBots.byId(cur.bot);
    return App.confirm('Abandon your game against ' + (b ? b.name : 'this opponent') + '?', 'It won\u2019t be saved or rated.', 'Abandon', true).then(function (ok) {
      if (ok) { Store.state.current = null; Store.touch(); }
      return ok;
    });
  }

  /* ---------- setup ---------- */
  function setup(bot) {
    var S = Store.state.settings;
    var choice = { color: S.color || 'w', coach: S.coach !== false, takebacks: S.takebacks !== false, hanging: S.hanging !== false, clock: S.clock || 'none' };
    App.sheet(function (box, api) {
      box.appendChild(h('div', { class: 'row', style: { marginBottom: '12px' } }, UI.avatar(bot, 'lg'),
        h('div', null, h('h2', null, bot.name), h('div', { class: 'muted' }, bot.id === 'stockfish' ? 'Full strength' : 'About ' + bot.rating))));
      box.appendChild(h('p', { class: 'muted' }, bot.bio));
      var rec = Store.state.play.bots[bot.id];
      if (rec && rec.w + rec.d + rec.l) box.appendChild(h('p', { class: 'small' }, 'Your record against ' + bot.name + ': ' + recordWords(rec) + '.'));
      box.appendChild(h('div', { class: 'label', style: { margin: '16px 0 8px' } }, 'You play'));
      box.appendChild(seg([['w', 'White'], ['r', 'Random'], ['b', 'Black']], choice.color, function (v) { choice.color = v; }));
      box.appendChild(h('div', { class: 'label', style: { margin: '16px 0 8px' } }, 'Clock'));
      box.appendChild(seg([['none', 'No clock'], ['10', '10 min'], ['15+10', '15 + 10 s'], ['30', '30 min']], choice.clock, function (v) { choice.clock = v; }));
      box.lastChild.children[2].setAttribute('aria-label', '15 minutes, plus 10 seconds for each move');
      box.lastChild.children[2].title = '15 minutes, plus 10 seconds for each move';
      var tg = h('div', { style: { marginTop: '10px' } });
      tg.appendChild(toggle('Coach', 'Warns you before a move that loses material.', choice.coach, function (v) { choice.coach = v; }));
      tg.appendChild(toggle('Show threats', 'Rings pieces you could lose, and warns you when checkmate is threatened.', choice.hanging, function (v) { choice.hanging = v; }));
      tg.appendChild(toggle('Takebacks', 'Lets you undo a move.', choice.takebacks, function (v) { choice.takebacks = v; }));
      box.appendChild(tg);
      box.appendChild(h('p', { class: 'muted small', style: { marginTop: '12px' } }, 'The game counts toward your rating unless you use a hint or take back a move, including taking one back when the coach warns you.'));
      box.appendChild(h('div', { class: 'row end', style: { marginTop: '18px' } },
        h('button', { class: 'btn primary block', type: 'button', onclick: function () {
          var s = Store.state.settings;
          s.color = choice.color; s.coach = choice.coach; s.takebacks = choice.takebacks; s.hanging = choice.hanging; s.clock = choice.clock;
          Store.touch('settings');
          abandon().then(function (ok) { if (!ok) return; api.close(); start(bot, choice); });
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

    var head = h('div', { class: 'row between game-head' },
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
    var boardCol = h('div', { class: 'board-col' }, oppBar, board.el, youBar);
    var arena = h('div', { class: 'arena' }, boardCol,
      h('div', { class: 'panel' }, controls, coach, bubble, movesBox));
    root.appendChild(arena);
    /* the name strip next to each side's pieces follows the board when it flips */
    function placeBars() {
      var youAtBottom = board.orient === G.color;
      boardCol.insertBefore(youAtBottom ? oppBar : youBar, board.el);
      boardCol.appendChild(youAtBottom ? youBar : oppBar);
    }
    function flip() { board.flip(); placeBars(); }
    // the move list switches between a strip and a table at desktop width
    var wideMq = window.matchMedia('(min-width: 980px)');
    var onWide = function () { if (view === st) renderMoves(); };
    if (wideMq.addEventListener) wideMq.addEventListener('change', onWide);
    st.unlisten = function () { if (wideMq.removeEventListener) wideMq.removeEventListener('change', onWide); };

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
      if (!G.sans.length) return;
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
      if (st.checking || st.deciding) return;
      if (n != null && n >= G.moves.length) n = null;
      st.viewPly = n;
      var p = new C.Pos(G.startFen), last = null;
      var upto = n == null ? G.moves.length : n;
      for (var i = 0; i < upto; i++) { last = p.parseMove(G.moves[i]); p.make(last); }
      if (n == null) { st.pos = p; board.setMovable(myTurn() ? G.color : null); }
      else board.setMovable(null);
      board.setPosition(p, { last: last, animate: false, clearLast: !last });
      if (n == null) markHanging(true); else board.setMarks([]);
      renderMoves(); bars();
    }

    function renderControls() {
      U.clear(controls);
      if (G.result) {
        controls.appendChild(h('button', { class: 'btn primary', type: 'button', onclick: function () { Review.openGame(G.id); } }, U.icon('review'), 'Review game'));
        controls.appendChild(h('button', { class: 'btn', type: 'button', onclick: function () { setup(bot); } }, 'Rematch'));
        return;
      }
      // every control carries a word as well as an icon: a beginner shouldn't have to guess
      function tool(icon, label, fn, disabled, aria, extra) {
        return h('button', { class: 'btn tool' + (extra ? ' ' + extra : ''), type: 'button', onclick: fn, disabled: disabled, 'aria-label': aria, title: aria || label }, U.icon(icon), h('span', null, label));
      }
      var busy = st.deciding || st.checking;
      controls.appendChild(tool('hint', 'Hint', hint, !myTurn() || st.thinking || busy, 'Get a hint'));
      if (G.takebacks) controls.appendChild(tool('undo', 'Undo', takeback, !canTakeback(), 'Take back your last move'));
      controls.appendChild(tool('flip', 'Flip', flip, false, 'Flip the board'));
      controls.appendChild(tool('draw', 'Draw', offerDraw, st.thinking || busy, 'Offer a draw'));
      controls.appendChild(tool('flag', 'Resign', resign, busy, 'Resign the game', 'resign'));
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
    function canTakeback() { return G.takebacks && !G.result && G.moves.length >= (G.color === 'w' ? 1 : 2) && !st.thinking && !st.checking && !st.deciding; }

    /* "Show threats": ring your pieces that can be taken for free, and say which one is in danger and from what.
       A checkmate threat comes first: it is drawn on the board and named. */
    function markHanging(speak) {
      if (!G.hanging || G.result || !myTurn()) { board.setMarks([]); return; }
      var marks = [], worst = null;
      for (var s = 0; s < 120; s++) {
        if (s & 8) { s += 7; continue; }
        var p = st.pos.b[s];
        if (!p || (p > 0) !== (you === 1) || Math.abs(p) === 6) continue;
        var loss = st.pos.hangingLoss(s);
        if (loss >= 100) { marks.push({ sq: s, kind: 'danger' }); if (!worst || loss > worst.loss) worst = { sq: s, loss: loss, type: Math.abs(p) }; }
      }
      board.setMarks(marks);
      var threat = speak && !st.deciding && coach.hidden ? mateThreat() : null;
      if (threat) {
        board.setArrows([{ from: threat.uci.slice(0, 2), to: threat.uci.slice(2, 4), color: 'red' }]);
        say('Watch out: ' + bot.name + ' threatens checkmate with ' + threat.san + '. Stop it with this move.', 'alert');
        return;
      }
      if (speak && worst && !st.deciding && coach.hidden) {
        var V = [0, 1, 3, 3, 5, 9, 100], b = st.pos.b;
        var by = st.pos.attackersOf(worst.sq, -you).sort(function (x, y) { return V[Math.abs(b[x])] - V[Math.abs(b[y])]; });
        var att = by.length ? Math.abs(b[by[0]]) : 0, where = att ? ' the ' + PIECE_NAME[att] + ' on ' + C.sqName(by[0]) : '';
        var defended = st.pos.attackersOf(worst.sq, you).length > 0, name = 'Your ' + PIECE_NAME[worst.type] + ' on ' + C.sqName(worst.sq);
        var first = !Store.state.settings.tipHanging, text;
        // a defended piece is in danger only from a cheaper attacker or from too many attackers
        if (!defended) text = name + ' can be taken for free' + (att ? ' by' + where : '') + '. Move it or protect it.';
        else if (att && V[att] < V[worst.type]) text = name + ' is attacked by' + where + ', which is worth less. Move it.';
        else text = name + ' is attacked more times than it is defended. Move it or add a defender.';
        say(text + (first ? ' A red ring marks a piece you could lose.' : ''), 'alert');
        if (first) { Store.state.settings.tipHanging = true; Store.touch('settings'); }
      }
    }

    /* If you passed, could the bot mate you on the spot? */
    function mateThreat() {
      if (st.pos.inCheck()) return null;
      var p = st.pos.clone();
      p.makeNull();
      return mateInOne(p);
    }

    function updateOpening() {
      Data.openings().then(function (map) {
        var p = new C.Pos(G.startFen), epds = [epdOf(p)];
        for (var i = 0; i < Math.min(G.moves.length, 30); i++) { p.make(p.parseMove(G.moves[i])); epds.push(epdOf(p)); }
        var o = openingFor(map, epds), el = document.getElementById('opening');
        if (el) { el.textContent = o ? o.name : ''; el.title = o ? o.eco + ' ' + o.name : ''; }
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
      if (!myTurn() || st.checking || st.deciding) return;
      st.hintStage = 0; st.hintMove = null; board.setArrows([]); board.setMarks([]);
      say(null);
      var before = st.pos.clone();
      if (G.coach && !st.ended) {
        board.setMovable(null);
        var tok = ++st.token;
        // show the move right away, then check it
        var temp = before.clone(); temp.make(m);
        board.setPosition(temp, { last: m, animate: false });
        st.checking = true; renderControls();
        Coach.check(before, m, st.pre).then(function (res) {
          if (tok !== st.token || view !== st || !G) return;
          st.checking = false;
          if (res && res.warn && G.result == null) {
            G.warned++;
            warnInline(res, temp, function (takeBack) {
              if (view !== st || !G || G.result) return;
              if (takeBack) {
                assisted('a takeback'); G.undos++; Store.touch();
                board.setArrows([]); board.setMovable(G.color); board.setPosition(st.pos, { animate: true }); markHanging();
                say('Taken back. ' + res.short + ' Try another move.', 'alert');
                renderControls();
              } else { board.setArrows([]); commit(uci, G.color); if (!G.result) botTurn(); }
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

    /* The coach's warning sits right under the board, with the danger drawn on it in red.
       Nothing else can happen until you choose. */
    function warnInline(res, temp, cb) {
      st.deciding = true; renderControls();
      if (res.reply) board.setArrows([{ from: res.reply.slice(0, 2), to: res.reply.slice(2, 4), color: 'red' }]);
      U.clear(coach);
      coach.className = 'coach alert decide';
      coach.appendChild(U.icon('shield'));
      var take = h('button', { class: 'btn primary', type: 'button', onclick: function () { choose(true); } }, 'Take it back');
      coach.appendChild(h('div', { class: 'grow' },
        h('b', null, res.title + '. '), document.createTextNode(res.text.replace(/ Take the move back\?$/, '')),
        h('div', { class: 'row', style: { marginTop: '10px' } }, take,
          h('button', { class: 'btn', type: 'button', onclick: function () { choose(false); } }, 'Play it anyway'))));
      coach.hidden = false;
      setTimeout(function () { try { take.focus({ preventScroll: true }); } catch (e) { /* ignore */ } }, 0);
      function choose(v) { if (!st.deciding) return; st.deciding = false; say(null); cb(v); }
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
      if (G.coach) st.pre = Coach.prepare(st.pos);
      renderControls();
      markHanging(true);
    }

    /* ---------- tools ---------- */
    function hint() {
      if (!myTurn() || st.checking || st.deciding) return;
      if (st.hintStage === 0) {
        if (st.hintPending) return;
        st.hintPending = true;
        assisted('a hint');
        G.hints++; Store.touch();
        say('Thinking about a hint\u2026');
        var tok = st.token;
        Engines.analyse({ fen: st.pos.fen(), depth: 14, movetime: 1200 }).then(function (r) {
          st.hintPending = false;
          if (tok !== st.token || view !== st || !G || !myTurn() || !r.best) return;
          st.hintMove = r.best; st.hintStage = 1;
          var from = C.sqIndex(r.best.slice(0, 2)), piece = PIECE_NAME[Math.abs(st.pos.b[from])] || 'piece';
          board.setMarks([{ sq: r.best.slice(0, 2), kind: 'hint' }]);
          say('Look at your ' + piece + ' on ' + r.best.slice(0, 2) + '. Press Hint again to see the move.');
        }, function () { st.hintPending = false; });
      } else if (st.hintStage === 1 && st.hintMove) {
        st.hintStage = 2;
        board.setArrows([{ from: st.hintMove.slice(0, 2), to: st.hintMove.slice(2, 4), color: 'green' }]);
        var mv = st.pos.parseMove(st.hintMove), why = mv ? moveReason(st.pos, mv) : '';
        say('Try ' + (mv ? st.pos.san(mv) : st.hintMove) + '.' + (why ? ' ' + why : ''));
      }
    }
    function takeback() {
      if (!canTakeback()) return;
      st.token++;
      var n = (st.pos.side === 1 ? 'w' : 'b') === G.color ? 2 : 1;
      if (G.moves.length < n) n = G.moves.length;
      G.moves.splice(G.moves.length - n, n); G.sans.splice(G.sans.length - n, n);
      assisted('a takeback');
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
      var S2 = Store.state.play, rated = !G.undos && !G.hints && G.moves.length >= 6;
      var K = S2.hist.length < 10 ? 40 : S2.hist.length < 30 ? 28 : 20, exp = 1 / (1 + Math.pow(10, (bot.rating - S2.rating) / 400)), loss = Math.round(K * exp);
      var text = rated ? 'It counts as a loss, about ' + U.plural(loss, 'rating point') + '.' : 'This game isn\u2019t rated, so your rating won\u2019t change.';
      var mine = st;
      App.confirm('Resign this game?', text, 'Resign', true).then(function (ok) { if (ok && view === mine && G && !G.result) finish(G.color === 'w' ? '0-1' : '1-0', 'resignation'); });
    }
    /* the first hint or takeback in a game that would count tells you it no longer will */
    function assisted(what) {
      if (G.hints || G.undos) return;
      App.toast('You used ' + what + ', so this game won\u2019t count toward your rating.');
    }
    function offerDraw() {
      if (G.moves.length < 20) { say(bot.name + ' won\u2019t agree to a draw before move 10. Play on.'); botSays('It\u2019s a bit early for a draw. Let\u2019s play on.'); return; }
      say(bot.name + ' is thinking about your draw offer\u2026');
      var dtok = st.token;
      Engines.analyse({ fen: st.pos.fen(), depth: 12, movetime: 800 }).then(function (r) {
        if (dtok !== st.token || view !== st || !G || G.result) return;
        var l = r.lines[0] || { cp: 0 };
        var forSideToMove = l.mate != null ? (l.mate > 0 ? 3000 : -3000) : l.cp;
        var botSide = G.color === 'w' ? -1 : 1;
        var forBot = (st.pos.side === botSide) ? forSideToMove : -forSideToMove;
        if (forBot <= 30) { finish('1/2-1/2', 'agreement'); }
        else { say(bot.name + ' declined the draw. Play on.'); botSays('No thanks. I like my position.'); }
      });
    }

    /* ---------- clock ---------- */
    function tick() {
      if (!G.times || G.result) return;
      var now = performance.now(), dt = now - (st.lastTick || now);
      st.lastTick = now;
      if (G.moves.length >= 2 && !st.checking && !st.deciding) {
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
      if (st.deciding || st.checking) { st.deciding = false; st.checking = false; say(null); board.setArrows([]); board.setPosition(st.pos, { animate: false }); }
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
        } else box.appendChild(h('p', { class: 'muted small', style: { textAlign: 'center' } }, 'Not rated: ' + (G.undos ? 'you took back a move.' : G.hints ? 'you used a hint.' : 'games shorter than three moves each don\u2019t count.')));
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
      else if (e.key === 'f') flip();
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

  /* A mate in one for the side to move in p, or null. */
  function mateInOne(p) {
    var legal = p.legalMoves();
    for (var i = 0; i < legal.length; i++) {
      var san = p.san(legal[i]);
      p.make(legal[i]);
      var mate = p.inCheck() && p.legalMoves().length === 0;
      p.unmake();
      if (mate) return { uci: C.uci(legal[i]), san: san.replace(/#$/, '') };
    }
    return null;
  }

  /* One plain reason a suggested move is good, so a hint teaches the idea and not just the move. */
  var VALUE = [0, 1, 3, 3, 5, 9, 100];
  function moveReason(pos, m) {
    var me = pos.side, from = m & 127, to = (m >> 7) & 127, fl = m >>> 17, piece = Math.abs(pos.b[from]);
    var after = pos.clone(); after.make(m);
    if (after.inCheck() && !after.legalMoves().length) return 'It\u2019s checkmate.';
    var before = pos.clone(); before.makeNull();
    if (!pos.inCheck() && mateInOne(before) && !mateInOne(after)) return 'It stops the checkmate threat.';
    var cap = Math.abs(pos.moveCaptured(m));
    if (cap && !after.attackersOf(to, -me).length) return 'It wins the ' + PIECE_NAME[cap] + ' for free.';
    // enemy pieces the moved piece now attacks that can't simply be defended
    var hits = [];
    for (var t = 0; t < 120; t++) {
      if (t & 8) { t += 7; continue; }
      var e = after.b[t];
      if (!e || (e > 0) === (me === 1) || Math.abs(e) === 6) continue;
      if (after.attackersOf(t, me).indexOf(to) >= 0 && after.hangingLoss(t) >= 100) hits.push(Math.abs(e));
    }
    hits.sort(function (a, b) { return VALUE[b] - VALUE[a]; });
    if (hits.length >= 2) return 'It attacks two pieces at once, the ' + PIECE_NAME[hits[0]] + ' and the ' + PIECE_NAME[hits[1]] + '. That\u2019s a fork.';
    if (after.inCheck() && hits.length) return 'It gives check and attacks the ' + PIECE_NAME[hits[0]] + ' at the same time.';
    if (cap && VALUE[cap] > VALUE[piece]) return 'Your ' + PIECE_NAME[piece] + ' takes a ' + PIECE_NAME[cap] + ', which is worth more.';
    if (pos.inCheck()) return 'It gets your king out of check' + (cap ? ' and takes the ' + PIECE_NAME[cap] : '') + '.';
    if (piece !== 6 && pos.hangingLoss(from) >= 100 && after.hangingLoss(to) < 100) return 'It moves your ' + PIECE_NAME[piece] + ' out of danger' + (hits.length ? ' and attacks the ' + PIECE_NAME[hits[0]] : '') + '.';
    // a piece of yours that was in danger and now isn't
    for (var s = 0; s < 120; s++) {
      if (s & 8) { s += 7; continue; }
      var q = pos.b[s];
      if (s === from || !q || (q > 0) !== (me === 1) || Math.abs(q) === 6) continue;
      if (pos.hangingLoss(s) >= 100 && after.b[s] === q && after.hangingLoss(s) < 100) return 'It protects your ' + PIECE_NAME[Math.abs(q)] + ' on ' + C.sqName(s) + '.';
    }
    if (after.inCheck()) return 'It gives check.';
    if (hits.length) return 'It attacks the ' + PIECE_NAME[hits[0]] + '.';
    if (cap) return 'It takes the ' + PIECE_NAME[cap] + '.';
    if (fl & 4) return 'It gets your king safe and brings a rook toward the middle.';
    var homeRank = me === 1 ? 0 : 7;
    if ((piece === 2 || piece === 3) && (from >> 4) === homeRank) return 'It develops your ' + PIECE_NAME[piece] + '.';
    if (piece === 1 && [3, 4].indexOf(to & 7) >= 0 && [3, 4].indexOf(to >> 4) >= 0) return 'It takes space in the center.';
    return '';
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
      if (params && params.game && !G) { var c = Store.state.current; if (c && !c.result && c.moves) G = c; }
      if (params && params.game && G) renderGame(root);
      else { G = null; renderLadder(root); }
    },
    leave: function () {
      if (view) { clearInterval(view.clockT); document.removeEventListener('keydown', view.keys); if (view.unlisten) view.unlisten(); view.token++; view.deciding = false; view = null; }
      Engines.stopAll();
    },
    busy: function () { return !!view; }
  });

  return { setup: setup, resume: resume, record: record, toggle: toggle, seg: seg,
    _reason: function (fen, uci) { var p = new C.Pos(fen), m = p.parseMove(uci); return m ? moveReason(p, m) : null; } };
})();
