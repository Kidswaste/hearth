// Lean attachments (round 40, attachlean): what an attachment costs, shown on its chip before sending, and what
// really reaches the AI (rules in attachlean-core.js):
//   - a picture over 1568 px is sent as a 1568 px copy (the owner's file stays as it is): "sent at 1568 px · ≈ 1.8k tok";
//   - a big text file, log or paste goes as an outline + the parts the message is about, the whole file one Read away
//     (Claude: the Read tool on Hearth's attachments folder; Astra: its read-only commands when it has file access);
//   - the same file again in a chat is one line pointing at the earlier message; changed, only the changed lines;
//   - click the cost on a chip: "send whole" for that attachment, this message (click again to undo).
// Native hooks: renderChips asks badge() for each chip, send() awaits prepare() before packing the attachments, and
// the chat's attachSeen (saved with the chat) remembers what was sent in which engine session.
const AttachLean = (() => {
  const C = AttachLeanCore;
  const sep = (dir) => (dir.includes('\\') ? '\\' : '/');
  let dirP = null;
  const attachDir = () => (dirP ||= Promise.resolve(window.hub.attachmentsDir()).catch(() => null));
  const safe = (n) => String(n || 'file').replace(/[^\w.\- ]+/g, '_').slice(-60) || 'file';
  const isImage = (a) => a.kind === 'image' && a.path && !a.lean?.ref;
  const isText = (a) => a.kind === 'text' && typeof (a.full ?? a.content) === 'string' && !a.ref && !a.tokens && !/^reference: /.test(a.name || '');
  const agentOf = (id) => H.agent(id) || {};
  const engineOf = (id) => (agentOf(id).engine === 'codex' ? 'codex' : 'claude');
  // Claude reads the attachments folder with its Read tool (Hearth turns it on for that message); Astra reads files
  // only with file access (its sandboxed shell)
  const canRead = (id) => engineOf(id) === 'claude' || Boolean(agentOf(id).workspace || (typeof Access !== 'undefined' && Access.isOn?.(id)));
  const sendSid = new Map(); // chatId → the engine session a message was sent into (hooks.send)

  // ---------- what was sent before in this chat ----------
  const keyOf = (a) => a.src || a.original || a.path || `name:${a.name}`;
  function seenFor(chat, a, h) {
    const all = chat?.attachSeen || {};
    const rec = all[keyOf(a)] || Object.values(all).find((r) => r.hash === h) || null;
    if (!rec) return null;
    return { ...rec, valid: C.valid(rec, { sessionId: chat.session?.id, messages: chat.messages?.length || 0 }) };
  }

  // ---------- when attached: measure (and scale a picture) ----------
  async function bytesOf(p) { const b = await window.hub.fs.read(p, { encoding: 'buffer', maxBytes: 200 * 1048576 }); return b instanceof Uint8Array ? b : new Uint8Array(b); }
  function b64(blob) { return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1] || ''); r.onerror = () => rej(r.error); r.readAsDataURL(blob); }); }
  async function studyImage(agentId, a) {
    const bytes = await bytesOf(a.path);
    const blob = new Blob([bytes]);
    const bmp = await createImageBitmap(blob);
    const plan = C.imagePlan({ name: a.name || a.path, w: bmp.width, h: bmp.height, bytes: bytes.length });
    bmp.close?.();
    const s = { kind: 'image', w: plan.w, h: plan.h, ow: bmp.width, oh: bmp.height, scale: plan.scale, tokens: plan.tokens, wholeTokens: plan.wholeTokens, hash: `${bytes.length}-${C.hash(String.fromCharCode(...bytes.subarray(0, 4096)))}-${C.hash(String.fromCharCode(...bytes.subarray(Math.max(0, bytes.length - 4096))))}` };
    if (plan.scale) {
      // the browser scales off the main thread (createImageBitmap resize), then encodes in the same format
      const small = await createImageBitmap(blob, { resizeWidth: plan.w, resizeHeight: plan.h, resizeQuality: 'high' });
      const cv = new OffscreenCanvas(plan.w, plan.h);
      cv.getContext('2d').drawImage(small, 0, 0);
      small.close?.();
      const out = await cv.convertToBlob({ type: plan.type, quality: 0.9 });
      const stem = String(a.name || 'picture').replace(/\.\w+$/, '');
      s.small = await window.hub.saveAttachment(`${stem} · ${C.MAX_PX}px.${plan.ext}`, await b64(out));
      s.bytes = out.size; s.origBytes = bytes.length;
    }
    const seen = seenFor(Native.chatOf(agentId), { ...a, src: a.video || a.path }, s.hash);
    if (seen?.valid && seen.hash === s.hash) { s.same = C.clock(seen.at); s.tokens = C.tok(`[Picture ${a.name}: the same one you saw at ${s.same}, earlier in this chat]`); }
    return s;
  }
  function studyText(agentId, a, message = '') {
    const text = a.full ?? a.content;
    const h = C.hash(text);
    const r = C.leanText({ name: a.name, text, message, canRead: canRead(agentId), path: '(attachments folder)', engine: engineOf(agentId) });
    const s = { kind: 'text', mode: r.mode, tokens: r.tokens, wholeTokens: r.wholeTokens, hash: h };
    const seen = seenFor(Native.chatOf(agentId), a, h);
    if (seen?.valid && seen.hash === h && (!seen.lean || canRead(agentId))) { s.same = C.clock(seen.at); s.tokens = 40; }
    return s;
  }
  function study(agentId, a) {
    if (a._lean) return a._lean;
    if (isImage(a)) a._lean = studyImage(agentId, a).catch((err) => { console.warn('attachlean: picture', err); return null; });
    else if (isText(a)) { a.full ??= a.content; a._lean = Promise.resolve().then(() => studyText(agentId, a)).catch((err) => { console.warn('attachlean: text', err); return null; }); }
    else return null;
    a._lean.then((s) => { a.lean = s; if (s && Native.view(agentId)?.attachments.includes(a)) Native.renderChips(agentId); });
    return a._lean;
  }

  // ---------- the chip's cost (Native.renderChips) ----------
  function badge(agentId, a) {
    if (!isImage(a) && !isText(a)) return null;
    if (!a._lean) study(agentId, a);
    const s = a.lean;
    if (!s) return el('span', { class: 'attach-lean wait', text: ' · …', title: 'Measuring what it costs' });
    const shown = { ...s, whole: Boolean(a.whole) };
    const can = s.kind === 'image' ? s.scale || s.same : s.mode === 'lean' || s.same;
    const title = s.kind === 'image'
      ? (a.whole ? `Sent whole: ${s.ow}×${s.oh} px, ≈ ${s.wholeTokens} tokens. Click to send it at ${C.MAX_PX} px again.`
        : s.same ? `The same picture as your message at ${s.same}: it isn't sent again. Click to send it anyway.`
          : s.scale ? `Your file stays ${s.ow}×${s.oh} px; the AI gets a ${s.w}×${s.h} copy (≈ ${s.tokens} tokens instead of ≈ ${s.wholeTokens}). Click to send it whole.` : `≈ ${s.tokens} tokens`)
      : (a.whole ? `Sent whole: ≈ ${s.wholeTokens} tokens. Click to send only what your message is about again.`
        : s.same ? `Unchanged since your message at ${s.same}: one line points at it instead of sending it again. Click to send it whole.`
          : s.mode === 'lean' ? `≈ ${s.wholeTokens} tokens in all: the AI gets an outline + the parts your message is about (≈ ${s.tokens}, depends on what you ask)${canRead(agentId) ? ' and can open the rest' : ''}. Click to send it whole.` : `≈ ${s.tokens} tokens, sent whole`);
    if (!can) return el('span', { class: 'attach-lean', text: ` · ${C.chipText(shown)}`, title });
    return el('button', { type: 'button', class: `attach-lean${a.whole ? ' whole' : ''}`, text: ` · ${C.chipText(shown)}`, title, dataset: { feature: 'Chat › Send whole' },
      on: { click: (e) => { e.preventDefault(); e.stopPropagation(); a.whole = !a.whole; Native.renderChips(agentId); } } });
  }

  // ---------- at send: what really goes (Native.send, before the attachments are packed) ----------
  // Rewrites the pending attachments in place (a text's content, a picture's path) and returns { readFiles, commit }:
  // readFiles asks engines.js for Claude's Read tool on the attachments folder for this message; commit(chat) records
  // what was sent once the message is in the chat.
  async function prepare(agentId, chat, message) {
    const v = Native.view(agentId);
    const atts = v?.attachments || [];
    const records = [];
    let readFiles = false;
    const dir = await attachDir();
    const read = canRead(agentId);
    const engine = engineOf(agentId);
    for (const a of atts.slice()) {
      if (isImage(a)) {
        const s = await (a._lean || study(agentId, a));
        if (!s) continue;
        const src = a.video || a.original || a.path;
        a.original ||= a.path;
        const seen = seenFor(chat, { ...a, src }, s.hash);
        if (!a.whole && seen?.valid && seen.hash === s.hash) {
          // the same picture again: one line instead of the picture (it is in the engine's history)
          Object.assign(a, { kind: 'text', content: `[Picture ${a.name}: the same one you saw at ${C.clock(seen.at)}, earlier in this chat]`, leanMeta: { same: C.clock(seen.at), tokens: s.tokens, wholeTokens: s.wholeTokens } });
          continue;
        }
        a.path = !a.whole && s.small ? s.small : a.original;
        a.leanMeta = { tokens: a.whole ? s.wholeTokens : s.tokens, wholeTokens: s.wholeTokens, ...(s.small && !a.whole ? { px: `${s.w}×${s.h}` } : {}) };
        records.push({ key: src, hash: s.hash, name: a.name, lean: false });
        continue;
      }
      if (!isText(a)) continue;
      const text = a.full ?? a.content;
      const h = C.hash(text);
      const seen = seenFor(chat, a, h);
      // the whole text is kept in the attachments folder (by its content, written once) when the AI may open it
      // or a later message may diff against it
      let copy = null;
      if (dir && C.tok(text) > 1000) {
        copy = `${dir}${sep(dir)}lean-${h}-${safe(a.name)}${/\.\w{1,6}$/.test(a.name) ? '' : '.txt'}`;
        try { if (!(await window.hub.fs.stat(copy))) await window.hub.fs.write(copy, text); } catch (err) { console.warn('attachlean: copy', err); copy = null; }
      }
      let prev = null;
      if (seen?.valid && seen.copy && seen.hash !== h && (!seen.lean || read)) { try { prev = await window.hub.fs.read(seen.copy, { maxBytes: C.MAX_BYTES }); } catch { prev = null; } }
      const ag = C.again({ name: a.name, text, seen, prev, canRead: read, whole: a.whole, copy });
      let out;
      if (ag.mode === 'same' || ag.mode === 'diff') { out = { text: ag.text, tokens: ag.tokens, wholeTokens: C.tok(text), mode: ag.mode }; if (read && seen.lean && engine === 'claude') readFiles = true; }
      else {
        out = C.leanText({ name: a.name, text, message, canRead: read && Boolean(copy), path: copy, whole: a.whole, engine });
        if (ag.note && out.mode === 'lean') out.text = out.text.replace('\n', `\n(${ag.note})\n`);
        if (out.mode === 'lean' && read && copy && engine === 'claude') readFiles = true;
      }
      a.content = out.text.replace(/^<file name="[^"]*"[^>]*>\n?|\n?<\/file>$/g, '');
      a.wrapped = out.text; // packAttachments sends it as is (attributes and all)
      a.leanMeta = { mode: out.mode, tokens: out.tokens, wholeTokens: out.wholeTokens, ...(ag.mode === 'same' || ag.mode === 'diff' ? { [ag.mode]: C.clock(seen.at) } : {}) };
      // the same file: the record stays as it was (the AI has that message); changed: the new version is what it has now
      if (ag.mode !== 'same') records.push({ key: keyOf(a), hash: h, name: a.name, lean: ag.mode === 'diff' ? Boolean(seen.lean) : out.mode === 'lean', copy, ...(ag.mode === 'diff' ? { n: seen.n, at: seen.at } : {}) });
    }
    return {
      readFiles,
      commit(c) {
        if (!c || !records.length) return;
        c.attachSeen ||= {};
        const now = Date.now();
        for (const r of records) c.attachSeen[r.key] = { hash: r.hash, name: r.name, at: r.at || now, lean: r.lean, copy: r.copy || null, sid: null, pending: true, n: r.n ?? c.messages.length };
        // keep the 40 newest
        const keys = Object.keys(c.attachSeen).sort((x, y) => c.attachSeen[y].at - c.attachSeen[x].at);
        for (const k of keys.slice(40)) delete c.attachSeen[k];
      },
    };
  }

  // After a reply: the records sent with it now belong to the session it ran in; records of the session it continued
  // follow it (Claude may hand back a new id for a resumed session); an error drops what that message recorded.
  function onEvent(event, chat) {
    const seen = chat?.attachSeen;
    if (!seen) return;
    const was = sendSid.get(chat.id);
    const now = chat.session?.id || null;
    for (const [k, r] of Object.entries(seen)) {
      if (r.pending) {
        if (event.type === 'error' || !now) { delete seen[k]; continue; }
        r.sid = now; delete r.pending;
      } else if (was && r.sid === was && now && now !== was) r.sid = now;
    }
  }

  function register() {
    Native.hooks.send.push((agentId, chat) => { sendSid.delete(chat.id); sendSid.set(chat.id, chat.session?.id || null); if (sendSid.size > 64) sendSid.delete(sendSid.keys().next().value); }); // (round 48, memory48) the last 64 chats sent into, not every chat of the day
    Native.hooks.event.push(onEvent);
    if (typeof Commands === 'undefined') return;
    const need = (ctx) => { if (!ctx.agentId || H.agent(ctx.agentId)?.mode !== 'native') throw new Error('Run it in a Claude or Astra chat'); return ctx.agentId; };
    if (!Commands.get('send-whole')) Commands.register({
      name: 'send-whole', args: '[on|off]', area: 'Compose', keywords: 'attachment full original tokens trimmed lean picture file paste',
      desc: 'Send this message\'s attachments whole (full-size pictures, whole files) instead of trimmed; off: trimmed again',
      complete: () => ['on', 'off'].map((value) => ({ value })),
      run: (args, ctx) => {
        const id = need(ctx);
        const v = Native.view(id);
        const list = (v?.attachments || []).filter((a) => isImage(a) || isText(a));
        if (!list.length) return 'No pictures or files in the chat box to send whole.';
        const on = !/^off$/i.test(String(args || '').trim());
        for (const a of list) a.whole = on;
        Native.renderChips(id);
        return on ? `${list.length} attachment${list.length > 1 ? 's' : ''} will go whole (≈ ${C.fmtTok(list.reduce((s, a) => s + (a.lean?.wholeTokens || 0), 0))} tokens).` : 'Back to trimmed: only what your message is about.';
      },
    });
    if (!Commands.get('attach-costs')) Commands.register({
      name: 'attach-costs', args: '', area: 'Compose', keywords: 'attachment tokens cost estimate chips',
      desc: 'What the attachments in the chat box will cost, whole and as sent',
      run: async (args, ctx) => {
        const id = need(ctx);
        const list = (Native.view(id)?.attachments || []).filter((a) => isImage(a) || isText(a));
        if (!list.length) return 'Nothing attached.';
        const rows = [];
        for (const a of list) { const s = a.lean || await study(id, a); if (s) rows.push(`- ${a.name}: ${C.chipText({ ...s, whole: Boolean(a.whole) })}${!a.whole && s.wholeTokens > s.tokens ? ` (whole: ≈ ${C.fmtTok(s.wholeTokens)})` : ''}`); }
        return `${rows.join('\n')}\nClick a chip's cost to send that one whole.`;
      },
    });
  }
  if (typeof Native !== 'undefined') register();
  try { Keys.add({ area: 'Chat', keys: 'Click the cost on an attachment chip', what: 'send that picture / file whole this time (it\'s trimmed to what your message is about by default)' }); } catch { /* keys.js not loaded */ }

  return { badge, prepare, study, onEvent, canRead, MAX_BYTES: C.MAX_BYTES, PASTE_CHARS: C.PASTE_CHARS, _test: { seenFor, keyOf } };
})();
