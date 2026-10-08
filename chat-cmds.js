// Chat commands: everything the native chat can do, typed as "/name args" in any chat box (see commands.js).
// Grouped by area for /help and the "/" menu. Nothing here adds to the system prompt: style commands
// (/tone, /persona, /lang) ride along once with your next message, and only when you ask for them.
const ChatCmds = (() => {
  const R = (def) => Commands.register(def);
  const nativeAgents = () => H.agents().filter((a) => a.mode === 'native');
  const fmt = (n) => Native.fmt(n);
  const plural = (n, one, many = `${one}s`) => `${n.toLocaleString()} ${n === 1 ? one : many}`;
  const clip = (t, n = 80) => { const s = String(t || '').replace(/[#*`>_|]/g, '').replace(/\s+/g, ' ').trim(); return s.length > n ? `${s.slice(0, n - 1)}…` : s; };
  // backticks would break the clickable `/command` spans in notes
  const safe = (t) => String(t || '').replace(/`/g, "'");
  const chatOf = (ctx) => Native.current(ctx.agentId);
  function need(ctx) {
    const chat = chatOf(ctx);
    if (!chat) throw new Error('No chat open yet: send a message first');
    return chat;
  }
  const busy = (chat) => chat && Native.isBusy(chat.id);
  const has = (q) => (s) => String(s || '').toLowerCase().includes(String(q || '').toLowerCase());
  function agentNamed(q) {
    const s = String(q || '').trim().toLowerCase();
    if (!s) return null;
    const all = nativeAgents();
    return all.find((a) => a.id.toLowerCase() === s || a.name.toLowerCase() === s)
      || all.find((a) => a.name.toLowerCase().startsWith(s))
      || (/^(gpt|chatgpt|codex|openai)$/.test(s) ? all.find((a) => a.engine === 'codex') : null)
      || (/^(claude|anthropic)$/.test(s) ? all.find((a) => a.engine === 'claude') : null);
  }
  const agentChoices = (args, except) => nativeAgents().filter((a) => a.id !== except && has(args)(a.name)).map((a) => ({ value: a.name, hint: `${a.engine === 'codex' ? 'ChatGPT' : 'Claude'}${a.dock ? ` · docked in ${a.dock}` : ''}` }));
  // "3" (1-based), "last", "-2" (from the end), "first"; role filters the candidates.
  function msgIndex(chat, arg, role) {
    const idxs = chat.messages.map((m, i) => i).filter((i) => !role || chat.messages[i].role === role);
    const a = String(arg || '').trim().toLowerCase().replace(/^#/, '');
    if (!idxs.length) return -1;
    if (!a || a === 'last') return idxs.at(-1);
    if (a === 'first') return idxs[0];
    if (/^-\d+$/.test(a)) return idxs.at(Number(a) - 1) ?? -1;
    if (/^\d+$/.test(a)) { const n = Number(a) - 1; return n >= 0 && n < chat.messages.length ? n : -1; }
    return -1;
  }
  function mustIndex(chat, arg, role) {
    const i = msgIndex(chat, arg, role);
    if (i < 0) throw new Error(arg ? `No message ${arg} (this chat has ${chat.messages.length})` : 'No such message yet');
    return i;
  }
  const chatLink = (c) => `\`/open ${c.id}\` ${safe(clip(c.title, 60))}${H.agent(c.agentId) ? ` · ${H.agent(c.agentId).name}` : ''}`;
  const chatChoices = (args, agentId) => H.chats.filter((c) => has(args)(c.title)).sort((a, b) => (a.agentId === agentId ? -1 : 0) - (b.agentId === agentId ? -1 : 0) || b.updatedAt - a.updatedAt)
    .slice(0, 12).map((c) => ({ value: c.id, label: clip(c.title, 50), hint: `${H.agent(c.agentId)?.name || ''} · ${timeAgo(c.updatedAt)}` }));
  const onOff = (args, current) => { const a = String(args || '').trim().toLowerCase(); if (/^(on|yes|true|1|show)$/.test(a)) return true; if (/^(off|no|false|0|hide)$/.test(a)) return false; return !current; };
  const ONOFF = [{ value: 'on' }, { value: 'off' }];
  const pick = (list) => (args) => list.filter((x) => has(args)(x.value || x)).map((x) => (typeof x === 'string' ? { value: x } : x));

  // ---------- undo for chat actions ----------
  const undos = [];
  function pushUndo(label, fn) { undos.push({ label, fn, at: Date.now() }); if (undos.length > 20) undos.shift(); }

  // =====================================================================================================
  // Chat: start, name, pin, delete, open, branch, tags
  // =====================================================================================================
  R({
    name: 'new', aliases: ['n', 'new-chat'], area: 'Chat', args: '[first message]', keys: 'Ctrl+N', desc: 'Start a new chat (and send the message, if you give one)',
    run: async (args, ctx) => { Native.newChat(ctx.agentId); if (args) await Native.send(ctx.agentId, args); },
  });
  R({
    name: 'rename', area: 'Chat', args: '[title]', desc: 'Rename this chat (no title: asks)',
    run: async (args, ctx) => {
      const chat = need(ctx);
      if (!args) { Native.renameCurrent(ctx.agentId); return; }
      const old = chat.title;
      await Native.rename(chat.id, args);
      pushUndo(`rename back to "${old}"`, () => Native.rename(chat.id, old));
      return `Renamed to **${safe(args.slice(0, 80))}** · \`/undo\``;
    },
  });
  // A title from the conversation itself: the main words of your first messages (free), or the agent's own (/title ai).
  const STOP = new Set('a an the and or but of to in on for with at by from is are was were be been it its this that these those i you we me my your our can could would should will please make let lets just some any how what why when where which who do does did not no yes so as if then than into about over under more less very also there here have has had get got want need like'.split(' '));
  function localTitle(chat) {
    const text = chat.messages.filter((m) => m.role === 'user').slice(0, 3).map((m) => m.text).join(' ').replace(/```[\s\S]*?```/g, ' ').replace(/https?:\/\/\S+/g, ' ');
    const words = (text.match(/[\p{L}\p{N}][\p{L}\p{N}'-]*/gu) || []).filter((w) => w.length > 2 && !STOP.has(w.toLowerCase()));
    const counts = new Map();
    words.forEach((w, i) => { const k = w.toLowerCase(); const c = counts.get(k) || { w, n: 0, first: i }; c.n += 1; counts.set(k, c); });
    const top = [...counts.values()].sort((a, b) => b.n - a.n || a.first - b.first).slice(0, 5).sort((a, b) => a.first - b.first).map((c) => c.w);
    const t = top.join(' ');
    return t ? t[0].toUpperCase() + t.slice(1) : null;
  }
  R({
    name: 'title', area: 'Chat', args: '[ai]', desc: 'Name this chat from its content (ai: let the agent write the title, one short extra call)',
    complete: pick([{ value: 'ai', hint: 'the agent writes it (costs one small call)' }]),
    run: async (args, ctx) => {
      const chat = need(ctx);
      const old = chat.title;
      let title;
      if (/^ai$/i.test(args)) {
        const convo = chat.messages.filter((m) => m.role === 'user' || m.role === 'assistant').slice(0, 6).map((m) => `${m.role}: ${m.text.slice(0, 400)}`).join('\n');
        const t = toast('Asking for a title…', { timeout: 30000 });
        const r = await window.hub.askOnce({ agentId: ctx.agentId, text: `Write a short title for this chat (max 6 words). Reply with the title only, no quotes.\n\n${convo}` });
        t?.remove();
        if (!r.ok) throw new Error(r.error || 'No answer');
        title = r.text.split('\n').find((l) => l.trim())?.replace(/^["'#*\s]+|["'*\s.]+$/g, '').slice(0, 80);
      } else title = localTitle(chat);
      if (!title) return 'Not enough words to make a title yet.';
      await Native.rename(chat.id, title);
      pushUndo(`rename back to "${old}"`, () => Native.rename(chat.id, old));
      return `Titled **${safe(title)}** · \`/undo\``;
    },
  });
  R({
    name: 'pin', area: 'Chat', desc: 'Pin this chat to the top of the list (again: unpin)',
    run: async (_a, ctx) => { const chat = need(ctx); await Native.togglePin(chat.id); toast(chat.pinned ? '📌 Pinned to the top' : 'Unpinned', { timeout: 1400 }); },
  });
  R({
    name: 'unpin', area: 'Chat', desc: 'Unpin this chat', hidden: true,
    run: async (_a, ctx) => { const chat = need(ctx); if (chat.pinned) await Native.togglePin(chat.id); },
  });
  R({
    name: 'delete', aliases: ['del'], area: 'Chat', desc: 'Move this chat to Recently deleted (30 days; /undo or the toast brings it back)',
    run: async (_a, ctx) => {
      const chat = need(ctx);
      const { id, agentId, title } = chat;
      await Native.remove(id);
      pushUndo(`restore "${title}"`, async () => { await window.hub.restoreChat(id); H.chats = await window.hub.listChats(); Panel.render(); Native.open(agentId, id); });
    },
  });
  R({
    name: 'restore', aliases: ['undelete'], area: 'Chat', args: '[title]', desc: 'Bring back a deleted chat (no title: the list)',
    complete: async (args) => (await window.hub.listChatTrash()).filter((c) => has(args)(c.title)).slice(0, 10).map((c) => ({ value: c.title, hint: `deleted ${timeAgo(c.deletedAt)}` })),
    run: async (args) => {
      const trash = await window.hub.listChatTrash();
      if (!args) {
        if (!trash.length) return 'Nothing in Recently deleted.';
        return `**Recently deleted** (kept 30 days)\n${trash.slice(0, 15).map((c) => `- \`/restore ${safe(c.title)}\` · ${timeAgo(c.deletedAt)}`).join('\n')}`;
      }
      const hit = trash.find((c) => c.title.toLowerCase() === args.toLowerCase()) || trash.find((c) => has(args)(c.title));
      if (!hit) return `No deleted chat matches “${args}”.`;
      await window.hub.restoreChat(hit.id);
      H.chats = await window.hub.listChats();
      Panel.render();
      Native.open(hit.agentId, hit.id);
      return `Restored **${safe(hit.title)}**`;
    },
  });
  R({
    name: 'undo', area: 'Chat', desc: 'Undo the last chat action (delete, rename, forget, clear draft…)',
    run: async () => {
      const u = undos.pop();
      if (!u) return 'Nothing to undo.';
      await u.fn();
      toast(`Undone: ${u.label}`, { timeout: 2000 });
    },
  });
  function cloneChat(chat, { title, agentId = chat.agentId, upTo = chat.messages.length - 1 } = {}) {
    const now = Date.now();
    return {
      ...JSON.parse(JSON.stringify(chat)),
      id: `${agentId}-${now.toString(36)}`, agentId, title: title || `${chat.title} (copy)`, createdAt: now, updatedAt: now,
      session: {}, continuedFrom: `"${chat.title}"`, pinned: false,
      messages: chat.messages.slice(0, upTo + 1).map((m) => ({ ...m, lastReply: undefined })),
    };
  }
  R({
    name: 'duplicate', aliases: ['dup', 'copy-chat'], area: 'Chat', desc: 'Make a copy of this chat (the copy continues on its own)',
    run: async (_a, ctx) => { const chat = need(ctx); const copy = Native.adopt(cloneChat(chat)); return `Copied to **${safe(copy.title)}**`; },
  });
  R({
    name: 'branch', aliases: ['fork'], area: 'Chat', args: '[message #]', desc: 'New chat from a message (default: the last), to try another direction',
    run: async (args, ctx) => { const chat = need(ctx); Native.branch(ctx.agentId, mustIndex(chat, args)); },
  });
  R({
    name: 'open', aliases: ['o', 'goto-chat'], area: 'Chat', args: '<chat>', desc: 'Open a chat by its title (any agent)',
    complete: (args, ctx) => chatChoices(args, ctx.agentId),
    run: async (args, ctx) => {
      if (!args) { document.getElementById('chat-search')?.focus(); return; }
      const c = H.chats.find((x) => x.id === args) || H.chats.find((x) => x.title.toLowerCase() === args.toLowerCase())
        || H.chats.filter((x) => has(args)(x.title)).sort((a, b) => (a.agentId === ctx.agentId ? -1 : 0) - (b.agentId === ctx.agentId ? -1 : 0) || b.updatedAt - a.updatedAt)[0];
      if (!c) return `No chat called “${args}”. Try \`/search ${safe(args)}\` to look inside messages.`;
      Native.open(c.agentId, c.id);
    },
  });
  R({
    name: 'recent', aliases: ['chats', 'history'], area: 'Chat', args: '[agent | n]', desc: 'Your latest chats (click one to open it)',
    complete: (args) => agentChoices(args),
    run: (args) => {
      const agent = agentNamed(args);
      const n = /^\d+$/.test(args) ? Math.min(50, Number(args)) : 12;
      const list = H.chats.filter((c) => !agent || c.agentId === agent.id).slice(0, n);
      if (!list.length) return 'No chats yet.';
      return `**Recent chats${agent ? ` with ${agent.name}` : ''}**\n${list.map((c) => `- ${chatLink(c)} · ${timeAgo(c.updatedAt)}${H.unreadChats?.has(c.id) ? ' · **new**' : ''}`).join('\n')}`;
    },
  });
  R({
    name: 'pins', aliases: ['pinned'], area: 'Chat', desc: 'Pinned chats, and the messages pinned in this chat',
    run: (_a, ctx) => {
      const chats = H.chats.filter((c) => c.pinned);
      const chat = chatOf(ctx);
      const msgs = (chat?.messages || []).map((m, i) => ({ m, i })).filter((x) => x.m.pinnedMsg);
      const out = [];
      out.push(chats.length ? `**Pinned chats**\n${chats.map((c) => `- ${chatLink(c)}`).join('\n')}` : 'No pinned chats (`/pin` pins this one).');
      if (msgs.length) out.push(`**Pinned in this chat**\n${msgs.map((x) => `- \`/jump ${x.i + 1}\` ${safe(clip(x.m.text))}`).join('\n')}`);
      return out.join('\n\n');
    },
  });
  // next / previous chat of this agent, in the list's order
  const siblings = (ctx) => H.chats.filter((c) => c.agentId === ctx.agentId).sort((a, b) => (b.pinned - a.pinned) || (b.updatedAt - a.updatedAt));
  for (const [name, dir, desc] of [['next-chat', 1, 'Open the next chat of this agent (older)'], ['prev-chat', -1, 'Open the previous chat of this agent (newer)']]) {
    R({
      name, area: 'Chat', desc,
      run: (_a, ctx) => {
        const list = siblings(ctx);
        if (!list.length) return 'No chats yet.';
        const i = list.findIndex((c) => c.id === H.activeChat[ctx.agentId]);
        const next = list[(i + dir + list.length) % list.length];
        Native.open(ctx.agentId, next.id);
      },
    });
  }
  R({
    name: 'unread', area: 'Chat', desc: 'Chats with replies you have not seen yet',
    run: () => {
      const list = H.chats.filter((c) => H.unreadChats?.has(c.id));
      return list.length ? `**Unread replies**\n${list.map((c) => `- ${chatLink(c)}`).join('\n')}\n\n\`/mark-read\` clears them.` : 'You have seen every reply.';
    },
  });
  R({
    name: 'mark-read', aliases: ['read-all'], area: 'Chat', desc: 'Clear every unread mark',
    run: () => { const n = H.unreadChats?.size || 0; H.unreadChats?.clear(); H.unread?.clear(); renderRail(); Panel.render(); return n ? `Cleared ${plural(n, 'unread chat')}.` : 'Nothing unread.'; },
  });
  R({
    name: 'mark-unread', area: 'Chat', desc: 'Mark this chat unread (a dot in the list until you open it again)',
    run: (_a, ctx) => { const chat = need(ctx); H.unreadChats.add(chat.id); Panel.render(); toast('Marked unread', { timeout: 1200 }); },
  });
  R({
    name: 'tag', area: 'Chat', args: '<tag>', desc: 'Tag this chat (filter the list with /filter tag:<tag>)',
    complete: (args) => ChatUX.allTags().filter(has(args)).map((t) => ({ value: t })),
    run: (args, ctx) => {
      const chat = need(ctx);
      const tags = args.split(/[,\s]+/).map((t) => t.replace(/^#/, '').trim().toLowerCase()).filter(Boolean);
      if (!tags.length) return Commands.run('tags', '', ctx.agentId);
      const m = ChatUX.setMeta(chat.id, { tags: [...new Set([...(ChatUX.metaOf(chat.id).tags || []), ...tags])] });
      return `Tags: ${m.tags.map((t) => `#${t}`).join(' ')}`;
    },
  });
  R({
    name: 'untag', area: 'Chat', args: '<tag | all>', desc: 'Remove a tag from this chat',
    complete: (args, ctx) => [...(ChatUX.metaOf(H.activeChat[ctx.agentId]).tags || []), 'all'].filter(has(args)).map((t) => ({ value: t })),
    run: (args, ctx) => {
      const chat = need(ctx);
      const drop = args.replace(/^#/, '').trim().toLowerCase();
      const tags = drop === 'all' || !drop ? [] : (ChatUX.metaOf(chat.id).tags || []).filter((t) => t !== drop);
      ChatUX.setMeta(chat.id, { tags });
      return tags.length ? `Tags: ${tags.map((t) => `#${t}`).join(' ')}` : 'No tags on this chat.';
    },
  });
  R({
    name: 'tags', area: 'Chat', desc: 'This chat\'s tags and folder, and every tag in use',
    run: (_a, ctx) => {
      const chat = chatOf(ctx);
      const m = chat ? ChatUX.metaOf(chat.id) : {};
      const all = ChatUX.allTags();
      return [
        chat ? `This chat: ${m.tags?.length ? m.tags.map((t) => `#${t}`).join(' ') : 'no tags'}${m.folder ? ` · folder **${safe(m.folder)}**` : ''}` : null,
        all.length ? `All tags: ${all.map((t) => `\`/filter tag:${t}\``).join(' ')}` : 'No tags yet: `/tag <name>` adds one.',
        ChatUX.allFolders().length ? `Folders: ${ChatUX.allFolders().map((f) => `\`/filter folder:${safe(f)}\``).join(' ')}` : null,
      ].filter(Boolean).join('\n\n');
    },
  });
  R({
    name: 'folder', aliases: ['move-to'], area: 'Chat', args: '<name | none>', desc: 'Put this chat in a folder (the chat list groups by folder)',
    complete: (args) => [...ChatUX.allFolders(), 'none'].filter(has(args)).map((f) => ({ value: f })),
    run: (args, ctx) => {
      const chat = need(ctx);
      const folder = /^(none|-)$/i.test(args) ? '' : args.trim().slice(0, 40);
      if (!args) return `This chat is ${ChatUX.metaOf(chat.id).folder ? `in **${safe(ChatUX.metaOf(chat.id).folder)}**` : 'in no folder'}.`;
      ChatUX.setMeta(chat.id, { folder });
      return folder ? `Moved to folder **${safe(folder)}**` : 'Removed from its folder';
    },
  });
  const FILTERS = [{ value: 'all', hint: 'show everything' }, { value: 'pinned' }, { value: 'today' }, { value: 'week', hint: 'last 7 days' }, { value: 'unread' }, { value: 'busy', hint: 'answering now' }, { value: 'archived', hint: 'chats you archived' }];
  R({
    name: 'filter', area: 'Chat', args: '<pinned | today | unread | archived | tag:x | folder:x | agent | all>', desc: 'Filter the chat list',
    complete: (args) => [...FILTERS, ...ChatUX.allTags().map((t) => ({ value: `tag:${t}` })), ...ChatUX.allFolders().map((f) => ({ value: `folder:${f}` })), ...nativeAgents().map((a) => ({ value: a.name, hint: 'only this agent' }))].filter((x) => has(args)(x.value)),
    run: (args) => {
      const f = args.trim();
      Panel.setView(!f || /^all$/i.test(f) ? null : f);
      if (!H.panelOpen) { H.panelOpen = true; applyLayout(); }
      return null;
    },
  });
  R({
    name: 'import', area: 'Chat', desc: 'Import one chat from a JSON file (made with /export json) or a Markdown file',
    run: async (_a, ctx) => {
      const [file] = await window.hub.openDialog({ properties: ['openFile'], title: 'Import a chat', filters: [{ name: 'Chat (JSON or Markdown)', extensions: ['json', 'md', 'markdown', 'txt'] }] }) || [];
      if (!file) return;
      const text = await window.hub.fs.read(file, { maxBytes: 20 * 1024 * 1024 });
      const now = Date.now();
      let chat;
      if (/\.json$/i.test(file)) {
        const data = JSON.parse(text);
        if (!Array.isArray(data.messages)) throw new Error('That JSON has no messages');
        chat = { ...data, id: `${ctx.agentId}-${now.toString(36)}`, agentId: ctx.agentId, session: {}, createdAt: data.createdAt || now, updatedAt: now, continuedFrom: data.title ? `"${data.title}" (imported)` : 'an imported chat' };
      } else {
        // "**You:**" / "**Name:**" blocks, as /export md writes them
        const parts = text.split(/\n(?=\*\*[^*\n]{1,40}:\*\*\s*\n)/);
        const title = (text.match(/^#\s+(.+)/m)?.[1] || file.split(/[\\/]/).pop().replace(/\.\w+$/, '')).trim();
        const messages = [];
        for (const part of parts) {
          const m = part.match(/^\*\*([^*\n]{1,40}):\*\*\s*\n([\s\S]*)$/);
          if (!m) continue;
          messages.push({ role: /^you$/i.test(m[1]) ? 'user' : 'assistant', text: m[2].replace(/\n+---\s*$/, '').trim(), at: now });
        }
        if (!messages.length) messages.push({ role: 'user', text: text.slice(0, 200000), at: now });
        chat = { id: `${ctx.agentId}-${now.toString(36)}`, agentId: ctx.agentId, title, createdAt: now, updatedAt: now, session: {}, messages, continuedFrom: 'an imported file' };
      }
      Native.adopt(chat);
      return `Imported **${safe(chat.title)}** (${plural(chat.messages.length, 'message')}). Your next message sends it along as context.`;
    },
  });

  // =====================================================================================================
  // Messages: find, jump, fold, retry, edit, copy, read aloud, marks, quick rewrites
  // =====================================================================================================
  R({
    name: 'find', aliases: ['f'], area: 'Messages', args: '[text]', keys: 'Alt+F', desc: 'Find in this chat: every match highlighted, Enter for the next',
    run: (args, ctx) => { need(ctx); const f = ChatUX.find(ctx.agentId, args || null); return f && args && !f.hits.length ? `“${args}” isn't in this chat. Try \`/search ${safe(args)}\` for every chat.` : null; },
  });
  R({
    name: 'search', aliases: ['grep', 'search-all'], area: 'Messages', args: '<text>', desc: 'Search inside every chat\'s messages',
    run: async (args) => {
      if (!args || args.length < 2) return 'Type at least 2 letters: `/search <text>`';
      const hits = await window.hub.searchChatText(args);
      if (!hits.length) return `Nothing found for “${args}”.`;
      return `**${plural(hits.length, 'chat')} mention “${safe(args)}”**\n${hits.slice(0, 15).map((h) => `- ${chatLink(h)} · ${plural(h.count, 'hit')}${h.snippet ? `\n  ${safe(clip(h.snippet, 120))}` : ''}`).join('\n')}${hits.length > 15 ? `\n\n…and ${hits.length - 15} more (Ctrl+K, then ?${safe(args)})` : ''}`;
    },
  });
  R({
    name: 'jump', aliases: ['j', 'goto'], area: 'Messages', args: '<# | top | bottom | first | last | mine | reply | pin | bookmark | new>', desc: 'Scroll to a message (numbers are shown on hover)',
    complete: pick([{ value: 'top' }, { value: 'bottom' }, { value: 'last', hint: 'the last message' }, { value: 'mine', hint: 'your last message' }, { value: 'reply', hint: 'the last reply' }, { value: 'pin', hint: 'next pinned message' }, { value: 'bookmark' }, { value: 'new', hint: 'where unread replies start' }]),
    run: (args, ctx) => {
      const chat = need(ctx);
      const v = Native.view(ctx.agentId);
      const a = args.trim().toLowerCase();
      if (!a || a === 'bottom' || a === 'end') { v.list.scrollTop = v.list.scrollHeight; return; }
      if (a === 'top' || a === 'start') { v.list.scrollTop = 0; return; }
      if (a === 'new') { const s = v.list.querySelector('.new-sep'); if (!s) return 'No unread replies here.'; s.scrollIntoView({ block: 'start' }); return; }
      const roleOf = { mine: 'user', me: 'user', reply: 'assistant' }[a];
      if (roleOf) { Native.jumpTo(ctx.agentId, mustIndex(chat, 'last', roleOf)); return; }
      if (a === 'pin' || a === 'bookmark') {
        const key = a === 'pin' ? 'pinnedMsg' : 'bookmark';
        const idxs = chat.messages.map((m, i) => (m[key] ? i : -1)).filter((i) => i >= 0);
        if (!idxs.length) return `No ${a === 'pin' ? 'pinned' : 'bookmarked'} message here.`;
        const top = v.list.scrollTop;
        const next = idxs.find((i) => (v.list.querySelector(`.msg[data-index="${i}"]`)?.offsetTop || 0) > top + 40) ?? idxs[0];
        Native.jumpTo(ctx.agentId, next);
        return;
      }
      if (!Native.jumpTo(ctx.agentId, mustIndex(chat, a))) return `Message ${a} isn't shown (it may be inside a compacted part).`;
    },
  });
  R({ name: 'top', area: 'Messages', desc: 'Scroll to the first message', hidden: true, run: (_a, ctx) => Commands.run('jump', 'top', ctx.agentId) });
  R({ name: 'bottom', aliases: ['latest'], area: 'Messages', desc: 'Scroll to the latest message', hidden: true, run: (_a, ctx) => Commands.run('jump', 'bottom', ctx.agentId) });
  R({
    name: 'fold', area: 'Messages', args: '[# | all]', desc: 'Fold long replies (all, or one)',
    run: (args, ctx) => {
      const chat = need(ctx);
      if (!args || args === 'all') { Native.foldAll(ctx.agentId, true); return; }
      const i = mustIndex(chat, args);
      const node = Native.view(ctx.agentId).list.querySelector(`.msg[data-index="${i}"]`);
      if (node && !node.classList.contains('collapsed')) node.querySelector('[data-msg-act="fold"]')?.click() || (node.classList.add('collapsed'), node.append(el('button', { class: 'show-more-msg msg-act', text: 'Show full reply', dataset: { msgAct: 'more' } })));
    },
  });
  R({
    name: 'unfold', aliases: ['expand'], area: 'Messages', args: '[# | all]', desc: 'Show long replies in full (all, or one)',
    run: (args, ctx) => {
      const chat = need(ctx);
      if (!args || args === 'all') { Native.foldAll(ctx.agentId, false); return; }
      const i = mustIndex(chat, args);
      Native.view(ctx.agentId).list.querySelector(`.msg[data-index="${i}"] [data-msg-act="more"]`)?.click();
      Native.jumpTo(ctx.agentId, i);
    },
  });
  for (const [name, fold] of [['fold-code', true], ['unfold-code', false]]) {
    R({
      name, area: 'Messages', desc: fold ? 'Fold every long code block in this chat' : 'Show every code block in full',
      run: (_a, ctx) => {
        const list = Native.view(ctx.agentId)?.list;
        let n = 0;
        for (const pre of list?.querySelectorAll('.msg .body pre') || []) {
          const lines = pre.querySelector('code').textContent.split('\n').length;
          if (fold && lines > 12 && !pre.classList.contains('code-folded')) { pre.classList.add('code-folded'); if (!pre.querySelector('.code-unfold')) pre.append(el('button', { class: 'code-unfold', text: `Show all ${lines} lines`, dataset: { act: 'unfold' } })); n += 1; }
          if (!fold && pre.classList.contains('code-folded')) { pre.classList.remove('code-folded'); pre.querySelector('.code-unfold')?.remove(); n += 1; }
        }
        toast(n ? `${fold ? 'Folded' : 'Unfolded'} ${plural(n, 'code block')}` : 'No code block to change', { timeout: 1200 });
      },
    });
  }
  R({
    name: 'thinking', aliases: ['thoughts', 'think'], area: 'Messages', args: '[open | close | always | never | show | hide]', keys: 'Alt+T', desc: 'Open or close every “Thought process” block; always: keep them open',
    complete: pick([{ value: 'open' }, { value: 'close' }, { value: 'always', hint: 'finished thinking starts open' }, { value: 'never', hint: 'finished thinking starts folded (default)' }, { value: 'hide', hint: 'this agent stops streaming its thinking' }, { value: 'show', hint: 'this agent streams its thinking (default)' }, { value: 'copy', hint: 'copy the last thinking' }]),
    run: async (args, ctx) => {
      const a = args.trim().toLowerCase();
      if (a === 'always' || a === 'never') { store.set('chat.thinkingOpen', a === 'always'); Native.refresh(ctx.agentId, { keepScroll: true }); return a === 'always' ? 'Thinking blocks now start open.' : 'Thinking blocks start folded.'; }
      if (a === 'hide' || a === 'show') {
        const agent = H.agent(ctx.agentId);
        agent.showThinking = a === 'show' ? undefined : false;
        await saveConfig();
        return a === 'show' ? `${agent.name} streams its thinking again (summarized).` : `${agent.name} no longer streams its thinking (slightly fewer tokens).`;
      }
      if (a === 'copy') {
        const m = [...(need(ctx).messages)].reverse().find((x) => x.thinking);
        if (!m) return 'No thinking in this chat.';
        await copyText(m.thinking, 'Thinking copied');
        return;
      }
      const n = Native.toggleThinking(ctx.agentId, a === 'open' ? true : a === 'close' ? false : undefined);
      return n ? null : null;
    },
  });
  R({
    name: 'retry', aliases: ['regenerate', 'again'], area: 'Messages', args: '[model]', desc: 'Write the last reply again (optionally with another model)',
    complete: (args, ctx) => (Native.MODEL_CHOICES[H.agent(ctx.agentId)?.engine] || []).filter(has(args)).map((m) => ({ value: m })),
    run: async (args, ctx) => {
      const chat = need(ctx);
      if (busy(chat)) throw new Error('Still answering: /stop first');
      if (args) await Native.setModel(ctx.agentId, args);
      await Native.retry(ctx.agentId);
    },
  });
  R({
    name: 'edit', area: 'Messages', args: '[#]', keys: '↑ in an empty box', desc: 'Edit one of your messages and resend it (default: your last)',
    run: (args, ctx) => { const chat = need(ctx); Native.edit(ctx.agentId, args ? mustIndex(chat, args) : mustIndex(chat, 'last', 'user')); },
  });
  R({
    name: 'quote', aliases: ['reply'], area: 'Messages', args: '[#]', desc: 'Quote a message in your next one (default: the last reply)',
    run: (args, ctx) => { const chat = need(ctx); Native.quote(ctx.agentId, args ? mustIndex(chat, args) : mustIndex(chat, 'last', 'assistant')); },
  });
  R({
    name: 'continue', aliases: ['go-on', 'more'], area: 'Messages', desc: 'Ask it to continue where the reply stopped',
    run: (_a, ctx) => { need(ctx); ctx.send('Continue exactly where you stopped.'); },
  });
  // copy: last reply, code blocks, everything, one message, the thinking
  function codeBlocks(chat) {
    const out = [];
    chat.messages.forEach((m, i) => {
      if (m.role !== 'assistant') return;
      for (const b of m.text.matchAll(/```([\w+-]*)\n([\s\S]*?)```/g)) out.push({ index: i, lang: b[1] || 'text', code: b[2].replace(/\n$/, '') });
    });
    return out;
  }
  R({
    name: 'copy', aliases: ['cp'], area: 'Messages', args: '[last | code [n] | all | # | thinking | mine]', keys: 'Ctrl+Shift+C', desc: 'Copy the last reply, its code, a message, or the whole chat',
    complete: pick([{ value: 'last', hint: 'the last reply' }, { value: 'code', hint: 'the last code block' }, { value: 'all', hint: 'the chat as Markdown' }, { value: 'thinking' }, { value: 'mine', hint: 'your last message' }]),
    run: async (args, ctx) => {
      const chat = need(ctx);
      const [what, n] = args.trim().toLowerCase().split(/\s+/);
      if (!what || what === 'last') { Native.copyLastReply(ctx.agentId); return; }
      if (what === 'all') { await copyText(Native.chatMarkdown(chat), 'Chat copied as Markdown'); return; }
      if (what === 'mine') { await copyText(chat.messages[mustIndex(chat, 'last', 'user')].text, 'Your last message copied'); return; }
      if (what === 'thinking') return Commands.run('thinking', 'copy', ctx.agentId);
      if (what === 'code') {
        const blocks = codeBlocks(chat);
        if (!blocks.length) return 'No code blocks in this chat.';
        const b = n ? blocks[Number(n) - 1] : blocks.at(-1);
        if (!b) return `There are ${blocks.length} code blocks (\`/code\` lists them).`;
        await copyText(b.code, `Code copied (${b.lang}, ${b.code.split('\n').length} lines)`);
        return;
      }
      await copyText(chat.messages[mustIndex(chat, what)].text, 'Message copied');
    },
  });
  R({
    name: 'code', aliases: ['snippets-in-chat'], area: 'Messages', args: '[n] [copy | save | lab | nodes | insert]', desc: 'List the code blocks in this chat, or act on one',
    complete: pick([{ value: '1 copy' }, { value: '1 save' }, { value: '1 lab', hint: 'open in Three.js Lab' }, { value: '1 nodes', hint: 'open in the node view' }, { value: '1 insert', hint: 'into your message' }]),
    run: async (args, ctx) => {
      const chat = need(ctx);
      const blocks = codeBlocks(chat);
      if (!blocks.length) return 'No code blocks in this chat.';
      const [n, act = 'copy'] = args.trim().split(/\s+/);
      if (!n) return `**${plural(blocks.length, 'code block')}**\n${blocks.map((b, i) => `- \`/code ${i + 1} copy\` ${b.lang} · ${plural(b.code.split('\n').length, 'line')} · message #${b.index + 1} · ${safe(clip(b.code.split('\n').find((l) => l.trim()), 50))}`).join('\n')}`;
      const b = blocks[Number(n) - 1] || (n === 'last' ? blocks.at(-1) : null);
      if (!b) return `No code block ${n}.`;
      if (act === 'copy') await copyText(b.code, 'Code copied');
      else if (act === 'save') { const ext = { js: 'js', javascript: 'js', python: 'py', py: 'py', html: 'html', css: 'css', json: 'json', glsl: 'glsl', bash: 'sh', sh: 'sh', md: 'md' }[b.lang.toLowerCase()] || 'txt'; const p = await window.hub.saveFile({ defaultPath: `snippet.${ext}`, content: b.code }); if (p) toast(`Saved ${p.split(/[\\/]/).pop()}`, { action: { label: 'Show', fn: () => window.hub.fs.reveal(p) } }); }
      else if (act === 'lab') { if (typeof ThreeLab === 'undefined') throw new Error('The Three.js Lab isn\'t available'); ThreeLab.openCode(b.code); }
      else if (act === 'nodes') { if (!window.NodeView?.openCode) throw new Error('The node view isn\'t installed'); window.NodeView.openCode(b.code, b.lang); }
      else if (act === 'insert') Native.insertDraft(ctx.agentId, `\`\`\`${b.lang}\n${b.code}\n\`\`\`\n`);
      else return 'Use copy, save, lab, nodes or insert.';
    },
  });
  R({
    name: 'links', area: 'Messages', desc: 'Every link in this chat',
    run: (_a, ctx) => {
      const chat = need(ctx);
      const links = [...new Set(chat.messages.flatMap((m) => m.text.match(/https?:\/\/[^\s<>)"'`\]]+/g) || []))];
      return links.length ? `**${plural(links.length, 'link')}**\n${links.map((l) => `- ${l}`).join('\n')}` : 'No links in this chat.';
    },
  });
  R({
    name: 'files', aliases: ['attachments'], area: 'Messages', desc: 'Files and pictures attached in this chat',
    run: (_a, ctx) => {
      const chat = need(ctx);
      const files = chat.messages.flatMap((m, i) => (m.attachments || []).map((a) => ({ ...a, i })));
      return files.length ? `**${plural(files.length, 'attachment')}**\n${files.map((f) => `- ${f.kind === 'image' ? '🖼' : '📄'} ${safe(f.name)} · \`/jump ${f.i + 1}\``).join('\n')}` : 'Nothing attached in this chat.';
    },
  });
  // marks on messages
  R({
    name: 'pin-msg', aliases: ['pinmsg', 'pin-message'], area: 'Messages', args: '[#]', desc: 'Pin a message (default: the last reply); pinned ones show in a strip on top',
    run: (args, ctx) => { const chat = need(ctx); const i = args ? mustIndex(chat, args) : mustIndex(chat, 'last', 'assistant'); const on = Native.toggleMark(ctx.agentId, i, 'pinnedMsg'); return on ? `📌 Pinned message #${i + 1}` : `Unpinned message #${i + 1}`; },
  });
  R({
    name: 'bookmark', aliases: ['bm'], area: 'Messages', args: '[#]', desc: 'Bookmark a message (default: the last reply); /bookmarks lists them across chats',
    run: (args, ctx) => { const chat = need(ctx); const i = args ? mustIndex(chat, args) : mustIndex(chat, 'last', 'assistant'); const on = Native.toggleMark(ctx.agentId, i, 'bookmark'); return on ? `🔖 Bookmarked message #${i + 1} · \`/bookmarks\`` : `Bookmark removed from #${i + 1}`; },
  });
  R({
    name: 'bookmarks', aliases: ['bms'], area: 'Messages', desc: 'Your bookmarked messages in every chat',
    run: async () => {
      const list = (await ChatUX.loadBookmarks()).filter((b) => H.chats.some((c) => c.id === b.chatId));
      if (!list.length) return 'No bookmarks yet: `/bookmark` marks the last reply.';
      return `**🔖 Bookmarks**\n${list.slice(0, 25).map((b) => `- \`/open ${b.chatId}\` ${safe(clip(b.title, 40))} #${b.index + 1}: ${safe(clip(b.text, 90))}`).join('\n')}`;
    },
  });
  R({
    name: 'react', aliases: ['feedback-on'], area: 'Messages', args: '<👍 | 👎 | ❤️ | 🔥 | 🤔> [note]', desc: 'React to the last reply, with an optional feedback note (kept, not sent)',
    complete: (args) => Native.REACTIONS.map((e) => ({ value: e })).filter((x) => !args || x.value.startsWith(args.trim().slice(0, 2))),
    run: (args, ctx) => {
      const chat = need(ctx);
      const words = { up: '👍', good: '👍', yes: '👍', down: '👎', bad: '👎', no: '👎', love: '❤️', heart: '❤️', fire: '🔥', hot: '🔥', hmm: '🤔', think: '🤔' };
      const [first, ...rest] = args.trim().split(/\s+/);
      const emoji = words[first?.toLowerCase()] || (Native.REACTIONS.includes(first) ? first : null);
      if (!emoji) return `React with ${Native.REACTIONS.join(' ')} (or up / down / love / fire / hmm).`;
      const i = mustIndex(chat, 'last', 'assistant');
      Native.react(ctx.agentId, i, emoji, rest.join(' ') || undefined);
    },
  });
  R({
    name: 'feedback', aliases: ['reactions'], area: 'Messages', desc: 'Your reactions and feedback notes in this chat',
    run: (_a, ctx) => {
      const chat = need(ctx);
      const list = chat.messages.map((m, i) => ({ m, i })).filter((x) => x.m.reaction);
      return list.length ? `**Your feedback**\n${list.map((x) => `- ${x.m.reaction.emoji} \`/jump ${x.i + 1}\` ${safe(clip(x.m.text, 60))}${x.m.reaction.note ? ` — *${safe(x.m.reaction.note)}*` : ''}`).join('\n')}` : 'No reactions yet: `/react 👍 great colors`.';
    },
  });
  R({
    name: 'unmark', area: 'Messages', args: '[# | all]', desc: 'Clear pins, bookmarks and reactions from a message (or all)',
    run: (args, ctx) => {
      const chat = need(ctx);
      const idxs = args === 'all' ? chat.messages.map((_, i) => i) : [args ? mustIndex(chat, args) : mustIndex(chat, 'last', 'assistant')];
      for (const i of idxs) { const m = chat.messages[i]; delete m.pinnedMsg; delete m.bookmark; delete m.reaction; }
      Native.save(chat);
      Native.refresh(ctx.agentId, { keepScroll: true });
    },
  });
  R({
    name: 'read', aliases: ['speak', 'say-it'], area: 'Messages', args: '[# | last | stop | rate <0.5-2> | voice <name> | auto on|off]', desc: 'Read a reply aloud with the system voice',
    complete: (args) => {
      if (/^voice\s/i.test(args)) return speechSynthesis.getVoices().filter((v) => has(args.slice(6))(v.name)).slice(0, 12).map((v) => ({ value: `voice ${v.name}`, label: v.name, hint: v.lang }));
      return pick([{ value: 'last' }, { value: 'stop' }, { value: 'rate 1.25' }, { value: 'voice ' }, { value: 'auto on', hint: 'read every new reply here' }, { value: 'auto off' }])(args);
    },
    run: (args, ctx) => {
      const a = args.trim();
      if (/^stop$/i.test(a)) { Native.stopSpeaking(); return; }
      if (/^rate\b/i.test(a)) { const r = Math.min(2, Math.max(0.5, Number(a.split(/\s+/)[1]) || 1)); store.set('chat.readRate', r); return `Reading speed ${r}×`; }
      if (/^voice\b/i.test(a)) {
        const name = a.slice(5).trim();
        if (!name) { store.set('chat.readVoice', ''); return 'Using the system\'s default voice.'; }
        const v = speechSynthesis.getVoices().find((x) => x.name.toLowerCase() === name.toLowerCase()) || speechSynthesis.getVoices().find((x) => has(name)(x.name));
        if (!v) return `No voice called “${name}”.`;
        store.set('chat.readVoice', v.name);
        return `Voice: ${v.name}`;
      }
      if (/^auto\b/i.test(a)) { const on = onOff(a.slice(4), store.get('chat.autoRead', false)); store.set('chat.autoRead', on); return on ? 'New replies are read aloud as they arrive (in the chat you look at).' : 'New replies are no longer read aloud.'; }
      const chat = need(ctx);
      Native.speakMessage(ctx.agentId, a ? mustIndex(chat, a) : mustIndex(chat, 'last', 'assistant'));
    },
  });
  R({
    name: 'review', aliases: ['self-check'], area: 'Messages', desc: 'Ask it to check its own last result critically and fix what\'s wrong',
    run: async (_a, ctx) => { need(ctx); await Native.review(ctx.agentId); },
  });
  R({
    name: 'opinion-chat', aliases: ['2nd'], area: 'Messages', desc: 'Astra judges the last reply (with a screenshot for docked tools)',
    run: async (_a, ctx) => { need(ctx); if (!Native.astraAgent() || Native.astraAgent().id === ctx.agentId) return 'There is no other ChatGPT agent to ask.'; await Native.secondOpinion(ctx.agentId); },
  });
  // quick follow-ups: short prompts about the last reply (sent as your message)
  const QUICK = [
    ['shorter', 'Say that again, much shorter.', 'Ask for a shorter version of the last reply'],
    ['simpler', 'Explain that again more simply, as if I were new to it.', 'Ask for a simpler explanation'],
    ['deeper', 'Go deeper on that: more detail, the reasoning, and the edge cases.', 'Ask for more detail'],
    ['examples', 'Give me 3 concrete examples of that.', 'Ask for concrete examples'],
    ['bullets', 'Rewrite your last reply as a short bullet list.', 'Turn the last reply into bullets'],
    ['as-table', 'Put the key points of your last reply in a table.', 'Turn the last reply into a table'],
    ['steps', 'Turn that into numbered steps I can follow.', 'Turn the last reply into steps'],
    ['why', 'Why? Explain your reasoning briefly.', 'Ask why'],
    ['alternatives', 'Give me 3 different alternatives to that, with one line on each.', 'Ask for alternatives'],
    ['pros-cons', 'List the pros and cons of that, briefly.', 'Ask for pros and cons'],
    ['next', 'What should we do next? Give me the 3 best next steps.', 'Ask for next steps'],
    ['check', 'Double-check your last reply for mistakes and fix any you find.', 'Ask it to double-check the last reply'],
    ['tldr', 'TL;DR of your last reply in one sentence.', 'One-sentence version of the last reply'],
  ];
  for (const [name, prompt, desc] of QUICK) R({ name, area: 'Messages', desc, run: (_a, ctx) => { need(ctx); ctx.send(prompt); } });
  R({
    name: 'summarize', aliases: ['summary', 'sum'], area: 'Messages', args: '[n bullets | short | long]', desc: 'Ask for a compact summary of this chat so far',
    complete: pick([{ value: '5', hint: 'bullets' }, { value: 'short' }, { value: 'long' }]),
    run: (args, ctx) => {
      need(ctx);
      const a = args.trim().toLowerCase();
      const how = /^\d+$/.test(a) ? `in ${a} bullet points` : a === 'long' ? 'in under 300 words, with headings' : a === 'short' ? 'in 3 bullet points' : 'in at most 6 bullet points';
      ctx.send(`Summarize our conversation so far ${how}: the goal, what we decided, and what is left. No preamble.`);
    },
  });
  R({
    name: 'compact', area: 'Messages', desc: 'Compact the context into a summary (the chat keeps every message; later messages cost less)',
    run: async (_a, ctx) => { const chat = need(ctx); if (busy(chat)) throw new Error('Still answering'); await Native.compact(ctx.agentId); },
  });
  R({
    name: 'fresh', aliases: ['continue-fresh'], area: 'Messages', desc: 'Continue in a fresh chat that starts from a short summary of this one',
    run: async (_a, ctx) => { const chat = need(ctx); if (busy(chat)) throw new Error('Still answering'); await Native.summarizeAndContinue(ctx.agentId); },
  });
  R({
    name: 'stats', area: 'Messages', desc: 'Messages, words, tokens and time in this chat',
    run: (_a, ctx) => {
      const chat = need(ctx);
      const ms = chat.messages;
      const words = (role) => ms.filter((m) => m.role === role).reduce((n, m) => n + (m.text.match(/\S+/g) || []).length, 0);
      const tokIn = ms.reduce((n, m) => n + (m.usage?.input || 0), 0);
      const tokOut = ms.reduce((n, m) => n + (m.usage?.output || 0), 0);
      const time = ms.reduce((n, m) => n + (m.ms || 0), 0);
      const first = ms.find((m) => m.at)?.at;
      const replies = ms.filter((m) => m.role === 'assistant');
      const tools = replies.reduce((n, m) => n + (m.tools?.length || 0), 0);
      return [`**${safe(chat.title)}**`,
        `- ${plural(ms.filter((m) => m.role === 'user').length, 'message')} from you (${plural(words('user'), 'word')})`,
        `- ${plural(replies.length, 'reply', 'replies')} (${plural(words('assistant'), 'word')})${tools ? ` · ${plural(tools, 'tool call')}` : ''}`,
        tokIn || tokOut ? `- ${fmt(tokIn)} tokens in · ${fmt(tokOut)} out` : null,
        time ? `- ${Math.round(time / 1000)} s spent answering (avg ${(time / 1000 / Math.max(1, replies.length)).toFixed(1)} s)` : null,
        first ? `- Started ${fmtDate(first)}` : null,
        chat.model ? `- Model: ${chat.model}` : null,
      ].filter(Boolean).join('\n');
    },
  });
  R({
    name: 'tokens', aliases: ['cost'], area: 'Messages', args: '[today | week | all]', desc: 'Token use: this chat per reply, or every agent today / this week / ever',
    complete: pick([{ value: 'today' }, { value: 'week' }, { value: 'all' }]),
    run: async (args, ctx) => {
      if (window.Meter?.summary && args) { const t = await window.Meter.summary(args); if (t) return t; } // the live meter, when installed
      if (/^(today|all|week)$/i.test(args)) {
        // usage.json: { 'YYYY-MM-DD': { agentId: { input, output, replies } } }
        const u = (await window.hub.getUsage()) || {};
        const today = new Date().toLocaleDateString('en-CA');
        const weekAgo = new Date(Date.now() - 6 * 864e5).toLocaleDateString('en-CA');
        const days = Object.keys(u).filter((d) => (/today/i.test(args) ? d === today : /week/i.test(args) ? d >= weekAgo : true));
        const sum = {};
        for (const d of days) for (const [id, x] of Object.entries(u[d] || {})) { const t = (sum[id] ||= { input: 0, output: 0, replies: 0 }); t.input += x.input || 0; t.output += x.output || 0; t.replies += x.replies || 0; }
        const rows = Object.entries(sum).sort((a, b) => (b[1].input + b[1].output) - (a[1].input + a[1].output)).map(([id, x]) => `- ${H.agent(id)?.name || id}: ${fmt(x.input)} in · ${fmt(x.output)} out · ${plural(x.replies, 'reply', 'replies')}`);
        return rows.length ? `**Tokens ${/today/i.test(args) ? 'today' : /week/i.test(args) ? 'in the last 7 days' : `since ${days.sort()[0]}`}**\n${rows.join('\n')}\n\n\`/usage-table\` opens the full table.` : 'No usage recorded for that period.';
      }
      const chat = need(ctx);
      const replies = chat.messages.map((m, i) => ({ m, i })).filter((x) => x.m.usage);
      if (!replies.length) return 'No token counts in this chat yet.';
      const tin = replies.reduce((n, x) => n + x.m.usage.input, 0);
      const tout = replies.reduce((n, x) => n + x.m.usage.output, 0);
      const last = replies.at(-1).m.usage.input;
      return `**Tokens in this chat**: ${fmt(tin)} in · ${fmt(tout)} out · each message now sends ~${fmt(last)}${last > 60000 ? ' (`/compact` would make it cheaper)' : ''}\n${replies.slice(-12).map((x) => `- #${x.i + 1}: ${fmt(x.m.usage.input)} in · ${fmt(x.m.usage.output)} out${x.m.ms ? ` · ${(x.m.ms / 1000).toFixed(1)} s` : ''}`).join('\n')}`;
    },
  });
  R({
    name: 'context', aliases: ['ctx'], area: 'Messages', desc: 'How much context each message sends now, and how to shrink it',
    run: (_a, ctx) => {
      const chat = need(ctx);
      const last = [...chat.messages].reverse().find((m) => m.usage);
      if (!last) return 'No replies yet.';
      const n = last.usage.input;
      return `Each message sends about **${fmt(n)} tokens** (${Math.round(n / 2000)}% of a 200k window).${chat.compact ? ` Compacted ${timeAgo(chat.compact.at)}.` : ''}\n\n${n > 30000 ? '`/compact` summarizes it here · `/fresh` moves to a new chat from a summary' : 'That\'s light: nothing to do.'}`;
    },
  });

  // =====================================================================================================
  // Compose: draft, attach, screenshot, queue, snippets, templates
  // =====================================================================================================
  R({
    name: 'clear-draft', aliases: ['cd'], area: 'Compose', desc: 'Empty the message box and its attachments (/undo brings them back)',
    run: (_a, ctx) => {
      const v = Native.view(ctx.agentId);
      // the command line itself was just cleared; the draft it replaced is in the history
      const prev = store.get(`draft.${ctx.agentId}.${H.activeChat[ctx.agentId] || 'new'}`, '') || '';
      const atts = v.attachments.splice(0);
      Native.setDraft(ctx.agentId, '');
      store.set(`draft.${ctx.agentId}.${H.activeChat[ctx.agentId] || 'new'}`, null);
      Native.view(ctx.agentId).chips.replaceChildren();
      if (prev || atts.length) pushUndo('restore the draft', () => { Native.setDraft(ctx.agentId, prev); v.attachments.push(...atts); });
      toast('Draft cleared', { timeout: 2500, action: prev || atts.length ? { label: 'Undo', fn: () => Commands.run('undo', '', ctx.agentId) } : undefined });
    },
  });
  R({
    name: 'draft', aliases: ['type'], area: 'Compose', args: '<text>', desc: 'Put text in the message box without sending (handy in suggestion chips)',
    run: (args, ctx) => { Native.setDraft(ctx.agentId, args); },
  });
  R({
    name: 'drafts', aliases: ['sent', 'recall'], area: 'Compose', keys: 'Alt+↑ / Alt+↓', desc: 'What you sent lately: click one to put it back in the box',
    run: (_a, ctx) => {
      const list = store.get('chat.sentHistory', []).filter((t) => !t.startsWith('/')).slice(0, 12);
      if (!list.length) return 'Nothing sent yet.';
      ctx.note(`**Recently sent** (Alt+↑ in the box walks through them)\n${list.map((t, i) => `${i + 1}. ${safe(clip(t, 100))}`).join('\n')}`, {
        id: 'drafts', actions: list.slice(0, 6).map((t, i) => ({ label: `${i + 1}`, title: t.slice(0, 300), run: (box) => { box.remove(); Native.setDraft(ctx.agentId, t); } })),
      });
    },
  });
  R({
    name: 'wc', aliases: ['count'], area: 'Compose', desc: 'Words, characters and about how many tokens your draft is (empty box: the last reply)',
    run: (_a, ctx) => {
      const t = Native.view(ctx.agentId).input.value;
      const count = (x) => `${plural((x.match(/\S+/g) || []).length, 'word')} · ${plural(x.length, 'character')} · ~${fmt(Math.ceil(x.length / 4))} tokens`;
      if (t) return `Draft: ${count(t)}`;
      const last = Native.lastReplyText(ctx.agentId);
      return last ? `Last reply: ${count(last)}` : 'The box is empty.';
    },
  });
  R({
    name: 'attach', aliases: ['file', 'add'], area: 'Compose', args: '[path]', desc: 'Attach files (no path: the file picker)',
    run: async (args, ctx) => {
      if (!args) { const n = await Native.pickFiles(ctx.agentId); return n ? null : undefined; }
      const p = args.replace(/^["']|["']$/g, '');
      const st = await window.hub.fs.stat(p).catch(() => null);
      if (!st) return `No file at ${safe(p)}`;
      await Native.attachPaths(ctx.agentId, [p]);
      toast(`Attached ${p.split(/[\\/]/).pop()}`, { timeout: 1500 });
    },
  });
  R({
    name: 'screenshot', aliases: ['shot'], area: 'Compose', args: '[window | lab]', keys: 'Ctrl+Shift+S', desc: 'Put a picture of the window (or the Lab view) in your message',
    complete: pick([{ value: 'window' }, { value: 'lab', hint: 'the Three.js Lab canvas' }]),
    run: async (args, ctx) => {
      const agent = H.agent(ctx.agentId);
      let p;
      if (/^lab$/i.test(args) || (!args && agent?.dock === 'three')) p = await Native.screenshotFor({ dock: 'three' });
      else p = await window.hub.captureWindow();
      if (!p) throw new Error('Couldn\'t take the screenshot');
      await Native.attachPaths(ctx.agentId, [p]);
      toast('Snapshot attached: write what you want and send', { timeout: 2500 });
    },
  });
  R({
    name: 'queue', aliases: ['q', 'later'], area: 'Compose', args: '[message | list | clear]', desc: 'Queue a message to send when the current reply ends',
    complete: pick([{ value: 'list' }, { value: 'clear' }]),
    run: async (args, ctx) => {
      const v = Native.view(ctx.agentId);
      if (!args || args === 'list') return v.queue.length ? `**Queued**\n${v.queue.map((q, i) => `${i + 1}. ${safe(clip(q, 100))}`).join('\n')}` : 'Nothing queued. While it answers, type and press Enter to queue.';
      if (args === 'clear') { const n = v.queue.length; v.queue.splice(0); Native.renderQueue(ctx.agentId); return n ? `Cleared ${plural(n, 'queued message')}.` : 'Nothing queued.'; }
      const chat = chatOf(ctx);
      if (!busy(chat)) { await Native.send(ctx.agentId, args); return; }
      v.queue.push(args);
      Native.renderQueue(ctx.agentId);
    },
  });
  R({
    name: 'smart-paste', area: 'Compose', args: '[on | off]', desc: 'Pasted code gets a ``` fence; huge pastes become a text file (on by default)',
    complete: () => ONOFF,
    run: (args) => { const on = onOff(args, store.get('chat.smartPaste', true)); store.set('chat.smartPaste', on); return on ? 'Smart paste on (Ctrl+Shift+V still pastes plain text).' : 'Smart paste off.'; },
  });
  R({
    name: 'snippet', aliases: ['snip'], area: 'Compose', args: '<name> | save <name> | delete <name>', desc: 'Insert a saved bit of text; "save <name>" keeps your current draft as one',
    complete: async (args) => {
      if (/^(save|delete)\s/i.test(args)) return (await ChatUX.loadSnippets()).filter((s) => has(args.split(/\s+/).slice(1).join(' '))(s.name)).map((s) => ({ value: `${args.split(/\s+/)[0]} ${s.name}` }));
      return [...(await ChatUX.loadSnippets()).filter((s) => has(args)(s.name)).map((s) => ({ value: s.name, hint: clip(s.text, 50) })), { value: 'save ', hint: 'keep the current draft as a snippet' }];
    },
    run: async (args, ctx) => {
      const m = args.match(/^(save|delete|del|rm)\s+(.+)$/i);
      if (m && /^save$/i.test(m[1])) {
        const text = Native.view(ctx.agentId).input.value || store.get(`draft.${ctx.agentId}.${H.activeChat[ctx.agentId] || 'new'}`, '') || Native.lastReplyText(ctx.agentId);
        if (!text) return 'Write the snippet in the box first, then `/snippet save <name>`.';
        await ChatUX.saveSnippet(m[2].trim(), text);
        return `Saved snippet **${safe(m[2].trim())}** (${plural(text.length, 'character')}). \`/snippet ${safe(m[2].trim())}\` inserts it.`;
      }
      if (m) return (await ChatUX.deleteSnippet(m[2].trim())) ? `Deleted snippet ${safe(m[2].trim())}.` : `No snippet called ${safe(m[2].trim())}.`;
      const all = await ChatUX.loadSnippets();
      if (!args) return all.length ? `**Snippets**\n${all.map((s) => `- \`/snippet ${safe(s.name)}\` ${safe(clip(s.text, 70))}`).join('\n')}` : 'No snippets yet. Write something, then `/snippet save <name>`.';
      const s = all.find((x) => x.name.toLowerCase() === args.toLowerCase()) || all.find((x) => has(args)(x.name));
      if (!s) return `No snippet called “${args}”.`;
      Native.insertDraft(ctx.agentId, s.text);
    },
  });
  R({ name: 'snippets', area: 'Compose', desc: 'List your snippets', hidden: true, run: (_a, ctx) => Commands.run('snippet', '', ctx.agentId) });
  // Chat starters: fill the box with a ready-made brief ({{blanks}} are asked for). Saved prompts work here too.
  const TEMPLATES = [
    { name: 'Music visualizer', text: 'Make a music visualizer for {{song}}: {{mood}} mood, 9:16 for Shorts. Hits on the kick and snare, a build that pays off on the drop, sliders for colors, speed and intensity.' },
    { name: 'Visual from a reference', text: 'Recreate the look of the attached reference as a three.js scene: same palette, composition and motion feel. Then give me sliders for the main look parameters.' },
    { name: 'Lyric video', text: 'Make a lyric video scene for {{song}}: lines appear on the beat, {{style}} typography, background reacts to the music.' },
    { name: 'Loop for a post', text: 'Make a seamless {{seconds}}-second loop, {{size}}, for a social post: {{idea}}. It must loop perfectly.' },
    { name: 'Fix what I see', text: 'Here is what is wrong in the current result: {{problem}}. Look at a fresh screenshot, fix it, and tell me what you changed.' },
    { name: 'Polish pass', text: 'Do a polish pass on the current sketch: lighting, color grading, motion easing, and performance. Keep my slider values. List what you changed.' },
    { name: 'Video feedback', text: 'Review the latest render: pacing, readability, color and motion, with timecodes. Then the 3 changes that would help most.' },
    { name: 'Bug report', text: 'Something is broken.\n\nWhat I did: {{steps}}\nWhat I expected: {{expected}}\nWhat happened: {{actual}}' },
    { name: 'Explain like a friend', text: 'Explain {{topic}} to me like a friend would: simple words, one example, no jargon.' },
    { name: 'Decide between options', text: 'Help me decide between {{options}}. My priorities: {{priorities}}. Give a recommendation and the main trade-off.' },
    { name: 'Plan a task', text: 'Help me plan {{task}}. Break it into small steps, flag the risky ones, and tell me where to start.' },
    { name: 'Write a message', text: 'Write a {{tone}} message to {{who}} about {{what}}. Short, natural, ready to send.' },
    { name: 'Brainstorm', text: 'Brainstorm 12 ideas for {{thing}}: mix safe and wild ones, and mark your top 3.' },
    { name: 'Rewrite my text', text: 'Rewrite this to be clearer and tighter, keeping my voice:\n\n{{text}}' },
    { name: 'Learn something', text: 'Teach me {{topic}} in 5 short steps, with a tiny exercise at the end of each.' },
    { name: 'Compare two things', text: 'Compare {{a}} and {{b}} in a short table (what matters for {{use}}), then your pick.' },
    { name: 'Daily plan', text: 'Here is what I need to do today: {{list}}. Order it into a realistic plan with time blocks and breaks.' },
    { name: 'Devlog post', text: 'Write a short devlog post about {{topic}}: friendly intro, bullet list of changes, a call to action.' },
    { name: 'Shader effect', text: 'Write a fragment shader for {{effect}} with uniforms I can drive from sliders (time, intensity, color).' },
    { name: 'Color palette', text: 'Give me 5 color palettes (5 hex colors each) for {{mood}}, with a name and where each color goes.' },
  ];
  R({
    name: 'template', aliases: ['tpl', 'starter'], area: 'Compose', args: '[name]', desc: 'Fill the box from a ready-made brief or a saved prompt (no name: the list)',
    complete: async (args) => [...TEMPLATES.map((t) => ({ value: t.name, hint: clip(t.text, 50) })), ...(await Prompts.load()).map((p) => ({ value: p.name, hint: 'saved prompt' }))].filter((x) => has(args)(x.value)).slice(0, 14),
    run: async (args, ctx) => {
      const prompts = await Prompts.load();
      const all = [...TEMPLATES, ...prompts];
      if (!args) return `**Templates** (fill the box; blanks are asked for)\n${TEMPLATES.map((t) => `- \`/template ${t.name}\``).join('\n')}${prompts.length ? `\n\n**Your saved prompts**: ${prompts.map((p) => `\`/template ${safe(p.name)}\``).join(' · ')}` : ''}`;
      const t = all.find((x) => x.name.toLowerCase() === args.toLowerCase()) || all.find((x) => has(args)(x.name));
      if (!t) return `No template called “${args}”.`;
      const text = await Prompts.fill(t);
      if (text != null) Native.setDraft(ctx.agentId, text);
    },
  });

  // =====================================================================================================
  // Agents: talk to the other agent from here, stop, model, effort
  // =====================================================================================================
  // Sends to another agent's current chat (or a new one) without leaving this chat; its reply shows up there.
  async function sendTo(agent, text, { fresh = false } = {}) {
    if (!agent) throw new Error('No such agent');
    if (!text) { activate(agent.id); return; }
    const chatId = H.activeChat[agent.id];
    if (fresh || (chatId && Native.isBusy(chatId))) { if (chatId && Native.isBusy(chatId)) throw new Error(`${agent.name} is still answering`); H.activeChat[agent.id] = null; }
    await Native.send(agent.id, text);
    toast(`Sent to ${agent.name}`, { timeout: 2500, action: { label: 'Open', fn: () => Native.open(agent.id, H.activeChat[agent.id]) } });
  }
  const claudeAgent = () => H.claudeAgent();
  const astra = () => Native.astraAgent();
  R({
    name: 'claude', area: 'Agents', args: '<message>', desc: 'Send this to Claude (its open chat) without leaving here',
    run: (args, ctx) => { const a = claudeAgent(); if (a?.id === ctx.agentId) return ctx.send(args); return sendTo(a, args); },
  });
  R({
    name: 'astra', aliases: ['gpt', 'chatgpt'], area: 'Agents', args: '<message>', desc: 'Send this to Astra (ChatGPT) without leaving here',
    run: (args, ctx) => { const a = astra(); if (!a) throw new Error('No Astra (ChatGPT) agent is set up'); if (a.id === ctx.agentId) return ctx.send(args); return sendTo(a, args); },
  });
  R({
    name: 'both', area: 'Agents', args: '<message>', desc: 'Send this to Claude and Astra at once (each in its own chat)',
    run: async (args, ctx) => {
      if (!args) return 'What should both answer? `/both <message>`';
      const targets = [claudeAgent(), astra()].filter(Boolean);
      for (const a of targets) {
        if (a.id === ctx.agentId) await ctx.send(args);
        else await sendTo(a, args);
      }
    },
  });
  R({
    name: 'ask', aliases: ['to'], area: 'Agents', args: '<agent> <message>', desc: 'Send a message to any native agent',
    complete: (args, ctx) => (args.includes(' ') ? [] : agentChoices(args, ctx.agentId).map((x) => ({ ...x, value: `${x.value} ` }))),
    run: async (args, ctx) => {
      const agent = nativeAgents().sort((a, b) => b.name.length - a.name.length).find((a) => args.toLowerCase().startsWith(`${a.name.toLowerCase()} `) || args.toLowerCase() === a.name.toLowerCase());
      if (!agent) return `Which agent? ${nativeAgents().map((a) => a.name).join(', ')}`;
      const text = args.slice(agent.name.length).trim();
      if (agent.id === ctx.agentId) return text ? ctx.send(text) : null;
      return sendTo(agent, text);
    },
  });
  R({
    name: 'all', aliases: ['ask-all'], area: 'Agents', args: '<message>', desc: 'Send to every agent marked for Ask all (website chats too)',
    run: async (args) => { if (!args) { document.getElementById('broadcast-input')?.focus(); return; } await askAll(args); },
  });
  R({
    name: 'continue-with', aliases: ['move-to-agent'], area: 'Agents', args: '<agent>', desc: 'Continue this chat with another agent (it gets the history as context)',
    complete: (args, ctx) => agentChoices(args, ctx.agentId),
    run: (args, ctx) => {
      const chat = need(ctx);
      const target = agentNamed(args) || nativeAgents().find((a) => a.id !== ctx.agentId);
      if (!target || target.id === ctx.agentId) return 'Name another agent: `/continue-with Astra`';
      Native.continueWith(chat.id, target.id);
    },
  });
  R({
    name: 'stop', area: 'Agents', keys: 'Esc', desc: 'Stop the reply in progress',
    run: (_a, ctx) => { if (!Native.stop(ctx.agentId)) return 'Nothing is running here.'; },
  });
  R({
    name: 'stop-all', aliases: ['stopall', 'halt'], area: 'Agents', desc: 'Stop every reply in progress, in every chat',
    run: async () => { const n = await window.hub.stopAll(); Native.stopSpeaking(); return n ? `Stopped ${plural(n, 'reply', 'replies')}.` : 'Nothing was running.'; },
  });
  R({
    name: 'model', aliases: ['m'], area: 'Agents', args: '[name | default]', desc: 'The model this chat uses (no name: shows it)',
    complete: (args, ctx) => [...(Native.MODEL_CHOICES[H.agent(ctx.agentId)?.engine] || []), 'default'].filter(has(args)).map((m) => ({ value: m, hint: m === H.agent(ctx.agentId)?.model ? 'agent default' : '' })),
    run: async (args, ctx) => {
      const agent = H.agent(ctx.agentId);
      const chat = chatOf(ctx);
      if (!args) return `This chat uses **${chat?.model || agent.model || 'the engine default'}**${chat?.model ? ` (agent default: ${agent.model || 'engine default'})` : ''}. Choices: ${(Native.MODEL_CHOICES[agent.engine] || []).map((m) => `\`/model ${m}\``).join(' ')}`;
      await Native.setModel(ctx.agentId, /^default$/i.test(args) ? '' : args);
      if (chat) Native.refresh(ctx.agentId, { keepScroll: true });
    },
  });
  R({
    name: 'effort', area: 'Agents', args: '<low | medium | high | xhigh>', desc: 'How hard this agent thinks (agent setting; higher = slower, more tokens)',
    complete: pick(['low', 'medium', 'high', 'xhigh', 'default']),
    run: async (args, ctx) => {
      const agent = H.agent(ctx.agentId);
      if (!args) return `${agent.name} effort: **${agent.effort || 'default'}**`;
      const e = args.toLowerCase();
      if (!/^(low|medium|high|xhigh|max|default)$/.test(e)) return 'Use low, medium, high or xhigh.';
      if (e === 'default') delete agent.effort; else agent.effort = e;
      await saveConfig();
      return `${agent.name} effort: **${agent.effort || 'default'}** (from the next message)`;
    },
  });
  R({
    name: 'agent', aliases: ['switch'], area: 'Agents', args: '<name>', desc: 'Go to an agent\'s chat',
    complete: (args) => H.agents().filter((a) => has(args)(a.name)).map((a) => ({ value: a.name, hint: a.mode })),
    run: (args) => {
      const a = H.agents().find((x) => x.name.toLowerCase() === args.toLowerCase()) || H.agents().find((x) => has(args)(x.name));
      if (!a) return `No agent called “${args}”.`;
      activate(a.id);
    },
  });
  R({
    name: 'agents', area: 'Agents', desc: 'Your chat agents, what they run on, and which are busy',
    run: () => `**Agents**\n${nativeAgents().map((a) => `- **${safe(a.name)}** · ${a.engine === 'codex' ? 'ChatGPT' : 'Claude'}${a.model ? ` · ${a.model}` : ''}${a.effort ? ` · ${a.effort}` : ''}${a.dock ? ` · docked in ${a.dock}` : ''}${Native.pendingFor(a.id) ? ' · **answering**' : ''} · \`/agent ${safe(a.name)}\``).join('\n')}`,
  });
  R({
    name: 'dock', area: 'Agents', args: '[show | hide | width <px>]', desc: 'Show or hide the director chat docked in this tool',
    complete: pick(['show', 'hide', 'width 420', 'width 560']),
    run: (args, ctx) => {
      const agent = H.agent(ctx.agentId);
      const toolId = agent?.dock || (H.isTool(H.activeId) ? H.activeId.slice(5) : null);
      const s = toolId && H.surfaces.get(`tool:${toolId}`);
      if (!s?.dockedId) return 'This tool has no docked chat.';
      const m = args.match(/^width\s+(\d+)/i);
      if (m) { const w = Math.max(300, Math.min(760, Number(m[1]))); s.el.style.setProperty('--dock-w', `${w}px`); store.set(`dockWidth.${toolId}`, w); return; }
      const show = /^show$/i.test(args) ? true : /^hide$/i.test(args) ? false : s.dock.hidden;
      if (show === !s.dock.hidden) return;
      s.dockBtn?.click();
    },
  });
  R({
    name: 'login', aliases: ['sign-in'], area: 'Agents', desc: 'Sign this agent\'s engine in to your account (opens its own window)',
    run: async (_a, ctx) => { const ok = await window.hub.login(H.agent(ctx.agentId).engine); return ok ? 'Finish signing in in the window that opened.' : 'Couldn\'t find the engine on this computer.'; },
  });

  // =====================================================================================================
  // Style: tone, persona, language. Sent once with your next message, never added to the system prompt.
  // =====================================================================================================
  const TONES = {
    concise: 'Be concise: short answers, no filler.', friendly: 'Use a warm, friendly tone.', direct: 'Be blunt and direct; skip pleasantries.',
    formal: 'Use a formal, professional tone.', playful: 'Be playful and light, with a bit of humor.', calm: 'Use a calm, reassuring tone.',
    teacher: 'Explain like a patient teacher, step by step.', expert: 'Talk to me like a fellow expert; skip the basics.', eli5: 'Explain everything as simply as you can, like to a curious kid.',
    bullet: 'Answer in short bullet points whenever you can.', socratic: 'Guide me with questions instead of giving the answer straight away.', hype: 'Be energetic and encouraging.',
  };
  const PERSONAS = {
    'art-director': 'Act as a demanding art director: judge composition, color and motion, and push for a stronger look.',
    'motion-designer': 'Act as a senior motion designer: timing, easing and rhythm first.',
    'music-producer': 'Act as a music producer: think in bars, drops, builds and groove.',
    'code-reviewer': 'Act as a strict code reviewer: correctness, edge cases, then readability.',
    'editor': 'Act as a sharp editor: cut words, fix clarity, keep my voice.',
    'coach': 'Act as a supportive coach: help me decide and keep moving.',
    'devil': 'Play devil\'s advocate: challenge my idea and find the weak spots.',
    'mentor': 'Act as a mentor: explain the why and teach me to do it myself.',
    'colorist': 'Act as a film colorist: talk palettes, contrast, grading and mood.',
    'game-designer': 'Act as a game designer: feel, feedback, pacing and player motivation.',
    'writer': 'Act as a punchy copywriter: hooks, rhythm, short lines.',
    'scientist': 'Act as a careful scientist: evidence, uncertainty, and what would change your mind.',
  };
  const LANGS = ['English', 'French', 'Spanish', 'German', 'Italian', 'Portuguese', 'Dutch', 'Japanese', 'Korean', 'Chinese', 'Arabic', 'Russian', 'Hindi', 'Polish', 'Turkish', 'Swedish'];
  const styleRun = (map, kind) => (args, ctx) => {
    const k = args.trim().toLowerCase();
    if (!k) return `**${kind}s** (rides along once with your next message; \`/style off\` drops it)\n${Object.entries(map).map(([n, t]) => `- \`/${kind.toLowerCase()} ${n}\` ${t}`).join('\n')}`;
    if (k === 'off' || k === 'none') { Native.setStyle(ctx.agentId, null); return; }
    const hit = map[k] || Object.entries(map).find(([n]) => n.startsWith(k))?.[1];
    Native.setStyle(ctx.agentId, hit || `${kind}: ${args.trim()}`);
  };
  R({ name: 'tone', area: 'Style', args: '[name | your own words | off]', desc: 'Answer in this tone from now on (sent once with your next message)', complete: (args) => [...Object.keys(TONES), 'off'].filter(has(args)).map((v) => ({ value: v, hint: TONES[v] || '' })), run: styleRun(TONES, 'Tone') });
  R({ name: 'persona', aliases: ['role', 'act-as'], area: 'Style', args: '[name | your own words | off]', desc: 'Have it answer as a role (sent once with your next message)', complete: (args) => [...Object.keys(PERSONAS), 'off'].filter(has(args)).map((v) => ({ value: v, hint: PERSONAS[v] ? clip(PERSONAS[v], 50) : '' })), run: styleRun(PERSONAS, 'Persona') });
  R({
    name: 'lang', aliases: ['language', 'translate-replies'], area: 'Style', args: '<language | off>', desc: 'Reply in this language from now on (sent once with your next message)',
    complete: (args) => [...LANGS, 'off'].filter(has(args)).map((v) => ({ value: v })),
    run: (args, ctx) => {
      if (!args) return `Languages: ${LANGS.map((l) => `\`/lang ${l}\``).join(' ')}`;
      if (/^(off|none)$/i.test(args)) { Native.setStyle(ctx.agentId, null); return; }
      const lang = LANGS.find((l) => l.toLowerCase().startsWith(args.toLowerCase())) || args.trim();
      Native.setStyle(ctx.agentId, `From now on, reply in ${lang}.`);
    },
  });
  R({
    name: 'style', area: 'Style', args: '[instruction | off]', desc: 'Your own standing instruction for this chat (sent once with your next message)',
    complete: pick(['off']),
    run: (args, ctx) => {
      const chat = chatOf(ctx);
      if (!args) return chat?.style ? `This chat's style: *${safe(chat.style)}* · \`/style off\` drops it` : 'No style set. `/tone`, `/persona`, `/lang` or `/style <your words>`.';
      Native.setStyle(ctx.agentId, /^(off|none|clear)$/i.test(args) ? null : args.trim());
    },
  });
  R({
    name: 'translate', area: 'Style', args: '<language>', desc: 'Translate the last reply into a language (sent as a message)',
    complete: (args) => LANGS.filter(has(args)).map((v) => ({ value: v })),
    run: (args, ctx) => { need(ctx); ctx.send(`Translate your last reply into ${args || 'English'}. Only the translation.`); },
  });

  // =====================================================================================================
  // Memory
  // =====================================================================================================
  R({
    name: 'remember', area: 'Memory', args: '<fact>', desc: 'Save a fact this agent keeps in mind in every chat (/forget removes it)',
    run: async (args, ctx) => {
      if (!args) return 'What should it remember? `/remember I like dark palettes`';
      await Native.rememberFacts(ctx.agentId, [args.trim()]);
      pushUndo(`forget "${args.trim()}"`, () => Native.forgetFacts(ctx.agentId, [args.trim()]));
      return `Remembered: *${safe(args.trim())}* · \`/undo\``;
    },
  });
  R({
    name: 'remember-all', aliases: ['remember-shared'], area: 'Memory', args: '<fact>', desc: 'Save a fact every agent keeps in mind',
    run: async (args) => {
      if (!args) return 'What should every agent remember?';
      const memory = await window.hub.getMemory();
      memory.shared = [(memory.shared || '').trim(), `- ${args.trim()}`].filter(Boolean).join('\n');
      await window.hub.saveMemory(memory);
      return `Every agent will remember: *${safe(args.trim())}*`;
    },
  });
  R({
    name: 'forget', area: 'Memory', args: '<words | last>', desc: 'Remove remembered facts that contain these words (last: the newest)',
    complete: async (args, ctx) => {
      const memory = await window.hub.getMemory();
      return [memory.agents?.[ctx.agentId], memory.shared].join('\n').split('\n').map((l) => l.replace(/^-\s*/, '').trim()).filter((l) => l && has(args)(l)).slice(0, 10).map((l) => ({ value: l }));
    },
    run: async (args, ctx) => {
      if (!args) return 'Which fact? `/forget <words>` (`/memory` lists them)';
      const memory = await window.hub.getMemory();
      const before = { agents: { ...memory.agents }, shared: memory.shared };
      const lines = (memory.agents[ctx.agentId] || '').split('\n').filter((l) => l.trim());
      let removed = [];
      if (/^last$/i.test(args)) removed = lines.slice(-1);
      else removed = lines.filter((l) => has(args)(l));
      const sharedLines = (memory.shared || '').split('\n').filter((l) => l.trim());
      const sharedRemoved = /^last$/i.test(args) ? [] : sharedLines.filter((l) => has(args)(l));
      if (!removed.length && !sharedRemoved.length) return `Nothing remembered matches “${args}”.`;
      memory.agents[ctx.agentId] = lines.filter((l) => !removed.includes(l)).join('\n');
      memory.shared = sharedLines.filter((l) => !sharedRemoved.includes(l)).join('\n');
      await window.hub.saveMemory(memory);
      pushUndo('bring the forgotten facts back', async () => { const m = await window.hub.getMemory(); m.agents = { ...m.agents, ...before.agents }; m.shared = before.shared; await window.hub.saveMemory(m); });
      return `Forgot ${plural(removed.length + sharedRemoved.length, 'fact')}:\n${[...removed, ...sharedRemoved].map((l) => `- ${safe(l.replace(/^-\s*/, ''))}`).join('\n')}\n\n\`/undo\` brings them back.`;
    },
  });
  R({
    name: 'memory', aliases: ['mem', 'memories'], area: 'Memory', args: '[edit]', desc: 'What this agent remembers about you (edit: the memory editor)',
    complete: pick(['edit']),
    run: async (args, ctx) => {
      if (/^edit$/i.test(args)) { MemoryEditor.open(); return; }
      const memory = await window.hub.getMemory();
      const own = (memory.agents?.[ctx.agentId] || '').trim();
      const shared = (memory.shared || '').trim();
      const size = Math.ceil((own.length + shared.length) / 4);
      return `**${H.agent(ctx.agentId).name} remembers** (~${fmt(size)} tokens added to every message)\n${own || '*nothing yet*'}${shared ? `\n\n**Every agent remembers**\n${shared}` : ''}\n\n\`/remember <fact>\` · \`/forget <words>\` · \`/memory edit\``;
    },
  });

  // =====================================================================================================
  // Export
  // =====================================================================================================
  function chatHtml(chat) {
    const agent = H.agent(chat.agentId);
    const rows = chat.messages.filter((m) => m.role !== 'error').map((m) => `<section class="${m.role}"><h4>${m.role === 'user' ? 'You' : m.role === 'opinion' ? `${escapeHtml(m.from || '')} (second opinion)` : escapeHtml(agent?.name || 'Assistant')}<small>${m.at ? fmtDate(m.at) : ''}</small></h4>${m.role === 'user' ? `<p>${escapeHtml(m.text).replace(/\n/g, '<br>')}</p>` : renderMarkdown(m.text)}</section>`).join('\n');
    return `<!doctype html><meta charset="utf-8"><title>${escapeHtml(chat.title)}</title><style>body{font:15px/1.55 system-ui,sans-serif;max-width:820px;margin:40px auto;padding:0 16px;color:#222}section{margin:18px 0;padding:12px 16px;border-radius:10px;background:#f6f6f8}section.user{background:#eef3ff}h4{margin:0 0 6px;display:flex;justify-content:space-between}small{color:#888;font-weight:normal}pre{background:#1d1f24;color:#eee;padding:10px;border-radius:8px;overflow:auto}.copy-code{display:none}table{border-collapse:collapse}td,th{border:1px solid #ccc;padding:4px 8px}</style><h1>${escapeHtml(chat.title)}</h1>\n${rows}\n`;
  }
  const EXPORT_FORMATS = { md: 'Markdown', json: 'JSON (re-import with /import)', html: 'Web page', txt: 'Plain text' };
  R({
    name: 'export', aliases: ['save-chat'], area: 'Export', args: '[md | json | html | txt] [file | clipboard]', desc: 'Export this chat (default: Markdown to a file)',
    complete: (args) => {
      const [f, dest] = args.split(/\s+/);
      if (dest !== undefined || (f && EXPORT_FORMATS[f] && args.endsWith(' '))) return ['file', 'clipboard'].map((d) => ({ value: `${f} ${d}` }));
      return Object.entries(EXPORT_FORMATS).filter(([k]) => has(f)(k)).map(([k, label]) => ({ value: k, hint: label }));
    },
    run: async (args, ctx) => {
      const chat = need(ctx);
      const [fmtName = 'md', dest = 'file'] = args.toLowerCase().split(/\s+/).filter(Boolean);
      const f = EXPORT_FORMATS[fmtName] ? fmtName : 'md';
      const content = f === 'json' ? JSON.stringify({ ...chat, session: undefined, hearthExport: 1 }, null, 2)
        : f === 'html' ? chatHtml(chat)
          : f === 'txt' ? Native.chatMarkdown(chat).replace(/\*\*|__|`/g, '')
            : Native.chatMarkdown(chat);
      if (/^clip/.test(dest)) { await copyText(content, `Chat copied (${EXPORT_FORMATS[f]})`); return; }
      const p = await window.hub.saveFile({ defaultPath: `${chat.title.replace(/[\\/:*?"<>|]/g, '_')}.${f}`, filters: [{ name: EXPORT_FORMATS[f], extensions: [f] }], content });
      if (p) toast('Chat exported', { action: { label: 'Show', fn: () => window.hub.fs.reveal(p) } });
    },
  });
  R({
    name: 'note', aliases: ['to-notes'], area: 'Export', args: '[text | last | #]', keys: 'Ctrl+J opens Notes', desc: 'Save text, the last reply or a message to your Notes',
    run: async (args, ctx) => {
      const chat = chatOf(ctx);
      let text = args;
      if (!args || args === 'last') { if (!chat) return 'Nothing to save yet.'; text = chat.messages[mustIndex(chat, 'last', 'assistant')].text; } else if (/^#?\d+$/.test(args) && chat) text = chat.messages[mustIndex(chat, args)].text;
      await Notes.append(text);
    },
  });

  // =====================================================================================================
  // View: text size, width, density, wrap, timestamps, focus / zen, theme
  // =====================================================================================================
  R({
    name: 'zoom', aliases: ['text-size'], area: 'View', args: '[+ | - | 0 | 90% … 150%]', desc: 'Chat text size (only the chats; Ctrl +/- zooms the whole app)',
    complete: pick(['+', '-', '0', '90%', '110%', '125%']),
    run: (args) => {
      const a = args.trim();
      let s = Number(ChatUX.pref('scale')) || 1;
      if (a === '+' || !a) s += 0.1; else if (a === '-') s -= 0.1; else if (a === '0' || /^reset$/i.test(a)) s = 1; else s = (parseFloat(a) || 100) / (a.includes('%') || parseFloat(a) > 3 ? 100 : 1);
      s = Math.round(Math.min(1.6, Math.max(0.75, s)) * 100) / 100;
      ChatUX.setPref('scale', s);
      toast(`Chat text ${Math.round(s * 100)}%`, { timeout: 1000 });
    },
  });
  R({
    name: 'width', area: 'View', args: '<narrow | normal | wide | full>', desc: 'How wide messages can get',
    complete: pick(Object.keys(ChatUX.WIDTHS)),
    run: (args) => { const w = Object.keys(ChatUX.WIDTHS).find((k) => k.startsWith(args.toLowerCase())) || 'normal'; ChatUX.setPref('width', w); toast(`Message width: ${w}`, { timeout: 1000 }); },
  });
  R({
    name: 'spacing', aliases: ['compact-view', 'msg-density'], area: 'View', args: '<compact | cozy>', desc: 'Tighter or roomier message spacing',
    complete: pick(['compact', 'cozy']),
    run: (args) => { const d = /^c[oa]m/i.test(args) || (!args && ChatUX.pref('density') !== 'compact') ? 'compact' : 'cozy'; ChatUX.setPref('density', d); toast(`Density: ${d}`, { timeout: 1000 }); },
  });
  R({
    name: 'wrap', area: 'View', args: '[on | off]', desc: 'Wrap long lines in code blocks instead of scrolling sideways',
    complete: () => ONOFF,
    run: (args) => { const on = ChatUX.setPref('wrap', onOff(args, ChatUX.pref('wrap'))); toast(on ? 'Code lines wrap' : 'Code lines scroll', { timeout: 1000 }); },
  });
  R({
    name: 'timestamps', aliases: ['times'], area: 'View', args: '<always | hover | never>', desc: 'When message times show',
    complete: pick(['always', 'hover', 'never']),
    run: (args) => { const t = ['always', 'hover', 'never'].find((k) => k.startsWith(args.toLowerCase())) || (ChatUX.pref('timestamps') === 'always' ? 'hover' : 'always'); ChatUX.setPref('timestamps', t); toast(`Times: ${t}`, { timeout: 1000 }); },
  });
  R({
    name: 'numbers', aliases: ['msg-numbers'], area: 'View', args: '[on | off]', desc: 'Show message numbers (for /jump, /edit, /copy #)',
    complete: () => ONOFF,
    run: (args) => { const on = ChatUX.setPref('numbers', onOff(args, ChatUX.pref('numbers'))); toast(on ? 'Message numbers shown' : 'Message numbers hidden', { timeout: 1000 }); },
  });
  R({
    name: 'scroll-lock', aliases: ['lock'], area: 'View', args: '[on | off]', desc: 'Stop following a reply as it streams (read from where you are)',
    complete: () => ONOFF,
    run: (args, ctx) => { const v = Native.view(ctx.agentId); v.scrollLock = onOff(args, v.scrollLock); toast(v.scrollLock ? 'Scroll lock on: the view stays put while it writes' : 'Following new text again', { timeout: 1600 }); },
  });
  R({
    name: 'focus', area: 'View', desc: 'Just this chat: hides the chats panel and the rail (again: back)',
    run: () => { ChatUX.setFocus(ChatUX.isFocus() ? false : true); },
  });
  R({
    name: 'zen', area: 'View', desc: 'Focus plus quiet chrome: message buttons show on hover only (again: back)',
    run: () => { ChatUX.setFocus(document.body.classList.contains('chat-zen') ? false : 'zen'); },
  });
  R({
    name: 'theme', area: 'View', args: '<name>', desc: 'Switch the app theme',
    complete: (args) => Object.entries(AppUI.THEMES).filter(([id, t]) => has(args)(t.label) || has(args)(id)).map(([id, t]) => ({ value: id, label: t.label })),
    run: async (args) => {
      const entry = Object.entries(AppUI.THEMES).find(([id, t]) => id === args.toLowerCase() || t.label.toLowerCase() === args.toLowerCase()) || Object.entries(AppUI.THEMES).find(([id, t]) => has(args)(t.label) || has(args)(id));
      if (!entry) return `Themes: ${Object.keys(AppUI.THEMES).map((id) => `\`/theme ${id}\``).join(' ')}`;
      const { label, ...colors } = entry[1];
      H.config.theme = { ...H.config.theme, ...colors, preset: entry[0] };
      await saveConfig();
      toast(`Theme: ${label}`, { timeout: 1200 });
    },
  });
  R({
    name: 'panel', aliases: ['sidebar'], area: 'View', args: '[show | hide]', keys: 'Ctrl+\\', desc: 'Show or hide the chats panel',
    complete: pick(['show', 'hide']),
    run: (args) => { H.panelOpen = /^show$/i.test(args) ? true : /^hide$/i.test(args) ? false : !H.panelOpen; applyLayout(); },
  });
  R({ name: 'grid', area: 'View', keys: 'Ctrl+G', desc: 'Agents side by side (again: one at a time)', run: () => handleShortcut({ key: 'g' }) });
  R({
    name: 'clear-notes', aliases: ['cls'], area: 'View', keys: 'Esc in an empty box', desc: 'Remove the hub\'s notes (command output) from this chat view',
    run: (_a, ctx) => { setTimeout(() => Native.clearNotes(ctx.agentId), 0); },
  });
  R({
    name: 'refresh', aliases: ['redraw'], area: 'View', desc: 'Redraw this chat', hidden: true,
    run: (_a, ctx) => { Native.refresh(ctx.agentId); },
  });

  // =====================================================================================================
  // App: notes, palette, settings… (the rest is reachable through /do)
  // =====================================================================================================
  const OPENERS = [
    ['notes', 'Open Notes', 'Ctrl+J', () => Notes.toggle()],
    ['palette', 'Open the command palette', 'Ctrl+K', () => AppUI.palette()],
    ['settings', 'Open Settings', 'Ctrl+,', () => AppUI.openSettings()],
    ['shortcuts', 'Keyboard shortcuts', 'Ctrl+/', () => AppUI.shortcutsHelp()],
    ['prompts', 'Manage saved prompts', '', () => Prompts.manage()],
    ['usage-table', 'Token usage table', '', () => AppUI.usageDialog()],
    ['deleted', 'Recently deleted chats', '', () => AppUI.trashDialog()],
  ];
  for (const [name, desc, keys, fn] of OPENERS) R({ name, area: 'App', desc, keys, run: () => { fn(); } });
  R({
    name: 'notify', aliases: ['notifications'], area: 'App', args: '[on | off]', desc: 'Notifications when a reply arrives while you look elsewhere',
    complete: () => ONOFF,
    run: async (args) => { const on = onOff(args, H.settings().notify !== false); H.config.settings = { ...H.settings(), notify: on }; await saveConfig(); return on ? 'Reply notifications on.' : 'Reply notifications off.'; },
  });
  R({ name: 'ontop', aliases: ['pin-window'], area: 'App', keys: 'Ctrl+Shift+T', desc: 'Keep Hearth above other windows (again: stop)', run: () => AppUI.toggleOnTop() });
  R({ name: 'echo', area: 'App', args: '<text>', desc: 'Show a note in this chat (nothing is sent)', run: (args) => args || ' ' });
  // A tiny calculator (no eval): + - * / % ^, parentheses, unary minus, and sqrt/sin/cos/round/abs/min/max/pi.
  function calc(src) {
    const toks = src.replace(/,/g, '.').match(/\d*\.?\d+(?:e[+-]?\d+)?|[a-z]+|\*\*|[-+*/%^()]|\S/gi) || [];
    let i = 0;
    const FN = { sqrt: Math.sqrt, sin: Math.sin, cos: Math.cos, tan: Math.tan, abs: Math.abs, round: Math.round, floor: Math.floor, ceil: Math.ceil, log: Math.log10, ln: Math.log };
    const peek = () => toks[i];
    const eat = (t) => { if (toks[i] !== t) throw new Error(`expected ${t}`); i += 1; };
    function atom() {
      const t = toks[i++];
      if (t === '(') { const v = expr(); eat(')'); return v; }
      if (t === '-') return -factor();
      if (t === '+') return factor();
      if (/^[a-z]+$/i.test(t || '')) {
        const n = t.toLowerCase();
        if (n === 'pi') return Math.PI;
        if (n === 'e') return Math.E;
        if (FN[n]) { eat('('); const v = expr(); eat(')'); return FN[n](v); }
        throw new Error(`unknown ${t}`);
      }
      const v = Number(t);
      if (!Number.isFinite(v)) throw new Error(`unexpected ${t ?? 'end'}`);
      return v;
    }
    function factor() { const b = atom(); if (peek() === '^' || peek() === '**') { i += 1; return b ** factor(); } return b; }
    function term() { let v = factor(); while (['*', '/', '%'].includes(peek())) { const op = toks[i++]; const r = factor(); v = op === '*' ? v * r : op === '/' ? v / r : v % r; } return v; }
    function expr() { let v = term(); while (peek() === '+' || peek() === '-') { const op = toks[i++]; const r = term(); v = op === '+' ? v + r : v - r; } return v; }
    const v = expr();
    if (i < toks.length) throw new Error(`unexpected ${toks[i]}`);
    return v;
  }
  R({
    name: 'calc', aliases: ['math'], area: 'App', args: '<expression>', desc: 'Quick math, e.g. /calc 1080*16/9 or /calc 60/128*4 (nothing is sent)',
    run: (args) => {
      if (!args) return 'Type a sum: `/calc 1920/1080`';
      let v;
      try { v = calc(args); } catch (err) { return `Can't compute that (${err.message}).`; }
      return `${args} = **${Number.isFinite(v) ? Math.round(v * 1e6) / 1e6 : v}**`;
    },
  });
  R({ name: 'time', aliases: ['now', 'date'], area: 'App', desc: 'The date and time (nothing is sent)', run: () => new Date().toLocaleString(undefined, { dateStyle: 'full', timeStyle: 'short' }) });

  // =====================================================================================================
  // Chains, your own commands, and small settings
  // =====================================================================================================
  R({
    name: 'run', aliases: ['chain', 'then'], area: 'App', args: '</cmd one ; /cmd two …>', desc: 'Run several commands in a row (handy in suggestion chips and your own /alias)',
    run: async (args, ctx) => {
      const steps = args.split(/\s*(?:;|\n)\s*(?=\/)/).map((x) => x.trim()).filter(Boolean);
      if (!steps.length) return 'Give it commands: `/run /wrap on ; /width wide`';
      for (const step of steps.slice(0, 12)) {
        if (!Commands.parse(step)) { ctx.say(`Skipped “${safe(step)}” (not a command)`); continue; }
        await Commands.exec(step, ctx.agentId);
      }
    },
  });
  // /alias name /command … : your own commands, kept in this app (localStorage) and listed under "Yours".
  const ALIAS_KEY = 'chat.aliases';
  const aliasUnreg = new Map();
  function registerAlias(name, text) {
    aliasUnreg.get(name)?.();
    aliasUnreg.set(name, R({
      name, area: 'Yours', args: '[more]', desc: `→ ${text.slice(0, 70)}`,
      run: async (args, ctx) => {
        // {args} in the alias is replaced by what you type after it; otherwise it's added at the end of the last command
        const full = text.includes('{args}') ? text.replace(/\{args\}/g, args) : `${text}${args ? ` ${args}` : ''}`;
        if (full.startsWith('/')) await Commands.exec(/\s;\s*\//.test(full) ? `/run ${full}` : full, ctx.agentId);
        else ctx.send(full);
      },
    }));
  }
  for (const [name, text] of Object.entries(store.get(ALIAS_KEY, {}))) { try { registerAlias(name, text); } catch { /* a bad saved name */ } }
  R({
    name: 'alias', aliases: ['my-command'], area: 'App', args: '<name> </command … | text>', desc: 'Make your own command: /alias wide /run /width wide ; /density compact',
    run: (args) => {
      const all = store.get(ALIAS_KEY, {});
      if (!args) return Object.keys(all).length ? `**Your commands**\n${Object.entries(all).map(([n, t]) => `- \`/${n}\` → ${safe(t)}`).join('\n')}\n\n\`/unalias <name>\` removes one.` : 'No commands of your own yet: `/alias focusmode /run /focus ; /zoom 115%`';
      const m = args.match(/^([a-z0-9][\w-]*)\s+([\s\S]+)$/i);
      if (!m) return 'Use `/alias <name> <what it does>`';
      const name = m[1].toLowerCase();
      if (Commands.get(name) && !aliasUnreg.has(name)) return `/${name} already exists. Pick another name.`;
      all[name] = m[2].trim();
      store.set(ALIAS_KEY, all);
      registerAlias(name, all[name]);
      return `Made \`/${name}\` → ${safe(all[name])}`;
    },
  });
  R({
    name: 'unalias', area: 'App', args: '<name>', desc: 'Remove one of your own commands',
    complete: (args) => Object.keys(store.get(ALIAS_KEY, {})).filter(has(args)).map((n) => ({ value: n })),
    run: (args) => {
      const all = store.get(ALIAS_KEY, {});
      const name = args.replace(/^\//, '').toLowerCase();
      if (!all[name]) return `You have no /${name}.`;
      delete all[name];
      store.set(ALIAS_KEY, all);
      aliasUnreg.get(name)?.(); aliasUnreg.delete(name);
      return `Removed /${name}.`;
    },
  });
  R({
    name: 'repeat', aliases: ['resend'], area: 'Messages', desc: 'Send your last message again (as a new message)',
    run: (_a, ctx) => { const chat = need(ctx); ctx.send(chat.messages[mustIndex(chat, 'last', 'user')].text); },
  });
  R({
    name: 'engines', aliases: ['engine'], area: 'Agents', desc: 'Whether Claude Code and Codex were found (and the paths from Settings → Engines)',
    run: async () => {
      const st = await window.hub.engineStatus();
      H.engineStatus = st;
      const paths = H.settings().enginePaths || {};
      return `**Engines**\n${Object.entries(st).map(([e, ok]) => `- ${e === 'claude' ? 'Claude Code' : 'Codex'}: ${ok ? 'found' : '**not found**'}${paths[e] ? ` · ${safe(paths[e])}` : ''}`).join('\n')}\n\nSettings → Engines points at them directly.`;
    },
  });
  R({
    name: 'chime', area: 'App', args: '[on | off | test]', desc: 'A soft chime when a reply lands in a chat you aren\'t looking at',
    complete: pick(['on', 'off', 'test']),
    run: (args) => { if (/^test$/i.test(args)) { ChatUX.chime(); return; } const on = onOff(args, store.get('chat.chime', false)); store.set('chat.chime', on); if (on) ChatUX.chime(); return on ? 'Chime on.' : 'Chime off.'; },
  });
  R({
    name: 'enter-sends', aliases: ['enter'], area: 'Compose', args: '[on | off]', desc: 'Enter sends (on, default) or makes a new line and Ctrl+Enter sends (off)',
    complete: () => ONOFF,
    run: (args, ctx) => { const on = onOff(args, store.get('chat.enterSends', true)); store.set('chat.enterSends', on); Native.refresh(ctx.agentId, { keepScroll: true }); return on ? 'Enter sends · Shift+Enter makes a new line.' : 'Enter makes a new line · Ctrl+Enter sends (commands still run on Enter).'; },
  });
  R({
    name: 'auto-title', area: 'Chat', args: '[on | off]', desc: 'Name new chats from their content after the first reply (free, no extra call)',
    complete: () => ONOFF,
    run: (args) => { const on = onOff(args, store.get('chat.autoTitle', false)); store.set('chat.autoTitle', on); return on ? 'New chats get a title from their content after the first reply.' : 'New chats keep their first line as the title.'; },
  });
  Native.hooks.event.push((event, chat) => {
    if (event.type !== 'done' || !store.get('chat.autoTitle', false) || chat.titled || chat.messages.filter((m) => m.role === 'assistant').length !== 1) return;
    const t = localTitle(chat);
    if (t) { chat.titled = true; Native.rename(chat.id, t); }
  });
  R({
    name: 'stats-all', aliases: ['overview'], area: 'Chat', desc: 'All your chats in numbers: per agent, this week, pinned, tagged',
    run: () => {
      const week = Date.now() - 7 * 864e5;
      const rows = nativeAgents().map((a) => { const list = H.chats.filter((c) => c.agentId === a.id); return list.length ? `- ${safe(a.name)}: ${plural(list.length, 'chat')} · ${list.filter((c) => c.updatedAt > week).length} this week` : null; }).filter(Boolean);
      return `**${plural(H.chats.length, 'chat')}** · ${H.chats.filter((c) => c.pinned).length} pinned · ${ChatUX.allTags().length} tags · ${ChatUX.allFolders().length} folders\n${rows.join('\n')}`;
    },
  });

  R({
    name: 'raw', aliases: ['source'], area: 'Messages', args: '[#]', desc: 'Show a reply\'s Markdown source in place (again: formatted)',
    run: (args, ctx) => { const chat = need(ctx); Native.toggleRaw(ctx.agentId, args ? mustIndex(chat, args) : mustIndex(chat, 'last', 'assistant')); },
  });
  R({
    name: 'autofold', area: 'View', args: '[on | off]', desc: 'Fold long replies automatically (on by default; “Show full reply” opens them)',
    complete: () => ONOFF,
    run: (args, ctx) => { const on = onOff(args, store.get('chat.autoFold', true) !== false); store.set('chat.autoFold', on); Native.refresh(ctx.agentId, { keepScroll: true }); return on ? 'Long replies start folded.' : 'Replies always show in full.'; },
  });
  R({
    name: 'spell', aliases: ['spellcheck'], area: 'Compose', args: '[on | off]', desc: 'Spell checking in the message box',
    complete: () => ONOFF,
    run: (args) => { const on = ChatUX.setPref('spell', onOff(args, ChatUX.pref('spell') !== false)); return on ? 'Spell check on.' : 'Spell check off.'; },
  });
  R({
    name: 'font', area: 'View', args: '<default | sans | serif | mono | rounded>', desc: 'The typeface of messages',
    complete: pick(Object.keys(ChatUX.FONTS)),
    run: (args) => { const f = Object.keys(ChatUX.FONTS).find((k) => k.startsWith(args.toLowerCase())) || 'default'; ChatUX.setPref('font', f); toast(`Message font: ${f}`, { timeout: 1000 }); },
  });
  R({
    name: 'sort', area: 'Chat', args: '<recent | oldest | title>', desc: 'How the chat list is ordered (pinned chats stay on top)',
    complete: pick(['recent', 'oldest', 'title']),
    run: (args) => { const k = ['recent', 'oldest', 'title'].find((x) => x.startsWith(args.toLowerCase())) || 'recent'; store.set('panel.sort', k); Panel.render(); toast(`Chats sorted: ${k}`, { timeout: 1000 }); },
  });
  R({
    name: 'archive', area: 'Chat', desc: 'Hide this chat from the list without deleting it (/filter archived shows them)',
    run: (_a, ctx) => { const chat = need(ctx); ChatUX.setMeta(chat.id, { archived: true }); pushUndo('unarchive', () => ChatUX.setMeta(chat.id, { archived: false })); return 'Archived: it\'s out of the list (`/filter archived` · `/unarchive` · `/undo`).'; },
  });
  R({
    name: 'unarchive', area: 'Chat', desc: 'Put this chat back in the list', hidden: false,
    run: (_a, ctx) => { const chat = need(ctx); ChatUX.setMeta(chat.id, { archived: false }); return 'Back in the list.'; },
  });
  R({
    name: 'next-unread', aliases: ['nu'], area: 'Chat', desc: 'Open the next chat with a reply you haven\'t seen',
    run: () => {
      const c = H.chats.find((x) => H.unreadChats?.has(x.id));
      if (!c) return 'You have seen every reply.';
      Native.open(c.agentId, c.id);
    },
  });

  // Every chat command is in the Ctrl+K palette too ("/name — what it does"); commands that need words
  // put "/name " in the chat box, the others run right away in the chat you're on.
  function chatAgentNow() {
    const id = H.activeId || '';
    if (H.isTool(id)) return Tools.dockedAgent(id.slice(5))?.id || H.claudeAgent()?.id;
    return H.agent(id)?.mode === 'native' ? id : H.claudeAgent()?.id;
  }
  window.addEventListener('load', () => setTimeout(() => {
    for (const d of Commands.list().filter((x) => !x.hidden && !['do', 'help'].includes(x.name))) {
      AppUI.addAction(`/${d.name} — ${d.desc}`, () => {
        const agentId = chatAgentNow();
        if (!agentId) return;
        if (/^</.test(d.args)) { activate(agentId); Native.setDraft(agentId, `/${d.name} `); } else Commands.exec(`/${d.name}`, agentId);
      }, d.keys || '');
    }
  }, 0));

  return { undo: () => Commands.run('undo'), TEMPLATES, TONES, PERSONAS, LANGS, localTitle };
})();
