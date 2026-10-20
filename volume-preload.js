// Session preload: playback gain only. No file, microphone or Node access is exposed to pages.
function installVolume(initial) {
  if (window.__hearthVolume) return;
  let level = initial;
  const media = new WeakMap(), applied = new WeakMap(), routed = new WeakSet(), tracked = new Set(), gains = new WeakMap(), gainRefs = new Set();
  const proto = HTMLMediaElement.prototype, volume = Object.getOwnPropertyDescriptor(proto, 'volume');
  const track = m => {
    if (!media.has(m)) { media.set(m, volume.get.call(m)); tracked.add(new WeakRef(m)); }
    return media.get(m);
  };
  const apply = m => { const n = track(m) * (routed.has(m) ? 1 : level); applied.set(m, n); volume.set.call(m, n); };
  Object.defineProperty(proto, 'volume', { ...volume,
    get() { return media.has(this) ? media.get(this) : volume.get.call(this); },
    set(v) {
      // Let Chromium validate the original value before retaining it.
      volume.set.call(this, v);
      track(this); media.set(this, volume.get.call(this)); apply(this);
    }
  });
  const play = proto.play;
  proto.play = function (...args) { apply(this); return play.apply(this, args); };
  document.addEventListener('play', e => { if (e.target instanceof HTMLMediaElement) apply(e.target); }, true);
  document.addEventListener('volumechange', e => {
    const m = e.target;
    if (!(m instanceof HTMLMediaElement) || !media.has(m)) return;
    const n = volume.get.call(m);
    if (n === applied.get(m)) return;
    media.set(m, Math.min(1, n / (routed.has(m) ? 1 : level || 1))); apply(m);
  }, true);
  const connect = AudioNode.prototype.connect, disconnect = AudioNode.prototype.disconnect;
  function output(node, destination) {
    const ctx = node.context;
    if (!(ctx instanceof AudioContext) || destination !== ctx.destination) return destination;
    let g = gains.get(ctx);
    if (!g) {
      g = ctx.createGain(); g.gain.value = level; connect.call(g, destination);
      gains.set(ctx, g); gainRefs.add(new WeakRef(g));
    }
    return g;
  }
  AudioNode.prototype.connect = function (...args) {
    const destination = args[0]; args[0] = output(this, destination);
    const result = connect.apply(this, args);
    return result === args[0] ? destination : result;
  };
  AudioNode.prototype.disconnect = function (...args) {
    if (args[0] === this.context.destination && gains.has(this.context)) args[0] = gains.get(this.context);
    return disconnect.apply(this, args);
  };
  const source = AudioContext.prototype.createMediaElementSource;
  AudioContext.prototype.createMediaElementSource = function (m) {
    const node = source.call(this, m);
    track(m); routed.add(m); apply(m); return node;
  };
  const speak = speechSynthesis.speak.bind(speechSynthesis);
  speechSynthesis.speak = u => { u.volume *= level; return speak(u); };
  window.__hearthVolume = {
    get: () => level,
    set(value) {
      if (!Number.isFinite(value) || value < 0 || value > 1) return;
      level = value;
      for (const ref of tracked) { const m = ref.deref(); if (m) apply(m); else tracked.delete(ref); }
      for (const ref of gainRefs) {
        const g = ref.deref();
        if (!g || g.context.state === 'closed') gainRefs.delete(ref);
        else g.gain.setTargetAtTime(level, g.context.currentTime, .015);
      }
      if (!level) speechSynthesis.cancel();
      for (let i = 0; i < frames.length; i++) frames[i].postMessage({ type: 'hearth-volume-state', value: level }, '*');
    }
  };
  addEventListener('message', e => {
    if (e.data?.type === 'hearth-volume-read') e.source?.postMessage({ type: 'hearth-volume-state', value: level, install: installVolume.toString() }, '*');
    else if (parent !== window && e.source === parent && e.data?.type === 'hearth-volume-state') window.__hearthVolume.set(e.data.value);
  });
  if (parent !== window) parent.postMessage({ type: 'hearth-volume-read' }, '*');
}
if (typeof require === 'function') {
  const { contextBridge, ipcRenderer } = require('electron');
  // This reads an in-memory scalar, not a disk or network operation.
  contextBridge.executeInMainWorld({ func: installVolume, args: [ipcRenderer.sendSync('volume:initial')] });
  ipcRenderer.on('volume:changed', (_e, value) => {
    contextBridge.executeInMainWorld({ func: value => window.__hearthVolume?.set(value), args: [value] });
  });
}
