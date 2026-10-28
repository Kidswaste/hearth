const WorkbenchUI = (() => {
  const C = WorkbenchCore;
  let KEY = 'creative-workbenches', scope = null, scopeChanges = Promise.resolve();
  let state = C.defaults(), loaded, writable = false, saving = Promise.resolve(), root, api, epoch = 0, cleanup = () => {}, current = 'studio';
  const e = (tag, text, cls) => { const n = document.createElement(tag); if (text != null) n.textContent = text; if (cls) n.className = cls; return n; };
  const row = (...children) => { const n = e('div', null, 'wb-row'); n.append(...children); return n; };
  const note = text => e('p', text, 'wb-note');
  const say = text => { api?.notice(text); if (root?.querySelector('.wb-status')) root.querySelector('.wb-status').textContent = text; };
  function btn(label, fn, cls = '') { const b = e('button', label, cls); b.type = 'button'; b.onclick = async () => { b.disabled = true; try { await fn(); } catch (err) { say(err.message); } finally { b.disabled = false; } }; return b; }
  function field(label, value, change, type = 'text') { const wrap = e('label', null, 'wb-field'), input = e(type === 'textarea' ? 'textarea' : 'input'); input.type = type; input.value = value; input.setAttribute('aria-label', label); if (type === 'text') input.maxLength = 160; if (type === 'textarea') input.maxLength = 4000; let previous=input.value;input.onchange = () => { if(input.value===previous)return;previous=input.value;change(input.value); persist(); };if(['text','textarea','color'].includes(type))input.oninput=input.onchange; wrap.append(e('span', label), input); return wrap; }
  function range(label, value, min, max, step, change) { const n = field(label, value, () => {}, 'range'), input = n.querySelector('input'), out = e('output', String(value)); input.min = min; input.max = max; input.step = step; input.oninput = () => { out.textContent = input.value; change(+input.value);persist(); }; input.onchange = () => persist(); n.firstChild.append(out); return n; }
  function select(label, value, options, change) { const w = e('label', null, 'wb-field'), s = e('select'); s.setAttribute('aria-label', label); options.forEach(v => { const pair = Array.isArray(v) ? v : [v, v]; const o = e('option', pair[1]); o.value = pair[0]; s.append(o); }); s.value = value; s.onchange = () => { change(s.value); persist(); }; w.append(e('span', label), s); return w; }
  function check(label, value, change) { const n = field(label, '', () => {}, 'checkbox'), i = n.querySelector('input'); i.checked = value; i.onchange = () => { change(i.checked); persist(); }; return n; }
  function canvas(w = 512, h = w) { const n = e('canvas', null, 'wb-canvas'); n.width = w; n.height = h; return n; }
  function validateAsync(raw) {
    return new Promise((resolve,reject)=>{const worker=new Worker('tools/workbench-state-worker.js');const timer=setTimeout(()=>{worker.terminate();reject(Error('Workbench validation timed out'));},15000);const finish=(error,value)=>{clearTimeout(timer);worker.terminate();error?reject(Error(error)):resolve(value);};worker.onmessage=({data})=>finish(data.error,data.value);worker.onerror=e=>finish(e.message);worker.postMessage(raw);});
  }
  async function ready() { return loaded ||= (async()=>{try{const raw=await hub.kvGet(KEY);if(raw?.error)throw Error(raw.error);if(raw)state=await validateAsync(raw);writable=true;}catch(err){loaded=null;throw Error(`The creative board could not be read. Existing data is preserved. ${err.message}`);}})(); }
  const pendingSaves=new Map();let saveTimer=0,saveWaiters=[];
  function persistState(value,key,canWrite=writable){if(!canWrite)return Promise.reject(Error('Local saving is disabled. Export this project to keep your work.'));pendingSaves.set(key,value);clearTimeout(saveTimer);saveTimer=setTimeout(()=>flush().catch(()=>{}),100);const task=new Promise((resolve,reject)=>saveWaiters.push({resolve,reject}));task.catch(()=>{});return task;}
  function persist(){return persistState(state,KEY);}
  function flush(){clearTimeout(saveTimer);const pending=[...pendingSaves];pendingSaves.clear();const waiters=saveWaiters;saveWaiters=[];if(!pending.length)return saving; // IPC snapshots once per burst; no renderer JSON stringify per brush event.
    saving=saving.catch(()=>{}).then(async()=>{try{for(const [key,value] of pending){const r=await hub.kvSet(key,value);if(r?.error)throw Error(r.error);dispatchEvent(new CustomEvent('hearth:workbench-saved',{detail:{key}}));}}catch(err){for(const [key,value] of pending)if(!pendingSaves.has(key))pendingSaves.set(key,value);throw err;}});saving.then(()=>waiters.forEach(w=>w.resolve()),err=>{say(`Save failed: ${err.message}. Your changes are kept in memory; retry saving.`);waiters.forEach(w=>w.reject(err));});return saving;
  }
  function setProject(id,options={}) {
    scopeChanges=scopeChanges.catch(()=>{}).then(async()=>{
      if(scope===id){if(loaded)await ready();if(options.plugins && String(state.vst.projectPlugins)!==String(options.plugins)){state.vst.projectPlugins=options.plugins;await persist();}return;}
      if(loaded)await ready();await WorkbenchVST.saveWorkspace?.();pause();await flush();
      if(id&&!/^[\w-]{1,100}$/.test(id))throw Error('Invalid project id');
      await WorkbenchVST.resetWorkspace?.();
      scope=id;KEY=id?'workbench-'+id:'creative-workbenches';loaded=null;writable=false;state=C.defaults();
      if(!id)return;await ready();
      if(options.title&&state.title==='Untitled workbench')state.title=options.title;
      if(options.plugins)state.vst.projectPlugins=options.plugins;
    });return scopeChanges;
  }
  const name = (suffix, ext) => `hearth-${state.title.replace(/[^a-z0-9_-]/gi, '-').slice(0, 40)}-${suffix}.${ext}`;
  async function save(suffix, data, ext) { return api.saveFile(name(suffix, ext), data, ext); }
  async function png(c, suffix) { const blob = await new Promise(resolve => c.toBlob(resolve, 'image/png')); if (!blob) throw Error('Could not encode image.'); await save(suffix, new Uint8Array(await blob.arrayBuffer()), 'png'); }
  function image(url) { return new Promise((resolve, reject) => { const im = new Image(), timer = setTimeout(() => { im.onload = im.onerror = null; reject(Error('The image took too long to load.')); }, 15000); const finish = () => { clearTimeout(timer); im.onload = im.onerror = null; im.naturalWidth ? resolve(im) : reject(Error('The image could not be read.')); }; im.onload = im.onerror = finish; im.src = url; if (im.complete) finish(); }); }
  async function svgCanvas(svg, size = 512) { const im = await image('data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg)), c = canvas(size); c.getContext('2d').drawImage(im, 0, 0, size, size); return c; }
  function file(label, accept, handler, limit = 12e6) { const n = field(label, '', () => {}, 'file'), i = n.querySelector('input'); i.accept = accept; i.onchange = async () => { try { const f = i.files[0]; if (!f) return; if (f.size > limit) throw Error(`File exceeds ${Math.round(limit / 1e6)} MB.`); await handler(f); } catch (err) { say(err.message); } finally { i.value = ''; } }; return n; }
  const badge = (n, title, text) => { const a = e('article', null, 'wb-card'); a.append(e('span', n, 'wb-number'), e('h3', title), note(text)); return a; };
  let mountedKey=null;
  function pause() { epoch++; cleanup(); cleanup = () => {}; mountedKey=null; api?.stopAudio(); if (typeof WorkbenchVST !== 'undefined') WorkbenchVST.pause(); }
  function suspend() { cleanup.suspend?.();api?.stopAudio();if(current==='vst'){pause();} }
  function resume() { if(mountedKey!==KEY||!root?.isConnected)return false;cleanup.resume?.();return true; }
  async function mount(target, id, helpers) { pause(); const ticket = epoch; api = helpers; root = e('section', null, 'wb-shell'); target.append(root); const ownRoot = root; current = id; await scopeChanges; await ready(); if (ticket !== epoch) return;
    const top = e('div', null, 'wb-projectbar'), menu = e('details', null, 'wb-projectmenu'), summary = e('summary', `◈ ${state.title}`), body = e('div', null, 'wb-projectbody');
    body.append(...(scope?[]:[field('Worktable name', state.title, v => { state.title = v || 'Untitled workbench'; summary.textContent = `◈ ${state.title}`; })]), btn('Export project', () => save('project', JSON.stringify(state, null, 2), 'json')), file('Open project copy', '.json', async f => { const key=KEY, next = await validateAsync(await f.text()); if(key!==KEY)throw Error('The project changed while importing. Reopen the file in the intended project.'); state = next; await persist(); api.openFeature(current); }, 64e6), note('Open replaces this worktable. Export a copy first to keep another version.'));
    menu.append(summary, body); top.append(e('p', writable ? 'Saved on this computer' : 'Recovery mode · export changes', 'wb-status'), menu); root.append(top);
    const content = e('div', null, 'wb-content'); root.append(content);mountedKey=KEY;
    if (id === 'studio') home(content); else if (id === 'vst') { const dispose = await bank(content); if (ticket !== epoch) { dispose?.(); return; } cleanup = dispose || (() => {}); } else if (id === 'texture') textures(content); else if (id === 'draw') draw(content); else if (id === 'story') storyboard(content);
    if (ticket === epoch && id !== 'story') WorkbenchStory.dock(ownRoot, workspaceHelpers());
  }
  function home(out) {
    const hero = e('div', null, 'wb-hero'); hero.innerHTML = '<svg viewBox="0 0 740 150" aria-hidden="true"><defs><linearGradient id="wbLight"><stop stop-color="#ff547d"/><stop offset="1" stop-color="#b78aff"/></linearGradient></defs><path d="M20 115H720M80 115V38H220V115M270 115V20H470V115M520 115V45H660V115" fill="none" stroke="#82758c" stroke-width="2"/><path class="wb-signal" d="M95 76H120L130 51L144 96L158 61L170 76H205M300 73Q330 10 360 73T420 73T450 73M545 76L570 52L595 93L620 62L642 76" fill="none" stroke="url(#wbLight)" stroke-width="4"/><circle cx="375" cy="135" r="4" fill="#ffbe59"/></svg>';
    hero.append(e('p', 'THE FORGE / CREATIVE BOARD', 'wb-eyebrow'), e('h2', 'Build a visual world.'), note('Materials, drawing and storyboard. One shared shelf for this project.')); out.append(hero);
    const grid = e('div', null, 'wb-stations');
    [['02', 'texture', 'Material foundry', 'Tileable color, normal, height and roughness maps.'], ['03', 'draw', 'Sketch → creation', 'Draw a form. Give it a material. Make an AI model for the Lab.'], ['04', 'story', 'Storyboard table', 'Place frames on a timeline and find the rhythm of your idea.'], ['05', 'pattern', 'Seamless tiles', 'Tweak a repeating surface and keep it with your project.']].forEach(([n, id, title, text]) => { const card = badge(n, title, text); card.append(btn('Enter station ↗', () => api.openFeature(id))); grid.append(card); }); out.append(grid);
    if (state.shelf.length) { out.append(e('h3', 'On your worktable')); const shelf = e('div', null, 'wb-shelf'); state.shelf.forEach((a, i) => { const card = e('article', null, 'wb-card'); if (a.image?.startsWith('data:image/png;base64,')) { const im = e('img'); im.src = a.image; im.alt = a.name; card.append(im); } card.append(e('strong', a.name), btn('Use as a storyboard shot', () => { if (state.storyboard.panels.length >= 24) throw Error('24 shots maximum.'); state.storyboard.panels.push({ title: a.name, notes: '', duration: 3, image: a.image }); persist(); api.openFeature('story'); }), btn('Remove from shelf', () => { state.shelf.splice(i, 1); persist(); api.openFeature('studio'); })); shelf.append(card); }); out.append(shelf); }
  }
  function stash(c, label) { const small = canvas(512, Math.round(512 * c.height / c.width)); small.getContext('2d').drawImage(c, 0, 0, small.width, small.height); state.shelf.unshift({ name: label, image: small.toDataURL('image/png') }); state.shelf = state.shelf.slice(0, 24); persist(); say('Added to the worktable. It can become a storyboard shot.'); }
  function textures(out) {
    const p = state.texture, grid = e('div', null, 'wb-two'), c = canvas(p.size), preview = e('div', null, 'wb-material'), display = canvas(512), controls = e('div', null, 'wb-controls');
    let maps, map = 'color', repeats = false, worker, pending = false, version = 0, completed = -1, mapSize = p.size, disposed = false, waiters = [];
    display.style.cssText = 'width:100%;height:100%;display:block;object-fit:contain'; preview.append(display);
    const settle = error => { const list = waiters; waiters = []; for (const w of list) error ? w.reject(error) : w.resolve(); };
    function paint() {
      if (!maps || disposed) return;
      c.width = c.height = mapSize; c.getContext('2d').putImageData(new ImageData(maps[map], mapSize, mapSize), 0, 0);
      const x = display.getContext('2d'), count = repeats ? 3 : 1, size = display.width / count;
      x.clearRect(0, 0, display.width, display.height);
      for (let y = 0; y < count; y++) for (let i = 0; i < count; i++) x.drawImage(c, i * size, y * size, size, size);
    }
    function fail(error) { pending = false; worker?.terminate(); worker = null; preview.setAttribute('aria-busy', 'false'); settle(error); if (!disposed) say(`Texture preview: ${error.message}. Adjust a control to retry.`); }
    function generate() {
      if (pending || disposed) return;
      try {
        if (!worker) {
          worker = new Worker('tools/workbench-texture-worker.js');
          worker.onerror = event => { event.preventDefault(); fail(Error(event.message || 'Generator could not start')); };
          worker.onmessage = ({ data }) => {
            pending = false; if (disposed) return;
            // At most one generation in flight and one latest request. Never queue every slider event.
            if (data.id !== version) { generate(); return; }
            if (data.error) { fail(Error(data.error)); return; }
            maps = data.maps; mapSize = p.size; completed = data.id; paint(); preview.setAttribute('aria-busy', 'false'); settle();
          };
        }
        pending = true; worker.postMessage({ id: version, options: { ...p } });
      } catch (error) { fail(error); }
    }
    function update() { version++; preview.setAttribute('aria-busy', 'true'); generate(); }
    function ensure() {
      if (disposed) return Promise.reject(Error('This material station was closed. Reopen it to export.'));
      if (completed === version) return Promise.resolve();
      const ready = new Promise((resolve, reject) => waiters.push({ resolve, reject })); generate(); return ready;
    }
    cleanup = () => { disposed = true; worker?.terminate(); worker = null; settle(Error('Material station closed')); };
    controls.append(select('Surface', p.kind, [['cloud', 'Cloud / smoke'], ['stone', 'Cut stone'], ['wood', 'Wandering grain'], ['metal', 'Brushed metal'], ['cells', 'Soft cells']], v => { p.kind = v; update(); }), field('Tint', p.color, v => { p.color = v; update(); }, 'color'), select('Resolution', p.size, [128, 256, 512], v => { p.size = +v; update(); }));
    [['Scale', 'scale', 1, 12, 1], ['Octaves', 'detail', 1, 6, 1], ['Contrast', 'contrast', .2, 3, .05], ['Normal relief', 'strength', 0, 10, .1], ['Roughness', 'roughness', 0, 1, .01]].forEach(([label, key, min, max, step]) => controls.append(range(label, p[key], min, max, step, v => { p[key] = v; update(); })));
    controls.append(btn('New variation', () => { p.seed = Math.floor(Math.random() * 1e8); update(); persist(); }), select('Inspect map', map, ['color', 'height', 'normal', 'roughness'], v => { map = v; paint(); }), check('Check 3 × 3 tiling', false, v => { repeats = v; paint(); }));
    preview.setAttribute('role', 'img'); preview.setAttribute('aria-label', 'Generated texture preview'); grid.append(preview, controls); out.append(grid, row(...['color', 'height', 'normal', 'roughness'].map(k => btn(`Export ${k} PNG`, async () => { await ensure(); const cc = canvas(mapSize); cc.getContext('2d').putImageData(new ImageData(maps[k], mapSize, mapSize), 0, 0); await png(cc, 'texture-' + k); })), btn('Keep on worktable', async () => { await ensure(); stash(c, `${p.kind} · ${map}`); })), note('Seamless periodic maps. Normal uses +Y (OpenGL); invert green in software expecting DirectX. Height and roughness are grayscale.')); update();
  }
  function workspaceHelpers() { const value=state,key=KEY,allowed=writable; return { state, persist:()=>persistState(value,key,allowed), say, e, row, note, btn, field, range, select, check, canvas, image, svgCanvas, file, save, png, stash, api, addAsset }; }
  function draw(out) { cleanup = WorkbenchStory.draw(out, workspaceHelpers()); }
  function storyboard(out) { cleanup = WorkbenchStory.storyboard(out, workspaceHelpers()); }
  function animaticHTML(board) { const data = JSON.stringify(board).replace(/</g, '\\u003c'); return `<!doctype html><meta charset="utf-8"><title>${C.esc(board.title)}</title><style>body{background:#18151c;color:#eee;font:18px system-ui;max-width:1000px;margin:30px auto}img{width:100%;height:65vh;object-fit:contain}button{padding:14px}p{white-space:pre-wrap}</style><h1>${C.esc(board.title)}</h1><button id="play">Play / restart</button> <button id="stop">Stop</button><h2></h2><img alt="Storyboard frame"><p></p><script>const b=${data};let timer,i=0;function show(){const p=b.panels[i];document.querySelector('h2').textContent=(i+1)+'. '+p.title+' / '+p.duration+'s';const im=document.querySelector('img');if(p.image){im.src=p.image;im.hidden=false}else{im.removeAttribute('src');im.hidden=true}document.querySelector('p').textContent=p.notes}function next(){show();timer=setTimeout(()=>{if(++i<b.panels.length)next()},b.panels[i].duration*1000)}document.querySelector('#play').onclick=()=>{clearTimeout(timer);i=0;next()};document.querySelector('#stop').onclick=()=>clearTimeout(timer);document.addEventListener('visibilitychange',()=>{if(document.hidden)clearTimeout(timer)});show();</script>`; }
  async function bank(out) { return WorkbenchVST.mount(out, { ...workspaceHelpers(), state: state.vst }); }
  async function soundTool(args) { await ready(); return WorkbenchVST.soundTool(args); }
  async function addAsset(asset) { await ready(); if (!asset || typeof asset.name !== 'string' || !/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(asset.image || '') || asset.image.length > 8e6) throw Error('Use a PNG asset up to 8 MB.'); state.shelf.unshift({name:asset.name.slice(0,100),image:asset.image}); state.shelf=state.shelf.slice(0,24); await persist(); }
  if (typeof HubBridge !== 'undefined') HubBridge.register(['chat_sound'], async (_tool, args, context) => { try { const p=window.Projects?.projectOfChat(context?.chatId); if(p?.workspace && scope!==p.id)throw Error(`Open the Sound desk in “${p.name}” before using its instrument. Another project's sound will not be changed.`); return { ok: true, value: await soundTool(args) }; } catch (err) { return { ok: false, error: err.message }; } });
  addEventListener('beforeunload',()=>{flush().catch(()=>{});});
  // (round 77, storeack77 — For Codex) the worktable when the other computer's version arrives (StoreAck,
  // storeack-core.js): a change not written yet goes first (sync's guard merges it with what arrived), then what's on
  // disk is put INTO the state in memory (same objects: open stations keep working on it) and the station on screen is
  // drawn again (its scroll kept) — the Sound desk keeps playing and shows it next time — then sync is told, so a thing
  // taken off the shelf right after it arrived stays off. Typing in a field or drawing: it waits until you're done.
  let wbDown=false,wbPutOff=null;
  addEventListener('pointerdown',ev=>{if(root?.contains(ev.target))wbDown=true;},true);
  const wbBusy=()=>{const a=document.activeElement;return wbDown||Boolean(root?.isConnected&&a&&root.contains(a)&&a.matches('input:not([type=range]):not([type=checkbox]):not([type=file]),textarea,[contenteditable="true"]'));};
  const wbHold=window.StoreAck?.hold(/^kv\/(workbench-[\w-]+|creative-workbenches)\.json$/,{
    name:'Worktable',pending:()=>pendingSaves.size>0,flush:()=>flush(),
    read:async rel=>{if(rel!==`kv/${KEY}.json`||!loaded||!writable)return undefined;await loaded;const raw=await StoreAck.kv(KEY,null);return raw?{v:await validateAsync(raw)}:null;},
    apply:(got,rel)=>{
      if(got===undefined||rel!==`kv/${KEY}.json`)return undefined; // not the worktable held here
      if(!got)return false; // gone there: what's here stays (sync keeps merging)
      if(wbBusy()){wbPutOff=rel;return false;}
      if(JSON.stringify(got.v)===JSON.stringify(state))return undefined;
      StoreAck.into(state,got.v);
      if(root?.isConnected&&mountedKey===KEY&&current!=='vst'){const host=root.parentNode,old=root,top=old.scrollTop,ptop=host.scrollTop;mount(host,current,api).then(()=>{old.remove();root.scrollTop=top;host.scrollTop=ptop;}).catch(()=>{});}
      return undefined;
    },
  });
  addEventListener('pointerup',()=>{wbDown=false;if(wbPutOff)setTimeout(()=>{if(wbPutOff&&!wbBusy()){const r=wbPutOff;wbPutOff=null;wbHold?.again(r);}},600);},true);
  addEventListener('focusout',()=>{if(wbPutOff)setTimeout(()=>{if(wbPutOff&&!wbBusy()){const r=wbPutOff;wbPutOff=null;wbHold?.again(r);}},600);},true);
  // parisquests61: "Make music at the park" names the worktable after the park (only the project name changes; returns the old one).
  async function startSketch(title) { await ready(); const before = state.title; state.title = String(title || '').trim().slice(0, 160) || before; await persist(); return before; }
  return { mount, pause, suspend, resume, ready, setProject, preloadSound: options => WorkbenchVST.preload({ ...workspaceHelpers(), state: state.vst },options), soundTool, addAsset, startSketch, snapshot: () => C.copy(state), flush, scope: () => scope, animaticHTML };
})();
