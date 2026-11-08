/* Tempo imports: games you played somewhere else, from a PGN (pasted, or a file) or straight from Chess.com, saved with
   your games. Once reviewed, their mistakes go into your practice and Your pattern, and they count in Progress. */
var Imports = (function () {
  'use strict';
  var h = U.h, C = TempoCore;
  var RESULTS = ['1-0', '0-1', '1/2-1/2'];

  /*net:chesscom*/
  /* Your recent games from Chess.com's public data (its monthly archives), newest first: [{ pgn, url, ts, tcl }].
     This block is cut out of the Game Lab's copy, which never goes on the network (its sync leaves ChessCom null). */
  var ChessCom = {
    recent: function (name, want) {
      var base = 'https://api.chess.com/pub/player/' + encodeURIComponent(name.toLowerCase()) + '/games/';
      function get(url) {
        return fetch(url).then(function (r) {
          if (r.status === 404) { var e = new Error('There’s no Chess.com player named ' + name + '.'); e.user = true; throw e; }
          if (!r.ok) throw new Error('Chess.com answered with an error (' + r.status + ').');
          return r.json();
        });
      }
      return get(base + 'archives').then(function (j) {
        var months = ((j && j.archives) || []).filter(function (u) { return typeof u === 'string' && u.toLowerCase().indexOf(base.toLowerCase()) === 0; }).slice(-3).reverse(), out = [];
        function month(i) {
          if (i >= months.length || out.length >= want) return out;
          return get(months[i]).then(function (m) {
            ((m && m.games) || []).slice().reverse().forEach(function (g) {
              if (g && typeof g.pgn === 'string' && (!g.rules || g.rules === 'chess')) out.push({ pgn: g.pgn, url: g.url, ts: g.end_time ? g.end_time * 1000 : null, tcl: g.time_class });
            });
            return month(i + 1);
          });
        }
        return month(0);
      }).then(function (list) { return list.slice(0, want); });
    }
  };
  /*net:end*/

  /* ---------- reading PGN ---------- */
  /* one text per game: a game ends where the next one's tags start, after its moves */
  function splitPgn(text) {
    var lines = String(text || '').replace(/\r\n?/g, '\n').split('\n'), games = [], cur = [], moved = false;
    lines.forEach(function (ln) {
      var tag = /^\s*\[\w+\s+"/.test(ln);
      if (tag && moved) { games.push(cur.join('\n')); cur = []; moved = false; }
      if (!tag && ln.trim()) moved = true;
      cur.push(ln);
    });
    if (cur.join('').trim()) games.push(cur.join('\n'));
    return games.map(function (g) { return g.trim(); }).filter(Boolean);
  }
  function same(a, b) { return !!a && !!b && String(a).trim().toLowerCase() === String(b).trim().toLowerCase(); }
  /* the name in every one of these games: yours, when there are a few of them */
  function commonName(heads) {
    if (heads.length < 2) return null;
    return [heads[0].White, heads[0].Black].filter(function (n) {
      return n && n !== '?' && heads.every(function (hd) { return same(hd.White, n) || same(hd.Black, n); });
    })[0] || null;
  }
  /* when the game ended (Chess.com's EndDate and EndTime are UTC), else when it started, else its date at noon */
  function pgnTime(hd) {
    function utc(d, t) {
      var m = /^(\d{4})\.(\d{2})\.(\d{2})$/.exec(d || ''), tm = /^(\d{1,2}):(\d{2}):(\d{2})/.exec(t || '');
      return m && tm ? Date.UTC(+m[1], +m[2] - 1, +m[3], +tm[1], +tm[2], +tm[3]) : null;
    }
    var at = utc(hd.EndDate, hd.EndTime) || utc(hd.UTCDate, hd.UTCTime);
    if (at) return at;
    var m = /^(\d{4})\.(\d{2})\.(\d{2})$/.exec(hd.Date || '');
    return m ? new Date(+m[1], +m[2] - 1, +m[3], 12).getTime() : null;
  }
  /* Chess.com's classes: under 3 minutes (with 40 moves' increment) bullet, under 10 blitz, then rapid; a day a move is daily */
  function timeClass(tc, site) {
    if (!tc) return null;
    if (/\//.test(tc)) return 'daily';
    var m = /^(\d+)(?:\+(\d+))?$/.exec(tc); if (!m) return null;
    var est = +m[1] + 40 * (+m[2] || 0);
    return est < 180 ? 'bullet' : est < 600 ? 'blitz' : site !== 'chesscom' && est >= 1500 ? 'classical' : 'rapid';
  }
  /* how it ended, in Tempo's words, from the Termination tag ("Croix181 won by checkmate", "Game drawn by repetition") */
  function reasonOf(hd, result) {
    var t = String(hd.Termination || '').toLowerCase();
    if (/checkmate/.test(t)) return 'checkmate';
    if (/resign/.test(t)) return 'resignation';
    if (/abandon/.test(t)) return 'abandoned';
    if (/stalemate/.test(t)) return 'stalemate';
    if (/repetition/.test(t)) return 'threefold repetition';
    if (/insufficient/.test(t)) return result === '1/2-1/2' ? 'insufficient material' : 'time';
    if (/agree/.test(t)) return 'agreement';
    if (/50|fifty/.test(t)) return 'fifty-move rule';
    if (/time|forfeit/.test(t)) return 'time';
    return null;
  }
  function elo(x) { return /^\d{1,4}$/.test(String(x || '')) ? +x : null; }
  /* a short, stable id from the game's address (or its players, date and moves), so the same game added on two devices
     is one game when they sync, and its mistakes keep the same ids */
  function hash(str) {
    var a = 0xdeadbeef, b = 0x41c6ce57;
    for (var i = 0; i < str.length; i++) { var c = str.charCodeAt(i); a = Math.imul(a ^ c, 2654435761); b = Math.imul(b ^ c, 1597334677); }
    a = Math.imul(a ^ (a >>> 16), 2246822507) ^ Math.imul(b ^ (b >>> 13), 3266489909);
    b = Math.imul(b ^ (b >>> 16), 2246822507) ^ Math.imul(a ^ (a >>> 13), 3266489909);
    return (4294967296 * (2097151 & b) + (a >>> 0)).toString(36);
  }
  var KEEP = ['Event', 'Site', 'Date', 'White', 'Black', 'Result', 'WhiteElo', 'BlackElo', 'TimeControl', 'Termination', 'ECO', 'UTCDate', 'UTCTime', 'Link'];
  /* A game record for Store.addGames, or { error } (needsSide: neither player is you and no side was chosen).
     opts: { name: your username, color: the side chosen when the name isn't in the game, url, ts, tcl: from Chess.com } */
  function toRecord(text, opts) {
    opts = opts || {};
    var parsed = C.parsePgn(text), hd = parsed.headers, fen = hd.FEN || C.START_FEN;
    if (C.validFen(fen)) return { error: 'its start position isn’t valid' };
    var r = C.replay(fen, parsed.sans);
    if (r.error) return { error: r.error.replace(/\.$/, '') };
    if (!r.moves.length) return { error: 'it has no moves' };
    var color = same(hd.White, opts.name) ? 'w' : same(hd.Black, opts.name) ? 'b' : opts.color || null;
    if (!color) return { error: 'neither player is you', needsSide: true };
    var result = RESULTS.indexOf(hd.Result) >= 0 ? hd.Result : '*', stt = r.pos.status();
    if (result === '*' && stt.over) result = stt.reason === 'checkmate' ? (stt.winner === 1 ? '1-0' : '0-1') : '1/2-1/2';
    var reason = stt.over && stt.reason ? stt.reason : reasonOf(hd, result);
    var url = [hd.Link, hd.Site, opts.url].filter(function (u) { return typeof u === 'string' && /^https:\/\/[^\s"<>]{1,200}$/.test(u); })[0] || null;
    var src = /chess\.com/i.test(hd.Site || '') || (url && /chess\.com\//i.test(url)) ? 'chesscom' : 'pgn';
    var key = url ? 'link:' + url : 'pgn:' + [hd.White || '', hd.Black || '', hd.Date || '', hd.UTCTime || '', result, parsed.sans.slice(0, 60).join(' ')].join('|');
    var tc = hd.TimeControl && /^[\d+/]{1,20}$/.test(hd.TimeControl) ? hd.TimeControl : null;
    var keep = {}; KEEP.forEach(function (k) { if (hd[k]) keep[k] = hd[k]; });
    return { rec: {
      id: 'x' + hash(key), ts: opts.ts || pgnTime(hd) || Date.now(), pgn: C.pgnFromMoves(keep, fen === C.START_FEN ? null : fen, r.moves),
      bot: null, color: color, result: result, reason: reason, plies: r.moves.length, rated: false, before: null, after: null,
      reviewed: false, acc: null, counts: null, src: src, opp: (color === 'w' ? hd.Black : hd.White) || 'Opponent',
      oppElo: elo(color === 'w' ? hd.BlackElo : hd.WhiteElo), myElo: elo(color === 'w' ? hd.WhiteElo : hd.BlackElo),
      tc: tc, tcl: ['bullet', 'blitz', 'rapid', 'daily'].indexOf(opts.tcl) >= 0 ? opts.tcl : timeClass(tc, src), link: url, key: key } };
  }

  /* ---------- adding them ---------- */
  function remember(name) {
    if (!name || Store.state.settings.chessName === name) return;
    Store.state.settings.chessName = name; Store.touch('settings');
  }
  /* one game: add it and open its review (which saves it); one already here just opens */
  function addOne(rec) {
    var res = Store.addGames([rec]), g = res.added[0] || res.dupes[0];
    if (g) { Review.openGame(g.id); return; }
    App.toast('That game is older than the 100 games Tempo keeps, so it was reviewed without saving.');
    Review.openPgn(rec.pgn, rec.color, rec.opp ? 'Game against ' + rec.opp : 'Imported game');
  }
  /* several: add them all and review them one after another */
  function addAll(recs) {
    var res = Store.addGames(recs);
    if (res.dropped.length) App.toast(U.plural(res.dropped.length, 'game') + ' older than the 100 games Tempo keeps ' + (res.dropped.length === 1 ? 'was' : 'were') + ' left out.');
    var ids = res.added.map(function (g) { return g.id; });
    if (ids.length) Review.openBatch(ids); else App.go('review');
  }
  /* the games found, newest first: tap one to add it and review it now, or add them all */
  function pick(recs, skipped, title) {
    var have = {};
    Store.state.games.list.forEach(function (g) { if (g.key) have[g.key] = g; });
    var fresh = recs.filter(function (r) { return !have[r.key]; });
    recs = recs.slice().sort(function (a, b) { return b.ts - a.ts; });
    App.sheet(function (box, api) {
      box.appendChild(h('h2', { class: 'imp-title' }, title));
      box.appendChild(h('p', { class: 'muted small' }, fresh.length ? (fresh.length === recs.length ? '' : U.plural(fresh.length, 'game') + ' you haven’t added yet. ') + 'Tap a game to add it and review it now.' : 'You’ve added all of these already. Tap one to open its review.'));
      if (fresh.length > 1) box.appendChild(h('button', { class: 'btn primary block', type: 'button', onclick: function () { api.close(); addAll(fresh); } },
        'Add all ' + fresh.length + ' and review them'));
      var list = h('div', { class: 'list imp-list' });
      recs.forEach(function (r) {
        var g = have[r.key];
        list.appendChild(h('button', { class: 'list-row', type: 'button', onclick: function () { api.close(); if (g) Review.openGame(g.id); else addOne(r); } },
          Review.gameAvatar(r), h('div', { class: 'grow' }, h('div', { style: { fontWeight: 700 } }, Review.gameTitle(r)), h('div', { class: 'muted small' }, Review.gameSub(r))),
          g ? h('span', { class: 'chip' + (g.reviewed ? ' green' : '') }, g.reviewed ? 'Reviewed' : 'Added') : null, U.icon('next')));
      });
      box.appendChild(list);
      if (skipped) box.appendChild(h('p', { class: 'muted small' }, U.plural(skipped, 'game') + ' couldn’t be read and ' + (skipped === 1 ? 'was' : 'were') + ' left out.'));
    });
  }
  /* records from game texts; when several games share one name and you haven't said your username, that name is yours */
  function records(texts, base) {
    var heads = texts.map(function (t) { return C.parsePgn(t).headers; }), name = base.name || commonName(heads);
    if (!base.name && name) remember(name);
    var recs = [], skipped = 0, noSide = 0;
    texts.forEach(function (t, i) {
      var r = toRecord(t, Object.assign({}, base, { name: name }, base.each ? base.each[i] : null));
      if (r.rec) recs.push(r.rec); else if (r.needsSide) noSide++; else skipped++;
    });
    return { recs: recs, skipped: skipped + noSide, name: name };
  }

  /* ---------- the card on the Review page ---------- */
  function card() {
    var S = Store.state, box = h('div', { class: 'card stack imp-card' });
    box.appendChild(h('h3', null, 'Add your games from Chess.com'));
    box.appendChild(h('p', { class: 'muted small' }, 'They’re saved with your games. Once they’re reviewed, their mistakes go into your practice, Your pattern and Progress.'));
    var msg = h('div', { class: 'feedback no', hidden: true, role: 'status' });
    function say(text, kind) { msg.className = 'feedback ' + (kind || 'no'); msg.textContent = text || ''; msg.hidden = !text; }
    var name = null;
    if (ChessCom) {
      name = h('input', { type: 'text', id: 'cc-name', class: 'input', value: S.settings.chessName || '', placeholder: 'Chess.com username',
        autocomplete: 'username', autocapitalize: 'none', spellcheck: 'false', 'aria-label': 'Your Chess.com username',
        onkeydown: function (e) { if (e.key === 'Enter') { e.preventDefault(); fetchGames(); } } });
      var get = h('button', { class: 'btn primary', type: 'button', id: 'cc-get', onclick: fetchGames }, U.icon('download'), 'Get my games');
      box.appendChild(h('div', { class: 'imp-get' }, name, get));
      box.appendChild(h('div', { class: 'label imp-or' }, 'Or paste a PGN'));
    }
    function fetchGames() {
      var n = name.value.trim();
      if (!/^[A-Za-z0-9_-]{3,40}$/.test(n)) { say('Type your Chess.com username first.'); name.focus(); return; }
      remember(n);
      get.disabled = true; say('Getting your games from Chess.com…', 'info');
      ChessCom.recent(n, 40).then(function (list) {
        get.disabled = false; say('');
        if (!list.length) { say('No games for ' + n + ' on Chess.com in the last three months.', 'info'); return; }
        var r = records(list.map(function (g) { return g.pgn; }), { name: n, each: list.map(function (g) { return { url: g.url, ts: g.ts, tcl: g.tcl }; }) });
        if (!r.recs.length) { say('Those games couldn’t be read.'); return; }
        pick(r.recs, r.skipped, 'Your recent games on Chess.com');
      }, function (e) {
        get.disabled = false;
        var inClaude = !!(window.claude && typeof window.claude.use === 'function');
        say(e && e.user ? e.message : inClaude ? 'This copy of Tempo, inside Claude, can’t reach Chess.com. Get my games works in Tempo on your website or in the Tempo file. Here, paste the PGN below.'
          : 'Tempo couldn’t reach Chess.com from here. On Chess.com, open the game, tap Share, copy the PGN, and paste it below.');
      });
    }
    var ta = h('textarea', { id: 'pgn-in', placeholder: '[Event "..."]\n1. e4 e5 2. Nf3 ...', 'aria-label': 'PGN' });
    var color = 'w', keep = true;
    var seg = Play.seg([['w', 'I played White'], ['b', 'I played Black']], 'w', function (v) { color = v; });
    var keepBox = h('input', { type: 'checkbox', id: 'pgn-keep', checked: true, onchange: function () { keep = keepBox.checked; } });
    box.appendChild(ta);
    box.appendChild(h('p', { class: 'muted small imp-side' }, 'Which side was yours? Tempo can tell from your username when it’s in the game.'));
    box.appendChild(seg);
    box.appendChild(h('label', { class: 'imp-keep', 'for': 'pgn-keep' }, keepBox, h('span', null, 'Save it with my games')));
    box.appendChild(msg);
    box.appendChild(h('div', { class: 'row' },
      h('button', { class: 'btn primary', type: 'button', id: 'pgn-go', onclick: fromText }, U.icon('analyze'), 'Add and review'),
      h('button', { class: 'btn quiet', type: 'button', onclick: function () { U.readFile('.pgn,.txt').then(function (t) { if (t) { ta.value = t; say(''); } }); } }, U.icon('upload'), 'Open file')));
    function fromText() {
      var text = ta.value.trim();
      if (!text) { say('Paste a PGN first.'); return; }
      var texts = splitPgn(text), you = (name && name.value.trim()) || S.settings.chessName || '';
      if (/^[A-Za-z0-9_-]{3,40}$/.test(you) && name) remember(you);
      if (texts.length > 1) {
        var r = records(texts, { name: you, color: color });
        if (!r.recs.length) { say('None of those games could be read.'); return; }
        say(''); pick(r.recs, r.skipped, U.plural(r.recs.length, 'game') + ' in this PGN');
        return;
      }
      var one = toRecord(texts[0] || text, { name: you, color: color });
      if (!one.rec) { say('That game couldn’t be read: ' + one.error + '.'); return; }
      say('');
      if (keep) addOne(one.rec);
      else { var hd = C.parsePgn(texts[0] || text).headers; Review.openPgn(one.rec.pgn, one.rec.color, (hd.White || 'White') + ' vs ' + (hd.Black || 'Black')); }
    }
    return box;
  }

  return { card: card, splitPgn: splitPgn, toRecord: toRecord, online: !!ChessCom, _records: records };
})();
