/* Tempo piece set: original Staunton-style vector pieces drawn on a 100x100 grid,
   lit from the left with a soft gradient, outlined in navy. */
var TempoPieces = (function () {
  'use strict';
  // every piece stands on the same rounded foot; w is its half-width
  function foot(w) { return '<rect x="' + (50 - w) + '" y="79" width="' + (2 * w) + '" height="11" rx="4"/>'; }
  var SHAPES = {
    p: '<path d="M41.5 48 C41.5 60 36 71 30.5 79.5 H69.5 C64 71 58.5 60 58.5 48 Z"/>' +
       '<circle cx="50" cy="31" r="12.5"/>' +
       '<rect x="36.5" y="43.5" width="27" height="6.5" rx="3.25"/>' + foot(23),
    r: '<path d="M34 38 H66 L69.5 79.5 H30.5 Z"/>' +
       '<path d="M28 13 H38.5 V21 H44.5 V13 H55.5 V21 H61.5 V13 H72 V32 C72 34.5 70.5 36 68 36 H32 C29.5 36 28 34.5 28 32 Z"/>' +
       '<rect x="31" y="34" width="38" height="6.5" rx="2.5"/>' +
       '<rect x="29" y="72" width="42" height="7.5" rx="2.5"/>' + foot(26),
    b: '<path d="M41.5 58 C41.5 66 36.5 73.5 31.5 79.5 H68.5 C63.5 73.5 58.5 66 58.5 58 Z"/>' +
       '<circle cx="50" cy="12.5" r="5"/>' +
       '<path d="M50 17.5 C62 25 68 36 65.5 46 C63.5 53 57.5 56.5 50 56.5 C42.5 56.5 36.5 53 34.5 46 C32 36 38 25 50 17.5 Z"/>' +
       '<rect x="35" y="53.5" width="30" height="6.5" rx="3.25"/>' + foot(24) +
       '<path class="d" d="M57 27.5 L46 42"/>',
    n: '<path d="M30 79.5 C29 73 30 68 35 64 C39 61 42 58 44 55 C40 54.5 35 55.5 31 55.5 C28.5 56.6 26.5 56.6 25 55.8 C23.8 55 22.5 53.5 22 52 C20.8 50 20.6 47.5 21.5 45.5 C25 39 29 32 33 27 C36 23 40 19 43 16.5 C44.5 13 46.5 9 48 6 C50.5 8.5 53.5 11.5 56 15 C59 16 63 18 66 21 C71.5 27 75.5 34 76.5 42 C77.5 55 76.5 68 74.5 79.5 Z"/>' +
       '<path d="M56 15 C63 18 71.5 26 75 36 C77.5 46 77.5 62 74.5 79.5 L68.5 79.5 C70 74 69.5 70 67 66 C69.5 62 69 58 66 54.5 C68.5 50.5 67.5 46.5 64.5 43.5 C66.5 39.5 65 35.5 61.5 33 C63 29 61 25.5 57.5 23.5 C58.5 20.5 57.5 17.5 56 15 Z"/>' +
       foot(25) +
       '<ellipse class="e" cx="37" cy="31" rx="3" ry="2.1" transform="rotate(-38 37 31)"/>' +
       '<ellipse class="e" cx="25.6" cy="47.2" rx="1.7" ry="1.15" transform="rotate(-30 25.6 47.2)"/>' +
       '<path class="d" d="M22.4 52 C24 51.6 25.6 51.4 27.2 51.3"/>' +
       '<path class="d" d="M46.5 33.5 C50 41 48 49.5 42.5 53.5"/>' +
       '<path class="d" d="M47.4 11.5 C48.8 13 50.2 14.8 50.8 16.6"/>',
    q: '<path d="M37.5 61 C37.5 69 33 75 29.5 79.5 H70.5 C67 75 62.5 69 62.5 61 Z"/>' +
       '<path d="M37.5 57 C35.5 49 31 40 26.5 30.5 L38 37 L38.5 22 L45 35.5 L50 18.5 L55 35.5 L61.5 22 L62 37 L73.5 30.5 C69 40 64.5 49 62.5 57 Z"/>' +
       '<circle cx="25.5" cy="27.5" r="4.4"/><circle cx="38.5" cy="18.5" r="4.4"/><circle cx="50" cy="14.5" r="4.8"/><circle cx="61.5" cy="18.5" r="4.4"/><circle cx="74.5" cy="27.5" r="4.4"/>' +
       '<rect x="33" y="55.5" width="34" height="6.5" rx="3.25"/>' + foot(27) +
       '<path class="d" d="M32.5 46 C42 43.5 58 43.5 67.5 46"/>',
    k: '<path d="M37.5 61 C37.5 69 33 75 29.5 79.5 H70.5 C67 75 62.5 69 62.5 61 Z"/>' +
       '<path d="M37.5 57 C35 49 31.5 42 29.5 35 C29 32.5 30.5 31 33 30.5 C43 28.5 57 28.5 67 30.5 C69.5 31 71 32.5 70.5 35 C68.5 42 65 49 62.5 57 Z"/>' +
       '<path d="M33.5 30.5 C34.5 21.5 41.5 18.5 50 18.5 C58.5 18.5 65.5 21.5 66.5 30.5 Z"/>' +
       '<path d="M46.5 2.5 H53.5 V8.2 H59.5 V15.2 H53.5 V20 H46.5 V15.2 H40.5 V8.2 H46.5 Z"/>' +
       '<rect x="33" y="55.5" width="34" height="6.5" rx="3.25"/>' + foot(27) +
       '<path class="d" d="M32 41 C42 38.5 58 38.5 68 41"/>'
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
      '<style>.g{fill:url(#f);stroke:' + c.stroke + ';stroke-width:' + (bold ? 5.5 : 3) + ';stroke-linejoin:round}' +
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
