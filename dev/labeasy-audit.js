// The Lab-without-commands audit (round 26, labeasy): every Lab command in the running app (Commands.list(), areas
// "Three.js Lab", "Lab", "Director") and where its feature lives on screen: a new home from tools/three-easy.js (the
// menus are walked, so this stays true), a home it already had (tools/three-easy-data.js, checked by hand), "just ask
// the director", or kept as a command (power / diagnostic). "unsorted" = a Lab command nobody placed yet.
//   node dev/smoke.js --script dev/labeasy-audit.js        (prints JSON: counts + a Markdown table)
await SQL.lab();
await SQL.until(() => typeof LabEasy !== 'undefined', 15000);
const placed = LabEasy.placed();
const D = LabEasyData;
const rows = Commands.list().filter((d) => D.AREAS.includes(d.area)).map((d) => {
  const had = D.homes.get(d.name);
  const now = placed.get(d.name);
  const kind = now ? (had?.kind === 'had' ? 'had+new' : 'new') : had?.kind || 'unsorted';
  return { name: d.name, area: d.area, kind, where: now || had?.where || '', also: now && had?.kind === 'had' ? had.where : '', desc: d.desc };
});
const count = {};
for (const r of rows) count[r.kind] = (count[r.kind] || 0) + 1;
const md = (list) => list.map((r) => `| ${r.name} | ${r.where.replace(/\|/g, '/')} |`).join('\n');
const by = (k) => rows.filter((r) => r.kind === k);
const table = [
  `Lab commands: ${rows.length} · ${Object.entries(count).map(([k, n]) => `${k} ${n}`).join(' · ')}`,
  '', '### Had no button or menu entry → their new home', '| command | now in |', '|---|---|', md(by('new')),
  '', '### Had a home already, now also in a new menu', '| command | also in |', '|---|---|', md(by('had+new')),
  '', '### Already had a home (by place)', Object.entries(D.HAD).map(([w, n]) => `- ${w}: ${n.split(/\s+/).filter((x) => by('had').some((r) => r.name === x)).join(', ')}`).join('\n'),
  '', '### Just ask the director', by('ask').map((r) => r.name).join(', '),
  '', '### Kept as commands (power / diagnostic)', by('power').map((r) => r.name).join(', '),
  '', '### Unsorted (a Lab command nobody placed)', by('unsorted').map((r) => `${r.name} (${r.desc.slice(0, 60)})`).join('\n') || 'none',
].join('\n');
return JSON.stringify({ count, total: rows.length, unsorted: by('unsorted').map((r) => r.name), table });
