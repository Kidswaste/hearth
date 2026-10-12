#!/usr/bin/env node
// A stand-in for whisper.cpp's whisper-cli (round 23, voice tests): records its arguments (appends a JSON line to
// $FAKE_WHISPER_LOG, default <tmp>/fake-whisper-args.jsonl), reads the -f WAV and answers with canned text picked by the
// tone it hears (the checks speak with an oscillator), printed as whisper does: one timestamped segment per line,
// a moment apart (so partial text streams). FAKE_WHISPER_TEXT forces the text; FAKE_WHISPER_FAIL=1 exits 1.
const fs = require('fs');
const os = require('os');
const path = require('path');

const args = process.argv.slice(2);
const val = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const file = val('-f');
let freq = 0; let seconds = 0;
try {
  const b = fs.readFileSync(file);
  const rate = b.readUInt32LE(24);
  const n = (b.length - 44) >> 1;
  seconds = n / rate;
  // the tone's pitch: upward swings (with hysteresis, so near-zero samples don't miss one) over the loud span
  let cross = 0; let sign = 0; let first = -1; let last = -1;
  for (let i = 0; i < n; i++) {
    const s = b.readInt16LE(44 + i * 2);
    if (Math.abs(s) > 800) { if (first < 0) first = i; last = i; }
    if (s > 800 && sign < 0) cross += 1;
    if (s > 800) sign = 1; else if (s < -800) sign = -1;
  }
  freq = last > first ? cross / ((last - first) / rate) : 0;
} catch { /* no file: the canned default */ }
fs.appendFileSync(process.env.FAKE_WHISPER_LOG || path.join(os.tmpdir(), 'fake-whisper-args.jsonl'), `${JSON.stringify({ args, freq: Math.round(freq), seconds: Number(seconds.toFixed(2)), at: Date.now() })}\n`);
if (process.env.FAKE_WHISPER_FAIL) { process.stderr.write('error: failed to load model\n'); process.exit(1); }

// 300 Hz → a sentence for the chat box · 500 Hz → "Freeze." · 700 Hz → "Director, make it pinker." · 900 Hz → "Next scene."
const TABLE = [[300, ['Make the particles', 'drift slower, please.']], [500, ['Freeze.']], [700, ['Director, make it pinker.']], [900, ['Next scene.']]];
const text = process.env.FAKE_WHISPER_TEXT ? [process.env.FAKE_WHISPER_TEXT] : (TABLE.reduce((best, row) => (Math.abs(row[0] - freq) < Math.abs(best[0] - freq) ? row : best), TABLE[0]))[1];
const ts = (s) => new Date(s * 1000).toISOString().slice(11, 23);
let i = 0;
const next = () => {
  if (i >= text.length) return;
  process.stdout.write(`[${ts(i * 2)} --> ${ts(i * 2 + 2)}]   ${text[i]}\n`);
  i += 1;
  setTimeout(next, 150);
};
process.stderr.write('whisper_init_from_file: loading model\n');
next();
