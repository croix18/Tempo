/* Tempo engine: evaluation, search, and the bot move picker. Needs TempoCore. */
(function (G) {
'use strict';
var C = G.TempoCore;
var PAWN = 1, KNIGHT = 2, BISHOP = 3, ROOK = 4, QUEEN = 5, KING = 6;
var INF = 32000, MATE = 31000, MATE_BOUND = 30000, MAX_PLY = 64;

/* PeSTO piece-square tables (a8 = index 0, white's view). */
var MGV = [0, 82, 337, 365, 477, 1025, 0], EGV = [0, 94, 281, 297, 512, 936, 0];
var PHASE_INC = [0, 0, 1, 1, 2, 4, 0];
var MGT = [null,
[0,0,0,0,0,0,0,0,98,134,61,95,68,126,34,-11,-6,7,26,31,65,56,25,-20,-14,13,6,21,23,12,17,-23,-27,-2,-5,12,17,6,10,-25,-26,-4,-4,-10,3,3,33,-12,-35,-1,-20,-23,-15,24,38,-22,0,0,0,0,0,0,0,0],
[-167,-89,-34,-49,61,-97,-15,-107,-73,-41,72,36,23,62,7,-17,-47,60,37,65,84,129,73,44,-9,17,19,53,37,69,18,22,-13,4,16,13,28,19,21,-8,-23,-9,12,10,19,17,25,-16,-29,-53,-12,-3,-1,18,-14,-19,-105,-21,-58,-33,-17,-28,-19,-23],
[-29,4,-82,-37,-25,-42,7,-8,-26,16,-18,-13,30,59,18,-47,-16,37,43,40,35,50,37,-2,-4,5,19,50,37,37,7,-2,-6,13,13,26,34,12,10,4,0,15,15,15,14,27,18,10,4,15,16,0,7,21,33,1,-33,-3,-14,-21,-13,-12,-39,-21],
[32,42,32,51,63,9,31,43,27,32,58,62,80,67,26,44,-5,19,26,36,17,45,61,16,-24,-11,7,26,24,35,-8,-20,-36,-26,-12,-1,9,-7,6,-23,-45,-25,-16,-17,3,0,-5,-33,-44,-16,-20,-9,-1,11,-6,-71,-19,-13,1,17,16,7,-37,-26],
[-28,0,29,12,59,44,43,45,-24,-39,-5,1,-16,57,28,54,-13,-17,7,8,29,56,47,57,-27,-27,-16,-16,-1,17,-2,1,-9,-26,-9,-10,-2,-4,3,-3,-14,2,-11,-2,-5,2,14,5,-35,-8,11,2,8,15,-3,1,-1,-18,-9,10,-15,-25,-31,-50],
[-65,23,16,-15,-56,-34,2,13,29,-1,-20,-7,-8,-4,-38,-29,-9,24,2,-16,-20,6,22,-22,-17,-20,-12,-27,-30,-25,-14,-36,-49,-1,-27,-39,-46,-44,-33,-51,-14,-14,-22,-46,-44,-30,-15,-27,1,7,-8,-64,-43,-16,9,8,-15,36,12,-54,8,-28,24,14]];
var EGT = [null,
[0,0,0,0,0,0,0,0,178,173,158,134,147,132,165,187,94,100,85,67,56,53,82,84,32,24,13,5,-2,4,17,17,13,9,-3,-7,-7,-8,3,-1,4,7,-6,1,0,-5,-1,-8,13,8,8,10,13,0,2,-7,0,0,0,0,0,0,0,0],
[-58,-38,-13,-28,-31,-27,-63,-99,-25,-8,-25,-2,-9,-25,-24,-52,-24,-20,10,9,-1,-9,-19,-41,-17,3,22,22,22,11,8,-18,-18,-6,16,25,16,17,4,-18,-23,-3,-1,15,10,-3,-20,-22,-42,-20,-10,-5,-2,-20,-23,-44,-29,-51,-23,-15,-22,-18,-50,-64],
[-14,-21,-11,-8,-7,-9,-17,-24,-8,-4,7,-12,-3,-13,-4,-14,2,-8,0,-1,-2,6,0,4,-3,9,12,9,14,10,3,2,-6,3,13,19,7,10,-3,-9,-12,-3,8,10,13,3,-7,-15,-14,-18,-7,-1,4,-9,-15,-27,-23,-9,-23,-5,-9,-16,-5,-17],
[13,10,18,15,12,12,8,5,11,13,13,11,-3,3,8,3,7,7,7,5,4,-3,-5,-3,4,3,13,1,2,1,-1,2,3,5,8,4,-5,-6,-8,-11,-4,0,-5,-1,-7,-12,-8,-16,-6,-6,0,2,-9,-9,-11,-3,-9,2,3,-1,-5,-13,4,-20],
[-9,22,22,27,27,19,10,20,-17,20,32,41,58,25,30,0,-20,6,9,49,47,35,19,9,3,22,24,45,57,40,57,36,-18,28,19,47,31,34,39,23,-16,-27,15,6,9,17,10,5,-22,-23,-30,-16,-16,-23,-36,-32,-33,-28,-22,-43,-5,-32,-20,-41],
[-74,-35,-18,-18,-11,15,4,-17,-12,17,14,17,17,38,23,11,10,17,23,15,20,45,44,13,-8,22,24,27,26,33,26,3,-18,-4,21,24,27,23,9,-11,-19,-3,11,21,23,16,7,-9,-27,-11,4,13,14,4,-5,-17,-53,-34,-21,-11,-28,-14,-24,-43]];

/* Expand to 0x88 squares: index [type*128 + sq]. White uses the a8-first table flipped. */
var MG_W = new Int16Array(7 * 128), EG_W = new Int16Array(7 * 128), MG_B = new Int16Array(7 * 128), EG_B = new Int16Array(7 * 128);
(function () {
  for (var t = 1; t <= 6; t++) for (var s = 0; s < 128; s++) {
    if (s & 0x88) continue;
    var i64 = ((s >> 4) << 3) | (s & 7); // a1 = 0
    MG_W[t * 128 + s] = MGV[t] + MGT[t][i64 ^ 56]; EG_W[t * 128 + s] = EGV[t] + EGT[t][i64 ^ 56];
    MG_B[t * 128 + s] = MGV[t] + MGT[t][i64]; EG_B[t * 128 + s] = EGV[t] + EGT[t][i64];
  }
})();
var PASS_MG = [0, 5, 5, 10, 20, 35, 60, 0], PASS_EG = [0, 10, 15, 25, 45, 75, 120, 0];
var wPF = new Int8Array(10), bPF = new Int8Array(10);      // pawn counts per file (+1 offset)
var wMin = new Int8Array(10), bMax = new Int8Array(10);     // most backward white pawn rank / most backward black pawn rank
var wMax = new Int8Array(10), bMin = new Int8Array(10);

function evaluate(pos) {
  var b = pos.b, mgW = 0, egW = 0, mgB = 0, egB = 0, phase = 0;
  var wb = 0, bb = 0, wMat = 0, bMat = 0, wPawns = 0, bPawns = 0, s, p, t;
  wPF.fill(0); bPF.fill(0); wMin.fill(9); bMin.fill(9); wMax.fill(-1); bMax.fill(-1);
  for (s = 0; s < 120; s++) {
    if (s & 8) { s += 7; continue; }
    p = b[s]; if (!p) continue;
    if (p > 0) {
      t = p; mgW += MG_W[t * 128 + s]; egW += EG_W[t * 128 + s];
      if (t === PAWN) { var f = (s & 7) + 1, r = s >> 4; wPF[f]++; wPawns++; if (r < wMin[f]) wMin[f] = r; if (r > wMax[f]) wMax[f] = r; }
      else if (t !== KING) { wMat += MGV[t]; if (t === BISHOP) wb++; }
    } else {
      t = -p; mgB += MG_B[t * 128 + s]; egB += EG_B[t * 128 + s];
      if (t === PAWN) { var f2 = (s & 7) + 1, r2 = s >> 4; bPF[f2]++; bPawns++; if (r2 < bMin[f2]) bMin[f2] = r2; if (r2 > bMax[f2]) bMax[f2] = r2; }
      else if (t !== KING) { bMat += MGV[t]; if (t === BISHOP) bb++; }
    }
    phase += PHASE_INC[t];
  }
  if (wb >= 2) { mgW += 30; egW += 50; }
  if (bb >= 2) { mgB += 30; egB += 50; }
  // pawn structure
  for (var fl = 1; fl <= 8; fl++) {
    if (wPF[fl]) {
      if (wPF[fl] > 1) { mgW -= 10 * (wPF[fl] - 1); egW -= 20 * (wPF[fl] - 1); }
      if (!wPF[fl - 1] && !wPF[fl + 1]) { mgW -= 10; egW -= 15; }
      // passed: no black pawn ahead on this or adjacent files
      var wr = wMax[fl];
      if ((bMax[fl - 1] <= wr) && (bMax[fl] <= wr) && (bMax[fl + 1] <= wr)) { mgW += PASS_MG[wr]; egW += PASS_EG[wr]; }
    }
    if (bPF[fl]) {
      if (bPF[fl] > 1) { mgB -= 10 * (bPF[fl] - 1); egB -= 20 * (bPF[fl] - 1); }
      if (!bPF[fl - 1] && !bPF[fl + 1]) { mgB -= 10; egB -= 15; }
      var br = bMin[fl];
      if (wMin[fl - 1] >= br && wMin[fl] >= br && wMin[fl + 1] >= br) { mgB += PASS_MG[7 - br]; egB += PASS_EG[7 - br]; }
    }
  }
  if (phase > 24) phase = 24;
  var mg = mgW - mgB, eg = egW - egB;
  // mop-up: drive a bare king to the edge
  if (bMat === 0 && bPawns === 0 && wMat >= 500) eg += mopUp(pos.bk, pos.wk);
  else if (wMat === 0 && wPawns === 0 && bMat >= 500) eg -= mopUp(pos.wk, pos.bk);
  var score = ((mg * phase) + (eg * (24 - phase))) / 24 | 0;
  // drawish material: no pawns and only a minor piece more
  if (score > 0 && wPawns === 0 && wMat - bMat <= 365) score = score >> 3;
  else if (score < 0 && bPawns === 0 && bMat - wMat <= 365) score = -((-score) >> 3);
  return (score + (pos.side === 1 ? 10 : -10)) * pos.side;
}
function mopUp(loserK, winK) {
  var lf = loserK & 7, lr = loserK >> 4, wf = winK & 7, wr = winK >> 4;
  var center = Math.max(3 - lf, lf - 4) + Math.max(3 - lr, lr - 4);
  var dist = Math.abs(lf - wf) + Math.abs(lr - wr);
  return 30 * center + 12 * (14 - dist) + 200;
}

/* ---------- search ---------- */
var TT_BITS = 19, TT_SIZE = 1 << TT_BITS, TT_MASK = TT_SIZE - 1;
var ttKey, ttMove, ttScore, ttDepth, ttFlag, ttGen;
function ensureTT() {
  if (ttKey) return;
  ttKey = new Int32Array(TT_SIZE); ttMove = new Int32Array(TT_SIZE); ttScore = new Int16Array(TT_SIZE);
  ttDepth = new Int8Array(TT_SIZE); ttFlag = new Uint8Array(TT_SIZE); ttGen = new Uint8Array(TT_SIZE);
}
var gen = 1;
var MOVES = new Int32Array(MAX_PLY * 256), SCORES = new Int32Array(MAX_PLY * 256);
var killers = new Int32Array(MAX_PLY * 2), history = new Int32Array(2 * 128 * 128);
var pvTable = new Int32Array(MAX_PLY * MAX_PLY), pvLen = new Int32Array(MAX_PLY);
var nodes = 0, stopTime = 0, nodeLimit = 0, stopped = false, pos = null, rootBestThisIter = 0;

function clearTT() { if (!ttKey) return; ttKey.fill(0); ttMove.fill(0); ttDepth.fill(0); ttFlag.fill(0); ttGen.fill(0); }
function toTT(score, ply) { return score > MATE_BOUND ? score + ply : score < -MATE_BOUND ? score - ply : score; }
function fromTT(score, ply) { return score > MATE_BOUND ? score - ply : score < -MATE_BOUND ? score + ply : score; }

function checkTime() {
  if ((nodes & 2047) === 0) {
    if ((stopTime && Date.now() >= stopTime) || (nodeLimit && nodes >= nodeLimit)) stopped = true;
  }
}

function scoreMoves(base, n, ttm, ply) {
  var b = pos.b, side = pos.side;
  for (var i = base; i < base + n; i++) {
    var m = MOVES[i];
    if (m === ttm) { SCORES[i] = 4000000; continue; }
    var fl = m >>> 17, from = m & 127, to = (m >> 7) & 127, promo = (m >> 14) & 7;
    if (fl & 1) {
      var victim = (fl & 2) ? PAWN : -b[to] * side, attacker = b[from] * side;
      var sc = 2000000 + victim * 100 - attacker;
      if (victim < attacker && pos.see(m) < 0) sc = -1000000 + victim * 100 - attacker;
      SCORES[i] = sc + (promo === QUEEN ? 50000 : 0);
    } else if (promo === QUEEN) SCORES[i] = 1900000;
    else if (m === killers[ply * 2]) SCORES[i] = 1500000;
    else if (m === killers[ply * 2 + 1]) SCORES[i] = 1400000;
    else SCORES[i] = history[(side === 1 ? 0 : 16384) + (from << 7) + to];
  }
}
function pickNext(i, end) {
  var best = i, bs = SCORES[i];
  for (var j = i + 1; j < end; j++) if (SCORES[j] > bs) { bs = SCORES[j]; best = j; }
  if (best !== i) {
    var tm = MOVES[i]; MOVES[i] = MOVES[best]; MOVES[best] = tm;
    var ts = SCORES[i]; SCORES[i] = SCORES[best]; SCORES[best] = ts;
  }
  return MOVES[i];
}

function hasNonPawn(side) {
  var b = pos.b;
  for (var s = 0; s < 120; s++) {
    if (s & 8) { s += 7; continue; }
    var t = b[s] * side; if (t > PAWN && t < KING) return true;
  }
  return false;
}

function qsearch(alpha, beta, ply) {
  nodes++; checkTime(); if (stopped) return 0;
  var stand = evaluate(pos);
  if (ply >= MAX_PLY - 1) return stand;
  if (stand >= beta) return stand;
  if (stand > alpha) alpha = stand;
  var base = ply * 256, n = pos.gen(MOVES, base, true) - base;
  scoreMoves(base, n, 0, ply);
  var best = stand, b = pos.b;
  for (var i = base; i < base + n; i++) {
    var m = pickNext(i, base + n);
    if (SCORES[i] < 0) break; // losing captures
    var fl = m >>> 17;
    var victimV = (fl & 2) ? 100 : C.SEE_VAL[Math.abs(b[(m >> 7) & 127])];
    if (stand + victimV + 200 < alpha && !((m >> 14) & 7)) continue; // delta pruning
    pos.make(m);
    if (pos.leftInCheck()) { pos.unmake(); continue; }
    var sc = -qsearch(-beta, -alpha, ply + 1);
    pos.unmake();
    if (stopped) return 0;
    if (sc > best) { best = sc; if (sc > alpha) { alpha = sc; if (sc >= beta) return sc; } }
  }
  return best;
}

function search(depth, alpha, beta, ply, isPv, nullOk) {
  pvLen[ply] = ply;
  if (ply > 0) {
    if (pos.half >= 100 || pos.repetitions() > 1 || pos.insufficient()) return 0;
    var ma = -MATE + ply, mb = MATE - ply - 1;
    if (alpha < ma) alpha = ma; if (beta > mb) beta = mb;
    if (alpha >= beta) return alpha;
  }
  var inCheck = pos.inCheck();
  if (inCheck) depth++;
  if (depth <= 0) return qsearch(alpha, beta, ply);
  if (ply >= MAX_PLY - 1) return evaluate(pos);
  nodes++; checkTime(); if (stopped) return 0;

  var idx = pos.keyLo & TT_MASK, ttm = 0;
  if (ttKey[idx] === pos.keyHi && ttFlag[idx]) {
    ttm = ttMove[idx];
    if (!isPv && ttDepth[idx] >= depth && ply > 0) {
      var ts = fromTT(ttScore[idx], ply), fg = ttFlag[idx];
      if (fg === 1 || (fg === 2 && ts >= beta) || (fg === 3 && ts <= alpha)) return ts;
    }
  }
  var staticEval = inCheck ? -INF : evaluate(pos);
  if (!isPv && !inCheck && ply > 0) {
    if (depth <= 3 && staticEval - 120 * depth >= beta && Math.abs(beta) < MATE_BOUND) return staticEval;
    if (nullOk && depth >= 3 && staticEval >= beta && hasNonPawn(pos.side)) {
      var R = depth > 6 ? 3 : 2;
      pos.makeNull();
      var ns = -search(depth - 1 - R, -beta, -beta + 1, ply + 1, false, false);
      pos.unmakeNull();
      if (stopped) return 0;
      if (ns >= beta) return Math.abs(ns) > MATE_BOUND ? beta : ns;
    }
  }
  var base = ply * 256, n = pos.gen(MOVES, base, false) - base;
  scoreMoves(base, n, ttm, ply);
  var legal = 0, best = -INF, bestMove = 0, origAlpha = alpha, side = pos.side;
  for (var i = base; i < base + n; i++) {
    var m = pickNext(i, base + n);
    pos.make(m);
    if (pos.leftInCheck()) { pos.unmake(); continue; }
    legal++;
    var givesCheck = pos.inCheck(), quiet = !((m >>> 17) & 1) && !((m >> 14) & 7), sc;
    if (legal === 1) sc = -search(depth - 1, -beta, -alpha, ply + 1, isPv, true);
    else {
      var red = 0;
      if (depth >= 3 && quiet && !inCheck && !givesCheck && legal > 3 && m !== killers[ply * 2] && m !== killers[ply * 2 + 1]) {
        red = 1; if (legal > 8) red++; if (depth > 7 && !isPv) red++;
        if (red > depth - 2) red = depth - 2;
      }
      sc = -search(depth - 1 - red, -alpha - 1, -alpha, ply + 1, false, true);
      if (sc > alpha && red) sc = -search(depth - 1, -alpha - 1, -alpha, ply + 1, false, true);
      if (sc > alpha && sc < beta) sc = -search(depth - 1, -beta, -alpha, ply + 1, true, true);
    }
    pos.unmake();
    if (stopped) return 0;
    if (sc > best) {
      best = sc; bestMove = m;
      if (ply === 0) rootBestThisIter = m;
      if (sc > alpha) {
        alpha = sc;
        pvTable[ply * MAX_PLY + ply] = m;
        for (var k = ply + 1; k < pvLen[ply + 1]; k++) pvTable[ply * MAX_PLY + k] = pvTable[(ply + 1) * MAX_PLY + k];
        pvLen[ply] = pvLen[ply + 1] > ply + 1 ? pvLen[ply + 1] : ply + 1;
        if (sc >= beta) {
          if (quiet) {
            if (killers[ply * 2] !== m) { killers[ply * 2 + 1] = killers[ply * 2]; killers[ply * 2] = m; }
            var hi = (side === 1 ? 0 : 16384) + ((m & 127) << 7) + ((m >> 7) & 127);
            history[hi] += depth * depth; if (history[hi] > 1000000) for (var q = 0; q < history.length; q++) history[q] >>= 1;
          }
          break;
        }
      }
    }
  }
  if (!legal) return inCheck ? -MATE + ply : 0;
  var flag = best >= beta ? 2 : best > origAlpha ? 1 : 3;
  if (ttGen[idx] !== gen || depth >= ttDepth[idx] || ttKey[idx] !== pos.keyHi) {
    ttKey[idx] = pos.keyHi; ttMove[idx] = bestMove; ttScore[idx] = toTT(best, ply);
    ttDepth[idx] = depth; ttFlag[idx] = flag; ttGen[idx] = gen;
  }
  return best;
}

/* Iterative deepening. opts: depth, movetime (ms), nodes. */
function think(p, opts) {
  ensureTT();
  pos = p; opts = opts || {};
  var maxDepth = Math.min(opts.depth || 60, MAX_PLY - 4);
  var start = Date.now();
  stopTime = opts.movetime ? start + opts.movetime : 0;
  nodeLimit = opts.nodes || 0; nodes = 0; stopped = false;
  gen = (gen + 1) & 255 || 1;
  killers.fill(0);
  for (var q = 0; q < history.length; q++) history[q] >>= 2;
  var legal = pos.legalMoves();
  var res = { best: legal[0] || 0, score: 0, depth: 0, pv: [], nodes: 0 };
  if (!legal.length) return res;
  var prev = 0;
  for (var d = 1; d <= maxDepth; d++) {
    var alpha = -INF, beta = INF, window = 40;
    if (d >= 4) { alpha = prev - window; beta = prev + window; }
    var sc;
    for (;;) {
      rootBestThisIter = 0;
      sc = search(d, alpha, beta, 0, true, false);
      if (stopped) break;
      if (sc <= alpha) { alpha = Math.max(-INF, alpha - window * 4); window *= 4; continue; }
      if (sc >= beta) { beta = Math.min(INF, beta + window * 4); window *= 4; continue; }
      break;
    }
    if (stopped) {
      // a partial iteration that already beat the previous best is still useful
      if (rootBestThisIter && d > 1 && rootBestThisIter !== res.best && sc > prev + 30) res.best = rootBestThisIter;
      break;
    }
    prev = sc;
    var pv = [];
    for (var k = 0; k < pvLen[0]; k++) pv.push(pvTable[k]);
    res = { best: pv[0] || res.best, score: sc, depth: d, pv: pv, nodes: nodes };
    var elapsed = Date.now() - start;
    if (stopTime && elapsed > (stopTime - start) * 0.55) break;
    if (Math.abs(sc) > MATE_BOUND && d > (MATE - Math.abs(sc)) + 2) break;
    if (legal.length === 1 && d >= 4) break;
  }
  res.nodes = nodes;
  res.ms = Date.now() - start;
  return res;
}

/* Exact score of every root move at a fixed depth (used for weak bots and lesson checks). */
function scoreRoot(p, depth, useQ) {
  ensureTT();
  pos = p; stopTime = 0; nodeLimit = 0; stopped = false; nodes = 0;
  var legal = pos.legalMoves(), out = [];
  for (var i = 0; i < legal.length; i++) {
    var m = legal[i];
    pos.make(m);
    var sc;
    if (pos.status().over) {
      var st = pos.status();
      sc = st.reason === 'checkmate' ? MATE - 1 : 0;
    } else if (depth <= 1) sc = useQ ? -qsearch(-INF, INF, 1) : -evaluate(pos);
    else sc = -search(depth - 1, -INF, INF, 1, true, true);
    pos.unmake();
    out.push({ move: m, score: sc });
  }
  out.sort(function (a, b) { return b.score - a.score; });
  return out;
}

/* ---------- bots ---------- */
function makeRng(seed) {
  var s = (seed >>> 0) || 123456789;
  return function () { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}

function moveFlavor(p, m) {
  // features a human beginner notices: captures, checks, central squares, development
  var from = m & 127, to = (m >> 7) & 127, fl = m >>> 17, piece = Math.abs(p.b[from]);
  var f = { cap: (fl & 1) !== 0, check: false, center: 0, develop: false, piece: piece, castle: (fl & 4) !== 0, kingWalk: false };
  var tf = to & 7, tr = to >> 4;
  f.center = (tf >= 2 && tf <= 5 && tr >= 2 && tr <= 5) ? 1 : 0;
  if ((tf === 3 || tf === 4) && (tr === 3 || tr === 4)) f.center = 2;
  var homeRank = p.side === 1 ? 0 : 7;
  if ((piece === KNIGHT || piece === BISHOP) && (from >> 4) === homeRank) f.develop = true;
  if (piece === KING && !f.castle) f.kingWalk = true;
  p.make(m); f.check = p.inCheck(); p.unmake();
  return f;
}

function styleBonus(f, style, plyNum) {
  var s = 0;
  if (f.cap) s += style.captures || 0;
  if (f.check) s += style.checks || 0;
  s += (style.center || 0) * f.center;
  if (f.develop && plyNum < 24) s += style.develop || 0;
  if (f.castle) s += style.castle || 0;
  if (f.kingWalk && plyNum < 40) s -= style.kingShy || 0;
  if (f.piece === QUEEN && plyNum < 12) s += style.earlyQueen || 0;
  return s;
}

function weightedNatural(p, legal, rng, style) {
  var ws = [], total = 0;
  for (var i = 0; i < legal.length; i++) {
    var f = moveFlavor(p, legal[i]);
    var w = 1 + (f.cap ? 3 : 0) + (f.check ? 2 : 0) + f.center + (f.develop ? 1.5 : 0) + (f.castle ? 2 : 0) - (f.kingWalk ? 0.7 : 0);
    w = Math.max(0.2, w);
    ws.push(w); total += w;
  }
  var r = rng() * total;
  for (i = 0; i < legal.length; i++) { r -= ws[i]; if (r <= 0) return legal[i]; }
  return legal[legal.length - 1];
}

function softPick(list, temp, rng) {
  var max = list[0].adj, total = 0, ws = [];
  for (var i = 0; i < list.length; i++) { var w = Math.exp((list[i].adj - max) / temp); ws.push(w); total += w; }
  var r = rng() * total;
  for (i = 0; i < list.length; i++) { r -= ws[i]; if (r <= 0) return list[i].move; }
  return list[0].move;
}

/* cfg: {depth, movetime, qs, temp, random, blunder, mateCap, style, inaccuracy, margin} */
function botMove(p, cfg, seed) {
  var rng = makeRng(seed || (Date.now() & 0x7fffffff));
  var legal = p.legalMoves();
  if (legal.length <= 1) return { move: legal[0] || 0, kind: 'forced' };
  var style = cfg.style || {};
  if (cfg.random && rng() < cfg.random) return { move: weightedNatural(p, legal, rng, style), kind: 'random' };
  var depth = cfg.depth || 1, useQ = cfg.qs !== false, temp = cfg.temp || 0;
  var oversight = cfg.blunder && rng() < cfg.blunder;
  if (oversight) { depth = 1; useQ = false; temp = Math.max(temp, 60); }
  if (temp > 0 && depth <= 4) {
    if (depth >= 3) think(p, { depth: depth - 1 });
    var scored = scoreRoot(p, depth, useQ);
    var cap = cfg.mateCap || 5000, plyNum = p.ply + (p.full - 1) * 2;
    for (var i = 0; i < scored.length; i++) {
      var s = scored[i].score;
      if (s > cap) s = cap; if (s < -cap) s = -cap;
      scored[i].adj = s + styleBonus(moveFlavor(p, scored[i].move), style, plyNum) + (rng() - 0.5) * (cfg.jitter || 0);
    }
    scored.sort(function (a, b) { return b.adj - a.adj; });
    return { move: softPick(scored, temp, rng), kind: oversight ? 'oversight' : 'soft', top: scored[0].move };
  }
  var res = think(p, { depth: depth, movetime: cfg.movetime || 0 });
  if (cfg.inaccuracy && rng() < cfg.inaccuracy && res.depth >= 2) {
    var alt = scoreRoot(p, Math.max(1, Math.min(res.depth - 1, 4)), true);
    var near = alt.filter(function (x) { return x.score >= alt[0].score - (cfg.margin || 50); });
    if (near.length > 1) return { move: near[1 + Math.floor(rng() * (near.length - 1))].move, kind: 'inaccuracy', score: res.score };
  }
  return { move: res.best, kind: 'search', score: res.score, depth: res.depth };
}

/* Position from a start FEN plus a list of UCI moves. */
function posFrom(fen, moves) {
  var p = new C.Pos(fen || C.START_FEN);
  for (var i = 0; moves && i < moves.length; i++) {
    var m = p.parseMove(moves[i]);
    if (!m) break;
    p.make(m);
  }
  return p;
}

function handle(msg) {
  var p = posFrom(msg.fen, msg.moves);
  if (msg.cmd === 'bot') {
    var r = botMove(p, msg.cfg || {}, msg.seed);
    return { move: r.move ? C.uci(r.move) : null, kind: r.kind };
  }
  if (msg.cmd === 'analyse') {
    var a = think(p, { depth: msg.depth, movetime: msg.movetime, nodes: msg.nodes });
    return { best: a.best ? C.uci(a.best) : null, score: a.score, depth: a.depth, pv: a.pv.map(C.uci), nodes: a.nodes, mate: Math.abs(a.score) > MATE_BOUND ? (a.score > 0 ? 1 : -1) * Math.ceil((MATE - Math.abs(a.score)) / 2) : 0 };
  }
  if (msg.cmd === 'scoremoves') {
    if ((msg.depth || 1) >= 3) think(p, { depth: msg.depth - 1 });
    var list = scoreRoot(p, msg.depth || 2, true);
    return { list: list.map(function (x) { return { move: C.uci(x.move), score: x.score }; }) };
  }
  if (msg.cmd === 'eval') return { score: evaluate(p) };
  if (msg.cmd === 'clear') { clearTT(); return { ok: true }; }
  return { error: 'unknown command' };
}

var Engine = { evaluate: evaluate, think: think, scoreRoot: scoreRoot, botMove: botMove, handle: handle, posFrom: posFrom, clearTT: clearTT, MATE: MATE, MATE_BOUND: MATE_BOUND };
G.TempoEngine = Engine;
if (typeof module !== 'undefined' && module.exports) module.exports = Engine;

// worker entry
if (typeof importScripts === 'function' && typeof self !== 'undefined' && !self.document) {
  self.onmessage = function (e) {
    var msg = e.data || {};
    var out;
    try { out = handle(msg); } catch (err) { out = { error: String(err && err.message || err) }; }
    out.id = msg.id;
    self.postMessage(out);
  };
}
})(typeof self !== 'undefined' ? self : (typeof globalThis !== 'undefined' ? globalThis : this));
