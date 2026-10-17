const wait = ms => new Promise(r => setTimeout(r, ms));
const until = async fn => { for(let i=0;i<160;i++){if(fn())return;await wait(60);}throw Error('Creative desk timed out');};
const check = (v,text) => {if(!v)throw Error(text);console.log('[J] '+text);};
// A legacy notebook is preserved even though its retired activities are no longer displayed.
await hub.kvSet('creative-playground',{v:1,seed:'focus-tiles',recipes:[{feature:'drums',name:'old beat'}],journal:{legacy:'keep my notes'},done:{}});
await Lazy.load('creative');activate('tool:creative');await until(()=>document.querySelector('.wb-stations'));
const root=()=>document.querySelector('.cp-workspace');
const press=async text=>{const b=[...root().querySelectorAll('button')].find(b=>b.textContent===text);check(b,text+' available');b.click();await until(()=>!b.disabled);await wait(80);};
check([...root().querySelectorAll('[data-feature-id]')].map(n=>n.dataset.featureId).join(',')==='studio,vst,texture,draw,story,pattern','only focused stations in navigation');
check(!/Pocket worlds|Ember sound forge|Palette posters/.test(root().textContent),'retired activities absent');
CreativePlayground.openFeature('drums');check(CreativePlayground.snapshot().feature==='studio','retired deep links recover to worktable');
await CreativePlayground.openFeature('pattern');await press('Export SVG');await press('Export PNG');await press('Keep on worktable');
check(WorkbenchUI.snapshot().shelf.length===1,'tile joins shared worktable');
const input=root().querySelector('[aria-label="Tile seed"]');input.value='focus-after-edit';input.dispatchEvent(new Event('change'));await CreativePlayground.flush();
const saved=await hub.kvGet('creative-playground');check(saved.seed==='focus-after-edit'&&saved.recipes[0].name==='old beat'&&saved.journal.legacy==='keep my notes','tile settings save without discarding legacy notebook');
await WorkbenchUI.flush();CreativePlayground.openFeature('studio');await until(()=>document.querySelector('.wb-stations'));
return 'Focused navigation, retired-link recovery, tile exports, cross-tool assets and legacy data preservation passed.';
//@@ reload
await Lazy.load('creative');activate('tool:creative');
for(let i=0;i<160&&!document.querySelector('.wb-stations');i++)await new Promise(r=>setTimeout(r,60));
if(CreativePlayground.snapshot().state.seed!=='focus-after-edit'||WorkbenchUI.snapshot().shelf.length!==1)throw Error('Focused desk did not restore');
CreativePlayground.openFeature('pattern');
return 'Tile settings and shared asset survived real reload.';
