// (round 158, split158) The Lab's live sound (🎧 Live ▾): capturing this computer's sound or a microphone, the input menu, what's playing and its cover.
// Moved out of tools/three.js as it was, loaded on first use (lazy group `labpartlive`, tools/three.js labPart): the names
// it reads inside the Lab (the sketch tab: its state, helpers, the other parts' stand-ins) go through K.
(window.LabParts ||= {}).live = (K) => {
  const __labLiveStart = async (kind) => {
    try {
      K.hubLiveStop();
      const io = K.liveIo();
      const stream = kind === 'system'
        ? await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true })
        : await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, ...(io.device ? { deviceId: { exact: io.device } } : {}) } });
      for (const tr of stream.getVideoTracks()) tr.stop();
      if (!stream.getAudioTracks().length) throw new Error(kind === 'system' ? 'No system sound was shared' : 'No microphone');
      const ctx = new AudioContext();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048; analyser.smoothingTimeConstant = 0.6;
      const gain = ctx.createGain(); gain.gain.value = typeof io.gain === 'number' ? io.gain : 1;
      const src = ctx.createMediaStreamSource(stream);
      src.connect(gain).connect(analyser);
      Object.assign(K.hubLive, { stream, ctx, analyser, gain, queue: [], lvl: 0, agcAt: 0, auto: 1 });
      K.box.send({ type: 'live-remote', on: true, kind });
      // (round 23, labaudio) the analysis in an AudioWorklet, off the main thread: one compact buffer per ~10 ms
      // (features + spectrum + waveform) instead of the timer below (tools/three-audio.js)
      if (typeof ThreeAudio !== 'undefined' && await ThreeAudio.attachLive({ ctx, source: src, input: gain, hubLive: K.hubLive, io: K.liveIo })) return true;
      const f = new Uint8Array(1024); const w = new Float32Array(2048);
      K.hubLive.timer = setInterval(() => {
        analyser.getByteFrequencyData(f); analyser.getFloatTimeDomainData(w);
        // auto gain (the default): quiet or loud playback reaches the sketch and the triggers at about the same
        // level; it follows a louder part fast and a quieter one slowly, and holds through silence
        if (K.liveIo().gain === 'auto') {
          let ss = 0; for (let i = 0; i < w.length; i += 4) ss += w[i] * w[i];
          const rms = Math.sqrt(ss / (w.length / 4)) / (gain.gain.value || 1);
          K.hubLive.lvl += (rms - K.hubLive.lvl) * (rms > K.hubLive.lvl ? 0.2 : 0.01);
          const tA = performance.now();
          if (tA - K.hubLive.agcAt > 250 && K.hubLive.lvl > 0.002) { K.hubLive.agcAt = tA; K.hubLive.auto = Math.max(0.5, Math.min(8, 0.12 / K.hubLive.lvl)); gain.gain.setTargetAtTime(K.hubLive.auto, ctx.currentTime, 0.6); }
        }
        const frame = { type: 'live-frame', freq: f.slice(), wave: w.slice(), rate: ctx.sampleRate };
        const lat = K.liveIo().latency || 0;
        if (!lat) { K.box.send(frame); return; }
        const tNow = performance.now();
        K.hubLive.queue.push([tNow, frame]);
        while (K.hubLive.queue.length && tNow - K.hubLive.queue[0][0] >= lat) K.box.send(K.hubLive.queue.shift()[1]);
        if (K.hubLive.queue.length > 120) K.hubLive.queue.splice(0, K.hubLive.queue.length - 120);
      }, 16);
      return true;
    } catch (err) { toast(`Live sound: ${err.message}`, { type: 'error', timeout: 5000 }); return false; }
  };
  function liveMenu(anchor) {
    const r = anchor.getBoundingClientRect();
    const isWin = !/Mac/.test(navigator.platform);
    const o = K.liveOpts();
    K.popup(r.left, r.bottom + 4, [
      'Make the sketch react to',
      isWin ? ['System sound', 'Whatever plays on this PC: Spotify, YouTube, Suno…', () => K.setLive('system'), K.liveKind === 'system'] : null,
      ['Microphone', 'A mic or line-in', () => K.setLive('mic'), K.liveKind === 'mic'],
      K.liveKind ? ['Off: back to the loaded song', '', () => K.setLive(null)] : null,
      ['⚡ Triggers & sensitivity…', 'What fires kick / bass / snare / hats / hit, and how strongly the sketch reacts', () => K.toggleTriggers(true)],
      'Input',
      ['Microphone / line-in…', K.liveIo().device ? 'A chosen input' : 'The default input · interfaces, loopback', () => (typeof ThreeAudio !== 'undefined' ? ThreeAudio.inputMenu(anchor) : inputMenu(anchor))],
      ['Gain', `${K.liveIo().gain === 'auto' ? `Auto${K.hubLive.gain ? ` (×${Math.round((K.hubLive.auto || 1) * 10) / 10} now)` : ''}` : `×${K.liveIo().gain}`} · how loud the sketch hears it (in the Lab preview)`, () => K.popup(r.left, r.bottom + 4, ['Gain', ['Auto', 'Keeps the level steady, quiet or loud', () => K.setLiveIo({ gain: 'auto' }), K.liveIo().gain === 'auto'], ...[0.5, 1, 1.5, 2, 3, 4].map((g) => [`×${g}`, g === 1 ? 'as it comes' : g < 1 ? 'quieter' : 'louder', () => K.setLiveIo({ gain: g }), K.liveIo().gain === g])])],
      ['Latency offset', `${K.liveIo().latency} ms · the sketch reacts later, to line up with what you hear`, () => K.popup(r.left, r.bottom + 4, ['Latency offset', ...[0, 20, 40, 60, 80, 120, 160, 200, 300].map((ms) => [`${ms} ms`, ms ? `for a speaker / Bluetooth delay` : 'none', () => K.setLiveIo({ latency: ms }), K.liveIo().latency === ms])])],
      K.liveKind ? ['Restart live sound', 'Capture again (after changing devices)', () => K.setLive(K.liveKind)] : null,
      'Now playing',
      [K.np ? 'Hide what\'s playing' : 'Show what Spotify plays', 'Title, cover and ⏮ ⏯ ⏭ here, no Spotify login (also works with other players)', () => (K.np ? K.stopNowPlaying() : K.startNowPlaying())],
      ['Palette follows the cover', 'Each new song sets the sketch palette from its album cover', () => { K.setLiveOpt({ followCover: !o.followCover }); if (!o.followCover && K.np?.cover) coverTo('palette'); }, o.followCover],
    ]);
  }
  async function inputMenu(anchor) {
    const r = anchor.getBoundingClientRect();
    let devs = [];
    try { devs = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'audioinput'); } catch { /* none */ }
    const cur = K.liveIo().device;
    K.popup(r.left, r.bottom + 4, ['Microphone / line-in', ['Default input', 'What the system uses', () => K.setLiveIo({ device: '' }), !cur],
      ...devs.filter((d) => d.deviceId && d.deviceId !== 'default').map((d, k) => [d.label || `Input ${k + 1}`, d.label ? '' : 'names show after the first capture', () => K.setLiveIo({ device: d.deviceId }), d.deviceId === cur])]);
  }
  function onNowPlaying(info) {
    if (!K.np) return;
    K.np = info;
    if (!info.app || !info.title) { K.npBox.replaceChildren(el('span', { class: 'np-wait', text: 'Nothing playing in Spotify (or another player)' })); return; }
    if (info.coverAt && K.liveOpts().followCover) setTimeout(() => coverTo('palette', true), 300); // a new song
    if (info.cover) K.np.coverSrc = /^https?:/.test(info.cover) ? info.cover : `${K.fileUrl(info.cover)}?t=${info.coverAt || Date.now()}`;
    else K.np.coverSrc = K.npBox.querySelector('img')?.src;
    const ctl = (text, title, cmd) => K.btn(text, title, () => window.hub.npControl(cmd), 'ghost small np-ctl');
    K.npBox.replaceChildren(
      K.np.coverSrc ? el('img', { class: 'np-cover', src: K.np.coverSrc, alt: '' }) : null,
      el('span', { class: 'np-text', title: `${info.title} — ${info.artist}${info.album ? ` (${info.album})` : ''} · ${info.app} · click to copy`, on: { click: () => { navigator.clipboard.writeText(`${info.title} — ${info.artist || ''}`); toast('Copied the song name', { timeout: 1000 }); } } }, el('b', { text: info.title }), ` — ${info.artist || ''}`),
      el('span', { class: 'np-time', text: info.duration ? `${K.fmtClock(info.position || 0)} / ${K.fmtClock(info.duration)}` : '' }),
      ctl('⏮', 'Previous', 'prev'), ctl(info.playing ? '⏸' : '▶', 'Play / pause', 'toggle'), ctl('⏭', 'Next', 'next'),
      K.btn('🎨', 'Palette from the cover', () => coverTo('palette'), 'ghost small np-extra'), K.btn('🖼', 'Add the cover to this sketch\'s references', () => coverTo('ref'), 'ghost small np-extra'));
  }
  async function coverFile() {
    const src = K.np?.cover;
    if (!src) throw new Error('No cover yet');
    if (!/^https?:/.test(src)) return src;
    const buf = new Uint8Array(await (await fetch(src)).arrayBuffer());
    let bin = ''; for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
    return window.hub.saveAttachment('cover.jpg', btoa(bin));
  }
  async function coverTo(what, quiet) {
    try {
      const f = await coverFile();
      if (what === 'palette') { const cols = await K.paletteFrom(f); K.setPalette(cols); toast(`Palette from "${K.np.title}": ${cols.join(' ')}`, { timeout: quiet ? 1400 : 2500 }); }
      else { const r = await K.addRef(f, { key: `${K.np.title || 'cover'} cover` }); toast(`Cover added to references as "${r.key}"`, { timeout: 2500 }); }
    } catch (err) { toast(err.message, { type: 'error' }); }
  }
  return { __labLiveStart, liveMenu, onNowPlaying };
};
