// "What did the AI change?" under a director reply (round 137, replydiff137): docs/upgrades/replydiff137.md
//   · A reply (Claude's or Astra's) that changed a Lab scene gets one folded line under it: "Changed 3 layers · Review".
//     The data is LabTxn's (tools/three-txn.js): when the reply ends, its before / after snapshots are kept (kv
//     labtxn-replies) and the message carries labDiff: { id, layers }.
//   · Opened: Keep all (folds it) and ↶ Undo all (the reply's undo, LabTxn's one step); a before / after picture pair (the
//     time machine's pictures, tools/three-history.js); one row per changed layer in plain words with ↶ Undo this layer
//     (just that layer's change, the rest of the reply stays, ONE undo step: LabTxn.step, so the dock's ↶, Alt+Shift+Z
//     and /undo-edit put it back); a code change has "Show the code change" (folded, + / − lines).
//   · A reply that only moved sliders also has Keep some…: a tick per slider, Apply puts the unticked ones back.
// Nothing here runs until a reply's line is opened; the line itself is one element.
const ReplyDiff = (() => {
  const C = ReplyDiffCore;
  const KV = 'labtxn-replies';
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const tools = () => (typeof ThreeTweaks !== 'undefined' ? { scan: ThreeTweaks.scan, applyValues: ThreeTweaks.applyValues, labelOf: ThreeTweaks.labelOf } : {});
  const Lab = () => (typeof ThreeLab !== 'undefined' ? ThreeLab : null);
  const opened = new Set(); // reply ids whose review is open (a chat drawn again keeps it open)
  const undone = new Map(); // reply id → Set of row ids taken back (and 'all')
  const err = (e) => toast(e?.message || String(e), { type: 'error' });

  // ---------- the data ----------
  async function record(id) {
    if (typeof LabTxn !== 'undefined' && LabTxn.reply) return LabTxn.reply(id);
    let d = null; try { d = await window.hub.kvGet(KV, null); } catch { d = null; }
    return (Array.isArray(d?.list) ? d.list : []).find((r) => r.id === id) || null;
  }
  async function needLab() {
    if (typeof LabTxn === 'undefined' && window.Lazy) await Lazy.load('lab');
    if (!Lab()?.tm) {
      activate('tool:three');
      await Lab()?.cmd?.();
      const t0 = Date.now(); while (!Lab()?.tm && Date.now() - t0 < 15000) await wait(120);
    }
    if (typeof LabTxn === 'undefined' || !Lab()?.scenes) throw new Error('The Lab isn\'t ready.');
  }
  const doneOf = (id) => { if (!undone.has(id)) undone.set(id, new Set()); return undone.get(id); };

  // ---------- taking changes back: one undo step each ----------
  async function stepTo(cur, target, label, words) {
    await LabTxn.restore(target, { keepRefs: true });
    // the step's "after" once the scene has settled (layers re-run, sliders read back), so ↶ finds it as it was left
    const sig = LabTxn._test.sigOf;
    let after = null;
    for (let i = 0; i < 15; i += 1) {
      await wait(200);
      const a = await LabTxn.snap(cur.id);
      if (after && sig(a) === sig(after)) break;
      after = a;
    }
    return LabTxn.step({ who: 'You', before: cur, after, label, words });
  }
  async function current(sc) {
    await needLab();
    if (!Lab().scenes.get(sc.sceneId)) throw new Error(`The scene “${sc.scene}” is gone.`);
    return LabTxn.snap(sc.sceneId);
  }
  async function undoLayer(rid, layerId) {
    const rec = await record(rid);
    const sc = rec?.scenes.find((s) => s.before.layers.some((L) => L.id === layerId) || s.after.layers.some((L) => L.id === layerId));
    if (!sc) throw new Error('That change isn\'t kept any more.');
    const cur = await current(sc);
    const row = C.rows(sc.before, sc.after, tools()).rows.find((r) => r.id === layerId);
    const name = row?.name || 'that layer';
    const ok = await stepTo(cur, C.revertLayer(cur, sc.before, sc.after, layerId), `took back ${rec.who}'s change to ${name}`, `took back ${rec.who}'s change to ${name}`);
    doneOf(rid).add(layerId);
    toast(ok ? `↶ Took back the change to ${name} (the rest stays). ↶ in the dock puts it back.` : `${name} is already as it was`, { timeout: 4000 });
    repaint(rid);
    return ok;
  }
  async function undoScene(rid) {
    const rec = await record(rid);
    const sc = rec?.scenes[0];
    if (!sc) throw new Error('That change isn\'t kept any more.');
    const cur = await current(sc);
    const ok = await stepTo(cur, C.revertScene(cur, sc.before), `took back ${rec.who}'s scene changes`, `took back ${rec.who}'s scene changes (palette, timeline, order)`);
    doneOf(rid).add('scene');
    repaint(rid);
    return ok;
  }
  // Undo all: the reply's own undo (LabTxn's step) while it is still the newest; after other changes, every change of
  // the reply taken back as one step (later changes elsewhere stay)
  async function undoAll(rid) {
    const rec = await record(rid);
    if (!rec) throw new Error('That reply\'s changes aren\'t kept any more.');
    await needLab();
    let n = 0;
    for (const sc of rec.scenes) {
      const cur = await current(sc);
      if (rec.scenes.length === 1 && LabTxn.isTop(sc.key) && LabTxn._test.sigOf(cur) === LabTxn._test.sigOf(sc.after)) { await LabTxn.undoTurn(); n += 1; continue; }
      if (await stepTo(cur, C.revertAll(cur, sc.before, sc.after, tools()), `took back what ${rec.who} did in one reply`, `took back what ${rec.who} did in one reply to “${sc.scene}”`)) n += 1;
    }
    doneOf(rid).add('all');
    toast(n ? `↶ Took back what ${rec.who} did. ↶ in the dock puts it back.` : 'The scene is already as it was', { timeout: 3500 });
    repaint(rid);
    return n > 0;
  }
  // Keep some: picks are the sliders to put back
  async function keepSome(rid, back) {
    const rec = await record(rid);
    const sc = rec?.scenes[0];
    if (!sc) throw new Error('That change isn\'t kept any more.');
    if (!back.length) { toast('Kept every slider', { timeout: 2000 }); return false; }
    const cur = await current(sc);
    const ok = await stepTo(cur, C.revertSliders(cur, sc.before, sc.after, back, tools()), `put back ${back.length} slider${back.length === 1 ? '' : 's'} ${rec.who} moved`, `put back ${back.length} slider${back.length === 1 ? '' : 's'} ${rec.who} moved`);
    for (const p of back) doneOf(rid).add(`${p.id}|${p.key}`);
    toast(`↶ Put back ${back.length} slider${back.length === 1 ? '' : 's'}; kept the rest. ↶ in the dock puts them back.`, { timeout: 3500 });
    repaint(rid);
    return ok;
  }

  // a change taken back and then put back (↶ in the dock) shows as a change again
  async function recheck(rec, done) {
    if (!done.size || typeof LabTxn === 'undefined' || !Lab()?.scenes) return;
    const same = (x, y) => JSON.stringify(x ?? null) === JSON.stringify(y ?? null);
    for (const sc of rec.scenes) {
      if (!Lab().scenes.get(sc.sceneId)) continue;
      const cur = await LabTxn.snap(sc.sceneId).catch(() => null);
      if (!cur) continue;
      const back = (id) => { const B = sc.before.layers.find((L) => L.id === id) || null; const N = cur.layers.find((L) => L.id === id) || null; return same(B, N) && (!B || same(sc.before.vals?.[id], cur.vals?.[id])); };
      const rows = C.rows(sc.before, sc.after, tools());
      for (const k of [...done]) {
        if (k === 'all') { if (!rows.rows.every((r) => back(r.id))) done.delete(k); continue; }
        if (k === 'scene') { if (!same(sc.before.palette, cur.palette)) done.delete(k); continue; }
        const [id, key] = k.split('|');
        if (key != null) { if (!same(sc.before.vals?.[id]?.[key], cur.vals?.[id]?.[key])) done.delete(k); } else if (rows.rows.some((r) => r.id === id) && !back(id)) done.delete(k);
      }
    }
  }

  // ---------- the before / after pictures (the time machine's, when it has them) ----------
  async function pictures(sc) {
    if (typeof ThreeHistory === 'undefined') return null;
    try {
      const vs = await ThreeHistory.list(sc.sceneId); const tm = await ThreeHistory.thumbs(sc.sceneId);
      const pic = (list) => { for (let i = list.length - 1; i >= 0; i -= 1) if (tm?.[list[i].id]) return tm[list[i].id]; return null; };
      const before = pic(vs.filter((v) => v.at < sc.at));
      const after = pic(vs.filter((v) => v.at <= sc.lastAt + 4000 && v.at >= sc.at)) || null;
      return before || after ? { before, after } : null;
    } catch { return null; }
  }

  // ---------- the line and the review ----------
  const folds = new Map(); // reply id → its <details> on screen
  function line(m) {
    const d = el('details', { class: 'rd-fold', dataset: { rd: m.labDiff.id } },
      el('summary', { class: 'rd-sum', title: 'What this reply changed in the Lab, layer by layer: keep it, or undo one layer' }, `${C.title(m.labDiff)} · Review`));
    d.addEventListener('toggle', () => { if (d.open) { opened.add(m.labDiff.id); fill(d, m.labDiff.id).catch(err); } else opened.delete(m.labDiff.id); });
    folds.set(m.labDiff.id, d);
    if (opened.has(m.labDiff.id)) d.open = true;
    return d;
  }
  function repaint(rid) { const d = folds.get(rid); if (d?.isConnected && d.open) fill(d, rid).catch(err); }
  function btn(text, title, fn, cls = '') { return el('button', { type: 'button', class: `rd-btn ${cls}`.trim(), text, title, on: { click: (e) => { e.preventDefault(); e.stopPropagation(); fn().catch(err); } } }); }
  function codeView(code) {
    const det = el('details', { class: 'rd-code' }, el('summary', { text: 'Show the code change' }));
    det.addEventListener('toggle', () => {
      if (!det.open || det.querySelector('pre')) return;
      det.append(el('pre', { class: 'rd-diff' }, code.lines.slice(0, 600).map((x) => el('div', { class: x.t === '+' ? 'rd-add' : x.t === '-' ? 'rd-del' : x.t === '…' ? 'rd-gap' : 'rd-same', text: `${x.t === '=' ? ' ' : x.t === '…' ? '⋯' : x.t} ${x.s}` }))));
    });
    return det;
  }
  async function fill(d, rid) {
    const body = d.querySelector(':scope > .rd-body') || d.appendChild(el('div', { class: 'rd-body' }, el('div', { class: 'rd-wait', text: 'Reading what changed…' })));
    const rec = await record(rid);
    if (!rec) { body.replaceChildren(el('div', { class: 'rd-wait', text: 'What this reply changed isn\'t kept any more (the newest 10 replies are). Activity › Changes by AIs still has it.' })); return; }
    if (typeof ThreeTweaks === 'undefined' && window.Lazy) await Lazy.load('lab').catch(() => {}); // the sliders' names, values vs code edits
    const done = doneOf(rid);
    await recheck(rec, done);
    const all = done.has('all');
    const parts = [];
    parts.push(el('div', { class: 'rd-head' },
      el('span', { class: 'rd-who', text: all ? `${rec.who}'s changes were taken back` : `What ${rec.who} changed` }),
      el('span', { class: 'rd-sp' }),
      btn('Keep all', 'Keep everything (just closes this)', async () => { d.open = false; }),
      all ? null : btn('↶ Undo all', 'Take back everything this reply did (one undo step)', () => undoAll(rid), 'rd-undo-all')));
    for (const sc of rec.scenes) {
      const dd = C.rows(sc.before, sc.after, tools());
      if (rec.scenes.length > 1) parts.push(el('div', { class: 'rd-scene', text: `In “${sc.scene}”` }));
      const pics = el('div', { class: 'rd-pics', hidden: true });
      parts.push(pics);
      pictures(sc).then((p) => {
        if (!p) return;
        pics.replaceChildren(...[['Before', p.before], ['After', p.after]].map(([t, u]) => el('figure', { class: 'rd-pic' }, u ? el('img', { src: u, alt: t }) : el('span', { class: 'rd-nopic', text: '◭' }), el('figcaption', { text: t }))));
        pics.hidden = false;
      });
      for (const r of dd.rows) {
        const gone = all || done.has(r.id);
        parts.push(el('div', { class: `rd-row${gone ? ' rd-gone' : ''}`, dataset: { layer: r.id } },
          el('div', { class: 'rd-line' },
            el('span', { class: 'rd-words', text: r.words }),
            gone ? el('span', { class: 'rd-done', text: 'undone' }) : btn('↶ Undo this layer', `Take back just ${r.name}'s change; the rest of the reply stays (one undo step)`, () => undoLayer(rid, r.id), 'rd-undo')),
          r.code && (r.code.added || r.code.removed) ? codeView(r.code) : null));
      }
      if (dd.scene) {
        const gone = all || done.has('scene');
        parts.push(el('div', { class: `rd-row${gone ? ' rd-gone' : ''}`, dataset: { layer: 'scene' } },
          el('div', { class: 'rd-line' }, el('span', { class: 'rd-words', text: dd.scene.words }),
            gone || !dd.scene.undoable ? (gone ? el('span', { class: 'rd-done', text: 'undone' }) : null) : btn('↶ Undo this', 'Take back the palette / timeline / order change; the layers stay (one undo step)', () => undoScene(rid), 'rd-undo'))));
      }
      if (dd.slidersOnly && !all && rec.scenes.length === 1) parts.push(keepSomeEl(rid, dd));
    }
    body.replaceChildren(...parts);
  }
  function keepSomeEl(rid, dd) {
    const done = doneOf(rid);
    const det = el('details', { class: 'rd-some' }, el('summary', { text: 'Keep some…', title: 'Tick the slider moves to keep; the others go back' }));
    const ticks = [];
    for (const r of dd.rows) for (const s of r.sliders) {
      if (done.has(r.id) || done.has(`${r.id}|${s.key}`)) continue;
      const box = el('input', { type: 'checkbox', checked: true, dataset: { layer: r.id, key: s.key } });
      ticks.push(box);
      det.append(el('label', { class: 'rd-tick' }, box, ` ${r.name}: ${String(s.label).toLowerCase()} ${C.fmt(s.from)} → ${C.fmt(s.to)}`));
    }
    if (!ticks.length) return null;
    det.append(el('div', { class: 'rd-some-go' }, btn('Keep the ticked ones', 'Put the unticked sliders back (one undo step)', () => keepSome(rid, ticks.filter((b) => !b.checked).map((b) => ({ id: b.dataset.layer, key: b.dataset.key }))), 'rd-apply')));
    return det;
  }

  // ---------- under the replies ----------
  function onMessage(node, m) {
    if (m?.role !== 'assistant' || !m.labDiff?.id || node.querySelector(':scope > .rd-fold')) return;
    node.append(line(m));
  }
  function boot() {
    if (typeof Native === 'undefined' || !Native.hooks?.message) return;
    Native.hooks.message.push(onMessage);
    // chats drawn before this loaded: drawn again where a reply has a review
    for (const a of (typeof H !== 'undefined' ? H.agents?.() : null) || []) {
      const c = Native.chatOf?.(a.id);
      if (c && !Native.isWin?.(c) && c.messages?.some((x) => x.labDiff?.id)) Native.refresh(a.id, { keepScroll: true });
    }
  }
  boot();

  return { record, undoLayer, undoScene, undoAll, keepSome, fold: (id) => folds.get(id) || null, _test: { opened, undone } };
})();
window.ReplyDiff = ReplyDiff;
