// QA: command name collisions (names / aliases registered twice, aliases shadowing names, shared names).
//   node dev/smoke.js --script dev/checks/qa-commands.js
// dups should be empty (Commands.register warns on each); `shared` lists names with context variants (`when`).
const out = { count: Commands.list().length, dups: Commands.duplicates().map((d) => `${d.name}: ${d.was} <- ${d.by} @ ${d.at}`) };
const names = new Set(Commands.list().map((d) => d.name));
out.aliasShadow = Commands.list().flatMap((d) => d.aliases.filter((a) => names.has(a.toLowerCase()) && a.toLowerCase() !== d.name).map((a) => `${d.name}~${a}`));
// Names a stream's file defines (`name: '…'` / reg('…')) that now resolve to another area's command, so that
// stream's version is only reachable under its fallback name (alt / alias / fx-…) or shared through `when`.
const files = { 'addons-cmds.js': ['Prompts', 'Notes', 'Memory', 'Kit', 'Agents', 'Forge', 'Data'], 'tools/three-fx-cmds.js': ['Three.js Lab'], 'tools/video-cmds.js': ['Video'], 'tools/three-cmds.js': ['Three.js Lab'], 'meter.js': ['Meter'], 'look.js': ['Look'] };
out.elsewhere = [];
for (const [f, areas] of Object.entries(files)) {
  let src = '';
  try { src = await (await fetch(f)).text(); } catch { continue; }
  const found = new Set([...src.matchAll(/\bname: '([\w-]+)'/g), ...src.matchAll(/\breg\('([\w-]+)'/g)].map((m) => m[1].toLowerCase()));
  for (const n of found) {
    const d = Commands.get(n);
    if (!d || areas.includes(d.area)) continue;
    out.elsewhere.push(`${f}: /${n} ${d.variants?.some((v) => areas.includes(v.area)) ? 'shared with' : 'is'} /${d.name} (${d.area})`);
  }
}
out.shared = Commands.list().filter((d) => d.variants).map((d) => `/${d.name}: ${d.variants.map((v) => `${v.area}${v.when ? '?' : ''}`).join(' | ')}`);
// round 8: the plain names round 7 added or shares, resolved where you can type them (chat, Lab, Video Review with the
// editor on and off, board); the doc's table comes from this
const PLACES = ['chat', 'three', 'ae', 'board'];
// (the place is really opened: some variants look at the tool on screen, not only ctx.place)
const resolve = (name, place, args = '') => {
  const d = Commands.get(name); if (!d) return '—';
  if (!d.variants) return d.area;
  const base = d.variants.find((v) => !v.when) || d.variants.find((v) => v.fallback) || d.variants[0]; // as commands.js combine()
  const ctx = { place, agentId: H.claudeAgent().id };
  try { return (d.variants.find((v) => v.when && v !== base && v.when(ctx, args)) || base).area; } catch (err) { return `error ${err.message}`; }
};
const edOn = typeof VideoCut !== 'undefined' && VideoCut.active;
const table = async (rows) => { const res = rows.map(() => []); for (const p of PLACES) { activate(p === 'chat' ? H.claudeAgent().id : `tool:${p}`); await new Promise((r) => setTimeout(r, 400)); rows.forEach(([n, a], i) => res[i].push(`${p} → ${resolve(n, p, a)}`)); } return rows.map(([n, a], i) => `/${n}${a ? ` ${a}` : ''}: ${res[i].join(' · ')}`); };
out.byPlace = await table(['scenes', 'contact', 'pacing', 'make', 'frames', 'record', 'rec', 'screenshot', 'shot', 'undo', 'redo', 'look', 'play', 'pause', 'split', 'snap', 'marker', 'fps', 'loop', 'speed', 'compare', 'export', 'transition', 'zoom', 'note'].map((n) => [n, '']));
out.byPlaceArgs = await table([['record', 'lab 9:16'], ['record', 'app 10s'], ['screenshot', 'lab'], ['screenshot', 'lab 9:16'], ['make', 'gif last'], ['make', 'it react']]);
out.editorOn = edOn;
return JSON.stringify(out, null, 1);
