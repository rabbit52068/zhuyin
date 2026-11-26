/* 7-6 offline use: manifest and icons are valid, the service worker caches the game, and the game still loads offline.
   Serves the repository from a throwaway local server because service workers need http://localhost. */
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const http = require('node:http'), fs = require('node:fs'), path = require('node:path');
const ROOT = path.join(__dirname, '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.mp3': 'audio/mpeg', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };

(async () => {
  const server = http.createServer((req, res) => {
    const rel = decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/^\/+/, '') || 'index.html';
    const file = path.join(ROOT, rel);
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end() }
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' }); fs.createReadStream(file).pipe(res);
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const origin = 'http://localhost:' + server.address().port;
  const browser = await chromium.launch();
  const check = async (name, fn) => { try { await fn(); console.log('PASS ' + name) } catch (e) { console.log('FAIL ' + name + '  ' + e.message); process.exitCode = 1 } };
  try {
    const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.webmanifest'), 'utf8'));
    await check('manifest names the app and its icons exist', () => {
      assert.equal(manifest.display, 'standalone'); assert.ok(manifest.name && manifest.start_url);
      for (const i of manifest.icons) assert.ok(fs.statSync(path.join(ROOT, i.src)).size > 1000, i.src);
      assert.ok(fs.existsSync(path.join(ROOT, 'icons/icon-180.png')), 'apple-touch-icon');
    });
    const ctx = await browser.newContext();
    await ctx.route('https://**/*', r => r.abort());
    const page = await ctx.newPage(), errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    await page.goto(origin + '/index.html', { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => navigator.serviceWorker.ready);
    let cached = 0;
    for (let i = 0; i < 40 && cached < 150; i++) { await page.waitForTimeout(500); cached = await page.evaluate(async () => (await (await caches.open('zhuyin-offline-v1')).keys()).length) }
    await check('service worker caches the shell and the recordings', () => assert.ok(cached >= 150, 'cached ' + cached));
    await ctx.setOffline(true);
    await page.reload({ waitUntil: 'domcontentloaded' }); await page.waitForSelector('.node', { timeout: 10000 });
    await check('game loads offline', async () => assert.ok(await page.locator('.node').count() > 0));
    await check('recordings play offline', async () => assert.ok(await page.evaluate(async () => { const r = await fetch('audio/sym/01.mp3'); return r.ok && (await r.arrayBuffer()).byteLength > 1000 })));
    assert.deepEqual(errors, [], 'page errors');
  } finally { await browser.close(); server.close() }
})();
