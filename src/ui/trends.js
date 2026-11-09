/* Tempo trends: how you play, game after game. A tab of Progress.
   Everything here comes from your saved games, the ones against the characters and the ones you added: how they ended,
   their reviews, and the few numbers each review keeps (Review's factsOf: accuracy by phase, the best and worst the game
   got for you, when your serious mistakes came and what kind they were). One filter row scopes every card. Each chart
   answers hover, tap and the keyboard, opens a game's review from its mark, and has its numbers in a table too. */
var Trends = (function () {
  'use strict';
  var h = U.h, C = TempoCore, NS = 'http://www.w3.org/2000/svg';
  // the filter, kept while Tempo is open: whose games, and how many of the newest (0: all of them)
  var F = { src: 'all', range: 0 };
  var openingMemo = {};    // a game's opening, worked out once: id and PGN length -> { name, family } or null
  var KIND_NAMES = { x: ['blunder', 'blunders'], m: ['mistake', 'mistakes'], i: ['inaccuracy', 'inaccuracies'] };

  /* ---------- the games ---------- */
  function scoreOf(g) {
    if (g.result === '1/2-1/2') return 0.5;
    if (g.result === '1-0') return g.color === 'w' ? 1 : 0;
    if (g.result === '0-1') return g.color === 'b' ? 1 : 0;
    return null;
  }
  function outcome(g) { var s = scoreOf(g); return s == null ? null : s === 1 ? 'w' : s === 0 ? 'l' : 'd'; }
  function isAdded(g) { return !g.bot && !!g.src; }
  function reviewed(g) { return g.reviewed && g.acc != null; }
  function kinds(g) { var c = g.counts || {}; return { x: c.blunder || 0, m: (c.mistake || 0) + (c.miss || 0), i: c.inaccuracy || 0 }; }
  function mean(xs) { return xs.length ? xs.reduce(function (s, x) { return s + x; }, 0) / xs.length : null; }
  function pct(x) { return Math.round(100 * x) + '%'; }
  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
  /* the finished games the filter covers, oldest first; a source with no games falls back to all of them */
  function pick() {
    var all = Store.state.games.list.filter(function (g) { return outcome(g); });
    var bots = all.some(function (g) { return !!g.bot; }), adds = all.some(isAdded);
    var src = (F.src === 'bots' && !bots) || (F.src === 'added' && !adds) ? 'all' : F.src;
    var list = all.filter(function (g) { return src === 'all' || (src === 'bots' ? !!g.bot : isAdded(g)); })
      .sort(function (a, b) { return a.ts - b.ts; });
    if (F.range) list = list.slice(-F.range);
    var fromCC = all.filter(isAdded).every(function (g) { return g.src === 'chesscom'; });
    return { list: list, bots: bots, adds: adds, src: src, addedName: fromCC ? 'Chess.com' : 'Added games' };
  }
  /* the newest k against the k before them: k is 10, or half of what there is; null below three each */
  function windows(xs) {
    var k = Math.min(10, Math.floor(xs.length / 2));
    return k < 3 ? null : { now: xs.slice(-k), before: xs.slice(-2 * k, -k), k: k };
  }
  /* your rating and theirs for a game, when both are known (a character's game: your rating then, from your history) */
  function ratingsOf(g) {
    if (g.bot) {
      var b = TempoBots.find(g.bot); if (!b) return null;
      if (g.before != null) return [g.before, b.rating];
      var hist = Store.state.play.hist, mine = null;
      for (var i = 0; i < hist.length && hist[i][0] <= g.ts; i++) mine = hist[i][1];
      return mine == null ? null : [mine, b.rating];
    }
    return g.myElo && g.oppElo ? [g.myElo, g.oppElo] : null;
  }
  function openingOf(g, map) {
    var key = g.id + ':' + g.pgn.length;
    if (key in openingMemo) return openingMemo[key];
    var o = null, gm = map && map.size ? Review.gameMoves(g) : null;
    if (gm && gm.fen === C.START_FEN) {
      var pos = new C.Pos(gm.fen), epds = [];
      for (var i = 0; i < gm.moves.length && i < 24; i++) { pos.make(pos.parseMove(gm.moves[i])); epds.push(epdOf(pos)); }
      var hit = openingFor(map, epds);
      if (hit && hit.name) o = { name: hit.name.replace(/'/g, '’'), family: hit.name.split(':')[0].trim().replace(/'/g, '’') };
    }
    return (openingMemo[key] = o);
  }

  /* ---------- small pieces ---------- */
  function svg(tag, attrs, parent) {
    var el = document.createElementNS(NS, tag);
    Object.keys(attrs || {}).forEach(function (k) { if (attrs[k] != null) el.setAttribute(k, attrs[k]); });
    if (parent) parent.appendChild(el);
    return el;
  }
  function card(title, note) {
    var el = h('section', { class: 'card stack tr-card', 'aria-label': title });
    el.appendChild(h('div', { class: 'tr-card-head' }, h('h3', null, title), note ? h('span', { class: 'faint small' }, note) : null));
    return el;
  }
  /* "Up 4 points from your 10 games before" in green, worse in coral, small changes as about the same; null: no compare */
  function delta(now, before, k, opts) {
    if (now == null || before == null) return null;
    var d = now - before;
    if (Math.abs(d) < opts.same) return h('span', { class: 'tr-delta same' }, 'About the same as the ' + k + ' before');
    var up = d > 0, good = up === opts.upIsGood;
    return h('span', { class: 'tr-delta ' + (good ? 'good' : 'bad') }, h('span', { class: 'tr-arrow', 'aria-hidden': 'true' }, up ? '▲' : '▼'),
      (up ? 'Up ' : 'Down ') + opts.fmt(Math.abs(d)) + ' from the ' + k + ' before');
  }
  function tile(label, value, sub, d) {
    return h('div', { class: 'stat tr-stat' }, h('span', { class: 'label' }, label), h('b', null, value), d, h('span', { class: 'faint small' }, sub));
  }
  /* a thin bar of wins, draws and losses; its figures sit beside it in words */
  function wdlBar(r, tall) {
    var n = r.w + r.d + r.l, bar = h('div', { class: 'tr-wdl' + (tall ? ' tall' : ''), role: 'img', 'aria-label': wdlWords(r) });
    [['w', 'res-w', 'won'], ['d', 'res-d', 'drawn'], ['l', 'res-l', 'lost']].forEach(function (x) {
      if (!r[x[0]]) return;
      var share = r[x[0]] / n, part = h('i', { class: x[1], style: { flexGrow: String(r[x[0]]) } });
      // the tall bar prints each part's count where it fits
      if (tall && share >= 0.08) part.appendChild(h('span', null, String(r[x[0]])));
      bar.appendChild(part);
    });
    return bar;
  }
  function wdlWords(r) {
    var n = r.w + r.d + r.l;
    return U.plural(r.w, 'win') + ', ' + U.plural(r.d, 'draw') + ', ' + U.plural(r.l, 'loss', 'losses') + (n ? ', ' + pct((r.w + r.d / 2) / n) + ' of the points' : '');
  }
  function tally(games) {
    var r = { w: 0, d: 0, l: 0 };
    games.forEach(function (g) { var o = outcome(g); if (o) r[o]++; });
    return r;
  }
  /* a key for each series, shaped like its mark: a dot, a line, or a block */
  function legend(items) {
    return h('div', { class: 'tr-legend' }, items.map(function (it) {
      return h('span', null, h('i', { class: it[0], 'aria-hidden': 'true' }), it[1]);
    }));
  }
  /* "See the numbers": every chart's values, in a table */
  function numbers(head, rows, label) {
    var t = h('table', { class: 'tr-table' }, h('thead', null, h('tr', null, head.map(function (x) { return h('th', { scope: 'col' }, x); }))),
      h('tbody', null, rows.map(function (r) { return h('tr', null, r.map(function (x, i) { return i ? h('td', null, x) : h('th', { scope: 'row' }, x); })); })));
    return h('details', { class: 'tr-numbers' }, h('summary', null, label || 'See the numbers'), h('div', { class: 'tr-table-wrap' }, t));
  }

  /* ---------- a chart's hover layer ----------
     One readout for the whole chart. The mark under the pointer (or the nearest, on a line) lights up and the readout
     says what it is; a click opens that game's review, a tap shows it first and a second tap opens it. The chart takes
     the keyboard too: the arrow keys move along it, Enter opens. */
  function interactive(wrap, plot, n, opts) {
    var tip = h('div', { class: 'tr-tip', role: 'presentation', hidden: true }), at = -1, tapped = -1, viaKeys = false;
    wrap.appendChild(tip);
    wrap.tabIndex = 0;
    function show(i) {
      at = i;
      if (i < 0) { tip.hidden = true; opts.mark(-1); return; }
      opts.mark(i);
      U.clear(tip);
      opts.tip(i, tip);
      tip.hidden = false;
      // beside the mark, kept inside the chart
      var box = wrap.getBoundingClientRect(), x = opts.x(i) / opts.W * plot.getBoundingClientRect().width + (plot.getBoundingClientRect().left - box.left);
      var w = tip.offsetWidth, left = x + 14;
      if (left + w > box.width - 4) left = x - 14 - w;
      tip.style.left = Math.max(4, left) + 'px';
      tip.style.top = '8px';
    }
    function nearest(e) {
      var r = plot.getBoundingClientRect(), vx = (e.clientX - r.left) / r.width * opts.W;
      var best = 0, bd = Infinity;
      for (var i = 0; i < n; i++) { var d = Math.abs(opts.x(i) - vx); if (d < bd) { bd = d; best = i; } }
      return best;
    }
    plot.addEventListener('pointermove', function (e) { if (e.pointerType === 'mouse') { viaKeys = false; show(nearest(e)); } });
    plot.addEventListener('pointerleave', function (e) { if (e.pointerType === 'mouse' && !viaKeys) { show(-1); tapped = -1; } });
    plot.addEventListener('click', function (e) {
      var i = nearest(e);
      if (!opts.open) { show(i); return; }
      if (e.pointerType === 'mouse' || (e.pointerType == null && at === i) || tapped === i) { opts.open(i); return; }
      tapped = i; show(i);
    });
    wrap.addEventListener('focus', function () { viaKeys = true; if (at < 0) show(n - 1); });
    wrap.addEventListener('blur', function () { viaKeys = false; show(-1); });
    wrap.addEventListener('keydown', function (e) {
      var k = e.key;
      if (k === 'ArrowLeft' || k === 'ArrowRight' || k === 'Home' || k === 'End') {
        e.preventDefault(); viaKeys = true;
        show(k === 'Home' ? 0 : k === 'End' ? n - 1 : Math.max(0, Math.min(n - 1, (at < 0 ? n - 1 : at) + (k === 'ArrowLeft' ? -1 : 1))));
      } else if ((k === 'Enter' || k === ' ') && at >= 0 && opts.open) { e.preventDefault(); opts.open(at); }
      else if (k === 'Escape') show(-1);
    });
    return { show: show };
  }
  function tipHead(tip, a, b) { tip.appendChild(h('div', { class: 'tr-tip-head' }, a)); if (b) tip.appendChild(h('div', { class: 'tr-tip-sub' }, b)); }
  function tipRow(tip, value, label, key) {
    tip.appendChild(h('div', { class: 'tr-tip-row' }, key ? h('i', { class: key, 'aria-hidden': 'true' }) : null, h('b', null, value), h('span', null, label)));
  }

  /* ---------- accuracy, game by game ---------- */
  function accuracyCard(rev, W) {
    var c = card('Accuracy, game by game', rev.length ? U.plural(rev.length, 'reviewed game') : null);
    if (rev.length < 2) { c.appendChild(h('p', { class: 'muted' }, 'Review a couple of games to see your accuracy over time.')); return c; }
    var span = rev.length >= 10 ? 5 : 3;
    var avg = rev.map(function (g, i) { return mean(rev.slice(Math.max(0, i - span + 1), i + 1).map(function (x) { return x.acc; })); });
    // the scale: from a round number under the lowest game (and its average) to 100, so the games fill the chart
    var low = Math.min.apply(null, rev.map(function (g) { return g.acc; }).concat(avg)), step = 100 - low > 45 ? 20 : 10;
    var lo = Math.max(0, Math.floor((low - 4) / step) * step);
    var H = 210, P = { l: 34, r: 42, t: 12, b: 28 }, n = rev.length;
    var x = function (i) { return P.l + (W - P.l - P.r) * (n === 1 ? 0.5 : i / (n - 1)); };
    var y = function (v) { return P.t + (H - P.t - P.b) * (1 - (v - lo) / (100 - lo)); };
    var plot = svg('svg', { viewBox: '0 0 ' + W + ' ' + H, class: 'chart tr-chart', role: 'img',
      'aria-label': 'Your accuracy in ' + U.plural(n, 'reviewed game') + ', from ' + Math.round(rev[0].acc) + '% to ' + Math.round(rev[n - 1].acc) + '%, averaging ' + Math.round(avg[n - 1]) + '% over the last ' + Math.min(span, n) });
    for (var tick = lo; tick <= 100; tick += step) (function (v) {
      svg('line', { x1: P.l, x2: W - P.r, y1: y(v), y2: y(v), class: 'gridline' }, plot);
      svg('text', { x: P.l - 6, y: y(v) + 4, 'text-anchor': 'end', class: 'axis' }, plot).textContent = v;
    })(tick);
    // a few dates along the bottom: the first, the middle, the last
    [0, Math.floor((n - 1) / 2), n - 1].filter(function (v, i, a) { return a.indexOf(v) === i; }).forEach(function (i, k, list) {
      svg('text', { x: x(i), y: H - 8, 'text-anchor': list.length === 1 ? 'middle' : k === 0 ? 'start' : k === list.length - 1 ? 'end' : 'middle', class: 'axis' }, plot).textContent = U.dateShort(rev[i].ts);
    });
    var cross = svg('line', { x1: 0, x2: 0, y1: P.t, y2: H - P.b, class: 'tr-cross', visibility: 'hidden' }, plot);
    var dots = rev.map(function (g, i) { return svg('circle', { cx: x(i), cy: y(g.acc), r: 4, class: 'tr-dot' }, plot); });
    var d = avg.map(function (v, i) { return (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(v).toFixed(1); }).join('');
    svg('path', { d: d, class: 'tr-line' }, plot);
    svg('circle', { cx: x(n - 1), cy: y(avg[n - 1]), r: 4.5, class: 'tr-end' }, plot);
    svg('text', { x: x(n - 1) + 9, y: y(avg[n - 1]) + 4, class: 'tr-endlabel' }, plot).textContent = Math.round(avg[n - 1]) + '%';
    var wrap = h('div', { class: 'tr-plot', role: 'group', 'aria-label': 'Accuracy chart. Use the arrow keys to move between games and Enter to open one.' }, plot);
    c.appendChild(legend([['tr-dot-key', 'Each game'], ['tr-line-key', 'Average of the last ' + span]]));
    c.appendChild(wrap);
    interactive(wrap, plot, n, {
      W: W, x: x,
      mark: function (i) {
        dots.forEach(function (el, j) { el.setAttribute('class', j === i ? 'tr-dot on' : 'tr-dot'); el.setAttribute('r', j === i ? 6 : 4); });
        if (i < 0) cross.setAttribute('visibility', 'hidden');
        else { cross.setAttribute('x1', x(i)); cross.setAttribute('x2', x(i)); cross.setAttribute('visibility', 'visible'); }
      },
      tip: function (i, tip) {
        var g = rev[i];
        tipHead(tip, Review.gameTitle(g), U.dateShort(g.ts));
        tipRow(tip, Math.round(g.acc) + '%', 'accuracy', 'tr-dot-key');
        tipRow(tip, Math.round(avg[i]) + '%', 'average of the last ' + Math.min(span, i + 1), 'tr-line-key');
      },
      open: function (i) { Review.openGame(rev[i].id); }
    });
    return c;
  }

  /* ---------- mistakes, game by game ---------- */
  /* a column's top block: rounded at the top, square where it stands */
  function topBlock(x, y, w, hgt, r) {
    r = Math.max(0, Math.min(r, w / 2, hgt));
    return 'M' + x + ' ' + (y + hgt) + 'V' + (y + r) + 'Q' + x + ' ' + y + ' ' + (x + r) + ' ' + y + 'H' + (x + w - r) + 'Q' + (x + w) + ' ' + y + ' ' + (x + w) + ' ' + (y + r) + 'V' + (y + hgt) + 'Z';
  }
  function mistakesCard(rev, W) {
    var shown = rev.slice(-30);
    var c = card('Mistakes, game by game', shown.length < rev.length ? 'Your last 30 reviewed games' : null);
    if (!shown.length) { c.appendChild(h('p', { class: 'muted' }, 'Review a game to see its mistakes here.')); return c; }
    var k = shown.map(kinds), top = Math.max(3, Math.max.apply(null, k.map(function (v) { return v.x + v.m + v.i; })));
    var step = top <= 6 ? 1 : top <= 12 ? 2 : 5, yMax = Math.ceil(top / step) * step;
    var H = 190, P = { l: 34, r: 12, t: 12, b: 28 }, n = shown.length, band = (W - P.l - P.r) / n;
    var colW = Math.max(3, Math.min(24, band * 0.62));
    var x = function (i) { return P.l + band * (i + 0.5); };
    var y = function (v) { return P.t + (H - P.t - P.b) * (1 - v / yMax); };
    var plot = svg('svg', { viewBox: '0 0 ' + W + ' ' + H, class: 'chart tr-chart', role: 'img',
      'aria-label': 'Blunders, mistakes and inaccuracies in each of ' + U.plural(n, 'reviewed game') });
    for (var v = 0; v <= yMax; v += step) {
      svg('line', { x1: P.l, x2: W - P.r, y1: y(v), y2: y(v), class: 'gridline' }, plot);
      svg('text', { x: P.l - 6, y: y(v) + 4, 'text-anchor': 'end', class: 'axis' }, plot).textContent = v;
    }
    [0, n - 1].filter(function (v, i, a) { return a.indexOf(v) === i; }).forEach(function (i, j, list) {
      svg('text', { x: list.length === 1 ? x(i) : j === 0 ? P.l : W - P.r, y: H - 8, 'text-anchor': list.length === 1 ? 'middle' : j === 0 ? 'start' : 'end', class: 'axis' }, plot).textContent = U.dateShort(shown[i].ts);
    });
    var cols = k.map(function (v, i) {
      var grp = svg('g', { class: 'tr-col' }, plot), base = H - P.b, left = x(i) - colW / 2;
      var parts = [['x', 'sev-x'], ['m', 'sev-m'], ['i', 'sev-i']].filter(function (p) { return v[p[0]] > 0; });
      parts.forEach(function (p, j) {
        var hgt = (H - P.t - P.b) * v[p[0]] / yMax, gap = j < parts.length - 1 ? 2 : 0, yTop = base - hgt;
        if (j === parts.length - 1) svg('path', { d: topBlock(left, yTop, colW, hgt, 4), class: p[1] }, grp);
        else svg('rect', { x: left, y: yTop + gap, width: colW, height: Math.max(0, hgt - gap), class: p[1] }, grp);
        base = yTop;
      });
      return grp;
    });
    var cross = svg('rect', { x: 0, y: P.t, width: band, height: H - P.t - P.b, class: 'tr-band', visibility: 'hidden' }, plot);
    plot.insertBefore(cross, plot.firstChild);
    var wrap = h('div', { class: 'tr-plot', role: 'group', 'aria-label': 'Mistakes chart. Use the arrow keys to move between games and Enter to open one.' }, plot);
    c.appendChild(legend([['sev-x', 'Blunders'], ['sev-m', 'Mistakes and misses'], ['sev-i', 'Inaccuracies']]));
    c.appendChild(wrap);
    interactive(wrap, plot, n, {
      W: W, x: x,
      mark: function (i) {
        cols.forEach(function (el, j) { el.setAttribute('class', 'tr-col' + (i >= 0 && j !== i ? ' dim' : '')); });
        if (i < 0) cross.setAttribute('visibility', 'hidden');
        else { cross.setAttribute('x', x(i) - band / 2); cross.setAttribute('visibility', 'visible'); }
      },
      tip: function (i, tip) {
        var g = shown[i], v = k[i];
        tipHead(tip, Review.gameTitle(g), U.dateShort(g.ts));
        if (!v.x && !v.m && !v.i) tipRow(tip, 'None', 'no mistakes at all');
        [['x', 'sev-x'], ['m', 'sev-m'], ['i', 'sev-i']].forEach(function (p) { if (v[p[0]]) tipRow(tip, String(v[p[0]]), KIND_NAMES[p[0]][v[p[0]] === 1 ? 0 : 1], p[1]); });
      },
      open: function (i) { Review.openGame(shown[i].id); }
    });
    c.appendChild(numbers(['Game', 'Date', 'Accuracy', 'Blunders', 'Mistakes', 'Inaccuracies'],
      rev.slice().reverse().map(function (g) { var v = kinds(g); return [Review.gameTitle(g), U.dateShort(g.ts), Math.round(g.acc) + '%', String(v.x), String(v.m), String(v.i)]; }),
      'See the numbers for every game'));
    return c;
  }

  /* ---------- at a glance ---------- */
  function glanceCard(list, rev) {
    var c = h('section', { class: 'card tr-glance', 'aria-label': 'At a glance' });
    var wr = windows(rev), wa = windows(list);
    function avgOf(games, f) { return mean(games.map(f)); }
    var accNow = wr ? avgOf(wr.now, function (g) { return g.acc; }) : avgOf(rev, function (g) { return g.acc; });
    var xNow = wr ? avgOf(wr.now, function (g) { return kinds(g).x; }) : avgOf(rev, function (g) { return kinds(g).x; });
    var mNow = wr ? avgOf(wr.now, function (g) { return kinds(g).m; }) : avgOf(rev, function (g) { return kinds(g).m; });
    var over = wr ? 'Your last ' + wr.k + ' reviewed games' : U.plural(rev.length, 'reviewed game');
    var grid = h('div', { class: 'tr-tiles' });
    if (rev.length) {
      grid.appendChild(tile('Accuracy', Math.round(accNow) + '%', over,
        wr && delta(accNow, avgOf(wr.before, function (g) { return g.acc; }), wr.k, { same: 1, upIsGood: true, fmt: function (d) { return U.plural(Math.round(d), 'point'); } })));
      grid.appendChild(tile('Blunders a game', xNow.toFixed(1), over,
        wr && delta(xNow, avgOf(wr.before, function (g) { return kinds(g).x; }), wr.k, { same: 0.15, upIsGood: false, fmt: function (d) { return d.toFixed(1); } })));
      grid.appendChild(tile('Mistakes a game', mNow.toFixed(1), wr ? 'Mistakes and misses, last ' + wr.k : 'Mistakes and misses',
        wr && delta(mNow, avgOf(wr.before, function (g) { return kinds(g).m; }), wr.k, { same: 0.15, upIsGood: false, fmt: function (d) { return d.toFixed(1); } })));
    }
    var games = wa ? wa.now : list, r = tally(games), sNow = (r.w + r.d / 2) / games.length;
    var rb = wa ? tally(wa.before) : null;
    grid.appendChild(tile('Score', pct(sNow), (wa ? 'Last ' + wa.k + ': ' : '') + r.w + '–' + r.d + '–' + r.l,
      wa && delta(100 * sNow, 100 * (rb.w + rb.d / 2) / wa.k, wa.k, { same: 5, upIsGood: true, fmt: function (d) { return U.plural(Math.round(d), 'point'); } })));
    c.appendChild(grid);
    if (!rev.length) c.appendChild(h('p', { class: 'muted small', style: { marginTop: '12px' } }, 'Review your games to see your accuracy and mistakes here too.'));
    return c;
  }

  /* ---------- where games go wrong ---------- */
  var PHASES = [['o', 'Opening', 'Your first 10 moves'], ['m', 'Middlegame', 'From move 11 until the endgame'], ['e', 'Endgame', 'Six or fewer pieces left besides kings and pawns']];
  var BUCKETS = [[1, 5], [6, 10], [11, 15], [16, 20], [21, 25], [26, 30], [31, 40], [41, 999]];
  function bucketName(b) { return b[1] > 500 ? b[0] + '+' : b[0] + '–' + b[1]; }
  function phasesCard(withFacts, rev, HW) {
    var c = card('Where your games go wrong', withFacts.length ? 'From ' + U.plural(withFacts.length, 'reviewed game') : null);
    if (!withFacts.length) {
      c.appendChild(h('p', { class: 'muted' }, rev.length ? 'Your reviewed games here were reviewed before Tempo kept this detail. Review one again, or a new game, to see it.' : 'Review a game to see how you do in each part of it.'));
      return c;
    }
    var stats = PHASES.map(function (p) {
      var gs = withFacts.filter(function (g) { return g.tr.ph[p[0]]; }), w = windows(gs);
      var acc = mean(gs.map(function (g) { return g.tr.ph[p[0]][0]; }));
      var err = gs.length ? gs.reduce(function (s, g) { return s + g.tr.ph[p[0]][2]; }, 0) / gs.length : null;
      return { p: p, games: gs, acc: acc, err: err, w: w };
    });
    // the headline: the weakest phase, against the strongest, when each has a few games
    var enough = stats.filter(function (s) { return s.games.length >= 3; }).sort(function (a, b) { return a.acc - b.acc; });
    if (enough.length >= 2 && enough[enough.length - 1].acc - enough[0].acc >= 3) {
      var lo = enough[0], hi = enough[enough.length - 1];
      c.appendChild(h('p', { class: 'tr-insight' }, 'Your weakest part of the game is the ' + lo.p[1].toLowerCase() + ': ' + Math.round(lo.acc) + '% accuracy, against ' + Math.round(hi.acc) + '% in the ' + hi.p[1].toLowerCase() + '.'));
    }
    var grid = h('div', { class: 'tr-phase-grid' }), rows = h('div', { class: 'tr-phases' });
    stats.forEach(function (s) {
      var row = h('div', { class: 'tr-phase' }, h('div', { class: 'row between' }, h('span', null, h('b', null, s.p[1]), h('span', { class: 'faint small tr-def' }, s.p[2])),
        h('b', { class: 'num' }, s.acc == null ? '—' : Math.round(s.acc) + '%')));
      if (s.acc != null) {
        row.appendChild(UI.meter(s.acc / 100, 'tr-meter'));
        row.appendChild(h('div', { class: 'faint small' }, s.err.toFixed(1) + ' serious mistakes a game, in ' + U.plural(s.games.length, 'game')));
        var d = s.w && delta(mean(s.w.now.map(function (g) { return g.tr.ph[s.p[0]][0]; })), mean(s.w.before.map(function (g) { return g.tr.ph[s.p[0]][0]; })), s.w.k,
          { same: 2, upIsGood: true, fmt: function (v) { return U.plural(Math.round(v), 'point'); } });
        if (d) row.appendChild(d);
      } else row.appendChild(h('div', { class: 'faint small' }, 'None of these games got this far.'));
      rows.appendChild(row);
    });
    grid.appendChild(rows);
    // when the serious mistakes come, by move number
    var counts = BUCKETS.map(function () { return 0; }), total = 0;
    withFacts.forEach(function (g) { g.tr.mm.forEach(function (mv) { for (var b = 0; b < BUCKETS.length; b++) if (mv >= BUCKETS[b][0] && mv <= BUCKETS[b][1]) { counts[b]++; total++; break; } }); });
    var hist = h('div', { class: 'tr-hist' }, h('div', { class: 'label' }, 'When your serious mistakes come'));
    if (!total) hist.appendChild(h('p', { class: 'muted small' }, 'No serious mistakes in these games.'));
    else {
      var peak = counts.indexOf(Math.max.apply(null, counts));
      var W = HW, H = 170, P = { l: 6, r: 6, t: 22, b: 26 }, nb = BUCKETS.length, band = (W - P.l - P.r) / nb, colW = Math.min(24, band * 0.62);
      var top = Math.max.apply(null, counts);
      var x = function (i) { return P.l + band * (i + 0.5); };
      var plot = svg('svg', { viewBox: '0 0 ' + W + ' ' + H, class: 'chart tr-chart', role: 'img',
        'aria-label': 'Your serious mistakes by move number: the most, ' + pct(counts[peak] / total) + ', in moves ' + bucketName(BUCKETS[peak]) });
      svg('line', { x1: P.l, x2: W - P.r, y1: H - P.b, y2: H - P.b, class: 'gridline' }, plot);
      var bars = counts.map(function (v, i) {
        var hgt = v ? Math.max(3, (H - P.t - P.b) * v / top) : 0, grp = svg('g', { class: 'tr-col' }, plot);
        if (v) svg('path', { d: topBlock(x(i) - colW / 2, H - P.b - hgt, colW, hgt, 4), class: i === peak ? 'tr-peak' : 'tr-bar' }, grp);
        svg('text', { x: x(i), y: H - 9, 'text-anchor': 'middle', class: 'axis' }, plot).textContent = bucketName(BUCKETS[i]);
        if (i === peak) svg('text', { x: x(i), y: H - P.b - hgt - 6, 'text-anchor': 'middle', class: 'tr-cap' }, plot).textContent = pct(v / total);
        return grp;
      });
      var wrap = h('div', { class: 'tr-plot', role: 'group', 'aria-label': 'Mistakes by move chart. Use the arrow keys to move between the stretches of moves.' }, plot);
      hist.appendChild(wrap);
      interactive(wrap, plot, nb, {
        W: W, x: x,
        mark: function (i) { bars.forEach(function (el, j) { el.setAttribute('class', 'tr-col' + (i >= 0 && j !== i ? ' dim' : '')); }); },
        tip: function (i, tip) {
          tipHead(tip, 'Moves ' + bucketName(BUCKETS[i]));
          tipRow(tip, String(counts[i]), 'of your ' + total + ' serious mistakes (' + pct(counts[i] / total) + ')');
        }
      });
      hist.appendChild(h('p', { class: 'faint small' }, 'Most of them come in moves ' + bucketName(BUCKETS[peak]) + '.'));
      hist.appendChild(numbers(['Moves', 'Serious mistakes', 'Share'], BUCKETS.map(function (b, i) { return [bucketName(b), String(counts[i]), pct(counts[i] / total)]; })));
    }
    grid.appendChild(hist);
    c.appendChild(grid);
    return c;
  }

  /* ---------- winning and saving games ---------- */
  var WINNING = 300;
  function closingCard(withFacts) {
    var c = card('Winning and saving games', withFacts.length ? 'From ' + U.plural(withFacts.length, 'reviewed game') : null);
    var up = withFacts.filter(function (g) { return g.tr.hi >= WINNING; }), down = withFacts.filter(function (g) { return g.tr.lo <= -WINNING; });
    var won = up.filter(function (g) { return outcome(g) === 'w'; }).length, saved = down.filter(function (g) { return outcome(g) !== 'l'; }).length;
    if (!up.length && !down.length) {
      c.appendChild(h('p', { class: 'muted' }, withFacts.length ? 'None of these games had a clearly winning or losing position yet.' : 'Review a game to see how you finish games you’re winning and fight back in ones you’re losing.'));
      return c;
    }
    function block(title, a, b, says, cls) {
      return h('div', { class: 'tr-close' }, h('span', { class: 'label' }, title),
        h('div', { class: 'row tight' }, h('b', { class: 'tr-big' }, b ? pct(a / b) : '—'), h('span', { class: 'muted' }, b ? a + ' of ' + b : 'none yet')),
        b ? UI.meter(a / b, cls) : null, h('p', { class: 'faint small' }, says));
    }
    var grid = h('div', { class: 'tr-close-grid' },
      block('Winning positions you won', won, up.length, up.length ? 'You were winning in ' + U.plural(up.length, 'game') + ' and won ' + won + '.' : 'No winning positions in these games yet.', 'green'),
      block('Losing positions you saved', saved, down.length, down.length ? 'You were losing in ' + U.plural(down.length, 'game') + ' and drew or won ' + saved + '.' : 'No losing positions in these games.', 'tr-meter'));
    c.appendChild(grid);
    c.appendChild(h('p', { class: 'faint small' }, 'Winning means three points ahead or more by the engine’s count (about a piece) at some point in the game; losing, three points behind.'));
    return c;
  }

  /* ---------- results ---------- */
  var ENDS = { checkmate: 'Checkmate', resignation: 'Resignation', time: 'Time', abandoned: 'Abandoned' };
  function endName(reason, o) {
    if (o === 'd') return reason === 'agreement' ? 'Agreed' : reason === 'stalemate' ? 'Stalemate' : /repetition/.test(reason || '') ? 'Repetition' : /insufficient/.test(reason || '') ? 'Not enough to mate' : /fifty/.test(reason || '') ? 'Fifty-move rule' : 'Other';
    return ENDS[reason] || 'Other';
  }
  function resultsCard(list) {
    var c = card('Results', U.plural(list.length, 'game'));
    var all = tally(list);
    c.appendChild(wdlBar(all, true));
    c.appendChild(legend([['res-w', 'Wins'], ['res-d', 'Draws'], ['res-l', 'Losses']]));
    c.appendChild(h('p', { class: 'num' }, wdlWords(all)));
    var rows = h('div', { class: 'tr-rows' });
    function row(label, games) {
      if (!games.length) return;
      var r = tally(games), n = games.length;
      rows.appendChild(h('div', { class: 'tr-row' }, h('span', { class: 'tr-row-label' }, label), wdlBar(r),
        h('span', { class: 'num tr-row-fig' }, r.w + '–' + r.d + '–' + r.l + ' · ' + pct((r.w + r.d / 2) / n))));
    }
    row('As White', list.filter(function (g) { return g.color === 'w'; }));
    row('As Black', list.filter(function (g) { return g.color === 'b'; }));
    var rated = list.map(function (g) { return { g: g, r: ratingsOf(g) }; }).filter(function (x) { return x.r; });
    row('Against stronger players', rated.filter(function (x) { return x.r[1] - x.r[0] >= 100; }).map(function (x) { return x.g; }));
    row('Against players near your level', rated.filter(function (x) { return Math.abs(x.r[1] - x.r[0]) < 100; }).map(function (x) { return x.g; }));
    row('Against weaker players', rated.filter(function (x) { return x.r[0] - x.r[1] >= 100; }).map(function (x) { return x.g; }));
    c.appendChild(rows);
    c.appendChild(h('p', { class: 'faint small' }, 'Wins, draws and losses, then your share of the points. Stronger or weaker means 100 rating points or more apart.'));
    var white = list.filter(function (g) { return g.color === 'w'; }), black = list.filter(function (g) { return g.color === 'b'; });
    if (white.length >= 3 && black.length >= 3) {
      var sw = mean(white.map(scoreOf)), sb = mean(black.map(scoreOf));
      if (Math.abs(sw - sb) >= 0.1) c.insertBefore(h('p', { class: 'tr-insight' }, 'You score ' + pct(sw) + ' as White and ' + pct(sb) + ' as Black.'), c.children[1]);
    }
    // how they end
    var ends = { w: {}, l: {}, d: {} };
    list.forEach(function (g) { var o = outcome(g), k = endName(g.reason, o); ends[o][k] = (ends[o][k] || 0) + 1; });
    var endBox = h('div', { class: 'tr-ends' });
    [['w', 'Your wins'], ['l', 'Your losses'], ['d', 'Your draws']].forEach(function (x) {
      var keys = Object.keys(ends[x[0]]).sort(function (a, b) { return ends[x[0]][b] - ends[x[0]][a]; });
      if (!keys.length) return;
      endBox.appendChild(h('div', null, h('div', { class: 'label' }, x[1]), h('ul', { class: 'tr-end-list' }, keys.map(function (k) {
        return h('li', null, h('span', null, k), h('b', { class: 'num' }, String(ends[x[0]][k])));
      }))));
    });
    c.appendChild(h('div', { class: 'label', style: { marginTop: '6px' } }, 'How your games end'));
    c.appendChild(endBox);
    return c;
  }

  /* ---------- openings ---------- */
  function openingsCard(list, map) {
    var c = card('Your openings');
    var groups = { w: {}, b: {} };
    list.forEach(function (g) {
      var o = openingOf(g, map); if (!o) return;
      var k = groups[g.color][o.family] = groups[g.color][o.family] || { name: o.family, games: [] };
      k.games.push(g);
    });
    var any = false;
    [['w', 'As White'], ['b', 'As Black']].forEach(function (side) {
      var items = Object.keys(groups[side[0]]).map(function (k) { return groups[side[0]][k]; }).sort(function (a, b) { return b.games.length - a.games.length; });
      if (!items.length) return;
      any = true;
      var box = h('div', { class: 'tr-open' }, h('div', { class: 'label' }, side[1]));
      items.slice(0, 5).forEach(function (it) {
        var r = tally(it.games), n = it.games.length, rv = it.games.filter(reviewed);
        box.appendChild(h('div', { class: 'tr-row' }, h('span', { class: 'tr-row-label' }, it.name,
          h('span', { class: 'faint small tr-row-sub' }, U.plural(n, 'game') + (rv.length ? ' · ' + Math.round(mean(rv.map(function (g) { return g.acc; }))) + '% accuracy' : ''))), wdlBar(r),
          h('span', { class: 'num tr-row-fig' }, pct((r.w + r.d / 2) / n))));
      });
      // the one that goes best and the one that goes worst, with a few games each
      var tried = items.filter(function (it) { return it.games.length >= 3; }).map(function (it) { return { it: it, s: mean(it.games.map(scoreOf)) }; }).sort(function (a, b) { return b.s - a.s; });
      if (tried.length >= 2 && tried[0].s - tried[tried.length - 1].s >= 0.15) {
        var best = tried[0], worst = tried[tried.length - 1];
        box.appendChild(h('p', { class: 'faint small' }, 'Best: ' + best.it.name + ', ' + pct(best.s) + ' in ' + U.plural(best.it.games.length, 'game') + '. Hardest: ' + worst.it.name + ', ' + pct(worst.s) + ' in ' + U.plural(worst.it.games.length, 'game') + '.'));
      }
      c.appendChild(box);
    });
    if (!any) c.appendChild(h('p', { class: 'muted' }, 'Your games here don’t start from a known opening yet.'));
    else c.appendChild(h('p', { class: 'faint small' }, 'Your share of the points with each, and your average accuracy in the reviewed ones.'));
    return c;
  }

  /* ---------- mistake themes ---------- */
  function themesCard(withFacts) {
    var c = card('Mistakes that keep coming back');
    var games = withFacts.filter(function (g) { return g.tr.tp; }), w = windows(games);
    var now = w ? w.now : games, before = w ? w.before : [];
    function inGames(gs, t) { return gs.filter(function (g) { return g.tr.tp[t]; }).length; }
    var topics = Object.keys(Mistakes.SAYS).map(function (t) { return { t: t, now: inGames(now, t), before: inGames(before, t) }; })
      .filter(function (x) { return x.now || x.before; }).sort(function (a, b) { return b.now - a.now || b.before - a.before; });
    if (!topics.length) { c.appendChild(h('p', { class: 'muted' }, games.length ? 'No kind of mistake keeps coming back in these games.' : 'Review a game to see which mistakes keep coming back.')); return c; }
    var list = h('div', { class: 'tr-themes' });
    topics.forEach(function (x) {
      var says = 'You ' + Mistakes.SAYS[x.t], where = w ? 'in ' + x.now + ' of your last ' + w.k + ' games' : 'in ' + x.now + ' of ' + U.plural(now.length, 'game');
      var d = w ? (x.now === x.before ? h('span', { class: 'tr-delta same' }, 'Same as the ' + w.k + ' before')
        : h('span', { class: 'tr-delta ' + (x.now < x.before ? 'good' : 'bad') }, h('span', { class: 'tr-arrow', 'aria-hidden': 'true' }, x.now < x.before ? '▼' : '▲'),
          (x.now < x.before ? 'Down from ' : 'Up from ') + x.before)) : null;
      list.appendChild(h('div', { class: 'tr-theme' }, h('div', null, h('div', null, says), h('div', { class: 'faint small' }, cap(where))), d));
    });
    c.appendChild(list);
    var row = topics[0].now ? Explain.studyRow(topics[0].t, '') : null;
    if (row) c.appendChild(row);
    return c;
  }

  /* ---------- the page ---------- */
  function filters(info, repaint) {
    var row = h('div', { class: 'tr-filters', role: 'group', 'aria-label': 'Which games' });
    function seg(label, opts, key) {
      var el = h('div', { class: 'seg', role: 'group', 'aria-label': label });
      opts.forEach(function (o) {
        el.appendChild(h('button', { type: 'button', class: F[key] === o[0] ? 'on' : '', 'aria-pressed': F[key] === o[0] ? 'true' : 'false',
          onclick: function () { if (F[key] === o[0]) return; F[key] = o[0]; repaint(); } }, o[1]));
      });
      return el;
    }
    if (info.bots && info.adds) row.appendChild(seg('Whose games', [['all', 'All games'], ['bots', 'The characters'], ['added', info.addedName]], 'src'));
    row.appendChild(seg('How many', [[20, 'Last 20'], [50, 'Last 50'], [0, 'All']], 'range'));
    return row;
  }
  function render(root) {
    root.appendChild(h('div', { class: 'page-head' }, h('div', null, h('h1', null, 'Progress')), App.progressTabs('trends')));
    // games reviewed before Tempo kept these numbers get them from their saved review
    if (Review.backfillFacts()) Store.touch('games');
    var body = h('div', { class: 'tr-body' });
    root.appendChild(body);
    function paint() {
      var info = pick(), list = info.list;
      if (info.src !== F.src) F.src = info.src;
      U.clear(body);
      if (!list.length) {
        body.appendChild(h('section', { class: 'card stack' }, h('h3', null, 'Your trends start with your games'),
          h('p', { class: 'muted' }, 'Play the characters or add your games from Chess.com. Tempo tracks how they go: your accuracy and mistakes, the part of the game where things go wrong, your results and your openings.'),
          h('div', { class: 'row' }, h('button', { class: 'btn primary', type: 'button', onclick: function () { App.go('play'); } }, U.icon('play'), 'Play a game'),
            h('button', { class: 'btn', type: 'button', onclick: function () { App.go('review'); } }, U.icon('review'), 'Add your games'))));
        return;
      }
      var rev = list.filter(reviewed), withFacts = rev.filter(function (g) { return g.tr && g.tr.ph; });
      // the charts are drawn at the width they're shown at, so their text stays its real size on a phone
      var probe = card('-'); body.appendChild(probe);
      var cs = getComputedStyle(probe), inner = Math.max(260, Math.floor(probe.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)));
      probe.remove();
      var half = window.matchMedia && window.matchMedia('(min-width: 760px)').matches ? Math.floor((inner - 22) / 2.05) : inner;
      body.appendChild(filters(info, function () { paint(); }));
      var unrev = list.length - rev.length;
      body.appendChild(h('p', { class: 'faint small tr-scope' }, U.plural(list.length, 'game') + (unrev ? ', ' + rev.length + ' of them reviewed. Accuracy and mistakes come from the reviewed ones.' : ', all reviewed.')));
      body.appendChild(glanceCard(list, rev));
      body.appendChild(accuracyCard(rev, inner));
      body.appendChild(mistakesCard(rev, inner));
      body.appendChild(phasesCard(withFacts, rev, half));
      var g2 = h('div', { class: 'grid two tr-pair' });
      g2.appendChild(themesCard(withFacts));
      g2.appendChild(closingCard(withFacts));
      body.appendChild(g2);
      var g3 = h('div', { class: 'grid two tr-pair' });
      g3.appendChild(resultsCard(list));
      var openSlot = h('div');
      g3.appendChild(openSlot);
      body.appendChild(g3);
      // the openings need the opening book, which loads once
      Data.openings().then(function (map) { if (openSlot.isConnected) openSlot.replaceWith(openingsCard(list, map)); });
    }
    paint();
    // a new width (a phone turned, a window resized): the charts are drawn again to fit
    var lastW = window.innerWidth;
    function redraw() { if (window.innerWidth === lastW) return; lastW = window.innerWidth; var top = window.scrollY; paint(); window.scrollTo(0, top); }
    onResize = U.debounce(redraw, 200);
    window.addEventListener('resize', onResize);
  }
  var onResize = null;

  App.register('trends', { render: render, leave: function () { if (onResize) window.removeEventListener('resize', onResize); onResize = null; } });
  return { _pick: pick, _filter: F, _windows: windows };
})();
