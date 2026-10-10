// The Meshy API, in one adapter (round 14, apps stream). Everything that knows the shape of Meshy's REST API lives
// here, so a change on Meshy's side is a fix in this file only. It runs in the main process (appsmain.js makes the
// calls: the API key never reaches a page or an engine), in the hub page (cost estimates only, no key) and in Node
// for dev/apps-unit-test.js against the fake server dev/fake-meshy.js.
//
// The API as documented at docs.meshy.ai (Authorization: Bearer <key>; every create returns { result: <task id> };
// a task is polled with GET <endpoint>/<id> until status is SUCCEEDED / FAILED / CANCELED / EXPIRED):
//   text   POST /openapi/v2/text-to-3d      { mode: 'preview', prompt, art_style, ai_model, topology, target_polycount, should_remesh }
//          POST /openapi/v2/text-to-3d      { mode: 'refine', preview_task_id, enable_pbr, texture_prompt, ai_model }
//   image  POST /openapi/v1/image-to-3d     { image_url (https or a data: URI), ai_model, should_texture, enable_pbr, topology, target_polycount }
//   retexture POST /openapi/v1/retexture    { input_task_id | model_url, text_style_prompt | image_style_url, enable_original_uv, enable_pbr }
//   remesh POST /openapi/v1/remesh          { input_task_id | model_url, target_formats: ['glb'], topology, target_polycount }
//   balance GET /openapi/v1/balance         → { balance }
//   task   { id, status, progress (0–100), model_urls: { glb, fbx, obj, usdz }, thumbnail_url, task_error: { message } }
// Credits (Meshy's price list, kept here as an estimate the owner sees before anything is spent; Meshy's own count
// is the truth): text preview 20 with Meshy 6 / latest (5 with older models), refine (texture) 10; image to 3D 20
// untextured or 30 textured with Meshy 6 / latest (5 / 15 older); retexture 10; remesh 5.
const MeshyAPI = (() => {
  const BASE = 'https://api.meshy.ai';
  const PATHS = {
    text: '/openapi/v2/text-to-3d', image: '/openapi/v1/image-to-3d', retexture: '/openapi/v1/retexture',
    remesh: '/openapi/v1/remesh', balance: '/openapi/v1/balance',
  };
  const MODEL = 'latest'; // Meshy's newest model; older: 'meshy-5', 'meshy-4'
  // Meshy's public test-mode key: answers with sample results and spends no credits (handy to try the whole flow)
  const TEST_KEY = 'msy_dummy_api_key_for_test_mode_12345678';
  const NEW_MODELS = /^(latest|meshy-6)/i;
  const COSTS = {
    preview: (m) => (NEW_MODELS.test(m) ? 20 : 5),
    refine: () => 10,
    image: (m, tex) => (NEW_MODELS.test(m) ? (tex ? 30 : 20) : (tex ? 15 : 5)),
    retexture: () => 10,
    remesh: () => 5,
  };
  const ART = ['realistic', 'sculpture'];
  const TOPO = ['triangle', 'quad'];

  // What a job will cost, as lines the owner reads before saying yes.
  // op: 'text' (preview, then refine unless draft) · 'image' · 'retexture' · 'remesh'
  function estimate(op, o = {}) {
    const m = o.model || MODEL;
    const lines = [];
    if (op === 'text') {
      lines.push(['Shape (preview)', COSTS.preview(m)]);
      if (!o.draft) lines.push(['Texture (refine)', COSTS.refine(m)]);
    } else if (op === 'image') lines.push([o.texture === false ? 'Image to 3D (no texture)' : 'Image to 3D with texture', COSTS.image(m, o.texture !== false)]);
    else if (op === 'retexture') lines.push(['New texture', COSTS.retexture(m)]);
    else if (op === 'remesh') lines.push(['Remesh', COSTS.remesh(m)]);
    else throw new Error(`Unknown Meshy job "${op}"`);
    return { credits: lines.reduce((a, [, n]) => a + n, 0), lines: lines.map(([what, n]) => `${what}: ${n} credits`), model: m };
  }

  // ---------- request bodies (the only place that knows the field names) ----------
  const num = (v, lo, hi) => { const n = Math.round(Number(v)); return Number.isFinite(n) && n >= lo && n <= hi ? n : undefined; };
  const clean = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== ''));
  function body(step, o = {}) {
    const ai_model = o.model || MODEL;
    const shape = { topology: TOPO.includes(o.topology) ? o.topology : undefined, target_polycount: num(o.polycount, 100, 300000), should_remesh: o.polycount || o.topology ? true : undefined };
    if (step === 'preview') {
      if (!String(o.prompt || '').trim()) throw new Error('Say what to make ("a chrome dragon skull").');
      return clean({ mode: 'preview', prompt: String(o.prompt).trim().slice(0, 600), art_style: ART.includes(o.art) ? o.art : undefined, ai_model, seed: num(o.seed, 0, 2 ** 31), ...shape });
    }
    if (step === 'refine') return clean({ mode: 'refine', preview_task_id: o.previewId, enable_pbr: o.pbr !== false, texture_prompt: o.texturePrompt ? String(o.texturePrompt).slice(0, 600) : undefined, ai_model });
    if (step === 'image') {
      if (!o.imageUrl) throw new Error('Image to 3D needs a picture.');
      return clean({ image_url: o.imageUrl, ai_model, should_texture: o.texture !== false, enable_pbr: o.texture !== false && o.pbr !== false, texture_prompt: o.texturePrompt || undefined, ...shape });
    }
    if (step === 'retexture') {
      if (!o.taskId && !o.modelUrl) throw new Error('Which model? (a Meshy model from the library)');
      if (!o.stylePrompt && !o.styleImage) throw new Error('Describe the new texture ("rusted bronze").');
      return clean({ input_task_id: o.taskId, model_url: o.taskId ? undefined : o.modelUrl, text_style_prompt: o.stylePrompt ? String(o.stylePrompt).slice(0, 600) : undefined, image_style_url: o.styleImage, enable_original_uv: true, enable_pbr: o.pbr !== false, ai_model });
    }
    if (step === 'remesh') {
      if (!o.taskId && !o.modelUrl) throw new Error('Which model? (a Meshy model from the library)');
      return clean({ input_task_id: o.taskId, model_url: o.taskId ? undefined : o.modelUrl, target_formats: ['glb'], topology: TOPO.includes(o.topology) ? o.topology : 'triangle', target_polycount: num(o.polycount, 100, 300000) || 30000 });
    }
    throw new Error(`Unknown step ${step}`);
  }
  // the endpoint of a step
  const pathOf = (step) => (step === 'preview' || step === 'refine' ? PATHS.text : PATHS[step]);

  // ---------- a task, in Hearth's words ----------
  const STATUS = { PENDING: 'waiting', IN_PROGRESS: 'running', SUCCEEDED: 'done', FAILED: 'failed', CANCELED: 'canceled', EXPIRED: 'failed' };
  function normalize(raw = {}) {
    const urls = raw.model_urls || {};
    return {
      id: raw.id, status: STATUS[raw.status] || 'running', progress: Math.max(0, Math.min(100, Number(raw.progress) || 0)),
      glb: urls.glb || null, fbx: urls.fbx || null, usdz: urls.usdz || null, obj: urls.obj || null, thumb: raw.thumbnail_url || null,
      error: raw.task_error?.message || (raw.status === 'EXPIRED' ? 'The task expired on Meshy\'s side.' : ''),
      queue: raw.preceding_tasks ?? null,
    };
  }
  // HTTP errors in plain words (never echoing the key)
  function errorText(status, data) {
    const said = String(data?.message || data?.error || '').slice(0, 200);
    if (status === 401 || status === 403) return 'Meshy refused the API key: paste it again with /meshy key (Meshy → Settings → API).';
    if (status === 402) return `Not enough Meshy credits for this${said ? ` (${said})` : ''}. /meshy balance shows what's left.`;
    if (status === 429) return 'Meshy says too many requests right now: try again in a minute.';
    if (status === 404) return 'Meshy doesn\'t know that task (it may have expired: models are kept 3 days on their side).';
    if (status >= 500) return `Meshy's server had a problem (${status}): try again in a moment.`;
    return said || `Meshy answered ${status}.`;
  }

  // ---------- the client: fetch is injected (Electron's net.fetch in the app, global fetch in tests) ----------
  function client({ key, base = BASE, fetch: f = (typeof fetch !== 'undefined' ? fetch : null), timeout = 60000 } = {}) {
    if (!key) throw new Error('No Meshy API key yet: /meshy key to paste it (Meshy → Settings → API).');
    if (!f) throw new Error('No fetch available');
    const root = String(base || BASE).replace(/\/+$/, '');
    async function call(method, p, json) {
      const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
      const timer = ctl && setTimeout(() => ctl.abort(), timeout);
      let res;
      try {
        res = await f(`${root}${p}`, { method, headers: { Authorization: `Bearer ${key}`, ...(json ? { 'Content-Type': 'application/json' } : {}) }, body: json ? JSON.stringify(json) : undefined, signal: ctl?.signal });
      } catch (err) {
        throw new Error(/abort/i.test(String(err?.name || err?.message)) ? 'Meshy took too long to answer.' : `Couldn't reach Meshy (${String(err?.message || err).replace(key, '…')}).`);
      } finally { if (timer) clearTimeout(timer); }
      let data = null;
      try { data = await res.json(); } catch { data = null; }
      if (!res.ok) { const e = new Error(errorText(res.status, data)); e.status = res.status; throw e; }
      return data;
    }
    return {
      async create(step, o) { const r = await call('POST', pathOf(step), body(step, o)); const id = r?.result || r?.id; if (!id) throw new Error('Meshy didn\'t return a task id.'); return id; },
      async task(step, id) { return normalize(await call('GET', `${pathOf(step)}/${encodeURIComponent(id)}`)); },
      async balance() { const r = await call('GET', PATHS.balance); return Number(r?.balance ?? r?.credits ?? NaN); },
      // poll until the task ends; onProgress(task) on every change; stop() (returns true) ends early
      async wait(step, id, { onProgress, stop, interval = 4000, max = 45 * 60000, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {
        const t0 = Date.now();
        let last = '';
        for (;;) {
          if (stop?.()) throw new Error('Stopped');
          const t = await this.task(step, id);
          const sig = `${t.status}:${t.progress}`;
          if (sig !== last) { last = sig; try { onProgress?.(t); } catch { /* the caller's display */ } }
          if (t.status === 'done') return t;
          if (t.status === 'failed' || t.status === 'canceled') throw new Error(t.error || `Meshy ${t.status} the task.`);
          if (Date.now() - t0 > max) throw new Error('Meshy is taking unusually long: /meshy resume picks it up later.');
          await sleep(interval);
        }
      },
    };
  }

  return { BASE, PATHS, MODEL, TEST_KEY, COSTS, estimate, body, pathOf, normalize, errorText, client };
})();
if (typeof module !== 'undefined') module.exports = MeshyAPI;
if (typeof window !== 'undefined') window.MeshyAPI = MeshyAPI;
