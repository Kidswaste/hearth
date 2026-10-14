// Context, the pure part (round 24, context): what goes along with a message, measured in tokens, with nothing sent
// by default. Shared by chat-refs.js (@ references), chat-memory.js (facts injected only when relevant),
// chat-fresh.js (fresh start from a summary) and chat-cost.js (what each message sent), and by Node (dev/context-test.js,
// dev/context-cost.js). Tokens ≈ characters / 4, like mcp/cost.js and the fake engines.
const ContextCore = (() => {
  const tok = (s) => Math.ceil(String(s || '').length / 4);
  const clip = (s, n) => { const t = String(s || '').replace(/\s+/g, ' ').trim(); return t.length > n ? `${t.slice(0, n - 1)}…` : t; };
  const fmt = (n) => (n >= 10000 ? `${Math.round(n / 1000)}k` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(Math.round(n)));

  // ---------- references (@chat, @scene, @board, @file, @render, @project) ----------
  // The exact text a reference adds to a message: the chat box packs a text attachment as
  // "\n\n<file name=…>\n…\n</file>" (native.js packAttachments), so its cost is measured on that very string.
  const block = (name, content) => `\n\n<file name="${name}">\n${content}\n</file>`;
  const refName = (kind, name) => `@${kind} · ${clip(String(name || kind).replace(/["<>]/g, ''), 40)}`;
  function ref(kind, name, content) {
    const n = refName(kind, name);
    return { kind: 'text', name: n, content, ref: kind, tokens: tok(block(n, content)) };
  }

  // a sketch's sliders: key = value (label), from its tweak({ … }) blocks, without running it
  function sliders(code, max = 12) {
    const out = [];
    const re = /tweak\(\s*\{([\s\S]{0,3000}?)\}\s*\)\s*;?/g;
    let m;
    while ((m = re.exec(String(code || ''))) && out.length < max) {
      for (const s of m[1].matchAll(/([A-Za-z_$][\w$]*)\s*:\s*(\{[^{}]*\}|'[^']*'|"[^"]*"|-?[\d.]+)/g)) {
        if (out.length >= max) break;
        const [, key, v] = s;
        if (['value', 'min', 'max', 'step', 'label', 'group', 'hint', 'options'].includes(key)) continue;
        const val = v.startsWith('{') ? (v.match(/value\s*:\s*('[^']*'|"[^"]*"|-?[\d.]+|true|false)/) || [])[1] : v;
        out.push(`${key}=${String(val ?? '?').replace(/['"]/g, '')}`);
      }
    }
    return out;
  }
  const isFilter = (code) => /\bfilter\(\s*['"]/.test(code || '');
  const isShader = (code) => /gl_FragColor|void\s+main\s*\(|#version|fragmentShader/.test(code || '');
  // @scene: the state a director needs to talk about a scene (layers, order, blend, timing, sliders, size), no code
  function sceneCompact(sk, { frame = null, errors = [], timeline = null } = {}) {
    if (!sk) return '';
    const layers = sk.layers?.length ? sk.layers : [{ name: sk.name, code: sk.code }];
    const lines = [`Lab scene "${sk.name}"${frame ? ` · ${frame.w || frame[0]}×${frame.h || frame[1]}` : ''} · ${layers.length} layer${layers.length === 1 ? '' : 's'} (bottom first)${timeline ? ` · own timeline ${timeline.len || 10} s` : ''}`];
    layers.forEach((L, i) => {
      const code = String(L.code || '');
      const bits = [
        isFilter(code) ? 'filter' : isShader(code) ? 'shader' : null,
        L.visible === false ? 'hidden' : null,
        L.blend && L.blend !== 'normal' ? L.blend : null,
        (L.opacity ?? 1) < 1 ? `${Math.round((L.opacity ?? 1) * 100)}%` : null,
        L.in != null || L.out != null ? `plays ${L.in ?? 0}–${L.out ?? 'end'} s` : null,
        L.keys && Object.keys(L.keys).length ? `keyframes: ${Object.keys(L.keys).map((k) => k.replace(/^s:/, '')).join(', ')}` : null,
        `${code.split('\n').length} lines`,
      ].filter(Boolean);
      const sl = sliders(code, 8);
      lines.push(`${i + 1}. ${L.name || L.id || `layer ${i + 1}`} · ${bits.join(' · ')}${sl.length ? `\n   sliders: ${sl.join(', ')}` : ''}`);
    });
    for (const e of errors.slice(0, 3)) lines.push(`error${e.layer ? ` in ${e.layer}` : ''}: ${clip(e.message, 120)}`);
    lines.push('(No code attached: read a layer with your tools when you need it.)');
    return lines.join('\n');
  }
  // what "the full state" means for the same scene: every layer's code and settings (what pasting the scene, or reading
  // each layer with three_get_code, puts in the conversation); used to measure what @scene saves
  function sceneFull(sk) {
    const layers = sk.layers?.length ? sk.layers : [{ name: sk.name, code: sk.code }];
    return JSON.stringify({ sketch: sk.name, layers: layers.map((L, i) => ({ name: L.name, order: i + 1, visible: L.visible !== false, opacity: L.opacity ?? 1, blend: L.blend || 'normal', in: L.in, out: L.out, keys: L.keys, code: L.code })) }, null, 1);
  }

  // ---------- a chat in a few lines: @chat and the fresh start ----------
  const STOP = new Set('about above after again also always another anything around because been before being below between both cannot could does doing done down each even every from have having here into itself just keep know like made make many maybe more most much must need never next only other over please really same should since some still such sure than that their them then there these they thing things this those though through very want were what when where which while will with within without would your yours just okay yeah thanks thank right left lets also look looks good great nice cool the and for you are but not can was all any has had how its our out use way who why yes get got put let one two new now see did too off own may add set try bit lot via per far few big run end yet ask say she him her his'.split(' '));
  // content words of a text (lower case, ≥ 3 letters, not common words), each cut to a 5-letter stem
  function words(text) {
    const out = new Set();
    for (const w of String(text || '').toLowerCase().match(/[a-z0-9][a-z0-9_-]{2,}/g) || []) if (!STOP.has(w)) out.add(w.slice(0, 5));
    return out;
  }
  const DECIDE = /\b(?:let'?s|go with|use|keep|make it|make the|i (?:want|prefer|like|need|'d like)|always|never|don'?t|no more|switch to|change (?:it|the)\b|instead|from now on|should be|set (?:it|the))\b/i;
  const DID = /\b(?:i(?:'ve| have)? (?:added|changed|set|made|created|renamed|removed|replaced|moved|fixed|built|wrote|updated|saved|rendered|linked|tuned|turned)|(?:added|created|built|rendered|saved) (?:a|the|an)\b|now (?:has|uses|plays|shows))/i;
  const OPEN = /(?:^\s*[-*] \[ \]|\b(?:next(?: step)?|todo|to do|left to do|still (?:need|to)|later|not yet|remaining|then we|after that|we could|you could (?:also|then)|shall i|want me to|should i)\b)/i;
  const PATH = /(?:[A-Za-z]:\\|\/|~\/)?(?:[\w.-]+[\\/])*[\w.-]+\.(?:js|mjs|ts|tsx|jsx|json|html?|css|glsl|frag|vert|md|txt|py|png|jpe?g|webp|gif|mp4|webm|mov|wav|mp3|glb|gltf|obj|hdr|exr|cube|ttf|otf|woff2?)\b/g;
  const NAMED = /`([^`\n]{2,40})`|"([^"\n]{2,40})"(?=\s*(?:layer|scene|sketch|slider|board|sequence|preset|project|file)\b)|\b(?:layer|scene|sketch|slider|board|sequence|preset|project)\s+"([^"\n]{2,40})"/gi;
  // (attached files, references and carried-over conversations are not the conversation itself)
  const sentences = (t) => String(t || '').replace(/```[\s\S]*?```/g, ' ').replace(/<(file|earlier_conversation|summary|since_then)\b[^>]*>[\s\S]*?<\/\1>/g, ' ').replace(/\[(?:Memory|Hearth context)[^\]]*\]/g, ' ').split(/(?<=[.!?])\s+|\n+/).map((s) => s.trim().replace(/^(?:[-*•]|\d+\.)\s+/, '')).filter((s) => s.length > 6);
  // A summary made here, for free (no engine call): the goal, what was decided, what exists now, what is open, the key
  // files and names, and where the conversation stopped. The agent's own compact summary is used when the chat has one.
  function localSummary(chat, { maxWords = 260 } = {}) {
    const ms = (chat?.messages || []).filter((m) => (m.role === 'user' || m.role === 'assistant') && m.text && !m.compactReq);
    const users = ms.filter((m) => m.role === 'user' && !String(m.text).startsWith('/'));
    const replies = ms.filter((m) => m.role === 'assistant');
    const uniq = (list, n) => { const seen = new Set(); const out = []; for (const s of list) { const k = s.toLowerCase().slice(0, 50); if (!seen.has(k)) { seen.add(k); out.push(s); } } return out.slice(-n); };
    const goal = clip(users[0]?.text || chat?.title || '', 220);
    const decisions = uniq(users.slice(1).flatMap((m) => sentences(m.text).filter((s) => DECIDE.test(s)).map((s) => clip(s, 140))), 6);
    const done = uniq(replies.flatMap((m) => sentences(m.text).filter((s) => DID.test(s)).map((s) => clip(s, 140))), 6);
    const tail = ms.slice(-6);
    const open = uniq([
      ...tail.flatMap((m) => sentences(m.text).filter((s) => OPEN.test(s)).map((s) => clip(s.replace(/^[-*] \[ \]\s*/, ''), 120))),
      ...(replies.at(-1)?.suggest || []).filter((s) => !s.startsWith('/')).map((s) => clip(s, 60)),
    ], 5);
    const files = []; const names = [];
    for (const m of ms) {
      for (const p of String(m.text).match(PATH) || []) if (!files.includes(p) && !/^\d/.test(p)) files.push(p);
      for (const n of String(m.text).matchAll(NAMED)) { const x = (n[1] || n[2] || n[3]).trim(); if (x && !names.includes(x) && !/\s{2}|^[/(]|^https?:/.test(x) && x.length < 40) names.push(x); }
    }
    const lastUser = users.at(-1); const lastReply = replies.at(-1);
    const parts = [
      goal ? `Goal: ${goal}` : null,
      decisions.length ? `Decided:\n${decisions.map((s) => `- ${s}`).join('\n')}` : null,
      done.length ? `Done so far:\n${done.map((s) => `- ${s}`).join('\n')}` : null,
      open.length ? `Open:\n${open.map((s) => `- ${s}`).join('\n')}` : null,
      files.length ? `Key files: ${files.slice(-10).join(', ')}` : null,
      names.length ? `Key names: ${names.slice(-12).join(', ')}` : null,
      lastUser ? `Last: the user asked "${clip(lastUser.text, 160)}"${lastReply && lastReply.at >= (lastUser.at || 0) ? `; the reply began "${clip(lastReply.text, 160)}"` : ''}` : null,
    ].filter(Boolean);
    // over the word budget: the lists lose their oldest lines first, the goal and the last exchange stay
    let text = parts.join('\n');
    const wc = (t) => (t.match(/\S+/g) || []).length;
    for (const key of ['Done so far', 'Decided', 'Key names', 'Open']) {
      while (wc(text) > maxWords) {
        const i = parts.findIndex((p) => p && p.startsWith(key));
        if (i < 0) break;
        const ls = parts[i].split('\n');
        if (ls.length <= 2) { parts.splice(i, 1); } else { ls.splice(1, 1); parts[i] = ls.join('\n'); }
        text = parts.join('\n');
      }
    }
    return { goal, decisions, done, open, files: files.slice(-10), names: names.slice(-12), text, tokens: tok(text) };
  }
  // @chat: another chat in a few lines (its compact summary when it has one, else the free summary), never its history
  function chatDigest(chat, { agentName = '' } = {}) {
    if (!chat) return '';
    const n = (chat.messages || []).filter((m) => m.role === 'user' || m.role === 'assistant').length;
    const head = `Chat "${chat.title}"${agentName ? ` with ${agentName}` : ''} · ${n} messages${chat.updatedAt ? ` · last ${new Date(chat.updatedAt).toISOString().slice(0, 10)}` : ''}`;
    const body = chat.compact?.summary ? clip(chat.compact.summary, 1800) : localSummary(chat, { maxWords: 200 }).text;
    return `${head}\n${body}\n(A summary, not the whole conversation.)`;
  }
  // tokens of a conversation as an engine re-reads it (user and assistant text since a point)
  function historyTokens(messages, from = 0) {
    return (messages || []).slice(from).reduce((n, m) => n + (m.role === 'user' || m.role === 'assistant' ? tok(m.sent || m.text) + 4 : 0), 0);
  }

  // ---------- @project ----------
  function projectCompact(p, { facts = [], counts = '' } = {}) {
    if (!p) return '';
    return [`Project "${p.name}"${p.status && p.status !== 'active' ? ` (${p.status})` : ''}${counts ? ` · ${counts}` : ''}`,
      p.notes ? `Notes: ${clip(p.notes, 700)}` : null,
      facts.length ? `Key facts:\n${facts.slice(0, 12).map((f) => `- ${clip(f.t || f, 160)}`).join('\n')}` : null].filter(Boolean).join('\n');
  }

  // ---------- memory: only the facts a message is about ----------
  // facts: [{ t, scope: 'chat' | 'project' | 'agent', always? }]. A fact goes along when the message shares a content
  // word with it (stems), when it names the project, or when it is marked "always" (kept to a few). Best first, capped.
  function relevant(facts, text, { project = '', max = 5, maxTokens = 140 } = {}) {
    const said = words(text);
    const projWords = words(project);
    const namesProject = projWords.size && [...projWords].every((w) => said.has(w));
    const scored = [];
    for (const f of facts || []) {
      const fw = words(f.t);
      let s = 0;
      for (const w of fw) if (said.has(w)) s += 1;
      if (f.always) s += 0.5;
      if (f.scope === 'project' && namesProject) s += 1;
      if (f.scope === 'chat') s += s > 0 ? 0.25 : 0; // the chat's own facts win ties
      if (s >= 1 || f.always) scored.push({ f, s });
    }
    scored.sort((a, b) => b.s - a.s);
    const out = []; let n = 0;
    for (const { f } of scored) { const c = tok(f.t) + 1; if (out.length >= max || n + c > maxTokens) break; out.push(f); n += c; }
    return out;
  }
  const memoryLine = (facts) => (facts.length ? `[Memory, approved by the user: ${facts.map((f) => f.t).join('; ')}]` : '');

  // (round 31, tokensaver) an AI's saved memory: in its system prompt while it's small (≤ MEMORY_AUTO tokens), only
  // with the messages it's about once it's big ("relevant" becomes the default there). agent.memoryWhenRelevant true /
  // false (/memory relevant on / off) forces one way. engines.js (the system prompt) and chat-memory.js (the message)
  // both ask here, so a fact is never sent twice or dropped. Why not relevant for every memory: a fact sent with a
  // message stays in the chat's history and is re-read by every later message, so a small memory costs less in the
  // (cached) system prompt; chat-memory.js sends each fact at most once per chat for the same reason. Standing
  // preferences ("never…", "call me…") go with the first message of a chat in relevant mode (`always` facts, capped).
  const MEMORY_HEAD = 'What you remember about the user (saved notes, keep them in mind):';
  const MEMORY_AUTO = 300;
  // (round 38, memorytidy) place scopes: facts kept for one place (memory.json `places`) go only to the AIs working
  // there, e.g. Lab facts only to the Three Directors. Order is fixed (shared, places in this order, the AI's own), so
  // the prompt stays byte-stable; an AI without a place, or a memory without places, gets exactly what it got before.
  const PLACES = [
    { id: 'lab', label: 'Lab', who: 'the Three Directors', on: (a) => Boolean(a && (a.threeTools || a.dock === 'three')) },
    { id: 'game', label: 'Forgeheart', who: 'the game\'s AI', on: (a) => Boolean(a && (a.gameTools || a.companion === 'forge-game')) },
  ];
  // agent: the agent object (its places count) or an id (shared + its own, as before)
  const memoryNotes = (mem, agent) => {
    const a = agent && typeof agent === 'object' ? agent : null;
    const places = a ? PLACES.filter((p) => p.on(a)).map((p) => mem?.places?.[p.id]) : [];
    return [mem?.shared, ...places, mem?.agents?.[a ? a.id : agent]].map((m) => String(m || '').trim()).filter(Boolean);
  };
  const memoryBlock = (notes) => (notes.length ? `${MEMORY_HEAD}\n${notes.join('\n')}` : '');
  function memoryRelevant(agent, mem) {
    if (agent?.memoryWhenRelevant === true) return true;
    if (agent?.memoryWhenRelevant === false) return false;
    return tok(memoryBlock(memoryNotes(mem, agent))) > MEMORY_AUTO;
  }
  const STANDING = /\b(always|never|prefer|don'?t|do not|call me|my name is|answer|repl(?:y|ies)|I hate|I like|I love)\b/i;
  const standing = (t) => STANDING.test(String(t || ''));

  // ---------- what a message sent ----------
  // input (the engine's own count) split into: the engine's base, the system prompt, each tool set, the history, the
  // attachments / @ references / memory of this message, and the words typed. History is what remains.
  function breakdown({ input = 0, base = 0, system = 0, tools = [], message = 0, attach = 0, refs = 0, memory = 0 }) {
    const t = tools.reduce((n, x) => n + (x[1] || 0), 0);
    const fixed = base + system + t + message + attach + refs + memory;
    const history = Math.max(0, input - fixed);
    // the engine counted less than the estimate (a cache-only count, a short run): scale the estimates to fit
    const k = input && fixed > input ? input / fixed : 1;
    const r = (x) => Math.round(x * k);
    return { input, base: r(base), system: r(system), tools: tools.map(([w, x]) => [w, r(x)]), toolsTotal: r(t), message: r(message), attach: r(attach), refs: r(refs), memory: r(memory), history };
  }
  // The cheapest fix for an expensive chat, biggest saving first: tools it never uses, a long history, memory sent always.
  // sets: [[toolset key, tokens]] on now; used: tool names called in this chat lately; memAlways: tokens of always-on memory
  const SET_OFF = {
    boardTools: ['Board tools', '/board-tools off', /board_/], captureTools: ['Capture tools', '/capture-tools off', /capture_/],
    appsTools: ['App tools', '/apps-tools off', /apps_|meshy/], adobeTools: ['Adobe tools', '/adobe-tools off', /adobe_/],
    deployTools: ['Deploy tools', '/deploy-tools off', /deploy_/],
  };
  function fixes({ bd, sets = [], used = [], memAlways = 0, summaryTokens = 300, replies = 0 }) {
    const out = [];
    for (const [key, tokens] of sets) {
      const s = SET_OFF[key];
      if (!s || tokens < 300 || used.some((n) => s[2].test(n))) continue;
      out.push({ kind: 'tools', key, saves: tokens, cmd: s[1], text: `This chat sends ${fmt(tokens)} tokens of ${s[0]} with every message and hasn't used them${replies ? ` in ${replies} replies` : ''}: switch them off?` });
    }
    if (bd && bd.history > 12000) {
      const saves = bd.history - summaryTokens;
      out.push({ kind: 'history', saves, cmd: '/fresh', text: `This chat re-reads ${fmt(bd.history)} tokens of history with every message: a fresh start from a summary sends ≈ ${fmt(summaryTokens)} instead.` });
    }
    if (memAlways > 150) out.push({ kind: 'memory', saves: memAlways - 40, cmd: '/memory relevant on', text: `Memory adds ${fmt(memAlways)} tokens to every message: send only the facts a message is about?` });
    return out.sort((a, b) => b.saves - a.saves);
  }

  return { tok, clip, fmt, block, refName, ref, sliders, sceneCompact, sceneFull, words, localSummary, chatDigest, historyTokens, projectCompact, relevant, memoryLine, breakdown, fixes, SET_OFF, MEMORY_AUTO, memoryNotes, memoryBlock, memoryRelevant, standing, PLACES };
})();
if (typeof module !== 'undefined') module.exports = ContextCore; else window.ContextCore = ContextCore;
