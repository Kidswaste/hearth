// Adobe from chat (round 14): /adobe (the whole suite: status, menu, bridge, web apps), /photoshop, /illustrator,
// /premiere, /media-encoder, /indesign, /adobe-tools (lets an agent use them), and the adobe_do tool
// (mcp/adobe-mcp.js → gamebridge.js → here) so Claude and Astra drive the same actions, asking first where it matters.
(() => {
  const D = AdobeData;
  const AREA = 'Adobe';
  const base = (p) => String(p || '').split(/[\\/]/).pop();
  const opts = (list) => (args) => { const words = String(args || '').split(/\s+/); if (words.length > 2) return []; const last = words.pop().toLowerCase(); return list.filter((o) => String(o.value).toLowerCase().startsWith(last)).slice(0, 40); };
  function reg(def) {
    const taken = Commands.get(def.name);
    if (taken && !def.when && taken.area !== AREA) { console.warn(`adobe: /${def.name} is taken by ${taken.area}`); return; }
    Commands.register({ area: AREA, ...def });
  }
  const unquote = (s) => String(s || '').trim().replace(/^["'](.*)["']$/, '$1');
  // "last" = the newest render / recording, "lab" = a still of the Lab preview, a path otherwise
  async function fileArg(s, kind = 'any') {
    const a = unquote(s);
    if (!a) return null;
    if (/^lab$/i.test(a)) return Adobe.labStill();
    if (/^(last|latest|newest)$/i.test(a)) return lastVideo(kind);
    return a;
  }
  async function lastVideo() {
    const done = (typeof Renders !== 'undefined' ? [...Renders.list(), ...Renders.history()] : []).filter((j) => j.output && (j.status === 'done' || !j.status)).sort((a, b) => (b.ended || b.created || 0) - (a.ended || a.created || 0));
    for (const j of done) if (await window.hub.fs.stat(j.output)) return j.output;
    const caps = await window.hub.capture?.list?.({ kind: 'video', limit: 1 }).catch(() => []);
    if (caps?.[0]?.path) return caps[0].path;
    throw new Error('No render or recording yet: give the file\'s path.');
  }
  async function statusText() {
    const s = await Adobe.status(true);
    const lines = s.apps.map((a) => `${a.found ? '✓' : '·'} **${a.name}**${a.version ? ` ${a.version}` : ''}${a.found ? '' : ` · ${a.reason}`}${a.how === 'cep' && a.found ? (s.bridge.installed ? ' · bridge ✓' : ' · needs the Hearth bridge (/adobe bridge install)') : ''}`);
    return `Adobe on this ${s.platform === 'darwin' ? 'Mac' : s.platform === 'win32' ? 'PC' : 'computer'}:\n${lines.join('\n')}\nWeb: ${D.WEB.map((w) => w.name).join(', ')} (/adobe express · /adobe firefly)`;
  }
  const fmt = (v) => (typeof v === 'string' ? v : Object.entries(v || {}).filter(([, x]) => x != null && x !== '').map(([k, x]) => `${k}: ${Array.isArray(x) ? x.map(base).join(', ') : typeof x === 'object' ? JSON.stringify(x) : x}`).join(' · '));

  // ---------- /photoshop ----------
  async function photoshop(args, ctx = {}) {
    const [verb, ...rest] = String(args || '').trim().split(/\s+/);
    const tail = rest.join(' ');
    switch ((verb || '').toLowerCase()) {
      case '': case 'menu': { Adobe.menu(); return null; }
      case 'lab': { const r = await Adobe.labToPhotoshop(); return `In Photoshop: a still of the Lab (${base(r.path)}). Save it there and Hearth notices.`; }
      case 'board': { const r = await Adobe.boardToPhotoshop({ selected: /sel/.test(tail) }); return `The board as a layered PSD: ${r.layers} layers, ${r.size} (${base(r.path)})${r.skipped?.length ? ` · missing: ${r.skipped.join(', ')}` : ''}.`; }
      case 'open': { const f = await fileArg(tail); if (!f) return 'Give a file: /photoshop open <path> (or lab).'; const r = await Adobe.psOpen(f); return `Open in Photoshop: ${r.opened}${r.w ? ` (${r.w}×${r.h})` : ''}${r.note ? `\n(${r.note})` : ''}`; }
      case 'place': { const f = await fileArg(tail); if (!f) return 'Give a picture: /photoshop place <path>.'; await Adobe.psPlace(f); return `${base(f)} is a new layer in the front document.`; }
      case 'actions': { const sets = await Adobe.psActions(); return sets.length ? sets.map((s) => `**${s.set}**: ${s.actions.join(', ')}`).join('\n') : 'No actions in Photoshop.'; }
      case 'action': {
        const [set, act] = tail.split('/').map((x) => x.trim());
        if (!set || !act) return 'Which one? /photoshop action <set> / <action> (/photoshop actions lists them).';
        await Adobe.psAction(set, act);
        return `Ran “${act}” (${set}) on the front document.`;
      }
      case 'sizes': { const r = await Adobe.psSizes(tail || 'socials'); return `${r.files.length} sizes saved in ${r.dir}:\n${r.files.map(base).join('\n')}`; }
      case 'back': { const to = /board/.test(tail) ? 'board' : /lab/.test(tail) ? 'lab' : /chat|here/.test(tail) || !tail ? 'chat' : null; const r = await Adobe.psBack(to === 'chat' && !ctx.agentId ? null : to); return r.said || `Saved ${base(r.path)}.`; }
      default: return 'Photoshop: lab · board [selected] · open <path> · place <path> · actions · action <set> / <action> · sizes [9:16 4:5 1:1 16:9 | socials | 1080x1920] · back [chat|board|lab]';
    }
  }
  const PS_WORDS = [{ value: 'lab', hint: 'the Lab preview as a picture' }, { value: 'board', hint: 'the board as a layered PSD' }, { value: 'open', hint: '<path>' }, { value: 'place', hint: '<path> as a layer' }, { value: 'actions', hint: 'your action sets' }, { value: 'action', hint: '<set> / <action>' }, { value: 'sizes', hint: 'social sizes' }, { value: 'back', hint: 'the front document into Hearth' }];

  // ---------- /illustrator, /premiere, /media-encoder, /indesign ----------
  async function illustrator(args) {
    const [verb, ...rest] = String(args || '').trim().split(/\s+/);
    const f = unquote(rest.join(' ')) || null;
    if (/^svg$/i.test(verb || 'svg')) { const r = await Adobe.aiSvg(f); return `SVG: ${r.path}${r.said ? `\n${r.said}` : ''}`; }
    if (/^png$/i.test(verb)) { const r = await Adobe.aiPng(f); return `PNG: ${r.path}`; }
    if (/^open$/i.test(verb) && f) { await Adobe.openIn('ai', f); return `Open in Illustrator: ${base(f)} (watched: saving there makes a fresh SVG).`; }
    if (/^place$/i.test(verb) && f) { await Adobe.must('ai', D.ai.place({ file: f }), { label: 'place' }); return `${base(f)} placed in Illustrator.`; }
    return 'Illustrator: svg [path] (for the Lab) · png [path] · open <path> · place <path>';
  }
  async function premiere(args) {
    const [verb, ...rest] = String(args || '').trim().split(/\s+/);
    const tail = rest.join(' ');
    if (!verb || /^(timeline|edit|cut|sequence|seq)$/i.test(verb)) {
      const r = await Adobe.sendEdit();
      return r.premiere.ok ? `In Premiere Pro: “${r.name}”, ${r.clips} clips${r.notes.length ? `\nStays in Hearth: ${r.notes.slice(0, 6).join('; ')}` : ''}` : `${r.premiere.error}\n${r.premiere.manual}\n(the XML: ${r.file})`;
    }
    if (/^import$/i.test(verb)) { const f = await fileArg(tail); if (!f) return 'Give a file: /premiere import <path|last>.'; const r = await Adobe.prImport([f], { sequence: /\.(mp4|mov|m4v|webm|mxf)$/i.test(f) ? base(f).replace(/\.[^.]+$/, '') : null }); return r.ok ? `Imported into “${r.project}” (${r.sequences} sequences).` : `${r.error}${r.manual ? `\n${r.manual}` : ''}`; }
    if (/^xml$|^export$/i.test(verb)) { const r = await Adobe.editXml(); return `FCP XML: ${r.file} (${r.clips} clips). Premiere: File → Import.`; }
    if (/^info$/i.test(verb)) { const r = await Adobe.must('pr', D.pr.info(), { label: 'info', activate: false }); return fmt(r); }
    if (/^(render|encode|queue)$/i.test(verb)) { const out = tail || `${(await window.hub.adobe.dir())}/out/Premiere ${Date.now()}.mp4`; const r = await Adobe.must('pr', D.pr.queue({ out }), { label: 'encode sequence' }); return `“${r.sequence}” is in Media Encoder's queue → ${base(r.out)}`; }
    if (/^bridge$/i.test(verb)) return Adobe.bridge(tail || 'status');
    return 'Premiere Pro: timeline (the Lab sequence as FCP XML) · import <path|last> · xml (just the file) · info · render (active sequence → Media Encoder) · bridge [install]';
  }
  async function mediaEncoder(args) {
    const [verb, ...rest] = String(args || '').trim().split(/\s+/);
    if (/^presets$/i.test(verb)) { const l = await window.hub.adobe.presets(); return l.length ? l.map((p) => `• ${p.name} (${p.version})`).join('\n') : 'No saved presets in Documents/Adobe/Adobe Media Encoder (Media Encoder\'s own default is used).'; }
    const parts = (/^queue$/i.test(verb) ? rest : [verb, ...rest]).join(' ').split(/\s+preset\s+/i);
    const f = await fileArg(parts[0] || 'last');
    const r = await Adobe.meQueue(f, { preset: parts[1] || null });
    return `${base(f)} is in Media Encoder's queue (${r.preset})${r.started ? ', encoding' : ''}.`;
  }
  async function indesign(args) {
    const [verb, ...rest] = String(args || '').trim().split(/\s+/);
    const f = unquote(rest.join(' ')) || null;
    if (/^pdf$/i.test(verb || 'pdf')) { const r = await Adobe.idPdf(f); return `PDF: ${r.path}`; }
    if (/^place$/i.test(verb) && f) { await Adobe.idPlace(await fileArg(f)); return `${base(f)} placed in InDesign.`; }
    if (/^open$/i.test(verb) && f) { await Adobe.openIn('id', f); return `Open in InDesign: ${base(f)}.`; }
    return 'InDesign: pdf [path] · place <path|lab> · open <path>';
  }

  // ---------- /adobe ----------
  async function adobe(args, ctx) {
    const [verb, ...rest] = String(args || '').trim().split(/\s+/);
    const tail = rest.join(' ');
    const v = (verb || '').toLowerCase();
    if (!v) { Adobe.menu(); return statusText(); }
    if (v === 'status') return statusText();
    if (v === 'menu') { Adobe.menu(); return null; }
    if (v === 'bridge') return Adobe.bridge(tail || 'status');
    if (v === 'express' || v === 'firefly') { await Adobe.web(v === 'express' ? 'adobe-express' : 'adobe-firefly'); return `${v === 'express' ? 'Adobe Express' : 'Adobe Firefly'} is open (sign in there with your Adobe account).`; }
    if (v === 'watched') { const l = Adobe.links(); return l.length ? `Watched (saving them in the app brings them back):\n${l.join('\n')}` : 'No files are watched yet.'; }
    if (v === 'where') {
      const [appWord, ...p] = rest;
      const a = D.app(appWord);
      if (!a || a.how === 'ae') return 'Which app? /adobe where photoshop|illustrator|premiere|mediaencoder|indesign <path to the app> (After Effects: Settings → Folders).';
      const paths = { ...(H.config.settings?.adobePaths || {}) };
      if (p.length) paths[a.id] = unquote(p.join(' ')); else delete paths[a.id];
      H.config.settings = { ...H.config.settings, adobePaths: paths };
      await saveConfig();
      const s = (await Adobe.status(true)).apps.find((x) => x.id === a.id);
      return s.found ? `${a.name}: ${s.path}${s.version ? ` (${s.version})` : ''}` : s.reason;
    }
    const a = D.app(v);
    if (a) {
      if (a.id === 'photoshop') return photoshop(tail, ctx);
      if (a.id === 'illustrator') return illustrator(tail);
      if (a.id === 'premiere') return premiere(tail);
      if (a.id === 'mediaencoder') return mediaEncoder(tail);
      if (a.id === 'indesign') return indesign(tail);
      if (a.id === 'aftereffects') { const f = await fileArg(tail); if (!f) return 'Give a file: /adobe ae <path|last> (it becomes a comp of its own).'; await Adobe.aeImport(f); return `${base(f)} sent to After Effects (a comp of its own).`; }
    }
    return 'Adobe: status · menu · photoshop … · illustrator … · premiere … · media-encoder … · indesign … · ae <file> · bridge [install|remove] · where <app> <path> · express · firefly · watched';
  }
  const ADOBE_WORDS = [{ value: 'status', hint: 'which apps are installed' }, { value: 'photoshop', hint: 'lab, board, open, actions, sizes, back' }, { value: 'illustrator', hint: 'svg for the Lab' }, { value: 'premiere', hint: 'the Lab sequence' }, { value: 'media-encoder', hint: 'queue a render' }, { value: 'indesign', hint: 'pdf, place' }, { value: 'ae', hint: '<file> as a comp' }, { value: 'bridge', hint: 'install · remove (Premiere, Media Encoder)' }, { value: 'where', hint: '<app> <path>' }, { value: 'express', hint: 'Adobe Express window' }, { value: 'firefly', hint: 'Adobe Firefly window' }, { value: 'watched', hint: 'files that come back when saved' }];

  reg({ name: 'adobe', args: '[status | photoshop … | premiere … | bridge install | express | firefly]', desc: 'Your Adobe apps from Hearth: which are installed, send pictures / boards / edits to them, bring results back', run: adobe, complete: opts(ADOBE_WORDS), examples: ['/adobe status', '/adobe photoshop lab', '/adobe express'], keywords: 'photoshop illustrator premiere media encoder indesign after effects creative cloud suite express firefly' });
  reg({ name: 'photoshop', aliases: ['ps'], args: '[lab | board | open <path> | actions | action <set> / <name> | sizes … | back [chat|board|lab]]', desc: 'Photoshop: the Lab preview or the board as layers, your actions, social sizes, the front document back into Hearth', run: photoshop, complete: opts(PS_WORDS), examples: ['/photoshop lab', '/photoshop board', '/photoshop sizes 9:16 4:5', '/photoshop back board'], keywords: 'psd layered edit retouch' });
  reg({ name: 'illustrator', args: '[svg [path] | png [path] | open <path>]', desc: 'Illustrator: the front document (or a file) as SVG for the Lab, PNG back into Hearth', run: illustrator, complete: opts([{ value: 'svg' }, { value: 'png' }, { value: 'open' }, { value: 'place' }]), examples: ['/illustrator svg'], keywords: 'vector svg logo artwork' });
  reg({ name: 'premiere', aliases: ['pr'], args: '[timeline | import <path|last> | xml | render | bridge]', desc: 'Premiere Pro: the Lab sequence as FCP XML, a render into a new sequence, the active sequence to Media Encoder', run: premiere, complete: opts([{ value: 'timeline', hint: 'the Lab sequence' }, { value: 'import', hint: '<path|last>' }, { value: 'xml', hint: 'just the file' }, { value: 'info' }, { value: 'render', hint: 'active sequence → Media Encoder' }, { value: 'bridge' }]), examples: ['/premiere timeline', '/premiere import last'], keywords: 'fcp xml edl edit sequence' });
  reg({ name: 'media-encoder', aliases: ['ame'], args: '[queue] <path|last> [preset <name>] | presets', desc: 'Media Encoder: queue a render (your saved presets or its default) and start encoding', run: mediaEncoder, complete: opts([{ value: 'queue' }, { value: 'last', hint: 'the newest render' }, { value: 'presets' }]), examples: ['/media-encoder last', '/media-encoder presets'], keywords: 'encode transcode export queue' });
  reg({ name: 'indesign', args: '[pdf [path] | place <path|lab> | open <path>]', desc: 'InDesign: the front document as PDF, a picture placed in it', run: indesign, complete: opts([{ value: 'pdf' }, { value: 'place' }, { value: 'open' }]), examples: ['/indesign pdf'], keywords: 'layout print pdf' });
  reg({ name: 'adobe-tools', args: '[on | off]', desc: 'Let this agent use your Adobe apps (adobe_do tool: open, export, send, bring back; it asks before running its own scripts)', complete: opts([{ value: 'on' }, { value: 'off' }]),
    run: async (args, ctx) => {
      const agent = H.agent(ctx.agentId);
      if (!agent || agent.mode !== 'native') return 'Run it in a chat.';
      const cfg = H.config.agents.find((x) => x.id === agent.id);
      const on = /off/.test(String(args)) ? false : /on/.test(String(args)) ? true : !cfg.adobeTools;
      if (on) cfg.adobeTools = true; else delete cfg.adobeTools;
      await saveConfig();
      return on ? `${agent.name} can use your Adobe apps (adobe_do), from its next message.` : `${agent.name} no longer gets the Adobe tool.`;
    } });

  // ---------- the agents' tool (adobe_do) ----------
  async function handle(tool, a) {
    if (tool !== 'adobe_do') return { ok: false, error: `Unknown Adobe tool ${tool}` };
    const app = D.app(a.app)?.id || (String(a.app || '').toLowerCase() === 'status' ? null : a.app);
    const act = String(a.action || (app ? '' : 'status')).toLowerCase();
    const agentId = H.activeId;
    try {
      if (act === 'status' || !app) return { ok: true, value: await statusText() };
      if (act === 'script') {
        if (!a.code) return { ok: false, error: 'script needs code (an ExtendScript function body that returns a value)' };
        const ok = await Adobe.ask({ agentId, action: `Run a script in ${D.app(app).name}`, target: `${String(a.code).split('\n').length} lines`, risk: 'high', detail: String(a.code).slice(0, 1200), ok: 'Run it' });
        if (!ok) return { ok: false, error: 'The owner said no.' };
        const r = await Adobe.run(app, a.code, { label: 'agent script' });
        return r.ok ? { ok: true, value: r.value } : { ok: false, error: r.error };
      }
      const file = a.path ? await fileArg(a.path) : null;
      if (app === 'photoshop') {
        if (act === 'open') return { ok: true, value: await Adobe.psOpen(file || await Adobe.labStill()) };
        if (act === 'board') return { ok: true, value: await Adobe.boardToPhotoshop({ selected: Boolean(a.selected) }) };
        if (act === 'actions') return { ok: true, value: (await Adobe.psActions()).map((s) => `${s.set}: ${s.actions.join(', ')}`).join('\n') || 'none' };
        if (act === 'action') return { ok: true, value: await Adobe.psAction(a.set, a.name, file) };
        if (act === 'sizes') return { ok: true, value: await Adobe.psSizes(a.sizes || 'socials', file) };
        if (act === 'place') return { ok: true, value: await Adobe.psPlace(file) };
        if (act === 'back') {
          const r = await Adobe.psBack(['chat', 'board', 'lab'].includes(a.to) ? a.to : null);
          const images = typeof CaptureCmds !== 'undefined' ? await CaptureCmds.inline([r.path], { max: 1, long: 1024 }) : [];
          return { ok: true, value: { path: r.path, name: r.name, size: `${r.w}×${r.h}`, said: r.said || undefined }, images };
        }
      }
      if (app === 'illustrator') {
        if (act === 'svg') return { ok: true, value: await Adobe.aiSvg(file) };
        if (act === 'png') return { ok: true, value: await Adobe.aiPng(file) };
        if (act === 'open' || act === 'place') return { ok: true, value: act === 'open' ? await Adobe.openIn('ai', file) : await Adobe.must('ai', D.ai.place({ file }), { label: 'place' }) };
      }
      if (app === 'premiere') {
        if (act === 'timeline') { const r = await Adobe.sendEdit(); return r.premiere.ok ? { ok: true, value: { sent: r.name, clips: r.clips, xml: r.file, staysInHearth: r.notes } } : { ok: false, error: `${r.premiere.error} ${r.premiere.manual} (XML: ${r.file})` }; }
        if (act === 'import') { const r = await Adobe.prImport([file || await lastVideo()], { sequence: a.name || null }); return r.ok ? { ok: true, value: r } : { ok: false, error: `${r.error}${r.manual ? ` ${r.manual}` : ''}` }; }
        if (act === 'xml') return { ok: true, value: await Adobe.editXml() };
        if (act === 'info') return { ok: true, value: await Adobe.must('pr', D.pr.info(), { label: 'info', activate: false }) };
      }
      if (app === 'mediaencoder') {
        if (act === 'presets') return { ok: true, value: (await window.hub.adobe.presets()).map((p) => p.name).join(', ') || 'none saved (Media Encoder\'s default is used)' };
        if (act === 'queue') return { ok: true, value: await Adobe.meQueue(file || await lastVideo(), { preset: a.preset || null }) };
      }
      if (app === 'indesign') {
        if (act === 'pdf') return { ok: true, value: await Adobe.idPdf(file) };
        if (act === 'place') return { ok: true, value: await Adobe.idPlace(file) };
        if (act === 'open') return { ok: true, value: await Adobe.openIn('id', file) };
      }
      if (app === 'aftereffects' && (act === 'import' || act === 'open')) { await Adobe.aeImport(file || await lastVideo()); return { ok: true, value: 'sent to After Effects' }; }
      return { ok: false, error: `${D.app(app)?.name || app}: unknown action "${act}" (see the tool description)` };
    } catch (err) { return { ok: false, error: err.message }; }
  }
  if (typeof HubBridge !== 'undefined') HubBridge.register(['adobe_'], handle);
  window.AdobeCmds = { handle, statusText, photoshop, premiere, illustrator, mediaEncoder, indesign, adobe };
})();
