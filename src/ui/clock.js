/* Tempo chess clock: the whole screen becomes a two-sided clock for a game on a real board.
   Each half belongs to one player. Tap your half when you've made your move: your time stops and your opponent's starts.
   On a phone or tablet held upright the far half is turned around to face the other player; turned sideways,
   the halves sit left and right like a real clock. */
var Clock = (function () {
  'use strict';
  var h = U.h;
  // time controls: minutes each, then seconds added after every move
  var PRESETS = ['3+2', '5+0', '5+3', '10+0', '10+5', '15+10', '30+0', '60+0'];
  var MINUTES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 15, 20, 25, 30, 40, 45, 50, 60, 75, 90, 120, 150, 180];
  var SECONDS = [0, 1, 2, 3, 5, 10, 15, 20, 30, 45, 60];
  var DEFAULT = '10+0';
  var LOW = 20000;   // below this the running side turns coral
  var BOUNCE = 300;  // a tap this soon after a switch is a slip of the finger, not a move
  var KEY = 'tempo:clock';

  var S = null;      // the game on the clock; it stays while you visit other screens
  var V = null;      // what's on screen
  var lock = null, wantLock = false, toldSleep = false;

  function other(c) { return c === 'w' ? 'b' : 'w'; }
  function now() { return performance.now(); }

  /* "10+5" for both players, or "10+5/3+2" for White's and then Black's: minutes, then seconds added each move */
  function parse(spec) {
    var m = /^(\d{1,3})\+(\d{1,2})(?:\/(\d{1,3})\+(\d{1,2}))?$/.exec(String(spec == null ? '' : spec));
    if (!m) return null;
    function side(a, b) { a = +a; b = +b; return a >= 1 && a <= 180 && b <= 60 ? { base: a * 60000, inc: b * 1000 } : null; }
    var w = side(m[1], m[2]), b = m[3] != null ? side(m[3], m[4]) : w;
    return w && b ? { w: w, b: b } : null;
  }
  function specOf(w, b) { var a = w.min + '+' + w.sec; return w.min === b.min && w.sec === b.sec ? a : a + '/' + b.min + '+' + b.sec; }
  function minSec(t) { return { min: t.base / 60000, sec: t.inc / 1000 }; }
  /* for the bar: "10 min", "10 min +5s", or "10 / 3 min" when the players have different times */
  function short(spec) {
    var t = parse(spec); if (!t) return '';
    var w = minSec(t.w), b = minSec(t.b);
    if (w.min === b.min && w.sec === b.sec) return w.min + ' min' + (w.sec ? ' +' + w.sec + 's' : '');
    return w.min + ' / ' + b.min + ' min';
  }
  function long(t) { var x = minSec(t); return x.min + ' minutes' + (x.sec ? ', plus ' + x.sec + ' seconds after each move' : ''); }

  /* ---------- the game on the clock ---------- */
  function fresh(spec, whiteTop) {
    if (!parse(spec)) spec = DEFAULT;
    var t = parse(spec);
    return { spec: spec, tc: t, left: { w: t.w.base, b: t.b.base }, moves: { w: 0, b: 0 }, turn: null,
      started: false, paused: false, over: null, since: 0, last: 0, whiteTop: !!whiteTop, warned: '' };
  }
  function running() { return !!S && S.started && !S.paused && !S.over; }
  function leftOf(c) { return running() && S.turn === c ? S.left[c] - (now() - S.since) : S.left[c]; }

  /* kept for this tab only, so a reload in the middle of a game doesn't lose it */
  function save() {
    if (!S) return;
    var snap = { spec: S.spec, left: { w: leftOf('w'), b: leftOf('b') }, moves: S.moves, turn: S.turn, started: S.started,
      paused: S.paused, over: S.over, whiteTop: S.whiteTop, running: running(), at: Date.now() };
    try { sessionStorage.setItem(KEY, JSON.stringify(snap)); } catch (e) { /* storage off: the clock still works, it just won't outlive a reload */ }
  }
  function restore() {
    var o = null;
    try { o = JSON.parse(sessionStorage.getItem(KEY) || 'null'); } catch (e) { o = null; }
    if (!o || typeof o !== 'object' || !parse(o.spec)) return null;
    var s = fresh(o.spec, o.whiteTop === true);
    if (o.started !== true) return s;
    function ms(x, d) { return typeof x === 'number' && isFinite(x) ? Math.max(0, Math.min(x, 6 * 3600000)) : d; }
    function count(x) { return typeof x === 'number' && isFinite(x) ? Math.max(0, Math.min(9999, Math.floor(x))) : 0; }
    var left = o.left && typeof o.left === 'object' ? o.left : {}, moves = o.moves && typeof o.moves === 'object' ? o.moves : {};
    s.left = { w: ms(left.w, s.left.w), b: ms(left.b, s.left.b) };
    s.moves = { w: count(moves.w), b: count(moves.b) };
    s.started = true; s.turn = o.turn === 'b' ? 'b' : 'w';
    s.over = o.over === 'w' || o.over === 'b' ? o.over : null;
    if (!s.over) {
      // it was running when the page went away: that time was used, and the clock waits for Resume
      if (o.running === true && typeof o.at === 'number') s.left[s.turn] = Math.max(0, s.left[s.turn] - Math.max(0, Date.now() - o.at));
      if (s.left[s.turn] <= 0) { s.left[s.turn] = 0; s.over = s.turn; } else s.paused = true;
    }
    return s;
  }

  function start() {
    S.started = true; S.turn = 'w'; S.since = now(); S.last = S.since;
    keepAwake(true); wantFull();
    U.sound.move();
    save(); paint(); tick();
  }
  /* a tap on a half: the first one starts White's clock, then each player taps their own half after moving */
  function press(c) {
    if (!S || S.over || S.paused) return;
    if (!S.started) { start(); return; }
    if (c !== S.turn) return;
    var t = now();
    if (t - S.last < BOUNCE) return;
    var left = S.left[c] - (t - S.since);
    if (left <= 0) { flag(c); return; }
    S.left[c] = left + S.tc[c].inc;
    S.moves[c]++;
    S.turn = other(c); S.since = t; S.last = t;
    U.sound.move();
    save(); paint(); tick();
  }
  function pause() {
    if (!running()) return;
    S.left[S.turn] = Math.max(0, S.left[S.turn] - (now() - S.since));
    S.paused = true;
    keepAwake(false);
    save(); paint(); tick();
  }
  function resume() {
    if (!S || !S.paused || S.over) return;
    S.paused = false; S.since = now(); S.last = S.since;
    keepAwake(true); wantFull();
    save(); paint(); tick();
  }
  function flag(c) {
    S.left[c] = 0; S.over = c; S.paused = false;
    keepAwake(false);
    U.sound.end();
    try { if (navigator.vibrate) navigator.vibrate([180, 90, 180]); } catch (e) { /* no buzzer */ }
    save(); paint(); tick();
  }
  function restart(spec) {
    S = fresh(spec || S.spec, S.whiteTop);
    keepAwake(false);
    save(); paint(); tick();
  }
  function askRestart() {
    App.confirm('Start over?', 'Both clocks go back to the start, and this game’s times are cleared.', 'Start over').then(function (yes) { if (yes && S) restart(); });
  }
  function swap() { if (S.started) return; S.whiteTop = !S.whiteTop; save(); paint(); }
  function exit() { if (running()) pause(); App.go('play'); }

  /* ---------- keeping the screen on, and the whole screen ---------- */
  function keepAwake(on) {
    wantLock = on;
    if (!on) {
      if (lock) { var l = lock; lock = null; try { l.release(); } catch (e) { /* already gone */ } }
      return;
    }
    if (lock || document.hidden) return;
    if (!navigator.wakeLock || typeof navigator.wakeLock.request !== 'function') { sleepNote(); return; }
    try {
      navigator.wakeLock.request('screen').then(function (l) {
        if (!wantLock) { try { l.release(); } catch (e) { /* ignore */ } return; }
        lock = l;
        l.addEventListener('release', function () { if (lock === l) lock = null; });
      }, sleepNote);
    } catch (e) { sleepNote(); }
  }
  function sleepNote() {
    if (toldSleep || !(window.matchMedia && matchMedia('(pointer: coarse)').matches)) return;
    toldSleep = true;
    App.toast('Your screen may lock during a long think. Turn off auto-lock while you play.');
  }
  /* On a phone or tablet, use the whole screen; a computer stays as it is. A touch only counts as a gesture the
     browser will go full screen for when the finger lifts, so a tap that started the clock asks again on its click. */
  function wantFull() { if (V) V.full = true; fullScreen(true); }
  function fullScreen(on) {
    var d = document, el = d.documentElement;
    try {
      if (on) {
        if (!(window.matchMedia && matchMedia('(pointer: coarse)').matches)) return;
        if (d.fullscreenElement || d.webkitFullscreenElement) return;
        var go = el.requestFullscreen || el.webkitRequestFullscreen;
        if (!go || d.fullscreenEnabled === false) return;
        var p = go.call(el);
        if (p && p.catch) p.catch(function () { /* not allowed here */ });
      } else if (d.fullscreenElement || d.webkitFullscreenElement) {
        var out = d.exitFullscreen || d.webkitExitFullscreen;
        var q = out && out.call(d);
        if (q && q.catch) q.catch(function () { /* ignore */ });
      }
    } catch (e) { /* not available */ }
  }

  /* ---------- drawing ---------- */
  function half() {
    var king = h('span', { class: 'ck-king', 'aria-hidden': 'true' });
    var name = h('span', { class: 'ck-name' }, king, h('span', { class: 'ck-who' }));
    var time = h('span', { class: 'ck-time' }), sub = h('span', { class: 'ck-sub' });
    var el = h('button', { class: 'ck-side', type: 'button' }, h('span', { class: 'ck-in' }, name, time, sub));
    return { el: el, king: king, who: name.lastChild, time: time, sub: sub, shown: null, low: null };
  }
  function halfOf(c) { return (c === 'w') === S.whiteTop ? V.top : V.bottom; }
  function paintTime(c, ms) {
    var hf = halfOf(c), txt = S.over === c ? '0:00' : U.clockText(Math.max(0, ms));
    if (hf.shown !== txt) { hf.time.textContent = txt; hf.shown = txt; }
    var low = running() && S.turn === c && ms < LOW;
    if (hf.low !== low) { hf.el.classList.toggle('low', low); hf.low = low; }
  }
  function subText(c) {
    if (S.over === c) return 'Out of time';
    if (!S.started) return 'Tap to start';
    if (S.paused) return 'Paused';
    if (running() && S.turn === c && !S.moves[c]) return 'Tap here after your move';
    return S.moves[c] ? U.plural(S.moves[c], 'move') : '';
  }
  function spoken(c, ms) {
    var s = Math.max(0, Math.ceil(ms / 1000)), m = Math.floor(s / 60), r = s % 60;
    var t = (m ? U.plural(m, 'minute') + (r ? ' ' + U.plural(r, 'second') : '') : U.plural(r, 'second')) + ' left';
    var who = c === 'w' ? 'White' : 'Black';
    if (S.over === c) return who + ', out of time';
    if (!S.started) return who + ', ' + t + '. Tap to start the clock.';
    return who + ', ' + t + (running() && S.turn === c ? '. Running. Tap after your move.' : '.');
  }
  function paint() {
    if (!V) return;
    // the digits keep one size for the whole game, set by the longest time on the clock
    var longest = Math.max(U.clockText(S.tc.w.base).length, U.clockText(S.tc.b.base).length, 4);
    V.el.style.setProperty('--ck-chars', String(longest));
    V.el.classList.toggle('ck-paused', !!S.paused);
    ['w', 'b'].forEach(function (c) {
      var hf = halfOf(c), run = running() && S.turn === c;
      hf.el.dataset.side = c;
      hf.el.className = 'ck-side ' + (hf === V.top ? 'ck-top' : 'ck-bottom') + (run ? ' run' : '') + (S.over === c ? ' out' : '');
      hf.shown = null; hf.low = null;
      hf.who.textContent = c === 'w' ? 'White' : 'Black';
      hf.king.style.backgroundImage = 'url("' + TempoPieces.uri(c, 'k', true, c === 'b') + '")';
      paintTime(c, leftOf(c));
      hf.sub.textContent = subText(c);
      hf.el.setAttribute('aria-label', spoken(c, leftOf(c)));
    });
    paintBar();
  }
  function barBtn(icon, label, fn, cls) {
    return h('button', { class: 'ck-btn' + (cls ? ' ' + cls : ''), type: 'button', onclick: fn }, U.icon(icon), h('span', { class: 'ck-btn-label' }, label));
  }
  function paintBar() {
    var b = V.bar;
    U.clear(b);
    if (!S.started) {
      b.appendChild(barBtn('clock', short(S.spec), pickTime, 'ck-tc'));
      b.appendChild(barBtn('flip', 'Swap sides', swap, 'ck-swap'));
      b.appendChild(barBtn('close', 'Exit', exit));
    } else if (S.over) {
      b.appendChild(barBtn('refresh', 'New game', function () { restart(); }, 'primary'));
      b.appendChild(barBtn('clock', short(S.spec), pickTime, 'ck-tc'));
      b.appendChild(barBtn('close', 'Exit', exit));
    } else if (S.paused) {
      b.appendChild(barBtn('resume', 'Resume', resume, 'primary'));
      b.appendChild(barBtn('refresh', 'Start over', askRestart));
      b.appendChild(barBtn('close', 'Exit', exit));
    } else {
      b.appendChild(barBtn('pause', 'Pause', pause, 'primary'));
    }
  }
  /* the running side counts down every frame; a timer backs it up so time still runs out when frames stop */
  function tick() {
    if (!V) return;
    if (V.raf) cancelAnimationFrame(V.raf);
    clearTimeout(V.flagT);
    V.raf = 0;
    if (!running()) return;
    var loop = function () {
      V.raf = 0;
      if (!V || !running()) return;
      var c = S.turn, left = leftOf(c);
      if (left <= 0) { flag(c); return; }
      paintTime(c, left);
      // one quiet tick as you pass ten seconds
      if (left < 10000 && S.warned !== c + S.moves[c]) { S.warned = c + S.moves[c]; U.sound.tick(); }
      V.raf = requestAnimationFrame(loop);
    };
    V.raf = requestAnimationFrame(loop);
    V.flagT = setTimeout(function () { if (V && running()) { if (leftOf(S.turn) <= 0) flag(S.turn); else tick(); } }, Math.max(50, leftOf(S.turn) + 40));
  }

  /* ---------- choosing the time ---------- */
  function pickTime() {
    var cur = parse(S.spec), w = minSec(cur.w), b = minSec(cur.b), split = w.min !== b.min || w.sec !== b.sec;
    App.sheet(function (box, api) {
      box.classList.add('ck-sheet');
      box.appendChild(h('h2', null, 'Time for each player'));
      var grid = h('div', { class: 'ck-presets' });
      PRESETS.forEach(function (p) {
        var t = minSec(parse(p).w);
        grid.appendChild(h('button', { class: 'ck-preset' + (p === S.spec ? ' on' : ''), type: 'button', 'aria-pressed': p === S.spec ? 'true' : 'false',
            onclick: function () { choose(p); api.close(); } },
          h('b', null, t.min + ' min'), h('span', null, t.sec ? '+ ' + t.sec + ' sec a move' : 'No added time')));
      });
      box.appendChild(grid);
      // your own: minutes and seconds a move, the same for both players or different for each
      var own = { w: { min: w.min, sec: w.sec }, b: { min: b.min, sec: b.sec } };
      var rows = h('div', { class: 'ck-own-rows' });
      var sw = h('input', { type: 'checkbox', id: 'ck-split', role: 'switch' });
      sw.checked = split;
      sw.addEventListener('change', function () { if (!sw.checked) own.b = { min: own.w.min, sec: own.w.sec }; drawRows(); });
      function stepper(label, list, get, set, unit) {
        var out = h('output', { class: 'ck-step-val' });
        function show() { out.textContent = get() + ' ' + unit; }
        // the next value on the list above or below, so odd saved values step back onto it
        function move(d) {
          var v = get(), i;
          if (d > 0) { i = 0; while (i < list.length && list[i] <= v) i++; i = Math.min(i, list.length - 1); }
          else { i = list.length - 1; while (i >= 0 && list[i] >= v) i--; i = Math.max(i, 0); }
          set(list[i]); show();
        }
        show();
        return h('div', { class: 'ck-step' }, h('span', { class: 'ck-step-label' }, label),
          h('div', { class: 'ck-step-ctl' },
            h('button', { class: 'btn icon-only', type: 'button', 'data-repeat': '', 'aria-label': 'Less: ' + label, onclick: function () { move(-1); } }, '−'),
            out,
            h('button', { class: 'btn icon-only', type: 'button', 'data-repeat': '', 'aria-label': 'More: ' + label, onclick: function () { move(1); } }, '+')));
      }
      function sideRows(c, title) {
        var o = own[c];
        return h('div', { class: 'ck-own-side' }, title ? h('div', { class: 'label' }, title) : null,
          stepper('Minutes', MINUTES, function () { return o.min; }, function (v) { o.min = v; if (!sw.checked && c === 'w') own.b.min = v; }, 'min'),
          stepper('Added after each move', SECONDS, function () { return o.sec; }, function (v) { o.sec = v; if (!sw.checked && c === 'w') own.b.sec = v; }, 'sec'));
      }
      function drawRows() {
        U.clear(rows);
        if (sw.checked) { rows.appendChild(sideRows('w', 'White')); rows.appendChild(sideRows('b', 'Black')); rows.classList.add('two'); }
        else { rows.appendChild(sideRows('w', null)); rows.classList.remove('two'); }
      }
      drawRows();
      box.appendChild(h('section', { class: 'ck-own', 'aria-label': 'Your own time' },
        h('h3', null, 'Your own'),
        rows,
        h('div', { class: 'toggle ck-split' }, h('label', { for: 'ck-split', class: 'grow' }, 'Give one player more time'), h('span', { class: 'switch' }, sw, h('span'))),
        h('button', { class: 'btn primary block', type: 'button', onclick: function () { choose(specOf(own.w, sw.checked ? own.b : own.w)); api.close(); } }, 'Use this time')));
    });
    function choose(spec) {
      if (!parse(spec)) return;
      Store.state.settings.otb = spec; Store.touch('settings');
      restart(spec);
    }
  }

  /* ---------- the screen ---------- */
  function render(root) {
    App.focus(true);
    if (!S) S = restore() || fresh(Store.state.settings.otb, false);
    var top = half(), bottom = half();
    var bar = h('div', { class: 'ck-bar', role: 'toolbar', 'aria-label': 'Clock' });
    var el = h('div', { class: 'clock-app' }, top.el, bar, bottom.el);
    root.appendChild(el);
    V = { el: el, top: top, bottom: bottom, bar: bar, raf: 0, flagT: 0 };
    [top, bottom].forEach(function (hf) {
      // a press counts the moment a finger lands; Enter or Space on a focused half works too
      hf.el.addEventListener('pointerdown', function (e) { if (e.button > 0) return; e.preventDefault(); press(hf.el.dataset.side); });
      hf.el.addEventListener('click', function (e) {
        if (e.detail === 0) press(hf.el.dataset.side);
        if (V && V.full) { V.full = false; fullScreen(true); }
      });
    });
    el.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    V.keys = function (e) {
      if (!S || e.target && /input|textarea|select/i.test(e.target.tagName) || document.querySelector('.sheet')) return;
      if (e.key === ' ' && !(e.target && e.target.closest && e.target.closest('.ck-bar'))) {
        e.preventDefault();
        if (!S.started) press('b'); else if (running() && !e.repeat) press(S.turn);
      } else if (e.key === 'Escape' || e.key === 'p' || e.key === 'P') {
        if (running()) pause(); else if (S.paused) resume();
      }
    };
    document.addEventListener('keydown', V.keys);
    V.vis = function () { if (document.hidden) save(); else if (wantLock) keepAwake(true); };
    document.addEventListener('visibilitychange', V.vis);
    paint(); tick();
  }
  function leave() {
    if (!V) return;
    if (running()) pause();
    if (V.raf) cancelAnimationFrame(V.raf);
    clearTimeout(V.flagT);
    document.removeEventListener('keydown', V.keys);
    document.removeEventListener('visibilitychange', V.vis);
    keepAwake(false); fullScreen(false);
    save();
    V = null;
  }

  App.register('clock', {
    render: render,
    leave: leave,
    guard: function () { return running() ? { title: 'Leave the clock?', text: 'It pauses, and the game stays here for when you come back.', ok: 'Leave' } : null; },
    busy: function () { return !!V; }
  });

  return { open: function () { App.go('clock'); }, parse: parse, PRESETS: PRESETS,
    _state: function () { return S && { spec: S.spec, left: { w: leftOf('w'), b: leftOf('b') }, moves: { w: S.moves.w, b: S.moves.b }, turn: S.turn,
      started: S.started, paused: S.paused, over: S.over, whiteTop: S.whiteTop, running: running() }; },
    _set: function (o) { if (!S) return; if (o.left) { if (running()) S.since = now(); S.left.w = o.left.w != null ? o.left.w : S.left.w; S.left.b = o.left.b != null ? o.left.b : S.left.b; } paint(); tick(); } };
})();
