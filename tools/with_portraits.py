"""Make a copy of Tempo with pictures for the characters, for your own use.

    python3 tools/with_portraits.py <portraits.json> [out.html]

portraits.json is the Portrait Studio's export ({"format": "tempo-chess-portrait-studio-v1", "roster": [{"id", "image"}]})
or its list of sources ([{"id", "image_url"}]). Each picture is a link (https://) or an embedded image (data:image/...).
In the copy, a character's avatar shows its picture once it has loaded, and keeps its badge if it doesn't (a site that
blocks it, a link that has gone). Pictures from links load from those sites each time the page opens, so the copy needs
the internet for them; embedded ones work offline.

The copy is written to out.html (default: "Tempo Chess (pictures).html" next to dist/). dist/Tempo.html, the artifact
and the website copy are built without pictures and are never touched by this.
"""
import json, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'dist', 'Tempo.html')
OK = re.compile(r'^(https://[^\s"\'<>]+|data:image/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+)$')

def load(path):
    d = json.load(open(path, encoding='utf-8'))
    rows = d.get('roster') if isinstance(d, dict) else d
    if not isinstance(rows, list): raise SystemExit('not a portraits file: expected a roster list')
    out = {}
    for r in rows:
        if not isinstance(r, dict) or not isinstance(r.get('id'), str): continue
        pic = r.get('image') or r.get('image_url')
        if isinstance(pic, str) and OK.match(pic.strip()): out[r['id']] = pic.strip()
    return out

def main():
    if len(sys.argv) < 2: raise SystemExit(__doc__)
    pics = load(sys.argv[1])
    out = sys.argv[2] if len(sys.argv) > 2 else os.path.join(ROOT, 'dist', 'Tempo Chess (pictures).html')
    roster = {p['id'] for p in json.load(open(os.path.join(ROOT, 'content', 'characters.json'), encoding='utf-8'))['profiles']}
    unknown = sorted(set(pics) - roster)
    pics = {k: v for k, v in pics.items() if k in roster}
    html = open(SRC, encoding='utf-8').read()
    if '<script>window.TEMPO_PORTRAITS = ' in html: raise SystemExit('dist/Tempo.html already has pictures; rebuild it first')
    at = html.find('</head>')
    if at < 0: raise SystemExit('no </head> in dist/Tempo.html')
    tag = '<script>window.TEMPO_PORTRAITS = ' + json.dumps(pics, separators=(',', ':')).replace('</', '<\\/') + ';</script>\n'
    if os.path.abspath(out) == os.path.abspath(SRC): raise SystemExit('write the copy somewhere other than dist/Tempo.html')
    open(out, 'w', encoding='utf-8').write(html[:at] + tag + html[at:])
    links = sum(1 for v in pics.values() if v.startswith('https://'))
    print('%d of %d characters have a picture (%d links, %d embedded) -> %s' % (len(pics), len(roster), links, len(pics) - links, out))
    if unknown: print('not in the roster, left out:', ', '.join(unknown))
    missing = sorted(roster - set(pics))
    if missing: print('no picture (they keep their badge):', ', '.join(missing))

if __name__ == '__main__':
    main()
