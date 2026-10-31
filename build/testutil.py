# Shared helpers for the browser tests.
import json, os, re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def page_with_reps(tempo_url, sample):
    """Write a copy of the built page whose opening data is `sample`, and return its URL.
    The app reads its opening data once at start-up, so the data has to be in the page before it loads."""
    assert tempo_url.startswith('file://'), 'needs a file:// build'
    html = open(tempo_url[len('file://'):], encoding='utf-8').read()
    data = json.dumps(sample).replace('</', '<\\/')
    html, n = re.subn(r'(<script type="application/json" id="d-reps">)(.*?)(</script>)',
                      lambda m: m.group(1) + data + m.group(3), html, count=1, flags=re.S)
    assert n == 1, 'opening data block not found'
    out = os.path.join(ROOT, 'build', 'logs', 'reps-sample-%d.html' % os.getpid())
    os.makedirs(os.path.dirname(out), exist_ok=True)
    open(out, 'w', encoding='utf-8').write(html)
    return 'file://' + out
