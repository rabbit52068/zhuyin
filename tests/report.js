/* Parent report: seeded/empty data and the existing settings modal keyboard flow. */
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const file = pathToFileURL(path.resolve(process.argv[2] || path.join(__dirname, '..', 'index.html'))).href;

(async () => {
  const browser = await chromium.launch();
  async function scenario(name, progress, run) {
    let context;
    try {
      context = await browser.newContext({ viewport: { width: 390, height: 844 } });
      await context.route('https://**/*', route => route.abort());
      await context.addInitScript(progress => {
        window.Audio = undefined;
        Object.defineProperty(window, 'speechSynthesis', { value: { getVoices: () => [], cancel() {},
          speak(u) { setTimeout(() => u.onend && u.onend(), 60) } }, configurable: true });
        localStorage.clear(); localStorage.setItem('zy-progress', JSON.stringify(progress));
      }, progress);
      const page = await context.newPage(), errors = [];
      page.on('pageerror', e => errors.push(String(e)));
      await page.goto(file); await page.waitForSelector('.node.cur');
      assert.equal(await page.locator('#reportBtn').count(), 0, 'report must be behind the gate');
      await page.click('#setBtn');
      const sum = await page.locator('.gate-q').evaluate(el => el.textContent.match(/\d+/g).map(Number).reduce((a, b) => a + b, 0));
      await page.evaluate(sum => [...document.querySelectorAll('.gate-o')].find(b => +b.textContent === sum).click(), sum);
      await page.click('#reportBtn');
      assert.equal(await page.locator('#reportBtn').getAttribute('aria-expanded'), 'true');
      assert.equal(await page.evaluate(() => document.activeElement.id), 'reportPanel');
      await run(page);
      assert.deepEqual(errors, [], 'page errors'); console.log('PASS ' + name);
    } catch (e) { console.log('FAIL ' + name + '  ' + e.stack); process.exitCode = 1 }
    finally { if (context) await context.close() }
  }
  const day = Date.UTC(2026, 10, 22, 4), latest = day + 2 * 86400000;
  try {
    await scenario('parent report counts, error-rate ranking, date, live reset and focus/Escape', {
      v: 2, stars: { 'sym:ㄅ': 3, 'sym:ㄆ': 3, 'review:雙唇和唇齒': 3 },
      acc: { 'sym:ㄅ': { m: 2, n: 6, t: day }, 'review:雙唇和唇齒': { m: 1, n: 7, t: latest } },
      sym: { 'ㄅ': { ok: 1, ng: 3, t: day }, 'ㄆ': { ok: 6, ng: 4, t: day + 86400000 },
        'ㄇ': { ok: 0, ng: 3, t: day }, 'ㄈ': { ok: 1, ng: 2, t: day }, 'ㄉ': { ok: 3, ng: 6, t: day },
        'ㄊ': { ok: 0, ng: 2, t: day }, 'ㄋ': { ok: 1, ng: 4, t: day }, 'ㄌ': { ok: 2, ng: 8, t: day } },
    }, async page => {
      const counts = await page.locator('#reportCounts').textContent();
      assert.ok(counts.includes('2 / 37') && counts.includes('3 / 55'), counts);
      assert.equal(await page.locator('#reportSymbols').textContent(), 'ㄅ、ㄆ');
      const rows = await page.locator('#frequentSymbols li').evaluateAll(els => els.map(el => ({ s: el.dataset.symbol, text: el.textContent })));
      assert.deepEqual(rows.map(r => r.s), ['ㄇ', 'ㄌ', 'ㄋ', 'ㄅ', 'ㄉ']);
      assert.ok(rows[3].text.includes('答對 1 次／答錯 3 次（75%）'));
      assert.equal(await page.locator('#reportLast time').getAttribute('datetime'), new Date(latest).toISOString());
      const expectedDate = await page.evaluate(t => new Date(t).toLocaleDateString('zh-TW'), latest);
      assert.ok((await page.locator('#reportLast').textContent()).includes(expectedDate));
      assert.ok((await page.locator('#recentRecords').textContent()).includes('認識 ㄅ'));
      await page.keyboard.press('Tab'); assert.equal(await page.evaluate(() => document.activeElement.id), 'exportBtn');
      await page.keyboard.press('Shift+Tab'); assert.equal(await page.evaluate(() => document.activeElement.id), 'reportPanel');
      await page.focus('#cls'); await page.keyboard.press('Tab');
      assert.ok(await page.locator('#rate button:first-child').evaluate(el => el === document.activeElement));
      await page.click('#rst'); await page.click('#rst');
      assert.ok((await page.locator('#reportCounts').textContent()).includes('0 / 37'));
      assert.equal(await page.locator('#frequentSymbols li').count(), 0);
      await page.keyboard.press('Escape');
      assert.equal(await page.locator('.sheet').count(), 0);
      assert.equal(await page.evaluate(() => document.activeElement.id), 'setBtn');
      assert.equal(await page.locator('#shell').evaluate(el => el.inert), false);
    });
    await scenario('parent report empty state is clear and Escape returns to Settings',
      { v: 2, stars: {}, acc: {}, sym: {} }, async page => {
        const counts = await page.locator('#reportCounts').textContent();
        assert.ok(counts.includes('0 / 37') && counts.includes('0 / 55'));
        assert.ok((await page.locator('#reportEmpty').textContent()).includes('還沒有常錯'));
        assert.ok((await page.locator('#reportLast').textContent()).includes('還沒有練習紀錄'));
        assert.equal(await page.locator('#frequentSymbols li').count(), 0);
        await page.keyboard.press('Escape');
        assert.equal(await page.locator('.sheet').count(), 0);
        assert.equal(await page.evaluate(() => document.activeElement.id), 'setBtn');
      });
  } finally { await browser.close() }
})().catch(e => { console.log('FAIL parent report tests  ' + e.stack); process.exitCode = 1 });
