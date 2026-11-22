/* Plain Node validation of lesson data and recorded clip references. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { lines } = require('../tools/voice-lines.js');
const ROOT = path.join(__dirname, '..');
const ctx = vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(ROOT, 'data.js'), 'utf8') +
  ';this.D = {SYM, ORDER, UNITS, TONES, CONFUSE, LESSONS};', ctx);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'clips.js'), 'utf8') + ';this.C = CLIPS;', ctx);
const { SYM, ORDER, UNITS, TONES, CONFUSE, LESSONS } = ctx.D;

function check(name, fn) {
  try { fn(); console.log('PASS ' + name) }
  catch (e) { console.log('FAIL ' + name + '  ' + e.message); process.exitCode = 1 }
}

check('every example word contains its target symbol', () => {
  assert.equal(Object.keys(SYM).length, 37);
  for (const [symbol, entry] of Object.entries(SYM)) {
    const zhuyin = entry.w.map(item => item[1]).join('');
    assert.ok(zhuyin.includes(symbol), `${symbol}: ${zhuyin}`);
  }
});

check('symbol units cover all 37 symbols exactly once', () => {
  assert.equal(ORDER.length, 37);
  assert.equal(new Set(ORDER).size, 37);
  const symbols = UNITS.filter(u => u.kind === 'sym').flatMap(u => [...u.sy]);
  assert.equal(symbols.length, 37);
  for (const symbol of ORDER) {
    assert.ok(Object.hasOwn(SYM, symbol), `${symbol}: missing SYM entry`);
    assert.equal(symbols.filter(s => s === symbol).length, 1, `${symbol}: unit count`);
  }
  for (const symbol of symbols) assert.ok(ORDER.includes(symbol), `${symbol}: not in ORDER`);
});

check('curriculum puts medials before finals while symbol audio indices stay fixed', () => {
  assert.equal(ORDER.join(''), 'ㄅㄆㄇㄈㄉㄊㄋㄌㄍㄎㄏㄐㄑㄒㄓㄔㄕㄖㄗㄘㄙㄚㄛㄜㄝㄞㄟㄠㄡㄢㄣㄤㄥㄦㄧㄨㄩ');
  assert.deepEqual(Array.from(UNITS, u => u.kind === 'sym' ? u.tag : u.kind),
    ['聲母', '聲母', '聲母', '聲母', '聲母', '聲母', '介音', '韻母', '韻母', '韻母', 'blend', 'tone']);
  assert.equal(UNITS.find(u => u.sy === 'ㄧㄨㄩ').name, '介音');
  assert.equal(new Set(LESSONS.map(l => l.key)).size, LESSONS.length);
  ORDER.forEach((s, i) => assert.equal(ctx.C['sym:' + s], `sym/${String(i + 1).padStart(2, '0')}.mp3`, s));
});

check('confusable partners are real, symmetric, and include all seven required pairs', () => {
  assert.equal(Object.keys(CONFUSE).length, 14);
  for (const [s, partners] of Object.entries(CONFUSE)) {
    assert.ok(ORDER.includes(s), s);
    assert.ok(partners.length > 0, s);
    assert.equal(new Set(partners).size, partners.length, s);
    for (const p of partners) {
      assert.ok(p !== s && ORDER.includes(p), `${s}: ${p}`);
      assert.ok(CONFUSE[p]?.includes(s), `${s}/${p}: asymmetric`);
    }
  }
  for (const [a, b] of ['ㄅㄆ', 'ㄓㄗ', 'ㄔㄘ', 'ㄕㄙ', 'ㄣㄥ', 'ㄢㄤ', 'ㄛㄜ']) assert.ok(CONFUSE[a].includes(b), a + b);
});

function appContext() {
  const c = vm.createContext({ window: {} });
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'data.js'), 'utf8'), c);
  // Define the production functions without booting the browser UI.
  const source = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8').split('/* ======================= BOOT')[0];
  vm.runInContext(source, c);
  return c;
}

check('distractors always include the confusable partner in 500 calls without duplicates or target', () => {
  const c = appContext();
  for (let i = 0; i < 500; i++) {
    const out = vm.runInContext("distractors('ㄅ',2,['ㄅ','ㄇ','ㄈ','ㄇ','X'])", c);
    assert.equal(out.length, 2);
    assert.ok(out.includes('ㄆ'));
    assert.ok(!out.includes('ㄅ'));
    assert.equal(new Set(out).size, out.length);
    assert.ok(out.every(s => ORDER.includes(s)));
  }
  for (const s of ORDER) for (const n of [0, 1, 2, 5, 50]) {
    c.target = s; c.n = n;
    const out = vm.runInContext("distractors(target,n,[target,target,'X','ㄅ','ㄅ'])", c);
    assert.equal(out.length, Math.min(n, 36), s);
    assert.equal(new Set(out).size, out.length, s);
    assert.ok(!out.includes(s) && out.every(p => ORDER.includes(p)), s);
    if (n > 0) for (const p of CONFUSE[s] || []) assert.ok(out.includes(p), `${s}/${p}`);
  }
});

check('distractor priority keeps learned symbols, hint fallback, and consonant-only blends sensible', () => {
  const c = appContext();
  vm.runInContext("P.stars={'sym:ㄚ':3,'sym:ㄧ':3}", c);
  const out = vm.runInContext("distractors('ㄅ',2,['ㄇ','ㄈ'])", c);
  assert.equal(out[0], 'ㄆ');
  assert.ok(['ㄚ', 'ㄧ'].includes(out[1]), 'learned symbols precede unlearned hints');
  const blend = vm.runInContext("distractors('ㄓ',2,['ㄅ','ㄆ','ㄇ','ㄈ','ㄉ','ㄊ','ㄍ','ㄎ','ㄏ','ㄓ'],[...INITIALS])", c);
  assert.equal(blend.length, 2);
  assert.ok(blend.includes('ㄗ'), 'partner outside the hint is still preferred');
  assert.ok(blend.every(s => ORDER.indexOf(s) < 21), 'blend choices stay consonants');
  vm.runInContext('P.stars={}', c);
  assert.deepEqual(new Set(vm.runInContext("distractors('ㄇ',2,['ㄅ','ㄆ','ㄅ','ㄇ','X'])", c)), new Set(['ㄅ', 'ㄆ']));
});

check('tone sets have four matching bases in first-to-fourth tone order', () => {
  assert.equal(JSON.stringify(TONES), JSON.stringify(['', 'ˊ', 'ˇ', 'ˋ']));
  const units = UNITS.filter(u => u.kind === 'tone');
  assert.ok(units.length > 0, 'no tone units');
  for (const unit of units) {
    assert.ok(unit.sets.length > 0, `${unit.name}: no tone sets`);
    for (const set of unit.sets) {
      assert.equal(set.length, 4, `${unit.name}: ${JSON.stringify(set)}`);
      const base = set[0][1];
      assert.ok(base.length > 0 && [...base].every(s => ORDER.includes(s)), `invalid base: ${base}`);
      set.forEach(([ch, zhuyin], i) => assert.equal(zhuyin, base + TONES[i], `${ch}: tone ${i + 1}`));
    }
  }
});

check('blends pair a consonant with a vowel or medial from ORDER', () => {
  const symbolsFor = tags => new Set(UNITS.filter(u => u.kind === 'sym' && tags.includes(u.tag)).flatMap(u => [...u.sy]));
  const consonants = symbolsFor(['聲母']), vowels = symbolsFor(['韻母', '介音']);
  const units = UNITS.filter(u => u.kind === 'blend');
  assert.ok(units.length > 0, 'no blend units');
  for (const unit of units) {
    assert.ok(unit.sets.length > 0, `${unit.name}: no blend sets`);
    for (const set of unit.sets) {
      assert.ok(set.length > 0, `${unit.name}: empty blend set`);
      for (const item of set) {
        assert.equal(item.length, 3, `invalid blend: ${JSON.stringify(item)}`);
        const [a, b, ch] = item;
        assert.ok(ORDER.includes(a) && consonants.has(a), `${ch}: ${a} is not a consonant`);
        assert.ok(ORDER.includes(b) && vowels.has(b), `${ch}: ${b} is not a vowel or medial`);
      }
    }
  }
});

check('every clip key is a spoken line and references an existing file under audio/', () => {
  const keys = new Set(lines().map(line => line.key));
  const audio = path.join(ROOT, 'audio');
  for (const [key, file] of Object.entries(ctx.C)) {
    assert.ok(keys.has(key), `unlisted key: ${key}`);
    assert.equal(typeof file, 'string', `${key}: invalid file path`);
    const target = path.resolve(audio, file);
    const relative = path.relative(audio, target);
    assert.ok(relative && !relative.startsWith('..') && !path.isAbsolute(relative), `${key}: outside audio/: ${file}`);
    assert.ok(fs.statSync(target).isFile(), `${key}: not a file: ${file}`);
    const realRelative = path.relative(fs.realpathSync(audio), fs.realpathSync(target));
    assert.ok(realRelative && !realRelative.startsWith('..') && !path.isAbsolute(realRelative), `${key}: resolves outside audio/: ${file}`);
  }
});
