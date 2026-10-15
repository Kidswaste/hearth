// ◇ Shader workbench (round 23, labshader): fragment-shader layers in the Lab, the hub side.
// - A ◇ layer is plain layer code calling shader(glsl, P, opts) (drawn by tools/three-sandbox.html "shader layers";
//   its text side, imports and starters: tools/three-shader-lib.js / three-shader-data.js).
// - Live compile: the Lab's auto-run re-runs the layer as you pause typing; an error is drawn on its line in the code
//   (a wavy underline and the message at the line's end, for every layer's errors, not only shaders') while the last
//   version that compiled keeps drawing.
// - Uniforms → sliders: before each run the layer's ◇ tweak() line is written from its `uniform … // hint` lines
//   (beforeRun, a hook in tools/three.js run()), so Save / Shuffle / looks / keyframes / ♪ links work on them.
// - The workbench card (/shader, the layer's right-click ◇ Shader ›, the preview's right-click): compile state,
//   each pass's channels, resolution, XY pads for vec2 uniforms, + a buffer pass, the starter library, imports.
// - Chat: /shader (new · list · import · channel · scale · pass · copy · check · help), /shadertoy (paste to import).
//   Directors: three_do shader { op } (list · add · glsl · channel · scale · info · check · help), lean: the guide
//   only mentions it in the on-demand help topics.
const LabShader = (() => {
  const SL = ShaderLib;
  const info = new Map(); // layer id → the page's last compile report (shader-info)
  const D = () => (typeof ThreeLab !== 'undefined' ? ThreeLab.director : null);
  const host = () => (typeof ThreeLab !== 'undefined' ? ThreeLab.shaderHost : null);
  const short = (s, n = 60) => { const t = String(s ?? '').replace(/\s+/g, ' ').trim(); return t.length > n ? `${t.slice(0, n - 1)}…` : t; };
  const passName = (p) => (p === 'image' ? 'Image' : p === 'common' ? 'Common' : `Buffer ${p}`);

  // ---------- hooks (tools/three.js) ----------
  function onBox(msg) {
    if (msg.type !== 'shader-info') return;
    info.set(msg.layer, msg);
    if (info.size > 64) info.delete(info.keys().next().value);
    Bench.status();
  }
  // before a run: each ◇ layer's sliders line follows its uniforms (the editor keeps your cursor and scroll)
  function beforeRun(layers, selL, editor) {
    attachLens();
    for (const L of layers || []) {
      if (!L?.code || !SL.isShader(L.code)) continue;
      let next;
      try { next = SL.syncCode(L.code); } catch (err) { console.warn('shader sliders', err); continue; }
      if (next === L.code) continue;
      if (L === selL && editor && editor.value === L.code) keepCursor(editor, L.code, next);
      L.code = next;
    }
  }
  function keepCursor(editor, a, b) {
    const ar = editor.area;
    let k = 0; while (k < a.length && a[k] === b[k]) k += 1;
    const d = b.length - a.length;
    const s0 = ar.selectionStart; const s1 = ar.selectionEnd; const top = ar.scrollTop; const left = ar.scrollLeft;
    const focused = document.activeElement === ar;
    editor.setValue(b);
    const mv = (x) => (x > k ? Math.max(k, x + d) : x);
    try { ar.setSelectionRange(mv(s0), mv(s1)); } catch { /* detached */ }
    ar.scrollTop = top; ar.scrollLeft = left; editor.syncScroll?.();
    if (focused) ar.focus({ preventScroll: true });
  }

  // ---------- inline errors in the code editor: a wavy line under the line, the message at its end ----------
  const lens = { ed: null, box: null, inner: null, sig: '' };
  function attachLens() {
    const h = host();
    if (!h?.editor || lens.ed === h.editor) return;
    const ed = h.editor;
    lens.ed = ed;
    const scroll = ed.root?.querySelector('.ce-scroll') || ed.area.parentElement;
    lens.inner = el('div', { class: 'sh-lens-in' });
    lens.box = el('div', { class: 'sh-lens', attrs: { 'aria-hidden': 'true' } }, lens.inner);
    scroll.append(lens.box);
    const orig = ed.setErrorLines.bind(ed);
    ed.setErrorLines = (lines) => { orig(lines); paintLens(); if (Bench.el) Bench.paint(); }; // (a run, an error, another layer selected)
    ed.area.addEventListener('scroll', () => { const tf = `translate(${-ed.area.scrollLeft}px, ${-ed.area.scrollTop}px)`; if (lens.inner.style.transform !== tf) lens.inner.style.transform = tf; }, { passive: true });
    paintLens();
  }
  function paintLens() {
    const h = host(); const ed = lens.ed;
    if (!h || !ed || !lens.inner) return;
    const sel = h.selId();
    const errs = (h.errors() || []).filter((e) => e.line && (!e.layer || e.layer === sel)).slice(0, 8);
    const lines = ed.value.split('\n');
    const sig = JSON.stringify(errs.map((e) => [e.line, e.message, (lines[e.line - 1] || '').length]));
    if (sig === lens.sig) return;
    lens.sig = sig;
    if (!errs.length) { lens.inner.replaceChildren(); return; }
    const cs = getComputedStyle(ed.area);
    const lh = parseFloat(cs.lineHeight) || 19; const pt = parseFloat(cs.paddingTop) || 0; const pl = parseFloat(cs.paddingLeft) || 0;
    lens.inner.style.font = cs.font;
    const seen = new Set();
    lens.inner.replaceChildren(...errs.filter((e) => !seen.has(e.line) && seen.add(e.line)).map((e) => {
      const txt = lines[e.line - 1] || '';
      const lead = txt.length - txt.trimStart().length; const len = Math.max(3, Math.min(160, txt.trimEnd().length - lead));
      return el('div', { class: 'sh-lens-row', style: { top: `${pt + (e.line - 1) * lh}px`, left: `${pl}px`, height: `${lh}px` } },
        el('span', { class: 'sh-squig', style: { marginLeft: `${lead}ch`, width: `${len}ch` } }),
        el('span', { class: 'sh-lens-msg', style: { left: `${lead + len + 2}ch` }, text: short(String(e.message).replace(/^GLSL \((\w+(?: \w)?)\): /, '$1 · '), 90) }));
    }));
    lens.inner.style.transform = `translate(${-ed.area.scrollLeft}px, ${-ed.area.scrollTop}px)`;
  }

  // ---------- reaching a layer (the scene on screen, or a chat's scene through the director's tools) ----------
  async function call(tool, args, ctx = {}) {
    const r = await HubBridge.call(tool, args, { chatId: ctx.chatId || null });
    if (!r || r.ok === false) throw new Error(r?.error || `${tool} failed`);
    return r.value;
  }
  const onScreen = (ctx = {}) => { if (!ctx.chatId || typeof ChatScenes === 'undefined') return true; const r = ChatScenes.routeThree('three_layers', ctx.chatId); return !r || r.sketchId === ThreeLab.scenes?.currentId(); };
  const isShaderRow = (L) => /^shader/.test(L.kind || '');
  async function target(ref, ctx = {}, { any = false } = {}) {
    const v = await call('three_layers', { report: 'full' }, ctx);
    const all = v.layers || [];
    const pool = any ? all : all.filter(isShaderRow);
    if (!pool.length) throw new Error('No ◇ shader layer in this scene: /shader new <starter> or /shader import.');
    if (ref != null && ref !== '' && ref !== 'selected') {
      const r = String(ref).toLowerCase().replace(/^◇\s*/, '');
      const hit = pool.find((L) => L.id === ref || L.name.toLowerCase() === String(ref).toLowerCase() || L.name.toLowerCase().replace(/^◇\s*/, '') === r) || pool.find((L) => L.name.toLowerCase().includes(r)) || (/^\d+$/.test(String(ref)) ? all[Number(ref) - 1] : null);
      if (!hit) throw new Error(`No shader layer "${ref}". Shader layers: ${pool.map((L) => L.name).join(', ')}`);
      return hit;
    }
    return pool.find((L) => L.selected) || pool[pool.length - 1];
  }
  async function codeOf(L, ctx = {}) {
    if (onScreen(ctx) && D()) return D().codeOf(L.id).code;
    const v = await call('three_read_code', { layer: L.id, from: 1, to: 4000, force: true }, ctx);
    const txt = typeof v === 'string' ? v : String(v.code || '');
    return txt.split('\n').filter((ln) => !/^── /.test(ln)).map((ln) => ln.replace(/^\s*\d+\| /, '')).join('\n');
  }
  // the page's compile state of a layer: its last report, and the errors the Lab holds for it
  async function stateOf(L, ctx = {}) {
    const errs = (D() && onScreen(ctx) ? D().report().errors : []).filter((e) => e.layer === L.name);
    const i = info.get(L.id);
    return { layer: L.name, compiled: errs.length ? `no: ${errs.length} error(s)${i?.fallback ? ', the last good version is drawing' : ''}` : 'yes', ...(errs.length ? { errors: errs.map((e) => `line ${e.line ?? '?'}: ${e.message}`) } : {}), ...(i ? { passes: i.passes.map(passName), channels: i.channels, sliders: i.uniforms, msPerFrame: Math.round(i.ms * 100) / 100 } : {}) };
  }
  async function apply(L, code, ctx = {}, wait = 1.2) {
    await call('three_update_layer', { layer: L.id, code, wait }, ctx);
    return stateOf(L, ctx);
  }
  async function addLayer(code, name, ctx = {}, wait = 1.5) {
    const out = await call('three_add_layer', { name, code, wait }, ctx);
    const L = { id: null, name: out.added || name };
    const v = await call('three_layers', { report: 'full' }, ctx).catch(() => null);
    const row = v?.layers?.find((x) => x.name === L.name);
    return row ? stateOf(row, ctx) : { layer: L.name };
  }
  const uniqueName = (n) => `◇ ${String(n || 'Shader').replace(/^◇\s*/, '').slice(0, 36)}`;

  // ---------- the operations (chat commands, the director's tool, the workbench) ----------
  async function addStarter(q0, { name = null, ctx = {}, replace = null } = {}) {
    const st = SL.starter(q0);
    if (!st) throw new Error(`No starter "${q0}". /shader list shows them (${SL.STARTERS().length}).`);
    const code = SL.starterCode(st, name || st.name);
    if (replace) { const L = await target(replace === true ? null : replace, ctx, { any: true }); return { ...(await apply(L, code, ctx)), from: st.name }; }
    return { ...(await addLayer(code, uniqueName(name || st.name), ctx)), from: st.name };
  }
  async function importAs(text, { name = null, ctx = {}, replace = null } = {}) {
    const r = SL.importText(text, name);
    const code = SL.layerCode({ ...r.spec, name: r.spec.name });
    if (replace) { const L = await target(replace === true ? null : replace, ctx, { any: true }); return { ...(await apply(L, code, ctx)), imported: r.kind, notes: r.notes }; }
    return { ...(await addLayer(code, uniqueName(r.spec.name), ctx)), imported: r.kind, notes: r.notes };
  }
  // raw GLSL from the director: a fragment shader as a new layer (sliders from its uniform hints)
  async function addGlsl(glsl, { name = null, ctx = {}, buffers = null, channels = null, scale = null } = {}) {
    const kind = SL.detect(glsl);
    if (kind === 'isf' || kind === 'shadertoy-json' || (!buffers && /^\s*\/\/+\s*(buffer\s*[a-d]|common|image)\s*$/im.test(glsl))) return importAs(glsl, { name, ctx });
    const spec = { name: name || 'Shader', image: glsl, buffers: buffers || undefined, channels: channels || SL.channelsFor(glsl, 'image', Object.keys(buffers || {})), scale: scale || 1 };
    return addLayer(SL.layerCode(spec), uniqueName(name || 'Shader'), ctx);
  }
  async function setGlsl(ref, pass, glsl, ctx = {}) {
    const L = await target(ref, ctx);
    return apply(L, SL.setPass(await codeOf(L, ctx), pass || 'image', glsl), ctx);
  }
  const SRC_OK = (s) => SL.SOURCES.includes(s) || /^(layer|ref):\S/.test(s) || /^[A-Za-z]\w*$/.test(s);
  async function setChannel(ref, pass, ch, src, ctx = {}) {
    const c = /^(?:ch|ichannel)?\s*([0-3])$/i.exec(String(ch).trim());
    const key = c ? `iChannel${c[1]}` : String(ch).trim();
    const s = String(src || '').trim();
    if (!SRC_OK(s)) throw new Error(`Source: ${SL.SOURCES.join(' | ')} | layer:<name> | ref:<key>`);
    const L = await target(ref, ctx);
    const p = !pass || /^image$/i.test(pass) ? 'image' : String(pass).replace(/^buffer\s*/i, '').toUpperCase();
    const code = SL.setOpts(await codeOf(L, ctx), (o) => {
      if (p === 'image') o[key] = s;
      else { const b = o.buffers?.[p]; if (!b) throw new Error(`No Buffer ${p} in "${L.name}".`); if (b.$ref) o.buffers[p] = { code: b, [key]: s }; else b[key] = s; }
    });
    return { ...(await apply(L, code, ctx)), set: `${passName(p)} ${key} = ${s}` };
  }
  async function setScale(ref, v, ctx = {}) {
    const x = String(v).trim().endsWith('%') ? parseFloat(v) / 100 : Number(v);
    if (!(x >= 0.25 && x <= 1)) throw new Error('Resolution: 0.25 to 1 (or 25%–100%).');
    const L = await target(ref, ctx);
    const code = SL.setOpts(await codeOf(L, ctx), (o) => { if (x === 1) delete o.scale; else o.scale = Math.round(x * 100) / 100; });
    return { ...(await apply(L, code, ctx)), scale: x };
  }
  async function setAlpha(ref, on, ctx = {}) {
    const L = await target(ref, ctx);
    const code = SL.setOpts(await codeOf(L, ctx), (o) => { if (on) o.alpha = true; else delete o.alpha; });
    return { ...(await apply(L, code, ctx)), alpha: Boolean(on) };
  }
  async function addPass(ref, letter = null, ctx = {}) {
    const L = await target(ref, ctx);
    const code0 = await codeOf(L, ctx);
    const have = Object.keys(SL.parseLayer(code0)?.buffers || {});
    const k = String(letter || ['A', 'B', 'C', 'D'].find((x) => !have.includes(x)) || '').toUpperCase();
    if (!/^[A-D]$/.test(k) || have.includes(k)) throw new Error(have.length >= 4 ? 'This layer already has Buffers A–D.' : `Buffer ${k} exists.`);
    const glsl = `// Buffer ${k}: drawn before the image each frame; iChannel0 = its own last frame (feedback)
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 uv = fragCoord / iResolution.xy;
  vec3 prev = texture(iChannel0, uv).rgb * 0.97;
  float dot0 = smoothstep(0.03, 0.0, length(uv - 0.5 - 0.3 * vec2(cos(iTime), sin(iTime * 1.3))));
  fragColor = vec4(prev + dot0, 1.0);
}`;
    return { ...(await apply(L, SL.setPass(code0, k, glsl), ctx)), added: `Buffer ${k} (read it in the image with a channel set to '${k}')` };
  }
  async function infoOf(ref, ctx = {}) {
    const L = await target(ref, ctx);
    const P = SL.parseLayer(await codeOf(L, ctx));
    const st = await stateOf(L, ctx);
    return { ...st, passes: [...Object.keys(P?.buffers || {}).map(passName), 'Image'], channels: P?.channels, scale: P?.scale || 1, alpha: P?.alpha || false, isf: P?.isf || false, common: Boolean(P?.common) };
  }
  // compiles GLSL in the preview page without making a layer → { ok, errors: [{ pass, line, message }] }
  async function check(spec) {
    const d = D();
    if (!d) throw new Error('Open the Lab first.');
    const r = await d.evalInSketch(`return globalThis.shader.check(${JSON.stringify(typeof spec === 'string' ? { image: spec } : spec)})`);
    if (!r?.ok) throw new Error(r?.error || 'The preview did not answer');
    return r.value;
  }
  function listText(filter = '') {
    const w = String(filter).toLowerCase().trim();
    const L = SL.STARTERS().filter((s) => !w || `${s.id} ${s.name} ${s.cat} ${s.desc}`.toLowerCase().includes(w));
    const cats = [...new Set(L.map((s) => s.cat))];
    return cats.map((c) => `**${c}**\n${L.filter((s) => s.cat === c).map((s) => `- \`/shader new ${s.id}\` ${s.name}: ${s.desc}`).join('\n')}`).join('\n') || 'No starter matches.';
  }
  async function copyOut(ref, ctx = {}) {
    const L = await target(ref, ctx);
    const txt = SL.toShadertoy(await codeOf(L, ctx));
    try { await navigator.clipboard.writeText(txt); } catch { /* no clipboard: the text comes back */ }
    return txt;
  }

  // ---------- the workbench card ----------
  const Bench = (() => {
    let card = null; let layerId = null; let built = '';
    const SCALES = [[1, '100%'], [0.75, '75%'], [0.5, '50%'], [0.33, '33%'], [0.25, '25%']];
    const quick = (p, ok) => p.then((r) => { if (ok) toast(typeof ok === 'function' ? ok(r) : ok, { timeout: 1800 }); return r; }).catch((e) => toast(e.message, { type: 'error', timeout: 5000 }));
    function sel() { const d = D(); if (!d) return null; const v = d.layers(); return (v.layers || []).find((L) => L.selected) || null; }
    function open(id = null) {
      const d = D();
      if (!d) { ThreeLab.cmd().then(() => open(id)).catch((e) => toast(e.message, { type: 'error' })); return; }
      if (id) { try { d.selectLayer(id); } catch { /* gone */ } }
      if (!card) {
        card = el('div', { class: 'sh-bench', attrs: { role: 'dialog', 'aria-label': 'Shader workbench' } });
        document.body.append(card);
        place();
      }
      attachLens();
      built = '';
      paint();
    }
    function place() {
      const r = ThreeLab.scenes?.previewHost?.()?.getBoundingClientRect?.();
      if (!card) return;
      if (r && r.width) { card.style.top = `${Math.max(8, r.top + 8)}px`; card.style.left = `${Math.max(8, r.right - 316)}px`; }
    }
    function close() { card?.remove(); card = null; layerId = null; built = ''; }
    // the card's content for the selected layer (built again only when the layer, its passes or channels change)
    function paint() {
      if (!card) return;
      const d = D(); const L = sel();
      if (!d || !L) { close(); return; }
      layerId = L.id;
      const code = d.codeOf(L.id).code;
      const P = SL.isShader(code) ? SL.parseLayer(code) : null;
      const pads = P ? SL.controlsOf(SL.parseUniforms([P.common, P.image, ...Object.values(P.buffers).map((b) => b.code)])).filter((c) => c.pad === 'x') : [];
      const sig = JSON.stringify([L.id, L.name, P && [Object.keys(P.buffers), P.channels, P.scale, P.alpha, pads.map((c) => c.of)]]);
      if (sig === built) { status(); return; }
      built = sig;
      const head = el('div', { class: 'sh-head' }, el('b', { text: `◇ ${P ? short(L.name.replace(/^◇\s*/, ''), 26) : 'Shader workbench'}` }), el('span', { class: 'spacer' }),
        el('button', { type: 'button', class: 'ghost small', text: '?', title: 'Built-ins, slider hints, channels', on: { click: () => helpCard() } }),
        el('button', { type: 'button', class: 'ghost small', text: '×', title: 'Close', on: { click: close } }));
      const st = el('div', { class: 'sh-status' });
      const body = [];
      if (!P) {
        body.push(el('p', { class: 'hint', text: `"${short(L.name, 30)}" isn't a shader layer.` }));
      } else {
        const passes = [...Object.keys(P.buffers), 'image'];
        for (const p of passes) {
          const txt = p === 'image' ? P.image : P.buffers[p].code;
          const used = [...new Set([...`${P.common}\n${txt}`.matchAll(/\biChannel([0-3])\b/g)].map((m) => Number(m[1])))].sort();
          const chans = P.channels[p] || {};
          const others = (d.layers().layers || []).filter((x) => x.id !== L.id).map((x) => `layer:${x.name}`);
          const row = el('div', { class: 'sh-pass' }, el('span', { class: 'sh-pname', text: passName(p) }),
            ...(used.length ? used.map((n) => {
              const k = `iChannel${n}`; const cur = chans[k] || '';
              const opts = [...new Set([...SL.SOURCES.filter((s) => s !== p), ...others, ...(cur && !SL.SOURCES.includes(cur) ? [cur] : [])])];
              const s = el('select', { class: 'sh-chan', title: `${k}: what it reads`, on: { change: () => quick(setChannel(L.id, p, k, s.value), `${passName(p)} ${k} → ${s.value}`) } },
                !cur ? el('option', { value: '', text: '(default)' }) : null,
                ...opts.map((o) => el('option', { value: o, text: `ch${n}: ${o}`, title: SL.SOURCE_HINT[o] || o, selected: o === cur })));
              return s;
            }) : [el('span', { class: 'hint', text: 'no channels' })]));
          body.push(row);
        }
        const sc = el('select', { class: 'sh-scale', title: 'Resolution of this layer in the preview (renders and exports stay at full pixels)', on: { change: () => quick(setScale(L.id, sc.value), `Resolution ${Math.round(sc.value * 100)}%`) } },
          ...SCALES.map(([v, t]) => el('option', { value: v, text: t, selected: Math.abs((P.scale || 1) - v) < 0.02 })));
        body.push(el('div', { class: 'sh-row' }, el('span', { class: 'hint', text: 'Resolution' }), sc,
          el('label', { class: 'sh-check', title: 'Keep the shader\'s own alpha (see-through where it says so); off: opaque' }, el('input', { type: 'checkbox', checked: P.alpha, on: { change: (e) => quick(setAlpha(L.id, e.target.checked)) } }), 'Alpha'),
          Object.keys(P.buffers).length < 4 ? el('button', { type: 'button', class: 'ghost small', text: '+ Buffer', title: 'A pass drawn before the image (feedback, blur, simulation)', on: { click: () => quick(addPass(L.id), (r) => r.added) } }) : null));
        for (const c of pads) body.push(pad(L, c));
      }
      const foot = el('div', { class: 'sh-foot' },
        el('button', { type: 'button', class: 'ghost small', text: '◇ Library…', title: `${SL.STARTERS().length} starter shaders`, on: { click: () => library() } }),
        el('button', { type: 'button', class: 'ghost small', text: 'Import…', title: 'Paste a Shadertoy or ISF shader', on: { click: () => importDialog() } }),
        P ? el('button', { type: 'button', class: 'ghost small', text: 'Copy for Shadertoy', on: { click: () => quick(copyOut(L.id), 'Copied for Shadertoy (tabs with headers)') } }) : null);
      card.replaceChildren(head, st, ...body, foot);
      status();
    }
    // the compile line (cheap: text compared before it's written)
    function status() {
      if (!card) return;
      const st = card.querySelector('.sh-status');
      if (!st) return;
      const h = host(); const i = info.get(layerId);
      const errs = (h?.errors() || []).filter((e) => e.layer === layerId);
      const t = errs.length ? `✗ ${errs.length} error${errs.length > 1 ? 's' : ''}${i?.fallback ? ' · the last good version is drawing' : ''} · line ${errs[0].line ?? '?'}: ${short(errs[0].message, 70)}`
        : i ? `✓ ${i.passes.length} pass${i.passes.length > 1 ? 'es' : ''} · ${i.uniforms.length} slider uniform${i.uniforms.length === 1 ? '' : 's'}${i.scale < 1 ? ` · ${Math.round(i.scale * 100)}%` : ''}` : '';
      if (st.textContent !== t) st.textContent = t;
      st.classList.toggle('bad', errs.length > 0);
    }
    // an XY pad for a vec2 uniform: drags its two sliders (rAF-throttled, unsaved like any slider move)
    function pad(L, c) {
      const ky = c.key.replace(/_x$/, '_y');
      const box = el('div', { class: 'sh-pad', title: `${c.of}: drag (Save keeps it)` });
      const dotEl = el('div', { class: 'sh-dot' });
      box.append(dotEl);
      const { min, max } = c.spec;
      const val = () => { try { const s = D().sliders(L.id).sliders; const g = (k) => s.find((x) => x.key === k)?.value; return [g(c.key) ?? c.spec.value, g(ky) ?? c.spec.value]; } catch { return [c.spec.value, c.spec.value]; } };
      const show = ([x, y]) => { dotEl.style.transform = `translate(${((x - min) / (max - min || 1)) * 112}px, ${(1 - (y - min) / (max - min || 1)) * 72}px)`; };
      show(val());
      let raf = 0; let pend = null;
      const send = () => { raf = 0; if (!pend) return; const p = pend; pend = null; try { D().sliders(L.id, { [c.key]: p[0], [ky]: p[1] }); } catch (e) { toast(e.message, { type: 'error' }); } };
      const at = (e) => { const r = box.getBoundingClientRect(); const u = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)); const v = Math.max(0, Math.min(1, 1 - (e.clientY - r.top) / r.height)); const p = [min + u * (max - min), min + v * (max - min)].map((x) => Math.round(x * 1000) / 1000); show(p); pend = p; if (!raf) raf = requestAnimationFrame(send); };
      box.addEventListener('pointerdown', (e) => { box.setPointerCapture(e.pointerId); at(e); });
      box.addEventListener('pointermove', (e) => { if (box.hasPointerCapture(e.pointerId)) at(e); });
      return el('div', { class: 'sh-row' }, el('span', { class: 'hint', text: c.spec.label.replace(/ x$/, '') }), box);
    }
    function helpCard() { Modal.alert('◇ Shader layers', SL.HELP); }
    return { open, close, paint, status, place, get el() { return card; } };
  })();

  // ---------- the starter library: one searchable list ----------
  function overlay(title, cls) {
    const shade = el('div', { class: 'sh-shade', on: { pointerdown: (e) => { if (e.target === shade) shade.remove(); } } });
    const box = el('div', { class: `sh-dlg ${cls || ''}`, attrs: { role: 'dialog', 'aria-label': title } });
    shade.append(box);
    shade.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); shade.remove(); } });
    document.body.append(shade);
    return { shade, box, close: () => shade.remove() };
  }
  function library({ replace = false } = {}) {
    const o = overlay('Shader library', 'sh-lib');
    const input = el('input', { type: 'search', class: 'sh-search', placeholder: `Search ${SL.STARTERS().length} shaders (noise, tunnel, feedback, kick…)`, attrs: { 'aria-label': 'Search shaders' } });
    const list = el('div', { class: 'sh-list', attrs: { role: 'listbox' } });
    const foot = el('div', { class: 'hint', text: 'Enter adds a new layer · Shift+Enter replaces the selected layer · Esc closes' });
    o.box.append(el('div', { class: 'sh-head' }, el('b', { text: '◇ Shader library' })), input, list, foot);
    let rows = []; let at = 0;
    const go = (st, rep) => { o.close(); addStarter(st.id, { replace: rep || replace ? true : null }).then((r) => toast(`◇ ${st.name}${r.compiled && r.compiled !== 'yes' ? ` · ${r.compiled}` : ''}`, { timeout: 1800 })).catch((e) => toast(e.message, { type: 'error' })); };
    const draw = () => {
      const w = input.value.toLowerCase().trim();
      rows = SL.STARTERS().filter((s) => !w || `${s.name} ${s.cat} ${s.desc} ${s.id}`.toLowerCase().includes(w));
      at = Math.min(at, Math.max(0, rows.length - 1));
      list.replaceChildren(...rows.map((s, i) => el('button', { type: 'button', class: `sh-item${i === at ? ' on' : ''}`, attrs: { role: 'option' }, on: { click: (e) => go(s, e.shiftKey) } },
        el('b', { text: s.name }), el('span', { class: 'sh-cat', text: s.cat }), el('span', { class: 'hint', text: s.desc }))));
    };
    input.addEventListener('input', () => { at = 0; draw(); });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); at = Math.max(0, Math.min(rows.length - 1, at + (e.key === 'ArrowDown' ? 1 : -1))); draw(); list.children[at]?.scrollIntoView({ block: 'nearest' }); }
      if (e.key === 'Enter' && rows[at]) { e.preventDefault(); go(rows[at], e.shiftKey); }
    });
    draw();
    input.focus();
    return o;
  }
  // ---------- import: paste a Shadertoy / ISF shader ----------
  function importDialog(text = '') {
    const o = overlay('Import a shader', 'sh-imp');
    const area = el('textarea', { class: 'sh-paste', spellcheck: false, placeholder: 'Paste a Shadertoy shader (the Image tab, several tabs under "// Buffer A" / "// Image" lines, or the JSON export) or an ISF .fs shader' });
    area.value = text;
    const name = el('input', { type: 'text', class: 'sh-name', placeholder: 'Layer name (optional)' });
    const notes = el('div', { class: 'hint sh-notes' });
    const addB = el('button', { type: 'button', class: 'primary small', text: 'Add as a layer' });
    const repB = el('button', { type: 'button', class: 'ghost small', text: 'Replace the selected layer' });
    const read = () => { try { const r = SL.importText(area.value, name.value.trim() || null); notes.textContent = `${r.kind === 'isf' ? 'ISF' : 'Shadertoy'} · ${r.notes.join(' · ')}`; addB.disabled = false; repB.disabled = false; return r; } catch (e) { notes.textContent = area.value.trim() ? e.message : ''; addB.disabled = true; repB.disabled = true; return null; } };
    let t = 0;
    area.addEventListener('input', () => { clearTimeout(t); t = setTimeout(read, 250); });
    const go = (replace) => { if (!read()) return; o.close(); importAs(area.value, { name: name.value.trim() || null, replace: replace ? true : null }).then((r) => toast(`◇ Imported (${r.imported})${r.compiled && r.compiled !== 'yes' ? ` · ${r.compiled}` : ''}`, { timeout: 2200 })).catch((e) => toast(e.message, { type: 'error', timeout: 6000 })); };
    addB.addEventListener('click', () => go(false)); repB.addEventListener('click', () => go(true));
    o.box.append(el('div', { class: 'sh-head' }, el('b', { text: '◇ Import a shader' })), area, name, notes, el('div', { class: 'sh-foot' }, addB, repB));
    read();
    area.focus();
    return o;
  }

  // ---------- menus ----------
  function layerMenu(L) {
    if (!L?.code || !SL.isShader(L.code)) return [];
    const q2 = (p, ok) => () => p().then(() => ok && toast(ok, { timeout: 1500 })).catch((e) => toast(e.message, { type: 'error' }));
    const cur = SL.parseLayer(L.code)?.scale || 1;
    return [['◇ Shader', 'workbench, resolution, passes', [
      ['Workbench…', 'channels, resolution, XY pads', () => Bench.open(L.id)],
      ['Resolution', `${Math.round(cur * 100)}% in the preview`, [[1, '100%'], [0.5, '50%'], [0.33, '33%'], [0.25, '25%']].map(([v, t]) => [t, '', q2(() => setScale(L.id, v)), Math.abs(cur - v) < 0.02])],
      ['+ Buffer pass', 'drawn before the image (feedback)', q2(() => addPass(L.id), 'Buffer added')],
      ['Copy for Shadertoy', 'tabs with headers', q2(() => copyOut(L.id), 'Copied')],
      ['Replace with a starter…', '', () => library({ replace: true })],
    ]]];
  }
  function previewItem() {
    return { label: '◇ Shaders', hint: 'GLSL layers', items: () => [
      { label: '◇ New shader layer…', hint: `${SL.STARTERS().length} starters`, action: () => library() },
      { label: 'Import Shadertoy / ISF…', hint: 'paste', action: () => importDialog() },
      { label: 'Shader workbench', hint: 'code, uniforms, channels', action: () => Bench.open() },
    ] };
  }

  // ---------- the director's tool: three_do shader { op } ----------
  const OPS = 'list {filter} | add {starter | code (GLSL, Shadertoy or ISF text), name, buffers: {A: {code, iChannel0}}, channels} | glsl {layer, pass: image|A|B|common, code} | channel {layer, pass, channel: 0-3, source} | scale {layer, value 0.25-1} | alpha {layer, on} | buffer {layer} | info {layer} | check {code} | help';
  async function op(a = {}, ctx = {}) {
    const o = String(a.op || 'help');
    if (o === 'help') return SL.HELP;
    if (o === 'list') return SL.STARTERS().filter((s) => !a.filter || `${s.id} ${s.name} ${s.cat} ${s.desc}`.toLowerCase().includes(String(a.filter).toLowerCase())).map((s) => `${s.id}: ${s.name} (${s.cat}) ${s.desc}`).join('\n');
    if (o === 'add') {
      if (a.starter || a.preset) return addStarter(a.starter || a.preset, { name: a.name, ctx });
      if (!a.code) throw new Error('add: { starter } or { code }');
      return addGlsl(String(a.code), { name: a.name, ctx, buffers: a.buffers || null, channels: a.channels || null, scale: a.scale || null });
    }
    if (o === 'import') return importAs(String(a.code || a.text || ''), { name: a.name, ctx, replace: a.replace || null });
    if (o === 'glsl' || o === 'set_glsl' || o === 'edit') return setGlsl(a.layer, a.pass, String(a.code || ''), ctx);
    if (o === 'channel') return setChannel(a.layer, a.pass, a.channel ?? 0, a.source, ctx);
    if (o === 'scale') return setScale(a.layer, a.value ?? a.scale, ctx);
    if (o === 'alpha') return setAlpha(a.layer, a.on !== false, ctx);
    if (o === 'buffer') return addPass(a.layer, a.name || null, ctx);
    if (o === 'info') return infoOf(a.layer, ctx);
    if (o === 'check') return check(a.code ? { image: String(a.code), buffers: a.buffers } : a.spec);
    if (o === 'copy') return copyOut(a.layer, ctx);
    throw new Error(`shader ops: ${OPS}`);
  }
  if (typeof HubBridge !== 'undefined') HubBridge.register(['three_shader'], async (tool, args, ctx) => {
    try { return { ok: true, value: await op(args, ctx) }; } catch (err) { return { ok: false, error: err.message }; }
  });

  // ---------- the starters in the FX picker / /template / three_add_layer {template} ----------
  if (typeof ThreeLayers !== 'undefined') {
    for (const st of SL.STARTERS()) {
      const id = `shader-${st.id}`;
      if (ThreeLayers.TEMPLATES.some((t) => t.id === id)) continue;
      ThreeLayers.TEMPLATES.push({ id, name: `◇ ${st.name}`, cat: 'Shaders', desc: st.desc, tags: `shader glsl shadertoy ${st.cat.toLowerCase()}`, get code() { return SL.starterCode(st); } });
    }
  }

  // ---------- chat commands ----------
  const fmt = (r) => (typeof r === 'string' ? r : Object.entries(r).map(([k, v]) => `- ${k}: ${Array.isArray(v) ? v.join(' · ') : v && typeof v === 'object' ? JSON.stringify(v) : v}`).join('\n'));
  function registerCommands() {
    if (typeof Commands === 'undefined') return;
    const ctxOf = () => ({}); // (the scene on screen)
    if (!Commands.get('shader')) Commands.register({
      name: 'shader', area: 'Three.js Lab', args: '[new <starter> | list [word] | import | channel <0-3> <source> [pass] | scale <25-100%> | buffer | glsl <pass> | copy | check | help]',
      desc: '◇ Shader workbench: fragment-shader layers (GLSL, Shadertoy, ISF) with live compile, sliders from uniforms, music, feedback passes',
      examples: ['/shader', '/shader new tunnel', '/shader list feedback', '/shader import', '/shader channel 0 audio', '/shader channel 1 layer:Orb', '/shader scale 50%', '/shader buffer', '/shader copy'],
      keywords: 'glsl shadertoy isf fragment shader layer uniforms raymarch plasma feedback multipass buffer channel',
      complete: (a) => {
        const w = a.trim().toLowerCase();
        if (/^new\b/.test(w)) { const q2 = w.slice(3).trim(); return SL.STARTERS().filter((s) => !q2 || `${s.id} ${s.name}`.toLowerCase().includes(q2)).slice(0, 40).map((s) => ({ value: `new ${s.id}`, hint: `${s.name} · ${s.cat}` })); }
        if (/^channel\b/.test(w)) return [0, 1, 2, 3].flatMap((n) => SL.SOURCES.map((s) => ({ value: `channel ${n} ${s}`, hint: SL.SOURCE_HINT[s] }))).filter((x) => x.value.startsWith(w)).slice(0, 30);
        if (/^scale\b/.test(w)) return ['100%', '75%', '50%', '33%', '25%'].map((s) => ({ value: `scale ${s}` }));
        return [{ value: 'new ', hint: `a starter (${SL.STARTERS().length})` }, { value: 'list', hint: 'the starter library' }, { value: 'import', hint: 'paste Shadertoy / ISF' }, { value: 'channel 0 ', hint: 'what iChannel0 reads' }, { value: 'scale 50%', hint: 'resolution in the preview' }, { value: 'buffer', hint: '+ a feedback pass' }, { value: 'copy', hint: 'as Shadertoy text' }, { value: 'check', hint: 'compile state' }, { value: 'help', hint: 'built-ins, hints' }]
          .filter((x) => !w || x.value.startsWith(w));
      },
      run: async (args, ctx) => {
        const w = String(args || '').trim();
        const c = ctxOf(ctx);
        const [verb, ...rest] = w.split(/\s+/); const tail = rest.join(' ');
        const v = (verb || '').toLowerCase();
        if (!v || v === 'open' || v === 'bench') { await ThreeLab.cmd(); Bench.open(); return null; }
        if (v === 'help') return `\`\`\`\n${SL.HELP}\n\`\`\``;
        if (v === 'list') return listText(tail);
        if (v === 'new' || v === 'add') {
          await ThreeLab.cmd();
          if (!tail) { library(); return null; }
          const r = await addStarter(tail, { ctx: c });
          return `◇ Added "${r.layer}" (${r.from}) · compiled: ${r.compiled}`;
        }
        if (v === 'import' || v === 'paste') { await ThreeLab.cmd(); if (!tail) { importDialog(); return null; } const r = await importAs(tail, { ctx: c }); return `◇ Imported "${r.layer}" (${r.imported}): ${r.notes.join(' · ')} · compiled: ${r.compiled}`; }
        if (v === 'channel' || v === 'ch') { const [n, src, pass] = rest; const r = await setChannel(null, pass || 'image', n, src, c); return `◇ ${r.set} · compiled: ${r.compiled}`; }
        if (v === 'scale' || v === 'res' || v === 'resolution') { const r = await setScale(null, tail, c); return `◇ "${r.layer}" at ${Math.round(r.scale * 100)}% in the preview`; }
        if (v === 'alpha') { const r = await setAlpha(null, !/^off|no|false$/i.test(tail), c); return `◇ Alpha ${r.alpha ? 'kept' : 'off (opaque)'}`; }
        if (v === 'buffer' || v === 'pass') { const r = await addPass(null, tail || null, c); return `◇ ${r.added}`; }
        if (v === 'glsl' || v === 'edit') { await ThreeLab.cmd(); const L = await target(null, c); const P = SL.parseLayer(await codeOf(L, c)); const p = (tail || 'image').toLowerCase(); const span = p === 'image' ? P.imageSpan : p === 'common' ? P.commonSpan : P.buffers[p.toUpperCase()]?.span; if (span && host()) { const code = host().editor.value; const line = code.slice(0, span.start).split('\n').length + 1; host().editor.area.focus(); const pos = code.split('\n').slice(0, line - 1).join('\n').length + 1; host().editor.area.setSelectionRange(pos, pos); host().editor.area.scrollTop = Math.max(0, (line - 4) * 19); host().editor.syncScroll?.(); } return null; }
        if (v === 'copy') { await copyOut(null, c); return '◇ Copied for Shadertoy (tabs with headers, sliders as consts at their values).'; }
        if (v === 'check' || v === 'info') return fmt(await infoOf(null, c));
        // a bare starter name: /shader tunnel
        if (SL.starter(w)) { await ThreeLab.cmd(); const r = await addStarter(w, { ctx: c }); return `◇ Added "${r.layer}" (${r.from}) · compiled: ${r.compiled}`; }
        return `Unknown: ${verb}. /shader help`;
      },
    });
    if (!Commands.get('shadertoy')) Commands.register({
      name: 'shadertoy', area: 'Three.js Lab', args: '[pasted shader]',
      desc: 'Import a Shadertoy (or ISF) shader as a ◇ layer: iChannels map to audio, feedback, buffers, the layers below',
      examples: ['/shadertoy', '/shadertoy void mainImage(out vec4 c, in vec2 p) { c = vec4(p / iResolution.xy, 0.5 + 0.5 * sin(iTime), 1.0); }'],
      keywords: 'import paste shader glsl isf vdmx resolume',
      run: async (args) => { await ThreeLab.cmd(); const t = String(args || '').trim(); if (!t) { importDialog(); return null; } const r = await importAs(t, {}); return `◇ Imported "${r.layer}" (${r.imported}): ${r.notes.join(' · ')} · compiled: ${r.compiled}`; },
    });
  }
  registerCommands();
  if (typeof AppUI !== 'undefined' && AppUI.addAction) {
    AppUI.addAction('Lab: ◇ Shader workbench', () => ThreeLab.cmd().then(() => Bench.open()));
    AppUI.addAction('Lab: ◇ New shader layer (library)…', () => ThreeLab.cmd().then(() => library()));
    AppUI.addAction('Lab: ◇ Import a Shadertoy / ISF shader…', () => ThreeLab.cmd().then(() => importDialog()));
  }
  addEventListener('resize', () => Bench.place());

  return { onBox, beforeRun, layerMenu, previewItem, open: (id) => Bench.open(id), close: () => Bench.close(), library, importDialog, op, check, info: (id) => info.get(id) || null,
    addStarter, importAs, addGlsl, setGlsl, setChannel, setScale, setAlpha, addPass, infoOf, copyOut, paintLens, get bench() { return Bench.el; }, OPS };
})();
window.LabShader = LabShader;
