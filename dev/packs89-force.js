// (round 89, packs89) The sync suites with packs FORCED on: every engine a test makes gets the pack lane (syncpack.js),
// on, for every chat (HEARTH_PACKS_MIN, default 1 byte), with a short quiet time (HEARTH_PACKS_QUIET_MS, default 6 s of
// the test's own clock). Loaded before the test, it wraps sync-engine.js's createEngine; nothing else changes:
//   node -r ./dev/packs89-force.js dev/sync72-test.js
// (as round 82 ran them again with HEARTH_SYNCCHAT_MIN=1)
'use strict';
const E = require('../sync-engine');
const { createPackLane } = require('../syncpack');
const orig = E.createEngine;
const made = [];
E.createEngine = (o = {}) => {
  if (o.packs) return orig(o);
  const lane = createPackLane({ on: true, min: Number(process.env.HEARTH_PACKS_MIN) || 1, quietMs: Number(process.env.HEARTH_PACKS_QUIET_MS) || 6000, now: o.now, log: o.log });
  made.push(lane);
  return orig({ ...o, packs: lane });
};
process.on('exit', () => {
  const t = made.reduce((a, l) => { const s = l.status(); a.published += s.published; a.took += s.took; a.bytesUp += s.bytesUp; a.open += s.gate?.ok ? 1 : 0; return a; }, { published: 0, took: 0, bytesUp: 0, open: 0 });
  console.log(`packs89-force: ${made.length} engines with the pack lane · gate open at the end on ${t.open} · ${t.published} publishes, ${t.took} takes, ${t.bytesUp} bytes of pieces`);
});
