/* The sketch, its AI model, and its storyboard stay on the same worktable. */
const WorkbenchStory = (() => {
  const C = WorkbenchCore;
  function shot(h, image, title, notes = '') {
    if (h.state.storyboard.panels.length >= 24) throw Error('24 shots maximum.');
    h.state.storyboard.panels.push({ title, notes, duration: 3, image });
    h.persist(); refreshDock(h); h.say('Frame added. Your storyboard strip is updated.');
  }
  function refreshDock(h) {
    const root = document.querySelector('.wb-storydock'); if (!root) return;
    root.replaceChildren(h.btn(`Storyboard · ${h.state.storyboard.panels.length} frames ↗`, () => h.api.openFeature('story')));
    const strip = h.e('div', null, 'wb-dockframes');
    h.state.storyboard.panels.forEach((p, i) => { const b = h.btn(`${i + 1} · ${p.duration}s`, () => h.api.openFeature('story')); b.title = p.title; if (p.image) { const im = h.e('img'); im.src = p.image; im.alt = p.title; b.prepend(im); } else b.prepend(h.e('span', '＋', 'wb-emptyframe')); strip.append(b); });
    root.append(strip);
  }
  function dock(root, h) { root.append(h.e('aside', null, 'wb-storydock')); refreshDock(h); }
  function draw(out, h) {
    const { e, row, btn, field, range, select, check, note, canvas, image, svgCanvas, png, save, state, persist, say } = h;
    const d = state.drawing, c = canvas(), ctx = c.getContext('2d'), redo = [], layout = e('div', null, 'wb-sketch-layout'), pad = e('div', null, 'wb-sketchpad'), create = e('section', null, 'wb-create');
    let stroke = null, mode = d.brush || 'pen', rev = 0, active = true, timer = null, busy = false;
    async function redraw() { const ticket = ++rev, im = await image('data:image/svg+xml;charset=utf-8,' + encodeURIComponent(C.drawingSVG(d))); if (!active || ticket !== rev) return; ctx.clearRect(0, 0, 512, 512); ctx.drawImage(im, 0, 0); }
    const point = ev => { const r = c.getBoundingClientRect(); return [C.clamp((ev.clientX - r.left) * 512 / r.width, 0, 512), C.clamp((ev.clientY - r.top) * 512 / r.height, 0, 512)]; };
    c.setAttribute('aria-label', 'Sketch canvas');
    c.onpointerdown = ev => {
      if (d.strokes.length >= 398) return say('Drawing limit reached. Export or undo a stroke.');
      try { c.setPointerCapture(ev.pointerId); } catch { /* synthetic test events */ }
      const p = point(ev); if (mode === 'erase') { const i = d.strokes.findLastIndex(s => s.points.some(q => Math.hypot(p[0] - q[0], p[1] - q[1]) < d.width + s.width)); if (i >= 0) { redo.push(d.strokes.splice(i, 1)[0]); redraw(); persist(); } return; }
      redo.length = 0; stroke = { color: d.color, width: d.width, brush: mode, points: [p] }; d.strokes.push(stroke); redraw();
    };
    c.onpointermove = ev => { if (!stroke || stroke.points.length >= 2000) return; const p = point(ev), last = stroke.points.at(-1); if (Math.hypot(p[0] - last[0], p[1] - last[1]) < 2) return; stroke.points.push(p); redraw(); };
    const end = () => { if (!stroke) return; if (d.mirror) d.strokes.push({ ...C.copy(stroke), points: stroke.points.map(([x, y]) => [512 - x, y]) }); stroke = null; redraw(); persist(); };
    c.onpointerup = c.onpointercancel = c.onlostpointercapture = end;
    const exportCanvas = () => svgCanvas(C.drawingSVG(d));
    const tools = row(select('Brush', mode, [['pen', 'Ink'], ['pencil', 'Pencil'], ['marker', 'Soft marker'], ['ribbon', 'Ribbon'], ['dots', 'Dots'], ['line', 'Straight line'], ['erase', 'Erase stroke']], v => { mode = v; if (v !== 'erase') d.brush = v; }), field('Ink', d.color, v => { d.color = v; }, 'color'), range('Size', d.width, 1, 80, 1, v => { d.width = v; }), check('Mirror', d.mirror, v => { d.mirror = v; }));
    pad.append(tools, c, row(btn('Undo stroke', () => { if (d.strokes.length) redo.push(d.strokes.pop()); redraw(); persist(); }), btn('Redo stroke', () => { if (redo.length && d.strokes.length < 400) d.strokes.push(redo.pop()); redraw(); persist(); }), btn('Send to storyboard', async () => shot(h, (await exportCanvas()).toDataURL(), 'From the sketchbook', d.prompt)), btn('Keep on worktable', async () => h.stash(await exportCanvas(), 'My sketch'))));
    const exports = e('details', null, 'wb-fold'); exports.append(e('summary', 'Export drawing'), row(btn('Export vector SVG', () => save('drawing', C.drawingSVG(d), 'svg')), btn('Transparent PNG', async () => png(await exportCanvas(), 'sketch')))); pad.append(exports);
    const prompt = field('Describe the finish you want', d.prompt, v => { d.prompt = v.slice(0,600); }, 'textarea'); prompt.querySelector('textarea').maxLength = 600; prompt.querySelector('textarea').placeholder = 'A worn chrome creature, hot pink enamel, dark joints, polished game prop…';
    prompt.querySelector('textarea').addEventListener('input', ev => { d.prompt = ev.target.value.slice(0,600); persist(); });
    const jobs = e('div', null, 'wb-creationjobs'), jobStatus = note('Your drawing defines the form. Your description guides its materials and texture.');
    create.append(e('p', 'DRAW → MODEL → STORY', 'wb-eyebrow'), e('h3', 'Give your sketch a second life.'), prompt, jobStatus, btn('Create AI model', async () => {
      if (busy) return; if (!d.strokes.length) throw Error('Draw a form first.'); if (!d.prompt.trim()) throw Error('Describe the material and finish you want.');
      busy = true;
      try {
        await Lazy.load('apps');
        const cc = await exportCanvas(), input = canvas(); input.getContext('2d').fillStyle = '#f1edf4'; input.getContext('2d').fillRect(0,0,512,512); input.getContext('2d').drawImage(cc,0,0);
        const description = d.prompt.trim(), name = description.slice(0,48) || 'Sketch creation';
        const result = await AppsMeshy.run('image', { image: input.toDataURL(), texturePrompt: description, name, pbr: true }, { source: 'workbench' });
        if (!result?.ok) { if (result?.declined) return; throw Error(result?.error || 'The generation did not start.'); }
        d.jobs.unshift({ id: result.job.id, name, prompt: description }); d.jobs = d.jobs.slice(0,12); await persist(); await refreshJobs();
      } finally { busy = false; }
    }), note('Meshy generates a real downloadable 3D model. Connect your Meshy API key and approve the displayed credits when you create. No credits are spent by opening this page.'), jobs);
    async function modelImage(path) { const im = await image(Apps.fileUrl(path)), cc = canvas(768,432), x = cc.getContext('2d'), scale = Math.min(768/im.width,432/im.height); x.drawImage(im,(768-im.width*scale)/2,(432-im.height*scale)/2,im.width*scale,im.height*scale); return cc; }
    async function refreshJobs() {
      if (!active || !d.jobs.length) return;
      const r = await hub.apps.meshy('jobs', { resume: false }); if (!active) return; if (!r?.ok) { jobs.replaceChildren(note(r?.error || 'Could not read creations.')); return; }
      jobs.replaceChildren(); let running = false;
      for (const ref of d.jobs) {
        const j = r.value.find(x => x.id === ref.id), card = e('article', null, 'wb-creationjob'); card.append(e('strong',ref.name));
        if (!j) { card.append(note('This model is not on this computer. Your project keeps the reference.')); jobs.append(card); continue; }
        card.append(note(j.status === 'done' ? '3D model ready · GLB' : `${j.label || j.status}${j.error ? ': ' + j.error : ''}`));
        if (j.status === 'running') { running = true; const bar = e('progress'); bar.max = 100; bar.value = j.pct || 0; bar.setAttribute('aria-label','AI generation progress'); card.append(bar); }
        if (j.status === 'done' && j.files?.glb) {
          const model = { id:j.id, name:j.name, glb:j.files.glb, thumb:j.files.thumb, prompt:ref.prompt };
          if (model.thumb) { const im = e('img'); im.src = Apps.fileUrl(model.thumb); im.alt = model.name; card.append(im); }
          card.append(row(btn('Open model in Lab', async () => { await Lazy.load('apps'); await AppsMeshy.toLab(model); }), btn('Reveal GLB', () => hub.fs.reveal(model.glb))));
          if (model.thumb) card.append(row(btn('Model frame → storyboard', async () => shot(h, (await modelImage(model.thumb)).toDataURL(), model.name, ref.prompt)), btn('Keep model frame', async () => h.stash(await modelImage(model.thumb), model.name))));
          card.append(btn('Add model to asset library', async () => { await Lazy.load('assets'); await Assets.add(model.glb,{ n:model.name }); say('Model is in Hearth’s asset library.'); }));
        }
        jobs.append(card);
      }
      clearTimeout(timer); if (running) timer = setTimeout(() => refreshJobs().catch(err => say(err.message)), 5000);
    }
    layout.append(pad,create); out.append(layout); redraw();
    if (d.jobs.length) Lazy.load('apps').then(refreshJobs).catch(err => say(err.message));
    return () => { end(); active = false; rev++; clearTimeout(timer); };
  }
  function storyboard(out, h) {
    const { state, e, row, btn, field, range, note, canvas, image, file, persist, png, save } = h, board = state.storyboard;
    const view = canvas(768,432), ctx = view.getContext('2d'), timeline = e('div', null, 'wb-timeline wb-duration-track'), detail = e('div',null,'wb-controls'), workspace = e('div',null,'wb-story-layout'), transport = e('div',null,'wb-transport'), clock = e('output','0.00s'), scrub = e('input');
    let selected = 0, playing = false, raf = 0, started = 0, position = 0, shown = -1, revision = 0, dragIndex = null, disposed = false;
    const total = () => board.panels.reduce((n,p)=>n+p.duration,0), startAt = index => board.panels.slice(0,index).reduce((n,p)=>n+p.duration,0);
    function stop() { playing = false; cancelAnimationFrame(raf); timeline.querySelectorAll('.is-playing').forEach(n=>n.classList.remove('is-playing')); }
    async function show(index) { const ticket = ++revision, p = board.panels[index]; if (!p) return; ctx.fillStyle = '#19171c'; ctx.fillRect(0,0,768,432); if (p.image) { const im = await image(p.image); if (disposed || ticket !== revision) return; const s = Math.min(768/im.width,432/im.height); ctx.drawImage(im,(768-im.width*s)/2,(432-im.height*s)/2,im.width*s,im.height*s); } else { ctx.strokeStyle='#ffffff16';ctx.strokeRect(36,36,696,324);ctx.fillStyle='#827987';ctx.font='18px system-ui';ctx.fillText('Drop a sketch, image or idea into this shot',62,210); } ctx.fillStyle='#f1edf4';ctx.font='18px system-ui';ctx.fillText(`${index+1}. ${p.title.slice(0,65)}`,24,408); }
    function seek(time) { position=C.clamp(time,0,total()); let i=board.panels.findIndex((p,i)=>position<startAt(i)+p.duration);if(i<0)i=board.panels.length-1; if(i!==shown){shown=i;show(i).catch(err=>h.say(err.message));}scrub.value=position;clock.textContent=`${position.toFixed(2)}s / ${total().toFixed(2)}s`; const blocks=[...timeline.querySelectorAll('.wb-shot')], block=blocks[i], progress=(position-startAt(i))/board.panels[i].duration; timeline.style.setProperty('--playhead',`${block ? block.offsetLeft+block.offsetWidth*progress : 0}px`);timeline.querySelectorAll('.wb-shot').forEach((n,j)=>n.classList.toggle('is-playing',j===i&&playing)); }
    function refreshTimeline() { stop(); timeline.replaceChildren(); scrub.max=total();board.panels.forEach((p,i)=>{const b=btn('',()=>choose(i));b.classList.add('wb-shot');b.draggable=true;b.style.flex=`0 0 ${Math.max(82,p.duration*32)}px`;b.setAttribute('aria-pressed',String(i===selected));b.setAttribute('aria-label',`Shot ${i+1}: ${p.title}, ${p.duration} seconds`);if(p.image){const im=e('img');im.src=p.image;im.alt='';b.append(im);}else b.append(e('span','◇','wb-emptyframe'));b.append(e('span',`${i+1}. ${p.title}`),e('small',`${p.duration}s`));b.ondragstart=ev=>{dragIndex=i;ev.dataTransfer.effectAllowed='move';ev.dataTransfer.setData('text/plain',String(i));};b.ondragover=ev=>{if(dragIndex!==null){ev.preventDefault();ev.dataTransfer.dropEffect='move';}};b.ondrop=ev=>{ev.preventDefault();if(dragIndex===null)return;const p=board.panels.splice(dragIndex,1)[0];board.panels.splice(i,0,p);dragIndex=null;selected=i;persist();choose(i);};b.ondragend=()=>{dragIndex=null;};timeline.append(b);});seek(position); }
    function move(delta) { const next=selected+delta;if(next<0||next>=board.panels.length)return;[board.panels[selected],board.panels[next]]=[board.panels[next],board.panels[selected]];selected=next;persist();choose(next); }
    function choose(index) { stop();selected=C.clamp(index,0,board.panels.length-1);const p=board.panels[selected];shown=-1;seek(startAt(selected));detail.replaceChildren(field('Shot title',p.title,v=>{p.title=v;shown=-1;refreshTimeline();}),field('Direction / sound / action',p.notes,v=>{p.notes=v;},'textarea'),range('Shot duration (seconds)',p.duration,.25,30,.25,v=>{p.duration=v;refreshTimeline();}),file('Attach image to this shot','image/png,image/jpeg,image/webp',async f=>{const url=URL.createObjectURL(f);try{const im=await image(url),cc=canvas(768,432),s=Math.min(768/im.width,432/im.height);cc.getContext('2d').drawImage(im,(768-im.width*s)/2,(432-im.height*s)/2,im.width*s,im.height*s);p.image=cc.toDataURL();persist();choose(selected);}finally{URL.revokeObjectURL(url);}}),row(btn('Move earlier',()=>move(-1)),btn('Move later',()=>move(1)),btn('Duplicate shot',()=>{if(board.panels.length>=24)throw Error('24 shots maximum.');board.panels.splice(selected+1,0,C.copy(p));persist();choose(selected+1);}),btn('Remove shot',()=>{if(board.panels.length===1)throw Error('Keep at least one shot.');board.panels.splice(selected,1);persist();choose(Math.min(selected,board.panels.length-1));})));refreshTimeline(); }
    scrub.type='range';scrub.min=0;scrub.step=.01;scrub.setAttribute('aria-label','Timeline playhead');scrub.oninput=()=>{stop();seek(+scrub.value);};
    function play() { stop();if(position>=total())position=0;playing=true;started=performance.now()-position*1000;function tick(now){if(disposed||document.hidden){stop();return;}seek((now-started)/1000);if(position>=total()){stop();return;}raf=requestAnimationFrame(tick);}raf=requestAnimationFrame(tick); }
    const preview=e('div');preview.append(view,transport,e('p','YOUR SEQUENCE / drag blocks to rearrange','wb-eyebrow'),timeline);transport.append(btn('Play animatic',play),btn('Stop animatic',stop),scrub,clock);workspace.append(preview,detail);
    out.append(row(field('Storyboard title',board.title,v=>{board.title=v;}),btn('Add shot',()=>{if(board.panels.length>=24)throw Error('24 shots maximum.');board.panels.push({title:`Shot ${board.panels.length+1}`,notes:'',duration:3,image:null});persist();choose(board.panels.length-1);})),workspace);
    const shelf=e('div',null,'wb-storyassets');state.shelf.forEach(a=>{const b=btn(a.name,()=>{shot(h,a.image,a.name);choose(board.panels.length-1);});const im=e('img');im.src=a.image;im.alt='';b.prepend(im);shelf.append(b);});if(state.shelf.length)out.append(e('h3','Frames on your worktable'),shelf);
    out.append(row(btn('Export contact sheet',async()=>{const cc=canvas(1000,Math.ceil(board.panels.length/2)*360),x=cc.getContext('2d');x.fillStyle='#19171c';x.fillRect(0,0,cc.width,cc.height);for(let i=0;i<board.panels.length;i++){const p=board.panels[i],xx=i%2*500,yy=Math.floor(i/2)*360;if(p.image){const im=await image(p.image),s=Math.min(476/im.width,268/im.height);x.drawImage(im,xx+12+(476-im.width*s)/2,yy+12+(268-im.height*s)/2,im.width*s,im.height*s);}x.fillStyle='#eee';x.font='18px system-ui';x.fillText(`${i+1}. ${p.title.slice(0,35)} · ${p.duration}s`,xx+12,yy+310);x.font='12px system-ui';x.fillText(p.notes.slice(0,65),xx+12,yy+335);}await png(cc,'storyboard');}),btn('Export animatic HTML',()=>save('animatic',WorkbenchUI.animaticHTML(board),'html'))),note('Silent timing preview. Sound directions remain in your shot notes. Frames and durations are saved with this project.'));
    choose(0);return()=>{disposed=true;revision++;stop();};
  }
  return { draw, storyboard, dock, shot };
})();
