// Voice (round 23): talk to the chats and hear them, all on this computer.
//   Hold Ctrl+Space (or the key / mouse side button set with /voice key) and speak; let go and the words land in the
//   chat box to edit (or are sent at once with /voice send-on-release on). A short tap listens hands-free until you
//   stop talking (voice activity detection). ＋ › 🎙 Talk does the same with the mouse. A small pill above the chat box
//   shows the live waveform, then the words as they're recognised.
//   Speech-to-text is local: whisper.cpp (whisper-cli) or faster-whisper, run by voicemain.js in a child process; the
//   speech model sits in Hearth's data folder (asked before downloading). Without them, the system's own dictation
//   is pointed at (Fn Fn on a Mac, Win+H on Windows).
//   Voice commands cost no tokens: "freeze", "save", "next scene", "shuffle", "play"… run the Lab's commands, "director,
//   make it pinker" sends to the Three Director, "stop" stops reading (VoiceCore.route, /voice words).
//   Replies to what you said are read aloud (any key stops), with the browser's voice or the system's own (/voice speak).
const Voice = (() => {
  const C = VoiceCore;
  const PLATFORM = /Mac/.test(navigator.platform) ? 'darwin' : /Win/.test(navigator.platform) ? 'win32' : 'linux';
  const get = (k, d) => store.get(`voice.${k}`, d);
  const set = (k, v) => store.set(`voice.${k}`, v);
  const DEFAULT_KEY = 'Ctrl+Space';
  let combo = C.parseCombo(get('key', DEFAULT_KEY)) || C.parseCombo(DEFAULT_KEY);
  const S = { state: 'off', mode: 'hold', agentId: null, t0: 0 }; // state: off | listening | transcribing
  let cap = null; // { stream, ctx, src, tap, analyser, chunks, n, rate, vad }
  let pill = null;
  let job = null; // { id, agentId, send }
  let status = null; let statusAt = 0;
  const spoken = new Set(); // chats whose next reply is read aloud (you spoke to them)
  let lastDraft = null; // { agentId, text, at }: words put in a chat box, sent by hand a moment later
  const log = []; // the last transcripts (/voice history)

  // ---------- where the words go ----------
  // The native chat on screen (a docked director when its tool is open), else Claude.
  function targetAgent() {
    const id = H.activeId;
    if (id && H.isTool?.(id)) { const a = H.agents().find((x) => x.dock === id.slice(5) && x.mode === 'native'); if (a) return a.id; }
    if (id && H.agent(id)?.mode === 'native') return id;
    return H.claudeAgent?.()?.id || null;
  }
  const directorAgent = () => (typeof Tools !== 'undefined' && Tools.dockedAgent?.('three')) || H.agents().find((a) => a.mode === 'native' && a.dock === 'three') || null;
  function agentFor(who) {
    if (who === 'director') return directorAgent()?.id || null;
    if (who === 'astra') return Native.astraAgent?.()?.id || null;
    if (who === 'claude') return H.claudeAgent?.()?.id || null;
    return null;
  }

  async function engine(fresh = false) {
    if (!status || fresh || Date.now() - statusAt > 60000) {
      status = await window.hub.voice.status({ whisperPath: get('whisperPath', '') || undefined, modelPath: get('modelPath', '') || undefined, model: get('model', 'base') });
      statusAt = Date.now();
    }
    return status;
  }

  // ---------- listening ----------
  async function start({ mode = 'toggle', agentId = targetAgent() } = {}) {
    if (S.state !== 'off') { if (S.state === 'listening' && mode === 'toggle') finish(); return false; }
    if (!agentId) { toast('Open a chat first: the words go to its box.'); return false; }
    Native.stopSpeaking?.(); // talking over a reply stops it
    S.state = 'starting'; S.mode = mode; S.agentId = agentId; S.t0 = performance.now();
    try {
      const st = await engine();
      if (!st.engine) { S.state = 'off'; dictation(agentId); return false; }
      if (!st.ready) { S.state = 'off'; offerModel(); return false; }
      if (await window.hub.voice.mic() === 'denied') {
        S.state = 'off';
        toast(PLATFORM === 'darwin' ? 'Hearth can\'t hear you: allow it in System Settings › Privacy & Security › Microphone.' : 'The microphone is blocked for Hearth.', { type: 'error', timeout: 8000 });
        return false;
      }
      await open();
      if (S.state !== 'starting') { close(); return false; } // let go before the mic opened
      S.state = 'listening';
      showPill();
      return true;
    } catch (err) {
      S.state = 'off'; close(); hidePill();
      toast(`No microphone: ${err.message}`, { type: 'error' });
      return false;
    }
  }
  async function open() {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1, ...(get('device', '') ? { deviceId: { exact: get('device', '') } } : {}) } });
    const ctx = new AudioContext();
    if (ctx.state === 'suspended') await ctx.resume().catch(() => {});
    const src = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser(); analyser.fftSize = 1024;
    src.connect(analyser);
    cap = { stream, ctx, src, analyser, chunks: [], n: 0, rate: ctx.sampleRate, vad: C.vad({ silenceMs: Number(get('silence', 1100)) || 1100 }), levels: new Float32Array(48), li: 0, tap: null };
    const onChunk = (f32) => {
      if (!cap || S.state === 'off') return;
      cap.chunks.push(f32); cap.n += f32.length;
      const ev = cap.vad.feed(C.rms(f32), (f32.length / cap.rate) * 1000);
      if (ev === 'start') pill?.classList.add('heard');
      else if (ev === 'end' && S.mode === 'toggle') finish();
      else if (ev === 'idle' && S.mode === 'toggle') { cancel(); toast('🎙 Didn\'t hear anything.'); }
      else if (ev === 'max') finish();
    };
    try {
      await ctx.audioWorklet.addModule('voice-worklet.js');
      const tap = new AudioWorkletNode(ctx, 'voice-tap');
      tap.port.onmessage = (e) => onChunk(e.data);
      src.connect(tap); cap.tap = tap;
    } catch {
      // no worklet (an old engine): the script processor does the same on the main thread, in 4096-sample blocks
      const sp = ctx.createScriptProcessor(4096, 1, 1);
      sp.onaudioprocess = (e) => onChunk(new Float32Array(e.inputBuffer.getChannelData(0)));
      src.connect(sp); sp.connect(ctx.destination); cap.tap = sp;
    }
  }
  function close() {
    const c = cap; cap = null;
    if (!c) return null;
    try { c.tap?.disconnect(); c.src.disconnect(); } catch { /* gone */ }
    for (const t of c.stream.getTracks()) t.stop();
    c.ctx.close().catch(() => {});
    return c;
  }
  // Stop listening and turn what was heard into text.
  async function finish({ send = null } = {}) {
    if (S.state === 'starting') { S.state = 'off'; hidePill(); return null; }
    if (S.state !== 'listening') return null;
    const c = close();
    const agentId = S.agentId;
    const vs = c.vad.state();
    if (!vs.heard) { S.state = 'off'; hidePill(); toast('🎙 Didn\'t catch anything.'); return null; }
    S.state = 'transcribing';
    setPill('Transcribing…', 'busy');
    const all = new Float32Array(c.n); let o = 0;
    for (const ch of c.chunks) { all.set(ch, o); o += ch.length; }
    const cut = C.trim(all, c.rate, vs.first, vs.lastLoud);
    const pcm = C.resample(cut, c.rate, 16000);
    const id = `v${Date.now().toString(36)}`;
    job = { id, agentId, send: send ?? (S.mode === 'hold' && get('sendOnRelease', false)) };
    const lang = get('lang', 'auto');
    const r = await window.hub.voice.transcribe({ id, wav: C.wav(pcm), lang, model: get('model', 'base'), whisperPath: get('whisperPath', '') || undefined, modelPath: get('modelPath', '') || undefined, seconds: pcm.length / 16000, prompt: get('prompt', '') || undefined })
      .catch((err) => ({ ok: false, error: err.message }));
    const mine = job?.id === id ? job : null;
    job = null; S.state = 'off'; hidePill();
    if (!mine) return null; // cancelled meanwhile
    if (!r.ok) { if (!r.cancelled) toast(r.error === 'no-model' ? 'No speech model yet: /voice install' : `Speech-to-text failed: ${r.error}`, { type: 'error', action: { label: 'Set up', fn: () => install() } }); return null; }
    const text = String(r.text || '').trim();
    if (!text) { toast('🎙 Didn\'t catch any words.'); return null; }
    log.unshift({ text, at: Date.now(), ms: r.ms }); log.length = Math.min(log.length, 20);
    return deliver(text, mine.agentId, { send: mine.send });
  }
  function cancel() {
    if (job) { window.hub.voice.cancel(job.id); job = null; }
    close(); S.state = 'off'; hidePill();
  }
  const toggle = (agentId) => (S.state === 'off' ? start({ mode: 'toggle', agentId }) : S.state === 'listening' ? finish() : (cancel(), false));

  // ---------- what the words do ----------
  // A voice command runs (no tokens), "director, …" goes to that chat, anything else lands in the box (or is sent).
  async function deliver(text, agentId = targetAgent(), { send = false } = {}) {
    const r = get('commands', true) !== false ? C.route(text, { own: get('words', {}), has: (n) => Boolean(Commands.get(n)) }) : null;
    if (r?.kind === 'cmd') {
      // /look is shared: outside the Lab it switches Hearth's colour look, not the scene's
      if (/^\/look\b/.test(r.line) && Commands.place?.().id !== 'three' && !get('words', {})[C.clean(text)]) { toast('🎙 "Next scene" switches the Lab\'s saved looks: open the Lab first.'); return { kind: 'cmd', line: r.line, skipped: true }; }
      toast(`🎙 ${r.line}`, { timeout: 2200 });
      await Commands.tryRun(r.line, agentId, null, { source: 'chat', say: (t) => { if (t) toast(String(t).slice(0, 200), { timeout: 3500 }); }, note: (t) => { if (t) toast(String(t).slice(0, 200), { timeout: 3500 }); } });
      return { kind: 'cmd', line: r.line };
    }
    if (r?.kind === 'do') {
      if (r.what === 'hush') Native.stopSpeaking?.();
      else if (r.what === 'send') Native.view(agentId)?.form.requestSubmit();
      else if (r.what === 'clear') Native.setDraft(agentId, '');
      else if (r.what === 'new') Native.newChat(agentId);
      return { kind: 'do', what: r.what };
    }
    if (r?.kind === 'agent') {
      const to = agentFor(r.who);
      if (to) return { kind: 'agent', who: r.who, agentId: to, ...(await sendTo(to, r.text)) };
      text = r.text; // nobody by that name: an ordinary message
    }
    if (send) return { kind: 'sent', agentId, ...(await sendTo(agentId, text)) };
    const v = Native.view(agentId);
    const before = v?.input.value || '';
    Native.insertDraft(agentId, `${before && !/\s$/.test(before) ? ' ' : ''}${text}`);
    lastDraft = { agentId, text, at: Date.now() };
    return { kind: 'draft', agentId, text };
  }
  async function sendTo(agentId, text) {
    const chatId = H.activeChat[agentId];
    if (chatId && Native.isBusy(chatId)) { // still answering: the words wait in its box
      Native.insertDraft(agentId, text);
      toast(`${H.agent(agentId)?.name || 'It'} is still answering: your words are in its box.`);
      return { drafted: true };
    }
    await Native.sendText(agentId, text);
    const id = H.activeChat[agentId];
    if (id && get('replyAloud', true) !== false) spoken.add(id);
    return { sent: true, chatId: id };
  }
  // a message you sent by hand right after dictating it: its reply is read aloud too
  Native.hooks.send.push((agentId, chat, text) => {
    if (lastDraft && lastDraft.agentId === agentId && Date.now() - lastDraft.at < 5 * 60000 && String(text).includes(lastDraft.text.slice(0, 40))) {
      if (get('replyAloud', true) !== false) spoken.add(chat.id);
      lastDraft = null;
    }
  });
  Native.hooks.event.push((event, chat) => {
    if (event.type !== 'done' || !spoken.has(chat.id)) return;
    spoken.delete(chat.id);
    if (store.get('chat.autoRead', false)) return; // read already (/read auto on)
    if (H.activeChat[chat.agentId] !== chat.id) return;
    const i = chat.messages.length - 1;
    if (chat.messages[i]?.role === 'assistant') Native.speakMessage(chat.agentId, i);
  });

  // ---------- reading aloud: the text without code; the system's own voice when chosen; any key stops ----------
  let sayRun = 0;
  Native.hooks.speak.push({
    text: (raw) => C.speakable(raw),
    say(plain, done) {
      if (get('tts', 'browser') !== 'system') return false;
      const run = ++sayRun;
      window.hub.voice.say({ text: plain, voice: get('ttsVoice', '') || undefined, rate: Number(store.get('chat.readRate', 1)) || 1 }).then((r) => {
        if (!r.ok && !r.stopped && run === sayRun) toast(`The system voice failed: ${r.error || 'unknown'} (/voice speak browser)`, { type: 'error' });
      }).finally(() => { if (run === sayRun) done(); });
      return true;
    },
    stop() { sayRun += 1; window.hub.voice.hush(); },
  });
  const MODS = new Set(['Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'Fn']);
  addEventListener('keydown', (e) => {
    if (MODS.has(e.key) || e.repeat || e.altKey) return; // Alt+R (read / stop) keeps its own toggle
    if (get('anyKeyStops', true) !== false && Native.isSpeaking?.()) Native.stopSpeaking();
  }, true);

  // ---------- push to talk ----------
  let holding = false; let holdT0 = 0;
  function pressed(e) {
    if (holding || !C.matches(combo, e)) return;
    e.preventDefault(); e.stopPropagation();
    holding = true; holdT0 = performance.now();
    if (S.state === 'listening') { finish(); holding = false; return; } // listening hands-free: the key ends it
    start({ mode: 'hold' });
  }
  function released(e) {
    if (!holding) return;
    if (e.type === 'keyup' ? !C.releases(combo, e) : e.type !== 'blur' && e.button !== combo.button) return;
    if (e.type !== 'blur') e.preventDefault?.();
    holding = false;
    // a short tap: listen hands-free until you stop talking
    if (e.type !== 'blur' && performance.now() - holdT0 < 280 && !cap?.vad.state().heard) { S.mode = 'toggle'; setPill('Listening… (stops when you do)'); return; }
    finish();
  }
  addEventListener('keydown', (e) => { if (!e.repeat) pressed(e); else if (holding && C.matches(combo, e)) e.preventDefault(); }, true);
  addEventListener('keyup', released, true);
  addEventListener('mousedown', (e) => { if (combo.button != null) pressed(e); }, true);
  addEventListener('mouseup', (e) => { if (combo.button != null) { if (e.button === combo.button) e.preventDefault(); released(e); } }, true);
  addEventListener('auxclick', (e) => { if (combo.button != null && e.button === combo.button) e.preventDefault(); }, true);
  addEventListener('blur', () => released({ type: 'blur' }));
  function setKey(text) {
    const c = C.parseCombo(text);
    if (!c) return null;
    combo = c; set('key', c.text);
    return c.text;
  }

  // ---------- the pill: live waveform, then the words ----------
  function showPill() {
    hidePill();
    const canvas = el('canvas', { class: 'voice-wave', width: 192, height: 40 });
    const label = el('span', { class: 'voice-label', text: S.mode === 'hold' ? 'Listening… let go to stop' : 'Listening… (stops when you do)' });
    pill = el('div', { class: 'voice-pill', title: 'Click: stop and use the words · Right-click: voice settings' }, el('span', { class: 'voice-dot' }), canvas, label,
      el('button', { type: 'button', class: 'voice-x', text: '×', title: 'Cancel (Esc)', on: { click: (e) => { e.stopPropagation(); cancel(); } } }));
    pill.addEventListener('click', () => { if (S.state === 'listening') finish(); });
    pill.addEventListener('contextmenu', (e) => { e.preventDefault(); showMenu(e.clientX, e.clientY, settingsItems()); });
    const form = Native.view(S.agentId)?.form;
    const r = form?.isConnected ? form.getBoundingClientRect() : null;
    if (r && r.width) { pill.style.left = `${Math.round(r.left + 12)}px`; pill.style.bottom = `${Math.round(innerHeight - r.top + 8)}px`; } else pill.classList.add('voice-center');
    document.body.append(pill);
    draw(canvas);
  }
  function setPill(text, cls) {
    if (!pill) return;
    const l = pill.querySelector('.voice-label');
    if (l.textContent !== text) l.textContent = text;
    if (cls) pill.classList.add(cls);
  }
  function hidePill() { pill?.remove(); pill = null; }
  // the waveform: the loudness of the last ~1.5 s as bars, drawn ~30×/s on its own canvas (no DOM writes), only while listening
  function draw(canvas) {
    const g = canvas.getContext('2d');
    const buf = new Float32Array(1024);
    const color = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#ff7a3d';
    let last = 0;
    const frame = (t) => {
      if (!cap || !pill || !canvas.isConnected) return;
      requestAnimationFrame(frame);
      if (t - last < 33) return;
      last = t;
      cap.analyser.getFloatTimeDomainData(buf);
      cap.levels[cap.li++ % cap.levels.length] = Math.min(1, C.rms(buf) * 6);
      g.clearRect(0, 0, canvas.width, canvas.height);
      g.fillStyle = color;
      const n = cap.levels.length; const w = canvas.width / n;
      for (let i = 0; i < n; i++) {
        const v = cap.levels[(cap.li + i) % n];
        const h = Math.max(2, v * canvas.height);
        g.fillRect(i * w + 1, (canvas.height - h) / 2, Math.max(1, w - 2), h);
      }
    };
    requestAnimationFrame(frame);
  }
  window.hub.voice.onPartial(({ id, text }) => { if (job?.id === id && text) setPill(text.length > 70 ? `…${text.slice(-68)}` : text, 'partial'); });
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && S.state !== 'off') { cancel(); e.stopPropagation(); } }, true);

  // ---------- setting up: local speech-to-text, the model, the system's dictation ----------
  function dictation(agentId) {
    Native.focus?.(agentId);
    toast(`Local speech-to-text isn't installed. ${C.dictationHint(PLATFORM)}`, { timeout: 9000, action: { label: 'Set up', fn: () => install() } });
  }
  async function offerModel(name = get('model', 'base')) {
    const m = C.MODELS[name] || C.MODELS.base;
    const yes = await Modal.confirm('Download the speech model?', `Speech-to-text needs a model: “${name}” (${m.mb} MB, ${m.note}). It is saved in Hearth's data folder and runs on this computer only; nothing you say leaves it.`, { ok: `Download ${m.mb} MB` });
    if (!yes) return false;
    const t = toast(`Downloading the ${name} speech model…`, { timeout: 0 });
    const off = (p) => { const s = t?.querySelector('span'); if (s && p.total) s.textContent = `Downloading the ${name} speech model… ${Math.round((p.got / p.total) * 100)}%`; };
    progressFn = off;
    const r = await window.hub.voice.download({ model: name });
    progressFn = null; t?.remove();
    if (!r.ok) { toast(`The model download failed: ${r.error}`, { type: 'error' }); return false; }
    await engine(true);
    toast(`🎙 Ready: hold ${keyText()} and speak.`);
    return true;
  }
  let progressFn = null;
  window.hub.voice.onProgress((p) => progressFn?.(p));
  async function install() {
    const st = await engine(true);
    if (st.ready) return `🎙 Speech-to-text is ready (${st.engine}${st.model ? `, ${st.model.split(/[\\/]/).pop()}` : ''}). Hold ${keyText()} and speak.`;
    if (st.engine === 'whisper.cpp') { await offerModel(); return null; }
    const steps = C.installSteps(PLATFORM);
    await Modal.alert('Talk to your chats', [
      'Hearth turns speech into text on this computer with whisper.cpp (or faster-whisper). It isn\'t installed yet:', '',
      ...steps.map((s, i) => `${i + 1}. ${s}`), '',
      `Until then: ${C.dictationHint(PLATFORM)}`,
    ].join('\n'));
    return null;
  }
  const keyText = () => (PLATFORM === 'darwin' ? combo.text.replace(/\bAlt\+/g, '⌥').replace(/\bShift\+/g, '⇧') : combo.text);

  // ---------- menus ----------
  function settingsItems() {
    const tick = (k, d) => get(k, d) !== false && get(k, d) !== 'browser';
    return [
      { label: 'Send when I let go', checked: tick('sendOnRelease', false), action: () => set('sendOnRelease', !get('sendOnRelease', false)) },
      { label: 'Read replies to what I said', checked: tick('replyAloud', true), action: () => set('replyAloud', get('replyAloud', true) === false) },
      { label: 'Voice commands (no tokens)', checked: tick('commands', true), action: () => set('commands', get('commands', true) === false) },
      { label: 'System voice', checked: get('tts', 'browser') === 'system', action: () => set('tts', get('tts', 'browser') === 'system' ? 'browser' : 'system') },
      '-',
      { label: 'Set up speech-to-text…', action: () => install().then((m) => m && toast(m)) },
    ];
  }
  function attachItems(agentId) {
    return [{ label: S.state === 'listening' ? '⏹ Stop listening' : '🎙 Talk', hint: `hold ${keyText()}`, action: () => toggle(agentId) }];
  }

  if (typeof Keys !== 'undefined') Keys.add({ area: 'Chat', keys: `Hold ${DEFAULT_KEY}`, what: 'Push to talk: speak, let go, the words land in the chat box (a short tap listens until you stop)', run: () => toggle(targetAgent()) });

  return {
    start, finish, cancel, toggle, deliver, install, offerModel, setKey, attachItems, settingsItems, engine, targetAgent,
    state: () => ({ state: S.state, mode: S.mode, agentId: S.agentId, key: combo.text, heard: cap?.vad.state().heard || false, spoken: [...spoken] }),
    history: () => log.slice(), PLATFORM, keyText,
  };
})();
