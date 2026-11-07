/* Tempo piece set: original Staunton-style vector pieces drawn on a 100x100 grid (the knight is a snarling wolf),
   lit from the left with a soft gradient, outlined in navy. */
var TempoPieces = (function () {
  'use strict';
  var SHAPES = {
    p: '<path d="M57.5 44 C57.5 44 58.83 49 60 52 C61.17 55 62.92 58.67 64.5 62 C66.08 65.33 68 68.92 69.5 72 C71 75.08 73.5 80.5 73.5 80.5 L50.01 80.5 L49.99 80.5 L26.5 80.5 C26.5 80.5 29 75.08 30.5 72 C32 68.92 33.92 65.33 35.5 62 C37.08 58.67 38.83 55 40 52 C41.17 49 42.5 44 42.5 44 L57.5 44 Z"/><circle cx="50" cy="30" r="12"/><rect x="36.5" y="40.5" width="27" height="5.2" rx="2.6"/><path d="M25 80 H75 V86.5 Q75 90 71.5 90 H28.5 Q25 90 25 86.5 Z"/>',
    r: '<path d="M34.5 40 H65.5 L68.5 72 H31.5 Z"/><path d="M28 13 H37 V21 H43 V13 H57 V21 H63 V13 H72 V32 Q72 35.5 68.5 35.5 H31.5 Q28 35.5 28 32 Z"/><rect x="29" y="34" width="42" height="5.5" rx="2.75"/><rect x="27" y="70.5" width="46" height="6.5" rx="3.25"/><path d="M23 80 H77 V86.5 Q77 90 73.5 90 H26.5 Q23 90 23 86.5 Z"/>',
    b: '<path d="M58.5 57 C58.5 57 59.83 62.33 61 65 C62.17 67.67 63.92 70.42 65.5 73 C67.08 75.58 70.5 80.5 70.5 80.5 L50.01 80.5 L49.99 80.5 L29.5 80.5 C29.5 80.5 32.92 75.58 34.5 73 C36.08 70.42 37.83 67.67 39 65 C40.17 62.33 41.5 57 41.5 57 L58.5 57 Z"/><circle cx="50" cy="11" r="4.8"/><path d="M52.5 14.5 C54.25 15.58 56.33 18.42 58 21 C59.67 23.58 61.42 26.67 62.5 30 C63.58 33.33 64.5 37.67 64.5 41 C64.5 44.33 63.42 47.42 62.5 50 C61.58 52.58 59 56.5 59 56.5 L50.01 56.5 L49.99 56.5 L41 56.5 C41 56.5 38.42 52.58 37.5 50 C36.58 47.42 35.5 44.33 35.5 41 C35.5 37.67 36.42 33.33 37.5 30 C38.58 26.67 40.33 23.58 42 21 C43.67 18.42 45.75 15.58 47.5 14.5 C49.25 13.42 50.75 13.42 52.5 14.5 Z"/><path class="d" d="M56.5 24 L47 39"/><rect x="34.5" y="54" width="31" height="5.2" rx="2.6"/><path d="M25.5 80 H74.5 V86.5 Q74.5 90 71 90 H29 Q25.5 90 25.5 86.5 Z"/>',
    // the knight is a wolf, after the school's: a snarl with rows of teeth, a heavy brow ledge over a narrow eye, ears up,
    // fur bursting from the cheek and down the back, and a two-tone face (the mask, .m, over the top of the head)
    n: '<path d="M33 72 C33.5 65 36 58 41 53 C39.5 54 37.5 55.5 35.5 57.5 C37.5 53.5 40.5 51.8 44 51.5 C40.5 53 36 54.3 32 54.2 L29 57.2 C27 56 25 54.5 24 52.2 C29.5 50 35 47 40 44.2 C33 43 25 41.8 18.5 40.8 C16.5 40.5 15.5 39 15.8 37.5 C16 35.5 17.5 34 19.5 33.5 C23 32.5 26.5 31.5 29.5 30.5 C30 28 32.5 25.5 36 24.8 C38 24.5 40.5 24.6 42.5 24.6 C43.5 23 44.5 21.5 46 20.5 C46.5 19.5 46.8 18.8 47 18 C47.5 12.5 48.5 7 50.5 2 C53 7 55.5 12 57 16 L60 13.5 L62 16.5 C63 12 64.5 7 66.5 2.5 C69 8 70.5 13 70.5 18 C73.5 20.5 76 24 76.5 27 C80 26.5 85 27.5 89 29 C83 32.5 79.5 36 79 40 C83 40 87 42 90 45 C84 47.5 80 51 79.5 54.5 C82.5 55 85.5 57 87 60 C81.5 61.5 78 64 77.5 67.5 C77.5 69 77 70.8 76.5 72 Z"/><path class="m" d="M29.5 30.5 C30 28 32.5 25.5 36 24.8 C38 24.5 40.5 24.6 42.5 24.6 C43.5 23 44.5 21.5 46 20.5 C46.5 19.5 46.8 18.8 47 18 C47.5 12.5 48.5 7 50.5 2 C53 7 55.5 12 57 16 L60 13.5 L62 16.5 C63 12 64.5 7 66.5 2.5 C69 8 70.5 13 70.5 18 C73.5 20.5 76 24 76.5 27 C80 26.5 85 27.5 89 29 C83 32.5 79.5 36 79 40 C83 40 87 42 90 45 C84 47.5 80 51 79.5 54.5 C82.5 55 85.5 57 87 60 C81.5 61.5 78 64 77.5 67.5 C77.5 69 77 70.8 76.5 72 L62 72 C61 65 58.5 58 55 52 L58.5 50 C54 46 50 42 46 38.5 L49 36.5 C45 34 41 32.5 38 32.5 C35 34.5 32 34 29.5 33 Z"/><path class="o" d="M33 72 C33.5 65 36 58 41 53 C39.5 54 37.5 55.5 35.5 57.5 C37.5 53.5 40.5 51.8 44 51.5 C40.5 53 36 54.3 32 54.2 L29 57.2 C27 56 25 54.5 24 52.2 C29.5 50 35 47 40 44.2 C33 43 25 41.8 18.5 40.8 C16.5 40.5 15.5 39 15.8 37.5 C16 35.5 17.5 34 19.5 33.5 C23 32.5 26.5 31.5 29.5 30.5 C30 28 32.5 25.5 36 24.8 C38 24.5 40.5 24.6 42.5 24.6 C43.5 23 44.5 21.5 46 20.5 C46.5 19.5 46.8 18.8 47 18 C47.5 12.5 48.5 7 50.5 2 C53 7 55.5 12 57 16 L60 13.5 L62 16.5 C63 12 64.5 7 66.5 2.5 C69 8 70.5 13 70.5 18 C73.5 20.5 76 24 76.5 27 C80 26.5 85 27.5 89 29 C83 32.5 79.5 36 79 40 C83 40 87 42 90 45 C84 47.5 80 51 79.5 54.5 C82.5 55 85.5 57 87 60 C81.5 61.5 78 64 77.5 67.5 C77.5 69 77 70.8 76.5 72 Z"/><path class="e" d="M18.5 40.8 C25 41.8 33 43 40 44.2 C35 47 29.5 50 24 52.2 C21 49 19 45 18.5 40.8 Z"/><path class="t" d="M20.5 41.2 L23.2 48.4 L26 41.9 Z"/><path class="t" d="M30.5 42.4 L32.4 46.9 L34.3 43 Z"/><path class="t" d="M26.6 51.4 L28.2 46.6 L29.9 50.8 Z"/><path class="t" d="M35.5 47.4 L36.6 45.1 L37.7 46.9 Z"/><rect x="27" y="70.5" width="46" height="6" rx="3"/><path d="M24.5 80 H75.5 V86.5 Q75.5 90 72 90 H28 Q24.5 90 24.5 86.5 Z"/><path class="e" d="M28.5 33.3 L34.5 29.4 L40.5 30.4 L36.2 34.3 Z"/><path class="e" d="M15.6 37.6 C15.6 35.6 16.8 34 18.6 33.4 C20 33.2 21 34.2 20.8 35.8 C20.6 37.4 19.6 38.6 18.4 38.8 C17.2 38.8 16.2 38.4 15.6 37.6 Z"/><path class="t" d="M49.5 7.5 C48.8 10 48.6 12.5 49 15 C50.5 14.5 52 14 53.3 13.5 Z"/><path class="t" d="M65.5 8 C64.8 10.5 64.6 13 65 15.5 C66.5 15 68 14.5 69.3 14 Z"/>',
    q: '<path d="M64 40 C64 40 62.92 46.67 63 50 C63.08 53.33 63.42 56.67 64.5 60 C65.58 63.33 67.67 66.58 69.5 70 C71.33 73.42 75.5 80.5 75.5 80.5 L50.01 80.5 L49.99 80.5 L24.5 80.5 C24.5 80.5 28.67 73.42 30.5 70 C32.33 66.58 34.42 63.33 35.5 60 C36.58 56.67 36.92 53.33 37 50 C37.08 46.67 36 40 36 40 L64 40 Z"/><path d="M33 39 C31 30 28 24 26 18 L34 26 L40 11.5 L46 25 L50 7.5 L54 25 L60 11.5 L66 26 L74 18 C72 24 69 30 67 39 Z"/><rect x="28.5" y="37" width="43" height="5.5" rx="2.75"/><rect x="32.5" y="58" width="35" height="5" rx="2.5"/><circle cx="26" cy="16.5" r="4.4"/><circle cx="40" cy="9.5" r="4.4"/><circle cx="50" cy="5.6" r="4.8"/><circle cx="60" cy="9.5" r="4.4"/><circle cx="74" cy="16.5" r="4.4"/><path d="M22.5 80 H77.5 V86.5 Q77.5 90 74 90 H26 Q22.5 90 22.5 86.5 Z"/><path class="d" d="M38 50 C44 48 56 48 62 50"/>',
    k: '<path d="M64 40 C64 40 62.92 46.67 63 50 C63.08 53.33 63.42 56.67 64.5 60 C65.58 63.33 67.67 66.58 69.5 70 C71.33 73.42 75.5 80.5 75.5 80.5 L50.01 80.5 L49.99 80.5 L24.5 80.5 C24.5 80.5 28.67 73.42 30.5 70 C32.33 66.58 34.42 63.33 35.5 60 C36.58 56.67 36.92 53.33 37 50 C37.08 46.67 36 40 36 40 L64 40 Z"/><path d="M52 23 C53.83 23.25 56.75 23.33 59 24.5 C61.25 25.67 63.83 27.67 65.5 30 C67.17 32.33 69 38.5 69 38.5 L50.01 38.5 L49.99 38.5 L31 38.5 C31 38.5 32.83 32.33 34.5 30 C36.17 27.67 38.75 25.67 41 24.5 C43.25 23.33 46.17 23.25 48 23 C49.83 22.75 50.17 22.75 52 23 Z"/><path d="M46 1 H54 V7.8 H61 V15.4 H54 V22.5 H46 V15.4 H39 V7.8 H46 Z"/><rect x="28.5" y="37" width="43" height="5.5" rx="2.75"/><rect x="32.5" y="58" width="35" height="5" rx="2.5"/><path d="M22.5 80 H77.5 V86.5 Q77.5 90 74 90 H26 Q22.5 90 22.5 86.5 Z"/><path class="d" d="M38 50 C44 48 56 48 62 50"/>'
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
