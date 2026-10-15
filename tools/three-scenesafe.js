// 🛟 Scene safety (round 43, scenesafe), the Lab side. The owner lost every Lab scene: on Windows a read of
// kv/three-sketches.json that failed for a moment (the file held by an antivirus, OneDrive / iCloud for Windows or the
// search indexer) came back as "no scenes", the Lab saved its starter "Basic scene" over the real file, the next save
// replaced the .prev copy too, and sync carried the short list to the other computer as if the scenes had been deleted.
// Now (with store.js / storework.js / scenesafe-core.js):
//   · read(name)   the Lab's stores are read with a status ('ok' / 'missing' / 'unreadable'), retried a few times; a
//                  store that couldn't be read is never saved over (tools/three.js kvOk)
//   · opened(…)    after the Lab's first read: the calm card over the preview when the scenes couldn't be read ("nothing
//                  was changed" · Retry · Recover scenes…), or when earlier scenes exist in copies but not in the list
//   · recover()    🛟 Recover lost scenes…: scenesafemain.js looks in every copy (the .prev copy, the rotating copies,
//                  History, the time machine, sync's kept-aside files, the cloud folder, backups); you tick the ones
//                  to bring back; they join your list (never replacing one), one Undo
// Ways in: Sketch ▾ › 🛟 Recover lost scenes…, the card, Ctrl/⌘+K "Recover lost Lab scenes", Settings › Backups,
// the chat command /recover-scenes.
const LabSceneSafe = (() => {
  const C = window.SceneSafeCore;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const st = { reads: 0, retries: 0, unreadable: [], card: null, scans: 0, recovered: 0, kept: 0 };
  const L = () => (typeof ThreeLab !== 'undefined' ? ThreeLab.scenes : null);
  let ready = false;
  addEventListener('hearth:lab-ready', () => { ready = true; });

  // ---------- the careful read ----------
  // → { ok, state, value, from?, code?, hold?, found? }  (ok: read for sure, or truly not there yet)
  async function read(name, fallback) {
    st.reads += 1;
    let r = null;
    for (let i = 0; i < 4; i++) {
      try { r = await window.hub.kvGet(name, fallback, { status: true }); } catch (err) { r = { state: 'unreadable', code: err.message }; }
      if (!r || typeof r !== 'object' || !r.state) r = { state: 'ok', value: r ?? fallback }; // an older main process
      if (r.state !== 'unreadable' || i === 3) break;
      st.retries += 1;
      await sleep([400, 1200, 2500][i]);
    }
    if (r.state === 'unreadable') { st.unreadable.push(name); return { ok: false, state: 'unreadable', code: r.code, value: fallback }; }
    const out = { ok: true, state: r.state, value: r.state === 'ok' ? r.value : fallback, from: r.from || null, garbled: Boolean(r.garbled) };
    // no scenes (missing, or an empty list): copies of earlier scenes? then the starter waits instead of being saved
    if (name === 'three-sketches' && (!Array.isArray(out.value) || !out.value.length)) {
      const q = await scan({ quick: true, current: [] }).catch(() => null);
      if (q?.found?.length) { out.hold = true; out.found = q.found.length; }
    }
    return out;
  }

  // ---------- the card over the preview ----------
  function card(kind, info = {}) {
    closeCard();
    const host = L()?.previewHost?.();
    if (!host) return;
    const text = kind === 'unreadable'
      ? 'Your scenes couldn\'t be read just now — nothing was changed. This happens when another program (an antivirus, OneDrive, iCloud) holds the file for a moment.'
      : `Hearth found ${info.n === 1 ? 'a scene' : `${info.n || 'some'} scenes`} from earlier that ${info.n === 1 ? 'isn\'t' : 'aren\'t'} in your list (in its automatic copies, History or backups).`;
    const btns = [];
    if (kind === 'unreadable') btns.push(el('button', { type: 'button', class: 'primary small', text: 'Retry', on: { click: () => retry() } }));
    btns.push(el('button', { type: 'button', class: `${kind === 'unreadable' ? 'ghost' : 'primary'} small`, text: 'Recover scenes…', on: { click: () => { closeCard(); recover(); } } }));
    btns.push(el('button', { type: 'button', class: 'ghost small', text: kind === 'unreadable' ? 'Later' : 'Not now', on: { click: () => closeCard() } }));
    const c = el('div', { class: 'lab-ssafe-card', attrs: { role: 'status' } }, el('b', { text: kind === 'unreadable' ? '🛟 Your scenes are safe' : '🛟 Earlier scenes found' }), el('p', { text }), el('div', { class: 'lab-ssafe-row' }, ...btns));
    c.dataset.kind = kind;
    host.append(c);
    st.card = kind;
  }
  function closeCard() { document.querySelectorAll('.lab-ssafe-card').forEach((x) => x.remove()); st.card = null; }
  async function retry() {
    const r = await read('three-sketches', []);
    if (r.state === 'unreadable') { card('unreadable'); toast('Still couldn\'t read your scenes. Nothing was changed; try again in a moment, or Recover scenes…', { timeout: 7000 }); return false; }
    closeCard();
    L()?.adopt?.(Array.isArray(r.value) ? r.value : []);
    toast('Your scenes are back', { timeout: 2000 });
    if (r.hold) card('found', { n: r.found });
    return true;
  }

  // after the Lab's first read (tools/three.js)
  function opened({ read: r, fresh, others = [] } = {}) {
    if (others.length) console.warn('Lab: could not read', others.join(', '), '(nothing was saved over them)');
    if (r?.state === 'unreadable') { card('unreadable'); return; }
    if (r?.garbled) toast('Your scenes file was damaged (a crash or a power cut?). Hearth used the copy from the save before it; the damaged file is kept aside.', { timeout: 9000 });
    if (r?.hold) { card('found', { n: r.found }); return; }
    // only the starter scene on screen while copies hold more (an earlier loss): offered once per start, quietly
    if (!fresh && C?.onlyStarter(L()?.all?.())) {
      const go = () => scan({ quick: true }).then((q) => { if (q?.found?.length) card('found', { n: q.found.length }); }).catch(() => {});
      if (window.requestIdleCallback) requestIdleCallback(go, { timeout: 4000 }); else setTimeout(go, 1500);
    }
  }
  // the store kept scenes a save would have dropped (sync, a list out of date): said once, quietly
  function kept(n) {
    st.kept += n;
    if (st.kept === n) toast(`🛟 ${n === 1 ? 'A scene that wasn\'t in this list was' : `${n} scenes that weren't in this list were`} kept (not deleted). They're back in your list.`, { timeout: 7000 });
  }

  // ---------- 🛟 Recover lost scenes ----------
  async function scan(o = {}) {
    st.scans += 1;
    if (!window.hub.scenesafe?.scan) throw new Error('Recover isn\'t available in this window');
    const current = o.current !== undefined ? o.current : (L()?.all?.() || null);
    return window.hub.scenesafe.scan({ quick: Boolean(o.quick), current });
  }
  // the Lab up and its scenes read (opened when needed)
  async function labReady() {
    if (ready && L()?.recover) return L();
    if (typeof activate === 'function') activate('tool:three');
    for (let i = 0; i < 100 && !(ready && L()?.recover); i++) await sleep(150);
    if (!L()?.recover) throw new Error('The Lab didn\'t open');
    return L();
  }
  const day = (t) => (t ? new Date(t).toLocaleString([], { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'unknown date');
  async function recover() {
    let lab;
    try { lab = await labReady(); } catch (err) { toast(err.message, { type: 'error' }); return null; }
    const list = el('div', { class: 'lab-ssafe-list' }, el('p', { class: 'hint', text: 'Looking in the automatic copies, History, the time machine, sync\'s copies and your backups…' }));
    const go = el('button', { type: 'button', class: 'primary', text: 'Bring back', disabled: true });
    const dlg = el('dialog', { class: 'ui-modal lab-ssafe-dialog' }, el('form', { method: 'dialog', on: { submit: (e) => e.preventDefault() } },
      el('h2', { text: '🛟 Recover lost scenes' }),
      el('p', { class: 'hint', text: 'Tick the scenes to bring back. They are added next to yours: nothing in your list is replaced or deleted, and Undo takes them back.' }),
      list,
      el('div', { class: 'dialog-actions' }, el('span', { class: 'spacer' }), el('button', { type: 'button', text: 'Cancel', on: { click: () => dlg.close() } }), go)));
    dlg.addEventListener('close', () => dlg.remove());
    document.body.append(dlg);
    dlg.showModal();
    let res;
    try { res = await scan(); } catch (err) { list.replaceChildren(el('p', { class: 'hint', text: `Couldn't look: ${calmError(err)}` })); return null; }
    if (res?.error) { list.replaceChildren(el('p', { class: 'hint', text: `Couldn't look everywhere: ${res.error}` })); }
    const found = res?.found || [];
    const where = (res?.sources || []).length ? `Looked in ${res.sources.length} place${res.sources.length === 1 ? '' : 's'}: ${[...new Set(res.sources.map((s) => s.label.replace(/,.*$| \(.*$/, '')))].join(', ')}.` : 'No copies were found on this computer.';
    if (!found.length) {
      list.replaceChildren(el('p', { text: 'Every scene Hearth could find is already in your list.' }), el('p', { class: 'hint', text: where }));
      go.textContent = 'Close'; go.disabled = false; go.onclick = () => dlg.close();
      return [];
    }
    const boxes = [];
    const count = () => { const n = boxes.filter((b) => b.checked).length; go.disabled = !n; go.textContent = n ? `Bring back ${n} scene${n === 1 ? '' : 's'}` : 'Bring back'; };
    list.replaceChildren(...found.map((f, i) => {
      const box = el('input', { type: 'checkbox', checked: f.state === 'missing' && !f.deleted && !/^basic scene$/i.test(f.name), attrs: { 'aria-label': `Bring back ${f.name}` } });
      box.dataset.i = String(i);
      box.addEventListener('change', count);
      boxes.push(box);
      return el('label', { class: 'lab-ssafe-item' }, box,
        el('span', { class: 'lab-ssafe-thumb' }, f.thumb ? el('img', { src: f.thumb, alt: '' }) : el('span', { text: '◭' })),
        el('span', { class: 'lab-ssafe-text' },
          el('b', { text: f.name }),
          el('span', { class: 'hint', text: `${day(f.updatedAt)} · ${f.layers} layer${f.layers === 1 ? '' : 's'} · ${f.state === 'newer' ? 'newer than the one in your list (comes in as a copy)' : f.deleted ? 'you deleted it in the Lab (not ticked)' : 'not in your list'}` }),
          el('span', { class: 'hint', text: `From: ${f.from}${f.fromAll.length > 1 ? ` (+${f.fromAll.length - 1} more)` : ''}`, title: f.fromAll.join('\n') })));
    }), el('p', { class: 'hint', text: where }));
    count();
    return new Promise((resolve) => {
      go.onclick = () => {
        const picks = boxes.filter((b) => b.checked).map((b) => found[Number(b.dataset.i)]);
        dlg.close();
        const added = lab.recover(picks.map((p) => p.scene));
        st.recovered += added.length;
        closeCard();
        if (added.length) toast(`🛟 ${added.length} scene${added.length === 1 ? '' : 's'} brought back`, { timeout: 10000, action: { label: 'Undo', fn: () => { const n = lab.unrecover(added); toast(n ? `Took back ${n} scene${n === 1 ? '' : 's'}` : 'Nothing to take back', { timeout: 2000 }); } } });
        resolve(added);
      };
      dlg.addEventListener('close', () => resolve(null), { once: true });
    });
  }

  // ---------- the ways in ----------
  const sketchRow = () => ['🛟 Recover lost scenes…', 'Scenes from automatic copies, History, sync or backups, added next to yours', () => recover()];
  const addAction = () => { if (typeof AppUI !== 'undefined' && AppUI.addAction && !addAction.done) { addAction.done = true; AppUI.addAction('Recover lost Lab scenes…', () => recover()); } };
  addAction();
  addEventListener('DOMContentLoaded', addAction);
  if (typeof Commands !== 'undefined' && !Commands.get?.('recover-scenes')) {
    Commands.register({ name: 'recover-scenes', desc: 'Find Lab scenes that aren\'t in your list (automatic copies, History, sync, backups) and bring them back', area: 'Lab', keywords: 'lost scenes sketches missing gone restore backup', examples: ['/recover-scenes', '/recover-scenes list'],
      run: async (args) => {
        if (/^\s*list\b/.test(args || '')) {
          await labReady();
          const r = await scan();
          if (!r?.found?.length) return 'Every Lab scene Hearth could find is already in your list.';
          return `Scenes that aren't in your list (${r.found.length}):\n${r.found.slice(0, 30).map((f) => `· ${f.name} (${day(f.updatedAt)}, from ${f.from})`).join('\n')}\nRun /recover-scenes to pick the ones to bring back.`;
        }
        recover();
        return null;
      } });
  }

  return { read, opened, kept, card, closeCard, retry, recover, scan, sketchRow, state: () => ({ ...st, ready }) };
})();
window.LabSceneSafe = LabSceneSafe;
