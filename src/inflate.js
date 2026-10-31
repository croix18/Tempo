/* Minimal gzip/deflate decoder (fallback for browsers without DecompressionStream). */
(function (G) {
'use strict';
var LBASE = [3,4,5,6,7,8,9,10,11,13,15,17,19,23,27,31,35,43,51,59,67,83,99,115,131,163,195,227,258];
var LEXT = [0,0,0,0,0,0,0,0,1,1,1,1,2,2,2,2,3,3,3,3,4,4,4,4,5,5,5,5,0];
var DBASE = [1,2,3,4,5,7,9,13,17,25,33,49,65,97,129,193,257,385,513,769,1025,1537,2049,3073,4097,6145,8193,12289,16385,24577];
var DEXT = [0,0,0,0,1,1,2,2,3,3,4,4,5,5,6,6,7,7,8,8,9,9,10,10,11,11,12,12,13,13];
var ORDER = [16,17,18,0,8,7,9,6,10,5,11,4,12,3,13,2,14,1,15];

function build(lengths, n) {
  var counts = new Uint16Array(16), offs = new Uint16Array(16), symbols = new Uint16Array(n), i;
  for (i = 0; i < n; i++) counts[lengths[i]]++;
  counts[0] = 0;
  for (i = 1; i < 16; i++) offs[i] = offs[i - 1] + counts[i - 1];
  for (i = 0; i < n; i++) if (lengths[i]) symbols[offs[lengths[i]]++] = i;
  return { counts: counts, symbols: symbols };
}

function inflateRaw(src) {
  var out = new Uint8Array(Math.max(1024, src.length * 4)), outLen = 0;
  var pos = 0, bitBuf = 0, bitCnt = 0;
  function ensure(n) {
    if (outLen + n <= out.length) return;
    var o = new Uint8Array(Math.max(out.length * 2, outLen + n)); o.set(out.subarray(0, outLen)); out = o;
  }
  function bits(n) {
    while (bitCnt < n) {
      if (pos >= src.length) throw new Error('inflate: unexpected end of data');
      bitBuf |= src[pos++] << bitCnt; bitCnt += 8;
    }
    var v = bitBuf & ((1 << n) - 1);
    bitBuf >>>= n; bitCnt -= n;
    return v;
  }
  function decode(h) {
    var code = 0, first = 0, index = 0;
    for (var len = 1; len < 16; len++) {
      code |= bits(1);
      var count = h.counts[len];
      if (code - count < first) return h.symbols[index + (code - first)];
      index += count; first += count; first <<= 1; code <<= 1;
    }
    throw new Error('inflate: bad code');
  }
  function codes(lc, dc) {
    for (;;) {
      var sym = decode(lc);
      if (sym < 256) { ensure(1); out[outLen++] = sym; }
      else if (sym === 256) return;
      else {
        sym -= 257;
        if (sym >= 29) throw new Error('inflate: bad length');
        var len = LBASE[sym] + bits(LEXT[sym]);
        var ds = decode(dc);
        if (ds >= 30) throw new Error('inflate: bad distance');
        var dist = DBASE[ds] + bits(DEXT[ds]);
        if (dist > outLen) throw new Error('inflate: distance too far');
        ensure(len);
        for (var i = 0; i < len; i++) { out[outLen] = out[outLen - dist]; outLen++; }
      }
    }
  }
  var fixedL, fixedD;
  var last;
  do {
    last = bits(1);
    var type = bits(2);
    if (type === 0) {
      bitBuf = 0; bitCnt = 0;
      var slen = src[pos] | (src[pos + 1] << 8);
      pos += 4;
      ensure(slen); out.set(src.subarray(pos, pos + slen), outLen); outLen += slen; pos += slen;
    } else if (type === 1) {
      if (!fixedL) {
        var l = new Uint8Array(288), i;
        for (i = 0; i < 144; i++) l[i] = 8; for (; i < 256; i++) l[i] = 9; for (; i < 280; i++) l[i] = 7; for (; i < 288; i++) l[i] = 8;
        fixedL = build(l, 288);
        var d = new Uint8Array(30); for (i = 0; i < 30; i++) d[i] = 5;
        fixedD = build(d, 30);
      }
      codes(fixedL, fixedD);
    } else if (type === 2) {
      var hlit = bits(5) + 257, hdist = bits(5) + 1, hclen = bits(4) + 4;
      var cl = new Uint8Array(19);
      for (var k = 0; k < hclen; k++) cl[ORDER[k]] = bits(3);
      var clc = build(cl, 19);
      var lens = new Uint8Array(hlit + hdist), idx = 0;
      while (idx < hlit + hdist) {
        var sym = decode(clc);
        if (sym < 16) lens[idx++] = sym;
        else {
          var rep = 0, val = 0;
          if (sym === 16) { if (!idx) throw new Error('inflate: repeat with no previous length'); val = lens[idx - 1]; rep = 3 + bits(2); }
          else if (sym === 17) rep = 3 + bits(3);
          else rep = 11 + bits(7);
          while (rep--) lens[idx++] = val;
        }
      }
      codes(build(lens.subarray(0, hlit), hlit), build(lens.subarray(hlit), hdist));
    } else throw new Error('inflate: bad block type');
  } while (!last);
  return out.subarray(0, outLen);
}

function gunzip(src) {
  if (src[0] !== 0x1f || src[1] !== 0x8b || src[2] !== 8) throw new Error('not gzip data');
  var flags = src[3], pos = 10;
  if (flags & 4) pos += 2 + (src[pos] | (src[pos + 1] << 8));
  if (flags & 8) { while (src[pos]) pos++; pos++; }
  if (flags & 16) { while (src[pos]) pos++; pos++; }
  if (flags & 2) pos += 2;
  return inflateRaw(src.subarray(pos));
}

function b64bytes(b64) {
  var s = atob(b64.replace(/\s+/g, '')), u = new Uint8Array(s.length);
  for (var i = 0; i < s.length; i++) u[i] = s.charCodeAt(i);
  return u;
}

/* Decode a base64 gzip blob to text, preferring the browser's native decoder. */
function unpackText(b64) {
  var bytes = b64bytes(b64);
  if (typeof DecompressionStream !== 'undefined' && typeof Response !== 'undefined' && typeof Blob !== 'undefined') {
    try {
      var stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
      return new Response(stream).text().catch(function () { return new TextDecoder().decode(gunzip(bytes)); });
    } catch (e) { /* fall through */ }
  }
  return Promise.resolve(new TextDecoder().decode(gunzip(bytes)));
}
function unpackBytes(b64) {
  var bytes = b64bytes(b64);
  if (typeof DecompressionStream !== 'undefined' && typeof Response !== 'undefined' && typeof Blob !== 'undefined') {
    try {
      var stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
      return new Response(stream).arrayBuffer().then(function (ab) { return new Uint8Array(ab); }).catch(function () { return gunzip(bytes); });
    } catch (e) { /* fall through */ }
  }
  return Promise.resolve(gunzip(bytes));
}

var X = { inflateRaw: inflateRaw, gunzip: gunzip, b64bytes: b64bytes, unpackText: unpackText, unpackBytes: unpackBytes };
G.TempoInflate = X;
if (typeof module !== 'undefined' && module.exports) module.exports = X;
})(typeof self !== 'undefined' ? self : (typeof globalThis !== 'undefined' ? globalThis : this));
