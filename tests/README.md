# Tests

`data.js` runs in plain Node without a browser. The other tests use Playwright. Speech is replaced by a fake, so the tests can check what the game says.

| File | Checks |
|---|---|
| `data.js` | All 37 example words and symbol units, curriculum/audio order, symmetric confusable pairs and distractor priority, tone/blend sets, clip files, one safe SVG picture per symbol (`art.js`) |
| `progress.js` | Fresh v2 saves, historical/key migration, completion/unlocks, chart order, symbol attempts, corrupt storage, export/clear/import round trips and invalid-import protection |
| `a11y.js` | Lesson/star labels, modal focus traps and return, Escape, tab semantics/arrows, native play-button keyboard handling, intro fit at 390×667/740 and unchanged tall-screen layout |
| `stage3.js` | 3-3 review order (most-missed and stale symbols first), 3-4 daily task (3 steps, no stars, done for today), 3-6 break reminder after 15 minutes (continue, rest, parent switch) |
| `report.js` | Parent report counts/rate ranking, practice date, empty state, live reset, gate protection and modal focus/Escape |
| `test.js` | Stage 0: document head, start tip, speaker button, old speech after a step change, Enter spam, `finish()` twice |
| `bub.js` | Stage 0: extra taps after all bubbles are found; 5-5: bubbles rise and never overlap; 5-7: matching game in review lessons |
| `voice.js` | 7-1: every spoken line is listed in `tools/voice-lines.js`, clips play, missing clips fall back to speech synthesis |
| `test1.js` | Stage 1: spoken prompts, encouragement, answer after two misses, tracing, stars, exit dialog, parent check, node size |
| `pwa.js` | 7-6: manifest and icons, the service worker caches the game and every recording, and the game and its clips load offline (uses a local Node server because service workers need http://localhost) |
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
node tests/progress.js "$PWD/index.html"
node tests/a11y.js "$PWD/index.html"
node tests/report.js "$PWD/index.html"
node tests/stage3.js "$PWD/index.html"
```

Screenshots go to `tests/out/`.

`test.js`, `test1.js` and `bub.js` turn recorded clips off (`window.Audio=undefined`) so they can check speech synthesis.

`traceScore` creates a canvas and reads its pixels, so `trace.js` uses Chromium's real canvas. It replaces `drawGlyph` only inside the test with a fixed horizontal mask, then restores it. The three stroke fixtures test coverage, precision, and coordinate scaling without relying on installed fonts or downloading web fonts.

GitHub Actions runs all nine scripts on pushes to `main` and pull requests, using Ubuntu and Node 20. Only CI installs Playwright and Chromium (`npm install --no-save playwright` and `npx playwright install --with-deps chromium`). The workflow fails on a nonzero script exit or any output line beginning with `FAIL`, including scripts that exit successfully after logging a failure. The older Stage 0 scripts also print informational lines; these are kept in the job log.

Dialogs isolate the background with `inert` and trap focus in the top dialog. Escape closes the parent gate, settings, or exit question and restores its opener. Escape within a lesson opens its existing exit confirmation; leaving restores the lesson node by its stable key after the map rebuilds. Tabs share `#main` as their labelled panel, with one tab stop and ArrowLeft/ArrowRight/Home/End navigation. Sentence text remains plain text: document-level pointer/click delegation supports tapping it, while only its native `.say` button is a keyboard control. Its decorative SVG is hidden from assistive technology, and button clicks do not bubble into a second reading.

At heights up to 740px, intro steps reclaim the hidden feedback bar's space and place the speaker beside the smaller card. Compact intro buttons have at least 44px targets. The existing column layout and reserved feedback space remain at 844px. The browser layout checks use local fallback fonts and block remote font requests.

Progress uses `zy-progress = {v:2, stars, acc, sym}`. Stars and lesson records use stable keys (`sym:ㄅ`, `review:<unit name>`, `blend:<unit name>:<zero-based set index>`, `tone:<unit name>:<zero-based set index>`); array IDs remain for rendering. Keys survive unit reordering; renaming a unit or reordering sets within a unit needs an explicit key migration. V1 indices retain their historical consonant → final → medial order. The old `review:結合韻` key migrates to `review:介音`; if both exist, the highest star count and newest record win (the current key wins timestamp ties). Unknown lessons and invalid entries are dropped, and normalized v2 is saved immediately. Bad JSON, invalid top-level values, and unsupported versions recover to empty v2. Valid v2 symbol counts survive reloads; private-mode storage errors are caught.

The map follows `UNITS`: consonants → medials → finals → blend/tone lessons. The chart uses the same order for its three symbol groups. `SYM`/`ORDER` retain their original audio numbering. Distractors select confusable partners first, then learned symbols, then the hint pool, then other symbols, shuffling within each tier. The blend missing-consonant step additionally restricts eligible choices to consonants. The Node data test checks partner inclusion across 500 calls, target/duplicate exclusion, and priority/filtering behavior.

Symbol attempts are saved immediately. Listen/picture count the target, bubbles count each wrong tap and one successful completion, and trace counts each scored failure or successful drawing. Empty trace submissions are hints, and the assisted advance after two failures adds no correct attempt. Shown option answers after two misses also add no correct attempt. Simple blend choices count both symbols; a missing-consonant question counts only that consonant. Tone choices count a one-symbol or consonant-plus-vowel/medial base, ignoring tone marks. Demonstrations and complex/three-part bases add no attempts.

Parent settings export a JSON object `{progress, settings}`. The read-only text can be copied; if the clipboard API is unavailable or denied, the text is selected for manual copying. Imports accept that backup or raw v1/v2 progress, validate its shape/counts/settings, and normalize it with `readProgress()`. A star-count preview and second tap are required before replacing data. Editing the text or changing current progress/settings invalidates the previous confirmation. Raw progress imports preserve current settings. Unknown lesson/symbol keys follow the existing migration rules; a nonempty import with no usable entries is rejected.

The parent report stays inside the existing settings modal. It shows symbols with completed lessons, all completed lessons, and up to five symbols with at least three attempts and an error. Ranking is by error rate, then wrong-count, then fixed symbol order. The last-practice date uses the latest valid positive timestamp across symbol attempts and lesson records. Recent lessons appear in the report; reset/import refresh it. The report is a focusable labelled section, so it stays in the same focus trap and Escape returns to the Settings opener. No play-time tracking is added.
