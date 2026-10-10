#!/usr/bin/env node
// Stand-ins for the publishing CLIs (vercel, netlify, wrangler, gh) for dev/deploy-test.js and dev/checks/deploy-*.js.
// Each shim next to this file runs `node fake-cli.js <name> …args`. Every call is appended to
// <state>/calls.jsonl ({ cli, args, cwd }); <state>/signedout-<cli> makes that CLI answer "not signed in";
// <state>/fail-<cli> makes its deploy fail. State: $FAKE_DEPLOY_STATE or <tmp>/hearth-fake-deploy.
// gh's "repo create" makes a real bare git repository there, so the GitHub Pages push runs real git.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const [cli, ...args] = process.argv.slice(2);
const STATE = process.env.FAKE_DEPLOY_STATE || path.join(os.tmpdir(), 'hearth-fake-deploy');
fs.mkdirSync(STATE, { recursive: true });
fs.appendFileSync(path.join(STATE, 'calls.jsonl'), `${JSON.stringify({ cli, args, cwd: process.cwd(), at: Date.now() })}\n`);
const out = (s) => process.stdout.write(`${s}\n`);
const err = (s) => process.stderr.write(`${s}\n`);
const signedOut = fs.existsSync(path.join(STATE, `signedout-${cli}`));
const failing = fs.existsSync(path.join(STATE, `fail-${cli}`));
const has = (f) => args.includes(f);
const after = (f) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : null; };
const rand = () => Math.random().toString(36).slice(2, 10);
const done = (code = 0) => process.exit(code);

if (has('--version')) { out(`${cli} 9.9.9 (fake)`); done(); }
if (args[0] === 'login' || (cli === 'gh' && args[0] === 'auth' && args[1] === 'login')) { out(`Fake ${cli} sign-in: a browser would open here.`); fs.rmSync(path.join(STATE, `signedout-${cli}`), { force: true }); done(); }

if (cli === 'vercel') {
  if (args[0] === 'whoami') { if (signedOut) { err('Error: No existing credentials found. Please run `vercel login` or pass "--token"'); done(1); } out('owner'); done(); }
  if (signedOut) { err('Error: No existing credentials found. Please run `vercel login` or pass "--token"'); done(1); }
  if (args[0] === 'deploy') {
    const dir = args[1];
    if (!fs.existsSync(path.join(dir, 'index.html')) && !fs.existsSync(path.join(dir, 'package.json'))) { err('Error: nothing to deploy'); done(1); }
    if (failing) { err('Error: The deployment failed (fake).'); done(1); }
    const slug = after('--name') || 'site';
    err(`Vercel CLI 9.9.9\n🔍  Inspect: https://vercel.com/owner/${slug}/${rand()} [1s]`);
    out(`https://${slug}-${rand()}-owner.vercel.app`);
    if (has('--prod')) err(`✅  Production: https://${slug}.vercel.app [2s]`);
    done();
  }
  if (args[0] === 'remove' || args[0] === 'rollback') { out(`Success: ${args[0]} ${args[1]}`); done(); }
}

if (cli === 'netlify') {
  if (args[0] === 'status') { if (signedOut) { out('Not logged in. Please log in to see site status.'); done(); } out('Current Netlify User\nName: Owner\nEmail: owner@example.com'); done(); }
  if (signedOut) { err('Error: You are not logged in. Run netlify login'); done(1); }
  if (args[0] === 'sites:create') { const name = after('--name'); if (fs.existsSync(path.join(STATE, `netlify-${name}`))) { err(`Error: Site name ${name} already exists`); done(1); } fs.writeFileSync(path.join(STATE, `netlify-${name}`), ''); out(JSON.stringify({ id: `site-${name}`, name, ssl_url: `https://${name}.netlify.app`, url: `https://${name}.netlify.app` })); done(); }
  if (args[0] === 'deploy') {
    if (failing) { err('Error: Deploy did not succeed (fake)'); done(1); }
    const site = after('--site'); const name = String(site).replace(/^site-/, ''); const id = `dep${rand()}`;
    out(JSON.stringify({ site_id: site, site_name: name, deploy_id: id, deploy_url: `https://${id}--${name}.netlify.app`, ...(has('--prod') ? { url: `https://${name}.netlify.app` } : {}), logs: 'https://app.netlify.com/' }));
    done();
  }
  if (args[0] === 'api' || args[0] === 'sites:delete') { out('{}'); done(); }
}

if (cli === 'wrangler') {
  if (args[0] === 'whoami') { out(signedOut ? 'You are not authenticated. Please run `wrangler login`.' : 'You are logged in with an OAuth Token, associated with the email owner@example.com.'); done(); }
  if (signedOut) { err('✘ [ERROR] You are not logged in. Run wrangler login'); done(1); }
  if (args[0] === 'pages' && args[1] === 'project' && args[2] === 'create') { const n = args[3]; if (fs.existsSync(path.join(STATE, `cf-${n}`))) { err(`✘ [ERROR] A project with this name already exists. [code: 8000002]`); done(1); } fs.writeFileSync(path.join(STATE, `cf-${n}`), ''); out(`✨ Successfully created the '${n}' project.`); done(); }
  if (args[0] === 'pages' && args[1] === 'deploy') {
    if (failing) { err('✘ [ERROR] Deployment failed (fake)'); done(1); }
    const n = after('--project-name');
    out(`🌎  Uploading... (3/3)\n✨ Success! Uploaded 3 files (0.42 sec)\n🌎 Deploying...\n✨ Deployment complete! Take a peek over at https://${rand().slice(0, 8)}.${n}.pages.dev`);
    done();
  }
  if (args[0] === 'pages' && args[1] === 'project' && args[2] === 'delete') { out('Deleted'); done(); }
}

if (cli === 'gh') {
  if (args[0] === 'auth' && args[1] === 'status') { if (signedOut) { err('You are not logged into any GitHub hosts. To log in, run: gh auth login'); done(1); } out('github.com\n  ✓ Logged in to github.com account owner (keyring)'); done(); }
  if (args[0] === 'auth' && args[1] === 'git-credential') done();
  if (signedOut) { err('To get started with GitHub CLI, please run:  gh auth login'); done(4); }
  if (args[0] === 'api' && args[1] === 'user') { out('owner'); done(); }
  if (args[0] === 'repo' && args[1] === 'create') {
    const n = args[2]; const bare = path.join(STATE, 'remotes', `${n}.git`);
    if (fs.existsSync(bare)) { err('GraphQL: Name already exists on this account (createRepository)'); done(1); }
    fs.mkdirSync(path.dirname(bare), { recursive: true });
    spawnSync('git', ['init', '-q', '--bare', bare]);
    out(`https://github.com/owner/${n}`); done();
  }
  if (args[0] === 'repo' && args[1] === 'view') { const n = String(args[2]).split('/').pop(); out(`file://${path.join(STATE, 'remotes', n)}`); done(); }
  if (args[0] === 'api') { out('{"status":"built"}'); done(); }
  if (args[0] === 'repo' && args[1] === 'delete') { fs.rmSync(path.join(STATE, 'remotes', `${String(args[2]).split('/').pop()}.git`), { recursive: true, force: true }); out('✓ Deleted repository'); done(); }
}

err(`fake ${cli}: unknown command ${args.join(' ')}`);
done(2);
