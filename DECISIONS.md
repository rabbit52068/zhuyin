# Decisions for the open roadmap items

Date: 2026-11-21. These answer the three open items at the end of `ROADMAP.md` (待決定事項).

## 1. Illustrations (roadmap 4-1, 4-2)

**Decision: draw the 37 word pictures ourselves as SVG in Style A (bold outline, flat colour). Use Style C (sticker border) only in the sticker book.**

- Samples: `samples/art-styles.html`. It draws 包子, 杯子, 西瓜 and 燈 in four styles next to the current cat.
- Style A uses the same recipe as `catSVG()`: flat fill, 3 px outline in a darker shade of the fill, one white highlight. The cat needs no change.
- Style C is Style A plus a white border and a small shadow (one SVG filter). It fits 4-2: a grey silhouette before the child learns the symbol, the sticker after.
- Rejected: Style B (soft, no outline) needs a new cat and blurs at 44 px. Style D (ink line in a badge) clashes with the cat's orange outline and makes each picture about 30% smaller.
- An illustrator is not needed for v2.0. Revisit if the game grows past the 37 base words (stage 6).

## 2. Voice (roadmap 7-1 and the "錄音" external task)

**Decision (2026-11-22, replaces the decisions below):**

- **Symbol sounds (37 clips): Ministry of Education 《國語注音符號手冊》 open materials** (`bopomofo_materials_20170213.zip`, CC BY 4.0, credit: 2017 © 教育部，國語注音符號手冊-開放部件). Decided 2026-11-22; the owner checked all 37 by ear. No TTS model said the bare symbols correctly: the owner judged stand-in characters (玻 for ㄅ) and bare-symbol input wrong for every model tried. Other recordings that sounded right were not usable: Mandarin Daily News (國語日報) and bopomofo-master.com are "all rights reserved" or forbid republishing. Credits are in README.md and on the parent settings page.
- **Every other line: Microsoft Edge neural voices, pre-rendered.** Sentences use 曉臻 (zh-TW-HsiaoChenNeural). Single characters and words use 曉雨 (zh-TW-HsiaoYuNeural). The owner chose this in a blind A/B test: both voices got all 12 tone tests right (八拔把爸, 媽麻馬罵, 衣姨椅億), the owner preferred 曉雨 on 6 of 8 tone items and 曉臻 on all 6 sentences.
- Tone test results by ear (same character read four times, one clip per tone): Edge 曉臻 and 曉雨 4/4; BreezyVoice 1/4 to 3/4 depending on the take; Chatterbox 2/4; Meijia was not graded. BlueMagpie-TTS could not say bare symbols and its license forbids redistributing output.
- Edge clips are trimmed with `tools/trim-silence.sh` (0.05 s kept before the speech, 0.1 s after; Edge adds about 0.2 s before and 0.8-1.5 s after). The game pauses `GAP` = 0.5 s between clips in a sequence (owner's choice, 2026-11-22). Run the script on every new Edge clip.
- How it works: `tools/voice-lines.js` lists every line the game can say and writes `clips.js` (line key to file). `speak()` plays the clip when one exists and falls back to Web Speech otherwise. `tests/voice.js` fails if the game says a line that is not in the list.

Older notes (2026-11-21), kept for the record:

Open findings when paused:
- The owner wants a Taiwan accent, higher and more cheerful. A cloned Chatterbox voice (`exaggeration` 0.6) was liked but sounds mainland, because Chatterbox learned Chinese mostly from mainland speech and the reference clip was English.
- Tone test format (owner's rule): one clip per tone, the same syllable read four times (八八八八, 拔拔拔拔, 把把把把, 爸爸爸爸). Chatterbox never makes tone 4 fall, even with a Taiwanese reference clip.
- BreezyVoice Space (Splend1dchan/BreezyVoice-Playground) returned a 0.25 s placeholder for every input, so it is broken on its side.
- Candidates to try next: local BreezyVoice (about 5–6 GB, CPU only on Mac, untested; needs owner OK), Yating Studio clips, or a Taiwanese Mandarin reference clip for Chatterbox. Check each service's terms before shipping its audio.


**Decision (updated 2026-11-21): use Chatterbox (local, mlx-audio) for the game voice, pre-rendered to audio files. The owner listened and preferred it to Meijia. Target: higher and more cheerful than the first test. Keep Web Speech as the fallback. Real recordings stay the fallback plan for tones if a tone check fails.**

Round 2 (higher, livelier): `exaggeration` defaults to 0.1 in mlx-audio, so the first test was flat. Seven candidates (voices: VCTK p361 and p236, plus one private reference clip; `exaggeration` 0.6 and 1.0; +3 semitone pitch shift with `rubberband -F`) were compared by ear on a private listening page. Whisper read every line correctly except one near miss (p361 at 0.6: 注音→猪音). Pitch tracking was too noisy on short clips to grade tones automatically, so tones need a listening check per clip.

First test, kept for the record:

Local TTS engines already on the development machine, tested on 2026-11-21:

| Engine | Where | Chinese? | Result |
|---|---|---|---|
| Kyutai Pocket TTS | local venv | No, English only | Not usable |
| Chatterbox multilingual, mlx-audio 0.5.6 (`mlx-community/chatterbox-fp16`) | local venv | Yes (`--lang_code zh`) | Words correct, tones wrong |
| Kokoro-82M voices `zf_xiaoxiao`, `zm_yunxi` | HF cache only, package not installed | Mainland Mandarin | Not tested |
| macOS `say -v Meijia` (zh_TW) | system | Yes, Taiwan | Tones correct, single characters clipped |

How it was checked:

- Whisper large-v3-turbo (local) read back Chatterbox clips: 玻→拨, 包子, 葡萄, 椰子, 燈→等, 答對了你好棒 all correct as words.
- Whisper cannot judge tones (it heard 八拔把爸 as four times the same syllable), so pitch was measured per syllable with `librosa.pyin` (semitones above 100 Hz, start > middle > end):
  - Chatterbox 八拔把爸: `12>12>14  7>7>9  9>10>11  28>28>28`. Tone 3 rises instead of dipping, tone 4 is flat. Fail.
  - Meijia 八拔把爸: `16>16>13  10>10>13  10>9>10  8>7>5`. Level, rising, low, falling. Pass.
- Meijia said the single character 玻 in 0.25 s. This is the same voice that Safari and Chrome use on a Mac, so the current `SYM[s].say` single-character trick is weak even on good devices.
- The Chatterbox clone reference is an English speaker (VCTK p361), so an accent is likely. Nobody has listened yet.

Why recordings win: tones are the content of station 12, and the symbol sounds (ㄝ, ㄥ, …) have no good stand-in character for any TTS. 37 symbols plus 12 tone syllables is about 50 clips, roughly 200 KB as Opus or MP3.

Where local TTS still helps (optional, after a listening test):

- Pre-render spoken prompts and praise for 1-1 ("找出 ㄅ", "答對了！") with Chatterbox cloned from a 10 s Taiwanese reference clip. Words came out right; check accent by ear first.
- Do not redistribute Meijia clips: macOS voice output is licensed for use on the Mac, not for shipping in an app.

## 3. Split `index.html` (roadmap 2-1)

**Decision: split now, as stage 2-1 describes (`data.js`, `style.css`, `app.js`, no build step). GitHub Pages becomes the main URL (0-8).**

- Recorded clips (decision 2) and SVG pictures (decision 1) make the game multi-file anyway.
- The cost named in the roadmap is small: the Artifact tool publishes extra files beside the page (`files` map), so the Claude Artifact copy can stay in sync with the same files.
- Order: do stage 0 fixes in the single file first (small diffs, easy to review), then split, then stages 1 and 3 on the split files.
