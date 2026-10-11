// Trim (round 18): chat commands that data tables and tips still name but nobody registers any more (left behind by
// removed features): "/word" in the examples, tips, flows, tours, recipes and the app map.
//   node dev/smoke.js --script dev/checks/trim-refs.js
await Lazy.loadAll();
const known = new Set();
for (const d of Commands.list()) { known.add(d.name); for (const a of d.aliases || []) known.add(String(a).toLowerCase()); }
const FILES = ['cmdbar-data.js', 'cmdpage-data.js', 'flows-data.js', 'discover-data.js', 'studio-data.js', 'board-data.js', 'capture-data.js', 'chat-slash.js', 'speed-core.js', 'speed-rank.js', 'keys-ui.js', 'chat-cmds.js', 'tools/three-cmds.js', 'tour.js', 'discover.js', 'makes-core.js', 'mcp/hearth-map.js', 'mcp/three-guide.js', 'declutter.js', 'polish8.js', 'simplify.js'];
const out = {};
for (const f of FILES) {
  let src = '';
  try { src = await (await fetch(f)).text(); } catch { continue; }
  // a command as people type it: "/name" at a word start inside a string (not a path: no letter or '/' before it, no '/' or '.' after)
  const miss = new Set();
  for (const m of src.matchAll(/(?<![\w/.:~\\-])\/([a-z][a-z0-9-]{1,30})(?![\w/.-])/g)) {
    const n = m[1];
    if (known.has(n)) continue;
    if (/^(g|i|gi|gm|m|s|u|y|n|ms|px|s\d)$/.test(n)) continue; // regex flags, units
    miss.add(n);
  }
  if (miss.size) out[f] = [...miss].sort();
}
// tables keyed by command name: the "/" help info (cmdbar-data.js → Commands.addInfo), the Commands page's
// descriptions, questions and scenes (cmdpage-data.js)
const stale = (keys) => keys.filter((k) => !known.has(String(k).toLowerCase()));
let infoKeys = [];
try { const src = await (await fetch('cmdbar-data.js')).text(); infoKeys = [...src.matchAll(/^ {4}'?([\w-]+)'?: \{/gm)].map((m) => m[1]); } catch { /* */ }
out.staleInfo = stale(infoKeys);
if (typeof CmdPageData !== 'undefined') for (const k of ['DESC', 'ABOUT', 'Q', 'SCENES']) if (CmdPageData[k] && typeof CmdPageData[k] === 'object' && !Array.isArray(CmdPageData[k])) out[`staleCmdPage${k}`] = stale(Object.keys(CmdPageData[k]));
if (typeof CmdClips !== 'undefined') out.staleClips = stale(Object.keys(CmdClips));
return JSON.stringify(out, null, 1);
