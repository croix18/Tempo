// node tests/verify_lessons.js content/lessons/uN-x.js [more files]
const path = require('path');
const C = require('../src/core.js');
const SF = require('./sfnode.js');
const files = process.argv.slice(2);
if (!files.length) { console.log('usage: node tests/verify_lessons.js <unit.js> ...'); process.exit(2); }
const eng = SF.create();
const SQ = /^[a-h][1-8]$/, MV = /^[a-h][1-8][a-h][1-8][qrbn]?$/;
let errors = 0, warns = 0;
const seenIds = new Set();
const err = (where, msg) => { errors++; console.log('ERROR ' + where + ': ' + msg); };
const warn = (where, msg) => { warns++; console.log('WARN  ' + where + ': ' + msg); };
const val = l => l.mate != null ? (l.mate > 0 ? 100000 - l.mate : -100000 - l.mate) : l.cp;
const fmt = l => l.mate != null ? ('mate ' + l.mate) : ((l.cp >= 0 ? '+' : '') + (l.cp / 100).toFixed(2));
const words = s => String(s || '').trim().split(/\s+/).filter(Boolean).length;

function posOf(fen, where) {
  const e = C.Pos.fenError(fen);
  if (e) { err(where, 'bad FEN (' + e + '): ' + fen); return null; }
  let p;
  try { p = new C.Pos(fen); } catch (x) { err(where, 'bad FEN: ' + x.message); return null; }
  // side not to move must not be in check
  p.side = -p.side; const illegal = p.inCheck(); p.side = -p.side;
  if (illegal) { err(where, 'illegal position: the side NOT to move is in check'); return null; }
  return p;
}
function san(p, u) { const m = p.parseMove(u); return m ? p.san(m) : u; }
function playUci(p, u, where) {
  const m = p.parseMove(u);
  if (!m || C.uci(m) !== u) { err(where, 'illegal or malformed move ' + u + ' in ' + p.fen()); return false; }
  p.make(m); return true;
}

async function evalAfter(p, u, depth) {
  const m = p.parseMove(u); p.make(m);
  let res;
  const st = p.status();
  if (st.over) res = st.reason === 'checkmate' ? { mate: 0 } : { cp: 0 };
  else { const a = await eng.analyse(p.fen(), { depth }); const l = a.lines[0] || { cp: 0 }; res = l; }
  p.unmake();
  // convert to the mover's view
  if (res.mate === 0) return 100000; // the move mates
  return -val(res);
}

async function checkMove(step, where) {
  const p = posOf(step.fen, where); if (!p) return;
  const line = step.line;
  if (!Array.isArray(line) || !line.length) { err(where, 'move step needs a non-empty line'); return; }
  if (line.length % 2 === 0) err(where, 'line must end on a learner move (odd length)');
  if (step.accept && (!Array.isArray(step.accept) || step.accept.length > line.length)) err(where, 'accept must be an array no longer than line');
  if (!step.hint) warn(where, 'missing hint');
  if (!step.done) warn(where, 'missing done text');
  for (let k = 0; k < line.length; k++) {
    const u = line[k], w = where + ' ply ' + k + ' (' + u + ')';
    if (!MV.test(u)) { err(w, 'not a UCI move'); return; }
    if (k % 2 === 0) {
      const extra = (step.accept && step.accept[k]) || [];
      for (const x of extra) { const q = p.parseMove(x); if (!q || C.uci(q) !== x) err(w, 'accept move ' + x + ' is illegal'); }
      const isFinal = k === line.length - 1;
      const a = await eng.analyse(p.fen(), { depth: 14, multipv: 3 });
      const best = a.lines[0];
      if (!best) { err(w, 'no engine output'); return; }
      for (const x of extra) {
        if (!p.parseMove(x)) continue;
        const inList = a.lines.find(l => l.pv[0] === x);
        const xv = inList ? val(inList) : await evalAfter(p, x, 13);
        if (val(best) - xv > 80 && !(isFinal && step.mate && xv >= 99000)) err(w, 'accepted move ' + san(p, x) + ' is not good (' + (xv / 100).toFixed(2) + ' vs best ' + fmt(best) + ')');
      }
      const played = a.lines.find(l => l.pv[0] === u);
      const playedVal = played ? val(played) : await evalAfter(p, u, 13);
      if (val(best) - playedVal > 60 && !(isFinal && step.mate && playedVal >= 99000)) {
        err(w, 'learner move ' + san(p, u) + ' is not good: best is ' + san(p, best.pv[0]) + ' (' + fmt(best) + ')');
      }
      for (const l of a.lines) {
        const mv = l.pv[0];
        if (mv === u || extra.includes(mv)) continue;
        const close = val(l) >= Math.min(val(best), playedVal) - 50;
        if (!close) continue;
        if (isFinal && step.mate && l.mate === 1) continue; // any mate accepted
        if (val(l) >= 99000 && playedVal >= 99000 && l.mate > 1 && !isFinal) { warn(w, 'alternative mating line ' + san(p, mv) + ' (' + fmt(l) + ') also works'); continue; }
        warn(w, 'another learner move is about as good: ' + san(p, mv) + ' ' + mv + ' (' + fmt(l) + ' vs played ' + (played ? fmt(played) : playedVal) + ')');
      }
      if (!playUci(p, u, w)) return;
      if (isFinal && step.mate && p.status().reason !== 'checkmate') err(w, 'mate:true but the final move is not checkmate');
    } else {
      const a = await eng.analyse(p.fen(), { depth: 12 });
      const best = a.lines[0];
      if (best && best.pv[0] !== u) {
        const rv = await evalAfter(p, u, 12);
        if (val(best) - rv > 80) warn(w, 'computer reply ' + san(p, u) + ' is not the best defense; best is ' + san(p, best.pv[0]) + ' (' + fmt(best) + ')');
      }
      if (!playUci(p, u, w)) return;
    }
    if (p.status().over && k < line.length - 1) { err(w, 'game is over before the line ends'); return; }
  }
}

/* SAN moves (a string or a list) from a position; returns the positions before each move, or null after an error */
function sanList(x) { return Array.isArray(x) ? x.slice() : String(x || '').trim().split(/\s+/).filter(Boolean); }
function playSans(p0, list, where) {
  const p = p0.clone(), seen = [];
  for (let k = 0; k < list.length; k++) {
    seen.push(p.clone());
    const m = p.parseMove(list[k]);
    if (!m) { err(where + ' move ' + (k + 1) + ' (' + list[k] + ')', 'illegal or unreadable SAN in ' + p.fen()); return null; }
    p.make(m);
  }
  seen.push(p.clone());
  return seen;
}
/* how much worse a move is than the engine's best, in centipawns, for the side that plays it */
async function loss(p, mv, depth) {
  const a = await eng.analyse(p.fen(), { depth, multipv: 3 });
  const best = a.lines[0]; if (!best) return { loss: 0, best: null };
  const m = p.parseMove(mv); const u = C.uci(m);
  const inList = a.lines.find(l => l.pv[0] === u);
  const v = inList ? val(inList) : await evalAfter(p, u, depth - 1);
  return { loss: Math.max(0, val(best) - v), best, v };
}
const sanOf = (p, mv) => { const m = p.parseMove(mv); return m ? p.san(m) : mv; };
async function checkLine(step, where, kind) {
  const p0 = step.fen ? posOf(step.fen, where) : new C.Pos(); if (!p0) return;
  const moves = sanList(step.moves);
  if (!moves.length) { err(where, kind + ' needs moves'); return; }
  const seen = playSans(p0, moves, where); if (!seen) return;
  if (kind === 'walk') {
    if (!['w', 'b'].includes(step.orient)) err(where, 'walk needs orient w or b');
    for (const k of Object.keys(step.notes || {})) {
      if (!(+k >= 0 && +k < moves.length)) err(where, 'note key ' + k + ' is not a ply of the line');
      if (words(step.notes[k]) > 60) err(where, 'note ' + k + ' too long (' + words(step.notes[k]) + ' words)');
      else if (words(step.notes[k]) > 45) warn(where, 'note ' + k + ' is long');
    }
    return;
  }
  if (!['w', 'b'].includes(step.side)) { err(where, kind + ' needs side w or b'); return; }
  const you = step.side === 'w' ? 1 : -1;
  for (let k = 0; k < moves.length; k++) {
    const p = seen[k];
    const r = await loss(p, moves[k], 14);
    const w = where + ' move ' + (k + 1) + ' (' + moves[k] + ')';
    if (p.side === you) {
      if (r.loss > 100) err(w, 'the learner is taught a mistake: best is ' + sanOf(p, r.best.pv[0]) + ' (' + fmt(r.best) + '), this loses ' + (r.loss / 100).toFixed(2));
      else if (r.loss > 40) warn(w, 'the learner is taught an inaccuracy (' + (r.loss / 100).toFixed(2) + ' worse than ' + sanOf(p, r.best.pv[0]) + ')');
    } else if (r.loss > 150) warn(w, 'the opponent’s move is a blunder (' + (r.loss / 100).toFixed(2) + ' worse than ' + sanOf(p, r.best.pv[0]) + '): fine only if the lesson is about punishing it');
  }
}
async function checkSafe(step, where) {
  const p0 = step.fen ? posOf(step.fen, where) : new C.Pos(); if (!p0) return;
  const seen = playSans(p0, sanList(step.moves), where); if (!seen) return;
  const p = seen[seen.length - 1];
  if (!['w', 'b'].includes(step.side) || (p.side === 1 ? 'w' : 'b') !== step.side) { err(where, 'safe side must be the side to move after the moves'); return; }
  for (const a of [].concat(step.aim || [])) {
    if (!p.parseMove(a)) { err(where, 'aim move ' + a + ' is illegal'); continue; }
    const r = await loss(p, a, 16);
    if (r.loss > 100) err(where, 'aim move ' + a + ' is not good: best is ' + sanOf(p, r.best.pv[0]) + ' (' + fmt(r.best) + ')');
    else if (r.loss > 40) warn(where, 'aim move ' + a + ' is ' + (r.loss / 100).toFixed(2) + ' worse than ' + sanOf(p, r.best.pv[0]));
  }
  if (step.bait) {
    if (!p.parseMove(step.bait)) { err(where, 'bait ' + step.bait + ' is illegal'); return; }
    const r = await loss(p, step.bait, 16);
    if (r.loss < 150) warn(where, 'bait ' + step.bait + ' only loses ' + (r.loss / 100).toFixed(2));
    const after = p.clone(); after.make(after.parseMove(step.bait));
    playSans(after, sanList(step.punish), where + ' punish');
  }
}
async function checkGame(step, where) {
  if (!['w', 'b'].includes(step.side)) { err(where, 'game needs side w or b'); return; }
  if (!(step.until > 0)) err(where, 'game needs until (a full-move number)');
  const lines = (step.lines || []).map(sanList);
  if (!lines.length) { err(where, 'game needs lines'); return; }
  const you = step.side === 'w' ? 1 : -1, theirs = {};
  const norm = x => x.replace(/[+#!?]/g, '');
  for (let i = 0; i < lines.length; i++) {
    const seen = playSans(new C.Pos(), lines[i], where + ' line ' + (i + 1)); if (!seen) continue;
    for (let k = 0; k < lines[i].length; k++) {
      if (seen[k].side !== you) continue;
      const key = lines[i].slice(0, k).map(norm).join(' ');
      const mv = norm(lines[i][k]);
      if (theirs[key] && theirs[key] !== mv) warn(where, 'the lines disagree on your move after "' + key + '": ' + theirs[key] + ' or ' + mv);
      theirs[key] = theirs[key] || mv;
    }
  }
  await checkLine({ moves: lines[0], side: step.side }, where + ' line 1', 'line');
}

async function checkPlay(step, where) {
  const p = posOf(step.fen, where); if (!p) return;
  const goals = ['mate', 'promote', 'draw', 'win'];
  if (!goals.includes(step.goal)) { err(where, 'play.goal must be one of ' + goals.join(', ')); return; }
  const a = await eng.analyse(p.fen(), { depth: 18 });
  const l = a.lines[0];
  if (!l) { err(where, 'no engine output'); return; }
  if (step.goal === 'mate') {
    if (!(l.mate > 0) && !(l.cp > 600)) err(where, 'goal mate but engine sees ' + fmt(l));
    if (!step.limit) err(where, 'goal mate needs a limit (learner moves)');
    if (l.mate > 0 && step.limit && step.limit < l.mate + 3) warn(where, 'limit ' + step.limit + ' is tight: perfect play needs ' + l.mate);
  } else if (step.goal === 'win' || step.goal === 'promote') {
    if (!(l.mate > 0) && !(l.cp > 250)) err(where, 'goal ' + step.goal + ' but engine sees ' + fmt(l));
  } else if (step.goal === 'draw') {
    if (l.mate != null || Math.abs(l.cp) > 120) err(where, 'goal draw but engine sees ' + fmt(l));
    if (!step.limit) warn(where, 'draw goal without limit: will run until the game ends');
  }
}

(async () => {
  for (const f of files) {
    let unit;
    try { unit = require(path.resolve(f)); } catch (e) { err(f, 'cannot load: ' + e.message); continue; }
    const u = unit;
    if (!u.id || !u.title || !u.summary || !Array.isArray(u.lessons)) err(f, 'unit needs id, title, summary, lessons[]');
    for (const les of u.lessons || []) {
      const lw = (u.id) + '/' + les.id;
      if (!les.id || !les.title || !les.summary || !Array.isArray(les.steps)) { err(lw, 'lesson needs id, title, summary, steps[]'); continue; }
      if (seenIds.has(les.id)) err(lw, 'duplicate lesson id'); seenIds.add(les.id);
      if (les.steps.length < 4) warn(lw, 'only ' + les.steps.length + ' steps');
      if (les.steps.length > 12) warn(lw, les.steps.length + ' steps is long');
      let practice = 0;
      for (let i = 0; i < les.steps.length; i++) {
        const s = les.steps[i], w = lw + ' step ' + (i + 1) + ' [' + s.t + ']';
        if (s.trap) {   // a trap lesson's steps are filled in from the trap (tests/verify_traps.js checks those)
          const traps = (require('../content/openings.js').traps || []);
          if (!traps.some(t => t.id === s.trap)) err(w, 'no trap with id ' + s.trap);
          if (['line', 'safe', 'game'].includes(s.t)) practice++;
          continue;
        }
        if (!s.text) err(w, 'missing text');
        if (words(s.text) > 60) err(w, 'text too long (' + words(s.text) + ' words)');
        else if (words(s.text) > 45) warn(w, 'text is long (' + words(s.text) + ' words)');
        if (/[—]/.test(s.text || '')) warn(w, 'em dash in text');
        if (s.orient && !['w', 'b'].includes(s.orient)) err(w, 'orient must be w or b');
        for (const a of s.arrows || []) if (!MV.test(a)) err(w, 'bad arrow ' + a);
        for (const m of s.marks || []) if (!SQ.test(m)) err(w, 'bad mark ' + m);
        if (s.t === 'read') {
          const p = s.fen ? posOf(s.fen, w) : new C.Pos(); if (!p) continue;   // no fen: the starting position
          for (const mv of s.play || []) if (!playUci(p, mv, w + ' play')) break;
        } else if (s.t === 'move') { practice++; await checkMove(s, w); }
        else if (s.t === 'pick') {
          practice++;
          if (!s.fen) { err(w, 'pick needs fen'); continue; }
          posOf(s.fen, w);
          if (!Array.isArray(s.squares) || !s.squares.length) err(w, 'pick needs squares');
          for (const q of s.squares || []) if (!SQ.test(q)) err(w, 'bad square ' + q);
          if (new Set(s.squares).size !== (s.squares || []).length) err(w, 'duplicate squares');
          if (!s.done) warn(w, 'missing done text');
        } else if (s.t === 'quiz') {
          if (s.fen) posOf(s.fen, w);
          if (!Array.isArray(s.choices) || s.choices.length < 2 || s.choices.length > 4) err(w, 'quiz needs 2–4 choices');
          if (!(s.answer >= 0 && s.answer < (s.choices || []).length)) err(w, 'quiz answer index out of range');
          if (!s.done) warn(w, 'missing done text');
        } else if (s.t === 'play') { practice++; await checkPlay(s, w); }
        else if (s.t === 'walk') await checkLine(s, w, 'walk');
        else if (s.t === 'line') { practice++; await checkLine(s, w, 'line'); if (!s.done) warn(w, 'missing done text'); }
        else if (s.t === 'safe') { practice++; await checkSafe(s, w); if (!s.note) warn(w, 'missing note'); }
        else if (s.t === 'game') { practice++; await checkGame(s, w); }
        else err(w, 'unknown step type ' + s.t);
      }
      if (practice < 2) warn(lw, 'fewer than 2 practice steps');
    }
    console.log('checked ' + f);
  }
  console.log('\n' + errors + ' errors, ' + warns + ' warnings');
  eng.quit();
  process.exit(errors ? 1 : 0);
})();
