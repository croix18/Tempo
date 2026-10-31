/* Tempo storage: local first, synced to the viewer's private store when the page runs on claude.ai. */
var Store = (function () {
  'use strict';
  var KEY = 'tempo:v1';
  var SYNC = ['settings', 'play', 'puzzles', 'learn', 'openings', 'mistakes', 'days'];
  var listeners = [];

  function defaults() {
    return {
      v: 1,
      settings: { rev: 0, theme: 'system', board: 'tempo', sound: true, coords: true, dots: true, animate: true,
        autoQueen: false, coach: true, hanging: true, takebacks: true, unlockAll: false, clock: 'none', botChat: true, color: 'w' },
      play: { rev: 0, rating: 600, hist: [], bots: {}, unlocked: 0, lastBot: null },
      puzzles: { rev: 0, rating: 600, count: 0, solved: 0, hist: [], seen: '', themes: {}, streakBest: 0, rushBest: 0, daily: null },
      learn: { rev: 0, done: {}, last: null },
      openings: { rev: 0, srs: {}, lines: {} },
      mistakes: { rev: 0, items: [] },
      games: { rev: 0, list: [] },
      days: { rev: 0, map: {} },
      current: null
    };
  }

  var state = defaults();

  function readLocal() {
    try {
      var raw = localStorage.getItem(KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) { return null; }
  }
  function writeLocal() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* storage full or blocked */ }
  }
  var writeLocalSoon = U.debounce(writeLocal, 250);

  function fill(target, def) {
    // add any missing keys from defaults (forward-compatible with older saves)
    Object.keys(def).forEach(function (k) {
      if (target[k] === undefined) target[k] = def[k];
      else if (def[k] && typeof def[k] === 'object' && !Array.isArray(def[k]) && target[k] && typeof target[k] === 'object' && k !== 'map' && k !== 'bots' && k !== 'done' && k !== 'srs' && k !== 'lines' && k !== 'themes') fill(target[k], def[k]);
    });
    return target;
  }

  function init() {
    var saved = readLocal();
    if (saved && saved.v === 1) state = fill(saved, defaults());
    connectRemote();
  }

  function emit(what) { listeners.forEach(function (fn) { try { fn(what); } catch (e) { console.error(e); } }); }
  function on(fn) { listeners.push(fn); }

  function touch(section) {
    if (section && state[section] && typeof state[section] === 'object') state[section].rev = Date.now();
    noteDay();
    writeLocalSoon();
    if (section && (SYNC.indexOf(section) >= 0 || section === 'games')) scheduleRemote(section === 'games' ? 'games' : 'profile');
  }
  function noteDay() { /* activity is recorded explicitly through activity() */ }
  function activity(kind) {
    var k = U.dayKey(), d = state.days.map[k] || (state.days.map[k] = { g: 0, p: 0, l: 0 });
    d[kind] = (d[kind] || 0) + 1;
    var keys = Object.keys(state.days.map).sort();
    while (keys.length > 400) delete state.days.map[keys.shift()];
    touch('days');
  }
  function streak() {
    var map = state.days.map, n = 0, d = new Date();
    if (!map[U.dayKey(d)]) d.setDate(d.getDate() - 1); // today not started yet: count from yesterday
    while (map[U.dayKey(d)]) { n++; d.setDate(d.getDate() - 1); }
    return n;
  }

  /* ---------- puzzle seen bitset ---------- */
  function seenBits() {
    var s = state.puzzles.seen || '', bytes;
    try { var bin = atob(s); bytes = new Uint8Array(Math.max(bin.length, 1200)); for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i); }
    catch (e) { bytes = new Uint8Array(1200); }
    return bytes;
  }
  function saveBits(bytes) {
    var bin = '';
    for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    state.puzzles.seen = btoa(bin);
  }
  function orBits(a, b) {
    var x, y;
    try { x = atob(a || ''); } catch (e) { x = ''; }
    try { y = atob(b || ''); } catch (e) { y = ''; }
    var n = Math.max(x.length, y.length), out = '';
    for (var i = 0; i < n; i++) out += String.fromCharCode((x.charCodeAt(i) || 0) | (y.charCodeAt(i) || 0));
    return btoa(out);
  }

  /* ---------- remote sync (claude.ai only) ---------- */
  var remote = null, writing = Promise.resolve(), pending = {}, lastSent = { profile: '', games: '' };
  var scheduleRemote = function (doc) { pending[doc] = true; flushSoon(); };
  var flushSoon = U.debounce(flush, 2000);

  function profilePayload() {
    var out = { v: 1 };
    SYNC.forEach(function (k) { out[k] = state[k]; });
    return JSON.parse(JSON.stringify(out));
  }
  function gamesPayload() { return JSON.parse(JSON.stringify(state.games)); }

  function flush() {
    if (!remote) return;
    var docs = Object.keys(pending); pending = {};
    docs.forEach(function (doc) {
      writing = writing.then(function () {
        var body = doc === 'games' ? gamesPayload() : profilePayload();
        var text = JSON.stringify(body);
        if (text === lastSent[doc]) return;
        if (text.length > 240000) { trimForRemote(doc); body = doc === 'games' ? gamesPayload() : profilePayload(); text = JSON.stringify(body); }
        return (doc === 'games' ? remote.games : remote.profile).set(body).then(function () { lastSent[doc] = text; }, function (e) {
          if (e && (e.code === 'revoked' || e.code === 'not_granted' || e.code === 'invalid_argument' || e.code === 'capability_disabled')) remote = null;
        });
      });
    });
  }
  function trimForRemote(doc) {
    if (doc === 'games') { while (JSON.stringify(state.games).length > 230000 && state.games.list.length > 10) state.games.list.pop(); }
    else {
      state.puzzles.hist = state.puzzles.hist.slice(-300);
      state.play.hist = state.play.hist.slice(-300);
      state.mistakes.items = state.mistakes.items.slice(0, 150);
    }
  }

  function mergeProfile(r) {
    if (!r || typeof r !== 'object') return false;
    var changed = false, localNewer = false;
    SYNC.forEach(function (k) {
      var rv = r[k], lv = state[k];
      if (!rv || typeof rv !== 'object') { if (lv && lv.rev) localNewer = true; return; }
      var rRev = rv.rev || 0, lRev = (lv && lv.rev) || 0;
      if (k === 'learn') {
        var done = Object.assign({}, rv.done || {});
        Object.keys(lv.done || {}).forEach(function (id) {
          var a = lv.done[id], b = done[id];
          if (!b || (a.stars || 0) > (b.stars || 0)) done[id] = a;
        });
        var merged = { rev: Math.max(rRev, lRev), done: done, last: rRev > lRev ? rv.last : lv.last };
        if (JSON.stringify(merged.done) !== JSON.stringify(lv.done) || merged.last !== lv.last) changed = true;
        if (JSON.stringify(merged.done) !== JSON.stringify(rv.done || {})) localNewer = true;
        state.learn = merged;
        return;
      }
      if (k === 'days') {
        var map = Object.assign({}, rv.map || {});
        Object.keys(lv.map || {}).forEach(function (d) {
          var a = lv.map[d], b = map[d];
          if (!b) { map[d] = a; localNewer = true; return; }
          map[d] = { g: Math.max(a.g || 0, b.g || 0), p: Math.max(a.p || 0, b.p || 0), l: Math.max(a.l || 0, b.l || 0) };
        });
        if (JSON.stringify(map) !== JSON.stringify(lv.map)) changed = true;
        state.days = { rev: Math.max(rRev, lRev), map: map };
        return;
      }
      if (k === 'mistakes') {
        var byId = {};
        (rv.items || []).forEach(function (it) { byId[it.id] = it; });
        (lv.items || []).forEach(function (it) { var o = byId[it.id]; if (!o || (it.seen || 0) > (o.seen || 0)) byId[it.id] = it; });
        var items = Object.keys(byId).map(function (id) { return byId[id]; }).filter(function (it) { return !it.gone; });
        items.sort(function (a, b) { return b.ts - a.ts; });
        items = items.slice(0, 200);
        if (JSON.stringify(items) !== JSON.stringify(lv.items)) changed = true;
        if (JSON.stringify(items) !== JSON.stringify(rv.items || [])) localNewer = true;
        state.mistakes = { rev: Math.max(rRev, lRev), items: items };
        return;
      }
      if (rRev > lRev) {
        if (k === 'puzzles') rv = Object.assign({}, rv, { seen: orBits(rv.seen, lv.seen) });
        state[k] = fill(rv, defaults()[k]);
        changed = true;
      } else if (lRev > rRev) localNewer = true;
      else if (k === 'puzzles' && rv.seen !== lv.seen) { lv.seen = orBits(rv.seen, lv.seen); localNewer = true; }
    });
    if (localNewer) scheduleRemote('profile');
    return changed;
  }
  function mergeGames(r) {
    if (!r || !Array.isArray(r.list)) return false;
    var byId = {}, changed = false;
    r.list.forEach(function (g) { byId[g.id] = g; });
    var localExtra = false;
    state.games.list.forEach(function (g) {
      var o = byId[g.id];
      if (!o) { byId[g.id] = g; localExtra = true; }
      else if ((g.reviewed && !o.reviewed)) { byId[g.id] = g; localExtra = true; }
    });
    var list = Object.keys(byId).map(function (id) { return byId[id]; }).sort(function (a, b) { return b.ts - a.ts; }).slice(0, 100);
    if (JSON.stringify(list) !== JSON.stringify(state.games.list)) changed = true;
    state.games = { rev: Math.max(r.rev || 0, state.games.rev || 0), list: list };
    if (localExtra) scheduleRemote('games');
    return changed;
  }

  function connectRemote() {
    var C = window.claude;
    if (!C || typeof C.use !== 'function') return;
    Promise.all([C.use('user'), C.use('db')]).then(function (res) {
      var user = res[0], db = res[1];
      if (!user || !db) return;
      return user.id().then(function (id) {
        if (!id) return;
        var base = 'data/users/' + id + '/';
        remote = { profile: db.doc(base + 'profile'), games: db.doc(base + 'games') };
        remote.profile.onSnapshot(function (snap) {
          if (!snap.exists) { if (!snap.metadata || !snap.metadata.fromCache) scheduleRemote('profile'); return; }
          if (snap.metadata && snap.metadata.hasPendingWrites) return;
          var data = snap.data();
          lastSent.profile = JSON.stringify(data);
          if (mergeProfile(data)) { writeLocal(); emit('remote'); }
        }, function () { remote = null; });
        remote.games.onSnapshot(function (snap) {
          if (!snap.exists) { if (state.games.list.length && (!snap.metadata || !snap.metadata.fromCache)) scheduleRemote('games'); return; }
          if (snap.metadata && snap.metadata.hasPendingWrites) return;
          var data = snap.data();
          lastSent.games = JSON.stringify(data);
          if (mergeGames(data)) { writeLocal(); emit('remote'); }
        }, function () { /* games sync unavailable */ });
      });
    }).catch(function () { remote = null; });
  }

  /* ---------- backup ---------- */
  function exportJson() {
    var copy = JSON.parse(JSON.stringify(state));
    copy.current = null;
    copy.exported = new Date().toISOString();
    return JSON.stringify(copy);
  }
  function importJson(text) {
    var obj;
    try { obj = JSON.parse(text); } catch (e) { return 'That doesn’t look like a Tempo backup.'; }
    if (!obj || obj.v !== 1 || !obj.settings || !obj.play) return 'That doesn’t look like a Tempo backup.';
    var now = Date.now();
    state = fill(obj, defaults());
    SYNC.concat(['games']).forEach(function (k) { if (state[k]) state[k].rev = now; });
    state.current = null;
    writeLocal();
    scheduleRemote('profile'); scheduleRemote('games');
    emit('import');
    return null;
  }
  function reset() {
    var keepSettings = state.settings;
    state = defaults();
    state.settings = keepSettings;
    var now = Date.now();
    SYNC.concat(['games']).forEach(function (k) { if (state[k]) state[k].rev = now; });
    writeLocal();
    scheduleRemote('profile'); scheduleRemote('games');
    emit('reset');
  }
  function synced() { return !!remote; }

  return {
    init: init, on: on, touch: touch, activity: activity, streak: streak,
    get state() { return state; },
    seenBits: seenBits, saveBits: saveBits,
    exportJson: exportJson, importJson: importJson, reset: reset, synced: synced,
    saveNow: function () { writeLocal(); flush(); }
  };
})();
