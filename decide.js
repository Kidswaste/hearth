// "Let Astra decide" (round 4, simplify): where Hearth offers a choice you'd rather not make (which look, effect,
// palette or layer for the Lab picture, which frame size, which app look), one button or `/decide <what>` asks
// Astra once and applies its pick, with Undo. Never automatic: it runs only when you ask.
// Cost: one lean one-off question (no tools, a one-line persona instead of the agent's instructions, ≤ 8 option
// names, a 320 px picture when it's about the picture); usually a few hundred tokens. Each run's tokens go to
// the meter and `/decide log`. Astra missing or failing → Claude; neither → a local default (no tokens).
const Decide = (() => {
  const PERSONA = 'You choose for the user so they don\'t have to. Reply with one option name only.';
  const MAX = 8;
  const LOG_KEY = 'decide.log';
  const astra = () => H.agents().find((a) => a.mode === 'native' && a.engine === 'codex' && !a.dock);
  const claude = () => H.claudeAgent?.() || H.agents().find((a) => a.mode === 'native' && a.engine === 'claude' && !a.dock);
  const shuffle = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i -= 1) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const uniq = (a) => a.filter((x, i) => x && a.indexOf(x) === i);

  // ---------- the Lab ----------
  const lab = async () => { await ThreeLab.cmd({ show: false }); if (!ThreeLab.director) throw new Error('The Three.js Lab is not ready yet'); return ThreeLab.director; };
  // What applying a Lab item can change: layers (added / removed ✦ look layers), the palette, the selected layer's
  // color sliders. Undo puts those back.
  async function labSnapshot() {
    const d = await lab();
    const layers = d.layers().layers.map((L) => ({ id: L.id, name: L.name }));
    const sel = d.layers().layers.find((L) => L.selected);
    let colors = null;
    try { colors = sel && !sel.kind ? Object.fromEntries(d.sliders(sel.id).sliders.filter((c) => typeof c.value === 'string' && /^#[0-9a-f]{6}$/i.test(c.value)).map((c) => [c.key, c.value])) : null; } catch { /* no sliders */ }
    const codes = {};
    for (const L of layers) if (L.name.startsWith('✦ ')) try { codes[L.id] = d.codeOf(L.id).code; } catch { /* gone */ }
    return { layers, sel: sel?.id, colors, codes, palette: d.refs.palette().slice() };
  }
  async function labRestore(snap) {
    const d = await lab();
    const now = d.layers().layers;
    for (const L of now) if (!snap.layers.some((x) => x.id === L.id)) await d.removeLayer(L.id).catch(() => {});
    for (const L of snap.layers) if (!now.some((x) => x.id === L.id) && snap.codes[L.id]) await d.addLayer({ name: L.name, code: snap.codes[L.id] }, 0.3).catch(() => {});
    d.refs.setPalette(snap.palette);
    if (snap.sel && snap.colors && Object.keys(snap.colors).length) try { d.sliders(snap.sel, snap.colors); } catch { /* layer gone */ }
  }
  // A small picture of the Lab preview for the question (JPEG, 320 px wide): a few hundred image tokens at most.
  async function smallShot() {
    const url = await ThreeLab.shot?.().catch(() => null);
    if (!url) return null;
    const img = new Image();
    await new Promise((r) => { img.onload = r; img.onerror = r; img.src = url; });
    if (!img.width) return null;
    const w = Math.min(320, img.width); const h = Math.round((img.height / img.width) * w);
    const c = Object.assign(document.createElement('canvas'), { width: w, height: h });
    c.getContext('2d').drawImage(img, 0, 0, w, h);
    return window.hub.saveAttachment(`decide-${Date.now()}.jpg`, c.toDataURL('image/jpeg', 0.7).split(',')[1]).catch(() => null);
  }
  // Lab catalogs (ThreeFX items): your favorites first, then strong suggestions, then a random handful.
  function fxCandidates(kind, extra = []) {
    const all = ThreeFX.items(kind).filter((it) => it.kind === kind);
    const favs = new Set(store.get('three.fx.favs', []));
    const byKey = new Map(all.map((it) => [`${it.kind}:${it.id}`, it]));
    const picks = uniq([...[...favs].map((k) => byKey.get(k)), ...extra.map((k) => byKey.get(k)), ...shuffle(all)]).slice(0, MAX);
    return picks.map((it) => ({ name: it.name, it }));
  }
  const fxKind = (kind, label, goal, extra) => ({
    label, goal, visual: true,
    candidates: () => fxCandidates(kind, extra),
    async apply(c) { const snap = await labSnapshot(); await ThreeFX.apply(c.it); return () => labRestore(snap); },
    local: (cands) => cands[0], // a favorite, else a suggestion
  });

  // ---------- what can be decided ----------
  const KINDS = {
    look: fxKind('look', 'a Lab look (colors + filters)', 'a look that suits this music visual', []),
    effect: fxKind('filter', 'an effect for the Lab picture', 'one effect that makes this picture more striking', (ThreeFX.SUGGESTED || []).filter((k) => k.startsWith('filter:'))),
    palette: fxKind('palette', 'a palette for the Lab picture', 'colors that suit this picture', []),
    template: fxKind('layer', 'a layer to add to the Lab picture', 'one layer that adds to this picture', (ThreeFX.SUGGESTED || []).filter((k) => k.startsWith('layer:'))),
    size: {
      label: 'a frame size', goal: 'the social frame that suits this picture best', visual: true,
      candidates: () => [['9:16', 'vertical 9:16'], ['16:9', 'wide 16:9'], ['4:5', 'portrait 4:5'], ['1:1', 'square 1:1']].map(([id, name]) => ({ id, name })),
      async apply(c) { const cmd = await ThreeLab.cmd({ show: false }); const was = cmd.state.frame?.id || 'fit'; cmd.size(c.id); return () => cmd.size(was); },
      // your usual: 9:16 (the most used), or 16:9 if that's already on
      local: async (cands) => { const cur = (await ThreeLab.cmd({ show: false })).state.frame?.id; return cands.find((c) => c.id !== cur); },
    },
    theme: {
      label: 'a look for the app', goal: 'a calm, good-looking look for a music and visuals studio app', visual: false,
      candidates: () => {
        const T = AppUI.THEMES || {};
        const ids = uniq(['forgeheart', 'classic', 'forge-light', 'chrome-forge', 'glass-ember', 'obsidian', 'molten', 'synth-forge', 'midnight-violet', 'dusk', 'frost-light', 'ironclad']).filter((id) => T[id] && id !== H.config.theme?.preset);
        return ids.slice(0, MAX).map((id) => ({ id, name: T[id].label.replace(/ \(.*\)$/, '') }));
      },
      async apply(c) {
        const was = JSON.parse(JSON.stringify(H.config.theme || {}));
        Look.applyPreset(c.id, { quiet: true });
        return () => { H.config.theme = was; applyTheme(document.getElementById('user-theme')?.textContent || ''); saveConfig(); };
      },
      // daytime: a light look, evening: Forgeheart
      local: (cands) => { const h = new Date().getHours(); const want = h >= 8 && h < 18 ? 'forge-light' : 'forgeheart'; return cands.find((c) => c.id === want) || cands[0]; },
    },
  };
  const ALIASES = { looks: 'look', fx: 'effect', filter: 'effect', filters: 'effect', effects: 'effect', colors: 'palette', colours: 'palette', layer: 'template', templates: 'template', frame: 'size', format: 'size', sizes: 'size', appearance: 'theme', app: 'theme', ui: 'theme', skin: 'theme' };
  const resolveKind = (w) => { const k = String(w || '').toLowerCase(); return KINDS[k] ? k : ALIASES[k] || null; };

  // The reply names one option; the longest name found in it wins (so "Glitch" doesn't beat "Glitch bars").
  function parsePick(text, cands) {
    const t = String(text || '').toLowerCase();
    return [...cands].sort((a, b) => b.name.length - a.name.length).find((c) => t.includes(c.name.toLowerCase()) || (c.id && t.includes(String(c.id).toLowerCase()))) || null;
  }

  let last = null; // { kind, pick, undo, at }
  async function run(what, { goal = '', agentId = null, say = null } = {}) {
    const inLab = H.surfaceIdFor?.(H.activeId) === 'tool:three';
    const kind = resolveKind(what) || (inLab ? 'look' : 'theme');
    const K = KINDS[kind];
    const cands = K.candidates();
    if (!cands.length) throw new Error(`Nothing to choose from for ${K.label}.`);
    const prompt = `Pick ${K.label}. Goal: ${goal || K.goal}.${K.visual ? ' The image is the picture now.' : ''}\nOptions: ${cands.map((c) => c.name).join(' | ')}\nReply with one option name only.`;
    const t0 = toast(`Asking ${astra()?.name || claude()?.name || 'Hearth'} to pick ${K.label}…`, { timeout: 60000 });
    let pick = null; let by = 'Hearth (local default)'; let usage = null;
    try {
      const img = K.visual ? await smallShot() : null;
      for (const agent of [astra(), claude()].filter(Boolean)) {
        const r = await window.hub.askOnce({ agentId: agent.id, text: prompt, images: img ? [img] : [], options: { lean: true, persona: PERSONA, ...(agent.engine === 'codex' ? { effort: 'minimal', verbosity: 'low' } : {}) } }).catch((err) => ({ ok: false, error: err.message }));
        if (r?.ok && r.usage) document.dispatchEvent(new CustomEvent('hearth:usage', { detail: { agentId: agent.id, usage: r.usage, source: 'decide' } }));
        pick = r?.ok ? parsePick(r.text, cands) : null;
        if (pick) { by = agent.name; usage = r.usage || null; break; }
      }
    } finally { t0?.remove?.(); }
    if (!pick) pick = await K.local(cands);
    const undo = await K.apply(pick);
    last = { kind, pick: pick.name, by, undo, at: Date.now() };
    const cost = usage ? `${(usage.input || 0) + (usage.output || 0)} tokens` : 'no tokens';
    const entry = { at: Date.now(), kind, pick: pick.name, by, input: usage?.input || 0, output: usage?.output || 0, options: cands.length, promptChars: prompt.length };
    store.set(LOG_KEY, [entry, ...store.get(LOG_KEY, [])].slice(0, 30));
    console.info(`[decide] ${kind} → ${pick.name} by ${by} · ${cost} (${prompt.length} prompt chars, ${cands.length} options)`);
    const text = `${by} picked ${pick.name} (${K.label} · ${cost})`;
    toast(text, { timeout: 6000, action: { label: 'Undo', fn: () => undoLast() } });
    return { kind, pick: pick.name, by, usage, text };
  }
  async function undoLast() {
    if (!last) return 'Nothing to undo.';
    const l = last; last = null;
    await l.undo();
    toast(`Back to before ${l.pick}`, { timeout: 1600 });
    return `Undone: ${l.pick}`;
  }

  if (!Commands.get('decide')) {
    Commands.register({
      name: 'decide', area: 'Astra', args: '[look|effect|palette|template|size|theme|undo|log] [goal…]',
      desc: 'Let Astra choose for you (one small question, applied with Undo): a Lab look / effect / palette / layer, the frame size, the app look',
      examples: ['/decide effect', '/decide look dreamy and calm', '/decide size', '/decide theme'],
      keywords: 'choose pick for me astra decide surprise',
      undo: '/decide undo',
      complete: () => [...Object.entries(KINDS).map(([value, k]) => ({ value, hint: k.label })), { value: 'undo', hint: 'Put back what was there' }, { value: 'log', hint: 'The last decisions and their token cost' }],
      run: async (args, ctx) => {
        const [w, ...rest] = args.trim().split(/\s+/);
        if (/^undo$/i.test(w)) return undoLast();
        if (/^log$/i.test(w)) {
          const log = store.get(LOG_KEY, []);
          return log.length ? log.slice(0, 10).map((e) => `- ${new Date(e.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} ${e.kind} → **${e.pick}** by ${e.by} · ${e.input + e.output} tokens (${e.input} in, ${e.output} out)`).join('\n') : 'No decisions yet. Try /decide effect in the Lab.';
        }
        const known = resolveKind(w);
        const r = await run(known ? w : '', { goal: (known ? rest : [w, ...rest]).join(' ').trim(), agentId: ctx.agentId });
        if (ctx.note) { ctx.note(r.text, { actions: [{ label: 'Undo', run: () => undoLast() }] }); return ''; }
        return r.text;
      },
    });
  }
  AppUI.addAction?.('Let Astra decide: a look for the Lab picture', () => run('look'));
  AppUI.addAction?.('Let Astra decide: an effect for the Lab picture', () => run('effect'));
  AppUI.addAction?.('Let Astra decide: the frame size', () => run('size'));
  AppUI.addAction?.('Let Astra decide: the app look', () => run('theme'));

  return { run, undo: undoLast, KINDS, parsePick, last: () => last };
})();
