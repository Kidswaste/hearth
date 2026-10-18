// (round 64, audiodoctor64) 🎚 /audio doctor: one card, like /doctor's engine card, that checks the owner's music setup
// on this PC and fixes what it can, so rounds 61–63 (live Serum 2 / Vital on the UA interface, presets, park loops,
// the Sound bank, songs) can be verified without reading docs. Only when asked: the lazy group 'audiodoctor' loads on
// /audio, Ctrl/⌘+K "Check my music setup" or /doctor's "Music setup" button; nothing runs at startup.
// Rows (audiodoctor-core.js): runtime · packages · ASIO · ASIO devices (UA first) · WASAPI · MIDI in · Serum 2 · Vital
// (each loaded in a host of its own) · a 2-second live test (Vital or a quiet sine on the desk's device: callback
// timing, underruns, output latency; loopback when an output is patched into an input) · preset folders · ffmpeg.
// Each row: ✓ / ! / ✗, one sentence, one fix button. "Copy report" puts a short text version on the clipboard.
const AudioDoctor = (() => {
  const C = AudioDoctorCore;
  let report = null, live = null, loop = null, liveRunning = false, busy = null, lastCtx = null;
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const rowsNow = () => C.rows(report || {}, { live, loop, liveRunning });

  // What the Sound desk uses: its extra plugin folders and remembered output (Codex's workbench project, read only)
  async function desk() {
    let p = null; try { p = await hub.kvGet('creative-workbenches', null); } catch { /* no project yet */ }
    const v = p?.vst || {};
    let saved = v.live?.saved || null, buffer = v.live?.buffer || null;
    // the desk open right now knows its output better than its last save
    const A = window.WorkbenchVST?.api, o = A?.current?.() && A.output?.();
    if (o?.device) { saved = { name: o.device.name, api: o.device.api, exclusive: /x$/.test(String(o.value)) }; buffer = o.buffer || buffer; }
    return { roots: Array.isArray(v.roots) ? v.roots : [], saved, buffer };
  }

  async function check({ quick = false } = {}) {
    if (busy) return busy;
    busy = (async () => {
      const d = await desk();
      const r = await hub.audioDoctor.probe({ roots: d.roots, saved: d.saved, loadPlugins: !quick });
      if (!r?.ok) throw Error(r?.error || 'The audio check did not answer.');
      // a quick re-check (after a fix) keeps what the last full one learned about loading the same plugin files
      if (quick && report?.plugins) r.plugins = r.plugins.map(x => x.load || !x.path ? x : { ...x, load: report.plugins.find(y => y.path === x.path)?.load });
      report = { ...r, desk: d }; return report;
    })();
    try { return await busy; } finally { busy = null; }
  }

  // ---------- the card ----------
  function show(ctx = lastCtx) {
    lastCtx = ctx;
    const rs = rowsNow(), text = C.cardText(rs, report);
    if (!ctx?.note) return text;
    const acts = [
      { label: 'Copy report', title: 'A short text version to paste in a chat or a message', run: () => copyReport() },
      { label: 'Loopback test', title: 'Patch output 1 into input 1 of your interface first: a click is played and timed back', run: () => liveTest({ loopback: true }) },
      { label: 'Check again', run: () => run({ ctx }) },
    ];
    const box = ctx.note(text, { id: 'audio-doctor', actions: acts });
    decorate(box, rs);
    return undefined;
  }
  // one fix button on each row's list item (the card's Markdown list is in the rows' order)
  function decorate(box, rs) {
    const items = box?.querySelectorAll?.(':scope > .body li') || [];
    rs.forEach((row, i) => {
      const li = items[i]; if (!li) return;
      li.classList.add('ad-row', `ad-${row.mark}`); li.dataset.adRow = row.id;
      if (!row.fix) return;
      li.append(' ', el('button', { type: 'button', class: 'ghost small ad-fix', text: row.fix.label, dataset: { fix: row.fix.do }, on: { click: async (e) => {
        const b = e.currentTarget; b.disabled = true;
        try { await fix(row.fix); } catch (err) { toast(err.message, { type: 'error', timeout: 9000 }); } finally { if (b.isConnected) b.disabled = false; }
      } } }));
    });
  }

  async function copyReport() {
    const text = C.reportText(rowsNow(), report || {});
    await copyText(text, 'Audio report copied');
    return text;
  }

  // ---------- fixes ----------
  async function fix(f) {
    switch (f.do) {
      case 'install': return installRuntime();
      case 'rescan': return run({ ctx: lastCtx });
      case 'ua': { const label = await useUA(); toast(`Sound desk output: ${label}`, { timeout: 6000 }); return run({ ctx: lastCtx, quick: true, keepLive: true }); }
      case 'folder': { const r = await hub.audioDoctor.open(f.path); if (!r?.ok) throw Error(r?.error || 'Could not open the folder.'); return r; }
      case 'reset': await resetHost(); toast('Serum 2 / Vital hosts restarted: open the instrument again in the Sound desk.', { timeout: 7000 }); return run({ ctx: lastCtx, keepLive: false });
      case 'asio-off': case 'asio-on': return setAsio(f.do === 'asio-on');
      case 'live': return liveTest({ buffer: f.buffer });
      case 'ffmpeg': return window.EngineHealth?.installFfmpeg ? EngineHealth.installFfmpeg() : Commands.exec('/ffmpeg install', H.activeId);
      case 'sounds': return Commands.exec('/sounds', H.activeId);
      default: return null;
    }
  }
  async function installRuntime() {
    window.Progress?.set('audio-runtime', { title: '🎚 Setting up live audio', icon: '🎚', kind: 'audio-runtime', label: 'Pedalboard, numpy, sounddevice (1–3 min)', hungMs: 6 * 60000 });
    toast('Setting up the audio runtime in Hearth\'s own folder (1–3 minutes)…', { timeout: 6000 });
    const r = await hub.vst.setup().catch(err => ({ ok: false, error: err.message }));
    window.Progress?.done('audio-runtime', { ok: !!r?.ok });
    if (!r?.ok) throw Error(r?.error || 'The setup did not finish.');
    return run({ ctx: lastCtx });
  }
  async function resetHost() { await silenceDesk(); await hub.vst.stop(); }
  async function setAsio(on) {
    const r = await hub.audioDoctor.asio(on); if (!r?.ok) throw Error(r?.error || 'Could not change ASIO.');
    H.config.settings = { ...H.settings(), vstAsio: on }; saveConfig();
    toast(on ? 'ASIO is back on: open the instrument again in the Sound desk.' : 'ASIO is off: Serum 2 / Vital play on WASAPI until you turn it back on here.', { timeout: 7000 });
    await wait(300); // the setting reaches the main process
    return run({ ctx: lastCtx, keepLive: false });
  }
  // The Sound desk's own picker, set to the UA interface (ASIO › WASAPI exclusive) and remembered like the owner's choice.
  async function useUA() {
    await Lazy.load('creative');
    const A = WorkbenchVST.api;
    if (!A.current()) {
      const here = () => document.querySelector('.wb-sound-desk')?.checkVisibility?.({ visibilityProperty: true });
      if (!here() || !A.instruments().length) { activate('tool:creative'); CreativePlayground.openFeature('vst'); }
      for (let i = 0; i < 300 && !(here() && A.instruments().length); i++) await wait(50);
      const names = A.instruments(); if (!names.length) throw Error('Set up live audio and add Serum 2 or Vital in the Sound desk first.');
      await A.open(names.includes('Vital') ? 'Vital' : names[0], { live: false });
    }
    const d = await A.devices(), o = WorkbenchVSTLive.options(d);
    if (!o.hasUA) throw Error('The Universal Audio interface isn\'t listed: power it on, check UA Connect, then check again.');
    await A.setOutput({ value: o.preferred });
    return (o.options.find(([v]) => v === o.preferred) || [, o.preferred])[1];
  }
  // the live host holds the device (ASIO drivers take one user): pause it for the test
  async function silenceDesk() {
    const A = window.WorkbenchVST?.api;
    if (A?.current?.()?.live) { try { await A.stop(); return true; } catch { /* already stopped */ } }
    return false;
  }

  // ---------- the 2-second live test ----------
  async function liveTest({ buffer, loopback = false } = {}) {
    if (!report?.probe?.ok) await check({ quick: true });
    if (!report?.probe?.ok) { show(); return null; }
    const p = report.picked || {}, vital = report.plugins?.find(x => x.name === 'Vital' && x.load?.ok);
    const asio = /· ASIO$/.test(p.label || '');
    const size = buffer || report.desk?.buffer || (asio ? 128 : 256);
    const paused = await silenceDesk();
    if (!loopback) { liveRunning = true; show(); }
    let r;
    try { r = await hub.audioDoctor.live({ roots: report.desk?.roots, device: p.device ?? null, exclusive: !!p.exclusive, buffer: size, plugin: vital && !loopback ? 'Vital' : null, loopback }); }
    catch (err) { r = { ok: false, error: err.message }; }
    finally { liveRunning = false; }
    if (paused) r.deskPaused = true;
    if (loopback) loop = r; else live = r;
    show();
    return r;
  }

  async function run({ ctx, quick = false, keepLive = true } = {}) {
    lastCtx = ctx || lastCtx;
    if (!keepLive) { live = null; loop = null; }
    if (!window.hub?.audioDoctor) return 'The audio doctor needs Hearth\'s main process (restart Hearth after updating).';
    if (lastCtx?.note && !report) lastCtx.note('**🎚 Audio doctor** · checking the runtime, devices, MIDI, Serum 2 and Vital…', { id: 'audio-doctor' });
    await check({ quick });
    let text = show(lastCtx);
    if (!quick && !live && report.probe?.ok) { await liveTest(); text = show(lastCtx); }
    return text;
  }

  // ---------- chat command, Ctrl/⌘+K ----------
  const SUBS = [['doctor', 'check everything (a quiet 2-second test tone included)'], ['quick', 'devices and versions only: no plugin loads, no sound'], ['live', 'the 2-second live test again'], ['loopback', 'output 1 patched into input 1: time the round trip'], ['copy', 'copy the last report']];
  async function command(args = '', ctx) {
    const a = String(args).trim().toLowerCase().replace(/^doctor\s*/, '') || 'doctor';
    if (a === 'copy') { if (!report) await check({ quick: true }); return `Copied:\n\n${await copyReport()}`; }
    if (a === 'live' || a === 'loopback') { lastCtx = ctx || lastCtx; const r = await liveTest({ loopback: a === 'loopback' }); return lastCtx?.note || !r ? undefined : C.cardText(rowsNow(), report); }
    return run({ ctx, quick: a === 'quick', keepLive: false });
  }
  if (typeof Commands !== 'undefined' && !Commands.get('audio')) {
    Commands.register({ name: 'audio', aliases: ['audio-doctor'], area: 'Create', args: '[doctor | quick | live | loopback | copy]', desc: 'Audio doctor: check the music setup on this PC (runtime, ASIO, UA interface, MIDI, Serum 2 / Vital, a 2-second live test) with one-click fixes',
      keywords: 'asio universal audio ua apollo volt vst serum vital midi latency underrun sound check music setup', examples: ['/audio doctor', '/audio quick', '/audio loopback', '/audio copy'],
      complete: (x) => SUBS.filter(([v]) => v.startsWith(String(x || '').trim().toLowerCase())).map(([value, hint]) => ({ value, hint })),
      run: (args, ctx) => command(args, ctx) });
  }
  if (typeof AppUI !== 'undefined' && AppUI.addAction) AppUI.addAction('Check my music setup (audio doctor)', () => Commands.exec('/audio doctor', H.activeId));

  return { run, check, liveTest, fix, copyReport, command, show, rows: rowsNow, report: () => report, _test: { set: (r, l, x) => { report = r; live = l ?? null; loop = x ?? null; }, useUA, desk } };
})();
