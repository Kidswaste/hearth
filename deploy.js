// Agentic deployment (round 14), the app side: publish a Lab scene, a video, a folder or a web project on Vercel,
// Netlify, Cloudflare Pages or GitHub Pages with their official CLIs (deploymain.js). One flow, the same from a menu,
// /deploy and the deploy_do tool (Claude / Astra): build → local preview (127.0.0.1) and a hidden-window check that
// it draws → ask first (publishing is outward-facing: Access.ask risk high, or a confirm) → deploy with a progress
// bar → the address, kept in the history with Open / Copy / Roll back / Remove. Sign-in is the CLI's own browser
// flow in a terminal window you see; Hearth never handles passwords or tokens.
const Deploy = (() => {
  const C = DeployCore;
  const Lab = () => (typeof ThreeLab !== 'undefined' ? ThreeLab : null);
  const IS_MAC = /Mac/.test(navigator.platform);
  const base = (p) => String(p || '').split(/[\\/]/).pop();
  let history = null;
  const load = async () => (history ||= (await window.hub.kvGet('deploy-history', [])) || []);
  const save = () => window.hub.kvSet('deploy-history', history);
  let st = null; let stAt = 0;
  const testPaths = () => window.DEPLOY_TEST_PATHS || null; // dev checks point at the fake CLIs (dev/fake-deploy)
  const o = (x = {}) => (testPaths() ? { ...x, paths: testPaths() } : x);
  async function status(check = false) {
    if (!st || check || Date.now() - stAt > 60000) { st = await window.hub.deploy.status(o({ check })); stAt = Date.now(); }
    return st;
  }
  const defaultProvider = () => store.get('deploy.provider', null);

  async function ask(a) {
    if (window.Access?.ask) { try { return Boolean(await window.Access.ask(a)); } catch { return false; } }
    return Modal.confirm(a.title || 'Publish?', `${a.action}${a.target ? `\n${a.target}` : ''}${a.detail ? `\n\n${a.detail}` : ''}`, { ok: a.ok || 'Publish', danger: a.risk === 'high' });
  }

  // ---------- what gets published ----------
  // the Lab scene: the open sketch (or one by name / id), its layers, references, palette and frame size
  async function sceneSpec(ref = '') {
    // the Lab's own list when it is loaded (the newest edits), the saved one otherwise
    const sketches = Lab()?.scenes?.all?.() || (await window.hub.kvGet('three-sketches', [])) || [];
    if (!sketches.length) throw new Error('No Lab scenes yet: make one in the Three.js Lab first.');
    const r = String(ref || '').trim().toLowerCase();
    const cur = Lab()?.scenes?.currentId?.();
    let s = r && r !== 'current' && r !== 'this' ? sketches.find((x) => x.id === ref) || sketches.find((x) => (x.name || '').toLowerCase() === r) || sketches.find((x) => (x.name || '').toLowerCase().includes(r)) : null;
    if (r && r !== 'current' && r !== 'this' && !s) throw new Error(`No Lab scene named “${ref}”.`);
    if (!s) s = (cur && Lab().scenes.get(cur)) || sketches.find((x) => x.id === cur) || sketches.slice().sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))[0];
    // the open sketch as the Lab has it now (saved slider values are in its code)
    const live = Lab()?.scenes?.get?.(s.id) || s;
    const layers = (live.layers?.length ? live.layers : [{ id: 'main', name: 'Layer 1', code: live.code || '' }]).map((L, i) => ({
      id: L.id || `l${i}`, code: L.code || '', name: L.name, visible: L.visible !== false, opacity: L.opacity ?? 1, blend: L.blend || 'normal', in: L.in ?? null, out: L.out ?? null, fadeIn: L.fadeIn || 0, fadeOut: L.fadeOut || 0,
      x: L.x || 0, y: L.y || 0, scale: L.scale ?? 1, rotate: L.rotate || 0, mask: L.mask || null, slot: L.slot ?? i, z: i, keys: L.keys || null, overrides: L.overrides || null,
    })).filter((L) => L.code.trim());
    const refs = (((await window.hub.kvGet('three-refs', {})) || {})[s.id] || []).map((x) => ({ key: x.key, kind: x.kind, path: x.path, name: x.name }));
    const ex = ((await window.hub.kvGet('three-lab-extras', {})) || {})[s.id] || {};
    const fm = String(ex.frame || '').match(/(\d{3,5})\s*[x×]\s*(\d{3,5})/);
    const version = store.get('three.version', typeof ThreeData !== 'undefined' ? ThreeData.VERSIONS[0] : '0.186.1');
    return { kind: 'scene', name: s.name || 'Lab scene', id: s.id, version, layers, refs, palette: live.palette || [], frame: fm ? { w: Number(fm[1]), h: Number(fm[2]) } : null };
  }
  async function lastVideo() {
    const jobs = typeof Renders !== 'undefined' ? [...Renders.list(), ...Renders.history()] : [];
    for (const j of jobs.filter((x) => x.output && (x.status === 'done' || !x.status)).sort((a, b) => (b.ended || b.created || 0) - (a.ended || a.created || 0))) if (await window.hub.fs.stat(j.output)) return j.output;
    const caps = await window.hub.capture?.list?.({ kind: 'video', limit: 1 }).catch(() => []);
    if (caps?.[0]?.path) return caps[0].path;
    throw new Error('No render or recording yet: give the video\'s path.');
  }
  // what: scene | video | folder | project | page; ref: a scene name, a path, "last"
  async function specOf(what = 'scene', ref = '', extra = {}) {
    if (what === 'scene') return { ...(await sceneSpec(ref)), ...extra };
    if (what === 'video') { const p = !ref || /^(last|latest)$/i.test(ref) ? await lastVideo() : ref; return { kind: 'video', name: extra.name || base(p).replace(/\.[^.]+$/, ''), path: p, ...extra }; }
    if (what === 'folder' || what === 'project') { if (!ref) throw new Error(`Which ${what}? Give its folder.`); return { kind: what, name: extra.name || base(ref), path: ref, ...extra }; }
    if (what === 'page') return { kind: 'page', name: extra.name || 'Hearth page', html: extra.html || ref };
    throw new Error('Publish what? scene, video, folder or project.');
  }

  // ---------- build + preview + check ----------
  async function build(what, ref, extra = {}) {
    const spec = await specOf(what, ref, extra);
    const key = `deploy:build:${Date.now()}`;
    window.Progress?.set(key, { title: `Build · ${spec.name}`, label: 'building the page', kind: `deploy:build:${spec.kind}`, icon: '⇪', expect: { ms: 4000 } });
    try {
      const b = await window.hub.deploy.build(spec, window.DEPLOY_TEST_THREE ? { threeDir: window.DEPLOY_TEST_THREE } : {});
      window.Progress?.done(key, { ok: true });
      return { ...b, spec };
    } catch (err) { window.Progress?.done(key, { ok: false }); throw err; }
  }
  async function preview(b, { show = true } = {}) {
    if (b.kind === 'project') return { url: null, note: 'A project is built by the service: no local preview.' };
    return window.hub.deploy.preview(b.dir, { show, title: b.spec?.name || b.slug });
  }
  // the page drawn in a hidden window (scenes: their first frame is checked; folders / videos: the page loads)
  const check = (b) => (b.kind === 'project' || b.kind === 'folder' ? Promise.resolve(null) : window.hub.deploy.verify(b.dir, { timeout: b.kind === 'scene' ? 30000 : 12000 }).catch((err) => ({ ok: false, errors: [err.message] })));

  // ---------- publish ----------
  async function pickProvider(want) {
    const s = await status();
    const p = C.provider(want || defaultProvider()) || null;
    if (p) return { p, s: s.providers.find((x) => x.id === p.id) };
    const found = s.providers.find((x) => x.found);
    return { p: C.provider(found?.id || 'vercel'), s: found || s.providers[0] };
  }
  // → { ok, url, entry } | { ok: false, error, install?, previewUrl? }
  async function publish({ what = 'scene', ref = '', provider = null, prod = true, agentId = H.activeId, show = true, name = null } = {}) {
    await load();
    const { p, s } = await pickProvider(provider);
    if (!s?.found) return { ok: false, error: s?.reason || `${p.name}'s CLI isn't installed.`, install: s?.install };
    const b = await build(what, ref, name ? { name } : {});
    const pv = await preview(b, { show });
    const chk = await check(b);
    const earlier = history.find((e) => e.provider === p.id && e.slug === b.slug && (e.site || e.owner));
    const warn = chk && !chk.ok ? `\n⚠ The check didn't see it draw${chk.errors?.length ? `: ${chk.errors[0]}` : ''}.` : '';
    const yes = await ask({ agentId, action: `Publish “${b.spec.name}” on ${p.name}`, target: `${p.name} · ${b.slug}${prod ? '' : ' (a preview deploy)'}`, risk: 'high', ok: 'Publish',
      detail: `It goes on the internet: anyone with the link can open it.${pv.url ? `\nLocal preview: ${pv.url}` : ''}\n${b.files} files · ${(b.bytes / 1048576).toFixed(1)} MB${b.notes?.length ? `\n${b.notes.join('\n')}` : ''}${warn}` });
    if (!yes) return { ok: false, error: 'Not published (you said no).', previewUrl: pv.url, build: b.dir };
    const id = C.uid();
    const key = `deploy:${id}`;
    window.Progress?.set(key, { title: `Publish · ${b.spec.name} → ${p.name}`, label: 'starting', kind: `deploy:${p.id}`, icon: p.icon, expect: { ms: 25000 } });
    const off = window.hub.deploy.onEvent?.((ev) => { if (ev.id !== id) return; if (ev.type === 'progress') window.Progress?.set(key, { pct: ev.pct, label: ev.label }); else if (ev.type === 'log') window.Progress?.set(key, { label: ev.line.slice(0, 60) }); });
    let r;
    try { r = await window.hub.deploy.run({ id, provider: p.id, dir: b.dir, slug: b.slug, prod, site: earlier?.site || null, owner: earlier?.owner || null }, o()); } finally { off?.(); }
    window.Progress?.done(key, { ok: Boolean(r?.ok), label: r?.ok ? 'live' : 'failed' });
    if (!r?.ok) {
      history = C.add(history, { provider: p.id, kind: b.kind, name: b.spec.name, slug: b.slug, build: b.dir, prod, state: 'failed', error: r?.error, url: null });
      await save();
      return { ok: false, error: r?.error || 'The deploy failed.', install: r?.install, previewUrl: pv.url };
    }
    history = C.add(history, { id, provider: p.id, kind: b.kind, name: b.spec.name, slug: b.slug, site: r.site || null, owner: r.owner || null, url: r.url, deployUrl: r.deployUrl || null, deployId: r.deployId || null, build: b.dir, prod, from: b.spec.id || b.spec.path || null });
    await save();
    store.set('deploy.provider', p.id);
    return { ok: true, url: r.url, note: r.note || null, entry: history[0], previewUrl: pv.url, check: chk };
  }
  function liveNote(r, ctx) {
    const actions = [{ label: 'Open', run: () => window.hub.openExternal(r.url) }, { label: 'Copy', run: () => { navigator.clipboard.writeText(r.url); toast('Address copied', { timeout: 1200 }); } }, { label: 'History', run: () => historyMenu() }];
    const text = `🌐 **${r.entry.name}** is live on ${C.provider(r.entry.provider).name}: ${r.url}${r.note ? `\n${r.note}` : ''}`;
    if (ctx?.note) ctx.note(text, { actions, id: `deploy-${r.entry.id}` }); else toast(`Live: ${r.url}`, { timeout: 12000, action: { label: 'Open', fn: () => window.hub.openExternal(r.url) } });
    return text;
  }

  // ---------- history: roll back / remove ----------
  async function rollback(ref = '', { agentId = H.activeId } = {}) {
    await load();
    const e = ref ? C.find(history, ref) : history.find((x) => x.state === 'live');
    if (!e) return { ok: false, error: 'Nothing to roll back.' };
    const prev = C.previous(history, e);
    if (!prev) return { ok: false, error: `“${e.name}” has no earlier deploy on ${C.provider(e.provider).name}.` };
    const p = C.provider(e.provider);
    const yes = await ask({ agentId, title: 'Roll back?', action: `Roll back “${e.name}” on ${p.name}`, target: `to the version of ${new Date(prev.at).toLocaleString()}`, risk: 'high', ok: 'Roll back', detail: `${e.url || ''}\n${p.canRollback ? `${p.name} switches back to the earlier deploy.` : 'Hearth publishes the earlier build again (kept on this computer).'}` });
    if (!yes) return { ok: false, error: 'Not rolled back (you said no).' };
    const r = await window.hub.deploy.rollback(e, prev, o());
    if (!r.ok) return r;
    history = history.map((x) => (x.id === e.id ? { ...x, state: 'rolledback' } : x.id === prev.id && r.how === 'switched' ? { ...x, state: 'live' } : x));
    if (r.how === 'republished') history = C.add(history, { ...prev, id: undefined, at: undefined, state: 'live', url: r.url || prev.url, deployId: r.deployId || null, site: r.site || prev.site });
    await save();
    return { ok: true, url: r.url || prev.url, how: r.how, to: prev };
  }
  async function remove(ref = '', { whole = false, agentId = H.activeId } = {}) {
    await load();
    const e = C.find(history, ref);
    if (!e) return { ok: false, error: 'Which one? /deploy history lists them.' };
    const p = C.provider(e.provider);
    const site = whole || !p.canRemoveDeploy;
    const yes = await ask({ agentId, title: site ? 'Delete the site?' : 'Remove this deploy?', action: site ? `Delete the whole site “${e.slug}” on ${p.name}` : `Remove this deploy of “${e.name}” on ${p.name}`, target: e.url || e.slug, risk: 'high', ok: 'Delete', detail: site ? `Every deploy of ${e.slug} goes${p.id === 'github' ? ' (the GitHub repository is deleted: gh needs the delete_repo permission, gh auth refresh -s delete_repo)' : ''}. The builds stay on this computer.` : 'Only this deploy goes; the site stays.' });
    if (!yes) return { ok: false, error: 'Nothing removed (you said no).' };
    const r = await window.hub.deploy.remove(e, site ? 'site' : 'deploy', o());
    if (!r.ok) return r;
    history = history.map((x) => (x.id === e.id || (r.whole && x.provider === e.provider && x.slug === e.slug) ? { ...x, state: 'removed' } : x));
    await save();
    return { ok: true, whole: r.whole, entry: e };
  }
  async function login(id) {
    const p = C.provider(id || defaultProvider() || 'vercel');
    if (!p) throw new Error('Which service? vercel, netlify, cloudflare or github.');
    const r = await window.hub.deploy.login(p.id, o());
    st = null;
    return `A ${r.how} window opened with ${p.name}'s own sign-in (${r.command}): finish it in the browser it opens, then /deploy status. Hearth never sees your password.`;
  }

  // ---------- menus ----------
  const err = (e) => toast(e.message || String(e), { type: 'error', timeout: 9000 });
  const go = (fn) => () => fn().then((r) => { if (r?.ok === false) toast(r.error, { type: r.error?.includes('said no') ? 'info' : 'error', timeout: 9000 }); else if (r?.url) liveNote(r); }).catch(err);
  async function providerItems(fn) {
    const s = await status();
    return s.providers.map((x) => ({ label: `${x.icon}  ${x.name}${x.found ? '' : ' · not installed'}${defaultProvider() === x.id ? ' ✓' : ''}`, hint: x.found ? '' : x.install, action: x.found ? () => fn(x.id) : () => { navigator.clipboard.writeText(x.install); toast(`To install ${x.name}'s CLI, run in a terminal: ${x.install} (copied)`, { timeout: 12000 }); } }));
  }
  async function items() {
    await load();
    return [
      'Publish on the web',
      { label: 'This Lab scene', items: () => providerItems((pid) => go(() => publish({ what: 'scene', provider: pid }))()) },
      { label: 'Preview this Lab scene here first', action: () => build('scene').then((b) => preview(b)).then((r) => toast(`Preview: ${r.url}`, { timeout: 9000 })).catch(err) },
      { label: 'A video…', items: () => providerItems(async (pid) => { const f = (await window.hub.openDialog({ title: 'Video to publish', properties: ['openFile'], filters: [{ name: 'Video', extensions: ['mp4', 'webm', 'mov', 'm4v'] }] }))?.[0]; if (f) go(() => publish({ what: 'video', ref: f, provider: pid }))(); }) },
      { label: 'A folder or web project…', items: () => providerItems(async (pid) => { const f = await window.hub.pickFolder('', 'Folder to publish'); if (f) go(async () => publish({ what: (await window.hub.fs.stat(`${f}/index.html`)) ? 'folder' : 'project', ref: f, provider: pid }))(); }) },
      { label: `History${history.length ? ` (${history.filter((x) => x.state === 'live').length} live)` : ''}`, items: historyItems },
      { label: 'Sign in to a service', items: () => providerItems((pid) => login(pid).then((t) => toast(t, { timeout: 12000 })).catch(err)), more: true },
      { label: 'Default service', items: () => providerItems((pid) => { store.set('deploy.provider', pid); toast(`Publishing goes to ${C.provider(pid).name} by default`, { timeout: 2000 }); }), more: true },
      { label: 'Builds folder', action: async () => window.hub.fs.open(`${await window.hub.deploy.dir()}/builds`), more: true },
    ];
  }
  function historyItems() {
    const list = history.filter((x) => x.state !== 'failed').slice(0, 20);
    if (!list.length) return [{ label: 'Nothing published yet', disabled: true }];
    return list.map((e) => ({ label: `${C.provider(e.provider)?.icon || '•'} ${e.name} · ${C.STATES[e.state] || e.state}`, hint: new Date(e.at).toLocaleDateString(), items: () => [
      e.url ? { label: 'Open', action: () => window.hub.openExternal(e.url) } : null,
      e.url ? { label: 'Copy the address', action: () => { navigator.clipboard.writeText(e.url); toast('Copied', { timeout: 1000 }); } } : null,
      e.build ? { label: 'Preview the build here', action: () => window.hub.deploy.preview(e.build, { show: true, title: e.name }).catch(err) } : null,
      { label: 'Publish this build again', action: go(() => publish({ what: e.kind === 'video' || e.kind === 'scene' ? 'folder' : e.kind, ref: e.build, provider: e.provider, name: e.name })) },
      C.previous(history, e) ? { label: 'Roll back to the one before', action: go(() => rollback(e.id)) } : null,
      { label: C.provider(e.provider)?.canRemoveDeploy ? 'Remove this deploy' : 'Delete the site', danger: true, action: go(() => remove(e.id)) },
    ].filter(Boolean) }));
  }
  async function historyMenu() { await load(); showMenu(innerWidth / 2 - 160, 120, ['Published', ...historyItems()]); }
  async function menuAt(anchor) { const list = await items(); if (anchor?.getBoundingClientRect) { const r = anchor.getBoundingClientRect(); showMenu(r.left, r.bottom + 4, list); } else showMenu(innerWidth / 2 - 150, 120, list); }
  const videoItems = (file) => [{ label: 'Publish as a web page', items: () => providerItems((pid) => go(() => publish({ what: 'video', ref: file, provider: pid }))()) }];

  // the Apps registry (apps stream), guarded and idempotent
  let registered = false;
  function registerApps() {
    if (registered || !window.Apps?.register) return;
    registered = true;
    try { window.Apps.register({ id: 'deploy', name: 'Publish on the web', icon: '⇪', open: () => menuAt(null), describe: () => 'Publish a Lab scene, a video or a site on Vercel, Netlify, Cloudflare Pages or GitHub Pages (/deploy)', commands: ['deploy'] }); } catch (e) { registered = false; console.warn('Deploy: Apps.register', e); }
  }
  registerApps();
  addEventListener('DOMContentLoaded', registerApps);
  addEventListener('hearth:apps-ready', registerApps);
  setTimeout(registerApps, 2500);
  // the Ctrl/⌘+K palette
  const paletteActions = () => {
    if (typeof AppUI === 'undefined' || !AppUI.addAction || paletteActions.done) return;
    paletteActions.done = true;
    AppUI.addAction('Publish the Lab scene on the web…', () => menuAt(null));
    AppUI.addAction('Adobe apps…', () => window.Adobe?.menu());
  };
  paletteActions();
  addEventListener('DOMContentLoaded', paletteActions);

  return { status, ask, sceneSpec, specOf, build, preview, check, publish, liveNote, rollback, remove, login, items, menuAt, historyMenu, historyItems, videoItems, history: async () => (await load()).slice(), registerApps, _test: { reset: () => { history = null; st = null; } } };
})();
window.Deploy = Deploy;
