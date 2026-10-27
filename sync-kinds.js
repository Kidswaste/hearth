// (round 73, syncmedia73) What syncs, by kind: the sync panel's "What syncs" toggles. Pure (no files, no Electron): used
// by the engine (sync-engine.js o.skip / sizes), syncmain.js (settings → which kinds are off) and dev/syncmedia73-test.js.
// A kind turned off on this computer is simply left alone by sync from then on: nothing is deleted, here or in the
// cloud; the files stay where they are. Everything that is in no kind (settings, memory, app data) always syncs.
// Kinds marked perComputer start off (a computer's own runtime: the other computer's would not even run here).
'use strict';
const KINDS = [
  { id: 'chats', label: 'Chats', note: 'with their attachments', re: /^(?:chats\/|attachments\/|trash\/[^/]+\.json$|kv\/chat-meta\.json$)/i },
  { id: 'projects', label: 'Projects & scenes', note: 'Lab scenes, boards, project notes, what chats made', re: /^(?:projects\/|board\/|workspace\/|kv\/(?:projects|three-[^/]+|boards?|board-[^/]+|chat-scenes|video-cuts)\.json$)/i },
  { id: 'captures', label: 'Lab captures', note: 'recordings and screenshots', re: /^captures\//i, big: true },
  { id: 'renders', label: 'Renders', note: 'finished videos and exports', re: /^renders\//i, big: true },
  { id: 'music', label: 'Music sketches & stems', note: 'session sketches, park takes, live sets', re: /^(?:creative-sketches|creative-park|creative-live|stems)\//i, big: true },
  { id: 'photos', label: 'Photos', note: 'My Paris photo copies', re: /^(?:paris-photos|photos)\//i, big: true },
  { id: 'tickets', label: 'Tickets', note: 'your ticket copies', re: /^tickets\//i },
  { id: 'runtime', label: 'Instrument runtime', note: 'each computer installs its own', re: /^creative-vst\/runtime\//i, perComputer: true },
];
const byId = new Map(KINDS.map((k) => [k.id, k]));
const memo = new Map();
// rel (data-folder path with "/") → kind id, or '' (always syncs)
function kindOf(rel) {
  const r = String(rel || '');
  let k = memo.get(r);
  if (k !== undefined) return k;
  k = KINDS.find((x) => x.re.test(r))?.id || '';
  if (memo.size > 250000) memo.clear(); // bounded: a big profile has ~5,000 files (round 74, synchard74: 20,000 was refilled from scratch on every pass at 50,000 files)
  memo.set(r, k);
  return k;
}
// settings.kinds ({ captures: false, runtime: true }) → is this kind on here? (missing = its default)
const isOn = (id, choices = {}) => { const k = byId.get(id); if (!k) return true; return typeof choices?.[id] === 'boolean' ? choices[id] : !k.perComputer; };
// → a skip(rel) for the engine (null when everything syncs)
function skipper(choices = {}) {
  const off = new Set(KINDS.filter((k) => !isOn(k.id, choices)).map((k) => k.id));
  if (!off.size) return null;
  return (rel) => { const k = kindOf(rel); return Boolean(k) && off.has(k); };
}
// sizes per kind from the engine's two scans (Maps rel → { size }): { id: { n, bytes, cloudN, cloudBytes } }
function sizes(local, cloud) {
  const out = Object.fromEntries(KINDS.map((k) => [k.id, { n: 0, bytes: 0, cloudN: 0, cloudBytes: 0 }]));
  for (const [rel, e] of local || []) { const k = kindOf(rel); if (k && e && !e.unavailable) { out[k].n += 1; out[k].bytes += e.size || 0; } }
  for (const [rel, e] of cloud || []) { const k = kindOf(rel); if (k && e) { out[k].cloudN += 1; out[k].cloudBytes += e.size || 0; } }
  return out;
}
// (round 75, syncstate75) the same, letting the engine's event loop breathe (breathe() → a Promise when it is time):
// 100,000 names at 50,000 files held the main process ≈ 30 ms in one piece
async function sizesAsync(local, cloud, breathe) {
  const out = Object.fromEntries(KINDS.map((k) => [k.id, { n: 0, bytes: 0, cloudN: 0, cloudBytes: 0 }]));
  let i = 0;
  for (const [rel, e] of local || []) { const k = kindOf(rel); if (k && e && !e.unavailable) { out[k].n += 1; out[k].bytes += e.size || 0; } if ((++i & 4095) === 0 && breathe) { const b = breathe(); if (b) await b; } }
  for (const [rel, e] of cloud || []) { const k = kindOf(rel); if (k && e) { out[k].cloudN += 1; out[k].cloudBytes += e.size || 0; } if ((++i & 4095) === 0 && breathe) { const b = breathe(); if (b) await b; } }
  return out;
}
// the list the panel shows: label, note, on / off here, sizes
const list = (choices = {}, sz = {}) => KINDS.map((k) => ({ id: k.id, label: k.label, note: k.note, perComputer: Boolean(k.perComputer), big: Boolean(k.big), on: isOn(k.id, choices), ...(sz[k.id] || { n: 0, bytes: 0, cloudN: 0, cloudBytes: 0 }) }));

module.exports = { KINDS, kindOf, isOn, skipper, sizes, sizesAsync, list };
