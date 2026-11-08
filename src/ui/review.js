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
  /* the same line with move numbers: "15.Bxd7+ Nxd7 16.Qb8+" */
  function numberedLine(pos, pv, n) {
    var p = pos.clone(), out = [];
    for (var i = 0; i < pv.length && i < n; i++) {
      var m = p.parseMove(pv[i]); if (!m) break;
      var s = p.san(m);
      out.push(p.side === 1 ? p.full + '.' + s : (i === 0 ? p.full + '...' + s : s));
      p.make(m);
    }
    return out.join(' ');
  }
  /* enemy pieces the piece on sq attacks (pawns too when minType is 1); giving check counts as attacking the king */
  function attacksFrom(pos, sq, minType) {
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
      if (t >= (minType || 2) && !out.some(function (x) { return x.sq === to; })) out.push({ sq: to, type: t });
    }
    var kingSq = side === 1 ? pos.bk : pos.wk;
    if (pos.attackersOf(kingSq, side).indexOf(sq) >= 0 && !out.some(function (x) { return x.type === 6; })) out.push({ sq: kingSq, type: 6 });
    return out;
  }
  function attackedValuables(pos, sq) { return attacksFrom(pos, sq, 2); }
  function cap1(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }
  function plural(n, word) { return n + ' ' + word + (n === 1 ? '' : 's'); }

  /* Who is who in a sentence. opts.you === false: the move was made by the other player, named opts.name. */
  function sides(opts) {
    var name = opts && opts.name ? String(opts.name) : '';
    var you = { Subj: 'You', subj: 'you', poss: 'your', Poss: 'Your' };
    var other = name ? { Subj: name, subj: name, poss: name + '’s', Poss: name + '’s' }
      : { Subj: 'Your opponent', subj: 'your opponent', poss: 'your opponent’s', Poss: 'Your opponent’s' };
    if (opts && opts.you === false) return { me: other, them: you };
    if (!name) other = { Subj: 'Your opponent', subj: 'your opponent', poss: 'their', Poss: 'Their' };
    return { me: you, them: other };
  }
  /* "the knight on f6", for the piece that makes move m in pos */
  function pieceWords(pos, m) { return 'the ' + PIECE_NAME[Math.abs(pos.b[m & 127])] + ' on ' + C.sqName(m & 127); }

  /* Play a line from pos: `min` plies, then two more at a time while pieces are still being traded (8 at most).
     Returns the material for `side` before and after, and each move played. */
  function playOut(pos, pv, side, min) {
    var p = pos.clone(), start = matFor(p, side), list = [], lim = Math.min(pv.length, min || 4), i = 0;
    while (i < lim) {
      var m = p.parseMove(pv[i]); if (!m) break;
      var c = p.moveCaptured(m), to = (m >> 7) & 127;
      list.push({ i: i, m: m, san: p.san(m), cap: c, by: Math.abs(p.b[m & 127]), from: m & 127, to: to,
        capSq: (m >>> 17) & C.F_EP ? to - 16 * p.side : to });
      p.make(m); i++;
      if (i === lim && lim < 8 && lim < pv.length && (list[i - 1].cap || (i > 1 && list[i - 2].cap))) lim = Math.min(pv.length, lim + 2, 8);
    }
    return { start: start, end: matFor(p, side), list: list };
  }

  /* After the reply rm, does the side that played it threaten mate in one? Returns that move's SAN or null. */
  function mateThreat(after, rm) {
    var p = after.clone(); p.make(rm);
    if (p.inCheck() || !p.legalMoves().length) return null;
    p.makeNull();
    var legal = p.legalMoves(), hit = 0;
    for (var i = 0; i < legal.length && !hit; i++) {
      p.make(legal[i]);
      if (p.inCheck() && !p.legalMoves().length) hit = legal[i];
      p.unmake();
    }
    var san = hit ? p.san(hit) : null;
    p.unmakeNull();
    return san;
  }

  function worse(me, them, opts) {
    var wb = opts && opts.wb, wa = opts && opts.wa;
    if (wb != null && wa != null) {
      if (wb >= 55 && wa >= 50) return 'This gives away part of ' + me.poss + ' advantage.';
      if (wb >= 45 && wa < 45) return 'This hands ' + them.subj + ' the advantage.';
      if (wb >= 55) return 'This gives away ' + me.poss + ' advantage.';
      if (wb < 45) return 'This makes ' + me.poss + ' position harder to defend.';
    }
    return 'This makes ' + me.poss + ' position worse.';
  }

  /* Why was move m (from position `before`) bad? reply: the engine line after m (opponent to move). best: engine best before.
     opts (optional): { you: false when the other player made the move, name: the other player's name, wb, wa: the mover's
     winning chances before and after }. Returns { title, text, short, topic, reply }. */
  function bad(before, m, reply, best, opts) {
    var S = sides(opts), me = S.me, them = S.them;
    var mover = before.side, after = before.clone(); after.make(m);
    var moveSan = before.san(m), movedTo = (m >> 7) & 127;
    var pv = (reply && reply.pv) || [];
    var rm = pv.length ? after.parseMove(pv[0]) : 0;
    var replySan = rm ? after.san(rm) : null;
    // at: how far into the reply line the damage is done (the index of the capture, or of the checkmate)
    var r = { title: '', text: '', short: '', topic: 'position', reply: rm ? pv[0] : null, at: 0 };
    // 1. checkmate
    if (reply && reply.mate != null && reply.mate > 0 && rm) {
      r.topic = 'threats'; r.at = reply.mate * 2 - 2;
      r.short = replySan + ' would have led to checkmate.';
      if (reply.mate === 1) {
        r.title = 'This allows checkmate';
        r.text = cap1(pieceWords(after, rm)) + (after.moveCaptured(rm) ? ' takes on ' : ' goes to ') + C.sqName((rm >> 7) & 127) + ', and that’s checkmate: ' + replySan + '.';
        r.ask = { prompt: 'After this move ' + them.subj + ' can checkmate you in one. Tap the square the checkmate lands on.', squares: [C.sqName((rm >> 7) & 127)] };
      } else {
        r.title = 'This allows a forced checkmate';
        r.text = them.Subj + ' can force checkmate in ' + plural(reply.mate, 'move') + ', starting with ' + replySan + '.';
      }
      return r;
    }
    // what the reply line does to the mover's material
    var po = playOut(after, pv, mover, 6), loss = po.start - po.end;
    var lost = po.list.filter(function (x, idx) {
      if (x.i % 2 !== 0 || !x.cap || (x.cap > 0 ? 1 : -1) !== mover) return false;
      // taking back on the square where the mover just took is part of a trade, not the loss
      var prev = po.list[idx - 1];
      return !(prev && prev.cap && prev.to === x.capSq);
    });
    // 2. a fork or double attack: the reply hits two things that can't both be saved (a loose pawn counts),
    //    and the engine line goes on to take one of them. A reply that simply takes a piece is explained in 3.
    if (rm && PIECE_VAL[Math.abs(after.moveCaptured(rm))] < 3) {
      var rp = after.clone(); rp.make(rm);
      var rto = (rm >> 7) & 127, by = Math.abs(rp.b[rto]);
      var hits = attacksFrom(rp, rto, 1).filter(function (t) { return t.type === 6 || PIECE_VAL[t.type] > PIECE_VAL[by] || rp.hangingLoss(t.sq) > 0; });
      var big = hits.filter(function (t) { return t.type >= 2; });
      var cashed = po.list.some(function (x) { return x.i > 0 && x.i % 2 === 0 && x.cap && hits.some(function (t) { return t.sq === x.capSq; }); });
      if (hits.length >= 2 && big.some(function (t) { return t.type <= 5; }) && (cashed || (loss >= 2 && big.length >= 2))) {
        hits.sort(function (a, b) { return (b.type === 6 ? 99 : PIECE_VAL[b.type]) - (a.type === 6 ? 99 : PIECE_VAL[a.type]); });
        var names = hits.slice(0, 2).map(function (t) { return t.type === 6 ? 'king' : PIECE_NAME[t.type] + ' on ' + C.sqName(t.sq); });
        r.title = big.length >= 2 ? 'This allows a fork' : 'This allows a double attack';
        r.text = them.Subj + ' can answer ' + replySan + ', and the ' + PIECE_NAME[by] + ' attacks ' + me.poss + ' ' + names[0] + ' and ' + names[1] + ' at the same time.';
        r.short = replySan + ' would have attacked ' + me.poss + ' ' + names[0] + ' and ' + names[1] + ' at once.';
        r.topic = 'fork';
        var won = po.list.filter(function (x) { return x.i > 0 && x.i % 2 === 0 && x.cap && hits.some(function (t) { return t.sq === x.capSq; }); })[0];
        r.at = won ? won.i : 2;
        r.ask = { prompt: 'After this move ' + them.subj + ' can attack two of ' + me.poss + ' pieces at once. Tap one of the two.', squares: hits.slice(0, 2).map(function (t) { return C.sqName(t.sq); }) };
        return r;
      }
    }
    // 3. losing material
    if (loss >= 1 && lost.length) {
      var x = lost[0];
      if (loss >= 2) lost.forEach(function (y) { if (PIECE_VAL[Math.abs(y.cap)] > PIECE_VAL[Math.abs(x.cap)]) x = y; });
      var nm = PIECE_NAME[Math.abs(x.cap)], sq = C.sqName(x.capSq), taker = 'the ' + PIECE_NAME[x.by] + ' on ' + C.sqName(x.from);
      r.topic = 'safety'; r.piece = Math.abs(x.cap); r.at = x.i;
      if (x.i === 0) r.ask = { prompt: 'After this move one of ' + me.poss + ' pieces can be taken for free. Tap it.', squares: [sq] };
      r.title = PIECE_VAL[Math.abs(x.cap)] >= 3 ? 'This loses ' + me.poss + ' ' + nm : 'This loses a pawn';
      r.short = x.san + ' would have won ' + me.poss + ' ' + nm + '.';
      if (x.i > 0) r.text = 'After ' + sanLine(after, pv, x.i).join(' ') + ', ' + taker + ' can take ' + me.poss + ' ' + nm + ' on ' + sq + ': ' + x.san + '.';
      else if (x.capSq === movedTo) r.text = me.Poss + ' ' + nm + ' on ' + sq + ' isn’t safe there. ' + cap1(taker) + ' can take it: ' + x.san + '.';
      else if (before.b[x.capSq] === after.b[x.capSq] && before.hangingLoss(x.capSq) > 0) r.text = me.Poss + ' ' + nm + ' on ' + sq + ' was already under attack, and ' + moveSan + ' doesn’t save it. ' + cap1(taker) + ' can take it: ' + x.san + '.';
      else r.text = 'After ' + moveSan + ', ' + me.poss + ' ' + nm + ' on ' + sq + ' is no longer safe. ' + cap1(taker) + ' can take it: ' + x.san + '.';
      return r;
    }
    // 4. a checkmate threat
    if (rm) {
      var threat = mateThreat(after, rm);
      if (threat) {
        r.title = 'This allows a checkmate threat';
        r.text = them.Subj + ' can answer ' + replySan + ', threatening checkmate with ' + threat + '.';
        r.short = replySan + ' would have threatened checkmate.';
        r.topic = 'threats';
        return r;
      }
    }
    // 5. no single tactic: the position just got worse
    var bestSan = null;
    if (best) { var bm = before.parseMove(best); if (bm) bestSan = before.san(bm); }
    r.title = 'This makes ' + me.poss + ' position worse';
    r.text = worse(me, them, opts);
    r.short = bestSan ? bestSan + ' was better.' : 'That move hurt ' + me.poss + ' position.';
    return r;
  }

  /* What does `best` achieve from `before`? line: the engine line starting with it, from the mover's side. */
  function gainOf(before, best, line) {
    var bm = before.parseMove(best); if (!bm) return null;
    var san = before.san(bm), mover = before.side;
    var ours = line && (!line.pv || !line.pv.length || line.pv[0] === best);
    if (ours && line.mate != null && line.mate > 0) return { san: san, kind: line.mate === 1 ? 'mate1' : 'mate', n: line.mate };
    var pv = ours && line.pv && line.pv.length ? line.pv : [best];
    var po = playOut(before, pv, mover, 6), gain = po.end - po.start;
    if (gain >= 2) {
      var after = before.clone(); after.make(bm);
      var direct = before.moveCaptured(bm), t = attacksFrom(after, (bm >> 7) & 127, 2);
      if (gain >= 3 && t.length >= 2 && !(direct && PIECE_VAL[Math.abs(direct)] >= 3)) return { san: san, kind: 'fork', targets: t };
      // the biggest piece won, and the biggest thing given back for it on the way ("wins your bishop for a pawn")
      var won = null, gave = null;
      po.list.forEach(function (x) {
        if (!x.cap) return;
        var v = PIECE_VAL[Math.abs(x.cap)];
        if (x.i % 2 === 0) { if (v >= 3 && (!won || v > PIECE_VAL[Math.abs(won.cap)])) won = x; }
        else if (!gave || v > PIECE_VAL[Math.abs(gave.cap)]) gave = x;
      });
      if (won) return { san: san, kind: 'piece', piece: Math.abs(won.cap), gave: gave && PIECE_VAL[Math.abs(won.cap)] > gain ? Math.abs(gave.cap) : 0 };
      return { san: san, kind: 'material' };
    }
    if (gain >= 1) return { san: san, kind: 'pawn' };
    return { san: san, kind: 'none' };
  }
  function forkNames(targets) {
    var t = targets.slice().sort(function (a, b) { return (b.type === 6 ? 99 : PIECE_VAL[b.type]) - (a.type === 6 ? 99 : PIECE_VAL[a.type]); });
    return t.slice(0, 2).map(function (x) { return PIECE_NAME[x.type]; }).join(' and ');
  }

  /* " for a pawn" when part of the win is given back on the way */
  function forWhat(g) { return g.gave ? ' for ' + (g.gave === 1 ? 'a pawn' : 'a ' + PIECE_NAME[g.gave]) : ''; }

  /* What did the best move achieve? (for missed wins). text keeps the short form other screens use;
     sentence names who missed it: "Pip missed fxg5, which wins your bishop." */
  function missed(before, best, bestLine) { return missedInfo(before, best, bestLine).text; }
  function missedInfo(before, best, bestLine, opts) {
    var g = gainOf(before, best, bestLine);
    if (!g) return { text: '', topic: null, sentence: '', what: '' };
    var S = sides(opts), me = S.me, them = S.them, text, what;
    switch (g.kind) {
      case 'mate1': text = g.san + ' was checkmate.'; what = 'is checkmate'; break;
      case 'mate': text = g.san + ' started a forced checkmate.'; what = 'forces checkmate in ' + plural(g.n, 'move'); break;
      case 'fork': text = g.san + ' is a fork that wins material.'; what = 'attacks ' + them.poss + ' ' + forkNames(g.targets) + ' at the same time'; break;
      case 'piece': text = g.san + ' wins a ' + PIECE_NAME[g.piece] + forWhat(g) + '.'; what = 'wins ' + them.poss + ' ' + PIECE_NAME[g.piece] + forWhat(g); break;
      case 'material': text = g.san + ' wins material.'; what = 'wins material'; break;
      case 'pawn': text = g.san + ' wins a pawn.'; what = 'wins a pawn'; break;
      default: text = g.san + ' was stronger.'; what = 'was much stronger';
    }
    var topic = g.kind === 'mate1' || g.kind === 'mate' ? 'mates' : g.kind === 'fork' ? 'fork' : g.kind === 'none' ? null : 'free';
    // what: the gain without naming the move ("wins Pip’s knight"), for a summary that leaves the move for you to find
    return { text: text, topic: topic, sentence: me.Subj + ' missed ' + g.san + ', which ' + what + '.', what: what };
  }

  /* a friendly piece that was hanging before the move and isn't after it */
  function protects(pos, after, from, to) {
    var side = pos.side, found = null;
    for (var sq = 0; sq < 120; sq++) {
      if (sq & 8) { sq += 7; continue; }
      if (sq === from || sq === to) continue;
      var p = pos.b[sq]; if (!p || (p > 0 ? 1 : -1) !== side || after.b[sq] !== p) continue;
      var t = Math.abs(p); if (t < 2 || t > 5) continue;
      if ((!found || PIECE_VAL[t] > PIECE_VAL[found.type]) && pos.hangingLoss(sq) > 0 && after.hangingLoss(sq) === 0) found = { sq: sq, type: t };
    }
    return found;
  }
  /* Why is `uci` a good move in pos? Up to two short phrases that follow "it", such as "develops a knight". */
  function reasons(pos, uci, line) { return reasonsInfo(pos, uci, line).list; }
  /* { list, hard }: hard when the first reason is something the engine line shows (mate, material, a fork);
     the rest describe the move (develops a knight, claims the center) without claiming that's why it's best */
  function reasonsInfo(pos, uci, line) {
    var m = pos.parseMove(uci); if (!m) return { list: [], hard: false };
    var out = reasonList(pos, m, uci, line);
    return { list: out, hard: !!(out.length && /checkmate|wins|attacks two|makes a new queen|promotes/.test(out[0])) };
  }
  function reasonList(pos, m, uci, line) {
    var from = m & 127, to = (m >> 7) & 127, pt = Math.abs(pos.b[from]), side = pos.side, out = [];
    var g = gainOf(pos, uci, line);
    if (g && g.kind === 'mate1') return ['is checkmate'];
    if (g && g.kind === 'mate') return ['forces checkmate in ' + plural(g.n, 'move')];
    var after = pos.clone(); after.make(m);
    if (g && g.kind === 'piece') out.push('wins a ' + PIECE_NAME[g.piece] + forWhat(g));
    else if (g && g.kind === 'fork') out.push('attacks two pieces at once');
    else if (g && g.kind === 'material') out.push('wins material');
    else if (g && g.kind === 'pawn') out.push('wins a pawn');
    var promo = (m >> 14) & 7, check = after.inCheck(), took = Math.abs(pos.moveCaptured(m));
    if (promo) out.push(promo === 5 ? 'makes a new queen' : 'promotes the pawn');
    if (took >= 2 && took <= 5 && (!g || g.kind === 'none')) out.push(took === pt ? 'trades ' + PIECE_NAME[pt] + 's' : 'takes the ' + PIECE_NAME[took] + ' on ' + C.sqName(to));
    // while the other side is in check nothing can be taken, so "safe" would only be true for a move
    if (!check && pt >= 2 && pt <= 5 && pos.hangingLoss(from) > 0 && after.hangingLoss(to) === 0) out.push('moves the ' + PIECE_NAME[pt] + ' out of danger');
    var saved = check ? null : protects(pos, after, from, to);
    if (saved) out.push('protects the ' + PIECE_NAME[saved.type] + ' on ' + C.sqName(saved.sq));
    if (!g || g.kind === 'none') {
      var tg = attacksFrom(after, to, 1).filter(function (t) { return t.type !== 6 && (PIECE_VAL[t.type] > PIECE_VAL[pt] || after.hangingLoss(t.sq) > 0); });
      tg.sort(function (a, b) { return PIECE_VAL[b.type] - PIECE_VAL[a.type]; });
      if (tg.length) out.push('attacks the ' + PIECE_NAME[tg[0].type] + ' on ' + C.sqName(tg[0].sq));
    }
    if ((m >>> 17) & C.F_CASTLE) out.push('gets the king to safety');
    if ((pt === 2 || pt === 3) && (from >> 4) === (side === 1 ? 0 : 7) && pos.full <= 15) out.push('develops a ' + PIECE_NAME[pt]);
    if (pt === 1 && pos.full <= 15 && ['d4', 'e4', 'd5', 'e5'].indexOf(C.sqName(to)) >= 0) out.push('claims the center');
    if (check && out.length < 2) out.push('comes with check');
    return out.slice(0, 2);
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
  function studyRow(topic, lead) {
    var t = TOPICS[topic]; if (!t) return null;
    var found = Data.lesson(t.lesson), h = U.h;
    return h('div', { class: 'study' }, lead === '' ? null : h('span', { class: 'muted small' }, lead || 'Work on this'),
      found ? h('button', { class: 'btn small quiet', type: 'button', onclick: function () { Learn.open(t.lesson); } }, U.icon('book'), found.lesson.title) : null,
      h('button', { class: 'btn small quiet', type: 'button', onclick: function () { Puzzles.themed(t.theme); } }, U.icon('puzzle'), t.practice));
  }

  return { bad: bad, missed: missed, missedInfo: missedInfo, reasons: reasons, reasonsInfo: reasonsInfo, sanLine: sanLine, numberedLine: numberedLine, matFor: matFor, studyRow: studyRow };
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
  /* Resolves { warn, title, text, short, reply, line }: reply is the opponent's best answer (UCI) and line the start of that engine line. */
  function check(before, m, prePromise) {
    var after = before.clone(); after.make(m);
    if (after.status().over) return Promise.resolve({ warn: false });
    return Promise.all([prePromise || analyse(before), analyse(after)]).then(function (res) {
      var pre = score(res[0]), post = score(res[1]);
      if (!pre || !post) return { warn: false };
      // the engine's own first choice is never called a mistake
      if (res[0] && res[0].best && res[0].best === TempoCore.uci(m)) return { warn: false };
      var wb = win(pre), wa = 100 - win(post);
      var mateAgainst = post.mate != null && post.mate > 0 && !(pre.mate != null && pre.mate < 0);
      var drop = wb - wa;
      if (mateAgainst || (drop >= 18 && wa < 62)) {
        var why = Explain.bad(before, m, post, res[0].best);
        return { warn: true, title: why.title, text: why.text + ' Take the move back?', short: why.short, ask: why.ask || null,
          reply: (post.pv && post.pv[0]) || null, line: (post.pv || []).slice(0, 6) };
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
  var FLAGGED = ['inaccuracy', 'mistake', 'blunder', 'miss'];   // moves that get a closer look before they're labeled
  var SERIOUS = ['mistake', 'blunder', 'miss'];                 // the moments to fix
  var MARKED = ['brilliant', 'great', 'inaccuracy', 'mistake', 'miss', 'blunder'];
  var SAVE_VERSION = 2;

  var R = null; // current review state

  /* the quick look every position gets, and the longer one before a move is called a mistake */
  function quickOpts() { return Engines.strong ? { depth: 13, movetime: 650, multipv: 2 } : { depth: 9, movetime: 600, multipv: 1 }; }
  function deepOpts() { return Engines.strong ? { depth: 16, movetime: 1500, multipv: 1 } : { depth: 0, movetime: 1500, multipv: 1 }; }

  function whiteWin(e) {
    if (!e) return 50;
    if (e.mate === 0) return e.mateWinner === 1 ? 100 : 0;
    if (e.mate != null) return e.mate > 0 ? 100 : 0;
    return U.winPct(e.cp);
  }
  function winFor(e, side) { var w = whiteWin(e); return side === 1 ? w : 100 - w; }

  /* an engine result for a position with `side` to move, as an eval from White's view:
     { cp, mate, best, pv, line (side-to-move view), second } */
  function record(r, side) {
    var l = (r && r.lines && r.lines[0]) || { cp: 0, mate: null, pv: [] }, l2 = r && r.lines && r.lines[1];
    var pv = l.pv || [];
    return {
      cp: l.cp == null ? (l.mate == null ? 0 : null) : l.cp * side, mate: l.mate == null ? null : l.mate * side,
      best: (r && r.best) || pv[0] || null, pv: pv, line: { cp: l.cp, mate: l.mate, pv: pv },
      second: l2 && l2.pv && l2.pv.length ? { cp: l2.cp == null ? null : l2.cp * side, mate: l2.mate == null ? null : l2.mate * side, move: l2.pv[0] } : null
    };
  }
  function overRecord(s) {
    return s.reason === 'checkmate' ? { cp: null, mate: 0, mateWinner: s.winner, best: null, pv: [], over: true, deep: true }
      : { cp: 0, mate: null, best: null, pv: [], over: true, deep: true };
  }

  /* Evaluate every position, from White's view. Each move that looks like an inaccuracy or worse gets a longer
     single-line search of the position after it (and, for some mistakes, of the position before it) before it is labeled.
     job: { startFen, moves, map, mine(i), cancelled(), progress(positionsDone, moveIndex, deep) } */
  function analyseAll(job) {
    var moves = job.moves, n = moves.length, evals = new Array(n + 1), info = [], ints = [];
    if (job.live) job.live(evals); // the screen draws the evals as they come in
    var p = new C.Pos(job.startFen);
    for (var k = 0; k <= n; k++) {
      var s = p.status();
      // a position mid-game only ends the game by mate, stalemate or bare kings; repetitions need a claim
      var over = s.over && (k === n || s.reason === 'checkmate' || s.reason === 'stalemate' || s.reason === 'insufficient material');
      info.push({ side: p.side, over: over ? s : null });
      if (k < n) { ints.push(p.parseMove(moves[k])); p.make(ints[k]); }
    }
    var fresh = true; // the first search of a review starts Stockfish with a clean slate
    function search(i, opts) { var o = Object.assign({ fen: job.startFen, moves: moves.slice(0, i), newGame: fresh }, opts); fresh = false; return Engines.analyse(o); }
    function quick(i) {
      if (info[i].over) { evals[i] = overRecord(info[i].over); return Promise.resolve(); }
      return search(i, quickOpts()).then(function (r) { evals[i] = record(r, info[i].side); },
        function () { evals[i] = { cp: 0, mate: null, best: null, pv: [], line: null }; });
    }
    function deep(i, j) {
      var e = evals[i];
      if (!e || e.deep || e.over) return Promise.resolve();
      job.progress(null, j, true);
      return search(i, deepOpts()).then(function (r) {
        if (job.cancelled()) return;
        if (!r || !r.lines || !r.lines.length) { e.deep = true; return; }
        var d = record(r, info[i].side);
        // a search cut short by the clock can report a very short line; the quick look's longer one starts the same way
        if (d.pv.length < 4 && e.pv && e.pv.length > d.pv.length && e.pv[0] === d.pv[0]) { d.pv = e.pv; d.line.pv = e.pv; }
        d.sh = { cp: e.cp, mate: e.mate };
        d.second = e.second;
        if (e.best && d.best !== e.best) d.second = { cp: e.cp, mate: e.mate, move: e.best };
        d.deep = true;
        d.shift = Math.abs(whiteWin(d) - whiteWin(e)); // how far the quick look was off here
        evals[i] = d;
        lift(i);
      }, function () { e.deep = true; });
    }
    /* a move can't be worth more than the position it was played from: if the longer search of the position after
       move i-1 says it's better than the engine's first choice, it becomes the first choice */
    function lift(i) {
      if (i < 1) return;
      var parent = evals[i - 1], child = evals[i], side = info[i - 1].side;
      if (!parent || parent.over || winFor(child, side) <= winFor(parent, side)) return;
      var old = { cp: parent.cp, mate: parent.mate, move: parent.best };
      if (child.mate === 0) { parent.mate = side; parent.cp = null; }
      else if (child.mate != null) { parent.mate = child.mate + (child.mate > 0 ? 1 : -1); parent.cp = null; }
      else { parent.mate = null; parent.cp = child.cp; }
      parent.best = moves[i - 1];
      parent.pv = [moves[i - 1]].concat(child.pv || []);
      parent.line = { cp: parent.cp == null ? null : parent.cp * side, mate: parent.mate == null ? null : parent.mate * side, pv: parent.pv };
      if (old.move && old.move !== moves[i - 1]) parent.second = old;
      if (!parent.sh) parent.sh = { cp: old.cp, mate: old.mate };
      parent.deep = true;
    }
    function kindOf(j) { return classify(job.startFen, moves, evals, job.map, j, ints).cls[j]; }
    /* the position before a mistake gets a longer look too when its best move will be taught (your own mistakes)
       or when the quick look around it proved unreliable */
    function wantsBefore(j, k) {
      if (SERIOUS.indexOf(k) < 0) return false;
      var a = evals[j + 1];
      return job.mine(j) || !!(a && a.shift > 8);
    }
    function verify(j) {
      if (FLAGGED.indexOf(kindOf(j)) < 0) return Promise.resolve();
      return deep(j + 1, j).then(function () {
        if (job.cancelled() || !wantsBefore(j, kindOf(j))) return;
        return deep(j, j);
      });
    }
    function step(i) {
      if (job.cancelled()) return Promise.resolve(null);
      if (i > n) return settle(0);
      return quick(i).then(function () {
        if (job.cancelled()) return null;
        job.progress(i + 1, Math.max(0, i - 1), false);
        return (i > 0 ? verify(i - 1) : Promise.resolve()).then(function () { return step(i + 1); });
      });
    }
    /* a later longer search can change an earlier label; look again until every flagged move has had its closer look */
    function settle(round) {
      if (job.cancelled()) return Promise.resolve(null);
      var cls = classify(job.startFen, moves, evals, job.map, null, ints).cls, todo = [];
      cls.forEach(function (k, j) {
        if ((FLAGGED.indexOf(k) >= 0 && !evals[j + 1].deep) || (!evals[j].deep && wantsBefore(j, k))) todo.push(j);
      });
      if (!todo.length || round >= 3) return Promise.resolve(evals);
      return todo.reduce(function (pr, j) { return pr.then(function () { return job.cancelled() ? null : verify(j); }); }, Promise.resolve())
        .then(function () { return settle(round + 1); });
    }
    return step(0);
  }

  /* classify every move (or the first upto + 1); ints: the moves already parsed, if at hand.
     Returns { cls[], loss[], acc: {w, b}, counts: {w: {}, b: {}} } */
  function classify(startFen, moves, evals, openingMap, upto, ints) {
    var pos = new C.Pos(startFen), cls = [], losses = [], prevCls = null;
    var end = upto == null ? moves.length : Math.min(moves.length, upto + 1);
    var inBook = startFen === C.START_FEN && !!openingMap;
    for (var i = 0; i < end; i++) {
      var m = ints ? ints[i] : pos.parseMove(moves[i]), mover = pos.side;
      var e0 = evals[i], e1 = evals[i + 1];
      var before = winFor(e0, mover), after = winFor(e1, mover);
      var loss = Math.max(0, before - after);
      var to = (m >> 7) & 127, piece = Math.abs(pos.b[m & 127]), cap = pos.moveCaptured(m);
      pos.make(m); // pos is now the position after the move
      var k;
      if (inBook && i < 24 && openingMap.has(epdOf(pos))) { k = 'book'; loss = 0; }
      else {
        inBook = false;
        var isBest = !!(e0 && e0.best && e0.best === moves[i]);
        if (isBest) loss = 0; // the engine's first choice is never a mistake
        if (isBest || loss < 2) k = isBest ? 'best' : 'excellent';
        else if (loss < 5) k = 'good';
        else if (loss < 10) k = 'inaccuracy';
        else if (loss < 20) k = 'mistake';
        else k = 'blunder';
        if ((k === 'mistake' || k === 'inaccuracy' || k === 'blunder') && (prevCls === 'mistake' || prevCls === 'blunder') && before >= 65 && after < before - 10 && after > 25) k = 'miss';
        if ((k === 'best' || k === 'excellent') && e0 && e0.second && before < 92 && before > 15) {
          var ref = e0.sh ? winFor(e0.sh, mover) : before, sb = winFor(e0.second, mover);
          if (ref - sb >= 20) k = 'great';
        }
        if ((k === 'best' || k === 'excellent' || k === 'great') && before < 95 && after >= 45) {
          var lossSq = pos.hangingLoss(to);
          if (piece >= 2 && piece <= 5 && lossSq >= 200 && lossSq > C.SEE_VAL[Math.abs(cap)] + 150) k = 'brilliant';
        }
      }
      cls.push(k); losses.push(loss); prevCls = k;
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
      if (!xs.length) return null;
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

  /* a name short enough for a sentence */
  function shortName(name) {
    name = String(name || '').replace(/\s+/g, ' ').trim();
    if (!name) return 'Your opponent';
    if (name.length <= 26) return name;
    var first = name.split(' ')[0];
    if (first.length >= 2 && first.length <= 26) return first;
    return name.slice(0, 24) + '…';
  }

  function renderList(root) {
    var S = Store.state;
    root.appendChild(h('div', { class: 'page-head' }, h('div', null, h('h1', null, 'Review'))));
    var grid = h('div', { class: 'grid two' });
    var games = h('div', { class: 'card' }, h('h3', { style: { marginBottom: '8px' } }, 'Your games'));
    if (!S.games.list.length) games.appendChild(h('div', { class: 'empty' }, 'Finished games show up here.', h('div', { style: { marginTop: '10px' } }, h('button', { class: 'btn primary', type: 'button', onclick: function () { App.go('play'); } }, 'Play a game'))));
    var list = h('div', { class: 'list' });
    S.games.list.slice(0, 30).forEach(function (g) {
      var bot = TempoBots.find(g.bot);
      list.appendChild(h('button', { class: 'list-row', type: 'button', onclick: function () { openGame(g.id); } },
        bot ? UI.avatar(bot, 'sm') : h('span', { class: 'avatar sm tone-you' }, '?'),
        h('div', { class: 'grow' }, h('div', { style: { fontWeight: 700 } }, resultPhrase(g, bot ? bot.short || bot.name : (g.opp || 'opponent'))),
          h('div', { class: 'muted small' }, U.dateShort(g.ts) + ', ' + U.plural(Math.ceil((g.plies || 0) / 2), 'move') + (g.reviewed && g.acc != null ? ', ' + Math.round(g.acc) + '% accuracy' : ''))),
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
        var bad = C.validFen(fen); if (bad) { err.textContent = 'The FEN in this PGN isn’t valid: ' + bad + '.'; err.hidden = false; return; }
        var r = C.replay(fen, parsed.sans);
        if (r.error) { err.textContent = r.error; err.hidden = false; return; }
        if (!r.moves.length) { err.textContent = 'No moves found in that PGN.'; err.hidden = false; return; }
        openPgn(text, color, (parsed.headers.White || 'White') + ' vs ' + (parsed.headers.Black || 'Black'));
      } }, U.icon('analyze'), 'Review'),
      h('button', { class: 'btn quiet', type: 'button', onclick: function () { U.readFile('.pgn,.txt').then(function (t) { if (t) ta.value = t; }); } }, U.icon('upload'), 'Open file')));
    grid.appendChild(paste);
    root.appendChild(grid);
  }

  /* The review of one game, in two steps:
     1. The summary: the coach's verdict in a sentence, both accuracies, and one obvious thing to do next (Start review),
        with Fix your mistakes beside it. The graph, the moves and the details follow.
     2. The walk through the game: the coach card under the board explains each move, and Next goes to the next key
        moment (where the book ended, your best and worst moves, and your opponent's blunders). For your mistakes the
        better move stays hidden until you try (Find a better move) or ask (Show best move); Show the fork (or the
        capture, the threat, the checkmate) plays out the reply that punishes the move.
     Any move you open (the arrows, the moves, the graph, a count) starts the walk there. */
  function renderReview(root, src) {
    var startFen = src.startFen, moves = src.moves, sans = src.sans, you = src.color;
    var startPos = new C.Pos(startFen), startSide = startPos.side;
    var opp = String(src.oppName || 'Opponent'), oppShort = shortName(opp);
    root.appendChild(h('div', { class: 'rv-head' },
      h('button', { class: 'back', type: 'button', onclick: function () { App.go('review'); } }, U.icon('back'), 'Games'),
      h('div', { class: 'rv-label', title: src.label }, src.label)));
    if (!moves.length) {
      root.appendChild(h('div', { class: 'card rv-none' }, h('p', null, 'There are no moves to review.'),
        h('button', { class: 'btn', type: 'button', onclick: function () { App.go('review'); } }, 'Back to your games')));
      return;
    }
    App.focus(true);
    // token: bumped by every navigation, so an engine answer that arrives late is dropped instead of shown on the wrong move
    // stage: 'recap' (the summary) or 'walk' (the coach card); practice: { idx } while fixing your mistakes one after another
    var st = { moves: moves, ply: moves.length, shown: moves.length, evals: null, res: null, cancelled: false, token: 0, mode: 'game', retry: null,
      map: null, keyPlies: [], moments: [], stage: 'recap', practice: null, why: {}, pending: {}, details: false, progFrac: 0, follow: true };
    R = st;
    var board = new Board({ orient: you, coords: Store.state.settings.coords !== false, movable: null,
      onMove: function (uci, m) { if (st.mode === 'play') playYours(uci, m); else retryMove(uci, m); } });
    var evalFill = h('i');
    var evalBar = h('div', { class: 'evalbar rv-evalbar', 'aria-hidden': 'true' }, evalFill);
    function stepBtn(icon, label, fn) { return h('button', { class: 'btn icon-only', type: 'button', 'aria-label': label, 'data-repeat': '', onclick: fn }, U.icon(icon)); }
    var controls = h('div', { class: 'controls rv-controls' },
      stepBtn('first', 'Start', function () { goPly(0, { jump: true }); }),
      // step from the position on the board (Show best move and Find a better move show the one before the move)
      stepBtn('back', 'Previous move', function () { goPly(st.shown - 1); }),
      stepBtn('next', 'Next move', function () { goPly(st.shown + 1); }),
      stepBtn('last', 'End', function () { goPly(moves.length, { jump: true }); }),
      h('button', { class: 'btn icon-only', type: 'button', 'aria-label': 'Flip board', onclick: function () { board.flip(); paintEval(); } }, U.icon('flip')));
    var recapBox = h('section', { class: 'card rv-recap', 'aria-label': 'Summary' });
    var card = h('section', { class: 'card rv-card', 'aria-label': 'This move', hidden: true });
    var graphBox = h('div', { class: 'rv-graph' }), movesBox = h('div', { class: 'rv-moves' }), detailsBox = h('div', { class: 'rv-more' });
    var openingBox = h('section', { class: 'card rv-opening', 'aria-label': 'Your opening', hidden: true });
    var summaryBox = h('section', { class: 'card rv-summary', 'aria-label': 'Moves by kind', hidden: true });
    var patternBox = h('div', { class: 'rv-pattern' });
    // under the summary only: the counts, your opening, what keeps going wrong, and the PGN
    var moreBox = h('div', { class: 'rv-extra' }, summaryBox, openingBox, patternBox, detailsBox);
    var panel = h('div', { class: 'panel' }, recapBox, card, graphBox, movesBox, moreBox);
    var arena = h('div', { class: 'arena rv-arena rv-at-recap' },
      h('div', { class: 'board-col' }, h('div', { class: 'with-eval' }, evalBar, board.el), controls), panel);
    root.appendChild(arena);

    /* ---------- positions and moves ---------- */
    var ints = (function () { var p = new C.Pos(startFen); return moves.map(function (u) { var m = p.parseMove(u); p.make(m); return m; }); })();
    function posAt(n) {
      var p = new C.Pos(startFen), last = null;
      for (var i = 0; i < n; i++) { last = ints[i]; p.make(last); }
      return { pos: p, last: last };
    }
    function isWhiteMove(i) { return (i % 2 === 0) === (startSide === 1); }
    function isMine(i) { return isWhiteMove(i) === (you === 'w'); }
    // how far the game followed an opening line you've learned (see Openings.followed)
    st.rep = typeof Openings !== 'undefined' && Openings.followed ? Openings.followed(startFen, moves, you) : null;
    function moveNo(i) { return startPos.full + Math.floor((i + (startSide === 1 ? 0 : 1)) / 2); }
    function moveLabel(i) { return moveNo(i) + (isWhiteMove(i) ? '.' : '...') + sans[i]; }
    function sanOf(pos, uci) { var m = uci && pos.parseMove(uci); return m ? pos.san(m) : null; }
    function arrow(uci, color) { return { from: uci.slice(0, 2), to: uci.slice(2, 4), color: color }; }

    /* ---------- the two steps ---------- */
    function setStage(s) {
      if (st.stage === s) return;
      st.stage = s;
      recapBox.hidden = s !== 'recap' || !st.res;
      card.hidden = s !== 'walk';
      moreBox.hidden = s !== 'recap';
      arena.classList.toggle('rv-at-recap', s === 'recap');
      arena.classList.toggle('rv-walking', s === 'walk');
    }
    function startWalk() {
      var first = st.moments[0];
      goPly(first != null ? first : 1, { reveal: true });
    }
    function toRecap() {
      st.practice = null;
      setStage('recap');
      goPly(moves.length, { stay: true });
      revealBoard();
    }
    function nextMoment() { return st.moments.filter(function (p) { return p > st.ply; })[0]; }
    function prevMoment() { return st.moments.filter(function (p) { return p < st.ply; }).pop(); }

    /* ---------- navigation ---------- */
    // o.stay: keep the summary on screen (only the summary itself does this); o.reveal: bring the board into view;
    // o.jump: straight there (Start and End), without playing the moves on the way
    function goPly(n, o) {
      n = Math.max(0, Math.min(moves.length, n));
      clearTimeout(st.lineT); clearTimeout(st.travelT); clearTimeout(st.playT); clearTimeout(st.followT); st.followT = null;
      st.token++; st.ply = n; st.shown = n; st.mode = 'game'; st.retry = null; st.practice = null; st.play = null;
      if (!(o && o.stay)) st.follow = false; // you took over the board from the engine's replay
      if (st.res && !(o && o.stay)) setStage('walk');
      board.setMovable(null); board.setArrows([]); board.setBadge(null); board.setMarks([]);
      var tok = st.token;
      travel(n, function () { if (tok === st.token) decorate(); }, !!(o && o.jump));
      renderCard(); markMoves(); paintEval(); paintCursor();
      if (o && o.reveal) revealBoard();
    }
    /* Getting the board to position n without losing you on the way (st.at: the game position the board shows, or null
       when it shows something off the game). One move: it plays, forward or back. A few moves ahead: they play quickly,
       and the last one at its own pace. Further ahead, or back: the board fades to a few moves (or one move) before,
       then the moves play, so you always see the move you're looking at being made. */
    function put(k, animate) { var a = posAt(k); board.setPosition(a.pos, { last: a.last, animate: animate, clearLast: !a.last }); st.at = k; }
    function travel(n, landed, jumpTo) {
      var from = st.at, tok = st.token, d = from == null ? null : n - from;
      if (d === 0) { landed(); return; }
      if (d == null || Math.abs(d) === 1 || U.calm()) { put(n, d != null && !U.calm()); landed(); return; }
      var k = from, wait = 0;
      if (jumpTo || n === 0 || d < 0 || d > 10) {
        // the board cross-fades the squares that change (or slides the few pieces that move)
        k = jumpTo || n === 0 ? n : d < 0 ? n - 1 : n - 4;
        put(k, true);
        if (k === n) { landed(); return; }
        wait = 300;
      }
      function step() {
        if (tok !== st.token) return;
        put(++k, true);
        if (k >= n) { landed(); return; }
        st.travelT = setTimeout(step, k === n - 1 ? 340 : 150);
      }
      st.travelT = setTimeout(step, wait);
    }
    /* keep the board on screen after a jump (on a phone the panel sits below it) */
    function revealBoard() {
      var r = board.el.getBoundingClientRect(), vh = window.innerHeight || document.documentElement.clientHeight;
      var ok = r.height <= vh - 16 ? (r.top >= 0 && r.bottom <= vh) : Math.abs(r.top) <= 8;
      if (ok) return;
      var top = Math.max(0, (window.pageYOffset || 0) + r.top - 8);
      var calm = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
      try { window.scrollTo({ top: top, behavior: calm ? 'auto' : 'smooth' }); } catch (e) { window.scrollTo(0, top); }
    }
    function jump(ply) { if (ply != null) goPly(ply, { reveal: true }); }
    function nextKey(after) { return st.keyPlies.filter(function (p) { return p > after; })[0]; }

    /* ---------- the board ---------- */
    function decorate() {
      board.setArrows([]); board.setBadge(null); board.setMarks([]);
      var n = st.ply;
      if (!st.res || n === 0) return;
      var i = n - 1, k = st.res.cls[i];
      board.setBadge({ sq: moves[i].slice(2, 4), kind: k, text: KINDS[k].sym });
      // after a mistake, show the reply that punishes it
      if (FLAGGED.indexOf(k) >= 0) {
        var w = why(i);
        var real = w && w.reply && (w.topic === 'threats' || w.topic === 'fork' || (w.topic === 'safety' && (k !== 'miss' || PIECE_VAL[w.piece] >= 3)));
        if (real) board.setArrows([arrow(w.reply, 'red')]);
      }
    }
    function paintEval() {
      var e = st.evals && st.evals[st.shown], w = e ? whiteWin(e) : 50, flip = board.orient !== 'w';
      evalBar.classList.toggle('flip', flip);
      evalFill.style.height = (flip ? 100 - w : w) + '%';
    }

    /* ---------- explanations ---------- */
    function replyLine(i) {
      var e1 = st.evals[i + 1];
      if (!e1 || e1.over) return null;
      if (e1.line && e1.line.pv && e1.line.pv.length) return e1.line;
      // an older saved review has no engine line here: fetch it, then refresh this move if it's still on screen
      if (!st.pending[i + 1]) {
        st.pending[i + 1] = true;
        Engines.analyse(Object.assign({ fen: startFen, moves: moves.slice(0, i + 1) }, deepOpts())).then(function (r) {
          if (R !== st || st.cancelled) return;
          var l = r && r.lines && r.lines[0];
          if (!l || !l.pv || !l.pv.length) return;
          e1.line = { cp: l.cp, mate: l.mate, pv: l.pv }; e1.pv = l.pv;
          delete st.why[i];
          if (st.stage === 'recap') renderRecap();
          else if (st.mode === 'game' && st.ply === i + 1) { decorate(); renderCard(); }
        }, function () { /* no line: the move keeps its short explanation */ });
      }
      return null;
    }
    function why(i) {
      if (st.why[i]) return st.why[i];
      var reply = replyLine(i); if (!reply) return null;
      var before = posAt(i).pos, m = ints[i], e0 = st.evals[i], side = before.side;
      var w = Explain.bad(before, m, reply, e0 && e0.best, { you: isMine(i), name: oppShort, wb: winFor(e0, side), wa: winFor(st.evals[i + 1], side) });
      st.why[i] = w;
      return w;
    }
    /* a sentence about the best move before move i, with the reason when there is one:
       bestSays(i, function (s) { return 'Best was ' + s; }) gives "Best was Nf3: it develops a knight." */
    function bestSays(i, lead) {
      var e0 = st.evals[i]; if (!e0 || !e0.best) return '';
      var before = posAt(i).pos, san = sanOf(before, e0.best); if (!san) return '';
      // "Best was Nxe5: it wins a knight" when the engine line shows it; "Best was Nf3, which develops a knight" when that only describes the move
      var ri = Explain.reasonsInfo(before, e0.best, e0.line), rs = ri.list;
      return lead(san) + (rs.length ? (ri.hard ? ': it ' : ', which ') + rs.join(' and ') : '') + '.';
    }
    function bestWas(i) { return bestSays(i, function (s) { return 'Best was ' + s; }); }
    function bestLine(i) {
      var e0 = st.evals[i]; if (!e0 || !e0.best) return '';
      var pv = e0.pv && e0.pv.length && e0.pv[0] === e0.best ? e0.pv : [e0.best];
      var mateIn = e0.line && e0.line.mate > 0 ? e0.line.mate * 2 - 1 : 0;
      var line = Explain.numberedLine(posAt(i).pos, pv, mateIn && mateIn <= 7 ? mateIn : 5);
      return line.indexOf(' ') > 0 ? 'The line goes ' + line + '.' : '';
    }
    function openingName(i) {
      if (!st.map) return null;
      var a = posAt(i + 1).pos, o = st.map.get(epdOf(a));
      return o && o.name ? o.name.replace(/'/g, '’') : null;
    }
    /* What the coach says about move i. Your own mistakes don't give the better move away: you can look for it
       first (Find a better move) or ask for it (Show best move). */
    function moveText(i) {
      var k = st.res.cls[i], e0 = st.evals[i], mine = isMine(i), before;
      switch (k) {
        case 'book':
          var nm = openingName(i);
          if (i === st.bookEnd && i < moves.length - 1) return { text: 'The last move that follows a known opening' + (nm ? ' (the ' + nm + ')' : '') + '. After it, both sides were on their own.' };
          return { text: 'A standard opening move' + (nm ? ', part of the ' + nm : '') + '.' };
        case 'best': return { text: 'The computer’s top choice.' };
        case 'excellent': return { text: 'Nearly as good as the best move.' };
        case 'good': return { text: ('A reasonable move. ' + bestSays(i, function (s) { return s + ' was a little better'; })).trim() };
        case 'great': return { text: 'The only good move here, and ' + (mine ? 'you' : oppShort) + ' found it.' };
        case 'brilliant': return { text: 'A strong sacrifice: it gives up material for a winning attack or a better position.' };
        case 'miss':
          before = posAt(i).pos;
          var mi = Explain.missedInfo(before, e0.best, e0.line, { you: mine, name: oppShort });
          // a miss can also be a blunder in its own right (mate, a fork, a piece): say what it allows too
          var wm = why(i), real = wm && (wm.topic === 'threats' || wm.topic === 'fork' || (wm.topic === 'safety' && PIECE_VAL[wm.piece] >= 3));
          var said = mine && mi.what ? 'You missed a move that ' + mi.what + '.' : (mi.sentence || 'This let a win slip away.');
          return { text: said + (real ? ' ' + wm.text : ''), topic: real ? wm.topic : mi.topic };
        default:
          var w = why(i);
          var text = w ? w.text : (st.pending[i + 1] ? 'Looking at what this allows…' : '');
          return { text: ((text ? text + ' ' : '') + (mine ? '' : bestWas(i))).trim(), topic: w && (k === 'mistake' || k === 'blunder') ? w.topic : null };
      }
    }
    /* the reply that punishes move i, when there's one to show: { label, line } */
    var IDEA = { fork: 'Show the fork', safety: 'Show the capture', threats: 'Show the threat' };
    function ideaOf(i) {
      var k = st.res.cls[i]; if (FLAGGED.indexOf(k) < 0) return null;
      var w = why(i); if (!w || !w.reply) return null;
      var real = w.topic === 'threats' || w.topic === 'fork' || (w.topic === 'safety' && (k !== 'miss' || PIECE_VAL[w.piece] >= 3));
      var l = replyLine(i);
      if (!real || !l) return null;
      return { label: w.topic === 'threats' && l.mate != null && l.mate > 0 ? 'Show the checkmate' : IDEA[w.topic], line: l };
    }

    /* ---------- the summary: the coach's verdict, both accuracies, Start review ---------- */
    /* One or two sentences: how many key moments there are to walk through, and your best moment. (It doesn't pick a
       "costliest move": the biggest swing was usually a late blunder in a game already lost, which wasn't the move to learn
       from.) Each move named is a link to it. */
    function coachSays() {
      var best = null, mistakes = st.keyPlies.length, n = st.moments.length;
      st.res.cls.forEach(function (k, i) {
        if (!isMine(i)) return;
        if (k === 'brilliant' && (!best || best.k !== 'brilliant')) best = { i: i, k: k };
        else if (k === 'great' && !best) best = { i: i, k: k };
      });
      function link(i) { return h('button', { class: 'rv-link', type: 'button', onclick: function () { jump(i + 1); } }, moveLabel(i)); }
      var out = [], acc = st.res.acc[you];
      if (!mistakes) out.push(acc != null && acc >= 85 ? 'A clean game: no mistakes to fix.' : 'No big mistakes in this game.');
      else if (!n) out.push('Nothing to walk through this time.');
      else out.push(n === 1 ? 'One key moment to look at' : n + ' key moments to look at', mistakes === n ? '.' : ', ' + (mistakes === 1 ? 'one of them a mistake of yours.' : mistakes + ' of them mistakes of yours.'));
      if (best) out.push(' Your best moment was ', link(best.i), best.k === 'brilliant' ? ', a brilliant sacrifice.' : ', the only good move there.');
      return out;
    }
    function avatarFor(name, bot) { return bot ? UI.avatar(bot, 'sm') : h('span', { class: 'avatar sm tone-you', 'aria-hidden': 'true' }, (name || '?').charAt(0).toUpperCase()); }
    function renderRecap() {
      U.clear(recapBox);
      if (!st.res) return;
      var them = you === 'w' ? 'b' : 'w', acc = st.res.acc;
      function accText(side) { return acc[side] == null ? 'No moves' : Math.round(acc[side]) + '%'; }
      recapBox.appendChild(h('div', { class: 'rv-coach' }, h('span', { class: 'brand-mark rv-coach-mark', 'aria-hidden': 'true' }),
        h('p', { class: 'rv-verdict' }, coachSays())));
      recapBox.appendChild(h('div', { class: 'rv-acc-row', role: 'group', 'aria-label': 'Accuracy' },
        h('div', { class: 'rv-acc' }, avatarFor('Y'), h('div', null, h('span', { class: 'label' }, 'Your accuracy'), h('b', null, accText(you)))),
        h('div', { class: 'rv-acc rv-acc-opp' }, avatarFor(oppShort, src.bot), h('div', null, h('span', { class: 'label rv-opp-name', title: opp }, opp), h('b', null, accText(them))))));
      // the same bar at the bottom as the walk through: what to do next, in the same place
      var n = st.keyPlies.length;
      recapBox.appendChild(h('div', { class: 'rv-foot rv-start' },
        n ? h('button', { class: 'btn rv-fix', type: 'button', 'aria-label': n === 1 ? 'Fix your mistake' : 'Fix your ' + n + ' mistakes', onclick: function () { startPractice(0); } },
          U.icon('refresh'), n === 1 ? 'Fix 1 mistake' : 'Fix ' + n + ' mistakes') : null,
        h('button', { class: 'btn primary rv-go', type: 'button', onclick: startWalk }, 'Start review', U.icon('next'))));
    }

    /* ---------- your opening: where the game left the line you learned ---------- */
    function repInfo() {
      var r = st.rep; if (!r) return null;
      var name = r.line.name, k = r.k;
      if (k >= r.len) return { kind: 'all', text: 'You played your ' + name + ' line all the way through.' };
      if (k >= moves.length) return { kind: 'end', text: 'The whole game stayed in your ' + name + ' line.' };
      var played = moveLabel(k), at = function (san) { return moveNo(k) + (isWhiteMove(k) ? '.' : '...') + san; };
      if (isMine(k)) {
        if (k === 0) return { kind: 'start', ply: k, text: 'You opened with ' + played + '. Your ' + (you === 'w' ? 'White' : 'Black') + ' lines start with ' + r.options.map(at).join(' or ') + '.' };
        return { kind: 'you', ply: k, text: 'You left your ' + (r.agree ? name + ' line' : 'prepared lines') + ' with ' + played + '. ' + (r.agree ? 'The line plays ' : 'Your lines play ') + r.options.map(at).join(' or ') + '.',
          here: 'This left your ' + (r.agree ? name + ' line' : 'prepared lines') + ', which play' + (r.agree ? 's ' : ' ') + r.options.map(at).join(' or ') + ' here.' };
      }
      if (k === 0) return null; // the game never reached your lines
      return { kind: 'them', ply: k, text: oppShort + ' left your ' + (r.agree ? name + ' line' : 'prepared lines') + ' with ' + played + ', so from there you were on your own.',
        here: 'This took the game out of your ' + (r.agree ? name + ' line' : 'prepared lines') + '.' };
    }
    function renderOpening() {
      var info = repInfo();
      U.clear(openingBox);
      openingBox.hidden = !info;
      if (!info) return;
      openingBox.appendChild(h('div', { class: 'label' }, 'Your opening'));
      openingBox.appendChild(h('p', { class: 'rv-text' }, info.text + (info.kind === 'you' && st.repQueued ? ' It’s first in your opening drills now.' : '')));
      var row = h('div', { class: 'rv-actions' });
      if (info.ply != null) row.appendChild(btn('Show the move', function () { jump(info.ply + 1); }, 'quiet'));
      if (info.kind === 'you' || info.kind === 'start') row.appendChild(btn('Drill this line', function () { Openings.queueLine(st.rep.key); Openings.drillLine(st.rep.key); }, '', 'target'));
      if (row.children.length) openingBox.appendChild(row);
    }

    /* ---------- the coach card: where you are, this move, and Next ---------- */
    // when the card grows or shrinks, whatever sits below it glides to its new place (not while the screen is first drawn)
    var still = false;
    function cardBody(fill) {
      function draw() {
        U.clear(card);
        card.appendChild(cardTop());
        var body = h('div', { class: 'rv-body', 'aria-live': 'polite' });
        card.appendChild(body);
        fill(body);
        card.appendChild(cardFoot());
      }
      if (still) draw(); else U.glide(panel, draw);
    }
    function cardTop() {
      var where = '';
      if (st.practice) where = 'Mistake ' + (st.practice.idx + 1) + ' of ' + st.keyPlies.length;
      else if (st.mode === 'play') where = 'Playing it out';
      else if (st.mode !== 'end') {
        var at = st.moments.indexOf(st.ply);
        where = at >= 0 ? 'Key moment ' + (at + 1) + ' of ' + st.moments.length : st.ply ? 'Move ' + moveNo(st.ply - 1) : 'The start';
      }
      return h('div', { class: 'rv-top' },
        h('button', { class: 'btn quiet small rv-to-summary', type: 'button', onclick: toRecap }, U.icon('back'), 'Summary'),
        where ? h('span', { class: 'rv-where' }, where) : null);
    }
    /* the one obvious next step: the next key moment (or, while fixing your mistakes, the next mistake) */
    function cardFoot() {
      var foot = h('div', { class: 'rv-foot' });
      if (st.practice) {
        var idx = st.practice.idx, more = idx + 1 < st.keyPlies.length;
        foot.appendChild(h('button', { class: 'btn primary rv-next', type: 'button', onclick: function () { if (more) startPractice(idx + 1); else practiceDone(); } },
          more ? 'Next mistake' : 'Finish', U.icon('next')));
        return foot;
      }
      if (st.mode === 'end') {
        foot.appendChild(h('button', { class: 'btn primary rv-next', type: 'button', onclick: toRecap }, U.icon('back'), 'Back to the summary'));
        return foot;
      }
      var prev = prevMoment(), next = nextMoment();
      foot.appendChild(h('button', { class: 'btn icon-only rv-prev', type: 'button', 'aria-label': 'Previous key moment', title: 'Previous key moment', disabled: prev == null,
        onclick: function () { jump(prev); } }, U.icon('back')));
      foot.appendChild(h('button', { class: 'btn primary rv-next', type: 'button', 'aria-label': next != null ? 'Next key moment' : 'Finish the review',
        onclick: function () { if (next != null) jump(next); else endWalk(); } }, next != null ? 'Next' : 'Finish', U.icon('next')));
      return foot;
    }
    function moveHead(kind, label, sub) {
      return h('div', { class: 'rv-move' }, h('span', { class: 'rv-k k-' + kind, 'aria-hidden': 'true' }, KINDS[kind] ? KINDS[kind].sym : ''),
        h('div', { class: 'rv-move-text' }, h('div', { class: 'rv-kind-label' }, label), sub ? h('div', { class: 'rv-who' }, sub) : null));
    }
    function btn(label, fn, cls, icon) { return h('button', { class: 'btn small' + (cls ? ' ' + cls : ''), type: 'button', onclick: fn }, icon ? U.icon(icon) : null, label); }
    function showBestBtn(i) { return btn('Best move', function () { showBest(i); }, 'quiet', 'eye'); }
    /* the lesson and the puzzles for the kind of mistake move i was (your own mistakes only) */
    function studyFor(i) {
      if (!isMine(i) || SERIOUS.indexOf(st.res.cls[i]) < 0) return null;
      var t = moveText(i).topic;
      return t ? Explain.studyRow(t) : null;
    }
    function backBtn(i) { return st.practice ? null : btn('Back to the game', function () { goPly(i + 1); }, 'quiet'); }
    /* Play it out from before move i (first: a move to start with, such as the best move or your try) */
    function playBtn(i, first) { return btn('Play it out', function () { startPlay(i, first); }, 'quiet', 'play-out'); }
    function renderCard() {
      if (!st.res || st.stage !== 'walk') return;
      cardBody(function (body) {
        if (st.ply === 0) {
          body.appendChild(h('p', { class: 'rv-text' }, 'This is where the game started. Next takes you to the first key moment; the arrows under the board go one move at a time.'));
          body.appendChild(h('div', { class: 'rv-actions rv-tools' }, playBtn(0)));
          return;
        }
        var i = st.ply - 1, k = st.res.cls[i], mine = isMine(i), t = moveText(i);
        body.appendChild(moveHead(k, KINDS[k].label, (mine ? 'You' : oppShort) + ' played ' + moveLabel(i)));
        if (t.text) body.appendChild(h('p', { class: 'rv-text' }, t.text));
        // where you left the opening line you learned: what it plays, and a drill
        var ri = repInfo();
        if (ri && ri.here && ri.ply === i) {
          body.appendChild(h('p', { class: 'rv-text rv-rep' }, ri.here));
          if (ri.kind === 'you') body.appendChild(h('div', { class: 'rv-actions' }, btn('Drill this line', function () { Openings.queueLine(st.rep.key); Openings.drillLine(st.rep.key); }, '', 'target')));
        }
        if (FLAGGED.indexOf(k) < 0) { body.appendChild(h('div', { class: 'rv-actions rv-tools' }, playBtn(i))); return; }
        var idea = ideaOf(i);
        if (mine) body.appendChild(h('div', { class: 'rv-actions' }, btn('Find a better move', function () { startRetry(i); }, 'rv-try', 'refresh')));
        body.appendChild(h('div', { class: 'rv-actions rv-tools' },
          idea ? btn(idea.label, function () { showLine(i); }, 'quiet', 'resume') : null,
          st.evals[i] && st.evals[i].best ? showBestBtn(i) : null,
          playBtn(i)));
      });
    }
    /* after the last key moment: what's left to do */
    function endWalk() {
      st.token++; st.mode = 'end'; st.practice = null;
      var n = st.keyPlies.length, topic = commonTopic();
      cardBody(function (body) {
        body.appendChild(h('div', { class: 'rv-done' }, U.icon('check'), h('span', null, 'That’s every key moment.')));
        body.appendChild(h('p', { class: 'rv-text' }, n ? 'Want another go at the ' + (n === 1 ? 'move' : n + ' moves') + ' you’d like back? Find a better move for each, one after another.' : 'No mistakes to fix in this game.'));
        if (n) body.appendChild(h('div', { class: 'rv-actions' }, btn(n === 1 ? 'Fix your mistake' : 'Fix your ' + n + ' mistakes', function () { startPractice(0); }, 'rv-try', 'refresh')));
        if (topic) { var sr = Explain.studyRow(topic); if (sr) body.appendChild(sr); }
      });
    }
    /* the kind of mistake you made most in this game (a fork, a piece left loose...), for a lesson and puzzles */
    function commonTopic() {
      var count = {}, top = null;
      st.keyPlies.forEach(function (ply) { var w = why(ply - 1), t = w && w.topic; if (t && t !== 'position') { count[t] = (count[t] || 0) + 1; if (!top || count[t] > count[top]) top = t; } });
      return top;
    }

    /* ---------- show the fork (or capture, threat, checkmate): the reply that punishes the move, played out ---------- */
    function showLine(i) {
      var idea = ideaOf(i); if (!idea) return;
      var tok = ++st.token, a = posAt(i + 1), pv = idea.line.pv, seq = [], p = a.pos.clone(), w = why(i);
      st.mode = 'line'; st.shown = i + 1; st.retry = null; st.at = null;
      // as far as the damage: the piece taken, or the checkmate (eight moves at most, never past the end of the game)
      for (var j = 0, lim = Math.min(pv.length, (w && w.at != null ? w.at : 3) + 1, 8); j < lim; j++) {
        var m = p.parseMove(pv[j]); if (!m) break;
        seq.push({ m: m });
        p.make(m);
        if (p.status().over) break;
      }
      if (!seq.length) return;
      var line = h('p', { class: 'rv-line rv-playing' }), acts = h('div', { class: 'rv-actions' });
      board.setMovable(null); board.setArrows([]); board.setBadge(null); board.setMarks([]);
      board.setPosition(a.pos, { last: a.last, animate: false });
      paintEval();
      cardBody(function (body) {
        body.appendChild(moveHead(st.res.cls[i], idea.label.replace(/^Show the /, 'The '), 'After ' + moveLabel(i)));
        if (w && w.text) body.appendChild(h('p', { class: 'rv-text' }, w.text));
        body.appendChild(line); body.appendChild(acts);
      });
      var at = 0, q = a.pos.clone();
      (function step() {
        if (tok !== st.token || R !== st || st.cancelled) return;
        if (at >= seq.length) {
          acts.appendChild(btn('Watch again', function () { showLine(i); }, 'quiet', 'refresh'));
          acts.appendChild(btn('Back to the move', function () { goPly(i + 1); }, 'quiet'));
          return;
        }
        q.make(seq[at].m);
        board.setPosition(q.clone(), { last: seq[at].m, animate: true, natural: true });
        at++;
        line.textContent = Explain.numberedLine(a.pos, pv, at);
        st.lineT = setTimeout(step, 1050);
      })();
    }

    /* ---------- play it out: from any point, any move, and the engine plays on (to the end, if you like) ----------
       The board starts before the move on screen, so you can play something else there (or the same move). You play the
       side to move; the engine answers for the other side. Play it to the end lets the engine play both sides until the
       game is over (checkmate, stalemate or a draw); Skip to the end gets there at once. */
    var PLAY_CAP = 300; // plies: a game played out further than this stops there
    function startPlay(base, first) {
      clearTimeout(st.lineT); clearTimeout(st.travelT); clearTimeout(st.playT);
      st.token++; st.mode = 'play'; st.retry = null; st.practice = null; st.shown = base;
      var a = posAt(base);
      st.play = { base: base, pos: a.pos, line: [], you: a.pos.side, auto: false, skip: false, thinking: false, over: null, tok: st.token, ev: st.evals && st.evals[base] };
      board.setArrows([]); board.setBadge(null); board.setMarks([]);
      if (st.at !== base) put(base, st.at != null && Math.abs(st.at - base) === 1);
      st.at = null;
      paintPlayEval();
      var m = first && a.pos.parseMove(first);
      if (m) playAdd(m);
      renderPlay();
      playNext();
      revealBoard();
    }
    // engine: the engine's move (carried across naturally, unless skipping to the end)
    function playAdd(m, engine) {
      var P = st.play, san = P.pos.san(m);
      P.pos.make(m);
      P.line.push({ m: m, san: san, uci: C.uci(m) });
      board.setPosition(P.pos.clone(), { last: m, animate: !P.skip, natural: !!engine && !P.skip });
      var s = P.pos.status();
      if (s.over) P.over = s;
      else if (P.line.length >= PLAY_CAP) P.over = { over: true, reason: 'cap' };
      if (P.over) playEnd();
    }
    /* who moves next: you (the board is yours), or the engine (its turn, or it's playing it out) */
    function playNext() {
      var P = st.play;
      if (!P || st.mode !== 'play' || P.tok !== st.token || P.thinking) return;
      board.setMovable(null);
      if (P.over) { renderPlay(); return; }
      if (!P.auto && P.pos.side === P.you) { board.setMovable(P.you === 1 ? 'w' : 'b'); playStatus(); return; }
      P.thinking = true; playStatus();
      var started = performance.now(), tok = P.tok;
      // skipping: quicker searches, still deep enough not to wander into a repetition from a winning position
      var opts = P.skip ? { depth: Engines.strong ? 10 : 4, movetime: 90 } : { depth: Engines.strong ? 12 : 6, movetime: 350 };
      Engines.analyse(Object.assign({ fen: startFen, moves: moves.slice(0, P.base).concat(P.line.map(function (x) { return x.uci; })) }, opts)).then(function (r) {
        if (tok !== st.token || st.mode !== 'play' || R !== st || st.cancelled) return;
        P.thinking = false;
        var u = r && (r.best || (r.lines && r.lines[0] && r.lines[0].pv && r.lines[0].pv[0])), m = u && P.pos.parseMove(u);
        if (!m) { P.over = { over: true, reason: 'stuck' }; renderPlay(); return; }
        if (r.lines && r.lines.length) P.ev = record(r, P.pos.side);
        playAdd(m, true);
        paintPlayEval(); playLine();
        // your turn: the board is yours at once. Played out: each move gets a moment on the board (none when skipping)
        if (!P.auto && !P.over && P.pos.side === P.you) playNext();
        else st.playT = setTimeout(playNext, P.skip ? 0 : Math.max(120, 700 - (performance.now() - started)));
      }, function () {
        if (tok !== st.token) return;
        P.thinking = false; P.over = { over: true, reason: 'stuck' }; renderPlay();
      });
    }
    /* the next move now, whoever's it is (no waiting on the pause between moves) */
    function kick() { clearTimeout(st.playT); playNext(); }
    function playYours(uci, m) {
      var P = st.play; if (!P || P.thinking || P.over || P.pos.side !== P.you) return;
      board.setMovable(null);
      playAdd(m);
      if (P.line.length === 1) renderPlay(); else { playLine(); playStatus(); }
      playNext();
    }
    /* the end of the game played out: the marks on the kings, as at the end of a game */
    function playEnd() {
      var P = st.play, o = P.over, p = P.pos;
      board.setMovable(null);
      if (o.reason === 'checkmate') board.setBadge([{ sq: o.winner === 1 ? p.wk : p.bk, kind: 'end-win', icon: 'crown' }, { sq: o.winner === 1 ? p.bk : p.wk, kind: 'end-lose', text: '#' }]);
      else if (o.result === '1/2-1/2') board.setBadge([{ sq: p.wk, kind: 'end-draw', text: '½' }, { sq: p.bk, kind: 'end-draw', text: '½' }]);
      P.ev = o.reason === 'checkmate' ? { mate: 0, mateWinner: o.winner } : o.result === '1/2-1/2' ? { cp: 0, mate: null } : P.ev;
      paintPlayEval();
    }
    function paintPlayEval() {
      var e = st.play && st.play.ev, w = e ? whiteWin(e) : 50, flip = board.orient !== 'w';
      evalBar.classList.toggle('flip', flip);
      evalFill.style.height = (flip ? 100 - w : w) + '%';
    }
    function sideName(side) { return side === 1 ? 'White' : 'Black'; }
    function playStatus() {
      var P = st.play, el = st.playStatusEl; if (!P || !el) return;
      var o = P.over, text;
      if (o) {
        var n = Math.ceil(P.line.length / 2);
        var later = ', ' + U.plural(n, 'move') + ' later.';
        text = o.reason === 'checkmate' ? sideName(o.winner) + ' wins by checkmate' + later
          : o.reason === 'stalemate' ? 'A draw by stalemate' + later : o.reason === 'insufficient material' ? 'A draw' + later + ' There isn’t enough left to checkmate.'
          : o.reason === 'fifty-move rule' ? 'A draw by the fifty-move rule' + later : o.reason === 'threefold repetition' ? 'A draw' + later + ' The same position came up three times.'
          : o.reason === 'cap' ? 'Stopped after ' + n + ' moves. Nobody had won yet.' : 'The computer couldn’t go on from here.';
      } else if (P.auto) text = P.skip ? 'Skipping to the end…' : 'Playing it out to the end…';
      else if (P.thinking) text = sideName(P.pos.side) + ' is thinking…';
      else if (!P.line.length) text = 'Your move as ' + sideName(P.you) + '. Play the game’s move or try a new one. The computer answers, and you can keep going or let it play to the end.';
      else text = 'Your move (' + sideName(P.you) + '). Or let it play out.';
      el.textContent = text;
      el.classList.toggle('rv-over', !!o);
    }
    function playLine() {
      var P = st.play, el = st.playLineEl; if (!P || !el) return;
      el.hidden = !P.line.length;
      el.textContent = Explain.numberedLine(posAt(P.base).pos, P.line.map(function (x) { return x.uci; }), P.line.length);
      el.scrollTop = el.scrollHeight;
    }
    function renderPlay() {
      var P = st.play; if (!P) return;
      cardBody(function (body) {
        body.appendChild(h('div', { class: 'rv-move' }, h('span', { class: 'rv-k rv-k-play', 'aria-hidden': 'true' }, U.icon('play-out')),
          h('div', { class: 'rv-move-text' }, h('div', { class: 'rv-kind-label' }, 'Play it out'),
            h('div', { class: 'rv-who' }, P.base < moves.length ? 'From before ' + moveLabel(P.base) : 'From the end of the game'))));
        body.appendChild(st.playLineEl = h('p', { class: 'rv-line rv-playline' }));
        body.appendChild(st.playStatusEl = h('p', { class: 'rv-text rv-playstatus', 'aria-live': 'polite' }));
        playLine(); playStatus();
        var acts = h('div', { class: 'rv-actions' });
        if (P.over) acts.appendChild(btn('Play it out again', function () { startPlay(P.base); }, 'rv-try', 'refresh'));
        else if (P.auto) {
          acts.appendChild(btn('Pause', function () { P.auto = false; P.skip = false; renderPlay(); kick(); }, 'quiet', 'pause'));
          if (!P.skip) acts.appendChild(btn('Skip to the end', function () { P.skip = true; renderPlay(); }, 'quiet', 'last'));
        } else {
          var e0 = st.evals && st.evals[P.base];
          if (!P.line.length && e0 && e0.best) acts.appendChild(btn('Play the best move', function () { var m = P.pos.parseMove(e0.best); if (m && !P.thinking && P.pos.side === P.you) { playAdd(m); renderPlay(); kick(); } }, 'quiet', 'star'));
          acts.appendChild(btn('Play it to the end', function () { P.auto = true; renderPlay(); kick(); }, 'rv-try', 'resume'));
        }
        acts.appendChild(btn('Back to the review', function () { goPly(Math.min(moves.length, P.base + 1)); }, 'quiet'));
        body.appendChild(acts);
      });
    }

    /* ---------- show best move: the position before the move, the better move in green, and where it leads ---------- */
    function showBest(i) {
      var e0 = st.evals[i]; if (!e0 || !e0.best) return;
      clearTimeout(st.lineT);
      st.token++; st.mode = 'best'; st.retry = null; st.shown = i; st.at = i;
      var a = posAt(i);
      board.setMovable(null);
      board.setPosition(a.pos, { last: a.last, animate: true, clearLast: !a.last });
      board.setBadge(null); board.setMarks([]);
      board.setArrows([arrow(e0.best, 'green')]);
      paintEval();
      var text = h('p', { class: 'rv-text' }, (bestWas(i) + ' ' + bestLine(i)).trim());
      cardBody(function (body) {
        body.appendChild(moveHead('best', 'Best move', 'Instead of ' + moveLabel(i)));
        body.appendChild(text);
        body.appendChild(h('div', { class: 'rv-actions' }, isMine(i) ? btn('Find a better move', function () { startRetry(i); }, 'rv-try', 'refresh') : null, playBtn(i, e0.best), backBtn(i)));
        var sr = studyFor(i); if (sr) body.appendChild(sr);
      });
      // a search cut short can leave no line to show: look a few moves past the best move, then add where it leads
      if (!bestLine(i)) {
        var tok = st.token, after = a.pos.clone(), bm = after.parseMove(e0.best);
        if (!bm) return;
        after.make(bm);
        if (after.status().over) return;
        Engines.analyse({ fen: after.fen(), depth: Engines.strong ? 12 : 6, movetime: 600 }).then(function (r) {
          var l = r && r.lines && r.lines[0];
          if (tok !== st.token || !l || !l.pv || !l.pv.length) return;
          e0.pv = [e0.best].concat(l.pv);
          var more = bestLine(i);
          if (more) text.textContent = (bestWas(i) + ' ' + more).trim();
        });
      }
    }

    /* ---------- find a better move ---------- */
    /* Fix your mistakes: each of your mistakes in turn, straight into finding a better move */
    function startPractice(idx) {
      if (idx >= st.keyPlies.length) { practiceDone(); return; }
      setStage('walk');
      st.ply = st.keyPlies[idx];
      startRetry(st.ply - 1, { idx: idx });
      markMoves(); paintCursor();
      revealBoard();
    }
    function practiceDone() {
      var n = st.keyPlies.length, topic = commonTopic();
      st.token++; st.practice = null; st.mode = 'end';
      board.setMovable(null);
      cardBody(function (body) {
        body.appendChild(h('div', { class: 'rv-done' }, U.icon('check'), h('span', null, n === 1 ? 'That was your one mistake.' : 'That’s all ' + n + ' of your mistakes.')));
        body.appendChild(h('p', { class: 'rv-text' }, 'Every one of them comes back in Practice, so they stick.'));
        if (topic) { var sr = Explain.studyRow(topic); if (sr) body.appendChild(sr); }
      });
    }
    function startRetry(i, practice) {
      var e0 = st.evals[i]; if (!e0) return;
      clearTimeout(st.lineT);
      if (practice) st.practice = practice;
      st.token++; st.mode = 'retry'; st.shown = i; st.at = i;
      st.retry = { ply: i, tries: st.retry && st.retry.ply === i ? st.retry.tries : 0 };
      var a = posAt(i);
      board.setArrows([]); board.setBadge(null); board.setMarks([]);
      board.setPosition(a.pos, { last: a.last, animate: true, clearLast: !a.last });
      board.setMovable(a.pos.side === 1 ? 'w' : 'b');
      paintEval();
      cardBody(function (body) {
        body.appendChild(moveHead(st.res.cls[i], 'Your turn', 'Find a better move than ' + moveLabel(i)));
        body.appendChild(h('p', { class: 'rv-text' }, 'Play it on the board.' + (st.practice ? ' ' + (why(i) ? why(i).short || '' : '') : '')));
        body.appendChild(h('div', { class: 'rv-actions' }, showBestBtn(i), backBtn(i)));
      });
    }
    function retryMove(uci, m) {
      var r = st.retry; if (!r || st.mode !== 'retry') return;
      var tok = ++st.token, i = r.ply, e0 = st.evals[i];
      var before = posAt(i).pos, after = before.clone(); after.make(m);
      var san = before.san(m);
      board.setMovable(null);
      board.setPosition(after, { last: m, animate: true }); st.at = null;
      cardBody(function (body) { body.appendChild(h('p', { class: 'rv-text' }, 'Checking ' + san, h('span', { class: 'thinking', 'aria-hidden': 'true' }, h('i'), h('i'), h('i')))); });
      if (uci === moves[i]) return sameMove(i);
      var stx = after.status();
      if (uci === e0.best || (stx.over && stx.reason === 'checkmate')) return verdict(tok, i, m, uci, san, { best: true, loss: 0 });
      if (stx.over) return grade({ cp: 0, mate: null, pv: [] });
      Engines.analyse(Object.assign({ fen: startFen, moves: moves.slice(0, i).concat([uci]) }, deepOpts())).then(function (res) {
        grade(res && res.lines && res.lines[0]);
      }, function () { grade(null); });
      function grade(l) {
        if (tok !== st.token || R !== st || st.cancelled) return; // they moved on: never show this verdict
        var wb = winFor(e0, before.side), wa = l ? 100 - (l.mate != null ? (l.mate > 0 ? 100 : 0) : U.winPct(l.cp)) : wb;
        verdict(tok, i, m, uci, san, { loss: wb - wa, line: l, wb: wb, wa: wa });
      }
    }
    function sameMove(i) {
      U.sound.bad();
      cardBody(function (body) {
        body.appendChild(h('div', { class: 'feedback no' }, 'That’s the move from the game. Look for a different one.'));
        body.appendChild(h('div', { class: 'rv-actions' }, btn('Try again', function () { startRetry(i); }, 'primary'), showBestBtn(i)));
      });
    }
    /* how good was your try? */
    function verdict(tok, i, m, uci, san, g) {
      if (tok !== st.token || R !== st || st.cancelled) return;
      var e0 = st.evals[i], before = posAt(i).pos;
      if (g.best || g.loss < 2) {
        U.sound.good();
        Mistakes.solved('g' + (src.gameId || 'x') + '-' + i);
        var bestSan = sanOf(before, e0.best);
        answer(i, uci, 'ok', g.best ? 'Yes, ' + san + ' is the best move here.'
          : 'Yes, ' + san + ' is about as good as the best move' + (bestSan ? ', ' + bestSan : '') + '.');
        return;
      }
      var w = Explain.bad(before, m, g.line, e0.best, { you: true, name: oppShort, wb: g.wb, wa: g.wa });
      if (w.topic === 'position' && g.loss < 10) {
        answer(i, uci, 'safe', san + ' is safe, but ' + (bestSays(i, function (s) { return s + ' was best'; }) || 'the computer’s choice was better.'));
        return;
      }
      // nothing punishes the try, but it misses something much better: say so calmly, point at the idea, and let them look again
      if (w.topic === 'position') {
        st.retry.tries++;
        var r0 = (e0.best ? Explain.reasons(before, e0.best, e0.line) : [])[0] || '';
        var nudge = /checkmate/.test(r0) ? 'Look for a checkmate.' : /attacks two/.test(r0) ? 'Look for a move that attacks two things at once.'
          : /wins|takes/.test(r0) ? 'Look for a way to win material.' : 'Look for a stronger move.';
        cardBody(function (body) {
          body.appendChild(h('div', { class: 'feedback info' }, san + ' is safe, but there’s a much stronger move here. ' + nudge));
          body.appendChild(h('div', { class: 'rv-actions' }, btn('Try again', function () { startRetry(i); }, 'primary'), showBestBtn(i)));
        });
        return;
      }
      U.sound.bad();
      st.retry.tries++;
      // leave the try on the board with the reply that punishes it
      if (w.reply && w.topic !== 'position') board.setArrows([arrow(w.reply, 'red')]);
      cardBody(function (body) {
        body.appendChild(h('div', { class: 'feedback no' }, san + ' doesn’t work. ' + w.text));
        body.appendChild(h('div', { class: 'rv-actions' }, btn('Try again', function () { startRetry(i); }, 'primary'), showBestBtn(i)));
      });
    }
    /* after a try that's good enough: the position before the move, the try in blue and the best move in green */
    function answer(i, uci, tone, msg) {
      var e0 = st.evals[i], a = posAt(i), arrows = [];
      st.mode = 'answer'; st.shown = i; st.at = i;
      board.setMovable(null);
      board.setPosition(a.pos, { last: a.last, animate: true, clearLast: !a.last });
      if (uci !== e0.best) arrows.push(arrow(uci, 'blue'));
      if (e0.best) arrows.push(arrow(e0.best, 'green'));
      board.setBadge(null); board.setArrows(arrows);
      paintEval();
      cardBody(function (body) {
        body.appendChild(h('div', { class: 'feedback ' + (tone === 'ok' ? 'ok' : 'info') }, msg));
        var line = bestLine(i);
        if (line || arrows.length > 1) body.appendChild(h('p', { class: 'rv-line' }, (arrows.length > 1 ? 'Your move is in blue and the best move in green. ' : '') + line));
        body.appendChild(h('div', { class: 'rv-actions' },
          tone === 'ok' ? null : btn('Try again', function () { startRetry(i); }),
          playBtn(i, uci), backBtn(i)));
        var sr = studyFor(i); if (sr) body.appendChild(sr);
      });
    }

    /* ---------- moves list: a table beside the board, a strip under it on a phone ---------- */
    function buildMoves() {
      U.clear(movesBox);
      var box = h('div', { class: 'moves rv-movelist', 'aria-label': 'Moves' }), num = startPos.full;
      st.mvButtons = [];
      sans.forEach(function (san, i) {
        var white = isWhiteMove(i);
        if (white) box.appendChild(h('span', { class: 'n' }, num + '.'));
        else if (i === 0) { box.appendChild(h('span', { class: 'n' }, num + '...')); box.appendChild(h('span', { class: 'gap', 'aria-hidden': 'true' })); }
        var k = st.res ? st.res.cls[i] : null, sym = k && MARKED.indexOf(k) >= 0 ? KINDS[k].sym : '';
        var b = h('button', { class: 'mv', type: 'button', 'aria-label': san + (sym ? ', ' + KINDS[k].label : ''), onclick: function () { goPly(i + 1, { reveal: true }); } },
          san, sym ? h('span', { class: 'sym s-' + k, 'aria-hidden': 'true' }, sym) : null);
        st.mvButtons.push(b);
        box.appendChild(b);
        if (!white) num++;
      });
      movesBox.appendChild(box);
      st.mvBox = box;
      markMoves();
    }
    function markMoves() {
      if (!st.mvButtons) return;
      st.mvButtons.forEach(function (b, i) { b.classList.toggle('on', st.ply === i + 1); });
      var on = st.mvButtons[st.ply - 1], box = st.mvBox;
      if (!box) return;
      var strip = box.scrollWidth > box.clientWidth + 1;
      if (!on) { if (st.ply === 0) { box.scrollTop = 0; box.scrollLeft = 0; } return; }
      // scroll the list itself, never the page
      var br = box.getBoundingClientRect(), r = on.getBoundingClientRect();
      if (strip) { if (r.left < br.left + 4 || r.right > br.right - 4) box.scrollLeft += (r.left - br.left) - (box.clientWidth - r.width) / 2; }
      else if (r.top < br.top + 4 || r.bottom > br.bottom - 4) box.scrollTop += (r.top - br.top) - (box.clientHeight - r.height) / 2;
    }

    /* ---------- the evaluation graph: a dot on each key moment ---------- */
    function renderGraph() {
      U.clear(graphBox);
      if (!st.evals) return;
      var W = 600, H = 110, n = st.evals.length, NS = 'http://www.w3.org/2000/svg';
      function el(tag, attrs) { var e = document.createElementNS(NS, tag); Object.keys(attrs).forEach(function (k) { e.setAttribute(k, attrs[k]); }); return e; }
      var x = function (i) { return n <= 1 ? 0 : W * i / (n - 1); };
      var y = function (i) { return H * (1 - whiteWin(st.evals[i]) / 100); };
      var svg = el('svg', { viewBox: '0 0 ' + W + ' ' + H, preserveAspectRatio: 'none', class: 'evalgraph', role: 'img', 'aria-label': 'Evaluation over the game' });
      svg.appendChild(el('rect', { width: W, height: H, class: 'eg-black' }));
      var d = 'M0 ' + H;
      for (var i = 0; i < n; i++) d += ' L' + x(i).toFixed(1) + ' ' + y(i).toFixed(1);
      d += ' L' + W + ' ' + H + ' Z';
      svg.appendChild(el('path', { d: d, class: 'eg-white' }));
      svg.appendChild(el('line', { x1: 0, x2: W, y1: H / 2, y2: H / 2, class: 'eg-mid' }));
      var cur = el('line', { x1: x(st.ply), x2: x(st.ply), y1: 0, y2: H, class: 'eg-cur' });
      svg.appendChild(cur);
      var plot = h('div', { class: 'rv-plot' }, svg);
      // markers sit on top as round dots, so stretching the graph doesn't squash them
      st.moments.forEach(function (ply) {
        var k = st.res.cls[ply - 1];
        if (k === 'book') return;
        plot.appendChild(h('span', { class: 'rv-dot k-' + k, 'data-ply': ply, style: { left: (x(ply) / W * 100) + '%', top: (y(ply) / H * 100) + '%' } }));
      });
      plot.addEventListener('click', function (e) {
        var rc = plot.getBoundingClientRect(), f = Math.max(0, Math.min(1, (e.clientX - rc.left) / rc.width));
        goPly(Math.round(f * (n - 1)), { reveal: true });
      });
      graphBox.appendChild(plot);
      graphBox.appendChild(h('p', { class: 'rv-key' },
        h('span', null, h('i', { class: 'sw sw-white' }), 'White ahead'),
        h('span', null, h('i', { class: 'sw sw-black' }), 'Black ahead'),
        h('span', { class: 'rv-key-tip' }, U.touchWords('Click to jump to a move'))));
      st.cur = cur; st.gx = x; st.plot = plot;
    }
    function paintCursor() {
      if (!st.cur) return;
      var xx = st.gx(st.ply); st.cur.setAttribute('x1', xx); st.cur.setAttribute('x2', xx);
      [].forEach.call(st.plot.querySelectorAll('.rv-dot'), function (d) { d.classList.toggle('on', +d.getAttribute('data-ply') === st.ply && st.stage === 'walk'); });
    }

    /* ---------- details: how many moves of each kind, yours beside your opponent's ---------- */
    /* Every kind is listed, so a game with no blunders says 0 rather than leaving the row out.
       Tapping a kind steps through those moves, yours first. */
    var KIND_COLS = [['brilliant', 'great', 'best', 'excellent', 'good'], ['book', 'inaccuracy', 'mistake', 'miss', 'blunder']];
    var SHORT = { great: 'Great', best: 'Best' }; // the summary's narrow columns; the move card keeps the full names
    function renderSummary() {
      U.clear(summaryBox);
      summaryBox.hidden = !st.res;
      if (!st.res) return;
      var me = you, them = you === 'w' ? 'b' : 'w';
      summaryBox.appendChild(h('div', { class: 'label rv-sum-label' }, 'Moves by kind'));
      var grid = h('div', { class: 'rv-kinds', role: 'table', 'aria-label': 'Moves by kind' });
      KIND_COLS.forEach(function (col) {
        var group = h('div', { class: 'rv-kind-col', role: 'rowgroup' });
        group.appendChild(h('div', { class: 'rv-kind-head', role: 'row' }, h('span', { role: 'columnheader', class: 'sr-only' }, 'Kind'),
          h('span', { role: 'columnheader', class: 'rv-n' }, 'You'), h('span', { role: 'columnheader', class: 'rv-n', title: opp, 'aria-label': oppShort }, 'Them')));
        col.forEach(function (k) {
          var a = st.res.counts[me][k] || 0, b = st.res.counts[them][k] || 0;
          group.appendChild(h('button', { class: 'rv-kind' + (a + b ? '' : ' none'), type: 'button', role: 'row', 'data-kind': k, disabled: !(a + b), 'data-repeat': '',
              'aria-label': KINDS[k].label + ': you ' + a + ', ' + oppShort + ' ' + b, onclick: function () { stepKind(k); } },
            h('span', { class: 'rv-kind-name', role: 'rowheader' }, h('span', { class: 'dot-k k-' + k }), SHORT[k] || KINDS[k].label),
            h('span', { class: 'rv-n' + (a ? '' : ' zero'), role: 'cell' }, String(a)),
            h('span', { class: 'rv-n rv-them' + (b ? '' : ' zero'), role: 'cell' }, String(b))));
        });
        grid.appendChild(group);
      });
      summaryBox.appendChild(grid);
    }
    /* the next move of a kind after the one on the board, yours first, going round */
    function stepKind(k) {
      if (!st.res) return;
      var mineList = [], theirs = [];
      st.res.cls.forEach(function (c, i) { if (c === k) (isMine(i) ? mineList : theirs).push(i + 1); });
      var list = mineList.length ? mineList : theirs;
      if (!list.length) return;
      jump(list.filter(function (p) { return p > st.ply; })[0] || list[0]);
    }
    function renderDetails() {
      U.clear(detailsBox);
      if (!st.res) return;
      detailsBox.appendChild(h('div', { class: 'row rv-pgn' },
        btn('Copy PGN', function () { U.copyText(pgnText(), null).then(function (ok) { App.toast(ok ? 'PGN copied' : 'Copying isn’t allowed here'); }); }, 'quiet', 'copy'),
        U.canSaveFile() ? btn('Save PGN', function () { U.saveFile('tempo-game.pgn', pgnText(), 'application/x-chess-pgn'); }, 'quiet', 'download') : null));
    }
    function pgnText() {
      if (src.pgn) return src.pgn;
      var p = new C.Pos(startFen), ms = [];
      moves.forEach(function (u) { var m = p.parseMove(u); ms.push(m); p.make(m); });
      return C.pgnFromMoves({ Event: 'Tempo game' }, startFen, ms);
    }

    /* ---------- while the engine reads the game ----------
       The board runs back to the start and replays the game as the engine reads it, under a gold scanner; when the engine
       stops to double-check a move, the pieces fidget while they wait;
       the eval bar and the graph fill in as it goes; Tempo's mark spins; and silly lines keep you company. A move the
       engine wants a closer look at gets a gold ring and a suspicious remark. Tap a move and the board is yours again.
       With reduced motion: no scanner, no hopping, no spinning. */
    var SILLY = ['Putting on its reading glasses…', 'Asking the knight why it moves like that…', 'Counting all 64 squares. Twice, to be safe.',
      'Telling the bishops to stay in their lanes…', 'Checking under the board for extra queens…', 'Interviewing the pawns…',
      'Doing chess math. Carry the knight…', 'Thinking 20 moves ahead. Okay, 19.', 'Reminding the knight it isn’t a horse…',
      'Asking the queen to stop showing off…', 'Whispering to the king. He’s nervous.', 'Waking up the rooks in the corners…',
      'Looking for brilliant moves. Staying positive.', 'Untangling a fork…', 'Polishing the crown…', 'Consulting the ancient scrolls of chess…',
      'Making sure nobody castled twice…', 'Sharpening its pencil…', 'Pretending this is easy…', 'Asking the clock for a little more time…'];
    function renderProgress() {
      U.clear(recapBox);
      recapBox.hidden = false; moreBox.hidden = true;
      arena.classList.add('rv-scanning');
      st.beam = h('div', { class: 'rv-beam', 'aria-hidden': 'true' });
      board.el.appendChild(st.beam);
      st.sillyAt = Math.floor(Math.random() * SILLY.length);
      st.silly = h('div', { class: 'rv-silly in' }, SILLY[st.sillyAt]);
      recapBox.appendChild(h('div', { class: 'rv-coach' }, h('span', { class: 'brand-mark rv-coach-mark rv-thinking', 'aria-hidden': 'true' }),
        h('div', { class: 'grow' }, h('div', { class: 'rv-verdict' }, 'Reviewing your game'), st.silly,
          st.progText = h('div', { id: 'rv-progress', class: 'muted rv-prog' }, 'Starting…'))));
      st.progBar = UI.meter(0);
      recapBox.appendChild(st.progBar);
      st.sillyT = setInterval(function () { silly(); }, 2600);
      // the board runs back to the start, and the game plays through again as the engine reads it
      st.follow = true; st.followTo = 0;
      put(0, true); board.setMarks([]);
      evalFill.style.height = '50%';
    }
    /* the next silly line (or the one given), sliding in */
    function silly(text) {
      if (!st.silly || !st.silly.isConnected || st.cancelled) { clearInterval(st.sillyT); return; }
      if (!text) { st.sillyAt = (st.sillyAt + 1) % SILLY.length; text = SILLY[st.sillyAt]; }
      st.silly.classList.remove('in'); void st.silly.offsetWidth;
      st.silly.textContent = text; st.silly.classList.add('in');
    }
    function stopScan() {
      clearInterval(st.sillyT); clearTimeout(st.followT); clearTimeout(st.idleT); st.followT = null; st.follow = false;
      arena.classList.remove('rv-scanning'); arena.classList.remove('rv-idle');
      if (st.beam) { st.beam.remove(); st.beam = null; }
    }
    function progress(done, j, deep) {
      if (st.cancelled || !st.progText || !st.progText.isConnected) return;
      var total = moves.length + 1, last = moveNo(moves.length - 1), at = Math.min(moveNo(j), last);
      if (done != null) st.progDone = done;
      st.progText.textContent = (deep ? 'Double-checking move ' : 'Checking move ') + at + ' of ' + last + (Engines.strong ? '' : ' with the built-in engine');
      st.progFrac = Math.max(st.progFrac, ((st.progDone || 0) + (deep ? 0.5 : 0)) / total);
      var bar = st.progBar.querySelector('i'); if (bar) bar.style.width = Math.round(Math.min(1, st.progFrac) * 100) + '%';
      // a move the engine wants a closer look at: a suspicious remark, once per move
      if (deep && st.susp !== j) {
        st.susp = j;
        var mv = moveLabel(j);
        silly(U.pick(['Hmm. ' + mv + ' looks suspicious…', 'Taking a closer look at ' + mv + '…', 'Wait. ' + mv + '? Checking that again…']));
        clearInterval(st.sillyT); st.sillyT = setInterval(function () { silly(); }, 2600);
      }
      // the board follows the engine forward through the game; a move it double-checks gets a ring if it's on the board
      if (st.follow && !deep && done != null) follow(done - 1);
      else if (st.follow && deep && st.at === j + 1) board.setMarks([{ sq: moves[j].slice(2, 4), kind: 'ring' }]);
      liveGraph();
    }
    /* The engine has read up to position k: the board plays the moves there one at a time at a steady pace, a little
       quicker when the engine has raced ahead, so you watch the game again as it's checked. */
    function follow(k) {
      if (k == null || k < 0 || k > moves.length || k <= (st.followTo || 0)) return;
      st.followTo = k;
      if (!st.followT) followStep();
    }
    function followStep() {
      st.followT = null; clearTimeout(st.idleT);
      if (!st.follow || st.cancelled || st.at == null) return;
      if (st.at >= st.followTo) {
        // caught up with the engine: if it's taking its time (double-checking a move), the pieces start to fidget
        st.idleT = setTimeout(function () { if (st.follow && !st.cancelled) arena.classList.add('rv-idle'); }, 900);
        return;
      }
      arena.classList.remove('rv-idle');
      var k = st.at + 1, behind = st.followTo - k, calm = U.calm();
      put(k, !calm);
      board.setMarks([]);
      var e = st.liveEvals && st.liveEvals[k];
      if (e) { var w = whiteWin(e), flip = board.orient !== 'w'; evalBar.classList.toggle('flip', flip); evalFill.style.height = (flip ? 100 - w : w) + '%'; }
      // a steady film-like rhythm: a little quicker the further the engine has got ahead
      st.followT = setTimeout(followStep, calm ? 150 : Math.max(260, 520 - behind * 35));
    }
    /* the graph, drawn as far as the engine has read */
    function liveGraph() {
      var ev = st.liveEvals; if (!ev) return;
      var W = 600, H = 110, n = moves.length + 1, NS = 'http://www.w3.org/2000/svg';
      function el(tag, attrs) { var e = document.createElementNS(NS, tag); Object.keys(attrs).forEach(function (k) { e.setAttribute(k, attrs[k]); }); return e; }
      if (!st.live || !st.live.isConnected) {
        var svg = el('svg', { viewBox: '0 0 ' + W + ' ' + H, preserveAspectRatio: 'none', class: 'evalgraph', 'aria-hidden': 'true' });
        st.liveBg = el('rect', { width: 0, height: H, class: 'eg-black' });
        st.livePath = el('path', { d: '', class: 'eg-white' });
        svg.appendChild(st.liveBg); svg.appendChild(st.livePath);
        svg.appendChild(el('line', { x1: 0, x2: W, y1: H / 2, y2: H / 2, class: 'eg-mid' }));
        st.live = h('div', { class: 'rv-plot rv-live' }, svg);
        U.clear(graphBox); graphBox.appendChild(st.live);
      }
      var x = function (i) { return n <= 1 ? 0 : W * i / (n - 1); }, pts = [];
      for (var i = 0; i < n && ev[i]; i++) pts.push(x(i).toFixed(1) + ' ' + (H * (1 - whiteWin(ev[i]) / 100)).toFixed(1));
      if (!pts.length) return;
      var end = x(pts.length - 1).toFixed(1);
      st.liveBg.setAttribute('width', end);
      st.livePath.setAttribute('d', 'M0 ' + H + ' L' + pts.join(' L') + ' L' + end + ' ' + H + ' Z');
    }

    st.keydown = function (e) {
      if (e.target && /input|textarea|select/i.test(e.target.tagName)) return;
      if (e.key === 'ArrowLeft') goPly(st.shown - 1);
      else if (e.key === 'ArrowRight') goPly(st.shown + 1);
      else if (e.key === 'Home') goPly(0, { jump: true });
      else if (e.key === 'End') goPly(moves.length, { jump: true });
    };
    document.addEventListener('keydown', st.keydown);

    buildMoves();
    goPly(moves.length, { stay: true });

    /* The key moments: the last move from the opening book (when the game went on), where you left the opening line you
       learned, your brilliant, great and serious moves, and your opponent's brilliant moves, blunders and misses. keyPlies: your mistakes, for Fix your mistakes.
       fresh: the review has just finished while you watched, so the summary eases in rather than shoving the panel down. */
    var MOMENTS_MINE = ['brilliant', 'great', 'mistake', 'miss', 'blunder'], MOMENTS_THEIRS = ['brilliant', 'blunder', 'miss'];
    function done(fresh) {
      st.keyPlies = []; st.moments = []; st.bookEnd = -1;
      st.res.cls.forEach(function (k, i) {
        if (k === 'book') st.bookEnd = i;
        if (isMine(i) && SERIOUS.indexOf(k) >= 0) st.keyPlies.push(i + 1);
        if ((isMine(i) ? MOMENTS_MINE : MOMENTS_THEIRS).indexOf(k) >= 0) st.moments.push(i + 1);
      });
      if (st.bookEnd >= 0 && st.bookEnd < moves.length - 1) st.moments.push(st.bookEnd + 1);
      // and the move where you left the opening line you learned
      var ri = repInfo();
      if (ri && ri.kind === 'you' && st.moments.indexOf(ri.ply + 1) < 0) st.moments.push(ri.ply + 1);
      st.moments.sort(function (a, b) { return a - b; });
      st.why = {};
      stopScan();
      function show() {
        buildMoves(); renderGraph(); renderSummary(); renderDetails(); renderOpening(); renderRecap();
        U.clear(patternBox);
        if (src.gameId) { var pc = UI.patternCard({ label: 'Across your games', cls: 'rv-pattern-card' }); if (pc) patternBox.appendChild(pc); }
        st.stage = null; setStage('recap');
        goPly(moves.length, { stay: true });
      }
      if (fresh) {
        U.glide(panel, show);
        // ta-da: every piece jumps once, and the summary slides in
        recapBox.classList.add('rv-fresh'); arena.classList.add('rv-tada');
        setTimeout(function () { arena.classList.remove('rv-tada'); recapBox.classList.remove('rv-fresh'); }, 900);
      } else { still = true; try { show(); } finally { still = false; } }
    }

    // use a saved review if it was made the current way
    var saved = src.saved, extra = src.savedExtra;
    if (saved && extra && extra.v === SAVE_VERSION && saved.ev && saved.cls && saved.ev.length === moves.length + 1 && saved.cls.length === moves.length) {
      st.evals = saved.ev.map(function (v, i) {
        var side = i % 2 === 0 ? startSide : -startSide, pv = extra.pv && typeof extra.pv[i] === 'string' ? extra.pv[i].split(' ').filter(Boolean) : null;
        return unpackEval(v, saved.best[i], pv, side);
      });
      var counts = saved.counts || { w: {}, b: {} };
      function sideAcc(s) { return Object.keys(counts[s] || {}).length ? saved.acc[s] : null; }
      st.res = { cls: saved.cls.split('').map(function (c) { return FROM_CODE[c]; }), acc: { w: sideAcc('w'), b: sideAcc('b') }, counts: counts };
      done();
      Data.openings().then(function (map) { if (R !== st) return; st.map = map; if (st.mode === 'game') renderCard(); });
      return;
    }
    renderProgress();
    Promise.all([Data.openings(), Engines.sfReady()]).then(function (res) {
      if (st.cancelled) return;
      st.map = res[0];
      return analyseAll({ startFen: startFen, moves: moves, map: st.map, mine: isMine, cancelled: function () { return st.cancelled; }, progress: progress,
        live: function (ev) { st.liveEvals = ev; } }).then(function (evals) {
        if (!evals || st.cancelled) return;
        st.evals = evals;
        st.res = classify(startFen, moves, evals, st.map);
        save();
        var ri = repInfo();
        if (ri && ri.kind === 'you') st.repQueued = Openings.queueLine(st.rep.key);
        done(true);
      });
    }).catch(function (e) {
      if (st.cancelled) return;
      stopScan();
      if (st.progText) st.progText.textContent = 'The review stopped: ' + (e && e.message ? e.message : 'something went wrong') + '.';
    });

    function save() {
      if (!src.gameId) return;
      var g = gameById(src.gameId); if (!g) return;
      var mineAcc = st.res.acc[you];
      if (mineAcc != null) { g.reviewed = true; g.acc = mineAcc; g.counts = st.res.counts[you]; }
      var idx = Store.state.games.list.indexOf(g);
      if (idx < 30 && mineAcc != null) {
        var acc = st.res.acc;
        g.rv = { ev: st.evals.map(packEval), best: st.evals.map(function (e) { return e.best || ''; }), cls: st.res.cls.map(function (k) { return CODE[k]; }).join(''),
          acc: { w: acc.w == null ? 100 : acc.w, b: acc.b == null ? 100 : acc.b }, counts: st.res.counts };
        g.rvx = { v: SAVE_VERSION, pv: savedLines() };
      }
      Store.touch('games');
      Mistakes.addFromReview(src.gameId, startFen, moves, st.evals, st.res.cls, isMine);
    }
    /* the engine lines around each flagged move, so a saved review can explain itself without the engine */
    function savedLines() {
      var out = {};
      st.res.cls.forEach(function (k, i) {
        if (FLAGGED.indexOf(k) < 0 && k !== 'good') return;
        [i, i + 1].forEach(function (j) { var e = st.evals[j]; if (e && e.pv && e.pv.length) out[j] = e.pv.slice(0, 8).join(' '); });
      });
      return out;
    }
    function packEval(e) { if (e.mate === 0) return e.mateWinner === 1 ? 20000 : -20000; if (e.mate != null) return e.mate > 0 ? 10000 - e.mate : -10000 - e.mate; return Math.max(-9000, Math.min(9000, Math.round(e.cp || 0))); }
    function unpackEval(v, best, pv, side) {
      if (v >= 20000) return { mate: 0, mateWinner: 1, best: null, pv: [], over: true };
      if (v <= -20000) return { mate: 0, mateWinner: -1, best: null, pv: [], over: true };
      var e = v > 9000 ? { cp: null, mate: 10000 - v } : v < -9000 ? { cp: null, mate: -10000 - v } : { cp: v, mate: null };
      e.best = best || null;
      e.pv = pv && pv.length ? pv : (best ? [best] : []);
      e.line = pv && pv.length ? { cp: e.cp == null ? null : e.cp * side, mate: e.mate == null ? null : e.mate * side, pv: e.pv } : null;
      return e;
    }
  }

  App.register('review', {
    render: function (root, params) {
      if (params && params.gameId) {
        var g = gameById(params.gameId);
        if (!g) { renderList(root); return; }
        var parsed = C.parsePgn(g.pgn), fen = parsed.headers.FEN || C.START_FEN;
        if (C.validFen(fen)) { renderList(root); return; }
        var r = C.replay(fen, parsed.sans), bot = TempoBots.find(g.bot), bn = bot ? bot.short || bot.name : null;
        renderReview(root, { gameId: g.id, pgn: g.pgn, startFen: fen, moves: r.moves.map(C.uci), sans: sansOf(fen, r.moves), color: g.color,
          label: resultPhrase(g, bn || 'opponent') + ', ' + U.dateShort(g.ts), oppName: bn || (g.opp || 'Opponent'), bot: bot || null, saved: g.rv, savedExtra: g.rvx });
      } else if (params && params.pgn) {
        var p2 = C.parsePgn(params.pgn), fen2 = p2.headers.FEN || C.START_FEN;
        if (C.validFen(fen2)) { renderList(root); return; }
        var r2 = C.replay(fen2, p2.sans);
        renderReview(root, { pgn: params.pgn, startFen: fen2, moves: r2.moves.map(C.uci), sans: sansOf(fen2, r2.moves), color: params.color || 'w', label: params.label || 'Imported game',
          oppName: params.color === 'b' ? (p2.headers.White || 'White') : (p2.headers.Black || 'Black') });
      } else renderList(root);
    },
    leave: function () { if (R) { R.cancelled = true; R.token++; clearInterval(R.sillyT); clearTimeout(R.lineT); clearTimeout(R.travelT); clearTimeout(R.playT); document.removeEventListener('keydown', R.keydown); R = null; } Engines.stopAll(); },
    busy: function () { return !!R; }
  });
  function sansOf(fen, ms) { var p = new C.Pos(fen), out = []; ms.forEach(function (m) { out.push(p.san(m)); p.make(m); }); return out; }

  /* for tests: what the review screen is showing */
  function testState() {
    if (!R) return null;
    return { ply: R.ply, mode: R.mode, stage: R.stage, practice: R.practice ? R.practice.idx : null, moments: R.moments.slice(), shown: R.shown, at: R.at,
      play: R.play ? { base: R.play.base, line: R.play.line.map(function (x) { return x.uci; }), auto: R.play.auto, over: R.play.over ? R.play.over.reason : null, you: R.play.you } : null,
      done: !!R.res, token: R.token, keyPlies: R.keyPlies.slice(), moves: R.moves.slice(), cls: R.res ? R.res.cls.slice() : null,
      evals: R.evals ? R.evals.map(function (e) { return e ? { cp: e.cp, mate: e.mate, best: e.best, deep: !!e.deep, pv: (e.pv || []).slice(0, 8) } : null; }) : null };
  }

  return { openGame: openGame, openPgn: openPgn, classify: classify, KINDS: KINDS, _state: testState };
})();

/* Positions from your own games where you went wrong, replayed with spaced repetition. */
var Mistakes = (function () {
  'use strict';
  var C = TempoCore;
  function addFromReview(gameId, startFen, moves, evals, cls, isMine) {
    var S = Store.state, items = S.mistakes.items, p = new C.Pos(startFen), changed = false, keep = {};
    for (var i = 0; i < moves.length; i++) {
      var k = cls[i];
      if (isMine(i) && (k === 'blunder' || k === 'mistake' || k === 'miss') && evals[i] && evals[i].best && evals[i].best !== moves[i]) {
        var id = 'g' + gameId + '-' + i, ex = items.filter(function (x) { return x.id === id; })[0], topic = topicOf(p, moves[i], k, evals[i], evals[i + 1]);
        keep[id] = true;
        if (!ex) { items.unshift({ id: id, fen: p.fen(), played: moves[i], best: evals[i].best, kind: k, topic: topic, ts: Date.now(), box: 0, due: Date.now(), seen: 0 }); changed = true; }
        else if (ex.gone || ex.best !== evals[i].best || ex.kind !== k || ex.topic !== topic) {
          // a newer review of the same game: keep the item, with the newer answer
          if (ex.gone) { delete ex.gone; ex.seen = (ex.seen || 0) + 1; }
          ex.best = evals[i].best; ex.kind = k; ex.topic = topic; changed = true;
        }
      }
      p.make(p.parseMove(moves[i]));
    }
    // a move this review no longer calls a mistake leaves the queue (marked, so a synced copy doesn't bring it back)
    var prefix = 'g' + gameId + '-';
    items.forEach(function (it) {
      if (it.id.indexOf(prefix) === 0 && !keep[it.id] && !it.gone) { it.gone = true; it.seen = (it.seen || 0) + 1; changed = true; }
    });
    if (items.length > 200) items.length = 200;
    if (changed) Store.touch('mistakes');
  }
  /* what kind of mistake this was, so they can be added up: safety, fork, threats, mates, free, or position */
  function topicOf(before, uci, kind, e0, e1) {
    try {
      var m = before.parseMove(uci); if (!m) return 'position';
      if (kind === 'miss') { var mi = e0 && e0.best ? Explain.missedInfo(before, e0.best, e0.line) : null; return (mi && mi.topic) || 'position'; }
      if (!e1 || !e1.line || !e1.line.pv || !e1.line.pv.length) return 'position';
      return Explain.bad(before, m, e1.line, e0 && e0.best).topic || 'position';
    } catch (e) { return 'position'; }
  }
  /* What keeps going wrong: the mistake topic that shows up in the most of your recent reviewed games.
     Returns { topic, games, of, n } or null when nothing repeats yet. */
  var SAYS = {
    safety: 'left a piece where it could be taken', fork: 'walked into a fork', threats: 'missed a checkmate threat against you',
    mates: 'missed a checkmate', free: 'missed a free piece'
  };
  function patterns() {
    var items = Store.state.mistakes.items.filter(function (x) { return !x.gone && x.topic && SAYS[x.topic]; });
    var byGame = {}, order = [];
    items.forEach(function (it) {
      var g = it.id.replace(/-\d+$/, '');
      if (!byGame[g]) { byGame[g] = { ts: it.ts, topics: {} }; order.push(g); }
      byGame[g].topics[it.topic] = (byGame[g].topics[it.topic] || 0) + 1;
    });
    order.sort(function (a, b) { return byGame[b].ts - byGame[a].ts; });
    var recent = order.slice(0, 8), counts = {};
    recent.forEach(function (g) { Object.keys(byGame[g].topics).forEach(function (t) { counts[t] = counts[t] || { games: 0, n: 0 }; counts[t].games++; counts[t].n += byGame[g].topics[t]; }); });
    var best = null;
    Object.keys(counts).forEach(function (t) { if (!best || counts[t].games > counts[best].games || (counts[t].games === counts[best].games && counts[t].n > counts[best].n)) best = t; });
    if (!best || counts[best].games < 2) return null;
    return { topic: best, games: counts[best].games, of: recent.length, n: counts[best].n, says: SAYS[best] };
  }
  /* "You left a piece where it could be taken in 4 of your last 6 games." */
  function patternText(pt) { return 'You ' + pt.says + ' in ' + pt.games + ' of your last ' + pt.of + ' games.'; }
  function solved(id) {
    var it = Store.state.mistakes.items.filter(function (x) { return x.id === id && !x.gone; })[0];
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
  function due() { var now = Date.now(); return Store.state.mistakes.items.filter(function (x) { return !x.gone && x.due <= now; }); }
  return { addFromReview: addFromReview, solved: solved, grade: grade, due: due, patterns: patterns, patternText: patternText, topicOf: topicOf };
})();
