/* Tempo piece set: original Staunton-style vector pieces drawn on a 100x100 grid (the knight is a snarling wolf),
   lit from the left with a soft gradient, outlined in navy. */
var TempoPieces = (function () {
  'use strict';
  var SHAPES = {
    p: '<path d="M57.5 44 C57.5 44 58.83 49 60 52 C61.17 55 62.92 58.67 64.5 62 C66.08 65.33 68 68.92 69.5 72 C71 75.08 73.5 80.5 73.5 80.5 L50.01 80.5 L49.99 80.5 L26.5 80.5 C26.5 80.5 29 75.08 30.5 72 C32 68.92 33.92 65.33 35.5 62 C37.08 58.67 38.83 55 40 52 C41.17 49 42.5 44 42.5 44 L57.5 44 Z"/><circle cx="50" cy="30" r="12"/><rect x="36.5" y="40.5" width="27" height="5.2" rx="2.6"/><path d="M25 80 H75 V86.5 Q75 90 71.5 90 H28.5 Q25 90 25 86.5 Z"/>',
    r: '<path d="M34.5 40 H65.5 L68.5 72 H31.5 Z"/><path d="M28 13 H37 V21 H43 V13 H57 V21 H63 V13 H72 V32 Q72 35.5 68.5 35.5 H31.5 Q28 35.5 28 32 Z"/><rect x="29" y="34" width="42" height="5.5" rx="2.75"/><rect x="27" y="70.5" width="46" height="6.5" rx="3.25"/><path d="M23 80 H77 V86.5 Q77 90 73.5 90 H26.5 Q23 90 23 86.5 Z"/>',
    b: '<path d="M58.5 57 C58.5 57 59.83 62.33 61 65 C62.17 67.67 63.92 70.42 65.5 73 C67.08 75.58 70.5 80.5 70.5 80.5 L50.01 80.5 L49.99 80.5 L29.5 80.5 C29.5 80.5 32.92 75.58 34.5 73 C36.08 70.42 37.83 67.67 39 65 C40.17 62.33 41.5 57 41.5 57 L58.5 57 Z"/><circle cx="50" cy="11" r="4.8"/><path d="M52.5 14.5 C54.25 15.58 56.33 18.42 58 21 C59.67 23.58 61.42 26.67 62.5 30 C63.58 33.33 64.5 37.67 64.5 41 C64.5 44.33 63.42 47.42 62.5 50 C61.58 52.58 59 56.5 59 56.5 L50.01 56.5 L49.99 56.5 L41 56.5 C41 56.5 38.42 52.58 37.5 50 C36.58 47.42 35.5 44.33 35.5 41 C35.5 37.67 36.42 33.33 37.5 30 C38.58 26.67 40.33 23.58 42 21 C43.67 18.42 45.75 15.58 47.5 14.5 C49.25 13.42 50.75 13.42 52.5 14.5 Z"/><path class="d" d="M56.5 24 L47 39"/><rect x="34.5" y="54" width="31" height="5.2" rx="2.6"/><path d="M25.5 80 H74.5 V86.5 Q74.5 90 71 90 H29 Q25.5 90 25.5 86.5 Z"/>',
    // the knight is a wolf: a snarl with two fangs, a heavy brow, ears up, and a jagged ruff down the back
    n: '<path d="M33 72 C33 64 35 57.5 39.5 53 L36 55.5 C37.5 52 39.5 50 42 49 C37 50 31 51 26.5 50.5 C24 50 22 48 22.5 45.5 C25.5 44.5 29.5 44 33.5 43.5 C30 41 25.5 39.5 21.5 39.5 C18.5 39.5 17 37.5 17.2 35.5 C17.5 33.5 19 32.5 21 32.3 C25.5 31.5 29.5 30 33 28.5 C36 27 39 25.5 41.5 24 C42.5 23.3 43.5 22.8 44.5 22.5 C44.5 17 45 10 47 4.5 C50 8.5 52.5 12.5 54 16 L56 16.5 L57.5 13.5 L59 16 C59.5 11.5 61 7 63.5 4 C66 8.5 67 13 67.5 17.5 L72 19 C74 23 75.5 27 75.5 30.5 L81 33 C77 36 75 39 74.5 42 L80.5 44.5 C76.5 47 74.5 50 74.5 53.5 L79.5 56 C76 59 75 62.5 75.5 66 C75.5 68 75.5 70 75.5 72 Z"/><path class="e" d="M22 40.6 C26 41.6 30 42.2 33.4 43.4 C29.5 44.1 25.5 44.6 22.6 45.1 Z"/><path class="t" d="M22.8 40.2 L25.2 46.4 L27.8 40.6 Z"/><path class="t" d="M29 41.7 L30.4 45 L32 42 Z"/><rect x="27" y="70.5" width="46" height="6" rx="3"/><path d="M24.5 80 H75.5 V86.5 Q75.5 90 72 90 H28 Q24.5 90 24.5 86.5 Z"/><path class="e" d="M35.5 32.6 C37.5 30 40.8 29.2 44.2 30.4 C42.2 33 39 33.9 35.5 32.6 Z"/><circle class="e" cx="19.2" cy="35.2" r="2.6"/><path class="d" d="M33.5 25.6 C37 24.4 40.5 25.2 43.5 27.2"/><path class="d" d="M53 33 C57 37 58.5 43 56 49"/>',
    q: '<path d="M64 40 C64 40 62.92 46.67 63 50 C63.08 53.33 63.42 56.67 64.5 60 C65.58 63.33 67.67 66.58 69.5 70 C71.33 73.42 75.5 80.5 75.5 80.5 L50.01 80.5 L49.99 80.5 L24.5 80.5 C24.5 80.5 28.67 73.42 30.5 70 C32.33 66.58 34.42 63.33 35.5 60 C36.58 56.67 36.92 53.33 37 50 C37.08 46.67 36 40 36 40 L64 40 Z"/><path d="M33 39 C31 30 28 24 26 18 L34 26 L40 11.5 L46 25 L50 7.5 L54 25 L60 11.5 L66 26 L74 18 C72 24 69 30 67 39 Z"/><rect x="28.5" y="37" width="43" height="5.5" rx="2.75"/><rect x="32.5" y="58" width="35" height="5" rx="2.5"/><circle cx="26" cy="16.5" r="4.4"/><circle cx="40" cy="9.5" r="4.4"/><circle cx="50" cy="5.6" r="4.8"/><circle cx="60" cy="9.5" r="4.4"/><circle cx="74" cy="16.5" r="4.4"/><path d="M22.5 80 H77.5 V86.5 Q77.5 90 74 90 H26 Q22.5 90 22.5 86.5 Z"/><path class="d" d="M38 50 C44 48 56 48 62 50"/>',
    k: '<path d="M64 40 C64 40 62.92 46.67 63 50 C63.08 53.33 63.42 56.67 64.5 60 C65.58 63.33 67.67 66.58 69.5 70 C71.33 73.42 75.5 80.5 75.5 80.5 L50.01 80.5 L49.99 80.5 L24.5 80.5 C24.5 80.5 28.67 73.42 30.5 70 C32.33 66.58 34.42 63.33 35.5 60 C36.58 56.67 36.92 53.33 37 50 C37.08 46.67 36 40 36 40 L64 40 Z"/><path d="M52 23 C53.83 23.25 56.75 23.33 59 24.5 C61.25 25.67 63.83 27.67 65.5 30 C67.17 32.33 69 38.5 69 38.5 L50.01 38.5 L49.99 38.5 L31 38.5 C31 38.5 32.83 32.33 34.5 30 C36.17 27.67 38.75 25.67 41 24.5 C43.25 23.33 46.17 23.25 48 23 C49.83 22.75 50.17 22.75 52 23 Z"/><path d="M46 1 H54 V7.8 H61 V15.4 H54 V22.5 H46 V15.4 H39 V7.8 H46 Z"/><rect x="28.5" y="37" width="43" height="5.5" rx="2.75"/><rect x="32.5" y="58" width="35" height="5" rx="2.5"/><path d="M22.5 80 H77.5 V86.5 Q77.5 90 74 90 H26 Q22.5 90 22.5 86.5 Z"/><path class="d" d="M38 50 C44 48 56 48 62 50"/>'
  };
  var SETS = {
    w: { a: '#FFFFFF', b: '#E6DDCA', stroke: '#1B2A4A', detail: '#1B2A4A', eye: '#1B2A4A' },
    b: { a: '#3D4E73', b: '#161F36', stroke: '#0A1222', detail: '#E8DCC0', eye: '#E8DCC0' }
  };
  var ON_DARK = { a: '#4A5C84', b: '#2A3756', stroke: '#D9CFBA', detail: '#E8DCC0', eye: '#E8DCC0' };
  function svg(color, type, bold, onDark) {
    var c = onDark && color === 'b' ? ON_DARK : SETS[color];
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">' +
      '<defs><linearGradient id="f" gradientUnits="userSpaceOnUse" x1="24" y1="0" x2="76" y2="0"><stop offset="0" stop-color="' + c.a + '"/><stop offset="1" stop-color="' + c.b + '"/></linearGradient></defs>' +
      '<style>.g{fill:url(#f);stroke:' + c.stroke + ';stroke-width:' + (bold ? 5 : 2.6) + ';stroke-linejoin:round}' +
      '.g .d{fill:none;stroke:' + c.detail + ';stroke-width:2.6;stroke-linecap:round}' +
      '.g .e{fill:' + c.eye + ';stroke:none}' +
      '.g .t{fill:' + (color === 'w' ? c.a : c.detail) + ';stroke:' + c.stroke + ';stroke-width:1.6;stroke-linejoin:round}</style>' +
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
