// "Take <project> offline" (round 139, room139: once part of offline.js): a per-computer check, kept inside the project's
// existing menu (⋯ → ⇩ Prepare for offline…, /offline prepare). It loads on first use (lazy group 'offlineprep');
// Offline.prepare(project) loads it first and returns the same dialog.
const OfflinePrepare = (() => {
  async function prepare(project) {
    await Lazy.load('projects');
    if (!project) {
      project = ProjectWorkspace.current();
    }
    if (!project?.id) { toast('Open the project you want to take offline first.'); return; }
    document.querySelector('.offline-prepare')?.close();
    const dialog = el('dialog', { class: 'offline-prepare' });
    const status = el('p', { class: 'hint', text: 'Checking this computer…', role: 'status' });
    const body = el('div');
    let working = false;
    const run = async download => {
      if (working) return;
      working = true; button.disabled = true;
      status.textContent = download ? 'Saving scene libraries locally… Keep Hearth open.' : 'Checking this computer…';
      try {
        await window.Projects?.flush?.(); // (round 72) the check reads the saved project: what was just added to it counts too
        const r = await hub.net.prepareProject({ projectId: project.id, version: store.get('three.version', '0.186.1'), download });
        if (!dialog.isConnected) return;
        status.textContent = `${r.ready ? '✓ Files and scene libraries are local' : 'A few things still need attention'} · ${r.computer}`;
        const row = (ok, text) => el('p', { text: `${ok ? '✓' : '○'} ${text}` });
        const local = r.files.filter(f => f.status === 'local').length;
        body.replaceChildren(
          row(!r.libraries || r.libraries.ready, r.libraries ? `Scene libraries · ${r.libraries.ready ? `${r.libraries.files} files saved` : 'download while online'}` : 'No scene libraries needed'),
          row(local === r.files.length, `Media and files · ${local}/${r.files.length} local`),
          row(r.chats.every(c => c.local), `Chat history · ${r.chats.filter(c => c.local).length}/${r.chats.length} local`),
        );
        const issues = [
          ...r.missingScenes.map(() => 'A linked scene has not arrived. Open Two computers and let sync finish.'),
          ...r.missingBoards.map(name => `${name} · waiting for sync`),
          ...r.files.filter(f => f.status !== 'local').map(f => `${f.name} · ${f.status === 'cloud' ? 'download it in Finder / Explorer, then check again' : 'missing here; sync or relink it'}`),
          ...r.external.map(u => `Online resource: ${u}`),
          ...(r.libraries?.missing || []),
        ];
        if (issues.length) body.append(el('details', {}, el('summary', { text: `${issues.length} things to check` }), ...issues.map(text => el('p', { class: 'hint', text }))));
        body.append(el('p', { class: 'hint', text: 'Last check applies to this computer only. Switch Wi-Fi off briefly and open the scene with its song before leaving.' }));
        button.textContent = r.libraries?.ready ? 'Check again' : 'Download scene libraries';
        button.dataset.download = r.libraries?.ready ? '' : '1';
      } catch (err) { status.textContent = calmError(err) || 'Could not finish the check. Reconnect and try again.'; }
      finally { working = false; button.disabled = false; }
    };
    const button = el('button', { type: 'button', class: 'primary', text: 'Download scene libraries', on: { click: () => run(button.dataset.download === '1') } });
    button.dataset.download = '1';
    dialog.append(el('h2', { text: `Take ${project.name} offline` }), status, body,
      el('details', {}, el('summary', { text: 'What works on the train?' }),
        el('p', { class: 'hint', text: 'Saved scenes, local audio, drawing, storyboards and notes work offline. Astra, Claude, Auto-improve and AI feedback need a connection. Sent messages can queue and send automatically when you reconnect; keep ideas in Notes if you want to choose when to send.' })), // (round 116, slim116) no Serum 2 / Vital line: the music studio is gone
      el('div', { class: 'dialog-actions' }, button, el('button', { type: 'button', text: 'Close', on: { click: () => dialog.close() } })));
    dialog.addEventListener('close', () => dialog.remove());
    document.body.append(dialog); dialog.showModal(); void run(false);
    return dialog;
  }
  return { open: prepare };
})();
