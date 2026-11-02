"""Make a copy of Tempo with pictures for the characters, for your own use.

    python3 tools/with_portraits.py <portraits.json> [more.json ...] [out.html]

Each portraits file is the Portrait Studio's export ({"format": "tempo-chess-portrait-studio-v1", "roster": [{"id",
"image"}]}), its list of sources ([{"id", "image_url"}]), or a list of {"id", "images": [...]}. A picture is a link
(https://) or an embedded image (data:image/...). With several files, a character's pictures are tried in the order
given: the first one that loads is shown, the others are spares for a link that fails. In the copy, a character with no
picture that loads keeps its badge (never a broken image). Links load from their sites each time the page opens, so the
copy needs the internet for them; embedded pictures work offline.

The copy is written to out.html (default: "Tempo Chess (pictures).html" in dist/, which git ignores). dist/Tempo.html,
the artifact and the website copy are built without pictures and are never touched by this.
"""
import json, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'dist', 'Tempo.html')
OK = re.compile(r'^(https://[^\s"\'<>]+|data:image/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+)$')

def load(path):
    d = json.load(open(path, encoding='utf-8'))
    rows = d.get('roster') if isinstance(d, dict) else d
    if not isinstance(rows, list): raise SystemExit(path + ': not a portraits file (expected a roster list)')
    out = {}
    for r in rows:
        if not isinstance(r, dict) or not isinstance(r.get('id'), str): continue
        pics = r.get('images') if isinstance(r.get('images'), list) else [r.get('image') or r.get('image_url') or r.get('url')]
        for pic in pics:
            if isinstance(pic, str) and OK.match(pic.strip()): out.setdefault(r['id'], []).append(pic.strip())
    return out

def main():
    args = sys.argv[1:]
    if not args: raise SystemExit(__doc__)
    out = args.pop() if args[-1].endswith('.html') else os.path.join(ROOT, 'dist', 'Tempo Chess (pictures).html')
    if os.path.abspath(out) == os.path.abspath(SRC): raise SystemExit('write the copy somewhere other than dist/Tempo.html')
    pics = {}
    for path in args:
        for k, v in load(path).items():
            have = pics.setdefault(k, [])
            have.extend(x for x in v if x not in have)
    roster = [p['id'] for p in json.load(open(os.path.join(ROOT, 'content', 'characters.json'), encoding='utf-8'))['profiles']]
    unknown = sorted(set(pics) - set(roster))
    pics = {k: pics[k] for k in roster if k in pics}
    html = open(SRC, encoding='utf-8').read()
    if '<script>window.TEMPO_PORTRAITS = ' in html: raise SystemExit('dist/Tempo.html already has pictures; rebuild it first')
    at = html.find('</head>')
    if at < 0: raise SystemExit('no </head> in dist/Tempo.html')
    tag = '<script>window.TEMPO_PORTRAITS = ' + json.dumps(pics, separators=(',', ':')).replace('</', '<\\/') + ';</script>\n'
    open(out, 'w', encoding='utf-8').write(html[:at] + tag + html[at:])
    n = sum(len(v) for v in pics.values())
    spare = sum(1 for v in pics.values() if len(v) > 1)
    print('%d of %d characters have a picture (%d pictures in all; %d with a spare) -> %s' % (len(pics), len(roster), n, spare, out))
    if unknown: print('not in the roster, left out:', ', '.join(unknown))
    missing = [k for k in roster if k not in pics]
    if missing: print('no picture (they keep their badge):', ', '.join(missing))

if __name__ == '__main__':
    main()
