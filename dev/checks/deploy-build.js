// Agentic deployment in the app (round 14, deploy*.js), driven like a user with the fake CLIs in dev/fake-deploy:
// a Lab scene (two layers, sliders) built into a self-contained page FOR REAL (three.js copied next to it) and loaded
// in a hidden window, which must draw (not blank, no errors); the local preview serves it; /deploy publishes on
// "Vercel" and "Netlify" only after the confirm (Cancel publishes nothing), the history, rollback (asks), the agent
// tool (preview with a picture; publish asks too), /deploy status, the Lab's Sketch ▾ entry, the palette, menus.
//   node dev/smoke.js --check-timeout 300000 --script dev/checks/deploy-build.js --shot /tmp/deploy-build.png
const SHOTS = '/tmp/hearth-checks';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 20000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(100); } return null; };
const out = {}; const fail = [];
const ok = (cond, what) => { if (!cond) fail.push(what); return Boolean(cond); };
const C = H.claudeAgent();
const say = async (line) => { let text = ''; await Commands.tryRun(line, C.id, null, { say: (t) => { text = String(t); }, note: (t) => { text = String(t); } }); return text; };
// answers the confirm the publish flow shows (Access.ask when that stream is in, else a Modal)
async function answer(yes) {
  const d = await until(() => [...document.querySelectorAll('dialog[open]')].pop(), 30000);
  if (!d) return false;
  const btns = [...d.querySelectorAll('button')];
  const b = yes ? btns.find((x) => /publish|allow|roll back|delete|yes|ok|run/i.test(x.textContent)) : btns.find((x) => /cancel|no|deny|not now/i.test(x.textContent));
  out.dialogs = [...(out.dialogs || []), d.textContent.replace(/\s+/g, ' ').slice(0, 160)];
  b?.click();
  return Boolean(b);
}
try {
  window.DEPLOY_TEST_THREE = '/opt/cdn-cache/three@0.186.1/package';
  const F = `${window.SMOKE_DEV}/fake-deploy`;
  window.DEPLOY_TEST_PATHS = { vercel: `${F}/vercel`, netlify: `${F}/netlify`, cloudflare: `${F}/wrangler`, github: `${F}/gh` };
  // ---- 0. commands ----
  for (const n of ['deploy', 'publish', 'deploy-tools']) ok(Commands.get(n), `/${n} is registered`);
  ok(!(Commands.duplicates?.() || []).length, `no duplicate commands (${JSON.stringify(Commands.duplicates?.() || []).slice(0, 200)})`);
  const st = await say('/deploy status');
  out.status = st;
  ok(/Vercel\*\* signed in/.test(st) && /Netlify\*\* signed in/.test(st), 'the fake CLIs are found and signed in');

  // ---- 1. a Lab scene ----
  await ThreeLab.cmd();
  const name = `Deploy check ${Date.now().toString(36)}`;
  const code1 = "import * as THREE from 'three';\nconst P = tweak({ speed: [1, 0, 3], hue: [0.55, 0, 1] });\nconst r = new THREE.WebGLRenderer({ antialias: true, alpha: true }); r.setSize(innerWidth, innerHeight); document.body.append(r.domElement);\nconst scene = new THREE.Scene(); scene.background = new THREE.Color(0x203060);\nconst cam = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 100); cam.position.z = 4;\nconst m = new THREE.Mesh(new THREE.TorusKnotGeometry(1, 0.32, 160, 24), new THREE.MeshNormalMaterial()); scene.add(m);\nr.setAnimationLoop((t) => { m.rotation.y = t / 1000 * P.speed; r.render(scene, cam); });";
  const code2 = "import * as THREE from 'three';\nconst r = new THREE.WebGLRenderer({ alpha: true }); r.setSize(innerWidth, innerHeight); document.body.append(r.domElement);\nconst s = new THREE.Scene(); const c = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);\nconst q = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.3), new THREE.MeshBasicMaterial({ color: 0xffcc00 })); q.position.set(0.7, 0.7, 0); s.add(q);\nr.setAnimationLoop(() => r.render(s, c));";
  ThreeLab.scenes.create({ name, code: code1, layers: [{ id: 'main', name: 'Knot', code: code1, slot: 0 }, { id: 'l2', name: 'Badge', code: code2, slot: 1, blend: 'normal', opacity: 1 }] });
  const spec = await Deploy.sceneSpec(name);
  ok(spec.layers.length === 2 && spec.layers[1].name === 'Badge', 'the scene\'s two layers are taken');

  // ---- 2. the build, for real: a hidden window must see it draw ----
  const t0 = Date.now();
  const b = await Deploy.build('scene', name);
  out.build = { dir: b.dir, files: b.files, mb: Math.round(b.bytes / 104857.6) / 10, ms: Date.now() - t0, notes: b.notes };
  ok(b.files >= 5 && b.bytes > 1e6, `the page and three.js are in the build (${b.files} files)`);
  const pv = await Deploy.preview(b, { show: false });
  ok(/^http:\/\/127\.0\.0\.1:\d+\/$/.test(pv.url), `local preview at ${pv.url}`);
  const page = await window.hub.fetchText(pv.url).catch(() => '');
  ok(page.includes(`<title>${name}</title>`) && page.includes('lab.html?mode=sketch'), 'the preview serves the page');
  const chk = await Deploy.check(b);
  out.check = { ok: chk.ok, ready: chk.ready, drawn: chk.drawn, nonBlank: chk.nonBlank, colors: chk.colors, lit: chk.lit, errors: chk.errors, size: chk.size };
  ok(chk.ready && chk.drawn, 'the published page starts the Lab player and its layers draw');
  ok(chk.nonBlank && chk.colors > 8, `it shows a picture, not a blank page (${chk.colors} colors, ${chk.lit}% lit)`);
  ok(!(chk.errors || []).length, `no errors in the page (${(chk.errors || []).join(' | ').slice(0, 200)})`);
  ok(chk.ok, 'the check passes');
  if (chk.shot) await window.hub.fs.write(`${SHOTS}/deploy-page.png`, chk.shot.split(',')[1], { base64: true });

  // ---- 3. /deploy: Cancel publishes nothing; Publish goes live ----
  const before = (await Deploy.history()).length;
  const declined = say(`/deploy scene ${name} to vercel`);
  ok(await answer(false), 'a confirm shows before publishing');
  const dtext = await declined;
  ok(/Not published/.test(dtext) && /127\.0\.0\.1/.test(dtext), `Cancel: nothing published, the local preview is offered (${dtext.slice(0, 80)})`);
  ok((await Deploy.history()).length === before, 'nothing in the history');
  const live = say(`/deploy scene ${name} to vercel`);
  ok(await answer(true), 'Publish');
  const ltext = await live;
  out.live = ltext;
  ok(/is live on Vercel: https:\/\/deploy-check-[a-z0-9-]+\.vercel\.app/.test(ltext), `live on Vercel (${ltext.slice(0, 120)})`);
  const calls = (await window.hub.fs.read('/tmp/hearth-fake-deploy/calls.jsonl').catch(() => '')).trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
  const dep = calls.filter((c) => c.cli === 'vercel' && c.args[0] === 'deploy').pop();
  ok(dep && dep.args.includes('--prod') && dep.args.includes('--yes') && /[\\/]deploy[\\/]builds[\\/]deploy-check-/.test(dep.args[1]) && dep.args[4] === b.slug, `vercel deploy <build> --yes --name <slug> --prod (${dep?.args.join(' ').slice(0, 140)})`);
  // the second publish (another build of the same scene) replaces the first
  const again = say(`/publish scene ${name}`);
  ok(await answer(true), 'Publish again (the default service is now Vercel)');
  ok(/live on Vercel/.test(await again), 'published again on the remembered service');
  const h = await Deploy.history();
  ok(h[0].state === 'live' && h[1].state === 'replaced' && h[0].slug === h[1].slug, 'history: the new one is live, the old one replaced');
  ok(/1\. ▲ \*\*Deploy check/.test(await say('/deploy history')), '/deploy history lists it');
  // rollback (asks; Vercel switches back on its side)
  const rb = say('/deploy rollback');
  ok(await answer(true), 'rollback asks first');
  ok(/Rolled back \(switched on the service\)/.test(await rb), 'rolled back');
  ok((await Deploy.history()).find((e) => e.id === h[1].id).state === 'live', 'the earlier one is live again');

  // ---- 4. Netlify, a draft deploy ----
  const n = say(`/deploy scene ${name} to netlify draft`);
  ok(await answer(true), 'Netlify publish asks too');
  const ntext = await n;
  ok(/live on Netlify: https:\/\/dep[a-z0-9]+--deploy-check/.test(ntext), `a Netlify draft (${ntext.slice(0, 100)})`);
  ok((await Deploy.history())[0].site?.startsWith('site-deploy-check'), 'the Netlify site is remembered for next time');

  // ---- 5. the agent tool: preview (free, with a picture), publish (asks) ----
  const pr = await DeployCmds.handle('deploy_do', { action: 'preview', what: 'scene', path: name });
  ok(pr.ok && pr.value.draws === true && /127\.0\.0\.1/.test(pr.value.preview), `deploy_do preview: a local address and it draws (${JSON.stringify(pr.value).slice(0, 160)})`);
  ok(pr.images?.length === 1 && pr.images[0].data.length > 2000, 'the agent sees a picture of the page');
  const ap = DeployCmds.handle('deploy_do', { action: 'publish', what: 'scene', path: name, provider: 'vercel' });
  ok(await answer(false), 'an agent\'s publish asks the owner');
  const apr = await ap;
  ok(!apr.ok && /said no/.test(apr.error), 'and respects the answer');
  const ah = await DeployCmds.handle('deploy_do', { action: 'history' });
  ok(ah.ok && /Vercel/.test(ah.value), 'deploy_do history');

  // ---- 6. where it lives in the UI ----
  const items = await Deploy.items();
  const labels = items.map((x) => (typeof x === 'string' ? x : x.label));
  ok(labels.includes('This Lab scene') && labels.some((l) => /^History/.test(l)), `the publish menu (${labels.join(' | ')})`);
  ok(AppUI.actions().some((a) => /Publish the Lab scene on the web/.test(a.label)), 'Ctrl/⌘+K: Publish the Lab scene on the web…');
  const sketchBtn = [...document.querySelectorAll('button')].find((x) => /^Sketch ▾/.test(x.textContent));
  sketchBtn?.click(); await wait(300);
  // a long menu folds its sections: "This sketch ›" holds it
  const sec = [...document.querySelectorAll('.lab-pop .menu-item')].find((x) => /^This sketch/.test(x.textContent));
  if (sec && !/Publish & Adobe/.test(document.querySelector('.lab-pop')?.innerText || '')) { sec.click(); await wait(250); }
  const menuText = document.querySelector('.lab-pop')?.innerText || '';
  ok(/Publish & Adobe/.test(menuText), 'Lab Sketch ▾ → Publish & Adobe');
  await smoke({ shot: `${SHOTS}/deploy-sketch-menu.png` }).catch(() => {});
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await wait(200);
  if (window.Apps?.list) ok(window.Apps.list().some((a) => a.id === 'deploy'), 'Apps: Publish on the web');
} catch (err) {
  fail.push(`threw: ${err.stack || err.message}`);
}
return JSON.stringify({ ok: !fail.length, problems: fail, ...out }, null, 1);
