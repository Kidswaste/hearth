// (round 80, laberrors80) A scene's health flows back to the chat that works on it. A scene can break AFTER a Lab tool
// call answered: a runtime error a few frames later, a shader that doesn't compile, a camera gone NaN, a layer that
// throws on every frame, a file that 404s, the graphics card resetting. Until now the AI only learned it by asking.
//   · the preview pages (the Lab on screen and the backstage, tools/three-sandbox.html __labProblems) say each problem
//     once and send counts after (never per frame); here they're kept per scene, per layer + message + line, with the
//     first / last time seen, how often, and whether the layer was paused
//   · the next tool call of a chat linked to that scene gets ONE short "health:" line in its answer when something
//     new broke since that chat last heard (bridge.js → decorate). Healthy: nothing is added, not one token
//   · in the chat, a quiet note under the last reply: "⚠ Scene error in Neon · Ask Claude to fix" — one click sends a
//     prepared message with the error and the layer's code around it (never sent by itself)
//   · a layer that throws on every frame is paused by the page after 90 frames (its last picture stays, the rest of
//     the preview keeps its framerate): a note over the preview says so, with ▶ Resume. Its next edit runs it again.
// Nothing runs while the scenes are healthy: no timer, no per-frame work, no per-call work beyond one Map lookup.
const LabHealth = (() => {
  const scenes = new Map(); // scene id → Map(key → { key, kind, layer, line, message, first, last, count, paused, frames, src, ok })
  const where = { screen: null, backstage: null }; // the scene each preview page runs now
  const told = new Map(); // chat id → Map(key → 'n' | 'f'): what that chat's AI was told (n: an error, f: every frame)
  const chipped = new Map(); // chat id → the problems its note showed (a dismissed note stays away until a new one)
  const stats = { notes: 0, lines: 0, chips: 0, asked: 0, paused: 0, resumed: 0, cleared: 0 };
  let off = false; // dev checks: the tokens check compares an answer with and without it
  const RECENT = 120000; // an error that happened once and not since 2 min isn't news for a chat's first call
  const clip = (s, n) => { const t = String(s ?? '').replace(/\s+/g, ' ').trim(); return t.length > n ? `${t.slice(0, n - 1)}…` : t; };
  const keyOf = (r) => `${r.layer || ''}|${r.line || ''}|${r.message}`;
  const S = () => (typeof ThreeLab !== 'undefined' ? ThreeLab.scenes : null);
  const everyFrame = (r) => Boolean(r.paused || (r.kind === 'runtime' && r.count >= 30 && r.count / Math.max(0.5, (r.last - r.first) / 1000) >= 15));
  const active = (r, now = Date.now()) => r.kind !== 'gpu' && (r.paused || everyFrame(r) || r.kind === 'camera' || r.kind === 'shader' || now - r.last < RECENT);

  // ---------- what the preview pages say ----------
  function layerOf(sceneId, id) {
    const sk = S()?.get(sceneId); if (!sk) return null;
    let Ls = []; try { Ls = S().layersOf(sk) || []; } catch { /* gone */ }
    return Ls.find((L) => L.id === id) || (!id && Ls.length === 1 ? Ls[0] : null) || null;
  }
  const nameOf = (sceneId, id) => layerOf(sceneId, id)?.name || (id ? String(id) : null);
  function put(sceneId, r, src) {
    let m = scenes.get(sceneId);
    if (!m) { m = new Map(); scenes.set(sceneId, m); }
    const key = keyOf(r);
    const x = m.get(key);
    if (x) Object.assign(x, r, { key, first: Math.min(x.first, r.first ?? x.first), count: Math.max(x.count, r.count ?? x.count + 1), src });
    else { if (m.size >= 40) return; m.set(key, { count: 1, first: Date.now(), last: Date.now(), ...r, key, src }); stats.notes += 1; }
    changed(sceneId);
  }
  function clearLayer(sceneId, layer) {
    const m = scenes.get(sceneId); if (!m) return;
    let n = 0;
    for (const [k, r] of m) if ((r.layer || null) === (layer || null)) { m.delete(k); n += 1; }
    if (!m.size) scenes.delete(sceneId);
    if (n) { stats.cleared += n; changed(sceneId); }
    if (pill?.dataset.layer === String(layer)) hidePill();
  }
  // msg: a preview page's message; sceneId: the scene that page runs; src: 'screen' | 'backstage'
  function fromBox(m, sceneId, src = 'screen') {
    if (!m || !sceneId) return;
    if (where[src] && where[src] !== sceneId) { // that page runs another scene now: the last one's problems were its run's
      const old = scenes.get(where[src]);
      if (old) { for (const [k, r] of old) if (r.src === src) old.delete(k); if (!old.size) scenes.delete(where[src]); changed(where[src]); }
      if (src === 'screen') hidePill();
    }
    where[src] = sceneId;
    const now = Date.now();
    const lid = (id) => id || layerOf(sceneId, null)?.id || null;
    if (m.type === 'error') put(sceneId, { kind: m.kind || (/^GLSL|shader/i.test(String(m.message)) ? 'shader' : 'runtime'), layer: lid(m.layer), line: m.line || null, message: clip(m.message, 300), last: now }, src);
    else if (m.type === 'health') for (const r of m.recs || []) put(sceneId, { kind: r.kind || 'runtime', layer: lid(r.layer), line: r.line || null, message: clip(r.message, 300), first: r.first || now, last: r.last || now, count: r.count || 1, ...(r.paused ? { paused: true, frames: r.frames } : {}) }, src);
    else if (m.type === 'layer-paused') {
      stats.paused += 1;
      put(sceneId, { kind: 'runtime', layer: lid(m.layer), line: m.line || null, message: clip(m.message, 300), last: now, paused: true, frames: m.frames }, src);
      if (src === 'screen') showPill(sceneId, lid(m.layer), m);
    } else if (m.type === 'health-clear') clearLayer(sceneId, m.layer || null);
    else if (m.type === 'gpu-lost') put(sceneId, { kind: 'gpu', layer: null, line: null, message: 'the preview lost its graphics context (the graphics card reset or was busy)', first: now, last: now, count: 1 }, src);
    else if (m.type === 'gpu-restored') { const x = [...(scenes.get(sceneId)?.values() || [])].find((r) => r.kind === 'gpu'); if (x) { x.ok = true; changed(sceneId); } }
  }

  // ---------- the "health:" line in a tool's answer ----------
  const sceneOf = (chatId, tool) => (chatId && typeof ChatScenes !== 'undefined' ? ChatScenes.linkOf?.(chatId) : null) || (/^three_/.test(tool) ? S()?.currentId?.() : null) || null;
  const ago = (t, now) => { const s = Math.max(1, Math.round((now - t) / 1000)); return s < 120 ? `${s} s` : `${Math.round(s / 60)} min`; };
  function words(sceneId, r, now = Date.now()) {
    const who = r.layer ? `layer "${clip(nameOf(sceneId, r.layer), 30)}"` : 'the scene';
    const at = r.line ? ` at line ${r.line}` : '';
    const msg = clip(r.message, 140);
    if (r.kind === 'gpu') return `the preview lost its graphics context ${ago(r.first, now)} ago${r.ok ? ' and got it back (the layers were rebuilt)' : ' (Hearth is bringing it back)'}`;
    if (r.kind !== 'runtime') return `${who}: ${msg}`;
    if (everyFrame(r)) return `${who} throws ${msg}${at} every frame since ${ago(r.first, now)}${r.paused ? ` (paused after ${r.frames || 90} frames so the preview stays smooth; its next edit runs it again)` : ''}`;
    return `${who} threw ${msg}${at} (${r.count > 1 ? `${r.count}× since ${ago(r.first, now)}` : `${ago(r.first, now)} ago`})`;
  }
  // → the result with one "health:" line, or the same result object when there's nothing new (healthy: always)
  function decorate(tool, result, chatId, startedAt = 0) {
    if (off || !chatId || !result || !scenes.size) return result;
    const sceneId = sceneOf(chatId, tool);
    const m = sceneId && scenes.get(sceneId);
    if (!m?.size) return result;
    const now = Date.now();
    let seen = told.get(chatId);
    const text = result.ok === false ? String(result.error || '') : typeof HubBridge !== 'undefined' ? HubBridge.fmtText(result.value) : String(result.value ?? '');
    const fresh = [];
    for (const r of m.values()) {
      const sig = everyFrame(r) ? 'f' : 'n';
      if (seen?.get(r.key) === sig || (r.kind === 'gpu' && seen?.has(r.key))) continue;
      if (!seen?.has(r.key) && !active(r, now) && r.kind !== 'gpu') continue; // old, quiet: not news
      (seen ||= new Map()).set(r.key, sig);
      if (sig === 'n' && text.includes(clip(r.message, 60).replace(/…$/, ''))) continue; // its own answer already says it
      fresh.push(r);
    }
    if (seen) told.set(chatId, seen);
    if (!fresh.length) return result;
    const order = (r) => (r.paused ? 0 : everyFrame(r) ? 1 : r.kind === 'shader' ? 2 : r.kind === 'camera' ? 3 : r.kind === 'runtime' ? 4 : r.kind === 'asset' ? 5 : 6);
    fresh.sort((a, b) => order(a) - order(b));
    const items = fresh.slice(0, 3).map((r) => words(sceneId, r, now));
    if (fresh.length > 3) items.push(`${fresh.length - 3} more (three_console)`);
    const line = items.join('; ');
    stats.lines += 1;
    if (result.ok === false) return { ...result, error: `${String(result.error || '').replace(/\s*$/, '')}\nhealth: ${line}` };
    const v = result.value;
    if (v && typeof v === 'object' && !Array.isArray(v)) return { ...result, value: { ...v, health: line } };
    if (typeof v === 'string') return { ...result, value: `${v}\nhealth: ${line}` };
    if (v === undefined) return { ...result, value: { health: line } };
    return { ...result, value: { result: v, health: line } };
  }

  // ---------- the note in the chat ----------
  const whoOf = (agentId) => { const a = H.agent?.(agentId); return a?.engine === 'codex' ? 'Astra' : a?.name && !/director/i.test(a.name) ? a.name : 'Claude'; };
  const chatsOf = (sceneId) => (typeof ChatScenes === 'undefined' ? [] : (H.chats || []).filter((c) => ChatScenes.linkOf?.(c.id) === sceneId));
  let paintT = 0; const dirty = new Set();
  function changed(sceneId) {
    dirty.add(sceneId);
    if (!paintT) paintT = setTimeout(() => { paintT = 0; const ids = [...dirty]; dirty.clear(); for (const id of ids) for (const c of chatsOf(id)) paintChat(c.id); }, 400);
  }
  function worst(sceneId) {
    const m = scenes.get(sceneId); if (!m) return [];
    const now = Date.now();
    const rank = (r) => (r.paused ? 0 : everyFrame(r) ? 1 : r.kind === 'shader' ? 2 : r.kind === 'camera' ? 3 : r.kind === 'runtime' ? 4 : 5);
    return [...m.values()].filter((r) => active(r, now)).sort((a, b) => rank(a) - rank(b));
  }
  function noteBox(agentId) { return Native.view?.(agentId)?.list?.querySelector('.msg.note[data-note-id="scene-health"]') || null; }
  function dropNote(agentId) { const n = noteBox(agentId); if (n) { n.dataset.gone = '1'; n.remove(); } }
  function paintChat(chatId) {
    if (typeof Native === 'undefined') return;
    const c = (H.chats || []).find((x) => x.id === chatId);
    if (!c || H.activeChat?.[c.agentId] !== chatId || !Native.hasView?.(c.agentId)) return;
    const sceneId = typeof ChatScenes !== 'undefined' ? ChatScenes.linkOf?.(chatId) : null;
    const list = sceneId ? worst(sceneId) : [];
    if (!list.length) { if (noteBox(c.agentId)) dropNote(c.agentId); chipped.delete(chatId); return; }
    if (Native.isBusy?.(chatId)) return; // its AI is at work: the next call's answer tells it; the note waits for the end of the reply
    const sig = list.map((r) => `${r.key}|${everyFrame(r) ? 'f' : 'n'}`).sort().join('\n');
    if (chipped.get(chatId) === sig) return; // shown (or dismissed) for these very problems
    chipped.set(chatId, sig);
    const r = list[0];
    const layer = r.layer ? clip(nameOf(sceneId, r.layer), 28) : (S()?.get(sceneId)?.name || 'the scene');
    const what = r.paused ? 'paused: it threw on every frame' : everyFrame(r) ? 'it throws on every frame' : r.kind === 'shader' ? 'a shader didn\'t compile' : r.kind === 'camera' ? 'its camera went NaN' : r.kind === 'asset' ? 'a file didn\'t load' : 'it threw an error';
    const who = whoOf(c.agentId);
    const box = Native.note(c.agentId, `⚠ Scene error in **${layer}** · ${what}${list.length > 1 ? ` (+${list.length - 1})` : ''}`, { id: 'scene-health', quiet: false,
      actions: [{ label: `Ask ${who} to fix`, title: 'Sends a message with the error and the code around it (you see it in the chat)', run: () => ask(c.agentId, chatId) }] });
    box?.classList.add('scene-health-note');
    stats.chips += 1;
  }
  // the code around the line (or the start of the layer), numbered
  function excerpt(L, line) {
    const lines = String(L?.code || '').split('\n');
    if (!lines.length || !L?.code) return '';
    const a = line ? Math.max(1, line - 6) : 1; const b = line ? Math.min(lines.length, line + 6) : Math.min(lines.length, 24);
    const w = String(b).length;
    return lines.slice(a - 1, b).map((t, i) => `${String(a + i).padStart(w)}${a + i === line ? '>' : '|'} ${t}`).join('\n');
  }
  // the prepared message: what broke, in words, and the layer's code around it (the owner's click sends it)
  function message(chatId) {
    const sceneId = typeof ChatScenes !== 'undefined' ? ChatScenes.linkOf?.(chatId) : null;
    const list = sceneId ? worst(sceneId) : [];
    if (!list.length) return null;
    const sk = S()?.get(sceneId);
    const now = Date.now();
    const parts = [`The Lab scene "${sk?.name || 'this chat\'s scene'}" broke after your last changes:`];
    for (const r of list.slice(0, 3)) parts.push(`- ${words(sceneId, r, now)}`);
    const r = list[0];
    const L = r.layer ? layerOf(sceneId, r.layer) : null;
    const ex = excerpt(L, r.line);
    if (ex) parts.push('', `Layer "${L.name}"${r.line ? ` around line ${r.line}` : ''}:`, '```js', ex, '```');
    parts.push('', 'Please fix it.');
    return parts.join('\n');
  }
  async function ask(agentId, chatId) {
    const text = message(chatId);
    if (!text) { dropNote(agentId); return; }
    dropNote(agentId);
    stats.asked += 1;
    await Native.send(agentId, text);
  }

  // ---------- the note over the preview: a paused layer, ▶ Resume ----------
  let pill = null;
  function hidePill() { if (pill) { pill.remove(); pill = null; } }
  function showPill(sceneId, layer, m) {
    const host = typeof ThreeLab !== 'undefined' ? ThreeLab.healthHost : null;
    if (!host?.host) return;
    hidePill();
    const name = clip(nameOf(sceneId, layer) || 'A layer', 28);
    pill = el('div', { class: 'lab-health-pill', role: 'status', dataset: { layer: String(layer || ''), feature: 'Paused layer' } },
      el('span', { text: `⏸ ${name} is paused: it threw ${clip(m.message, 70)} on every frame` }),
      el('button', { type: 'button', class: 'ghost small', text: '▶ Resume', title: 'Run it again (it pauses again if it still throws)', on: { click: () => resume(layer) } }),
      el('button', { type: 'button', class: 'ghost small', text: '×', title: 'Hide this note (the layer stays paused until its next edit)', 'aria-label': 'Hide', on: { click: hidePill } }));
    host.host.append(pill);
  }
  function resume(layer) {
    const host = typeof ThreeLab !== 'undefined' ? ThreeLab.healthHost : null;
    host?.send?.({ type: 'resume-layer', layer });
    stats.resumed += 1;
    const id = host?.sceneId?.();
    if (id) clearLayer(id, layer);
    hidePill();
  }

  if (typeof Native !== 'undefined') {
    Native.hooks.finish?.push((ev, chat) => { if (chat?.id && scenes.size) setTimeout(() => paintChat(chat.id), 300); });
    Native.hooks.render?.push((agentId) => { const id = H.activeChat?.[agentId]; if (id && (scenes.size || chipped.has(id))) paintChat(id); });
  }

  return {
    fromBox, decorate, message, resume, words, paintChat,
    state: (sceneId) => [...(scenes.get(sceneId)?.values() || [])].map((r) => ({ ...r, everyFrame: everyFrame(r) })),
    get off() { return off; }, set off(v) { off = Boolean(v); },
    stats,
    _reset() { scenes.clear(); told.clear(); chipped.clear(); hidePill(); },
  };
})();
window.LabHealth = LabHealth;
