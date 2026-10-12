// @ references (round 24, context): type @ in a chat box to attach exactly what a message needs, each with its token
// cost shown before you send: @chat (another chat as a short summary, never its history), @scene (a Lab scene's compact
// state: layers, order, blend, timing, sliders; no code), @board (the board's vibe), @file (a text file inline, any
// other file as its path), @render (a render as one line, or with its contact sheet) and @project (its notes and key
// facts). Nothing is attached unless you pick it; the chip says what it costs ("@scene · Orb · 180 tok"), and the
// message carries exactly that text (context-core.js ref()). `/refs` lists the kinds; `/ref <kind> [name]` attaches by command.
const ChatRefs = (() => {
  const C = ContextCore;
  const KINDS = [
    { k: 'chat', what: 'another chat, as a short summary' },
    { k: 'scene', what: 'a Lab scene: layers and sliders, no code' },
    { k: 'board', what: 'a board\'s vibe (never its media)' },
    { k: 'file', what: 'a text file inline, or a file\'s path' },
    { k: 'render', what: 'a render: one line, or its contact sheet' },
    { k: 'project', what: 'a project: notes and key facts' },
  ];
  const base = (p) => String(p || '').split(/[\\/]/).pop();
  const TEXTISH = /\.(txt|md|markdown|js|mjs|ts|tsx|jsx|json|csv|tsv|html?|css|glsl|frag|vert|py|xml|ya?ml|ini|log|sh|toml|svg)$/i;
  const INLINE_MAX = 60000; // characters (≈ 15k tokens): bigger text files go as a path the agent reads itself
  const agentOf = (id) => H.agent(id);

  // ---------- what each kind offers: [{ id, label, hint, build: async () => attachment | null }] ----------
  async function scenes() {
    let list = [];
    try { list = typeof ThreeLab !== 'undefined' && ThreeLab.scenes ? ThreeLab.scenes.all() : await window.hub.kvGet('three-sketches', []); } catch { list = []; }
    return (list || []).slice();
  }
  async function items(kind, agentId) {
    const chatId = H.activeChat?.[agentId] || null;
    const chat = chatId ? Native.current(agentId) : null;
    if (kind === 'chat') {
      const rows = (H.chats || []).filter((c) => c.id !== chatId).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)).slice(0, 40);
      return rows.map((c) => ({ id: c.id, label: c.title || 'Untitled', hint: `${agentOf(c.agentId)?.name || ''} chat`, build: async () => {
        const full = await Native.load(c.id);
        return full ? C.ref('chat', full.title, C.chatDigest(full, { agentName: agentOf(full.agentId)?.name })) : null;
      } }));
    }
    if (kind === 'scene') {
      const list = await scenes();
      const own = chatId && typeof ChatScenes !== 'undefined' ? ChatScenes.linkOf?.(chatId) : null;
      const cur = typeof ThreeLab !== 'undefined' ? ThreeLab.scenes?.currentId?.() : null;
      list.sort((a, b) => (b.id === own) - (a.id === own) || (b.id === cur) - (a.id === cur) || (b.updatedAt || 0) - (a.updatedAt || 0));
      return list.slice(0, 40).map((sk) => ({ id: sk.id, label: sk.name, hint: sk.id === own ? 'this chat\'s scene' : sk.id === cur ? 'on screen' : 'scene', build: async () => C.ref('scene', sk.name, C.sceneCompact(sk)) }));
    }
    if (kind === 'board') {
      await window.Lazy?.load('board').catch(() => {});
      if (typeof Board === 'undefined') return [];
      await Board.ready?.().catch(() => {});
      const linked = typeof ChatContext !== 'undefined' && chatId ? ChatContext.gather(chatId, chat)?.board?.id : null;
      const list = Board.boards().slice().sort((a, b) => (b.id === linked) - (a.id === linked));
      return list.slice(0, 30).map((b) => ({ id: b.id, label: b.name, hint: b.id === linked ? 'this chat\'s board' : `${b.count || 0} refs`, build: async () => {
        const full = await Board.load(b.id).catch(() => null);
        const vibe = full && typeof BoardDrawer !== 'undefined' ? BoardDrawer.vibeText({ board: full }) : '';
        return vibe ? C.ref('board', b.name, vibe) : null;
      } }));
    }
    if (kind === 'file') {
      // files this chat mentioned or was given, newest first, then the picker
      const seen = [];
      for (const m of [...(chat?.messages || [])].reverse()) {
        for (const p of String(m.sent || m.text || '').match(/(?:[A-Za-z]:\\|\/)(?:[^\s"'<>|*?\n]+[\\/])*[^\s"'<>|*?\n]+\.[A-Za-z0-9]{1,5}\b/g) || []) if (!seen.includes(p)) seen.push(p);
        if (seen.length >= 12) break;
      }
      return [{ id: '*pick', label: 'Choose a file…', hint: 'from disk', build: async () => {
        const paths = await window.hub.openDialog({ properties: ['openFile'], title: 'Attach a file (@file)' });
        return paths?.[0] ? fileRef(paths[0]) : null;
      } }, ...seen.map((p) => ({ id: p, label: base(p), hint: p.length > 50 ? `…${p.slice(-48)}` : p, build: () => fileRef(p) }))];
    }
    if (kind === 'render') {
      const list = typeof ChatAttach !== 'undefined' && ChatAttach.recentRenders ? await ChatAttach.recentRenders(10).catch(() => []) : [];
      return list.flatMap((x) => [
        { id: x.path, label: base(x.path), hint: 'one line (the path)', build: async () => C.ref('render', base(x.path), `Render ${x.path}${x.mtime ? ` (made ${new Date(x.mtime).toLocaleString()})` : ''}. Open or read frames of it with your tools when needed.`) },
        { id: `${x.path}#sheet`, label: `${base(x.path)} + contact sheet`, hint: 'a picture of its frames (≈ 1.6k tokens)', sheet: x.path },
      ]);
    }
    if (kind === 'project') {
      await window.Lazy?.load('projects').catch(() => {});
      if (typeof Projects === 'undefined') return [];
      await Projects.ready?.();
      const mine = chatId ? Projects.projectOfChat(chatId) : null;
      const list = Projects.live().slice().sort((a, b) => (b === mine) - (a === mine));
      return list.slice(0, 30).map((p) => ({ id: p.id, label: p.name, hint: p === mine ? 'this chat\'s project' : Projects.core.countText(p), build: async () => {
        const facts = typeof ChatMemory !== 'undefined' ? ChatMemory.factsOf('project', p.id) : [];
        return C.ref('project', p.name, C.projectCompact(p, { facts, counts: Projects.core.countText(p) }));
      } }));
    }
    return [];
  }
  async function fileRef(p) {
    const st = await window.hub.fs.stat(p).catch(() => null);
    const size = st?.size || 0;
    if (TEXTISH.test(p) && size && size <= INLINE_MAX) {
      const text = await window.hub.fs.read(p).catch(() => null);
      if (text != null) return C.ref('file', base(p), `${p}\n${text}`);
    }
    return C.ref('file', base(p), `File ${p}${size ? ` (${size > 1048576 ? `${(size / 1048576).toFixed(1)} MB` : `${Math.ceil(size / 1024)} KB`})` : ''}: open it with your tools if you need its contents.`);
  }

  // ---------- attaching ----------
  async function attach(agentId, row) {
    const v = Native.view(agentId);
    if (!v) return null;
    if (row.sheet) { await Native.attachPaths(agentId, [row.sheet]); return { name: base(row.sheet), tokens: 1600 }; }
    const a = await row.build();
    if (!a) { toast('Nothing to attach there', { timeout: 1600 }); return null; }
    // the same reference twice: replaced, not doubled
    const i = v.attachments.findIndex((x) => x.name === a.name);
    if (i >= 0) v.attachments.splice(i, 1, a); else v.attachments.push(a);
    Native.renderChips(agentId);
    return a;
  }
  // the attached references and what they add to the next message
  const pendingTokens = (agentId) => (Native.view(agentId)?.attachments || []).reduce((n, a) => n + (a.tokens || 0), 0);

  // ---------- the @ menu in the chat box ----------
  const wired = new WeakSet();
  const costCache = new Map(); // `${kind}|${id}` → { tokens, at }
  function wire(agentId) {
    const v = Native.view(agentId);
    const ta = v?.input;
    if (!ta || wired.has(ta)) return;
    wired.add(ta);
    let menu = null; let rows = []; let sel = 0; let seq = 0; let at = null; // at: { start, end, kind, query }
    const close = () => { menu?.remove(); menu = null; rows = []; at = null; };
    const find = () => {
      const pos = ta.selectionStart ?? ta.value.length;
      const before = ta.value.slice(0, pos);
      const m = before.match(/(^|\s)@([a-z]*)(?::([^\n@]*))?$/i);
      if (!m || ta.value.startsWith('/')) return null;
      return { start: pos - m[0].length + m[1].length, end: pos, kind: m[2].toLowerCase(), query: m[3] ?? null };
    };
    const draw = () => {
      if (!rows.length) { close(); return; }
      if (!menu) {
        menu = el('div', { class: 'slash-menu at-menu' });
        menu.addEventListener('mousedown', (e) => { const r = e.target.closest('.slash-item'); if (!r) return; e.preventDefault(); pick(rows[Number(r.dataset.i)]); });
        ta.parentElement.append(menu);
      }
      sel = Math.min(sel, rows.length - 1);
      menu.replaceChildren(el('div', { class: 'slash-head', text: at.query == null ? 'Attach exactly what this message needs' : `@${at.kind}` }),
        ...rows.map((r, i) => el('div', { class: `slash-item${i === sel ? ' sel' : ''}${r.kind ? ' cmd' : ''}`, dataset: { i: String(i) }, title: r.title || '' },
          el('b', { text: r.kind ? `@${r.kind}` : r.label }), el('span', { class: 'hint', text: r.cost != null ? `≈ ${C.fmt(r.cost)} tokens · ${r.hint}` : r.hint || '' }))),
        el('div', { class: 'slash-foot', text: at.query == null ? '↑↓ choose · Enter open · nothing is attached until you pick' : '↑↓ choose · Enter attach · its cost goes on the chip · Esc close' }));
    };
    const update = async () => {
      const my = ++seq;
      at = find();
      if (!at) { close(); return; }
      if (at.query == null) {
        rows = KINDS.filter((x) => x.k.startsWith(at.kind)).map((x) => ({ kind: x.k, hint: x.what }));
        sel = 0; draw(); return;
      }
      const kind = KINDS.find((x) => x.k === at.kind)?.k;
      if (!kind) { close(); return; }
      const q = at.query.trim().toLowerCase();
      const list = (await items(kind, agentId).catch(() => [])).filter((r) => !q || r.label.toLowerCase().includes(q) || String(r.hint).toLowerCase().includes(q)).slice(0, 10);
      if (my !== seq) return;
      rows = list.length ? list.map((r) => ({ ...r, cost: r.sheet ? 1600 : costCache.get(`${kind}|${r.id}`)?.tokens ?? null })) : [{ label: `No ${kind} matches`, hint: '', none: true }];
      sel = 0; draw();
      // the cost of each shown row, measured on the exact text it would attach (a file picker row has none)
      for (const r of rows) {
        if (r.none || r.sheet || r.cost != null || r.id === '*pick') continue;
        Promise.resolve().then(() => r.build()).then((a) => {
          if (!a || my !== seq) return;
          costCache.set(`${kind}|${r.id}`, { tokens: a.tokens, at: Date.now() });
          r.cost = a.tokens; r.built = a; draw();
        }).catch(() => {});
      }
    };
    const pick = async (r) => {
      if (!r || r.none || !at) return;
      if (r.kind) { // a kind: show its choices in place
        const t = `@${r.kind}:`;
        ta.setRangeText(t, at.start, at.end, 'end');
        ta.dispatchEvent(new Event('input'));
        return;
      }
      const { start, end } = at;
      close();
      ta.setRangeText('', start, end, 'end');
      ta.dispatchEvent(new Event('input'));
      const built = r.built;
      const a = await attach(agentId, built ? { ...r, build: async () => built } : r).catch((err) => { toast(err.message, { type: 'error' }); return null; });
      if (a) toast(`${a.name} attached · ≈ ${C.fmt(a.tokens)} tokens with this message (${C.fmt(pendingTokens(agentId))} attached in all)`, { timeout: 2200 });
      ta.focus();
    };
    ta.addEventListener('input', () => { update(); });
    ta.addEventListener('blur', () => setTimeout(() => { if (document.activeElement !== ta) close(); }, 150));
    // capture: before the chat box's own Enter (send) and the "/" menu
    ta.addEventListener('keydown', (e) => {
      if (!menu || !rows.length) return;
      if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); close(); return; }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault(); e.stopImmediatePropagation();
        sel = (sel + (e.key === 'ArrowDown' ? 1 : -1) + rows.length) % rows.length;
        menu.querySelectorAll('.slash-item').forEach((n, i) => n.classList.toggle('sel', i === sel));
        return;
      }
      if ((e.key === 'Enter' && !e.shiftKey) || e.key === 'Tab') { e.preventDefault(); e.stopImmediatePropagation(); pick(rows[sel]); }
    }, true);
  }
  const wireAll = () => { for (const a of H.agents().filter((x) => x.mode === 'native')) if (Native.hasView(a.id)) wire(a.id); };

  // ---------- commands ----------
  async function byCommand(args, ctx) {
    const [kind, ...rest] = String(args || '').trim().split(/\s+/);
    const k = KINDS.find((x) => x.k === (kind || '').toLowerCase().replace(/^@/, ''))?.k;
    if (!k) return `**@ references**: type @ in the chat box. ${KINDS.map((x) => `\`@${x.k}\` ${x.what}`).join(' · ')}. Each shows its token cost before you send; nothing is attached by default.`;
    if (!ctx.agentId || !Native.view(ctx.agentId)) return 'Open a chat first.';
    const q = rest.join(' ').toLowerCase();
    const list = await items(k, ctx.agentId);
    const r = list.find((x) => !x.sheet && x.id !== '*pick' && (!q || x.label.toLowerCase().includes(q))) || (k === 'file' && !q ? list[0] : null);
    if (!r) return `No ${k} matches “${q}”.`;
    const a = await attach(ctx.agentId, r);
    return a ? `Attached **${a.name}** · ≈ ${C.fmt(a.tokens)} tokens with your next message.` : undefined;
  }
  function register() {
    if (typeof Commands === 'undefined') return;
    const reg = (def) => { if (!Commands.get(def.name)) Commands.register({ area: 'Chat', ...def }); else console.warn(`chat-refs: /${def.name} exists`); };
    reg({
      name: 'ref', aliases: ['at-ref'], args: '[chat | scene | board | file | render | project] [name]',
      desc: 'Attach exactly what a message needs (@ in the chat box): a chat\'s summary, a scene\'s state, a board\'s vibe, a file, a render, a project; cost shown first',
      complete: (a) => { const w = a.trim().split(/\s+/); return w.length <= 1 ? KINDS.filter((x) => x.k.startsWith(w[0] || '')).map((x) => ({ value: x.k, hint: x.what })) : []; },
      examples: ['/ref scene', '/ref chat intro video', '/ref project'],
      run: byCommand,
    });
  }

  Native.hooks.render.push((agentId) => wire(agentId));
  if (document.readyState === 'loading') addEventListener('DOMContentLoaded', () => { wireAll(); register(); }); else { wireAll(); register(); }
  try { Keys.add({ area: 'Chat', keys: '@ in the chat box', what: 'attach a chat\'s summary, a scene, a board, a file, a render or a project (cost shown first)' }); } catch { /* keys.js not loaded */ }

  return { KINDS, items, attach, fileRef, pendingTokens, wire, byCommand };
})();
window.ChatRefs = ChatRefs;
