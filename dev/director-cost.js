#!/usr/bin/env node
// Fixed per-message cost of each director's tools (development helper; the app shows the same with /director-cost).
// Every message a director sends carries its MCP servers' instructions + tool list, plus its part of the system
// prompt. Tokens are estimated as characters / 4 (close to Claude's tokenizer for English + JSON).
//   node dev/director-cost.js            # table per toolset and per director
//   node dev/director-cost.js --tools    # also each tool's own size, biggest first
//   node dev/director-cost.js --json
const path = require('path');
const cost = require(path.join(__dirname, '..', 'mcp', 'cost.js'));

const args = process.argv.slice(2);
const r = cost.report();
if (args.includes('--json')) { console.log(JSON.stringify(r, null, 2)); process.exit(0); }
const pad = (s, n) => String(s).padEnd(n);
const num = (n) => String(n).padStart(6);
console.log(`${pad('toolset', 14)}${pad('server', 18)}${num('tools')}${num('guide')}${num('list')}${num('total')}`);
for (const s of r.sets) console.log(`${pad(s.key, 14)}${pad(s.server, 18)}${num(s.tools)}${num(s.guide)}${num(s.list)}${num(s.total)}`);
console.log('\nDirectors (tool sets + their system-prompt part):');
for (const d of r.directors) console.log(`  ${pad(d.name, 18)} ${num(d.total)} tokens  (${d.parts.map((p) => `${p.what} ${p.tokens}`).join(', ')})`);
// the opt-in modes, for comparison
const extra = cost.report([{ ...cost.DIRECTORS[0], name: 'Three (full)', toolMode: 'full' }, { ...cost.DIRECTORS[0], name: 'Three (+nodes)', nodesTool: true }]);
for (const d of extra.directors) console.log(`  ${pad(d.name, 18)} ${num(d.total)} tokens  (opt-in)`);
if (args.includes('--tools')) {
  for (const s of r.sets) {
    console.log(`\n${s.server}:`);
    for (const t of [...s.each].sort((a, b) => b.tokens - a.tokens)) console.log(`  ${num(t.tokens)}  ${t.name}`);
  }
}
