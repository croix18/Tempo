/* Tempo board: rendering, drag and click moves, arrows, marks, promotion. */
var Board = (function () {
  'use strict';
  var C = TempoCore, h = U.h;
  var CODES = ' pnbrqk';
  var KEY_LABEL = 'Chess board. Use the arrow keys to move between squares and Enter to pick up or put down a piece.';
  // how the last thing on the page was reached, so the board can tell a click from a Tab
  var lastInput = 'key';
  document.addEventListener('keydown', function () { lastInput = 'key'; }, true);
  document.addEventListener('pointerdown', function () { lastInput = 'pointer'; }, true);

  function Board(opts) {
    this.opts = opts || {};
    this.orient = this.opts.orient || 'w';
    this.pos = null; this.legal = []; this.pieces = {};
    this.sel = -1; this.drag = null; this.last = null;
    this.marks = []; this.arrows = []; this.picked = []; this.badge = null; this.hover = -1;
    this.movable = this.opts.movable || null; // 'w' | 'b' | 'both' | null
    var self = this;
    this.el = h('div', { class: 'board', role: 'application', tabindex: '0', 'aria-roledescription': 'chess board', 'aria-label': KEY_LABEL },
      this.sqLayer = h('div', { class: 'b-sq' }),
      this.coordLayer = h('div', { class: 'b-coords', 'aria-hidden': 'true' }),
      this.hlLayer = h('div', { class: 'b-hl' }),
      this.pcLayer = h('div', { class: 'b-pcs' }),
      this.arrowLayer = document.createElementNS('http://www.w3.org/2000/svg', 'svg'),
      this.overLayer = h('div', { class: 'b-over' })
    );
    this.arrowLayer.setAttribute('class', 'b-arrows');
    if (!this.movable) this.el.setAttribute('aria-label', 'Chess board');
    this.el.__board = this;
    for (var r = 0; r < 8; r++) for (var f = 0; f < 8; f++) {
      if ((r + f) % 2) this.sqLayer.appendChild(h('div', { class: 'dk', style: { left: (f * 12.5) + '%', top: (r * 12.5) + '%' } }));
    }
    this.arrowLayer.setAttribute('viewBox', '0 0 800 800');
    this.el.addEventListener('pointerdown', function (e) { self.down(e); });
    this.el.addEventListener('pointermove', function (e) { self.move(e); });
    this.el.addEventListener('pointerup', function (e) { self.up(e); });
    this.el.addEventListener('pointercancel', function () { self.cancelDrag(); });
    this.el.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    // keyboard: arrows move a cursor, Enter or Space acts like a tap on that square
    this.live = h('div', { class: 'sr-only', 'aria-live': 'polite' });
    this.el.appendChild(this.live);
    this.cursor = -1; this.kbd = false; this.viaPointer = false;
    this.el.addEventListener('keydown', function (e) { self.key(e); });
    this.el.addEventListener('focus', function () { self.viaPointer = lastInput === 'pointer'; });
    this.el.addEventListener('pointerdown', function () { self.viaPointer = true; if (self.kbd) { self.kbd = false; self.paint(); } }, true);
    this.el.addEventListener('blur', function () { if (self.kbd) { self.kbd = false; self.paint(); } });
    this.drawCoords();
  }
  var B = Board.prototype;

  /* grid position of a 0x88 square for the current orientation */
  B.xy = function (sq) {
    var f = sq & 7, r = sq >> 4;
    return this.orient === 'w' ? { x: f, y: 7 - r } : { x: 7 - f, y: r };
  };
  B.sqAt = function (clientX, clientY) {
    var rc = this.el.getBoundingClientRect();
    var x = Math.floor((clientX - rc.left) / rc.width * 8), y = Math.floor((clientY - rc.top) / rc.height * 8);
    if (x < 0 || x > 7 || y < 0 || y > 7) return -1;
    return this.orient === 'w' ? ((7 - y) << 4) | x : (y << 4) | (7 - x);
  };
  B.place = function (el, sq) {
    var p = this.xy(sq);
    el.style.transform = 'translate(' + (p.x * 100) + '%,' + (p.y * 100) + '%)';
  };

  B.drawCoords = function () {
    U.clear(this.coordLayer);
    if (this.opts.coords === false) return;
    for (var i = 0; i < 8; i++) {
      var file = this.orient === 'w' ? i : 7 - i, rank = this.orient === 'w' ? 7 - i : i;
      // files along the bottom edge, ranks along the left edge
      var fsq = this.orient === 'w' ? file : (7 << 4) | file;
      var rsq = this.orient === 'w' ? (rank << 4) : (rank << 4) | 7;
      var fl = ((fsq >> 4) + (fsq & 7)) % 2 === 0, rl = ((rsq >> 4) + (rsq & 7)) % 2 === 0;
      this.coordLayer.appendChild(h('span', { class: 'cf ' + (fl ? 'on-dark' : 'on-light'), style: { left: (i * 12.5) + '%' } }, 'abcdefgh'.charAt(file)));
      this.coordLayer.appendChild(h('span', { class: 'cr ' + (rl ? 'on-dark' : 'on-light'), style: { top: (i * 12.5) + '%' } }, String(rank + 1)));
    }
  };
  B.setCoords = function (on) { this.opts.coords = on; this.drawCoords(); };
  B.setOrientation = function (o) {
    if (o === this.orient) return;
    if (this.promoCancel) this.promoCancel();
    this.orient = o;
    this.drawCoords();
    this.el.classList.remove('anim');
    for (var k in this.pieces) this.place(this.pieces[k], +k);
    this.paint();
    // turning the board around: a quick cross-fade instead of every piece jumping at once
    if (Board.animate && this.pcLayer.animate && !(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches)) {
      try { this.pcLayer.animate([{ opacity: 0.15 }, { opacity: 1 }], { duration: 200, easing: 'ease-out' }); } catch (e) { /* ignore */ }
    }
  };
  B.flip = function () { this.setOrientation(this.orient === 'w' ? 'b' : 'w'); };

  B.canMove = function () {
    if (!this.pos || !this.movable) return false;
    if (this.movable === 'both') return true;
    return (this.movable === 'w') === (this.pos.side === 1);
  };
  B.setMovable = function (m) {
    this.movable = m; this.legal = this.canMove() ? this.pos.legalMoves() : [];
    if (!this.canMove()) { this.kbd = false; this.select(-1); }
    this.el.setAttribute('aria-label', this.movable ? KEY_LABEL : 'Chess board');
  };

  /* Show a position. o: { last: move int or {from,to}, animate, natural, landed }
     natural: a move by the other side (a character, a puzzle's reply, the engine). Instead of the quick glide used for
     your own moves, the piece is lifted a little, carried at an easy pace (longer moves take a little longer) and set
     down; a piece it takes fades as it arrives. landed: called when the piece is down (at once when nothing glides),
     so the move's sound comes as the piece lands. Returns how long the glide takes, in ms (0 when there's none). */
  B.setPosition = function (pos, o) {
    o = o || {};
    // a glide still under way from the last move: its piece is put down now, and its sound plays now
    if (this.landT) { clearTimeout(this.landT); this.landT = null; var fn = this.landFn; this.landFn = null; if (fn) fn(); }
    (this.natEls || []).forEach(function (e) { e.style.transition = ''; });
    this.natEls = [];
    this.pos = pos;
    this.legal = this.canMove() ? pos.legalMoves() : [];
    this.sel = -1;
    if (o.last) this.last = typeof o.last === 'number' ? { from: o.last & 127, to: (o.last >> 7) & 127 } : o.last;
    else if (o.last === null || o.clearLast) this.last = null;
    var animate = o.animate !== false && Board.animate;
    this.el.classList.toggle('anim', !!animate);
    // desired pieces
    var want = {}, sq, code;
    for (sq = 0; sq < 120; sq++) {
      if (sq & 8) { sq += 7; continue; }
      var p = pos.b[sq];
      if (p) want[sq] = (p > 0 ? 'w' : 'b') + CODES.charAt(Math.abs(p));
    }
    var old = this.pieces, next = {}, freeOld = [], k;
    // a jump of more than a few moves would send pieces gliding along odd paths at once; changed squares cross-fade instead
    var glide = animate;
    if (animate) {
      var changed = 0;
      for (k in old) if (old[k].dataset.code !== want[k]) changed++;
      for (k in want) if (!old[k]) changed++;
      glide = changed <= 6;
    }
    // the natural pace: 0.3 s for a step to about 0.55 s across the board, easing in and out like a hand
    var dur = 0;
    if (glide && o.natural && this.last && !Board.calm()) {
      var dx = (this.last.from & 7) - (this.last.to & 7), dy = (this.last.from >> 4) - (this.last.to >> 4);
      dur = Math.round(Math.min(560, 260 + 42 * Math.sqrt(dx * dx + dy * dy)));
    }
    var self = this;
    for (k in old) {
      if (want[k] && old[k].dataset.code === want[k]) { next[k] = old[k]; delete want[k]; }
      else freeOld.push(+k);
    }
    // move unmatched old pieces to the nearest square that needs that piece
    for (k in want) {
      code = want[k]; sq = +k;
      var best = -1, bestD = 99;
      for (var i = 0; i < freeOld.length; i++) {
        var os = freeOld[i];
        if (os < 0 || old[os].dataset.code !== code) continue;
        var d = Math.abs((os & 7) - (sq & 7)) + Math.abs((os >> 4) - (sq >> 4));
        if (d < bestD) { bestD = d; best = i; }
      }
      if (best >= 0 && glide) {
        var el = old[freeOld[best]]; freeOld[best] = -1;
        if (dur) {
          el.style.transition = 'transform ' + dur + 'ms cubic-bezier(.45, .05, .25, 1)';
          this.natEls.push(el);
          // lifted, carried, set down
          try { el.animate([{ scale: 1, filter: 'none' }, { scale: 1.1, filter: 'drop-shadow(0 6px 5px rgba(0,0,0,0.22))', offset: 0.4 }, { scale: 1, filter: 'none' }], { duration: dur, easing: 'ease-in-out' }); } catch (e) { /* no lift */ }
        }
        this.place(el, sq); next[sq] = el;
      } else {
        var ne = h('div', { class: 'pc ' + code + (animate ? ' fade-in' : ''), dataset: { code: code } });
        this.place(ne, sq);
        this.pcLayer.appendChild(ne); next[sq] = ne;
        if (animate) { void ne.offsetWidth; ne.classList.remove('fade-in'); } // style it once hidden, then let it fade in
      }
    }
    freeOld.forEach(function (os) {
      if (os < 0) return;
      var gone = old[os];
      if (dur) {
        // a piece being taken waits for the piece taking it
        var at = Math.round(dur * 0.72);
        gone.style.transition = 'opacity 0.16s ease ' + at + 'ms';
        gone.classList.add('fade-out'); setTimeout(function () { gone.remove(); }, at + 200);
      } else if (animate) { gone.classList.add('fade-out'); setTimeout(function () { gone.remove(); }, 180); }
      else gone.remove();
    });
    this.pieces = next;
    this.paint();
    if (o.landed) {
      if (dur) { this.landFn = o.landed; this.landT = setTimeout(function () { self.landT = null; var f = self.landFn; self.landFn = null; if (f) f(); }, dur); }
      else o.landed();
    }
    // back to the usual glide once it's down (unless another natural move has started since)
    var mine = this.natEls;
    if (dur) setTimeout(function () { if (self.natEls === mine) mine.forEach(function (e) { e.style.transition = ''; }); }, dur + 60);
    return dur;
  };

  B.setArrows = function (list) { this.arrows = list || []; this.paintArrows(); };
  B.setMarks = function (list) { this.marks = list || []; this.paint(); };
  B.setPicked = function (list) { this.picked = list || []; this.paint(); };
  /* a badge in the corner of a square (or a list of them): { sq, kind, text } or { sq, kind, icon } */
  B.setBadge = function (b) { this.badge = b; this.paint(); };
  B.clearDecor = function () { this.arrows = []; this.marks = []; this.picked = []; this.badge = null; this.paint(); this.paintArrows(); };

  B.select = function (sq) { this.sel = sq; this.paint(); };
  B.targets = function (from) {
    var out = [];
    for (var i = 0; i < this.legal.length; i++) if ((this.legal[i] & 127) === from) out.push((this.legal[i] >> 7) & 127);
    return out;
  };

  /* A fence line along some sides of a square. `edges` names board directions (n, e, s, w);
     they are turned into screen sides for the way the board faces. */
  function fence(self, edges) {
    var flip = self.orient === 'b', line = [], halo = [];
    var off = { n: [0, 1], s: [0, -1], e: [-1, 0], w: [1, 0] };
    edges.split('').forEach(function (e) {
      var o = off[flip ? { n: 's', s: 'n', e: 'w', w: 'e' }[e] : e];
      if (!o) return;
      line.push('inset ' + o[0] * 3 + 'px ' + o[1] * 3 + 'px 0 0 var(--fence)');
      halo.push('inset ' + o[0] * 5 + 'px ' + o[1] * 5 + 'px 0 0 var(--fence-halo)');
    });
    return line.concat(halo).join(', ');
  }
  function sqDiv(self, sq, cls) {
    var d = h('div', { class: 'hl ' + cls });
    self.place(d, sq);
    return d;
  }
  B.paint = function () {
    var L = this.hlLayer, self = this;
    U.clear(L);
    if (!this.pos) return;
    if (this.last) { L.appendChild(sqDiv(this, this.last.from, 'last')); L.appendChild(sqDiv(this, this.last.to, 'last')); }
    if (this.pos.inCheck()) L.appendChild(sqDiv(this, this.pos.side === 1 ? this.pos.wk : this.pos.bk, 'check'));
    this.marks.forEach(function (m) {
      var sq = typeof m === 'string' ? C.sqIndex(m) : (typeof m.sq === 'string' ? C.sqIndex(m.sq) : m.sq);
      if (sq < 0) return;
      var d = sqDiv(self, sq, 'mark ' + (m.kind || 'gold'));
      if (m.edges) d.style.boxShadow = fence(self, m.edges);
      L.appendChild(d);
    });
    this.picked.forEach(function (s) {
      var sq = typeof s === 'string' ? C.sqIndex(s) : s;
      if (sq >= 0) L.appendChild(sqDiv(self, sq, 'picked'));
    });
    if (this.sel >= 0) {
      L.appendChild(sqDiv(this, this.sel, 'sel'));
      if (Board.dots) {
        this.targets(this.sel).forEach(function (t) {
          L.appendChild(sqDiv(self, t, self.pos.b[t] ? 'cap' : 'dot'));
        });
      }
    }
    if (this.hover >= 0 && this.drag && this.drag.started) L.appendChild(sqDiv(this, this.hover, 'hover'));
    if (this.kbd && this.cursor >= 0) L.appendChild(sqDiv(this, this.cursor, 'cursor'));
    (Array.isArray(this.badge) ? this.badge : this.badge ? [this.badge] : []).forEach(function (b) {
      var bs = typeof b.sq === 'string' ? C.sqIndex(b.sq) : b.sq;
      if (!(bs >= 0)) return;
      var wrap = sqDiv(self, bs, 'badge-wrap');
      wrap.setAttribute('data-sq', bs);
      // on the board's right column or top row, the badge tucks inside the square (the board clips its edges)
      var at = self.xy(bs), edge = (at.x === 7 ? ' edge-r' : '') + (at.y === 0 ? ' edge-t' : '');
      wrap.appendChild(h('span', { class: 'badge k-' + b.kind + edge }, b.icon ? U.icon(b.icon, 'i-' + b.icon) : (b.text || '')));
      L.appendChild(wrap);
    });
  };

  B.paintArrows = function () {
    var svg = this.arrowLayer, self = this;
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    var NS = 'http://www.w3.org/2000/svg';
    this.arrows.forEach(function (a, idx) {
      var f = typeof a.from === 'string' ? C.sqIndex(a.from) : a.from, t = typeof a.to === 'string' ? C.sqIndex(a.to) : a.to;
      if (f < 0 || t < 0 || f === t) return;
      var p1 = self.xy(f), p2 = self.xy(t);
      var x1 = p1.x * 100 + 50, y1 = p1.y * 100 + 50, x2 = p2.x * 100 + 50, y2 = p2.y * 100 + 50;
      var dx = x2 - x1, dy = y2 - y1, len = Math.sqrt(dx * dx + dy * dy), ux = dx / len, uy = dy / len;
      var head = 34, w = 14, ex = x2 - ux * 18, ey = y2 - uy * 18;
      var bx = ex - ux * head, by = ey - uy * head, sx = x1 + ux * 22, sy = y1 + uy * 22;
      var px = -uy, py = ux;
      var g = document.createElementNS(NS, 'g');
      g.setAttribute('class', 'arrow ' + (a.color || 'gold'));
      g.setAttribute('opacity', a.opacity || '0.85');
      var line = document.createElementNS(NS, 'path');
      line.setAttribute('d', 'M' + sx + ' ' + sy + ' L' + bx + ' ' + by);
      line.setAttribute('stroke-width', w); line.setAttribute('stroke-linecap', 'round'); line.setAttribute('fill', 'none');
      var tip = document.createElementNS(NS, 'path');
      tip.setAttribute('d', 'M' + ex + ' ' + ey + ' L' + (bx + px * 22) + ' ' + (by + py * 22) + ' L' + (bx - px * 22) + ' ' + (by - py * 22) + ' Z');
      g.appendChild(line); g.appendChild(tip);
      svg.appendChild(g);
    });
  };

  /* ---------- keyboard ---------- */
  B.key = function (e) {
    if (this.promoOpen) return;
    var dirs = { ArrowUp: [0, 1], ArrowDown: [0, -1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] }, d = dirs[e.key];
    if (!d && e.key !== 'Enter' && e.key !== ' ' && e.key !== 'Escape') return;
    // Steering with the keys is for a board you reached with the keyboard and that can take a move. Otherwise the
    // keys belong to the page, so after a click on the board the arrows still step through the game.
    if (!this.kbd && !this.opts.onSquare && (this.viaPointer || !this.canMove())) {
      if (e.key === 'Escape' && this.sel >= 0) { e.preventDefault(); this.select(-1); }
      return;
    }
    e.preventDefault(); e.stopPropagation();
    if (this.cursor < 0) this.cursor = C.sqIndex(this.orient === 'w' ? 'e2' : 'e7');
    this.kbd = true;
    if (d) {
      var f = this.cursor & 7, r = this.cursor >> 4, s = this.orient === 'w' ? 1 : -1;
      f = Math.max(0, Math.min(7, f + d[0] * s)); r = Math.max(0, Math.min(7, r + d[1] * s));
      this.cursor = (r << 4) | f;
    } else if (e.key === 'Escape') this.select(-1);
    else this.activate(this.cursor);
    this.paint();
    this.announce();
  };
  B.announce = function () {
    if (!this.pos || this.cursor < 0) return;
    var p = this.pos.b[this.cursor], NAMES = ['', 'pawn', 'knight', 'bishop', 'rook', 'queen', 'king'];
    this.live.textContent = C.sqName(this.cursor) + (p ? ', ' + (p > 0 ? 'white ' : 'black ') + NAMES[Math.abs(p)] : ', empty') + (this.sel === this.cursor ? ', picked up' : '');
  };
  /* the same as tapping a square */
  B.activate = function (sq) {
    if (this.promoOpen || sq < 0) return;
    if (this.opts.onSquare) { this.opts.onSquare(C.sqName(sq), sq); return; }
    if (!this.canMove()) { if (this.opts.onBlocked) this.opts.onBlocked(); return; }
    var p = this.pos.b[sq], mine = p && ((p > 0) === (this.pos.side === 1));
    if (this.sel >= 0 && this.targets(this.sel).indexOf(sq) >= 0 && !(mine && this.sel !== sq && !this.isCastleTarget(this.sel, sq))) { this.tryMove(this.sel, sq, false); return; }
    this.select(mine && this.sel !== sq ? sq : -1);
  };

  /* ---------- input ---------- */
  B.down = function (e) {
    if (e.button !== undefined && e.button !== 0) return;
    var sq = this.sqAt(e.clientX, e.clientY);
    if (sq < 0) return;
    if (this.promoOpen) return;
    if (this.opts.onSquare) { e.preventDefault(); this.opts.onSquare(C.sqName(sq), sq); return; }
    if (!this.canMove()) { if (this.opts.onBlocked) this.opts.onBlocked(); return; }
    var p = this.pos.b[sq];
    var mine = p && ((p > 0) === (this.pos.side === 1));
    if (this.sel >= 0 && this.targets(this.sel).indexOf(sq) >= 0 && !(mine && this.sel !== sq && !this.isCastleTarget(this.sel, sq))) {
      this.tryMove(this.sel, sq, false); return;
    }
    if (mine) {
      e.preventDefault();
      var wasSel = this.sel === sq;
      this.select(sq);
      this.drag = { sq: sq, x0: e.clientX, y0: e.clientY, started: false, el: this.pieces[sq], wasSel: wasSel, id: e.pointerId };
      try { this.el.setPointerCapture(e.pointerId); } catch (x) { /* ignore */ }
    } else this.select(-1);
  };
  B.isCastleTarget = function (from, to) {
    for (var i = 0; i < this.legal.length; i++) { var m = this.legal[i]; if ((m & 127) === from && ((m >> 7) & 127) === to && ((m >>> 17) & 4)) return true; }
    return false;
  };
  B.move = function (e) {
    var d = this.drag;
    if (!d || !d.el) return;
    if (!d.started) {
      if (Math.abs(e.clientX - d.x0) + Math.abs(e.clientY - d.y0) < 5) return;
      d.started = true; d.el.classList.add('dragging'); this.el.classList.remove('anim');
    }
    var rc = this.el.getBoundingClientRect(), size = rc.width / 8;
    var x = e.clientX - rc.left - size / 2, y = e.clientY - rc.top - size / 2;
    d.el.style.transform = 'translate(' + x + 'px,' + y + 'px) scale(1.12)';
    var hv = this.sqAt(e.clientX, e.clientY);
    if (hv !== this.hover) { this.hover = hv; this.paint(); }
  };
  B.up = function (e) {
    var d = this.drag;
    if (!d) return;
    this.drag = null; this.hover = -1;
    if (d.started) {
      d.el.classList.remove('dragging');
      var sq = this.sqAt(e.clientX, e.clientY);
      if (sq >= 0 && sq !== d.sq && this.targets(d.sq).indexOf(sq) >= 0) {
        this.place(d.el, sq);
        this.tryMove(d.sq, sq, true);
      } else {
        this.el.classList.add('anim');
        this.place(d.el, d.sq);
        this.paint();
      }
    } else if (d.wasSel) this.select(-1);
  };
  B.cancelDrag = function () {
    var d = this.drag; this.drag = null; this.hover = -1;
    if (d && d.el) { d.el.classList.remove('dragging'); if (d.started) this.el.classList.add('anim'); this.place(d.el, d.sq); } // a cancelled drag glides home like a refused one
    this.paint();
  };

  B.tryMove = function (from, to, dragged) {
    var self = this, cands = this.legal.filter(function (m) { return (m & 127) === from && ((m >> 7) & 127) === to; });
    if (!cands.length) return;
    this.sel = -1;
    var done = function (m) {
      if (!m) { self.setPosition(self.pos, { animate: false }); return; }
      if (self.opts.onMove) self.opts.onMove(C.uci(m), m, { dragged: dragged });
    };
    if (cands.length > 1) {
      // exercises pass { autoQueen: false } so an underpromotion can still be the answer
      if (Board.autoQueen && this.opts.autoQueen !== false) { done(cands.filter(function (m) { return ((m >> 14) & 7) === 5; })[0]); return; }
      this.askPromotion(to, function (pt) { done(pt ? cands.filter(function (m) { return ((m >> 14) & 7) === pt; })[0] : null); });
      return;
    }
    done(cands[0]);
  };

  B.askPromotion = function (to, cb) {
    var self = this, color = this.pos.side === 1 ? 'w' : 'b', p = this.xy(to);
    this.promoOpen = true;
    var col = h('div', { class: 'promo', style: { left: (p.x * 12.5) + '%' } });
    var down = p.y === 0, armed = 0;
    // A piece is chosen by a press that starts on it (or by the keyboard). On a phone, the tap that opened the menu is
    // followed by a click that lands on whatever is now under the finger, the queen, and must not choose for you.
    [5, 2, 4, 3].forEach(function (pt, i) {
      var btn = h('button', { class: 'promo-btn', type: 'button', 'aria-label': ['Queen', 'Knight', 'Rook', 'Bishop'][i],
        style: { top: ((down ? p.y + i : p.y - i) * 12.5) + '%' },
        onpointerdown: function (e) { e.stopPropagation(); armed = pt; },
        onclick: function (e) { e.stopPropagation(); if (e.detail === 0 || armed === pt) close(pt); } },
        h('span', { class: 'pc ' + color + CODES.charAt(pt) }));
      col.appendChild(btn);
    });
    var shade = h('div', { class: 'promo-shade', onpointerdown: function (e) { e.stopPropagation(); close(0); } });
    this.overLayer.appendChild(shade); this.overLayer.appendChild(col);
    col.addEventListener('keydown', function (e) { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(0); self.el.focus(); } });
    if (this.kbd) setTimeout(function () { try { col.firstChild.focus(); } catch (e) { /* ignore */ } }, 0);
    this.promoCancel = function () { close(0); };
    function close(pt) { if (!self.promoOpen) return; self.promoOpen = false; self.promoCancel = null; U.clear(self.overLayer); cb(pt); }
  };

  Board.animate = true; Board.dots = true; Board.autoQueen = false;
  Board.calm = function () { return !Board.animate || !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches); };
  return Board;
})();
