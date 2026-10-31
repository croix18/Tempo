/* Tempo chess core: board, rules, notation. Runs in a page, a worker or node. */
(function (G) {
'use strict';

var PAWN = 1, KNIGHT = 2, BISHOP = 3, ROOK = 4, QUEEN = 5, KING = 6;
var F_CAP = 1, F_EP = 2, F_CASTLE = 4, F_DOUBLE = 8, F_PROMO = 16;
var WK = 1, WQ = 2, BK = 4, BQ = 8;
var N_DIRS = [33, 31, 18, 14, -33, -31, -18, -14];
var K_DIRS = [1, -1, 16, -16, 17, 15, -17, -15];
var B_DIRS = [17, 15, -17, -15];
var R_DIRS = [1, -1, 16, -16];
var START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
var MAXH = 4096;
var SEE_VAL = [0, 100, 320, 330, 500, 900, 20000];
var PIECE_CHARS = ' pnbrqk';

function sqName(s) { return 'abcdefgh'.charAt(s & 7) + ((s >> 4) + 1); }
function sqIndex(n) {
  if (!n || n.length < 2) return -1;
  var f = n.charCodeAt(0) - 97, r = n.charCodeAt(1) - 49;
  if (f < 0 || f > 7 || r < 0 || r > 7) return -1;
  return (r << 4) | f;
}
function to64(s) { return ((s >> 4) << 3) | (s & 7); }
function from64(i) { return ((i >> 3) << 4) | (i & 7); }

function mFrom(m) { return m & 127; }
function mTo(m) { return (m >> 7) & 127; }
function mPromo(m) { return (m >> 14) & 7; }
function mFlags(m) { return m >>> 17; }
function mk(from, to, promo, flags) { return from | (to << 7) | (promo << 14) | (flags << 17); }

/* Zobrist keys from a fixed seed so every thread agrees. */
var seed = 0x9e3779b9 | 0;
function rnd() { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return seed | 0; }
var zLo = new Int32Array(12 * 128), zHi = new Int32Array(12 * 128);
for (var zi = 0; zi < 12 * 128; zi++) { zLo[zi] = rnd(); zHi[zi] = rnd(); }
var zSideLo = rnd(), zSideHi = rnd();
var zCasLo = new Int32Array(16), zCasHi = new Int32Array(16);
for (zi = 0; zi < 16; zi++) { zCasLo[zi] = rnd(); zCasHi[zi] = rnd(); }
var zEpLo = new Int32Array(9), zEpHi = new Int32Array(9);
for (zi = 1; zi < 9; zi++) { zEpLo[zi] = rnd(); zEpHi[zi] = rnd(); }
function pIdx(p) { return p > 0 ? p - 1 : 5 - p; }

var CMASK = new Uint8Array(128);
for (zi = 0; zi < 128; zi++) CMASK[zi] = 15;
CMASK[0x00] = 15 & ~WQ; CMASK[0x07] = 15 & ~WK; CMASK[0x04] = 15 & ~(WK | WQ);
CMASK[0x70] = 15 & ~BQ; CMASK[0x77] = 15 & ~BK; CMASK[0x74] = 15 & ~(BK | BQ);

function Pos(fen) {
  this.b = new Int8Array(128);
  this.side = 1; this.castle = 0; this.ep = -1; this.epKey = 0;
  this.half = 0; this.full = 1; this.wk = -1; this.bk = -1;
  this.keyLo = 0; this.keyHi = 0; this.ply = 0;
  this.stMove = new Int32Array(MAXH); this.stCap = new Int8Array(MAXH);
  this.stCastle = new Uint8Array(MAXH); this.stEp = new Int16Array(MAXH);
  this.stEpKey = new Uint8Array(MAXH); this.stHalf = new Int16Array(MAXH);
  this.stKeyLo = new Int32Array(MAXH); this.stKeyHi = new Int32Array(MAXH);
  this.startFen = START_FEN;
  this.load(fen || START_FEN);
}
var P = Pos.prototype;

P.load = function (fen) {
  var err = Pos.fenError(fen);
  if (err) throw new Error('Bad FEN: ' + err);
  var parts = fen.trim().split(/\s+/), rows = parts[0].split('/');
  this.b.fill(0);
  for (var r = 7; r >= 0; r--) {
    var row = rows[7 - r], f = 0;
    for (var i = 0; i < row.length; i++) {
      var ch = row.charAt(i);
      if (ch >= '1' && ch <= '8') { f += +ch; continue; }
      var t = PIECE_CHARS.indexOf(ch.toLowerCase());
      this.b[(r << 4) | f] = ch === ch.toUpperCase() ? t : -t;
      f++;
    }
  }
  this.side = parts[1] === 'b' ? -1 : 1;
  var c = parts[2] || '-', cas = 0, b = this.b;
  if (c.indexOf('K') >= 0 && b[4] === KING && b[7] === ROOK) cas |= WK;
  if (c.indexOf('Q') >= 0 && b[4] === KING && b[0] === ROOK) cas |= WQ;
  if (c.indexOf('k') >= 0 && b[0x74] === -KING && b[0x77] === -ROOK) cas |= BK;
  if (c.indexOf('q') >= 0 && b[0x74] === -KING && b[0x70] === -ROOK) cas |= BQ;
  this.castle = cas;
  this.ep = parts[3] && parts[3] !== '-' ? sqIndex(parts[3]) : -1;
  if (this.ep >= 0) {
    // keep only a real en-passant square
    var er = this.ep >> 4;
    if (!((this.side === 1 && er === 5 && b[this.ep - 16] === -PAWN) || (this.side === -1 && er === 2 && b[this.ep + 16] === PAWN))) this.ep = -1;
  }
  this.half = parseInt(parts[4], 10) || 0;
  this.full = Math.max(1, parseInt(parts[5], 10) || 1);
  this.wk = this.bk = -1;
  for (var s = 0; s < 128; s++) {
    if (s & 0x88) { s += 7; continue; }
    if (b[s] === KING) this.wk = s; else if (b[s] === -KING) this.bk = s;
  }
  this.ply = 0;
  this.epKey = this.epRelevant() ? (this.ep & 7) + 1 : 0;
  this.computeKey();
  this.startFen = this.fen();
};

P.epRelevant = function () {
  var ep = this.ep;
  if (ep < 0) return false;
  var p = this.side === 1 ? PAWN : -PAWN, s1 = ep - 15 * this.side, s2 = ep - 17 * this.side;
  return (!(s1 & 0x88) && this.b[s1] === p) || (!(s2 & 0x88) && this.b[s2] === p);
};

P.computeKey = function () {
  var lo = 0, hi = 0, b = this.b;
  for (var s = 0; s < 128; s++) {
    if (s & 0x88) { s += 7; continue; }
    if (b[s]) { var k = pIdx(b[s]) * 128 + s; lo ^= zLo[k]; hi ^= zHi[k]; }
  }
  lo ^= zCasLo[this.castle]; hi ^= zCasHi[this.castle];
  lo ^= zEpLo[this.epKey]; hi ^= zEpHi[this.epKey];
  if (this.side === -1) { lo ^= zSideLo; hi ^= zSideHi; }
  this.keyLo = lo; this.keyHi = hi;
};

Pos.fenError = function (fen) {
  if (typeof fen !== 'string') return 'not text';
  var parts = fen.trim().split(/\s+/);
  if (parts.length < 2) return 'missing side to move';
  var rows = parts[0].split('/');
  if (rows.length !== 8) return 'needs 8 ranks';
  var wk = 0, bk = 0;
  for (var r = 0; r < 8; r++) {
    var n = 0;
    for (var i = 0; i < rows[r].length; i++) {
      var ch = rows[r].charAt(i);
      if (ch >= '1' && ch <= '8') n += +ch;
      else if ('pnbrqkPNBRQK'.indexOf(ch) >= 0) {
        n++;
        if (ch === 'K') wk++; if (ch === 'k') bk++;
        if ((ch === 'p' || ch === 'P') && (r === 0 || r === 7)) return 'pawn on first or last rank';
      } else return 'unknown character ' + ch;
    }
    if (n !== 8) return 'rank ' + (8 - r) + ' does not have 8 squares';
  }
  if (wk !== 1 || bk !== 1) return 'each side needs exactly one king';
  if (parts[1] !== 'w' && parts[1] !== 'b') return 'side to move must be w or b';
  return null;
};

P.fen = function () {
  var out = '', b = this.b;
  for (var r = 7; r >= 0; r--) {
    var empty = 0;
    for (var f = 0; f < 8; f++) {
      var p = b[(r << 4) | f];
      if (!p) { empty++; continue; }
      if (empty) { out += empty; empty = 0; }
      var ch = PIECE_CHARS.charAt(Math.abs(p));
      out += p > 0 ? ch.toUpperCase() : ch;
    }
    if (empty) out += empty;
    if (r) out += '/';
  }
  var c = '';
  if (this.castle & WK) c += 'K'; if (this.castle & WQ) c += 'Q';
  if (this.castle & BK) c += 'k'; if (this.castle & BQ) c += 'q';
  return out + ' ' + (this.side === 1 ? 'w' : 'b') + ' ' + (c || '-') + ' ' +
    (this.epKey ? sqName(this.ep) : '-') + ' ' + this.half + ' ' + this.full;
};

P.clone = function () {
  var p = new Pos(this.startFen);
  for (var i = 0; i < this.ply; i++) p.make(this.stMove[i]);
  return p;
};

P.isAttacked = function (sq, by) {
  var b = this.b, s, d, i, t;
  if (by === 1) {
    s = sq - 15; if (!(s & 0x88) && b[s] === PAWN) return true;
    s = sq - 17; if (!(s & 0x88) && b[s] === PAWN) return true;
  } else {
    s = sq + 15; if (!(s & 0x88) && b[s] === -PAWN) return true;
    s = sq + 17; if (!(s & 0x88) && b[s] === -PAWN) return true;
  }
  var kn = KNIGHT * by, kg = KING * by;
  for (i = 0; i < 8; i++) {
    s = sq + N_DIRS[i]; if (!(s & 0x88) && b[s] === kn) return true;
    s = sq + K_DIRS[i]; if (!(s & 0x88) && b[s] === kg) return true;
  }
  var bi = BISHOP * by, qu = QUEEN * by, ro = ROOK * by;
  for (i = 0; i < 4; i++) {
    d = B_DIRS[i]; s = sq + d;
    while (!(s & 0x88)) { t = b[s]; if (t) { if (t === bi || t === qu) return true; break; } s += d; }
    d = R_DIRS[i]; s = sq + d;
    while (!(s & 0x88)) { t = b[s]; if (t) { if (t === ro || t === qu) return true; break; } s += d; }
  }
  return false;
};

/* Squares of every piece of side `by` that attacks sq (used by the coach and lessons). */
P.attackersOf = function (sq, by) {
  var b = this.b, out = [], s, d, i, t;
  var pd = by === 1 ? [-15, -17] : [15, 17];
  for (i = 0; i < 2; i++) { s = sq + pd[i]; if (!(s & 0x88) && b[s] === PAWN * by) out.push(s); }
  for (i = 0; i < 8; i++) {
    s = sq + N_DIRS[i]; if (!(s & 0x88) && b[s] === KNIGHT * by) out.push(s);
    s = sq + K_DIRS[i]; if (!(s & 0x88) && b[s] === KING * by) out.push(s);
  }
  for (i = 0; i < 4; i++) {
    d = B_DIRS[i]; s = sq + d;
    while (!(s & 0x88)) { t = b[s]; if (t) { if (t === BISHOP * by || t === QUEEN * by) out.push(s); break; } s += d; }
    d = R_DIRS[i]; s = sq + d;
    while (!(s & 0x88)) { t = b[s]; if (t) { if (t === ROOK * by || t === QUEEN * by) out.push(s); break; } s += d; }
  }
  return out;
};

P.inCheck = function () {
  return this.isAttacked(this.side === 1 ? this.wk : this.bk, -this.side);
};

/* Pseudo-legal generation into out[n..]. Returns the new end. */
P.gen = function (out, n, capsOnly) {
  var b = this.b, side = this.side, s, to, t, i, d, p;
  var fwd = 16 * side, startR = side === 1 ? 1 : 6, promoR = side === 1 ? 7 : 0;
  for (var sq = 0; sq < 120; sq++) {
    if (sq & 8) { sq += 7; continue; }
    p = b[sq] * side;
    if (p <= 0) continue;
    if (p === PAWN) {
      to = sq + fwd;
      if (!(to & 0x88) && b[to] === 0) {
        if ((to >> 4) === promoR) {
          out[n++] = mk(sq, to, QUEEN, F_PROMO);
          if (!capsOnly) { out[n++] = mk(sq, to, ROOK, F_PROMO); out[n++] = mk(sq, to, BISHOP, F_PROMO); out[n++] = mk(sq, to, KNIGHT, F_PROMO); }
        } else if (!capsOnly) {
          out[n++] = mk(sq, to, 0, 0);
          if ((sq >> 4) === startR && b[to + fwd] === 0) out[n++] = mk(sq, to + fwd, 0, F_DOUBLE);
        }
      }
      for (i = -1; i <= 1; i += 2) {
        to = sq + fwd + i;
        if (to & 0x88) continue;
        t = b[to];
        if (t * side < 0) {
          if ((to >> 4) === promoR) {
            out[n++] = mk(sq, to, QUEEN, F_PROMO | F_CAP);
            out[n++] = mk(sq, to, ROOK, F_PROMO | F_CAP); out[n++] = mk(sq, to, BISHOP, F_PROMO | F_CAP); out[n++] = mk(sq, to, KNIGHT, F_PROMO | F_CAP);
          } else out[n++] = mk(sq, to, 0, F_CAP);
        } else if (to === this.ep && t === 0) out[n++] = mk(sq, to, 0, F_EP | F_CAP);
      }
    } else if (p === KNIGHT || p === KING) {
      var dirs = p === KNIGHT ? N_DIRS : K_DIRS;
      for (i = 0; i < 8; i++) {
        to = sq + dirs[i];
        if (to & 0x88) continue;
        t = b[to] * side;
        if (t === 0) { if (!capsOnly) out[n++] = mk(sq, to, 0, 0); }
        else if (t < 0) out[n++] = mk(sq, to, 0, F_CAP);
      }
      if (p === KING && !capsOnly) {
        if (side === 1 && sq === 4) {
          if ((this.castle & WK) && !b[5] && !b[6] && b[7] === ROOK && !this.isAttacked(4, -1) && !this.isAttacked(5, -1) && !this.isAttacked(6, -1)) out[n++] = mk(4, 6, 0, F_CASTLE);
          if ((this.castle & WQ) && !b[3] && !b[2] && !b[1] && b[0] === ROOK && !this.isAttacked(4, -1) && !this.isAttacked(3, -1) && !this.isAttacked(2, -1)) out[n++] = mk(4, 2, 0, F_CASTLE);
        } else if (side === -1 && sq === 0x74) {
          if ((this.castle & BK) && !b[0x75] && !b[0x76] && b[0x77] === -ROOK && !this.isAttacked(0x74, 1) && !this.isAttacked(0x75, 1) && !this.isAttacked(0x76, 1)) out[n++] = mk(0x74, 0x76, 0, F_CASTLE);
          if ((this.castle & BQ) && !b[0x73] && !b[0x72] && !b[0x71] && b[0x70] === -ROOK && !this.isAttacked(0x74, 1) && !this.isAttacked(0x73, 1) && !this.isAttacked(0x72, 1)) out[n++] = mk(0x74, 0x72, 0, F_CASTLE);
        }
      }
    } else {
      // directions 0-3 are orthogonal, 4-7 diagonal
      var start = p === BISHOP ? 4 : 0, end = p === ROOK ? 4 : 8;
      for (i = start; i < end; i++) {
        d = i < 4 ? R_DIRS[i] : B_DIRS[i - 4];
        to = sq + d;
        while (!(to & 0x88)) {
          t = b[to] * side;
          if (t === 0) { if (!capsOnly) out[n++] = mk(sq, to, 0, 0); }
          else { if (t < 0) out[n++] = mk(sq, to, 0, F_CAP); break; }
          to += d;
        }
      }
    }
  }
  return n;
};

P.make = function (m) {
  var from = m & 127, to = (m >> 7) & 127, promo = (m >> 14) & 7, fl = m >>> 17;
  var b = this.b, side = this.side, p = b[from], cap = b[to], i = this.ply, k;
  this.stMove[i] = m; this.stCastle[i] = this.castle; this.stEp[i] = this.ep;
  this.stEpKey[i] = this.epKey; this.stHalf[i] = this.half;
  this.stKeyLo[i] = this.keyLo; this.stKeyHi[i] = this.keyHi;
  var lo = this.keyLo ^ zEpLo[this.epKey] ^ zCasLo[this.castle] ^ zSideLo;
  var hi = this.keyHi ^ zEpHi[this.epKey] ^ zCasHi[this.castle] ^ zSideHi;
  if (fl & F_EP) {
    var cs = to - 16 * side; cap = b[cs]; b[cs] = 0;
    k = pIdx(cap) * 128 + cs; lo ^= zLo[k]; hi ^= zHi[k];
  } else if (cap) { k = pIdx(cap) * 128 + to; lo ^= zLo[k]; hi ^= zHi[k]; }
  this.stCap[i] = cap;
  b[from] = 0; k = pIdx(p) * 128 + from; lo ^= zLo[k]; hi ^= zHi[k];
  var np = promo ? promo * side : p;
  b[to] = np; k = pIdx(np) * 128 + to; lo ^= zLo[k]; hi ^= zHi[k];
  if (fl & F_CASTLE) {
    var rf, rt;
    if (to > from) { rf = from + 3; rt = from + 1; } else { rf = from - 4; rt = from - 1; }
    var rk = b[rf]; b[rf] = 0; b[rt] = rk;
    k = pIdx(rk) * 128; lo ^= zLo[k + rf] ^ zLo[k + rt]; hi ^= zHi[k + rf] ^ zHi[k + rt];
  }
  if (p === KING) this.wk = to; else if (p === -KING) this.bk = to;
  this.castle &= CMASK[from] & CMASK[to];
  this.half = (p === PAWN || p === -PAWN || cap) ? 0 : this.half + 1;
  if (side === -1) this.full++;
  this.side = -side;
  this.ep = (fl & F_DOUBLE) ? (from + to) >> 1 : -1;
  this.epKey = this.ep >= 0 && this.epRelevant() ? (this.ep & 7) + 1 : 0;
  lo ^= zCasLo[this.castle] ^ zEpLo[this.epKey];
  hi ^= zCasHi[this.castle] ^ zEpHi[this.epKey];
  this.keyLo = lo; this.keyHi = hi;
  this.ply = i + 1;
};

P.unmake = function () {
  var i = --this.ply, m = this.stMove[i];
  var from = m & 127, to = (m >> 7) & 127, promo = (m >> 14) & 7, fl = m >>> 17;
  var b = this.b;
  this.side = -this.side;
  var side = this.side;
  if (side === -1) this.full--;
  var p = promo ? PAWN * side : b[to];
  b[from] = p;
  if (fl & F_EP) { b[to] = 0; b[to - 16 * side] = this.stCap[i]; }
  else b[to] = this.stCap[i];
  if (fl & F_CASTLE) {
    var rf, rt;
    if (to > from) { rf = from + 3; rt = from + 1; } else { rf = from - 4; rt = from - 1; }
    b[rf] = b[rt]; b[rt] = 0;
  }
  if (p === KING) this.wk = from; else if (p === -KING) this.bk = from;
  this.castle = this.stCastle[i]; this.ep = this.stEp[i]; this.epKey = this.stEpKey[i];
  this.half = this.stHalf[i]; this.keyLo = this.stKeyLo[i]; this.keyHi = this.stKeyHi[i];
};

P.makeNull = function () {
  var i = this.ply;
  this.stMove[i] = 0; this.stCastle[i] = this.castle; this.stEp[i] = this.ep;
  this.stEpKey[i] = this.epKey; this.stHalf[i] = this.half;
  this.stKeyLo[i] = this.keyLo; this.stKeyHi[i] = this.keyHi; this.stCap[i] = 0;
  this.keyLo ^= zEpLo[this.epKey] ^ zSideLo; this.keyHi ^= zEpHi[this.epKey] ^ zSideHi;
  this.ep = -1; this.epKey = 0; this.half++;
  this.side = -this.side; this.ply = i + 1;
};
P.unmakeNull = function () {
  var i = --this.ply;
  this.side = -this.side;
  this.ep = this.stEp[i]; this.epKey = this.stEpKey[i]; this.half = this.stHalf[i];
  this.keyLo = this.stKeyLo[i]; this.keyHi = this.stKeyHi[i];
};

/* True if the side that just moved left its own king in check. */
P.leftInCheck = function () {
  return this.isAttacked(this.side === 1 ? this.bk : this.wk, this.side);
};

var GENBUF = new Int32Array(256);
P.legalMoves = function () {
  var n = this.gen(GENBUF, 0, false), out = [];
  for (var i = 0; i < n; i++) {
    var m = GENBUF[i];
    this.make(m);
    if (!this.leftInCheck()) out.push(m);
    this.unmake();
  }
  return out;
};

P.isLegal = function (m) {
  var list = this.legalMoves();
  return list.indexOf(m) >= 0;
};

P.pieceAt = function (sq) { return this.b[typeof sq === 'string' ? sqIndex(sq) : sq]; };

P.moveCaptured = function (m) {
  var fl = m >>> 17;
  if (fl & F_EP) return -PAWN * this.side;
  return this.b[(m >> 7) & 127];
};

P.repetitions = function () {
  var count = 1, stop = Math.max(0, this.ply - this.half);
  for (var j = this.ply - 2; j >= stop; j -= 2) {
    if (this.stKeyLo[j] === this.keyLo && this.stKeyHi[j] === this.keyHi) count++;
  }
  return count;
};

P.insufficient = function () {
  var b = this.b, minors = 0, bishopsLight = 0, bishopsDark = 0, knights = 0;
  for (var s = 0; s < 120; s++) {
    if (s & 8) { s += 7; continue; }
    var t = Math.abs(b[s]);
    if (!t || t === KING) continue;
    if (t === PAWN || t === ROOK || t === QUEEN) return false;
    minors++;
    if (t === KNIGHT) knights++;
    else if (((s >> 4) + (s & 7)) & 1) bishopsLight++; else bishopsDark++;
  }
  if (minors <= 1) return true;
  if (knights === 0 && (bishopsLight === 0 || bishopsDark === 0)) return true;
  return false;
};

/* Game status for the side to move. */
P.status = function () {
  var legal = this.legalMoves();
  if (legal.length === 0) {
    if (this.inCheck()) return { over: true, result: this.side === 1 ? '0-1' : '1-0', reason: 'checkmate', winner: -this.side };
    return { over: true, result: '1/2-1/2', reason: 'stalemate', winner: 0 };
  }
  if (this.insufficient()) return { over: true, result: '1/2-1/2', reason: 'insufficient material', winner: 0 };
  if (this.half >= 100) return { over: true, result: '1/2-1/2', reason: 'fifty-move rule', winner: 0 };
  if (this.repetitions() >= 3) return { over: true, result: '1/2-1/2', reason: 'threefold repetition', winner: 0 };
  return { over: false, legal: legal };
};

/* ---------- notation ---------- */
function uci(m) {
  var s = sqName(m & 127) + sqName((m >> 7) & 127), pr = (m >> 14) & 7;
  return pr ? s + ' pnbrq'.charAt(pr) : s;
}

P.sanCore = function (m, legal) {
  var from = m & 127, to = (m >> 7) & 127, promo = (m >> 14) & 7, fl = m >>> 17;
  if (fl & F_CASTLE) return (to & 7) === 6 ? 'O-O' : 'O-O-O';
  var p = Math.abs(this.b[from]), cap = (fl & F_CAP) !== 0;
  if (p === PAWN) {
    return (cap ? 'abcdefgh'.charAt(from & 7) + 'x' : '') + sqName(to) + (promo ? '=' + 'NBRQ'.charAt(promo - 2) : '');
  }
  var s = 'NBRQK'.charAt(p - 2);
  if (p !== KING) {
    legal = legal || this.legalMoves();
    var sameFile = false, sameRank = false, other = false;
    for (var i = 0; i < legal.length; i++) {
      var o = legal[i], of = o & 127;
      if (o === m || ((o >> 7) & 127) !== to || of === from || Math.abs(this.b[of]) !== p) continue;
      other = true;
      if ((of & 7) === (from & 7)) sameFile = true;
      if ((of >> 4) === (from >> 4)) sameRank = true;
    }
    if (other) {
      if (!sameFile) s += 'abcdefgh'.charAt(from & 7);
      else if (!sameRank) s += ((from >> 4) + 1);
      else s += sqName(from);
    }
  }
  return s + (cap ? 'x' : '') + sqName(to);
};

P.san = function (m, legal) {
  var s = this.sanCore(m, legal);
  this.make(m);
  if (this.inCheck()) s += this.legalMoves().length ? '+' : '#';
  this.unmake();
  return s;
};

function normSan(s) {
  return s.replace(/[+#?!]/g, '').replace(/e\.p\.?/g, '').replace(/0/g, 'O').replace(/=/g, '').replace(/x/g, '').replace(/-/g, '').trim();
}

P.parseMove = function (str) {
  if (!str) return 0;
  var s = String(str).trim();
  var legal = this.legalMoves(), i;
  var u = s.toLowerCase();
  if (/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(u)) {
    for (i = 0; i < legal.length; i++) if (uci(legal[i]) === u || (u.length === 4 && uci(legal[i]) === u + 'q')) return legal[i];
  }
  var clean = s.replace(/[+#?!]+$/, '').replace(/^\d+\.(\.\.)?\s*/, '').replace(/0-0-0/g, 'O-O-O').replace(/0-0/g, 'O-O');
  for (i = 0; i < legal.length; i++) if (this.sanCore(legal[i], legal) === clean) return legal[i];
  var n = normSan(clean);
  // promotion written without '=' or in lowercase
  n = n.replace(/([a-h][18])([nbrq])$/, function (a, b2, c) { return b2 + c.toUpperCase(); });
  var hits = [];
  for (i = 0; i < legal.length; i++) if (normSan(this.sanCore(legal[i], legal)) === n) hits.push(legal[i]);
  if (hits.length === 1) return hits[0];
  // over-specified SAN such as Nbd7 when only one knight can go
  var mm = /^([NBRQK])?([a-h])?([1-8])?([a-h][1-8])([NBRQ])?$/.exec(n);
  if (mm) {
    var pt = mm[1] ? 'NBRQK'.indexOf(mm[1]) + 2 : PAWN, to = sqIndex(mm[4]);
    var pr = mm[5] ? 'NBRQ'.indexOf(mm[5]) + 2 : 0;
    hits = [];
    for (i = 0; i < legal.length; i++) {
      var m = legal[i], f = m & 127;
      if (((m >> 7) & 127) !== to || Math.abs(this.b[f]) !== pt) continue;
      if (mm[2] && 'abcdefgh'.charAt(f & 7) !== mm[2]) continue;
      if (mm[3] && String((f >> 4) + 1) !== mm[3]) continue;
      if (((m >> 14) & 7) !== (pr || (pt === PAWN && ((to >> 4) === 7 || (to >> 4) === 0) ? QUEEN : 0))) continue;
      hits.push(m);
    }
    if (hits.length === 1) return hits[0];
  }
  return 0;
};

/* ---------- static exchange evaluation ---------- */
var SEEB = new Int8Array(128);
function lva(b, sq, by) {
  var s, i, d, t;
  var pd = by === 1 ? -15 : 15, pd2 = by === 1 ? -17 : 17;
  s = sq + pd; if (!(s & 0x88) && b[s] === PAWN * by) return s;
  s = sq + pd2; if (!(s & 0x88) && b[s] === PAWN * by) return s;
  for (i = 0; i < 8; i++) { s = sq + N_DIRS[i]; if (!(s & 0x88) && b[s] === KNIGHT * by) return s; }
  var best = -1, bestV = 99;
  for (i = 0; i < 8; i++) {
    d = i < 4 ? B_DIRS[i] : R_DIRS[i - 4];
    s = sq + d;
    while (!(s & 0x88)) {
      t = b[s];
      if (t) {
        var a = t * by;
        if (a > 0) {
          if (i < 4 ? (a === BISHOP || a === QUEEN) : (a === ROOK || a === QUEEN)) {
            if (a < bestV) { bestV = a; best = s; }
          }
        }
        break;
      }
      s += d;
    }
  }
  if (best >= 0) return best;
  for (i = 0; i < 8; i++) { s = sq + K_DIRS[i]; if (!(s & 0x88) && b[s] === KING * by) return s; }
  return -1;
}

P.see = function (m) {
  var from = m & 127, to = (m >> 7) & 127, promo = (m >> 14) & 7, fl = m >>> 17;
  var b = SEEB; b.set(this.b);
  var gain = [], d = 0, side = this.side;
  var captured = (fl & F_EP) ? PAWN : Math.abs(b[to]);
  if (fl & F_EP) b[to - 16 * side] = 0;
  gain[0] = SEE_VAL[captured];
  var mover = promo ? promo * side : b[from];
  if (promo) gain[0] += SEE_VAL[promo] - SEE_VAL[PAWN];
  var onSquare = SEE_VAL[Math.abs(mover)];
  b[from] = 0; b[to] = mover; side = -side;
  for (;;) {
    d++;
    gain[d] = onSquare - gain[d - 1]; // if `side` now takes the piece standing on `to`
    if (Math.max(-gain[d - 1], gain[d]) < 0) break;
    var a = lva(b, to, side);
    if (a < 0) break;
    onSquare = SEE_VAL[Math.abs(b[a])];
    b[to] = b[a]; b[a] = 0; side = -side;
  }
  while (--d) gain[d - 1] = -Math.max(-gain[d - 1], gain[d]);
  return gain[0];
};

/* Is the piece on sq losing material if the opponent captures it now? Returns expected loss (>0) or 0. */
P.hangingLoss = function (sq) {
  var p = this.b[sq];
  if (!p || Math.abs(p) === KING) return 0;
  var owner = p > 0 ? 1 : -1, them = -owner;
  var atk = this.attackersOf(sq, them);
  if (!atk.length) return 0;
  // simulate with the opponent to move
  var saveSide = this.side, best = 0;
  this.side = them;
  for (var i = 0; i < atk.length; i++) {
    var f = atk[i], promoR = them === 1 ? 7 : 0, pr = (Math.abs(this.b[f]) === PAWN && (sq >> 4) === promoR) ? QUEEN : 0;
    var m = mk(f, sq, pr, F_CAP | (pr ? F_PROMO : 0));
    // capture must be legal
    this.make(m); var ok = !this.leftInCheck(); this.unmake();
    if (!ok) continue;
    var v = this.see(m);
    if (v > best) best = v;
  }
  this.side = saveSide;
  return best;
};

/* ---------- PGN ---------- */
function parsePgn(text) {
  text = String(text || '').replace(/\r/g, '');
  // first game only
  var games = text.split(/\n\s*\n(?=\s*\[Event )/);
  text = games[0];
  var headers = {}, re = /\[(\w+)\s+"((?:[^"\\]|\\.)*)"\]/g, m;
  while ((m = re.exec(text))) headers[m[1]] = m[2].replace(/\\"/g, '"');
  var body = text.replace(/\[(\w+)\s+"((?:[^"\\]|\\.)*)"\]/g, ' ');
  body = body.replace(/\{[^}]*\}/g, ' ').replace(/;[^\n]*/g, ' ');
  var out = '', depth = 0;
  for (var i = 0; i < body.length; i++) {
    var ch = body.charAt(i);
    if (ch === '(') { depth++; continue; }
    if (ch === ')') { depth = Math.max(0, depth - 1); continue; }
    if (!depth) out += ch;
  }
  out = out.replace(/\$\d+/g, ' ').replace(/\d+\.(\.\.)?/g, ' ').replace(/(1-0|0-1|1\/2-1\/2|\*)\s*$/, ' ');
  var tokens = out.split(/\s+/).filter(function (t) { return t && !/^(1-0|0-1|1\/2-1\/2|\*)$/.test(t); });
  return { headers: headers, sans: tokens };
}

function pgnFromMoves(headers, startFen, moves) {
  var pos = new Pos(startFen || START_FEN);
  var order = ['Event', 'Site', 'Date', 'Round', 'White', 'Black', 'Result'];
  var h = Object.assign({ Event: 'Casual game', Site: 'Tempo', Date: '????.??.??', Round: '-', White: '?', Black: '?', Result: '*' }, headers || {});
  if (startFen && startFen !== START_FEN) { h.SetUp = '1'; h.FEN = startFen; }
  var lines = [];
  order.forEach(function (k) { lines.push('[' + k + ' "' + String(h[k]).replace(/"/g, '\\"') + '"]'); });
  Object.keys(h).forEach(function (k) { if (order.indexOf(k) < 0) lines.push('[' + k + ' "' + String(h[k]).replace(/"/g, '\\"') + '"]'); });
  var toks = [];
  for (var i = 0; i < moves.length; i++) {
    var m = moves[i];
    if (pos.side === 1) toks.push(pos.full + '.');
    else if (i === 0) toks.push(pos.full + '...');
    toks.push(pos.san(m));
    pos.make(m);
  }
  toks.push(h.Result);
  var text = '', line = '';
  toks.forEach(function (t) {
    if ((line + ' ' + t).length > 79) { text += line + '\n'; line = t; }
    else line = line ? line + ' ' + t : t;
  });
  text += line;
  return lines.join('\n') + '\n\n' + text + '\n';
}

/* Build a position by replaying SAN moves; returns {pos, moves, error}. */
function replay(startFen, sans) {
  var pos = new Pos(startFen || START_FEN), moves = [];
  for (var i = 0; i < sans.length; i++) {
    var m = pos.parseMove(sans[i]);
    if (!m) return { pos: pos, moves: moves, error: 'Move ' + (i + 1) + ' (' + sans[i] + ') is not legal here.' };
    moves.push(m); pos.make(m);
  }
  return { pos: pos, moves: moves, error: null };
}

var Core = {
  PAWN: PAWN, KNIGHT: KNIGHT, BISHOP: BISHOP, ROOK: ROOK, QUEEN: QUEEN, KING: KING,
  F_CAP: F_CAP, F_EP: F_EP, F_CASTLE: F_CASTLE, F_DOUBLE: F_DOUBLE, F_PROMO: F_PROMO,
  START_FEN: START_FEN, SEE_VAL: SEE_VAL,
  Pos: Pos, sqName: sqName, sqIndex: sqIndex, to64: to64, from64: from64,
  mFrom: mFrom, mTo: mTo, mPromo: mPromo, mFlags: mFlags, mk: mk, uci: uci,
  parsePgn: parsePgn, pgnFromMoves: pgnFromMoves, replay: replay,
  N_DIRS: N_DIRS, K_DIRS: K_DIRS, B_DIRS: B_DIRS, R_DIRS: R_DIRS
};
G.TempoCore = Core;
if (typeof module !== 'undefined' && module.exports) module.exports = Core;
})(typeof self !== 'undefined' ? self : (typeof globalThis !== 'undefined' ? globalThis : this));
