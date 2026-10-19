// Guided quests: evidence advances one visible step; opening a button is never evidence.
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.QuestGuideCore = api;
}(typeof self !== 'undefined' ? self : this, () => {
  const text = (v, max = 500) => String(v || '').trim().slice(0, max);
  const checks = new Set(['app', 'bpm', 'bass', 'playback', 'manual', 'tool', 'project-change', 'project-output']);
  let sequence = 0;
  const tools = new Set(['lab', 'forge', 'tiles', 'sounds', 'slice', 'rack', 'arena']);
  function musicSteps(bpm = 120) {
    bpm = Math.max(20, Math.min(300, Number(bpm) || 120));
    return [
      { id: 'open-fl', title: 'Open your canvas', instruction: 'Open FL Studio and start a project. Hearth checks when FL Studio is running.', check: 'app', app: 'fl' },
      { id: 'tempo', title: `Find the pulse · ${bpm} BPM`, instruction: `Set the tempo display at the top of FL Studio to ${bpm} BPM. Connect your saved .flp below and press Ctrl+S, or enable the live FL connection to check without saving.`, check: 'bpm', targetBpm: bpm, app: 'fl' },
      { id: 'bass', title: 'Give it a bass', instruction: 'Add a bass instrument, rename its Channel Rack channel “Bass”, and write a short part. Save your connected .flp to check its actual notes, or press Play with the live connection. Hearth checks progress, not sound quality.', check: 'bass', app: 'fl' },
      { id: 'shape', title: 'Make one small change', instruction: 'Duplicate your idea into a short A/B section. Remove one element, change a note, or open the filter. Keep the version that makes you want to hear it again.', check: 'manual', app: 'fl' },
      { id: 'save', title: 'Leave yourself a demo', instruction: 'Save your FL project, then export a short WAV or MP3. Return to the quest and attach it as proof for your review.', check: 'manual', app: 'fl' },
    ];
  }
  function normalizeSteps(list) {
    if (!Array.isArray(list) || !list.length) throw new Error('Add at least one guided step.');
    const ids = new Set();
    return list.slice(0, 30).map((s, i) => {
      let id = text(s.id, 80) || `step-${i + 1}`; if (ids.has(id)) id = `${id}-${i}`; ids.add(id);
      const action = s.action?.type === 'project' && ['scene','board','sound','chat','overview','moodboard'].includes(s.action.tab) ? {type:'project',tab:s.action.tab} : s.action?.type === 'hearth-tool' && tools.has(s.action.tool) ? { type: 'hearth-tool', tool: s.action.tool } : s.action?.type === 'outing' ? { type: 'outing', planId: text(s.action.planId, 120) } : null;
      if(action?.type==='project'&&action.tab==='scene'&&/^[\w-]{1,100}$/.test(s.action.sceneId||''))action.sceneId=s.action.sceneId;
      if(action?.type==='project'&&action.tab==='chat'&&/^[\w-]{1,120}$/.test(s.action.chatId||''))action.chatId=s.action.chatId;
      return { id, title: text(s.title, 140) || `Step ${i + 1}`, instruction: text(s.instruction, 1500), check: checks.has(s.check) ? s.check : 'manual', app: s.app === 'fl' ? 'fl' : null, action, target:['scene','board','sound'].includes(s.target)?s.target:null, targetBpm: Math.max(20, Math.min(300, Number(s.targetBpm) || 120)) };
    });
  }
  function start(input, now = Date.now()) {
    return { id: `guide-${now}-${++sequence}`, questId: text(input.questId, 120), reviewQuestId: text(input.reviewQuestId, 120), title: text(input.title, 160) || 'Your next small win', kind: input.kind === 'music' ? 'music' : 'custom', projectId:/^[\w-]{1,100}$/.test(input.projectId||'')?input.projectId:null, startedAt: now, updatedAt: now, enteredAt: now, paused: false, steps: normalizeSteps(input.steps?.length ? input.steps : musicSteps(input.bpm)), done: [] };
  }
  const index = s => s ? s.done.length : 0;
  const current = s => s?.steps[index(s)] || null;
  const fresh = (t, now) => !!t && Number.isFinite(t.at) && now - t.at >= -2000 && now - t.at < 6500;
  function evidence(step, observation, now = Date.now(), enteredAt = 0) {
    if (!step) return null;
    const t = observation?.telemetry;
    if (step.check === 'app' && observation?.running === true) return { kind: 'automatic', summary: 'FL Studio is running', source: 'process' };
    const p = observation?.project;
    if (p && p.savedAt >= enteredAt && p.checkedAt <= now && now - p.checkedAt < 6500) {
      if (step.check === 'bpm' && Math.abs(p.bpm - step.targetBpm) <= 0.05) return { kind: 'automatic', summary: `Saved FL project: ${p.bpm} BPM`, source: 'flp-save' };
      const bass = p.channels?.find(c => c.enabled && /\b(bass|sub|reese|808)\b/i.test(c.name) && c.notes > 0);
      if (step.check === 'bass' && bass) return { kind: 'automatic', summary: `Saved FL project: “${text(bass.name, 80)}” contains ${bass.notes} notes`, source: 'flp-save' };
    }
    if (!fresh(t, now) || t.at < enteredAt) return null;
    if (step.check === 'bpm' && Number.isFinite(t.bpm) && Math.abs(t.bpm - step.targetBpm) <= 0.05) return { kind: 'automatic', summary: `FL Studio reports ${t.bpm} BPM`, source: 'fl-midi' };
    if (step.check === 'bass') {
      const bass = (t.channels || []).find(c => /\b(bass|sub|reese|808)\b/i.test(c.name) && c.notes > 0 && c.activity > 0.001);
      if (t.playing && bass) return { kind: 'automatic', summary: `“${text(bass.name, 80)}”: notes present and channel playing`, source: 'fl-midi' };
    }
    if (step.check === 'playback' && t.playing) return { kind: 'automatic', summary: 'FL Studio transport is playing', source: 'fl-midi' };
    return null;
  }
  function complete(s, proof, now = Date.now()) {
    const step = current(s); if (!step || s.paused) return s;
    return { ...s, updatedAt: now, enteredAt: now + 1, done: [...s.done, { stepId: step.id, at: now, ...proof }] };
  }
  function observe(s, observation, now = Date.now()) {
    if (!s || s.paused) return s;
    const proof = evidence(current(s), observation, now, s.enteredAt);
    return proof ? complete(s, proof, now) : s;
  }
  function manual(s, stepId, note, now = Date.now()) {
    if (!s || current(s)?.id !== stepId) throw new Error('The step changed. Check the current instruction first.');
    if (s.paused) throw new Error('Resume your guide first.');
    note = text(note, 600); if (note.length < 3) throw new Error('Add a short note about what you completed.');
    return complete(s, { kind: 'manual', summary: note, source: 'owner' }, now);
  }
  function valid(s) {
    if (!s || typeof s !== 'object' || !Array.isArray(s.steps) || !Array.isArray(s.done) || s.done.length > s.steps.length) return null;
    const steps = normalizeSteps(s.steps);
    if (s.done.some((d, i) => d.stepId !== steps[i].id)) return null;
    return { ...s, steps };
  }
  return { musicSteps, start, current, index, evidence, fresh, complete, observe, manual, valid };
}));
