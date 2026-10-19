// Saved project evidence only. No screen watching, AI calls, or directory scans.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const Workbench = require('./tools/workbench-core');
const hash = value => crypto.createHash('sha256').update(JSON.stringify(value ?? null)).digest('hex');
async function read(file, missing = null) {
  try { return JSON.parse(await fs.promises.readFile(file, 'utf8')); }
  catch (e) { if (e.code === 'ENOENT') return missing; throw Error('Saved project data could not be read. Progress has not changed.'); }
}
async function snapshot(dataDir, projectId) {
  if (!/^[\w-]{1,100}$/.test(projectId || '')) throw Error('Choose a Hearth project for this guide.');
  const projects = await read(path.join(dataDir, 'kv', 'projects.json'));
  const p = projects?.list?.find(p => p.id === projectId);
  if (!p) throw Error('This project is not available on this computer yet. Its quest progress is kept.');
  const [scenes, wb] = await Promise.all([
    read(path.join(dataDir, 'kv', 'three-sketches.json')),
    read(path.join(dataDir, 'kv', `workbench-${projectId}.json`)),
  ]);
  const sceneIds = new Set((p.items || []).filter(x => x.type === 'scene').map(x => x.ref));
  if (p.workspace?.sceneId) sceneIds.add(p.workspace.sceneId);
  if (sceneIds.size && (!Array.isArray(scenes) || [...sceneIds].some(id=>!scenes.some(s=>s.id===id)))) throw Error('A linked scene has not loaded from disk yet. Quest progress is kept; try again once it is available.');
  const scene = (Array.isArray(scenes) ? scenes : []).filter(s => sceneIds.has(s.id)).map(s => ({ id:s.id, code:s.code, layers:s.layers?.map(l=>({id:l.id,code:l.code,visible:l.visible})) }));
  const board = wb || Workbench.defaults();
  const outputs = (p.items || []).filter(x => ['capture','render','file','download','deploy'].includes(x.type)).map(x => ({id:x.id, label:x.name || x.type}));
  for (const a of wb?.shelf || []) outputs.push({id:'shelf:'+hash(a.image), label:a.name || 'Worktable image'});
  for (const a of wb?.vst?.presets || []) outputs.push({id:'preset:'+hash({name:a.name,state:a.state}), label:a.label || 'Saved instrument preset'});
  return { projectId, name:p.name, at:Date.now(),
    scene:scene.length ? hash(scene) : null, scenes:Object.fromEntries(scene.map(s=>[s.id,hash(s)])),
    board:hash({drawing:board.drawing, storyboard:board.storyboard, texture:board.texture, shelf:board.shelf}),
    sound:hash({patch:board.vst?.currentPatch || board.vst?.patch, presets:board.vst?.presets}),
    boardPresent:!!wb,
    outputs:outputs.slice(-200).map(x=>({id:String(x.id).slice(0,300),label:String(x.label).slice(0,140)})) };
}
function evidence(session, step, current) {
  if (!session || !step || session.paused || current.projectId !== session.projectId) return null;
  if (step.check === 'project-change') {
    const before = session.projectCheckpoint, target = step.target || 'scene';
    if ((target === 'board' || target === 'sound') && before?.boardPresent && !current.boardPresent) return null;
    const sceneId=target==='scene'&&step.action?.sceneId;
    const oldValue=sceneId?before?.scenes?.[sceneId]:before?.[target],newValue=sceneId?current.scenes?.[sceneId]:current[target];
    if (!before || !newValue || (sceneId && !oldValue) || newValue === oldValue) return null;
    return {kind:'automatic', source:'saved-project', summary:`Saved ${target === 'board' ? 'creative board' : target} changed in ${current.name}. Creative quality still needs your review.`};
  }
  if (step.check === 'project-output') {
    if (!session.projectStart) return null;
    const old = new Set(session.projectStart.outputs.map(x=>x.id));
    const output = current.outputs.find(x=>!old.has(x.id));
    return output ? {kind:'automatic', source:'project-output', summary:`Kept in ${current.name}: ${output.label}`, artifact:output.id} : null;
  }
  return null;
}
module.exports = { snapshot, evidence };
