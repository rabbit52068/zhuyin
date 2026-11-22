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
  ok('#7 intro hint reads aloud when the text is tapped', hint.icon && hint.p[0] === 'sym/01.mp3' && /^v\/hint-001\.mp3$/.test(hint.p[1]) && hint.p.length === 2, JSON.stringify(hint.p));
  const prompts = await pg.evaluate(() => [...document.querySelectorAll('#stage .prompt span')].every(s => s.querySelector('.say')));
  ok('#7 lesson prompt has a play icon', prompts);
  // Codex R1 #1: tapping a sentence during an automatic prompt stops the prompt for good
  const overlap = await pg.evaluate(async () => { if (LS) quitLesson(); startLesson(0);
    await new Promise(r => setTimeout(r, 100)); window.__played = [];
    document.querySelector('#stage .hint').click();                       // tap before the auto prompt starts
    await new Promise(r => setTimeout(r, 2500)); return window.__played.slice() });
  ok('R1#1 a tap cancels the pending automatic prompt', overlap.length === 2 && overlap[0] === 'sym/01.mp3', JSON.stringify(overlap));
  // Codex R1 #2: switching tabs stops the map greeting
  const tabs = await pg.evaluate(async () => { if (LS) quitLesson(); tab = 'path'; render();
    window.__played = []; document.querySelector('.hello p .say').click();
    await new Promise(r => setTimeout(r, 30)); document.querySelector('#tabChart').click();
    await new Promise(r => setTimeout(r, 900)); return window.__played.slice() });
  ok('R1#2 switching tabs stops the map greeting', tabs.length === 1, JSON.stringify(tabs));
  // Codex R2: delayed speech never overrides a newer tap
  const miss = await pg.evaluate(async () => { const sl = ms => new Promise(r => setTimeout(r, ms));
    if (LS) quitLesson(); startLesson(0); await sl(200); LS.i = LS.steps.findIndex(s => s.t === 'listen'); showStep(); await sl(2500);
    const s = LS.steps[LS.i].s; window.__played = [];
    [...document.querySelectorAll('#stage .opt')].find(o => o.textContent.trim() !== s).click();   // first miss
    await sl(400); document.querySelector('#stage .prompt span').click();                           // tap during encouragement
    await sl(2000); return window.__played.slice() });
  ok('R2 no sound replay after a tap during encouragement', miss.length === 2 && !miss.includes('sym/01.mp3'), JSON.stringify(miss));
  const res = await pg.evaluate(async () => { const sl = ms => new Promise(r => setTimeout(r, ms));
    if (LS) quitLesson(); startLesson(0); await sl(200); window.__played = []; finish();
    document.querySelector('.result p').click(); await sl(2500); return window.__played.slice() });
  ok('R2 result tap is not cut off by result auto-play', res.length === 2 && res[1] === 'sym/01.mp3', JSON.stringify(res));
  const quit = await pg.evaluate(async () => { const sl = ms => new Promise(r => setTimeout(r, ms));
    quitLesson(); startLesson(0); await sl(350); window.__played = []; askQuit(); await sl(1500); return window.__played.slice() });
  ok('R2 quit question stops the automatic prompt', quit.length === 1, JSON.stringify(quit));
  // Codex R3: per-miss and per-answer audio ownership
  const listenStep = async () => { const sl = ms => new Promise(r => setTimeout(r, ms));
    if (LS) quitLesson(); startLesson(0); await sl(200); LS.i = LS.steps.findIndex(s => s.t === 'listen'); showStep(); await sl(2500); };
  const two = await pg.evaluate(async (fn) => { const sl = ms => new Promise(r => setTimeout(r, ms)); await eval(fn)();
    const s = LS.steps[LS.i].s, wrongs = [...document.querySelectorAll('#stage .opt')].filter(o => o.textContent.trim() !== s);
    window.__played = []; wrongs[0].click(); await sl(40); wrongs[1].click(); await sl(2000); return window.__played.slice() }, listenStep.toString());
  ok('R3 two quick misses: no stale replay', !two.includes('sym/01.mp3') && two.length === 3, JSON.stringify(two));
  const after = await pg.evaluate(async (fn) => { const sl = ms => new Promise(r => setTimeout(r, ms)); await eval(fn)();
    const s = LS.steps[LS.i].s, opts = [...document.querySelectorAll('#stage .opt')];
    window.__played = []; opts.find(o => o.textContent.trim() !== s).click(); await sl(500);
    opts.find(o => o.textContent.trim() === s).click(); await sl(1500); return window.__played.slice() }, listenStep.toString());
  ok('R3 correct answer after a miss still gets praise, no stale replay', after.length === 2 && !after.includes('sym/01.mp3'), JSON.stringify(after));
  await pg.evaluate(() => { if (LS) quitLesson() });
  ok('no page errors', errs.length === 0, errs.join(' | '));
  await b.close();
})();
