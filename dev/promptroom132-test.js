#!/usr/bin/env node
// (round 132, promptroom132) The Three Director's tool words are one line each; the details moved to help. This checks
// that nothing moved out of reach: every "help <topic>" named in a tool description, a three_do command's help line or
// the guide is a real topic (never the "Topics: …" fallback), every guide topic a full-mode description names in CAPS
// (LAYERS, KEYFRAMES…) is a heading of the guide full mode sends, and help <tool> still gives each tool's long words and
// every arg its schema leaves out. Plus the full list's size (lean and the totals: dev/promptdiet-test.js).
//   node dev/promptroom132-test.js
const path = require('path');

const ROOT = path.join(__dirname, '..');
const fails = [];
const check = (ok, what) => { console.log(`${ok ? '✓' : '✖'} ${what}`); if (!ok) fails.push(what); };
const tok = (s) => Math.round(String(s || '').length / 4);
const file = path.join(ROOT, 'mcp', 'three-mcp.js');

function load(mode) {
  process.env.HUB_NODES_TOOL = '1';
  if (mode) process.env.HUB_TOOL_MODE = mode; else delete process.env.HUB_TOOL_MODE;
  delete require.cache[require.resolve(file)];
  try { return require(file); } finally { delete process.env.HUB_TOOL_MODE; delete process.env.HUB_NODES_TOOL; }
}

(async () => {
  const full = load('full'); const lean = load(''); const crew = load('crew');
  const G = require(path.join(ROOT, 'mcp', 'three-guide.js'));
  const help = async (topic) => full.helpOnce({ topic, force: true }, async () => ({ ok: false }));
  const wire = (tools) => tok(JSON.stringify(tools.map((t) => ({ name: `mcp__three__${t.name}`, description: t.description, input_schema: t.inputSchema }))));

  // ---------- 1. every help topic named anywhere the director reads it exists ----------
  const texts = [...full.tools, ...lean.tools, ...crew.tools].map((t) => [t.name, t.description]);
  for (const c of full.doCommands) texts.push([`help ${c}`, (await help(c)).split('\n\n')[0]]); // the command's own help line
  texts.push(['guide', G.FULL], ['nodes line', G.NODES_LINE]);
  const named = new Map(); // topic → where
  for (const [where, s] of texts) for (const m of String(s).matchAll(/\bhelp ([a-z][a-z_]+)/g)) if (!named.has(m[1])) named.set(m[1], where);
  check(named.size >= 15, `${named.size} help topics named in tool words, command help and the guide (${[...named.keys()].join(', ')})`);
  for (const [topic, where] of named) {
    const r = await help(topic);
    check(!/^Topics:/.test(r) && r.length > 80, `help ${topic} (named in ${where}): a real answer (${r.length} chars)`);
  }

  // ---------- 2. full mode: one line per tool, the guide topics it names are in the guide it sends ----------
  for (const t of full.tools) {
    check(!/\n/.test(t.description) && t.description.length <= 210, `full ${t.name}: one line (${t.description.length} chars)`);
    for (const m of t.description.matchAll(/\b([A-Z]{4,})\b/g)) check(new RegExp(`(^|\\n)${m[1]}\\b`).test(G.FULL), `full ${t.name}: "${m[1]}" is a topic of the guide full mode sends`);
  }

  // ---------- 3. every moved detail is one help away: the long words and every arg ----------
  for (const t of full.all) {
    if (t.name === 'three_do') continue;
    const r = await help(t.name);
    const sent = [...full.tools, ...lean.tools].filter((x) => x.name === t.name);
    const args = Object.keys(t.inputSchema.properties);
    const k = t.name.slice(6);
    // a command with its own help line (undo, looks: three_do's words, longer than the tool's) answers with that line
    const whole = r.includes(t.description) || r.startsWith(`${k} {`);
    check(whole && args.every((a) => new RegExp(`\\b${a}\\b`).test(r)), `help ${k}: its whole description and every arg (${args.length}) — the lists send ${sent.map((x) => tok(x.description)).join(' / ') || '–'} tokens of it`);
  }

  // ---------- 4. the room is kept ----------
  const fullWire = wire(full.tools); const leanWire = wire(lean.tools);
  // (round 132) before: full 4,019, lean 1,100 (with three_nodes)
  check(fullWire <= 2900, `full-mode Lab tool list ≤ 2,900 tokens as the engines name them (${fullWire}; 4,019 before round 132)`);
  check(leanWire <= 1040, `lean Lab tool list ≤ 1,040 tokens with three_nodes (${leanWire}; 1,100 before round 132)`);
  const twice = load('full');
  check(JSON.stringify(twice.tools) === JSON.stringify(full.tools), 'the full list, byte for byte, loaded twice (the prompt cache holds)');

  console.log(fails.length ? `\n${fails.length} failed` : '\nall passed');
  process.exit(fails.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
