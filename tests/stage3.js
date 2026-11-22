/* Stage 3: spaced review order (3-3), daily task (3-4), break reminder (3-6). */
const { chromium } = require('playwright');
const { lines } = require('../tools/voice-lines.js');
const KEYS = new Set(lines().map(l => l.key));
const DAY = 864e5;
(async () => {
  const b = await chromium.launch();
  const errs = [];
  const ok = (name, cond, extra = '') => { console.log((cond ? 'PASS ' : 'FAIL ') + name + (extra ? '  ' + extra : '')); if (!cond) process.exitCode = 1 };
  const page = async (progress) => {
    const pg = await b.newPage({ viewport: { width: 390, height: 844 } });
    pg.on('pageerror', e => errs.push(String(e)));
    await pg.addInitScript(p => {
      window.Audio = undefined; window.__keys = [];
      Object.defineProperty(window, 'speechSynthesis', { value: { getVoices: () => [], cancel() {}, speak(u) { setTimeout(() => u.onend && u.onend(), 30) } }, configurable: true });
      try { localStorage.clear(); if (p) localStorage.setItem('zy-progress', JSON.stringify(p)) } catch (e) {}
    }, progress);
    await pg.goto('file://' + process.argv[2]); await pg.waitForTimeout(400);
    return pg;
  };
  const now = Date.now();
  const four = { 'sym:ㄅ': 3, 'sym:ㄆ': 3, 'sym:ㄇ': 3, 'sym:ㄈ': 3 };

  // 3-3: high error rate and long-unpracticed symbols come first
  let pg = await page({ v: 2, stars: four, acc: {}, sym: {
    'ㄅ': { ok: 9, ng: 0, t: now }, 'ㄆ': { ok: 1, ng: 5, t: now }, 'ㄇ': { ok: 5, ng: 0, t: now - 30 * DAY }, 'ㄈ': { ok: 8, ng: 0, t: now } } });
  const due = await pg.evaluate(() => Array.from({ length: 20 }, () => dueSymbols(2).sort().join('')));
  ok('3-3 most-missed and stale symbols are due first', due.every(x => x === 'ㄆㄇ'.split('').sort().join('')), JSON.stringify([...new Set(due)]));
  const only = await pg.evaluate(() => dueSymbols(3).every(s => learned().has(s)));
  ok('3-3 only learned symbols are reviewed', only);

  // 3-4: daily card appears with 3+ learned symbols, runs 3 steps, gives no stars, marks the day done
  const card = await pg.evaluate(() => ({ has: !!document.querySelector('.daily'), text: document.querySelector('.daily p')?.textContent, icon: !!document.querySelector('.daily .say') }));
  const top = await pg.evaluate(() => { const r = document.querySelector('.daily').getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight });
  ok('3-4 an open daily card is on screen when the map opens', top);
  ok('3-4 daily card shows when 3+ symbols are learned', card.has && card.icon && /三個注音/.test(card.text), JSON.stringify(card));
  const run = await pg.evaluate(async () => { const stars0 = totalStars();
    document.querySelector('#dailyGo').click(); await new Promise(r => setTimeout(r, 300));
    const steps = LS.steps.map(s => s.t + ':' + s.s), type = LS.L.type;
    finish(); await new Promise(r => setTimeout(r, 1500));
    const res = { steps, type, stars: totalStars() - stars0, daily: P.daily, saved: JSON.parse(localStorage.getItem('zy-progress')).daily, result: document.querySelector('.result p').textContent, bigstars: !!document.querySelector('.bigstars') };
    quitLesson(); await new Promise(r => setTimeout(r, 200));
    res.after = document.querySelector('.daily p').textContent; res.button = document.querySelector('#dailyGo').textContent; return res });
  ok('3-4 daily task has 3 review steps', run.type === 'daily' && run.steps.length === 3, JSON.stringify(run.steps));
  ok('3-4 finishing gives no stars and saves today', run.stars === 0 && !run.bigstars && run.daily && run.saved && run.daily.d === run.saved.d, JSON.stringify(run));
  ok('3-4 card shows done and can be replayed', run.after === '今天的任務完成了！' && run.button === '再玩一次', JSON.stringify([run.after, run.button]));
  await pg.close();

  pg = await page({ v: 2, stars: { 'sym:ㄅ': 3, 'sym:ㄆ': 3 }, acc: {}, sym: {} });
  ok('3-4 no daily card before 3 symbols are learned', !(await pg.$('.daily')));
  await pg.close();

  // 3-6: after 15 minutes of play the next step asks for a break first
  pg = await page({ v: 2, stars: four, acc: {}, sym: {} });
  const brk = await pg.evaluate(async () => { startLesson(1); await new Promise(r => setTimeout(r, 300));
    const i0 = LS.i; PLAY.ms = 15 * 60e3; PLAY.last = Date.now(); next();
    const shown = { ask: !!LS.layer.querySelector('.ask'), text: LS.layer.querySelector('.ask p')?.textContent, same: LS.i === i0 };
    document.querySelector('#brkMore').click(); await new Promise(r => setTimeout(r, 200));
    return { ...shown, gone: !LS.layer.querySelector('.ask'), moved: LS.i === i0 + 1, nextAt: PLAY.next } });
  ok('3-6 break reminder appears before the next step', brk.ask && brk.same && /休息/.test(brk.text), JSON.stringify(brk));
  ok('3-6 「再玩一下」 continues and asks again later', brk.gone && brk.moved && brk.nextAt >= 25 * 60e3 - 1000, JSON.stringify(brk));
  const rest = await pg.evaluate(async () => { PLAY.ms = PLAY.next; PLAY.last = Date.now(); next();
    document.querySelector('#brkRest').click(); await new Promise(r => setTimeout(r, 200));
    return { lesson: !!LS, ms: PLAY.ms, map: !!document.querySelector('.hello') } });
  ok('3-6 「休息一下」 goes back to the map and resets the timer', !rest.lesson && rest.ms === 0 && rest.map, JSON.stringify(rest));
  const off = await pg.evaluate(async () => { S.breakOff = true; startLesson(1); await new Promise(r => setTimeout(r, 300));
    const i0 = LS.i; PLAY.ms = 99 * 60e3; next(); const r = { ask: !!LS.layer.querySelector('.ask'), moved: LS.i === i0 + 1 }; quitLesson(); delete S.breakOff; return r });
  ok('3-6 parents can turn the reminder off', !off.ask && off.moved, JSON.stringify(off));
  const keys = await pg.evaluate(() => [...new Set(window.__keys)]);
  const missing = keys.filter(k => !KEYS.has(k));
  ok('stage 3 lines are all in tools/voice-lines.js', missing.length === 0, missing.join(' | '));
  await pg.close();

  ok('no page errors', errs.length === 0, errs.join(' | '));
  await b.close();
})();
