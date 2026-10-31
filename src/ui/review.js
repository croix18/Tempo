/* Tempo review: move classification, plain-language explanations, the coach, and the review screen. */
var PIECE_NAME = ['', 'pawn', 'knight', 'bishop', 'rook', 'queen', 'king'];
var PIECE_VAL = [0, 1, 3, 3, 5, 9, 0];

var Explain = (function () {
  'use strict';
  var C = TempoCore;
  function matFor(pos, side) {
    var s = 0;
    for (var q = 0; q < 120; q++) {
      if (q & 8) { q += 7; continue; }
      var p = pos.b[q]; if (!p) continue;
      s += (p > 0 ? 1 : -1) * PIECE_VAL[Math.abs(p)];
    }
    return s * side;
  }
  function sanLine(pos, pv, n) {
    var p = pos.clone(), out = [];
    for (var i = 0; i < pv.length && i < n; i++) {
      var m = p.parseMove(pv[i]); if (!m) break;
      out.push(p.san(m)); p.make(m);
    }
    return out;
  }
  function attackedValuables(pos, sq, owner) {
    // enemy pieces (of owner's opponent) attacked by the piece on sq, worth 3+ or the king
    var p = pos.b[sq]; if (!p) return [];
    var side = p > 0 ? 1 : -1, out = [];
    var save = pos.side; pos.side = side;
    var buf = new Int32Array(256), n = pos.gen(buf, 0, true);
    pos.side = save;
    for (var i = 0; i < n; i++) {
      var m = buf[i];
      if ((m & 127) !== sq) continue;
      var to = (m >> 7) & 127, v = pos.b[to];
      if (!v || (v > 0 ? 1 : -1) === side) continue;
      var t = Math.abs(v);
      if (t >= 2) out.push({ sq: to, type: t });
    }
    // checks count as attacking the king
    var kingSq = side === 1 ? pos.bk : pos.wk;
    if (pos.attackersOf(kingSq, side).indexOf(sq) >= 0 && !out.some(function (x) { return x.type === 6; })) out.push({ sq: kingSq, type: 6 });
    return out;
  }

  /* Why was move m (from position `before`) bad? reply: engine line after m (opponent to move). best: engine best before. */
  function bad(before, m, reply, best) {
    var mover = before.side, after = before.clone(); after.make(m);
    var moveSan = before.san(m);
    var pv = (reply && reply.pv) || [];
    var r = { title: 'This move loses material', text: '', short: '', topic: 'position' };
    if (reply && reply.mate != null && reply.mate > 0) {
      var line = sanLine(after, pv, Math.min(pv.length, reply.mate * 2 - 1));
      r.title = reply.mate === 1 ? 'This allows checkmate' : 'This allows a forced checkmate';
      r.text = reply.mate === 1 ? 'Your opponent can answer ' + line[0] + ', and that’s checkmate.' : 'Your opponent has a mating attack starting with ' + line[0] + '.';
      r.short = (line[0] || 'The reply') + ' would have led to checkmate.';
      r.topic = 'threats';
      return r;
    }
    var p = after.clone(), start = matFor(p, mover), firstLoss = null, worst = start, steps = Math.min(pv.length, 4);
    for (var i = 0; i < steps; i++) {
      var mm = p.parseMove(pv[i]); if (!mm) break;
      var cap = p.moveCaptured(mm);
      if (cap && !firstLoss && (cap > 0 ? 1 : -1) === mover && i % 2 === 0) firstLoss = { type: Math.abs(cap), sq: (mm >> 7) & 127, san: p.san(mm), byType: Math.abs(p.b[mm & 127]), idx: i };
      p.make(mm);
      if (i % 2 === 1 || i === steps - 1) worst = Math.min(worst, matFor(p, mover));
    }
    var loss = start - worst;
    var replySan = pv.length ? sanLine(after, pv, 1)[0] : null;
    // fork by the reply?
    if (pv.length) {
      var rp = after.clone(), rm = rp.parseMove(pv[0]);
      if (rm) {
        rp.make(rm);
        var targets = attackedValuables(rp, (rm >> 7) & 127);
        if (targets.length >= 2 && loss >= 2) {
          var names = targets.slice(0, 2).map(function (t) { return t.type === 6 ? 'king' : PIECE_NAME[t.type] + ' on ' + C.sqName(t.sq); });
          r.title = 'This allows a fork';
          r.text = replySan + ' attacks your ' + names[0] + ' and ' + names[1] + ' at the same time.';
          r.short = replySan + ' would have forked your ' + names[0] + ' and ' + names[1] + '.';
          r.topic = 'fork';
          return r;
        }
      }
    }
    // when the capture isn't the very next move, show the moves that lead to it
    var lead = firstLoss && firstLoss.idx > 0 ? sanLine(after, pv, firstLoss.idx).join(' ') : '';
    if (loss >= 2 && firstLoss) {
      var nm = PIECE_NAME[firstLoss.type], movedTo = (m >> 7) & 127;
      r.title = 'This loses your ' + nm;
      if (lead) r.text = 'After ' + lead + ', ' + firstLoss.san + ' wins your ' + nm + ' on ' + C.sqName(firstLoss.sq) + '.';
      else if (firstLoss.sq === movedTo) r.text = 'Your ' + nm + ' on ' + C.sqName(movedTo) + ' isn’t safe there. ' + firstLoss.san + ' wins it.';
      else r.text = 'After ' + moveSan + ', your ' + nm + ' on ' + C.sqName(firstLoss.sq) + ' is left open. ' + firstLoss.san + ' wins it.';
      r.short = firstLoss.san + ' would have won your ' + nm + '.';
      r.topic = 'safety';
      return r;
    }
    if (loss >= 1 && firstLoss) {
      r.title = 'This drops a pawn';
      r.text = lead ? 'After ' + lead + ', ' + firstLoss.san + ' wins your pawn on ' + C.sqName(firstLoss.sq) + '.' : firstLoss.san + ' wins your pawn on ' + C.sqName(firstLoss.sq) + '.';
      r.short = firstLoss.san + ' would have won a pawn.';
      r.topic = 'safety';
      return r;
    }
    var bestSan = null;
    if (best) { var bm = before.parseMove(best); if (bm) bestSan = before.san(bm); }
    r.title = 'This makes your position much worse';
    r.text = replySan ? 'Your opponent gets a strong reply with ' + replySan + '.' : 'This gives your opponent the upper hand.';
    r.short = bestSan ? bestSan + ' was much safer.' : 'That move would have hurt your position.';
    return r;
  }

  /* What did the best move achieve? (for missed wins) */
  function missed(before, best, bestLine) { return missedInfo(before, best, bestLine).text; }
  function missedInfo(before, best, bestLine) {
    var t = missedText(before, best, bestLine);
    var topic = /checkmate/.test(t) ? 'mates' : /fork/.test(t) ? 'fork' : /wins (a|material)/.test(t) ? 'free' : null;
    return { text: t, topic: topic };
  }
  function missedText(before, best, bestLine) {
    var bm = before.parseMove(best); if (!bm) return '';
    var san = before.san(bm), mover = before.side;
    if (bestLine && bestLine.mate != null && bestLine.mate > 0) return san + (bestLine.mate === 1 ? ' was checkmate.' : ' started a forced checkmate.');
    var p = before.clone(), start = matFor(p, mover), end = start, pv = (bestLine && bestLine.pv) || [best];
    for (var i = 0; i < Math.min(pv.length, 4); i++) { var mm = p.parseMove(pv[i]); if (!mm) break; p.make(mm); if (i % 2 === 1 || i === Math.min(pv.length, 4) - 1) end = Math.max(end, matFor(p, mover)); }
    var gain = end - start;
    if (gain >= 3) {
      var cap = before.moveCaptured(bm);
      if (cap && PIECE_VAL[Math.abs(cap)] >= 3) return san + ' wins a ' + PIECE_NAME[Math.abs(cap)] + '.';
      var after = before.clone(); after.make(bm);
      var t = attackedValuables(after, (bm >> 7) & 127);
      if (t.length >= 2) return san + ' is a fork that wins material.';
      return san + ' wins material.';
    }
    if (gain >= 1) return san + ' wins a pawn.';
    return san + ' was stronger.';
  }

  /* where to go to get better at each kind of mistake: a lesson and a puzzle theme */
  var TOPICS = {
    threats: { lesson: 'opponent-threats', theme: 'mateIn1', practice: 'Mate-in-1 puzzles' },
    fork: { lesson: 'fork', theme: 'fork', practice: 'Fork puzzles' },
    safety: { lesson: 'blunder-check', theme: 'hangingPiece', practice: 'Hanging-piece puzzles' },
    free: { lesson: 'free-pieces', theme: 'hangingPiece', practice: 'Hanging-piece puzzles' },
    mates: { lesson: 'mating-patterns', theme: 'mateIn2', practice: 'Mate-in-2 puzzles' }
  };
  /* a row of two quiet buttons: the lesson that teaches this, and puzzles to practice it */
  function studyRow(topic) {
    var t = TOPICS[topic]; if (!t) return null;
    var found = Data.lesson(t.lesson), h = U.h;
    return h('div', { class: 'study' }, h('span', { class: 'muted small' }, 'Work on this'),
      found ? h('button', { class: 'btn small quiet', type: 'button', onclick: function () { Learn.open(t.lesson); } }, U.icon('book'), found.lesson.title) : null,
      h('button', { class: 'btn small quiet', type: 'button', onclick: function () { Puzzles.themed(t.theme); } }, U.icon('puzzle'), t.practice));
  }

  return { bad: bad, missed: missed, missedInfo: missedInfo, sanLine: sanLine, matFor: matFor, studyRow: studyRow };
})();

/* The in-game coach: quick checks before a move is committed. */
var Coach = (function () {
  'use strict';
  function analyse(pos) {
    return Engines.analyse({ fen: pos.fen(), depth: Engines.strong ? 12 : 6, movetime: Engines.strong ? 700 : 500, fast: true });
  }
  function score(r) { var l = r && r.lines && r.lines[0]; if (!l) return null; return l; }
  function win(l) { return l.mate != null ? (l.mate > 0 ? 100 : 0) : U.winPct(l.cp); }
  function prepare(pos) { return analyse(pos.clone()); }
  function check(before, m, prePromise) {
    var after = before.clone(); after.make(m);
    var st = after.status();
    if (st.over) return Promise.resolve({ warn: st.reason !== 'checkmate' && st.reason !== 'stalemate' ? false : false });
    return Promise.all([prePromise || analyse(before), analyse(after)]).then(function (res) {
      var pre = score(res[0]), post = score(res[1]);
      if (!pre || !post) return { warn: false };
      var wb = win(pre), wa = 100 - win(post);
      var mateAgainst = post.mate != null && post.mate > 0 && !(pre.mate != null && pre.mate < 0);
      var drop = wb - wa;
      if (mateAgainst || (drop >= 18 && wa < 62)) {
        var why = Explain.bad(before, m, post, res[0].best);
        return { warn: true, title: why.title, text: why.text + ' Take the move back?', short: why.short };
      }
      return { warn: false };
    }).catch(function () { return { warn: false }; });
  }
  return { prepare: prepare, check: check };
})();

var Review = (function () {
  'use strict';
  var h = U.h, C = TempoCore;
  var KINDS = {
    brilliant: { label: 'Brilliant', sym: '!!' }, great: { label: 'Great move', sym: '!' }, best: { label: 'Best move', sym: '★' },
    excellent: { label: 'Excellent', sym: '✓' }, good: { label: 'Good', sym: '✓' }, book: { label: 'Book', sym: 'B' },
    inaccuracy: { label: 'Inaccuracy', sym: '?!' }, mistake: { label: 'Mistake', sym: '?' }, miss: { label: 'Missed win', sym: '×' }, blunder: { label: 'Blunder', sym: '??' }
  };
  var ORDER = ['brilliant', 'great', 'best', 'excellent', 'good', 'book', 'inaccuracy', 'mistake', 'miss', 'blunder'];
  var CODE = { brilliant: 'R', great: 'G', best: 'B', excellent: 'E', good: 'O', book: 'K', inaccuracy: 'I', mistake: 'M', miss: 'S', blunder: 'X' };
  var FROM_CODE = {}; Object.keys(CODE).forEach(function (k) { FROM_CODE[CODE[k]] = k; });

  var R = null; // current review state

  /* evaluation of each position, from White's view: { cp, mate, best, pv, second } */
  function analyseAll(startFen, moves, onProgress, isCancelled) {
    var out = [], i = 0, strong = Engines.strong;
    var n = moves.length;
    var startPos = new C.Pos(startFen);
    function step() {
      if (isCancelled()) return Promise.resolve(null);
      if (i > n) return Promise.resolve(out);
      var p = startPos.clone();
      for (var k = 0; k < i; k++) p.make(p.parseMove(moves[k]));
      var st = p.status();
      var sideMul = p.side;
      if (st.over) {
        out.push(st.reason === 'checkmate' ? { cp: null, mate: 0, mateWinner: st.winner, best: null, pv: [] } : { cp: 0, mate: null, best: null, pv: [] });
        i++; onProgress(i, n + 1); return step();
      }
      return Engines.analyse({ fen: startFen, moves: moves.slice(0, i), depth: strong ? 13 : 9, movetime: strong ? 650 : 600, multipv: strong ? 2 : 1 }).then(function (r) {
        var l = r.lines[0] || { cp: 0 }, l2 = r.lines[1] || null;
        out.push({
          cp: l.cp == null ? null : l.cp * sideMul, mate: l.mate == null ? null : l.mate * sideMul,
          best: r.best || (l.pv && l.pv[0]) || null, pv: l.pv || [],
          second: l2 ? { cp: l2.cp == null ? null : l2.cp * sideMul, mate: l2.mate == null ? null : l2.mate * sideMul, move: l2.pv[0] } : null,
          line: l
        });
        i++; onProgress(i, n + 1);
        return step();
      });
    }
    return step();
  }

  function whiteWin(e) {
    if (!e) return 50;
    if (e.mate === 0) return e.mateWinner === 1 ? 100 : 0;
    if (e.mate != null) return e.mate > 0 ? 100 : 0;
    return U.winPct(e.cp);
  }

  /* classify every move; returns { cls[], loss[], acc: {w,b}, counts: {w:{}, b:{}} } */
  function classify(startFen, moves, evals, openingMap) {
    var pos = new C.Pos(startFen), cls = [], losses = [], prevCls = null;
    var inBook = startFen === C.START_FEN && !!openingMap;
    for (var i = 0; i < moves.length; i++) {
      var m = pos.parseMove(moves[i]), mover = pos.side;
      var e0 = evals[i], e1 = evals[i + 1];
      var w0 = whiteWin(e0), w1 = whiteWin(e1);
      var before = mover === 1 ? w0 : 100 - w0, after = mover === 1 ? w1 : 100 - w1;
      var loss = Math.max(0, before - after);
      var after1 = pos.clone(); after1.make(m);
      var k;
      if (inBook && i < 24 && openingMap.has(epdOf(after1))) k = 'book';
      else {
        inBook = false;
        var isBest = e0 && e0.best === moves[i];
        if (isBest || loss < 2) k = isBest ? 'best' : 'excellent';
        else if (loss < 5) k = 'good';
        else if (loss < 10) k = 'inaccuracy';
        else if (loss < 20) k = 'mistake';
        else k = 'blunder';
        if ((k === 'mistake' || k === 'inaccuracy' || k === 'blunder') && (prevCls === 'mistake' || prevCls === 'blunder') && before >= 65 && after < before - 10 && after > 25) k = 'miss';
        if ((k === 'best' || k === 'excellent') && e0 && e0.second && before < 92 && before > 15) {
          var sw = whiteWin(e0.second), sb = mover === 1 ? sw : 100 - sw;
          if (before - sb >= 20) k = 'great';
        }
        if ((k === 'best' || k === 'excellent' || k === 'great') && before < 95 && after >= 45) {
          var to = (m >> 7) & 127, piece = Math.abs(pos.b[m & 127]);
          var lossSq = after1.hangingLoss(to);
          var cap = pos.moveCaptured(m);
          if (piece >= 2 && piece <= 5 && lossSq >= 200 && lossSq > C.SEE_VAL[Math.abs(cap)] + 150) k = 'brilliant';
        }
      }
      cls.push(k); losses.push(loss); prevCls = k;
      pos.make(m);
    }
    var acc = { w: [], b: [] }, counts = { w: {}, b: {} };
    var startSide = new C.Pos(startFen).side;
    cls.forEach(function (k, i) {
      var side = ((i % 2 === 0) === (startSide === 1)) ? 'w' : 'b';
      counts[side][k] = (counts[side][k] || 0) + 1;
      var a = 103.1668 * Math.exp(-0.04354 * losses[i]) - 3.1669;
      acc[side].push(Math.max(0, Math.min(100, a)));
    });
    function avg(xs) {
      if (!xs.length) return 100;
      var mean = xs.reduce(function (s, x) { return s + x; }, 0) / xs.length;
      var harm = xs.length / xs.reduce(function (s, x) { return s + 1 / Math.max(x, 5); }, 0);
      return (mean + harm) / 2;
    }
    return { cls: cls, loss: losses, acc: { w: avg(acc.w), b: avg(acc.b) }, counts: counts };
  }

  /* ---------- entry points ---------- */
  function openGame(id) { App.go('review', { gameId: id }); }
  function openPgn(pgn, color, label) { App.go('review', { pgn: pgn, color: color || 'w', label: label }); }

  function gameById(id) { return Store.state.games.list.filter(function (g) { return g.id === id; })[0]; }

  function renderList(root) {
    var S = Store.state;
    root.appendChild(h('div', { class: 'page-head' }, h('div', null, h('h1', null, 'Review'))));
    var grid = h('div', { class: 'grid two' });
    var games = h('div', { class: 'card' }, h('h3', { style: { marginBottom: '8px' } }, 'Your games'));
    if (!S.games.list.length) games.appendChild(h('div', { class: 'empty' }, 'Finished games show up here.', h('div', { style: { marginTop: '10px' } }, h('button', { class: 'btn primary', type: 'button', onclick: function () { App.go('play'); } }, 'Play a game'))));
    var list = h('div', { class: 'list' });
    S.games.list.slice(0, 30).forEach(function (g) {
      var bot = TempoBots.byId(g.bot);
      list.appendChild(h('button', { class: 'list-row', type: 'button', onclick: function () { openGame(g.id); } },
        bot ? UI.avatar(bot, 'sm') : h('span', { class: 'avatar sm tone-you' }, '?'),
        h('div', { class: 'grow' }, h('div', { style: { fontWeight: 700 } }, resultPhrase(g, bot ? bot.name : (g.opp || 'opponent'))),
          h('div', { class: 'muted small' }, U.dateShort(g.ts) + ', ' + U.plural(Math.ceil(g.plies / 2), 'move') + (g.reviewed ? ', ' + Math.round(g.acc) + '% accuracy' : ''))),
        g.reviewed ? h('span', { class: 'chip green' }, 'Reviewed') : null, U.icon('next')));
    });
    games.appendChild(list);
    grid.appendChild(games);
    var paste = h('div', { class: 'card stack' }, h('h3', null, 'Review any game'),
      h('p', { class: 'muted small' }, 'Paste the PGN of a game you played somewhere else, like Chess.com or Lichess. You’ll find it under Share or Download on the game page.'));
    var ta = h('textarea', { id: 'pgn-in', placeholder: '[Event "..."]\n1. e4 e5 2. Nf3 ...', 'aria-label': 'PGN' });
    var color = 'w';
    var segEl = Play.seg([['w', 'I played White'], ['b', 'I played Black']], 'w', function (v) { color = v; });
    var err = h('div', { class: 'feedback no', hidden: true });
    paste.appendChild(ta); paste.appendChild(segEl); paste.appendChild(err);
    paste.appendChild(h('div', { class: 'row' },
      h('button', { class: 'btn primary', type: 'button', onclick: function () {
        var text = ta.value.trim();
        if (!text) { err.textContent = 'Paste a PGN first.'; err.hidden = false; return; }
        var parsed = C.parsePgn(text);
        var fen = parsed.headers.FEN || C.START_FEN;
        if (C.Pos.fenError(fen)) { err.textContent = 'The FEN in this PGN isn’t valid.'; err.hidden = false; return; }
        var r = C.replay(fen, parsed.sans);
        if (r.error) { err.textContent = r.error; err.hidden = false; return; }
        if (!r.moves.length) { err.textContent = 'No moves found in that PGN.'; err.hidden = false; return; }
        openPgn(text, color, (parsed.headers.White || 'White') + ' vs ' + (parsed.headers.Black || 'Black'));
      } }, U.icon('analyze'), 'Review'),
      h('button', { class: 'btn quiet', type: 'button', onclick: function () { U.readFile('.pgn,.txt').then(function (t) { if (t) ta.value = t; }); } }, U.icon('upload'), 'Open file')));
    grid.appendChild(paste);
    root.appendChild(grid);
  }

  function renderReview(root, src) {
    App.focus(true);
    var startFen = src.startFen, moves = src.moves, sans = src.sans, you = src.color;
    var st = { ply: moves.length, evals: null, res: null, cancelled: false, retry: null, orient: you };
    R = st;
    var head = h('div', { class: 'row between', style: { marginBottom: '10px' } },
      h('button', { class: 'back', type: 'button', onclick: function () { App.go('review'); } }, U.icon('back'), 'Games'),
      h('div', { class: 'muted small' }, src.label));
    root.appendChild(head);
    var board = new Board({ orient: you, coords: Store.state.settings.coords !== false, movable: null, onMove: retryMove });
    var evalFill = h('i', { style: { height: '50%' } });
    var evalBar = h('div', { class: 'evalbar', 'aria-hidden': 'true' }, evalFill);
    var nav = h('div', { class: 'controls' },
      h('button', { class: 'btn icon-only', type: 'button', 'aria-label': 'Start', onclick: function () { goPly(0); } }, U.icon('first')),
      h('button', { class: 'btn icon-only', type: 'button', 'aria-label': 'Previous move', onclick: function () { goPly(st.ply - 1); } }, U.icon('back')),
      h('button', { class: 'btn icon-only', type: 'button', 'aria-label': 'Next move', onclick: function () { goPly(st.ply + 1); } }, U.icon('next')),
      h('button', { class: 'btn icon-only', type: 'button', 'aria-label': 'End', onclick: function () { goPly(moves.length); } }, U.icon('last')),
      h('button', { class: 'btn icon-only', type: 'button', 'aria-label': 'Flip board', onclick: function () { board.flip(); } }, U.icon('flip')));
    var summary = h('div', { class: 'card rv-summary' }), explain = h('div', { class: 'card stack rv-explain' }), graphBox = h('div'), movesBox = h('div');
    var arena = h('div', { class: 'arena' },
      h('div', { class: 'board-col' }, h('div', { class: 'with-eval' }, evalBar, board.el), nav),
      h('div', { class: 'panel' }, summary, explain, graphBox, movesBox));
    root.appendChild(arena);

    function posAt(n) {
      var p = new C.Pos(startFen), last = null;
      for (var i = 0; i < n; i++) { last = p.parseMove(moves[i]); p.make(last); }
      return { pos: p, last: last };
    }
    function goPly(n) {
      n = Math.max(0, Math.min(moves.length, n));
      st.ply = n; st.retry = null;
      var a = posAt(n);
      board.setMovable(null);
      board.setPosition(a.pos, { last: a.last, animate: true, clearLast: !a.last });
      decorate();
      renderExplain(); renderMoves(); paintEvalBar();
    }
    function decorate() {
      var n = st.ply;
      board.setArrows([]); board.setBadge(null); board.setMarks([]);
      if (!st.res || n === 0) return;
      var k = st.res.cls[n - 1], m = moves[n - 1];
      board.setBadge({ sq: m.slice(2, 4), kind: k, text: KINDS[k].sym });
      var e = st.evals[n - 1];
      if (e && e.best && e.best !== m && ['inaccuracy', 'mistake', 'blunder', 'miss'].indexOf(k) >= 0) {
        board.setArrows([{ from: e.best.slice(0, 2), to: e.best.slice(2, 4), color: 'green' }]);
      }
    }
    function paintEvalBar() {
      var e = st.evals && st.evals[st.ply];
      var w = e ? whiteWin(e) : 50;
      var pctWhite = board.orient === 'w' ? w : 100 - w;
      evalFill.style.height = pctWhite + '%';
      evalFill.style.background = board.orient === 'w' ? '#F4EFE4' : '#2A2F3A';
      evalBar.style.background = board.orient === 'w' ? '#2A2F3A' : '#F4EFE4';
    }

    function renderSummary() {
      U.clear(summary);
      if (!st.res) {
        summary.appendChild(h('div', { class: 'label' }, 'Reviewing'));
        summary.appendChild(h('div', { id: 'rv-progress', class: 'muted', style: { margin: '6px 0 10px' } }, 'Starting…'));
        summary.appendChild(UI.meter(0));
        return;
      }
      var acc = st.res.acc, me = you, opp = you === 'w' ? 'b' : 'w';
      summary.appendChild(h('div', { class: 'row between' },
        h('div', { class: 'stat' }, h('span', { class: 'label' }, 'Your accuracy'), h('b', null, Math.round(acc[me]) + '%')),
        h('div', { class: 'stat', style: { textAlign: 'right' } }, h('span', { class: 'label' }, src.oppName || 'Opponent'), h('b', null, Math.round(acc[opp]) + '%'))));
      // how many moves of each kind, yours beside your opponent's
      var tbl = h('table', { class: 'counts' }), body = h('tbody');
      tbl.appendChild(h('thead', null, h('tr', null, h('th', { scope: 'col' }, h('span', { class: 'sr-only' }, 'Move type')), h('th', { scope: 'col' }, 'You'), h('th', { scope: 'col' }, src.oppName || 'Opponent'))));
      ORDER.forEach(function (k) {
        var a = st.res.counts[me][k] || 0, b = st.res.counts[opp][k] || 0;
        if (!a && !b) return;
        body.appendChild(h('tr', null, h('th', { scope: 'row' }, h('span', { class: 'dot-k k-' + k }), KINDS[k].label), h('td', { class: 'num' }, String(a)), h('td', { class: 'num' }, String(b))));
      });
      tbl.appendChild(body);
      summary.appendChild(tbl);
      var keyMoves = [];
      st.res.cls.forEach(function (k, i) { if (isMine(i) && ['blunder', 'mistake', 'miss'].indexOf(k) >= 0) keyMoves.push(i + 1); });
      summary.appendChild(h('div', { class: 'row', style: { marginTop: '12px' } },
        h('button', { class: 'btn small quiet', type: 'button', onclick: function () { U.copyText(pgnText(), null).then(function (ok) { App.toast(ok ? 'PGN copied' : 'Copying isn\u2019t allowed here'); }); } }, U.icon('copy'), 'Copy PGN'),
        U.canSaveFile() ? h('button', { class: 'btn small quiet', type: 'button', onclick: function () { U.saveFile('tempo-game.pgn', pgnText(), 'application/x-chess-pgn'); } }, U.icon('download'), 'Save PGN') : null));
      if (keyMoves.length) summary.appendChild(h('div', { class: 'row', style: { marginTop: '12px' } },
        h('button', { class: 'btn small primary', type: 'button', onclick: function () { var nx = keyMoves.filter(function (p) { return p > st.ply; })[0] || keyMoves[0]; goPly(nx); } }, 'Next mistake'),
        h('span', { class: 'muted small' }, U.plural(keyMoves.length, 'key moment'))));
    }
    function pgnText() {
      if (src.pgn) return src.pgn;
      var p = new C.Pos(startFen), ms = [];
      moves.forEach(function (u) { var m = p.parseMove(u); ms.push(m); p.make(m); });
      return C.pgnFromMoves({ Event: 'Tempo game' }, startFen, ms);
    }
    function isMine(i) {
      var startSide = new C.Pos(startFen).side;
      return ((i % 2 === 0) === (startSide === 1)) === (you === 'w');
    }

    function renderExplain() {
      U.clear(explain);
      var n = st.ply;
      if (!st.res) { explain.hidden = true; return; }
      explain.hidden = false;
      if (n === 0) { explain.appendChild(h('div', { class: 'muted' }, 'Use the arrows to step through the game. Mistakes show the better move in green.')); return; }
      var k = st.res.cls[n - 1], i = n - 1, a = posAt(i), before = a.pos, m = before.parseMove(moves[i]);
      var e0 = st.evals[i], e1 = st.evals[i + 1];
      var who = isMine(i) ? 'You' : (src.oppName || 'Opponent');
      explain.appendChild(h('div', { class: 'row tight' }, h('span', { class: 'chip', style: { background: 'var(--surface-2)' } }, h('span', { class: 'dot-k k-' + k, style: { width: '10px', height: '10px', borderRadius: '50%', display: 'inline-block' } }), KINDS[k].label),
        h('span', { class: 'muted small' }, who + ' played ' + sans[i])));
      var text = '', topic = null;
      if (k === 'book') text = 'A standard opening move.';
      else if (k === 'best') text = 'The engine’s top choice.';
      else if (k === 'excellent' || k === 'good') text = k === 'excellent' ? 'Nearly as good as the best move.' : 'A reasonable move. ' + bestText();
      else if (k === 'great') text = 'The only good move here, and it was found.';
      else if (k === 'brilliant') text = 'A strong sacrifice: it gives up material for a winning attack or a better position.';
      else if (k === 'miss') { var mi = Explain.missedInfo(before, e0.best, e0.line); text = 'Your opponent had just made a mistake, and this let them off the hook. ' + mi.text; topic = mi.topic; }
      else {
        var reply = e1 && e1.line ? e1.line : null;
        if (!reply && e1 && !e1.loading && e1.mate !== 0) {
          e1.loading = true;
          Engines.analyse({ fen: startFen, moves: moves.slice(0, i + 1), depth: Engines.strong ? 12 : 8, movetime: 700 }).then(function (rr) {
            if (rr.lines[0]) e1.line = rr.lines[0];
            if (R === st && st.ply === n && !st.retry) renderExplain();
          });
        }
        var why = reply ? Explain.bad(before, m, reply, e0.best) : null;
        text = (why ? why.text + ' ' : '') + bestText();
        topic = why && (k === 'mistake' || k === 'blunder') ? why.topic : null;
      }
      explain.appendChild(h('p', null, text));
      if (['inaccuracy', 'mistake', 'blunder', 'miss'].indexOf(k) >= 0 && isMine(i)) {
        explain.appendChild(h('div', { class: 'row' },
          h('button', { class: 'btn small', type: 'button', onclick: function () { startRetry(i); } }, U.icon('refresh'), 'Find a better move'),
          h('button', { class: 'btn small quiet', type: 'button', onclick: function () { if (e0 && e0.best) board.setArrows([{ from: e0.best.slice(0, 2), to: e0.best.slice(2, 4), color: 'green' }]); } }, 'Show best')));
        if (topic) { var sr = Explain.studyRow(topic); if (sr) explain.appendChild(sr); }
      }
      function bestText() {
        if (!e0 || !e0.best || e0.best === moves[i]) return '';
        var bm = before.parseMove(e0.best);
        return bm ? 'Best was ' + before.san(bm) + '.' : '';
      }
    }

    function startRetry(i) {
      var a = posAt(i);
      st.retry = { ply: i, tries: 0 };
      st.ply = i;
      board.setMovable(a.pos.side === 1 ? 'w' : 'b');
      board.setPosition(a.pos, { last: a.last, animate: true });
      board.setArrows([]); board.setBadge(null);
      U.clear(explain);
      explain.appendChild(h('div', { class: 'label' }, 'Your turn'));
      explain.appendChild(h('p', null, 'Find a better move than ' + sans[i] + '.'));
      renderMoves(); paintEvalBar();
    }
    function retryMove(uci, m) {
      var r = st.retry; if (!r) return;
      var a = posAt(r.ply), before = a.pos, e0 = st.evals[r.ply];
      var after = before.clone(); after.make(m);
      board.setMovable(null);
      board.setPosition(after, { last: m, animate: false });
      if (e0 && e0.best === uci) return good();
      Engines.analyse({ fen: after.fen(), depth: Engines.strong ? 13 : 8, movetime: 800 }).then(function (res) {
        var l = res.lines[0];
        var wa = l ? 100 - (l.mate != null ? (l.mate > 0 ? 100 : 0) : U.winPct(l.cp)) : 0;
        var wb = before.side === 1 ? whiteWin(e0) : 100 - whiteWin(e0);
        if (wb - wa <= 4) good(); else bad(l);
      });
      function good() {
        U.sound.good();
        U.clear(explain);
        explain.appendChild(h('div', { class: 'feedback ok' }, 'Yes, ' + before.san(m) + ' is a strong move.'));
        explain.appendChild(h('div', { class: 'row' }, h('button', { class: 'btn small', type: 'button', onclick: function () { goPly(r.ply + 1); } }, 'Continue')));
        var mid = 'g' + (src.gameId || 'x') + '-' + r.ply;
        Mistakes.solved(mid);
      }
      function bad(l) {
        U.sound.bad();
        r.tries++;
        U.clear(explain);
        var why = l ? Explain.bad(before, m, l, e0 && e0.best) : null;
        explain.appendChild(h('div', { class: 'feedback no' }, (why ? why.text : 'That isn’t better.')));
        explain.appendChild(h('div', { class: 'row' },
          h('button', { class: 'btn small primary', type: 'button', onclick: function () { startRetry(r.ply); } }, 'Try again'),
          h('button', { class: 'btn small quiet', type: 'button', onclick: function () { goPly(r.ply + 1); if (e0 && e0.best) board.setArrows([{ from: e0.best.slice(0, 2), to: e0.best.slice(2, 4), color: 'green' }]); } }, 'Show the answer')));
      }
    }

    function renderMoves() {
      U.clear(movesBox);
      var box = h('div', { class: 'moves' }), tb = h('table'), row = null, start = new C.Pos(startFen), num = start.full;
      sans.forEach(function (san, i) {
        var white = (i % 2 === 0) === (start.side === 1);
        if (white || !row) { row = h('tr', null, h('td', { class: 'n' }, num + '.')); tb.appendChild(row); if (!white) row.appendChild(h('td')); num++; }
        var k = st.res ? st.res.cls[i] : null;
        row.appendChild(h('td', null, h('button', { class: 'mv' + (st.ply === i + 1 ? ' on' : ''), type: 'button', onclick: function () { goPly(i + 1); } },
          k && ['brilliant', 'great', 'inaccuracy', 'mistake', 'miss', 'blunder'].indexOf(k) >= 0 ? h('span', { class: 'dot-k k-' + k }) : null, san)));
      });
      box.appendChild(tb);
      movesBox.appendChild(box);
      var on = box.querySelector('.mv.on');
      if (on) { var top = on.offsetTop - box.clientHeight / 2; box.scrollTop = Math.max(0, top); }
    }

    function renderGraph() {
      U.clear(graphBox);
      if (!st.evals) return;
      var W = 600, H = 110, n = st.evals.length;
      var NS = 'http://www.w3.org/2000/svg', svg = document.createElementNS(NS, 'svg');
      svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H); svg.setAttribute('preserveAspectRatio', 'none'); svg.setAttribute('class', 'evalgraph');
      svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', 'Evaluation over the game');
      var bg = document.createElementNS(NS, 'rect'); bg.setAttribute('width', W); bg.setAttribute('height', H); bg.setAttribute('fill', '#22314F'); svg.appendChild(bg);
      var x = function (i) { return n <= 1 ? 0 : W * i / (n - 1); };
      var y = function (i) { return H * (1 - whiteWin(st.evals[i]) / 100); };
      var d = 'M0 ' + H;
      for (var i = 0; i < n; i++) d += ' L' + x(i).toFixed(1) + ' ' + y(i).toFixed(1);
      d += ' L' + W + ' ' + H + ' Z';
      var area = document.createElementNS(NS, 'path'); area.setAttribute('d', d); area.setAttribute('fill', '#F4EFE4'); svg.appendChild(area);
      var mid = document.createElementNS(NS, 'line'); mid.setAttribute('x1', 0); mid.setAttribute('x2', W); mid.setAttribute('y1', H / 2); mid.setAttribute('y2', H / 2); mid.setAttribute('stroke', '#8A92A4'); mid.setAttribute('stroke-dasharray', '4 4'); mid.setAttribute('stroke-width', 1); svg.appendChild(mid);
      var cur = document.createElementNS(NS, 'line'); cur.setAttribute('x1', x(st.ply)); cur.setAttribute('x2', x(st.ply)); cur.setAttribute('y1', 0); cur.setAttribute('y2', H); cur.setAttribute('stroke', '#D4AF37'); cur.setAttribute('stroke-width', 2.5); svg.appendChild(cur);
      st.res.cls.forEach(function (k, i) {
        if (['mistake', 'blunder', 'miss', 'brilliant', 'great'].indexOf(k) < 0) return;
        var c = document.createElementNS(NS, 'circle');
        c.setAttribute('cx', x(i + 1)); c.setAttribute('cy', y(i + 1)); c.setAttribute('r', 5);
        c.setAttribute('fill', { mistake: '#DD6E26', blunder: '#DE4F36', miss: '#C2558E', brilliant: '#178F9C', great: '#3667CF' }[k]);
        c.setAttribute('stroke', '#fff'); c.setAttribute('stroke-width', 1.5);
        svg.appendChild(c);
      });
      svg.addEventListener('click', function (e) {
        var rc = svg.getBoundingClientRect(), f = (e.clientX - rc.left) / rc.width;
        goPly(Math.round(f * (n - 1)));
      });
      graphBox.appendChild(svg);
      graphBox.appendChild(h('p', { class: 'faint small', style: { marginTop: '6px' } }, 'Above the middle line White is better, below it Black is. Tap the graph to jump to that moment.'));
      st.curLine = cur;
    }

    st.keys = function (e) {
      if (e.target && /input|textarea|select/i.test(e.target.tagName)) return;
      if (e.key === 'ArrowLeft') goPly(st.ply - 1);
      else if (e.key === 'ArrowRight') goPly(st.ply + 1);
      else if (e.key === 'Home') goPly(0);
      else if (e.key === 'End') goPly(moves.length);
    };
    document.addEventListener('keydown', st.keys);

    goPly(moves.length);
    renderSummary();

    // use a saved review if we have one
    var saved = src.saved;
    if (saved && saved.ev && saved.cls && saved.ev.length === moves.length + 1) {
      st.evals = saved.ev.map(function (v, i) { return unpackEval(v, saved.best[i]); });
      st.res = { cls: saved.cls.split('').map(function (c) { return FROM_CODE[c]; }), acc: saved.acc, counts: saved.counts };
      // explanations need replies' principal lines; refill them lazily from the stored best move
      done();
      return;
    }
    Promise.all([Data.openings(), Engines.sfReady()]).then(function (res) {
      var map = res[0];
      return analyseAll(startFen, moves, function (i, n) {
        var el = document.getElementById('rv-progress');
        if (el) el.textContent = 'Checking move ' + Math.min(i, n - 1) + ' of ' + (n - 1) + (Engines.strong ? '' : ' with the built-in engine');
        var mt = summary.querySelector('.meter > i'); if (mt) mt.style.width = Math.round(i / n * 100) + '%';
      }, function () { return st.cancelled; }).then(function (evals) {
        if (!evals || st.cancelled) return;
        st.evals = evals;
        st.res = classify(startFen, moves, evals, map);
        save(map);
        done();
      });
    });
    function done() {
      renderSummary(); renderGraph(); goPly(st.ply === moves.length ? firstKey() : st.ply);
    }
    function firstKey() {
      for (var i = 0; i < st.res.cls.length; i++) if (isMine(i) && ['blunder', 'mistake', 'miss'].indexOf(st.res.cls[i]) >= 0) return i + 1;
      return moves.length;
    }
    function save() {
      if (!src.gameId) return;
      var g = gameById(src.gameId); if (!g) return;
      g.reviewed = true; g.acc = st.res.acc[you]; g.counts = st.res.counts[you];
      var idx = Store.state.games.list.indexOf(g);
      if (idx < 30) g.rv = { ev: st.evals.map(packEval), best: st.evals.map(function (e) { return e.best || ''; }), cls: st.res.cls.map(function (k) { return CODE[k]; }).join(''), acc: st.res.acc, counts: st.res.counts };
      Store.touch('games');
      Mistakes.addFromReview(src.gameId, startFen, moves, st.evals, st.res.cls, isMine);
    }
    function packEval(e) { if (e.mate === 0) return e.mateWinner === 1 ? 20000 : -20000; if (e.mate != null) return e.mate > 0 ? 10000 - e.mate : -10000 - e.mate; return Math.max(-9000, Math.min(9000, e.cp || 0)); }
    function unpackEval(v, best) {
      if (v >= 20000) return { mate: 0, mateWinner: 1, best: null, pv: [] };
      if (v <= -20000) return { mate: 0, mateWinner: -1, best: null, pv: [] };
      if (v > 9000) return { cp: null, mate: 10000 - v, best: best || null, pv: best ? [best] : [] };
      if (v < -9000) return { cp: null, mate: -10000 - v, best: best || null, pv: best ? [best] : [] };
      return { cp: v, mate: null, best: best || null, pv: best ? [best] : [] };
    }
  }

  App.register('review', {
    render: function (root, params) {
      if (params && params.gameId) {
        var g = gameById(params.gameId);
        if (!g) { renderList(root); return; }
        var parsed = C.parsePgn(g.pgn), fen = parsed.headers.FEN || C.START_FEN, r = C.replay(fen, parsed.sans);
        var bot = TempoBots.byId(g.bot);
        renderReview(root, { gameId: g.id, pgn: g.pgn, startFen: fen, moves: r.moves.map(C.uci), sans: sansOf(fen, r.moves), color: g.color,
          label: resultPhrase(g, bot ? bot.name : 'opponent') + ', ' + U.dateShort(g.ts), oppName: bot ? bot.name : 'Opponent', saved: g.rv });
      } else if (params && params.pgn) {
        var p2 = C.parsePgn(params.pgn), fen2 = p2.headers.FEN || C.START_FEN, r2 = C.replay(fen2, p2.sans);
        renderReview(root, { pgn: params.pgn, startFen: fen2, moves: r2.moves.map(C.uci), sans: sansOf(fen2, r2.moves), color: params.color || 'w', label: params.label || 'Imported game',
          oppName: params.color === 'b' ? (p2.headers.White || 'White') : (p2.headers.Black || 'Black') });
      } else renderList(root);
    },
    leave: function () { if (R) { R.cancelled = true; document.removeEventListener('keydown', R.keys); R = null; } Engines.stopAll(); },
    busy: function () { return !!R; }
  });
  function sansOf(fen, ms) { var p = new C.Pos(fen), out = []; ms.forEach(function (m) { out.push(p.san(m)); p.make(m); }); return out; }

  return { openGame: openGame, openPgn: openPgn, classify: classify, KINDS: KINDS };
})();

/* Positions from your own games where you went wrong, replayed with spaced repetition. */
var Mistakes = (function () {
  'use strict';
  var C = TempoCore;
  function addFromReview(gameId, startFen, moves, evals, cls, isMine) {
    var S = Store.state, items = S.mistakes.items, p = new C.Pos(startFen), added = 0;
    for (var i = 0; i < moves.length; i++) {
      var k = cls[i];
      if (isMine(i) && (k === 'blunder' || k === 'mistake' || k === 'miss') && evals[i] && evals[i].best && evals[i].best !== moves[i]) {
        var id = 'g' + gameId + '-' + i;
        if (!items.some(function (x) { return x.id === id; })) {
          items.unshift({ id: id, fen: p.fen(), played: moves[i], best: evals[i].best, kind: k, ts: Date.now(), box: 0, due: Date.now(), seen: 0 });
          added++;
        }
      }
      p.make(p.parseMove(moves[i]));
    }
    if (items.length > 200) items.length = 200;
    if (added) Store.touch('mistakes');
  }
  function solved(id) {
    var it = Store.state.mistakes.items.filter(function (x) { return x.id === id; })[0];
    if (!it) return;
    grade(it, true);
  }
  function grade(it, ok) {
    var DAY = 86400000, gaps = [0.2, 1, 3, 7, 16, 35];
    it.box = ok ? Math.min(5, (it.box || 0) + 1) : 0;
    it.due = Date.now() + gaps[it.box] * DAY;
    it.seen = (it.seen || 0) + 1;
    Store.touch('mistakes');
  }
  function due() { var now = Date.now(); return Store.state.mistakes.items.filter(function (x) { return x.due <= now; }); }
  return { addFromReview: addFromReview, solved: solved, grade: grade, due: due };
})();
