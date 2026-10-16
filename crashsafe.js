// Nothing is lost when Hearth or the computer stops suddenly (round 50, crashsafe), the window's side. Loaded with
// safetynet (its lazy group), which restores drafts and Lab edits and shows the one card; this adds to it:
//   replies   an AI reply that was being written when Hearth closed comes back in its chat: the words so far, then
//             "Reply cut off — Hearth closed while it was being written" with Continue (offline.js: the same session,
//             one short line + your question). A reply that finished while the window's page was gone (it crashed
//             and reloaded) comes back whole. One still running then shows in its chat the moment it ends.
//   renders   a render / export / backup cut off by a crash: its half-made file went to the Trash (crashsafemain.js),
//             a line on the card says so; Open shows the render queue (Render again there)
//   saved     every reply that ends in a chat tells the main process it's saved (its journal copy is let go)
//   going down Windows ending the session for an update restart (a shutdown on the Mac): the journal and every
//             waiting save are written at once (ui.js saver, safetynet)
// Nothing here runs while you do nothing. Restores never write over newer data (crashsafe-core replyPlan).
const CrashSafe = (() => {
  const K = CrashSafeCore;
  const api = () => window.hub.crashsafe || null;
  const clip = (s, n) => { s = String(s || '').replace(/\s+/g, ' ').trim(); return s.length > n ? `${s.slice(0, n - 1)}…` : s; };
  const waiting = new Set(); // chats whose reply is still being written by an engine the last page started
  let took = null;

  const ack = (chatId) => api()?.ack?.(chatId).catch(() => {});
  const titleOf = (chatId, chat) => clip(chat?.title || (H.chats || []).find((c) => c.id === chatId)?.title || 'a chat', 40);
  const nameOf = (agentId) => H.agent?.(agentId)?.name || 'The AI';

  // ---------- what the main process kept → safetynet entries ----------
  async function entries() {
    const r = await api()?.take?.().catch(() => null);
    took = r;
    if (!r) return [];
    const out = [];
    const seen = new Set();
    for (const e of [...(r.orphans || []), ...(r.replies || [])]) {
      if (!e?.chatId || seen.has(e.chatId)) continue;
      seen.add(e.chatId);
      out.push({ k: 'reply', ...e, live: (r.orphans || []).includes(e) && !e.final });
    }
    for (const l of r.leftovers || []) out.push({ k: 'render', ...l });
    return out;
  }

  async function restoreReply(e) {
    if (typeof Native === 'undefined' || !H.agent?.(e.agentId)) { ack(e.chatId); return null; }
    const chat = await Native.load(e.chatId).catch(() => null);
    const title = titleOf(e.chatId, chat);
    const open = { k: 'chat', agentId: e.agentId, chatId: e.chatId };
    if (e.live) { // its engine is still writing (only the page had crashed): it lands in the chat when done
      waiting.add(e.chatId);
      return { k: 'reply', icon: '💬', label: `${nameOf(e.agentId)} is still writing its reply in “${title}” — it shows there when done`, hint: 'Open', open };
    }
    const p = K.replyPlan(e, chat);
    if (p.action === 'none') { ack(e.chatId); return null; }
    put(chat, p);
    ack(e.chatId);
    return p.action === 'final'
      ? { k: 'reply', icon: '💬', label: `${nameOf(e.agentId)}'s reply in “${title}” finished while the window was away — it's in the chat`, hint: 'Open', open }
      : { k: 'reply', icon: '💬', label: `${nameOf(e.agentId)}'s reply in “${title}” was cut off — what it wrote is kept, Continue is under it`, hint: 'Open', open };
  }
  function put(chat, p) {
    chat.messages.push(...p.messages);
    if (p.session?.id && (p.action === 'final' || !chat.session?.id)) chat.session = p.session;
    chat.updatedAt = Date.now();
    Native.save(chat);
    if (H.activeChat?.[chat.agentId] === chat.id) Native.refresh(chat.agentId, { keepScroll: true });
  }
  async function restoreRender(l) {
    return { k: 'render', icon: '⇪', label: K.leftoverLine(l), hint: l.kind === 'backup' ? '' : 'Open', open: { k: 'renders' } };
  }
  const restore = { reply: restoreReply, render: restoreRender };

  // a clean start (nothing to show on a card): what came back lands quietly, in its chat
  async function quietly(list) {
    for (const e of list || []) { try { if (e.k === 'reply') await restoreReply(e); } catch (err) { console.warn('crashsafe: restore', err); } }
    await done();
  }
  async function done() { if (took) { took = null; await api()?.done?.().catch(() => {}); } }

  async function open(o) {
    if (o?.k === 'chat') { activate(o.agentId); await Native.open(o.agentId, o.chatId); }
    else if (o?.k === 'renders' && typeof Renders !== 'undefined') Renders.open();
  }

  // ---------- while running ----------
  // a reply its page never saw the end of (the page crashed / reloaded while it ran): it lands in its chat now
  async function orphan(e) {
    if (!e?.chatId || !e.final) return;
    if (typeof Native !== 'undefined' && Native.isBusy?.(e.chatId)) return; // this page runs a new one in that chat
    const chat = await Native.load(e.chatId).catch(() => null);
    const p = K.replyPlan(e, chat);
    if (p.action !== 'none') put(chat, p);
    ack(e.chatId);
    if (waiting.delete(e.chatId) && p.action !== 'none') toast(`${nameOf(e.agentId)}'s reply in “${titleOf(e.chatId, chat)}” is in`, { timeout: 5000, action: { label: 'Open', fn: () => open({ k: 'chat', agentId: e.agentId, chatId: e.chatId }) } });
  }
  api()?.onOrphan?.((e) => { orphan(e).catch((err) => console.warn('crashsafe: orphan', err)); });
  // every reply that ends in a chat here is saved with it: its crash copy goes
  if (typeof Native !== 'undefined') Native.hooks.event.push((event, chat) => { if (chat?.id && ['done', 'stopped', 'error'].includes(event.type)) ack(chat.id); });
  // a Lab preview page's own process died: the pages still up, each preview checks it is one (tools/three.js crashCheck)
  api()?.onFrames?.((alive) => { for (const fn of [...(window.__labFrames || [])]) { try { fn(alive); } catch (err) { console.warn('crashsafe: frames', err); } } });
  // the computer is going down (Windows: an update restart): everything waiting is written now
  api()?.onFlush?.(() => { try { window.SafetyNet?.keepNow?.(); dispatchEvent(new Event('hearth:flush')); } catch (err) { console.warn('crashsafe: flush', err); } });

  return { entries, restore, quietly, done, open, orphan, get waiting() { return [...waiting]; } };
})();
window.CrashSafe = CrashSafe;
