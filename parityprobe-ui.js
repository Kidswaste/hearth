// (round 120, astraprobe120) "Check Astra works like Claude": the doctor's button, Ctrl/⌘+K and /check-astra open it.
// Runs only when you press it, and asks first (a few short messages to Astra, a few cents of usage at most). Then a card
// with one ✓ / ✗ line per step in plain words, "Copy report for Claude", and the sign-in / install button when Codex
// isn't ready. The work itself is in the main process (parityprobe.js): temp folders only, Codex's own sign-in.
// Lazy group 'parityprobe' (loads on first use).
const ParityProbe = (() => {
  const LINES = [
    ['found', 'Codex found and signed in'],
    ['prompt', 'Astra gets Hearth\'s instructions'],
    ['tools', 'Astra\'s own edit tool works'],
    ['lock', 'Hearth\'s data lock answers'],
    ['cleanup', 'Test folders cleaned up'],
  ];
  let open = null;
  let current = null; // the open card's line setter (main sends each step as it runs)
  window.hub.parityProbe?.onStep?.((s) => current?.(s));

  async function start() {
    if (open) { open.dialog.showModal?.(); return null; }
    const yes = await Modal.confirm('Check Astra works like Claude?',
      'Hearth will send Astra a few short messages (a few cents of usage at most, on your own Codex sign-in) to check, on this computer, that Astra gets Hearth\'s instructions, that its edit tool works, and that Hearth\'s data lock answers. Everything happens in throwaway folders that go to the Trash afterwards: never your projects, never your chats. It takes a minute or two.',
      { ok: 'Run the check' });
    if (!yes) return null;
    return show();
  }

  function show() {
    const rows = new Map();
    const list = el('ul', { class: 'parityprobe-lines', style: { listStyle: 'none', padding: '0', margin: '8px 0' } });
    for (const [id, label] of LINES) {
      const mark = el('span', { text: '·', style: { display: 'inline-block', width: '1.4em' } });
      const text = el('span', { text: `${label}…`, class: 'hint' });
      const li = el('li', { style: { margin: '6px 0' } }, mark, text);
      li.hidden = id !== 'found';
      rows.set(id, { li, mark, text, label });
      list.append(li);
    }
    const status = el('p', { class: 'modal-text', text: 'Checking…' });
    const copy = el('button', { type: 'button', text: 'Copy report for Claude', disabled: true });
    const fixBtn = el('button', { type: 'button', class: 'primary', hidden: true });
    const close = el('button', { type: 'button', text: 'Close' });
    const dialog = el('dialog', { class: 'ui-modal parityprobe' }, el('h2', { text: 'Check Astra works like Claude' }), status, list,
      el('p', { class: 'hint', text: 'Hearth never sees your password or tokens: Codex uses its own sign-in. The report has no secrets and no file contents beyond the test files.' }),
      el('div', { class: 'dialog-actions' }, el('span', { class: 'spacer' }), fixBtn, copy, close));
    let report = '';
    const set = (s) => {
      const row = rows.get(s.id);
      if (!row) return;
      row.li.hidden = false;
      if (s.state === 'running') { row.mark.textContent = '…'; row.text.textContent = `${row.label}…`; row.text.className = 'hint'; return; }
      row.mark.textContent = s.ok ? '✓' : '✗';
      row.mark.style.color = s.ok ? 'var(--ok, #3fb950)' : 'var(--danger, #f85149)';
      row.text.textContent = s.text; row.text.className = '';
    };
    current = set;
    close.addEventListener('click', () => dialog.close());
    copy.addEventListener('click', () => copyText(report, 'Report copied: paste it to Claude'));
    dialog.addEventListener('close', () => { if (open?.dialog === dialog) { open = null; current = null; } setTimeout(() => dialog.remove(), 0); });
    document.body.append(dialog);
    dialog.showModal();
    open = { dialog };
    window.hub.parityProbe.run().then((r) => {
      if (r?.busy) { status.textContent = r.line; return; }
      for (const s of r?.steps || []) set({ ...s, state: 'done' });
      // lines that never ran (a stop before them) stay out of the way
      for (const [id, row] of rows) if (!(r?.steps || []).some((s) => s.id === id)) row.li.hidden = true;
      report = r?.report || '';
      copy.disabled = !report;
      if (r?.need === 'login') { fixBtn.hidden = false; fixBtn.textContent = 'Sign in to Codex'; fixBtn.onclick = () => { dialog.close(); EngineHealth.signIn('codex'); }; }
      else if (r?.need === 'install') { fixBtn.hidden = false; fixBtn.textContent = 'Install Codex…'; fixBtn.onclick = () => { dialog.close(); EngineHealth.fix('codex', 'install'); }; } // a visible window, never silent
      else if (r?.need === 'doctor') { fixBtn.hidden = false; fixBtn.textContent = 'Open the doctor'; fixBtn.onclick = () => { dialog.close(); Commands.exec('/doctor', H.activeId); }; }
      status.textContent = r?.ok ? 'Astra works like Claude on this computer ✓' : r?.need ? (r.line || r.steps?.[0]?.text || 'Codex isn\'t ready.') : 'Something didn\'t pass. "Copy report for Claude" and paste it to Claude to get it fixed.';
    }).catch((err) => { status.textContent = `The check couldn't run: ${(window.calmError ? calmError(err) : 'something went wrong')}.`; });
    return null;
  }

  if (typeof Commands !== 'undefined' && !Commands.get('check-astra')) {
    Commands.register({ name: 'check-astra', area: 'Agents', args: '', desc: 'Check Astra works like Claude: its instructions, its edit tool and Hearth\'s data lock, on this computer (asks first; a few cents)',
      keywords: 'astra codex test parity developer instructions lock self-check doctor', run: () => { start().catch((err) => toast(err.message, { type: 'error' })); return null; } });
  }
  if (typeof AppUI !== 'undefined') AppUI.addAction?.('Check Astra works like Claude (asks first; a few short messages)', () => start());
  return { start };
})();
