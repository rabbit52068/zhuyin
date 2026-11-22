/* 7-1 recorded clips: every line the game asks for is listed in tools/voice-lines.js,
   lines with a clip play the clip, and lines without one fall back to speech synthesis. */
const { chromium } = require('playwright');
const { lines } = require('../tools/voice-lines.js');
const KEYS = new Set(lines().map(l => l.key));
(async () => {
  const b = await chromium.launch(); const pg = await b.newPage({ viewport: { width: 390, height: 844 } });
  const errs = []; pg.on('pageerror', e => errs.push(String(e)));
  await pg.addInitScript(() => {
    window.__said = []; window.__played = []; window.__keys = [];
    Object.defineProperty(window, 'speechSynthesis', { value: { getVoices: () => [], cancel() {},
      speak(u) { window.__said.push(u.text); setTimeout(() => u.onend && u.onend(), 60) } }, configurable: true });
    // fake playback: record the file, then end it
    HTMLMediaElement.prototype.play = function () {
      if (!this.src.startsWith('blob:')) window.__played.push(decodeURIComponent(this.src.replace(/^.*\/audio\//, '')));
      setTimeout(() => this.onended && this.onended(), 60); return Promise.resolve();
    };
    try { localStorage.clear() } catch (e) {}
  });
  await pg.goto('file://' + process.argv[2]); await pg.waitForTimeout(400);
  const ok = (name, cond, extra = '') => { console.log((cond ? 'PASS ' : 'FAIL ') + name + (extra ? '  ' + extra : '')); if (!cond) process.exitCode = 1 };

  // Walk every step of one lesson of each kind: miss twice (encouragement + shown answer), then go on.
  const kinds = await pg.evaluate(() => ['sym', 'review', 'blend', 'tone'].map(t => LESSONS.findIndex(l => l.type === t)));
  for (const id of kinds) {
    await pg.evaluate(id => startLesson(id), id);
    for (let i = 0; i < 8; i++) {
      await pg.waitForTimeout(1600);
      const st = await pg.evaluate(() => LS && !LS.done ? LS.steps[LS.i].t : null);
      if (!st) break;
      await pg.evaluate(async () => {
        const opts = [...document.querySelectorAll('#stage .opt')];
        for (const o of opts.slice().reverse()) { if (o.classList.contains('ok')) break; o.click(); await new Promise(r => setTimeout(r, 900)) }
        if (!opts.length && LS.steps[LS.i].t === 'trace') correct('寫得很好！');
        if (LS.steps[LS.i].t === 'bubbles') correct('全部找到了！');
      });
      await pg.waitForTimeout(1800);
      await pg.evaluate(() => { const go = [...document.querySelectorAll('#stage .btn')].pop(); if (go && /拼拼看/.test(go.textContent)) go.click() });
      await pg.waitForTimeout(1500);
      await pg.evaluate(() => { if (LS && !LS.done) next() });
    }
    await pg.waitForTimeout(1200);
    await pg.evaluate(() => { if (LS) quitLesson() });
  }
  const keys = await pg.evaluate(() => [...new Set(window.__keys)]);
  const missing = keys.filter(k => !KEYS.has(k));
  ok('every spoken line is listed in tools/voice-lines.js', missing.length === 0, missing.join(' | '));
  ok('walk covered many lines', keys.length >= 25, keys.length + ' keys');

  // Clips: a listed line with a file plays the file, not speech synthesis
  const clips = await pg.evaluate(() => CLIP_MAP);
  const hasAny = Object.keys(clips).length > 0;
  if (hasAny) {
    const [key, file] = Object.entries(clips).find(([k]) => !k.startsWith('sym:'));
    const r = await pg.evaluate(async key => { window.__played = []; window.__said = []; await speak(key); return { p: window.__played.slice(), s: window.__said.slice() } }, key);
    ok('line with a clip plays the file', r.p[0] === file && r.s.length === 0, JSON.stringify(r));
  } else console.log('SKIP clip playback (clips.js is empty)');
  const r2 = await pg.evaluate(async () => { window.__played = []; window.__said = []; await speak('這句沒有錄音'); return { p: window.__played.slice(), s: window.__said.slice() } });
  ok('line without a clip uses speech synthesis', r2.p.length === 0 && r2.s[0] === '這句沒有錄音', JSON.stringify(r2));
  // #7: on-screen text has a play icon; tapping the icon or the text reads it
  await pg.evaluate(() => { if (LS) quitLesson(); render() });
  const greet = await pg.evaluate(async () => { const p = document.querySelector('.hello p'); window.__played = [];
    p.querySelector('.say').click(); await new Promise(r => setTimeout(r, 700)); return { icon: !!p.querySelector('.say'), p: window.__played.slice() } });
  ok('#7 map greeting reads aloud from its icon', greet.icon && greet.p.length >= 2, JSON.stringify(greet.p));
  const hint = await pg.evaluate(async () => { startLesson(0); await new Promise(r => setTimeout(r, 2500));
    const el = document.querySelector('#stage .hint'); window.__played = [];
    el.click(); await new Promise(r => setTimeout(r, 900)); return { icon: !!el.querySelector('.say'), p: window.__played.slice() } });
  ok('#7 intro hint reads aloud when the text is tapped', hint.icon && hint.p[0] === 'sym/01.mp3' && hint.p.length === 4, JSON.stringify(hint.p));
  const prompts = await pg.evaluate(() => [...document.querySelectorAll('#stage .prompt span')].every(s => s.querySelector('.say')));
  ok('#7 lesson prompt has a play icon', prompts);
  ok('no page errors', errs.length === 0, errs.join(' | '));
  await b.close();
})();
