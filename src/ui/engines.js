/* Tempo engines: the built-in engine in a worker, Stockfish (embedded, or the site's builds), and one analysis interface. */
var Engines = (function () {
  'use strict';
  var C = TempoCore;

  function scriptText(id) { var el = document.getElementById(id); return el ? el.textContent : ''; }

  /* ---------- built-in engine ---------- */
  var tw = null, seq = 0, waiting = {}, inline = false, answered = false;

  /* When workers are blocked the engine runs on the page, where every search freezes it. Each search is capped
     at INLINE_MS, searches run one at a time with a pause between them so taps and paints get through, and
     searches queued for a screen that was left are skipped. */
  var INLINE_MS = 700, inlineChain = Promise.resolve(), inlineGen = 0;
  function inlineMsg(msg) {
    var m = Object.assign({}, msg);
    if (m.cmd === 'bot') {
      var cfg = Object.assign({}, m.cfg || {});
      // weak bots score every move at a fixed depth of 4 or less (well under 100 ms); the rest search by time
      if (!(cfg.temp > 0 && (cfg.depth || 1) <= 4)) cfg.movetime = Math.min(cfg.movetime || INLINE_MS, INLINE_MS);
      m.cfg = cfg;
    } else if (m.cmd === 'analyse') {
      m.movetime = Math.min(m.movetime || INLINE_MS, INLINE_MS);
    } else if (m.cmd === 'scoremoves') {
      m.depth = Math.min(m.depth || 2, 4);
    }
    return m;
  }
  function runInline(msg) {
    var gen = inlineGen;
    var job = inlineChain.then(function () { return U.sleep(30); }).then(function () {
      if (gen !== inlineGen) return { error: 'stopped' };
      try { return TempoEngine.handle(inlineMsg(msg)); } catch (e) { return { error: String(e) }; }
    });
    inlineChain = job.then(null, function () { /* keep the queue going */ });
    return job;
  }
  function startTempo() {
    if (tw || inline) return;
    try {
      var src = scriptText('src-core') + '\n;\n' + scriptText('src-bots') + '\n;\n' + scriptText('src-engine');
      var url = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
      tw = new Worker(url);
      tw.onmessage = function (e) {
        answered = true;
        var d = e.data || {}, w = waiting[d.id];
        if (w) { delete waiting[d.id]; clearTimeout(w.timer); w.resolve(d); }
      };
      tw.onerror = function (e) {
        if (e.preventDefault) e.preventDefault();
        // a worker that never answered is blocked here: switch to running on the page
        if (!answered) inline = true;
        failTempo();
      };
    } catch (e) { inline = true; tw = null; }
  }
  function failTempo() {
    try { if (tw) tw.terminate(); } catch (e) { /* ignore */ }
    tw = null;
    Object.keys(waiting).forEach(function (k) {
      var w = waiting[k]; delete waiting[k]; clearTimeout(w.timer);
      if (inline) runInline(w.msg).then(w.resolve); else w.resolve({ error: 'engine restarted' });
    });
  }
  function tempo(msg) {
    startTempo();
    if (!tw) return runInline(msg);
    var id = ++seq; msg.id = id;
    var limit = (msg.movetime || 4000) + 25000;
    return new Promise(function (resolve) {
      waiting[id] = { msg: msg, resolve: resolve, timer: setTimeout(function () {
        // a worker that never answered anything is blocked without saying so: run on the page from now on
        if (!answered) inline = true;
        failTempo();
      }, limit) };
      tw.postMessage(msg);
    });
  }
  function resetTempo() { failTempo(); startTempo(); }

  /* ---------- Stockfish ----------
     Stockfish 19 (stockfish.js by Nathan Rugg). Three builds, all driven the same way (UCI over postMessage):
       embedded  the lite single-threaded build packed into this file: runs anywhere, no headers needed
       site      the lite multi-threaded build served beside the page (window.TEMPO_ENGINE), when the page is cross-origin
                 isolated so SharedArrayBuffer exists; uses the device's cores
       full      the full-strength build (94 MB), downloaded once on request from Preferences and kept in Cache Storage
     The loader takes the wasm's address in the worker URL's hash, so each build's wasm can come from a blob or the site. */
  var SF = { status: 'idle', worker: null, queue: [], cur: null, opts: { skill: 20, multipv: 1 }, readyP: null, kind: null, name: null, threads: 1 };
  var SITE = (typeof window !== 'undefined' && window.TEMPO_ENGINE) || null;   // { base, lite: { js, wasm }, full: { js, wasm: [parts], bytes } }
  var CACHE = 'tempo-engine', FULL_KEY = '/tempo-engine/full.wasm', dl = null;
  var statusFns = [];
  function setStatus(s) {
    if (SF.status === s) return;
    SF.status = s;
    statusFns.forEach(function (fn) { try { fn(s); } catch (e) { console.error(e); } });
  }
  function isolated() { return typeof SharedArrayBuffer !== 'undefined' && typeof window !== 'undefined' && window.crossOriginIsolated === true; }
  function threadsFor(kind) { return kind === 'embedded' ? 1 : Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 2) - 1)); } // a few cores, never all: the page stays smooth
  function hashFor(kind) { return kind === 'full' ? 64 : kind === 'site' ? 32 : 16; }
  function fullWanted() { return !!(SITE && SITE.full && Store.state.settings.fullEngine); }
  function cacheOk() { return typeof caches !== 'undefined' && typeof window !== 'undefined' && window.isSecureContext; }

  /* Start a worker for one build. Resolves true once it has answered readyok, false if it couldn't (and leaves nothing running). */
  function startWorker(kind, jsUrl, wasmUrl, limitMs) {
    return new Promise(function (resolve) {
      var w, done = false;
      function fail() { if (done) return; done = true; clearTimeout(t); try { w.terminate(); } catch (e) { /* ignore */ } resolve(false); }
      try { w = new Worker(jsUrl + '#' + encodeURIComponent(wasmUrl)); } catch (e) { resolve(false); return; }
      var t = setTimeout(fail, limitMs);
      w.onerror = function (e) { if (e.preventDefault) e.preventDefault(); fail(); };
      w.onmessage = function (e) {
        var line = String(e.data);
        if (line.indexOf('id name ') === 0) SF.name = line.slice(8).trim();
        else if (line.indexOf('uciok') === 0) {
          var th = threadsFor(kind);
          w.postMessage('setoption name Hash value ' + hashFor(kind));
          if (th > 1) w.postMessage('setoption name Threads value ' + th);
          w.postMessage('isready');
          SF.threads = th;
        } else if (line.indexOf('readyok') === 0) {
          if (done) return;
          done = true; clearTimeout(t);
          SF.worker = w; SF.kind = kind; SF.opts = { skill: 20, multipv: 1 };
          w.onmessage = sfLine; w.onerror = function (ev) { if (ev.preventDefault) ev.preventDefault(); sfDead(); };
          resolve(true);
        }
      };
      w.postMessage('uci');
    });
  }
  function b64FromBytes(bytes) {
    var parts = [], CH = 0x8000;
    for (var i = 0; i < bytes.length; i += CH) parts.push(String.fromCharCode.apply(null, bytes.subarray(i, i + CH)));
    return btoa(parts.join(''));
  }
  /* The embedded build: the wasm goes into the worker's script as bytes, and the worker's fetch hands them over when
     the loader asks for the address in the hash (a page opened from a file can't fetch a blob from a worker). */
  var EMBEDDED_WASM = 'tempo-embedded.wasm';
  function embedded() {
    return Promise.all([TempoInflate.unpackText(scriptText('d-sfjs')), TempoInflate.unpackBytes(scriptText('d-sfwasm'))]).then(function (res) {
      var src = 'self.__SFWASM=(function(b){var s=atob(b),u=new Uint8Array(s.length);for(var i=0;i<s.length;i++)u[i]=s.charCodeAt(i);return u;})("' + b64FromBytes(res[1]) + '");\n' +
        'self.__fetch=self.fetch;self.fetch=function(u,o){if(String(u).indexOf("' + EMBEDDED_WASM + '")>=0)return Promise.resolve(new Response(self.__SFWASM,{headers:{"Content-Type":"application/wasm"}}));return self.__fetch.apply(self,arguments);};\n' + res[0];
      var js = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
      return startWorker('embedded', js, EMBEDDED_WASM, 20000);
    }, function () { return false; });
  }
  /* the site's files, as full addresses: the worker resolves a relative one against its own script, not the page */
  function siteUrl(name) { return new URL(SITE.base + name, location.href).href; }
  function site() {
    if (!SITE || !SITE.lite || !isolated()) return Promise.resolve(false);
    return startWorker('site', siteUrl(SITE.lite.js), siteUrl(SITE.lite.wasm), 20000);
  }
  /* the full engine's wasm, if it was downloaded to this device: a blob URL for it, or null */
  function fullUrl() {
    if (!cacheOk()) return Promise.resolve(null);
    return caches.open(CACHE).then(function (c) { return c.match(FULL_KEY); }).then(function (r) { return r ? r.blob() : null; })
      .then(function (b) { return b ? URL.createObjectURL(b) : null; }, function () { return null; });
  }
  function full() {
    if (!fullWanted() || !isolated()) return Promise.resolve(false);
    return fullUrl().then(function (url) { return url ? startWorker('full', siteUrl(SITE.full.js), url, 60000) : false; });
  }
  function sfInit() {
    if (SF.readyP) return SF.readyP;
    setStatus('loading');
    SF.readyP = full().then(function (ok) { return ok || site(); }).then(function (ok) { return ok || embedded(); })
      .then(function (ok) { setStatus(ok ? 'ready' : 'failed'); return ok; }, function () { setStatus('failed'); return false; });
    return SF.readyP;
  }
  /* stop the engine and start again (after the full engine was downloaded or switched off); searches in flight resolve null */
  function restart() { sfDead(); SF.readyP = null; return sfInit(); }

  /* Download the full engine (its wasm, in parts) and keep it in Cache Storage. progress(doneBytes, totalBytes).
     Resolves true when it's stored; false (with nothing kept) when it couldn't be. Only one download runs at a time. */
  function downloadFull(progress) {
    if (dl) return dl;
    if (!SITE || !SITE.full || !cacheOk()) return Promise.resolve(false);
    var parts = SITE.full.wasm.slice(), total = SITE.full.bytes || 0, got = 0, bufs = [];
    function next() {
      if (!parts.length) return Promise.resolve(true);
      return fetch(siteUrl(parts.shift()), { credentials: 'same-origin' }).then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        var reader = r.body && r.body.getReader ? r.body.getReader() : null;
        if (!reader) return r.arrayBuffer().then(function (ab) { bufs.push(new Uint8Array(ab)); got += ab.byteLength; if (progress) progress(got, total); });
        var chunks = [];
        return (function pump() {
          return reader.read().then(function (x) {
            if (x.done) { bufs.push.apply(bufs, chunks); return; }
            chunks.push(x.value); got += x.value.byteLength; if (progress) progress(got, total);
            return pump();
          });
        })();
      }).then(next);
    }
    dl = next().then(function () {
      var blob = new Blob(bufs, { type: 'application/wasm' });
      bufs = null;
      return caches.open(CACHE).then(function (c) { return c.put(FULL_KEY, new Response(blob, { headers: { 'Content-Type': 'application/wasm', 'Content-Length': String(blob.size) } })); })
        .then(function () { return true; });
    }).catch(function (e) { console.error(e); return false; }).then(function (ok) { dl = null; return ok; });
    return dl;
  }
  function hasFull() {
    if (!cacheOk()) return Promise.resolve(false);
    return caches.open(CACHE).then(function (c) { return c.match(FULL_KEY); }).then(function (r) { return !!r; }, function () { return false; });
  }
  function removeFull() {
    if (!cacheOk()) return Promise.resolve(false);
    return caches.open(CACHE).then(function (c) { return c.delete(FULL_KEY); }).catch(function () { return false; });
  }
  function sfDead() {
    setStatus('failed');
    try { if (SF.worker) SF.worker.terminate(); } catch (e) { /* ignore */ }
    SF.worker = null; SF.kind = null;
    if (SF.cur) { clearTimeout(SF.cur.timer); SF.cur.resolve(null); SF.cur = null; }
    SF.queue.forEach(function (j) { j.resolve(null); }); SF.queue = [];
  }
  var MV_RE = /^[a-h][1-8][a-h][1-8][qrbn]?$/;
  function sfLine(e) {
    var line = String(e.data), j = SF.cur;
    if (!j) return;
    if (line.indexOf('info ') === 0 && line.indexOf(' pv ') > 0) {
      if (/ (lowerbound|upperbound) /.test(line)) return;
      var mp = /multipv (\d+)/.exec(line), k = mp ? +mp[1] : 1;
      var d = /\bdepth (\d+)/.exec(line), cp = /score cp (-?\d+)/.exec(line), mt = /score mate (-?\d+)/.exec(line);
      var pv = line.split(' pv ')[1].trim().split(/\s+/).filter(function (t) { return MV_RE.test(t); });
      j.lines[k] = { depth: d ? +d[1] : 0, cp: cp ? +cp[1] : null, mate: mt ? +mt[1] : null, pv: pv };
      if (j.onInfo) j.onInfo(j.lines);
    } else if (line.indexOf('bestmove') === 0) {
      clearTimeout(j.timer);
      var best = line.split(/\s+/)[1];
      var lines = Object.keys(j.lines).sort(function (a, b) { return a - b; }).map(function (k2) { return j.lines[k2]; });
      SF.cur = null;
      j.resolve({ best: MV_RE.test(best) ? best : (lines[0] && lines[0].pv[0]) || null, lines: lines, engine: 'stockfish' });
      sfNext();
    }
  }
  function sfNext() {
    if (SF.cur || !SF.queue.length || !SF.worker) return;
    var j = SF.queue.shift(), w = SF.worker;
    SF.cur = j; j.lines = {};
    if (j.cancelled) { SF.cur = null; j.resolve(null); sfNext(); return; }
    var skill = j.skill == null ? 20 : j.skill, mpv = j.multipv || 1;
    if (skill !== SF.opts.skill) { w.postMessage('setoption name Skill Level value ' + skill); SF.opts.skill = skill; }
    if (mpv !== SF.opts.multipv) { w.postMessage('setoption name MultiPV value ' + mpv); SF.opts.multipv = mpv; }
    if (j.newGame) w.postMessage('ucinewgame');
    w.postMessage('position fen ' + (j.fen || C.START_FEN) + (j.moves && j.moves.length ? ' moves ' + j.moves.join(' ') : ''));
    var go = 'go';
    if (j.depth) go += ' depth ' + j.depth;
    if (j.movetime) go += ' movetime ' + j.movetime;
    if (!j.depth && !j.movetime) go += ' depth 12';
    w.postMessage(go);
    j.timer = setTimeout(function () { sfDead(); }, (j.movetime || 6000) + 20000);
  }
  function sfRun(job) {
    return new Promise(function (resolve) {
      job.resolve = resolve;
      SF.queue.push(job);
      sfNext();
    });
  }
  function sfStop() {
    SF.queue.forEach(function (j) { j.cancelled = true; });
    if (SF.cur && SF.worker) SF.worker.postMessage('stop');
  }

  /* ---------- one interface ---------- */
  function sfReady() { return SF.status === 'ready' && !!SF.worker; }

  /* opts: fen (start), moves (uci list), depth, movetime, multipv. Scores are from the side to move. */
  function analyse(opts) {
    if (sfReady()) {
      // newGame clears Stockfish's memory first, so one review isn't colored by the searches before it
      var job = { fen: opts.fen, moves: opts.moves, depth: opts.depth || 0, movetime: opts.movetime || 0, multipv: opts.multipv || 1, skill: 20, onInfo: opts.onInfo, newGame: !!opts.newGame };
      return sfRun(job).then(function (r) {
        if (r) return r;
        // a search canceled because you left the screen has no one waiting for it: don't redo it on the built-in engine
        if (job.cancelled) return { best: null, lines: [], engine: 'none', cancelled: true };
        return tempoAnalyse(opts);
      });
    }
    return tempoAnalyse(opts);
  }
  function tempoAnalyse(opts) {
    var depth = opts.depth ? Math.min(opts.depth, opts.fast ? 7 : 11) : 0;
    if (opts.multipv && opts.multipv > 1) {
      return tempo({ cmd: 'scoremoves', fen: opts.fen, moves: opts.moves, depth: Math.min(4, depth || 4) }).then(function (r) {
        var list = (r.list || []).slice(0, opts.multipv);
        return { best: list[0] ? list[0].move : null, engine: 'tempo', lines: list.map(function (x) { return toLine(x.score, [x.move], 4); }) };
      });
    }
    return tempo({ cmd: 'analyse', fen: opts.fen, moves: opts.moves, depth: depth || 0, movetime: opts.movetime || (depth ? 0 : 600) }).then(function (r) {
      if (!r || r.error) return { best: null, lines: [], engine: 'tempo' };
      var line = toLine(r.score, r.pv || [], r.depth);
      return { best: r.best, lines: [line], engine: 'tempo' };
    });
  }
  function toLine(score, pv, depth) {
    var M = TempoEngine.MATE, MB = TempoEngine.MATE_BOUND;
    if (Math.abs(score) > MB) { var n = Math.ceil((M - Math.abs(score)) / 2); return { cp: null, mate: score > 0 ? n : -n, pv: pv, depth: depth }; }
    return { cp: score, mate: null, pv: pv, depth: depth };
  }

  /* ---------- the characters' moves ----------
     A character's move comes from its opening book, from Stockfish (the Masters and Legends, where it runs), or from
     the built-in engine. Each answer says where it came from and how the engine scored it, for the dialogue and the
     log. game: { fen (start), moves (uci), sans }; ctx: { last (its previous move), surge }. */
  var LOG = [], LOG_MAX = 60;
  function logIt(x) { LOG.push(x); if (LOG.length > LOG_MAX) LOG.shift(); }
  function tempoChoose(bot, game, cfg, ctx) {
    var seed = Math.floor(Math.random() * 1e9), t0 = Date.now();
    return tempo({ cmd: 'bot', fen: game.fen, moves: game.moves, cfg: cfg, seed: seed, ctx: { last: ctx.last || null } }).then(function (r) {
      if (!r || !r.move) return null;
      logIt({ bot: bot.id, ply: game.moves.length, via: 'tempo', kind: r.kind, move: r.move, score: r.score, best: r.best, top: r.top, seed: seed, ms: Date.now() - t0 });
      return { uci: r.move, via: 'tempo', kind: r.kind, score: r.score, best: r.best, top: r.top || null };
    });
  }
  /* Stockfish analyzes several moves at full skill; TempoBots.sfPick chooses among them for the character */
  function sfChoose(bot, game, st, ctx) {
    var t0 = Date.now();
    return sfRun({ fen: game.fen, moves: game.moves, depth: st.depth || 0, movetime: st.movetime, skill: 20, multipv: st.multipv }).then(function (r) {
      if (!r || !r.lines || !r.lines.length) return null;
      var pick = TempoBots.sfPick(bot, TempoEngine.posFrom(game.fen, game.moves), r.lines, Math.random, ctx.last);
      if (!pick) return null;
      logIt({ bot: bot.id, ply: game.moves.length, via: 'stockfish', kind: pick.kind, move: pick.uci, score: pick.score, best: pick.best, mate: pick.mate, cands: pick.cands, ms: Date.now() - t0 });
      // gap: how much better Stockfish's best move was than its second (for a character's line about the only good move)
      var cs = pick.cands || [], gap = cs.length > 1 ? Math.min(1000, cs[0].score - cs[1].score) : null;
      return { uci: pick.uci, via: 'stockfish', kind: pick.kind, score: pick.score, best: pick.best, mate: pick.mate, top: cs[0] ? cs[0].uci : null, gap: gap };
    });
  }
  function botDecide(bot, game, ctx) {
    ctx = ctx || {};
    var cfg = bot.cfg || {};
    if (!cfg.persona) return legacyDecide(bot, game);
    var plan = TempoBots.plan(bot, game, Math.random, { sfReady: sfReady(), surge: ctx.surge });
    if (plan.book) {
      var p = TempoEngine.posFrom(game.fen, game.moves), m = p.parseMove(plan.book);
      if (m) { logIt({ bot: bot.id, ply: game.moves.length, via: 'book', move: plan.book }); return Promise.resolve({ uci: C.uci(m), via: 'book', kind: 'book' }); }
      plan = { tempo: cfg };
    }
    if (plan.sf) return sfChoose(bot, game, plan.sf, ctx).then(function (r) { return r || tempoChoose(bot, game, cfg, ctx); });
    return tempoChoose(bot, game, plan.tempo, ctx);
  }
  /* the original ladder bots, kept as they were */
  function legacyDecide(bot, game) {
    var cfg = bot.cfg || {};
    if (cfg.book && (game.fen || C.START_FEN) === C.START_FEN && game.sans.length < 16) {
      var bm = TempoBots.bookMove(game.sans.map(function (s) { return s.replace(/[+#]/g, ''); }), cfg.book, Math.random);
      if (bm) {
        var p = TempoEngine.posFrom(game.fen, game.moves), m = p.parseMove(bm);
        if (m) return Promise.resolve({ uci: C.uci(m), via: 'book' });
      }
    }
    var viaTempo = function () { return tempo({ cmd: 'bot', fen: game.fen, moves: game.moves, cfg: cfg, seed: Math.floor(Math.random() * 1e9) }).then(function (x) { return x && x.move ? { uci: x.move, via: 'tempo' } : null; }); };
    if (bot.sf && bot.sf.skill != null && sfReady()) {
      return sfRun({ fen: game.fen, moves: game.moves, movetime: bot.sf.movetime, skill: bot.sf.skill, multipv: 1 }).then(function (r) { return r && r.best ? { uci: r.best, via: 'stockfish' } : viaTempo(); });
    }
    return viaTempo();
  }
  /* Bot move as a UCI string (or null). game: { fen (start), moves (uci), sans }. */
  function botMove(bot, game) { return botDecide(bot, game, {}).then(function (r) { return r ? r.uci : null; }); }

  function stopAll() { sfStop(); inlineGen++; }

  return {
    init: function () { startTempo(); return sfInit(); },
    analyse: analyse, botMove: botMove, botDecide: botDecide, stopAll: stopAll, resetTempo: resetTempo,
    /* the last few move decisions, newest last: where each came from, the candidates and how they scored */
    log: function () { return LOG.slice(); },
    tempo: tempo,
    get strong() { return sfReady(); },
    get status() { return SF.status; },
    /* which Stockfish is running ('embedded', 'site' or 'full'), its name as it gave it, and its threads */
    get kind() { return SF.kind; },
    get name() { return SF.name; },
    get threads() { return SF.threads; },
    /* the site's engines: present when the page is served with them; usable only when the page is cross-origin isolated */
    get site() { return !!SITE; },
    isolated: isolated,
    fullSize: function () { return SITE && SITE.full ? SITE.full.bytes || 0 : 0; },
    hasFull: hasFull, downloadFull: downloadFull, removeFull: removeFull, restart: restart,
    get downloading() { return !!dl; },
    /* fn(status) runs whenever status changes: 'loading', 'ready' or 'failed' */
    onStatus: function (fn) { statusFns.push(fn); },
    get inline() { return inline; },
    INLINE_MS: INLINE_MS,
    sfReady: function () { return SF.readyP || sfInit(); }
  };
})();
