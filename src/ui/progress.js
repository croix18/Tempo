/* Tempo progress and preferences. */
(function () {
  'use strict';
  var h = U.h;

  /* ---------- practice calendar: one column a week, Monday at the top ---------- */
  function dayWords(rec) {
    var bits = [];
    if (rec.p) bits.push(U.plural(rec.p, 'puzzle'));
    if (rec.g) bits.push(U.plural(rec.g, 'game'));
    if (rec.l) bits.push(U.plural(rec.l, 'lesson'));
    return bits.join(', ');
  }
  function calendar(map) {
    // about four months on a phone, about nine on a wider screen so the card isn't half empty
    var WEEKS = window.matchMedia && window.matchMedia('(min-width: 980px)').matches ? 40 : 18;
    var now = new Date(), today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    var first = new Date(today.getFullYear(), today.getMonth(), today.getDate() - (today.getDay() + 6) % 7 - 7 * (WEEKS - 1));
    function day(n) { return new Date(first.getFullYear(), first.getMonth(), first.getDate() + n); }
    var grid = h('div', { class: 'cal', role: 'group', 'aria-label': 'Practice over the last ' + WEEKS + ' weeks' });
    grid.style.gridTemplateColumns = '14px repeat(' + WEEKS + ', minmax(8px, 18px))';
    // the month's name over the week it starts in, leaving out one that would crowd the next
    var starts = [], prev = -1;
    for (var w = 0; w < WEEKS; w++) { var m = day(7 * w).getMonth(); if (m !== prev) starts.push(w); prev = m; }
    starts.forEach(function (sw, i) {
      if (WEEKS - sw < 2 || (starts[i + 1] != null && starts[i + 1] - sw < 3)) return;
      grid.appendChild(h('span', { class: 'cal-month', 'aria-hidden': 'true', style: { gridRow: '1', gridColumn: (sw + 2) + ' / span 2' } },
        day(7 * sw).toLocaleDateString(undefined, { month: 'short' })));
    });
    [['M', 0], ['W', 2], ['F', 4]].forEach(function (x) { grid.appendChild(h('span', { class: 'cal-day', 'aria-hidden': 'true', style: { gridRow: String(x[1] + 2) } }, x[0])); });
    for (w = 0; w < WEEKS; w++) for (var r = 0; r < 7; r++) {
      var d = day(7 * w + r), style = { gridColumn: String(w + 2), gridRow: String(r + 2) };
      if (d > today) { grid.appendChild(h('i', { class: 'future', 'aria-hidden': 'true', style: style })); continue; }
      var rec = map[U.dayKey(d)], n = rec ? rec.g + rec.p + rec.l : 0, isToday = d.getTime() === today.getTime(), shown = n > 0 || isToday;
      var label = (isToday ? 'Today, ' : '') + U.dateShort(d) + ': ' + (n ? dayWords(rec) : isToday ? 'no practice yet' : 'no practice');
      grid.appendChild(h('i', { class: (n >= 15 ? 'l3' : n >= 6 ? 'l2' : n ? 'l1' : '') + (isToday ? ' today' : ''), title: label,
        role: shown ? 'img' : null, 'aria-label': shown ? label : null, 'aria-hidden': shown ? null : 'true', style: style }));
    }
    var legend = h('div', { class: 'cal-legend', 'aria-hidden': 'true' }, 'Less',
      h('i', { title: 'No practice' }), h('i', { class: 'l1', title: '1 to 5 activities' }), h('i', { class: 'l2', title: '6 to 14 activities' }), h('i', { class: 'l3', title: '15 or more activities' }), 'More');
    return h('div', { class: 'cal-wrap' }, grid, legend);
  }

  /* ---------- your games: how they've gone lately, and what keeps going wrong ---------- */
  /* Every reviewed game counts, the ones against the characters and the ones you added from Chess.com alike: the average
     accuracy and mistakes over the last ten, the accuracy game by game, the mistakes that keep coming back with the lesson
     and puzzles that fix the first, and your Chess.com rating from the games you added. */
  function mean(a) { return a.length ? a.reduce(function (s, x) { return s + x; }, 0) / a.length : 0; }
  function gamesCard(S) {
    var all = S.games.list.filter(function (g) { return g.reviewed && g.acc != null; }).sort(function (a, b) { return a.ts - b.ts; });
    var fromCC = all.filter(function (g) { return g.src === 'chesscom'; }).length;
    var card = h('section', { class: 'card stack games-card', style: { marginTop: '14px' }, 'aria-label': 'Your games' });
    card.appendChild(h('div', { class: 'row between' }, h('h3', null, 'Your games'),
      all.length ? h('span', { class: 'head-note' }, h('b', { class: 'num' }, String(all.length)), ' reviewed' + (fromCC ? ', ' + fromCC + ' from Chess.com' : '')) : null));
    if (!all.length) {
      card.appendChild(h('p', { class: 'muted' }, 'Review a game, or add your games from Chess.com, to see how your games are going and what to work on.'));
      card.appendChild(h('div', null, h('button', { class: 'btn', type: 'button', onclick: function () { App.go('review'); } }, U.icon('review'), 'Go to Review')));
      return card;
    }
    var last = all.slice(-10);
    var acc = Math.round(mean(last.map(function (g) { return g.acc; })));
    var errs = mean(last.map(function (g) { var c = g.counts || {}; return (c.mistake || 0) + (c.blunder || 0) + (c.miss || 0); }));
    var over = last.length === all.length ? U.plural(all.length, 'game') : 'Last ' + last.length + ' games';
    card.appendChild(h('div', { class: 'games-stats' },
      h('div', { class: 'stat' }, h('span', { class: 'label' }, 'Accuracy'), h('b', null, acc + '%'), h('span', { class: 'faint small' }, over)),
      h('div', { class: 'stat' }, h('span', { class: 'label' }, 'Mistakes a game'), h('b', null, errs.toFixed(1)), h('span', { class: 'faint small' }, 'Mistakes, misses and blunders'))));
    card.appendChild(UI.lineChart(all.slice(-30).map(function (g) { return [g.ts, Math.round(g.acc)]; }),
      { label: 'Accuracy, game by game', lo: 0, hi: 100, height: 150, empty: 'Review another game to see your accuracy over time' }));
    var tops = Mistakes.topics(10).slice(0, 3);
    var work = h('div', { class: 'stack games-work' }, h('div', { class: 'label' }, 'What to work on'));
    if (tops.length) {
      tops.forEach(function (t) {
        work.appendChild(h('div', { class: 'games-topic' }, h('span', null, 'You ' + t.says), h('span', { class: 'faint num' }, U.plural(t.n, 'time') + ' in ' + U.plural(t.games, 'game'))));
      });
      var row = Explain.studyRow(tops[0].topic, ''); if (row) work.appendChild(row);
    } else work.appendChild(h('p', { class: 'muted small' }, 'No mistake keeps coming back in your reviewed games.'));
    var due = Mistakes.due().length, saved = S.mistakes.items.filter(function (x) { return !x.gone; }).length;
    if (saved) work.appendChild(h('div', null, h('button', { class: 'btn small', type: 'button', onclick: function () { App.go('train', { mode: 'mistakes' }); } },
      U.icon('target'), due ? 'Retry ' + U.plural(due, 'position') + ' from your games' : 'Your ' + U.plural(saved, 'saved position'))));
    card.appendChild(work);
    // your Chess.com rating, in the time control you play most, from the games you added
    var cc = S.games.list.filter(function (g) { return g.src === 'chesscom' && g.myElo; });
    if (cc.length) {
      var by = {};
      cc.forEach(function (g) { var k = g.tcl || 'rapid'; (by[k] = by[k] || []).push(g); });
      var main = Object.keys(by).sort(function (a, b) { return by[b].length - by[a].length; })[0];
      var pts = by[main].slice().sort(function (a, b) { return a.ts - b.ts; }).map(function (g) { return [g.ts, g.myElo]; });
      card.appendChild(h('div', { class: 'stack games-cc' },
        h('div', { class: 'row between' }, h('div', { class: 'stat' }, h('span', { class: 'label' }, 'Chess.com ' + main + ' rating'), h('b', null, String(pts[pts.length - 1][1]))),
          h('span', { class: 'faint small' }, 'From the games you added')),
        pts.length >= 2 ? UI.lineChart(pts, { label: 'Chess.com ' + main + ' rating over time', height: 130 }) : null));
    }
    return card;
  }

  App.register('progress', {
    render: function (root) {
      var S = Store.state;
      root.appendChild(h('div', { class: 'page-head' }, h('div', null, h('h1', null, 'Progress'))));
      var grid = h('div', { class: 'grid two' });
      grid.appendChild(h('div', { class: 'card stack' },
        h('div', { class: 'row between' }, h('div', { class: 'stat' }, h('span', { class: 'label' }, 'Game rating'), h('b', null, String(S.play.rating))), h('span', { class: 'faint small' }, U.plural(S.play.hist.length, 'rated game'))),
        UI.lineChart(S.play.hist, { label: 'Game rating over time', empty: 'Play rated games to see your rating move' })));
      grid.appendChild(h('div', { class: 'card stack' },
        h('div', { class: 'row between' }, h('div', { class: 'stat' }, h('span', { class: 'label' }, 'Puzzle rating'), h('b', null, String(S.puzzles.rating))), h('span', { class: 'faint small' }, S.puzzles.count ? Math.round(100 * S.puzzles.solved / S.puzzles.count) + '% solved' : 'no puzzles yet')),
        UI.lineChart(S.puzzles.hist, { label: 'Puzzle rating over time', empty: 'Solve rated puzzles to see your rating move' })));
      root.appendChild(grid);
      root.appendChild(gamesCard(S));

      root.appendChild(h('div', { class: 'card stack', style: { marginTop: '14px' } },
        h('div', { class: 'row between' }, h('h3', null, 'Practice'), h('span', { class: 'head-note' }, Store.streak() ? h('b', { class: 'num' }, U.plural(Store.streak(), 'day')) : 'Practice today to start a streak', Store.streak() ? ' in a row' : null)),
        calendar(S.days.map)));

      // records: the characters in tier order, your rivals (close records over a few games), then the original ladder bots
      var totals = { w: 0, d: 0, l: 0 }, rows = h('div', { class: 'list' }), rivals = [], old = [];
      function row(b, r) {
        return h('div', { class: 'list-row' }, UI.avatar(b, 'sm'), h('div', { class: 'grow row tight' }, h('b', null, b.short || b.name), r.beaten ? U.icon('check', 'won') : null),
          h('span', { class: 'num muted' }, recordWords(r)));
      }
      TempoBots.BOTS.forEach(function (b) {
        var r = S.play.bots[b.id]; if (!r || !(r.w + r.d + r.l)) return;
        totals.w += r.w; totals.d += r.d; totals.l += r.l;
        rows.appendChild(row(b, r));
        if (r.w >= 1 && r.l >= 1 && r.w + r.d + r.l >= 3 && Math.abs(r.w - r.l) <= 1) rivals.push({ b: b, n: r.w + r.d + r.l });
      });
      Object.keys(S.play.bots).forEach(function (id) {
        var b = TempoBots.RETIRED[id], r = S.play.bots[id]; if (!b || !(r.w + r.d + r.l)) return;
        totals.w += r.w; totals.d += r.d; totals.l += r.l; old.push(row(b, r));
      });
      rivals.sort(function (a, b) { return b.n - a.n; });
      if (old.length) { rows.appendChild(h('div', { class: 'label', style: { margin: '12px 0 4px' } }, 'The original ladder')); old.forEach(function (x) { rows.appendChild(x); }); }
      var units = Data.lessons(), lessonsTotal = 0, lessonsDone = 0;
      units.forEach(function (u) { u.lessons.forEach(function (l) { lessonsTotal++; if (S.learn.done[l.id]) lessonsDone++; }); });
      var reps = Data.reps(), linesTotal = 0, linesDone = 0;
      reps.repertoires.forEach(function (r) { r.lines.forEach(function (ln) { linesTotal++; var x = S.openings.lines[r.id + '/' + ln.id]; if (x && x.learned) linesDone++; }); });
      var g2 = h('div', { class: 'grid two', style: { marginTop: '14px' } });
      var top = TempoBots.topTier(S.play);
      g2.appendChild(h('div', { class: 'card stack' }, h('h3', null, 'Against the characters'),
        h('p', { class: 'muted' }, (S.play.champ ? 'Tempo Champion. ' : 'You\u2019ve reached ' + UI.tierLabel(top) + '. ') + (totals.w + totals.d + totals.l ? 'In all: ' + recordWords(totals) + '.' : 'No games yet. Win three games in a tier to open its promotion match.')),
        rivals.length ? h('p', null, 'Your rival' + (rivals.length > 1 ? 's' : '') + ': ' + rivals.slice(0, 2).map(function (x) { return x.b.short; }).join(' and ') + '. Close records, game after game.') : null,
        rows.children.length ? rows : null));
      var themeBox = h('div', { class: 'stack', style: { gap: '8px' } });
      var th = Object.keys(S.puzzles.themes).filter(function (t) { return Puzzles.NAMES[t] && S.puzzles.themes[t][0] >= 5 && !/^(short|long|veryLong|oneMove|middlegame|endgame|opening|advantage|crushing|master|mate)$/.test(t); })
        .map(function (t) { var x = S.puzzles.themes[t]; return { t: t, r: x[1] / x[0], n: x[0] }; }).sort(function (a, b) { return b.r - a.r; });
      if (th.length) th.slice(0, 4).concat(th.length > 6 ? th.slice(-3) : []).forEach(function (x, i) {
        if (i === Math.min(4, th.length) && th.length > 6) themeBox.appendChild(h('div', { class: 'label', style: { marginTop: '6px' } }, 'Needs work'));
        themeBox.appendChild(h('div', null, h('div', { class: 'row between small' }, h('span', null, Puzzles.NAMES[x.t]), h('span', { class: 'faint' }, Math.round(x.r * 100) + '% of ' + x.n)), UI.meter(x.r, x.r >= 0.7 ? 'green' : '')));
      });
      else themeBox.appendChild(h('div', { class: 'muted small' }, 'Solve a few more puzzles to see your strong and weak themes.'));
      g2.appendChild(h('div', { class: 'card stack' }, h('h3', null, 'Learning'),
        progressRow('Lessons finished', lessonsDone, lessonsTotal), progressRow('Opening lines learned', linesDone, linesTotal),
        (function () { var n = S.mistakes.items.filter(function (x) { return !x.gone; }).length;
          return h('p', { class: 'muted small' }, n ? U.plural(n, 'position') + ' from your own games saved to retry.' : 'Review a game to save your mistakes for practice.'); })(),
        h('div', { class: 'label', style: { marginTop: '6px' } }, 'Puzzle themes'), themeBox));
      root.appendChild(g2);
      function progressRow(label, a, b) { return h('div', null, h('div', { class: 'row between small', style: { marginBottom: '6px' } }, h('span', null, label), h('span', { class: 'num' }, a + ' of ' + b)), UI.meter(b ? a / b : 0, 'green')); }
    }
  });

  /* ---------- where progress is saved, kept current while Preferences is open ---------- */
  function saveStatus() {
    var err = Store.saveError;
    if (Store.synced()) return { alert: false, text: 'Your progress is saved to your account and syncs across your devices whenever you open this page on claude.ai.' + (err ? ' This browser can’t keep its own copy right now.' : '') };
    if (err === 'full') return { alert: true, text: 'Your progress can’t be saved in this browser because its storage is full. Copy your progress code or save a file to keep it.' };
    if (err === 'blocked') return { alert: true, text: 'Your progress can’t be saved because this browser is blocking storage for this page. Copy your progress code or save a file to keep it.' };
    if (err) return { alert: true, text: 'Your progress couldn’t be saved in this browser. Copy your progress code or save a file to keep it.' };
    return { alert: false, text: 'Your progress is saved in this browser.' };
  }
  function paintSave(el) {
    el = el || document.getElementById('save-status');
    if (!el) return null;
    var s = saveStatus();
    el.textContent = s.text;
    el.className = s.alert ? 'feedback no' : 'muted small';
    return el;
  }
  function sizeText(n) { return n < 1024 ? U.plural(n, 'byte') : n < 1048576 ? Math.round(n / 1024) + ' KB' : (n / 1048576).toFixed(1) + ' MB'; }

  /* saved progress Tempo couldn't read, kept aside instead of saved over */
  function paintCopies(box) {
    box = box || document.getElementById('kept-copies');
    if (!box) return;
    U.clear(box);
    var list = Store.copies();
    box.hidden = !list.length;
    if (!list.length) return;
    var card = h('div', { class: 'card stack' }, h('h3', null, 'Progress that couldn’t be read'),
      h('p', { class: 'muted small' }, 'Tempo found saved progress in this browser that it couldn’t read, and kept ' + (list.length === 1 ? 'a copy' : 'each copy') +
        ' instead of saving over it. Download it to keep it somewhere safe, and delete it once you don’t need it.'));
    if (list.some(function (c) { return c.inPlace; })) {
      card.appendChild(h('p', { class: 'feedback no' }, 'There wasn’t room to move it aside, so it’s still where your progress is normally saved. New progress won’t be saved in this browser until you delete it.'));
    }
    list.forEach(function (c, i) {
      var name = 'tempo-unreadable-' + U.dayKey() + (list.length > 1 ? '-' + (i + 1) : '') + '.txt';
      var row = h('div', { class: 'row' }, h('span', { class: 'grow small' }, (list.length > 1 ? 'Copy ' + (i + 1) : 'Kept copy') + ', ' + sizeText(c.size)));
      if (U.canSaveFile()) row.appendChild(h('button', { class: 'btn small', type: 'button', onclick: function () {
        var t = Store.copyText(c.id); if (t == null) return;
        U.saveFile(name, t, 'text/plain').then(function (ok) { if (!ok) App.toast('Saving files isn’t allowed here. Use Copy instead.'); });
      } }, U.icon('download'), 'Download'));
      row.appendChild(h('button', { class: 'btn small', type: 'button', onclick: function () {
        var t = Store.copyText(c.id); if (t == null) return;
        U.copyText(t, null).then(function (ok) {
          if (ok) { App.toast('Copied'); return; }
          // no clipboard here: show the text so it can be selected by hand
          var box2 = card.querySelector('textarea') || card.appendChild(h('textarea', { readonly: true, 'aria-label': 'Text of the copy' }));
          box2.value = t; box2.focus(); box2.select();
          App.toast('Select the text in the box to copy it');
        });
      } }, U.icon('copy'), 'Copy'));
      row.appendChild(h('button', { class: 'btn small danger', type: 'button', onclick: function () {
        App.confirm('Delete this copy?', 'Tempo couldn’t read it, so deleting it doesn’t change your current progress. This can’t be undone.', 'Delete', true).then(function (ok) {
          if (!ok) return;
          App.toast(Store.dropCopy(c.id) ? 'Copy deleted' : 'The copy couldn’t be deleted');
          paintCopies(); paintSave();
        });
      } }, U.icon('trash'), 'Delete'));
      card.appendChild(row);
    });
    box.appendChild(card);
  }
  Store.on(function (what) { if (what === 'storage') { paintSave(); paintCopies(); } });

  function engineText() {
    var s = Engines.status;
    if (s === 'failed') return 'Stockfish isn’t available here, so Tempo uses its own built-in engine.';
    if (s !== 'ready') return 'Stockfish is starting…';
    var th = Engines.threads > 1 ? ' on ' + Engines.threads + ' threads' : '';
    if (Engines.kind === 'full') return 'Stockfish 19 at full strength is running in this browser' + th + '.';
    return 'Stockfish 19 (the lite build) is running in this browser' + th + '.';
  }
  if (Engines.onStatus) Engines.onStatus(function () { var el = document.getElementById('engine-about'); if (el) el.textContent = engineText(); });
  function mb(n) { return Math.round(n / 1048576); }

  /* The Engine card. On the site, with the page cross-origin isolated, it also offers the full-strength engine: a 94 MB
     download kept on this device (Cache Storage), switched on and off here. Elsewhere it's the status line alone. */
  function engineCard() {
    var card = h('div', { class: 'card stack' }, h('h3', null, 'Engine'), h('p', { class: 'muted', id: 'engine-about' }, engineText()));
    if (!Engines.site || !Engines.isolated() || !Engines.fullSize()) return card;
    var S = Store.state.settings, size = mb(Engines.fullSize());
    var box = h('div');
    card.appendChild(box);
    function paint(cached) {
      U.clear(box);
      var on = !!S.fullEngine && cached;
      var sub = 'Downloads the full Stockfish 19 (' + size + ' MB) to this device once, and uses it for reviews and the strongest characters. The lite build is right for nearly every game; the full one judges hard positions a little better.';
      box.appendChild(Play.toggle('Full-strength engine', sub, on, function (v) {
        if (v) { S.fullEngine = true; Store.touch('settings'); if (cached) { Engines.restart().then(function () { App.toast('Full-strength engine on'); }); } else download(); }
        else { S.fullEngine = false; Store.touch('settings'); Engines.restart().then(function () { App.toast('Back to the lite engine'); }); paint(cached); }
      }));
      if (cached && !on) box.appendChild(h('div', { class: 'row', style: { marginTop: '6px' } }, h('button', { class: 'btn small', type: 'button', onclick: function () {
        Engines.removeFull().then(function () { App.toast('Download deleted'); paint(false); });
      } }, U.icon('trash'), 'Delete the download (' + size + ' MB)')));
    }
    function download() {
      U.clear(box);
      var text = h('p', { class: 'muted small', 'aria-live': 'polite' }, 'Downloading the full engine…'), bar = UI.meter(0);
      box.appendChild(h('div', { style: { fontWeight: 600, marginBottom: '6px' } }, 'Full-strength engine')); box.appendChild(text); box.appendChild(bar);
      Engines.downloadFull(function (done, total) {
        text.textContent = 'Downloading the full engine… ' + mb(done) + ' of ' + (total ? mb(total) : size) + ' MB';
        var i = bar.querySelector('i'); if (i && total) i.style.width = Math.round(100 * done / total) + '%';
      }).then(function (ok) {
        if (!ok) { S.fullEngine = false; Store.touch('settings'); App.toast('The download didn’t finish. Try again later.'); paint(false); return; }
        text.textContent = 'Starting it…';
        Engines.restart().then(function () { App.toast(Engines.kind === 'full' ? 'Full-strength engine on' : 'The full engine couldn’t start here'); paint(true); });
      });
    }
    Engines.hasFull().then(paint);
    if (Engines.downloading) download();
    return card;
  }

  App.register('prefs', {
    render: function (root) {
      var S = Store.state, s = S.settings;
      Store.verify(); // so the save status below is current
      root.appendChild(h('div', { class: 'page-head' }, h('h1', null, 'Preferences')));
      var col = h('div', { class: 'stack', style: { gap: '16px', maxWidth: '720px' } });
      root.appendChild(col);
      function save() { Store.touch('settings'); App.applySettings(); }
      var look = h('div', { class: 'card' }, h('h3', { style: { marginBottom: '10px' } }, 'Appearance'));
      look.appendChild(h('div', { class: 'label', style: { margin: '6px 0 8px' } }, 'Theme'));
      look.appendChild(Play.seg([['system', 'Match device'], ['light', 'Light'], ['dark', 'Dark']], s.theme || 'system', function (v) { s.theme = v; save(); }));
      look.appendChild(h('div', { class: 'label', style: { margin: '16px 0 8px' } }, 'Board'));
      look.appendChild(Play.seg([['tempo', 'Tempo'], ['classic', 'Green'], ['walnut', 'Walnut'], ['slate', 'Slate']], s.board || 'tempo', function (v) { s.board = v; save(); preview(); }));
      var prevBox = h('div', { style: { maxWidth: '240px', marginTop: '12px' } });
      look.appendChild(prevBox);
      function preview() { U.clear(prevBox); prevBox.appendChild(UI.miniBoard('r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 3 3', 'w', { from: TempoCore.sqIndex('f1'), to: TempoCore.sqIndex('c4') })); }
      preview();
      var tg = h('div', { style: { marginTop: '8px' } });
      tg.appendChild(Play.toggle('Coordinates', 'Letters and numbers on the board edge.', s.coords !== false, function (v) { s.coords = v; save(); }));
      tg.appendChild(Play.toggle('Show legal moves', 'Dots on the squares a piece can move to.', s.dots !== false, function (v) { s.dots = v; save(); }));
      tg.appendChild(Play.toggle('Animate pieces', null, s.animate !== false, function (v) { s.animate = v; save(); }));
      tg.appendChild(Play.toggle('Sound', null, s.sound !== false, function (v) { s.sound = v; save(); }));
      look.appendChild(tg);
      col.appendChild(look);

      var play = h('div', { class: 'card' }, h('h3', { style: { marginBottom: '2px' } }, 'Play'));
      play.appendChild(Play.toggle('Always promote to a queen', 'Skips the promotion menu in games. Puzzles and lessons always ask, since the answer can be another piece.', !!s.autoQueen, function (v) { s.autoQueen = v; save(); }));
      // how much the characters talk about the game: not at all, at their own pace, or half as often again
      play.appendChild(h('div', { class: 'toggle seg-row' }, h('div', { class: 'grow' }, h('div', { style: { fontWeight: 600 } }, 'Opponent chat'),
        h('div', { class: 'muted small' }, 'What the characters say as the game happens. Occasional is each character\u2019s own pace (the quiet ones say little); Frequent is more often. Off is silent.')),
        Play.seg([['off', 'Off'], ['some', 'Occasional'], ['lots', 'Frequent']], s.chat || (s.botChat === false ? 'off' : 'some'), function (v) { s.chat = v; s.botChat = v !== 'off'; save(); })));
      play.appendChild(Play.toggle('Unlock all characters', 'Play any character without winning your way up the tiers.', !!s.unlockAll, function (v) { s.unlockAll = v; save(); }));
      col.appendChild(play);

      var data = h('div', { class: 'card stack' }, h('h3', null, 'Your progress'), paintSave(h('p', { id: 'save-status', 'aria-live': 'polite' })),
        h('p', { class: 'muted small' }, 'To take it to another device, copy your progress code (it carries everything: ratings, games, lessons, puzzles), then paste it into this box on the other device and tap Restore.'));
      var ta = h('textarea', { id: 'backup-io', 'aria-label': 'Progress code', placeholder: 'Paste a progress code here to restore it.' });
      var problem = h('div', { class: 'feedback no', role: 'alert', hidden: true });
      var copyBtn = h('button', { class: 'btn small', type: 'button', onclick: function () {
        copyBtn.disabled = true;
        Store.exportCode().then(function (code) {
          copyBtn.disabled = false;
          ta.value = code; Store.backedUp();
          U.copyText(code, ta).then(function (ok) { App.toast(ok ? 'Progress code copied' : 'Your code is in the box: select and copy it'); });
        });
      } }, U.icon('copy'), 'Copy progress code');
      var btns = h('div', { class: 'row' }, copyBtn);
      if (U.canSaveFile()) btns.appendChild(h('button', { class: 'btn small', type: 'button', onclick: function () { U.saveFile('tempo-backup-' + U.dayKey() + '.json', Store.exportJson(), 'application/json').then(function (ok) { if (ok) Store.backedUp(); else App.toast('Saving files isn’t allowed here. Use Copy progress code instead.'); }); } }, U.icon('download'), 'Save file'));
      btns.appendChild(h('button', { class: 'btn small', type: 'button', onclick: function () { U.readFile('.json,.txt').then(function (t) { if (t) restore(t); }); } }, U.icon('upload'), 'Open file'));
      btns.appendChild(h('button', { class: 'btn small primary', type: 'button', onclick: function () {
        var t = ta.value.trim(); if (!t) { App.toast('Paste a progress code first'); return; }
        restore(t);
      } }, 'Restore'));
      var BAD_CODE = 'That progress code is damaged or incomplete. Copy it again from the other device, all of it.';
      function restore(text) {
        problem.hidden = true;
        var fromCode = Store.isCode(text);
        Store.unpack(text).then(function (json) {
          if (json == null) { fail(BAD_CODE); return; }
          var why = Store.checkBackup(json);
          if (why) { fail(fromCode && why === 'That doesn’t look like a Tempo backup.' ? BAD_CODE : why); return; }
          var what = fromCode ? 'progress code' : 'backup';
          if (!Store.hasProgress()) {
            App.confirm('Restore this ' + what + '?', 'Your progress will be set from it.', 'Restore').then(function (ok) { if (ok) apply(Store.importJson(json), 'Progress restored'); });
            return;
          }
          choose(what).then(function (how) {
            if (how === 'replace') apply(Store.importJson(json), 'Progress restored');
            else if (how === 'merge') apply(Store.mergeJson(json), 'Progress combined');
          });
        });
      }
      function fail(text) { problem.textContent = text; problem.hidden = false; }
      function apply(err, done) { if (err) fail(err); else { ta.value = ''; App.toast(done); } }
      /* there's progress here already: replace it, or combine the two? */
      function choose(what) {
        return new Promise(function (resolve) {
          var answered = false;
          App.sheet(function (box, api) {
            function pick(v) { answered = true; api.close(); resolve(v); }
            box.appendChild(h('h2', null, 'Restore this ' + what + '?'));
            box.appendChild(h('p', { class: 'muted' }, 'There’s progress on this device already.'));
            box.appendChild(h('div', { class: 'stack', style: { gap: '10px', marginTop: '14px' } },
              h('button', { class: 'btn primary', type: 'button', onclick: function () { pick('merge'); } }, 'Combine them'),
              h('p', { class: 'muted small', style: { margin: '-4px 0 0' } }, 'Keeps the newer ratings, and every lesson, game and saved mistake from both.'),
              h('button', { class: 'btn', type: 'button', onclick: function () { pick('replace'); } }, 'Replace what’s here'),
              h('p', { class: 'muted small', style: { margin: '-4px 0 0' } }, 'The progress on this device is thrown away.')));
            box.appendChild(h('div', { class: 'row end', style: { marginTop: '14px' } }, h('button', { class: 'btn quiet', type: 'button', onclick: function () { pick(null); } }, 'Cancel')));
          }, { onClose: function () { if (!answered) resolve(null); } });
        });
      }
      data.appendChild(ta); data.appendChild(problem); data.appendChild(btns);
      data.appendChild(h('div', { class: 'row', style: { marginTop: '6px' } }, h('button', { class: 'btn small danger', type: 'button', onclick: function () {
        App.confirm('Reset all progress?', 'Ratings, games, lessons and puzzle history will be cleared. Preferences stay.', 'Reset', true).then(function (ok) { if (ok) { Store.reset(); App.toast('Progress reset'); } });
      } }, U.icon('trash'), 'Reset progress')));
      col.appendChild(data);
      var kept = h('div', { id: 'kept-copies' });
      col.appendChild(kept);
      paintCopies(kept);

      col.appendChild(engineCard());
      col.appendChild(h('div', { class: 'card stack small' }, h('h3', null, 'About'),
        h('p', { class: 'muted' }, 'Stockfish 19 is free software by the Stockfish developers (GNU GPL v3), compiled for the web as stockfish.js by Nathan Rugg. Puzzles and opening names come from the Lichess open database (CC0). Fonts: DM Sans and DM Serif Display (SIL Open Font License). Pieces, lessons and bots were made for Tempo.')));
    }
  });
})();
