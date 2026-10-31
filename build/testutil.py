# Shared helpers for the browser tests.
import functools, http.server, json, os, re, threading, urllib.parse

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


class _Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args): pass

    def do_GET(self):
        # browsers ask a web server for /favicon.ico on their own; a file:// page never does, so answer it with nothing
        if self.path.split('?')[0] == '/favicon.ico':
            self.send_response(204); self.end_headers(); return
        return super().do_GET()


def serve_over_http(url):
    """Serve a file:// build from 127.0.0.1 instead, and return that URL. In a fresh test context (storage kept in
    memory), headless Chromium now and then brings a file:// page back from a reload with empty storage, which has
    nothing to do with Tempo; a page from a real origin keeps its storage, so reload checks test the app, not that quirk."""
    if not url.startswith('file://'): return url
    folder, name = os.path.split(urllib.parse.unquote(url[len('file://'):]))
    srv = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(_Quiet, directory=folder))
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return 'http://127.0.0.1:%d/%s' % (srv.server_address[1], urllib.parse.quote(name))
