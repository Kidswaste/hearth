// 🛟 Data safety for everything Hearth keeps (round 43, datasafe): scenesafe-core.js made the Lab's scenes safe; this is
// the same protection for every other place the owner's work lives (chats, memory, settings, notes, prompts, tool data,
// website history, usage…). One rule: a read that failed is NEVER "empty", and nothing that couldn't be read is saved
// over. Pure parts (fs injected; dev/datasafe-test.js), used by store.js / storework.js (every kv store, chats, memory,
// history, usage), datasafemain.js (config.json, the health card, Recover…), and the small main-side stores.
//   load(fs, file, fallback)  a read that says what happened: { value, state, doubt, canSave } (retries a held file,
//                             falls back to <name>.prev.json, then the fallback, and says so)
//   guardWrite(env, o)        before a save: a store read with a fallback is merged with what's on disk (nothing on
//                             disk is dropped), a held file is never written blind (throws: the save is retried),
//                             a big shrink on the first save of a session keeps a copy aside, rotating copies of the
//                             important ones (memory, settings, notes, prompts, chat tags…), a damaged file kept aside
//   union(disk, value)        "keep what disk had": sync-merge's two-way join (lists by id, objects by key; value wins)
//   guardConfig(disk, value)  config.json: a save can't drop the whole settings, every agent, or a top-level part
//   chatStub(name, st)        a chat file that can't be read still shows in the list (never "gone")
//   faults(fs)                tests only: Windows-style errors injected from data/.datasafe-faults.json (smoke runs)
(function (root, factory) {
  const api = factory(typeof require === 'function' ? require : null);
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.DataSafeCore = api;
}(typeof self !== 'undefined' ? self : this, (req) => {
  const SS = req ? req('./scenesafe-core') : (typeof SceneSafeCore !== 'undefined' ? SceneSafeCore : null);
  let S = null; const merge = () => (S ||= req('./sync-merge'));
  const isObj = (v) => Boolean(v) && typeof v === 'object' && !Array.isArray(v);

  // ---------- reading ----------
  // → { value, state: 'ok' | 'missing' | 'unreadable', from: 'file' | 'prev' | 'fallback', doubt, canSave, code? }
  //   doubt: the value isn't the file as it is (a copy, or the fallback after a failed read): a save of it must be
  //   merged with the disk first. canSave: false when nothing real was read and the file is there (held, a placeholder).
  function load(fs, file, fallback, o = {}) {
    const r = SS.readStatus(fs, file, o);
    if (r.state === 'ok') return { value: r.value, state: 'ok', from: r.from, doubt: r.from !== 'file', canSave: true, ...(r.garbled ? { garbled: true } : {}) };
    if (r.state === 'missing') {
      // a file that's gone while its .prev copy is there (removed by something else): the copy, not "nothing"
      if (r.prev !== undefined && o.prev !== false) return { value: r.prev, state: 'missing', from: 'prev', doubt: true, canSave: true };
      return { value: fallback, state: 'missing', from: 'fallback', doubt: false, canSave: true };
    }
    if (r.prev !== undefined) return { value: r.prev, state: 'unreadable', code: r.code, from: 'prev', doubt: true, canSave: true };
    return { value: fallback, state: 'unreadable', code: r.code, from: 'fallback', doubt: true, canSave: false };
  }

  // ---------- merging ----------
  // what disk had, kept: lists joined by id (else by value), objects by key, the saved value wins where both have it
  function union(disk, value) {
    if (disk === undefined || disk === null) return value;
    if (value === undefined || value === null) return disk;
    if (typeof disk === 'string' && typeof value === 'string') return value || disk;
    if ((isObj(disk) && isObj(value)) || (Array.isArray(disk) && Array.isArray(value))) {
      try { const r = merge().merge3(null, value, disk).value; return r ?? value; } catch { return value; }
    }
    return isObj(disk) || Array.isArray(disk) ? disk : value; // a list / an object replaced by something else: kept
  }
  // memory text: lines joined (a line in either is kept, in order)
  function mergeLines(mine, theirs) {
    const a = String(mine || '').split('\n'); const have = new Set(a.map((l) => l.trim()).filter(Boolean));
    const add = String(theirs || '').split('\n').map((l) => l.trim()).filter((l) => l && !have.has(l) && (have.add(l), true));
    return { text: [String(mine || '').replace(/\s+$/, ''), ...add].filter(Boolean).join('\n'), added: add };
  }
  // memory.json { shared, agents: { id: text }, places?: { key: text } … }: every line of `found` not in `cur` is added
  function mergeMemory(cur, found) {
    const out = { shared: '', agents: {}, ...(isObj(cur) ? cur : {}) };
    out.agents = { ...(isObj(out.agents) ? out.agents : {}) };
    const added = [];
    if (!isObj(found)) return { value: out, added };
    const m = mergeLines(out.shared, found.shared); out.shared = m.text; for (const l of m.added) added.push({ scope: 'shared', line: l });
    for (const [id, t] of Object.entries(isObj(found.agents) ? found.agents : {})) { const r = mergeLines(out.agents[id], t); if (r.added.length) { out.agents[id] = r.text; for (const l of r.added) added.push({ scope: `agent:${id}`, line: l }); } }
    for (const [k, v] of Object.entries(found)) {
      if (k === 'shared' || k === 'agents') continue;
      if (!(k in out)) { out[k] = v; added.push({ scope: k, line: '(all)' }); } else if (isObj(out[k]) && isObj(v)) {
        for (const [kk, t] of Object.entries(v)) if (typeof t === 'string') { const r = mergeLines(out[k][kk], t); if (r.added.length) { out[k] = { ...out[k], [kk]: r.text }; for (const l of r.added) added.push({ scope: `${k}:${kk}`, line: l }); } } else if (!(kk in out[k])) out[k] = { ...out[k], [kk]: t };
      }
    }
    return { value: out, added };
  }
  // how much a value holds (items of lists, keys of objects and what they hold, two levels): "did this save shrink a lot?"
  function count(v, depth = 2) {
    if (Array.isArray(v)) return v.length;
    if (isObj(v)) return Object.keys(v).length + (depth > 1 ? Object.values(v).reduce((a, x) => a + (x && typeof x === 'object' ? count(x, depth - 1) : 0), 0) : 0);
    if (typeof v === 'string') return v.trim() ? 1 : 0;
    return v === null || v === undefined ? 0 : 1;
  }
  const shrinks = (disk, value) => { const a = count(disk); const b = count(value); return a >= 3 && b < a * 0.5; };

  // ---------- config.json ----------
  // a save can't drop: every agent (or many at once: 2+ and half), the whole settings, a top-level part (layout, theme,
  // tools…). Deleting one agent, changing anything, adding: all pass. → { value, kept: { agents, keys, settings }, refused? }
  function guardConfig(disk, value) {
    const kept = { agents: [], keys: [], settings: false };
    if (!isObj(value)) return { value: disk, kept, refused: 'not a settings object' };
    if (!isObj(disk)) return { value, kept };
    if (Array.isArray(disk.agents) && !Array.isArray(value.agents)) return { value: disk, kept, refused: 'no agents list' };
    const out = { ...value };
    for (const k of Object.keys(disk)) if (!(k in out)) { out[k] = disk[k]; kept.keys.push(k); }
    if (Array.isArray(disk.agents)) {
      const have = new Set(out.agents.map((a) => a?.id));
      const lost = disk.agents.filter((a) => a?.id && !have.has(a.id));
      if (lost.length && (!out.agents.length || (lost.length >= 2 && lost.length >= disk.agents.length * 0.5))) { out.agents = [...out.agents, ...lost]; kept.agents = lost.map((a) => a.id); }
    }
    if (isObj(disk.settings) && Object.keys(disk.settings).length >= 3 && (!isObj(out.settings) || !Object.keys(out.settings).length)) { out.settings = disk.settings; kept.settings = true; }
    return { value: out, kept };
  }
  // the config a doubted window saved (it was given `base`, a copy): its own changes, onto what is on disk now
  function rebaseConfig(base, mine, disk) {
    if (!isObj(disk)) return mine;
    try { return merge().merge3(base, mine, disk).value || disk; } catch { return disk; }
  }

  // ---------- chats ----------
  // a chat file that can't be read (held, half-downloaded, damaged) still has its row: never "gone" from the list
  // (ids are `<agentId>-<base36 time>`; the agent is read off the name)
  function chatStub(name, st) {
    const id = String(name).replace(/\.json$/, '');
    const agentId = id.replace(/-[a-z0-9]+$/, '') || id;
    return { id, agentId, title: 'Chat (couldn\'t be read just now)', updatedAt: st?.mtimeMs || 0, pinned: false, unreadable: true };
  }
  // the recovery scan's chats: sources [{ label, kind: 'trash' | 'copy', list: [chat summary + file] }] → rows for the
  // chats not in `current` (ids), or a copy with more messages than yours (state 'more')
  function collectChats(current, sources) {
    const mine = new Map((current || []).map((c) => [c.id, c]));
    const best = new Map();
    for (const src of sources || []) for (const c of src.list || []) {
      if (!c || typeof c.id !== 'string') continue;
      const b = best.get(c.id);
      if (!b) { best.set(c.id, { ...c, from: src.label, fromAll: [src.label], deleted: src.kind === 'trash' }); continue; }
      b.fromAll.push(src.label); if (src.kind === 'trash') b.deleted = true;
      if ((c.messages || 0) > (b.messages || 0) || ((c.messages || 0) === (b.messages || 0) && (c.updatedAt || 0) > (b.updatedAt || 0))) Object.assign(b, { ...c, from: src.label, fromAll: b.fromAll, deleted: b.deleted });
    }
    const out = [];
    for (const [id, b] of best) {
      const have = mine.get(id);
      if (have && !have.unreadable && (b.messages || 0) <= (have.messages ?? Infinity)) continue;
      out.push({ ...b, state: have ? 'more' : 'missing' });
    }
    return out.sort((a, b) => (a.deleted - b.deleted) || (b.updatedAt || 0) - (a.updatedAt || 0));
  }

  // ---------- which stores get rotating copies (data/.history/<name>/ or data/kv/.history/<name>/) ----------
  // the owner's own writing and settings: a copy at most every 30 minutes, before the save that changes them
  const IMPORTANT = new Set(['memory', 'config', 'web-history', 'notes', 'prompts', 'prompts-meta', 'chat-meta', 'chat-bookmarks', 'chat-snippets', 'memory-meta', 'chat-scenes', 'projects', 'boards', 'director-tasks', 'flows-mine', 'astra-personas']);
  // plain names for the card and Recover (store name → what the owner calls it)
  const LABELS = {
    config: 'Settings and agents', memory: 'Memory', 'web-history': 'Website history', usage: 'Usage counts', chats: 'Chats list',
    notes: 'Notes', prompts: 'Prompts', 'prompts-meta': 'Prompt favourites', 'chat-meta': 'Chat tags and folders', 'chat-bookmarks': 'Bookmarks',
    'chat-snippets': 'Snippets', 'memory-meta': 'Memory details', 'chat-scenes': 'Chats\' scenes', projects: 'Projects', boards: 'Mood boards',
    'director-tasks': 'Director tasks', 'ui-usage': 'Feature usage', 'aiundo': 'AI changes (Activity)', 'token-stats': 'Token meter',
    'flows-mine': 'Your flows', 'astra-personas': 'Astra personas', 'routines': 'Routines', 'renders': 'Renders list', 'devreport-log': 'Reports',
  };
  const labelOf = (name) => LABELS[name] || (/^board-/.test(name) ? 'A mood board' : /^three-/.test(name) ? 'Lab data' : `Tool data (${name})`);
  // file → { name, dir } for the copies, or null (chats, the Lab's scenes / History: they have their own)
  function storeOf(file) {
    const f = String(file).replace(/\\/g, '/');
    let m = /\/kv\/([\w-]+)\.json$/.exec(f);
    if (m) return SS.GUARDED[m[1]] ? null : { name: m[1], kv: true };
    m = /\/data\/(memory|web-history|usage)\.json$/.exec(f);
    if (m) return { name: m[1], kv: false };
    if (/\/config\.json$/.test(f)) return { name: 'config', kv: false };
    return null;
  }

  // ---------- the guard before a save ----------
  // env: { fs, path, cache: Map, now?, historyDir?(file, name) } · o: { file, value, doubt?, blind?, base? }
  //   doubt  the value was built on a read that failed (or a copy): merged with the file as it is now (nothing on disk
  //          is lost); a file still held → throws (code 'EHELD'): nothing is written, the save is tried again later
  //   blind  the first save of this store since the window started, without a read: a big shrink keeps a copy aside
  // → { value, keepPrev, copied: [names], kept: n (items brought back), merged: bool }
  function guardWrite(env, o) {
    const { fs, path } = env;
    const now = env.now ? env.now() : Date.now();
    const out = { value: o.value, keepPrev: true, copied: [], kept: 0, merged: false };
    const st0 = storeOf(o.file);
    const isChat = /[\\/]chats[\\/][^\\/]+\.json$/.test(String(o.file));
    if (!st0 && !isChat) return out;
    const name = st0?.name || null;
    const important = Boolean(name && IMPORTANT.has(name));
    const dir = name ? (env.historyDir ? env.historyDir(o.file, name) : path.join(path.dirname(o.file), '.history', name)) : null;
    let newest = dir ? env.cache.get(`dir:${dir}`) : 0;
    if (dir && newest === undefined) { try { newest = Math.max(0, ...fs.readdirSync(dir).map((n) => SS.parseCopy(n)?.at || 0)); } catch { newest = 0; } env.cache.set(`dir:${dir}`, newest); }
    const due = important && SS.copyDue(newest, now, { gapMs: 30 * 60000 });
    if (!o.doubt && !o.blind && !due) return out;
    let text = null; let disk;
    try { text = SS.readRetry(fs, o.file); } catch (err) {
      if (err.code === 'ENOENT') return out;
      // built on a failed read, or a first save without a read: never written over a file that can't be read (the save
      // is tried again); a plain save of a store already read in this session goes on as before
      if (o.doubt || o.blind) { const e = new Error(`${name || path.basename(o.file)} can't be read just now (${err.code}): not saved over`); e.code = 'EHELD'; throw e; }
      return out;
    }
    try { disk = JSON.parse(text); } catch { disk = undefined; }
    const copy = (body, n, tag) => {
      if (!dir) return;
      try {
        fs.mkdirSync(dir, { recursive: true });
        const nm = SS.copyName(now, n, tag);
        fs.writeFileSync(path.join(dir, nm), body);
        out.copied.push(nm); env.cache.set(`dir:${dir}`, now);
      } catch { /* a copy is a bonus */ }
    };
    if (disk === undefined) { copy(text, 0, 'garbled'); out.keepPrev = false; } // damaged: aside, the good .prev stays
    else if (o.doubt) {
      if (env.cache.get(`aside:${o.file}`) !== text.length) { copy(text, count(disk), 'unread'); env.cache.set(`aside:${o.file}`, text.length); }
      const v = name === 'memory' ? mergeMemory(disk, o.value).value : name === 'config' ? rebaseConfig(o.base, o.value, disk) : union(disk, o.value);
      out.kept = Math.max(0, count(v) - count(o.value)); out.merged = true; out.value = v;
    } else if (o.blind && shrinks(disk, o.value)) copy(text, count(disk), 'before');
    if (due && disk !== undefined && !out.copied.length) copy(text, count(disk), '');
    if (out.copied.length && dir) { try { for (const n of SS.pruneCopies(fs.readdirSync(dir), { keep: 10, now })) fs.rmSync(path.join(dir, n), { force: true }); } catch { /* fine */ } }
    return out;
  }
  // the copies a store has: [{ name, at, count, tag, file }] newest first
  function copiesOf(fs, path, dir) {
    let names = []; try { names = fs.readdirSync(dir); } catch { return []; }
    return names.map(SS.parseCopy).filter(Boolean).sort((a, b) => b.at - a.at).map((c) => ({ ...c, file: path.join(dir, c.name) }));
  }

  // ---------- tests only: Windows-style read errors on chosen files ----------
  // data/.datasafe-faults.json { t0?, "<path relative to data/, or config.json>": { code: 'EBUSY', from?, ms?, dir? } }
  // (from / ms: the window in ms after t0, default the start; dir: a folder listing fails). Honoured only in a test run
  // (HEARTH_TEST_SAVE_DIR is set by dev/smoke.js and dev/datasafe-test.js), never in the owner's app.
  function faults(fs, dataDir, env = (typeof process !== 'undefined' ? process.env : {})) {
    if (!env.HEARTH_TEST_SAVE_DIR || !dataDir) return fs;
    let spec = null;
    try { spec = JSON.parse(fs.readFileSync(`${dataDir}/.datasafe-faults.json`, 'utf8')); } catch { return fs; }
    const t0 = Number(spec.t0) || Date.now();
    const rules = Object.entries(spec).filter(([k, v]) => k !== 't0' && v && v.code).map(([k, v]) => ({ end: `/${k.replace(/\\/g, '/')}`, ...v }));
    if (!rules.length) return fs;
    const hit = (p) => { const f = String(p).replace(/\\/g, '/').replace(/\/$/, ''); const el = Date.now() - t0; return rules.find((r) => f.endsWith(r.end) && (!r.from || el >= r.from) && (!r.ms || el < r.ms)); };
    const fail = (r, p) => { const e = new Error(`${r.code}: resource busy or locked, open '${p}'`); e.code = r.code; return e; };
    return new Proxy(fs, { get(t, k) {
      if (k === 'readFileSync') return (p, ...a) => { const r = hit(p); if (r) throw fail(r, p); return t.readFileSync(p, ...a); };
      if (k === 'readdirSync') return (p, ...a) => { const r = hit(p); if (r && r.dir) throw fail(r, p); return t.readdirSync(p, ...a); };
      const v = t[k]; return typeof v === 'function' ? v.bind(t) : v;
    } });
  }

  // ---------- (round 52, chatkeep) chats Recover finds that aren't copies of a chat file ----------
  // An engine's own record of a conversation (Claude Code: ~/.claude/projects/<cwd>/<session>.jsonl; Codex:
  // ~/.codex/sessions/…/rollout-*.jsonl): the words each side wrote, as a Hearth chat's messages. A chat that never
  // reached its file (or whose file is gone with no copy) still has this. text: the .jsonl → null when it holds no
  // exchange. { sessionId, cwd, startedAt, updatedAt, messages, tools, three }
  const NOISE = /^\s*<(environment_context|user_instructions|permissions|turn_aborted|command-name|local-command|system-reminder)\b/;
  function sessionChat(text, { engine = 'claude' } = {}) {
    const out = { engine, sessionId: null, cwd: null, startedAt: 0, updatedAt: 0, messages: [], tools: [] };
    const tools = new Set();
    let last = null;
    const put = (role, t, at) => {
      t = String(t || '').trim();
      if (!t || NOISE.test(t)) return;
      if (last && last.role === role && role === 'assistant') { last.text += `\n\n${t}`; last.at = at || last.at; return; }
      last = { role, text: t.slice(0, 200000), at: at || 0 };
      out.messages.push(last);
    };
    const textOf = (c, types) => (typeof c === 'string' ? c : Array.isArray(c) ? c.filter((x) => x && types.includes(x.type) && typeof x.text === 'string').map((x) => x.text).join('\n') : '');
    for (const line of String(text || '').split('\n')) {
      if (!line.trim()) continue;
      let j; try { j = JSON.parse(line); } catch { continue; }
      const at = Date.parse(j.timestamp || j.payload?.timestamp || '') || 0;
      if (at) { out.startedAt ||= at; out.updatedAt = Math.max(out.updatedAt, at); }
      if (engine === 'claude') {
        out.sessionId ||= j.sessionId || j.session_id || null; out.cwd ||= j.cwd || null;
        if (j.isMeta || j.isSidechain) continue;
        const m = j.message;
        if (j.type === 'user' && m) { put('user', textOf(m.content, ['text']), at); continue; }
        if (j.type === 'assistant' && m) {
          for (const c of Array.isArray(m.content) ? m.content : []) if (c?.type === 'tool_use' && c.name) tools.add(c.name);
          put('assistant', textOf(m.content, ['text']), at);
        }
      } else {
        const p = j.payload || {};
        if (j.type === 'session_meta') { out.sessionId ||= p.id || null; out.cwd ||= p.cwd || null; continue; }
        if (j.type !== 'response_item') continue;
        if (p.type === 'function_call' || p.type === 'custom_tool_call' || p.type === 'mcp_tool_call') { if (p.name) tools.add(p.name); continue; }
        if (p.type === 'message' && (p.role === 'user' || p.role === 'assistant')) put(p.role, textOf(p.content, ['input_text', 'output_text', 'text']), at);
      }
    }
    out.tools = [...tools];
    out.three = out.tools.some((t) => /three_|hub-three|hearth-three/i.test(t));
    if (!out.messages.some((m) => m.role === 'user') || !out.messages.some((m) => m.role === 'assistant')) return null;
    return out;
  }
  const textKey = (t) => String(t || '').replace(/\s+/g, ' ').trim().slice(0, 160).toLowerCase();
  // already one of your chats: its session id, or most of what you asked in it is in one of yours
  function sessionKnown(sc, { sessions, asks }) {
    if (sc.sessionId && sessions.has(sc.sessionId)) return true;
    const mine = sc.messages.filter((m) => m.role === 'user').map((m) => textKey(m.text)).filter(Boolean);
    if (!mine.length) return true;
    let hit = 0;
    for (const k of mine) { if (asks.has(k)) { hit += 1; continue; } for (const a of asks) if (a && a.length >= 12 && (a.includes(k) || k.includes(a))) { hit += 1; break; } }
    return hit * 2 >= mine.length;
  }
  // a chat made from an engine's record (a new id: never one of yours)
  function chatFromSession(sc, agentId, now = Date.now()) {
    const first = sc.messages.find((m) => m.role === 'user')?.text || 'Recovered chat';
    const line = first.split('\n').find((l) => l.trim())?.trim() || 'Recovered chat';
    return {
      id: `${String(agentId || 'chat').replace(/[^\w-]/g, '').slice(0, 40)}-rec${(sc.startedAt || now).toString(36)}`.slice(0, 80),
      agentId, title: `${line.length > 44 ? `${line.slice(0, 43)}…` : line} (recovered)`, createdAt: sc.startedAt || now, updatedAt: sc.updatedAt || now,
      session: sc.sessionId ? { id: sc.sessionId } : {}, ...(sc.engine === 'codex' ? { engine: 'codex' } : {}),
      messages: sc.messages.map((m) => ({ role: m.role, text: m.text, at: m.at || sc.startedAt || now })), recoveredFrom: `${sc.engine === 'codex' ? 'Codex' : 'Claude Code'}'s own record`,
    };
  }
  // chats on disk the list doesn't show: their AI is gone from the settings, turned off, or not a native chat AI
  function hiddenChats(rows, agents, goneDocks = []) {
    const gone = new Set(goneDocks);
    const on = new Set((agents || []).filter((a) => a && a.enabled !== false && a.mode === 'native' && !gone.has(a.dock)).map((a) => a.id));
    return (rows || []).filter((c) => c && c.id && !c.unreadable && !on.has(c.agentId));
  }
  // the AI a chat comes back to: its own when it's there, else one of the same kind (a docked director's chat → the
  // director docked in the same place, an Astra chat → Astra, the rest → Claude)
  function homeFor(chat, agents, { three = false, engine = null } = {}) {
    const list = (agents || []).filter((a) => a && a.enabled !== false && a.mode === 'native');
    const own = list.find((a) => a.id === chat?.agentId);
    if (own) return own.id;
    const was = (agents || []).find((a) => a?.id === chat?.agentId);
    const dock = was?.dock || (three || /^threedirector/.test(String(chat?.agentId || chat?.id || '')) ? 'three' : null);
    if (dock) { const d = list.find((a) => a.dock === dock); if (d) return d.id; }
    const eng = engine || chat?.engine || was?.engine;
    return (eng === 'codex' ? list.find((a) => a.engine === 'codex' && !a.dock) : null)?.id || list.find((a) => a.engine === 'claude' && !a.dock)?.id || list[0]?.id || null;
  }

  return { load, union, mergeLines, mergeMemory, count, shrinks, guardConfig, rebaseConfig, chatStub, collectChats, sessionChat, sessionKnown, chatFromSession, hiddenChats, homeFor, textKey, IMPORTANT, LABELS, labelOf, storeOf, guardWrite, copiesOf, faults, readRetry: SS.readRetry, readStatus: SS.readStatus, BUSY: SS.BUSY };
}));
