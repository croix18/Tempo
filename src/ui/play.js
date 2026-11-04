/* Tempo play: the characters in their tiers, game setup, live games with the coach. */
var Play = (function () {
  'use strict';
  var h = U.h, C = TempoCore, BOTS = TempoBots.BOTS, TIERS = TempoBots.TIERS;
  var G = null, view = null, openTiers = {}; // tiers you opened or folded stay the way you left them
  var ended = null; // { id, rec }: the result of the game that just finished, for its view if it's drawn again

  /* ---------- the tiers ---------- */
  function renderTiers(root) {
    var S = Store.state, all = S.settings.unlockAll, top = TempoBots.topTier(S.play), next = TempoBots.nextFor(S.play, all);
    root.appendChild(h('div', { class: 'page-head' }, h('h1', null, 'Play'),
      h('div', { class: 'head-note' }, 'Your rating ', h('b', { class: 'num' }, String(S.play.rating)))));
    var cb = S.current && S.current.moves && S.current.moves.length && !S.current.result ? TempoBots.byId(S.current.bot) : null;
    if (cb) root.appendChild(h('div', { class: 'resume' },
      h('p', { class: 'grow' }, 'Your game against ' + cb.name + ' is still going. You’re on move ' + (Math.floor(S.current.moves.length / 2) + 1) + '.'),
      h('div', { class: 'row tight' },
        h('button', { class: 'btn quiet small', type: 'button', onclick: function () { abandon().then(function (ok) { if (ok) App.refresh(); }); } }, 'Abandon'),
        h('button', { class: 'btn primary small', type: 'button', onclick: function () { resume(); } }, 'Resume'))));
    // where you are: your tier, how far to its promotion match, and who's next
    var tp = UI.tierProgress(top), champ = S.play.champ;
    root.appendChild(h('section', { class: 'card tier-now', 'aria-label': 'Your tier' },
      h('div', { class: 'tier-head' }, UI.tierBadge(top, 'lg'), h('div', { class: 'grow' }, h('div', { class: 'label' }, champ ? 'Tempo Champion' : 'Your tier'), h('h2', null, UI.tierLabel(top)), h('p', { class: 'muted' }, tp.text), tp.dots)),
      cb ? null : h('div', { class: 'row', style: { marginTop: '12px' } }, UI.avatar(next, 'sm'), h('div', { class: 'grow' }, h('div', { style: { fontWeight: 600 } }, next.name), h('div', { class: 'muted small' }, next.bio)),
        h('button', { class: 'btn primary small', type: 'button', onclick: function () { setup(next); } }, 'Play ' + next.short))));
    TIERS.forEach(function (t, i) { root.appendChild(tierSection(i, top, next, cb, all)); });
    // the bonus challenger: a mystery until it appears
    var bonus = h('div', { class: 'chars' });
    TempoBots.BONUS.forEach(function (id) {
      var b = TempoBots.byId(id);
      bonus.appendChild(TempoBots.access(S.play, id, all) === 'hidden' ? UI.mysteryTile(id) : UI.charTile(b, { next: next.id, playing: cb && cb.id }));
    });
    root.appendChild(h('section', { class: 'tier-section bonus', 'aria-label': 'Bonus challenger' }, h('h2', { class: 'tier-title' }, 'Bonus'), bonus));
    // playing someone across a real board: the screen becomes the clock
    root.appendChild(h('nav', { class: 'menu-list', 'aria-label': 'Over the board', style: { maxWidth: '720px', marginTop: '24px' } },
      UI.menuRow('clock', 'Chess clock', 'For a game on a real board', function () { App.go('clock'); })));
    var recent = S.games.list.slice(0, 3);
    if (recent.length) {
      root.appendChild(h('h2', { style: { margin: '32px 0 12px' } }, 'Recent games'));
      var rl = h('nav', { class: 'menu-list', 'aria-label': 'Recent games', style: { maxWidth: '720px' } });
      recent.forEach(function (g) {
        var b = TempoBots.find(g.bot), name = b ? b.short || b.name : (g.opp || 'opponent');
        rl.appendChild(UI.menuRow('review', resultPhrase(g, name) + ', ' + U.dateShort(g.ts), g.reviewed && g.acc != null ? Math.round(g.acc) + '% accuracy' : 'Not reviewed yet', function () { Review.openGame(g.id); }));
      });
      rl.appendChild(UI.menuRow('list', 'All games', null, function () { App.go('review'); }));
      root.appendChild(rl);
    }
    root.appendChild(h('p', { class: 'faint small', style: { marginTop: '16px', maxWidth: '62ch' } },
      'Ratings are rough difficulty targets, not official ratings. ' + (Engines.status === 'failed' ? 'Stockfish isn’t available in this browser, so the Masters and Legends use the built-in engine.' : 'The Masters and Legends play with Stockfish.')));
  }
  /* one tier: a header that folds, then its ten characters */
  function tierSection(i, top, next, cb, all) {
    var S = Store.state, t = TIERS[i], beaten = t.members.filter(function (id) { var r = S.play.bots[id]; return r && r.beaten; }).length;
    var locked = !all && i > top, open = openTiers[i] != null ? openTiers[i] : i === top;
    var grid = h('div', { class: 'chars' });
    t.members.forEach(function (id) { grid.appendChild(UI.charTile(TempoBots.byId(id), { next: cb ? null : next.id, playing: cb && cb.id })); });
    var body = h('div', { class: 'unit-body' + (open ? ' open' : ''), id: 'tier-' + t.id }, h('div', { class: 'unit-inner' }, grid));
    var head = h('button', { class: 'unit-head tier-fold', type: 'button', 'aria-expanded': open ? 'true' : 'false', 'aria-controls': 'tier-' + t.id,
      onclick: function () { var on = !body.classList.contains('open'); body.classList.toggle('open', on); head.setAttribute('aria-expanded', on ? 'true' : 'false'); openTiers[i] = on; } },
      UI.tierBadge(i), h('span', { class: 'txt' }, h('span', { class: 't' }, t.name),
        h('span', { class: 's' }, h('span', { class: 'num' }, t.lo + '–' + t.hi), ' · ', locked ? 'Locked' : beaten + ' of ' + t.members.length + ' beaten')),
      locked ? h('span', { class: 'tier-status' }, U.icon('lock')) : null, U.icon('next', 'chev'));
    return h('section', { class: 'card unit-card tier-section' + (locked ? ' locked' : '') + (i === top ? ' current' : ''), 'aria-label': UI.tierLabel(i) }, head, body);
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
  function setup(bot, opts) {
    var S = Store.state.settings;
    var choice = { color: S.color || 'w', coach: S.coach !== false, ask: S.coachAsk === true, takebacks: S.takebacks !== false, hanging: S.hanging !== false, clock: S.clock || 'none' };
    App.sheet(function (box, api) {
      box.classList.add('wide');
      box.appendChild(profile(bot));
      var rec = Store.state.play.bots[bot.id];
      if (rec && rec.w + rec.d + rec.l) box.appendChild(h('p', { class: 'small', style: { marginTop: '12px' } }, 'Your record against ' + bot.short + ': ' + recordWords(rec) + '.' + (rival(rec) ? ' A real rivalry.' : '')));
      box.appendChild(h('div', { class: 'label', style: { margin: '16px 0 8px' } }, 'You play'));
      box.appendChild(seg([['w', 'White'], ['r', 'Random'], ['b', 'Black']], choice.color, function (v) { choice.color = v; }));
      box.appendChild(h('div', { class: 'label', style: { margin: '16px 0 8px' } }, 'Clock'));
      box.appendChild(seg([['none', 'No clock'], ['10', '10 min'], ['15+10', '15 + 10 s'], ['30', '30 min']], choice.clock, function (v) { choice.clock = v; }));
      box.lastChild.children[2].setAttribute('aria-label', '15 minutes, plus 10 seconds for each move');
      box.lastChild.children[2].title = '15 minutes, plus 10 seconds for each move';
      var tg = h('div', { style: { marginTop: '10px' } });
      tg.appendChild(toggle('Coach', 'Warns you before a move that loses material.', choice.coach, function (v) { choice.coach = v; }));
      tg.appendChild(toggle('Ask me first', 'The coach asks you to find the problem before it explains.', choice.ask, function (v) { choice.ask = v; }));
      tg.appendChild(toggle('Show threats', 'Rings pieces you could lose, and warns you when checkmate is threatened.', choice.hanging, function (v) { choice.hanging = v; }));
      tg.appendChild(toggle('Takebacks', 'Lets you undo a move.', choice.takebacks, function (v) { choice.takebacks = v; }));
      box.appendChild(tg);
      box.appendChild(h('p', { class: 'muted small', style: { marginTop: '12px' } }, 'The game counts toward your rating unless you use a hint or take back a move, including taking one back when the coach warns you.'));
      box.appendChild(h('div', { class: 'row end', style: { marginTop: '18px' } },
        h('button', { class: 'btn primary block', type: 'button', onclick: function () {
          var s = Store.state.settings;
          s.color = choice.color; s.coach = choice.coach; s.coachAsk = choice.ask; s.takebacks = choice.takebacks; s.hanging = choice.hanging; s.clock = choice.clock;
          Store.touch('settings');
          abandon().then(function (ok) { if (!ok) return; api.close(); start(bot, choice, opts); });
        } }, 'Start game')));
    });
  }
  /* who a character is and how it plays. About: who they are in their own story, Tempo's take on them and how they
     play. How they play: the radar of their traits, plan, tricks, weak spot and openings. Only "Who they are" comes
     from the source; the rest is Tempo's, and the sheet says so. */
  var profileTab = 'about';
  function profile(bot) {
    var t = TIERS[bot.tierIdx], isBoss = bot.id === t.boss, o = bot.openings || {}, V = TempoTalk.voice(bot.id), card = V ? V.card : {};
    var head = h('div', { class: 'row profile-head' }, UI.avatar(bot, 'lg'),
      h('div', { class: 'grow' }, h('h2', null, bot.name),
        h('div', { class: 'muted' }, (bot.bonus ? 'Bonus challenger' : UI.tierLabel(bot.tierIdx)) + ' \u00b7 about ' + bot.rating),
        card.franchise && card.franchise.toLowerCase() !== bot.name.toLowerCase() ? h('div', { class: 'muted from' }, 'From ' + card.franchise) : null,
        isBoss ? h('span', { class: 'chip gold', style: { marginTop: '6px' } }, TempoBots.TIERS.length - 1 === bot.tierIdx ? 'Final match' : 'Promotion match') : null));
    var tricks = (bot.tactics || []).join(', ');
    var facts = h('dl', { class: 'facts' },
      h('dt', null, 'How ' + bot.short + ' plays'), h('dd', null, bot.plan),
      h('dt', null, 'Favorite tricks'), h('dd', null, tricks.charAt(0).toUpperCase() + tricks.slice(1) + '.'),
      h('dt', null, 'Weak spot'), h('dd', null, bot.weakness),
      h('dt', null, 'Openings'), h('dd', null, h('span', { class: 'op' }, 'As White: ' + o.white + '.'), h('span', { class: 'op' }, 'Against 1.e4: ' + o.black_vs_e4 + '.'), h('span', { class: 'op' }, 'Against 1.d4: ' + o.black_vs_d4 + '.')));
    var chess = h('div', { class: 'profile', role: 'tabpanel', 'aria-label': 'How they play' }, h('div', { class: 'radar-box' }, UI.radar(bot.traits || {})), facts);
    var about = null;
    if (V) {
      var silent = V.mode === 'silent';
      about = h('div', { class: 'about', role: 'tabpanel', 'aria-label': 'About' },
        h('dl', { class: 'facts' },
          h('dt', null, 'Who they are'), h('dd', null, card.canon),
          h('dt', null, 'Tempo\u2019s take'), h('dd', { class: 'take' }, card.assessment),
          card.style ? h('dt', null, 'On the board') : null, card.style ? h('dd', null, card.style) : null),
        h('p', { class: 'profile-note' }, 'Only \u201cWho they are\u201d comes from ' + bot.short + '\u2019s own story. ' + (silent ? 'The chess and the rating are' : 'The chess, the rating and everything ' + bot.short + ' says are') + ' made up for Tempo.'));
    }
    var wrap = h('div', { class: 'profile-wrap' }, head, h('p', { class: 'profile-bio' }, bot.bio + '.'));
    if (!about) { wrap.appendChild(chess); return wrap; }
    var tab = profileTab;
    var panels = h('div', { class: 'profile-panels' });
    function show(v) { tab = profileTab = v; U.clear(panels); panels.appendChild(v === 'chess' ? chess : about); }
    wrap.appendChild(h('div', { class: 'profile-tabs' }, seg([['about', 'About'], ['chess', 'How they play']], tab, show)));
    wrap.appendChild(panels);
    show(tab);
    return wrap;
  }
  /* how a character's lines look: spoken, typed in a game chat, announced over a speaker, or thought */
  var MODE_CLASS = { in_game_text: 'chat', speaker_pa: 'pa', telepathic: 'mind' };
  function bubbleClass(mode) { return 'bubble' + (MODE_CLASS[mode] ? ' ' + MODE_CLASS[mode] : ''); }
  /* a close record over a few games */
  function rival(r) { return r && r.w >= 1 && r.l >= 1 && r.w + r.d + r.l >= 3 && Math.abs(r.w - r.l) <= 1; }
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
  function start(bot, choice, opts) {
    var color = choice.color === 'r' ? (Math.random() < 0.5 ? 'w' : 'b') : choice.color;
    // a rematch: from the button after a game, or the same character again within half an hour
    var last = Store.state.games.list[0], again = !!(opts && opts.rematch) || !!(last && last.bot === bot.id && Date.now() - last.ts < 30 * 60000);
    var spec = clockSpec(choice.clock);
    G = { id: U.uid(), bot: bot.id, color: color, startFen: C.START_FEN, moves: [], sans: [], coach: choice.coach, ask: !!choice.ask, hanging: choice.hanging,
      takebacks: choice.takebacks, clock: spec, times: spec ? { w: spec.base, b: spec.base } : null, hints: 0, undos: 0, warned: 0,
      result: null, reason: null, startedAt: Date.now(), rematch: again, talk: null };
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
    var st = { pos: pos, viewPly: null, thinking: false, token: 0, hintStage: 0, hintMove: null, pre: null, ended: !!G.result, clockT: null, lastTick: 0, bubbleT: null, epds: [],
      // the character's side of the game: its last move, Psyduck's surge, and the referee's scores for what it says
      ps: { last: lastBotMove(), surge: 0, surgeStart: false }, refs: {}, refv: {}, saidAt: 0, sayT: null };
    view = st;
    st.say = function (t) { botSays({ key: 'test', text: t, ply: G.moves.length, test: true }); }; // for tests: show a line the way the game would

    var head = h('div', { class: 'row between game-head' },
      h('button', { class: 'back', type: 'button', onclick: function () { leaveGame(); } }, U.icon('back'), 'Characters'),
      h('div', { class: 'opening-name', id: 'opening' }));
    root.appendChild(head);

    var board = new Board({ orient: G.color, movable: null, coords: S.settings.coords !== false, onMove: userMove });
    st.board = board;
    var oppBar = h('div', { class: 'player' }), youBar = h('div', { class: 'player' });
    // the bot's chat floats in its own name strip, beside its picture, so nothing else on the screen moves when it talks;
    // a tap (or Escape) puts it away
    var voiceMode = TempoTalk.mode(bot.id);
    var bubble = h('div', { class: bubbleClass(voiceMode), role: 'status', hidden: true, title: 'Tap to close', onclick: function () { hush(); } });
    oppBar.appendChild(bubble);
    var coach = h('div', { class: 'coach', hidden: true });
    var movesBox = h('div');
    var controls = h('div', { class: 'controls' });
    // when the game is over: who won and how, which stays put after the result sheet is closed (a tap opens it again)
    var resultBox = h('div', { class: 'result-slot', hidden: true });
    var boardCol = h('div', { class: 'board-col' }, oppBar, board.el, youBar);
    var panel = h('div', { class: 'panel' }, resultBox, controls, coach, movesBox);
    var arena = h('div', { class: 'arena' }, boardCol, panel);
    root.appendChild(arena);
    /* the name strip next to each side's pieces follows the board when it flips */
    function placeBars() {
      var youAtBottom = board.orient === G.color;
      boardCol.insertBefore(youAtBottom ? oppBar : youBar, board.el);
      boardCol.appendChild(youAtBottom ? youBar : oppBar);
      // the character's line grows away from the board, never over it
      oppBar.classList.toggle('above', youAtBottom); oppBar.classList.toggle('below', !youAtBottom);
    }
    function flip() { board.flip(); placeBars(); }
    placeBars();
    // the move list switches between a strip and a table at desktop width
    var wideMq = window.matchMedia('(min-width: 980px)');
    var onWide = function () { if (view === st) renderMoves(); };
    if (wideMq.addEventListener) wideMq.addEventListener('change', onWide);
    st.unlisten = function () { if (wideMq.removeEventListener) wideMq.removeEventListener('change', onWide); };

    function bars() {
      var mat = UI.material(st.pos);
      // rebuild the strips, but leave the chat bubble where it is so it doesn't flash
      Array.prototype.slice.call(oppBar.childNodes).forEach(function (n) { if (n !== bubble) oppBar.removeChild(n); });
      U.clear(youBar);
      function opp(el) { oppBar.insertBefore(el, bubble.parentNode === oppBar ? bubble : null); }
      oppBar.classList.toggle('timed', !!G.times);
      var oppCaps = G.color === 'w' ? mat.byBlack : mat.byWhite, myCaps = G.color === 'w' ? mat.byWhite : mat.byBlack;
      var bal = mat.balance * you;
      opp(UI.avatar(bot, 'sm'));
      opp(h('div', { class: 'who' }, h('div', { class: 'name' }, bot.short, h('span', { class: 'rating' }, String(bot.rating)),
        st.thinking ? h('span', { class: 'thinking', 'aria-label': 'thinking' }, h('i'), h('i'), h('i')) : null), UI.capturedRow(oppCaps, bal < 0 ? -bal : 0)));
      youBar.appendChild(h('span', { class: 'avatar sm tone-you', 'aria-hidden': 'true' }, 'Y'));
      youBar.appendChild(h('div', { class: 'who' }, h('div', { class: 'name' }, 'You', h('span', { class: 'rating' }, String(Store.state.play.rating))), UI.capturedRow(myCaps, bal > 0 ? bal : 0)));
      if (G.times) {
        var oppC = G.color === 'w' ? 'b' : 'w';
        opp(h('div', { class: 'clock' + (clockRunning(oppC) ? ' run' : '') + (G.times[oppC] < 20000 ? ' low' : ''), id: 'clock-opp' }, U.clockText(G.times[oppC])));
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
      if (G.result) board.setBadge(n == null ? endBadges(G.result, G.reason) : null);
      renderMoves(); bars();
    }

    function renderControls() {
      U.clear(controls);
      if (G.result) {
        controls.appendChild(h('button', { class: 'btn primary', type: 'button', onclick: function () { Review.openGame(G.id); } }, U.icon('review'), 'Review game'));
        controls.appendChild(h('button', { class: 'btn', type: 'button', onclick: function () { setup(bot, { rematch: true }); } }, 'Rematch'));
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

    // the moves under the coach's note glide out of its way as it comes and goes
    function say(text, kind) {
      if (!text && coach.hidden) return;
      U.glide(panel, function () {
        if (!text) { coach.hidden = true; coach.className = 'coach'; return; }
        U.clear(coach);
        coach.className = 'coach' + (kind ? ' ' + kind : '');
        coach.appendChild(U.icon(kind === 'alert' ? 'shield' : kind === 'good' ? 'check' : 'hint'));
        coach.appendChild(h('div', { class: 'grow' }, text));
        coach.hidden = false;
      });
    }
    /* ---------- what the character says (src/talk.js picks the line; this shows it) ---------- */
    function talkOpts() { var c = Store.state.settings.chat; return { chat: c === 'off' || c === 'lots' ? c : 'some' }; }
    function talking() { return talkOpts().chat !== 'off'; }
    /* its line, in its name strip, one at a time: up long enough to read, and a new line waits until the one before
       has been seen. A line about a position that's gone (the board moved on while it waited) is dropped, and only a
       line that was really shown goes into the game's story. */
    function botSays(c) {
      if (!c || !c.text || !talking()) return Promise.resolve(false);
      var since = performance.now() - st.saidAt, wait = st.saidAt && since < 2200 ? 2200 - since : 0, done;
      var shownP = new Promise(function (ok) { done = ok; });
      cancelSay();
      st.sayDone = done;
      st.sayT = setTimeout(function () {
        st.sayDone = null;
        if (view !== st || !G || G.result || G.moves.length !== c.ply) { done(false); return; }
        if (!c.test) { if (!TempoTalk.said(G, c)) { done(false); return; } Store.touch(); }
        U.clear(bubble); bubble.appendChild(h('span', { class: 'sr-only' }, bot.short + ': ')); bubble.appendChild(document.createTextNode(c.text));
        bubble.classList.remove('out'); bubble.hidden = false;
        oppBar.classList.add('talking'); // the name steps aside while the character talks
        st.saidAt = performance.now();
        clearTimeout(st.bubbleT);
        st.bubbleT = setTimeout(function () { hush(); }, TempoTalk.readMs(c.text));
        done(true);
      }, wait);
      return shownP;
    }
    // a line waiting to be shown isn't
    function cancelSay() { clearTimeout(st.sayT); if (st.sayDone) { st.sayDone(false); st.sayDone = null; } }
    // put the line away: fade it out as the name comes back, then hide it
    function hush(now) {
      clearTimeout(st.bubbleT);
      if (bubble.hidden) return;
      oppBar.classList.remove('talking');
      if (now) { bubble.hidden = true; bubble.classList.remove('out'); return; }
      bubble.classList.add('out');
      st.bubbleT = setTimeout(function () { bubble.hidden = true; bubble.classList.remove('out'); }, 260);
    }
    st.hush = hush;
    /* the referee: a quick, separate look at the position after n moves, scored from the character's side, so what it
       says about the chess (a blunder, a tactic that works) is true. Queued behind the character's own thinking. */
    function refAt(n) {
      if (n < 0 || n > G.moves.length || !talking() || Engines.inline) return Promise.resolve(null);
      if (st.refs[n]) return st.refs[n];
      var moves = G.moves.slice(0, n), botSide = G.color === 'w' ? -1 : 1, p = new C.Pos(G.startFen);
      moves.forEach(function (u) { p.make(p.parseMove(u)); });
      if (p.status().over) return (st.refs[n] = Promise.resolve(null));
      var gid = G.id, line = moves.join(' ');
      st.refs[n] = Engines.analyse({ fen: G.startFen, moves: moves, depth: 9, movetime: 300 }).then(function (r) {
        var l = r && r.lines && r.lines[0];
        if (!l || (l.cp == null && l.mate == null)) return null;
        var sc = l.mate != null ? (l.mate > 0 ? 1500 - l.mate : -1500 - l.mate) : l.cp;
        var v = { v: p.side === botSide ? sc : -sc, mat: TempoTalk.material(p, botSide, r.engine), engine: r.engine };
        if (view === st && G && G.id === gid && G.moves.slice(0, n).join(' ') === line) st.refv[n] = v;
        return v;
      }, function () { return null; });
      return st.refs[n];
    }
    // the referee's scores, waited for a little while at most: a remark that needs them and doesn't get them isn't made
    function upTo(pr, ms) { return Promise.race([pr, new Promise(function (ok) { setTimeout(function () { ok(null); }, ms); })]); }
    function past(n) { var out = []; for (var i = Math.max(0, n - 6); i < n; i++) if (st.refv[i]) out.push(st.refv[i]); return out; }
    /* after your move, before it answers: your check, your blunder, a special of yours, a beat of its story. Its reply
       waits for this (a few seconds at most), and when it says something, a moment longer: the remark about your move
       comes before the board changes. */
    function reactYou() {
      if (!talking() || G.result) return Promise.resolve();
      var n = G.moves.length, gid = G.id;
      return upTo(Promise.all([upTo(refAt(n - 1), 1500), upTo(refAt(n), 1500)]).then(function (rs) {
        if (view !== st || !G || G.id !== gid || G.result || G.moves.length !== n) return false;
        var c = null;
        try { c = TempoTalk.human(G, bot, { prev: rs[0], now: rs[1] }, talkOpts()); } catch (e) { console.error(e); } // a line is never worth a stuck game
        return botSays(c);
      }).then(function (shown) { return shown ? U.sleep(900) : null; }), 3200);
    }
    // after its move, once the referee has looked at the positions it needs
    function reactBot(res) {
      if (!talking() || G.result) return;
      var n = G.moves.length, gid = G.id;
      Promise.all([upTo(refAt(n - 2), 2500), upTo(refAt(n - 1), 2500), upTo(refAt(n), 2500)]).then(function (rs) {
        if (view !== st || !G || G.id !== gid || G.result || G.moves.length !== n) return;
        try { botSays(TempoTalk.bot(G, bot, res, { prev2: rs[0], prev: rs[1], now: rs[2], past: past(n) }, talkOpts())); } catch (e) { console.error(e); }
      });
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
        say('Watch out: ' + bot.short + ' threatens checkmate with ' + threat.san + '. Stop it with this move.', 'alert');
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
      st.last = last || null; // the move highlighted on the board, kept for when a checked move is taken back
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
        board.setPosition(temp, { last: m, animate: true });
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
                board.setArrows([]); board.setMovable(G.color); board.setPosition(st.pos, { animate: true, last: st.last, clearLast: !st.last }); markHanging();
                say('Taken back. ' + res.short + ' Try another move.', 'alert');
                renderControls();
              } else { board.setArrows([]); commit(uci, G.color); if (!G.result) botTurn(reactYou()); }
            });
          } else {
            commit(uci, G.color);
            if (!G.result) botTurn(reactYou());
          }
        });
        return;
      }
      commit(uci, G.color);
      if (!G.result) botTurn(reactYou());
    }

    /* The coach's warning sits right under the board, with the danger drawn on it in red.
       Nothing else can happen until you choose. */
    function warnInline(res, temp, cb) {
      st.deciding = true; renderControls();
      var take = h('button', { class: 'btn primary', type: 'button', onclick: function () { choose(true); } }, 'Take it back');
      // with Ask me first on, the coach asks you to find the problem on the board before it explains
      if (G.ask && res.ask && res.ask.squares && res.ask.squares.length) ask(); else explain('');
      function ask() {
        var tries = 0, text = h('span', null, res.ask.prompt);
        board.opts.onSquare = function (name) {
          if (!st.deciding) return;
          if (res.ask.squares.indexOf(name) >= 0) { U.sound.good(); explain('You found it. '); return; }
          tries++;
          board.setMarks([{ sq: name, kind: 'red' }]);
          if (tries >= 2) { explain('Not that one. '); return; }
          text.textContent = 'Not that one. ' + res.ask.prompt;
        };
        U.glide(panel, function () {
          U.clear(coach);
          coach.className = 'coach alert decide asking';
          coach.appendChild(U.icon('shield'));
          coach.appendChild(h('div', { class: 'grow' }, h('b', null, 'Hold on. '), text,
            h('div', { class: 'row', style: { marginTop: '10px' } }, h('button', { class: 'btn', type: 'button', onclick: function () { explain(''); } }, 'Show me'))));
          coach.hidden = false;
        });
      }
      function explain(lead) {
        if (!st.deciding) return;
        board.opts.onSquare = null;
        board.setMarks(res.ask && res.ask.squares ? res.ask.squares.map(function (q) { return { sq: q, kind: 'danger' }; }) : []);
        if (res.reply) board.setArrows([{ from: res.reply.slice(0, 2), to: res.reply.slice(2, 4), color: 'red' }]);
        U.glide(panel, function () {
          U.clear(coach);
          coach.className = 'coach alert decide';
          coach.appendChild(U.icon('shield'));
          coach.appendChild(h('div', { class: 'grow' },
            h('b', null, lead + res.title + '. '), document.createTextNode(res.text.replace(/ Take the move back\?$/, '')),
            h('div', { class: 'row', style: { marginTop: '10px' } }, take,
              h('button', { class: 'btn', type: 'button', onclick: function () { choose(false); } }, 'Play it anyway'))));
          coach.hidden = false;
        });
        setTimeout(function () { try { take.focus({ preventScroll: true }); } catch (e) { /* ignore */ } }, 0);
      }
      function choose(v) { if (!st.deciding) return; st.deciding = false; board.opts.onSquare = null; board.setMarks([]); say(null); cb(v); }
    }

    /* ---------- the bot's move ----------
       heard: the reaction to your move, which its reply waits for */
    function botTurn(heard) {
      if (G.result) return;
      st.thinking = true; bars(); renderControls();
      var tok = ++st.token, t0 = performance.now(), ps = st.ps;
      // the weaker characters take a moment, like a person would
      var minDelay = bot.rating < 1000 ? 450 + Math.random() * 700 : 250;
      if (bot.surge) { if (ps.surge > 0) ps.surge--; else if (Math.random() < bot.surge.chance) { ps.surge = bot.surge.len; ps.surgeStart = true; } }
      var decided = Engines.botDecide(bot, { fen: G.startFen, moves: G.moves.slice(), sans: G.sans.slice() }, { last: ps.last, surge: ps.surge });
      refAt(G.moves.length); // asked for already, after your move: the referee's look comes before its search in the queue
      Promise.all([decided, heard && heard.then(null, function () { /* its move comes regardless */ })]).then(function (rs) {
        var res = rs[0], wait = Math.max(0, minDelay - (performance.now() - t0)), uci = res && res.uci;
        setTimeout(function () {
          if (tok !== st.token || G.result || st.ended) return;
          st.thinking = false;
          var by = G.color === 'w' ? 'b' : 'w';
          if (!uci || !commit(uci, by)) {
            // engine failed: play any legal move rather than freezing
            var legal = st.pos.legalMoves();
            if (legal.length) commit(C.uci(legal[Math.floor(Math.random() * legal.length)]), by);
          } else { ps.last = uci; if (!G.result) { refAt(G.moves.length); reactBot(res); } }
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
      // what was said after the moves taken back didn't happen; the referee's old scores go too
      TempoTalk.truncate(G);
      Object.keys(st.refs).forEach(function (k) { if (+k > G.moves.length) { delete st.refs[k]; delete st.refv[k]; } });
      cancelSay(); hush(true);
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
      if (G.moves.length < 20) { say(bot.short + ' won\u2019t agree to a draw before move 10. Play on.'); return; }
      say(bot.short + ' is thinking about your draw offer\u2026');
      var dtok = st.token;
      Engines.analyse({ fen: st.pos.fen(), depth: 12, movetime: 800 }).then(function (r) {
        if (dtok !== st.token || view !== st || !G || G.result) return;
        var l = r.lines[0] || { cp: 0 };
        var forSideToMove = l.mate != null ? (l.mate > 0 ? 3000 : -3000) : l.cp;
        var botSide = G.color === 'w' ? -1 : 1;
        var forBot = (st.pos.side === botSide) ? forSideToMove : -forSideToMove;
        if (forBot <= 30) { finish('1/2-1/2', 'agreement'); }
        else say(bot.short + ' declined the draw. Play on.');
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
      if (st.deciding || st.checking) { st.deciding = false; st.checking = false; board.opts.onSquare = null; say(null); board.setArrows([]); board.setPosition(st.pos, { animate: false }); }
      G.result = result; G.reason = reason;
      clearInterval(st.clockT); cancelSay(); hush(true);
      var record = Play.record(G, bot);
      Store.state.current = null; Store.touch();
      board.setMovable(null);
      U.sound.end();
      bars(); renderControls(); renderMoves(); board.setMarks([]);
      say(null);
      /* the end is shown on the board first: a crown on the winner's king, a mark on the loser's (# for checkmate, a
         flag for resigning, a clock for time), a half on both for a draw, and the result under the board. The result
         sheet follows a moment later, so the final move is seen, and so the tap that ended the game can't close it. */
      ended = { id: G.id, rec: record };
      board.setBadge(endBadges(result, reason));
      showResult(record);
      st.endT = setTimeout(function () { if (view === st) endSheet(record); }, 1100);
    }
    function endBadges(result, reason) {
      var p = st.pos;
      if (result === '1/2-1/2') return [{ sq: p.wk, kind: 'end-draw', text: '\u00bd' }, { sq: p.bk, kind: 'end-draw', text: '\u00bd' }];
      var whiteWon = result === '1-0', mark = reason === 'checkmate' ? { text: '#' } : reason === 'resignation' ? { icon: 'flag' } : /time/.test(reason) ? { icon: 'clock' } : { text: '0' };
      return [{ sq: whiteWon ? p.wk : p.bk, kind: 'end-win', icon: 'crown' }, Object.assign({ sq: whiteWon ? p.bk : p.wk, kind: 'end-lose' }, mark)];
    }
    function resultWords(rec) {
      return { title: rec.score === 1 ? 'You won' : rec.score === 0.5 ? 'Draw' : 'You lost',
        why: { checkmate: 'by checkmate', resignation: 'by resignation', time: 'on time', stalemate: 'by stalemate', agreement: 'by agreement',
          'insufficient material': 'by insufficient material', 'fifty-move rule': 'by the fifty-move rule', 'threefold repetition': 'by repetition',
          'timeout vs insufficient material': 'on time, but there wasn\u2019t enough left to checkmate' }[rec.reason] || rec.reason };
    }
    function showResult(rec) {
      var w = resultWords(rec), d = rec.rated ? rec.after - rec.before : null;
      U.clear(resultBox);
      // the same mark as on the board: a crown when you won, how you lost (# checkmate, a flag, a clock), a half for a draw
      var mark = rec.score === 1 ? U.icon('crown', 'i-crown') : rec.score === 0.5 ? '\u00bd' : rec.reason === 'checkmate' ? '#' : rec.reason === 'resignation' ? U.icon('flag', 'i-flag') : /time/.test(rec.reason) ? U.icon('clock', 'i-clock') : '0';
      resultBox.appendChild(h('button', { class: 'game-result ' + (rec.score === 1 ? 'won' : rec.score === 0.5 ? 'drew' : 'lost'), type: 'button', role: 'status',
        'aria-label': w.title + ' ' + w.why + '. Show the result.', onclick: function () { clearTimeout(st.endT); endSheet(rec); } },
        h('span', { class: 'gr-mark' }, mark),
        h('span', { class: 'gr-title' }, w.title),
        h('span', { class: 'gr-why' }, w.why, d != null ? h('span', { class: 'gr-rating' }, ' \u00b7 Rating ' + rec.after + ' ', h('span', { class: 'delta ' + (d >= 0 ? 'up' : 'down') }, (d >= 0 ? '+' : '') + d)) : null),
        U.icon('next', 'gr-more')));
      resultBox.hidden = false;
    }
    function endSheet(rec) {
      var won = rec.score === 1, drew = rec.score === 0.5, why = resultWords(rec).why;
      App.sheet(function (box, api) {
        box.appendChild(h('div', { class: 'result-hero' },
          h('div', { class: 'big' }, won ? 'You won' : drew ? 'Draw' : 'You lost'),
          h('div', { class: 'muted' }, why)));
        // the character's word on the result (and, for Sheldon, the end of his story)
        var said = TempoTalk.end(G, bot, rec.score, rec.reason, talkOpts());
        if (said) box.appendChild(h('div', { class: 'row end-say' }, UI.avatar(bot, 'sm'), h('div', { class: bubbleClass(voiceMode), role: 'status' },
          h('span', { class: 'sr-only' }, bot.short + ': '), said.text, said.more ? h('span', { class: 'more' }, said.more) : null)));
        if (rec.rated) {
          var d = rec.after - rec.before;
          box.appendChild(h('p', { style: { textAlign: 'center' } }, 'Rating ', h('b', null, String(rec.after)), ' ', h('span', { class: 'delta ' + (d >= 0 ? 'up' : 'down') }, (d >= 0 ? '+' : '') + d)));
        } else box.appendChild(h('p', { class: 'muted small', style: { textAlign: 'center' } }, 'Not rated: ' + (G.undos ? 'you took back a move.' : G.hints ? 'you used a hint.' : 'games shorter than three moves each don\u2019t count.')));
        (rec.news || []).forEach(function (n) { box.appendChild(h('div', { class: 'feedback ok news', style: { textAlign: 'center', marginBottom: '8px' } }, n.text)); });
        var pt = Mistakes.patterns();
        if (pt) box.appendChild(h('p', { class: 'muted small', style: { textAlign: 'center' } }, 'Your pattern so far: ' + Mistakes.patternText(pt).replace(/^You /, 'you ').replace(/\.$/, '') + '. The review shows whether this game fits it.'));
        var row = h('div', { class: 'stack', style: { marginTop: '14px' } },
          h('button', { class: 'btn primary block', type: 'button', onclick: function () { api.close(); Review.openGame(G.id); } }, U.icon('review'), 'Review this game'));
        var row2 = h('div', { class: 'row' }, h('button', { class: 'btn grow', type: 'button', onclick: function () { api.close(); setup(bot, { rematch: true }); } }, 'Rematch'));
        if (rec.unlocked) row2.appendChild(h('button', { class: 'btn grow', type: 'button', onclick: function () { api.close(); setup(rec.unlocked); } }, 'Play ' + rec.unlocked.short));
        else row2.appendChild(h('button', { class: 'btn grow', type: 'button', onclick: function () { api.close(); leaveGame(); } }, 'Characters'));
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
      if (e.key === 'Escape' && !bubble.hidden && !document.querySelector('.sheet')) { hush(); return; }
      if (e.key === 'ArrowLeft') { var n = st.viewPly == null ? G.moves.length - 1 : st.viewPly - 1; if (n >= 0) showPly(n); }
      else if (e.key === 'ArrowRight') { if (st.viewPly != null) showPly(st.viewPly + 1); }
      else if (e.key === 'f') flip();
    };
    document.addEventListener('keydown', st.keys);

    // first paint
    var lastMove = null;
    if (G.moves.length) { var tp = new C.Pos(G.startFen); G.moves.forEach(function (u) { lastMove = tp.parseMove(u); tp.make(lastMove); }); }
    sync(lastMove, false);
    // hello (or "again?" on a rematch); a game picked up again goes on where it was, so the referee looks at it now
    if (!G.moves.length) botSays(TempoTalk.start(G, bot, talkOpts()));
    else if (!G.result) refAt(G.moves.length);
    if (G.coach && !G.moves.length) say('Coach is on. You’ll get a warning before a move that loses material.');
    if (G.result) { finishView(); }
    else if (myTurn()) startMyTurn();
    else botTurn();
    function finishView() {
      board.setMovable(null); renderControls();
      board.setBadge(endBadges(G.result, G.reason));
      if (ended && ended.id === G.id) showResult(ended.rec);
    }
  }

  /* the character's previous move in the game in progress, so it can tell when it repeats itself */
  function lastBotMove() {
    if (!G || !G.moves.length) return null;
    var startSide = new C.Pos(G.startFen).side, botSide = G.color === 'w' ? -1 : 1;
    for (var i = G.moves.length - 1; i >= 0; i--) if ((i % 2 === 0 ? startSide : -startSide) === botSide) return G.moves[i];
    return null;
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

  /* Save a finished game: rating, records, tiers, history. Returns a summary for the end screen, with what the game
     opened: a promotion match, the next tier, the bonus challenger, the championship. */
  function record(g, bot) {
    var S = Store.state, B = TempoBots, all = S.settings.unlockAll;
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
    // what was open before this result
    var topBefore = B.topTier(S.play), ti = bot.tierIdx, bossId = B.TIERS[ti].boss;
    var bossWas = B.access(S.play, bossId, false), hidden = B.BONUS.filter(function (id) { return B.access(S.play, id, false) === 'hidden'; });
    var rec = S.play.bots[bot.id] || (S.play.bots[bot.id] = { w: 0, d: 0, l: 0 });
    if (score === 1) rec.w++; else if (score === 0.5) rec.d++; else rec.l++;
    // against the last of the Legends a draw counts as a win
    var beat = score === 1 || (bot.id === B.CHAMPION && score === 0.5);
    if (beat) rec.beaten = true;
    var news = [], unlocked = null, topAfter = B.topTier(S.play);
    if (topAfter > (S.play.tier || 0)) S.play.tier = topAfter;
    if (beat && bot.id === B.CHAMPION && !S.play.champ) { S.play.champ = true; news.push({ kind: 'champ', text: 'You beat ' + bot.name + '. You’re the Tempo Champion.' }); }
    if (topAfter > topBefore) {
      var nt = B.TIERS[topAfter], first = B.nextFor(S.play, all);
      news.push({ kind: 'tier', text: 'Promoted to ' + UI.tierLabel(topAfter) + '.' });
      unlocked = first;
    } else if (bossWas === 'boss-locked' && B.access(S.play, bossId, false) === 'open') {
      unlocked = B.byId(bossId);
      news.push({ kind: 'boss', text: 'Promotion match open: beat ' + unlocked.name + ' to ' + (ti + 1 < B.TIERS.length ? 'reach ' + UI.tierLabel(ti + 1) : 'become the Tempo Champion') + '.' });
    }
    hidden.forEach(function (id) {
      if (B.access(S.play, id, false) !== 'hidden') { var x = B.byId(id); news.push({ kind: 'bonus', text: 'A bonus challenger has appeared: ' + x.name + '.' }); if (!unlocked) unlocked = x; }
    });
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
    return { score: score, rated: rated, before: before, after: after, reason: g.reason, unlocked: unlocked, news: news };
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
      else { G = null; renderTiers(root); }
    },
    leave: function () {
      if (view) { clearInterval(view.clockT); clearTimeout(view.sayT); clearTimeout(view.endT); clearTimeout(view.bubbleT); document.removeEventListener('keydown', view.keys); if (view.unlisten) view.unlisten(); view.token++; view.deciding = false; view = null; }
      Engines.stopAll();
    },
    busy: function () { return !!view; }
  });

  return { setup: setup, resume: resume, record: record, toggle: toggle, seg: seg, profile: profile, _say: function (t) { if (view && view.say) view.say(t); },
    _reason: function (fen, uci) { var p = new C.Pos(fen), m = p.parseMove(uci); return m ? moveReason(p, m) : null; } };
})();
