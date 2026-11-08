/* Tempo piece set: original Staunton-style vector pieces drawn on a 100x100 grid, in the language of the school's wolf:
   the knight is the snarling wolf itself, and the rest are cut like gems, faceted with a darker right half (.m), the pawn keeping its round head, with a dark
   wedge (.e) for the rook's slit window, the bishop's claw cut and the crown jewels; the rook's merlons and the queen's
   crown are fangs. Lit from the left with a soft gradient, outlined in navy. */
var TempoPieces = (function () {
  'use strict';
  var SHAPES = {
    p: '<circle cx="50" cy="29" r="13"/><path class="m" d="M50 16 A13 13 0 0 1 50 42 Z"/><circle class="o" cx="50" cy="29" r="13"/><path d="M41.5 49 L58.5 49 C58 60 63 70 72 79.5 L28 79.5 C37 70 42 60 41.5 49 Z"/><path d="M34 42 L66 42 L63.5 49.5 L36.5 49.5 Z"/><path d="M25 80 H75 V86.5 Q75 90 71.5 90 H28.5 Q25 90 25 86.5 Z"/>',
    r: '<path d="M34 39 L66 39 L69.5 72 L30.5 72 Z"/><path class="m" d="M50 39 L66 39 L69.5 72 L50 72 Z"/><path class="o" d="M34 39 L66 39 L69.5 72 L30.5 72 Z"/><path class="e" d="M50 47 L53.5 54 L50 64 L46.5 54 Z"/><path d="M25.5 6 L38 12.5 L38 21.5 L44 21.5 L44 9.5 L50 5 L56 9.5 L56 21.5 L62 21.5 L62 12.5 L74.5 6 L72.5 33 Q72.5 36 69 36 H31 Q27.5 36 27.5 33 Z"/><path class="m" d="M50 5 L56 9.5 L56 21.5 L62 21.5 L62 12.5 L74.5 6 L72.5 33 Q72.5 36 69 36 H50 Z"/><path class="o" d="M25.5 6 L38 12.5 L38 21.5 L44 21.5 L44 9.5 L50 5 L56 9.5 L56 21.5 L62 21.5 L62 12.5 L74.5 6 L72.5 33 Q72.5 36 69 36 H31 Q27.5 36 27.5 33 Z"/><rect x="28" y="35" width="44" height="6" rx="2"/><rect x="26" y="70.5" width="48" height="6.5" rx="2"/><path d="M23 80 H77 V86.5 Q77 90 73.5 90 H26.5 Q23 90 23 86.5 Z"/>',
    b: '<path d="M41.5 57 L58.5 57 C58 63 62 70 70.5 80 L29.5 80 C38 70 42 63 41.5 57 Z"/><path d="M50 9 C61 16 67.5 29 66.5 43 C66 50 62.5 55 59.5 57.5 L40.5 57.5 C37.5 55 34 50 33.5 43 C32.5 29 39 16 50 9 Z"/><path class="m" d="M50 9 C61 16 67.5 29 66.5 43 C66 50 62.5 55 59.5 57.5 L50 57.5 Z"/><path class="o" d="M50 9 C61 16 67.5 29 66.5 43 C66 50 62.5 55 59.5 57.5 L40.5 57.5 C37.5 55 34 50 33.5 43 C32.5 29 39 16 50 9 Z"/><path class="e" d="M58.5 21 L61.5 26 L47 43.5 L44.5 39 Z"/><circle cx="50" cy="7" r="4.6"/><path d="M33 54.5 L67 54.5 L64 60.5 L36 60.5 Z"/><path d="M25.5 80 H74.5 V86.5 Q74.5 90 71.0 90 H29.0 Q25.5 90 25.5 86.5 Z"/>',
    // the knight is a wolf, after the school's: a snarl with rows of teeth, a heavy brow ledge over a narrow eye, ears up,
    // fur bursting from the cheek and down the back, and a two-tone face (the mask, .m, over the top of the head)
    n: '<path d="M33 72 C33.5 65 36 58 41 53 C39.5 54 37.5 55.5 35.5 57.5 C37.5 53.5 40.5 51.8 44 51.5 C40.5 53 36 54.3 32 54.2 L29 57.2 C27 56 25 54.5 24 52.2 C29.5 50 35 47 40 44.2 C33 43 25 41.8 18.5 40.8 C16.5 40.5 15.5 39 15.8 37.5 C16 35.5 17.5 34 19.5 33.5 C23 32.5 26.5 31.5 29.5 30.5 C30 28 32.5 25.5 36 24.8 C38 24.5 40.5 24.6 42.5 24.6 C43.5 23 44.5 21.5 46 20.5 C46.5 19.5 46.8 18.8 47 18 C47.5 12.5 48.5 7 50.5 2 C53 7 55.5 12 57 16 L60 13.5 L62 16.5 C63 12 64.5 7 66.5 2.5 C69 8 70.5 13 70.5 18 C73.5 20.5 76 24 76.5 27 C80 26.5 85 27.5 89 29 C83 32.5 79.5 36 79 40 C83 40 87 42 90 45 C84 47.5 80 51 79.5 54.5 C82.5 55 85.5 57 87 60 C81.5 61.5 78 64 77.5 67.5 C77.5 69 77 70.8 76.5 72 Z"/><path class="m" d="M29.5 30.5 C30 28 32.5 25.5 36 24.8 C38 24.5 40.5 24.6 42.5 24.6 C43.5 23 44.5 21.5 46 20.5 C46.5 19.5 46.8 18.8 47 18 C47.5 12.5 48.5 7 50.5 2 C53 7 55.5 12 57 16 L60 13.5 L62 16.5 C63 12 64.5 7 66.5 2.5 C69 8 70.5 13 70.5 18 C73.5 20.5 76 24 76.5 27 C80 26.5 85 27.5 89 29 C83 32.5 79.5 36 79 40 C83 40 87 42 90 45 C84 47.5 80 51 79.5 54.5 C82.5 55 85.5 57 87 60 C81.5 61.5 78 64 77.5 67.5 C77.5 69 77 70.8 76.5 72 L62 72 C61 65 58.5 58 55 52 L58.5 50 C54 46 50 42 46 38.5 L49 36.5 C45 34 41 32.5 38 32.5 C35 34.5 32 34 29.5 33 Z"/><path class="o" d="M33 72 C33.5 65 36 58 41 53 C39.5 54 37.5 55.5 35.5 57.5 C37.5 53.5 40.5 51.8 44 51.5 C40.5 53 36 54.3 32 54.2 L29 57.2 C27 56 25 54.5 24 52.2 C29.5 50 35 47 40 44.2 C33 43 25 41.8 18.5 40.8 C16.5 40.5 15.5 39 15.8 37.5 C16 35.5 17.5 34 19.5 33.5 C23 32.5 26.5 31.5 29.5 30.5 C30 28 32.5 25.5 36 24.8 C38 24.5 40.5 24.6 42.5 24.6 C43.5 23 44.5 21.5 46 20.5 C46.5 19.5 46.8 18.8 47 18 C47.5 12.5 48.5 7 50.5 2 C53 7 55.5 12 57 16 L60 13.5 L62 16.5 C63 12 64.5 7 66.5 2.5 C69 8 70.5 13 70.5 18 C73.5 20.5 76 24 76.5 27 C80 26.5 85 27.5 89 29 C83 32.5 79.5 36 79 40 C83 40 87 42 90 45 C84 47.5 80 51 79.5 54.5 C82.5 55 85.5 57 87 60 C81.5 61.5 78 64 77.5 67.5 C77.5 69 77 70.8 76.5 72 Z"/><path class="e" d="M18.5 40.8 C25 41.8 33 43 40 44.2 C35 47 29.5 50 24 52.2 C21 49 19 45 18.5 40.8 Z"/><path class="t" d="M20.5 41.2 L23.2 48.4 L26 41.9 Z"/><path class="t" d="M30.5 42.4 L32.4 46.9 L34.3 43 Z"/><path class="t" d="M26.6 51.4 L28.2 46.6 L29.9 50.8 Z"/><path class="t" d="M35.5 47.4 L36.6 45.1 L37.7 46.9 Z"/><rect x="27" y="70.5" width="46" height="6" rx="3"/><path d="M24.5 80 H75.5 V86.5 Q75.5 90 72 90 H28 Q24.5 90 24.5 86.5 Z"/><path class="e" d="M28.5 33.3 L34.5 29.4 L40.5 30.4 L36.2 34.3 Z"/><path class="e" d="M15.6 37.6 C15.6 35.6 16.8 34 18.6 33.4 C20 33.2 21 34.2 20.8 35.8 C20.6 37.4 19.6 38.6 18.4 38.8 C17.2 38.8 16.2 38.4 15.6 37.6 Z"/><path class="t" d="M49.5 7.5 C48.8 10 48.6 12.5 49 15 C50.5 14.5 52 14 53.3 13.5 Z"/><path class="t" d="M65.5 8 C64.8 10.5 64.6 13 65 15.5 C66.5 15 68 14.5 69.3 14 Z"/>',
    q: '<path d="M64 40 L63 52 L68.5 66 L76 80 L24 80 L31.5 66 L37 52 L36 40 Z"/><path class="m" d="M50 40 L64 40 L63 52 L68.5 66 L76 80 L50 80 Z"/><path class="o" d="M64 40 L63 52 L68.5 66 L76 80 L24 80 L31.5 66 L37 52 L36 40 Z"/><path d="M32 39 C31 31 28 24 23.5 13 C29 18 32.5 22 35.5 26 C37 20 38.5 14 41 6.5 C43 13 44.5 19 46 25 C47 18 48.5 11 50 2.5 C51.5 11 53 18 54 25 C55.5 19 57 13 59 6.5 C61.5 14 63 20 64.5 26 C67.5 22 71 18 76.5 13 C72 24 69 31 68 39 Z"/><path class="m" d="M50 2.5 C51.5 11 53 18 54 25 C55.5 19 57 13 59 6.5 C61.5 14 63 20 64.5 26 C67.5 22 71 18 76.5 13 C72 24 69 31 68 39 L50 39 Z"/><path class="o" d="M32 39 C31 31 28 24 23.5 13 C29 18 32.5 22 35.5 26 C37 20 38.5 14 41 6.5 C43 13 44.5 19 46 25 C47 18 48.5 11 50 2.5 C51.5 11 53 18 54 25 C55.5 19 57 13 59 6.5 C61.5 14 63 20 64.5 26 C67.5 22 71 18 76.5 13 C72 24 69 31 68 39 Z"/><path class="e" d="M50 27 L53.5 32.5 L50 37.5 L46.5 32.5 Z"/><rect x="28.5" y="37.5" width="43" height="5.5" rx="2"/><rect x="33" y="58" width="34" height="5" rx="2"/><path d="M22.5 80 H77.5 V86.5 Q77.5 90 74.0 90 H26.0 Q22.5 90 22.5 86.5 Z"/>',
    k: '<path d="M64 40 L63 52 L68.5 66 L76 80 L24 80 L31.5 66 L37 52 L36 40 Z"/><path class="m" d="M50 40 L64 40 L63 52 L68.5 66 L76 80 L50 80 Z"/><path class="o" d="M64 40 L63 52 L68.5 66 L76 80 L24 80 L31.5 66 L37 52 L36 40 Z"/><path d="M50 21 L62 25.5 L68.5 33 L70 39 L30 39 L31.5 33 L38 25.5 Z"/><path class="m" d="M50 21 L62 25.5 L68.5 33 L70 39 L50 39 Z"/><path class="o" d="M50 21 L62 25.5 L68.5 33 L70 39 L30 39 L31.5 33 L38 25.5 Z"/><path d="M50 0 L54.5 5.5 L54.5 9 L60.5 9 L64 13.5 L60.5 18 L54.5 18 L54.5 22.5 L45.5 22.5 L45.5 18 L39.5 18 L36 13.5 L39.5 9 L45.5 9 L45.5 5.5 Z"/><path class="e" d="M50 26.5 L53.5 32 L50 37.5 L46.5 32 Z"/><rect x="28.5" y="37.5" width="43" height="5.5" rx="2"/><rect x="33" y="58" width="34" height="5" rx="2"/><path d="M22.5 80 H77.5 V86.5 Q77.5 90 74.0 90 H26.0 Q22.5 90 22.5 86.5 Z"/>'
  };
  var SETS = {
    w: { a: '#FFFFFF', b: '#E6DDCA', stroke: '#1B2A4A', detail: '#1B2A4A', eye: '#1B2A4A', mask: '#CDC2A8' },
    b: { a: '#3D4E73', b: '#161F36', stroke: '#0A1222', detail: '#E8DCC0', eye: '#E8DCC0', mask: '#0E1629' }
  };
  var ON_DARK = { a: '#4A5C84', b: '#2A3756', stroke: '#D9CFBA', detail: '#E8DCC0', eye: '#E8DCC0', mask: '#1A2540' };
  function svg(color, type, bold, onDark) {
    var c = onDark && color === 'b' ? ON_DARK : SETS[color];
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">' +
      '<defs><linearGradient id="f" gradientUnits="userSpaceOnUse" x1="24" y1="0" x2="76" y2="0"><stop offset="0" stop-color="' + c.a + '"/><stop offset="1" stop-color="' + c.b + '"/></linearGradient></defs>' +
      '<style>.g{fill:url(#f);stroke:' + c.stroke + ';stroke-width:' + (bold ? 5 : 2.6) + ';stroke-linejoin:round}' +
      '.g .d{fill:none;stroke:' + c.detail + ';stroke-width:2.6;stroke-linecap:round}' +
      '.g .e{fill:' + c.eye + ';stroke:none}' +
      '.g .t{fill:' + (color === 'w' ? c.a : c.detail) + ';stroke:' + c.stroke + ';stroke-width:1.6;stroke-linejoin:round}' +
      '.g .m{fill:' + c.mask + ';stroke:none}.g .o{fill:none}</style>' +
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
