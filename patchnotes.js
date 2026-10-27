// 📰 Patch notes (round 29). The owner: "make patch notes clearer on what the modifications are (basically a
// compacted, well-presented version of what you do here when you're done)". One short file per round,
// docs/patch-notes/round-NN.md (listed newest first in docs/patch-notes/index.txt), shown in a calm reader:
// the newest round open, older ones one click away. Opened from Settings › Updates "Patch notes…", Ctrl/⌘+K, the
// note after an update, and the ⬆ Update dialog (which shows the notes of rounds this copy doesn't have yet itself).
const PatchNotes = (() => {
  const md = (t) => (typeof renderMarkdown === 'function' ? renderMarkdown(t) : null);
  async function readText(p) { const r = await fetch(p, { cache: 'no-store' }); if (!r.ok) throw new Error(`${p}: ${r.status}`); return r.text(); }
  async function list() {
    try { return (await readText('docs/patch-notes/index.txt')).split('\n').map((l) => l.trim()).filter((l) => /^round-\d+\.md$/.test(l)); } catch { return []; }
  }
  const roundOf = (f) => Number((/round-(\d+)/.exec(f) || [])[1]) || 0;
  // a note's text as a calm block (markdown when the app's renderer is there, plain text otherwise)
  function block(text) {
    const box = el('div', { class: 'pn-body' });
    // (round 49) "Ctrl/⌘+K" (written for both computers) reads ⌘K on the Mac, Ctrl+K on Windows; keys named for one system stay
    if (typeof WinMac !== 'undefined' && WinMac.keyLabel) text = WinMac.keyLabel(String(text), { mac: /Mac/.test(navigator.platform), both: true });
    const h = md(text);
    if (h != null) box.innerHTML = h; else box.textContent = text;
    return box;
  }
  async function open(file) {
    document.querySelector('dialog.pn-dialog')?.close();
    const files = await list();
    if (!files.length) { toast('No patch notes in this copy yet.', { timeout: 2500 }); return null; }
    let cur = files.includes(file) ? file : files[0];
    const body = el('div', { class: 'pn-scroll' });
    const pick = el('select', { class: 'pn-pick', attrs: { 'aria-label': 'Round' } }, files.map((f) => el('option', { value: f, text: `Round ${roundOf(f)}`, selected: f === cur })));
    // (round 64, newtour64) rounds 61–63: "✦ Try it · 2 of 5 tried" in the head (trynew.js, its own group)
    const trySlot = el('span', { class: 'pn-try' });
    // (round 71, whatsnew71) rounds 66–70: "✦ Show me" runs the tours that cover that round
    const tryBtn = () => { trySlot.replaceChildren(); const r = roundOf(cur); if (((r >= 61 && r <= 63) || (r >= 66 && r <= 70)) && window.Lazy) Lazy.load('trynew').then(() => { if (roundOf(cur) === r) trySlot.replaceChildren((r >= 66 ? window.TryNew?.patchNotesButton7?.(r) : window.TryNew?.patchNotesButton(r)) || ''); }).catch(() => {}); };
    const show = async () => { tryBtn(); body.replaceChildren(el('p', { class: 'hint', text: 'Loading…' })); try { body.replaceChildren(block(await readText(`docs/patch-notes/${cur}`))); } catch (err) { body.replaceChildren(el('p', { class: 'hint', text: calmError(err) })); } body.scrollTop = 0; };
    pick.addEventListener('change', () => { cur = pick.value; show(); });
    const dlg = el('dialog', { class: 'ui-modal pn-dialog' },
      el('div', { class: 'pn-head' }, el('h2', { text: '📰 Patch notes' }), el('span', { class: 'spacer' }), trySlot, pick),
      body,
      el('div', { class: 'modal-buttons' }, el('button', { type: 'button', class: 'primary', text: 'Done', on: { click: () => dlg.close() } })));
    dlg.addEventListener('close', () => dlg.remove());
    document.body.append(dlg);
    dlg.showModal();
    await show();
    return dlg;
  }
  if (typeof Commands !== 'undefined' && !Commands.get('patch-notes')) {
    Commands.register({ name: 'patch-notes', aliases: ['changelog'], area: 'App', args: '[round]', desc: 'What changed, round by round, in plain words',
      run: (args) => { const n = Number(String(args || '').trim()); open(n ? `round-${n}.md` : undefined); return ''; } });
  }
  return { open, list, block };
})();
