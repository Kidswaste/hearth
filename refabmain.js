// (round 68, refab68) 🎧 Reference A/B, the main-process side (docs/upgrades/refab68.md): where the instrument host
// writes "what the desk just played" for measuring ('sketch-peek' in creative-vst-sketch.py, asked through
// creative-vstmain.js). A scratch file in the computer's temp folder, one per Hearth data folder, overwritten by the next
// measure: never in the sketches folder (so it is not a sketch, not in Sessions, not synced). Nothing is uploaded.
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

function peekPath(dataDir) {
  const tag = crypto.createHash('sha1').update(path.resolve(String(dataDir || ''))).digest('hex').slice(0, 10);
  const dir = path.join(os.tmpdir(), 'hearth-refab', tag); fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, 'desk-now.wav');
}
module.exports = { peekPath };
