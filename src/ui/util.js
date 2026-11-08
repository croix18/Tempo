/* Tempo UI helpers: DOM, formatting, icons, sound, clipboard, files. */
var U = (function () {
  'use strict';

  function h(tag, attrs) {
    var el = document.createElement(tag), i, k, v;
    if (attrs) {
      for (k in attrs) {
        if (!Object.prototype.hasOwnProperty.call(attrs, k)) continue;
        v = attrs[k];
        if (v == null || v === false) continue;
        if (k === 'class') el.className = v;
        else if (k === 'text') el.textContent = v;
        else if (k === 'html') el.innerHTML = v;
        else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
        else if (k.slice(0, 2) === 'on' && typeof v === 'function') el.addEventListener(k.slice(2), v);
        else if (k === 'dataset') Object.assign(el.dataset, v);
        else if (v === true) el.setAttribute(k, '');
        else el.setAttribute(k, v);
      }
    }
    for (i = 2; i < arguments.length; i++) append(el, arguments[i]);
    return el;
  }
  function append(el, c) {
    if (c == null || c === false) return;
    if (Array.isArray(c)) { c.forEach(function (x) { append(el, x); }); return; }
    if (typeof c === 'string' || typeof c === 'number') { el.appendChild(document.createTextNode(String(c))); return; }
    el.appendChild(c);
  }
  function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); return el; }
  function $(sel, root) { return (root || document).querySelector(sel); }

  /* inline text with **bold** and paragraph breaks, built safely */
  var TOUCH = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  function touchWords(t) { return TOUCH ? String(t).replace(/\bClick\b/g, 'Tap').replace(/\bclick\b/g, 'tap').replace(/\bclicking\b/g, 'tapping') : String(t); }
  function rich(text) {
    var frag = document.createDocumentFragment();
    touchWords(text || '').split(/\n\n+/).forEach(function (para) {
      var p = h('p');
      para.split(/(\*\*[^*]+\*\*)/).forEach(function (part) {
        if (/^\*\*[^*]+\*\*$/.test(part)) p.appendChild(h('strong', null, part.slice(2, -2)));
        else if (part) p.appendChild(document.createTextNode(part));
      });
      frag.appendChild(p);
    });
    return frag;
  }

  var ICONS = {
    home: '<path d="M4 11.5 12 5l8 6.5V20a1 1 0 0 1-1 1h-4.5v-6h-5v6H5a1 1 0 0 1-1-1z"/>',
    play: '<circle cx="12" cy="7.5" r="3"/><path d="M9.5 11.5h5l1.5 6.5h-8z"/><path d="M6.5 21h11"/>',
    puzzle: '<path d="M9 4h3.5a2 2 0 1 1 3 0H19v4.5a2 2 0 1 1 0 3V16h-4.5a2 2 0 1 0-3 0H8v-4.5a2 2 0 1 0 0-3V4z"/>',
    learn: '<path d="M4 5.5C6.5 4.5 9.5 4.5 12 6c2.5-1.5 5.5-1.5 8-.5V19c-2.5-1-5.5-1-8 .5-2.5-1.5-5.5-1.5-8-.5z"/><path d="M12 6v13.5"/>',
    openings: '<circle cx="6" cy="6" r="2.2"/><circle cx="6" cy="18" r="2.2"/><circle cx="18" cy="9" r="2.2"/><path d="M6 8.2v7.6M6 13c0-3 2-4 6-4h3.8"/>',
    train: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1.2"/>',
    progress: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
    prefs: '<path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2.2"/><circle cx="10" cy="17" r="2.2"/>',
    review: '<path d="M4 18 9 12l4 3 7-9"/><path d="M15 6h5v5"/>',
    more: '<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>',
    flip: '<path d="M7 4v14M4 15l3 3 3-3M17 20V6M14 9l3-3 3 3"/>',
    hint: '<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.6 10.8c.7.6 1.1 1.3 1.1 2.2h5c0-.9.4-1.6 1.1-2.2A6 6 0 0 0 12 3z"/>',
    undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
    flag: '<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>',
    draw: '<path d="M5 12h14"/><path d="M5 8h14M5 16h14" opacity=".35"/>',
    back: '<path d="M15 5l-7 7 7 7"/>',
    leave: '<path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4"/><path d="M9.5 8l-4 4 4 4M5.5 12H16"/>',
    next: '<path d="M9 5l7 7-7 7"/>',
    first: '<path d="M17 5l-7 7 7 7M7 5v14"/>',
    last: '<path d="M7 5l7 7-7 7M17 5v14"/>',
    close: '<path d="M6 6l12 12M18 6 6 18"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    lock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
    star: '<path d="M12 4l2.4 5 5.4.6-4 3.7 1.1 5.4L12 16l-4.9 2.7 1.1-5.4-4-3.7 5.4-.6z"/>',
    sound: '<path d="M4 10v4h4l5 4V6L8 10z"/><path d="M16.5 9a4 4 0 0 1 0 6"/>',
    copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>',
    download: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
    upload: '<path d="M12 20V9M7 14l5-5 5 5M5 4h14"/>',
    bolt: '<path d="M13 3 5 13h6l-1 8 8-10h-6z"/>',
    clock: '<circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/>',
    pause: '<path d="M9 6v12M15 6v12"/>',
    resume: '<path d="M8 5.5v13l10.5-6.5z"/>',
    'play-out': '<path d="M5 6v12l8-6z"/><path d="M16 6v12M19.5 6v12"/>',
    fire: '<path d="M12 21c-4 0-6.5-2.6-6.5-6 0-4 3.5-6 3.5-10 2.5 1.5 4 4 4 6 1-1 1.5-2.2 1.5-3.5 2.4 1.6 4 4.5 4 7.5 0 3.4-2.5 6-6.5 6z"/>',
    target: '<circle cx="12" cy="12" r="7.5"/><path d="M12 2v5M12 17v5M2 12h5M17 12h5"/>',
    eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>',
    list: '<path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"/>',
    analyze: '<circle cx="10.5" cy="10.5" r="6"/><path d="M15 15l5.5 5.5"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    trash: '<path d="M5 7h14M9 7V4h6v3M7 7l1 13h8l1-13"/>',
    refresh: '<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/>',
    shield: '<path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z"/>',
    crown: '<path d="M4 18h16M5 15l-1-8 5 4 3-6 3 6 5-4-1 8z"/>',
    book: '<path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z"/><path d="M5 17a3 3 0 0 1 3-3h11"/>'
  };
  function icon(name, cls) {
    var span = document.createElement('span');
    span.className = 'ic' + (cls ? ' ' + cls : '');
    span.setAttribute('aria-hidden', 'true');
    span.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' + (ICONS[name] || '') + '</svg>';
    return span;
  }

  function pct(x) { return Math.round(x) + '%'; }
  function plural(n, one, many) { return n + ' ' + (n === 1 ? one : (many || one + 's')); }
  function dateShort(ts) {
    var d = new Date(ts);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }
  function dayKey(ts) {
    var d = ts ? new Date(ts) : new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function clockText(ms) {
    if (ms < 0) ms = 0;
    var s = Math.ceil(ms / 1000), m = Math.floor(s / 60);
    if (ms < 10000) return (ms / 1000).toFixed(1);
    return m + ':' + String(s % 60).padStart(2, '0');
  }
  function evalText(cp, mate) {
    if (mate) return (mate > 0 ? '#' : '#-') + Math.abs(mate);
    var v = cp / 100;
    return (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toFixed(1);
  }
  function rng(seed) {
    var s = (seed >>> 0) || (Date.now() >>> 0) || 1;
    return function () { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
  }
  var R = rng(Date.now());
  function pick(arr) { return arr[Math.floor(R() * arr.length)]; }
  function shuffle(arr) { for (var i = arr.length - 1; i > 0; i--) { var j = Math.floor(R() * (i + 1)); var t = arr[i]; arr[i] = arr[j]; arr[j] = t; } return arr; }
  function debounce(fn, ms) { var t; return function () { var a = arguments, self = this; clearTimeout(t); t = setTimeout(function () { fn.apply(self, a); }, ms); }; }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function uid() { return Date.now().toString(36) + Math.floor(R() * 1e9).toString(36); }

  /* win chance (0-100) for the side with centipawn score cp, Lichess's curve */
  function winPct(cp, mate) {
    if (mate) return mate > 0 ? 100 : 0;
    var c = Math.max(-1500, Math.min(1500, cp));
    return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * c)) - 1);
  }

  /* ---------- sound (synthesized, no files) ---------- */
  var ctx = null, soundOn = true;
  function audio() {
    if (!soundOn) return null;
    try {
      if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
      if (ctx.state === 'suspended') ctx.resume();
      return ctx;
    } catch (e) { return null; }
  }
  function tone(freq, dur, type, vol, when) {
    var a = audio(); if (!a) return;
    var t = a.currentTime + (when || 0), o = a.createOscillator(), g = a.createGain();
    o.type = type || 'sine'; o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol || 0.1, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(a.destination); o.start(t); o.stop(t + dur + 0.02);
  }
  function knock(vol, freq) {
    var a = audio(); if (!a) return;
    var t = a.currentTime, len = Math.floor(a.sampleRate * 0.06), buf = a.createBuffer(1, len, a.sampleRate), d = buf.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
    var src = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
    f.type = 'bandpass'; f.frequency.value = freq || 1400; f.Q.value = 1.2;
    g.gain.value = vol || 0.5;
    src.buffer = buf; src.connect(f); f.connect(g); g.connect(a.destination); src.start(t);
  }
  var sound = {
    set: function (on) { soundOn = !!on; },
    move: function () { knock(0.55, 1500); },
    capture: function () { knock(0.8, 900); knock(0.4, 2400); },
    check: function () { knock(0.6, 1500); tone(880, 0.18, 'triangle', 0.05, 0.02); },
    castle: function () { knock(0.5, 1500); setTimeout(function () { knock(0.45, 1300); }, 90); },
    good: function () { tone(660, 0.14, 'sine', 0.07); tone(990, 0.22, 'sine', 0.06, 0.09); },
    bad: function () { tone(220, 0.22, 'triangle', 0.07); },
    end: function () { tone(523, 0.3, 'sine', 0.06); tone(659, 0.3, 'sine', 0.05, 0.08); tone(784, 0.45, 'sine', 0.05, 0.16); },
    tick: function () { tone(1200, 0.04, 'square', 0.015); }
  };

  /* ---------- clipboard and files ---------- */
  function copyText(text, fallbackEl) {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        return navigator.clipboard.writeText(text).then(function () { return true; }, function () { return selectFallback(); });
      }
    } catch (e) { /* fall through */ }
    return Promise.resolve(selectFallback());
    function selectFallback() {
      if (!fallbackEl) return false;
      try { fallbackEl.focus(); fallbackEl.select(); } catch (e) { /* ignore */ }
      return false;
    }
  }
  var downloads = null;
  if (window.claude && typeof window.claude.use === 'function') {
    try { window.claude.use('downloads').then(function (d) { downloads = d; }, function () {}); } catch (e) { /* ignore */ }
  }
  function framed() { try { return window.self !== window.top; } catch (e) { return true; } }
  function canSaveFile() { return !!downloads || !framed(); }
  function saveFile(name, text, type) {
    if (downloads) return downloads.save({ filename: name, data: text }).then(function () { return true; }, function () { return false; });
    try {
      var blob = new Blob([text], { type: type || 'text/plain' });
      var a = h('a', { href: URL.createObjectURL(blob), download: name });
      document.body.appendChild(a); a.click(); a.remove();
      return Promise.resolve(true);
    } catch (e) { return Promise.resolve(false); }
  }
  function readFile(accept) {
    return new Promise(function (resolve) {
      var inp = h('input', { type: 'file', accept: accept || '' });
      inp.addEventListener('change', function () {
        var f = inp.files && inp.files[0];
        if (!f) return resolve(null);
        var r = new FileReader();
        r.onload = function () { resolve(String(r.result || '')); };
        r.onerror = function () { resolve(null); };
        r.readAsText(f);
      });
      inp.click();
    });
  }

  function calm() { return !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches); }
  /* Change what a box holds without the rest jumping: note where each child sits, make the change,
     then play every child from its old place to its new one. Children that only now appear fade in. */
  function glide(box, change) {
    if (box.__gliding) { change(); return; } // already inside a glide of this box: the outer one plays the whole change
    var kids = [].slice.call(box.children), was = kids.map(function (k) { return k.getClientRects().length ? k.getBoundingClientRect().top : null; });
    box.__gliding = true;
    try { change(); } finally { box.__gliding = false; }
    if (calm() || !box.animate) return;
    [].slice.call(box.children).forEach(function (k) {
      if (!k.getClientRects().length) return;
      var i = kids.indexOf(k), top = k.getBoundingClientRect().top;
      try {
        if (i < 0 || was[i] == null) k.animate([{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }], { duration: 300, delay: 80, easing: 'ease-out', fill: 'backwards' });
        else if (Math.abs(was[i] - top) > 1) k.animate([{ transform: 'translateY(' + (was[i] - top) + 'px)' }, { transform: 'none' }], { duration: 340, easing: 'cubic-bezier(.3, .7, .3, 1)' });
      } catch (e) { /* ignore */ }
    });
  }

  return { h: h, clear: clear, $: $, rich: rich, touchWords: touchWords, icon: icon, pct: pct, plural: plural, dateShort: dateShort, dayKey: dayKey,
    clockText: clockText, evalText: evalText, rng: rng, pick: pick, shuffle: shuffle, debounce: debounce, sleep: sleep, uid: uid,
    winPct: winPct, sound: sound, copyText: copyText, saveFile: saveFile, canSaveFile: canSaveFile, readFile: readFile, framed: framed,
    calm: calm, glide: glide };
})();
