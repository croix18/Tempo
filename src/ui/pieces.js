/* Tempo piece set: original Staunton-style vector pieces drawn on a 100x100 grid,
   lit from the left with a soft gradient, outlined in navy. */
var TempoPieces = (function () {
  'use strict';
  var SHAPES = {
    p: '<path d="M57 44 C57 44 58.42 49 59.5 52 C60.58 55 62.08 58.67 63.5 62 C64.92 65.33 66.67 68.92 68 72 C69.33 75.08 71.5 80.5 71.5 80.5 L50.01 80.5 L49.99 80.5 L28.5 80.5 C28.5 80.5 30.67 75.08 32 72 C33.33 68.92 35.08 65.33 36.5 62 C37.92 58.67 39.42 55 40.5 52 C41.58 49 43 44 43 44 L57 44 Z"/><circle cx="50" cy="30.5" r="11.5"/><rect x="37.5" y="41" width="25" height="5" rx="2.5"/><path d="M27 80 H73 V86.5 Q73 90 69.5 90 H30.5 Q27 90 27 86.5 Z"/>',
    r: '<path d="M35.5 38 H64.5 L67.5 72 H32.5 Z"/><path d="M30 14 H38 V21 H45 V14 H55 V21 H62 V14 H70 V31.5 Q70 35 66.5 35 H33.5 Q30 35 30 31.5 Z"/><rect x="30" y="33.5" width="40" height="5" rx="2.5"/><rect x="28.5" y="70.5" width="43" height="6" rx="3"/><path d="M24.5 80 H75.5 V86.5 Q75.5 90 72 90 H28 Q24.5 90 24.5 86.5 Z"/>',
    b: '<path d="M58 56 C58 56 59.42 61.33 60.5 64 C61.58 66.67 63.08 69.25 64.5 72 C65.92 74.75 69 80.5 69 80.5 L50.01 80.5 L49.99 80.5 L31 80.5 C31 80.5 34.08 74.75 35.5 72 C36.92 69.25 38.42 66.67 39.5 64 C40.58 61.33 42 56 42 56 L58 56 Z"/><circle cx="50" cy="12" r="4.6"/><path d="M52.5 15.5 C54.17 16.58 56 19.42 57.5 22 C59 24.58 60.5 27.83 61.5 31 C62.5 34.17 63.42 37.92 63.5 41 C63.58 44.08 62.83 47.08 62 49.5 C61.17 51.92 58.5 55.5 58.5 55.5 L50.01 55.5 L49.99 55.5 L41.5 55.5 C41.5 55.5 38.83 51.92 38 49.5 C37.17 47.08 36.42 44.08 36.5 41 C36.58 37.92 37.5 34.17 38.5 31 C39.5 27.83 41 24.58 42.5 22 C44 19.42 45.83 16.58 47.5 15.5 C49.17 14.42 50.83 14.42 52.5 15.5 Z"/><rect x="35.5" y="53" width="29" height="5" rx="2.5"/><path d="M26.5 80 H73.5 V86.5 Q73.5 90 70 90 H30 Q26.5 90 26.5 86.5 Z"/><path class="d" d="M56.5 25.5 L47 40"/>',
    n: '<path d="M29 72.5 C29 66 31.5 60 36.5 56 C40.5 52.5 42.5 49 43 45.5 C39 46.5 33.5 47 28.5 46 C23 45 19.5 42 19 38 C18.5 34.5 20.5 32 23.5 30.5 C26.5 29.5 30 29 33.5 28.5 C34 25 35.5 21.5 38.5 18.5 C40.5 16.5 43.5 14.5 46 13 C45.5 9.5 46 6 48 2.5 C50.5 5.5 52 9 52.5 12.5 C54 12 55.5 12 57 12.5 C57.5 9 59 6 61.5 3.5 C63 7 63.5 10.5 63 14 C69 18 74.5 25 76.5 35 C78.5 48 77.5 61 75 72.5 Z"/><path d="M61.5 14 C68 18 73 25.5 74 36 C75.5 48 75 61 73 72.5 L67 72.5 C68.5 66 67 62 62.5 58.5 C66.5 54.5 66.5 49.5 62 46 C66 42 65 37.5 60.5 34.5 C63.5 30.5 62 26 58.5 23 C60 19.5 59.5 16 58 13 Z"/><rect x="27" y="70.5" width="46" height="6" rx="3"/><path d="M24.5 80 H75.5 V86.5 Q75.5 90 72 90 H28 Q24.5 90 24.5 86.5 Z"/><ellipse class="e" cx="41.5" cy="25" rx="3.6" ry="2.5" transform="rotate(-28 41.5 25)"/><path class="d" d="M37.5 20.5 C40 19.5 43 19.5 45.5 20.5"/><ellipse class="e" cx="24" cy="37" rx="2.1" ry="1.4" transform="rotate(-32 24 37)"/><path class="d" d="M21 42 C24 43 26.5 43.2 29 42.6"/><path class="d" d="M48.5 28 C51.5 35 49.5 42.5 44.5 47"/>',
    q: '<path d="M63.5 40 C63.5 40 62.42 46.67 62.5 50 C62.58 53.33 63 56.67 64 60 C65 63.33 66.83 66.58 68.5 70 C70.17 73.42 74 80.5 74 80.5 L50.01 80.5 L49.99 80.5 L26 80.5 C26 80.5 29.83 73.42 31.5 70 C33.17 66.58 35 63.33 36 60 C37 56.67 37.42 53.33 37.5 50 C37.58 46.67 36.5 40 36.5 40 L63.5 40 Z"/><path d="M30.5 39 L26.5 20.5 Q34 34 40.5 12.5 Q45.5 30 50 8.5 Q54.5 30 59.5 12.5 Q66 34 73.5 20.5 L69.5 39 Z"/><circle cx="26.5" cy="18" r="4.3"/><circle cx="40.5" cy="10" r="4.3"/><circle cx="50" cy="6" r="4.7"/><circle cx="59.5" cy="10" r="4.3"/><circle cx="73.5" cy="18" r="4.3"/><rect x="30" y="36.5" width="40" height="5.5" rx="2.75"/><rect x="33.5" y="58" width="33" height="5" rx="2.5"/><path d="M24 80 H76 V86.5 Q76 90 72.5 90 H27.5 Q24 90 24 86.5 Z"/><path class="d" d="M38 50 C44 48 56 48 62 50"/>',
    k: '<path d="M63.5 40 C63.5 40 62.42 46.67 62.5 50 C62.58 53.33 63 56.67 64 60 C65 63.33 66.83 66.58 68.5 70 C70.17 73.42 74 80.5 74 80.5 L50.01 80.5 L49.99 80.5 L26 80.5 C26 80.5 29.83 73.42 31.5 70 C33.17 66.58 35 63.33 36 60 C37 56.67 37.42 53.33 37.5 50 C37.58 46.67 36.5 40 36.5 40 L63.5 40 Z"/><path d="M51.5 23 C53.08 23.25 55.83 23.33 58 24.5 C60.17 25.67 62.83 27.67 64.5 30 C66.17 32.33 68 38.5 68 38.5 L50.01 38.5 L49.99 38.5 L32 38.5 C32 38.5 33.83 32.33 35.5 30 C37.17 27.67 39.83 25.67 42 24.5 C44.17 23.33 46.92 23.25 48.5 23 C50.08 22.75 49.92 22.75 51.5 23 Z"/><path d="M46.2 1 H53.8 V7.8 H60.5 V15.2 H53.8 V22 H46.2 V15.2 H39.5 V7.8 H46.2 Z"/><rect x="30" y="36.5" width="40" height="5.5" rx="2.75"/><rect x="33.5" y="58" width="33" height="5" rx="2.5"/><path d="M24 80 H76 V86.5 Q76 90 72.5 90 H27.5 Q24 90 24 86.5 Z"/><path class="d" d="M38 50 C44 48 56 48 62 50"/>'
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
