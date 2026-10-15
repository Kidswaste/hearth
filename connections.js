// Connections (round 26, connections stream): "give the AIs more access to stuff". In ⋯ AI setup → What it can use,
// under the AI's own tools: the owner's MCP servers, each one Off / Read only / Full (or Off / On) per AI.
//   ＋ Add a connection   ready-made free servers in one click (files in a folder, web pages, git, SQLite, a browser,
//                         memory, time, step-by-step thinking: they run with npx / uvx, no account, marked "needs
//                         Node / Python"), or your own: a command line, or the address of a remote (HTTP) MCP server,
//                         with optional settings (NAME=value, or Header: value for an address).
//   Test                  starts it, lists its tools (and which only look), estimates its token cost; says why when
//                         it doesn't start (connectionsmain.js).
// Saved in config.connections (the server) and agent.connections = { id: 'read' | 'full' } (who may use it). The values
// typed in settings stay in Hearth's config on this computer and go only to that server: never to the AI, never in a
// prompt (engines.js hands the server to Claude's --mcp-config file / Codex's -c overrides; nothing is added to the
// system prompt). Tool definitions do ride along with each message of an AI that has it on: the ≈ tokens note says how
// many. Lazy group 'connections' (loaded when AI setup shows it, or by /connections).
const Connections = (() => {
  // free servers that need no account or key ({folder} / {file}: picked when added)
  const CATALOG = [
    { key: 'files', icon: '📁', name: 'Files in a folder', what: 'Read and search the files in one folder you pick (Full: also edit them)', needs: 'node', command: 'npx', args: ['-y', '@modelcontextprotocol/server-filesystem', '{folder}'], tokens: 1500 },
    { key: 'fetch', icon: '🌐', name: 'Read web pages', what: 'Fetch any web page as text', needs: 'python', command: 'uvx', args: ['mcp-server-fetch'], tokens: 300 },
    { key: 'git', icon: '🌿', name: 'Git repository', what: 'History, diffs and status of a repository you pick (Full: also commit)', needs: 'python', command: 'uvx', args: ['mcp-server-git', '--repository', '{folder}'], tokens: 1600 },
    { key: 'sqlite', icon: '🗄', name: 'SQLite database', what: 'Query a database file you pick (Full: also change it)', needs: 'python', command: 'uvx', args: ['mcp-server-sqlite', '--db-path', '{file}'], tokens: 700 },
    { key: 'browser', icon: '🧭', name: 'Web browser', what: 'Open pages, click, type and take snapshots in a real browser (Playwright)', needs: 'node', command: 'npx', args: ['-y', '@playwright/mcp@latest'], tokens: 3500 },
    { key: 'memory', icon: '🧠', name: 'Knowledge graph memory', what: 'A notebook of people, things and how they relate, kept between chats', needs: 'node', command: 'npx', args: ['-y', '@modelcontextprotocol/server-memory'], tokens: 1200 },
    { key: 'time', icon: '🕒', name: 'Time and time zones', what: 'The current time anywhere, time zone conversions', needs: 'python', command: 'uvx', args: ['mcp-server-time'], tokens: 300 },
    { key: 'thinking', icon: '🪜', name: 'Step-by-step thinking', what: 'A scratchpad for working through hard problems in steps', needs: 'node', command: 'npx', args: ['-y', '@modelcontextprotocol/server-sequential-thinking'], tokens: 900 },
  ];
  const NEEDS = { node: { label: 'needs Node', prog: 'npx', how: 'Install Node.js from nodejs.org' }, python: { label: 'needs Python', prog: 'uvx', how: 'Install uv from docs.astral.sh/uv' } };
  const SECRET_NOTE = 'Values you type here (keys, tokens) stay in Hearth\'s settings on this computer and go only to that server: never to the AI, never in a prompt. Never type a password here.';
  const results = new Map(); // id → last Test result (this session)
  const testing = new Set();

  const all = () => (Array.isArray(H.config?.connections) ? H.config.connections : []);
  const byId = (id) => all().find((c) => c.id === id);
  const find = (q) => { const s = String(q || '').trim().toLowerCase(); return all().find((c) => c.id === s || c.name.toLowerCase() === s) || all().find((c) => c.name.toLowerCase().includes(s)); };
  // (capturefix2) the last one removed leaves an empty list: a config saved without the key got it back from disk (the
  // round-43 save guard keeps any top-level part a save leaves out), so Remove brought the connection back
  async function putList(next) { H.config.connections = next; await saveConfig(); }
  // the agent's own switches (the config watcher may hand back a fresh agent object: change both)
  async function setMode(agentId, id, mode) {
    const a = H.agent(agentId);
    if (!a) return;
    const m = { ...(a.connections || {}) };
    if (mode) m[id] = mode; else delete m[id];
    const v = Object.keys(m).length ? m : undefined;
    for (const t of new Set([a, H.config.agents.find((x) => x.id === agentId)].filter(Boolean))) { if (v) t.connections = v; else delete t.connections; }
    await saveConfig();
  }
  // tokens: a measured tool list (Test) wins over the catalog's guess
  const tokensOf = (c) => c.tokens || CATALOG.find((k) => k.key === c.catalog)?.tokens || 0;
  const fmtTok = (n) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : String(n));
  const tokNote = (c) => { const n = tokensOf(c); return n ? `≈ ${fmtTok(n)} tokens a message${c.tokens ? '' : ' (a guess: Test to measure)'}` : 'Test it to see its cost'; };
  // Read only is offered once a Test showed tools that only look AND tools that change things
  const splits = (c) => Array.isArray(c.tools) && c.tools.some((t) => t.ro) && c.tools.some((t) => !t.ro);

  // "npx -y pkg 'a folder'" → ['npx', '-y', 'pkg', 'a folder']
  function splitLine(line) {
    const out = []; let cur = ''; let q = null; let any = false;
    for (const ch of String(line || '').trim()) {
      if (q) { if (ch === q) q = null; else cur += ch; continue; }
      if (ch === '"' || ch === '\'') { q = ch; any = true; continue; }
      if (/\s/.test(ch)) { if (cur || any) out.push(cur); cur = ''; any = false; continue; }
      cur += ch;
    }
    if (cur || any) out.push(cur);
    return out;
  }
  const quote = (s) => (/[\s"']/.test(s) ? `"${s.replace(/"/g, '\\"')}"` : s);
  // NAME=value lines (a command) or Header: value lines (an address)
  function parseSettings(text, http) {
    const out = {};
    for (const line of String(text || '').split('\n')) {
      const m = http ? /^\s*([A-Za-z0-9-]+)\s*:\s*(.*?)\s*$/.exec(line) : /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
      if (m) out[m[1]] = m[2];
    }
    return out;
  }
  const settingsText = (c) => Object.entries((c.kind === 'http' ? c.headers : c.env) || {}).map(([k, v]) => (c.kind === 'http' ? `${k}: ${v}` : `${k}=${v}`)).join('\n');
  const newId = () => `cn-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

  // ---------- Test ----------
  async function test(id, { quiet = false } = {}) {
    const c = byId(id);
    if (!c || testing.has(id)) return results.get(id) || null;
    testing.add(id); repaint();
    let r;
    try { r = await window.hub.connections.test(c); } catch (err) { r = { ok: false, error: err.message }; }
    testing.delete(id);
    results.set(id, r);
    if (r?.ok && r.tools?.length) {
      const fresh = byId(id);
      if (fresh) { fresh.tools = r.tools.slice(0, 300).map((t) => ({ n: t.n, ro: Boolean(t.ro) })); fresh.tokens = r.tokens; fresh.testedAt = Date.now(); await saveConfig(); }
    }
    if (!quiet) toast(r?.ok ? `${c.name}: works, ${r.tools?.length || 0} tools` : `${c.name}: ${r?.error || 'didn\'t start'}`, { type: r?.ok ? 'info' : 'error', timeout: r?.ok ? 2500 : 6000 });
    repaint();
    return r;
  }
  const resultLine = (c) => {
    if (testing.has(c.id)) return el('p', { class: 'cn-result', text: 'Starting it…' });
    const r = results.get(c.id);
    if (!r) return null;
    if (!r.ok) return el('p', { class: 'cn-result bad', text: `✗ ${r.error}${r.hint ? ` ${r.hint}` : ''}` });
    const names = (r.tools || []).map((t) => t.n);
    return el('p', { class: 'cn-result good', text: `✓ ${r.server ? `${r.server}: ` : ''}${names.length} tools${names.length ? ` (${names.slice(0, 12).join(', ')}${names.length > 12 ? '…' : ''})` : ''}${r.note ? ` · ${r.note}` : ''}` });
  };

  // ---------- add / edit ----------
  async function addFromCatalog(key, agentId) {
    const k = CATALOG.find((x) => x.key === key);
    if (!k) return null;
    const args = [];
    for (const a of k.args) {
      if (a === '{folder}') { const f = await window.hub.pickFolder(null, `${k.name}: choose the folder`); if (!f) return null; args.push(f); }
      else if (a === '{file}') { const f = await Modal.prompt(`${k.name}: the database file`, { placeholder: '/path/to/data.db (a new name makes a new database)', label: 'Full path of the .db file' }); if (!f?.trim()) return null; args.push(f.trim()); }
      else args.push(a);
    }
    const where = args.find((a, i) => k.args[i] === '{folder}' || k.args[i] === '{file}');
    const name = where ? `${k.name.replace(/ in a folder| repository| database/, '')}: ${where.split(/[\\/]/).filter(Boolean).pop()}` : k.name;
    return add({ id: newId(), name, kind: 'stdio', command: k.command, args, catalog: k.key }, agentId);
  }
  // adds it, tests it, and switches it on for this AI (Read only when it can tell, so nothing changes by surprise)
  async function add(conn, agentId) {
    await putList([...all(), conn]);
    const r = await test(conn.id, { quiet: true });
    const c = byId(conn.id);
    if (agentId && r?.ok) await setMode(agentId, conn.id, c && splits(c) ? 'read' : 'full');
    toast(r?.ok ? `${conn.name} added${agentId ? ` and on for ${H.agent(agentId)?.name || 'this AI'}` : ''}` : `${conn.name} added, but it didn't start: ${r?.error || ''}`, { type: r?.ok ? 'info' : 'error', timeout: r?.ok ? 3000 : 7000 });
    repaint();
    return conn;
  }
  async function remove(id) {
    const c = byId(id);
    if (!c || !(await Modal.confirm('Remove this connection?', `${c.name} goes for every AI (its settings too).`, { ok: 'Remove', danger: true }))) return;
    // (capturefix2) both agent objects, as setMode does: the live one (H.agent) can be another object than the config's
    // after a config reload, and kept the switch (connections check: "Remove takes it away for every AI")
    const live = (H.config.agents || []).flatMap((a) => [a, H.agent(a.id)]).filter(Boolean);
    for (const a of new Set(live)) if (a.connections?.[id]) { const m = { ...a.connections }; delete m[id]; if (Object.keys(m).length) a.connections = m; else delete a.connections; }
    results.delete(id);
    await putList(all().filter((x) => x.id !== id));
    repaint();
  }
  // the form for your own (and Edit): name, command line or address, settings
  function ownForm(c, done) {
    const name = el('input', { type: 'text', value: c?.name || '', placeholder: 'Name (e.g. My notes)' });
    const line = el('input', { type: 'text', value: c ? (c.kind === 'http' ? c.url : [c.command, ...(c.args || [])].map(quote).join(' ')) : '', placeholder: 'npx -y some-mcp-server  ·  or  https://example.com/mcp' });
    const sets = el('textarea', { rows: 3, value: c ? settingsText(c) : '', placeholder: 'Optional settings, one per line: API_KEY=…  (for an address: Authorization: Bearer …)' });
    const err = el('p', { class: 'cn-err' });
    const save = el('button', { type: 'button', class: 'primary small', text: c ? 'Save' : 'Add', on: { click: async () => {
      const raw = line.value.trim();
      const http = /^https?:\/\//i.test(raw);
      const parts = http ? [] : splitLine(raw);
      if (!raw || (!http && !parts[0])) { err.textContent = 'A command (like npx -y package) or an https:// address.'; return; }
      const settings = parseSettings(sets.value, http);
      const conn = { ...(c || { id: newId() }), name: name.value.trim() || (http ? new URL(raw).hostname : parts.find((p) => !p.startsWith('-') && !/^(npx|uvx|node|python3?|docker)$/.test(p)) || parts[0]).slice(0, 40), kind: http ? 'http' : 'stdio' };
      delete conn.tools; delete conn.tokens; delete conn.catalog;
      if (http) { conn.url = raw; delete conn.command; delete conn.args; delete conn.env; if (Object.keys(settings).length) conn.headers = settings; else delete conn.headers; }
      else { conn.command = parts[0]; conn.args = parts.slice(1); delete conn.url; delete conn.headers; if (Object.keys(settings).length) conn.env = settings; else delete conn.env; }
      await done(conn);
    } } });
    return el('div', { class: 'cn-own' }, name, line, sets, el('p', { class: 'opt-hint cn-secret', text: SECRET_NOTE }), err, el('div', { class: 'cn-actions' }, save));
  }
  async function edit(id) {
    const c = byId(id);
    if (!c) return;
    const dlg = sheetDialog(`Edit ${c.name}`);
    dlg.body.append(ownForm(c, async (conn) => { results.delete(id); await putList(all().map((x) => (x.id === id ? conn : x))); dlg.close(); await test(id); }));
  }
  function sheetDialog(title) {
    const body = el('div', { class: 'cn-body' });
    const d = el('dialog', { class: 'ui-modal cn-dialog' }, el('div', { class: 'cn-head' }, el('h2', { text: title }), el('button', { type: 'button', class: 'ghost small', text: '✕', title: 'Close', on: { click: () => d.close() } })), body);
    d.addEventListener('close', () => setTimeout(() => d.remove(), 0));
    document.body.append(d);
    d.showModal();
    return { body, close: () => d.close() };
  }
  // ＋ Add a connection: the ready-made ones (one click), then your own
  async function openAdd(agentId) {
    const dlg = sheetDialog('Add a connection');
    const have = new Set(all().map((c) => c.catalog).filter(Boolean));
    let found = {};
    try { found = await window.hub.connections.which(['npx', 'uvx']); } catch { /* unknown: no marks */ }
    const cards = CATALOG.map((k) => {
      const need = NEEDS[k.needs];
      const missing = found[need.prog] === false;
      const b = el('button', { type: 'button', class: 'cn-card', title: missing ? `${need.label}: ${need.how}, then add it` : `Add ${k.name}${k.args.some((a) => a.startsWith('{')) ? ' (you pick where)' : ''}`, on: { click: async () => { dlg.close(); await addFromCatalog(k.key, agentId); } } },
        el('span', { class: 'cn-icon', text: k.icon }),
        el('span', { class: 'cn-what' }, el('b', { text: k.name }), el('small', { text: k.what })),
        el('span', { class: `cn-need${missing ? ' missing' : ''}`, text: missing ? `${need.label} (not found)` : need.label }),
        el('small', { class: 'cn-tok', text: `≈ ${fmtTok(k.tokens)} tok` }));
      if (have.has(k.key) && !k.args.some((a) => a.startsWith('{'))) b.disabled = true;
      return b;
    });
    dlg.body.append(
      el('p', { class: 'opt-hint', text: 'Free, no account: one click adds it, tests it and switches it on for this AI. They run on this computer with Node (npx) or Python (uvx).' }),
      el('div', { class: 'cn-cards' }, cards),
      el('h4', { class: 'opt-h', text: 'A tool server you already have' }),
      el('p', { class: 'opt-hint', text: 'Any tool server made for AIs (the kind called MCP): the command that starts it, or the address of one online.' }),
      ownForm(null, async (conn) => { dlg.close(); await add(conn, agentId); }));
  }

  // ---------- the rows in AI setup ----------
  let painted = null; // { box, agentId } the section on screen
  function repaint() { if (painted?.box.isConnected) fill(painted.box, painted.agentId); }
  function row(c, a) {
    const mode = a.connections?.[c.id] || '';
    const split = splits(c);
    const sel = el('select', { class: 'opt-pick', attrs: { 'aria-label': `${c.name} for ${a.name}` } },
      el('option', { value: '', text: 'Off' }),
      split ? el('option', { value: 'read', text: 'Read only' }) : null,
      el('option', { value: 'full', text: split ? 'Full' : 'On' }));
    sel.value = mode === 'read' && !split ? 'full' : mode;
    if (mode === 'read' && !split) sel.title = 'Read only until a Test shows which tools only look';
    sel.addEventListener('change', () => setMode(a.id, c.id, sel.value || null).then(repaint));
    const menu = (e) => { e.preventDefault(); showMenu(e.clientX, e.clientY, [{ label: 'Test', action: () => test(c.id) }, { label: 'Edit…', action: () => edit(c.id) }, '-', { label: 'Remove', danger: true, action: () => remove(c.id) }]); };
    const r = el('div', { class: 'opt-row cn-row', title: `${c.kind === 'http' ? c.url : [c.command, ...(c.args || [])].join(' ')}\nRight-click: Test, Edit, Remove`, on: { contextmenu: menu } },
      el('span', { class: 'opt-label', on: { dblclick: () => edit(c.id) } }, el('span', { text: c.name }), el('small', { class: 'cn-tok', text: ` · ${tokNote(c)}` })),
      sel,
      el('button', { type: 'button', class: 'ghost small', text: testing.has(c.id) ? '…' : 'Test', title: 'Start it and list its tools', disabled: testing.has(c.id), on: { click: () => test(c.id) } }));
    return [r, resultLine(c)];
  }
  function fill(box, agentId) {
    const a = H.agent(agentId);
    if (!a) { box.replaceChildren(); return; }
    painted = { box, agentId };
    const list = all();
    const head = el('div', { class: 'opt-row' }, el('span', { class: 'opt-label opt-sub', text: 'Your own connections' }), el('button', { type: 'button', class: 'ghost small', text: '＋ Add a connection', title: 'Gives it a ready-made free tool (files, web pages, a database…) or a tool server you already have', on: { click: () => openAdd(a.id) } }));
    box.replaceChildren(head, ...list.flatMap((c) => row(c, a)), list.length ? el('p', { class: 'opt-hint', text: 'Settings you typed for them go only to that server, never to the AI. Each one on adds its tools to every message (the ≈ tokens).' }) : null);
  }
  // options.js puts this under "What it can use"
  function section(agentId) { const box = el('div', { class: 'cn-box' }); fill(box, agentId); return box; }

  // ---------- chat command (the app's API; the panel is the way in) ----------
  if (typeof Commands !== 'undefined' && !Commands.get('connections')) {
    Commands.register({
      name: 'connections', area: 'Agents', args: '[add <ready-made> | test <name> | on <name> | off <name>]',
      desc: 'Your MCP servers for this AI: add ready-made ones, test, switch on / off',
      keywords: 'mcp server tools access connect',
      complete: (args) => {
        const [verb, ...rest] = String(args || '').split(/\s+/);
        if (!rest.length) return ['add', 'test', 'on', 'off'].filter((v) => v.startsWith(verb || '')).map((v) => ({ value: `${v} ` }));
        const q = rest.join(' ').toLowerCase();
        return verb === 'add' ? CATALOG.filter((k) => k.key.startsWith(q)).map((k) => ({ value: `add ${k.key}`, label: k.name, hint: NEEDS[k.needs].label })) : all().filter((c) => c.name.toLowerCase().includes(q)).map((c) => ({ value: `${verb} ${c.name}` }));
      },
      run: async (args, ctx) => {
        const [verb, ...rest] = String(args || '').trim().split(/\s+/);
        const q = rest.join(' ');
        const agentId = ctx.agentId || H.claudeAgent()?.id;
        if (verb === 'add') { if (!q) { openAdd(agentId); return null; } const c = await addFromCatalog(q.toLowerCase(), agentId); return c ? null : `No ready-made "${q}" (${CATALOG.map((k) => k.key).join(', ')}), or it was cancelled.`; }
        if (['test', 'on', 'off'].includes(verb)) {
          const c = find(q);
          if (!c) return `No connection "${q}". Yours: ${all().map((x) => x.name).join(', ') || 'none yet'}.`;
          if (verb === 'test') { const r = await test(c.id, { quiet: true }); return r?.ok ? `${c.name} works: ${r.tools.length} tools, ${tokNote(byId(c.id))}.` : `${c.name} didn't start: ${r?.error}${r?.hint ? ` ${r.hint}` : ''}`; }
          await setMode(agentId, c.id, verb === 'on' ? (splits(c) ? 'read' : 'full') : null);
          return `${c.name} is ${verb} for ${H.agent(agentId)?.name || 'this AI'}.`;
        }
        if (typeof Options !== 'undefined') Options.open({ agentId, show: 'connections' });
        const a = H.agent(agentId);
        return all().length ? all().map((c) => `${c.name}: ${a?.connections?.[c.id] || 'off'} (${tokNote(c)})`).join('\n') : 'No connections yet: ⋯ AI setup → What it can use → ＋ Add a connection.';
      },
    });
  }
  return { section, openAdd, test, add, addFromCatalog, remove, edit, setMode, CATALOG, splitLine, parseSettings, list: all };
})();
