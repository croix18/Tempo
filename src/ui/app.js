/* Tempo app shell: data, navigation, sheets, toasts, settings, home. */
var Data = (function () {
  'use strict';
  function text(id) { var el = document.getElementById(id); return el ? el.textContent : ''; }
  var lessons = null, reps = null, openingsP = null, puzzlesP = null;
  return {
    lessons: function () {
      if (!lessons) { try { lessons = JSON.parse(text('d-lessons') || '[]'); } catch (e) { lessons = []; } }
      return lessons;
    },
    reps: function () {
      if (!reps) { try { reps = JSON.parse(text('d-reps') || '{}'); } catch (e) { reps = {}; } reps.repertoires = reps.repertoires || []; reps.traps = reps.traps || []; }
      return reps;
    },
    lesson: function (id) {
      var us = this.lessons();
      for (var i = 0; i < us.length; i++) for (var j = 0; j < us[i].lessons.length; j++) if (us[i].lessons[j].id === id) return { unit: us[i], lesson: us[i].lessons[j], ui: i, li: j };
      return null;
    },
    openings: function () {
      if (!openingsP) openingsP = TempoInflate.unpackText(text('d-openings')).then(function (t) {
        var map = new Map();
        t.split('\n').forEach(function (ln) { var f = ln.split('\t'); if (f.length >= 4) map.set(f[3], { eco: f[0], name: f[1], pgn: f[2] }); });
        return map;
      }).catch(function () { return new Map(); });
      return openingsP;
    },
    puzzles: function () {
      if (!puzzlesP) puzzlesP = TempoInflate.unpackText(text('d-puzzles')).then(function (t) {
        return t.split('\n').map(function (ln, i) {
          var f = ln.split(',');
          return { i: i, id: f[0], fen: f[1], moves: f[2].split(' '), rating: +f[3], themes: (f[4] || '').split(' ').filter(Boolean) };
        });
      });
      return puzzlesP;
    }
  };
})();

/* Opening name for a position history (array of EPDs), deepest match wins. */
function openingFor(map, epds) {
  var hit = null;
  for (var i = 0; i < epds.length && i < 40; i++) { var o = map.get(epds[i]); if (o) hit = o; }
  return hit;
}
function epdOf(pos) { return pos.fen().split(' ').slice(0, 4).join(' '); }

var App = (function () {
  'use strict';
  var h = U.h;
  var views = {}, current = null, currentName = null, mainEl, sideNav, tabNav, layer;
  var NAV = [
    { id: 'home', label: 'Home', icon: 'home' },
    { id: 'play', label: 'Play', icon: 'play' },
    { id: 'puzzles', label: 'Puzzles', icon: 'puzzle' },
    { id: 'learn', label: 'Learn', icon: 'learn' },
    { id: 'openings', label: 'Openings', icon: 'openings' },
    { id: 'train', label: 'Trainers', icon: 'train' },
    { id: 'review', label: 'Review', icon: 'review' },
    { id: 'progress', label: 'Progress', icon: 'progress' },
    { id: 'prefs', label: 'Preferences', icon: 'prefs' }
  ];
  var TABS = ['home', 'play', 'puzzles', 'learn', 'more'];
  var MORE_OF = ['openings', 'train', 'review', 'progress', 'prefs', 'more'];

  function register(name, view) { views[name] = view; }

  function buildShell() {
    var app = document.getElementById('app');
    U.clear(app);
    sideNav = h('nav', { class: 'side', 'aria-label': 'Main' },
      h('div', { class: 'brand' }, h('span', { class: 'brand-mark', 'aria-hidden': 'true' }), 'Tempo'));
    var reps = Data.reps(), hasOpenings = reps.repertoires.length > 0 || reps.traps.length > 0;
    NAV.forEach(function (n) {
      if (n.id === 'openings' && !hasOpenings) return;
      sideNav.appendChild(h('button', { class: 'nav-item', type: 'button', dataset: { go: n.id }, onclick: function () { go(n.id); } }, U.icon(n.icon), n.label));
    });
    sideNav.appendChild(h('div', { class: 'side-foot', id: 'engine-note' }));
    mainEl = h('main', { id: 'main' });
    tabNav = h('nav', { class: 'tabs', 'aria-label': 'Main' });
    TABS.forEach(function (id) {
      var n = NAV.filter(function (x) { return x.id === id; })[0] || { id: 'more', label: 'More', icon: 'more' };
      tabNav.appendChild(h('button', { class: 'tab', type: 'button', dataset: { go: n.id }, onclick: function () { go(n.id); } }, U.icon(n.icon), n.label));
    });
    app.appendChild(sideNav); app.appendChild(mainEl); app.appendChild(tabNav);
    layer = document.getElementById('layer');
  }

  function markNav(name) {
    Array.prototype.forEach.call(sideNav.querySelectorAll('.nav-item'), function (b) { b.classList.toggle('on', b.dataset.go === name); });
    var tabName = TABS.indexOf(name) >= 0 ? name : (MORE_OF.indexOf(name) >= 0 ? 'more' : name);
    Array.prototype.forEach.call(tabNav.querySelectorAll('.tab'), function (b) { b.classList.toggle('on', b.dataset.go === tabName); });
  }

  function go(name, params, opts) {
    if (!views[name]) name = 'home';
    if (current && current.leave) { try { current.leave(); } catch (e) { console.error(e); } }
    closeSheet();
    currentName = name; current = views[name];
    markNav(name);
    U.clear(mainEl);
    document.body.classList.remove('focus');
    var wrap = h('div', { class: 'view v-' + name });
    mainEl.appendChild(wrap);
    try { current.render(wrap, params || {}); } catch (e) { console.error(e); wrap.appendChild(h('div', { class: 'empty' }, 'Something went wrong showing this page.')); }
    if (!(opts && opts.keepScroll)) window.scrollTo(0, 0);
    if (!(opts && opts.noHash) && location.hash.slice(1) !== name) {
      try { history.replaceState(null, '', '#' + name); } catch (e) { location.hash = name; }
    }
  }
  function refresh() { if (currentName && !(current && current.busy && current.busy())) go(currentName, {}, { keepScroll: true }); }

  /* ---------- sheets and toasts ---------- */
  var openSheet = null;
  function sheet(build, opts) {
    closeSheet();
    opts = opts || {};
    var scrim = h('div', { class: 'scrim', onclick: function () { if (!opts.modal) close(); } });
    var box = h('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true' });
    if (!opts.modal) box.appendChild(h('button', { class: 'btn quiet small icon-only close-x', type: 'button', 'aria-label': 'Close', onclick: function () { close(); } }, U.icon('close')));
    var api = { close: close, box: box };
    build(box, api);
    layer.appendChild(scrim); layer.appendChild(box);
    var esc = function (e) { if (e.key === 'Escape' && !opts.modal) close(); };
    document.addEventListener('keydown', esc);
    openSheet = api;
    function close(val) {
      if (!scrim.parentNode) return;
      scrim.remove(); box.remove(); document.removeEventListener('keydown', esc);
      if (openSheet === api) openSheet = null;
      if (opts.onClose) opts.onClose(val);
    }
    return api;
  }
  function closeSheet() { if (openSheet) openSheet.close(); }
  function confirm(title, text, yes, danger) {
    return new Promise(function (resolve) {
      var answered = false;
      sheet(function (box, api) {
        box.appendChild(h('h2', null, title));
        if (text) box.appendChild(h('p', { class: 'muted' }, text));
        box.appendChild(h('div', { class: 'row end', style: { marginTop: '18px' } },
          h('button', { class: 'btn', type: 'button', onclick: function () { answered = true; api.close(); resolve(false); } }, 'Cancel'),
          h('button', { class: 'btn ' + (danger ? 'primary danger-fill' : 'primary'), type: 'button', onclick: function () { answered = true; api.close(); resolve(true); } }, yes || 'OK')));
      }, { onClose: function () { if (!answered) resolve(false); } });
    });
  }
  var toastT = null;
  function toast(text) {
    var old = layer.querySelector('.toast'); if (old) old.remove();
    var t = h('div', { class: 'toast', role: 'status' }, text);
    layer.appendChild(t);
    clearTimeout(toastT); toastT = setTimeout(function () { t.remove(); }, 2600);
  }

  /* ---------- settings ---------- */
  function applySettings() {
    var s = Store.state.settings, root = document.documentElement;
    if (s.theme === 'light' || s.theme === 'dark') root.setAttribute('data-theme', s.theme); else root.removeAttribute('data-theme');
    document.body.classList.remove('bt-classic', 'bt-walnut', 'bt-slate');
    if (s.board && s.board !== 'tempo') document.body.classList.add('bt-' + s.board);
    Board.animate = s.animate !== false; Board.dots = s.dots !== false; Board.autoQueen = !!s.autoQueen;
    U.sound.set(s.sound !== false);
  }

  function engineNote() {
    var el = document.getElementById('engine-note');
    if (!el) return;
    el.textContent = Engines.status === 'ready' ? 'Stockfish ready' : Engines.status === 'failed' ? 'Built-in engine' : 'Loading engine…';
  }

  function focus(on) { document.body.classList.toggle('focus', !!on); }

  function boot() {
    Store.init();
    buildShell();
    applySettings();
    var start = (location.hash || '').slice(1);
    go(views[start] ? start : 'home', {}, { noHash: !views[start] });
    Engines.init().then(engineNote, engineNote);
    engineNote();
    Store.on(function (what) {
      if (what === 'remote' || what === 'import' || what === 'reset') { applySettings(); refresh(); }
    });
    window.addEventListener('hashchange', function () {
      var n = location.hash.slice(1);
      if (views[n] && n !== currentName) go(n, {}, { noHash: true });
    });
    window.addEventListener('pagehide', function () { Store.saveNow(); });
    document.addEventListener('visibilitychange', function () { if (document.hidden) Store.saveNow(); });
  }

  return { register: register, go: go, refresh: refresh, sheet: sheet, closeSheet: closeSheet, confirm: confirm, toast: toast,
    applySettings: applySettings, boot: boot, focus: focus, get name() { return currentName; }, NAV: NAV };
})();

/* ---------- shared bits used by several views ---------- */
var UI = (function () {
  'use strict';
  var h = U.h, C = TempoCore;
  function avatar(bot, size) {
    var initials = bot.name.replace(/^The /, '').charAt(0);
    return h('span', { class: 'avatar ' + (size || '') + ' tone-' + (bot.tone || 'cream'), 'aria-hidden': 'true' }, initials);
  }
  function stars(n, of) {
    var el = h('span', { class: 'stars', 'aria-label': n + ' of ' + (of || 3) + ' stars' });
    for (var i = 0; i < (of || 3); i++) el.appendChild(U.icon('star', i < n ? '' : 'off'));
    return el;
  }
  function turnPill(side, text) {
    return h('span', { class: 'turn-pill' }, h('i', { class: side === 1 ? 'w' : 'b' }), text || (side === 1 ? 'White to move' : 'Black to move'));
  }
  function meter(fraction, cls) { return h('div', { class: 'meter ' + (cls || '') }, h('i', { style: { width: Math.round(Math.max(0, Math.min(1, fraction)) * 100) + '%' } })); }
  /* captured-piece icon; its image comes from the stylesheet so it can follow light and dark mode */
  function pieceIcon(code) { return h('span', { class: 'cp ' + code }); }

  /* material captured by each side and the balance */
  function material(pos) {
    var start = { p: 8, n: 2, b: 2, r: 2, q: 1 }, have = { w: { p: 0, n: 0, b: 0, r: 0, q: 0 }, b: { p: 0, n: 0, b: 0, r: 0, q: 0 } };
    var V = { p: 1, n: 3, b: 3, r: 5, q: 9 }, score = 0;
    for (var s = 0; s < 120; s++) {
      if (s & 8) { s += 7; continue; }
      var p = pos.b[s]; if (!p || Math.abs(p) === 6) continue;
      var t = ' pnbrq'.charAt(Math.abs(p)), c = p > 0 ? 'w' : 'b';
      have[c][t]++; score += (p > 0 ? 1 : -1) * V[t];
    }
    function lost(c) { var out = []; 'qrbnp'.split('').forEach(function (t) { var n = Math.max(0, start[t] - have[c][t]); for (var i = 0; i < n; i++) out.push(c + t); }); return out; }
    return { byWhite: lost('b'), byBlack: lost('w'), balance: score };
  }
  var NAMES = { q: 'queen', r: 'rook', b: 'bishop', n: 'knight', p: 'pawn' };
  function capturedRow(list, plus) {
    var el = h('div', { class: 'captured' }), last = null, words = [];
    list.forEach(function (code) {
      var t = code.charAt(1);
      var icon = pieceIcon(code);
      if (last && t !== last) icon.classList.add('gap');
      el.appendChild(icon); last = t; words.push(NAMES[t]);
    });
    if (plus > 0) el.appendChild(h('span', { class: 'plus' }, '+' + plus));
    el.setAttribute('aria-label', list.length ? 'Captured: ' + words.join(', ') : 'Nothing captured yet');
    el.setAttribute('role', 'img');
    return el;
  }

  /* simple line chart of [ts, value] points */
  function lineChart(points, opts) {
    opts = opts || {};
    var W = 640, H = opts.height || 180, P = { l: 40, r: 12, t: 12, b: 24 };
    var NS = 'http://www.w3.org/2000/svg', svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H); svg.setAttribute('class', 'chart'); svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', opts.label || 'Chart');
    if (points.length < 2) {
      var t0 = document.createElementNS(NS, 'text');
      t0.setAttribute('x', W / 2); t0.setAttribute('y', H / 2); t0.setAttribute('text-anchor', 'middle'); t0.setAttribute('class', 'axis');
      t0.textContent = opts.empty || 'Not enough data yet'; svg.appendChild(t0); return svg;
    }
    var vals = points.map(function (p) { return p[1]; });
    var lo = Math.min.apply(null, vals), hi = Math.max.apply(null, vals);
    var pad = Math.max(20, (hi - lo) * 0.15); lo = Math.floor((lo - pad) / 50) * 50; hi = Math.ceil((hi + pad) / 50) * 50;
    var x = function (i) { return P.l + (W - P.l - P.r) * i / (points.length - 1); };
    var y = function (v) { return P.t + (H - P.t - P.b) * (1 - (v - lo) / (hi - lo)); };
    var steps = 4;
    for (var g = 0; g <= steps; g++) {
      var v = lo + (hi - lo) * g / steps, yy = y(v);
      var ln = document.createElementNS(NS, 'line');
      ln.setAttribute('x1', P.l); ln.setAttribute('x2', W - P.r); ln.setAttribute('y1', yy); ln.setAttribute('y2', yy); ln.setAttribute('class', 'gridline');
      svg.appendChild(ln);
      var tx = document.createElementNS(NS, 'text');
      tx.setAttribute('x', P.l - 6); tx.setAttribute('y', yy + 4); tx.setAttribute('text-anchor', 'end'); tx.setAttribute('class', 'axis');
      tx.textContent = Math.round(v); svg.appendChild(tx);
    }
    var d = '', area = '';
    points.forEach(function (p, i) { d += (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(p[1]).toFixed(1); });
    area = d + 'L' + x(points.length - 1) + ' ' + (H - P.b) + 'L' + P.l + ' ' + (H - P.b) + 'Z';
    var a = document.createElementNS(NS, 'path'); a.setAttribute('d', area); a.setAttribute('class', 'areaplot'); svg.appendChild(a);
    var l = document.createElementNS(NS, 'path'); l.setAttribute('d', d); l.setAttribute('class', 'lineplot'); svg.appendChild(l);
    var last = points[points.length - 1];
    var dot = document.createElementNS(NS, 'circle');
    dot.setAttribute('cx', x(points.length - 1)); dot.setAttribute('cy', y(last[1])); dot.setAttribute('r', 4.5); dot.setAttribute('fill', 'var(--gold-fill)');
    svg.appendChild(dot);
    return svg;
  }

  /* Small non-interactive board for cards. */
  function miniBoard(fen, orient, last) {
    var b = new Board({ orient: orient || 'w', coords: false });
    var p = new C.Pos(fen);
    var anim = Board.animate; Board.animate = false;
    b.setPosition(p, { last: last || null });
    Board.animate = anim;
    return h('div', { class: 'mini-board' }, b.el);
  }

  /* The opponent ladder, strongest at the top, with your rating marked where it falls.
     o: { lo, hi: bot indexes to show; full: show each bio; playing: id of the bot in an unfinished game } */
  function ladder(o) {
    var S = Store.state, BOTS = TempoBots.BOTS;
    var nextIdx = Math.min(S.play.unlocked || 0, BOTS.length - 1), unlockedTo = S.settings.unlockAll ? BOTS.length - 1 : nextIdx;
    var list = h('ol', { class: 'rungs' + (o.full ? ' full' : '') }), placed = !S.play.hist.length;
    function you() {
      placed = true;
      list.appendChild(h('li', { class: 'you-mark', 'aria-label': 'Your rating, ' + S.play.rating }, h('span', null, 'You'), h('span', { class: 'num' }, String(S.play.rating))));
    }
    for (var i = o.hi; i >= o.lo; i--) (function (bot, i) {
      if (!placed && S.play.rating >= bot.rating) you();
      var rec = S.play.bots[bot.id] || {}, locked = i > unlockedTo, isNext = i === nextIdx && !rec.beaten && !o.playing;
      var status = rec.beaten ? U.icon('check', 'won') : locked ? U.icon('lock') : h('span');
      var li = h('li', null, h('button', {
        class: 'rung' + (locked ? ' locked' : '') + (isNext ? ' next' : '') + (o.playing === bot.id ? ' playing' : ''), type: 'button',
        'aria-label': bot.name + ', ' + (bot.id === 'stockfish' ? 'full strength' : 'about ' + bot.rating) + (rec.beaten ? ', beaten' : locked ? ', locked' : isNext ? ', your next opponent' : ''),
        onclick: function () { if (locked) App.toast('Beat ' + BOTS[i - 1].name + ' to unlock ' + bot.name + '.'); else Play.setup(bot); }
      }, h('span', { class: 'n num' }, String(i + 1)),
        o.full ? h('span', { class: 'nm' }, h('span', { class: 'who' }, bot.name), h('span', { class: 'bio' }, bot.bio)) : h('span', { class: 'nm' }, bot.name),
        h('span', { class: 'r num' }, bot.id === 'stockfish' ? 'Full strength' : String(bot.rating)), status));
      if (isNext) list._next = li;
      list.appendChild(li);
    })(BOTS[i], i);
    if (!placed) you();
    return list;
  }

  /* one row of a grouped list: icon, a title, an optional line under it, and a chevron */
  function menuRow(icon, title, sub, onclick, extra) {
    return h('button', { class: 'menu-row' + (extra ? ' ' + extra : ''), type: 'button', onclick: onclick },
      U.icon(icon), h('span', { class: 'txt' }, h('span', { class: 't' }, title), sub ? h('span', { class: 's' }, sub) : null), U.icon('next', 'chev'));
  }

  return { avatar: avatar, stars: stars, turnPill: turnPill, meter: meter, material: material, capturedRow: capturedRow, lineChart: lineChart, miniBoard: miniBoard, pieceIcon: pieceIcon, ladder: ladder, menuRow: menuRow };
})();

/* ---------- Home ----------
   The opponent you're climbing toward, a real board (today's puzzle, or your unfinished game),
   the few things that are due, and your place on the ladder. */
App.register('home', {
  render: function (root) {
    var h = U.h, S = Store.state, C = TempoCore, BOTS = TempoBots.BOTS;
    var nextIdx = Math.min(S.play.unlocked || 0, BOTS.length - 1), next = BOTS[nextIdx];
    var cur = S.current, curBot = cur && !cur.result && cur.moves && cur.moves.length ? TempoBots.byId(cur.bot) : null;
    var solved = S.puzzles.daily === U.dayKey();

    root.appendChild(h('h1', { class: 'sr-only' }, 'Home'));
    var hero = h('section', { class: 'home-hero' }), fig = h('figure', { class: 'home-fig' }),
      todo = h('nav', { class: 'home-todo menu-list', 'aria-label': 'Due now' }), ladder = h('section', { class: 'home-ladder', 'aria-label': 'Opponents' });
    root.appendChild(h('div', { class: 'home' },
      h('div', { class: 'home-col' }, hero, ladder),
      h('div', { class: 'home-col' }, fig, todo)));

    /* hero: your unfinished game, or the next opponent on the ladder */
    if (curBot) {
      var moveNo = Math.floor(cur.moves.length / 2) + 1;
      hero.appendChild(h('h2', null, curBot.name));
      hero.appendChild(h('p', null, 'Your game is still going. You’re on move ' + moveNo + '.'));
      hero.appendChild(h('button', { class: 'btn primary', type: 'button', onclick: function () { Play.resume(); } }, 'Resume game'));
    } else {
      hero.appendChild(h('h2', null, next.name));
      hero.appendChild(h('p', null, (next.id === 'stockfish' ? 'Full strength. ' : 'About ' + next.rating + '. ') + next.bio));
      hero.appendChild(h('button', { class: 'btn primary', type: 'button', onclick: function () { Play.setup(next); } }, 'Play ' + next.name));
    }

    /* the board: the unfinished game if there is one, otherwise today's puzzle */
    function showBoard(fen, orient, last, label, caption, open) {
      U.clear(fig);
      fig.appendChild(h('button', { class: 'home-board', type: 'button', 'aria-label': label, onclick: open }, UI.miniBoard(fen, orient, last)));
      fig.appendChild(h('figcaption', null, caption));
    }
    fig.appendChild(h('div', { class: 'home-board placeholder', 'aria-hidden': 'true' }));
    if (curBot) {
      var gp = new C.Pos(cur.startFen || C.START_FEN), lastMove = null;
      cur.moves.forEach(function (u) { lastMove = gp.parseMove(u); gp.make(lastMove); });
      var n = cur.moves.length, lastSan = cur.sans && cur.sans[n - 1];
      var after = lastSan ? 'After ' + Math.ceil(n / 2) + (n % 2 ? '.' : '...') + lastSan + '. ' : '';
      var yours = (gp.side === 1) === (cur.color === 'w');
      showBoard(gp.fen(), cur.color || 'w', lastMove, 'Resume your game against ' + curBot.name,
        after + (yours ? 'Your move.' : curBot.name + ' to move.'), function () { Play.resume(); });
    } else {
      Puzzles.dailyPosition().then(function (d) {
        if (!d) { U.clear(fig); return; }
        showBoard(d.fen, d.side === 1 ? 'w' : 'b', d.last, solved ? 'More puzzles' : 'Solve today’s puzzle',
          solved ? 'You solved today’s puzzle. A new one comes tomorrow.' : 'Today’s puzzle, rated ' + d.rating + '. ' + (d.side === 1 ? 'White' : 'Black') + ' to move.',
          function () { Puzzles.daily(); });
      });
    }

    /* due now: one sentence per item, only what is actually waiting */
    function item(icon, text, open) { todo.appendChild(UI.menuRow(icon, text, null, open)); }
    var nl = Learn.nextLesson();
    if (nl) {
      var num = 0, units = Data.lessons(), found = false;
      for (var ui = 0; ui < units.length && !found; ui++) for (var li = 0; li < units[ui].lessons.length; li++) { num++; if (units[ui].lessons[li].id === nl.lesson.id) { found = true; break; } }
      item('book', 'Lesson ' + num + ': ' + nl.lesson.title, function () { Learn.open(nl.lesson.id); });
    }
    if (curBot && !solved) item('puzzle', 'Today’s puzzle', function () { Puzzles.daily(); });
    var now = Date.now(), dueReps = {}, dueLines = 0;
    Object.keys(S.openings.lines).forEach(function (k) {
      var r = S.openings.lines[k];
      if (k.indexOf('trap/') === 0 || !r || !r.learned || (r.due || 0) > now) return;
      dueLines++; dueReps[k.split('/')[0]] = true;
    });
    if (dueLines) {
      var reps = Object.keys(dueReps);
      item('openings', U.plural(dueLines, 'opening line') + ' to drill', function () { App.go('openings', reps.length === 1 ? { rep: reps[0] } : {}); });
    }
    var mistakes = Mistakes.due().length;
    if (mistakes) item('target', 'Retry ' + U.plural(mistakes, 'mistake') + ' from your games', function () { App.go('train', { mode: 'mistakes' }); });
    var last = S.games.list[0], lastBot = last && TempoBots.byId(last.bot);
    if (last && !last.reviewed && lastBot) {
      item('review', 'Review your ' + resultPhrase(last, lastBot.name).replace(/^./, function (c) { return c.toLowerCase(); }), function () { Review.openGame(last.id); });
    }
    if (!todo.childNodes.length) todo.remove();

    /* the ladder around you: two rungs either side of the next opponent, strongest at the top */
    var lo = Math.max(0, nextIdx - 2), hi = Math.min(BOTS.length - 1, nextIdx + 2);
    while (hi - lo < 4 && (lo > 0 || hi < BOTS.length - 1)) { if (hi < BOTS.length - 1) hi++; else lo--; }
    var list = UI.ladder({ lo: lo, hi: hi, playing: curBot && curBot.id });
    ladder.appendChild(list);
    ladder.appendChild(h('button', { class: 'all-link', type: 'button', onclick: function () { App.go('play'); } }, 'All ' + BOTS.length + ' opponents'));
  }
});
function resultWord(g) { return g.result === '1/2-1/2' ? 'Draw' : ((g.result === '1-0') === (g.color === 'w') ? 'Win' : 'Loss'); }
/* "Win over Theo", "Draw with Theo", "Loss to Theo" */
function resultPhrase(g, name) { var w = resultWord(g); return (w === 'Win' ? 'Win over ' : w === 'Draw' ? 'Draw with ' : 'Loss to ') + name; }
/* "3 wins, 1 draw, 2 losses", leaving out zeros */
function recordWords(r) {
  var bits = [];
  if (r.w) bits.push(U.plural(r.w, 'win')); if (r.d) bits.push(U.plural(r.d, 'draw')); if (r.l) bits.push(U.plural(r.l, 'loss', 'losses'));
  return bits.length ? bits.join(', ') : 'No games yet';
}

/* ---------- More (phone) ---------- */
App.register('more', {
  render: function (root) {
    var h = U.h;
    root.appendChild(h('div', { class: 'page-head' }, h('h1', null, 'More')));
    var list = h('nav', { class: 'menu-list', 'aria-label': 'More' });
    var reps = Data.reps(), hasOpenings = reps.repertoires.length > 0 || reps.traps.length > 0;
    var SUB = { openings: 'Learn a repertoire, drill it, and the traps to know.', train: 'Your mistakes, coordinates, board vision and the analysis board.',
      review: 'Go over your games with the engine, or paste one from elsewhere.', progress: 'Your ratings, practice streak and what you\u2019ve learned.', prefs: 'Theme, board, sound and backups.' };
    App.NAV.filter(function (n) { return ['openings', 'train', 'review', 'progress', 'prefs'].indexOf(n.id) >= 0 && (n.id !== 'openings' || hasOpenings); }).forEach(function (n) {
      list.appendChild(UI.menuRow(n.icon, n.label, SUB[n.id], function () { App.go(n.id); }));
    });
    root.appendChild(list);
  }
});
