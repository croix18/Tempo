/* Tempo piece set: original vector pieces drawn on a 100x100 grid. */
var TempoPieces = (function () {
  'use strict';
  var BASE = '<rect x="26" y="72" width="48" height="8" rx="3"/><rect x="19" y="80" width="62" height="11" rx="4.5"/>';
  var SHAPES = {
    p: '<circle cx="50" cy="28" r="12.5"/>' +
       '<path d="M39 44 C38 56 33 64 29 72 L71 72 C67 64 62 56 61 44 Z"/>' +
       '<ellipse cx="50" cy="44" rx="15" ry="5"/>' + BASE,
    r: '<path d="M27 13 H38 V21 H44 V13 H56 V21 H62 V13 H73 V33 H27 Z"/>' +
       '<rect x="29" y="33" width="42" height="6" rx="1.5"/>' +
       '<path d="M33 39 H67 L70 72 H30 Z"/>' + BASE +
       '<path class="d" d="M33 46 H67"/>',
    b: '<circle cx="50" cy="11" r="5.5"/>' +
       '<path d="M50 17 C63 27 67 40 61 50 C57 56 43 56 39 50 C33 40 37 27 50 17 Z"/>' +
       '<ellipse cx="50" cy="57" rx="15" ry="4.5"/>' +
       '<path d="M42 61 C42 66 37 70 32 72 L68 72 C63 70 58 66 58 61 Z"/>' + BASE +
       '<path class="d" d="M55 27 L46 41"/>',
    n: '<path d="M30 72 C31 64 34 60 39 55 L29 56.5 C24 57 20 54 19.5 50 C19 46 20.5 43.5 23 41 C28 33 33 26 38.5 21 C41.5 17.5 45 14.5 48 12 L51 3.5 L57 12.5 C64.5 16.5 70.5 24 73.5 34 C77 46 75 58 72.5 72 Z"/>' + BASE +
       '<circle class="e" cx="40" cy="28.5" r="2.6"/>' +
       '<path class="d" d="M24.5 46.5 C26 45.5 27.5 45.5 28.5 46.5"/>' +
       '<path class="d" d="M60.5 17 C67 25 70.5 37 70 52"/>',
    q: '<circle cx="21" cy="25" r="5"/><circle cx="35.5" cy="15.5" r="5"/><circle cx="50" cy="11" r="5.5"/><circle cx="64.5" cy="15.5" r="5"/><circle cx="79" cy="25" r="5"/>' +
       '<path d="M22 29 L33 51 L36 20 L45 48 L50 16 L55 48 L64 20 L67 51 L78 29 L68 60 H32 Z"/>' +
       '<ellipse cx="50" cy="61" rx="18" ry="4.5"/>' +
       '<path d="M36 64 C35 68 31 71 28 72 L72 72 C69 71 65 68 64 64 Z"/>' + BASE,
    k: '<path d="M46.5 4 H53.5 V11 H60 V18 H53.5 V27 H46.5 V18 H40 V11 H46.5 Z"/>' +
       '<path d="M50 27 C62 27 72 32 72 42 C72 50 66 55 63 59 L37 59 C34 55 28 50 28 42 C28 32 38 27 50 27 Z"/>' +
       '<ellipse cx="50" cy="61" rx="17" ry="4.5"/>' +
       '<path d="M37 64 C36 68 32 71 29 72 L71 72 C68 71 64 68 63 64 Z"/>' + BASE +
       '<path class="d" d="M50 32 V55"/>'
  };
  var SETS = {
    w: { fill: '#FFFCF4', stroke: '#1B2A4A', detail: '#1B2A4A', eye: '#1B2A4A' },
    b: { fill: '#1F2C49', stroke: '#0A1222', detail: '#E8DCC0', eye: '#E8DCC0' }
  };
  // Black pieces drawn off the board on a dark page get a light outline, or they disappear.
  var ON_DARK = { fill: '#3B4D74', stroke: '#D9CFBA', detail: '#E8DCC0', eye: '#E8DCC0' };
  function svg(color, type, bold, onDark) {
    var c = onDark && color === 'b' ? ON_DARK : SETS[color];
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">' +
      '<style>.g{fill:' + c.fill + ';stroke:' + c.stroke + ';stroke-width:' + (bold ? 6 : 3.2) + ';stroke-linejoin:round}' +
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
