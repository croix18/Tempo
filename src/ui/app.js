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
  var iconCache = {};
  function pieceIcon(code) {
    var u = iconCache[code] || (iconCache[code] = TempoPieces.uri(code.charAt(0), code.charAt(1), true));
    return h('span', { class: 'cp', style: { backgroundImage: 'url("' + u + '")' } });
  }

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

  return { avatar: avatar, stars: stars, turnPill: turnPill, meter: meter, material: material, capturedRow: capturedRow, lineChart: lineChart, miniBoard: miniBoard, pieceIcon: pieceIcon };
})();

/* ---------- Home ---------- */
App.register('home', {
  render: function (root) {
    var h = U.h, S = Store.state, bots = TempoBots.BOTS;
    var next = bots[Math.min(S.play.unlocked || 0, bots.length - 1)];
    root.appendChild(h('div', { class: 'page-head' }, h('div', null, h('h1', null, greeting()), h('div', { class: 'sub' }, todayLine()))));
    var col = h('div', { class: 'stack' });
    root.appendChild(col);
    var cur = S.current, curBot = cur && !cur.result && cur.moves && cur.moves.length ? TempoBots.byId(cur.bot) : null;
    if (curBot) col.appendChild(h('div', { class: 'card row between' },
      h('div', { class: 'row' }, UI.avatar(curBot, 'sm'), h('div', null, h('b', null, 'Game in progress'), h('div', { class: 'muted small' }, 'vs ' + curBot.name + ' \u00b7 move ' + (Math.floor(cur.moves.length / 2) + 1)))),
      h('button', { class: 'btn primary small', type: 'button', onclick: function () { Play.resume(); } }, 'Resume')));
    col.appendChild(h('div', { class: 'card raised pad-lg hero-card' },
      UI.avatar(next, 'lg'),
      h('div', null, h('div', { class: 'label' }, 'Next opponent'), h('h2', null, next.name), h('div', { class: 'muted small' }, 'About ' + next.rating + ' · ' + next.bio)),
      h('button', { class: 'btn primary', type: 'button', onclick: function () { Play.setup(next); } }, U.icon('play'), 'Play')));
    var grid = h('div', { class: 'grid two' });
    col.appendChild(grid);
    // learning
    var nextLesson = Learn.nextLesson();
    grid.appendChild(h('div', { class: 'card' },
      h('div', { class: 'label' }, nextLesson ? 'Continue learning' : 'Lessons'),
      nextLesson ? h('h3', { style: { margin: '6px 0 4px' } }, nextLesson.lesson.title) : h('h3', { style: { margin: '6px 0 4px' } }, 'All lessons complete'),
      h('p', { class: 'muted small' }, nextLesson ? nextLesson.unit.title + ' · ' + nextLesson.lesson.summary : 'Replay any lesson from the Learn tab.'),
      h('div', { class: 'row', style: { marginTop: '12px' } }, h('button', { class: 'btn', type: 'button', onclick: function () { if (nextLesson) Learn.open(nextLesson.lesson.id); else App.go('learn'); } }, U.icon('learn'), nextLesson ? 'Start lesson' : 'Open Learn'))));
    var dailyLine = h('p', { class: 'muted small' }, S.puzzles.daily === U.dayKey() ? 'A new one arrives tomorrow.' : '\u00a0');
    if (S.puzzles.daily !== U.dayKey()) Puzzles.dailyInfo().then(function (d) { if (d) dailyLine.textContent = 'Rated ' + d.rating + '. Find the best move.'; });
    grid.appendChild(h('div', { class: 'card' },
      h('div', { class: 'label' }, 'Daily puzzle'),
      h('h3', { style: { margin: '6px 0 4px' } }, S.puzzles.daily === U.dayKey() ? 'Solved today' : 'Today\u2019s puzzle'),
      dailyLine,
      h('div', { class: 'row', style: { marginTop: '12px' } }, h('button', { class: 'btn', type: 'button', onclick: function () { Puzzles.daily(); } }, U.icon('puzzle'), S.puzzles.daily === U.dayKey() ? 'More puzzles' : 'Solve'))));
    col.appendChild(h('div', { class: 'stats-row' },
      statCard('Game rating', S.play.rating, S.play.hist.length ? 'from ' + U.plural(S.play.hist.length, 'game') : 'play a bot to start'),
      statCard('Puzzle rating', S.puzzles.rating, S.puzzles.count ? U.plural(S.puzzles.count, 'puzzle') : 'not rated yet'),
      statCard('Streak', Store.streak(), Store.streak() === 1 ? 'day' : 'days')));
    var last = S.games.list[0];
    if (last) {
      var bot = TempoBots.byId(last.bot);
      col.appendChild(h('button', { class: 'card list-row', type: 'button', style: { borderBottom: '1px solid var(--line)' }, onclick: function () { Review.openGame(last.id); } },
        bot ? UI.avatar(bot, 'sm') : null,
        h('div', { class: 'grow' }, h('div', { style: { fontWeight: 700 } }, 'Last game: ' + resultWord(last) + ' vs ' + (bot ? bot.name : 'opponent')),
          h('div', { class: 'muted small' }, last.reviewed ? 'Accuracy ' + Math.round(last.acc) + '%' : 'Review it to see your mistakes')),
        U.icon('next')));
    }
    function statCard(label, value, sub) {
      return h('div', { class: 'card stat' }, h('span', { class: 'label' }, label), h('b', { class: 'num' }, String(value)), h('span', { class: 'faint small' }, sub));
    }
    function greeting() {
      var hr = new Date().getHours();
      return hr < 12 ? 'Good morning' : hr < 18 ? 'Good afternoon' : 'Good evening';
    }
    function todayLine() {
      var d = S.days.map[U.dayKey()];
      if (!d) return '';
      var bits = [];
      if (d.g) bits.push(U.plural(d.g, 'game'));
      if (d.p) bits.push(U.plural(d.p, 'puzzle'));
      if (d.l) bits.push(U.plural(d.l, 'lesson'));
      return 'Today: ' + bits.join(', ') + '.';
    }
  }
});
function resultWord(g) { return g.result === '1/2-1/2' ? 'Draw' : ((g.result === '1-0') === (g.color === 'w') ? 'Win' : 'Loss'); }

/* ---------- More (phone) ---------- */
App.register('more', {
  render: function (root) {
    var h = U.h;
    root.appendChild(h('div', { class: 'page-head' }, h('h1', null, 'More')));
    var list = h('div', { class: 'card list' });
    var reps = Data.reps(), hasOpenings = reps.repertoires.length > 0 || reps.traps.length > 0;
    App.NAV.filter(function (n) { return ['openings', 'train', 'review', 'progress', 'prefs'].indexOf(n.id) >= 0 && (n.id !== 'openings' || hasOpenings); }).forEach(function (n) {
      list.appendChild(h('button', { class: 'list-row', type: 'button', onclick: function () { App.go(n.id); } }, U.icon(n.icon), h('span', { class: 'grow', style: { fontWeight: 600 } }, n.label), U.icon('next')));
    });
    root.appendChild(list);
  }
});
