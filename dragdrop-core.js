// Drag and drop with Finder / Explorer (round 38, dragdrop): the model. No DOM, no IPC, no tokens; the window loads it
// as a <script> (global DragDropCore, lazy group "dragdrop"), dragdropmain.js require()s it, dev/dragdrop-test.js runs it
// with Mac and Windows paths whatever this computer is.
//   toPath(raw, { win })          a dropped / pasted path, a file: URL, a quoted path, \\?\ long names → a plain path
//   kindOf(name, mime)            image · video · audio · pack · model · sky · font · text · heic · pdf · archive · app · doc · other
//   cloudOf({ name, size, blocks, platform })   'icloud' for a file still in iCloud (not downloaded), else null
//   sniff(items)                  what the drag carries while it moves (the names aren't known yet: kinds + types only)
//   overlay(zone, sniff, o)       the words over the spot ("Drop to use as the song")
//   planChat(entries, o) · planLab(entries, o)   what happens to each dropped thing, what is skipped and why (one line)
//   summary(plan, done)           the one calm line after a drop
//   codeName(lang, code) · safeName(s) · parseClipboard(raw) · outSpec(spec)
// An entry: { name, path?, size?, isDir?, missing?, cloud?, mime?, blob? (a File without a path: a pasted screenshot,
// a picture dragged from a web page) }.
const DragDropCore = (() => {
  // eslint-disable-next-line no-undef
  const W = typeof WinMac !== 'undefined' ? WinMac : (typeof require === 'function' ? require('./winmac') : null);
  const MB = 1048576;
  const LIMITS = { chat: 20, lab: 12, textBytes: 200 * 1024, leanBytes: 64 * MB, bigImage: 25 * MB, huge: 2048 * MB, folders: 3 };

  // ---------- paths ----------
  const baseName = (p) => (W ? W.baseName(p) : String(p || '').split(/[\\/]/).pop());
  const extOf = (name) => { const m = /\.([^.\\/]+)$/.exec(String(name || '')); return m ? m[1].toLowerCase() : ''; };
  // a path as dropped, pasted or typed: quotes around it (Explorer's "Copy as path"), a file: URL (Mac pasteboards,
  // links), a Windows long name (\\?\C:\…), a Mac "~/…" stays as it is (main expands it), trailing slashes off
  function toPath(raw, { win = false } = {}) {
    let s = String(raw ?? '').trim();
    if (!s) return '';
    s = s.replace(/^(["'])(.*)\1$/, '$2').trim();
    if (/^file:/i.test(s)) s = W ? W.fromFileUrl(s, { win }) : decodeURIComponent(s.replace(/^file:\/\/(localhost)?/i, ''));
    s = s.replace(/^[\\/]{2}\?[\\/]UNC[\\/]/i, '\\\\').replace(/^[\\/]{2}\?[\\/]/, '');
    if (win && /^[A-Za-z]:\//.test(s)) s = s.replace(/\//g, '\\');
    if (s.length > 1 && !/^[A-Za-z]:[\\/]$/.test(s)) s = s.replace(/[\\/]+$/, '');
    return s;
  }
  const isAbsolute = (p) => /^(?:[A-Za-z]:[\\/]|[\\/]{2}[^\\/]|\/|~[\\/])/.test(String(p || ''));
  // a name as shown: a Mac's decomposed accents (é = e + ´) composed, so "été" from Finder reads and compares as typed
  const nice = (name) => { try { return String(name ?? '').normalize('NFC'); } catch { return String(name ?? ''); } };

  // ---------- kinds ----------
  const TEXT = /\.(txt|md|markdown|js|mjs|cjs|ts|tsx|jsx|json|csv|tsv|html?|css|glsl|frag|vert|py|xml|ya?ml|ini|log|sh|bat|ps1|c|cpp|h|hpp|cs|java|rs|go|lua|toml|svg|lrc|srt|vtt|rb|php|swift|kt|sql)$/i;
  const KINDS = [
    ['pack', /\.hearthpack$/i],
    ['heic', /\.(heic|heif)$/i],
    ['image', /\.(png|jpe?g|gif|webp|bmp|avif)$/i],
    ['video', /\.(mp4|webm|mov|m4v|mkv)$/i],
    ['audio', /\.(mp3|wav|ogg|oga|m4a|flac|aac|aiff?|opus)$/i],
    ['model', /\.(glb|gltf|fbx|obj|stl|ply)$/i],
    ['sky', /\.(hdr|exr)$/i],
    ['font', /\.(ttf|otf|woff2?)$/i],
    ['text', TEXT],
    ['pdf', /\.pdf$/i],
    ['archive', /\.(zip|rar|7z|tar|gz|tgz|bz2|xz|dmg|iso)$/i],
    ['app', /\.(exe|msi|app|pkg|dll|so|dylib|lnk|alias)$/i],
    ['doc', /\.(docx?|pptx?|xlsx?|key|pages|numbers|psd|ai|aep|prproj|blend|indd|sketch|fig)$/i],
  ];
  function kindOf(name, mime = '') {
    const n = String(name || '');
    const hit = KINDS.find(([, re]) => re.test(n));
    if (hit) return hit[0];
    const m = String(mime || '');
    if (/^image\/hei[cf]/.test(m)) return 'heic';
    if (/^image\//.test(m)) return 'image';
    if (/^video\//.test(m)) return 'video';
    if (/^audio\//.test(m)) return 'audio';
    if (/^text\//.test(m)) return 'text';
    return 'other';
  }
  const WORD = { image: 'picture', video: 'video', audio: 'sound', pack: 'pack', model: '3D model', sky: 'sky light', font: 'font', text: 'text file', heic: 'HEIC photo', pdf: 'PDF', archive: 'archive', app: 'program', doc: 'document', other: 'file', folder: 'folder' };
  const plural = (n, w) => `${n} ${w}${n === 1 ? '' : (/s$/.test(w) ? '' : 's')}`;

  // ---------- cloud placeholders ----------
  // iCloud Drive keeps a file that isn't downloaded yet as ".Name.ext.icloud" (older macOS) or as a "dataless" file:
  // a size but no blocks on disk (newer macOS). Reading either would stall or fail: say it plainly instead.
  const icloudName = (name) => { const m = /^\.(.+)\.icloud$/i.exec(String(name || '')); return m ? m[1] : null; };
  function cloudOf({ name = '', size = 0, blocks, platform = '' } = {}) {
    if (icloudName(name)) return 'icloud';
    if (platform === 'darwin' && size > 0 && blocks === 0) return 'icloud';
    return null;
  }

  // ---------- while dragging: what is coming (names come only with the drop) ----------
  // items: [{ kind: 'file' | 'string', type }] (DataTransfer.items) → { count, kinds: { image: n, … }, unknown, files }
  function sniff(items) {
    const files = [...(items || [])].filter((i) => i && i.kind === 'file');
    const kinds = {};
    let unknown = 0;
    for (const f of files) {
      const k = f.type ? kindOf('', f.type) : null;
      if (!k || k === 'other') unknown += 1; else kinds[k] = (kinds[k] || 0) + 1;
    }
    return { count: files.length, kinds, unknown, files: files.length > 0 };
  }
  const only = (s, k) => s.count > 0 && s.kinds[k] === s.count;
  // the words over the spot the pointer is on
  function overlay(zone, s = { count: 0, kinds: {}, unknown: 0 }, o = {}) {
    const n = s.count || 0;
    if (zone === 'slot') return `Drop to use as ${o.label || 'this'}`;
    if (zone === 'board') return `Drop to add to ${o.board ? `"${o.board}"` : 'the board'}`;
    if (zone === 'lab') {
      if (only(s, 'audio')) return n === 1 ? 'Drop to use as the song' : 'Drop: the first is the song, the rest references';
      if (only(s, 'video')) return n === 1 ? 'Drop to add a video layer' : `Drop to add ${n} video layers`;
      if (only(s, 'image')) return n === 1 ? 'Drop to add a picture layer' : `Drop to add ${Math.min(n, LIMITS.lab)} picture layers`;
      if (n === 1 && s.unknown === 1) return 'Drop to add it to this scene (a pack opens its preview)';
      return n > LIMITS.lab ? `Drop to add the first ${LIMITS.lab} to this scene` : 'Drop to add to this scene';
    }
    // a chat
    const who = o.ai ? ` for ${o.ai}` : '';
    if (n > LIMITS.chat) return `Drop to attach the first ${LIMITS.chat} of ${n}`;
    if (only(s, 'image')) return n === 1 ? `Drop to attach this picture${who}` : `Drop to attach ${n} pictures${who}`;
    if (only(s, 'video')) return n === 1 ? `Drop to attach the video's frames${who}` : `Drop to attach ${n} videos' frames${who}`;
    if (n === 1 && s.unknown === 1) return `Drop to attach${who} (a folder: let this AI use it)`;
    return n > 1 ? `Drop to attach ${n} files${who}` : `Drop to attach${who}`;
  }

  // ---------- one line per thing that can't be used ----------
  const size = (b) => (b >= 1024 * MB ? `${(b / 1024 / MB).toFixed(1)} GB` : b >= MB ? `${(b / MB).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
  function common(e) {
    const name = nice(e.name || baseName(e.path) || 'That file');
    const real = icloudName(name);
    if (e.cloud || real) return `${real || name} is still in iCloud: download it first (Finder: right-click › Download Now), then drop it again`;
    if (e.missing) return `${name} can't be found any more (moved, renamed or still copying?)`;
    return null;
  }

  // ---------- a chat ----------
  // o: { access (the AI may read files on this computer), cap }
  // steps' do: 'folder' (ask first: Let this AI use this folder) · 'image' (by path, previewed) · 'blob' (a picture
  // with no path: saved once to the attachments) · 'video' (its contact sheet) · 'text' (read in) · 'file' (by path:
  // the AI opens it) · 'pack' (the pack card handles it)
  function planChat(entries, o = {}) {
    const cap = o.cap || LIMITS.chat;
    const steps = []; const skipped = [];
    const list = [...(entries || [])];
    let folders = 0;
    for (const e of list.slice(0, cap)) {
      const why = common(e);
      if (why) { skipped.push({ name: e.name, why }); continue; }
      const name = nice(e.name || baseName(e.path));
      if (e.isDir) {
        folders += 1;
        if (folders > LIMITS.folders) skipped.push({ name, why: `${name}: one folder at a time is plenty (${LIMITS.folders} asked already)` });
        else steps.push({ e, do: 'folder' });
        continue;
      }
      const k = kindOf(name, e.mime);
      if (k === 'pack') { steps.push({ e, do: 'pack' }); continue; }
      if (k === 'heic') { skipped.push({ name, why: `${name} is a HEIC photo the AIs can't read: export it as JPEG (Photos: File › Export), then drop that` }); continue; }
      if (k === 'image') { steps.push({ e, do: e.path ? 'image' : 'blob', big: (e.size || 0) > LIMITS.bigImage }); continue; }
      if (!e.path) {
        if (k === 'text' && (e.size || 0) <= (o.lean ? LIMITS.leanBytes : LIMITS.textBytes)) steps.push({ e, do: 'blob' });
        else skipped.push({ name, why: `${name} has no place on this computer (save it first, then drop the file)` });
        continue;
      }
      if (k === 'video') { steps.push({ e, do: 'video' }); continue; }
      if (k === 'text' && (e.size || 0) <= LIMITS.textBytes) { steps.push({ e, do: 'text' }); continue; }
      // (round 40, attachlean) o.lean: a big text is read in and trimmed when sent (outline + the parts asked about)
      if (k === 'text' && !o.access && o.lean && (e.size || 0) <= LIMITS.leanBytes) { steps.push({ e, do: 'text', lean: true }); continue; }
      if (o.access) { steps.push({ e, do: 'file', big: (e.size || 0) > LIMITS.textBytes }); continue; }
      skipped.push({ name, why: k === 'text'
        ? `${name} is ${size(e.size || 0)}, too big to paste in: let this AI read files (⋯ AI setup › Files on this computer) and it's attached by its place instead`
        : `${name}: ${WORD[k] === 'file' ? `.${extOf(name) || '?'} files` : `${WORD[k]}s`} need this AI to read files (⋯ AI setup › Files on this computer)` });
    }
    return { steps, skipped, more: Math.max(0, list.length - cap) };
  }

  // ---------- the Lab preview ----------
  // o: { songLoaded (a real song, not the scene's own timeline), cap }
  // steps' do: 'song' · 'footage' (the Lab's video: frame-exact timeline + a Footage layer) · 'video-layer' (a looping
  // reference on its own layer, the song stays) · 'picture' (a reference + a picture layer) · 'model' (🧊) · 'ref'
  // (a reference: refs.<name>) · 'pack'
  function planLab(entries, o = {}) {
    const cap = o.cap || LIMITS.lab;
    const steps = []; const skipped = [];
    const list = [...(entries || [])];
    const anyAudio = list.some((e) => !e.isDir && kindOf(e.name, e.mime) === 'audio');
    let song = false; let footage = false;
    for (const e of list.slice(0, cap)) {
      const why = common(e);
      if (why) { skipped.push({ name: e.name, why }); continue; }
      const name = nice(e.name || baseName(e.path));
      if (e.isDir) { skipped.push({ name, why: `${name} is a folder: drop the files inside it` }); continue; }
      const k = kindOf(name, e.mime);
      if (k === 'pack') { steps.push({ e, do: 'pack' }); continue; }
      if (k === 'heic') { skipped.push({ name, why: `${name} is a HEIC photo: export it as JPEG first (Photos: File › Export)` }); continue; }
      if (!e.path && k !== 'image') { skipped.push({ name, why: `${name} has no place on this computer (save it first, then drop the file)` }); continue; }
      if ((e.size || 0) > LIMITS.huge) { skipped.push({ name, why: `${name} is ${size(e.size)}: too big for a scene (trim or compress it first)` }); continue; }
      if (k === 'audio') { steps.push({ e, do: song ? 'ref' : 'song' }); song = true; continue; }
      if (k === 'video') {
        if (!o.songLoaded && !anyAudio && !footage) { footage = true; steps.push({ e, do: 'footage' }); } else steps.push({ e, do: 'video-layer' });
        continue;
      }
      if (k === 'image') { steps.push({ e, do: 'picture' }); continue; }
      if (k === 'model' || k === 'sky') { steps.push({ e, do: 'model' }); continue; }
      if (k === 'font' || (k === 'text' && /\.(json|csv|tsv|txt|lrc|srt|vtt|svg)$/i.test(name))) { steps.push({ e, do: 'ref' }); continue; }
      skipped.push({ name, why: `The Lab can't use ${WORD[k] === 'file' ? `.${extOf(name) || '?'} files` : `${WORD[k]}s`}: songs, videos, pictures, 3D models, fonts and packs work` });
    }
    return { steps, skipped, more: Math.max(0, list.length - cap) };
  }

  // ---------- after the drop: one calm line ----------
  // done: [string] what happened ("Attached 3", "🎵 song.mp3 is the song")
  function summary(plan, done = []) {
    const parts = [...done];
    const sk = plan?.skipped || [];
    if (sk.length === 1) parts.push(sk[0].why);
    else if (sk.length > 1) parts.push(`${plural(sk.length, 'file')} left out: ${sk[0].why}${sk.length > 2 ? ` (and ${sk.length - 1} more)` : ` · ${sk[1].why}`}`);
    if (plan?.more) parts.push(`${plural(plan.more, 'more file')} not added (${plan.steps.length + sk.length} at a time: drop the rest next)`);
    return parts.filter(Boolean).join(' · ');
  }

  // ---------- out of Hearth ----------
  const EXT = { javascript: 'js', js: 'js', mjs: 'mjs', jsx: 'jsx', ts: 'ts', typescript: 'ts', tsx: 'tsx', python: 'py', py: 'py', html: 'html', css: 'css', json: 'json', glsl: 'glsl', frag: 'frag', vert: 'vert', shader: 'glsl', markdown: 'md', md: 'md', extendscript: 'jsx', bash: 'sh', sh: 'sh', shell: 'sh', zsh: 'sh', powershell: 'ps1', ps1: 'ps1', bat: 'bat', cmd: 'bat', yaml: 'yml', yml: 'yml', xml: 'xml', svg: 'svg', sql: 'sql', rust: 'rs', rs: 'rs', go: 'go', c: 'c', cpp: 'cpp', 'c++': 'cpp', cs: 'cs', csharp: 'cs', java: 'java', lua: 'lua', toml: 'toml', ini: 'ini', csv: 'csv', swift: 'swift', kotlin: 'kt', ruby: 'rb', php: 'php', text: 'txt', txt: 'txt' };
  // a name any file system takes: no / \ : * ? " < > |, no control characters, no trailing dots / spaces (Windows),
  // not a reserved Windows name, at most 120 characters
  function safeName(s, fallback = 'file') {
    let n = nice(s).replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim().replace(/\s+(\.[^.\s]+)$/, '$1').replace(/[. ]+$/, '');
    if (/^(con|prn|aux|nul|com\d|lpt\d)(\..*)?$/i.test(n)) n = `_${n}`;
    if (n.length > 120) { const x = extOf(n); n = `${n.slice(0, 110 - x.length).trim()}${x ? `.${x}` : ''}`; }
    return n || fallback;
  }
  // a reply's code block as a file: its own name when its first line gives one ("// file: scene.js", "# hello.py"),
  // else snippet.<ext> from the language (or what the code looks like)
  function codeName(lang, code = '') {
    const l = String(lang || '').toLowerCase().trim();
    const first = String(code).split('\n', 1)[0];
    const named = /^\s*(?:\/\/|#|--|\/\*|<!--)\s*(?:file(?:name)?:\s*)?([\w.\- ]+\.[A-Za-z0-9]{1,8})\s*(?:\*\/|-->)?\s*$/.exec(first);
    if (named && /\./.test(named[1]) && !/\s/.test(named[1].trim())) return safeName(named[1].trim());
    let ext = EXT[l];
    if (!ext) ext = /^\s*[{[]/.test(code) && /"\s*:/.test(code) ? 'json' : /<\/?[a-z][\s\S]*>/i.test(code) && /<html|<div|<body/i.test(code) ? 'html' : /\b(import|const|let|function)\b/.test(code) ? 'js' : 'txt';
    return `snippet.${ext}`;
  }
  // what the window asks main to drag out, checked: { path } | { paths } | { name, text } | { name, base64 }
  function outSpec(spec) {
    const s = spec || {};
    if (Array.isArray(s.paths)) { const paths = s.paths.map(String).filter(isAbsolute).slice(0, 100); return paths.length ? { paths } : null; }
    if (s.path) return isAbsolute(s.path) ? { path: String(s.path) } : null;
    if (s.text != null) return { name: safeName(s.name, 'snippet.txt'), text: String(s.text).slice(0, 20 * MB) };
    if (s.base64) return { name: safeName(s.name, 'picture.png'), base64: String(s.base64).replace(/^data:[^,]*,/, '') };
    if (s.dataUrl) return { name: safeName(s.name, 'picture.png'), base64: String(s.dataUrl).replace(/^data:[^,]*,/, '') };
    return null;
  }

  // ---------- the clipboard: files copied in Finder / Explorer ----------
  // raw: { fileUrl (Mac public.file-url), plist (Mac NSFilenamesPboardType), fileNameW (Windows, UTF-16 text),
  //   uriList (Linux / links), text (plain text: paths one per line) }, platform → [path]
  const unxml = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
  function parseClipboard(raw = {}, { win = false } = {}) {
    const out = [];
    const add = (p) => { const q = toPath(p, { win }); if (q && isAbsolute(q) && !out.includes(q)) out.push(q); };
    if (raw.plist) for (const m of String(raw.plist).matchAll(/<string>([^<]+)<\/string>/g)) add(unxml(m[1]));
    if (raw.fileNameW) add(String(raw.fileNameW).replace(/\u0000+$/g, ''));
    if (raw.fileUrl) for (const l of String(raw.fileUrl).split(/\r?\n/)) if (/^file:/i.test(l.trim())) add(l.trim());
    if (raw.uriList) for (const l of String(raw.uriList).split(/\r?\n/)) if (l && !l.startsWith('#') && /^file:/i.test(l.trim())) add(l.trim());
    if (!out.length && raw.text) {
      const lines = String(raw.text).split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
      if (lines.length && lines.length <= 100 && lines.every((l) => /^file:/i.test(l) || isAbsolute(toPath(l, { win })))) lines.forEach(add);
    }
    return out;
  }
  // pasted text that is just a file's name (what Finder puts as text when you copy a file): worth asking the clipboard
  const looksLikeName = (t) => { const s = String(t || '').trim(); return !s || (s.length < 260 && !/[\n\\/]/.test(s) && /\.[A-Za-z0-9]{1,8}$/.test(s)); };

  // ---------- a picture layer (a reference's texture, fitted to the frame) ----------
  function pictureLayer(key) {
    const k = String(key).replace(/[^\w$]/g, '_');
    return `import * as THREE from 'three';

// A dropped picture as a layer: refTexture('${k}') (🖼 References), fitted to the frame.
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(2, devicePixelRatio));
renderer.setSize(innerWidth, innerHeight);
document.body.append(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
const P = tweak({
  fit: { value: 'cover', options: ['cover', 'fit', 'stretch'], label: 'Fit', group: 'Picture' },
  zoom: { value: 1, min: 0.25, max: 4, label: 'Zoom', group: 'Picture' },
  drift: { value: 0, min: 0, max: 1, label: 'Slow drift', group: 'Picture' },
});
const tex = refTexture('${k}');
const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true });
const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
scene.add(quad);
addEventListener('resize', () => renderer.setSize(innerWidth, innerHeight));
renderer.setAnimationLoop((t) => {
  const img = tex.image; const iw = img?.width || img?.videoWidth || 1; const ih = img?.height || img?.videoHeight || 1;
  const ra = innerWidth / innerHeight; const ia = iw / ih;
  let sx = 1; let sy = 1;
  if (P.fit === 'cover') { if (ra > ia) sy = ra / ia; else sx = ia / ra; } else if (P.fit === 'fit') { if (ra > ia) sx = ia / ra; else sy = ra / ia; }
  const d = 1 + P.drift * 0.06 * (1 + Math.sin((globalThis.layer?.scene ?? t / 1000) * 0.3));
  quad.scale.set(sx * P.zoom * d, sy * P.zoom * d, 1);
  renderer.render(scene, camera);
});
`;
  }

  return { LIMITS, toPath, isAbsolute, nice, baseName, extOf, kindOf, WORD, icloudName, cloudOf, sniff, overlay, planChat, planLab, summary, safeName, codeName, outSpec, parseClipboard, looksLikeName, pictureLayer, size };
})();
if (typeof module !== 'undefined') module.exports = DragDropCore;
