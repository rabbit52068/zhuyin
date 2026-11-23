/* Keyboard/modal semantics and compact intro layout. */
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const file = pathToFileURL(path.resolve(process.argv[2] || path.join(__dirname, '..', 'index.html'))).href;

(async () => {
  const browser = await chromium.launch();
  async function scenario(name, run, height = 844, stars = {}) {
    let context;
    try {
      context = await browser.newContext({ viewport: { width: 390, height } });
      await context.route('https://**/*', route => route.abort());
      await context.addInitScript(stars => {
        window.Audio = undefined; window.__said = [];
        Object.defineProperty(window, 'speechSynthesis', { value: {
          getVoices: () => [], cancel() {},
          speak(u) { window.__said.push(u.text); setTimeout(() => u.onend && u.onend(), 60) },
        }, configurable: true });
        localStorage.clear();
        localStorage.setItem('zy-progress', JSON.stringify({ v: 2, stars, acc: {}, sym: {} }));
      }, stars);
      const page = await context.newPage(), errors = [];
      page.on('pageerror', e => errors.push(String(e)));
      await page.goto(file); await page.waitForSelector('.node.cur');
      await run(page);
      assert.deepEqual(errors, [], 'page errors');
      console.log('PASS ' + name);
    } catch (e) { console.log('FAIL ' + name + '  ' + e.stack); process.exitCode = 1 }
    finally { if (context) await context.close() }
  }
  const active = page => page.evaluate(() => document.activeElement.id);
  // Step and card entrance animations (roadmap 4-4) move things for ~0.5 s; layout and focus checks wait for them.
  const settle = page => page.evaluate(() => Promise.all(document.getAnimations().filter(a => a.effect.getComputedTiming().iterations < Infinity).map(a => a.finished.catch(() => {}))));
  async function wraps(page, first, last) {
    await settle(page);
    await page.focus(last); await page.keyboard.press('Tab');
    assert.ok(await page.locator(first).evaluate(el => el === document.activeElement), 'Tab wraps to first');
    await page.focus(first); await page.keyboard.press('Shift+Tab');
    assert.ok(await page.locator(last).evaluate(el => el === document.activeElement), 'Shift+Tab wraps to last');
  }
  async function openSettings(page) {
    await page.click('#setBtn');
    const sum = await page.locator('.gate-q').evaluate(el => el.textContent.match(/\d+/g).map(Number).reduce((a, b) => a + b, 0));
    await page.evaluate(sum => [...document.querySelectorAll('.gate-o')].find(b => +b.textContent === sum).click(), sum);
    await page.waitForSelector('.box[aria-label="家長設定"]');
  }
  try {
    await scenario('a11y node labels include lesson identity and completion/lock state', async page => {
      const labels = await page.evaluate(() => Object.fromEntries([...document.querySelectorAll('.node')]
        .map(b => [b.dataset.lessonKey, b.getAttribute('aria-label')])));
      assert.equal(labels['sym:ㄅ'], 'ㄅ，3 顆星');
      assert.equal(labels['sym:ㄆ'], 'ㄆ，還沒完成');
      assert.equal(labels['sym:ㄇ'], '尚未解鎖：ㄇ');
      assert.equal(labels['review:雙唇和唇齒'], '尚未解鎖：複習：雙唇和唇齒');
      assert.equal(labels['blend:拼拼看:0'], '尚未解鎖：拼拼看 第 1 組');
      assert.equal(labels['tone:四個聲調:0'], '尚未解鎖：四個聲調 第 1 組');
      assert.equal(await page.locator('[data-lesson-key="sym:ㄇ"]').getAttribute('aria-disabled'), 'true');
      assert.equal(await page.locator('.stars').first().getAttribute('aria-hidden'), 'true');
    }, 844, { 'sym:ㄅ': 3 });

    await scenario('a11y tabs wire one labelled panel and support arrows/Home/End', async page => {
      assert.equal(await page.locator('#main').getAttribute('role'), 'tabpanel');
      for (const id of ['tabPath', 'tabChart']) assert.equal(await page.locator('#' + id).getAttribute('aria-controls'), 'main');
      await page.focus('#tabPath');
      for (const [key, id] of [['ArrowRight', 'tabChart'], ['ArrowRight', 'tabPath'], ['ArrowLeft', 'tabChart'], ['Home', 'tabPath'], ['End', 'tabChart']]) {
        await page.keyboard.press(key);
        assert.equal(await active(page), id);
        assert.equal(await page.locator('#' + id).getAttribute('aria-selected'), 'true');
        assert.equal(await page.locator('#' + id).evaluate(el => el.tabIndex), 0);
        assert.equal(await page.locator('#' + (id === 'tabPath' ? 'tabChart' : 'tabPath')).evaluate(el => el.tabIndex), -1);
        assert.equal(await page.locator('#main').getAttribute('aria-labelledby'), id);
      }
    });

    await scenario('a11y native play buttons work with Enter/Space once; text stays noninteractive', async page => {
      await page.click('#tabChart');
      const button = page.locator('.note .say');
      assert.equal(await button.getAttribute('aria-label'), '唸給我聽');
      assert.equal(await button.locator('svg').getAttribute('aria-hidden'), 'true');
      const semantics = await page.locator('.note').evaluate(el => ({ role: el.getAttribute('role'),
        tabindex: el.getAttribute('tabindex'), onclick: el.onclick === null, nested: !!el.closest('button') }));
      assert.deepEqual(semantics, { role: null, tabindex: null, onclick: true, nested: false });
      const text = await page.locator('.note').textContent();
      for (const key of ['Enter', 'Space']) {
        await page.evaluate(() => { window.__said = [] });
        await button.focus(); await page.keyboard.press(key); await page.waitForTimeout(250);
        assert.deepEqual(await page.evaluate(() => window.__said), [text]);
      }
      await page.evaluate(() => { window.__said = []; document.querySelector('.note').click() });
      await page.waitForTimeout(250);
      assert.deepEqual(await page.evaluate(() => window.__said), [text]);
    });

    await scenario('a11y lesson/exit trap focus; Esc dismisses exit; leaving restores the rebuilt node', async page => {
      const key = await page.locator('.node.cur').getAttribute('data-lesson-key');
      await page.click('.node.cur');
      assert.equal(await page.locator('.layer').getAttribute('aria-modal'), 'true');
      await wraps(page, '#xBtn', '#stage .btn.go');
      assert.ok(await page.locator('#shell').evaluate(el => el.inert));
      await page.click('#xBtn');
      assert.equal(await active(page), 'askStay');
      assert.equal(await page.locator('.ask').getAttribute('aria-modal'), 'true');
      await wraps(page, '#askStay', '#askLeave');
      assert.ok(await page.locator('.layer .col').evaluate(el => !!el.closest('[inert]')));
      // Feedback may arrive while the confirmation is open; its own inert state must survive.
      await page.evaluate(() => correct('對！'));
      await page.keyboard.press('Escape');
      assert.equal(await page.locator('.ask').count(), 0);
      assert.equal(await active(page), 'xBtn');
      assert.equal(await page.locator('.layer .col').evaluate(el => !!el.closest('[inert]')), false);
      assert.equal(await page.locator('#fb').evaluate(el => el.inert), false);
      assert.ok(await page.locator('#shell').evaluate(el => el.inert));
      await page.keyboard.press('Escape');
      await page.click('#askStay');
      assert.equal(await active(page), 'xBtn');
      await page.keyboard.press('Escape');
      await page.click('#askLeave');
      assert.equal(await page.locator('.layer').count(), 0);
      assert.equal(await page.evaluate(() => document.activeElement.dataset.lessonKey), key);
      assert.equal(await page.locator('#shell').evaluate(el => el.inert), false);
    });

    await scenario('a11y parent gate/settings trap focus, close with Esc, and return to Settings', async page => {
      await page.click('#setBtn');
      await wraps(page, '.gate-o:first-child', '#gateX');
      await page.keyboard.press('Escape');
      assert.equal(await page.locator('.sheet').count(), 0);
      assert.equal(await active(page), 'setBtn');
      await openSettings(page);
      assert.equal(await page.locator('.box[aria-label="家長設定"]').getAttribute('aria-modal'), 'true');
      await wraps(page, '#rate button:first-child', '#cls');
      await page.keyboard.press('Escape');
      assert.equal(await page.locator('.sheet').count(), 0);
      assert.equal(await active(page), 'setBtn');
      assert.equal(await page.locator('#shell').evaluate(el => el.inert), false);
      await openSettings(page); await page.click('#cls');
      assert.equal(await active(page), 'setBtn');
    });

    for (const height of [568, 640, 667, 740, 844]) await scenario('a11y trace box stays square at 390x' + height, async page => {
      await page.click('.node.cur'); await page.evaluate(() => { next(); next() }); await page.waitForSelector('.trace'); await settle(page);
      const r = await page.evaluate(() => { const b = document.querySelector('.trace').getBoundingClientRect(), s = document.querySelector('#stage'); return { w: b.width, h: b.height, scroll: s.scrollHeight, client: s.clientHeight } });
      assert.ok(Math.abs(r.w - r.h) < 1 && r.w >= 180, JSON.stringify(r));
      if (height >= 640) assert.ok(r.scroll <= r.client, 'trace step fits without scrolling: ' + JSON.stringify(r));
    }, height);

    for (const height of [667, 740, 844]) await scenario('a11y intro layout at 390x' + height, async page => {
      await page.click('.node.cur'); await page.evaluate(() => document.fonts.ready); await settle(page);
      const layout = await page.evaluate(() => {
        const stage = document.querySelector('#stage'), go = stage.querySelector('.btn.go');
        const a = stage.getBoundingClientRect(), b = go.getBoundingClientRect();
        return { scroll: stage.scrollHeight, client: stage.clientHeight, stageTop: a.top, stageBottom: a.bottom,
          top: b.top, bottom: b.bottom, viewport: innerHeight,
          direction: getComputedStyle(stage.querySelector('.cardrow')).flexDirection,
          feedback: getComputedStyle(document.querySelector('#fb')).display,
          targets: [...document.querySelectorAll('#xBtn,#stage button')].map(el => {
            const r = el.getBoundingClientRect(); return { text: el.getAttribute('aria-label') || el.textContent, w: r.width, h: r.height };
          }) };
      });
      if (height <= 740) {
        assert.ok(layout.scroll <= layout.client, JSON.stringify(layout));
        assert.ok(layout.top >= layout.stageTop && layout.bottom <= layout.stageBottom && layout.bottom <= layout.viewport, JSON.stringify(layout));
        assert.equal(layout.direction, 'row'); assert.equal(layout.feedback, 'none');
        for (const target of layout.targets) assert.ok(target.w >= 44 && target.h >= 44, JSON.stringify(target));
      } else {
        assert.equal(layout.direction, 'column');
        assert.notEqual(layout.feedback, 'none');
      }
    }, height);
  } finally { await browser.close() }
})().catch(e => { console.log('FAIL a11y tests  ' + e.stack); process.exitCode = 1 });
