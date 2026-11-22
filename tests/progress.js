/* Progress v2: fresh saves, migration, persisted attempts, and corrupt storage. */
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const file = pathToFileURL(path.resolve(process.argv[2] || path.join(__dirname, '..', 'index.html'))).href;
const EMPTY = { v: 2, stars: {}, acc: {}, sym: {} };

(async () => {
  const browser = await chromium.launch();
  async function scenario(name, saved, run) {
    let context;
    try {
      context = await browser.newContext({ viewport: { width: 390, height: 844 } });
      // These checks need no web fonts or other remote resources.
      await context.route('https://**/*', route => route.abort());
      await context.addInitScript(saved => {
        window.Audio = undefined;
        Object.defineProperty(window, 'speechSynthesis', { value: {
          getVoices: () => [], cancel() {},
          speak(u) { setTimeout(() => u.onend && u.onend(), 60) },
        }, configurable: true });
        localStorage.clear();
        if (saved !== null) localStorage.setItem('zy-progress', saved);
      }, saved);
      const page = await context.newPage(), errors = [];
      page.on('pageerror', e => errors.push(String(e)));
      await page.goto(file);
      await page.waitForSelector('.node.cur');
      await run(page);
      assert.deepEqual(errors, [], 'page errors');
      console.log('PASS ' + name);
    } catch (e) {
      console.log('FAIL ' + name + '  ' + e.stack);
      process.exitCode = 1;
    } finally { if (context) await context.close() }
  }
  try {
    await scenario('progress fresh start writes empty v2', null, async page => {
      const r = await page.evaluate(() => ({ p: P, saved: JSON.parse(localStorage.getItem('zy-progress')) }));
      assert.deepEqual(r.p, EMPTY);
      assert.deepEqual(r.saved, EMPTY);
    });

    await scenario('progress migrates v1 indices to stable keys and shows two completed lessons',
      JSON.stringify({ stars: { 0: 3, 1: 3 }, acc: { 0: { m: 2, n: 6, t: 1 } } }), async page => {
        const r = await page.evaluate(() => ({
          saved: JSON.parse(localStorage.getItem('zy-progress')),
          first: LESSONS.slice(0, 2).map(l => l.key),
          done: document.querySelectorAll('.node-wrap .stars').length,
          stars: totalStars(), next: currentId(), open: unlocked(2), learned: [...learned()], records: recordHTML(),
        }));
        assert.deepEqual(r.first, ['sym:ㄅ', 'sym:ㄆ']);
        assert.deepEqual(r.saved, { v: 2, stars: { 'sym:ㄅ': 3, 'sym:ㄆ': 3 },
          acc: { 'sym:ㄅ': { m: 2, n: 6, t: 1 } }, sym: {} });
        assert.equal(r.done, 2);
        assert.equal(r.stars, 6);
        assert.equal(r.next, 2);
        assert.equal(r.open, true);
        assert.deepEqual(r.learned, ['ㄅ', 'ㄆ']);
        assert.ok(r.records.includes('認識 ㄅ') && r.records.includes('答錯 2 次'));
      });

    await scenario('progress persists one wrong then right listen answer against the target symbol', null, async page => {
      await page.click('.node.cur');
      await page.click('text=我記住了');
      await page.waitForSelector('#stage .opt');
      const r = await page.evaluate(() => {
        const before = Date.now(), s = LS.steps[LS.i].s;
        const opts = [...document.querySelectorAll('#stage .opt')];
        const wrong = opts.find(b => b.textContent.trim() !== s), right = opts.find(b => b.textContent.trim() === s);
        wrong.click(); right.click();
        // Once answered, extra taps must not add attempts.
        wrong.click(); right.click();
        return { before, s, memory: P.sym, saved: JSON.parse(localStorage.getItem('zy-progress')), m: LS.mistakes };
      });
      assert.equal(r.s, 'ㄅ');
      assert.equal(r.memory['ㄅ'].ng, 1);
      assert.equal(r.memory['ㄅ'].ok, 1);
      assert.ok(r.memory['ㄅ'].t >= r.before);
      assert.deepEqual(Object.keys(r.memory), ['ㄅ']);
      assert.deepEqual(r.saved.sym, r.memory);
      assert.equal(r.saved.v, 2);
      assert.equal(r.m, 1);
    });

    await scenario('progress corrupt JSON recovers to empty v2 without crashing', '{broken', async page => {
      const r = await page.evaluate(() => ({ p: P, saved: JSON.parse(localStorage.getItem('zy-progress')),
        nodes: document.querySelectorAll('.node').length }));
      assert.deepEqual(r.p, EMPTY);
      assert.deepEqual(r.saved, EMPTY);
      assert.ok(r.nodes > 0);
    });
  } finally { await browser.close() }
})().catch(e => { console.log('FAIL progress tests  ' + e.stack); process.exitCode = 1 });
