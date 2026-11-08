// Checks every trap in content/openings.js for the Learn lessons (Watch, Set it, Dodge it, From memory).
//   node tests/verify_traps.js                                Tempo's embedded Stockfish 19 at depth 16 (a few minutes)
//   SF_BIN=/path/to/stockfish node tests/verify_traps.js      a native engine at depth 22 (SF_THREADS, default up to 4)
//   options: --depth N, --only id,id
// For each trap:
//   1. the fields are there and agree with each other, and every SAN is legal and written the standard way: moves, bait,
//      punish, safe, and the numbered moves in the prose ("4.Nxe5", "5...dxe5 6.Qxg4"); every note key is a ply of `moves`
//   2. at `key` the bait costs the victim at least 1.5 pawns against `safe`, or allows a forced mate
//   3. `safe` is within 0.5 pawns of the engine's best move there
//   4. `moves` (or the bait and `punish`) ends in checkmate, or with the setter at least 2 pawns up
//   5. the claims in CLAIMS below, which back the statements in the notes, hold; the prose follows the style rules
// An engine check that fails is searched again 6 plies deeper before it counts. Evals are shown for the setter
// (+ is good for the side that sets the trap). Exit code 1 on any failure.
'use strict';
const os = require('os');
const fs = require('fs');
const path = require('path');
if (process.env.SF_BIN && !process.env.SF_THREADS) process.env.SF_THREADS = String(Math.min(4, (os.cpus() || []).length || 1));
const C = require('../src/core.js');
const SF = require('./sfnode.js');
const data = require('../content/openings.js');

const argv = process.argv.slice(2);
const opt = k => { const i = argv.indexOf('--' + k); return i >= 0 && i + 1 < argv.length ? argv[i + 1] : null; };
const DEPTH = +(opt('depth') || (process.env.SF_BIN ? 22 : 16));
const DEEPER = DEPTH + 6;
const ONLY = opt('only') ? opt('only').split(',') : null;
const BAIT_COST = 150, SAFE_GAP = 50, FINAL_EDGE = 200, GOOD = 50, SAFE_ALT = 100; // SAFE_ALT: a move the prose calls safe
const MATE = 100000, NEAR = MATE - 1000;

// Engine-checkable facts behind the prose. `at` is a number of plies of the trap's moves, `then` more SAN after that.
// good: these moves are within `within` (default 0.5, or SAFE_ALT, 1 pawn, for other moves a note calls safe) of the best;
// worse: { san, min, max } how far below the best;
// best + by: the engine's choice, every other move at least `by` worse; edge: { side, min, max } the eval for that side;
// mates: that side has a forced mate (in at most `in` moves); mate: the position is checkmate; only / moves: the legal moves;
// material: White minus Black in pawns (1, 3, 3, 5, 9).
const CLAIMS = {
  'scholars-mate': [
    { says: 'after 4.Qf3, Qxf7 is mate again if Black ignores it', at: 7, then: 'a6 Qxf7#', mate: true },
    { says: 'now ...Nf6 is perfect', at: 7, good: ['Nf6'] },
    { says: 'now you attack with 6...Nd4', at: 11, good: ['Nd4'] }
  ],
  'fried-liver': [
    { says: '...d5 is the right idea', at: 7, good: ['d5'] },
    { says: '5...Nxd5 is a small mistake; 5...Na5 was better', at: 9, good: ['Na5'], worse: { san: 'Nxd5', min: 25, max: 150 } },
    { says: 'the king has to take on f7', at: 11, best: 'Kxf7', by: 150 },
    { says: '7...Ke6 was the only good move', at: 13, best: 'Ke6', by: 100 },
    { says: 'after 7...Ke6 you can defend', at: 13, then: 'Ke6', edge: { side: 'b', min: -150 } },
    { says: 'after 8.Bxd5+ the king can’t move', at: 15, moves: ['Be6', 'Qxd5'] },
    { says: 'if 8...Be6, then 9.Bxe6 is checkmate', at: 15, then: 'Be6 Bxe6#', mate: true },
    { says: '9...Be6 is the only legal move', at: 17, only: 'Be6' }
  ],
  'legals-mate': [
    { says: '4...g6 is a slow move', at: 7, worse: { san: 'g6', min: 100 } },
    { says: 'ignore the pin with 5.Nxe5', at: 8, good: ['Nxe5'] },
    { says: 'after 5...dxe5 6.Qxg4, Black is only a pawn down', at: 9, then: 'dxe5 Qxg4', material: 1 },
    { says: 'the king has only one square, e7', at: 11, only: 'Ke7' }
  ],
  'blackburne-shilling': [
    { says: '4.Nxd4 or 4.O-O was safe', at: 6, good: ['Nxd4', 'O-O'], within: SAFE_ALT },
    { says: 'after 4.Nxd4 exd4 5.O-O your position is better', at: 6, then: 'Nxd4 exd4 O-O', edge: { side: 'w', min: 50 } },
    { says: '5.Nxf7 is greed', at: 8, worse: { san: 'Nxf7', min: 300 } }
  ],
  'stafford': [
    { says: 'd3 protects e4, good so far', at: 8, good: ['d3'] },
    { says: 'Black ignores the pin', at: 11, good: ['Nxe4'] },
    { says: 'after 7.Bxd8 Black can force checkmate in two moves', at: 13, mates: 'b', in: 2 },
    { says: 'your king must go to e2', at: 14, only: 'Ke2' },
    { says: 'after 6.Be2 you stay a pawn up', at: 10, then: 'Be2', material: 1 }
  ],
  'fishing-pole': [
    { says: 'kicking the knight is fine', at: 8, good: ['h3'] },
    { says: '6.c3 or 6.d3 was safe', at: 10, good: ['c3', 'd3'], within: SAFE_ALT },
    { says: 'after 6.hxg4 hxg4 there was no good way out', at: 12, edge: { side: 'w', max: -200 } },
    { says: 'after 7.Ne1 Black can force checkmate', at: 13, mates: 'b' },
    { says: '7...Qh4 threatens mate on h2', at: 14, then: 'a3 Qh2#', mate: true },
    { says: 'after 6.c3 you are better', at: 10, then: 'c3', edge: { side: 'w', min: 50 } }
  ],
  'elephant-trap': [
    { says: 'White has to block with the queen', at: 14, only: 'Qd2' },
    { says: 'you have won a knight for a pawn', at: 18, material: -2 }
  ],
  'englund': [
    { says: 'Bf4 defends the pawn and is fine', at: 6, good: ['Bf4'] },
    { says: '6.Nc3 was the only good move', at: 10, best: 'Nc3', by: 150 },
    { says: '8.Nxc3 was needed', at: 14, best: 'Nxc3', by: 300 },
    { says: 'after 6.Nc3 you are better', at: 10, then: 'Nc3', edge: { side: 'w', min: 50 } }
  ],
  'noahs-ark': [
    { says: '8.a4 or 8.c3 was safe', at: 14, good: ['a4', 'c3'], within: SAFE_ALT },
    { says: 'after 8.a4 the game is about equal', at: 14, then: 'a4', edge: { side: 'w', min: -60, max: 60 } }
  ],
  'lasker-trap': [
    { says: '4.e3 is a small mistake; 4.Nf3 was better', at: 6, good: ['Nf3'], worse: { san: 'e3', min: 25, max: 150 } },
    { says: 'take on e3', at: 9, good: ['dxe3'] },
    { says: 'promote to a knight, not a queen', at: 13, good: ['fxg1=N+'], worse: { san: 'fxg1=Q', min: 100 } },
    { says: 'if 8.Rxg1, ...Bg4+ wins the queen', at: 14, then: 'Rxg1', edge: { side: 'b', min: 500 } },
    { says: 'you are up material', at: 18, material: -3 },
    { says: 'after 6.fxe3 the game is about equal', at: 10, then: 'fxe3', edge: { side: 'w', min: -60, max: 60 } }
  ],
  'fools-mate': [
    { says: '1.f3 is a weak first move', at: 0, worse: { san: 'f3', min: 50 } },
    { says: 'after 2.Nc3, a check on h4 can be blocked with g3', at: 2, then: 'Nc3 Qh4+', only: 'g3' }
  ],
  'damiano': [
    { says: 'take the pawn anyway', at: 4, good: ['Nxe5'] },
    { says: 'Black has to block with ...g6 or walk the king to e7', at: 7, moves: ['g6', 'Ke7'] },
    { says: 'a rook and two pawns for your knight', at: 11, material: 4 },
    { says: 'after 3...Qe7 4.Nf3, ...Qxe4+ wins the pawn back', at: 5, then: 'Qe7 Nf3 Qxe4+', material: 0 }
  ],
  'petrov-copycat': [
    { says: 'the main line is 3...d6', at: 5, good: ['d6'] },
    { says: 'Black has to answer the check', at: 9, moves: ['Be7', 'Ne4', 'Qe7'] },
    { says: 'you win the queen for your knight', at: 11, then: 'Bxe7', material: 6 },
    { says: 'after 4...Qe7 5.Qxe4 d6, the pawn wins back the knight', at: 7, then: 'Qe7 Qxe4 d6 d4 dxe5', material: 0 }
  ],
  'caro-smothered': [
    { says: 'Qe2 is sneaky but not a blunder', at: 8, good: ['Qe2'], within: 60 },
    { says: 'after 5...Ndf6, Nd6 is no longer checkmate', at: 9, then: 'Ndf6 Nd6+', edge: { side: 'b', min: 200 } }
  ],
  'qga-b5': [
    { says: '3...b5 is risky; 3...Nf6 was better', at: 5, good: ['Nf6'], worse: { san: 'b5', min: 25 } },
    { says: 'if 4...c6, then 5.axb5 cxb5 6.Qf3 hits the rook on a8', at: 7, then: 'c6 axb5 cxb5 Qf3', edge: { side: 'w', min: 200 } },
    { says: 'you win a whole rook', at: 11, material: 4 },
    { says: 'after 5...Bb7 you are only a little worse', at: 9, then: 'Bb7', edge: { side: 'b', min: -150 } }
  ],
  'french-bb5': [
    { says: 'it looks like Black has won a pawn', at: 16, material: -1 },
    { says: 'trade bishops with check first', at: 18, good: ['Bxd7+'] },
    { says: 'if you take the queen at once, Black’s bishop takes yours', at: 18, then: 'Qxd4 Bxb5', material: 5 },
    { says: 'you have won Black’s queen for a pawn', at: 21, material: 8 },
    { says: 'after 7...Bd7 your position is fine', at: 13, then: 'Bd7', edge: { side: 'b', min: -60 } }
  ]
};

/* ---------- engine ---------- */
const eng = SF.create();
const memo = new Map();
function search(fen, depth, multipv) {
  const k = fen + '|' + depth + '|' + multipv;
  if (!memo.has(k)) memo.set(k, eng.analyse(fen, { depth, multipv }));
  return memo.get(k);
}
const val = l => l.mate != null ? (l.mate > 0 ? MATE - l.mate : -MATE - l.mate) : l.cp;
async function value(pos, depth) { // for the side to move
  const st = pos.status();
  if (st.over) return st.reason === 'checkmate' ? -MATE : 0;
  const r = await search(pos.fen(), depth, 1);
  return r.lines.length ? val(r.lines[0]) : 0;
}
async function valueAfter(pos, san, depth) { // for the side that plays san
  const p = pos.clone(), m = p.parseMove(san);
  if (!m) return null;
  p.make(m);
  return -(await value(p, depth));
}
// the best move and value at pos, and the value of each of `sans` there (from the same MultiPV search when it has them)
async function compare(pos, sans, depth) {
  const r = await search(pos.fen(), depth, 3), ls = r.lines;
  const best = ls.length ? val(ls[0]) : 0, bestMove = ls.length ? pos.parseMove(ls[0].pv[0]) : 0;
  const out = { best, bestSan: bestMove ? pos.san(bestMove) : '?', second: ls.length > 1 ? val(ls[1]) : null, vals: {} };
  for (const s of sans) {
    const m = pos.parseMove(s);
    if (!m) { out.vals[s] = null; continue; }
    const hit = ls.find(l => l.pv[0] === C.uci(m));
    out.vals[s] = hit ? val(hit) : await valueAfter(pos, s, depth);
  }
  return out;
}

/* ---------- helpers ---------- */
const fmt = v => v == null ? '?' : v >= NEAR ? (v === MATE ? 'mate' : '#' + (MATE - v)) : v <= -NEAR ? (v === -MATE ? 'mated' : '#-' + (MATE + v)) : (v >= 0 ? '+' : '') + (v / 100).toFixed(2);
const label = (ply, san) => (ply % 2 === 0 ? (ply / 2 + 1) + '.' : ((ply + 1) / 2) + '...') + san;
const splitSan = s => String(s || '').trim().split(/\s+/).filter(Boolean);
const bare = s => s.replace(/[+#]+$/, '');
const PV = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
function material(pos) {
  let v = 0;
  for (const ch of pos.fen().split(' ')[0]) if (PV[ch.toLowerCase()] != null) v += ch === ch.toUpperCase() ? PV[ch.toLowerCase()] : -PV[ch];
  return v;
}
// play `sans` from `pos` (not changed); returns the new position or the first illegal move
function play(pos, sans) {
  const p = pos.clone();
  for (const s of sans) { const m = p.parseMove(s); if (!m) return { bad: s }; p.make(m); }
  return { pos: p };
}
function legalSans(pos) { return pos.legalMoves().map(m => pos.san(m)).sort(); }

/* ---------- prose ---------- */
const SAN_RE = /^(?:O-O-O|O-O|[KQRBN][a-h]?[1-8]?x?[a-h][1-8]|[a-h](?:x[a-h])?[1-8](?:=[QRBN])?)[+#]?$/;
// numbered moves written in the prose, grouped into the sequences they form ("5.Qxe4 d6 6.d4", "If 8.Rxg1, then ...Bg4+")
function proseSequences(text) {
  const seqs = [];
  let cur = null;
  for (const raw of String(text).split(/\s+/)) {
    const w = raw.replace(/^[(“"*]+/, ''), bare = w.replace(/[?!]+(?=[,.;:)”"*]*$)/, ''), core = bare.replace(/[,.;:)”"*]+$/, ''), ends = core !== bare;
    const num = /^(\d+)\.(\.\.)?(.+)$/.exec(core), dots = /^\.\.\.(.+)$/.exec(core);
    if (num && SAN_RE.test(num[3])) {
      const ply = 2 * (+num[1] - 1) + (num[2] ? 1 : 0);
      if (cur && ply === cur.ply + cur.sans.length) cur.sans.push(num[3]);
      else { cur = { ply, sans: [num[3]], prev: seqs[seqs.length - 1] || null }; seqs.push(cur); }
    } else if (cur && SAN_RE.test(core) && (cur.ply + cur.sans.length) % 2 === 1) cur.sans.push(core); // 5.Qxe4 d6
    else if (dots && SAN_RE.test(dots[1]) && seqs.length) { // ...Bg4+ answering the last white move written
      const last = seqs[seqs.length - 1], ply = last.ply + last.sans.length;
      if (ply % 2 === 1) { cur = { ply, sans: [dots[1]], prev: last, soft: true }; seqs.push(cur); } else cur = null;
    } else cur = null;
    if (ends) cur = null;
  }
  return seqs;
}

/* ---------- one trap ---------- */
async function verifyTrap(t, meta) {
  const errors = [], warns = [], info = [];
  const err = m => errors.push(m), warn = m => warns.push(m);
  const res = { id: t.id, errors, warns, info, row: { id: t.id, setter: t.setter, key: t.key } };
  for (const f of ['id', 'name', 'side', 'setter', 'summary', 'moves', 'lesson', 'safe', 'safeNote']) if (!t[f]) err('missing ' + f);
  if (!/^[wb]$/.test(t.side || '')) err('side must be w or b');
  if (!/^[wb]$/.test(t.setter || '')) err('setter must be w or b');
  if (!Number.isInteger(t.key)) err('key must be a ply number');
  if ((t.bait == null) !== (t.punish == null)) err('bait and punish go together');
  if (t.punish != null && (!Array.isArray(t.punish) || !t.punish.length)) err('punish must be a list of SAN');
  if (errors.length) return res;
  const setterNum = t.setter === 'w' ? 1 : -1, victim = t.setter === 'w' ? 'b' : 'w';
  const sans = splitSan(t.moves);

  // 1. legal, standard SAN; positions along the line
  const at = [new C.Pos()];
  for (let i = 0; i < sans.length; i++) {
    const p = at[i].clone(), m = p.parseMove(sans[i]);
    if (!m) { err('move ' + label(i, sans[i]) + ' is illegal'); return res; }
    const std = p.san(m);
    if (std !== sans[i]) err('write ' + label(i, std) + ', not ' + sans[i]);
    p.make(m); at.push(p);
  }
  if (t.key < 0 || t.key >= sans.length) { err('key ' + t.key + ' is outside the line'); return res; }
  const kp = at[t.key];
  if ((kp.side === 1 ? 'w' : 'b') !== victim) err('at key ' + t.key + ' it is the setter’s move, not the victim’s');
  if (!t.noSet && ((sans.length - 1) % 2 === 0 ? 'w' : 'b') !== t.setter) err('the line ends on the victim’s move');
  if (t.noSet && !t.bait) warn('noSet trap without a bait');
  if (t.keyPly != null && t.keyPly !== t.key) err('keyPly ' + t.keyPly + ' and key ' + t.key + ' disagree');
  for (const k of Object.keys(t.notes || {})) if (!/^\d+$/.test(k) || +k >= sans.length) err('note key ' + k + ' is not a ply of the line');
  const baitSan = t.bait || sans[t.key];
  const checkSan = (pos, s, what) => {
    const m = pos.parseMove(s);
    if (!m) { err(what + ' ' + s + ' is illegal at ply ' + t.key); return false; }
    if (pos.san(m) !== s) err('write the ' + what + ' as ' + pos.san(m) + ', not ' + s);
    return true;
  };
  const okBait = checkSan(kp, baitSan, 'bait'), okSafe = checkSan(kp, t.safe, 'safe');
  if (okBait && okSafe && kp.parseMove(baitSan) === kp.parseMove(t.safe)) err('safe is the bait');
  let end = at[sans.length], baitAt = null;
  if (t.bait && okBait) {
    baitAt = [kp.clone()];
    for (const s of [t.bait].concat(t.punish)) {
      const p = baitAt[baitAt.length - 1].clone(), m = p.parseMove(s);
      if (!m) { err('punish move ' + s + ' is illegal'); baitAt = null; break; }
      if (p.san(m) !== s) err('write ' + p.san(m) + ', not ' + s + ' in punish');
      p.make(m); baitAt.push(p);
    }
    if (baitAt) end = baitAt[baitAt.length - 1];
    if (sans[t.key] === t.bait) err('bait is given but the line plays it; leave bait and punish out');
  }
  if (!okBait || !okSafe) return res;
  res.row.bait = label(t.key, baitSan); res.row.safe = label(t.key, t.safe);

  // 2 and 3. the bait against the safe move and the engine's best, for the victim
  const keyCheck = async depth => {
    const c = await compare(kp, [baitSan, t.safe], depth);
    const b = c.vals[baitSan], s = c.vals[t.safe];
    return { depth, c, b, s, baitOk: b <= -NEAR || s - b >= BAIT_COST, safeOk: c.best - s <= SAFE_GAP };
  };
  let kc = await keyCheck(DEPTH);
  if (!kc.baitOk || !kc.safeOk) { const deep = await keyCheck(DEEPER); if (deep.baitOk && deep.safeOk) { info.push('bait/safe checks needed depth ' + DEEPER); kc = deep; } }
  Object.assign(res.row, { baitV: -kc.b, safeV: -kc.s, best: label(t.key, kc.c.bestSan), bestV: -kc.c.best });
  if (!kc.baitOk) err('bait ' + label(t.key, baitSan) + ' costs only ' + ((kc.s - kc.b) / 100).toFixed(2) + ' against ' + t.safe + ' (needs ' + (BAIT_COST / 100).toFixed(1) + ' or a forced mate)');
  if (!kc.safeOk) err('safe ' + label(t.key, t.safe) + ' is ' + ((kc.c.best - kc.s) / 100).toFixed(2) + ' worse than the best move ' + kc.c.bestSan);

  // 4. how the line ends
  const st = end.status();
  if (st.over) {
    res.row.finalV = st.reason === 'checkmate' ? (st.winner === setterNum ? MATE : -MATE) : 0;
    if (!(st.reason === 'checkmate' && st.winner === setterNum)) err('the line ends in ' + st.reason + ' without the setter winning');
  } else {
    const forSetter = async depth => { const v = await value(end, depth); return end.side === setterNum ? v : -v; };
    let fv = await forSetter(DEPTH);
    if (fv < FINAL_EDGE) { const d = await forSetter(DEEPER); if (d >= FINAL_EDGE) info.push('final check needed depth ' + DEEPER); fv = d; }
    res.row.finalV = fv;
    if (fv < FINAL_EDGE) err('the line ends with the setter only ' + fmt(fv) + ' (needs +2.00 or mate)');
  }

  // 5a. prose: style, the key note, and the numbered moves it mentions
  const fields = Object.keys(t.notes || {}).map(k => ['note ' + k, t.notes[k]]).concat([['summary', t.summary], ['lesson', t.lesson], ['safeNote', t.safeNote]]);
  for (const [where, text] of fields) {
    const s = String(text);
    if (/'/.test(s)) err(where + ': use typographic apostrophes (’)');
    if (/—/.test(s)) err(where + ': no em dashes');
    if ((s.match(/\*\*/g) || []).length > 2) warn(where + ': more than one bold term');
    if (s.split(/\s+/).length > 50) warn(where + ': long (' + s.split(/\s+/).length + ' words)');
    for (const q of proseSequences(s)) {
      const tries = [];
      if (q.prev && q.prev.end && q.prev.ply + q.prev.sans.length === q.ply) tries.push(q.prev.end);
      if (!q.soft && q.ply <= sans.length) tries.push(at[q.ply]);
      if (!q.soft && baitAt && q.ply >= t.key && q.ply - t.key < baitAt.length) tries.push(baitAt[q.ply - t.key]);
      const hit = tries.map(p => play(p, q.sans)).find(r => r.pos);
      const shown = label(q.ply, q.sans[0]) + (q.sans.length > 1 ? ' ' + q.sans.slice(1).join(' ') : '');
      if (hit) q.end = hit.pos;
      else if (tries.length) err(where + ': "' + shown + '" is not legal there (check the move number)');
      else warn(where + ': "' + shown + '" is past the end of the line, not checked');
    }
  }
  const keyNote = (t.notes || {})[t.key];
  if (!keyNote) err('no note on the key move');
  else if (t.bait) { if (keyNote.indexOf(bare(t.bait)) < 0) err('the key note should name the bait ' + t.bait); }
  else {
    if (!/mistake/i.test(keyNote)) err('the note on the bait should say it is the mistake');
    if (keyNote.indexOf(bare(t.safe)) < 0) err('the note on the bait should name the safe move ' + t.safe);
  }
  if (String(t.safeNote).indexOf(bare(t.safe)) < 0) err('safeNote should name ' + t.safe);
  if (meta) {
    if (!meta[t.id]) err('no entry in build/traps_meta.json');
    else if (meta[t.id].trapper !== t.setter || meta[t.id].keyPly !== (t.side === t.setter ? null : t.key)) warn('build/traps_meta.json has ' + JSON.stringify(meta[t.id]) + ' (older meaning, left as is)');
  }

  // 5b. claims
  const claims = CLAIMS[t.id] || [];
  let held = 0;
  for (const c of claims) {
    const base = c.line != null ? play(new C.Pos(), splitSan(c.line)) : c.at <= sans.length ? play(at[c.at], splitSan(c.then)) : { bad: 'at ' + c.at };
    if (!base.pos) { err('claim "' + c.says + '": ' + base.bad + ' is illegal'); continue; }
    const p = base.pos, fails = [];
    if (c.only) { const l = legalSans(p); if (l.length !== 1 || l[0] !== c.only) fails.push('legal moves are ' + l.join(' ')); }
    if (c.moves) { const l = legalSans(p), w = c.moves.slice().sort(); if (l.join(' ') !== w.join(' ')) fails.push('legal moves are ' + l.join(' ')); }
    if (c.mate && p.status().reason !== 'checkmate') fails.push('not checkmate');
    if (c.material != null && material(p) !== c.material) fails.push('material is ' + material(p));
    const engineCheck = async depth => {
      const f = [];
      if (c.mates) { const v = await value(p, depth), forSide = (p.side === 1) === (c.mates === 'w') ? v : -v; if (forSide < NEAR) f.push('no forced mate (' + fmt(forSide) + ')'); else if (c.in && MATE - forSide > c.in) f.push('mate takes ' + (MATE - forSide) + ' moves'); }
      if (c.edge) {
        const v = await value(p, depth), forSide = (p.side === 1) === (c.edge.side === 'w') ? v : -v;
        if ((c.edge.min != null && forSide < c.edge.min) || (c.edge.max != null && forSide > c.edge.max)) f.push('eval for ' + c.edge.side + ' is ' + fmt(forSide));
      }
      if (c.good || c.worse || c.best) {
        const list = (c.good || []).concat(c.worse ? [c.worse.san] : []);
        const cmp = await compare(p, list, depth);
        for (const s of c.good || []) if (cmp.vals[s] == null || cmp.best - cmp.vals[s] > (c.within || GOOD)) f.push(s + ' is ' + (cmp.vals[s] == null ? 'illegal' : ((cmp.best - cmp.vals[s]) / 100).toFixed(2) + ' below ' + cmp.bestSan));
        if (c.worse) {
          const v = cmp.vals[c.worse.san], gap = v == null ? null : cmp.best - v;
          if (gap == null || gap < c.worse.min || (c.worse.max != null && gap > c.worse.max)) f.push(c.worse.san + ' is ' + (gap == null ? 'illegal' : (gap / 100).toFixed(2)) + ' below ' + cmp.bestSan);
        }
        if (c.best) {
          if (cmp.bestSan !== c.best) f.push('best is ' + cmp.bestSan);
          else if (cmp.second != null && cmp.best - cmp.second < (c.by || 0)) f.push('next best is only ' + ((cmp.best - cmp.second) / 100).toFixed(2) + ' worse');
        }
      }
      return f;
    };
    if (c.mates || c.edge || c.good || c.worse || c.best) {
      let f = await engineCheck(DEPTH);
      if (f.length) { const g = await engineCheck(DEEPER); if (!g.length) info.push('claim "' + c.says + '" needed depth ' + DEEPER); f = g; }
      fails.push(...f);
    }
    if (fails.length) err('claim "' + c.says + '": ' + fails.join('; '));
    else held++;
  }
  res.row.claims = held + '/' + claims.length;
  return res;
}

/* ---------- report ---------- */
const pad = (s, n) => { s = String(s == null ? '' : s); return s.length >= n ? s + ' ' : s + ' '.repeat(n - s.length); };
(async () => {
  let meta = null;
  try { meta = JSON.parse(fs.readFileSync(path.join(__dirname, '../build/traps_meta.json'), 'utf8')); } catch (e) { console.log('WARN  build/traps_meta.json not readable'); }
  const traps = (data.traps || []).filter(t => !ONLY || ONLY.indexOf(t.id) >= 0);
  const ids = new Set();
  console.log('Traps: ' + traps.length + ', engine ' + (process.env.SF_BIN ? path.basename(process.env.SF_BIN) : 'embedded Stockfish 19') + ', depth ' + DEPTH + ' (failures rechecked at ' + DEEPER + ')');
  console.log('Evals are for the setter: + is good for the side that sets the trap.\n');
  const rows = [];
  let errors = 0, warns = 0;
  for (const t of traps) {
    const t0 = Date.now();
    const r = await verifyTrap(t, meta);
    if (ids.has(t.id)) r.errors.push('duplicate id'); ids.add(t.id);
    const R = r.row;
    console.log('trap ' + t.id + ' (' + (t.setter === 'w' ? 'White' : 'Black') + ' sets it, key ply ' + t.key + ')  ' + ((Date.now() - t0) / 1000).toFixed(0) + 's');
    console.log('  ' + pad('bait', 10) + pad(R.bait, 12) + fmt(R.baitV));
    console.log('  ' + pad('safe', 10) + pad(R.safe, 12) + fmt(R.safeV) + '   engine best ' + (R.best || '?') + ' ' + fmt(R.bestV));
    console.log('  ' + pad('final', 10) + pad('', 12) + fmt(R.finalV));
    console.log('  ' + pad('claims', 10) + (R.claims || '-'));
    for (const m of r.info) console.log('  note  ' + m);
    for (const m of r.warns) console.log('  WARN  ' + m);
    for (const m of r.errors) console.log('  ERROR ' + m);
    console.log('  ' + (r.errors.length ? 'FAIL' : 'ok') + '\n');
    errors += r.errors.length; warns += r.warns.length;
    rows.push([t.id, t.setter, t.key, R.bait, R.safe, fmt(R.baitV), fmt(R.safeV), fmt(R.bestV), fmt(R.finalV), R.claims || '-', r.errors.length ? 'FAIL' : 'ok']);
  }
  const head = ['trap', 'setter', 'key', 'bait', 'safe', 'bait', 'safe', 'best', 'final', 'claims', 'result'];
  const widths = head.map((h, i) => Math.max(h.length, ...rows.map(r => String(r[i] == null ? '' : r[i]).length)) + 1);
  console.log(head.map((h, i) => pad(h, widths[i])).join(''));
  for (const r of rows) console.log(r.map((c, i) => pad(c, widths[i])).join(''));
  console.log('\n' + errors + ' errors, ' + warns + ' warnings');
  eng.quit();
  process.exit(errors ? 1 : 0);
})();
