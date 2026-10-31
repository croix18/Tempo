/* Tempo piece set: original Staunton-style vector pieces drawn on a 100x100 grid,
   lit from the left with a soft gradient, outlined in navy. */
var TempoPieces = (function () {
  'use strict';
  var SHAPES = {
    p: '<path d="M57.5 44 C57.5 44 58.83 49 60 52 C61.17 55 62.92 58.67 64.5 62 C66.08 65.33 68 68.92 69.5 72 C71 75.08 73.5 80.5 73.5 80.5 L50.01 80.5 L49.99 80.5 L26.5 80.5 C26.5 80.5 29 75.08 30.5 72 C32 68.92 33.92 65.33 35.5 62 C37.08 58.67 38.83 55 40 52 C41.17 49 42.5 44 42.5 44 L57.5 44 Z"/><circle cx="50" cy="30" r="12"/><rect x="36.5" y="40.5" width="27" height="5.2" rx="2.6"/><path d="M25 80 H75 V86.5 Q75 90 71.5 90 H28.5 Q25 90 25 86.5 Z"/>',
    r: '<path d="M34.5 40 H65.5 L68.5 72 H31.5 Z"/><path d="M28 13 H37 V21 H43 V13 H57 V21 H63 V13 H72 V32 Q72 35.5 68.5 35.5 H31.5 Q28 35.5 28 32 Z"/><rect x="29" y="34" width="42" height="5.5" rx="2.75"/><rect x="27" y="70.5" width="46" height="6.5" rx="3.25"/><path d="M23 80 H77 V86.5 Q77 90 73.5 90 H26.5 Q23 90 23 86.5 Z"/>',
    b: '<path d="M58.5 57 C58.5 57 59.83 62.33 61 65 C62.17 67.67 63.92 70.42 65.5 73 C67.08 75.58 70.5 80.5 70.5 80.5 L50.01 80.5 L49.99 80.5 L29.5 80.5 C29.5 80.5 32.92 75.58 34.5 73 C36.08 70.42 37.83 67.67 39 65 C40.17 62.33 41.5 57 41.5 57 L58.5 57 Z"/><circle cx="50" cy="11" r="4.8"/><path d="M52.5 14.5 C54.25 15.58 56.33 18.42 58 21 C59.67 23.58 61.42 26.67 62.5 30 C63.58 33.33 64.5 37.67 64.5 41 C64.5 44.33 63.42 47.42 62.5 50 C61.58 52.58 59 56.5 59 56.5 L50.01 56.5 L49.99 56.5 L41 56.5 C41 56.5 38.42 52.58 37.5 50 C36.58 47.42 35.5 44.33 35.5 41 C35.5 37.67 36.42 33.33 37.5 30 C38.58 26.67 40.33 23.58 42 21 C43.67 18.42 45.75 15.58 47.5 14.5 C49.25 13.42 50.75 13.42 52.5 14.5 Z"/><path class="d" d="M56.5 24 L47 39"/><rect x="34.5" y="54" width="31" height="5.2" rx="2.6"/><path d="M25.5 80 H74.5 V86.5 Q74.5 90 71 90 H29 Q25.5 90 25.5 86.5 Z"/>',
    n: '<path d="M32 72 C32 63 35.5 55.5 41 50.5 C38 50.5 34 50 30 48.5 C24.5 46.5 20 43.5 19 39.5 C18.5 36 20 33 22.5 31 C26 28.5 30 27.5 34 27 C35 23.5 37 19.5 40 16.5 C40.5 12.5 42.5 8 45 4.5 C47.5 7.5 49 11 49.5 14 C51.5 13.5 53.5 13.5 55.5 14 C56.5 10.5 58.5 7 61.5 4 C62.5 8 62.5 12 62 15.5 C69.5 19 75 26.5 75.5 36 C79 41.5 78 47.5 73.5 50 C78.5 54.5 78 60.5 72.5 62 C77 65.5 77 69 75 72 Z"/><path d="M60.5 16 C67 19.5 72 26.5 72.5 36 C75.5 41.5 74.5 47.5 70 50 C75 54.5 74 60.5 69 62 C73 65.5 73 69 71 72 L65.5 72 C67 66 65 61 60 57.5 C65 53.5 65 48 60 44 C64.5 40 63.5 35 58.5 31.5 C62 27.5 61 23 57 19.5 Z"/><rect x="27" y="70.5" width="46" height="6" rx="3"/><path d="M24.5 80 H75.5 V86.5 Q75.5 90 72 90 H28 Q24.5 90 24.5 86.5 Z"/><ellipse class="e" cx="39" cy="24" rx="3.4" ry="2.4" transform="rotate(-25 39 24)"/><ellipse class="e" cx="24" cy="35" rx="2.1" ry="1.5" transform="rotate(-30 24 35)"/><path class="d" d="M21.5 42 C24.5 43.4 27.5 43.6 30.5 43"/><path class="d" d="M46 27.5 C49 34 47 41 42.5 45.5"/>',
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
