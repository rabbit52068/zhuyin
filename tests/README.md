# Tests

`data.js` runs in plain Node without a browser. The other tests use Playwright. Speech is replaced by a fake, so the tests can check what the game says.

| File | Checks |
|---|---|
| `data.js` | All 37 example words and symbol units, tone sets, blend symbols, spoken clip keys and audio files |
| `test.js` | Stage 0: document head, start tip, speaker button, old speech after a step change, Enter spam, `finish()` twice |
| `bub.js` | Stage 0: extra taps after all bubbles are found |
| `voice.js` | 7-1: every spoken line is listed in `tools/voice-lines.js`, clips play, missing clips fall back to speech synthesis |
| `test1.js` | Stage 1: spoken prompts, encouragement, answer after two misses, tracing, stars, exit dialog, parent check, node size |
| `trace.js` | Three fixed `traceScore` cases: empty strokes, a matching stroke, and an added off-target stroke that lowers precision |

Run the data checks with no dependencies:

```sh
node tests/data.js
```

Run browser tests using the existing Playwright installation in the other project; do not run `npm install` or add `node_modules` in this repository:

```sh
export NODE_PATH=/Users/clawmac/Hermes-Projects/Microsoft-Rewards-Script/node_modules
node tests/test1.js "$PWD/index.html"
node tests/test.js "$PWD/index.html"
node tests/bub.js "$PWD/index.html"
node tests/voice.js "$PWD/index.html"
node tests/trace.js "$PWD/index.html"
```

Screenshots go to `tests/out/`.

`test.js`, `test1.js` and `bub.js` turn recorded clips off (`window.Audio=undefined`) so they can check speech synthesis.

`traceScore` creates a canvas and reads its pixels, so `trace.js` uses Chromium's real canvas. It replaces `drawGlyph` only inside the test with a fixed horizontal mask, then restores it. The three stroke fixtures test coverage, precision, and coordinate scaling without relying on installed fonts or downloading web fonts.

GitHub Actions runs all six scripts on pushes to `main` and pull requests, using Ubuntu and Node 20. Only CI installs Playwright and Chromium (`npm install --no-save playwright` and `npx playwright install --with-deps chromium`). The workflow fails on a nonzero script exit or any output line beginning with `FAIL`, including scripts that exit successfully after logging a failure. The older Stage 0 scripts also print informational lines; these are kept in the job log.
