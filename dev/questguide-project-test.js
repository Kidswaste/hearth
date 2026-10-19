const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const M=require('../questguidemain'),W=require('../tools/workbench-core');
(async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hearth-project-guide-')),kv=path.join(dir,'kv');fs.mkdirSync(kv);
 const put=(k,v)=>fs.writeFileSync(path.join(kv,k+'.json'),JSON.stringify(v));
 const p={id:'fixture',name:'A little world',items:[{id:'scene:scene',type:'scene',ref:'scene'}],workspace:{sceneId:'scene'}},scenes=[{id:'scene',updatedAt:1,layers:[{id:'layer',code:'first version'}]}],wb=W.defaults();
 put('projects',{v:1,list:[p]});put('three-sketches',scenes);put('workbench-fixture',wb);
 let polls=0;const api=M.create({dataDir:dir,localDir:dir,pollRunning:async()=>{polls++;return false;}});
 try{
  await api.call({op:'start',questId:'q',projectId:p.id,steps:[{id:'make',check:'project-change',target:'scene',action:{type:'project',tab:'scene'}},{id:'try',check:'manual'},{id:'keep',check:'project-output'}]});
  await api.poll();assert.equal(polls,0,'no process scanning for creative guides');
  await assert.rejects(api.call({op:'check-project',stepId:'make'}),/No new saved change/);
  scenes[0].updatedAt=2;put('three-sketches',scenes);await assert.rejects(api.call({op:'check-project',stepId:'make'}),/No new saved change/,'opening/metadata does not count');
  put('three-sketches',[]);await assert.rejects(api.call({op:'check-project',stepId:'make'}),/has not loaded/,'missing scene never becomes proof');put('three-sketches',scenes);
  scenes[0].layers[0].name='A nicer label';put('three-sketches',scenes);await assert.rejects(api.call({op:'check-project',stepId:'make'}),/No new saved change/,'renaming is not creative evidence');
  wb.texture.seed++;put('workbench-fixture',wb);await assert.rejects(api.call({op:'check-project',stepId:'make'}),/No new saved change/,'wrong workspace does not count');
  scenes[0].layers[0].code='changed visible behavior';put('three-sketches',scenes);await api.call({op:'check-project',stepId:'make'});
  assert.equal(api.state().completed,1);assert.equal(api.state().session.done[0].source,'saved-project');
  await assert.rejects(api.call({op:'check-project',stepId:'make'}),/current project step/,'stale check cannot advance');
  await api.call({op:'manual',stepId:'try',note:'Tried the edge case; the jump needs a softer landing.'});
  await assert.rejects(api.call({op:'check-project',stepId:'keep'}),/Keep a new image/);
  wb.shelf.push({name:'My new texture',image:'data:image/png;base64,eA=='});put('workbench-fixture',wb);
  await api.call({op:'pause'});await assert.rejects(api.call({op:'check-project',stepId:'keep'}),/Resume/);await api.call({op:'resume'});
  await api.call({op:'check-project',stepId:'keep'});assert.equal(api.state().completed,3);assert.match(api.state().session.done[2].summary,/My new texture/);
  api.dispose();const again=M.create({dataDir:dir,localDir:dir});assert.equal(again.state().completed,3);assert.equal(again.state().session.projectId,p.id);again.dispose();
  const Project=require('../questguide-project'),s=await Project.snapshot(dir,p.id);
  fs.renameSync(path.join(kv,'workbench-fixture.json'),path.join(kv,'workbench-fixture.saved'));
  assert.equal(Project.evidence({projectId:p.id,projectCheckpoint:s},{check:'project-change',target:'board'},await Project.snapshot(dir,p.id)),null,'temporarily absent workbench does not complete a step');
  put('workbench-fixture',W.defaults());const empty=await Project.snapshot(dir,p.id);fs.unlinkSync(path.join(kv,'workbench-fixture.json'));
  const uninitialized=await Project.snapshot(dir,p.id);assert.equal(empty.board,uninitialized.board,'opening a fresh board does not count');
  console.log('Project guide: saved changes, correct workspace, no metadata-only progress, explicit review, new output, pause, stale checks and restart passed.');
 }finally{api.dispose();}
})().catch(e=>{console.error(e);process.exitCode=1;});
