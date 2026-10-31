/* Tempo puzzles: rated, themed, streak, timed rush and the daily puzzle. */
var Puzzles = (function () {
  'use strict';
  var h = U.h, C = TempoCore;
  var THEMES = {
    tactics: { label: 'Tactics', items: { fork: 'Fork', pin: 'Pin', skewer: 'Skewer', discoveredAttack: 'Discovered attack', doubleCheck: 'Double check', hangingPiece: 'Hanging piece',
      trappedPiece: 'Trapped piece', deflection: 'Deflection', attraction: 'Attraction', capturingDefender: 'Remove the defender', clearance: 'Clearance', interference: 'Interference',
      intermezzo: 'In-between move', xRayAttack: 'X-ray attack', sacrifice: 'Sacrifice', quietMove: 'Quiet move', defensiveMove: 'Defensive move', discoveredCheck: 'Discovered check',
      exposedKing: 'Exposed king', kingsideAttack: 'Kingside attack', queensideAttack: 'Queenside attack', attackingF2F7: 'Attacking f2 or f7', advancedPawn: 'Advanced pawn', promotion: 'Promotion',
      zugzwang: 'Zugzwang', underPromotion: 'Underpromotion', enPassant: 'En passant' } },
    mates: { label: 'Checkmates', items: { mateIn1: 'Mate in 1', mateIn2: 'Mate in 2', mateIn3: 'Mate in 3', mateIn4: 'Mate in 4', mateIn5: 'Mate in 5 or more', backRankMate: 'Back-rank mate',
      smotheredMate: 'Smothered mate', anastasiaMate: 'Anastasia’s mate', arabianMate: 'Arabian mate', bodenMate: 'Boden’s mate', hookMate: 'Hook mate', operaMate: 'Opera mate',
      pillsburysMate: 'Pillsbury’s mate', epauletteMate: 'Epaulette mate', dovetailMate: 'Dovetail mate', cornerMate: 'Corner mate', morphysMate: 'Morphy’s mate', triangleMate: 'Triangle mate',
      swallowstailMate: 'Swallow’s tail mate', blindSwineMate: 'Blind swine mate' } },
    phases: { label: 'Game phase', items: { opening: 'Opening', middlegame: 'Middlegame', endgame: 'Endgame', rookEndgame: 'Rook endgame', pawnEndgame: 'Pawn endgame', bishopEndgame: 'Bishop endgame',
      knightEndgame: 'Knight endgame', queenEndgame: 'Queen endgame', queenRookEndgame: 'Queen and rook endgame' } },
    length: { label: 'Length', items: { oneMove: 'One move', short: 'Two moves', long: 'Three moves', veryLong: 'Four or more moves', crushing: 'Win decisively', advantage: 'Win an advantage', master: 'From master games' } }
  };
  var NAMES = {}; Object.keys(THEMES).forEach(function (g) { Object.assign(NAMES, THEMES[g].items); });
  NAMES.mate = 'Checkmate';

  /* the ideas a beginner meets first, shown ahead of the full list */
  var STARTER = ['fork', 'pin', 'skewer', 'hangingPiece', 'discoveredAttack', 'mateIn1', 'mateIn2', 'backRankMate'];

  /* one plain line on each idea, shown when a theme session starts */
  var DEFS = {
    fork: 'One piece attacks two or more pieces at the same time.',
    pin: 'A piece can’t move without exposing a more valuable piece behind it.',
    skewer: 'A valuable piece is attacked, and when it moves, the piece behind it can be taken.',
    hangingPiece: 'An enemy piece is undefended, or not defended enough. Take it.',
    discoveredAttack: 'Move one piece out of the way to uncover an attack by the piece behind it.',
    mateIn1: 'Find the move that checkmates right away.',
    mateIn2: 'Force checkmate in two moves.',
    mateIn3: 'Force checkmate in three moves.',
    mateIn4: 'Force checkmate in four moves.',
    mateIn5: 'Force checkmate in five moves or more.',
    backRankMate: 'A rook or queen checkmates a king trapped behind its own pawns on the back rank.',
    doubleCheck: 'Two pieces give check at once, so the king has to move.',
    discoveredCheck: 'Move a piece aside to uncover a check from the piece behind it.',
    trappedPiece: 'An enemy piece has no safe square left. Attack it and win it.',
    deflection: 'Force a defending piece away from the piece or square it guards.',
    attraction: 'Lure an enemy piece, often the king, onto a square where it can be attacked.',
    capturingDefender: 'Capture the piece that guards something, then win what it was guarding.',
    clearance: 'Move a piece out of the way so another piece can use its square or line.',
    interference: 'Put a piece between an enemy piece and the square it defends.',
    intermezzo: 'Before the expected move, play a stronger one first, usually a check or a threat.',
    xRayAttack: 'A piece attacks or defends through another piece on the same line.',
    sacrifice: 'Give up material now to win more later, or to checkmate.',
    quietMove: 'A move with no check or capture that sets up a threat your opponent can’t meet.',
    defensiveMove: 'Find the move that stops your opponent’s threat.',
    exposedKing: 'Attack a king that has few pieces left to shield it.',
    kingsideAttack: 'Attack a king that has castled on the kingside.',
    queensideAttack: 'Attack a king that has castled on the queenside.',
    attackingF2F7: 'Attack the weak pawn next to the king on f2 or f7.',
    advancedPawn: 'A pawn close to promoting is the key to the position.',
    promotion: 'Get a pawn to the last rank and turn it into a new piece.',
    underPromotion: 'Promote a pawn to a knight, rook or bishop instead of a queen.',
    enPassant: 'Capture a pawn that has just moved two squares, as it passes yours.',
    zugzwang: 'Your opponent has to move, and every move makes things worse.',
    smotheredMate: 'A knight checkmates a king hemmed in by its own pieces.',
    anastasiaMate: 'A knight and a rook or queen trap the king on the edge of the board.',
    arabianMate: 'A rook and a knight checkmate the king in the corner.',
    bodenMate: 'Two bishops on crossing diagonals checkmate the king.',
    hookMate: 'A rook, a knight and a pawn work together to checkmate.',
    operaMate: 'A rook checkmates on the back rank, protected by a bishop.',
    pillsburysMate: 'A rook checkmates while a bishop keeps the king from escaping.',
    morphysMate: 'A bishop checkmates while a rook keeps the king in the corner.',
    cornerMate: 'A rook or queen and a knight checkmate a king stuck in the corner.',
    epauletteMate: 'The king is checkmated with its own pieces blocking both sides of it.',
    dovetailMate: 'A queen checkmates right next to the king while its own pieces block its escape.',
    blindSwineMate: 'Two rooks on the seventh rank team up to checkmate.'
  };

  /* the lesson that teaches each puzzle theme */
  var THEME_LESSON = { fork: 'fork', pin: 'pin', skewer: 'skewer', discoveredAttack: 'discovered-attack', discoveredCheck: 'discovered-attack', doubleCheck: 'discovered-attack',
    hangingPiece: 'free-pieces', trappedPiece: 'trapped-piece', deflection: 'deflection-decoy', attraction: 'deflection-decoy', capturingDefender: 'remove-defender',
    backRankMate: 'back-rank', smotheredMate: 'smothered-mate', mateIn1: 'mating-patterns', mateIn2: 'mating-patterns', promotion: 'passed-pawns', advancedPawn: 'passed-pawns', zugzwang: 'opposition',
    underPromotion: 'special-moves', enPassant: 'special-moves', rookEndgame: 'rook-endgames', pawnEndgame: 'king-pawn' };
  var NOT_IDEAS = /^(short|long|veryLong|oneMove|middlegame|endgame|opening|advantage|crushing|master|masterVsMaster|superGM)$/;
  var PIECE = ['', 'pawn', 'knight', 'bishop', 'rook', 'queen', 'king'];
  var RUSH_MS = 180000;

  /* ---------- selection ---------- */
  function pickNear(list, target, opts) {
    opts = opts || {};
    var bits = Store.seenBits(), lo = 0, hi = list.length - 1;
    while (lo < hi) { var mid = (lo + hi) >> 1; if (list[mid].rating < target) lo = mid + 1; else hi = mid; }
    // a theme can be rare near your rating (every "Remove the defender" puzzle is rated far above 600), so look through all of it
    var a = opts.theme ? 0 : Math.max(0, lo - 400), z = opts.theme ? list.length : Math.min(list.length, lo + 400);
    for (var w = 75; w <= 6400; w *= 2) {
      var cands = [];
      for (var i = a; i < z; i++) {
        var p = list[i];
        if (Math.abs(p.rating - target) > w) continue;
        if (opts.theme && p.themes.indexOf(opts.theme) < 0) continue;
        if (!opts.allowSeen && (bits[p.i >> 3] >> (p.i & 7)) & 1) continue;
        if (opts.exclude && opts.exclude[p.id]) continue;
        cands.push(p);
      }
      if (cands.length) return (opts.rng ? cands[Math.floor(opts.rng() * cands.length)] : U.pick(cands));
    }
    if (!opts.allowSeen) return pickNear(list, target, Object.assign({}, opts, { allowSeen: true }));
    return null;
  }
  function dailyPuzzle(list) {
    var S = Store.state.puzzles, k = U.dayKey();
    if (S.dailyPick && S.dailyPick.day === k) {
      var hit = list.filter(function (x) { return x.id === S.dailyPick.id; })[0];
      if (hit) return hit;
    }
    var seed = 0; for (var i = 0; i < k.length; i++) seed = (seed * 31 + k.charCodeAt(i)) >>> 0;
    var p = pickNear(list, S.rating, { allowSeen: false, rng: U.rng(seed) }) || pickNear(list, S.rating, { allowSeen: true, rng: U.rng(seed) });
    if (p) { S.dailyPick = { day: k, id: p.id }; Store.touch('puzzles'); }
    return p;
  }
  function markSeen(p) { var bits = Store.seenBits(); bits[p.i >> 3] |= 1 << (p.i & 7); Store.saveBits(bits); }
  /* the ideas a puzzle teaches, for the chips after it */
  function ideaThemes(p) {
    var list = p.themes.filter(function (t) { return NAMES[t] && !NOT_IDEAS.test(t); });
    if (list.some(function (t) { return /^mateIn/.test(t); })) list = list.filter(function (t) { return t !== 'mate'; });
    return list;
  }

  /* ---------- rating ----------
     score: 1 solved, 0 missed, between for a solve with a hint. A hinted solve never raises the rating,
     and it always costs less than a miss. */
  function rate(p, score) {
    var S = Store.state.puzzles, before = S.rating, n = S.count;
    var K = n < 20 ? 40 : n < 60 ? 24 : 16;
    var exp = 1 / (1 + Math.pow(10, (p.rating - before) / 400));
    var d = K * (score - exp);
    if (score > 0 && score < 1) d = Math.min(0, d);
    S.rating = Math.max(100, Math.round(before + d));
    S.count++; if (score === 1) S.solved++;
    S.hist.push([Date.now(), S.rating]); if (S.hist.length > 600) S.hist.shift();
    p.themes.forEach(function (t) { if (!NAMES[t]) return; var x = S.themes[t] || (S.themes[t] = [0, 0]); x[0]++; if (score === 1) x[1]++; });
    Store.touch('puzzles');
    Store.activity('p');
    return S.rating - before;
  }

  /* One line on why a wrong move fails, when it's cheap to know without an engine; null otherwise. */
  function wrongReason(position, m) {
    var before = position.clone(), after = before.clone(); after.make(m);
    var san = before.san(m), me = before.side, to = (m >> 7) & 127, i;
    var replies = after.legalMoves();
    for (i = 0; i < replies.length; i++) {
      after.make(replies[i]);
      var mated = after.inCheck() && after.legalMoves().length === 0;
      after.unmake();
      if (mated) return 'After ' + san + ', your opponent has checkmate with ' + after.san(replies[i]) + '.';
    }
    var v = after.b[to];
    if (v && Math.abs(v) !== 6 && after.hangingLoss(to) >= 100) return 'After ' + san + ', your opponent can win your ' + PIECE[Math.abs(v)] + '.';
    var worst = null;
    for (var q = 0; q < 120; q++) {
      if (q & 8) { q += 7; continue; }
      var x = after.b[q];
      if (!x || q === to || (x > 0 ? 1 : -1) !== me || Math.abs(x) === 6) continue;
      var loss = after.hangingLoss(q);
      if (loss >= 300 && before.hangingLoss(q) < 100 && (!worst || loss > worst.loss)) worst = { sq: q, loss: loss, t: Math.abs(x) };
    }
    if (worst) return 'After ' + san + ', your opponent can win your ' + PIECE[worst.t] + ' on ' + C.sqName(worst.sq) + '.';
    return null;
  }

  /* ---------- menu ---------- */
  var allOpen = false;
  function renderMenu(root) {
    var S = Store.state.puzzles;
    root.appendChild(h('div', { class: 'page-head' }, h('h1', null, 'Puzzles')));
    var modes = h('nav', { class: 'menu-list', 'aria-label': 'Puzzle modes', style: { maxWidth: '640px' } });
    modes.appendChild(UI.menuRow('puzzle', 'Rated puzzles', 'Your rating ' + S.rating, function () { start({ mode: 'rated' }); }));
    modes.appendChild(UI.menuRow('fire', 'Streak', S.streakBest ? 'Your best is ' + S.streakBest : null, function () { start({ mode: 'streak' }); }));
    modes.appendChild(UI.menuRow('clock', 'Rush', S.rushBest ? 'Your best is ' + S.rushBest : null, function () { start({ mode: 'rush' }); }));
    root.appendChild(modes);
    var weak = weakest();
    if (weak) root.appendChild(h('div', { class: 'resume', style: { marginTop: '16px', maxWidth: '640px' } },
      h('p', { class: 'grow' }, 'Your weakest theme is ', h('b', null, NAMES[weak.t].toLowerCase()), '. You’ve solved ' + Math.round(weak.rate * 100) + '% of the ' + weak.n + ' you’ve tried.'),
      h('button', { class: 'btn small primary', type: 'button', onclick: function () { start({ mode: 'theme', theme: weak.t }); } }, 'Practice it')));
    var sec = h('section', { class: 'pz-themes', 'aria-label': 'Practice a theme' }, h('h2', null, 'Practice a theme'));
    root.appendChild(sec);
    var box = h('div', { class: 'stack', style: { gap: '22px' } }, h('div', { class: 'muted' }, 'Loading puzzles…'));
    sec.appendChild(box);
    Data.puzzles().then(function (list) {
      U.clear(box);
      var counts = {};
      list.forEach(function (p) { p.themes.forEach(function (t) { counts[t] = (counts[t] || 0) + 1; }); });
      var first = h('div', { class: 'pills' });
      STARTER.forEach(function (t) { if ((counts[t] || 0) >= 10) first.appendChild(themePill(t)); });
      if (first.children.length) box.appendChild(h('div', null, h('h3', null, 'Start with these'), first));
      var groups = h('div', { class: 'pz-groups' }), total = 0;
      Object.keys(THEMES).forEach(function (g) {
        var pills = h('div', { class: 'pills' });
        Object.keys(THEMES[g].items).forEach(function (t) { if ((counts[t] || 0) >= 10) { pills.appendChild(themePill(t)); total++; } });
        if (pills.children.length) groups.appendChild(h('section', null, h('h3', null, THEMES[g].label), pills));
      });
      var all = h('details', { class: 'pz-all' },
        h('summary', null, h('span', { class: 'grow' }, 'All themes'), h('span', { class: 'n' }, String(total)), U.icon('next', 'chev')), groups);
      all.open = allOpen;
      all.addEventListener('toggle', function () { allOpen = all.open; });
      box.appendChild(all);
    }, function () { U.clear(box); box.appendChild(h('p', { class: 'muted' }, 'The puzzles couldn’t be loaded in this browser.')); });
  }
  /* a percentage means little until a few puzzles are in; before that the chip counts what you've solved */
  var PCT_MIN = 5;
  function themePill(t) {
    var mine = Store.state.puzzles.themes[t], tried = mine ? mine[0] : 0, solved = mine ? mine[1] : 0;
    var pct = tried >= PCT_MIN ? Math.round(solved / tried * 100) : null;
    var tag = pct != null ? pct + '%' : tried ? solved + ' of ' + tried : null;
    var said = pct != null ? pct + '% solved' : tried ? solved + ' of ' + tried + ' solved' : '';
    return h('button', { class: 'pill', type: 'button', onclick: function () { start({ mode: 'theme', theme: t }); },
      'aria-label': NAMES[t] + (said ? ', ' + said : '') },
      NAMES[t], tag ? h('span', { class: 'pct ' + (pct == null ? 'few' : pct >= 75 ? 'good' : pct >= 50 ? 'mid' : 'low') }, tag) : null);
  }
  function weakest() {
    var S = Store.state.puzzles.themes, best = null;
    Object.keys(S).forEach(function (t) {
      var x = S[t]; if (!NAMES[t] || x[0] < 6 || /^(short|long|veryLong|oneMove|middlegame|endgame|opening|advantage|crushing|master|mate)$/.test(t)) return;
      var r = x[1] / x[0];
      if (!best || r < best.rate) best = { t: t, rate: r, n: x[0] };
    });
    return best && best.rate < 0.8 ? best : null;
  }

  /* ---------- sessions ----------
     A session is one visit to a mode. Its spec travels in the view params, so the browser's Back and
     Forward buttons can open the same mode again. */
  var session = null, P = null, seq = 0;
  function start(spec) {
    var params = { solving: true, sid: ++seq, mode: spec.mode || 'rated', theme: spec.theme || null, single: spec.single || null, from: spec.from || null };
    session = makeSession(params, !!spec.go);
    App.go('puzzles', params);
  }
  function makeSession(params, go) {
    var S = Store.state.puzzles, s = {
      id: params.sid, mode: params.mode || 'rated', theme: params.theme || null, single: params.single || null, from: params.from || null,
      streak: 0, solved: 0, strikes: 0, target: null, endAt: null, done: false, reason: null, history: [], count: 0,
      missed: [], retried: {}, retrying: null, best0: 0, started: true, left: false, hintNoted: false
    };
    if (s.mode === 'theme' && !NAMES[s.theme]) s.mode = 'rated';
    if (s.mode === 'streak') { s.target = Math.max(400, S.rating - 300); s.best0 = S.streakBest || 0; }
    if (s.mode === 'rush') { s.target = Math.max(400, S.rating - 400); s.best0 = S.rushBest || 0; s.started = go; }
    return s;
  }

  function renderSolve(root, s) {
    App.focus(true);
    var origin = s.from === 'home' ? 'home' : 'puzzles';
    var chip = h('span', { class: 'chip' });
    root.appendChild(h('div', { class: 'row between', style: { marginBottom: '10px' } },
      h('button', { class: 'back', type: 'button', onclick: goBack }, U.icon('back'), origin === 'home' ? 'Home' : 'Puzzles'), chip));
    var board = new Board({ orient: 'w', coords: Store.state.settings.coords !== false, autoQueen: false, onMove: onMove });
    var status = h('div', { class: 'card stack pz-status' }), extra = h('div', { class: 'stack' });
    // what changes is read out from here, so the ticking rush clock isn't
    var voice = h('div', { class: 'sr-only', 'aria-live': 'polite' }), said = '';
    root.appendChild(h('div', { class: 'arena' }, h('div', { class: 'board-col' }, board.el), h('div', { class: 'panel' }, status, extra)));
    root.appendChild(voice);
    var st = { s: s, board: board, p: null, pos: null, idx: 0, last: null, userSide: 1, failed: false, shown: false, solvedNow: false, rated: false,
      hint: 0, hintMax: 0, hintAt: 0, hintText: null, hintNote: false, delta: null, why: null, token: 0, timer: null, phase: null };
    P = st; s.left = false;

    /* what the current puzzle is: a rated one, part of a run, or a second try at a missed one */
    function kind() { return s.retrying ? 'retry' : s.single === 'daily' ? 'daily' : s.mode; }
    function live() { return P === st && (!s.done || !!s.retrying); }
    function rates() { var k = kind(); return k === 'rated' || k === 'theme' || (k === 'daily' && Store.state.puzzles.dailyRated !== U.dayKey()); }
    function tools() { var k = kind(); return k !== 'streak' && k !== 'rush'; }
    function score() { return s.mode === 'rush' ? s.solved : s.streak; }
    function title() {
      if (s.retrying) return 'Try again';
      if (s.single === 'daily') return 'Daily puzzle';
      if (s.mode === 'streak') return 'Streak';
      if (s.mode === 'rush') return 'Rush';
      if (s.mode === 'theme') return NAMES[s.theme] || 'Theme';
      return 'Rated';
    }
    function sideName(side) { return side === 1 ? 'White' : 'Black'; }

    /* the question to ask before leaving a run part way, or null when there's nothing to lose */
    function leaveQuestion() {
      var running = (s.mode === 'streak' || s.mode === 'rush') && s.started && !s.done && score() > 0;
      if (!running) return null;
      var n = score();
      return { title: 'End this run?', text: 'You’ve solved ' + U.plural(n, 'puzzle') + ' so far.' + (n > s.best0 ? ' That’s a new best, and it’s saved.' : ''), ok: 'End run' };
    }
    st.guard = leaveQuestion; // the tab bar and the browser's Back ask the same question
    function goBack() {
      var q = leaveQuestion();
      if (!q) { App.go(origin); return; }
      App.confirm(q.title, q.text, q.ok).then(function (yes) { if (yes && P === st) App.go(origin); });
    }
    /* a run's best is saved as it grows, so leaving a run part way never loses it */
    function saveBest() {
      var S = Store.state.puzzles;
      if (s.mode === 'streak' && s.streak > (S.streakBest || 0)) { S.streakBest = s.streak; Store.touch('puzzles'); }
      if (s.mode === 'rush' && s.solved > (S.rushBest || 0)) { S.rushBest = s.solved; Store.touch('puzzles'); }
    }

    /* ---------- loading ---------- */
    function next() {
      var tok = ++st.token;
      st.p = null;
      Data.puzzles().then(function (list) {
        if (tok !== st.token || !live()) return;
        var p = pick(list);
        if (!p) { board.setMovable(null); renderStatus('empty'); return; }
        load(p);
      }, function () { if (tok === st.token && live()) renderStatus('empty'); });
    }
    function pick(list) {
      var S = Store.state.puzzles, today = U.dayKey();
      if (s.single === 'daily') return dailyPuzzle(list);
      var ex = {};
      s.history.forEach(function (x) { ex[x] = 1; });
      // today's puzzle is kept for the daily until it has been rated
      if (S.dailyPick && S.dailyPick.day === today && S.dailyRated !== today) ex[S.dailyPick.id] = 1;
      if (s.mode === 'streak' || s.mode === 'rush') return pickNear(list, s.target, { exclude: ex });
      return pickNear(list, S.rating, { theme: s.mode === 'theme' ? s.theme : null, exclude: ex });
    }
    function load(p) {
      st.p = p; st.idx = 0; st.last = null; st.failed = false; st.shown = false; st.solvedNow = false;
      st.hint = 0; st.hintMax = 0; st.hintAt = 0; st.hintText = null; st.hintNote = false; st.delta = null; st.why = null;
      st.rated = rates();
      if (!s.retrying) { s.history.push(p.id); s.count++; }
      st.pos = new C.Pos(p.fen);
      st.userSide = -st.pos.side;
      board.setOrientation(st.userSide === 1 ? 'w' : 'b');
      board.setMovable(null);
      board.setPosition(st.pos, { animate: false, last: null, clearLast: true });
      board.clearDecor();
      renderStatus('wait');
      var tok = st.token;
      setTimeout(function () {
        if (tok !== st.token || !live()) return;
        var m = st.pos.parseMove(p.moves[0]);
        st.pos.make(m); st.idx = 1; st.last = m;
        U.sound.move();
        board.setPosition(st.pos, { last: m, animate: true });
        board.setMovable(st.userSide === 1 ? 'w' : 'b');
        renderStatus('turn');
      }, 550);
    }
    function sound(pos, m) { var fl = m >>> 17; if (pos.inCheck()) U.sound.check(); else if (fl & 1) U.sound.capture(); else U.sound.move(); }
    function myTurn() { return !!st.p && st.idx % 2 === 1 && st.idx < st.p.moves.length && !st.shown && !st.solvedNow; }

    /* ---------- moves ---------- */
    function onMove(uci, m) {
      var p = st.p;
      if (!live() || !myTurn()) { if (st.pos) board.setPosition(st.pos, { last: st.last, animate: false }); return; }
      var expected = p.moves[st.idx];
      var after = st.pos.clone(); after.make(m);
      var finalPly = st.idx === p.moves.length - 1;
      var mateAlt = finalPly && after.status().reason === 'checkmate';
      if (uci === expected || mateAlt) {
        st.pos.make(m); st.idx++; st.last = m;
        sound(st.pos, m);
        board.setPosition(st.pos, { last: m, animate: true });
        board.setArrows([]); board.setMarks([]);
        st.hint = 0; st.hintText = null;
        if (st.idx >= p.moves.length) return solved();
        board.setMovable(null);
        renderStatus('good');
        var tok = st.token;
        setTimeout(function () {
          if (tok !== st.token || !live()) return;
          var r = st.pos.parseMove(p.moves[st.idx]);
          st.pos.make(r); st.idx++; st.last = r;
          sound(st.pos, r);
          board.setPosition(st.pos, { last: r, animate: true });
          board.setMovable(st.userSide === 1 ? 'w' : 'b');
          renderStatus('turn');
        }, 420);
        return;
      }
      U.sound.bad();
      board.setMovable(null);
      board.setPosition(after, { last: m, animate: true });
      st.why = wrongReason(st.pos, m);
      var first = !st.failed;
      st.failed = true;
      if (first) failedOnce();
      if (!live()) return; // that was the run's last miss
      var k = kind();
      renderStatus('wrong');
      var tok2 = st.token;
      setTimeout(function () {
        if (tok2 !== st.token || !live()) return;
        board.setPosition(st.pos, { last: st.last, animate: true });
        if (k === 'rush') { next(); return; }
        if (k === 'streak') { endRun('miss'); return; }
        board.setMovable(st.userSide === 1 ? 'w' : 'b');
      }, 650);
    }

    function failedOnce() {
      var p = st.p, k = kind();
      if (k === 'retry') return;
      markSeen(p);
      if (st.rated) { st.delta = rate(p, 0); if (k === 'daily') noteDailyRated(); }
      if (k === 'streak') s.missed.push({ p: p });
      if (k === 'rush') { s.strikes++; s.missed.push({ p: p }); if (s.strikes >= 3) endRun('strikes'); }
    }
    function noteDailyRated() { Store.state.puzzles.dailyRated = U.dayKey(); Store.touch('puzzles'); }

    function solved() {
      var p = st.p, k = kind(), S = Store.state.puzzles;
      board.setMovable(null);
      U.sound.good();
      st.solvedNow = true;
      if (k === 'retry') { s.retried[p.id] = 'solved'; renderStatus('solved'); return; }
      if (!st.failed) {
        markSeen(p);
        if (st.rated) { st.delta = rate(p, st.hintMax ? (st.hintMax >= 2 ? 0.25 : 0.5) : 1); if (k === 'daily') noteDailyRated(); }
      }
      if (k === 'daily') { S.daily = U.dayKey(); Store.touch('puzzles'); }
      if (k === 'streak') {
        s.streak++; s.target += 30; saveBest(); Store.activity('p');
        renderStatus('solved');
        var tok = st.token;
        setTimeout(function () { if (tok === st.token && live()) next(); }, 900);
        return;
      }
      if (k === 'rush') { s.solved++; s.target += 40; saveBest(); Store.activity('p'); next(); return; }
      renderStatus('solved');
    }

    /* the end of a streak or a rush: reason is 'time', 'strikes' or 'miss' */
    function endRun(reason) {
      if (s.done) return;
      s.done = true; s.reason = reason;
      st.token++;
      clearInterval(st.timer); st.timer = null;
      saveBest();
      board.setMovable(null);
      board.setArrows([]); board.setMarks([]);
      if (st.p && st.pos) {
        board.setPosition(st.pos, { last: st.last, animate: true });
        if (reason === 'time' && st.idx > 0 && !st.failed && !st.solvedNow) s.missed.push({ p: st.p, unfinished: true });
      }
      renderStatus('over');
    }
    function beginRush() {
      s.started = true;
      s.endAt = Date.now() + RUSH_MS;
      clearInterval(st.timer);
      st.timer = setInterval(function () {
        if (P !== st || s.done) { clearInterval(st.timer); return; }
        var left = s.endAt - Date.now(), el = status.querySelector('.pz-clock');
        if (el) { el.textContent = U.clockText(Math.max(0, left)); el.classList.toggle('low', left < 10000); }
        if (left <= 0) endRun('time');
      }, 200);
      next();
    }

    /* ---------- help ---------- */
    function hint() {
      if (!live() || !myTurn() || !board.canMove()) return;
      var now = Date.now();
      // two steps, the piece then the move; taps while a hint is still landing don't count
      if (st.hint >= 2 || now - st.hintAt < 450) return;
      st.hintAt = now;
      st.hint++; st.hintMax = Math.max(st.hintMax, st.hint);
      var u = st.p.moves[st.idx], from = u.slice(0, 2), to = u.slice(2, 4), m = st.pos.parseMove(u);
      var piece = PIECE[Math.abs(st.pos.b[C.sqIndex(from)])] || 'piece';
      board.setMarks([{ sq: from, kind: 'hint' }]);
      if (st.hint === 1) st.hintText = 'Look at your ' + piece + ' on ' + from + '.';
      else { board.setArrows([{ from: from, to: to, color: 'green' }]); st.hintText = 'Play ' + (m ? st.pos.san(m) : u) + '.'; }
      if (st.rated && !st.failed && !s.hintNoted) { s.hintNoted = true; st.hintNote = true; }
      renderStatus('turn');
    }
    function showAnswer() {
      var p = st.p;
      if (!live() || !p || st.solvedNow || st.shown) return;
      if (!st.failed) { st.failed = true; failedOnce(); }
      st.shown = true;
      board.setMovable(null); board.setMarks([]); board.setArrows([]);
      board.setPosition(st.pos, { last: st.last, animate: false });
      var tok = ++st.token;
      renderStatus('showing');
      (function step() {
        if (tok !== st.token || !live()) return;
        if (st.idx >= p.moves.length) {
          if (s.retrying) s.retried[p.id] = 'shown';
          renderStatus('shown');
          return;
        }
        var user = st.idx % 2 === 1, m = st.pos.parseMove(p.moves[st.idx]);
        st.pos.make(m); st.idx++; st.last = m;
        sound(st.pos, m);
        board.setPosition(st.pos, { last: m, animate: true });
        board.setArrows(user ? [{ from: C.sqName(m & 127), to: C.sqName((m >> 7) & 127), color: 'green' }] : []);
        setTimeout(step, 700);
      })();
    }
    /* play the answer again from the start, at a pace you can follow */
    function replayAnswer() {
      var p = st.p; if (!p) return;
      var tok = ++st.token;
      var pos = new C.Pos(p.fen), m0 = pos.parseMove(p.moves[0]);
      pos.make(m0);
      board.setMovable(null); board.setArrows([]); board.setMarks([]);
      board.setPosition(pos, { last: m0, animate: true });
      var i = 1;
      setTimeout(function step() {
        if (tok !== st.token || P !== st || i >= p.moves.length) return;
        var m = pos.parseMove(p.moves[i]); if (!m) return;
        var user = i % 2 === 1;
        pos.make(m); i++;
        sound(pos, m);
        board.setPosition(pos, { last: m, animate: true });
        board.setArrows(user ? [{ from: C.sqName(m & 127), to: C.sqName((m >> 7) & 127), color: 'green' }] : []);
        setTimeout(step, 900);
      }, 700);
    }
    function retry(p) {
      st.token++;
      s.retrying = p;
      load(p);
    }
    function backToResults() {
      st.token++;
      s.retrying = null;
      board.setMovable(null); board.setArrows([]); board.setMarks([]);
      renderStatus('over');
    }

    /* ---------- the panel ---------- */
    function fb(kind, text, sub, subCls) {
      return h('div', { class: 'feedback ' + kind }, h('div', null, text), sub ? h('div', { class: subCls || 'pz-why' }, sub) : null);
    }
    function lede() {
      if (s.retrying || s.count !== 1) return null;
      if (s.mode === 'streak') return h('p', { class: 'pz-lede' }, 'Each puzzle a little harder. One miss ends the run.');
      if (s.mode === 'theme' && DEFS[s.theme]) return h('p', { class: 'pz-lede' }, h('b', null, NAMES[s.theme] + '.'), ' ' + DEFS[s.theme]);
      if (s.mode === 'rated' && !s.single) return h('p', { class: 'pz-lede' }, 'These puzzles match your rating. It goes up when you solve one and down when you miss one.');
      return null;
    }
    function runHead() {
      if (s.retrying) return null;
      var S = Store.state.puzzles;
      if (s.mode === 'streak') {
        var best = Math.max(S.streakBest || 0, s.streak);
        return h('div', { class: 'row between' }, h('div', { class: 'stat' }, h('span', { class: 'label' }, 'Streak'), h('b', null, String(s.streak))),
          best ? h('span', { class: 'faint small' }, 'Best ' + best) : null);
      }
      if (s.mode !== 'rush' || !s.started) return null;
      var strikes = h('div', { class: 'pz-strikes' }, h('span', { class: 'label' }, 'Misses'));
      var rings = h('span', { class: 'pz-rings', role: 'img', 'aria-label': s.strikes + ' of 3 misses used' });
      for (var i = 0; i < 3; i++) rings.appendChild(h('span', { class: 'pz-strike' + (i < s.strikes ? ' used' : '') }, i < s.strikes ? U.icon('close') : null));
      strikes.appendChild(rings);
      var left = Math.max(0, (s.endAt || Date.now() + RUSH_MS) - Date.now());
      return h('div', { class: 'stack', style: { gap: '10px' } },
        h('div', { class: 'row between' }, h('div', { class: 'stat' }, h('span', { class: 'label' }, 'Solved'), h('b', null, String(s.solved))),
          h('div', { class: 'stat', style: { textAlign: 'right' } }, h('span', { class: 'label' }, 'Time'), h('b', { class: 'pz-clock' + (left < 10000 && s.endAt ? ' low' : '') }, U.clockText(left)))),
        strikes);
    }
    function renderStatus(phase) {
      // keep keyboard focus in the panel when it's rebuilt: on the same control, or the nearest one left
      var a = document.activeElement, had = a && status.contains(a) ? a.getAttribute('data-k') : null;
      if (had) st.wantFocus = had;
      paint(phase);
      var fbEl = status.querySelector('.feedback, h2') || status.querySelector('.turn-pill');
      var msg = fbEl ? fbEl.textContent : '';
      if (msg && msg !== said) { said = msg; voice.textContent = msg; }
      if (!st.wantFocus) return;
      var order = [st.wantFocus, 'answer', 'next'];
      for (var i = 0; i < order.length; i++) {
        var el = status.querySelector('[data-k="' + order[i] + '"]:not([disabled])');
        if (el) { try { el.focus({ preventScroll: true }); } catch (e) { /* ignore */ } st.wantFocus = null; return; }
      }
    }
    function paint(phase) {
      st.phase = phase;
      U.clear(status); U.clear(extra);
      chip.textContent = title();
      var p = st.p, k = kind(), head = runHead();
      if (head) status.appendChild(head);
      if (phase === 'intro') {
        status.appendChild(h('p', { class: 'pz-lede' }, 'Solve as many puzzles as you can in three minutes. They start easy and get harder. Three misses end the run.'));
        if (s.best0) status.appendChild(h('div', { class: 'faint small' }, 'Your best is ' + s.best0 + '.'));
        status.appendChild(h('button', { class: 'btn primary block', type: 'button', onclick: beginRush }, 'Start'));
        return;
      }
      if (phase === 'over') return renderOver();
      if (phase === 'empty') {
        status.appendChild(h('p', { class: 'muted' }, 'No more puzzles here right now.'));
        status.appendChild(h('div', { class: 'row' }, h('button', { class: 'btn primary', type: 'button', onclick: function () { App.go(origin); } }, 'Done')));
        return;
      }
      if (!p) { status.appendChild(h('div', { class: 'muted' }, 'Loading…')); return; }
      var ld = phase === 'wait' || phase === 'turn' ? lede() : null;
      if (ld) status.appendChild(ld);
      if (phase === 'wait') { status.appendChild(h('div', { class: 'muted' }, 'Watch your opponent’s move…')); return; }
      if (phase === 'turn' || phase === 'good' || phase === 'wrong' || phase === 'showing') {
        status.appendChild(UI.turnPill(st.userSide, sideName(st.userSide) + ' to move. Find the best move.'));
        if (phase === 'good') status.appendChild(fb('ok', 'Correct. Keep going.'));
        else if (phase === 'wrong') {
          if (k === 'rush') status.appendChild(fb('no', 'Not the move. ' + (s.strikes >= 2 ? 'One miss left.' : 'Two misses left.')));
          else if (k === 'streak') status.appendChild(fb('no', 'Not the move.', st.why));
          // with no specific reason to give, point at the beginner's checklist
          else status.appendChild(fb('no', 'Not the move. Try again.', st.why || 'Look at checks, captures and threats first.'));
        } else if (phase === 'showing') status.appendChild(fb('info', 'Here’s the answer.'));
        else if (st.hintText) status.appendChild(fb('info', st.hintText, st.hintNote ? 'A hint lowers what this puzzle is worth.' : null, 'pz-note'));
        if (tools() && phase !== 'showing') {
          status.appendChild(h('div', { class: 'row' },
            h('button', { class: 'btn small', type: 'button', 'data-k': 'hint', disabled: st.hint >= 2, onclick: hint }, U.icon('hint'), 'Hint'),
            h('button', { class: 'btn small quiet', type: 'button', 'data-k': 'answer', onclick: showAnswer }, 'Show the answer')));
        }
        if (k !== 'rush' && k !== 'retry') status.appendChild(h('div', { class: 'faint small' }, 'Puzzle rated ' + (k === 'streak' ? 'about ' + Math.round(p.rating / 50) * 50 : p.rating)));
        return;
      }
      if (phase === 'solved' || phase === 'shown') {
        var msg;
        if (phase === 'shown') msg = 'Here’s the answer.';
        else if (k === 'retry' || !st.failed) msg = st.hintMax ? 'Solved with a hint.' : 'Solved.';
        else msg = st.rated ? 'Solved. Your first try counted as a miss.' : 'Solved.';
        status.appendChild(fb(phase === 'solved' && (!st.failed || k === 'retry') ? 'ok' : 'info', msg));
        if (st.delta != null && k !== 'streak') status.appendChild(ratingLine());
        else if (k === 'daily' && !st.rated) status.appendChild(h('div', { class: 'faint small' }, 'Today’s puzzle counts once, so this try isn’t rated.'));
        if (k === 'streak') return; // the next one comes up by itself
        var row = h('div', { class: 'row' });
        if (k === 'retry') row.appendChild(h('button', { class: 'btn primary', type: 'button', 'data-k': 'next', onclick: backToResults }, 'Back to results'));
        else if (k === 'daily') row.appendChild(h('button', { class: 'btn primary', type: 'button', 'data-k': 'next', onclick: function () { s.single = null; s.mode = 'rated'; next(); } }, 'More puzzles'));
        else row.appendChild(h('button', { class: 'btn primary', type: 'button', 'data-k': 'next', onclick: next }, 'Next puzzle'));
        status.appendChild(row);
        extra.appendChild(answerCard(p));
      }
    }
    function ratingLine() {
      var d = st.delta;
      return h('div', null, 'Puzzle rating ', h('b', null, String(Store.state.puzzles.rating)), ' ',
        d ? h('span', { class: 'delta ' + (d > 0 ? 'up' : 'down') }, (d > 0 ? '+' : '−') + Math.abs(d)) : h('span', { class: 'faint' }, 'unchanged'));
    }
    function renderOver() {
      var n = score(), best = n > s.best0;
      status.appendChild(h('h2', null, s.mode === 'rush' ? (s.reason === 'strikes' ? 'Three misses' : 'Time’s up') : 'Streak over'));
      status.appendChild(h('p', { class: 'muted' }, 'You solved ' + U.plural(n, 'puzzle') + (s.mode === 'streak' ? ' in a row.' : '.') +
        (best ? ' That’s a new best.' : s.best0 ? ' Your best is ' + s.best0 + '.' : '')));
      if (s.mode === 'streak' && st.why) status.appendChild(h('p', null, st.why));
      status.appendChild(h('div', { class: 'row' },
        h('button', { class: 'btn primary', type: 'button', onclick: function () { start({ mode: s.mode, go: true, from: s.from }); } }, 'Play again'),
        h('button', { class: 'btn', type: 'button', onclick: function () { App.go(origin); } }, 'Done')));
      if (!s.missed.length) return;
      var list = h('nav', { class: 'menu-list pz-missed', 'aria-label': 'Puzzles to try again' });
      s.missed.forEach(function (x) { list.appendChild(missedRow(x)); });
      extra.appendChild(h('h3', { class: 'pz-h3' }, 'Try these again'));
      extra.appendChild(list);
    }
    function missedRow(x) {
      var p = x.p, pos = new C.Pos(p.fen), m0 = pos.parseMove(p.moves[0]);
      pos.make(m0);
      var done = s.retried[p.id], sub = done === 'solved' ? 'Solved on a second try' : done === 'shown' ? 'You saw the answer' : x.unfinished ? 'Time ran out on this one' : 'Rated ' + p.rating;
      return h('button', { class: 'menu-row', type: 'button', onclick: function () { retry(p); } },
        h('span', { class: 'pz-thumb', 'aria-hidden': 'true' }, UI.miniBoard(pos.fen(), pos.side === 1 ? 'w' : 'b', m0)),
        h('span', { class: 'txt' }, h('span', { class: 't' }, sideName(pos.side) + ' to move'), h('span', { class: 's' }, sub)),
        done === 'solved' ? U.icon('check', 'won') : null, U.icon('next', 'chev'));
    }
    function answerLine(p) {
      var pos = new C.Pos(p.fen); pos.make(pos.parseMove(p.moves[0]));
      var sol = Explain.sanLine(pos, p.moves.slice(1), 20), start0 = pos.full, white = pos.side === 1, text = '';
      sol.forEach(function (san, i) {
        var isW = (i % 2 === 0) === white;
        if (isW) text += (start0 + Math.floor((i + (white ? 0 : 1)) / 2)) + '. ';
        else if (i === 0) text += start0 + '... ';
        text += san + ' ';
      });
      return text.trim();
    }
    function answerCard(p) {
      var card = h('div', { class: 'card stack pz-answer' });
      card.appendChild(h('div', null, h('div', { class: 'label' }, 'Answer'), h('div', { class: 'pz-line' }, answerLine(p))));
      card.appendChild(h('div', { class: 'row' },
        h('button', { class: 'btn small', type: 'button', onclick: replayAnswer }, U.icon('refresh'), 'Replay the answer'),
        h('button', { class: 'btn small', type: 'button', onclick: function () { Train.analysis(p.fen, p.moves.slice(), 1); } }, U.icon('analyze'), 'Analysis board')));
      var themes = ideaThemes(p), others = themes.filter(function (t) { return !(s.mode === 'theme' && t === s.theme); });
      if (others.length) {
        var chips = h('div', { class: 'pills' });
        others.slice(0, 5).forEach(function (t) {
          chips.appendChild(h('button', { class: 'pill small', type: 'button', 'aria-label': 'Practice ' + NAMES[t].toLowerCase() + ' puzzles',
            onclick: function () { start({ mode: 'theme', theme: t, from: s.from }); } }, NAMES[t]));
        });
        card.appendChild(h('div', null, h('div', { class: 'label', style: { marginBottom: '8px' } }, 'More like this'), chips));
      }
      var lessonId = null;
      themes.some(function (t) { lessonId = THEME_LESSON[t] || null; return !!lessonId; });
      var found = lessonId && Data.lesson(lessonId);
      if (found) card.appendChild(h('div', { class: 'row' }, h('button', { class: 'btn small quiet', type: 'button', onclick: function () { Learn.open(lessonId); } }, U.icon('book'), 'Lesson: ' + found.lesson.title)));
      card.appendChild(h('a', { class: 'pz-link', href: 'https://lichess.org/training/' + p.id, target: '_blank', rel: 'noopener' }, 'Open on Lichess'));
      return card;
    }

    st.api = { hint: hint, showAnswer: showAnswer, replay: replayAnswer, kind: kind };
    if (s.mode === 'rush' && !s.started) {
      board.setPosition(new C.Pos(), { animate: false, clearLast: true });
      renderStatus('intro');
    } else if (s.mode === 'rush') beginRush();
    else next();
  }
  function stopSession() {
    if (P) { clearInterval(P.timer); P.timer = null; P.token++; P.s.left = true; }
    P = null;
  }

  App.register('puzzles', {
    render: function (root, params) {
      if (params && params.solving) {
        // opened again from the browser's history: start that mode afresh
        if (!session || session.id !== params.sid || session.left) session = makeSession(params, false);
        renderSolve(root, session);
      } else renderMenu(root);
    },
    leave: function () { stopSession(); },
    guard: function () { return P && P.guard ? P.guard() : null; },
    busy: function () { return !!P; }
  });

  return {
    /* opts.from: 'home' when Home opens it, so its back link returns there */
    daily: function (opts) {
      var from = (opts && opts.from) || null;
      if (Store.state.puzzles.daily === U.dayKey()) start({ mode: 'rated', from: from });
      else start({ mode: 'rated', single: 'daily', from: from });
    },
    themed: function (t) { start({ mode: 'theme', theme: t }); },
    dailyInfo: function () { return Data.puzzles().then(function (list) { var p = dailyPuzzle(list); return p ? { rating: p.rating, themes: p.themes.filter(function (t) { return NAMES[t] && !/^(short|long|veryLong|oneMove|middlegame|endgame|opening|advantage|crushing|master|masterVsMaster|superGM|mate)$/.test(t); }).map(function (t) { return NAMES[t]; }) } : null; }); },
    /* the position the solver sees for today's puzzle */
    dailyPosition: function () {
      return Data.puzzles().then(function (list) {
        var p = dailyPuzzle(list); if (!p) return null;
        var pos = new C.Pos(p.fen), m = pos.parseMove(p.moves[0]); if (!m) return null;
        pos.make(m);
        return { fen: pos.fen(), side: pos.side, last: m, rating: p.rating };
      });
    },
    _cur: function () { return P && P.p ? { id: P.p.id, fen: P.p.fen, moves: P.p.moves, idx: P.idx, rating: P.p.rating } : null; },
    /* for tests: the state of the session on screen */
    _state: function () {
      var s = session; if (!s) return null;
      return { mode: s.mode, single: s.single, from: s.from, started: s.started, done: s.done, reason: s.reason, solved: s.solved, streak: s.streak, strikes: s.strikes,
        missed: s.missed.map(function (x) { return x.p.id; }), retrying: s.retrying ? s.retrying.id : null, phase: P ? P.phase : null,
        hint: P ? P.hint : null, hintMax: P ? P.hintMax : null, rated: P ? P.rated : null, kind: P && P.api ? P.api.kind() : null };
    },
    /* for tests: the puzzle a theme session would start with at your rating */
    _pickFor: function (t) { return Data.puzzles().then(function (list) { var p = pickNear(list, Store.state.puzzles.rating, { theme: t }); return p ? p.id : null; }); },
    wrongReason: wrongReason,
    NAMES: NAMES,
    DEFS: DEFS
  };
})();
