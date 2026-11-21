# Browser tests

Playwright smoke tests. Speech is replaced by a fake, so the tests can check what the game says.

| File | Checks |
|---|---|
| `test.js` | Stage 0: document head, start tip, speaker button, old speech after a step change, Enter spam, `finish()` twice |
| `bub.js` | Stage 0: extra taps after all bubbles are found |
| `test1.js` | Stage 1: spoken prompts, encouragement, answer after two misses, tracing, stars, exit dialog, parent check, node size |

Run:

```sh
npm install playwright
npx playwright install chromium
node tests/test1.js "$PWD/index.html"
node tests/test.js "$PWD/index.html"
node tests/bub.js "$PWD/index.html"
```

Screenshots go to `tests/out/`.
