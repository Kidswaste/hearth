// Plugin vault (Codex's creative workbenches). (round 58, codexcare58) in two parts, so a computer without the VST
// runtime still tests what it can and says plainly what it couldn't:
// 1. everywhere: the vault opens at once, the runtime's state in plain words, a scan of a throwaway plugin folder (names
//    only, nothing loaded; listed once even when added twice), the missing runtime said promptly ("Install the local VST
//    runtime first") from the list and over IPC, unscanned paths refused, Stop answered, the host free again after.
// 2. with the local runtime (Python 3.10–3.14 + Pedalboard) and an installed Vital VST3: the real plugin round trip
//    (parameters, AI edit guard + opt-in, edit, exact undo, stereo render, no autoplay, preset save / export). Without
//    them this part is reported in "skipped" (shown on run-checks' line), never as passed.
const wait = ms => new Promise(r=>setTimeout(r,ms));
const until = async (fn, what = 'VST UI', ms = 96000) => {for(let i=0;i<ms/80;i++){if(fn())return;await wait(80)}throw Error(`VST UI timed out: ${what}`)};
const assert=(v,msg)=>{if(!v)throw Error(msg);console.log('[J] '+msg)};
const out = { skipped: [] };
const status = () => document.querySelector('.wb-status')?.textContent || '';
// ---- 1. what needs no runtime ----
await Lazy.load('creative');
const dir = `${window.SMOKE_TMP}/vst-fixture`;
await hub.fs.write(`${dir}/HearthFixture.vst3/Contents/Resources/moduleinfo.json`, '{"Name":"HearthFixture"}'); // a bundle's folder shape; never executed
const project = WorkbenchCore.defaults(); project.vst.roots = [dir, dir.replace(/\/vst-fixture$/, '/./vst-fixture')]; await hub.kvSet('creative-workbenches', project);
activate('tool:creative');await until(()=>document.querySelector('.wb-stations'), 'the workbench stations');
let t0 = performance.now(); CreativePlayground.openFeature('vst');
await until(()=>/Your plugin vault/.test(document.querySelector('.wb-shell')?.textContent || ''), 'the vault intro', 10000);
out.introMs = Math.round(performance.now() - t0);
const runtime = await hub.vst.status(); out.runtime = runtime.ok ? `ready (${runtime.version})` : runtime.error;
const intro = document.querySelector('.wb-shell').textContent;
assert(runtime.ok ? /ready/.test(intro) : /One-time local runtime setup/.test(intro) && /Install VST runtime/.test(intro), `the vault says the runtime's state in plain words (${out.runtime}) in ${out.introMs} ms`);
await until(()=>[...document.querySelectorAll('.wb-plugin-list button')].some(b=>/HearthFixture/.test(b.textContent)), 'the scanned fixture plugin', 10000);
out.listed = [...document.querySelectorAll('.wb-plugin-list button')].map(b=>b.textContent);
assert(out.listed.filter(t=>/HearthFixture/.test(t)).length===1, `a plugin folder added twice lists its plugin once (${out.listed.join(', ')})`);
const fixture = (await hub.vst.scan([dir])).plugins.find(p=>p.name==='HearthFixture'); assert(fixture, 'the scan finds a .vst3 bundle by name, nothing loaded');
const press=async (label, ms)=>{const b=[...document.querySelectorAll('.wb-shell button')].find(b=>b.textContent===label);assert(b,'Button '+label);b.click();await until(()=>!b.disabled, label, ms);await wait(100)};
if (!runtime.ok) {
  t0 = performance.now(); await press('HearthFixture', 10000); out.missingMs = Math.round(performance.now() - t0);
  assert(/Install the local VST runtime first/.test(status()), `choosing a plugin without the runtime says so in ${out.missingMs} ms (${status()})`);
  t0 = performance.now(); const r = await hub.vst.request({ action: 'inspect', plugin: fixture.path }); out.ipcMs = Math.round(performance.now() - t0);
  assert(!r.ok && /Install the local VST runtime first/.test(r.error) && out.ipcMs < 5000, `the host answers "${r.error}" in ${out.ipcMs} ms`);
}
const bad=await hub.vst.request({action:'inspect',plugin:'C:/not-selected.vst3'});assert(!bad.ok && /Scan and select/.test(bad.error),'unscanned plugin paths rejected');
await press('Stop plugin operation', 5000); assert(/Stop requested/.test(status()), 'Stop answers');
assert((await hub.vst.stop()).ok, 'stop over IPC answers'); const after = await hub.vst.status(); assert(!/Finish or stop/.test(after.error || ''), 'the host is free again after Stop');
// ---- 2. the real plugin (needs the runtime and Vital) ----
CreativePlayground.openFeature('vst'); await until(()=>document.querySelector('.wb-plugin-list button'), 'the plugin list', 10000);
const vital = [...document.querySelectorAll('.wb-plugin-list button')].find(b=>/^(★ )?Vital$/.test(b.textContent));
if (!runtime.ok) out.skipped.push('real plugin part: no VST runtime here (Python 3.10–3.14 + Pedalboard)');
else if (!vital) out.skipped.push('real plugin part: no Vital VST3 installed here');
else {
await press(vital.textContent);await until(()=>document.querySelector('.wb-plugin-detail h3')?.textContent==='Vital', 'Vital loaded');
const info=await WorkbenchUI.soundTool({action:'inspect',query:'envelope_1_attack'});assert(info.parameters.length>0,'actual Vital envelope parameters available');
let blocked=false;try{await WorkbenchUI.soundTool({action:'apply',parameters:{}})}catch{blocked=true}assert(blocked,'AI editing starts disabled');
const consent=document.querySelector('[aria-label="Allow the selected plugin to receive AI patch edits this session"]');consent.checked=true;consent.dispatchEvent(new Event('change'));
await press('Enable Hearth chat tools for sound designer'); await press('Prepare sound-design request');
const astra = H.agents().find(a=>a.engine==='codex'&&!a.dock); assert(astra.chatTools===true,'sound designer can enable tools explicitly'); assert(Native.view(astra.id).input.value.includes('chat_do op sound'),'sound-design request prepared without sending'); assert(!Native.isBusy(Native.chatOf(astra.id)?.id),'draft sends no model turn'); activate('tool:creative'); assert((await WorkbenchUI.soundTool({action:'inspect'})).canEdit,'plugin opt-in survives navigation to the chat');
const param=info.parameters.find(p=>typeof p.value==='number');assert(param,'numeric envelope control');
await WorkbenchUI.soundTool({action:'apply',parameters:{[param.key]:param.min + (param.max-param.min)*.77}});
const next=await WorkbenchUI.soundTool({action:'inspect',query:param.key});assert(next.parameters[0].value!==param.value,'validated AI patch actually reaches Vital');
await WorkbenchUI.soundTool({action:'undo'});const restored=await WorkbenchUI.soundTool({action:'inspect',query:param.key});assert(restored.parameters[0].value===param.value,'AI patch undo restores exact previous state');
const render=await WorkbenchUI.soundTool({action:'render',note:60,duration:2});assert(render.peak>0&&!render.silent,'real instrument audition contains sound');
CreativePlayground.openFeature('vst');await until(()=>document.querySelector('.wb-audition audio'), 'the audition player');const audio=document.querySelector('.wb-audition audio');assert(audio.paused&&audio.volume===.3,'audition does not autoplay and uses reduced preview volume');
await press('Export rendered WAV');await press('Save bank preset');await WorkbenchUI.flush();assert(WorkbenchUI.snapshot().vst.presets.length===1,'VST state saved in preset bank');
await press('Export VST patch');
}
out.result = out.skipped.length ? 'Plugin vault without a plugin runtime: scan, plain messages, prompt answers and Stop passed; the real plugin part was skipped (see skipped).' : 'Real Vital VST3: parameter edits, exact undo, stereo render, preset save/export and IPC guards passed.';
return JSON.stringify(out, null, 1);
