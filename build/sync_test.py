import asyncio, json
from playwright.async_api import async_playwright
import os
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CHROME = os.environ.get('CHROME') or ('/usr/bin/google-chrome' if os.path.exists('/usr/bin/google-chrome') else None)
TEMPO_URL = os.environ.get('TEMPO_URL') or 'file://' + ROOT + '/dist/Tempo.html'
FAKE = """
(() => {
  const docs = {}; const subs = {};
  function snap(path) { const d = docs[path]; return { exists: !!d, data: () => d ? JSON.parse(JSON.stringify(d)) : undefined, metadata: { fromCache: false, hasPendingWrites: false } }; }
  function notify(path) { (subs[path] || []).forEach(fn => setTimeout(() => fn(snap(path)), 5)); }
  const db = { doc(path) { return {
      path, get: async () => snap(path),
      set: async (data) => { window.__writes = (window.__writes || 0) + 1; docs[path] = JSON.parse(JSON.stringify(data)); notify(path); },
      update: async (data) => { Object.assign(docs[path], data); notify(path); },
      delete: async () => { delete docs[path]; notify(path); },
      onSnapshot(next, err) { (subs[path] = subs[path] || []).push(next); setTimeout(() => next(snap(path)), 20); return () => {}; }
  }; } };
  const user = { id: async () => 'u_test', isOwner: async () => true, canEdit: async () => true, can: async () => true };
  window.__fakeDocs = docs; window.__fakeNotify = notify;
  window.claude = { use: async (name) => name === 'db' ? db : name === 'user' ? user : null };
})();
"""
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=CHROME, args=['--no-sandbox'])
        ctx = await b.new_context()
        await ctx.add_init_script(FAKE)
        pg = await ctx.new_page()
        errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto(TEMPO_URL); await pg.wait_for_timeout(1500)
        print('synced flag', await pg.evaluate('Store.synced()'))
        # make a change
        await pg.evaluate("Store.state.learn.done['x-test'] = {stars: 2, ts: Date.now()}; Store.touch('learn');")
        await pg.wait_for_timeout(2600)
        d = await pg.evaluate("window.__fakeDocs['data/users/u_test/profile']")
        print('remote has learn x-test:', bool(d and d['learn']['done'].get('x-test')), 'writes', await pg.evaluate('window.__writes'))
        # simulate another device: newer puzzle rating + another lesson done
        await pg.evaluate("""() => { const d = window.__fakeDocs['data/users/u_test/profile']; d.puzzles.rating = 1234; d.puzzles.rev = Date.now() + 1000; d.learn.done['y-test'] = {stars: 3, ts: Date.now()}; d.learn.rev = Date.now() + 1000; window.__fakeNotify('data/users/u_test/profile'); }""")
        await pg.wait_for_timeout(500)
        print('local puzzle rating after remote change:', await pg.evaluate('Store.state.puzzles.rating'), '| lessons', await pg.evaluate('Object.keys(Store.state.learn.done)'))
        print('errors', errs)
        await b.close()
asyncio.run(main())
