// Isolated profile. Map images stay offline; no engine turn, purchase or live data.
const source=Object.getOwnPropertyDescriptor(HTMLImageElement.prototype,'src');
Object.defineProperty(HTMLImageElement.prototype,'src',{...source,set(value){if(String(value).startsWith('https://tile.openstreetmap.org/')){queueMicrotask(()=>this.dispatchEvent(new Event('error')));return;}source.set.call(this,value);}});
const wait=ms=>new Promise(r=>setTimeout(r,ms)),until=async fn=>{for(let i=0;i<200;i++){if(await fn())return;await wait(50);}throw Error('Icon-language check timed out');};
let checks=0;const check=(ok,msg)=>{if(!ok)throw Error(msg);checks++;},root=()=>document.querySelector('.qj'),scope=()=>root().querySelector('dialog[open]')||root();
const press=async(name,parent=scope())=>{const b=[...parent.querySelectorAll('button')].find(b=>b.textContent===name||b.getAttribute('aria-label')===name);check(b,'Button '+name);b.click();await until(()=>!b.disabled);await wait(60);};
const hint=()=>root().querySelector('.qj-help-tooltip');
const escape=async()=>{await smoke({cdp:'Input.dispatchKeyEvent',params:{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27,nativeVirtualKeyCode:27}});await smoke({cdp:'Input.dispatchKeyEvent',params:{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27,nativeVirtualKeyCode:27}});await wait(40);};
await Lazy.load('questjournal');activate('tool:quests');await until(()=>root()?.querySelector('.qj-hero'));document.querySelectorAll('.toast').forEach(n=>n.remove());
const before=QuestJournal.snapshot();
for(const page of ['adventure','campaigns','skills','rewards','collection','deck','life','commissions','world']){
  QuestJournal.navigate(page);await wait(70);
  check(root().querySelectorAll('.qj-action-icon').length>=5,page+' shares icon controls');
  for(const b of root().querySelectorAll('.qj-action-icon'))check(b.getAttribute('aria-label')&&b.querySelector('svg[aria-hidden=true]')&&b.querySelector('.qj-action-text'),page+' icon is named');
  for(const b of root().querySelectorAll('.qj-primary.qj-action'))check(!b.classList.contains('qj-action-icon'),page+' primary label stays visible');
  const help=root().querySelector('.qj-content [data-help]')||root().querySelector('.qj-content .qj-icon-button');check(help,page+' offers contextual explanation');help.scrollIntoView({block:'center'});help.focus();await wait(40);
  const shown=help.dataset.help?hint():help.parentElement.querySelector('[role=tooltip]');check(help.dataset.help?shown.matches(':popover-open')&&shown.textContent===help.dataset.help:getComputedStyle(shown).visibility==='visible',page+' keyboard hint');
  const r=shown.getBoundingClientRect();check(r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight,page+' hint remains on screen');
  help.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));check(!hint().matches(':popover-open'),page+' Escape dismisses');
}
check(JSON.stringify(QuestJournal.snapshot())===JSON.stringify(before),'browsing and hints do not modify progress');
QuestJournal.navigate('adventure');await press('Begin quest →');check(scope().querySelector('.qj-proof-summary'),'proof requirement remains visible');
const draft=scope().querySelector('[aria-label="Prepare Astra draft"]');check(draft?.classList.contains('qj-action-icon'),'Astra helper uses chat icon');draft.focus();await wait(40);check(hint().matches(':popover-open'),'hint works above a modal');await escape();check(scope().tagName==='DIALOG'&&!hint().matches(':popover-open'),'first Escape hides hint and keeps quest open');
await smoke({shot:window.SMOKE_SAVES+'/sidequest-icons-quest.png'});await escape();check(!root().querySelector('dialog[open]'),'second Escape closes the modal normally');
await press('Motion on');check(root().querySelector('[aria-label="Motion off"] svg'),'motion label keeps glyph after state update');await press('Motion off');await press('Lamp on');check(root().querySelector('[aria-label="Lamp off"] svg'),'lamp label keeps glyph after state update');await press('Lamp off');
await press('Journal options');check(scope().querySelector('[aria-label="Export backup"] svg'),'backup export icon');await press('Restore backup');const replace=[...scope().querySelectorAll('button')].find(b=>b.textContent==='Replace with this journal');check(replace&&!replace.classList.contains('qj-action-icon'),'restore confirmation remains explicit');scope().close();
for(const page of ['adventure','skills','collection']){QuestJournal.navigate(page);root().querySelector('.qj-content').scrollIntoView({block:'start'});await wait(100);await smoke({shot:window.SMOKE_SAVES+'/sidequest-icons-'+page+'.png'});}
await smoke({cdp:'Emulation.setDeviceMetricsOverride',params:{width:760,height:1000,deviceScaleFactor:1,mobile:false}});
for(const page of ['adventure','campaigns','skills','rewards','collection','deck','life','commissions','world']){
  QuestJournal.navigate(page);await wait(90);check(root().scrollWidth<=root().clientWidth+2,page+' narrow layout fits');
  const help=root().querySelector('.qj-content [data-help]')||root().querySelector('.qj-content .qj-icon-button');help.scrollIntoView({block:'center'});help.focus();await wait(30);const r=(help.dataset.help?hint():help.parentElement.querySelector('[role=tooltip]')).getBoundingClientRect();check(r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight,page+' narrow hint fits');
}
QuestJournal.navigate('adventure');root().querySelector('.qj-content').scrollIntoView({block:'start'});await wait(100);await smoke({shot:window.SMOKE_SAVES+'/sidequest-icons-narrow.png'});await smoke({cdp:'Emulation.clearDeviceMetricsOverride'});await QuestJournal.flush();return 'Sidequest icons: '+checks+' checks across nine pages, modal hints, dynamic labels, explicit restore and narrow layouts.';
