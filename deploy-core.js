// Agentic deployment (round 14), the model: no DOM and no Electron (deploymain.js runs the CLIs, deploy.js drives it
// from Hearth and chat; dev/deploy-test.js checks this file in Node).
//   PROVIDERS        Vercel, Netlify, Cloudflare Pages, GitHub Pages: their official CLI, how to install it, how it
//                    signs in (the CLI's own browser flow, in a window you can see), the arguments of each step, and
//                    how to read the address it printed
//   slug(name)       a site / project name the services accept
//   parseUrl(p, out) the public address in a CLI's output
//   history          add / find / previous live deploy of the same site (rollback), states
//   kinds            what can be published: a Lab scene (a self-contained page), a video (a player page), a folder
//                    (a static site as it is), a project (a folder the service builds itself: package.json…)
//   hostPage(spec)   the page that plays a Lab scene (it hosts the Lab's own player, lab.html, with the scene's layers)
//   videoPage(spec)  the page that plays a video
const DeployCore = (() => {
  // steps return argument lists; `site` is the provider's site / project id we keep in the history
  const PROVIDERS = [
    {
      id: 'vercel', name: 'Vercel', cli: 'vercel', icon: '▲',
      install: { mac: 'npm install -g vercel', win: 'npm install -g vercel', other: 'npm install -g vercel' },
      needsNode: true,
      login: ['login'], whoami: ['whoami'], version: ['--version'],
      signedOut: /no existing credentials|not logged in|please log in|Error: .*credentials/i,
      deploy: ({ dir, slug, prod }) => ['deploy', dir, '--yes', '--name', slug, ...(prod ? ['--prod'] : [])],
      remove: ({ url }) => ['remove', url, '--yes'],
      rollback: ({ url }) => ['rollback', url, '--yes'],
      url: /https:\/\/[a-z0-9.-]+\.vercel\.app\b/i,
      canRemoveDeploy: true, canRollback: true, projects: true,
      home: 'https://vercel.com/dashboard',
    },
    {
      id: 'netlify', name: 'Netlify', cli: 'netlify', icon: '◆',
      install: { mac: 'npm install -g netlify-cli', win: 'npm install -g netlify-cli', other: 'npm install -g netlify-cli' },
      needsNode: true,
      login: ['login'], whoami: ['status'], version: ['--version'],
      signedOut: /not logged in|you are not logged|login required/i,
      createSite: ({ slug }) => ['sites:create', '--name', slug, '--json'],
      deploy: ({ dir, site, prod }) => ['deploy', '--dir', dir, '--json', '--site', site, ...(prod ? ['--prod'] : [])],
      remove: ({ site }) => ['sites:delete', site, '--force'],
      rollback: ({ site, deployId }) => ['api', 'restoreSiteDeploy', '--data', JSON.stringify({ site_id: site, deploy_id: deployId })],
      url: /https:\/\/[a-z0-9.-]+\.netlify\.app\b/i,
      canRemoveDeploy: false, canRollback: true, projects: true,
      home: 'https://app.netlify.com/',
    },
    {
      id: 'cloudflare', name: 'Cloudflare Pages', cli: 'wrangler', icon: '☁',
      install: { mac: 'npm install -g wrangler', win: 'npm install -g wrangler', other: 'npm install -g wrangler' },
      needsNode: true,
      login: ['login'], whoami: ['whoami'], version: ['--version'],
      signedOut: /not authenticated|You are not logged in|wrangler login/i,
      createSite: ({ slug }) => ['pages', 'project', 'create', slug, '--production-branch', 'main'],
      deploy: ({ dir, slug, prod }) => ['pages', 'deploy', dir, '--project-name', slug, '--branch', prod ? 'main' : 'preview', '--commit-dirty=true'],
      remove: ({ slug }) => ['pages', 'project', 'delete', slug, '--yes'],
      url: /https:\/\/[a-z0-9.-]+\.pages\.dev\b/i,
      canRemoveDeploy: false, canRollback: false, projects: false,
      home: 'https://dash.cloudflare.com/?to=/:account/pages',
    },
    {
      id: 'github', name: 'GitHub Pages', cli: 'gh', icon: '⌥',
      install: { mac: 'brew install gh', win: 'winget install GitHub.cli', other: 'see https://cli.github.com' },
      needsNode: false, needsGit: true,
      login: ['auth', 'login', '--web', '--git-protocol', 'https'], whoami: ['auth', 'status'], version: ['--version'],
      signedOut: /not logged in|You are not logged into any GitHub hosts|gh auth login/i,
      user: ['api', 'user', '--jq', '.login'],
      createSite: ({ slug }) => ['repo', 'create', slug, '--public', '--description', 'Published from Hearth'],
      pages: ({ owner, slug }) => ['api', '-X', 'POST', `repos/${owner}/${slug}/pages`, '-f', 'source[branch]=gh-pages', '-f', 'source[path]=/'],
      remove: ({ owner, slug }) => ['repo', 'delete', `${owner}/${slug}`, '--yes'],
      url: /https:\/\/[a-z0-9-]+\.github\.io\/[\w.-]*/i,
      canRemoveDeploy: false, canRollback: false, projects: false,
      home: 'https://github.com/',
    },
  ];
  const ALIASES = { vercel: 'vercel', netlify: 'netlify', cloudflare: 'cloudflare', 'cloudflare pages': 'cloudflare', pages: 'cloudflare', cf: 'cloudflare', wrangler: 'cloudflare', github: 'github', 'github pages': 'github', gh: 'github', ghpages: 'github', 'gh-pages': 'github' };
  const provider = (id) => PROVIDERS.find((p) => p.id === (ALIASES[String(id || '').toLowerCase().trim()] || id)) || null;
  const installHint = (p, platform) => p.install[platform === 'darwin' ? 'mac' : platform === 'win32' ? 'win' : 'other'];

  // a name every service accepts: lowercase letters, digits and dashes, 3–40 long
  function slug(name, prefix = 'hearth') {
    let s = String(name || '').normalize('NFKD').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40).replace(/-+$/, '');
    if (s.length < 3) s = `${prefix}-${s || 'page'}`.replace(/-+$/, '');
    return s;
  }
  // the public address in what the CLI printed (JSON first: Netlify's --json)
  function parseUrl(p, out) {
    const text = String(out || '');
    try {
      const j = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1));
      const url = j.deploy_url || j.url || j.ssl_url || j.site_url;
      if (url) return { url, deployId: j.deploy_id || j.id || null, site: j.site_id || null, siteUrl: j.url || j.ssl_url || null };
    } catch { /* plain text */ }
    const all = [...text.matchAll(new RegExp(p.url.source, 'gi'))].map((m) => m[0].replace(/[).,]+$/, ''));
    return all.length ? { url: all[all.length - 1] } : null;
  }

  // ---------- kinds ----------
  const KINDS = [
    { id: 'scene', name: 'Lab scene', hint: 'The scene as a web page: three.js and its code inside, plays anywhere' },
    { id: 'video', name: 'Video', hint: 'A page that plays a video (a render, a sequence, a recording)' },
    { id: 'folder', name: 'Folder', hint: 'A static site as it is (it must have an index.html)' },
    { id: 'project', name: 'Project', hint: 'A web project the service builds itself (package.json…): Vercel and Netlify' },
  ];

  // ---------- history ----------
  // entry: { id, provider, kind, name, slug, site, owner, url, deployId, build, prod, at, state, from }
  const uid = () => `d${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;
  function add(list, e) {
    const entry = { id: uid(), at: Date.now(), state: 'live', ...e };
    // a new production deploy of the same site replaces the live one
    const out = list.map((x) => (x.provider === entry.provider && x.slug === entry.slug && x.state === 'live' && entry.prod && x.prod ? { ...x, state: 'replaced' } : x));
    return [entry, ...out].slice(0, 200);
  }
  const find = (list, ref) => {
    const s = String(ref ?? '').trim();
    if (!s || s === 'last') return list[0] || null;
    if (/^\d+$/.test(s)) return list[Number(s) - 1] || null;
    return list.find((x) => x.id === s || x.url === s || x.slug === s) || list.find((x) => (x.name || '').toLowerCase().includes(s.toLowerCase())) || null;
  };
  // the deploy of the same site before this one (what a rollback goes back to)
  function previous(list, entry) {
    const same = list.filter((x) => x.provider === entry.provider && x.slug === entry.slug && x.at < entry.at && x.state !== 'removed' && x.id !== entry.id);
    return same.sort((a, b) => b.at - a.at)[0] || null;
  }
  const STATES = { live: 'live', replaced: 'replaced', rolledback: 'rolled back', removed: 'removed', failed: 'failed', preview: 'preview' };
  function line(e, i) {
    const p = provider(e.provider);
    const when = new Date(e.at);
    return `${i != null ? `${i + 1}. ` : ''}${p?.icon || '•'} **${e.name || e.slug}** on ${p?.name || e.provider} · ${STATES[e.state] || e.state}${e.prod ? '' : ' (preview)'} · ${when.toLocaleDateString()} ${when.toLocaleTimeString().slice(0, 5)}${e.url ? `\n   ${e.url}` : ''}`;
  }

  // ---------- pages ----------
  const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const json = (v) => JSON.stringify(v).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
  const meta = (spec) => `<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(spec.title)}</title>
<meta property="og:title" content="${esc(spec.title)}">
<meta name="description" content="${esc(spec.description || `${spec.title}, made with Hearth`)}">
<meta name="generator" content="Hearth">${spec.poster ? `\n<meta property="og:image" content="${esc(spec.poster)}">` : ''}`;
  // spec: { title, version, layers: [{ id, code, …props }], palette, refs: [{ key, kind, mime, file }], frame: { w, h } }
  // The page hosts lab.html (the Lab's own player, three.js from ./three/) and hands it the scene like the Lab does.
  // window.__hearthBuild tells a checker how it went: { ready, drawn, errors }.
  function hostPage(spec) {
    const frame = spec.frame?.w && spec.frame?.h ? spec.frame : null;
    const q = `mode=sketch&v=${encodeURIComponent(spec.version)}&n=1${frame ? `&fw=${frame.w}&fh=${frame.h}` : ''}`;
    return `<!doctype html>
<html lang="en">
<head>
${meta(spec)}
<style>
  html, body { margin: 0; height: 100%; background: #000; overflow: hidden; }
  #stage { position: fixed; inset: 0; display: grid; place-items: center; }
  iframe { border: 0; display: block; width: 100%; height: 100%; background: #000; }
  ${frame ? `iframe { width: min(100vw, calc(100vh * ${frame.w} / ${frame.h})); height: min(100vh, calc(100vw * ${frame.h} / ${frame.w})); }` : ''}
  #hint { position: fixed; left: 12px; bottom: 10px; font: 12px system-ui, sans-serif; color: #fff8; pointer-events: none; transition: opacity .6s; }
</style>
</head>
<body>
<div id="stage"><iframe id="lab" title="${esc(spec.title)}" allow="autoplay; fullscreen" src="lab.html?${q}"></iframe></div>
<div id="hint">${esc(spec.title)}</div>
<script>
// Made with Hearth: the scene's layers run in the Lab's own player (lab.html), three.js r${esc(String(spec.version).split('.')[1] || '')} from ./three/.
(function () {
  var SCENE = ${json({ layers: spec.layers, palette: spec.palette || [], refs: (spec.refs || []).map((r) => ({ key: r.key, kind: r.kind, mime: r.mime, file: r.file })) })};
  var state = window.__hearthBuild = { ready: false, drawn: false, errors: [], started: Date.now() };
  var lab = document.getElementById('lab');
  var send = function (m) { m.target = 'three-sandbox'; lab.contentWindow.postMessage(m, '*'); };
  function refs() {
    return Promise.all(SCENE.refs.map(function (r) {
      return fetch(r.file).then(function (res) { return res.arrayBuffer(); }).then(function (buffer) { return { key: r.key, kind: r.kind, mime: r.mime, buffer: buffer }; }).catch(function () { return null; });
    })).then(function (list) { return list.filter(Boolean); });
  }
  addEventListener('message', function (e) {
    var d = e.data || {};
    if (e.source !== lab.contentWindow || d.source !== 'three-sandbox') return;
    if (d.type === 'ready' && !state.ready) {
      state.ready = true;
      refs().then(function (items) {
        send({ type: 'tweak-init', values: {}, keys: {}, mods: {} });
        send({ type: 'refs', items: items, palette: SCENE.palette });
        send({ type: 'run-layers', layers: SCENE.layers });
      });
    }
    if (d.type === 'stack-drawn') { state.drawn = true; setTimeout(function () { document.getElementById('hint').style.opacity = 0; }, 2500); }
    if (d.type === 'error') state.errors.push(String(d.message || 'error') + (d.line ? ' (line ' + d.line + ')' : ''));
  });
  addEventListener('keydown', function (e) { if (e.key === 'f' || e.key === 'F') { (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen()).catch(function () {}); } });
})();
</script>
</body>
</html>
`;
  }
  // spec: { title, file (video file name in the build), poster, loop, w, h }
  function videoPage(spec) {
    return `<!doctype html>
<html lang="en">
<head>
${meta(spec)}
<style>
  html, body { margin: 0; height: 100%; background: #000; }
  body { display: grid; place-items: center; }
  video { max-width: 100vw; max-height: 100vh; width: auto; height: auto; display: block; }
</style>
</head>
<body>
<video src="${esc(spec.file)}"${spec.poster ? ` poster="${esc(spec.poster)}"` : ''} autoplay muted ${spec.loop === false ? '' : 'loop '}playsinline controls${spec.w ? ` width="${Number(spec.w)}" height="${Number(spec.h)}"` : ''}></video>
<script>window.__hearthBuild = { ready: true, drawn: false, errors: [] }; document.querySelector('video').addEventListener('loadeddata', function () { window.__hearthBuild.drawn = true; });</script>
</body>
</html>
`;
  }
  // the ES module imports of a code text ('three/addons/x.js', './y.js'), static and dynamic with a plain string
  function importsOf(code) {
    const out = new Set();
    const s = String(code || '');
    for (const m of s.matchAll(/\b(?:import|export)\s*(?:[\w*{}\s,$]+\s*from\s*)?['"]([^'"\n]+)['"]/g)) out.add(m[1]);
    for (const m of s.matchAll(/\bimport\s*\(\s*['"]([^'"\n]+)['"]\s*\)/g)) out.add(m[1]);
    return [...out];
  }
  // 'three' / 'three/addons/x.js' / 'three/examples/jsm/x.js' → the file inside the three package ('build/three.module.js'…)
  function threePath(spec) {
    if (spec === 'three') return 'build/three.module.js';
    const m = spec.match(/^three\/(?:addons|examples\/jsm)\/(.+)$/);
    if (m) return `examples/jsm/${m[1]}`;
    if (/^three\/(build|src|examples)\//.test(spec)) return spec.slice(6);
    return null;
  }

  return { PROVIDERS, ALIASES, provider, installHint, slug, parseUrl, KINDS, add, find, previous, STATES, line, hostPage, videoPage, importsOf, threePath, esc, uid };
})();
if (typeof module !== 'undefined') module.exports = DeployCore;
