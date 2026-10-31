/* Tempo piece set: original Staunton-style vector pieces drawn on a 100x100 grid,
   lit from the left with a soft gradient, outlined in navy. */
var TempoPieces = (function () {
  'use strict';
  var SHAPES = {
    p: '<path d="M57.5 44 C57.5 44 58.83 49 60 52 C61.17 55 62.92 58.67 64.5 62 C66.08 65.33 68 68.92 69.5 72 C71 75.08 73.5 80.5 73.5 80.5 L50.01 80.5 L49.99 80.5 L26.5 80.5 C26.5 80.5 29 75.08 30.5 72 C32 68.92 33.92 65.33 35.5 62 C37.08 58.67 38.83 55 40 52 C41.17 49 42.5 44 42.5 44 L57.5 44 Z"/><rect class="s" x="42.5" y="45.5" width="15" height="3.2" rx="1.6"/><rect class="h" x="42.5" y="47" width="3.2" height="29" rx="1.6"/><circle cx="50" cy="30" r="12"/><ellipse class="h" cx="46.16" cy="25.8" rx="3.6" ry="2.64"/><rect x="36.5" y="40.5" width="27" height="5.2" rx="2.6"/><path d="M25 80 H75 V86.5 Q75 90 71.5 90 H28.5 Q25 90 25 86.5 Z"/><rect class="s" x="28" y="80" width="44" height="2.6" rx="1.3"/>',
    r: '<path d="M34.5 40 H65.5 L68.5 72 H31.5 Z"/><rect class="s" x="35" y="40.5" width="30" height="3.2" rx="1.6"/><rect class="h" x="38.5" y="42" width="3.2" height="28" rx="1.6"/><path d="M28 13 H37 V21 H43 V13 H57 V21 H63 V13 H72 V32 Q72 35.5 68.5 35.5 H31.5 Q28 35.5 28 32 Z"/><rect class="h" x="31.5" y="22" width="2.6" height="10" rx="1.3"/><rect x="29" y="34" width="42" height="5.5" rx="2.75"/><rect x="27" y="70.5" width="46" height="6.5" rx="3.25"/><path d="M23 80 H77 V86.5 Q77 90 73.5 90 H26.5 Q23 90 23 86.5 Z"/><rect class="s" x="26" y="80" width="48" height="2.6" rx="1.3"/>',
    b: '<path d="M58.5 57 C58.5 57 59.83 62.33 61 65 C62.17 67.67 63.92 70.42 65.5 73 C67.08 75.58 70.5 80.5 70.5 80.5 L50.01 80.5 L49.99 80.5 L29.5 80.5 C29.5 80.5 32.92 75.58 34.5 73 C36.08 70.42 37.83 67.67 39 65 C40.17 62.33 41.5 57 41.5 57 L58.5 57 Z"/><rect class="s" x="41.5" y="58.5" width="17" height="3.2" rx="1.6"/><rect class="h" x="43.5" y="60" width="3.2" height="17" rx="1.6"/><circle cx="50" cy="11" r="4.8"/><ellipse class="h" cx="48.46" cy="9.32" rx="1.44" ry="1.06"/><path d="M52.5 14.5 C54.25 15.58 56.33 18.42 58 21 C59.67 23.58 61.42 26.67 62.5 30 C63.58 33.33 64.5 37.67 64.5 41 C64.5 44.33 63.42 47.42 62.5 50 C61.58 52.58 59 56.5 59 56.5 L50.01 56.5 L49.99 56.5 L41 56.5 C41 56.5 38.42 52.58 37.5 50 C36.58 47.42 35.5 44.33 35.5 41 C35.5 37.67 36.42 33.33 37.5 30 C38.58 26.67 40.33 23.58 42 21 C43.67 18.42 45.75 15.58 47.5 14.5 C49.25 13.42 50.75 13.42 52.5 14.5 Z"/><rect class="h" x="41" y="24" width="2.6" height="26" rx="1.3"/><path class="d" d="M56.5 24 L47 39"/><rect x="34.5" y="54" width="31" height="5.2" rx="2.6"/><path d="M25.5 80 H74.5 V86.5 Q74.5 90 71 90 H29 Q25.5 90 25.5 86.5 Z"/><rect class="s" x="28.5" y="80" width="43" height="2.6" rx="1.3"/>',
    n: '<path d="M29 72.5 C29 66 31.5 60 36.5 56 C40.5 52.5 42.5 49 43 45.5 C39 46.5 33.5 47 28.5 46 C23 45 19.5 42 19 38 C18.5 34.5 20.5 32 23.5 30.5 C26.5 29.5 30 29 33.5 28.5 C34 25 35.5 21.5 38.5 18.5 C40.5 16.5 43.5 14.5 46 13 C45.5 9.5 46 6 48 2.5 C50.5 5.5 52 9 52.5 12.5 C54 12 55.5 12 57 12.5 C57.5 9 59 6 61.5 3.5 C63 7 63.5 10.5 63 14 C69 18 74.5 25 76.5 35 C78.5 48 77.5 61 75 72.5 Z"/><path d="M61.5 14 C68 18 73 25.5 74 36 C75.5 48 75 61 73 72.5 L66.5 72.5 C68.5 66 67 61.5 62 58 C66.5 54 66.5 48.5 61.5 45 C66 41 65 36 60 33 C63.5 29 62 24.5 58 21.5 C59.5 18.5 59 15.5 57.5 13 Z"/><rect class="h" x="33" y="31" width="2.4" height="11" rx="1.2"/><ellipse class="e" cx="41.5" cy="25" rx="3.6" ry="2.5" transform="rotate(-28 41.5 25)"/><path class="d" d="M37.5 20.5 C40 19.5 43 19.5 45.5 20.5"/><ellipse class="e" cx="24" cy="37" rx="2.1" ry="1.4" transform="rotate(-32 24 37)"/><path class="d" d="M21 42 C24 43 26.5 43.2 29 42.6"/><path class="d" d="M48.5 28 C51.5 35 49.5 42.5 44.5 47"/><rect x="26.5" y="70.5" width="47" height="6" rx="3"/><path d="M23.5 80 H76.5 V86.5 Q76.5 90 73 90 H27 Q23.5 90 23.5 86.5 Z"/><rect class="s" x="26.5" y="80" width="47" height="2.6" rx="1.3"/>',
    q: '<path d="M64 40 C64 40 62.92 46.67 63 50 C63.08 53.33 63.42 56.67 64.5 60 C65.58 63.33 67.67 66.58 69.5 70 C71.33 73.42 75.5 80.5 75.5 80.5 L50.01 80.5 L49.99 80.5 L24.5 80.5 C24.5 80.5 28.67 73.42 30.5 70 C32.33 66.58 34.42 63.33 35.5 60 C36.58 56.67 36.92 53.33 37 50 C37.08 46.67 36 40 36 40 L64 40 Z"/><rect class="h" x="38.5" y="42" width="3.2" height="36" rx="1.6"/><rect class="s" x="36" y="41.5" width="28" height="3.2" rx="1.6"/><path d="M33 39 C31 30 28 24 26 18 L34 26 L40 11.5 L46 25 L50 7.5 L54 25 L60 11.5 L66 26 L74 18 C72 24 69 30 67 39 Z"/><rect x="28.5" y="37" width="43" height="5.5" rx="2.75"/><rect x="32.5" y="58" width="35" height="5" rx="2.5"/><rect class="s" x="34" y="63" width="32" height="3.2" rx="1.6"/><circle cx="26" cy="16.5" r="4.4"/><ellipse class="h" cx="24.59" cy="14.96" rx="1.32" ry="0.97"/><circle cx="40" cy="9.5" r="4.4"/><ellipse class="h" cx="38.59" cy="7.96" rx="1.32" ry="0.97"/><circle cx="50" cy="5.6" r="4.8"/><ellipse class="h" cx="48.46" cy="3.92" rx="1.44" ry="1.06"/><circle cx="60" cy="9.5" r="4.4"/><ellipse class="h" cx="58.59" cy="7.96" rx="1.32" ry="0.97"/><circle cx="74" cy="16.5" r="4.4"/><ellipse class="h" cx="72.59" cy="14.96" rx="1.32" ry="0.97"/><path d="M22.5 80 H77.5 V86.5 Q77.5 90 74 90 H26 Q22.5 90 22.5 86.5 Z"/><rect class="s" x="25.5" y="80" width="49" height="2.6" rx="1.3"/><path class="d" d="M38 50 C44 48 56 48 62 50"/>',
    k: '<path d="M64 40 C64 40 62.92 46.67 63 50 C63.08 53.33 63.42 56.67 64.5 60 C65.58 63.33 67.67 66.58 69.5 70 C71.33 73.42 75.5 80.5 75.5 80.5 L50.01 80.5 L49.99 80.5 L24.5 80.5 C24.5 80.5 28.67 73.42 30.5 70 C32.33 66.58 34.42 63.33 35.5 60 C36.58 56.67 36.92 53.33 37 50 C37.08 46.67 36 40 36 40 L64 40 Z"/><rect class="h" x="38.5" y="42" width="3.2" height="36" rx="1.6"/><rect class="s" x="36" y="41.5" width="28" height="3.2" rx="1.6"/><path d="M52 23 C53.83 23.25 56.75 23.33 59 24.5 C61.25 25.67 63.83 27.67 65.5 30 C67.17 32.33 69 38.5 69 38.5 L50.01 38.5 L49.99 38.5 L31 38.5 C31 38.5 32.83 32.33 34.5 30 C36.17 27.67 38.75 25.67 41 24.5 C43.25 23.33 46.17 23.25 48 23 C49.83 22.75 50.17 22.75 52 23 Z"/><rect class="h" x="41" y="25" width="2.6" height="9" rx="1.3"/><path d="M46 1 H54 V7.8 H61 V15.4 H54 V22.5 H46 V15.4 H39 V7.8 H46 Z"/><rect x="28.5" y="37" width="43" height="5.5" rx="2.75"/><rect x="32.5" y="58" width="35" height="5" rx="2.5"/><rect class="s" x="34" y="63" width="32" height="3.2" rx="1.6"/><path d="M22.5 80 H77.5 V86.5 Q77.5 90 74 90 H26 Q22.5 90 22.5 86.5 Z"/><rect class="s" x="25.5" y="80" width="49" height="2.6" rx="1.3"/><path class="d" d="M38 50 C44 48 56 48 62 50"/>'
  };
  // sculpted finish: a cylinder shade across each piece (lit from the upper left), a thin outline in a darker tone of
  // the same colour, and a soft shadow under every overhang so the parts read as turned wood rather than flat shapes
  var SETS = {
    w: { stops: ['#FFFFFF', '#FDFAF2', '#EBE0C6', '#CBBC99'], stroke: '#7D6B45', detail: '#8A7750', eye: '#2A2F3C', shade: 'rgba(80,60,20,0.18)', gloss: 'rgba(255,255,255,0.55)' },
    b: { stops: ['#6B7CA3', '#43557F', '#243356', '#111A30'], stroke: '#0B1225', detail: '#C9D0E2', eye: '#E8DCC0', shade: 'rgba(0,0,0,0.28)', gloss: 'rgba(200,215,240,0.28)' }
  };
  var ON_DARK = { stops: ['#7B8CB3', '#546790', '#324265', '#1E2A47'], stroke: '#C9C0A8', detail: '#D9DFEE', eye: '#E8DCC0', shade: 'rgba(0,0,0,0.3)', gloss: 'rgba(210,222,245,0.3)' };
  function svg(color, type, bold, onDark) {
    var c = onDark && color === 'b' ? ON_DARK : SETS[color];
    var grad = '<linearGradient id="f" gradientUnits="userSpaceOnUse" x1="22" y1="0" x2="78" y2="0">' +
      '<stop offset="0" stop-color="' + c.stops[0] + '"/><stop offset="0.28" stop-color="' + c.stops[1] + '"/><stop offset="0.68" stop-color="' + c.stops[2] + '"/><stop offset="1" stop-color="' + c.stops[3] + '"/></linearGradient>';
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs>' + grad + '</defs>' +
      '<style>.g{fill:url(#f);stroke:' + c.stroke + ';stroke-width:' + (bold ? 3.6 : 2) + ';stroke-linejoin:round}' +
      '.g .d{fill:none;stroke:' + c.detail + ';stroke-width:2.2;stroke-linecap:round}' +
      '.g .s{fill:' + c.shade + ';stroke:none}.g .h{fill:' + c.gloss + ';stroke:none}' +
      '.g .e{fill:' + c.eye + ';stroke:none}</style>' +
      '<g class="g">' + SHAPES[type] + '</g></svg>';
  }
  function uri(color, type, bold, onDark) { return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg(color, type, bold, onDark)); }
  /* board pieces (.pc) and the bolder captured-piece icons (.cp), with outlined black icons in dark mode */
  function css() {
    var out = '', dark = '';
    ['w', 'b'].forEach(function (c) {
      'pnbrqk'.split('').forEach(function (t) {
        out += '.pc.' + c + t + '{background-image:url("' + uri(c, t) + '")}\n';
        out += '.cp.' + c + t + '{background-image:url("' + uri(c, t, true) + '")}\n';
        if (c === 'b') dark += '.cp.b' + t + '{background-image:url("' + uri('b', t, true, true) + '")}\n';
      });
    });
    out += '@media (prefers-color-scheme: dark) {\n' + dark.replace(/^\.cp/gm, ':root:not([data-theme="light"]) .cp') + '}\n';
    out += dark.replace(/^\.cp/gm, ':root[data-theme="dark"] .cp');
    return out;
  }
  return { svg: svg, uri: uri, css: css, SHAPES: SHAPES };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = TempoPieces;
