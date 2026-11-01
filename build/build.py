#!/usr/bin/env python3
"""Assemble Tempo into one self-contained HTML file (standalone) plus the artifact variant."""
import json, os, re, subprocess, sys, glob

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
def rd(p): return open(os.path.join(ROOT, p), encoding='utf-8').read()

def node_json(code):
    out = subprocess.check_output(['node', '-e', code], cwd=ROOT)
    return out.decode('utf-8')

# lessons, in unit order u1..u9
files = sorted(glob.glob(os.path.join(ROOT, 'content/lessons/u*.js')), key=lambda f: int(re.search(r'/u(\d+)', f).group(1)))
lessons_json = node_json('const fs=require("fs");const fl=%s;const out=fl.map(f=>{delete require.cache[f];return require(f);});process.stdout.write(JSON.stringify(out));' % json.dumps(files))
reps_path = os.path.join(ROOT, 'content/openings.js')
reps_json = node_json('process.stdout.write(JSON.stringify(require(%s)));' % json.dumps(reps_path)) if os.path.exists(reps_path) else '{"repertoires":[],"traps":[]}'
meta_path = os.path.join(ROOT, 'build/traps_meta.json')
if os.path.exists(meta_path):
    reps_obj = json.loads(reps_json); meta = json.load(open(meta_path))
    for t in reps_obj.get('traps', []):
        if t.get('id') in meta: t.update(meta[t['id']])
    reps_json = json.dumps(reps_obj)
piece_css = node_json('process.stdout.write(require("./src/ui/pieces.js").css());')

def safe_json(s): return s.replace('</', '<\\/')

b64 = {k: rd('build/%s.b64' % k).strip() for k in ['sfjs', 'sfwasm', 'puzzles', 'openings', 'dmsans', 'dmserif']}

# the characters: content/characters.json goes into the roster script, which the page and the engine worker both load
profiles = json.dumps(json.load(open(os.path.join(ROOT, 'content/characters.json'), encoding='utf-8')), ensure_ascii=True, separators=(',', ':'))
core = rd('src/core.js'); book = rd('src/book.js'); engine = rd('src/engine.js')
bots = 'var TEMPO_PROFILES = ' + safe_json(profiles) + ';\n' + rd('src/bots.js')
ui_order = ['inflate.js', 'ui/pieces.js', 'ui/avatars.js', 'ui/util.js', 'ui/store.js', 'ui/engines.js', 'ui/board.js', 'ui/app.js', 'ui/review.js', 'ui/play.js',
            'ui/clock.js', 'ui/puzzles.js', 'ui/learn.js', 'ui/openings.js', 'ui/train.js', 'ui/progress.js']
ui = '\n;\n'.join(rd('src/' + f) for f in ui_order)
boot = """
(function () {
  // draw the first screen in Tempo's own type, so nothing shifts when the fonts arrive; they are in the page, so this is a moment at most
  function start() {
    var fonts = document.fonts, began = false;
    function go() { if (!began) { began = true; App.boot(); } }
    if (!fonts || typeof fonts.load !== 'function') { go(); return; }
    try { Promise.all([fonts.load('400 16px "Tempo Sans"'), fonts.load('16px "Tempo Serif"')]).then(go, go); } catch (e) { go(); return; }
    setTimeout(go, 400);
  }
  var hot = window.claude && window.claude.hot;
  try { if (hot && hot.snapshot) hot.snapshot(function () { return { hash: location.hash }; }); } catch (e) { /* ignore */ }
  if (hot && hot.ready) hot.ready(start); else start();
})();
"""
for name, src in [('core', core), ('book', book), ('bots', bots), ('engine', engine), ('ui', ui)]:
    if '</script' in src.lower():
        sys.exit('script %s contains </script' % name)

# styles.css first, then any styles-<area>.css files in name order
css = '\n'.join([rd('src/ui/styles.css')] + [rd(os.path.relpath(f, ROOT)) for f in sorted(glob.glob(os.path.join(ROOT, 'src/ui/styles-*.css')))])
fonts = """@font-face { font-family: 'Tempo Sans'; font-style: normal; font-weight: 100 1000; font-display: swap; src: url(data:font/woff2;base64,%s) format('woff2'); }
@font-face { font-family: 'Tempo Serif'; font-style: normal; font-weight: 400; font-display: swap; src: url(data:font/woff2;base64,%s) format('woff2'); }
""" % (b64['dmsans'], b64['dmserif'])

TITLE = 'Tempo Chess'
head_bits = '<title>%s</title>\n<meta name="claude:viewport-fit-sides" content="cover">\n<meta name="description" content="Play bots from beginner to Stockfish, review your games, solve puzzles and learn chess.">\n' % TITLE
style = '<style>\n' + fonts + css + '\n' + piece_css + '\n</style>\n'
body = """<div id="app"></div>
<div id="layer"></div>
<noscript><p style="padding:24px">Tempo needs JavaScript to run.</p></noscript>
<script type="text/plain" id="d-sfjs">%(sfjs)s</script>
<script type="text/plain" id="d-sfwasm">%(sfwasm)s</script>
<script type="text/plain" id="d-puzzles">%(puzzles)s</script>
<script type="text/plain" id="d-openings">%(openings)s</script>
<script type="application/json" id="d-lessons">%(lessons)s</script>
<script type="application/json" id="d-reps">%(reps)s</script>
<script id="src-core">%(core)s</script>
<script id="src-book">%(book)s</script>
<script id="src-bots">%(bots)s</script>
<script id="src-engine">%(engine)s</script>
<script>%(ui)s
%(boot)s</script>
""" % dict(sfjs=b64['sfjs'], sfwasm=b64['sfwasm'], puzzles=b64['puzzles'], openings=b64['openings'],
           lessons=safe_json(lessons_json), reps=safe_json(reps_json), core=core, book=book, bots=bots, engine=engine, ui=ui, boot=boot)

OUT = os.environ.get('TEMPO_OUT') or os.path.join(ROOT, 'dist')  # a separate output folder lets parallel work build without clashing
os.makedirs(OUT, exist_ok=True)
# artifact variant: the host adds the document skeleton
artifact = head_bits + style + body
open(os.path.join(OUT, 'tempo-artifact.html'), 'w', encoding='utf-8').write(artifact)
# standalone file: full document with the same small reset the host would add
standalone = ('<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n'
              '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
              '<meta name="theme-color" content="#1B2A4A">\n' + head_bits +
              '<style>:root{padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0}img{max-width:100%}[hidden]{display:none!important}</style>\n' +
              style + '</head>\n<body>\n' + body + '</body>\n</html>\n')
open(os.path.join(OUT, 'Tempo.html'), 'w', encoding='utf-8').write(standalone)
print('lessons:', len(json.loads(lessons_json)), 'units;', 'reps:', len(json.loads(reps_json).get('repertoires', [])),
      '| artifact %.2f MB, standalone %.2f MB' % (len(artifact.encode()) / 1e6, len(standalone.encode()) / 1e6))
