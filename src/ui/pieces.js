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
    n: '<path d="M27 79.5 C27 72 29.5 66 34 61 C38 57 41 54 42.5 50 C37.5 50.5 32 51.5 27.5 51 C23 50.5 19.5 48 18.5 44.5 C17.5 41 20 38 23.5 36.5 C27 35 30.5 34.5 33 33.5 C33.5 30 35 27 37.5 24.5 C40.5 21 44 18 46.5 15.5 L48 4.5 L54 14 L62 6 L62.5 17.5 C69 21 74.5 29 76.5 40 C78.5 52 77.5 66 75.5 79.5 Z"/>' +
       '<path d="M60.5 17 C67 22 72 30 73 40 C74.5 52 74.5 66 73 79.5 L66 79.5 C68 71 66 67 61.5 63.5 C66 59.5 66.5 54.5 61.5 50.5 C65.5 46.5 65 42 60.5 38.5 C64 34.5 62.5 30 58.5 27 C60.5 23.5 60 20 58 17.5 Z"/>' +
       foot(26) +
       '<ellipse class="e" cx="41" cy="29.5" rx="3.4" ry="2.4" transform="rotate(-30 41 29.5)"/>' +
       '<ellipse class="e" cx="23.5" cy="41.5" rx="2" ry="1.4" transform="rotate(-35 23.5 41.5)"/>' +
       '<path class="d" d="M20.5 47 C23 47.8 25.5 48 28 47.5"/>' +
       '<path class="d" d="M47 32 C50 39 48 46.5 43.5 51"/>',
    q: '<path d="M35 60 C35 69 31 75 28 79.5 H72 C69 75 65 69 65 60 Z"/>' +
       '<path d="M36 57 C34 50 32.5 45 31.5 39 H68.5 C67.5 45 66 50 64 57 Z"/>' +
       '<path d="M29 37 L26 21 L37 28.5 L39.5 12 L46.5 27 L50 7 L53.5 27 L60.5 12 L63 28.5 L74 21 L71 37 Z"/>' +
       '<circle cx="26" cy="19" r="5.2"/><circle cx="39.5" cy="10.5" r="5.2"/><circle cx="50" cy="5.5" r="5.6"/><circle cx="60.5" cy="10.5" r="5.2"/><circle cx="74" cy="19" r="5.2"/>' +
       '<rect x="29" y="34.5" width="42" height="6.5" rx="3"/>' +
       '<rect x="31" y="55" width="38" height="6.5" rx="3.25"/>' + foot(27) +
       '<path class="d" d="M34 47 C42 44.5 58 44.5 66 47"/>',
    k: '<path d="M35 60 C35 69 31 75 28 79.5 H72 C69 75 65 69 65 60 Z"/>' +
       '<path d="M36 57 C34 50 32.5 45 31.5 39 H68.5 C67.5 45 66 50 64 57 Z"/>' +
       '<path d="M32.5 36 C33 25 41 20.5 50 20.5 C59 20.5 67 25 67.5 36 Z"/>' +
       '<path d="M45 1.5 H55 V8.5 H62 V18 H55 V23.5 H45 V18 H38 V8.5 H45 Z"/>' +
       '<rect x="29" y="34.5" width="42" height="6.5" rx="3"/>' +
       '<rect x="31" y="55" width="38" height="6.5" rx="3.25"/>' + foot(27) +
       '<path class="d" d="M34 47 C42 44.5 58 44.5 66 47"/>'
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
