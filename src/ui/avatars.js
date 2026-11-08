/* Tempo portraits.
   The characters each get an original badge, never a drawing of the character: their initials on their tier's color,
   with a small mark for how they play (a flame for a gambiteer, a shield for a defender, a crown for the champion).
   The original ladder bots keep their small drawn portraits, so old games still show who they were against. */
var TempoAvatars = (function () {
  'use strict';
  // what each tone paints with: the figure and the accent on that background
  var INK = {
    cream: { bg: '#EFE3C4', f: '#1B2A4A', a: '#C9A227', eye: '#EFE3C4' },
    gold: { bg: '#D4AF37', f: '#1B2A4A', a: '#F7EFD9', eye: '#D4AF37' },
    navy: { bg: '#1B2A4A', f: '#F3E9CF', a: '#D4AF37', eye: '#1B2A4A' }
  };
  // shared parts
  var SHOULDERS = 'M12 64 C12 50 22 44 32 44 C42 44 52 50 52 64 Z';
  function head(cx, cy, r) { return '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="F"/>'; }
  function eyes(y, dx, r) { return '<circle cx="' + (32 - dx) + '" cy="' + y + '" r="' + (r || 1.9) + '" fill="E"/><circle cx="' + (32 + dx) + '" cy="' + y + '" r="' + (r || 1.9) + '" fill="E"/>'; }
  function smile(y, w) { return '<path d="M' + (32 - w) + ' ' + y + ' Q32 ' + (y + w * 0.9) + ' ' + (32 + w) + ' ' + y + '" fill="none" stroke="E" stroke-width="1.8" stroke-linecap="round"/>'; }
  function body() { return '<path d="' + SHOULDERS + '" fill="F"/>'; }

  var ART = {
    // a small kid with a tuft of hair and big round eyes
    pip: body() + head(32, 28, 13) +
      '<path d="M22 20 C22 12 26 8 30 11 C32 6 37 7 38 12 C42 11 44 15 42 20 C39 17 35 17 32 18 C29 17 25 18 22 20 Z" fill="A"/>' +
      eyes(28, 5, 2.6) + smile(33, 3.5),
    // two buns and a wide smile: trades everything
    rosie: body() + head(32, 29, 13) +
      '<circle cx="17" cy="26" r="6" fill="A"/><circle cx="47" cy="26" r="6" fill="A"/>' +
      '<path d="M20 26 C20 18 26 15 32 15 C38 15 44 18 44 26 L41 26 C40 21 36 19 32 19 C28 19 24 21 23 26 Z" fill="A"/>' +
      eyes(30, 5, 2) + smile(35, 4),
    // sharp spikes of hair and a pointed grin: attacks early
    theo: body() + head(32, 29, 13) +
      '<path d="M19 26 C19 19 22 16 24 16 L23 9 L28 15 L32 7 L35 15 L41 10 L40 17 C43 18 45 21 45 26 L41 24 C39 20 35 19 32 19 C29 19 25 20 23 24 Z" fill="A"/>' +
      eyes(30, 5, 2) + '<path d="M27 35 L37 35" stroke="E" stroke-width="1.8" stroke-linecap="round"/>',
    // a bun on top and round glasses: never met a check she didn't give
    mabel: body() + head(32, 30, 13) +
      '<circle cx="32" cy="14" r="5" fill="A"/><path d="M20 28 C21 20 26 17 32 17 C38 17 43 20 44 28 Z" fill="A"/>' +
      '<circle cx="26" cy="31" r="4.2" fill="none" stroke="A" stroke-width="1.8"/><circle cx="38" cy="31" r="4.2" fill="none" stroke="A" stroke-width="1.8"/><path d="M30 31 H34" stroke="A" stroke-width="1.8"/>' +
      eyes(31, 6, 1.6) + smile(37, 3),
    // flat cap and a square jaw: solid and steady
    gus: '<path d="M10 64 C10 50 21 43 32 43 C43 43 54 50 54 64 Z" fill="F"/>' +
      '<rect x="20" y="20" width="24" height="22" rx="7" fill="F"/>' +
      '<path d="M17 21 C18 13 25 9 32 9 C39 9 46 13 47 21 Z" fill="A"/><rect x="15" y="20" width="34" height="3.5" rx="1.75" fill="A"/>' +
      eyes(29, 5, 1.9) + '<path d="M27 36 H37" stroke="E" stroke-width="1.8" stroke-linecap="round"/>',
    // a neat bob and a book: studying her openings
    nora: body() + head(32, 29, 13) +
      '<path d="M18 33 C18 17 26 14 32 14 C38 14 46 17 46 33 L42 33 C42 24 38 20 32 20 C26 20 22 24 22 33 Z" fill="A"/>' +
      '<rect x="22" y="48" width="20" height="13" rx="2" fill="A"/><path d="M32 48 V61" stroke="F" stroke-width="1.5"/>' +
      eyes(30, 5, 2) + smile(35, 3),
    // hair swept to one side and one raised brow: tricky
    felix: body() + head(32, 29, 13) +
      '<path d="M19 27 C19 15 28 12 36 13 C44 14 48 20 47 27 L43 27 C43 21 38 18 33 19 C28 20 25 23 24 27 Z" fill="A"/>' +
      '<path d="M24 23 L30 25" stroke="E" stroke-width="1.8" stroke-linecap="round"/>' +
      eyes(30, 5, 2) + '<path d="M28 35 Q34 38 38 34" fill="none" stroke="E" stroke-width="1.8" stroke-linecap="round"/>',
    // long straight hair and calm, closed eyes: patient
    iris: '<path d="M18 30 C18 16 26 13 32 13 C38 13 46 16 46 30 L47 50 L40 50 L41 32 C41 25 37 21 32 21 C27 21 23 25 23 32 L24 50 L17 50 Z" fill="A"/>' + body() + head(32, 29, 13) +
      '<path d="M19 30 C19 16 26 14 32 14 C38 14 45 16 45 30 L42 30 C42 24 38 21 32 21 C26 21 22 24 22 30 Z" fill="A"/>' +
      '<path d="M25 31 Q27.5 33 30 31 M34 31 Q36.5 33 39 31" fill="none" stroke="E" stroke-width="1.8" stroke-linecap="round"/>' + smile(36, 3),
    // slicked hair and a neat moustache: the Italian, every game
    silas: body() + head(32, 29, 13) +
      '<path d="M19 26 C19 16 26 13 32 13 C38 13 45 16 45 26 L43 24 C40 20 36 19 32 19 C28 19 24 20 21 24 Z" fill="A"/>' +
      '<path d="M25 35 C27 32 30 33 32 35 C34 33 37 32 39 35 C37 37 34 37 32 36 C30 37 27 37 25 35 Z" fill="A"/>' +
      eyes(30, 5, 2),
    // a ponytail and a headband: tournament regular
    vera: '<path d="M38 24 C48 26 50 40 46 52 L41 50 C44 40 42 32 36 28 Z" fill="A"/>' + body() + head(32, 29, 13) +
      '<path d="M19 27 C19 16 26 14 32 14 C38 14 45 16 45 27 L42 27 C42 22 38 19 32 19 C26 19 22 22 22 27 Z" fill="A"/>' +
      '<path d="M20 23 C24 20 40 20 44 23" fill="none" stroke="E" stroke-width="2.2" stroke-linecap="round"/>' +
      eyes(30, 5, 2) + smile(35, 3),
    // bald, with bushy brows and a big moustache: grinds out endgames
    otto: body() + head(32, 29, 14) +
      '<path d="M22 24 L29 23 M35 23 L42 24" stroke="A" stroke-width="3" stroke-linecap="round"/>' +
      '<path d="M21 36 C25 32 29 33 32 35 C35 33 39 32 43 36 C40 40 35 40 32 38 C29 40 24 40 21 36 Z" fill="A"/>' +
      eyes(29, 5, 2),
    // an elegant updo and small earrings: expert
    celeste: body() + head(32, 30, 13) +
      '<path d="M22 28 C20 18 24 10 32 10 C40 10 44 18 42 28 L39 28 C40 21 37 17 32 17 C27 17 24 21 25 28 Z" fill="A"/><circle cx="32" cy="10" r="4" fill="A"/>' +
      '<circle cx="19.5" cy="35" r="1.8" fill="A"/><circle cx="44.5" cy="35" r="1.8" fill="A"/>' +
      eyes(31, 5, 2) + smile(36, 3),
    // a peaked cap and epaulettes
    admiral: body() + '<rect x="12" y="48" width="9" height="4" rx="2" fill="A"/><rect x="43" y="48" width="9" height="4" rx="2" fill="A"/>' +
      head(32, 31, 13) +
      '<path d="M17 24 C18 15 25 11 32 11 C39 11 46 15 47 24 Z" fill="A"/><path d="M15 24 H49 L47 28 H17 Z" fill="A"/>' +
      '<circle cx="32" cy="18" r="2.6" fill="F"/>' +
      eyes(32, 5, 1.9) + '<path d="M27 38 H37" stroke="E" stroke-width="1.8" stroke-linecap="round"/>',
    // not a person: the fish itself
    stockfish: '<path d="M10 32 C18 18 34 16 46 24 L56 16 L54 32 L56 48 L46 40 C34 48 18 46 10 32 Z" fill="F"/>' +
      '<path d="M22 32 C26 26 34 24 42 27" fill="none" stroke="A" stroke-width="2" stroke-linecap="round"/>' +
      '<circle cx="20" cy="30" r="2.4" fill="E"/>'
  };

  /* ---------- character badges ---------- */
  var TIER = {
    F: { bg: '#F3E9CF', ring: '#C9A227', ink: '#1B2A4A', mark: '#A8841B' },
    D: { bg: '#E4CF98', ring: '#1B2A4A', ink: '#1B2A4A', mark: '#6E5410' },
    C: { bg: '#D4AF37', ring: '#1B2A4A', ink: '#1B2A4A', mark: '#FBF5E4' },
    B: { bg: '#3D4E73', ring: '#D4AF37', ink: '#F3E9CF', mark: '#D4AF37' },
    A: { bg: '#1B2A4A', ring: '#D4AF37', ink: '#F3E9CF', mark: '#D4AF37' },
    S: { bg: '#0D1529', ring: '#D4AF37', ink: '#E7C65A', mark: '#F3E9CF' },
    bonus: { bg: '#24113A', ring: '#D4AF37', ink: '#F3E9CF', mark: '#D4AF37' }
  };
  // marks are drawn in a 16-unit box around 0,0; "s:" paths are strokes, the rest are filled
  var MARK = {
    chaos: 's:M-6 1 C-6 -5 3 -6 4.5 -1.5 C6 3 0 5.5 -2.2 2.2 C-3.6 0 -0.8 -2.4 1 -0.6',
    surprise: 'M-1.4 -7 H1.4 L0.9 2 H-0.9 Z M0 3.6 A1.7 1.7 0 1 1 -0.01 3.6 Z',
    hunter: 's:M0 -6.5 V-2.5 M0 2.5 V6.5 M-6.5 0 H-2.5 M2.5 0 H6.5 M4.6 0 A4.6 4.6 0 1 1 -4.6 0 A4.6 4.6 0 1 1 4.6 0',
    retreater: 's:M6 0 H-5 M-1 -4.5 L-5.5 0 L-1 4.5',
    reckless: 'M1.6 -7.5 L-5 1 H-0.6 L-1.8 7.5 L5 -1.2 H0.6 Z',
    attacker: 'M0 -7.5 L5.5 1.5 H1.6 V7 H-1.6 V1.5 H-5.5 Z',
    defender: 'M0 -7 L6 -4.6 V0.2 C6 4 3.2 6.4 0 7.6 C-3.2 6.4 -6 4 -6 0.2 V-4.6 Z',
    investigator: 's:M2 2 L6.2 6.2 M3.2 -1.6 A4.4 4.4 0 1 1 -5.6 -1.6 A4.4 4.4 0 1 1 3.2 -1.6',
    inventor: 'M-1.3 -7 H1.3 L1.8 -4.7 L3.9 -5.9 L5.8 -4 L4.6 -1.9 L7 -1.3 V1.3 L4.6 1.9 L5.8 4 L3.9 5.9 L1.8 4.7 L1.3 7 H-1.3 L-1.8 4.7 L-3.9 5.9 L-5.8 4 L-4.6 1.9 L-7 1.3 V-1.3 L-4.6 -1.9 L-5.8 -4 L-3.9 -5.9 L-1.8 -4.7 Z M0 -2.3 A2.3 2.3 0 1 0 0.01 -2.3 Z',
    theorist: 'M-0.6 -3.8 C-2.6 -5.6 -5.2 -5.8 -7 -5 V5.2 C-5.2 4.4 -2.6 4.6 -0.6 6.2 Z M0.6 -3.8 C2.6 -5.6 5.2 -5.8 7 -5 V5.2 C5.2 4.4 2.6 4.6 0.6 6.2 Z',
    allrounder: 'M0 -7.5 L1.9 -1.9 L7.5 0 L1.9 1.9 L0 7.5 L-1.9 1.9 L-7.5 0 L-1.9 -1.9 Z',
    builder: 'M-7 -6 H-0.6 V-1.2 H-7 Z M0.6 -6 H7 V-1.2 H0.6 Z M-4 0.6 H4 V5.6 H-4 Z',
    adaptive: 's:M-7 -1.5 C-5 -5.5 -2 -5.5 0 -1.5 C2 2.5 5 2.5 7 -1.5 M-7 3.5 C-5 -0.5 -2 -0.5 0 3.5 C2 7.5 5 7.5 7 3.5',
    trapper: 's:M0 -6.5 L6.5 0 L0 6.5 L-6.5 0 Z M-3.25 -3.25 L3.25 3.25 M3.25 -3.25 L-3.25 3.25',
    gambiteer: 'M0 -7.5 C3.4 -3.4 5.4 -1 5.4 2.2 C5.4 5.4 2.8 7.5 0 7.5 C-2.8 7.5 -5.4 5.4 -5.4 2.2 C-5.4 -0.6 -3 -0.2 -1.4 -2.8 C-0.4 -1 1.2 -1.8 0 -7.5 Z',
    calculator: 's:M-6.5 -4.5 H6.5 M-6.5 0 H6.5 M-6.5 4.5 H6.5 M-3 -6 V-3 M2 -1.5 V1.5 M-1 3 V6',
    technician: 'M-3.6 -6.5 H3.6 L7 -1.6 L0 7.5 L-7 -1.6 Z',
    positional: 's:M0 -4.6 V6.4 M-5.6 2 C-5.6 5.2 -2.6 6.4 0 6.4 C2.6 6.4 5.6 5.2 5.6 2 M-3.4 -1.6 H3.4 M1.7 -6.3 A1.7 1.7 0 1 1 -1.7 -6.3 A1.7 1.7 0 1 1 1.7 -6.3',
    champion: 'M-7.5 5 L-6.4 -4.4 L-3 -0.4 L0 -6.6 L3 -0.4 L6.4 -4.4 L7.5 5 Z'
  };
  function mark(kind, color) {
    var d = MARK[kind] || MARK.allrounder, stroke = d.indexOf('s:') === 0;
    if (stroke) return '<path d="' + d.slice(2) + '" fill="none" stroke="' + color + '" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/>';
    return '<path d="' + d + '" fill="' + color + '" fill-rule="evenodd"/>';
  }
  function badge(bot) {
    var c = bot.bonus ? TIER.bonus : TIER[bot.tier] || TIER.F, mono = String(bot.mono || bot.name.charAt(0)).slice(0, 2);
    var size = mono.length > 1 ? 20 : 25, y = mono.length > 1 ? 30 : 32;
    return '<svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="32" fill="' + c.bg + '"/>' +
      '<circle cx="32" cy="32" r="28.6" fill="none" stroke="' + c.ring + '" stroke-width="1.4" opacity="0.85"/>' +
      (bot.boss || bot.bonus ? '<circle cx="32" cy="32" r="25.8" fill="none" stroke="' + c.ring + '" stroke-width="0.9" opacity="0.6"/>' : '') +
      '<text x="32" y="' + y + '" text-anchor="middle" font-family="Tempo Serif, DM Serif Display, Georgia, serif" font-size="' + size + '" fill="' + c.ink + '" letter-spacing="0.5">' + mono.replace(/[<&]/g, '') + '</text>' +
      '<g transform="translate(32 46) scale(0.78)">' + mark(bot.arche, c.mark) + '</g></svg>';
  }

  /* an <svg> string for an opponent: a character's badge, or an original ladder bot's portrait */
  function svg(bot) {
    if (bot.tier) return badge(bot);
    var c = INK[bot.tone] || INK.cream, art = ART[bot.id];
    if (!art) return '';
    art = art.replace(/"F"/g, '"' + c.f + '"').replace(/"A"/g, '"' + c.a + '"').replace(/"E"/g, '"' + c.eye + '"');
    return '<svg viewBox="0 0 64 64" aria-hidden="true"><clipPath id="av-' + bot.id + '"><circle cx="32" cy="32" r="32"/></clipPath>' +
      '<circle cx="32" cy="32" r="32" fill="' + c.bg + '"/><g clip-path="url(#av-' + bot.id + ')">' + art + '</g></svg>';
  }
  return { svg: svg, MARK: MARK, has: function (id) { return !!ART[id] || !!(window.TempoBots && TempoBots.byId(id)); } };
})();
