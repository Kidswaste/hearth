// Publishing from chat (round 14): /deploy (alias /publish) and /deploy-tools, and the deploy_do tool
// (mcp/deploy-mcp.js → gamebridge.js → here). Claude / Astra build, preview and check a page themselves; publishing,
// rolling back and deleting always ask the owner first (deploy.js), whoever started it.
(() => {
  const C = DeployCore;
  const AREA = 'Publish';
  const opts = (list) => (args) => { const words = String(args || '').split(/\s+/); if (words.length > 1 && !/^(to|login|scene|video)$/.test(words[words.length - 2])) return []; const last = words.pop().toLowerCase(); return list(words).filter((o) => String(o.value).toLowerCase().startsWith(last)).slice(0, 40); };
  function reg(def) {
    const taken = Commands.get(def.name);
    if (taken && !def.when && taken.area !== AREA) { console.warn(`deploy: /${def.name} is taken by ${taken.area}`); return; }
    for (const a of def.aliases || []) if (Commands.get(a) && Commands.get(a).name !== def.name) def.aliases = def.aliases.filter((x) => x !== a);
    Commands.register({ area: AREA, ...def });
  }
  const PROV = C.PROVIDERS.map((p) => ({ value: p.id, hint: p.name }));
  // "my orb to netlify draft" → { ref: 'my orb', provider: 'netlify', prod: false }
  function parse(tail) {
    let s = String(tail || '').trim();
    let provider = null; let prod = true;
    s = s.replace(/\b(?:draft|preview deploy|--draft)\b/gi, () => { prod = false; return ''; });
    s = s.replace(/\b(?:to|on)\s+(vercel|netlify|cloudflare(?: pages)?|github(?: pages)?|gh-pages|pages|gh|cf)\b/i, (_, p) => { provider = C.provider(p)?.id || null; return ''; });
    return { ref: s.trim().replace(/^["'](.*)["']$/, '$1'), provider, prod };
  }
  async function statusText(check = true) {
    const s = await Deploy.status(check);
    const lines = s.providers.map((p) => `${p.found ? (p.signedIn ? '✓' : p.signedIn === false ? '○' : '·') : '·'} **${p.name}** ${p.found ? (p.signedIn ? `signed in${p.account ? ` (${p.account})` : ''}` : p.signedIn === false ? `not signed in · /deploy login ${p.id}` : 'installed') : `not installed · ${p.install}`}${p.id === 'github' && p.found && !p.git ? ' · needs git too' : ''}`);
    return `Publishing services:\n${lines.join('\n')}${s.node ? '' : '\n(Node.js wasn\'t found: the npm CLIs need it, https://nodejs.org)'}\nDefault: ${C.provider(store.get('deploy.provider', null))?.name || 'the first one installed'}`;
  }
  async function historyText() {
    const h = (await Deploy.history()).filter((x) => x.state !== 'failed').slice(0, 15);
    return h.length ? h.map((e, i) => C.line(e, i)).join('\n') : 'Nothing published yet: /deploy scene.';
  }
  async function deploy(args, ctx = {}) {
    const [verb, ...rest] = String(args || '').trim().split(/\s+/);
    const tail = rest.join(' ');
    const v = (verb || '').toLowerCase();
    if (!v) { Deploy.menuAt(null); return null; }
    if (v === 'status') return statusText(true);
    if (v === 'history' || v === 'list') return historyText();
    if (v === 'login' || v === 'signin' || v === 'sign-in') return Deploy.login(tail.trim() || null);
    if (v === 'to' || v === 'default') { const p = C.provider(tail); if (!p) return 'vercel, netlify, cloudflare or github'; store.set('deploy.provider', p.id); return `Publishing goes to ${p.name} by default.`; }
    if (v === 'rollback' || v === 'undo') { const r = await Deploy.rollback(tail.trim()); return r.ok ? `Rolled back (${r.how === 'switched' ? 'switched on the service' : 'the earlier build published again'}): ${r.url || ''}` : r.error; }
    if (v === 'remove' || v === 'delete' || v === 'unpublish') { const whole = /\bsite\b/.test(tail); const r = await Deploy.remove(tail.replace(/\bsite\b/, '').trim() || 'last', { whole }); return r.ok ? `${r.whole ? 'Site deleted' : 'Deploy removed'}: ${r.entry.name}.` : r.error; }
    if (v === 'open') { const e = C.find(await Deploy.history(), tail || 'last'); if (!e?.url) return 'Nothing to open.'; window.hub.openExternal(e.url); return null; }
    if (v === 'preview') {
      const [w, ...more] = tail.split(/\s+/);
      const what = ['scene', 'video', 'folder', 'project'].includes(w) ? w : 'scene';
      const ref = (['scene', 'video', 'folder', 'project'].includes(w) ? more.join(' ') : tail).trim();
      const b = await Deploy.build(what, ref);
      const pv = await Deploy.preview(b);
      const chk = await Deploy.check(b);
      return `Preview of “${b.spec.name}”: ${pv.url || pv.note}${chk ? (chk.ok ? ' · it draws ✓' : ` · ⚠ the check didn't see it draw${chk.errors?.[0] ? `: ${chk.errors[0]}` : ''}`) : ''}\n${b.files} files, ${(b.bytes / 1048576).toFixed(1)} MB in ${b.dir}${b.notes?.length ? `\n${b.notes.join('\n')}` : ''}\nPublish it: /deploy ${what}${ref ? ` ${ref}` : ''}`;
    }
    const what = ['scene', 'video', 'folder', 'project', 'sequence', 'render'].includes(v) ? (v === 'sequence' || v === 'render' ? 'video' : v) : null;
    if (!what) return 'Publish: /deploy scene [name] [to vercel|netlify|cloudflare|github] [draft] · video <path|last> · folder <path> · project <path> · preview … · status · login <service> · history · rollback [n] · remove [n] [site] · to <service>';
    const { ref, provider, prod } = parse(tail);
    const r = await Deploy.publish({ what, ref: what === 'video' && !ref ? 'last' : ref, provider, prod, agentId: ctx.agentId });
    if (!r.ok) return `${r.error}${r.previewUrl ? `\nLocal preview: ${r.previewUrl}` : ''}`;
    return Deploy.liveNote(r, ctx);
  }
  const WORDS = (words) => {
    const prev = (words[words.length - 1] || '').toLowerCase();
    if (prev === 'to' || prev === 'login') return PROV;
    return [{ value: 'scene', hint: 'the Lab scene as a web page' }, { value: 'video', hint: '<path|last>' }, { value: 'folder', hint: '<path> a static site' }, { value: 'project', hint: '<path> built by Vercel / Netlify' }, { value: 'preview', hint: 'build + local preview only' }, { value: 'status', hint: 'CLIs and sign-ins' }, { value: 'login', hint: '<service>' }, { value: 'history' }, { value: 'rollback', hint: '[n]' }, { value: 'remove', hint: '[n] [site]' }, { value: 'open', hint: '[n]' }, { value: 'to', hint: 'default service' }];
  };
  reg({ name: 'deploy', aliases: ['publish'], args: '[scene [name] [to <service>] | video <path|last> | folder <path> | preview | status | login | history | rollback | remove]', desc: 'Publish a Lab scene, a video or a site on Vercel, Netlify, Cloudflare Pages or GitHub Pages (preview first; asks before it goes public)', run: deploy, complete: opts(WORDS), examples: ['/deploy scene', '/deploy scene to netlify', '/deploy preview', '/deploy history'], keywords: 'publish website web page host vercel netlify cloudflare github pages share link online', undo: '/deploy rollback' });
  reg({ name: 'deploy-tools', args: '[on | off]', desc: 'Let this agent publish for you (deploy_do: it builds and previews by itself, and asks you before anything goes public)', complete: (a) => [{ value: 'on' }, { value: 'off' }].filter((x) => x.value.startsWith(String(a || '').trim())),
    run: async (args, ctx) => {
      const agent = H.agent(ctx.agentId);
      if (!agent || agent.mode !== 'native') return 'Run it in a chat.';
      const cfg = H.config.agents.find((x) => x.id === agent.id);
      const on = /off/.test(String(args)) ? false : /on/.test(String(args)) ? true : !cfg.deployTools;
      if (on) cfg.deployTools = true; else delete cfg.deployTools;
      await saveConfig();
      return on ? `${agent.name} can build, preview and publish (it asks you first), from its next message.` : `${agent.name} no longer gets the publishing tool.`;
    } });

  // ---------- the agents' tool (deploy_do) ----------
  async function handle(tool, a) {
    if (tool !== 'deploy_do') return { ok: false, error: `Unknown tool ${tool}` };
    const act = String(a.action || 'status').toLowerCase();
    const what = ['scene', 'video', 'folder', 'project', 'page'].includes(a.what) ? a.what : 'scene';
    const agentId = H.activeId;
    try {
      if (act === 'status') return { ok: true, value: await statusText(true) };
      if (act === 'history') return { ok: true, value: await historyText() };
      if (act === 'login') {
        const p = C.provider(a.provider);
        if (!p) return { ok: false, error: 'provider: vercel, netlify, cloudflare or github' };
        const yes = await Deploy.ask({ agentId, action: `Open ${p.name}'s sign-in`, target: 'a terminal window with its own sign-in', risk: 'low', ok: 'Open' });
        return yes ? { ok: true, value: await Deploy.login(p.id) } : { ok: false, error: 'The owner said no.' };
      }
      if (act === 'build' || act === 'preview') {
        const b = await Deploy.build(what, a.path || a.name || (what === 'video' ? 'last' : ''), a.html ? { html: a.html, name: a.name } : {});
        const pv = await Deploy.preview(b, { show: act === 'preview' });
        const chk = await Deploy.check(b);
        const images = chk?.shot ? [{ data: chk.shot.split(',')[1], mime: 'image/png' }] : [];
        return { ok: true, value: { name: b.spec.name, preview: pv.url || pv.note, build: b.dir, files: b.files, mb: Math.round(b.bytes / 104857.6) / 10, draws: chk ? chk.ok : undefined, errors: chk?.errors?.length ? chk.errors : undefined, notes: b.notes?.length ? b.notes : undefined, next: 'deploy_do { action: "publish" } (the owner is asked first)' }, images };
      }
      if (act === 'publish') {
        const r = await Deploy.publish({ what, ref: a.path || a.name || (what === 'video' ? 'last' : ''), provider: a.provider || null, prod: a.prod !== false, agentId, show: true });
        if (r.ok) Deploy.liveNote(r);
        return r.ok ? { ok: true, value: { url: r.url, service: C.provider(r.entry.provider).name, name: r.entry.name, note: r.note || undefined } } : { ok: false, error: `${r.error}${r.install ? ` (install: ${r.install})` : ''}${r.previewUrl ? ` · local preview ${r.previewUrl}` : ''}` };
      }
      if (act === 'rollback') { const r = await Deploy.rollback(a.id || ''); return r.ok ? { ok: true, value: { url: r.url, how: r.how } } : { ok: false, error: r.error }; }
      if (act === 'remove') { const r = await Deploy.remove(a.id || 'last', { whole: Boolean(a.site) }); return r.ok ? { ok: true, value: { removed: r.entry.name, whole: r.whole } } : { ok: false, error: r.error }; }
      return { ok: false, error: 'action: status, build, preview, publish, history, rollback, remove or login' };
    } catch (err) { return { ok: false, error: err.message }; }
  }
  if (typeof HubBridge !== 'undefined') HubBridge.register(['deploy_'], handle);
  window.DeployCmds = { handle, deploy, parse, statusText };
})();
