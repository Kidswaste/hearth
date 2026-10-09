// A calm chat surface (round 9, chatcore): every part of a message has its own right-click menu (folded tool calls,
// attachments, suggestion chips, plans, second opinions, the compact divider, the live status, pins, day lines, saved
// memories, answered questions, the context mark), so the same gesture works everywhere and nothing needs a button
// on screen. The menus are small and end with Customise this… (declutter.js).
const ChatCalm = (() => {
  if (typeof Declutter === 'undefined') return {};
  const D = Declutter;
  const agentOf = (node) => H.agents().find((a) => Native.view(a.id)?.root.contains(node))?.id || null;
  const msgOf = (node) => { const m = node.closest('.msg[data-index]'); const a = agentOf(node); const chat = a && Native.current(a); return { agentId: a, chat, index: m ? Number(m.dataset.index) : -1, m: chat && m ? chat.messages[Number(m.dataset.index)] : null }; };
  const cmd = (line, agentId) => () => Commands.exec(line, agentId);

  // folded tool calls: open the list, copy it
  D.ctx('.msg .tool-fold', 'Chat', (d) => {
    const { agentId, m } = msgOf(d);
    const steps = (m?.tools || []).map((t) => Native.toolLabel?.(t) || t);
    return [
      { label: d.open ? 'Fold the steps' : steps.length === 1 ? 'Show the step' : `Show the ${steps.length} steps`, action: () => { d.open = !d.open; } },
      { label: 'Copy the steps', action: () => copyText(steps.join('\n'), 'Steps copied') },
      agentId && H.agent(agentId)?.dock ? { label: 'The director\'s tool log', action: cmd('/director-activity', agentId) } : null,
    ].filter(Boolean);
  });
  // an attachment on a message you sent: what went along with it
  D.ctx('.msg .msg-attachments .attach-chip', 'Chat', (chip) => {
    const { agentId, m } = msgOf(chip);
    const i = [...chip.parentElement.children].indexOf(chip);
    const a = m?.attachments?.[i];
    const img = a?.kind === 'image' ? (m.images || [])[m.attachments.slice(0, i + 1).filter((x) => x.kind === 'image').length - 1] : null;
    return [
      img ? { label: 'Open the picture', action: () => (typeof CaptureView !== 'undefined' ? CaptureView.open(img) : window.hub.fs.open(img)) } : null,
      img && agentId ? { label: 'Attach it again', action: () => Native.attachPaths(agentId, [img]) } : null,
      m?.sent ? { label: 'Show what was sent', action: () => Modal.alert('Sent with this message', m.sent.length > 6000 ? `${m.sent.slice(0, 6000)}…` : m.sent) } : null,
      { label: 'Copy its name', action: () => copyText(a?.name || chip.textContent.trim(), 'Copied') },
    ].filter(Boolean);
  });
  // a suggestion chip under the last reply
  D.ctx('.msg .suggest-chip', 'Chat', (b) => {
    const agentId = agentOf(b);
    const s = b.dataset.suggest || b.textContent;
    const isCmd = s.startsWith('/');
    return [
      { label: isCmd ? 'Run it' : 'Send it', action: () => b.click() },
      { label: 'Put it in my message', action: () => Native.insertDraft(agentId, s) },
      { label: 'Copy it', action: () => copyText(s, 'Copied') },
      isCmd ? { label: 'What does it do?', action: cmd(`/what ${s.slice(1).split(/\s/)[0]}`, agentId) } : null,
    ].filter(Boolean);
  });
  // the plan card (chat_progress / Codex's todo list)
  D.ctx('.msg .progress-card', 'Chat', (card) => [
    { label: 'Copy the plan', action: () => copyText([...card.querySelectorAll('li')].map((li) => `${li.classList.contains('done') ? '✓' : li.classList.contains('doing') ? '…' : '·'} ${li.textContent}`).join('\n'), 'Plan copied') },
  ]);
  // a second opinion (card in a reply, or its own message)
  D.ctx('.msg .opinion-card, .msg.opinion', 'Chat', (card) => {
    const { agentId } = msgOf(card);
    const text = card.querySelector('.body')?.innerText || '';
    return [
      { label: 'Copy the opinion', action: () => copyText(text, 'Copied') },
      agentId ? { label: 'Quote it in my message', action: () => Native.insertDraft(agentId, `${text.split('\n').map((l) => `> ${l}`).join('\n')}\n\n`) } : null,
      card.querySelector('[data-msg-act="apply-opinion"]') ? { label: 'Ask to use it', action: () => card.querySelector('[data-msg-act="apply-opinion"]').click() } : null,
    ].filter(Boolean);
  });
  // where the context was compacted
  D.ctx('.messages .compact-divider', 'Chat', (d) => [
    { label: d.open ? 'Fold the summary' : 'Read the summary', action: () => { d.open = !d.open; } },
    { label: 'Copy the summary', action: () => copyText(d.querySelector('.body')?.innerText || '', 'Summary copied') },
  ]);
  // the reply being written
  D.ctx('.msg.streaming', 'Chat', (node) => {
    const agentId = agentOf(node);
    const v = agentId && Native.view(agentId);
    return [
      { label: '■ Stop', key: 'Esc', action: () => Native.stop(agentId) },
      node.querySelector('details.thinking') ? { label: 'Watch the thinking', action: () => { const d = node.querySelector('details.thinking'); d.open = !d.open; } } : null,
      v ? { label: v.scrollLock ? 'Follow the reply again' : 'Stop following the reply', action: () => { v.scrollLock = !v.scrollLock; if (!v.scrollLock) { v.follow = true; v.list.scrollTop = v.list.scrollHeight; } } } : null,
    ].filter(Boolean);
  });
  // pinned messages, day lines, the "New" line
  D.ctx('.messages .pinned-strip', 'Chat', (s) => {
    const agentId = agentOf(s);
    return [{ label: 'Next pinned message', action: () => s.click() }, { label: 'Pinned messages…', action: cmd('/pins', agentId) }, { label: 'Unpin them all', action: cmd('/unmark all', agentId) }];
  });
  D.ctx('.messages .day-sep, .messages .new-sep', 'Chat', (s) => {
    const agentId = agentOf(s);
    const list = s.closest('.messages');
    return [
      { label: 'First message', key: 'Alt+Home', action: () => { list.scrollTop = 0; } },
      { label: 'Latest message', key: 'Alt+End', action: () => { list.scrollTop = list.scrollHeight; } },
      { label: 'Jump to…', action: () => Native.setDraft(agentId, '/jump ') },
    ];
  });
  // a saved memory, an answered question, the context mark, the marks badge
  D.ctx('.msg .memory-chip', 'Chat', (c) => [
    c.querySelector('.undo-memory') ? { label: 'Undo: forget it', action: () => c.querySelector('.undo-memory').click() } : null,
    { label: 'What it remembers…', action: cmd('/memory', agentOf(c)) },
  ].filter(Boolean));
  D.ctx('.msg .qa-done', 'Chat', (q) => [{ label: 'Copy the question and answer', action: () => copyText(q.innerText.trim(), 'Copied') }]);
  D.ctx('.msg .ctx-sent', 'Chat', (s) => {
    const { agentId, m } = msgOf(s);
    return [
      { label: 'What went along', action: () => Modal.alert('Sent along with your words', m?.ctxLine || s.title) },
      { label: 'This chat works with…', action: cmd('/chat-context', agentId) },
      { label: 'Never add it', hint: '/chat-context auto off', action: cmd('/chat-context auto off', agentId) },
    ];
  });
  D.ctx('.msg .msg-marks', 'Chat', (b) => {
    const { agentId, index } = msgOf(b);
    return [{ label: 'Clear the marks on this message', action: cmd(`/unmark ${index + 1}`, agentId) }, { label: 'Bookmarks…', action: cmd('/bookmarks', agentId) }];
  });
  // banners in the chat (long chat, imported / continued)
  D.ctx('.messages .long-chat, .messages .import-banner', 'Chat', (b) => {
    const agentId = agentOf(b);
    return [{ label: '🗜 Compact context', action: () => Native.compact(agentId) }, { label: 'New chat from a summary', action: () => Native.summarizeAndContinue(agentId) }, { label: 'What each message costs', action: cmd('/context', agentId) }];
  });
  // a hub note (command output)
  D.ctx('.messages .msg.note', 'Chat', (n) => [
    { label: 'Copy it', action: () => copyText(n.querySelector('.body')?.innerText || '', 'Copied') },
    { label: 'Dismiss', action: () => n.querySelector('.note-x')?.click() },
    { label: 'Dismiss every note', key: 'Esc', action: () => Native.clearNotes(agentOf(n)) },
  ]);
  try { Keys.add({ area: 'Chat', keys: 'Right-click any part of a message', what: 'its own menu: steps, attachments, chips, plans, opinions, pins, notes…' }); } catch { /* keys.js not loaded */ }
  return {};
})();
