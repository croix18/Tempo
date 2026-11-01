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

/* ---------- what a move does, for the characters ----------
   features(p, m, ctx, deep) looks at one move on the board: what it captures and risks, what it attacks, whether it
   forks, pins, uncovers an attack, retreats, builds a pawn chain, storms the king and so on. Everything here is
   measured from the position, not guessed from the move's shape: a check is only a check, and a "sacrifice" is
   material really left to be taken. deep adds the slower ones (the opponent's mobility, mate threats, trapped pieces). */
var VAL = [0, 100, 320, 330, 500, 900, 0];
var ND = [33, 31, 18, 14, -33, -31, -18, -14], KD = [1, -1, 16, -16, 17, 15, -17, -15], BD = [17, 15, -17, -15], RD = [1, -1, 16, -16];
function gamePly(p) { return (p.full - 1) * 2 + (p.side === 1 ? 0 : 1); }
function nonPawn(p, side) {
  var b = p.b, n = 0;
  for (var s = 0; s < 120; s++) { if (s & 8) { s += 7; continue; } var x = b[s] * side; if (x > 1 && x < 6) n += VAL[x]; }
  return n;
}
function pawnsOn(p, side) {
  var b = p.b, n = 0;
  for (var s = 0; s < 120; s++) { if (s & 8) { s += 7; continue; } if (b[s] === side) n++; }
  return n;
}
function isEndgame(p) {
  var w = nonPawn(p, 1), bl = nonPawn(p, -1), q = 0, b = p.b;
  for (var s = 0; s < 120; s++) { if (s & 8) { s += 7; continue; } if (Math.abs(b[s]) === QUEEN) q++; }
  return (q === 0 && w <= 1400 && bl <= 1400) || (w + bl <= 1700);
}
/* squares the piece on sq attacks */
function attacksFrom(p, sq) {
  var b = p.b, pc = b[sq], t = Math.abs(pc), side = pc > 0 ? 1 : -1, out = [], s, i, d;
  if (t === PAWN) { [15, 17].forEach(function (o) { s = sq + o * side; if (!(s & 0x88)) out.push(s); }); return out; }
  if (t === KNIGHT || t === KING) { var dirs = t === KNIGHT ? ND : KD; for (i = 0; i < 8; i++) { s = sq + dirs[i]; if (!(s & 0x88)) out.push(s); } return out; }
  var rays = t === BISHOP ? BD : t === ROOK ? RD : KD;
  for (i = 0; i < rays.length; i++) { d = rays[i]; s = sq + d; while (!(s & 0x88)) { out.push(s); if (b[s]) break; s += d; } }
  return out;
}
function slides(t, d) { var diag = d === 17 || d === 15 || d === -17 || d === -15; return t === QUEEN || (diag ? t === BISHOP : t === ROOK); }
function kingZone(p, side) { var k = side === 1 ? p.wk : p.bk, out = [k]; for (var i = 0; i < 8; i++) { var s = k + KD[i]; if (!(s & 0x88)) out.push(s); } return out; }
function zoneHits(p, side, by) { var z = kingZone(p, side), n = 0; for (var i = 0; i < z.length; i++) if (p.isAttacked(z[i], by)) n++; return n; }
function hangingTotal(p, side, skip) {
  var b = p.b, tot = 0, list = [];
  for (var s = 0; s < 120; s++) {
    if (s & 8) { s += 7; continue; }
    if (s === skip || !b[s] || (b[s] > 0) !== (side === 1) || Math.abs(b[s]) === KING) continue;
    var l = p.hangingLoss(s); if (l > 0) { tot += l; list.push(s); }
  }
  return { total: tot, list: list };
}
function mateInOne(p) {
  var legal = p.legalMoves();
  for (var i = 0; i < legal.length; i++) {
    p.make(legal[i]);
    var mate = p.inCheck() && p.legalMoves().length === 0;
    p.unmake();
    if (mate) return legal[i];
  }
  return 0;
}
/* is the enemy piece on sq trapped: attacked, losing material where it stands, and no square it can go to is safe? */
function trapped(p, sq) {
  if (p.hangingLoss(sq) < 100) return false;
  var legal = p.legalMoves();
  for (var i = 0; i < legal.length; i++) {
    var m = legal[i]; if ((m & 127) !== sq) continue;
    var cap = Math.abs(p.moveCaptured(m));
    p.make(m); var loss = p.hangingLoss((m >> 7) & 127); p.unmake();
    if (loss - VAL[cap] < 100) return false;
  }
  return true;
}

/* what is the same for every move in a position, worked out once */
function prepare(p) {
  var me = p.side;
  return { side: me, mine: hangingTotal(p, me, -1), theirs: hangingTotal(p, -me, -1), zone: zoneHits(p, -me, me), endgame: isEndgame(p), ply: gamePly(p),
    ahead: (nonPawn(p, me) + 100 * pawnsOn(p, me)) - (nonPawn(p, -me) + 100 * pawnsOn(p, -me)) };
}
function features(p, m, ctx, deep, pre) {
  ctx = ctx || {};
  pre = pre || prepare(p);
  var me = p.side, them = -me, b = p.b;
  var from = m & 127, to = (m >> 7) & 127, fl = m >>> 17, promo = (m >> 14) & 7;
  var piece = Math.abs(b[from]), victim = Math.abs(p.moveCaptured(m)), ply = pre.ply, endgame = pre.endgame;
  var rel = function (s) { return me === 1 ? (s >> 4) : 7 - (s >> 4); }; // rank from the mover's side, 0 = home
  var f = { piece: piece, cap: victim, capVal: VAL[victim], see: (fl & 1) ? p.see(m) : 0, castle: (fl & 4) !== 0, promo: promo, ply: ply, endgame: endgame };
  // before the move
  var wasAttacked = piece !== KING && p.attackersOf(from, them).length > 0, wasLoss = pre.mine.list.indexOf(from) >= 0 ? p.hangingLoss(from) : 0;
  // sliders of ours whose line runs through `from`, for discovered attacks
  var disc = [];
  for (var i = 0; i < 8; i++) {
    var d = KD[i], s = from - d;
    while (!(s & 0x88) && !b[s]) s -= d;
    if ((s & 0x88) || !b[s] || (b[s] > 0) !== (me === 1) || !slides(Math.abs(b[s]), d)) continue;
    disc.push({ src: s, d: d });
  }
  p.make(m);
  f.check = p.inCheck();
  var replies = p.legalMoves();
  f.mate = f.check && !replies.length;
  f.stalemate = !f.check && !replies.length;
  f.hang = piece === KING ? 0 : p.hangingLoss(to);
  var mineAfter = hangingTotal(p, me, to);
  f.undefend = Math.max(0, mineAfter.total - (pre.mine.total - wasLoss));
  f.flee = wasAttacked && f.hang === 0 ? (wasLoss > 0 ? 2 : 1) : 0;
  f.defend = pre.mine.list.filter(function (q) { return q !== from && mineAfter.list.indexOf(q) < 0 && p.b[q] && (p.b[q] > 0) === (me === 1); }).length;
  // what the moved piece attacks now: the king, a piece that hangs, or one worth more than it
  var targets = [], kingSq = them === 1 ? p.wk : p.bk, mover = Math.abs(p.b[to]);
  attacksFrom(p, to).forEach(function (t) {
    var x = p.b[t]; if (!x || (x > 0) === (me === 1)) return;
    var tt = Math.abs(x);
    if (tt === KING) { targets.push({ sq: t, type: KING }); return; }
    if (VAL[tt] > VAL[mover] + 50 || p.hangingLoss(t) > 0) targets.push({ sq: t, type: tt });
  });
  f.targets = targets;
  var real = targets.filter(function (t) { return t.type !== KING; });
  f.threat = real.length;
  f.fork = targets.length >= 2 && f.hang < 200 && (real.length >= 2 || f.check);
  f.checkFork = f.check && real.length >= 1;
  f.queenHit = real.some(function (t) { return t.type === QUEEN; });
  // pins and skewers along the moved piece's lines
  f.pin = 0; f.skewer = 0;
  if (mover === BISHOP || mover === ROOK || mover === QUEEN) {
    var rays = mover === BISHOP ? BD : mover === ROOK ? RD : KD;
    for (i = 0; i < rays.length; i++) {
      var dd = rays[i], s1 = to + dd, s2;
      while (!(s1 & 0x88) && !p.b[s1]) s1 += dd;
      if ((s1 & 0x88) || (p.b[s1] > 0) === (me === 1)) continue;
      var first = Math.abs(p.b[s1]); s2 = s1 + dd;
      while (!(s2 & 0x88) && !p.b[s2]) s2 += dd;
      if ((s2 & 0x88) || (p.b[s2] > 0) === (me === 1)) continue;
      var second = Math.abs(p.b[s2]);
      if (first !== KING && (second === KING || (VAL[second] > VAL[first] && second >= ROOK))) f.pin++;
      else if ((first === KING || first === QUEEN) && second !== KING && VAL[second] >= 300 && p.hangingLoss(s2) > 0) f.skewer++;
    }
  }
  // discovered attacks: a line of ours opened through `from` onto the king or a big piece
  f.discovered = 0; f.discCheck = false;
  disc.forEach(function (x) {
    var q = from;
    while (!(q & 0x88) && !p.b[q]) q += x.d;
    if ((q & 0x88) || q === to || (p.b[q] > 0) === (me === 1)) return;
    var t = Math.abs(p.b[q]);
    if (t === KING) { f.discovered++; f.discCheck = true; }
    else if (t >= ROOK || p.hangingLoss(q) > 0) f.discovered++;
  });
  // king attack: more squares around their king under fire, or a piece arriving close to it
  f.zone = zoneHits(p, them, me) - pre.zone;
  f.near = piece !== KING && piece !== PAWN && Math.max(Math.abs((to & 7) - (kingSq & 7)), Math.abs((to >> 4) - (kingSq >> 4))) <= 2 ? 1 : 0;
  // pawn structure
  if (piece === PAWN) {
    var file = to & 7, fwd = 16 * me, hasPawn = function (sq) { return !(sq & 0x88) && p.b[sq] === PAWN * me; };
    f.chain = (hasPawn(to - fwd - 1) || hasPawn(to - fwd + 1) || hasPawn(to + fwd - 1) || hasPawn(to + fwd + 1)) ? 1 : 0;
    f.brk = (file >= 2 && file <= 5 && [fwd - 1, fwd + 1].some(function (o) { var q = to + o; return !(q & 0x88) && p.b[q] === -PAWN * me; })) ? 1 : 0;
    f.flank = (file <= 1 || file >= 6) && ply < 20 && !victim ? 1 : 0;
    var kf = kingSq & 7, krel = me === 1 ? 7 - (kingSq >> 4) : (kingSq >> 4);
    f.storm = Math.abs(file - kf) <= 1 && krel <= 1 && rel(to) >= 3 && !endgame ? 1 : 0;
    var passed = true;
    for (var r = (to >> 4) + me; r >= 0 && r <= 7 && passed; r += me) for (var df = -1; df <= 1; df++) {
      var ff = file + df; if (ff < 0 || ff > 7) continue;
      if (p.b[(r << 4) | ff] === -PAWN * me) passed = false;
    }
    f.passed = passed ? 1 + (rel(to) >= 5 ? 1 : 0) : 0;
  }
  // pieces
  f.develop = (piece === KNIGHT || piece === BISHOP) && rel(from) === 0 && ply < 24;
  f.center = 0;
  var tf = to & 7, tr = to >> 4;
  if (tf >= 2 && tf <= 5 && tr >= 2 && tr <= 5) f.center = (tf === 3 || tf === 4) && (tr === 3 || tr === 4) ? 2 : 1;
  f.kingWalk = piece === KING && !f.castle && !endgame;
  f.earlyQueen = piece === QUEEN && ply < 12;
  f.queenOut = piece === QUEEN && ply < 16 && rel(to) >= 4;
  f.retreat = piece !== PAWN && piece !== KING && !victim && rel(to) < rel(from) ? 1 : 0;
  f.advance = piece !== PAWN && piece !== KING && rel(to) >= 4 && rel(to) > rel(from) ? 1 : 0;
  if ((piece === KNIGHT || piece === BISHOP) && rel(to) >= 3 && rel(to) <= 5) {
    var guard = [to - 16 * me - 1, to - 16 * me + 1].some(function (q) { return !(q & 0x88) && p.b[q] === PAWN * me; }), safe = true;
    for (var r2 = (to >> 4) + me; r2 >= 0 && r2 <= 7 && safe; r2 += me) for (var df2 = -1; df2 <= 1; df2 += 2) {
      var f2 = (to & 7) + df2; if (f2 >= 0 && f2 <= 7 && p.b[(r2 << 4) | f2] === -PAWN * me) safe = false;
    }
    f.outpost = guard && safe ? 1 : 0;
  }
  if (endgame && piece === KING) {
    var cd = function (q) { return Math.max(3 - (q & 7), (q & 7) - 4) + Math.max(3 - (q >> 4), (q >> 4) - 4); };
    f.kingActive = cd(to) < cd(from) ? 1 : 0;
  }
  // exchanges: like for like, where they can take back
  f.trade = victim && victim !== PAWN && Math.abs(VAL[victim] - VAL[piece]) <= 40 && p.attackersOf(to, them).length > 0 ? 1 : 0;
  f.queenTrade = victim === QUEEN && piece === QUEEN ? 1 : 0;
  // material left to be taken, or lost in the exchange
  var give = Math.max(0, f.hang - VAL[victim]);
  if (f.see < 0) give = Math.max(give, -f.see);
  if (f.mate) give = 0;
  f.give = give;
  f.exchangeSac = piece === ROOK && give >= 120 && give <= 260 ? 1 : 0;
  f.sac = !f.exchangeSac && give >= 200 ? 1 : 0;
  f.pawnSac = !f.exchangeSac && give >= 80 && give < 200 ? 1 : 0;
  f.grab = victim && f.see < 0 ? 1 : 0;
  f.win = victim && victim !== PAWN && f.see >= 200 ? 1 : 0;
  f.punishQueen = f.queenHit && ply < 24 && (f.develop || piece === PAWN) ? 1 : 0;
  f.tookFree = victim && pre.theirs.list.indexOf(to) >= 0 ? 1 : 0;
  // repeating ourselves
  if (ctx.last) {
    var lf = ctx.last & 127, lt = (ctx.last >> 7) & 127;
    f.repeat = from === lt && to === lf ? 1 : 0;
    f.samePiece = from === lt ? 1 : 0;
  }
  if (deep) {
    // removing a defender: a capture after which another of their pieces can be taken
    if (victim) { var theirsAfter = hangingTotal(p, them, -1); f.removeDefender = theirsAfter.list.some(function (q) { return pre.theirs.list.indexOf(q) < 0; }) ? 1 : 0; }
    f.mobility = replies.length;
    f.mateThreat = 0;
    if (!f.check && !f.mate) { p.makeNull(); f.mateThreat = mateInOne(p) ? 1 : 0; p.unmakeNull(); }
    f.traps = 0;
    real.forEach(function (t) { if (t.type >= KNIGHT && t.type <= QUEEN && trapped(p, t.sq)) f.traps++; });
  }
  p.unmake();
  return f;
}

/* A character's bonus for a move, in centipawns, from its style weights. Weights are bounded per feature, so no single
   preference outweighs a piece; the engine's own score still decides what is safe. */
var STYLE_KEYS = ['check', 'capture', 'threat', 'fork', 'pin', 'discovered', 'zone', 'storm', 'sac', 'pawnSac', 'exchangeSac', 'develop', 'castle', 'center',
  'kingWalk', 'earlyQueen', 'queenOut', 'retreat', 'advance', 'flee', 'defend', 'trade', 'simplify', 'queenTrade', 'chain', 'outpost', 'brk', 'flank',
  'restrict', 'passed', 'kingActive', 'repeat', 'samePiece', 'undefend', 'mateThreat', 'traps', 'grab', 'punishQueen', 'swap', 'removeDefender'];
function styleScore(f, s, ahead) {
  if (!s) return 0;
  var v = 0, c = function (k, x) { var w = s[k]; if (w && x) v += w * x; };
  c('check', f.check ? 1 : 0);
  c('capture', f.cap ? 1 : 0);
  c('threat', Math.min(2, f.threat));
  c('fork', f.fork ? 1 : 0);
  c('pin', Math.min(1, f.pin + f.skewer));
  c('discovered', Math.min(1, f.discovered));
  c('zone', Math.max(0, Math.min(3, f.zone)) + f.near * 0.5);
  c('storm', f.storm || 0);
  c('sac', f.sac);
  c('pawnSac', f.pawnSac);
  c('exchangeSac', f.exchangeSac);
  if (f.ply < 24) { c('develop', f.develop ? 1 : 0); c('earlyQueen', f.earlyQueen ? 1 : 0); c('queenOut', f.queenOut ? 1 : 0); }
  c('castle', f.castle ? 1 : 0);
  c('center', f.ply < 30 ? f.center : 0);
  c('kingWalk', f.kingWalk ? 1 : 0);
  c('retreat', f.retreat);
  c('advance', f.advance);
  c('flee', f.flee ? 1 : 0);
  c('defend', Math.min(2, f.defend));
  c('trade', f.trade);
  if (ahead >= 200) c('simplify', f.trade || f.queenTrade ? 1 : 0);
  if (ahead <= -200) c('swap', f.trade || f.queenTrade ? 1 : 0);
  c('queenTrade', f.queenTrade);
  c('chain', f.chain || 0);
  c('outpost', f.outpost || 0);
  c('brk', f.brk || 0);
  c('flank', f.flank || 0);
  if (f.endgame) { c('passed', f.passed || 0); c('kingActive', f.kingActive || 0); }
  c('repeat', f.repeat || 0);
  c('samePiece', f.samePiece || 0);
  c('undefend', f.undefend >= 100 ? 1 : 0);
  c('mateThreat', f.mateThreat || 0);
  c('traps', f.traps || 0);
  c('grab', f.grab);
  c('punishQueen', f.punishQueen);
  c('removeDefender', f.removeDefender || 0);
  if (s.restrict && f.mobility != null && f.avgMobility) c('restrict', Math.max(-1, Math.min(1, (f.avgMobility - f.mobility) / 8)));
  return v;
}
function needsDeep(s) { return !!s && !!(s.restrict || s.mateThreat || s.traps || s.removeDefender); }

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

/* Legacy picker for the original ladder bots (still the yardsticks the characters are measured against).
   cfg: {depth, movetime, qs, temp, random, blunder, mateCap, style, inaccuracy, margin} */
function legacyMove(p, cfg, rng, legal) {
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

/* ---------- the characters ----------
   cfg.persona marks a character. Strength comes first: depth, quiescence, temperature, random moves and oversights
   decide how well it sees. Style only chooses among what that strength allows: in the soft picker it shifts the odds
   between moves the engine has scored, and in the search picker it chooses only among moves within cfg.styleMargin
   of the best. cfg.styleScale and cfg.styleCap keep a preference from ever outweighing real material. */
function lastMove(u) {
  if (!u || u.length < 4) return 0;
  var f = C.sqIndex(u.slice(0, 2)), t = C.sqIndex(u.slice(2, 4));
  return f >= 0 && t >= 0 ? C.mk(f, t, 0, 0) : 0;
}
function bonusOf(f, cfg, ahead) {
  var v = styleScore(f, cfg.style, ahead) * (cfg.styleScale == null ? 1 : cfg.styleScale), cap = cfg.styleCap || 120;
  return v > cap ? cap : v < -cap ? -cap : v;
}
function scoreAll(p, list, cfg, ctx, deep) {
  var pre = prepare(p), sum = 0, n = 0;
  list.forEach(function (x) { x.f = features(p, x.move, ctx, deep, pre); if (x.f.mobility != null) { sum += x.f.mobility; n++; } });
  list.forEach(function (x) { if (n) x.f.avgMobility = sum / n; x.bonus = bonusOf(x.f, cfg, pre.ahead); });
  return pre;
}
function personaMove(p, cfg, rng, legal, ctx) {
  var c = { last: lastMove(ctx.last) }, deep = needsDeep(cfg.style);
  // a random move, but one the character would find natural
  if (cfg.random && rng() < cfg.random) {
    var opts = legal.map(function (m) { return { move: m }; });
    scoreAll(p, opts, cfg, c, false);
    var ws = opts.map(function (x) {
      var f = x.f, w = 1 + (f.cap ? 3 : 0) + (f.check ? 2 : 0) + f.center + (f.develop ? 1.5 : 0) + (f.castle ? 2 : 0) - (f.kingWalk ? 0.7 : 0);
      return Math.max(0.2, w) * Math.exp(Math.max(-60, Math.min(60, x.bonus)) / 40);
    });
    var total = ws.reduce(function (a, b) { return a + b; }, 0), r = rng() * total;
    for (var i = 0; i < opts.length; i++) { r -= ws[i]; if (r <= 0) return { move: opts[i].move, kind: 'random' }; }
    return { move: opts[opts.length - 1].move, kind: 'random' };
  }
  var depth = cfg.depth || 1, useQ = cfg.qs !== false, temp = cfg.temp || 0;
  var oversight = cfg.blunder && rng() < cfg.blunder;
  if (oversight) { depth = 1; useQ = false; temp = Math.max(temp, 60); }
  if (temp > 0 && depth <= 4) {
    if (depth >= 3) think(p, { depth: depth - 1 });
    var scored = scoreRoot(p, depth, useQ), cap = cfg.mateCap || 5000;
    scoreAll(p, scored, cfg, c, deep && depth >= 2);
    scored.forEach(function (x) {
      var s = x.score > cap ? cap : x.score < -cap ? -cap : x.score;
      x.adj = s + x.bonus + (rng() - 0.5) * (cfg.jitter || 0);
    });
    var best = scored[0].score, top = scored[0].move;
    scored.sort(function (a, b) { return b.adj - a.adj; });
    var pick = softPickItem(scored, temp, rng);
    return { move: pick.move, kind: oversight ? 'oversight' : 'soft', score: pick.score, best: best, top: top };
  }
  var res = think(p, { depth: depth, movetime: cfg.movetime || 0 });
  var slip = cfg.slip && rng() < cfg.slip, styled = !slip && cfg.styleRate && rng() < cfg.styleRate;
  if ((slip || styled) && res.depth >= 2) {
    var alt = scoreRoot(p, Math.max(1, Math.min(res.depth - 1, 4)), true);
    var margin = slip ? (cfg.margin || 50) : (cfg.styleMargin || 30);
    var near = alt.filter(function (x) { return x.score >= alt[0].score - margin; });
    if (slip && near.length > 1) { var nm = near[1 + Math.floor(rng() * (near.length - 1))]; return { move: nm.move, kind: 'inaccuracy', score: nm.score, best: res.score, top: res.best }; }
    if (styled && near.length > 1) {
      // the engine's own first choice is always in the running, scored as it saw it
      if (!near.some(function (x) { return x.move === res.best; })) near.push({ move: res.best, score: alt[0].score });
      scoreAll(p, near, cfg, c, deep);
      near.forEach(function (x) { var bn = Math.max(-margin, Math.min(margin, x.bonus)); x.adj = x.score + bn + (rng() - 0.5) * margin * 0.5; });
      near.sort(function (a, b) { return b.adj - a.adj; });
      var sp = near[0];
      return { move: sp.move, kind: sp.move === res.best ? 'search' : 'style', score: sp.move === res.best ? res.score : res.score - (alt[0].score - sp.score), best: res.score, top: res.best, depth: res.depth };
    }
  }
  return { move: res.best, kind: 'search', score: res.score, best: res.score, top: res.best, depth: res.depth };
}
function softPickItem(list, temp, rng) {
  var max = list[0].adj, total = 0, ws = [];
  for (var i = 0; i < list.length; i++) { var w = Math.exp((list[i].adj - max) / temp); ws.push(w); total += w; }
  var r = rng() * total;
  for (i = 0; i < list.length; i++) { r -= ws[i]; if (r <= 0) return list[i]; }
  return list[0];
}

function botMove(p, cfg, seed, ctx) {
  var rng = makeRng(seed || (Date.now() & 0x7fffffff));
  var legal = p.legalMoves();
  if (legal.length <= 1) return { move: legal[0] || 0, kind: 'forced' };
  cfg = cfg || {};
  return cfg.persona ? personaMove(p, cfg, rng, legal, ctx || {}) : legacyMove(p, cfg, rng, legal);
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
    var r = botMove(p, msg.cfg || {}, msg.seed, msg.ctx);
    return { move: r.move ? C.uci(r.move) : null, kind: r.kind, score: r.score, best: r.best, top: r.top ? C.uci(r.top) : null };
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

var Engine = { evaluate: evaluate, think: think, scoreRoot: scoreRoot, botMove: botMove, handle: handle, posFrom: posFrom, clearTT: clearTT, MATE: MATE, MATE_BOUND: MATE_BOUND,
  features: features, prepare: prepare, styleScore: styleScore, STYLE_KEYS: STYLE_KEYS, isEndgame: isEndgame, gamePly: gamePly, mateInOne: mateInOne };
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
