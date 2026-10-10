// Shared bits of the fake engines (dev/fake-claude.js, dev/fake-codex.js): read the prompt from stdin, pick a
// scripted reply from keywords in it, and stream it out at a readable pace. Development only; never used by the app.
//
// Keywords in your message (combine them freely):
//   think     streams a thinking block first          tool     calls a (fake) tool before answering
//   tools3    three tool calls in a row                code     a reply with a JS / three.js code block
//   table     a Markdown table + task list + callout   long     a very long reply (folds in the chat)
//   remember  ends with <remember>…</remember>          suggest  ends with three <suggest> chips, one is a /command
//   slow      streams slowly (~6 s, to test Stop)       error    the engine fails (is_error / turn.failed)
//   login     fails with "not logged in"                crash    exits with code 3 and a stderr line
//   big       reports a huge input usage (auto-compact) echo     replies with the exact prompt it got
//   progress  hidden <progress pct="35|75" note="…"/> tags inside the reply (round 11)
//   mcp       really calls the hub MCP servers it was given (--mcp-config / -c mcp_servers.*): the tools in a line
//             `mcp: [["three_console", {}], ["three_do", {"cmd": "layers"}]]` (default: tools/list + three_console)
//   direct    a director turn with the owner's habits (round 6): "direct: add a tunnel" builds a NEW layer through
//             three_nodes (a timeline preset; falls back to three_add_layer with code when the node tool is off),
//             animates it with keyframes and looks with a small screenshot; "make it react" runs /make-it-react;
//             a "[Task state…" handover is acknowledged ("Picking up: <goal>").
// Jam turns (jam.js) are recognized by their first line ("Jam · round 2/4 · you build" / "you direct" / "Jam · final
// pick"): a build sets a real sketch through the Lab's MCP tools, a direction is two short lines, a pick names a round.
// In the jam's idea: jam-break makes builds fail (until a "fix the errors first" turn), jam-break-hard always,
// jam-astra-down fails Codex.
// Comp turns (comp-dispatch.js, round 10): a part's brief ("Comp part 2/3 · for …") builds that part's scene through
// the real MCP tools in two steps a few seconds apart (a dim draft, then the final: a full-frame color per part with a
// white bar moving on the scene's clock, so pixels tell the parts apart and show the live update); "Comp feedback ·"
// rebuilds it brighter; in a main chat, "comp: dispatch a | astra: b" calls three_do comp dispatch (then reads the
// parts), "comp: {json}" any three_do comp op; "make: plan <words>" plans a make (three_do make, round 11). In a brief: comp-slow (a longer pause), comp-hang (never ends: stuck).
// Video project turns (intro.js) are recognized by their first line too: "Intro · plan" (Astra decides: template /
// hook / end / titles / cuts lines), "Intro · words" (one "n | words" line per beat), "Intro · director" (the director
// pass: real MCP calls to video_edit_read, video_edit op project / transition and capture_list). The review uses the
// assist reply ("m:ss | note" lines).
// Env: FAKE_DELAY (ms between pieces, default 15), FAKE_STATE (folder for per-session turn counts).
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const STATE_DIR = process.env.FAKE_STATE || path.join(os.tmpdir(), 'hearth-fake-engines');
fs.mkdirSync(STATE_DIR, { recursive: true });

function readStdin() {
  return new Promise((resolve) => {
    let text = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (c) => { text += c; });
    process.stdin.on('end', () => resolve(text));
    if (process.stdin.isTTY) resolve('');
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const out = (obj) => process.stdout.write(`${JSON.stringify(obj)}\n`);
const uuid = () => crypto.randomUUID();

// Per-session state (turns so far, running token totals) so resumed chats grow like real ones.
function loadState(id) {
  try { return JSON.parse(fs.readFileSync(path.join(STATE_DIR, `${id}.json`), 'utf8')); } catch { return { turns: 0, input: 0, output: 0, chars: 0 }; }
}
function saveState(id, s) { try { fs.writeFileSync(path.join(STATE_DIR, `${id}.json`), JSON.stringify(s)); } catch { /* best effort */ } }

// The user's own words: what follows any context the hub wrapped around it.
function userPart(prompt) {
  const cut = prompt.split(/<\/(?:earlier_conversation|summary|since_then|recent_messages)>/).pop();
  return cut.replace(/<file name="[^"]*">[\s\S]*?<\/file>/g, '').trim();
}

// A small but real music sketch for jam builds (color / shape from the seed), or a broken one.
const JAM_COLORS = ['#ff3cac', '#2bd2ff', '#ffd75e', '#7cff6b', '#b388ff', '#ff7a3c'];
const JAM_SHAPES = ['TorusKnotGeometry(1, 0.3, 128, 16)', 'IcosahedronGeometry(1.3, 1)', 'TorusGeometry(1.2, 0.35, 32, 96)', 'OctahedronGeometry(1.4, 0)'];
function jamSketch(seed, broken) {
  const color = JAM_COLORS[seed % JAM_COLORS.length];
  const shape = JAM_SHAPES[seed % JAM_SHAPES.length];
  return `import * as THREE from 'three';
const P = tweak({ punch: { value: ${(1 + (seed % 3) * 0.4).toFixed(1)}, min: 0, max: 3, label: 'Bass punch', group: 'Music' }, glow: { value: '${color}', label: 'Glow color', group: 'Colors' }, spin: [${(0.2 + (seed % 4) * 0.2).toFixed(1)}, -2, 2] });
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
document.body.append(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color('#05030a');
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 100);
camera.position.z = 4.5;
const mesh = new THREE.Mesh(new THREE.${shape}, new THREE.MeshBasicMaterial({ color: P.glow, wireframe: ${seed % 2 ? 'true' : 'false'} }));
scene.add(mesh);
${broken ? 'const oops = ;\n' : ''}renderer.setAnimationLoop((now) => {
  mesh.rotation.y = now / 1000 * P.spin;
  mesh.rotation.x = now / 2600;
  mesh.scale.setScalar(1 + audio.bass * P.punch);
  mesh.material.color.set(P.glow);
  renderer.render(scene, camera);
});`;
}
function jamPlan(msg, engine) {
  const head = msg.split('\n')[0];
  if (!/^Jam · /.test(head)) return null;
  const round = Number((head.match(/round (\d+)\/(\d+)/) || [])[1]) || 1;
  if (engine === 'codex' && /jam-astra-down/.test(msg)) return { error: true };
  if (/you build/.test(head)) {
    const fixing = /left errors/i.test(msg);
    const broken = /jam-break-hard/.test(msg) || (/jam-break/.test(msg) && !fixing);
    const seed = round + msg.length;
    const idea = /No idea given/.test(msg) ? 'Idea: neon pulse knot — ' : '';
    return {
      mcpCalls: [['three_set_code', { code: jamSketch(seed, broken), wait: 1 }]],
      text: `${idea}${fixing ? 'Fixed the error, then ' : ''}${round === 1 ? 'built' : 'changed'} a ${JAM_COLORS[seed % JAM_COLORS.length]} ${JAM_SHAPES[seed % JAM_SHAPES.length].split('Geometry')[0].toLowerCase()} that punches on the bass.`,
    };
  }
  if (/you direct/.test(head)) {
    const push = ['Push the bass punch harder: let the kick throw it at the camera.', 'Push contrast: one hot color on near-black, nothing in between.', 'Push the motion: snap rotation on every downbeat instead of drifting.'][round % 3];
    const cut = ['Cut the wireframe noise; keep one clean silhouette.', 'Cut the slow spin: it fights the beat.', 'Cut the background clutter.'][round % 3];
    return { text: `${push}\n${cut}` };
  }
  if (/final pick/.test(head)) {
    const n = Number((msg.match(/numbered 1–(\d+)/) || [])[1]) || 1;
    const pick = engine === 'codex' ? Math.max(1, n - 1) : n;
    return { text: `${pick}: strongest beat sync and cleanest silhouette` };
  }
  return null;
}

// Video projects (intro.js): Astra decides the plan, rewrites the words, a director polishes the edit with real tools.
function introPlan(msg) {
  const head = msg.split('\n')[0];
  if (!/^Intro · /.test(head)) return null;
  if (/^Intro · plan/.test(head)) return { text: 'template: launch\nhook: Two AIs. One window.\nend: out now\ntitles: forge\ncuts: bold' };
  if (/^Intro · words/.test(head)) {
    const n = Number((msg.match(/numbered 1–(\d+)/) || [])[1]) || 3;
    const words = ['One window.', 'Two minds.', 'Shape it live.', 'Cut every frame.', 'Your references, a vibe.', 'Made in Hearth.', 'Out now.', 'Try it tonight.'];
    return { text: Array.from({ length: n }, (_, i) => `${i + 1} | ${words[i % words.length]}`).join('\n') };
  }
  if (/^Intro · director/.test(head)) {
    return {
      mcpCalls: [['video_edit_read', { what: 'clips' }], ['video_edit', { op: 'project', action: 'status' }], ['video_edit', { op: 'transition', all: true, type: 'dissolve', dur: 0.3 }], ['video_edit', { op: 'project', action: 'note', text: 'Dissolves on every cut' }], ['capture_list', {}]],
      text: 'Polished it: dissolves on every cut, checked the project status and the captures.',
    };
  }
  return null;
}

// A part's scene: the whole frame in the part's color (draft: dim), a white bar sweeping across on the scene's own
// clock (its x = the scene time: frame-exact pictures), a label in the console
const COMP_COLORS = ['#ff3030', '#2f6bff', '#30d060', '#ffcc22', '#c040ff', '#00d0d0'];
const shade = (hex, k) => `#${[1, 3, 5].map((i) => Math.round(parseInt(hex.slice(i, i + 2), 16) * k).toString(16).padStart(2, '0')).join('')}`;
function compCode(n, stage) {
  const base = COMP_COLORS[(n - 1) % COMP_COLORS.length];
  const color = stage === 'draft' ? shade(base, 0.35) : stage === 'fixed' ? shade(base, 1) : base;
  return `import * as THREE from 'three';
const P = tweak({ color: { value: '${color}', label: 'Color', group: 'Part' }, bar: { value: 0.18, min: 0.02, max: 0.6, label: 'Bar width', group: 'Part' } });
const renderer = new THREE.WebGLRenderer({ antialias: false });
renderer.setSize(innerWidth, innerHeight);
document.body.append(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(P.color);
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
camera.position.z = 2;
const bar = new THREE.Mesh(new THREE.PlaneGeometry(1, 2.4), new THREE.MeshBasicMaterial({ color: '#ffffff' }));
scene.add(bar);
console.log('comp part ${n} ${stage}');
renderer.setAnimationLoop((now) => {
  const t = (now / 1000) % 4;
  bar.scale.x = P.bar;
  bar.position.x = -1 + t / 2;
  scene.background.set(P.color);
  renderer.render(scene, camera);
});`;
}
function compPlan(msg) {
  const head = msg.split('\n')[0];
  if (/^Comp /.test(head) && /comp-hang/.test(msg)) return { mcpCalls: [['three_console', {}], ['sleep', 3600000]], text: '' };
  const part = /^Comp part (\d+)\/(\d+)/.exec(head);
  if (part) {
    const n = Number(part[1]);
    const pause = /comp-slow/.test(msg) ? 30000 : 2500; // comp-slow: a draft that stays (the dispatch check looks at it)
    return { mcpCalls: [['three_set_code', { code: compCode(n, 'draft'), wait: 0.6 }], ['sleep', pause], ['three_set_code', { code: compCode(n, 'final'), wait: 0.6 }]],
      text: `Built part ${n}: a ${COMP_COLORS[(n - 1) % COMP_COLORS.length]} field with a white bar sweeping across on the scene's timeline.` };
  }
  if (/^Comp feedback ·/.test(head)) {
    const n = Number((msg.match(/part (\d+)/) || [])[1]) || 1;
    return { mcpCalls: [['three_edit_code', { edits: [{ find: 'value: 0.18', replace: 'value: 0.4' }] }]], text: `Applied the feedback${n ? '' : ''}: a wider bar.` };
  }
  if (/^Comp · continue/.test(head)) return { mcpCalls: [['three_do', { cmd: 'task' }], ['three_console', {}]], text: 'Picked the part up and checked it: nothing missing.' };
  const d = /^comp:\s*dispatch\s+(.+)$/im.exec(msg);
  if (d) {
    const layout = /--split\b/.test(d[1]) ? 'split' : /--stack\b/.test(d[1]) ? 'stack' : 'time';
    const parts = d[1].replace(/--\w+/g, '').split('|').map((x) => x.trim()).filter(Boolean).map((x) => { const m = /^(astra|claude):\s*/i.exec(x); return { brief: m ? x.slice(m[0].length) : x, engine: m ? m[1].toLowerCase() : 'claude' }; });
    return { mcpCalls: [['three_do', { cmd: 'comp', op: 'dispatch', parts, layout }], ['three_do', { cmd: 'comp', op: 'parts' }]], text: `Dispatched ${parts.length} parts; each builds its scene in its own chat and shows here as a layer.` };
  }
  // (round 11, makes) "make: plan <words>" plans a make through three_do make (its rooms are made at once)
  const mk = /^make:\s*plan\s+(.+)$/im.exec(msg);
  if (mk) return { mcpCalls: [['three_do', { cmd: 'make', op: 'plan', text: mk[1].trim() }], ['three_do', { cmd: 'make', op: 'list' }]], text: 'Planned it: its rooms are in your chats list.' };
  const j = /^comp:\s*(\{[\s\S]*\})\s*$/im.exec(msg);
  if (j) { try { return { mcpCalls: [['three_do', { cmd: 'comp', ...JSON.parse(j[1]) }]], text: 'Done.' }; } catch { /* not JSON */ } }
  return null;
}
// A transparent layer (for directors without the node tool): one shape, sliders, motion on time only.
function layerCode(name, seed, vibeColor) {
  const color = vibeColor || JAM_COLORS[seed % JAM_COLORS.length];
  return `import * as THREE from 'three';
const P = tweak({ size: { value: 1, min: 0.2, max: 3, label: 'Size', group: 'Shape' }, color: { value: '${color}', label: 'Color', group: 'Color' }, spin: [0.4, -2, 2] });
const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
renderer.setSize(innerWidth, innerHeight);
document.body.append(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 100);
camera.position.z = 5;
const mesh = new THREE.Mesh(new THREE.TorusGeometry(1, 0.08, 16, 96), new THREE.MeshBasicMaterial({ color: P.color }));
mesh.name = ${JSON.stringify(name)};
scene.add(mesh);
renderer.setAnimationLoop((now) => {
  mesh.rotation.z = now / 1000 * P.spin;
  mesh.scale.setScalar(P.size * (1 + 0.1 * Math.sin(now / 900)));
  mesh.material.color.set(P.color);
  renderer.render(scene, camera);
});`;
}
// The owner's director habits as a fake director follows them: each ask = a new layer (nodes first), time-driven
// motion, a look; reactivity only when asked; a handover is picked up from the task state.
function directorPlan(prompt, msg, engine) {
  const ask = (msg.match(/^direct:\s*(.+)$/im) || [])[1];
  if (!ask) return null;
  const calls = [];
  const lines = [];
  const handed = (prompt.match(/\[Task state[^\n]*\n(?:Goal: (.+))?/) || []);
  if (/\[Task state/.test(prompt)) {
    const done = (prompt.match(/^Done so far: (.+)$/m) || [])[1];
    lines.push(`Picking up: ${handed[1] || 'the task'}${done ? ` (${done.split('; ').length} things done)` : ''} on ${engine === 'codex' ? 'Astra' : 'Claude'}.`);
    calls.push(['three_do', { cmd: 'task' }]);
  }
  if (/make it react|react to the music/i.test(ask)) {
    calls.push(['three_do', { cmd: 'run', command: '/make-it-react' }]);
    lines.push('Linked the sliders to the music.');
  } else {
    const preset = /tunnel/i.test(ask) ? 'keyed-tunnel' : /galaxy|stars/i.test(ask) ? 'section-galaxy' : /cube/i.test(ask) ? 'drift-cubes' : /ring|trail/i.test(ask) ? 'orbit-trails' : 'timed-shape';
    const name = ask.replace(/^(add|make|build|put)\s+(a|an|some|the)?\s*/i, '').slice(0, 24) || 'Layer';
    // a board vibe attached (board.js: "vibe · <name>.txt", or /board-use text): its palette colors the new layer,
    // the reference media itself is never used (round 7: references give a vibe, not footage)
    const vibe = (prompt.match(/<file name="vibe[^"]*">([\s\S]*?)<\/file>/i) || [])[1] || (/references give a vibe/i.test(prompt) ? prompt : '');
    const palette = [...new Set((vibe.match(/#[0-9a-f]{6}\b/gi) || []).map((h) => h.toLowerCase()))];
    if (palette.length) {
      calls.push(['three_add_layer', { name, code: layerCode(name, ask.length, palette[0]) }]);
      lines.push(`Took the references' vibe (palette ${palette.slice(0, 3).join(' ')}), not their footage.`);
    } else calls.push(['three_nodes', { command: `layer ${preset}` }, ['three_add_layer', { name, code: layerCode(name, ask.length) }]]);
    calls.push(['three_do', { cmd: 'keyframes', layer: 'top', property: 'opacity', keys: [{ time: 0, value: 0 }, { time: 2, value: 1, ease: 'ease' }] }]);
    calls.push(['three_screenshot', { size: 'small' }]);
    lines.push(`Added "${name}" as its own layer, fading in over 2 s on the timeline.`);
  }
  return { mcpCalls: calls, text: lines.join(' ') };
}

// Flows (flows-ui.js): "make a flow for X" gets a small flow made of the first commands the prompt offers.
function flowPlan(msg) {
  if (!/^Flow · make/.test(msg.split('\n')[0])) return null;
  const cmds = [...msg.matchAll(/^\/([\w-]+)/gm)].map((m) => m[1]);
  const [a = 'help', b = 'freeze'] = cmds;
  const flow = { id: 'fake-flow', name: `Fake flow: ${(msg.match(/flow for: (.+)/) || [])[1] || 'x'}`.slice(0, 60), desc: 'Made by the fake engine', nodes: [
    { id: 'one', kind: 'action', title: `Run /${a}`, cmd: `/${a}`, next: 'ask' },
    { id: 'ask', kind: 'choice', title: `Also /${b}?`, var: 'more', options: [{ label: 'Yes', value: 'yes', next: 'two' }, { label: 'No', value: 'no', next: 'end' }] },
    { id: 'two', kind: 'action', title: `Run /${b}`, cmd: `/${b}`, next: 'end' },
    { id: 'end', kind: 'result', title: 'Done', text: '{last}' }] };
  return { text: `Here is the flow:\n\n\`\`\`json\n${JSON.stringify(flow, null, 1)}\n\`\`\`` };
}

function plan(prompt, engine = 'claude') {
  const msg = userPart(prompt);
  const fl = flowPlan(msg);
  if (fl) return { p: {}, text: fl.text, thinking: '' };
  const intro = introPlan(msg);
  if (intro) {
    const p = { mcp: Boolean(intro.mcpCalls), mcpCalls: intro.mcpCalls || null };
    return { p, text: intro.text, thinking: '' };
  }
  const comp = compPlan(msg);
  if (comp) return { p: { mcp: true, mcpCalls: comp.mcpCalls }, text: comp.text, thinking: '' };
  const jam = jamPlan(msg, engine);
  const dir = jam ? null : directorPlan(prompt, msg, engine);
  if (dir) {
    const p = { mcp: true, mcpCalls: dir.mcpCalls };
    return { p, text: dir.text, thinking: '' };
  }
  const has = (w) => new RegExp(`\\b${w}\\b`, 'i').test(msg);
  const p = {
    think: has('think'), tool: has('tool'), tools3: has('tools3'), code: has('code'), table: has('table'), long: has('long'),
    remember: has('remember'), suggest: has('suggest'), slow: has('slow'), error: has('error'), login: has('login'),
    crash: has('crash'), big: has('big'), echo: has('echo'), mcp: has('mcp'), progress: has('progress'),
    mcpCalls: (() => { const m = msg.match(/^mcp:\s*(\[[\s\S]*\])\s*$/m); try { return m ? JSON.parse(m[1]) : null; } catch { return null; } })(),
    compact: /Compact our context|moving to a fresh chat/i.test(msg),
    summarize: /^Summari[sz]e\b/i.test(msg),
    title: /short title for this chat/i.test(msg),
    // "Let Astra decide" (decide.js): answers with the second option, like a real pick
    decide: /^Options: (.+)$/m.test(msg) && /Reply with one option name only/.test(msg) ? msg.match(/^Options: (.+)$/m)[1].split(' | ') : null,
    // assist.js: pick a numbered variation, a name, review notes, one next step
    assist: /Reply with the number, a dash/.test(msg) ? `${Math.min(2, Number((msg.match(/numbered 1–(\d)/) || [])[1]) || 1)} — strongest contrast and the cleanest beat hits`
      : /Reply with the name only/.test(msg) ? 'Ember Tide'
        : /Reply one per line as "m:ss \| note"/.test(msg) ? '0:01 | Push the contrast in the center ring.\n0:02 | Cut the busy background grain.'
          : /Reply with one next step/.test(msg) ? 'Make the rings pulse on every kick and cut the slow spin.' : null,
  };
  if (jam) {
    Object.assign(p, { think: false, mcp: Boolean(jam.mcpCalls), mcpCalls: jam.mcpCalls || null, error: Boolean(jam.error), code: false, table: false, long: false, remember: false, suggest: false, slow: false, tool: false, tools3: false });
    return { p, text: jam.text || '', thinking: '' };
  }
  const parts = [];
  const short = msg.replace(/\s+/g, ' ').slice(0, 80);
  if (p.decide) return { p, text: p.decide[1] || p.decide[0], thinking: '' };
  if (p.assist) return { p, text: p.assist, thinking: '' };
  if (p.title) parts.push('Fake chat about testing');
  else if (p.compact) parts.push('**Summary.** The user is testing Hearth with a fake engine. Decisions: keep it compact. Exists: one test chat. Left to do: nothing.');
  else if (p.echo) parts.push(prompt);
  else if (p.summarize) parts.push('- Point one of the summary\n- Point two\n- Point three');
  else parts.push(`Fake reply to: “${short}”.`);
  if (p.code) parts.push('Here is a sketch:\n\n```js\nimport * as THREE from \'three\';\nconst scene = new THREE.Scene();\nconst cube = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshNormalMaterial());\nscene.add(cube);\n```\n\nAnd a shell line:\n\n```bash\necho hello\n```');
  if (p.table) parts.push('| Name | Value |\n| --- | ---: |\n| alpha | 1 |\n| beta | 22 |\n\n- [x] done task\n- [ ] open task\n\n> [!NOTE]\n> A callout note.\n\nInline math: $E = mc^2$.');
  if (p.long) for (let i = 1; i <= 60; i++) parts.push(`Paragraph ${i}: ${'lorem ipsum dolor sit amet '.repeat(6).trim()}.`);
  if (p.remember) parts.push('<remember>The user tests Hearth with fake engines</remember>');
  if (p.suggest) parts.push('<suggest>Make it bigger</suggest><suggest>/stats</suggest><suggest>Try another color</suggest>');
  // progress: the reply says how far it is with hidden <progress> tags (round 11, progress-hooks.js)
  if (p.progress) { const a = Math.max(1, Math.floor(parts.length / 3)); parts.splice(a, 0, '<progress pct="35" note="drafting"/>'); parts.splice(Math.max(a + 1, Math.floor((parts.length * 2) / 3)), 0, '<progress pct="75" note="polishing the end"/>'); }
  return { p, text: parts.join('\n\n'), thinking: p.think ? 'Let me think about this.\n\nFirst, consider the request. Then decide on a compact answer.' : '' };
}

// Splits text into small pieces like a model streams tokens.
function pieces(text) { return text.match(/[\s\S]{1,12}/g) || []; }
const delayMs = (p) => (p.slow ? 120 : Number(process.env.FAKE_DELAY || 15));

// A real MCP client for the `mcp` keyword: starts a server the way the CLI would ({ command, args, env }), speaks
// JSON-RPC over stdio, and returns { tools, call(name, args), close() }.
function mcpClient({ command, args = [], env = {} }) {
  const { spawn } = require('child_process');
  const child = spawn(command, args, { env: { ...process.env, ...env }, stdio: ['pipe', 'pipe', 'ignore'] });
  let buf = ''; let next = 1; const waiting = new Map();
  child.stdout.on('data', (d) => {
    buf += d;
    let nl;
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl); buf = buf.slice(nl + 1);
      try { const msg = JSON.parse(line); waiting.get(msg.id)?.(msg); waiting.delete(msg.id); } catch { /* not JSON */ }
    }
  });
  const rpc = (method, params) => new Promise((resolve) => { const id = next++; waiting.set(id, resolve); child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`); setTimeout(() => { if (waiting.delete(id)) resolve({ error: { message: 'timeout' } }); }, 120000); });
  return (async () => {
    const init = await rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'fake', version: '0' } });
    const list = await rpc('tools/list', {});
    return {
      instructions: init.result?.instructions || '', tools: list.result?.tools || [],
      call: async (name, a) => (await rpc('tools/call', { name, arguments: a || {} })).result || { isError: true, content: [{ type: 'text', text: 'no result' }] },
      close: () => { try { child.stdin.end(); child.kill(); } catch { /* gone */ } },
    };
  })();
}
// Which server a tool belongs to (by prefix), from the servers the CLI was given.
const serverFor = (servers, tool) => servers[{ three: 'three', video: 'video', ae: 'video', forge: 'forgeheart', chat: 'chat', capture: 'capture', board: 'board', hearth: 'video' }[tool.split('_')[0]]] || null;

// ---------- failure switches (round 9 "robust": behave like the owner's real installs) ----------
// Each one from the env (FAKE_CLAUDE_VERSION=2.1.1 …) or from data/kv/fake-switches.json of the Hearth copy running the
// fake (its runs and its --version / status probes start in <data>/workspace), so a check flips them with
// hub.kvSet('fake-switches', { … }) and `claude update` / `auth login` change them like the real thing would.
//   claudeVersion / codexVersion   what --version prints (default 2.1.300 / 0.50.0)
//   claudeNeeds / codexNeeds       the model refuses a copy older than this ("version X or newer is required")
//   claudeLoggedOut / codexLoggedOut   status says not signed in, every run fails with "please run /login"
//   claudeNetwork / codexNetwork   'once' | 'always': the run fails with a dropped connection
//   claudeMcpMissing               'once' | 'always': the --mcp-config file disappears before the run reads it
//   codexMcpCancel                 'new' (cancels Hearth's tool calls unless pre-approved with default_tools_approval_mode,
//                                  like current Codex) | 'old' (ignores that key, cancels unless approval_policy="never")
//                                  | 'always'
//   updateTo                       the version `claude update` installs (default 2.1.400)
//   claudeNoAuth                   an older Claude Code without the `auth` command (its --help doesn't list it)
const SWITCHES = ['claudeNoAuth', 'claudeVersion', 'codexVersion', 'claudeNeeds', 'codexNeeds', 'claudeLoggedOut', 'codexLoggedOut', 'claudeNetwork', 'codexNetwork', 'claudeMcpMissing', 'codexMcpCancel', 'updateTo'];
const kvFile = () => path.join(process.cwd(), '..', 'kv', 'fake-switches.json');
function switches() {
  const env = {};
  for (const k of SWITCHES) { const v = process.env[`FAKE_${k.replace(/[A-Z]/g, (c) => `_${c}`).toUpperCase()}`]; if (v) env[k] = v; }
  let kv = {};
  try { kv = JSON.parse(fs.readFileSync(kvFile(), 'utf8')) || {}; } catch { /* none */ }
  return { ...env, ...kv };
}
function setSwitch(patch) {
  let kv = {};
  try { kv = JSON.parse(fs.readFileSync(kvFile(), 'utf8')) || {}; } catch { /* none */ }
  for (const [k, v] of Object.entries(patch)) { if (v == null) delete kv[k]; else kv[k] = v; }
  try { fs.writeFileSync(kvFile(), JSON.stringify(kv)); } catch { /* no data folder: env only */ }
}
// 'once': true the first time per Hearth copy (a marker next to the switches), 'always': always
function trip(name, mode) {
  if (mode === 'always') return true;
  if (mode !== 'once') return false;
  const marker = fs.existsSync(path.dirname(kvFile())) ? path.join(path.dirname(kvFile()), `fake-once-${name}.json`) : path.join(STATE_DIR, `once-${name}-${process.env.FAKE_ONCE_TAG || ''}`);
  if (fs.existsSync(marker)) return false;
  try { fs.writeFileSync(marker, '1'); } catch { /* best effort */ }
  return true;
}
const older = (a, b) => { const pa = String(a).match(/\d+/g) || []; const pb = String(b).match(/\d+/g) || []; for (let i = 0; i < 3; i++) { const d = (+pa[i] || 0) - (+pb[i] || 0); if (d) return d < 0; } return false; };

module.exports = { readStdin, sleep, out, uuid, loadState, saveState, plan, pieces, delayMs, mcpClient, serverFor, switches, setSwitch, trip, older };
