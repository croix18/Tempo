/* Tempo progress and preferences. */
(function () {
  'use strict';
  var h = U.h;

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

      // activity heatmap: last 18 weeks
      var heat = h('div', { class: 'heat', role: 'img', 'aria-label': 'Practice days over the last 18 weeks' });
      var d = new Date(); d.setDate(d.getDate() - (7 * 18 - 1) - d.getDay());
      for (var i = 0; i < 7 * 18; i++) {
        var k = U.dayKey(d), rec = S.days.map[k], n = rec ? (rec.g || 0) + (rec.p || 0) + (rec.l || 0) : 0;
        heat.appendChild(h('i', { class: n >= 15 ? 'l3' : n >= 6 ? 'l2' : n >= 1 ? 'l1' : '', title: k + (n ? ': ' + n + ' activities' : '') }));
        d.setDate(d.getDate() + 1);
      }
      root.appendChild(h('div', { class: 'card stack', style: { marginTop: '14px' } },
        h('div', { class: 'row between' }, h('h3', null, 'Practice'), h('span', { class: 'chip gold' }, U.icon('fire'), Store.streak() + ' day streak')), heat));

      // records
      var totals = { w: 0, d: 0, l: 0 }, rows = h('div', { class: 'list' });
      TempoBots.BOTS.forEach(function (b) {
        var r = S.play.bots[b.id]; if (!r) return;
        totals.w += r.w; totals.d += r.d; totals.l += r.l;
        rows.appendChild(h('div', { class: 'list-row' }, UI.avatar(b, 'sm'), h('div', { class: 'grow' }, h('b', null, b.name), r.beaten ? h('span', { class: 'chip green', style: { marginLeft: '8px' } }, 'Beaten') : null),
          h('span', { class: 'num' }, r.w + ' won · ' + r.d + ' drawn · ' + r.l + ' lost')));
      });
      var units = Data.lessons(), lessonsTotal = 0, lessonsDone = 0;
      units.forEach(function (u) { u.lessons.forEach(function (l) { lessonsTotal++; if (S.learn.done[l.id]) lessonsDone++; }); });
      var reps = Data.reps(), linesTotal = 0, linesDone = 0;
      reps.repertoires.forEach(function (r) { r.lines.forEach(function (ln) { linesTotal++; var x = S.openings.lines[r.id + '/' + ln.id]; if (x && x.learned) linesDone++; }); });
      var g2 = h('div', { class: 'grid two', style: { marginTop: '14px' } });
      g2.appendChild(h('div', { class: 'card stack' }, h('h3', null, 'Against the bots'),
        h('div', { class: 'row' }, stat('Won', totals.w), stat('Drawn', totals.d), stat('Lost', totals.l)),
        rows.children.length ? rows : h('div', { class: 'muted small' }, 'No games yet.')));
      var themeBox = h('div', { class: 'stack', style: { gap: '8px' } });
      var th = Object.keys(S.puzzles.themes).filter(function (t) { return Puzzles.NAMES[t] && S.puzzles.themes[t][0] >= 5 && !/^(short|long|veryLong|oneMove|middlegame|endgame|opening|advantage|crushing|master|mate)$/.test(t); })
        .map(function (t) { var x = S.puzzles.themes[t]; return { t: t, r: x[1] / x[0], n: x[0] }; }).sort(function (a, b) { return b.r - a.r; });
      if (th.length) th.slice(0, 4).concat(th.length > 6 ? th.slice(-3) : []).forEach(function (x, i, arr) {
        if (i === Math.min(4, th.length) && th.length > 6) themeBox.appendChild(h('div', { class: 'label', style: { marginTop: '6px' } }, 'Needs work'));
        themeBox.appendChild(h('div', null, h('div', { class: 'row between small' }, h('span', null, Puzzles.NAMES[x.t]), h('span', { class: 'faint' }, Math.round(x.r * 100) + '% of ' + x.n)), UI.meter(x.r, x.r >= 0.7 ? 'green' : '')));
      });
      else themeBox.appendChild(h('div', { class: 'muted small' }, 'Solve a few more puzzles to see your strong and weak themes.'));
      g2.appendChild(h('div', { class: 'card stack' }, h('h3', null, 'Learning'),
        h('div', { class: 'row' }, stat('Lessons', lessonsDone + '/' + lessonsTotal), stat('Opening lines', linesDone + '/' + linesTotal), stat('Mistakes saved', S.mistakes.items.length)),
        h('div', { class: 'label', style: { marginTop: '6px' } }, 'Puzzle themes'), themeBox));
      root.appendChild(g2);
      function stat(label, v) { return h('div', { class: 'stat grow' }, h('span', { class: 'label' }, label), h('b', { style: { fontSize: '24px' } }, String(v))); }
    }
  });

  App.register('prefs', {
    render: function (root) {
      var S = Store.state, s = S.settings;
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
      tg.appendChild(Play.toggle('Always promote to a queen', 'Skips the promotion menu.', !!s.autoQueen, function (v) { s.autoQueen = v; save(); }));
      tg.appendChild(Play.toggle('Opponent chat', 'Short lines from the bots during games.', s.botChat !== false, function (v) { s.botChat = v; save(); }));
      tg.appendChild(Play.toggle('Unlock all opponents', 'Play any bot without beating the ones before it.', !!s.unlockAll, function (v) { s.unlockAll = v; save(); }));
      look.appendChild(tg);
      col.appendChild(look);

      var data = h('div', { class: 'card stack' }, h('h3', null, 'Your progress'),
        h('p', { class: 'muted small' }, Store.synced() ? 'Your progress is saved to your account and syncs across your devices whenever you open this page on claude.ai.' : 'Your progress is saved in this browser. Use a backup to move it to another device.'));
      var ta = h('textarea', { id: 'backup-io', 'aria-label': 'Backup code', placeholder: 'Paste a backup here to restore it.' });
      var btns = h('div', { class: 'row' },
        h('button', { class: 'btn small', type: 'button', onclick: function () { var j = Store.exportJson(); ta.value = j; U.copyText(j, ta).then(function (ok) { App.toast(ok ? 'Backup copied' : 'Backup is in the box below: select and copy it'); }); } }, U.icon('copy'), 'Copy backup'));
      if (U.canSaveFile()) btns.appendChild(h('button', { class: 'btn small', type: 'button', onclick: function () { U.saveFile('tempo-backup-' + U.dayKey() + '.json', Store.exportJson(), 'application/json').then(function (ok) { if (!ok) App.toast('Saving files isn’t allowed here. Use Copy backup instead.'); }); } }, U.icon('download'), 'Save file'));
      btns.appendChild(h('button', { class: 'btn small', type: 'button', onclick: function () { U.readFile('.json,.txt').then(function (t) { if (t) { ta.value = t; } }); } }, U.icon('upload'), 'Open file'));
      btns.appendChild(h('button', { class: 'btn small primary', type: 'button', onclick: function () {
        var t = ta.value.trim(); if (!t) { App.toast('Paste a backup first'); return; }
        App.confirm('Restore this backup?', 'It replaces the progress saved here.', 'Restore').then(function (ok) { if (!ok) return; var err = Store.importJson(t); App.toast(err || 'Backup restored'); });
      } }, 'Restore'));
      data.appendChild(ta); data.appendChild(btns);
      data.appendChild(h('div', { class: 'row', style: { marginTop: '6px' } }, h('button', { class: 'btn small danger', type: 'button', onclick: function () {
        App.confirm('Reset all progress?', 'Ratings, games, lessons and puzzle history will be cleared. Preferences stay.', 'Reset', true).then(function (ok) { if (ok) { Store.reset(); App.toast('Progress reset'); } });
      } }, U.icon('trash'), 'Reset progress')));
      col.appendChild(data);

      col.appendChild(h('div', { class: 'card stack small' }, h('h3', null, 'About'),
        h('p', { class: 'muted' }, 'Engine: ' + (Engines.status === 'ready' ? 'Stockfish 10 is running in this browser.' : Engines.status === 'failed' ? 'Stockfish isn’t available here, so Tempo uses its own built-in engine.' : 'Stockfish is loading.')),
        h('p', { class: 'muted' }, 'Stockfish is free software by the Stockfish developers (GNU GPL v3), compiled for the web by Nathan Rugg. Puzzles and opening names come from the Lichess open database (CC0). Fonts: DM Sans and DM Serif Display (SIL Open Font License). Pieces, lessons and bots were made for Tempo.')));
    }
  });
})();
