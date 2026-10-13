// "Describe it" (round 29, instantscene): the ways in, loaded with the Lab. The window itself
// (tools/three-instant*.js) loads with the gallery the first time one is used (lazy group "gallery"):
//   · the ◎ mission "Make it from my words" in the Lab director's chat: your message becomes the description, the
//     3 picks show, one click opens a scene (0 tokens, nothing goes to the director); closing it puts your words back
//   · the empty Lab: "✦ Describe it" on a new chat's untouched starter (next to "Start from something like…") and on a
//     scene that is just the plain "Shape" you start from
//   · ✦ More › ✨ Look & motion › ✦ Describe it… (tools/three-easy.js)
//   · the gallery's search, when it reads like a description (tools/three-gallery.js asks LabInstant.galleryRow)
//   · /describe [words] · /describe make <words> (the first pick at once) · /describe list <words> · /describe ask
const LabInstantHook = (() => {
  async function ready() {
    if (typeof LabInstant !== 'undefined') return LabInstant;
    if (typeof Lazy === 'undefined') throw new Error('Describe it isn\'t available here');
    await Lazy.load('gallery');
    return LabInstant;
  }
  function open(opts = {}) {
    return ready().then(async (I) => { await ThreeLab.cmd({ show: true }); return I.open(opts); }).catch((err) => toast(`Describe it didn't open: ${err.message}`, { type: 'error' }));
  }
  const item = () => ({ label: '✦ Describe it…', hint: 'a scene from your words, 0 tokens', cmd: 'describe', action: () => open() });

  // ---------- the ◎ mission ----------
  const inLab = (id) => H.agent?.(id)?.dock === 'three';
  const MISSION = {
    id: 'lab-describe', icon: '✦', label: 'Make it from my words',
    desc: 'Your message describes the scene ("dreamy pink chrome tunnel that pulses on the kick, slow"): 3 picks made on this computer from the gallery, looks, palettes and music reactions, 0 tokens. Click one: a new scene. The director is asked only if you want, cost shown first.',
    submit(agentId, text, t) {
      open({ text: t, onPick: (pick) => { if (!pick) Native.setDraft?.(agentId, text); } });
      return true;
    },
  };
  if (typeof Missions !== 'undefined' && Missions.add) Missions.add({ ...MISSION, when: inLab });

  // ---------- the empty Lab ----------
  // the gallery's chip on a new chat's starter gets a "✦ Describe it" button (tools/three-gallery-hook.js calls this)
  function decorate(chip) {
    if (!chip || chip.querySelector('.lab-inst-start')) return;
    chip.insertBefore(el('button', { type: 'button', class: 'lab-inst-start', text: '✦ Describe it', title: 'A scene from your words, 0 tokens', on: { click: () => open() } }), chip.querySelector('.x'));
  }
  // an empty scene (its one layer is the plain "Shape" you start from, untouched): one chip on the preview
  let chip = null;
  function isEmpty(d) {
    const Ls = d.layers().layers;
    if (Ls.length !== 1) return false;
    const t = ThreeLayers.TEMPLATES.find((x) => x.id === 'empty');
    return Boolean(t && d.codeOf(Ls[0].id)?.code?.trim() === t.code.trim());
  }
  function paint() {
    const sc = typeof ThreeLab !== 'undefined' ? ThreeLab.scenes : null;
    const d = typeof ThreeLab !== 'undefined' ? ThreeLab.director : null;
    const hostEl = sc?.previewHost?.();
    let empty = false;
    try { empty = Boolean(sc?.currentId() && d && isEmpty(d)); } catch { empty = false; }
    if (!empty || !hostEl) { chip?.remove(); return; }
    if (!chip) chip = el('div', { class: 'lab-gal-chip-start lab-inst-empty' }, el('button', { type: 'button', class: 'lab-inst-start', text: '✦ Describe it: a scene from your words', title: '0 tokens: matched on this computer', on: { click: () => open() } }));
    if (getComputedStyle(hostEl).position === 'static') hostEl.style.position = 'relative';
    if (chip.parentNode !== hostEl) hostEl.append(chip);
  }
  const later = () => setTimeout(paint, 350);
  addEventListener('hearth:sketch', later);
  addEventListener('hearth:scene-changed', later);
  setTimeout(paint, 1600);

  // ---------- chat (the app's internal API; the director reaches it through three_do run) ----------
  if (typeof Commands !== 'undefined' && !Commands.get('describe')) {
    Commands.register({
      name: 'describe', area: 'Three.js Lab', args: '[words] | make <words> | list <words> | ask',
      desc: 'Describe it: a scene from your words with 0 tokens (matched on this computer: gallery, library, looks, palettes, music reactions); make: the first pick at once; list: the 3 picks and why; ask: the director takes the last one further',
      keywords: 'describe words sentence instant scene make from text prompt no tokens free local',
      examples: ['/describe dreamy pink chrome tunnel that pulses on the kick, slow', '/describe make neon tunnel, fast'],
      async run(args, ctx) {
        const a = String(args || '').trim();
        const m = a.match(/^(make|list|ask)\b\s*(.*)$/i);
        const I = await ready();
        if (m && m[1].toLowerCase() === 'ask') { await I.ask({ note: m[2] }); return; }
        if (m && m[2]) {
          const p = I.plan(m[2]);
          if (m[1].toLowerCase() === 'list') { ctx.say(p.picks.map((x, i) => `${i + 1}. ${x.name} (${x.base.name}): ${x.why.join(' · ')}`).join('\n')); return; }
          await ThreeLab.cmd({ show: true });
          const r = await I.make(p.picks[0], m[2]);
          ctx.say(`✦ New scene "${r.scene}" from your words (0 tokens): ${p.picks[0].why.join(' · ')}`);
          return;
        }
        await open({ text: a });
      },
    });
  }
  return { open, item, decorate, paint, MISSION };
})();
