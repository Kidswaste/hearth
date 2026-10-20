const wait=ms=>new Promise(r=>setTimeout(r,ms));
const until=async fn=>{for(let i=0;i<240;i++){if(await fn())return;await wait(250);}throw Error('Timed out');};
const checks=[];const ok=(v,s)=>{if(!v)throw Error(s);checks.push(s);};
await wait(3000);activate('tool:three');await until(()=>typeof ThreeLab!=='undefined' && ThreeLab.scenes && ThreeLab.director);
const code=(paint)=>`const c=document.createElement('canvas');c.width=200;c.height=200;c.style.cssText='width:100%;height:100%';document.body.append(c);const g=c.getContext('2d');${paint}`;
const portrait=code("g.fillStyle='black';g.fillRect(0,0,200,200);g.fillStyle='red';g.fillRect(60,20,80,160);");
const footage=code("g.fillStyle='#00ff00';g.fillRect(0,0,200,200);g.fillStyle='#0000ff';g.fillRect(0,100,200,100);");
const cmd=await ThreeLab.cmd(); const S=ThreeLab.scenes;
const sk=S.create({name:'Video matte test',code:portrait,layers:[ThreeLayers.defaults({id:'fill',name:'Imported footage',code:footage,slot:0}),ThreeLayers.defaults({id:'portrait',name:'Red portrait',code:portrait,slot:1})],frame:'1:1',open:true});
await until(()=>S.currentId()===sk.id); ThreeLab.workspace.resume(); cmd.run(); await until(()=>ThreeLab.stageHooks.box.ready);await wait(1500);
cmd.selectLayer('Red portrait');
const select=document.querySelector('[aria-label="Fill this shape with"]');select.value='fill';select.dispatchEvent(new Event('change'));
await wait(1500);
const pixels=async()=>{const img=new Image();const shot=await ThreeLab.stageHooks.box.cover(10000);if(!shot)throw Error("No capture after: "+checks.join("; "));img.src=shot;await img.decode();const c=document.createElement('canvas');c.width=100;c.height=100;const g=c.getContext('2d');g.drawImage(img,0,0,100,100);return(x,y)=>[...g.getImageData(x,y,1,1).data];};
let at=await pixels();
ok(at(50,25)[1]>200 && at(50,25)[0]<30,'Red shape reveals green footage, without red tint');
ok(at(50,75)[2]>200,'Footage keeps its spatial detail through the shape');
ok(at(5,5).slice(0,3).every(v=>v<30),'Black background is removed; fill layer not visible outside matte');
const channel=document.querySelector('[aria-label="Mask channel"]');channel.value='alpha';channel.dispatchEvent(new Event('change'));await wait(200);
at=await pixels();ok(at(5,5)[1]>200,'Alpha mode preserves opaque black regions');
const clear=[...document.querySelectorAll('.ly-mask button')].find(b=>b.title==='Remove the mask');clear.click();await wait(200);
at=await pixels();ok(at(50,25)[0]>200 && at(50,25)[1]<30,'Clearing restores original portrait');
const restore=document.querySelector('[aria-label="Fill this shape with"]');restore.value='fill';restore.dispatchEvent(new Event('change'));await wait(100);
ok(ThreeLab.groupsHost.layers().find(l=>l.id==='portrait').mask.source==='fill','Source selection is saved in layer data');
// 0.5-second cyan WebM fixture generated with ffmpeg (64 by 64).
const buffer=Uint8Array.from(atob('GkXfo59ChoEBQveBAULygQRC84EIQoKEd2VibUKHgQJChYECGFOAZwEAAAAAAAJZEU2bdLpNu4tTq4QVSalmU6yBoU27i1OrhBZUrmtTrIHWTbuMU6uEElTDZ1OsggEyTbuMU6uEHFO7a1OsggJD7AEAAAAAAABZAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAVSalmsCrXsYMPQkBNgIxMYXZmNjMuMS4xMDJXQYxMYXZmNjMuMS4xMDJEiYhAf0AAAAAAABZUrmvXrgEAAAAAAABO14EBc8WIYzWrL5C7HeWcgQAitZyDdW5kiIEAhoVWX1ZQOYOBASPjg4QF9eEA4JCwgUC6gUCagQJVsIRVuYEBVe6BAOwBAAAAAAAAAgAAElTDZ/5zc59jwIBnyJlFo4dFTkNPREVSRIeMTGF2ZjYzLjEuMTAyc3PZY8CLY8WIYzWrL5C7HeVnyKRFo4dFTkNPREVSRIeXTGF2YzYzLjEuMTAyIGxpYnZweC12cDlnyKFFo4hEVVJBVElPTkSHkzAwOjAwOjAwLjUwMDAwMDAwMAAfQ7Z1QIjngQCjr4EAAICCSYNCAAPwA/YAOCQcGEoAADBgAABnP//9+qD/////L8n/////qRGdRMAAo5OBAGQAhgBAkpwAUAAAAyAAAFRwo5OBAMgAhgBAkpwATuAAAyAAAFRwo5OBASwAhgBAkpwAUAAAAyAAAFRwo5OBAZAAhgBAkpwATUAAAyAAAFRwHFO7a5G7j7OBALeK94EB8YIBtfCBAw=='),c=>c.charCodeAt(0)).buffer;
ThreeLab.stageHooks.box.send({type:'media-load',buffer,mime:'video/webm',video:true,name:'Matte test video',startAt:0,playing:false,volume:0});
const timeline=document.querySelector('[aria-label="Fill this shape with"]');timeline.value='media';timeline.dispatchEvent(new Event('change'));await wait(1500);
at=await pixels();ok(at(50,25)[1]>180 && at(50,25)[2]>180 && at(50,25)[0]<40,'Decoded WebM video fills the red shape with its original colors');
document.querySelector('.ly-mask').open=true;
return {checks};







