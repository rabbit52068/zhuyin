#!/bin/sh
# Trim the silence that Edge voices add around each line (about 0.2 s before and 0.8-1.5 s after).
# Keeps 0.05 s before and 0.1 s after the speech; the speech itself is not changed.
# The game adds its own pause between clips (GAP in app.js).
# Usage: tools/trim-silence.sh audio/v/line-001.mp3 [more files...]   (files are replaced in place)
set -e
for f in "$@"; do
  tmp="${f%.mp3}.trim.mp3"
  ffmpeg -loglevel error -y -i "$f" -af "silenceremove=start_periods=1:start_threshold=-40dB:start_silence=0.05,areverse,silenceremove=start_periods=1:start_threshold=-40dB:start_silence=0.1,areverse" -ar 24000 -ac 1 -b:a 48k "$tmp"
  mv "$tmp" "$f"
done
