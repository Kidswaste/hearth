// MCP server for publishing (deploy.js / deploy-cmds.js through the hub): a Lab scene, a video, a folder or a project
// on Vercel, Netlify, Cloudflare Pages or GitHub Pages with their official CLIs. Opt-in per agent (/deploy-tools on).
// Build and preview are free to call; publish / rollback / remove always ask the owner first.
const { serve } = require('./common');

const TOOLS = [
  { name: 'deploy_do', description: 'Publish on the web. action: status (CLIs, sign-ins) · build | preview {what: scene|video|folder|project|page, path? (scene name, file, folder, "last"), html? (page)} → local URL, a check that it draws + a picture · publish {what, path?, provider: vercel|netlify|cloudflare|github, prod?} (the owner is asked first) · history · rollback {id?} · remove {id?, site?} · login {provider} (the service\'s own sign-in window; never ask for passwords or tokens).',
    inputSchema: { type: 'object', properties: { action: { type: 'string', enum: ['status', 'build', 'preview', 'publish', 'history', 'rollback', 'remove', 'login'] }, what: { type: 'string', enum: ['scene', 'video', 'folder', 'project', 'page'] }, path: { type: 'string' }, name: { type: 'string' }, html: { type: 'string' }, provider: { type: 'string' }, prod: { type: 'boolean' }, id: { type: 'string' }, site: { type: 'boolean' } }, required: ['action'] } },
];
const guide = 'PUBLISH (deploy_do): preview first, then publish; the owner approves every publish.';

module.exports = serve({ name: 'deploy', instructions: '', guide, tools: TOOLS, local: {} }, module);
