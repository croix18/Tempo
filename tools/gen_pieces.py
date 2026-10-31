# Generates the piece shapes in src/ui/pieces.js. Turned pieces come from a profile (y, half-width) mirrored about x=50;
# the knight is drawn by hand on the same plinth. Run: python3 tools/gen_pieces.py, then python3 build/build.py
import re, json

def fmt(v): return ('%.2f' % v).rstrip('0').rstrip('.')

def smooth_profile(pts, tension=0.5):
    """pts: list of (y, hw) top to bottom on the right side. Returns a closed path mirrored left, smooth through the points.
    A point may carry a third flag 'c' for a sharp corner."""
    right = [(50 + hw, y) for (y, hw, *f) in pts]
    flags = [(f[0] if f else '') for (y, hw, *f) in pts]
    left = [(50 - hw, y) for (y, hw, *f) in reversed(pts)]
    lflags = list(reversed(flags))
    ring = right + left
    rflags = flags + lflags
    n = len(ring)
    d = 'M%s %s' % (fmt(ring[0][0]), fmt(ring[0][1]))
    for i in range(n):
        p0 = ring[(i - 1) % n]; p1 = ring[i]; p2 = ring[(i + 1) % n]; p3 = ring[(i + 2) % n]
        if rflags[i] == 'c' and rflags[(i + 1) % n] == 'c':
            d += ' L%s %s' % (fmt(p2[0]), fmt(p2[1])); continue
        c1 = (p1[0] + (p2[0] - p0[0]) * tension / 3, p1[1] + (p2[1] - p0[1]) * tension / 3) if rflags[i] != 'c' else p1
        c2 = (p2[0] - (p3[0] - p1[0]) * tension / 3, p2[1] - (p3[1] - p1[1]) * tension / 3) if rflags[(i + 1) % n] != 'c' else p2
        d += ' C%s %s %s %s %s %s' % tuple(fmt(v) for v in (c1[0], c1[1], c2[0], c2[1], p2[0], p2[1]))
    return d + ' Z'

def path(d, cls=None): return '<path%s d="%s"/>' % ((' class="%s"' % cls) if cls else '', d)
def circle(cx, cy, r): return '<circle cx="%s" cy="%s" r="%s"/>' % (fmt(cx), fmt(cy), fmt(r))

# the shared foot: a low plinth with a rounded top edge, and a thin ring above it
def foot(hw):
    return path(smooth_profile([(79.5, hw - 3, 'c'), (80.5, hw, 'c'), (90, hw, 'c'), (90, hw - 0.01, 'c')]))
def plinth(hw):
    # plinth: flat top, rounded lower corners
    return '<path d="M%s 80 H%s V86.5 Q%s 90 %s 90 H%s Q%s 90 %s 86.5 Z"/>' % (fmt(50 - hw), fmt(50 + hw), fmt(50 + hw), fmt(50 + hw - 3.5), fmt(50 - hw + 3.5), fmt(50 - hw), fmt(50 - hw))
def ring(y, hw, h=4.6):
    return '<rect x="%s" y="%s" width="%s" height="%s" rx="%s"/>' % (fmt(50 - hw), fmt(y), fmt(2 * hw), fmt(h), fmt(h / 2))

SHAPES = {}
def under(y, hw, h=3.2):
    return ''
def _unused_under(y, hw, h=3.2):
    return '<rect class="s" x="%s" y="%s" width="%s" height="%s" rx="%s"/>' % (fmt(50 - hw), fmt(y), fmt(2 * hw), fmt(h), fmt(h / 2))
def gloss(x, y1, y2, w=3.2):
    return ''
def _unused_gloss(x, y1, y2, w=3.2):
    return '<rect class="h" x="%s" y="%s" width="%s" height="%s" rx="%s"/>' % (fmt(x), fmt(y1), fmt(w), fmt(y2 - y1), fmt(w / 2))
def ball(cx, cy, r):
    return circle(cx, cy, r)
def _unused_ball(cx, cy, r):
    return circle(cx, cy, r) + '<ellipse class="h" cx="%s" cy="%s" rx="%s" ry="%s"/>' % (fmt(cx - r * 0.32), fmt(cy - r * 0.35), fmt(r * 0.3), fmt(r * 0.22))

# ---- pawn: ball, collar, flared stem, wide plinth
SHAPES['p'] = (
    path(smooth_profile([(44, 7.5, 'c'), (52, 10), (62, 14.5), (72, 19.5), (80.5, 23.5, 'c'), (80.5, 0.01, 'c')])) +
    under(45.5, 7.5) + gloss(42.5, 47, 76) +
    ball(50, 30, 12) + ring(40.5, 13.5, 5.2) + plinth(25) + under(80, 22, 2.6))

# ---- rook: broad tower, four merlons on a wide rim, base ring, plinth
rook_body = '<path d="M34.5 40 H65.5 L68.5 72 H31.5 Z"/>'
rook_top = '<path d="M28 13 H37 V21 H43 V13 H57 V21 H63 V13 H72 V32 Q72 35.5 68.5 35.5 H31.5 Q28 35.5 28 32 Z"/>'
SHAPES['r'] = rook_body + under(40.5, 15) + gloss(38.5, 42, 70) + rook_top + gloss(31.5, 22, 32, 2.6) + ring(34, 21, 5.5) + ring(70.5, 23, 6.5) + plinth(27) + under(80, 24, 2.6)

# ---- bishop: teardrop mitre with a slit, ball finial, wide collar
SHAPES['b'] = (
    path(smooth_profile([(57, 8.5, 'c'), (65, 11), (73, 15.5), (80.5, 20.5, 'c'), (80.5, 0.01, 'c')])) +
    under(58.5, 8.5) + gloss(43.5, 60, 77) +
    ball(50, 11, 4.8) +
    path(smooth_profile([(14.5, 2.5), (21, 8), (30, 12.5), (41, 14.5), (50, 12.5), (56.5, 9, 'c'), (56.5, 0.01, 'c')])) +
    gloss(41, 24, 50, 2.6) + '<path class="d" d="M56.5 24 L47 39"/>' +
    ring(54, 15.5, 5.2) + plinth(24.5) + under(80, 21.5, 2.6))

# ---- queen and king share a tall waisted gown on a wide collar
def gown():
    return path(smooth_profile([(40, 14, 'c'), (50, 13), (60, 14.5), (70, 19.5), (80.5, 25.5, 'c'), (80.5, 0.01, 'c')])) + gloss(38.5, 42, 78)
# queen: a wide flared crown rim with five orbs rising from it
crown = '<path d="M33 39 C31 30 28 24 26 18 L34 26 L40 11.5 L46 25 L50 7.5 L54 25 L60 11.5 L66 26 L74 18 C72 24 69 30 67 39 Z"/>'
orbs = ball(26, 16.5, 4.4) + ball(40, 9.5, 4.4) + ball(50, 5.6, 4.8) + ball(60, 9.5, 4.4) + ball(74, 16.5, 4.4)
SHAPES['q'] = gown() + under(41.5, 14) + crown + ring(37, 21.5, 5.5) + ring(58, 17.5, 5) + under(63, 16) + orbs + plinth(27.5) + under(80, 24.5, 2.6) + '<path class="d" d="M38 50 C44 48 56 48 62 50"/>'
# king: a dome on a wide collar, and a solid cross
dome = path(smooth_profile([(23, 2), (24.5, 9), (30, 15.5), (38.5, 19, 'c'), (38.5, 0.01, 'c')])) + gloss(41, 25, 34, 2.6)
cross = '<path d="M46 1 H54 V7.8 H61 V15.4 H54 V22.5 H46 V15.4 H39 V7.8 H46 Z"/>'
SHAPES['k'] = gown() + under(41.5, 14) + dome + cross + ring(37, 21.5, 5.5) + ring(58, 17.5, 5) + under(63, 16) + plinth(27.5) + under(80, 24.5, 2.6) + '<path class="d" d="M38 50 C44 48 56 48 62 50"/>'

# ---- knight: an expressive head with a flowing mane, on the same plinth
SHAPES['n'] = (
    # a longer, angled face with a flared nostril; the back of the neck carries the mane in three flowing locks
    '<path d="M32 72 C32 63 35.5 55.5 41 50.5 C38 50.5 34 50 30 48.5 C24.5 46.5 20 43.5 19 39.5 C18.5 36 20 33 22.5 31 C26 28.5 30 27.5 34 27 C35 23.5 37 19.5 40 16.5 C40.5 12.5 42.5 8 45 4.5 C47.5 7.5 49 11 49.5 14 C51.5 13.5 53.5 13.5 55.5 14 C56.5 10.5 58.5 7 61.5 4 C62.5 8 62.5 12 62 15.5 C69.5 19 75 26.5 75.5 36 C79 41.5 78 47.5 73.5 50 C78.5 54.5 78 60.5 72.5 62 C77 65.5 77 69 75 72 Z"/>' +
    '<path d="M60.5 16 C67 19.5 72 26.5 72.5 36 C75.5 41.5 74.5 47.5 70 50 C75 54.5 74 60.5 69 62 C73 65.5 73 69 71 72 L65.5 72 C67 66 65 61 60 57.5 C65 53.5 65 48 60 44 C64.5 40 63.5 35 58.5 31.5 C62 27.5 61 23 57 19.5 Z"/>' +
    ring(70.5, 23, 6) + plinth(25.5) +
    '<ellipse class="e" cx="39" cy="24" rx="3.4" ry="2.4" transform="rotate(-25 39 24)"/>' +
    '<ellipse class="e" cx="24" cy="35" rx="2.1" ry="1.5" transform="rotate(-30 24 35)"/>' +
    '<path class="d" d="M21.5 42 C24.5 43.4 27.5 43.6 30.5 43"/>' +
    '<path class="d" d="M46 27.5 C49 34 47 41 42.5 45.5"/>')

# ---- write into pieces.js
import os
p = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'src', 'ui', 'pieces.js')
s = open(p).read()
start = s.index('  var SHAPES = {')
end = s.index('  };\n  var SETS')
body = '  var SHAPES = {\n' + ',\n'.join("    %s: '%s'" % (k, SHAPES[k].replace("'", "\\'")) for k in 'prbnqk') + '\n'
s = s[:start] + body + s[end:]
s = s.replace("  // every piece stands on the same rounded foot; w is its half-width\n  function foot(w) { return '<rect x=\"' + (50 - w) + '\" y=\"79\" width=\"' + (2 * w) + '\" height=\"11\" rx=\"4\"/>'; }\n", '')
open(p, 'w').write(s)
print('written')
