// /grade from any chat (round 24 "grade"; tools/three-grade.js): the Lab's cinematic grade.
//   /grade                                  the ◐ Grade panel (Tone · Wheels · Curves · HSL · Color · LUT · Film · Lens · Scopes)
//   /grade blockbuster [60%]                a preset (/grade presets lists them), its strength
//   /grade lut teal-orange [70%] · /grade lut none        a LUT from the starter pack or one you imported, its strength
//   /grade tone aces|agx|filmic|reinhard|neutral|none · /grade exposure +0.5 · /grade bars 2.39:1
//   /grade set grain=0.3 bloom=0.4 vignette=0.5          any setting (names as in the panel)
//   /grade import <file.cube> · /grade export [file.cube] (the grade as a 33³ LUT for Premiere / Resolve)
//   /grade clip <n|name|all> <preset|none> · /grade scopes · /grade status · /grade off · /grade luts
(() => {
  const AREA = 'Three.js Lab';
  const G = () => GradeCore;
  const X = () => LabGrade;
  const pct = (w) => (/^\d+(\.\d+)?%$/.test(w || '') ? parseFloat(w) / 100 : null);
  const SUBS = [['presets', 'the grade presets'], ['luts', 'the LUTs'], ['lut', 'lut <name|none> [70%]'], ['tone', 'tone aces|agx|filmic|reinhard|neutral|none'], ['set', 'set key=value …'], ['import', 'import <file.cube>'], ['export', 'export [file.cube]'], ['clip', 'clip <n|all> <preset|none>'], ['scopes', 'waveform · vectorscope · histogram'], ['status', 'what the grade is now'], ['off', 'remove the grade'], ['keep', 'write the panel moves into the scene']];
  function setPairs(words) {
    const out = { grade: {}, lens: {} }; const bad = [];
    for (let i = 0; i < words.length; i += 1) {
      let [k, v] = words[i].split('=');
      if (v == null) { v = words[i + 1]; i += 1; }
      const hit = G().keyOf(k);
      if (!hit || v == null) { bad.push(k); continue; }
      const sp = G().specOf(hit.kind)[hit.key];
      out[hit.kind][hit.key] = sp.options || typeof sp.value === 'string' ? v : Number(v.replace(/%$/, '')) / (/%$/.test(v) ? 100 : 1);
    }
    return { out, bad };
  }
  async function status() {
    const s = await X().state();
    if (!s.on) return 'No ◐ grade in this scene yet. `/grade blockbuster`, `/grade lut kodak-warm`, or `/grade` for the panel.';
    return `◐ ${G().describe(s.grade || {}, s.lens)}${s.layers.grade ? ` (layer “${s.layers.grade}”${s.layers.lens ? ` + “${s.layers.lens}”` : ''})` : ''}.`;
  }
  async function run(args) {
    if (typeof ThreeLab !== 'undefined') await ThreeLab.cmd?.({ show: false }).catch(() => null);
    if (typeof LabGrade === 'undefined') return 'The Lab isn\'t loaded yet: open the Three.js Lab once.';
    const w = String(args || '').trim().split(/\s+/).filter(Boolean);
    const sub = (w[0] || '').toLowerCase();
    if (!sub) { await X().open(); return undefined; }
    if (sub === 'scopes' || sub === 'scope') { await X().open({ tab: 'scopes' }); return undefined; }
    if (sub === 'status') return status();
    if (sub === 'presets' || sub === 'list' || sub === 'help') return `**${G().PRESETS.length} grade presets** (\`/grade <name> [60%]\`):\n${G().PRESETS.map((p) => `- **${p.id}** · ${p.name}: ${p.desc}`).join('\n')}\nAlso: \`/grade luts\`, \`/grade lut <name> [70%]\`, \`/grade set exposure=0.3 grain=0.2\`, \`/grade export\`.`;
    if (sub === 'luts') { const l = await X().luts(); return `**LUTs**: ${G().PACK.map(([id, n]) => `${id} (${n})`).join(', ')}${l.imported.length ? `\n**Imported**: ${l.imported.map((x) => `${x.name} (${x.was === '1d' ? '1D' : '3D'} ${x.size})`).join(', ')}` : ''}\n\`/grade lut <name> [70%]\` · \`/grade import <file.cube>\``; }
    if (sub === 'off' || sub === 'remove' || sub === 'none') { const n = await X().off(); return n ? 'Grade off (the ◐ layers are gone).' : 'There was no grade.'; }
    if (sub === 'keep' || sub === 'save') { const n = await X().keep(); return n ? '◐ Kept in the scene.' : 'Nothing new to keep.'; }
    if (sub === 'lut') {
      const a = pct(w[w.length - 1]); const name = w.slice(1, a != null ? -1 : undefined).join('-');
      if (!name) return `Which LUT? ${G().PACK_IDS.join(', ')} (or \`/grade import <file.cube>\`).`;
      const got = await X().setLut(name, a);
      return got === 'none' ? 'No LUT.' : `◐ LUT ${got}${a != null ? ` at ${Math.round(a * 100)} %` : ''}.`;
    }
    if (sub === 'tone' || sub === 'tonemap') { const t = (w[1] || '').toLowerCase(); if (!G().TONES.includes(t)) return `Tone mapping: ${G().TONES.join(', ')}.`; await X().set({ tone: t }, { persist: true }); return `◐ Tone mapping: ${G().TONE_NAMES[t]}.`; }
    if (sub === 'import') {
      const p = w.slice(1).join(' ').replace(/^["']|["']$/g, '');
      if (!p) { const got = await X().pickCubes(); return got.length ? `LUT${got.length > 1 ? 's' : ''} added: ${got.map((x) => x.name).join(', ')}.` : 'No file picked.'; }
      const r = await X().importCube(p);
      await X().setLut(r.name);
      return `⬚ LUT **${r.name}** (${r.was === '1d' ? `1D, ${r.size} points, made 3D` : `3D ${r.N}³`}) imported and applied. \`/grade lut ${r.name} 60%\` for less.`;
    }
    if (sub === 'export') {
      const p = w.slice(1).join(' ').replace(/^["']|["']$/g, '') || null;
      const r = await X().exportCube(p);
      return `⇩ The grade as a LUT (${r.N}³ .cube, for Premiere / Resolve / anything that reads .cube):\n\`${r.path}\``;
    }
    if (sub === 'clip' || sub === 'clips') {
      if (typeof ThreeSeq === 'undefined' || !ThreeSeq.edit) return 'Open a Lab sequence first (▤ Sequence).';
      const ref = w[1]; const rest = w.slice(2); const a = pct(rest[rest.length - 1]); const name = rest.slice(0, a != null ? -1 : undefined).join(' ');
      if (!ref || !name) return 'Which clip and which grade? `/grade clip 2 noir`, `/grade clip all blockbuster`, `/grade clip 1 none`.';
      if (/^all$/i.test(ref)) { if (/^(none|off)$/i.test(name)) { ThreeSeq.setCGrade(null, { all: true }); return 'No sequence grade.'; } const p = await X().applyPreset(name, { target: { seq: true }, amount: a }); return `◐ ${p.name} on the whole sequence (clips with their own grade keep theirs).`; }
      const id = ThreeSeqData.resolve(ThreeSeq.edit, /^\d+$/.test(ref) ? Number(ref) : ref);
      if (!id) return `No clip “${ref}”.`;
      if (/^(none|off)$/i.test(name)) { ThreeSeq.setCGrade(null, { ids: [id] }); return 'No grade on that clip.'; }
      const p = await X().applyPreset(name, { target: { clip: id }, amount: a });
      return `◐ ${p.name} on clip ${ref} (the preview and the render use the same shader).`;
    }
    if (sub === 'set') {
      const { out, bad } = setPairs(w.slice(1));
      if (!Object.keys(out.grade).length && !Object.keys(out.lens).length) return `Set what? e.g. \`/grade set exposure=0.3 grain=0.2 bloom=0.4\`${bad.length ? ` (unknown: ${bad.join(', ')})` : ''}.`;
      if (Object.keys(out.lens).length) await X().set(out.lens, { kind: 'lens', persist: true });
      if (Object.keys(out.grade).length) await X().set(out.grade, { persist: true });
      return `◐ ${[...Object.entries(out.grade), ...Object.entries(out.lens)].map(([k, v]) => `${k} ${v}`).join(', ')}${bad.length ? ` (unknown: ${bad.join(', ')})` : ''}.`;
    }
    // "/grade exposure 0.5", "/grade bars 2.39:1", "/grade bloom 0.4"
    const hit = G().keyOf(sub);
    if (hit && w[1] != null) {
      const sp = G().specOf(hit.kind)[hit.key];
      const v = sp.options || typeof sp.value === 'string' ? w.slice(1).join(' ') : Number(w[1].replace(/%$/, '')) / (/%$/.test(w[1]) ? 100 : 1);
      await X().set({ [hit.key]: v }, { kind: hit.kind, persist: true });
      return `◐ ${G().specOf(hit.kind)[hit.key].label}: ${v}.`;
    }
    // a preset by name
    const a = pct(w[w.length - 1]);
    const name = w.slice(0, a != null ? -1 : undefined).join(' ');
    if (G().findPreset(name)) { const p = await X().applyPreset(name, { amount: a }); return `◐ ${p.name}: ${p.desc}${a != null ? ` (${Math.round(a * 100)} %)` : ''}.`; }
    return `Nothing called “${args}”. \`/grade presets\`, \`/grade luts\`, or \`/grade\` for the panel.`;
  }
  function register() {
    if (typeof Commands === 'undefined' || Commands.get('grade')) return;
    Commands.register({
      name: 'grade', area: AREA,
      args: '[preset [60%]] | lut <name|none> [70%] | tone <aces|agx|filmic|reinhard|neutral> | set key=value… | <setting> <value> | import <.cube> | export [.cube] | clip <n|all> <preset|none> | scopes | status | off',
      desc: 'Cinematic grade for the Lab and its sequence: presets, LUTs (.cube in and out), tone mapping, wheels, curves, HSL, film grain, bloom, halation, anamorphic streaks, letterbox, scopes',
      keywords: 'color grade grading lut cube aces agx filmic tonemap lift gamma gain wheels curves hsl vibrance split toning grain halation bloom anamorphic chromatic aberration lens distortion letterbox vignette scopes waveform vectorscope histogram resolve premiere film look',
      examples: ['/grade', '/grade blockbuster', '/grade lut kodak-warm 70%', '/grade tone aces', '/grade set exposure=0.3 grain=0.25', '/grade export', '/grade clip 2 noir'],
      complete: (a) => {
        const w = String(a || '').split(/\s+/);
        if (w.length <= 1) return [...SUBS.map(([value, hint]) => ({ value, hint })), ...G().PRESETS.map((p) => ({ value: p.id, hint: p.name }))].filter((x) => x.value.startsWith((w[0] || '').toLowerCase()));
        const s0 = w[0].toLowerCase(); const last = w[w.length - 1].toLowerCase(); const pre = w.slice(0, -1).join(' ');
        const opts = s0 === 'lut' ? ['none', ...G().PACK_IDS] : s0 === 'tone' ? G().TONES : s0 === 'bars' ? G().BARS : s0 === 'clip' ? (w.length === 2 ? ['1', '2', '3', 'all'] : ['none', ...G().PRESETS.map((p) => p.id)]) : s0 === 'set' ? [...Object.keys(G().SPEC), ...Object.keys(G().LENS)].map((k) => `${k}=`) : [];
        return opts.filter((x) => x.toLowerCase().startsWith(last)).map((x) => ({ value: `${pre} ${x}` }));
      },
      run,
    });
  }
  // Ctrl/⌘+K
  function actions() {
    if (typeof AppUI === 'undefined' || !AppUI.addAction) return;
    const go = (fn) => () => ThreeLab.cmd({ show: true }).then(fn).catch((e) => toast(e.message, { type: 'error' }));
    AppUI.addAction('Lab: Grade… (LUTs, tone mapping, wheels, curves, film & lens)', go(() => LabGrade.open()));
    AppUI.addAction('Lab: Grade scopes (waveform, vectorscope, histogram)', go(() => LabGrade.open({ tab: 'scopes' })));
    AppUI.addAction('Lab: Import .cube LUTs…', go(() => LabGrade.pickCubes()));
    AppUI.addAction('Lab: Export the grade as a .cube LUT…', go(() => LabGrade.exportCubeDialog()));
  }
  function init() { register(); actions(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
