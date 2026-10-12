// /osc, /midi-out, /obs, /link: the Lab with the owner's other tools from a chat (round 25, interop; interop*.js,
// interopmain.js). Also the Ctrl/⌘+K actions, and what was on comes back on at the next start.
(() => {
  const AREA = 'Three.js Lab';
  const words = (s) => String(s || '').trim().split(/\s+/).filter(Boolean);
  const onOff = (w, cur) => (/^(on|yes|true|1|start)$/i.test(w || '') ? true : /^(off|no|false|0|stop)$/i.test(w || '') ? false : !cur);
  const fail = (m) => { throw new Error(m); };

  // ---------- /osc ----------
  const OSC_SUBS = ['on', 'off', 'status', 'preset', 'port', 'lan', 'local', 'to', 'untarget', 'send', 'learn', 'learn-pad', 'maps', 'forget', 'addresses', 'ping'];
  async function osc(args) {
    const w = words(args); const sub = (w[0] || 'status').toLowerCase(); const rest = w.slice(1).join(' ');
    if (sub === 'status') {
      const s = await Interop.status(); const c = s.cfg;
      return [
        `📡 OSC ${s.on ? `on: listening on ${c.scope === 'lan' ? `your network (${(s.lan || []).join(', ') || 'no network'})` : 'this computer'} port ${s.port}` : `off (port ${c.port}, ${c.scope === 'lan' ? 'network' : 'this computer'})`} · preset ${s.preset}`,
        `Sends to: ${c.targets.map((t) => `${t.host}:${t.port}`).join(', ') || 'nowhere'} · out: ${Object.entries(c.out).filter(([, v]) => v).map(([k]) => k).join(', ') || 'nothing'}`,
        s.on ? `Heard ${s.rx} message${s.rx === 1 ? '' : 's'}${s.dropped ? ` (${s.dropped} refused)` : ''}${s.last ? ` · last ${s.last}` : ''} · ${s.maps.length} learned` : '/osc on · /osc preset touchosc · /osc addresses',
      ].join('\n');
    }
    if (sub === 'on') { if (w[1] && /^\d+$/.test(w[1])) Interop.setCfg({ port: Number(w[1]) }); const s = await Interop.on(); return `📡 OSC on: port ${s.port} (${s.cfg.scope === 'lan' ? `your network: ${(s.lan || []).join(', ')}` : '127.0.0.1'}) · sending to ${s.cfg.targets.map((t) => `${t.host}:${t.port}`).join(', ') || 'nowhere (/osc to 9001)'}`; }
    if (sub === 'off') { await Interop.off(); return '📡 OSC off'; }
    if (sub === 'preset') {
      if (!w[1]) return Object.entries(Interop.PRESETS).map(([k, p]) => `${k}: ${p.name} (in ${p.port}, out ${p.target}) · ${p.note}`).join('\n');
      const p = await Interop.usePreset(w[1].toLowerCase()); return `📡 ${p.name}: Hearth listens on ${p.port}, sends to ${p.target}\n${p.note}`;
    }
    if (sub === 'port') { const n = Number(w[1]); if (!(n >= 1024 && n <= 65535)) fail('/osc port 9000 (1024–65535)'); Interop.setCfg({ port: n }); if (Interop.isOn) await Interop.on(); return `📡 OSC port ${n}`; }
    if (sub === 'lan' || sub === 'local') { Interop.setCfg({ scope: sub }); if (Interop.isOn) await Interop.on(); return sub === 'lan' ? '📡 Listening on your network too (private addresses only: phones, another computer)' : '📡 Listening on this computer only'; }
    if (sub === 'to') { const t = Interop.addTarget(rest); return `📡 Sending to ${t.host}:${t.port}`; }
    if (sub === 'untarget') { const l = Interop.removeTarget(rest); return `📡 Sending to ${l.map((t) => `${t.host}:${t.port}`).join(', ') || 'nowhere'}`; }
    if (sub === 'send') {
      const k = (w[1] || '').toLowerCase(); const keyOf = { beat: 'beat', bar: 'beat', bpm: 'bpm', tempo: 'bpm', hits: 'hits', kick: 'hits', features: 'features', audio: 'features', sliders: 'sliders', slider: 'sliders', scene: 'scene' }[k];
      if (!keyOf) fail('/osc send beat|bpm|hits|features|sliders|scene on|off');
      const out = Interop.setOut(keyOf, onOff(w[2], Interop.cfg().out[keyOf])); return `📡 Out: ${Object.entries(out).filter(([, v]) => v).map(([x]) => x).join(', ') || 'nothing'}`;
    }
    if (sub === 'learn') { const r = await Interop.startLearn({ slider: rest || null }); return r ? `📡 ${r.addr} → ${r.label}` : 'Nothing came in (learn stopped)'; }
    if (sub === 'learn-pad') { const a = (ThreeStage?.ACTIONS || []).find(([k]) => k.toLowerCase() === (w[1] || '').toLowerCase())?.[0]; if (!a) fail(`/osc learn-pad ${(ThreeStage?.ACTIONS || []).map(([k]) => k).join('|')}`); const r = await Interop.startLearn({ a }); return r ? `📡 ${r.addr} → ${a}` : 'Nothing came in (learn stopped)'; }
    if (sub === 'maps') { const m = Interop.maps(); return m.length ? m.map((x, i) => `${i + 1}. ${x.addr} → ${x.t === 'act' ? x.a : `${x.label}${x.range && x.range.join() !== '0,1' ? ` (${x.range.join('–')})` : ''}`}`).join('\n') + '\n/osc forget <n>' : 'Nothing learned: touch a slider, /osc learn, move the control in your app'; }
    if (sub === 'forget') { const x = Interop.forget(rest); return `📡 Forgot ${x.addr}`; }
    if (sub === 'addresses') return Interop.addresses().join('\n');
    if (sub === 'ping') { const P = Interop.cfg().prefix; Interop.send([[`${P}/ping`, [{ i: 1 }]], [`${P}/bpm`, [Math.round(Interop.clock.bpm * 100) / 100]]]); return `📡 Sent ${P}/ping and the tempo to ${Interop.cfg().targets.map((t) => `${t.host}:${t.port}`).join(', ') || 'nowhere'}`; }
    fail(`/osc ${OSC_SUBS.join(' | ')}`);
    return '';
  }

  // ---------- /midi-out ----------
  const MIDI_SUBS = ['status', 'device', 'clock', 'note', 'preset', 'clear', 'cc', 'uncc', 'pc', 'channel', 'panic', 'off'];
  async function midiOut(args) {
    const M = InteropMidi; const w = words(args); const sub = (w[0] || 'status').toLowerCase(); const rest = w.slice(1).join(' ');
    if (sub === 'status') {
      await M.open().catch(() => {}); const s = M.status();
      return [
        `🎹 MIDI out: ${s.out ? (s.out === '*' ? 'every output' : s.out) : 'no device'}${s.out && !s.active.length ? ' (not plugged in)' : ''} · outputs: ${s.outputs.join(', ') || 'none'}`,
        `Clock ${s.clock ? `on (${s.bpm.toFixed(1)} BPM)` : 'off'} · ${s.rules.length} note cue${s.rules.length === 1 ? '' : 's'} · ${Object.keys(s.cc).length} slider CC · program change ${s.pc ? 'on' : 'off'} · channel ${s.ch}`,
        ...s.rules.map((r) => `  ${M.describe(r)}`),
      ].join('\n');
    }
    if (sub === 'device') { if (!rest) { await M.open(); return `Outputs: ${M.names().join(', ') || 'none'}`; } return `🎹 MIDI out → ${await M.use(rest)}`; }
    if (sub === 'clock') { const on = await M.setClock(onOff(w[1], M.status().clock)); return on ? `🎹 Clock out on: ${Interop.clock.bpm.toFixed(1)} BPM, follows the stage` : '🎹 Clock out off (Stop sent)'; }
    if (sub === 'note') { const [, on, note, ch, vel, len] = w; const r = M.addRule((on || '').toLowerCase(), note, { ch, vel, len }); return `🎹 ${M.describe(r)}`; }
    if (sub === 'preset') { if (!w[1]) return Object.entries(M.PRESETS).map(([k, p]) => `${k}: ${p.name}`).join('\n'); const p = M.usePreset(w[1].toLowerCase()); return `🎹 ${p.name}`; }
    if (sub === 'clear') { M.clearRules(w[1]); return '🎹 Note cues cleared'; }
    if (sub === 'cc') { const [, s, cc, ch] = w; const r = await M.mapCC(s, cc, ch); return `🎹 ${r.label} → CC ${r.cc} (a wiggle was sent so your other app can learn it)`; }
    if (sub === 'uncc') return `🎹 ${M.unmapCC(rest)}: no CC`;
    if (sub === 'pc') { const d = onOff(w[1], M.status().pc); store.set('interop.midi', { ...store.get('interop.midi', {}), pc: d }); M.wire(); return `🎹 Program change on a scene change: ${d ? 'on' : 'off'}`; }
    if (sub === 'channel') { const n = Number(w[1]); if (!(n >= 1 && n <= 16)) fail('/midi-out channel 1–16'); store.set('interop.midi', { ...store.get('interop.midi', {}), ch: n }); M.wire(); return `🎹 Channel ${n}`; }
    if (sub === 'panic') { M.panic(); return '🎹 All notes off'; }
    if (sub === 'off') { M.clockStop(); store.set('interop.midi', { ...store.get('interop.midi', {}), out: '', clock: false }); M.wire(); return '🎹 MIDI out off'; }
    fail(`/midi-out ${MIDI_SUBS.join(' | ')}`);
    return '';
  }

  // ---------- /obs ----------
  const OBS_SUBS = ['status', 'output', 'key', 'fit', 'fps', 'size', 'connect', 'disconnect', 'password', 'forget-password', 'scene', 'scenes', 'follow', 'link', 'record', 'stream', 'add'];
  async function obsCmd(args) {
    const O = InteropObs; const w = words(args); const sub = (w[0] || 'status').toLowerCase(); const rest = w.slice(1).join(' ');
    if (sub === 'status') {
      const s = await O.status(); const o = s.obs || {};
      return [
        `🎥 Browser Source output: ${s.page?.on ? `on at ${s.page.url} · ${s.viewers} viewer${s.viewers === 1 ? '' : 's'} · ${s.stats.frames} frames sent` : 'off (/obs output on)'} · ${s.cfg.key} background, ${s.cfg.fps} fps, ${s.cfg.max} px`,
        `OBS: ${o.state === 'on' ? `connected (${o.version}) · scene ${o.scene} · ${o.rec?.active ? '● recording' : 'not recording'} · ${o.stream?.active ? '🔴 live' : 'not streaming'}` : o.state === 'auth' ? o.why : `not connected${o.why ? ` (${o.why})` : ''} · /obs connect`}`,
        o.state === 'on' ? `Follows the Lab's scenes: ${s.cfg.follow ? 'yes' : 'no'}${Object.keys(s.cfg.map).length ? ` · linked: ${Object.entries(s.cfg.map).map(([a, b]) => `${a} → ${b}`).join(', ')}` : ''}` : `Password: ${o.hasPassword ? 'saved' : 'none (/obs password)'}`,
      ].join('\n');
    }
    if (sub === 'output') { const p = await O.output(onOff(w[1], O.page?.on)); return p.on ? `🎥 OBS output on: ${p.url}\nIn OBS: Sources → ＋ → Browser → that URL, or /obs add once connected` : '🎥 OBS output off'; }
    if (sub === 'key') return `🎥 Background: ${await O.setKey((w[1] || '').toLowerCase())}`;
    if (sub === 'fit') return `🎥 Fit: ${await O.setFit((w[1] || '').toLowerCase())}`;
    if (sub === 'fps') return `🎥 ${O.setFps(w[1])} frames a second`;
    if (sub === 'size') return `🎥 Up to ${O.setMax(w[1])} px`;
    if (sub === 'password') {
      // the password is never typed in a chat: the masked field only (what was typed after /obs password is ignored)
      const r = await O.password();
      return r ? (r.hasPassword ? `🎥 Password ${r.saved ? 'saved, encrypted' : 'kept for this session'}${w[1] ? ' (what you typed after /obs password was ignored and not stored: use the field)' : ''}` : '🎥 Password forgotten') : 'Cancelled';
    }
    if (sub === 'forget-password') { await O.forgetPassword(); return '🎥 OBS password forgotten'; }
    if (sub === 'connect') { const s = await O.connect(rest || undefined); return s.state === 'on' ? `🎥 Connected: ${s.version} · scene ${s.scene} · scenes: ${s.scenes.join(', ')}` : s.state === 'auth' ? `🎥 ${s.why}` : `🎥 ${s.why || 'Connecting…'} (retrying by itself)`; }
    if (sub === 'disconnect') { await O.disconnect(); return '🎥 Disconnected from OBS'; }
    if (sub === 'scenes') { const s = (await O.status()).obs; return s?.scenes?.length ? s.scenes.map((x) => `${x === s.scene ? '● ' : '  '}${x}`).join('\n') : 'OBS is not connected: /obs connect'; }
    if (sub === 'scene') return `🎥 OBS scene: ${await O.scene(rest)}`;
    if (sub === 'follow') { const d = onOff(w[1], store.get('interop.obs', {}).follow !== false); store.set('interop.obs', { ...store.get('interop.obs', {}), follow: d }); if (d) await O.followNow(); return `🎥 OBS ${d ? 'follows' : 'no longer follows'} the Lab's scenes`; }
    if (sub === 'link') {
      const name = ThreeLab.stageHooks?.sketchName(); if (!name) fail('Open a Lab scene first');
      if (!rest || /^(none|off)$/i.test(rest)) { O.link(name, null); return `🎥 "${name}" unlinked`; }
      const s = (await O.status()).obs; const hit = (s?.scenes || []).find((x) => x.toLowerCase() === rest.toLowerCase()) || (s?.scenes || []).find((x) => x.toLowerCase().includes(rest.toLowerCase()));
      if (!hit) fail(`OBS scenes: ${(s?.scenes || []).join(', ') || 'none (connect first)'}`);
      O.link(name, hit); return `🎥 "${name}" → OBS "${hit}"`;
    }
    if (sub === 'record') { const t = await O.record((w[1] || 'toggle').toLowerCase()); return `🎥 ${t.replace('Record', ' recording').replace('Toggle', 'Toggled').replace('Start', 'Started').replace('Stop', 'Stopped').replace('Pause', 'Paused').replace('Resume', 'Resumed')}`; }
    if (sub === 'stream') { const r = await O.stream((w[1] || 'on').toLowerCase()); return r === 'started' ? '🔴 OBS is streaming' : r === 'cancelled' ? 'Not streaming (cancelled)' : `🎥 Streaming ${r}`; }
    if (sub === 'add') { const r = await O.addSource(); return r.exists ? '🎥 "Hearth Lab" is already in OBS' : `🎥 Added "Hearth Lab" (${r.w}×${r.h}) to the OBS scene ${r.scene}`; }
    fail(`/obs ${OBS_SUBS.join(' | ')}`);
    return '';
  }

  // ---------- /link ----------
  async function linkCmd(args) {
    const w = words(args); const sub = (w[0] || 'status').toLowerCase();
    if (sub === 'on') { const s = await Interop.link(true); return `🔗 Following Ableton Link's tempo (listen only)${s.bpm ? `: ${s.bpm.toFixed(1)} BPM, ${s.peers} peer${s.peers === 1 ? '' : 's'}` : ': no Link app heard yet (turn Link on in Live / Traktor / Resolume…)'}`; }
    if (sub === 'off') { await Interop.link(false); return '🔗 Link off'; }
    const s = await Interop.linkStatus();
    return s.on ? `🔗 Link: ${s.peers} peer${s.peers === 1 ? '' : 's'}${s.bpm ? ` · ${s.bpm.toFixed(1)} BPM${s.playing != null ? (s.playing ? ' · playing' : ' · stopped') : ''}` : ''} · tempo only (phase: tap, MIDI clock or /osc preset abletonosc)` : '🔗 Link off · /link on follows the tempo of Live, Traktor, Resolume… on your network';
  }

  const reg = (def) => { if (!Commands.get(def.name)) Commands.register(def); };
  const sugg = (list, w0, prefix = '') => list.filter((x) => x.startsWith(w0 || '')).map((x) => `${prefix}${x} `);
  reg({ name: 'osc', area: AREA, args: '[on|off|preset <app>|to <host:port>|send <what> on|off|learn [slider]|learn-pad <action>|maps|addresses|lan|local|port <n>]', desc: 'OSC in and out for the Lab: TouchDesigner, Ableton, Resolume, TouchOSC or phone apps move sliders, fire GO / shuffle / freeze, run scenes and the set list; Hearth sends beat, bar, tempo, kicks, audio features and slider values', run: osc, keywords: 'touchdesigner resolume ableton touchosc open sound control vj', examples: ['/osc on', '/osc preset touchosc', '/osc send features on'],
    complete: (a) => { const w = String(a || '').split(/\s+/); if (w.length <= 1) return sugg(OSC_SUBS, w[0]); if (w[0] === 'preset') return Object.keys(Interop.PRESETS).map((k) => `preset ${k}`); if (w[0] === 'send') return w.length <= 2 ? ['beat', 'bpm', 'hits', 'features', 'sliders', 'scene'].map((k) => `send ${k} `) : ['on', 'off'].map((x) => `send ${w[1]} ${x}`); if (w[0] === 'learn') return (window.ThreeLab?.stageHooks?.ctl()?.controls() || []).slice(0, 20).map((x) => `learn ${x.label || x.key}`); if (w[0] === 'learn-pad') return (window.ThreeStage?.ACTIONS || []).map(([k]) => `learn-pad ${k}`); if (w[0] === 'to') return ['127.0.0.1:9001', '127.0.0.1:7001', '127.0.0.1:7000'].map((x) => `to ${x}`); return []; } });
  reg({ name: 'midi-out', area: AREA, aliases: ['midiout'], args: '[device <name>|clock on|off|note <beat|bar|kick|snare|hat|scene> <note> [ch] [vel] [ms]|preset lights|drums|beat|cc <slider> [cc] [ch]|pc on|off|channel <n>|panic|off]', desc: 'MIDI out from the Lab: clock on the stage\'s tempo, notes on beats / bars / kicks / scene changes, slider moves as CC, program change per scene, to lights, synths and drum machines', run: midiOut, keywords: 'clock sync lights dmx synth drum machine', examples: ['/midi-out device IAC', '/midi-out clock on', '/midi-out preset lights'],
    complete: (a) => { const w = String(a || '').split(/\s+/); if (w.length <= 1) return sugg(MIDI_SUBS, w[0]); if (w[0] === 'device') return InteropMidi.names().map((n) => `device ${n}`); if (w[0] === 'clock' || w[0] === 'pc') return ['on', 'off'].map((x) => `${w[0]} ${x}`); if (w[0] === 'note' && w.length <= 2) return InteropMidi.EVENTS.map(([k]) => `note ${k} `); if (w[0] === 'preset') return Object.keys(InteropMidi.PRESETS).map((k) => `preset ${k}`); if (w[0] === 'cc') return (window.ThreeLab?.stageHooks?.ctl()?.controls() || []).slice(0, 20).map((x) => `cc ${x.label || x.key}`); return []; } });
  reg({ name: 'obs', area: AREA, args: '[output on|off|connect [ws://host:4455]|password|scene <name>|follow on|off|link <obs scene>|record on|off|stream on|off|add|key alpha|luma|none|fps <n>|size <px>]', desc: 'OBS Studio: the Lab as a transparent Browser Source (a page on this computer), and OBS from Hearth: scenes follow the Lab and the set list, record, stream (asks first), status', run: obsCmd, keywords: 'stream record browser source obs-websocket twitch youtube', examples: ['/obs output on', '/obs connect', '/obs record on'],
    complete: (a) => { const w = String(a || '').split(/\s+/); if (w.length <= 1) return sugg(OBS_SUBS, w[0]); const st = InteropObs.obs; if (w[0] === 'scene' || w[0] === 'link') return (st?.scenes || []).map((s) => `${w[0]} ${s}`); if (['output', 'follow'].includes(w[0])) return ['on', 'off'].map((x) => `${w[0]} ${x}`); if (w[0] === 'record') return ['on', 'off', 'toggle', 'pause', 'resume'].map((x) => `record ${x}`); if (w[0] === 'stream') return ['on', 'off'].map((x) => `stream ${x}`); if (w[0] === 'key') return ['alpha', 'luma', 'none'].map((x) => `key ${x}`); if (w[0] === 'fit') return ['contain', 'cover', 'stretch'].map((x) => `fit ${x}`); if (w[0] === 'fps') return ['30', '60', '25'].map((x) => `fps ${x}`); if (w[0] === 'size') return ['1280', '1920', '3840'].map((x) => `size ${x}`); return []; } });
  reg({ name: 'link', area: AREA, args: '[on|off]', desc: 'Ableton Link: the Lab follows the tempo of Live, Traktor, Resolume… on your network (listen only)', run: linkCmd, keywords: 'ableton tempo sync bpm', complete: (a) => sugg(['on', 'off'], a) });

  for (const [label, fn] of [
    ['Lab: OSC on / off', async () => { if (Interop.isOn) await Interop.off(); else await Interop.on(); toast(`📡 OSC ${Interop.isOn ? `on :${Interop.cfg().port}` : 'off'}`, { timeout: 1500 }); }],
    ['Lab: OBS output (Browser Source) on / off', async () => { const p = await InteropObs.output(!InteropObs.page?.on); toast(p.on ? `🎥 OBS output: ${p.url}` : '🎥 OBS output off', { timeout: 2500 }); }],
    ['Lab: Connect to OBS', async () => { const s = await InteropObs.connect(); if (s.state === 'auth') await InteropObs.password().then((r) => r?.hasPassword && InteropObs.connect()); }],
    ['Lab: MIDI clock out on / off', async () => { const on = await InteropMidi.setClock(!InteropMidi.status().clock); toast(`🎹 Clock out ${on ? 'on' : 'off'}`, { timeout: 1400 }); }],
    ['Lab: Connect menu (OSC, MIDI out, OBS, Link)', async () => { await Interop.ready(); showMenu(innerWidth / 2 - 140, 120, Interop.menuItems()); }],
  ]) AppUI.addAction(label, async () => { try { await fn(); } catch (err) { toast(err.message, { type: 'error' }); } });

  // what was on comes back on (after the Lab has settled)
  setTimeout(() => { Interop.resume(); InteropMidi.resume(); InteropObs.resume(); }, 800);
})();
