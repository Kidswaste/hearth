// 💡 Quick idea's small window (round 71, quickidea71). Type, or hold 🎙 and talk, then click where it goes:
// 🎵 Music (Sound desk › Sessions) · ✦ Quest (Sidequest's saved ideas) · 📁 Project (a recent project's notes) ·
// 💬 Later (the 💡 Ideas inbox). Enter saves to the place used last time; Esc closes (the words stay for next time).
// The microphone opens only while 🎙 is held and closes on release; the memo is a WAV made here (Web Audio, 16-bit
// mono) and written by the main side into Hearth's data folder. Nothing is uploaded or sent to an AI.
(() => {
  const C = window.QuickIdeaCore, api = window.quickIdea;
  const $ = (id) => document.getElementById(id);
  const text = $('text'), rec = $('rec'), recT = $('rec-t'), memoEl = $('memo'), memoT = $('memo-t'), dests = $('dests'), picker = $('picker'), plist = $('plist'), status = $('status'), hint = $('hint');
  let info = { last: { dest: 'later' }, projects: [], dests: C.DESTS }, memo = null, saving = false, player = null;

  // ---------- where it goes ----------
  const lastOk = () => { const l = C.target(info.last); return l.dest !== 'project' || info.projects.some((p) => p.id === l.projectId) ? l : { dest: 'later' }; };
  function paintDests() {
    const last = lastOk();
    dests.replaceChildren(...C.ORDER.map((d) => {
      const b = document.createElement('button'); b.type = 'button'; b.className = `dest${last.dest === d ? ' last' : ''}`; b.dataset.dest = d;
      const t = document.createElement('span'); t.className = 't'; t.textContent = `${C.DESTS[d].icon} ${C.DESTS[d].name}`;
      const s = document.createElement('span'); s.className = 's';
      s.textContent = d === 'project' ? (info.projects.length ? (last.dest === 'project' ? `${last.projectName || info.projects.find((p) => p.id === last.projectId)?.name}’s notes` : 'Pick a recent project') : 'No projects yet') : C.DESTS[d].where;
      b.append(t, s);
      if (last.dest === d) { const k = document.createElement('span'); k.className = 'enter'; k.textContent = '↵ Enter'; b.append(k); }
      if (d === 'project' && !info.projects.length) b.disabled = true;
      b.title = d === 'project' ? 'Add it to a recent project’s notes' : `Save it to ${C.DESTS[d].where}`;
      b.addEventListener('click', () => (d === 'project' ? openPicker() : save({ dest: d })));
      return b;
    }));
    hint.textContent = `Enter saves to ${last.dest === 'project' ? `📁 ${last.projectName || 'your project'}` : `${C.DESTS[last.dest].icon} ${C.DESTS[last.dest].name}`} · Esc closes`;
  }
  function openPicker() {
    plist.replaceChildren(...info.projects.map((p) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = `📁 ${p.name}`; b.dataset.project = p.id; b.addEventListener('click', () => save({ dest: 'project', projectId: p.id, projectName: p.name })); return b; }));
    dests.hidden = true; $('where-label').textContent = 'Which project?'; picker.classList.add('open'); plist.querySelector('button')?.focus();
  }
  function closePicker() { picker.classList.remove('open'); dests.hidden = false; $('where-label').textContent = 'Where it goes'; }
  $('pback').addEventListener('click', () => { closePicker(); dests.querySelector('[data-dest="project"]')?.focus(); });

  // ---------- saving ----------
  function say(t, kind = '') { status.textContent = t; status.className = kind; }
  async function save(to) {
    if (saving || recording) return;
    if (!text.value.trim() && !memo) { say('Type an idea, or hold 🎙 and talk, first.', 'err'); text.focus(); return; }
    saving = true; say('Saving…');
    try {
      const r = await api.save({ text: text.value, to, ...(memo ? { wav: memo.bytes, seconds: memo.seconds } : {}) });
      if (!r?.ok) throw Error(r?.error || 'It couldn’t be saved.');
      const v = r.value; info.last = v.idea.to;
      say(`Saved to ${v.label} · ${v.where} ✓`, 'ok');
      text.value = ''; dropMemo(); closePicker(); paintDests();
      setTimeout(() => { if (status.className === 'ok') { say(''); api.hide(); } }, 900);
    } catch (err) { say(`${String(err?.message || err).replace(/^Error invoking remote method '[^']+': (Error: )?/, '')} Your words are still here.`, 'err'); } finally { saving = false; }
  }
  text.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); save(lastOk()); }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.preventDefault(); if (picker.classList.contains('open')) closePicker(); else api.hide(); }
    else if (e.key === 'Enter' && !e.shiftKey && e.target === document.body) { e.preventDefault(); save(lastOk()); }
  });
  $('inbox').addEventListener('click', () => api.inbox());

  // ---------- 🎙 Hold to record ----------
  let recording = false, stopWanted = false, stream = null, ctx = null, proc = null, chunks = [], startAt = 0, clock = 0, cap = 0;
  async function start() {
    if (recording || saving) return;
    recording = true; stopWanted = false; chunks = []; rec.classList.add('on'); recT.textContent = 'Recording… let go to stop'; say('');
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 } });
      ctx = new AudioContext(); ctx.resume().catch(() => {}); const src = ctx.createMediaStreamSource(stream);
      proc = ctx.createScriptProcessor(4096, 1, 1); const mute = ctx.createGain(); mute.gain.value = 0;
      proc.onaudioprocess = (ev) => { chunks.push(new Float32Array(ev.inputBuffer.getChannelData(0))); };
      src.connect(proc); proc.connect(mute); mute.connect(ctx.destination);
      startAt = performance.now();
      clock = setInterval(() => { const s = (performance.now() - startAt) / 1000; recT.textContent = `Recording ${fmt(s)} · let go to stop`; }, 250);
      cap = setTimeout(stop, C.MAX_MEMO_S * 1000); // 5 minutes at most
      if (stopWanted) stop();
    } catch (err) {
      cleanup(); say(/denied|NotAllowed/i.test(String(err?.name || err)) ? 'The microphone isn’t allowed for Hearth. Allow it in your computer’s privacy settings, then hold 🎙 again.' : /NotFound|device/i.test(String(err?.name || err)) ? 'No microphone found.' : `The microphone couldn’t start (${err?.message || err}).`, 'err');
    }
  }
  function cleanup() {
    clearInterval(clock); clearTimeout(cap);
    try { proc?.disconnect(); } catch { /* gone */ } proc = null;
    try { stream?.getTracks().forEach((t) => t.stop()); } catch { /* gone */ } stream = null; // the microphone closes as soon as you let go
    const c = ctx; ctx = null; recording = false; rec.classList.remove('on'); recT.textContent = memo ? '🎙 Hold to record again' : '🎙 Hold to record';
    return c;
  }
  function stop() {
    if (!recording) return;
    if (!ctx) { stopWanted = true; return; } // let go before the microphone was ready: it stops right after it starts
    const rate = ctx.sampleRate, got = chunks; chunks = [];
    const c = cleanup(); c?.close().catch(() => {});
    const samples = got.reduce((s, x) => s + x.length, 0), seconds = samples / rate;
    if (seconds < 0.4) { say('Hold 🎙 while you talk, then let go.', 'err'); return; }
    dropMemo();
    const bytes = C.encodeWav(got, rate);
    memo = { bytes, seconds: Math.round(seconds * 10) / 10, url: URL.createObjectURL(new Blob([bytes], { type: 'audio/wav' })) };
    memoT.textContent = `🎙 Voice memo · ${fmt(seconds)}`; memoEl.classList.add('has'); recT.textContent = '🎙 Hold to record again';
    say('Voice memo ready. Add words if you like, then click where it goes.', 'ok');
  }
  const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  function dropMemo() { player?.pause(); player = null; if (memo?.url) URL.revokeObjectURL(memo.url); memo = null; memoEl.classList.remove('has'); $('play').textContent = '▶'; }
  rec.addEventListener('pointerdown', (e) => { if (e.button !== 0) return; try { rec.setPointerCapture(e.pointerId); } catch { /* let go anywhere still stops it (pointerup / blur) */ } start(); });
  rec.addEventListener('pointerup', () => stop());
  rec.addEventListener('pointercancel', () => stop());
  rec.addEventListener('lostpointercapture', () => stop());
  rec.addEventListener('keydown', (e) => { if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) { e.preventDefault(); start(); } });
  rec.addEventListener('keyup', (e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); stop(); } });
  rec.addEventListener('click', (e) => e.preventDefault());
  $('play').addEventListener('click', () => {
    if (!memo) return;
    if (player && !player.paused) { player.pause(); $('play').textContent = '▶'; return; }
    player = new Audio(memo.url); player.addEventListener('ended', () => { $('play').textContent = '▶'; }, { once: true }); player.play().catch(() => {}); $('play').textContent = '■';
  });
  $('drop').addEventListener('click', () => { dropMemo(); recT.textContent = '🎙 Hold to record'; say(''); text.focus(); });
  window.addEventListener('blur', () => stop()); // the window loses focus while held: the recording stops (never left open)

  // ---------- each time it's shown ----------
  async function refresh() {
    try { const r = await api.info(); if (r?.ok) info = { ...info, ...r.value }; } catch { /* the defaults */ }
    paintDests(); closePicker(); if (status.className !== 'err') say(''); text.focus(); text.setSelectionRange(text.value.length, text.value.length);
  }
  api.onShown(refresh);
  window.__quickIdea = { state: () => ({ text: text.value, memo: memo ? { seconds: memo.seconds, bytes: memo.bytes.length } : null, recording, last: lastOk(), status: status.textContent, kind: status.className, picker: picker.classList.contains('open'), dests: [...dests.querySelectorAll('.dest')].map((b) => ({ dest: b.dataset.dest, text: b.textContent, last: b.classList.contains('last'), disabled: b.disabled })) }) }; // (checks)
  refresh();
})();
