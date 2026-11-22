/* traceScore needs real canvas rasterization. A fixed glyph mask keeps the
   three stroke fixtures independent of installed fonts and network access. */
const { chromium } = require('playwright');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

(async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    await page.route('https://fonts.googleapis.com/**', route => route.abort());
    await page.route('https://fonts.gstatic.com/**', route => route.abort());
    await page.goto(pathToFileURL(path.resolve(process.argv[2] || path.join(__dirname, '..', 'index.html'))).href);
    const results = await page.evaluate(() => {
      const original = drawGlyph;
      try {
        // A horizontal ㄧ-shaped mask. Keep Chromium's real canvas operations
        // and the production traceScore; replace only font-dependent rendering.
        drawGlyph = (c, sym, N, color, strokeW) => {
          c.save();
          if (strokeW) {
            c.lineWidth = strokeW; c.strokeStyle = color;
            c.strokeRect(N * .2, N * .45, N * .6, N * .1);
          } else {
            c.fillStyle = color; c.fillRect(N * .2, N * .45, N * .6, N * .1);
          }
          c.restore();
        };
        return [
          { name: 'traceScore empty strokes', score: traceScore('ㄧ', [], 240, 24 / 1.15), cov: 0, prec: 0 },
          { name: 'traceScore matching stroke at scaled canvas size',
            score: traceScore('ㄧ', [[{ x: 48, y: 120 }, { x: 192, y: 120 }]], 240, 24 / 1.15), cov: 1, prec: 1 },
          { name: 'traceScore added off-target stroke lowers precision',
            score: traceScore('ㄧ', [
              [{ x: 48, y: 120 }, { x: 192, y: 120 }],
              [{ x: 48, y: 16 }, { x: 192, y: 16 }],
            ], 240, 24 / 1.15), cov: 1, prec: .5 },
        ];
      } finally { drawGlyph = original }
    });
    for (const { name, score, cov, prec } of results) {
      const pass = score.cov === cov && score.prec === prec && errors.length === 0;
      console.log((pass ? 'PASS ' : 'FAIL ') + name + '  ' + JSON.stringify(score) + (errors.length ? ' ' + errors.join(' | ') : ''));
      if (!pass) process.exitCode = 1;
    }
  } finally { await browser.close() }
})().catch(e => { console.log('FAIL traceScore test  ' + e.stack); process.exitCode = 1 });
