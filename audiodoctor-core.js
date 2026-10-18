/* (round 64, audiodoctor64) /audio doctor's rows and short report, from what audiodoctormain.js found (no DOM, no IPC:
   dev/audiodoctor64-test.js requires it). One row per check: mark 'ok' (✓) / 'warn' (!) / 'bad' (✗), one plain sentence,
   at most one fix: { do: 'install' | 'rescan' | 'ua' | 'folder' | 'reset' | 'asio-off' | 'asio-on' | 'live' | 'ffmpeg' |
   'sounds', label, path?, buffer? }. The words are for the owner: no jargon beyond the names they see in UA Connect. */
(function(root, factory) { const api = factory(); if (typeof module === 'object' && module.exports) module.exports = api; else root.AudioDoctorCore = api; })(globalThis, () => {
  const MARK = { ok: '✓', warn: '!', bad: '✗' };
  // Universal Audio's drivers, as tools/workbench-vst-live.js names them (kept identical: the doctor's test in Node checks it)
  const UA = /universal audio|apollo|\bvolt\b|\buad?\b/i;
  const home = p => String(p || '').replace(/^\/(Users|home)\/[^/]+/, '~').replace(/^[A-Z]:\\Users\\[^\\]+/i, '~');
  const base = v => String(v || '').split(/[-+]/)[0];
  const older = (a, b) => { const x = base(a).split('.').map(Number), y = base(b).split('.').map(Number); for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) < (y[i] || 0); return false; };
  const supported = v => { const [a, b] = String(v || '').split('.').map(Number); return a === 3 && b >= 10 && b <= 14; };
  const list = (names, n = 3) => names.length > n ? `${names.slice(0, n).join(', ')} +${names.length - n}` : names.join(', ');
  const fmt = n => Number(n).toLocaleString('en-US');
  const apiName = (api, platform) => api === 'Windows WASAPI' ? 'WASAPI' : api === 'Core Audio' || platform === 'darwin' ? 'Core Audio' : String(api || '').replace(/^Windows /, '');

  /** r: the probe report · o: { live, loop, liveRunning } → [{ id, label, mark, text, fix }] */
  function rows(r = {}, o = {}) {
    const out = [], add = (id, label, mark, text, fix = null) => out.push({ id, label, mark, text, fix });
    const p = r.probe, ok = !!p?.ok, win = r.platform === 'win32';
    const install = (label = 'Install runtime') => ({ do: 'install', label });
    // 1. the runtime
    if (!r.runtime?.exists) {
      const s = r.system || {};
      const why = s.supported ? `Python ${s.version} is on this PC, so setting it up takes 1–3 minutes.` : s.found ? `Python ${s.version}${s.bits === 32 ? ' (32-bit)' : ''} is on this PC, but the runtime needs 64-bit Python 3.10–3.14: install Python 3.12 from python.org first.` : 'No Python found: install 64-bit Python 3.12 from python.org first (tick "Add python.exe to PATH").';
      add('runtime', 'Audio runtime', 'bad', `Not installed yet. ${why}`, install());
    } else if (!ok) add('runtime', 'Audio runtime', 'bad', `It's installed but didn't start: ${String(p?.error || 'no answer').slice(0, 160)}`, install('Reinstall runtime'));
    else if (!supported(p.python) || p.bits !== 64) add('runtime', 'Audio runtime', 'warn', `Python ${p.python}${p.bits !== 64 ? ` (${p.bits}-bit)` : ''}: the plugins need 64-bit Python 3.10–3.14.`, install('Reinstall runtime'));
    else add('runtime', 'Audio runtime', 'ok', `Python ${p.python} (64-bit)${r.runtime.override ? ' (a test copy)' : ' in Hearth\'s own folder'}.`);
    // 2. packages
    if (ok) {
      const pk = p.packages || {}, names = [['pedalboard', 'Pedalboard'], ['sounddevice', 'sounddevice'], ['numpy', 'numpy']];
      const missing = names.filter(([k]) => !pk[k]?.version), off = names.filter(([k]) => pk[k]?.version && r.pinned?.[k] && base(pk[k].version) !== r.pinned[k]);
      const have = names.filter(([k]) => pk[k]?.version).map(([k, n]) => `${n} ${pk[k].version}`).join(' · ');
      if (missing.length) add('packages', 'Packages', 'bad', `Missing: ${missing.map(([k, n]) => `${n} (${String(pk[k]?.error || 'not installed').slice(0, 80)})`).join(', ')}.`, install('Reinstall runtime'));
      else if (off.length) add('packages', 'Packages', 'warn', `${have}. Hearth sets up ${off.map(([k, n]) => `${n} ${r.pinned[k]}`).join(', ')}; a reinstall brings them in line.`, install('Update runtime'));
      else add('packages', 'Packages', 'ok', `${have}.`);
    }
    // 3. ASIO (Windows; elsewhere only when a test runtime shows it)
    const apis = ok ? p.hostApis || [] : [], hasAsioApi = apis.includes('ASIO'), asioRow = ok && (win || hasAsioApi || p.asioFallback);
    if (ok && !asioRow) add('asio', 'ASIO', 'ok', `Not needed here: ${list(apis.map(a => apiName(a, r.platform)))} plays directly.`);
    else if (asioRow) {
      if (r.asioSwitch === false) add('asio', 'ASIO', 'warn', 'Turned off (from here, or HEARTH_VST_ASIO=0): Serum 2 / Vital play on WASAPI.', { do: 'asio-on', label: 'Turn ASIO back on' });
      else if (r.asioCrash) add('asio', 'ASIO', 'bad', 'An ASIO driver stopped the audio check while it listed devices; everything below was listed without ASIO. Update or remove that driver, or keep ASIO off.', { do: 'asio-off', label: 'Turn off ASIO' });
      else if (p.asioFallback || !p.asioDll) add('asio', 'ASIO', 'bad', `The ASIO-enabled PortAudio didn't load, so only WASAPI is there${older(p.packages?.sounddevice?.version, '0.5.1') ? ' (sounddevice 0.5.1 or newer has it)' : ''}.`, install('Reinstall runtime'));
      else if (!hasAsioApi) add('asio', 'ASIO', 'warn', 'The ASIO PortAudio loaded but lists no ASIO host: no ASIO driver is installed.', { do: 'rescan', label: 'Re-scan' });
      else add('asio', 'ASIO', 'ok', `ASIO PortAudio loaded${p.portaudio ? ` (${String(p.portaudio).replace(/,? revision.*$/, '')})` : ''}.`);
    }
    // 4. ASIO devices, UA first
    const outs = ok ? (p.devices || []).filter(d => d.outputs >= 2) : [];
    if (ok && hasAsioApi) {
      const asio = outs.filter(d => d.api === 'ASIO').sort((a, b) => UA.test(b.name) - UA.test(a.name)), ua = asio.filter(d => UA.test(d.name));
      const deskOnUA = !r.picked || !r.picked.fromDesk || /^★/.test(r.picked.label || '');
      if (!asio.length) add('asio-devices', 'ASIO devices', 'warn', 'None. Is the UA interface on and connected? UA Connect installs its ASIO driver.', { do: 'rescan', label: 'Re-scan' });
      else if (!ua.length) add('asio-devices', 'ASIO devices', 'warn', `${list(asio.map(d => d.name))}, but no Universal Audio one: power the interface on, check UA Connect, then re-scan.`, { do: 'rescan', label: 'Re-scan' });
      else if (!deskOnUA) add('asio-devices', 'ASIO devices', 'warn', `★ ${ua[0].name}${asio.length > 1 ? ` (also ${list(asio.filter(d => d !== ua[0]).map(d => d.name), 2)})` : ''}, but the Sound desk plays through ${String(r.picked.label).replace(/^★ /, '')}.`, { do: 'ua', label: 'Pick the UA device' });
      else add('asio-devices', 'ASIO devices', 'ok', `★ ${ua[0].name} at ${Math.round((ua[0].rate || 48000) / 100) / 10} kHz${asio.length > 1 ? ` (also ${list(asio.filter(d => d !== ua[0]).map(d => d.name), 2)})` : ''}.`);
    }
    // 5. WASAPI (or the platform's own outputs)
    if (ok) {
      const wasapi = outs.filter(d => d.api === 'Windows WASAPI');
      if (win || wasapi.length) {
        const def = wasapi.find(d => d.default), ua = wasapi.find(d => UA.test(d.name));
        if (!wasapi.length) add('wasapi', 'WASAPI', 'warn', 'No WASAPI outputs listed: Windows sees no sound output right now.', { do: 'rescan', label: 'Re-scan' });
        else add('wasapi', 'WASAPI', 'ok', `${wasapi.length} output${wasapi.length > 1 ? 's' : ''}${def ? ` · default: ${def.name}` : ''}${ua && ua !== def ? ` · UA: ${ua.name}` : ''}.`);
      } else add('wasapi', 'Outputs', outs.length ? 'ok' : 'warn', outs.length ? `${outs.length} output${outs.length > 1 ? 's' : ''}${p.defaultOutput ? ` · default: ${p.defaultOutput}` : ''}.` : 'No sound output listed.', outs.length ? null : { do: 'rescan', label: 'Re-scan' });
    }
    // 6. MIDI inputs
    if (ok) {
      const m = p.midiInputs || [];
      if (m.length) add('midi', 'MIDI in', 'ok', `${list(m)}${p.midiBackend === 'winmm' ? '' : p.midiBackend ? ` (${p.midiBackend})` : ''}.`);
      else if (!p.midiBackend) add('midi', 'MIDI in', 'warn', 'Controllers need python-rtmidi on this computer (not set up by Hearth); the on-screen keys still play.');
      else add('midi', 'MIDI in', 'warn', 'No controller seen. Plug it in, close other apps holding it (a DAW, the Lab\'s MIDI), then re-scan.', { do: 'rescan', label: 'Re-scan' });
    }
    // 7–8. Serum 2 and Vital: found by the desk's scan, then loaded in a host of their own
    const root = (r.pluginRoots || []).find(x => x.exists) || (r.pluginRoots || [])[0];
    for (const x of r.plugins || []) {
      const id = x.name === 'Vital' ? 'vital' : 'serum';
      if (!x.found) add(id, x.name, 'bad', `Not in the VST3 folders the Sound desk scans${root ? ` (${home(root.path)})` : ''}. Install it as VST3 (64-bit) there, or add its folder in the Sound desk.`, root?.exists ? { do: 'folder', label: 'Open plugin folder', path: root.path } : { do: 'rescan', label: 'Re-scan' });
      else if (!x.load && ok) add(id, x.name, 'ok', `Found (${home(x.path)}); this quick check didn't load it (/audio doctor does).`);
      else if (!x.load) add(id, x.name, 'warn', `Found (${home(x.path)}); loading it needs the audio runtime.`, null);
      else if (!x.load.ok) add(id, x.name, 'bad', `Found but it didn't load in the host: ${String(x.load.error || 'it stopped').slice(0, 160)}. Open it once in its own app (licence / first-run), then reset the host.`, { do: 'reset', label: 'Reset host' });
      else if (x.load.silent || !x.load.finite) add(id, x.name, 'warn', `Loads (${fmt(x.load.controls)} controls) but its test note was ${x.load.finite ? 'silent' : 'invalid audio'}: its default patch may make no sound.`, { do: 'reset', label: 'Reset host' });
      else add(id, x.name, 'ok', `Loads in the host: ${x.load.name}${x.load.maker ? ` by ${x.load.maker}` : ''}, ${fmt(x.load.controls)} controls, in ${(x.load.loadMs / 1000).toFixed(1)} s.`);
    }
    // 9. the live test
    if (ok) {
      const L = o.live, where = r.picked?.label ? String(r.picked.label).replace(/^★ /, '') : 'the default output';
      if (o.liveRunning) add('live', 'Live test', 'warn', `Playing a quiet 2-second test on ${where}…`);
      else if (!L) add('live', 'Live test', 'warn', `Not run yet: plays a quiet 2-second chord on ${where} and times the audio.`, { do: 'live', label: 'Run live test' });
      else if (!L.ok) add('live', 'Live test', 'bad', `Couldn't play on ${where}: ${String(L.error || '').slice(0, 140)}. A DAW (or the Sound desk) may hold the ASIO driver: close it, reset the host and try again.`, { do: 'reset', label: 'Reset host' });
      else {
        const api = L.api === 'Windows WASAPI' ? (L.exclusive ? 'WASAPI exclusive' : 'WASAPI') : apiName(L.api, r.platform);
        const facts = `${L.deviceName} (${api}, ${L.sampleRate / 1000} kHz, ${L.buffer}): ${L.underflows} underrun${L.underflows === 1 ? '' : 's'}, ≈${L.outputLatencyMs} ms out, callbacks every ${L.meanGapMs} ms (longest ${L.maxGapMs} ms)${L.source !== 'sine' ? `, ${L.source} DSP ${L.dspPct} %` : ', built-in sine'}`;
        const bad = L.underflows > 0 || L.lateCallbacks > 2 || !L.finished;
        const next = [64, 128, 256, 512, 1024].find(b => b > L.buffer);
        if (bad) add('live', 'Live test', 'warn', `${facts}. Dropouts at this buffer: ${next ? `try ${next}` : 'close other audio apps'}.`, next ? { do: 'live', label: `Test at ${next}`, buffer: next } : { do: 'reset', label: 'Reset host' });
        else add('live', 'Live test', 'ok', `${facts}.`, { do: 'live', label: 'Run again', buffer: L.buffer });
      }
      if (o.loop) {
        const X = o.loop;
        if (!X.ok) add('loopback', 'Loopback', 'warn', String(X.error || 'It didn\'t run.').slice(0, 180), null);
        else if (X.loopback?.heard) add('loopback', 'Loopback', 'ok', `Heard the click back after ${X.loopback.roundTripMs} ms round trip (${X.loopback.samples} samples at ${X.sampleRate / 1000} kHz, ${X.loopback.levelDb} dB).`);
        else add('loopback', 'Loopback', 'warn', `No click heard on input 1 of ${X.deviceName}: patch output 1 into input 1 (a cable, or the UA Console's loopback), turn the input up, then run it again.`);
      }
    }
    // 10. the Sound bank's preset folders
    const pf = r.presetFolders || [], found = pf.filter(f => f.exists);
    if (!pf.length) add('presets', 'Preset folders', 'warn', 'None known on this computer.', { do: 'sounds', label: 'Open Sound bank' });
    else if (!found.length) add('presets', 'Preset folders', 'warn', `Serum 2 / Vital user preset folders not found (looked in ${list(pf.map(f => home(f.path)), 2)}). Save one preset in each plugin, or add your folder in the Sound bank.`, { do: 'sounds', label: 'Open Sound bank' });
    else add('presets', 'Preset folders', 'ok', found.map(f => `${f.instrument || 'yours'}: ${fmt(f.presets)}${f.presets >= 2000 ? '+' : ''} in ${home(f.path)}`).join(' · ') + (found.length < pf.length ? ` (${pf.length - found.length} not there)` : '') + '.', { do: 'folder', label: 'Open preset folder', path: found[0].path });
    // 11. ffmpeg (the song's MP3, sharp recordings)
    if (r.ffmpeg) add('ffmpeg', 'ffmpeg', 'ok', `Found (${home(r.ffmpeg)}): songs export as MP3 too.`);
    else add('ffmpeg', 'ffmpeg', 'bad', 'Not installed: songs export as WAV only (no MP3).', { do: 'ffmpeg', label: 'Install ffmpeg' });
    return out;
  }

  const counts = rs => ({ bad: rs.filter(x => x.mark === 'bad').length, warn: rs.filter(x => x.mark === 'warn').length });
  function headline(rs) { const c = counts(rs); return c.bad ? `${c.bad} problem${c.bad > 1 ? 's' : ''}${c.warn ? ` · ${c.warn} to check` : ''}` : c.warn ? `${c.warn} to check` : 'all good'; }
  /** The chat card: one Markdown list item per row (audiodoctor.js puts each fix button on its item). */
  function cardText(rs, r = {}) {
    return [`**🎚 Audio doctor** · ${headline(rs)}`, ...rs.map(x => `- ${MARK[x.mark]} **${x.label}** · ${x.text.replace(/\n/g, ' ')}`)].join('\n');
  }
  /** The short report the owner pastes to us: plain text, one line per row, no paths beyond the home folder. */
  function reportText(rs, r = {}, when = new Date()) {
    const d = when instanceof Date ? when : new Date(when);
    const pad = n => String(n).padStart(2, '0');
    const stamp = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    return [`Hearth audio doctor · ${stamp} · ${r.platform || '?'} · ${headline(rs)}`, ...rs.map(x => `${MARK[x.mark]} ${x.label}: ${x.text}`)].join('\n');
  }
  return { MARK, UA, rows, cardText, reportText, headline, counts, home };
});
