// On-demand second opinion: actual frames -> grounded observations -> an editable chat draft.
const VisualFeedback = (() => {
  const C = VisualFeedbackCore, base = p => String(p || '').split(/[\\/]/).pop();
  let dialog = null, opening = null, listening = false;
  const runs = new Map();
  const button = (text, fn, cls = '') => el('button', { type: 'button', class: cls, text, on: { click: () => Promise.resolve().then(fn).catch(e => toast(e.message, { type: 'error' })) } });
  async function context() {
    const p = Lazy.loaded('projects') ? ProjectWorkspace.current() : null, linked = p ? ProjectWorkspace.currentChat() : null;
    const sceneId = p ? ProjectWorkspace.currentScene() : (Lazy.loaded('lab') && ThreeLab.scenes?.currentId()) || null;
    const agentId = linked?.agentId || (H.agent(H.activeId)?.mode === 'native' ? H.activeId : null);
    const chatId = linked?.id || (agentId && H.activeChat[agentId]);
    const chat = chatId ? await Native.load(chatId) : null;
    return { projectId: p?.id, sceneId, name: p?.name || chat?.title || '', chatId, agentId, chatTitle: chat?.title || '', messages: C.recent(chat?.messages), media: [...new Set((chat?.messages || []).slice(-20).reverse().flatMap(m => ['opens', 'images', 'attachments'].flatMap(k => (Array.isArray(m[k]) ? m[k] : []).map(x => typeof x === 'string' ? x : x?.path || x?.filePath))).concat((p?.items || []).map(i => i.ref)).filter(C.video))].slice(0, 8) };
  }
  async function recordScene(ctx, seconds, signal, status = () => {}) {
    signal.throwIfAborted();
    if (!ctx.sceneId) throw Error('Open a project scene first, then start a feedback round.');
    const sameProject = () => !ctx.projectId || (ProjectWorkspace.current()?.id === ctx.projectId && ProjectWorkspace.currentScene() === ctx.sceneId);
    if (!sameProject()) throw Error('The project changed. Reopen Feedback in the scene you want to record.');
    await Lazy.load('lab'); signal.throwIfAborted();
    const cmd = await ThreeLab.cmd({ show: false }); signal.throwIfAborted();
    if (cmd.recording || Capture.recording || (typeof ThreeSeq !== 'undefined' && ThreeSeq.rendering)) throw Error('Finish the current recording or render first.');
    if (!sameProject()) throw Error('The project changed. Reopen Feedback in the scene you want to record.');
    if (ctx.projectId) await ProjectWorkspace.openScene(ctx.sceneId, Projects.get(ctx.projectId));
    signal.throwIfAborted();
    const sameScene = () => sameProject() && ThreeLab.scenes.currentId() === ctx.sceneId;
    if (!sameScene()) throw Error('The scene changed. Reopen Feedback to record it.');
    const take = new AbortController(), cancel = () => take.abort();
    signal.addEventListener('abort', cancel, { once: true });
    const watch = setInterval(() => { if (!sameScene()) take.abort(); }, 250);
    let clip;
    try {
      status('Starting the scene recorder…');
      clip = await cmd.recordClip({ seconds, signal: take.signal, onProgress: (elapsed, total) => status(`● Recording scene · ${elapsed.toFixed(1)} / ${total}s`) });
      take.signal.throwIfAborted(); signal.throwIfAborted();
    } finally { clearInterval(watch); signal.removeEventListener('abort', cancel); }
    if (!sameScene()) throw Error('The scene changed during the recording. Try again in the scene you want.');
    if (!clip.buffer?.byteLength) throw Error('The scene recorder returned an empty clip. Let the scene finish loading, then retry.');
    status('Saving the take locally…');
    const writer = await hub.capture.recOpen({ name: `${ctx.name || 'Scene'} feedback ${Date.now()}`, ext: clip.mime?.includes('mp4') ? 'mp4' : 'webm' });
    let file;
    try {
      const bytes = new Uint8Array(clip.buffer);
      for (let offset = 0; offset < bytes.length; offset += 1048576) await hub.capture.recWrite(writer.id, bytes.subarray(offset, offset + 1048576));
    } finally { file = await hub.capture.recClose(writer.id); }
    if (!file) throw Error('The recording could not be saved.');
    const finished = await hub.capture.finish({ path: file, mp4: false, ms: Math.round(clip.duration * 1000) });
    const path = finished.mp4 || finished.webm || file;
    Capture.remember({ kind: 'video', path, duration: finished.duration || clip.duration, w: clip.width, h: clip.height, fps: 30 });
    // Save to the original project's shelf even if the dialog closes while the encoder finishes.
    const p = ctx.projectId && Projects.get(ctx.projectId);
    if (p) { Projects.add(p, 'capture', path, `${ctx.name} · feedback take`, { links: false }); await Projects.flush(); }
    signal.throwIfAborted(); return path;
  }
  async function prepare(file, mode, frame, signal, status) {
    signal.throwIfAborted();
    const info = await FrameRead.info(file); signal.throwIfAborted();
    const wanted = C.plan(info, { mode, frame });
    status(`Reading ${wanted.length} ${mode === 'detail' ? 'consecutive' : 'overview'} frames…`);
    const extracted = await FrameRead.frames(file, { frames: wanted }, { width: 960, format: 'jpg' }); signal.throwIfAborted();
    const frames = extracted.map(f => ({ ...f, frame: Number.isInteger(f.presented) ? f.presented : f.frame, time: Number.isFinite(f.mediaTime) ? f.mediaTime : f.time, exact: f.exact ?? info.exact }));
    if (frames.length !== wanted.length || frames.some(f => !f.path || !Number.isFinite(f.time) || !Number.isInteger(f.frame))) throw Error('Some frames could not be read. Try another local video export.');
    const packet = { name: base(file), file, mode, info, frames: frames.map(f => ({ ...f, exact: f.exact ?? info.exact })), sheets: [] };
    const exact = packet.frames.every(f => f.exact);
    packet.coverage = `${frames.length} ${mode === 'detail' && exact ? 'consecutive' : 'sampled'} frames; ${exact ? 'frame positions verified by the decoder' : 'frame positions estimated on this computer'}. Images only, no audio or continuous playback.`;
    // Six labelled frames per image keeps detail legible and limits each call to 2–4 images.
    for (let start = 0; start < frames.length; start += 6) {
      signal.throwIfAborted();
      const rows = Math.ceil(Math.min(6, frames.length - start) / 2), canvas = el('canvas', { width: 1600, height: 64 + rows * 490 }), g = canvas.getContext('2d');
      g.fillStyle = '#0d0e12'; g.fillRect(0, 0, canvas.width, canvas.height); g.fillStyle = '#ffcf64'; g.font = '24px sans-serif'; g.fillText(`HEARTH / ${mode === 'detail' ? 'CLOSE LOOK' : 'OVERVIEW'} / ${base(file).slice(0, 70)}`, 20, 40);
      for (let n = start; n < Math.min(start + 6, frames.length); n++) {
        const im = await Capture.loadImage(frames[n].path); signal.throwIfAborted();
        const col = (n - start) % 2, row = Math.floor((n - start) / 2), x = col * 800 + 12, y = 64 + row * 490;
        const ratio = Math.min(776 / im.naturalWidth, 440 / im.naturalHeight), w = im.naturalWidth * ratio, h = im.naturalHeight * ratio;
        g.drawImage(im, x + (776 - w) / 2, y + (440 - h) / 2, w, h);
        g.fillStyle = '#f3eee5'; g.font = '22px monospace'; g.fillText(`#${n + 1} · f${frames[n].frame} · ${frames[n].time.toFixed(3)}s`, x + 8, y + 474);
        // Stable small previews survive decoder-cache eviction and later exports at the same path.
        const ratioThumb = Math.min(1, 320 / Math.max(im.naturalWidth, im.naturalHeight));
        const thumb = el('canvas', { width: Math.max(1, Math.round(im.naturalWidth * ratioThumb)), height: Math.max(1, Math.round(im.naturalHeight * ratioThumb)) });
        thumb.getContext('2d').drawImage(im, 0, 0, thumb.width, thumb.height);
        packet.frames[n].preview = await hub.saveAttachment(`feedback-frame-${Date.now()}-${n}.jpg`, thumb.toDataURL('image/jpeg', .85).split(',')[1]);
      }
      packet.sheets.push(await hub.saveAttachment(`feedback-${Date.now()}-${start}.jpg`, canvas.toDataURL('image/jpeg', .9).split(',')[1]));
    }
    signal.throwIfAborted(); return packet;
  }
  function review(packet, ctx, direction, status, signal) {
    signal.throwIfAborted();
    const agent = H.agents().find(a => a.mode === 'native' && a.engine === 'codex' && !a.dock) || H.agents().find(a => a.mode === 'native' && a.engine === 'codex');
    if (!agent) throw Error('Add Astra in Settings before asking for a second opinion.');
    const id = 'visual-feedback-' + crypto.randomUUID();
    return new Promise((resolve, reject) => {
      let output = '', settled = false, timer;
      const done = (err, value) => { if (settled) return; settled = true; clearTimeout(timer); runs.delete(id); signal.removeEventListener('abort', cancel); err ? reject(err) : resolve(value); };
      const cancel = () => { hub.stop(id).catch(() => {}); done(Error('Review stopped. Your clip and frames are unchanged.')); };
      if (!listening) { hub.onEngineEvent(ev => runs.get(ev.chatId)?.(ev)); listening = true; }
      runs.set(id, ev => {
        if (ev.chatId !== id || settled) return;
        if (ev.type === 'delta') { output += ev.text || ''; if (output.length > 80000) { cancel(); return; } status('Astra is writing your next directions…'); }
        else if (ev.type === 'thinking') status('Astra is examining the frames…');
        else if (ev.type === 'done') {
          if (ev.usage) document.dispatchEvent(new CustomEvent('hearth:usage', { detail: { agentId: agent.id, usage: ev.usage, source: 'visual-feedback' } }));
          try { done(null, { ...C.parse(ev.text || output, packet), model: agent.model || 'Astra configured model', at: Date.now() }); } catch (e) { done(e); }
        } else if (ev.type === 'error' || ev.type === 'stopped') done(Error(ev.message || 'Review stopped. Try again when Astra is ready.'));
      });
      timer = setTimeout(() => { hub.stop(id).catch(() => {}); done(Error('The review timed out. Your prepared frames are kept; you can retry.')); }, 8 * 60000);
      signal.addEventListener('abort', cancel, { once: true });
      hub.send({ agentId: agent.id, chatId: id, session: {}, text: C.prompt(packet, ctx, direction), options: { visualReview: true, lean: true, helper: true, persona: C.persona, webSearch: 'disabled', images: packet.sheets } }).then(r => { if (r?.error) done(Error(r.error)); }).catch(done);
    });
  }
  async function toDraft(ctx, text, sheets) {
    if (!text.trim()) throw Error('Choose a finding or write your own direction first.');
    const live = H.chats.find(c => c.id === ctx.chatId);
    if (!live || !H.agent(live.agentId)) throw Error('The original chat is unavailable here. Copy the prompt instead; no other chat was changed.');
    if (CaptureView.viewer?.open) CaptureView.viewer.close();
    if (ctx.projectId) {
      const p = Projects.get(ctx.projectId); if (!p) throw Error('The project is unavailable here. Copy the prompt instead.');
      await ProjectWorkspace.conversation(p, ctx.chatId);
    } else { await Native.load(ctx.chatId); Native.selectChat(live.agentId, ctx.chatId); activate(live.agentId); await Native.refresh(live.agentId); }
    if (H.activeChat[live.agentId] !== ctx.chatId) throw Error('The active chat changed. Your draft was not replaced.');
    const view = Native.view(live.agentId); if (!view) throw Error('Open this chat, then try again.');
    Native.setDraft(live.agentId, C.appendDraft(view.input.value, text));
    store.set(`draft.${live.agentId}.${ctx.chatId}`, view.input.value);
    await Native.attachPaths(live.agentId, sheets);
  }
  async function open(file = null) {
    if (dialog?.open) { dialog.focus(); return dialog; }
    if (opening) return opening;
    opening = build(file); try { return await opening; } finally { opening = null; }
  }
  async function build(file) {
    const ctx = await context();
    const history = await hub.kvGet('visual-feedback', { v: 1, reviews: [] }).catch(() => ({ reviews: [] }));
    let packet = null, result = null, selected = [], controller = null, busy = false;
    let source = C.video(file) ? file : ctx.media[0] || null;
    const status = el('p', { class: 'vf-status', attrs: { role: 'status', 'aria-live': 'polite' } });
    const say = text => { status.textContent = text; };
    const direction = el('textarea', { class: 'vf-direction', rows: 2, value: C.feelings[0][2], attrs: { 'aria-label': 'What should Astra look for?' } });
    const clips = el('select', { attrs: { 'aria-label': 'Video to review' } });
    const sources = [...new Set([source, ...ctx.media].filter(Boolean))];
    const paintSources = () => { clips.replaceChildren(el('option', { value: '', text: 'Choose a recording…' }), ...sources.map(p => el('option', { value: p, text: base(p), selected: p === source }))); clips.value = source || ''; };
    paintSources();
    const mode = el('select', { attrs: { 'aria-label': 'Review scope' } }, el('option', { value: 'overview', text: 'Overview · 12 frames' }), el('option', { value: 'detail', text: 'Close look · 24 consecutive frames' }));
    const at = el('input', { type: 'number', min: 0, step: .01, value: '0', hidden: true, attrs: { 'aria-label': 'Close look at seconds' }, title: 'Centre the close look on this time in seconds' });
    const preview = el('div', { class: 'vf-frames' }), findings = el('div', { class: 'vf-findings' }), draft = el('textarea', { class: 'vf-draft', rows: 9, attrs: { 'aria-label': 'Editable fix prompt' }, placeholder: 'Your suggested prompt will appear here.' });
    const copy = button('Copy prompt', () => copyText(draft.value)), send = button('Use in project chat →', async () => { send.disabled = true; try { await toDraft(ctx, draft.value, packet?.sheets || []); dlg.close(); toast('Prompt and frames added to your draft. Review it, then send.'); } finally { send.disabled = false; } }, 'primary');
    send.textContent = ctx.chatId ? `Use in ${ctx.name || 'chat'} →` : 'Open a project chat to use this';
    const draftBox = el('section', { class: 'vf-prompt', hidden: true }, el('h3', { text: 'Your next prompt' }), draft, el('div', { class: 'vf-actions' }, copy, send));
    const rebuildDraft = () => { draft.value = C.fixPrompt(result, selected, packet, ctx); copy.disabled = !draft.value; send.disabled = !draft.value || !ctx.chatId; };
    draft.addEventListener('input', () => { copy.disabled = !draft.value.trim(); send.disabled = !draft.value.trim() || !ctx.chatId; });
    const invalidate = () => { packet = result = null; findings.replaceChildren(); preview.replaceChildren(); draftBox.hidden = true; setup.open = true; dlg.classList.remove('vf-ready'); };
    clips.onchange = () => { source = clips.value || null; invalidate(); };
    mode.onchange = () => { at.hidden = mode.value !== 'detail'; invalidate(); };
    at.onchange = invalidate;
    const setBusy = yes => { busy = yes; for (const node of setup.querySelectorAll('button,input,select,textarea')) node.disabled = yes; run.disabled = yes; stop.hidden = !yes; recent.disabled = yes; for (const node of findings.querySelectorAll('button,input')) node.disabled = yes; draft.disabled = yes; copy.disabled = yes || !draft.value.trim(); send.disabled = yes || !draft.value.trim() || !ctx.chatId; };
    const inspect = async frame => { if (busy) return; mode.value = 'detail'; at.hidden = false; at.value = String(frame.time); invalidate(); say('Close look selected. Review these 24 frames when ready.'); };
    function paint() {
      preview.replaceChildren(...packet.frames.map((f, i) => {
        const b = button(`#${i + 1} · ${f.time.toFixed(2)}s`, () => CaptureView.open(packet.file, { frame: f.frame }), 'vf-frame');
        b.title = `Open frame ${f.frame}; use ← / → to step through the clip`; b.prepend(el('img', { src: Capture.fileUrl(f.preview || f.path), loading: 'lazy', alt: `Evidence ${i + 1}, frame ${f.frame}` })); return b;
      }));
      if (!result) return;
      setup.open = false; dlg.classList.add('vf-ready');
      findings.replaceChildren(el('h3', { text: result.summary }), el('p', { class: 'vf-keep', text: 'Keep · ' + result.keep }));
      result.issues.forEach((q, i) => {
        const choose = el('input', { type: 'checkbox', checked: selected.includes(i), attrs: { 'aria-label': 'Include ' + q.title } });
        choose.onchange = () => { selected = choose.checked ? [...selected, i] : selected.filter(n => n !== i); rebuildDraft(); };
        const evidence = el('div', { class: 'vf-evidence' }, ...q.evidence.map(n => { const f = packet.frames[n - 1], b = button(`◎ #${n} · ${f.time.toFixed(2)}s`, () => CaptureView.open(packet.file, { frame: f.frame })); b.prepend(el('img', { src: Capture.fileUrl(f.preview || f.path), alt: `Evidence ${n}`, loading: 'lazy' })); return b; }));
        findings.append(el('article', { class: 'vf-finding' }, el('label', { class: 'vf-title' }, choose, el('strong', { text: q.title }), q.confidence === 'tentative' ? el('span', { class: 'vf-tag', text: 'Possible cause' }) : null), el('p', { text: q.observation }), el('p', { class: 'hint', text: q.why }), evidence, el('p', { class: 'vf-change', text: 'Try · ' + q.change }), el('details', {}, el('summary', { text: 'How to check it' }), el('p', { text: q.check })), button('↝ Look closer here', () => inspect(packet.frames[q.evidence[0] - 1]), 'vf-closer')));
      });
      findings.append(el('p', { class: 'vf-limits', text: result.limits }));
      draftBox.hidden = !result.issues.length; rebuildDraft();
    }
    const run = button('✦ Ask Astra for direction', async () => {
      if (busy) return;
      if (!source) { say('Record the current scene above, or choose a saved video.'); return; }
      controller = new AbortController(); const task = controller; setBusy(true); say('Preparing the clip locally…');
      try {
        if (!packet) {
          let frame = 0;
          if (mode.value === 'detail') { const point = await FrameRead.at(source, { time: Number(at.value) || 0 }, { width: 320 }); task.signal.throwIfAborted(); frame = point.frame; }
          packet = await prepare(source, mode.value, frame, task.signal, say); paint();
        }
        task.signal.throwIfAborted(); say('Astra is reviewing your frames…');
        const next = await review(packet, ctx, direction.value, say, task.signal); task.signal.throwIfAborted();
        result = next; selected = result.issues.length ? [0] : []; paint(); say(`${packet.coverage} Review ready.`);
        const latest = await hub.kvGet('visual-feedback', { v: 1, reviews: [] }); task.signal.throwIfAborted();
        const entry = { id: crypto.randomUUID(), at: Date.now(), ctx: { ...ctx, messages: [], media: [] }, direction: direction.value, packet, result };
        await hub.kvSet('visual-feedback', { v: 1, reviews: [entry, ...(latest.reviews || [])].slice(0, 20) });
        history.reviews = [entry, ...(history.reviews || [])].slice(0, 20);
      } catch (e) { if (dlg.open) say(task.signal.aborted ? 'Stopped. Your clip is unchanged.' : e.message); }
      finally { if (controller === task) { controller = null; if (dlg.open) setBusy(false); } }
    }, 'primary');
    const stop = button('Stop', () => controller?.abort()); stop.hidden = true;
    const length = el('select', { attrs: { 'aria-label': 'Scene recording length' } }, ...[6, 12, 20].map(n => el('option', { value: String(n), text: `${n} seconds` })));
    const record = button('● Record current scene', async () => {
      if (busy) return;
      controller = new AbortController(); const task = controller; setBusy(true);
      try {
        const file = await recordScene(ctx, Number(length.value), task.signal, say); task.signal.throwIfAborted();
        source = file; if (!sources.includes(file)) sources.unshift(file); paintSources(); invalidate();
        mode.value = 'overview'; at.hidden = true;
        packet = await prepare(file, 'overview', 0, task.signal, say); task.signal.throwIfAborted(); paint();
        dlg.querySelector('.vf-evidence-drawer').open = true;
        say('Scene captured. Frames are ready — choose a direction, then ask Astra.');
      } catch (e) { if (dlg.open) say(task.signal.aborted ? 'Stopped. Any finished take is kept in your project.' : e.message); }
      finally { if (controller === task) { controller = null; if (dlg.open) setBusy(false); } }
    }, 'vf-record primary');
    record.title = ctx.sceneId ? 'Capture the scene canvas at its current size, without this window. No AI usage until you ask Astra.' : 'Open a project scene to record it for feedback';
    const recordingRow = el('div', { class: 'vf-record-row' }, record, length, el('span', { class: 'hint', text: 'Scene only · saved automatically' }));
    const pick = button('Choose video…', async () => {
      const r = await hub.openDialog({ title: 'Video for a feedback round', filters: [{ name: 'Video', extensions: ['mp4', 'webm', 'mov', 'm4v', 'mkv'] }] });
      const p = Array.isArray(r) ? r[0] : r?.filePaths?.[0] || (typeof r === 'string' ? r : null); if (!p) return;
      if (!C.video(p)) throw Error('Choose a saved local video.');
      source = p; if (!sources.includes(p)) sources.unshift(p); paintSources(); invalidate(); say('Clip selected. Pick a direction, or let Astra find the missing piece.');
    });
    const recent = button('Previous review', () => {
      const saved = (history.reviews || []).find(r => r.ctx?.chatId === ctx.chatId && r.ctx?.projectId === ctx.projectId);
      if (!saved) { say('No saved review for this chat yet.'); return; }
      packet = saved.packet; result = C.parse(JSON.stringify(saved.result), packet); source = packet.file; if (!sources.includes(source)) sources.unshift(source); paintSources(); direction.value = saved.direction; mode.value = packet.mode; at.hidden = mode.value !== 'detail'; at.value = String(packet.frames[Math.floor(packet.frames.length / 2)].time); selected = result.issues.length ? [0] : []; paint(); say('Saved review · ' + new Date(saved.at).toLocaleString() + '. The clip may have changed since this review.');
    });
    const setup = el('details', { class: 'vf-setup', open: true }, el('summary', { text: 'Clip & direction' }), recordingRow, el('div', { class: 'vf-source' }, clips, pick), el('div', { class: 'vf-feelings' }, ...C.feelings.map(([, title, text]) => button(title, () => { direction.value = text; }))), direction, el('div', { class: 'vf-scope' }, mode, at, button('↻ Refresh frames', () => { invalidate(); say('The next review will read the file again.'); })));
    const dlg = el('dialog', { class: 'ui-modal vf-dialog', attrs: { 'aria-label': 'Feedback round' } },
      el('header', { class: 'vf-head' }, el('div', {}, el('span', { class: 'vf-eyebrow', text: 'SECOND PAIR OF EYES' }), el('h2', { text: 'Find the next move.' }), el('p', { class: 'hint', text: ctx.name || 'Visual feedback' })), button('✕', () => dlg.close(), 'vf-close')),
      setup, el('div', { class: 'vf-actions' }, run, stop, recent), el('p', { class: 'vf-cost', text: 'One Astra reply per review, using your configured model and reasoning. Overview sends up to 2 image sheets; close look up to 4. No project edits.' }), status,
      el('details', { class: 'vf-evidence-drawer' }, el('summary', { text: 'Frames Astra sees · click to inspect' }), preview), el('div', { class: 'vf-results' }, findings, draftBox));
    dlg.addEventListener('close', () => { controller?.abort(); dialog = null; dlg.remove(); });
    document.body.append(dlg); dialog = dlg; dlg.showModal(); return dlg;
  }
  Commands.register({ name: 'feedback-round', aliases: ['visual-feedback'], area: 'Create', args: '[video path]', desc: 'Astra reviews timestamped frames and drafts a focused improvement prompt', run: args => open(args.trim().replace(/^["']|["']$/g, '') || null) });
  return { open, recordScene, prepare, review, toDraft, context };
})();
