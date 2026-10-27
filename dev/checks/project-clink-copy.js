// opt-in: CLINK_FIXTURE (round 74, checkhealth74, for Codex: it needs a copy of the owner's Clink project, which a fresh test profile has not; set CLINK_FIXTURE=1 with --data on such a copy)
await Lazy.load('projects');await Projects.ready();
const p=Projects.live().find(p=>p.name.toLowerCase()==='clink');if(!p)throw Error('Use a copied Clink fixture, never the live profile.');
await ProjectWorkspace.open(p.id,'scene');
if(ProjectWorkspace.state().phase!=='ready'||ThreeLab.scenes.currentId()!==p.workspace.sceneId)throw Error('Clink not ready');
await smoke({shot:window.SMOKE_SAVES+'/clink-project.png'});
const first=ProjectWorkspace.state().timings;
await ProjectWorkspace.home();if(!ThreeLab.workspace.state().released)throw Error('Clink preview retained after closing');
await ProjectWorkspace.open(p.id,'scene');const reopened=ProjectWorkspace.state().timings;
await ProjectWorkspace.home();
return {pass:true,scene:p.workspace.sceneId,first,reopened,released:ThreeLab.workspace.state().released};
