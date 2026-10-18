/* global questCompanion */
(() => {
  const $ = id => document.getElementById(id);
  let snap = null, manualStep = null;
  const error = message => { $('error').textContent = message || ''; $('error').hidden = !message; };
  async function call(op, data = {}) {
    error('');
    try {
      const result = await questCompanion.call({ op, ...data });
      if (!result?.ok) { error(result?.error || 'The guide could not do that just now.'); return null; }
      render(result.value); return result.value;
    } catch (e) { error(e.message); return null; }
  }
  function render(s) {
    if (!s) return; snap = s;
    const step = s.step, done = !!s.session && !step, paused = !!s.session?.paused;
    $('quest').textContent = s.session?.title || 'Your next small win';
    $('count').textContent = s.total ? `${s.completed} / ${s.total}` : '';
    $('progress').firstElementChild.style.width = `${s.total ? s.completed / s.total * 100 : 0}%`;
    $('progress').setAttribute('aria-valuenow', String(s.total ? Math.round(s.completed / s.total * 100) : 0));
    $('step-number').textContent = done ? '✓' : String(s.index + 1).padStart(2, '0');
    $('eyebrow').textContent = paused ? 'PAUSED · TAKE YOUR TIME' : done ? 'READY TO SHARE' : 'YOUR NEXT MOVE';
    const outing = s.session?.questId?.startsWith('outing:');
    $('title').textContent = done ? outing ? 'Home again. Well done.' : 'Small steps. Real progress.' : step?.title || 'Ready when you are';
    $('instruction').textContent = done ? outing ? 'Your outing is complete. Open your plan to remember the night or set up the next one.' : 'Your guide is complete. Bring your result back to Hearth for proof and review.' : step?.instruction || 'Start a guided quest in Sidequest Studio.';
    $('launch').hidden = step?.app !== 'fl';
    $('action').hidden = !step?.action;
    $('action').textContent = step?.action?.type === 'outing' ? '↗ Open route / plan' : '↗ Open workbench';
    $('pause').hidden = !step;
    $('pause').textContent = paused ? '▶ Resume' : 'Ⅱ Pause';
    $('done').hidden = !step || step.check !== 'manual' || paused;
    $('manual').hidden = !step || step.check === 'manual' || paused;
    $('review').hidden = !done;
    $('review').textContent = outing && !s.session.reviewQuestId ? 'Open my outing ↗' : 'Show result / review ↗';
    $('back').hidden = !s.completed;
    $('connect').hidden = step?.app !== 'fl' && s.session?.kind !== 'music';
    $('connect').textContent = s.fl?.connected ? 'FL connected' : 'Connect FL';
    $('setup-path').textContent = s.fl?.folder || '';
    $('project-path').textContent = s.project?.path ? `${s.project.path} · save after each step` : 'No project connected yet';
    $('forget-project').hidden = !s.project?.path;
    $('install').textContent = s.fl?.installed ? 'Reinstall FL connection' : 'Install FL connection';
    const obs = $('observation'); obs.dataset.live = String(!!s.fl?.connected && !paused);
    if (paused) obs.textContent = 'Automatic checks paused. Resume when you want to continue.';
    else if (done) obs.textContent = `${s.session.done.filter(d => d.kind === 'automatic').length} steps observed · ${s.session.done.filter(d => d.kind === 'manual').length} confirmed by you`;
    else if (step?.check === 'app') obs.textContent = s.fl?.running ? 'FL Studio detected · checking your next step' : 'Waiting for FL Studio to open';
    else if (step?.check === 'bpm') obs.textContent = s.fl?.connected ? `Live tempo: ${s.telemetry.bpm} BPM · target ${step.targetBpm}` : s.project?.path ? s.project.error || `Saved tempo: ${s.project.bpm || '…'} BPM · press Ctrl+S to check` : 'Connect your .flp or live FL to check automatically';
    else if (step?.check === 'bass') obs.textContent = s.project?.path ? s.project.error || 'Watching your saved project · Ctrl+S checks bass notes' : s.fl?.connected ? 'Live: checks grid notes and playback. Off-grid piano-roll notes? Connect your .flp for saved-note checks.' : 'Connect your .flp or live FL to check automatically';
    else if (step?.check === 'tool') obs.textContent = 'Opening the workbench checks this step automatically.';
    else obs.textContent = step ? 'You choose when this step is done.' : '';
    if (manualStep && manualStep !== step?.id) { $('manual-form').hidden = true; $('note').value = ''; manualStep = null; }
  }
  function manual() { manualStep = snap?.step?.id; if (!manualStep) return; $('manual-form').hidden = false; $('note').focus(); }
  $('hide').onclick = () => call('hide');
  $('launch').onclick = () => call('launch');
  $('action').onclick = () => call('action', { stepId: snap?.step?.id });
  $('pause').onclick = () => call(snap?.session?.paused ? 'resume' : 'pause');
  $('back').onclick = () => call('back');
  $('manual').onclick = manual;
  $('done').onclick = manual;
  $('review').onclick = () => call('review');
  $('connect').onclick = () => { $('connection').hidden = !$('connection').hidden; if (!$('connection').hidden) $('connection').scrollIntoView({ block: 'start', behavior: 'smooth' }); };
  $('close-connection').onclick = () => { $('connection').hidden = true; };
  $('install').onclick = async () => { const value = await call('setup-fl'); if (value) { $('setup-path').textContent = `Installed. Now select Hearth Quest Guide in FL MIDI settings. ${value.fl.folder}`; } };
  $('choose-app').onclick = () => call('choose-fl');
  $('choose-folder').onclick = () => call('choose-fl-folder');
  $('choose-project').onclick = () => call('choose-project');
  $('forget-project').onclick = () => call('forget-project');
  $('open-folder').onclick = () => call('open-fl-folder');
  $('cancel-manual').onclick = () => { $('manual-form').hidden = true; manualStep = null; };
  $('manual-form').onsubmit = async e => { e.preventDefault(); const value = await call('manual', { stepId: manualStep, note: $('note').value }); if (value) { $('manual-form').hidden = true; $('note').value = ''; manualStep = null; } };
  questCompanion.onChange(render);
  questCompanion.onError(e => error(e.error));
  call('state');
})();
