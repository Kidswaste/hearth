// (round 158, split158) The director's rarer Lab tools: triggers, eval and input in the scene, the timeline and keyframes, notes, the contact sheet, references.
// Moved out of tools/three.js, unchanged: loaded on first use (lazy group `labpartai`, tools/three.js labPart). K0 is
// what it reaches inside the Lab (ThreeLab: its state, helpers and the other parts' stand-ins).
(window.LabParts ||= {}).ai = (K0) => {
  // the director's rarer Lab tools (triggers, eval, input, the timeline and keyframes, notes, contact sheet, references)
  async function labCallMore(tool, args, d) {
    if (tool === 'three_triggers') return { ok: true, value: { triggers: d.triggers(args.set || null), note: 'thr is the bar (0..1 of the analyser level), gap the shortest time between two triggers in ms, lo / hi the band in Hz' } };
    if (tool === 'three_eval') {
      const r = await d.evalInSketch(String(args.code || ''));
      return r.ok ? { ok: true, value: { result: r.value, console: d.report().console?.slice?.(-5) } } : { ok: false, error: r.error };
    }
    if (tool === 'three_input') {
      const r = await d.inputToSketch(Array.isArray(args.actions) ? args.actions : []);
      if (!r.ok) return { ok: false, error: r.error };
      if (!args.screenshot) return { ok: true, value: { done: r.log } };
      const url = await d.shot();
      return { ok: true, value: { done: r.log }, ...(url ? { images: [{ data: url.split(',')[1], mime: 'image/png' }] } : {}) };
    }
    if (tool === 'three_timeline') return { ok: true, value: d.timeline(args.from != null || args.to != null ? { from: args.from ?? 0, to: args.to ?? Infinity } : null) };
    if (tool === 'three_timeline_edit') return { ok: true, value: d.timelineEdit(args) };
    if (tool === 'three_animate') return { ok: true, value: d.applyPreset(args.layer, args.preset) };
    if (tool === 'three_notes') {
      const action = args.action || 'list';
      if (action === 'list') {
        const list = d.notes.list();
        const open = list.filter((n) => !n.done && n.image).slice(0, 6);
        const images = [];
        for (const n of open) { try { images.push({ data: await window.hub.fs.read(n.image, { encoding: 'base64' }), mime: 'image/png' }); } catch { /* missing file */ } }
        return { ok: true, images, value: { notes: list.map(({ image, ...n }) => n), screenshots: images.length ? `The ${images.length} images are the open notes' screenshots, in this order: ${open.map((n) => n.id).join(', ')}` : 'none' } };
      }
      if (action === 'done' || action === 'reopen') return { ok: true, value: d.notes.set(args.id, { done: action === 'done' }) };
      if (action === 'edit') return { ok: true, value: d.notes.set(args.id, { text: String(args.text || '') }) };
      if (action === 'delete') { d.notes.remove(args.id); return { ok: true, value: d.notes.list() } ; }
      if (action === 'add') { const n = await d.notes.add(Number(args.time) || 0, args.text); return { ok: true, value: n }; }
      return { ok: false, error: 'action must be list, done, reopen, edit, delete or add' };
    }
    if (tool === 'three_contact_sheet') {
      const sheet = await d.contactSheet({ times: Array.isArray(args.times) ? args.times : null, count: Math.max(2, Math.min(16, Number(args.count) || 8)) });
      return { ok: true, images: [{ data: sheet.dataUrl.split(',')[1], mime: 'image/jpeg' }], value: { frames: sheet.frames, note: 'Numbered left to right, top to bottom.' } };
    }
    if (tool === 'three_references') {
      const action = args.action || 'list';
      const R = d.refs;
      const find = (n) => R.list().find((r) => r.key === n || r.name === n) || (() => { throw new Error(`No reference "${n}". References: ${R.list().map((r) => r.key).join(', ') || 'none'}`); })();
      if (action === 'list') {
        const list = R.list();
        const imgs = list.filter((r) => r.kind === 'image').slice(0, 6);
        const images = [];
        for (const r of imgs) {
          try {
            const img = new Image(); img.src = R.url(r.path); await img.decode();
            const c = document.createElement('canvas'); const sc = Math.min(1, 640 / Math.max(img.width, img.height));
            c.width = Math.max(1, Math.round(img.width * sc)); c.height = Math.max(1, Math.round(img.height * sc));
            c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
            images.push({ data: (await canvasDataUrl(c, 'image/jpeg', 0.85)).split(',')[1], mime: 'image/jpeg' });
          } catch { /* unreadable */ }
        }
        return { ok: true, images, value: { palette: R.palette(), references: list.map((r) => ({ name: r.key, kind: r.kind, file: r.name, size: R.size(r.size), use: R.use(r) })), pictures: images.length ? `The ${images.length} images are, in order: ${imgs.map((r) => r.key).join(', ')}` : 'none' } };
      }
      if (action === 'add') {
        const p = String(args.path || '');
        const dir = await window.hub.attachmentsDir();
        if (!p.toLowerCase().startsWith(dir.toLowerCase())) return { ok: false, error: 'You can only add files the user attached in this chat (their path is in the hub\'s attachments folder). Ask the user to drop the file in the chat or in the Lab\'s References.' };
        const r = await R.add(p, args.name);
        return { ok: true, value: { added: r.key, kind: r.kind, use: R.use(r), note: 'Available in code right away; run the sketch (three_set_code / three_update_layer) to use it.' } };
      }
      if (action === 'rename') { const r = find(args.name); return { ok: true, value: { renamed: R.rename(r, String(args.to || r.key)) } }; }
      if (action === 'remove') { R.remove(find(args.name)); return { ok: true, value: { references: R.list().map((r) => r.key) } }; }
      if (action === 'palette') {
        if (args.from) return { ok: true, value: { palette: await R.paletteFrom(String(args.from)) } };
        const cols = K0.parseColors(args.coolors || args.colors || []);
        R.setPalette(cols);
        return { ok: true, value: { palette: cols } };
      }
      // (round 131, refmatch131) like: the picture (small) + its palette and look, to build ONE layer in its spirit
      if (action === 'like') { if (typeof LabRefMatch === 'undefined' && window.Lazy) await Lazy.load('refmatch'); return LabRefMatch.op(find(args.name), args); }
      return { ok: false, error: 'action must be list, add, rename, remove, palette or like' };
    }
    if (tool === 'three_keyframes') return { ok: true, value: d.setKeyframes(args.layer, args.property, args.keys, args.clear) };
    return { ok: false, error: `Unknown tool ${tool}` };
  }
  return { labCallMore };
};
