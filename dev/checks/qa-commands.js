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
return JSON.stringify(out, null, 1);
