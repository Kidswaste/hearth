// Read-only project readiness. Never marks another computer as ready or rewrites links.
const fs = require('fs');
const path = require('path');
const os = require('os');
const { fileURLToPath } = require('url');
const P = require('./packs-core');
async function json(dir, key, fallback) {
  try { return JSON.parse(await fs.promises.readFile(path.join(dir, 'kv', `${key}.json`), 'utf8')); }
  catch (err) { if (err.code === 'ENOENT') return fallback; throw new Error(`Couldn't read ${key}; try again after saving.`); }
}
async function check({ projectId, version = '0.186.1', download = false, dataDir, library }) {
  const [projects, scenes, extras, refs, cuts] = await Promise.all([
    json(dataDir, 'projects', { list: [] }), json(dataDir, 'three-sketches', []),
    json(dataDir, 'three-lab-extras', {}), json(dataDir, 'three-refs', {}), json(dataDir, 'video-cuts', {}),
  ]);
  const project = projects.list.find(p => p.id === projectId);
  if (!project) throw new Error('Open a project first, then prepare it for offline use.');
  const ids = new Set(project.items.filter(i => i.type === 'scene').map(i => i.ref));
  const sequences = Object.values(cuts).filter(c => ids.has(c.seq?.scene));
  for (const c of sequences) for (const clip of c.clips || []) if (clip.kind === 'scene' && clip.sketch) ids.add(clip.sketch);
  const chosen = scenes.filter(s => ids.has(s.id));
  const missingScenes = [...ids].filter(id => !chosen.some(s => s.id === id));
  const codes = chosen.flatMap(s => [s.code || '', ...(s.layers || []).map(l => l.code || '')]);
  // Runtime helper imports are part of opening the editor, even when no layer asks for them.
  codes.push(await fs.promises.readFile(path.join(__dirname, 'tools', 'three-sandbox.html'), 'utf8'));
  const libraries = ids.size ? await library.prepare(version, codes, Boolean(download)) : null;
  const boards = [], missingBoards = [];
  for (const item of project.items.filter(i => i.type === 'board')) {
    if (!/^[\w-]+$/.test(item.ref)) { missingBoards.push(item.name || 'Moodboard'); continue; }
    const board = await json(dataDir, `board-${item.ref}`, null);
    if (board) boards.push(board); else missingBoards.push(item.name || 'Moodboard');
  }
  const sources = { scenes: chosen, extras: [...ids].map(id => extras[id]), refs: [...ids].map(id => refs[id]), sequences, boards, files: project.items.filter(i => ['file', 'capture'].includes(i.type)) };
  const files = [];
  for (const src of P.collectPaths(sources)) {
    let local = src;
    try { if (src.startsWith('file:')) local = fileURLToPath(src); } catch { /* reported below */ }
    try { const hit = require('./reachmain').localize(local); if (hit?.path) local = hit.path; } catch { /* direct file */ }
    let status = 'missing', bytes = 0;
    try {
      const st = await fs.promises.stat(local);
      if (st.isFile()) { bytes = st.size; status = process.platform === 'darwin' && st.size > 0 && st.blocks === 0 ? 'cloud' : 'local'; }
    } catch { /* missing or waiting for sync */ }
    files.push({ name: path.win32.basename(path.posix.basename(src)), path: local, status, bytes });
  }
  if (process.platform === 'win32') {
    const cloud = require('./cloud-files');
    const attrs = await cloud.attributes(files.filter(f => f.status === 'local').map(f => f.path));
    for (const f of files) if (f.status === 'local' && cloud.pending(attrs.get(f.path))) f.status = 'cloud';
  }
  const external = [...new Set(codes.slice(0, -1).flatMap(code => (code.match(/https?:\/\/[^\s"'`<>\\)]+/g) || []).filter(url => !/^https?:\/\/www\.w3\.org\//.test(url))))];
  const chats = [];
  for (const i of project.items.filter(i => i.type === 'chat')) {
    let local = false;
    if (/^[\w-]+$/.test(i.ref)) try { const c = JSON.parse(await fs.promises.readFile(path.join(dataDir, 'chats', `${i.ref}.json`), 'utf8')); local = Array.isArray(c.messages); } catch { /* pending */ }
    chats.push({ name: i.name || 'Project chat', local });
  }
  return { name: project.name, computer: os.hostname(), platform: process.platform, at: Date.now(), libraries, files, chats, missingScenes, missingBoards, external,
    ready: !missingScenes.length && !missingBoards.length && (!libraries || libraries.ready) && files.every(f => f.status === 'local') && chats.every(c => c.local) && !external.length };
}
module.exports = { check };
