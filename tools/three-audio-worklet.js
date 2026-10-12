// The live input's analysis, on the audio thread (round 23, labaudio). Loaded after tools/three-audio-core.js
// (`audioWorklet.addModule` both: the worklet scope shares globalThis), by ThreeAudio.attachLive in the hub page.
// Every 512 samples (~10 ms) it posts ONE ArrayBuffer (transferred, no copy, no JSON):
//   Float32 [0] mean square of the last hop · [1] 1 when features are in · [2 … 2 + F) the features (AudioFeat.NAMES)
//   then 1024 bytes: the analyser-style spectrum (audio.spectrum) · then 2048 bytes: the waveform (128 = silence)
// Features are computed only while a sketch or a slider reads one (port message { need }); the spectrum and the
// waveform always (the sketches' audio.level / bass / spectrum read them).
const HEAD = 2;
registerProcessor('hearth-audio', class extends AudioWorkletProcessor {
  constructor(opts) {
    super();
    const AF = globalThis.AudioFeat;
    this.F = AF.F; this.alive = true; this.ms = 0; this.n = 0;
    this.need = Boolean(opts?.processorOptions?.need);
    this.mono = new Float32Array(128);
    this.s = AF.stream({ rate: sampleRate, hop: 512, bytes: true, track: true, features: () => this.need, onFrame: (feat, spec, wave) => this.send(feat, spec, wave) });
    this.port.onmessage = (e) => {
      const d = e.data || {};
      if (d.need != null) this.need = Boolean(d.need);
      if (d.stop) this.alive = false;
    };
  }
  send(feat, spec, wave) {
    const F = this.F; const buf = new ArrayBuffer((HEAD + F) * 4 + 1024 + 2048);
    const f = new Float32Array(buf, 0, HEAD + F);
    f[0] = this.n ? this.ms / this.n : 0; f[1] = feat ? 1 : 0;
    if (feat) f.set(feat, HEAD);
    new Uint8Array(buf, (HEAD + F) * 4, 1024).set(spec);
    new Uint8Array(buf, (HEAD + F) * 4 + 1024, 2048).set(wave);
    this.ms = 0; this.n = 0;
    this.port.postMessage(buf, [buf]);
  }
  process(inputs) {
    const ch = inputs[0];
    if (ch?.length) {
      let x = ch[0];
      if (ch.length > 1) { const m = this.mono; for (let i = 0; i < x.length; i += 1) { let s = 0; for (let c = 0; c < ch.length; c += 1) s += ch[c][i]; m[i] = s / ch.length; } x = m.subarray(0, ch[0].length); }
      for (let i = 0; i < x.length; i += 1) this.ms += x[i] * x[i];
      this.n += x.length;
      this.s.push(x);
    }
    return this.alive;
  }
});
