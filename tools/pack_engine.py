"""Packs the embedded Stockfish (assets/sf19-lite-single.js and .wasm, from the stockfish npm package by Nathan Rugg,
GPL-3.0) into build/sfjs.b64 and build/sfwasm.b64: gzip, then base64, which the page unpacks with TempoInflate.
    python3 tools/pack_engine.py
"""
import base64, gzip, os
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
def pack(src, dst):
    data = open(os.path.join(ROOT, src), 'rb').read()
    out = base64.b64encode(gzip.compress(data, 9)).decode()
    open(os.path.join(ROOT, dst), 'w').write(out + '\n')
    print('%s: %d bytes -> %d chars' % (src, len(data), len(out)))
pack('assets/sf19-lite-single.js', 'build/sfjs.b64')
pack('assets/sf19-lite-single.wasm', 'build/sfwasm.b64')
