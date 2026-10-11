// Chat commands for 3D models in the Lab (tools/three-models.js): one command, `/model <verb> …` (it shares the name
// with the chat's own /model, which still answers "/model", "/model opus" and the like: this one runs when the first
// word is one of the verbs below) and `/3d` for the same thing. Area "Three.js Lab". Ctrl+K actions at the bottom.
(() => {
  const AREA = 'Three.js Lab';
  const T = () => ThreeModels;
  const words = (s) => String(s || '').trim().split(/\s+/).filter(Boolean);
  const opts = (list, qy) => { const s = String(qy || '').toLowerCase(); return list.map((x) => (typeof x === 'string' ? { value: x } : x)).filter((x) => String(x.value).toLowerCase().includes(s)).slice(0, 16); };
  const num = (re, s) => { const m = re.exec(s); return m ? Number(m[1]) : null; };
  const VERBS = {
    library: 'the model library (drag a card onto the preview)', add: 'add a model: a file, #n from the library, a name or "last"', replace: 'swap the model, keeping its sliders, keyframes and place',
    material: 'chrome · gold · glass · toon · clay · matte · wireframe · holographic · xray · normals · palette · original', look: 'a studio look (product, showroom, neon, golden, noir, hologram, clay, cinematic)',
    light: 'studio · three-point · rim · neon · golden · sunset · moody · flat', sky: 'an HDRI sky from Poly Haven by words, a file, or off', ground: 'none · shadow · mirror · floor · gloss · grid',
    clip: 'play an animation clip (name, next, speed 0.5, once, blend 1)', mixamo: 'add a Mixamo / other animation file to the model', move: 'a camera move as keyframes (orbit, dolly-in, crane, hero…) [at 2] [for 5 s]',
    turntable: 'turn on a turntable [speed]', still: 'stop turning', explode: 'explode view [amount]', fog: 'fog [amount]', bloom: 'bloom [amount]', dof: 'depth of field [amount]',
    react: 'pulse and glow on the kick (off: calm)', fit: 'fit it to the frame again', gizmo: 'move / rotate / scale it with the gizmo (W E R)', lite: 'lighter: simplify a heavy model [detail 0.4]',
    'look-at': 'the camera keeps looking at the model (off: straight ahead)', moves: 'remove the camera moves', info: 'what is loaded (clips, triangles)', help: 'every verb',
  };
  const verbOf = (args) => { const w = words(args)[0]?.toLowerCase(); return w && (VERBS[w] || w === 'models' || w === 'hdri') ? w : null; };
  const say = (r) => (typeof r === 'string' ? r : Array.isArray(r) ? r.join('\n') : r?.layer ? `**${r.layer}**${r.replaced ? ` replaces ${r.replaced}` : ''}${r.move ? ` · 🎥 ${r.move} ${r.from}–${r.to} s (keyframes on ${r.keyed.join(', ')})` : ''}${r.sky ? ` · 🌅 lit by ${r.sky}` : ''}${r.info?.clips?.length ? ` · clips: ${r.info.clips.slice(0, 8).join(', ')}` : ''}${r.look ? ` · ${r.look}` : ''}${r.changed?.length ? ` · ${r.changed.map((c) => (typeof c === 'string' ? c : c.key || c.label)).join(', ')}` : ''}` : 'Done.');

  async function run(args, ctx = {}) {
    const w = words(args); const v = (w.shift() || 'library').toLowerCase(); const rest = w.join(' '); const lc = rest.toLowerCase();
    const op = (a) => T().op(a, {});
    await ThreeLab.cmd({ show: true });
    switch (v) {
      case 'library': case 'models': await T().openLibrary(rest); return '';
      case 'add': return say(await T().add(rest || 'last'));
      case 'replace': if (!rest) { await T().openLibrary(); return 'Pick the new model (Shift+drag it onto the preview, or right-click → Replace).'; } return say(await T().add(rest, { replace: true }));
      case 'material': return say(await op({ op: 'material', preset: w[0] || 'original', tint: w.find((x) => /^#[0-9a-f]{6}$/i.test(x)) }));
      case 'look': return say(await op({ op: 'look', preset: rest || 'product' }));
      case 'light': return say(await op({ op: 'light', preset: rest || 'studio' }));
      case 'sky': case 'hdri': return say(await op({ op: 'sky', ...(/^([a-zA-Z]:[\\/]|\/)/.test(rest) ? { file: rest } : { query: rest || 'studio' }), lightOnly: /\blight only\b/i.test(rest) }));
      case 'ground': return say(await op({ op: 'ground', preset: rest || 'shadow' }));
      case 'clip': {
        const a = { op: 'clip' };
        if (/^next\b/i.test(lc)) a.next = true;
        const sp = num(/\bspeed\s+(-?[\d.]+)/i, lc); if (sp != null) a.speed = sp;
        const bl = num(/\bblend\s+([\d.]+)/i, lc); if (bl != null) a.blend = bl;
        if (/\bonce\b/i.test(lc)) a.loop = false; if (/\bloop\b/i.test(lc)) a.loop = true;
        if (/^(stop|pause)$/i.test(lc)) a.play = false;
        const name = rest.replace(/\b(next|speed\s+-?[\d.]+|blend\s+[\d.]+|once|loop)\b/gi, '').trim();
        if (name && !/^(stop|pause)$/i.test(name)) a.name = /^\d+$/.test(name) ? Number(name) - 1 : name;
        return say(await op(a));
      }
      case 'mixamo': return say(await T().addClip(rest || (await pickClipFile())));
      case 'move': {
        const at = num(/\bat\s+([\d.]+)/i, lc); const secs = num(/\bfor\s+([\d.]+)/i, lc);
        return say(await T().move(rest.replace(/\b(at|for)\s+[\d.]+\s*s?\b/gi, '').trim() || 'orbit', { at, secs }));
      }
      case 'moves': return `Camera moves removed from ${await T().clearMoves(null, {})}`;
      case 'turntable': return say(await op({ op: 'turntable', speed: /^off$/i.test(rest) ? 0 : rest ? Number(rest) || 1 : 1 }));
      case 'still': return say(await op({ op: 'set', values: { spin: 0, camSpin: 0 } }));
      case 'explode': return say(await op({ op: 'explode', amount: /^off$/i.test(rest) ? 0 : rest ? Number(rest) || 1 : 1 }));
      case 'fog': case 'bloom': case 'dof': return say(await op({ op: 'fx', [v]: /^off$/i.test(rest) ? 0 : rest ? Number(rest) || 0 : { fog: 0.3, bloom: 0.9, dof: 4 }[v] }));
      case 'react': return say(await op({ op: 'react', off: /^(off|calm|none)$/i.test(rest), pulse: num(/pulse\s+([\d.]+)/i, lc) ?? undefined, glow: num(/glow\s+([\d.]+)/i, lc) ?? undefined }));
      case 'fit': return say(await op({ op: 'fit' }));
      case 'gizmo': return `✥ Editing **${await T().gizmo(rest || 'translate')}**: W move · E rotate · R scale · Q world / local · F focus · Done (E) when you're happy.`;
      case 'lite': return say(await op({ op: 'lite', detail: rest ? Number(rest) : 0.4 }));
      case 'look-at': return say(await op({ op: 'aim', on: !/^off$/i.test(rest) }));
      case 'info': { const r = await op({ op: 'info' }); return r.models.length ? r.models.map((m) => `- **${m.layer}**: ${typeof m.loaded === 'object' ? `${m.loaded.tris.toLocaleString()} triangles, ${m.loaded.meshes} meshes, ${m.loaded.mb} MB${m.loaded.clips.length ? `, clips: ${m.loaded.clips.join(', ')}` : ''}${m.loaded.heavy ? ' · heavy: /model lite' : ''}` : m.loaded}`).join('\n') : 'No 3D model in this scene yet: `/model library` or `/model add <file>`.'; }
      case 'help': return Object.entries(VERBS).map(([k, d]) => `- \`/model ${k}\`: ${d}`).join('\n');
      default: throw new Error(`/model ${Object.keys(VERBS).join(' | ')}`);
    }
  }
  async function pickClipFile() {
    const ps = await window.hub.openDialog({ properties: ['openFile'], filters: [{ name: 'Animations (Mixamo FBX, GLB)', extensions: ['fbx', 'glb', 'gltf'] }] });
    const p = (Array.isArray(ps) ? ps : ps?.filePaths || [])[0];
    if (!p) throw new Error('No file picked');
    return p;
  }
  const complete = (a) => {
    const w = String(a || '').split(/\s+/);
    if (w.length <= 1) return opts(Object.entries(VERBS).map(([k, d]) => ({ value: k, hint: d })), w[0]);
    const v = w[0].toLowerCase(); const last = w[w.length - 1];
    const M = T();
    const lists = { material: M.MATERIALS, light: M.LIGHTS, ground: M.GROUNDS, move: Object.entries(M.MOVES).map(([k, m]) => ({ value: k, hint: m.desc })), look: Object.entries(M.LOOKS).map(([k, l]) => ({ value: k, hint: l.name })),
      sky: ['studio', 'sunset', 'night', 'forest', 'city', 'interior', 'off'], clip: ['next', ...([...M.infos.values()].pop()?.clips || []), 'once', 'speed 0.5'], gizmo: ['move', 'rotate', 'scale'], react: ['off', 'pulse 1', 'glow 1.5'], turntable: ['0.5', '1', '2', 'off'] };
    return lists[v] && w.length === 2 ? opts(lists[v], last) : [];
  };
  const DEF = { args: '<library|add|replace|material|look|light|sky|ground|clip|mixamo|move|turntable|explode|fog|bloom|dof|react|fit|gizmo|lite|info> …',
    desc: '3D models in the Lab: library, add / replace, materials, studio looks and lights, HDRI skies, ground, animation clips (Mixamo), camera moves as keyframes, turntable, explode, fog / bloom / DOF, kick reactions',
    keywords: '3d model glb gltf fbx obj meshy sketchfab mixamo spline poly haven hdri turntable explode chrome glass toon clay wireframe holographic camera orbit dolly crane hero reveal',
    examples: ['/model library', '/model add ~/Downloads/robot.glb', '/model material chrome', '/model move hero', '/model sky sunset', '/model clip Run speed 1.5', '/model look neon'],
    complete, run };
  const register = () => {
    if (typeof Commands === 'undefined') return;
    // the chat's /model (the engine model) stays the default; this one runs when the first word is a 3D verb
    Commands.register({ name: 'model', area: AREA, when: (ctx, args) => Boolean(verbOf(args)), whenLabel: 'with a 3D verb (library, add, material, move…)', ...DEF });
    if (!Commands.get('3d')) Commands.register({ name: '3d', area: AREA, ...DEF, run: (a, ctx) => run(a || 'library', ctx) });
  };
  if (document.readyState === 'loading') addEventListener('DOMContentLoaded', register); else register();

  const act = (fn) => async () => { try { await ThreeLab.cmd({ show: true }); const r = await fn(); if (typeof r === 'string' && r) toast(r, { timeout: 2600 }); } catch (err) { toast(err.message, { type: 'error' }); } };
  for (const [label, args] of [
    ['Lab: 3D model library', 'library'], ['Lab: Add a 3D model file…', null], ['Lab: 3D model: hero reveal camera move', 'move hero'], ['Lab: 3D model: orbit camera move', 'move orbit'],
    ['Lab: 3D model: fit to the frame', 'fit'], ['Lab: 3D model: move / rotate / scale (gizmo)', 'gizmo'], ['Lab: 3D model: turntable', 'turntable'], ['Lab: 3D model: what is loaded', 'info'],
  ]) AppUI.addAction?.(label, act(async () => (args ? run(args) : `${await (async () => { const ps = await window.hub.openDialog({ properties: ['openFile'], filters: [{ name: '3D models', extensions: ['glb', 'gltf', 'fbx', 'obj', 'stl', 'ply'] }] }); const p = (Array.isArray(ps) ? ps : ps?.filePaths || [])[0]; if (!p) return 'Nothing picked'; return (await T().add(p)).layer; })()}`)));
  window.ThreeModelsCmds = { run, VERBS };
})();
