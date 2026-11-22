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

    await scenario('progress renames the saved medial review key without losing stars or records',
      JSON.stringify({ v: 2, stars: { 'review:結合韻': 3, 'sym:ㄧ': 3 },
        acc: { 'review:結合韻': { m: 2, n: 7, t: 10 } }, sym: { 'ㄧ': { ok: 1, ng: 0, t: 11 } } }), async page => {
        const r = await page.evaluate(() => ({ saved: JSON.parse(localStorage.getItem('zy-progress')),
          label: document.querySelector('[data-lesson-key="review:介音"]').getAttribute('aria-label'), records: recordHTML() }));
        assert.deepEqual(r.saved, { v: 2, stars: { 'review:介音': 3, 'sym:ㄧ': 3 },
          acc: { 'review:介音': { m: 2, n: 7, t: 10 } }, sym: { 'ㄧ': { ok: 1, ng: 0, t: 11 } } });
        assert.equal(r.label, '複習：介音，3 顆星');
        assert.ok(r.records.includes('複習・介音') && !r.records.includes('結合韻'));
      });

    await scenario('progress v1 indices retain the historical order after medials move',
      JSON.stringify({ stars: { 27: 3, 43: 3, 46: 3 }, acc: { 46: { m: 1, n: 7, t: 10 } } }), async page => {
        const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('zy-progress')));
        assert.deepEqual(saved, { v: 2, stars: { 'sym:ㄚ': 3, 'sym:ㄧ': 3, 'review:介音': 3 },
          acc: { 'review:介音': { m: 1, n: 7, t: 10 } }, sym: {} });
      });

    const completed = Object.fromEntries([
      ...[...'ㄅㄆㄇㄈㄉㄊㄋㄌㄍㄎㄏㄐㄑㄒㄓㄔㄕㄖㄗㄘㄙㄚㄛㄜㄝㄞㄟㄠㄡㄢㄣㄤㄥㄦ'].map(s => ['sym:' + s, 3]),
      ...['雙唇和唇齒', '舌尖音', '舌根音', '舌面音', '翹舌音', '平舌音', '單韻母', '複韻母', '聲隨韻母'].map(name => ['review:' + name, 3]),
    ]);
    await scenario('progress old completed finals stay open and the new path starts unfinished medials',
      JSON.stringify({ v: 2, stars: completed, acc: {}, sym: {} }), async page => {
        const r = await page.evaluate(() => ({ current: LESSONS[currentId()].key, open: unlocked(currentId()),
          currentNode: document.querySelector('.node.cur').dataset.lessonKey,
          finalsOpen: LESSONS.filter(l => UNITS[l.ui].tag === '韻母').every(l => starsOf(l) === 3 && unlocked(l.id)) }));
        assert.equal(r.current, 'sym:ㄧ'); assert.equal(r.currentNode, 'sym:ㄧ');
        assert.equal(r.open, true); assert.equal(r.finalsOpen, true);
        await page.click('#tabChart');
        const chart = await page.evaluate(() => ({ headings: [...document.querySelectorAll('.chart h2')].map(h => h.firstChild.textContent),
          symbols: [...document.querySelectorAll('.tile .s')].map(el => el.textContent) }));
        assert.deepEqual(chart.headings, ['聲母', '介音', '韻母']);
        assert.deepEqual(chart.symbols.slice(21, 24), ['ㄧ', 'ㄨ', 'ㄩ']);
        assert.equal(chart.symbols[24], 'ㄚ');
        assert.equal(new Set(chart.symbols).size, 37);
        await page.click('#tabPath'); await page.click('.node.cur');
        assert.equal(await page.evaluate(() => LS.L.key), 'sym:ㄧ');
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
