// (round 64, audiodoctor64) 🎚 Check my audio setup: one card, like /doctor's engine card, that checks the owner's music
// setup on this PC and fixes what it can, so rounds 61–63 (live Serum 2 / Vital on the UA interface, presets, park loops,
// the Sound bank, songs) can be verified without reading docs. Found where the owner already looks: the Sound desk's
// "🎚 Check my audio setup" button (top row) and "🎚 Check setup" next to its Audio output picker
// (tools/audiodoctor-desk.js), and it opens by itself, as a friendly card in the desk, when live audio fails to start.
// Secondary: /audio doctor in a chat (the same card as a chat note), Ctrl/⌘+K, /doctor's "Music setup" button.
// Only when asked (or after such a failure): the lazy group 'audiodoctor' loads then; nothing runs at startup.
// Rows (audiodoctor-core.js): runtime · packages · ASIO · ASIO devices (UA first) · WASAPI · MIDI in · Serum 2 · Vital
// (each loaded in a host of its own) · a 2-second live test (Vital or a quiet sine on the desk's device: callback
// timing, underruns, output latency; loopback when an output is patched into an input) · preset folders · ffmpeg.
// Each row: ✓ / ! / ✗, one sentence, one fix button. "Copy report" puts a short text version on the clipboard.
const AudioDoctor = (() => {
  const C = AudioDoctorCore;
  let report = null, live = null, loop = null, liveRunning = false, busy = null, lastCtx = null;
  let where = 'chat', panel = null, reason = null, hostGone = false; // where the card shows: a chat note, or the panel in the Sound desk
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
    if (where === 'desk') { renderPanel(); return undefined; }
    lastCtx = ctx;
    const rs = rowsNow(), text = C.cardText(rs, report);
    if (!ctx?.note) return text;
    const acts = [
      { label: 'Copy report', title: 'A short text version to paste in a chat or a message', run: () => copyReport() },
      { label: 'Loopback test', title: 'Patch output 1 into input 1 of your interface first: a click is played and timed back', run: () => liveTest({ loopback: true }) },
      { label: 'Check again', run: () => run({}) },
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
      if (row.fix) li.append(' ', fixButton(row));
    });
  }
  const fixButton = row => el('button', { type: 'button', class: 'ghost small ad-fix', text: row.fix.label, dataset: { fix: row.fix.do }, on: { click: async (e) => {
    const b = e.currentTarget; b.disabled = true;
    try { await fix(row.fix); } catch (err) { toast(err.message, { type: 'error', timeout: 9000 }); } finally { if (b.isConnected) b.disabled = false; }
  } } });
  const action = (label, title, fn) => el('button', { type: 'button', class: 'ghost small', text: label, title, on: { click: async (e) => {
    const b = e.currentTarget; b.disabled = true;
    try { await fn(); } catch (err) { toast(err.message, { type: 'error', timeout: 9000 }); } finally { if (b.isConnected) b.disabled = false; }
  } } });

  // ---------- the card in the Sound desk (under its top row; it follows the desk when the desk is drawn again) ----------
  function renderPanel() {
    const d = document.querySelector('.wb-sound-desk'); if (!d) return null;
    if (!panel) { panel = el('section', { class: 'ad-card' }); panel.setAttribute('role', 'region'); panel.setAttribute('aria-label', 'Audio setup check'); }
    if (!panel.isConnected || panel.parentElement !== d) { const anchor = d.querySelector(':scope > .wb-row') || d.querySelector(':scope > .wb-sound-header'); if (anchor) anchor.after(panel); else d.prepend(panel); }
    const rs = report ? rowsNow() : [];
    const close = el('button', { type: 'button', class: 'ghost small ad-close', text: '×', title: 'Close the audio setup check', on: { click: () => { panel.remove(); where = 'chat'; } } });
    close.setAttribute('aria-label', 'Close the audio setup check');
    panel.replaceChildren(
      el('div', { class: 'ad-head' }, el('strong', { text: '🎚 Audio setup check' }), el('span', { class: 'ad-headline', text: busy && !report ? 'checking…' : report ? C.headline(rs) : '' }), close),
      reason ? el('p', { class: 'ad-reason', text: reason }) : null,
      report ? el('ul', { class: 'ad-rows' }, rs.map(row => el('li', { class: `ad-row ad-${row.mark}`, dataset: { adRow: row.id } },
        el('span', { class: 'ad-mark', text: C.MARK[row.mark] }), el('b', { text: row.label }), ` · ${row.text} `, row.fix ? fixButton(row) : null)))
        : el('p', { class: 'ad-reason', text: 'Checking the audio runtime, ASIO, your devices and MIDI, Serum 2 and Vital…' }),
      report ? el('div', { class: 'ad-acts' },
        action('Copy report', 'A short text version to paste in a chat or a message', copyReport),
        action('Loopback test', 'Patch output 1 into input 1 of your interface first: a click is played and timed back', () => liveTest({ loopback: true })),
        action('Check again', 'Everything again, with a quiet 2-second test tone', () => run({ keepLive: false })),
        hostGone ? action('Reset host', 'Restarts the Serum 2 / Vital audio processes and loads the instrument again', () => fix({ do: 'reset' }).then(() => { hostGone = false; reason = null; renderPanel(); })) : null) : null);
    return panel;
  }
  /** The Sound desk's buttons and its failed live start open the card there. reason: why it opened by itself. */
  async function inDesk({ reason: why = null, quick = false } = {}) {
    where = 'desk';
    const raw = why instanceof Error ? why : why ? Error(String(why)) : null;
    // the host's own words when its process went away → plain words + "Reset host" under the card
    hostGone = !!raw && /Load the selected instrument|host (stopped|disconnected|exited)|Reload the instrument|Host exited/i.test(raw.message);
    reason = raw ? `Live audio didn't start: ${hostGone ? 'the instrument\'s audio process had stopped (Reset host loads it again).' : typeof calmError === 'function' ? calmError(raw) : 'the audio device refused.'} Here is what this PC looks like, with a fix on each row that needs one.` : null;
    if (!busy) { report = null; live = null; loop = null; }
    renderPanel()?.scrollIntoView?.({ block: 'nearest' });
    if (busy) return busy;
    await run({ quick, keepLive: false });
    return panel;
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
      case 'rescan': return run({});
      case 'ua': { const label = await useUA(); toast(`Sound desk output: ${label}`, { timeout: 6000 }); return run({ quick: true, keepLive: true }); }
      case 'folder': { const r = await hub.audioDoctor.open(f.path); if (!r?.ok) throw Error(r?.error || 'Could not open the folder.'); return r; }
      case 'reset': { const back = await resetHost(); toast(back ? 'Serum 2 / Vital hosts restarted; the instrument is loaded again.' : 'Serum 2 / Vital hosts restarted.', { timeout: 7000 }); return run({ keepLive: false }); }
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
    return run({});
  }
  async function resetHost() { await silenceDesk(); await hub.vst.stop(); return reopenDesk(); }
  // the hosts were restarted: the instrument the Sound desk had open is loaded again (no sound until a key / Start)
  async function reopenDesk() { const A = window.WorkbenchVST?.api, c = A?.current?.(); if (!c) return false; try { await A.open(c.name, { live: false }); return true; } catch { return false; } }
  async function setAsio(on) {
    const r = await hub.audioDoctor.asio(on); if (!r?.ok) throw Error(r?.error || 'Could not change ASIO.');
    H.config.settings = { ...H.settings(), vstAsio: on }; saveConfig();
    await reopenDesk();
    toast(on ? 'ASIO is back on.' : 'ASIO is off: Serum 2 / Vital play on WASAPI until you turn it back on here.', { timeout: 7000 });
    await wait(300); // the setting reaches the main process
    return run({ keepLive: false });
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
    if (ctx) { lastCtx = ctx; where = 'chat'; }
    if (!keepLive) { live = null; loop = null; }
    if (!window.hub?.audioDoctor) return 'The audio doctor needs Hearth\'s main process (restart Hearth after updating).';
    if (where === 'chat' && lastCtx?.note && !report) lastCtx.note('**🎚 Audio doctor** · checking the runtime, devices, MIDI, Serum 2 and Vital…', { id: 'audio-doctor' });
    const pending = check({ quick }); if (where === 'desk') renderPanel();
    await pending;
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
  if (typeof AppUI !== 'undefined' && AppUI.addAction) AppUI.addAction('Check my audio setup (Serum 2 / Vital, ASIO, UA)', () => Commands.exec('/audio doctor', H.activeId));

  return { run, inDesk, panel: () => panel, check, liveTest, fix, copyReport, command, show, rows: rowsNow, report: () => report, _test: { set: (r, l, x) => { report = r; live = l ?? null; loop = x ?? null; }, useUA, desk } };
})();
