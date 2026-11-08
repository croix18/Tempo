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
    { id: 'clock', label: 'Chess clock', icon: 'clock' },
    { id: 'puzzles', label: 'Puzzles', icon: 'puzzle' },
    { id: 'learn', label: 'Learn', icon: 'learn' },
    { id: 'openings', label: 'Openings', icon: 'openings' },
    { id: 'train', label: 'Trainers', icon: 'train' },
    { id: 'review', label: 'Review', icon: 'review' },
    { id: 'progress', label: 'Progress', icon: 'progress' },
    { id: 'prefs', label: 'Preferences', icon: 'prefs' }
  ];
  var TABS = ['home', 'play', 'puzzles', 'learn', 'more'];
  var MORE_OF = ['review', 'progress', 'prefs', 'more'];
  var LEARN_OF = ['openings', 'train'];
  var PLAY_OF = ['clock'];

  function register(name, view) { views[name] = view; }
  function isView(n) { return typeof n === 'string' && Object.prototype.hasOwnProperty.call(views, n); }

  function buildShell() {
    var app = document.getElementById('app');
    U.clear(app);
    sideNav = h('nav', { class: 'side', 'aria-label': 'Main' },
      h('div', { class: 'brand' }, h('span', { class: 'brand-mark', 'aria-hidden': 'true' }), 'Tempo'));
    var reps = Data.reps(), hasOpenings = reps.repertoires.length > 0 || reps.traps.length > 0;
    NAV.forEach(function (n) {
      if (n.id === 'openings' && !hasOpenings) return;
      sideNav.appendChild(h('button', { class: 'nav-item', type: 'button', dataset: { go: n.id }, onclick: function () { navigate(n.id); } }, U.icon(n.icon), n.label));
    });
    // the foot: how the reviews of the games you added are going (while they run), and which engine is working
    sideNav.appendChild(h('div', { class: 'side-foot' },
      h('button', { class: 'bg-note', id: 'bg-note', type: 'button', hidden: true, onclick: function () { Review.openBatch(); } }),
      h('div', { id: 'engine-note' })));
    mainEl = h('main', { id: 'main' });
    tabNav = h('nav', { class: 'tabs', 'aria-label': 'Main' });
    TABS.forEach(function (id) {
      var n = NAV.filter(function (x) { return x.id === id; })[0] || { id: 'more', label: 'More', icon: 'more' };
      tabNav.appendChild(h('button', { class: 'tab', type: 'button', dataset: { go: n.id }, onclick: function () { navigate(n.id); } }, U.icon(n.icon), n.label));
    });
    app.appendChild(sideNav); app.appendChild(mainEl); app.appendChild(tabNav);
    layer = document.getElementById('layer');
  }

  function markNav(name) {
    Array.prototype.forEach.call(sideNav.querySelectorAll('.nav-item'), function (b) { b.classList.toggle('on', b.dataset.go === name); });
    var tabName = TABS.indexOf(name) >= 0 ? name : LEARN_OF.indexOf(name) >= 0 ? 'learn' : PLAY_OF.indexOf(name) >= 0 ? 'play' : MORE_OF.indexOf(name) >= 0 ? 'more' : name;
    Array.prototype.forEach.call(tabNav.querySelectorAll('.tab'), function (b) { b.classList.toggle('on', b.dataset.go === tabName); });
  }

  /* opts: noHash (don't touch history), replace (replace the current entry), keepScroll */
  /* A screen with something to lose (a Rush in progress) can ask before you leave it: its view's guard()
     returns { title, text, ok } or null. The sidebar, the tab bar and the browser's Back all respect it. */
  function guarded(then) {
    var ask = null;
    try { ask = current && current.guard ? current.guard() : null; } catch (e) { ask = null; }
    if (!ask) { then(); return; }
    confirm(ask.title, ask.text, ask.ok, !!ask.danger).then(function (yes) { if (yes) then(); });
  }
  function navigate(name) { guarded(function () { go(name); }); }
  var currentEntry = null, skipGuard = false;
  function go(name, params, opts) {
    if (!isView(name)) name = 'home';
    currentEntry = { v: name, p: params || {} };
    if (current && current.leave) { try { current.leave(); } catch (e) { console.error(e); } }
    closeSheet();
    currentName = name; current = views[name];
    markNav(name);
    U.clear(mainEl);
    document.body.classList.remove('focus');
    var wrap = h('div', { class: 'view v-' + name });
    mainEl.appendChild(wrap);
    try {
      current.render(wrap, params || {});
      if (LEARN_OF.concat(['learn']).indexOf(name) >= 0 && !hasParams(params)) wrap.insertBefore(learnTabs(name), wrap.firstChild);
      skipLink(!!wrap.querySelector('.board'));
    } catch (e) { console.error(e); wrap.appendChild(h('div', { class: 'empty' }, 'Something went wrong showing this page.')); }
    if (!(opts && opts.keepScroll)) window.scrollTo(0, 0);
    // every screen change is a history entry, so the browser's Back button moves through Tempo
    if (!(opts && opts.noHash)) {
      var entry = { v: name, p: params || {} };
      try { if (opts && opts.replace) history.replaceState(entry, '', '#' + name); else history.pushState(entry, '', '#' + name); }
      catch (e) { try { history.replaceState({ v: name, p: {} }, '', '#' + name); } catch (e2) { /* history unavailable */ } }
    }
  }
  function hasParams(p) { return !!p && Object.keys(p).length > 0; }
  /* a keyboard user's way straight to the board: the Tab key's first stop on a screen with one, shown only while focused */
  var skipEl = null;
  function skipLink(on) {
    if (skipEl) { skipEl.remove(); skipEl = null; }
    if (!on) return;
    skipEl = h('a', { class: 'skip-board', href: '#board', onclick: function (e) { e.preventDefault(); var b = mainEl.querySelector('.board'); if (b) b.focus(); } }, 'Go to the board');
    document.body.insertBefore(skipEl, document.body.firstChild);
  }
  /* on phones, Lessons, Openings and Trainers sit under one tab: let each reach the others */
  function learnTabs(active) {
    var reps = Data.reps(), items = [['learn', 'Lessons'], ['openings', 'Openings'], ['train', 'Trainers']];
    if (!reps.repertoires.length && !reps.traps.length) items.splice(1, 1);
    var nav = h('nav', { class: 'seg learn-tabs', 'aria-label': 'Learn sections' });
    items.forEach(function (it) {
      nav.appendChild(h('button', { type: 'button', class: it[0] === active ? 'on' : '', 'aria-current': it[0] === active ? 'page' : null,
        onclick: function () { if (it[0] !== active) go(it[0], {}, { replace: true }); } }, it[1]));
    });
    return nav;
  }
  function refresh() { if (currentName && !(current && current.busy && current.busy())) go(currentName, {}, { keepScroll: true, replace: true }); }

  /* ---------- sheets and toasts ---------- */
  var openSheet = null;
  function sheet(build, opts) {
    closeSheet();
    opts = opts || {};
    // a tap on the shade closes the sheet, but not the phone's follow-up click from the tap that opened it
    var openedAt = performance.now();
    var scrim = h('div', { class: 'scrim', onclick: function () { if (!opts.modal && performance.now() - openedAt > 450) close(); } });
    var box = h('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true' });
    if (!opts.modal) box.appendChild(h('button', { class: 'btn quiet small icon-only close-x', type: 'button', 'aria-label': 'Close', onclick: function () { close(); } }, U.icon('close')));
    var api = { close: close, box: box }, opener = document.activeElement;
    build(box, api);
    layer.appendChild(scrim); layer.appendChild(box);
    var esc = function (e) { if (e.key === 'Escape' && !opts.modal) close(); };
    document.addEventListener('keydown', esc);
    function focusables() {
      return Array.prototype.filter.call(box.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'),
        function (el) { return !el.disabled && el.getClientRects().length > 0; });
    }
    box.addEventListener('keydown', function (e) {
      if (e.key !== 'Tab') return;
      var f = focusables(); if (!f.length) return;
      if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
    });
    setTimeout(function () {
      if (!box.parentNode) return;
      var f = focusables(), first = f.filter(function (el) { return !el.classList.contains('close-x'); })[0] || f[0];
      if (first) try { first.focus({ preventScroll: true }); } catch (e) { /* ignore */ }
    }, 0);
    openSheet = api;
    var closed = false;
    function close(val) {
      if (closed || !scrim.parentNode) return;
      closed = true;
      document.removeEventListener('keydown', esc);
      var calm = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (calm) { scrim.remove(); box.remove(); }
      else {
        scrim.className = 'scrim-out'; box.className = 'sheet-out';
        box.setAttribute('aria-hidden', 'true'); box.inert = true;
        setTimeout(function () { scrim.remove(); box.remove(); }, 180);
      }
      if (opener && opener.focus && document.contains(opener)) try { opener.focus({ preventScroll: true }); } catch (e) { /* ignore */ }
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
    clearTimeout(toastT); toastT = setTimeout(function () { t.classList.add('out'); setTimeout(function () { t.remove(); }, 200); }, 2600);
  }

  /* ---------- settings ---------- */
  function applySettings() {
    var s = Store.state.settings, root = document.documentElement;
    if (s.theme === 'light' || s.theme === 'dark') root.setAttribute('data-theme', s.theme); else root.removeAttribute('data-theme');
    document.body.classList.remove('bt-classic', 'bt-walnut', 'bt-slate');
    if (['classic', 'walnut', 'slate'].indexOf(s.board) >= 0) document.body.classList.add('bt-' + s.board);
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
    go(isView(start) ? start : 'home', {}, { replace: true });
    // a double click on a button acts once; buttons meant for fast repeats carry data-repeat
    document.addEventListener('click', function (e) {
      if (e.detail < 2 || !e.target || !e.target.closest) return;
      var b = e.target.closest('button');
      if (!b || b.hasAttribute('data-repeat') || b.closest('.board')) return;
      e.stopPropagation(); e.preventDefault();
    }, true);
    Engines.init().then(engineNote, engineNote);
    if (Engines.onStatus) Engines.onStatus(engineNote); // a mid-session fallback to the built-in engine shows up too
    engineNote();
    Store.on(function (what) {
      if (what === 'remote' || what === 'import' || what === 'reset') { applySettings(); refresh(); }
    });
    window.addEventListener('popstate', function (e) {
      var st = e.state, n = location.hash.slice(1);
      var target = st && isView(st.v) ? { v: st.v, p: st.p || {} } : { v: isView(n) ? n : 'home', p: {} };
      var ask = null;
      if (!skipGuard) { try { ask = current && current.guard ? current.guard() : null; } catch (err) { ask = null; } }
      skipGuard = false;
      if (ask && currentEntry) {
        // stay on this screen until they answer: put it back on top of the history, and go back again only if they agree
        try { history.pushState(currentEntry, '', '#' + currentEntry.v); } catch (err) { /* history unavailable */ }
        confirm(ask.title, ask.text, ask.ok, !!ask.danger).then(function (yes) { if (yes) { skipGuard = true; history.back(); } });
        return;
      }
      go(target.v, target.p, { noHash: true });
    });
    window.addEventListener('pagehide', function () { Store.saveNow(); });
    document.addEventListener('visibilitychange', function () { if (document.hidden) Store.saveNow(); });
  }

  return { register: register, go: go, refresh: refresh, sheet: sheet, closeSheet: closeSheet, confirm: confirm, toast: toast,
    applySettings: applySettings, boot: boot, focus: focus, get name() { return currentName; }, NAV: NAV,
    /* the screen has something to lose right now (a timed round, a running clock): its guard would ask before leaving */
    get guarded() { try { return !!(current && current.guard && current.guard()); } catch (e) { return false; } } };
})();

/* ---------- shared bits used by several views ---------- */
var UI = (function () {
  'use strict';
  var h = U.h, C = TempoCore;
  /* the bot's portrait; a bot without one gets its initial in its tone. A copy made with tools/with_portraits.py also
     has pictures (window.TEMPO_PORTRAITS: id -> a list of image links or embedded images, best first): the first one
     that loads covers the badge, and if none does the badge simply stays, never a broken image. Links that failed
     aren't tried again, and the one that worked is used first from then on. */
  var picOk = {}, picDead = {};
  function pictures(id) {
    var list = window.TEMPO_PORTRAITS && TEMPO_PORTRAITS[id];
    list = (typeof list === 'string' ? [list] : Array.isArray(list) ? list : []).filter(function (s) {
      return typeof s === 'string' && /^(https:\/\/|data:image\/)/.test(s) && !picDead[s];
    });
    if (picOk[id] && list.indexOf(picOk[id]) > 0) list = [picOk[id]].concat(list.filter(function (s) { return s !== picOk[id]; }));
    return list;
  }
  function avatar(bot, size) {
    var el = h('span', { class: 'avatar ' + (size || '') + ' tone-' + (bot.tone || 'cream'), 'aria-hidden': 'true' });
    if (window.TempoAvatars && TempoAvatars.has(bot.id)) { el.classList.add('drawn'); el.innerHTML = TempoAvatars.svg(bot); }
    else el.textContent = bot.name.replace(/^The /, '').charAt(0);
    var pics = window.TEMPO_PORTRAITS ? pictures(bot.id) : [];
    if (pics.length) {
      var img = document.createElement('img'), at = 0;
      var next = function () {
        picDead[pics[at]] = 1;
        at++;
        if (at < pics.length) img.src = pics[at]; else img.remove();
      };
      img.className = 'photo'; img.alt = ''; img.draggable = false;
      img.loading = 'lazy'; img.decoding = 'async'; img.referrerPolicy = 'no-referrer';
      img.onload = function () { if (!img.naturalWidth) { next(); return; } picOk[bot.id] = pics[at]; el.classList.add('has-photo'); };
      img.onerror = next;
      img.src = pics[0];
      el.appendChild(img);
    }
    return el;
  }
  function stars(n, of) {
    var el = h('span', { class: 'stars', 'aria-label': n + ' of ' + (of || 3) + ' stars' });
    for (var i = 0; i < (of || 3); i++) el.appendChild(U.icon('star', i < n ? '' : 'off'));
    return el;
  }
  /* whose move it is, shown with that side's king */
  function turnPill(side, text) {
    return h('span', { class: 'turn-pill' }, h('span', { class: 'cp ' + (side === 1 ? 'wk' : 'bk'), 'aria-hidden': 'true' }), text || (side === 1 ? 'White to move' : 'Black to move'));
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
    // nothing to draw yet: a plain sentence at reading size, not an empty chart with tiny print
    if (points.length < 2) return h('p', { class: 'muted chart-empty' }, (opts.empty || 'Not enough data yet') + '.');
    var vals = points.map(function (p) { return p[1]; });
    var lo = Math.min.apply(null, vals), hi = Math.max.apply(null, vals);
    var pad = Math.max(20, (hi - lo) * 0.15); lo = Math.floor((lo - pad) / 50) * 50; hi = Math.ceil((hi + pad) / 50) * 50;
    if (opts.lo != null) lo = opts.lo; if (opts.hi != null) hi = opts.hi;   // a fixed scale, like 0 to 100 for accuracy
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
    b.el.removeAttribute('tabindex'); b.el.setAttribute('aria-hidden', 'true');
    var p = new C.Pos(fen);
    var anim = Board.animate; Board.animate = false;
    b.setPosition(p, { last: last || null });
    Board.animate = anim;
    return h('div', { class: 'mini-board' }, b.el);
  }

  /* ---------- the characters ---------- */
  function tierLabel(ti) { var t = TempoBots.TIERS[ti]; return 'Tier ' + t.id + ' · ' + t.name; }
  function tierBadge(ti, cls) { var t = TempoBots.TIERS[ti]; return h('span', { class: 'tier-badge t-' + t.id + (cls ? ' ' + cls : ''), 'aria-hidden': 'true' }, t.id); }
  function ratingText(bot) { return 'about ' + bot.rating; }
  /* one character as a tile: badge, name, rating, and whether it's beaten, locked or the promotion match */
  function charTile(bot, o) {
    o = o || {};
    var S = Store.state, all = S.settings.unlockAll, acc = TempoBots.access(S.play, bot.id, all), rec = S.play.bots[bot.id] || {};
    var locked = acc !== 'open', isNext = o.next === bot.id, playing = o.playing === bot.id;
    var t = TempoBots.TIERS[bot.tierIdx];
    var note = bot.bonus ? 'Bonus challenger' : bot.id === t.boss ? (bot.tierIdx === TempoBots.TIERS.length - 1 ? 'Final match' : 'Promotion match') : null;
    var status = rec.beaten ? U.icon('check', 'won') : locked ? U.icon('lock') : null;
    var label = bot.name + ', ' + ratingText(bot) + (note ? ', ' + note.toLowerCase() : '') + (rec.beaten ? ', beaten' : locked ? ', locked' : isNext ? ', your next opponent' : '');
    return h('button', { class: 'char' + (locked ? ' locked' : '') + (isNext ? ' next' : '') + (playing ? ' playing' : '') + (rec.beaten ? ' beaten' : ''), type: 'button', 'aria-label': label,
      onclick: function () { if (acc === 'open') Play.setup(bot); else lockedSheet(bot, acc); } },
      avatar(bot, 'sm'),
      h('span', { class: 'who' }, h('span', { class: 'nm', lang: 'en' }, bot.name), h('span', { class: 'r num' }, String(bot.rating)), note ? h('span', { class: 'note' }, note) : null),
      status ? h('span', { class: 'st' }, status) : null);
  }
  /* the hidden bonus challenger, before it appears */
  function mysteryTile(id) {
    var key = TempoBots.byId(TempoBots.UNLOCKS[id]);
    return h('div', { class: 'char mystery', role: 'note' }, h('span', { class: 'avatar sm mystery-badge', 'aria-hidden': 'true' }, '?'),
      h('span', { class: 'who' }, h('span', { class: 'nm' }, 'A bonus challenger'), h('span', { class: 'r' }, 'Beat ' + (key ? key.name : 'the Masters') + ' to meet them')));
  }
  /* a character you can't play yet explains why, and can be played anyway */
  function lockedSheet(bot, acc) {
    var S = Store.state, t = TempoBots.TIERS[bot.tierIdx], title, text;
    if (acc === 'boss-locked') {
      var need = TempoBots.WINS_FOR_BOSS - TempoBots.winsIn(S.play, bot.tierIdx);
      title = 'Promotion match: ' + bot.name;
      text = bot.name + ' guards the way out of ' + t.name + '. Win ' + (need === TempoBots.WINS_FOR_BOSS ? U.plural(need, 'game') : U.plural(need, 'more game')) + ' against other ' + t.id + '-tier characters to open the match.';
    } else if (acc === 'hidden') {
      title = 'Not yet'; text = 'This challenger appears when you beat ' + TempoBots.byId(TempoBots.UNLOCKS[bot.id]).name + '.';
    } else {
      var prev = TempoBots.byId(TempoBots.TIERS[bot.tierIdx - 1].boss), top = TempoBots.topTier(S.play);
      title = 'Tier ' + t.id + ' is locked';
      text = bot.tierIdx === top + 1 ? 'Win the promotion match against ' + prev.name + ' to reach ' + t.name + '.' : 'Climb the tiers below first: ' + tierLabel(top) + ' is as far as you’ve reached.';
    }
    App.sheet(function (box, api) {
      box.appendChild(h('div', { class: 'row', style: { marginBottom: '10px' } }, avatar(bot, 'lg'), h('h2', null, title)));
      box.appendChild(h('p', { class: 'muted' }, text + (acc === 'hidden' ? '' : ' You can also play ' + bot.short + ' now: a win still counts.')));
      var row = h('div', { class: 'row end', style: { marginTop: '18px' } }, h('button', { class: 'btn', type: 'button', onclick: function () { api.close(); } }, 'Not now'));
      if (acc !== 'hidden') row.appendChild(h('button', { class: 'btn primary', type: 'button', onclick: function () { api.close(); Play.setup(bot); } }, 'Play ' + bot.short + ' anyway'));
      box.appendChild(row);
    });
  }
  /* where you stand in your tier: how many wins toward the promotion match, as a sentence and as dots */
  function tierProgress(ti) {
    var S = Store.state, t = TempoBots.TIERS[ti], boss = TempoBots.byId(t.boss), wins = Math.min(TempoBots.WINS_FOR_BOSS, TempoBots.winsIn(S.play, ti));
    var beatBoss = S.play.bots[boss.id] && S.play.bots[boss.id].beaten, last = ti === TempoBots.TIERS.length - 1, text;
    if (beatBoss) text = last ? 'You beat ' + boss.name + '. You’re the Tempo Champion.' : 'Done: you beat ' + boss.name + ' and moved up.';
    else if (wins >= TempoBots.WINS_FOR_BOSS) text = 'Promotion match open: beat ' + boss.name + (last ? ' to become the Tempo Champion.' : ' to reach ' + tierLabel(ti + 1) + '.');
    else if (!wins) text = 'Win ' + TempoBots.WINS_FOR_BOSS + ' games here to open the promotion match against ' + boss.name + '.';
    else text = U.plural(wins, 'win') + ' so far. ' + (TempoBots.WINS_FOR_BOSS - wins) + ' more ' + (TempoBots.WINS_FOR_BOSS - wins === 1 ? 'opens' : 'open') + ' the promotion match against ' + boss.name + '.';
    var dots = h('span', { class: 'pips', role: 'img', 'aria-label': wins + ' of ' + TempoBots.WINS_FOR_BOSS + ' wins' });
    for (var i = 0; i < TempoBots.WINS_FOR_BOSS; i++) dots.appendChild(h('i', { class: i < wins || beatBoss ? 'on' : '' }));
    return { text: text, dots: dots, wins: wins, done: !!beatBoss };
  }
  /* a character's seven traits as a heptagon, each 0 to 100 */
  var TRAITS = [['aggression', 'Attack'], ['risk', 'Risk'], ['opening_preparation', 'Theory'], ['defense', 'Defense'], ['trickery', 'Tricks'], ['trade_preference', 'Trades'], ['endgame', 'Endgames']];
  function radar(traits) {
    var NS = 'http://www.w3.org/2000/svg', W = 240, H = 214, cx = 120, cy = 110, R = 70, n = TRAITS.length;
    var svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H); svg.setAttribute('class', 'radar'); svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', 'Traits: ' + TRAITS.map(function (t) { return t[1] + ' ' + (traits[t[0]] || 0); }).join(', '));
    function pt(i, r) { var a = -Math.PI / 2 + i * 2 * Math.PI / n; return [cx + r * Math.cos(a), cy + r * Math.sin(a)]; }
    function poly(r, cls) {
      var e = document.createElementNS(NS, 'polygon');
      e.setAttribute('points', TRAITS.map(function (t, i) { var q = pt(i, typeof r === 'function' ? r(t, i) : r); return q[0].toFixed(1) + ',' + q[1].toFixed(1); }).join(' '));
      e.setAttribute('class', cls); svg.appendChild(e);
    }
    [1, 0.66, 0.33].forEach(function (k) { poly(R * k, 'grid'); });
    TRAITS.forEach(function (t, i) {
      var q = pt(i, R), ln = document.createElementNS(NS, 'line');
      ln.setAttribute('x1', cx); ln.setAttribute('y1', cy); ln.setAttribute('x2', q[0].toFixed(1)); ln.setAttribute('y2', q[1].toFixed(1)); ln.setAttribute('class', 'spoke');
      svg.appendChild(ln);
    });
    poly(function (t) { return R * Math.max(0.04, Math.min(100, traits[t[0]] || 0) / 100); }, 'shape');
    TRAITS.forEach(function (t, i) {
      var q = pt(i, R + 16), tx = document.createElementNS(NS, 'text');
      tx.setAttribute('x', q[0].toFixed(1)); tx.setAttribute('y', (q[1] + 4).toFixed(1));
      tx.setAttribute('text-anchor', Math.abs(q[0] - cx) < 8 ? 'middle' : q[0] < cx ? 'end' : 'start');
      tx.setAttribute('class', 'lbl'); tx.textContent = t[1]; svg.appendChild(tx);
    });
    return svg;
  }

  /* one row of a grouped list: icon, a title, an optional line under it, and a chevron */
  /* what keeps going wrong in your games, with the lesson, puzzles and positions that fix it; null when nothing repeats yet */
  function patternCard(opts) {
    var pt = Mistakes.patterns(); if (!pt) return null;
    var row = Explain.studyRow(pt.topic, '');
    if (row && !(opts && opts.noRetry)) row.appendChild(h('button', { class: 'btn small quiet', type: 'button', onclick: function () { App.go('train', { mode: 'mistakes' }); } }, U.icon('target'), 'Retry those positions'));
    return h('section', { class: 'card pattern' + (opts && opts.cls ? ' ' + opts.cls : ''), 'aria-label': 'Your pattern' },
      h('div', { class: 'label' }, opts && opts.label || 'Your pattern'), h('p', { class: 'pattern-text' }, Mistakes.patternText(pt)), row);
  }
  function menuRow(icon, title, sub, onclick, extra) {
    return h('button', { class: 'menu-row' + (extra ? ' ' + extra : ''), type: 'button', onclick: onclick },
      typeof icon === 'string' ? U.icon(icon) : icon, h('span', { class: 'txt' }, h('span', { class: 't' }, title), sub ? h('span', { class: 's' }, sub) : null), U.icon('next', 'chev'));
  }

  return { avatar: avatar, stars: stars, turnPill: turnPill, meter: meter, material: material, capturedRow: capturedRow, lineChart: lineChart, miniBoard: miniBoard, pieceIcon: pieceIcon, menuRow: menuRow, patternCard: patternCard,
    tierLabel: tierLabel, tierBadge: tierBadge, charTile: charTile, mysteryTile: mysteryTile, lockedSheet: lockedSheet, tierProgress: tierProgress, radar: radar };
})();

/* ---------- Home ----------
   The character you play next, a real board (today's puzzle, or your unfinished game),
   the few things that are due, and where you stand in your tier. */
App.register('home', {
  render: function (root) {
    var h = U.h, S = Store.state, C = TempoCore, BOTS = TempoBots.BOTS;
    var next = TempoBots.nextFor(S.play, S.settings.unlockAll), top = TempoBots.topTier(S.play);
    var cur = S.current, curBot = cur && !cur.result && cur.moves && cur.moves.length ? TempoBots.byId(cur.bot) : null;
    var solved = S.puzzles.daily === U.dayKey();

    root.appendChild(h('h1', { class: 'sr-only' }, 'Home'));
    if (firstRun()) root.appendChild(placement());
    var hero = h('section', { class: 'home-hero' }), fig = h('figure', { class: 'home-fig' }),
      todo = h('nav', { class: 'home-todo menu-list', 'aria-label': 'Due now' }), ladder = h('section', { class: 'home-ladder', 'aria-label': 'Opponents' });
    root.appendChild(h('div', { class: 'home' },
      h('div', { class: 'home-col' }, hero, ladder),
      h('div', { class: 'home-col' }, fig, todo)));

    /* first run: one question, so a player who already has a rating doesn't start at the bottom */
    function firstRun() {
      return !S.settings.placed && !S.play.hist.length && !S.puzzles.count && !Object.keys(S.learn.done).length && !S.games.list.length;
    }
    function placement() {
      var input = h('input', { type: 'number', inputmode: 'numeric', min: '100', max: '2500', placeholder: 'e.g. 750', 'aria-label': 'Your Chess.com rating', class: 'num' });
      var msg = h('p', { class: 'small', 'aria-live': 'polite' });
      function done() { S.settings.placed = true; Store.touch('settings'); App.refresh(); }
      function set() {
        var r = Math.round(+input.value);
        if (!(r >= 100 && r <= 2500)) { msg.textContent = 'Enter a rating between 100 and 2500.'; input.focus(); return; }
        // the tier holding your rating opens, up to the Masters; the Legends are earned
        S.play.rating = r; S.play.hist = [[Date.now(), r]]; S.play.tier = Math.max(S.play.tier || 0, Math.min(4, TempoBots.tierOfRating(r)));
        S.puzzles.rating = r;
        Store.touch('play'); Store.touch('puzzles');
        App.toast('Done. ' + UI.tierLabel(TempoBots.topTier(S.play)) + ' is open, and puzzles start near ' + r + '.');
        done();
      }
      input.addEventListener('keydown', function (e) { if (e.key === 'Enter') set(); });
      return h('section', { class: 'placement', 'aria-label': 'Starting level' },
        h('h2', null, 'Already have a rating?'),
        h('p', { class: 'muted' }, 'Enter your Chess.com rating to open the tiers up to your level and start puzzles there. Or skip this and start with the Chaos Crew.'),
        h('div', { class: 'row' }, input,
          h('button', { class: 'btn primary', type: 'button', onclick: set }, 'Start there'),
          h('button', { class: 'btn quiet', type: 'button', onclick: done }, 'Skip')),
        msg);
    }

    /* hero: your unfinished game, or the next character to play */
    if (curBot) {
      var moveNo = Math.floor(cur.moves.length / 2) + 1;
      hero.appendChild(h('h2', null, curBot.name));
      hero.appendChild(h('p', null, 'Your game is still going. You’re on move ' + moveNo + '.'));
      hero.appendChild(h('button', { class: 'btn primary', type: 'button', onclick: function () { Play.resume(); } }, 'Resume game'));
    } else {
      var isBoss = next.id === TempoBots.TIERS[next.tierIdx].boss;
      hero.appendChild(h('h2', null, next.name));
      hero.appendChild(h('p', null, (isBoss ? 'Your promotion match, rated about ' + next.rating + '. ' : 'Your next opponent, rated about ' + next.rating + '. ') + next.bio + '.'));
      hero.appendChild(h('button', { class: 'btn primary', type: 'button', onclick: function () { Play.setup(next); } }, 'Play ' + next.short));
    }

    /* the board: the unfinished game if there is one, otherwise today's puzzle */
    function showBoard(fen, orient, last, label, caption, open) {
      U.clear(fig);
      fig.appendChild(h('button', { class: 'home-board', type: 'button', 'aria-label': label, onclick: open }, UI.miniBoard(fen, orient, last)));
      fig.appendChild(h('figcaption', null, caption));
    }
    fig.appendChild(h('div', { class: 'home-board placeholder', 'aria-hidden': 'true' }));
    fig.appendChild(h('figcaption', { 'aria-hidden': 'true' }, '\u00a0')); // holds the caption's line, so nothing below moves when the board arrives
    var dueMistake = Mistakes.due()[0];
    var game = curBot ? replayCurrent(cur) : null;
    if (game) {
      var n = cur.moves.length, lastSan = cur.sans && cur.sans[n - 1];
      var after = lastSan ? 'After ' + Math.ceil(n / 2) + (n % 2 ? '.' : '...') + lastSan + '. ' : '';
      var yours = (game.pos.side === 1) === (cur.color === 'w');
      showBoard(game.pos.fen(), cur.color || 'w', game.last, 'Resume your game against ' + curBot.name,
        after + (yours ? 'Your move.' : curBot.name + ' to move.'), function () { Play.resume(); });
    } else if (solved && dueMistake && mistakeBoard(dueMistake)) {
      // today's puzzle is done: put one of your own mistakes on the board instead
    } else {
      Puzzles.dailyPosition().then(function (d) {
        if (!d) { U.clear(fig); return; }
        showBoard(d.fen, d.side === 1 ? 'w' : 'b', d.last, solved ? 'More puzzles' : 'Solve today\u2019s puzzle',
          solved ? 'You solved today\u2019s puzzle. Tap the board for more at your level.' : 'Today\u2019s puzzle, rated ' + d.rating + '. ' + (d.side === 1 ? 'White' : 'Black') + ' to move.',
          function () { Puzzles.daily({ from: 'home' }); });
      }, function () { U.clear(fig); });
    }
    function replayCurrent(g) {
      try {
        var p = new C.Pos(g.startFen || C.START_FEN), last = null;
        for (var i = 0; i < g.moves.length; i++) { last = p.parseMove(g.moves[i]); if (!last) return null; p.make(last); }
        return { pos: p, last: last };
      } catch (e) { return null; }
    }
    function mistakeBoard(it) {
      try {
        var p = new C.Pos(it.fen), m = p.parseMove(it.played);
        if (!m) return false;
        showBoard(it.fen, p.side === 1 ? 'w' : 'b', null, 'Retry a mistake from your games',
          'From one of your games. You played ' + p.san(m) + ' here. Find something better.', function () { App.go('train', { mode: 'mistakes' }); });
        return true;
      } catch (e) { return false; }
    }

    /* due now: one sentence per item with a rough time, only what is actually waiting; what fixes your games comes first */
    function item(icon, text, open, mins) { todo.appendChild(UI.menuRow(icon, text, mins ? 'About ' + U.plural(mins, 'minute') : null, open)); }
    var pattern = UI.patternCard({ cls: 'home-pattern' });
    if (pattern) todo.parentNode.insertBefore(pattern, todo);
    var mistakes = Mistakes.due().length;
    if (mistakes) item('target', 'Retry ' + U.plural(mistakes, 'mistake') + ' from your games', function () { App.go('train', { mode: 'mistakes' }); }, Math.min(10, Math.ceil(mistakes * 0.75)));
    // the games you added: being reviewed now, or waiting (they review in the background, so they take none of your time)
    var added = Review.waiting(), going = Review.reviewing();
    if (going) todo.appendChild(UI.menuRow('review', 'Reviewing the games you added: ' + Math.min(going.at + 1, going.n) + ' of ' + going.n, 'It keeps going while you play', function () { Review.openBatch(); }));
    else if (added.length) todo.appendChild(UI.menuRow('review', 'Review ' + U.plural(added.length, 'game') + ' you added', added.length === 1 ? 'Tempo reviews it while you play' : 'Tempo reviews them while you play',
      function () { Review.openBatch(added.map(function (g) { return g.id; })); }));
    var rv = Learn.due();
    if (rv.count) item('refresh', 'Review ' + U.plural(rv.count, 'lesson') + ' so they stick', function () { Learn.review(); }, rv.minutes);
    var last = S.games.list[0], lastBot = last && TempoBots.find(last.bot);
    if (last && !last.reviewed && lastBot) {
      item('review', 'Review your ' + resultPhrase(last, lastBot.short || lastBot.name).replace(/^./, function (c) { return c.toLowerCase(); }), function () { Review.openGame(last.id); }, 3);
    }
    var now = Date.now(), dueReps = {}, dueLines = 0;
    Object.keys(S.openings.lines).forEach(function (k) {
      var r = S.openings.lines[k];
      if (k.indexOf('trap/') === 0 || !r || !r.learned || (r.due || 0) > now) return;
      dueLines++; dueReps[k.split('/')[0]] = true;
    });
    if (dueLines) {
      var reps = Object.keys(dueReps);
      item('openings', U.plural(dueLines, 'opening line') + ' to drill', function () { App.go('openings', reps.length === 1 ? { rep: reps[0] } : {}); }, Math.min(10, dueLines));
    }
    // the puzzle theme you miss most often, once there's enough to go on
    var weak = Puzzles.weakest();
    if (weak) item('puzzle', 'Practice ' + Puzzles.NAMES[weak.t].toLowerCase().replace(/^mate in/, 'mate-in') + ' puzzles: you solve ' + Math.round(weak.rate * 100) + '%', function () { Puzzles.themed(weak.t); }, 4);
    if (curBot && !solved) item('puzzle', 'Today\u2019s puzzle', function () { Puzzles.daily({ from: 'home' }); }, 2);
    var nl = Learn.nextLesson();
    if (nl) {
      var num = 0, units = Data.lessons(), found = false;
      for (var ui = 0; ui < units.length && !found; ui++) for (var li = 0; li < units[ui].lessons.length; li++) { num++; if (units[ui].lessons[li].id === nl.lesson.id) { found = true; break; } }
      item('book', 'Lesson ' + num + ': ' + nl.lesson.title, function () { Learn.open(nl.lesson.id); }, Math.max(3, Math.round(nl.lesson.steps.length * 0.6)));
    }
    if (Store.backupDue()) item('download', 'Back up your progress', function () { S.settings.backupAsked = Date.now(); Store.touch('settings'); App.go('prefs'); }, 1);
    if (!todo.childNodes.length) todo.remove();

    /* your tier: how far to the promotion match, and a few of the characters in it, the next one first */
    var tp = UI.tierProgress(top), t = TempoBots.TIERS[top];
    ladder.appendChild(h('div', { class: 'tier-head' }, UI.tierBadge(top), h('div', { class: 'grow' }, h('div', { class: 't' }, UI.tierLabel(top)), h('div', { class: 's' }, tp.text), tp.dots)));
    var pick = [next.id].concat(t.members.filter(function (id) { var r = S.play.bots[id]; return id !== next.id && id !== t.boss && !(r && r.beaten); })).slice(0, 3);
    if (pick.indexOf(t.boss) < 0) pick.push(t.boss);
    var grid = h('div', { class: 'chars compact' });
    pick.forEach(function (id) { grid.appendChild(UI.charTile(TempoBots.byId(id), { next: curBot ? null : next.id, playing: curBot && curBot.id })); });
    ladder.appendChild(grid);
    ladder.appendChild(h('button', { class: 'all-link', type: 'button', onclick: function () { App.go('play'); } }, 'All ' + BOTS.length + ' characters'));
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
    App.NAV.filter(function (n) { return ['clock', 'openings', 'train', 'review', 'progress', 'prefs'].indexOf(n.id) >= 0 && (n.id !== 'openings' || hasOpenings); }).forEach(function (n) {
      list.appendChild(UI.menuRow(n.icon, n.label, null, function () { App.go(n.id); }));
    });
    root.appendChild(list);
  }
});
