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
    if (err === 'full') return { alert: true, text: 'Your progress can’t be saved in this browser because its storage is full. Copy or save a backup to keep it.' };
    if (err === 'blocked') return { alert: true, text: 'Your progress can’t be saved because this browser is blocking storage for this page. Copy or save a backup to keep it.' };
    if (err) return { alert: true, text: 'Your progress couldn’t be saved in this browser. Copy or save a backup to keep it.' };
    return { alert: false, text: 'Your progress is saved in this browser. Use a backup to move it to another device.' };
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
    return 'Engine: ' + (s === 'ready' ? 'Stockfish 10 is running in this browser.' : s === 'failed' ? 'Stockfish isn’t available here, so Tempo uses its own built-in engine.' :
      'Stockfish is still loading. Until it’s ready, Tempo uses its own built-in engine.');
  }
  if (Engines.onStatus) Engines.onStatus(function () { var el = document.getElementById('engine-about'); if (el) el.textContent = engineText(); });

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

      var data = h('div', { class: 'card stack' }, h('h3', null, 'Your progress'), paintSave(h('p', { id: 'save-status', 'aria-live': 'polite' })));
      var ta = h('textarea', { id: 'backup-io', 'aria-label': 'Backup code', placeholder: 'Paste a backup here to restore it.' });
      var problem = h('div', { class: 'feedback no', role: 'alert', hidden: true });
      var btns = h('div', { class: 'row' },
        h('button', { class: 'btn small', type: 'button', onclick: function () { var j = Store.exportJson(); ta.value = j; Store.backedUp(); U.copyText(j, ta).then(function (ok) { App.toast(ok ? 'Backup copied' : 'Backup is in the box below: select and copy it'); }); } }, U.icon('copy'), 'Copy backup'));
      if (U.canSaveFile()) btns.appendChild(h('button', { class: 'btn small', type: 'button', onclick: function () { U.saveFile('tempo-backup-' + U.dayKey() + '.json', Store.exportJson(), 'application/json').then(function (ok) { if (ok) Store.backedUp(); else App.toast('Saving files isn’t allowed here. Use Copy backup instead.'); }); } }, U.icon('download'), 'Save file'));
      btns.appendChild(h('button', { class: 'btn small', type: 'button', onclick: function () { U.readFile('.json,.txt').then(function (t) { if (t) restore(t); }); } }, U.icon('upload'), 'Open file'));
      btns.appendChild(h('button', { class: 'btn small primary', type: 'button', onclick: function () {
        var t = ta.value.trim(); if (!t) { App.toast('Paste a backup first'); return; }
        restore(t);
      } }, 'Restore'));
      function restore(text) {
        problem.hidden = true;
        var why = Store.checkBackup(text);
        if (why) { problem.textContent = why; problem.hidden = false; return; }
        App.confirm('Restore this backup?', 'It replaces your current progress.', 'Restore').then(function (ok) {
          if (!ok) return;
          var err = Store.importJson(text);
          if (err) { problem.textContent = err; problem.hidden = false; return; }
          App.toast('Backup restored');
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

      col.appendChild(h('div', { class: 'card stack small' }, h('h3', null, 'About'),
        h('p', { class: 'muted', id: 'engine-about' }, engineText()),
        h('p', { class: 'muted' }, 'Stockfish is free software by the Stockfish developers (GNU GPL v3), compiled for the web by Nathan Rugg. Puzzles and opening names come from the Lichess open database (CC0). Fonts: DM Sans and DM Serif Display (SIL Open Font License). Pieces, lessons and bots were made for Tempo.')));
    }
  });
})();
