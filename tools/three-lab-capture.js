// (round 158, split158) The Lab's pictures: contact sheet, stills at the exact frame size, stills at the cues, frames to the director, compare (pin a frame).
// Moved out of tools/three.js, unchanged: loaded on first use (lazy group `labpartcapture`, tools/three.js labPart). K is
// what it reaches inside the Lab (the sketch tab: its state, helpers and the other parts' stand-ins).
(window.LabParts ||= {}).capture = (K) => {
  async function contactSheet({ times = null, count = 8 } = {}) {
    if (K.sheetBusy) throw new Error('A contact sheet is already being made');
    // No song: frames a moment apart, as it runs.
    if (!K.player.loaded) return sheetFromFrames(await liveFrames(Math.min(count, 8)));
    K.sheetBusy = true;
    const wasPlaying = K.player.playing; const wasAt = K.player.time;
    try {
      if (wasPlaying) K.player.toggle(false);
      const cues = K.player.cues;
      let picks = times ? times.map((t) => ({ t: Number(t), label: '' })) : cues.length >= 2 ? cues.map((c) => ({ t: c.time + 0.05, label: c.name })) : null;
      if (!picks) {
        const lp = K.player.loop; const a = lp?.a ?? 0; const b = lp?.b ?? K.player.duration;
        picks = Array.from({ length: count }, (_, i) => ({ t: a + ((b - a) * (i + 0.5)) / count, label: '' }));
      }
      picks = picks.filter((x) => Number.isFinite(x.t)).slice(0, 16);
      const frames = [];
      for (const pk of picks) {
        K.player.seek(pk.t);
        await new Promise((r) => setTimeout(r, 450));
        const url = await K.director.shot();
        if (url) frames.push({ ...pk, url });
      }
      return await sheetFromFrames(frames);
    } finally {
      K.player.seek(wasAt);
      if (wasPlaying) K.player.toggle(true);
      K.sheetBusy = false;
    }
  }
  async function liveFrames(n) {
    const frames = [];
    for (let i = 0; i < n; i += 1) { const url = await K.director.shot(); if (url) frames.push({ t: i * 0.6, label: `+${(i * 0.6).toFixed(1)} s`, url }); await new Promise((r) => setTimeout(r, 600)); }
    return frames;
  }
  async function sheetFromFrames(frames) {
    if (!frames.length) throw new Error('Nothing is rendering');
    const imgs = await Promise.all(frames.map((f) => new Promise((res) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => res(null); im.src = f.url; })));
    const cols = frames.length <= 4 ? frames.length : frames.length <= 9 ? 3 : 4;
    const first = imgs.find(Boolean);
    const tw = 420; const th = Math.round(tw * (first.height / first.width)); const pad = 6; const lab = 22;
    const rows = Math.ceil(frames.length / cols);
    const cv = document.createElement('canvas');
    cv.width = cols * (tw + pad) + pad; cv.height = rows * (th + lab + pad) + pad;
    const g = cv.getContext('2d');
    g.fillStyle = '#0b0e10'; g.fillRect(0, 0, cv.width, cv.height);
    g.font = '14px Consolas, monospace';
    frames.forEach((f, i) => {
      const x = pad + (i % cols) * (tw + pad); const y = pad + Math.floor(i / cols) * (th + lab + pad);
      if (imgs[i]) g.drawImage(imgs[i], x, y, tw, th);
      g.fillStyle = '#ffd75e'; g.fillText(`${i + 1}  ${f.label?.startsWith('+') ? f.label : `${K.fmtMs(f.t).replace(/^0:/, '')}${f.label ? `  ${f.label}` : ''}`}`, x + 2, y + th + 16);
    });
    return { dataUrl: await canvasDataUrl(cv, 'image/jpeg', 0.86), frames: frames.map((f, i) => ({ n: i + 1, time: Math.round(f.t * 100) / 100, cue: f.label || undefined })) }; // (round 20) encoded off this thread
  }
  async function showSheet() {
    let sheet;
    const t = toast('Making the contact sheet…', { timeout: 30000 });
    try { sheet = await contactSheet(); } catch (err) { t.remove(); toast(err.message, { type: 'error' }); return; }
    t.remove();
    const path = await window.hub.saveAttachment(`contact-sheet-${Date.now()}.jpg`, sheet.dataUrl.split(',')[1]);
    const agent = H.agents().find((a) => a.dock === 'three' && a.mode === 'native');
    const dlg = el('dialog', { class: 'ui-modal sb-dialog' },
      el('div', { class: 'refs-head' }, el('h3', { text: `Contact sheet · ${sheet.frames.length} frames` }), el('span', { class: 'spacer' }),
        agent ? K.btn('Send to the director', 'Attach it to the Three Director\'s chat with a starter message', () => {
          dlg.close();
          Native.attachPaths(agent.id, [path]);
          Native.setDraft(agent.id, `Here's a contact sheet of "${K.current?.name}" (frames ${sheet.frames.map((f) => `${f.n} = ${K.fmtMs(f.time)}${f.cue ? ` ${f.cue}` : ''}`).join(', ')}). Look at the whole piece: `);
        }, 'primary small') : null,
        K.btn('Save…', 'Save the picture', async () => { const p = await window.hub.saveFile({ defaultPath: `${K.current?.name || 'sketch'} contact sheet.jpg`, filters: [{ name: 'JPEG', extensions: ['jpg'] }], content: sheet.dataUrl.split(',')[1], base64: true }); if (p) toast('Saved', { action: { label: 'Show', fn: () => window.hub.fs.reveal(p) } }); }),
        K.btn('Close', '', () => dlg.close())),
      el('img', { class: 'sheet-img', src: sheet.dataUrl, alt: 'Contact sheet' }));
    dlg.addEventListener('close', () => dlg.remove());
    document.body.append(dlg);
    K.openLight(dlg);
  }
  function compareMenu(x, y) {
    ThreeTweaks.menu(x, y, ['Compare with a pinned frame',
      ['Pin this frame', '| · replaces the pinned one', () => K.pinFrame()],
      ['Onion skin', 'The pinned frame over the live picture, see-through', () => K.setCompare('onion'), K.pinned?.mode === 'onion'],
      ['Wipe', 'Pinned on the left, live on the right: drag the line', () => K.setCompare('wipe'), K.pinned?.mode === 'wipe'],
      ['Difference', 'Only what changed lights up', () => K.setCompare('diff'), K.pinned?.mode === 'diff'],
      ['Pin when I freeze', 'Each freeze also pins the frame', () => store.set('three.pinOnFreeze', !store.get('three.pinOnFreeze', false)), store.get('three.pinOnFreeze', false)],
      ...(K.pinned?.mode === 'onion' ? [0.25, 0.5, 0.75].map((o) => [`${Math.round(o * 100)}% see-through`, '', () => { K.pinned.opacity = o; K.paintOnion(); }, K.pinned.opacity === o]) : []),
      K.pinned ? ['Save the pinned frame…', '', () => K.saveDataUrl(K.pinned.url, `${K.current?.name || 'sketch'} pinned.png`)] : null,
      K.pinned ? ['Send before / after to the director', 'Both frames in its chat', () => framesToDirector('compare')] : null,
      K.pinned ? ['Off', '', () => K.setCompare('off')] : null]);
  }
  async function still({ size = null, copy = false } = {}) {
    const before = K.stage.size.id;
    if (size && size !== before) { K.stage.setMode(size); await K.sleep(2200); }
    const url = await K.director.shot();
    if (size && size !== before) K.stage.setMode(before);
    if (!url) { toast('Nothing is rendering', { type: 'error' }); return null; }
    const z = ThreeMedia.SIZES.find((x) => x.id === (size || before));
    const name = `${K.current?.name || 'sketch'}${z?.w ? ` ${z.w}x${z.h}` : ''}${K.player.loaded ? ` ${K.fmtMs(K.player.time).replace(/:/g, '-')}` : ''}.png`.replace(/[\\/:*?"<>|]/g, '_');
    if (copy) {
      const b = K.pngBlob(url);
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': b })]).then(() => toast('Still copied', { timeout: 1200 }), (err) => toast(`Couldn't copy: ${err.message}`, { type: 'error' }));
    } else K.saveDataUrl(url, name);
    return url;
  }
  // A folder of stills: one at every cue (or across the song), or the frame in all four sizes, as PNGs.
  // Frames to the Three Director's chat: this frame, or the pinned one and the live one side by side in time
  async function framesToDirector(which = 'frame') {
    const agent = H.agents().find((a) => a.threeTools);
    if (!agent) { toast('Add an agent with Three.js tools first (the Three Director)', { type: 'error' }); return false; }
    const urls = which === 'compare' && K.pinned ? [K.pinned.url, await K.director.shot()] : [await K.director.shot()];
    const paths = [];
    for (const [k, u] of urls.entries()) if (u) paths.push(await window.hub.saveAttachment(`${K.safeName(K.current?.name || 'sketch')} ${which === 'compare' ? (k ? 'after' : 'before') : 'frame'}.png`, u.split(',')[1]));
    if (!paths.length) return false;
    activate(agent.id);
    await Native.attachPaths(agent.id, paths);
    Native.setDraft(agent.id, which === 'compare' ? 'Before (pinned) and after (now): ' : `This frame${K.player.loaded ? ` at ${K.fmtMs(K.player.time)}` : ''} of "${K.current?.name}": `);
    return true;
  }
  async function stillsFolder() {
    let dir = store.get('three.stillsDir', '');
    if (!dir || !(await window.hub.fs.stat(dir))?.isDir) { [dir] = await window.hub.openDialog({ title: 'Folder for the stills', properties: ['openDirectory', 'createDirectory'] }); if (!dir) return null; store.set('three.stillsDir', dir); }
    return dir;
  }
  async function stillsAt(kind = 'cues') {
    const dir = await stillsFolder();
    if (!dir) return 0;
    const sep = dir.includes('\\') ? '\\' : '/';
    const base = K.safeName(K.current?.name || 'sketch');
    let n = 0;
    const t0 = toast(kind === 'sizes' ? 'Stills in four sizes…' : 'A still at every cue…', { timeout: 60000 });
    try {
      if (kind === 'sizes') {
        const before = K.stage.size.id;
        for (const id of ['9:16', '16:9', '4:5', '1:1']) { K.stage.setMode(id); await K.sleep(2200); const url = await K.director.shot(); if (url) { const z = ThreeMedia.SIZES.find((x) => x.id === id); await window.hub.fs.write(`${dir}${sep}${base} ${z.w}x${z.h}.png`, K.pngBytes(url)); n += 1; } }
        K.stage.setMode(before);
      } else {
        const was = K.player.time; const playing = K.player.playing;
        if (playing) K.player.toggle(false);
        const cues = K.player.cues.length ? K.player.cues : Array.from({ length: 6 }, (_, i) => ({ time: (K.player.duration * (i + 0.5)) / 6, name: `${i + 1}` }));
        for (const [i, c] of cues.entries()) { K.player.seek(c.time + 0.05); await K.sleep(450); const url = await K.director.shot(); if (url) { await window.hub.fs.write(`${dir}${sep}${base} ${String(i + 1).padStart(2, '0')} ${K.safeName(c.name)}.png`, K.pngBytes(url)); n += 1; } }
        K.player.seek(was); if (playing) K.player.toggle(true);
      }
    } finally { t0.remove(); }
    toast(`${n} stills saved`, { timeout: 3000, action: { label: 'Show', fn: () => window.hub.fs.open(dir) } });
    return n;
  }
  return { contactSheet, showSheet, still, framesToDirector, stillsFolder, stillsAt, compareMenu };
};
