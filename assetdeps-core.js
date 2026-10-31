// (round 98, bundle98) A 3D model made of several files, carried whole by Export / Import / ⧉ Duplicate project.
// A .gltf names its .bin buffers and its texture pictures by relative URI ("model.bin", "textures/wood.png",
// "../shared/rock.jpg"); an .obj names its .mtl (mtllib), and the .mtl its pictures (map_Kd, bump, …). Until this round
// a project file and a duplicate carried only the main file: the model arrived without its geometry and textures.
// The Lab's loaders (tools/sandbox-lab3d.js): GLTFLoader (.glb, .gltf), FBXLoader, OBJLoader, STLLoader, PLYLoader.
// Of those, .gltf and .obj (with its .mtl) are made of several files; a .glb can name outside files too (rare: it is
// looked inside the same way); .stl and .ply are one file; an .fbx's textures are almost always inside it (its
// outside texture paths are absolute paths of the computer that made it: not followed).
// plan(main, { fs, path, name, maxLen, maxDepth }) → every file the model names, found on this computer, each with the
// place it goes, relative to a folder of its own, so the URIs inside still find them:
//   { main: { rel, data? }, files: [{ abs, rel, data? }], missing: [{ name, of, why? }], moved }
// - the layout is kept: "textures/wood.png" goes in textures/ next to the model, "../shared/rock.jpg" one folder up (the
//   model then goes in a folder named as its own is); nothing inside the model is rewritten
// - unless it must be: a URI that is an absolute path (the other computer's), one with "\" (a Mac reads it as part of
//   the name), a name a project file may not hold (a dotfile, CON, a trailing dot, ":"), two names that differ only by
//   case (one file on Windows and the Mac): that file goes in hearth-files/<n>-<name> and only that URI changes
//   (data: the rewritten model); a .glb's JSON isn't rewritten (its file is kept as it is: such a file is named missing)
// - a URI found by another case on this computer (written on Windows, "Textures/A.PNG" for textures/a.png) is packed
//   under the URI's own spelling, so it is found on a computer where case matters
// - a file it names that isn't here is in `missing` (named in "What was skipped": never dropped silently)
// - data: and http(s): URIs are inside the model or on the web: nothing to carry
// No DOM, no IPC: projbundle-work.js runs it on the main process's thread; dev/bundle98-test.js in Node.
const AssetDepsCore = (() => {
  const MAX_TEXT = 64 * 1048576; // a .gltf / .obj / .mtl looked inside (a bigger .obj: its mtllib lines found by chunks)
  const MAX_NODES = 2000;
  const MOVED = 'hearth-files';
  const kindOf = (p) => { const m = /\.(gltf|glb|obj|mtl)$/i.exec(String(p || '')); return m ? m[1].toLowerCase() : null; };
  // a model that may name other files (the main files a project points at)
  const isModel = (p) => ['gltf', 'glb', 'obj'].includes(kindOf(p));
  const base = (p) => String(p || '').replace(/[\\/]+$/, '').split(/[\\/]/).pop();
  const RESERVED = /^(con|prn|aux|nul|com\d|lpt\d)(\.|$)/i;
  // a folder or file name a project file may hold (projbundle-core.js entryOk, one segment)
  const segOk = (s) => typeof s === 'string' && Boolean(s) && s !== '.' && s !== '..' && !s.startsWith('.') && !RESERVED.test(s) && !/[ .]$/.test(s) && s.length <= 160 && !/[\u0000-\u001f\u007f\\:*?"<>|]/.test(s);
  // a name made safe for a moved file (no spaces either: an .mtl line is split on them by some readers)
  const safeSeg = (s, n = 100) => String(s || 'file').replace(/[<>:"/\\|?*\u0000-\u001f\u007f\s]+/g, '_').replace(/^[._]+/, '').replace(/[ .]+$/, '').replace(RESERVED, '_$1$2').slice(0, n) || 'file';
  const ciKey = (s) => String(s).normalize('NFC').toLowerCase();

  // ---------- the URIs a file names ----------
  // gltf / glb JSON → [{ uri, at: ['buffers' | 'images', i] }]
  function gltfUris(json) {
    const out = [];
    for (const k of ['buffers', 'images']) {
      const list = Array.isArray(json?.[k]) ? json[k] : [];
      list.forEach((x, i) => { if (x && typeof x.uri === 'string' && x.uri) out.push({ uri: x.uri, at: [k, i] }); });
    }
    return out;
  }
  // a .glb's JSON chunk (its header and first chunk only)
  function glbJson(head) {
    if (head.length < 20 || head.readUInt32LE(0) !== 0x46546c67) return null;
    const len = head.readUInt32LE(12);
    if (head.readUInt32LE(16) !== 0x4e4f534a || 20 + len > head.length) return null;
    return JSON.parse(head.subarray(20, 20 + len).toString('utf8'));
  }
  // .obj: mtllib lines (the rest of the line is the name, as three.js's OBJLoader reads it)
  // .mtl: map_* / bump / disp / decal / refl / norm lines, their options (-s 1 1 1, -bm 0.5, …) first
  const OPT_ARGS = { '-blendu': 1, '-blendv': 1, '-boost': 1, '-mm': 2, '-o': 3, '-s': 3, '-t': 3, '-texres': 1, '-clamp': 1, '-bm': 1, '-imfchan': 1, '-type': 1, '-cc': 1 };
  function textUris(text, kind) {
    const out = [];
    const lines = text.split('\n');
    lines.forEach((line, i) => {
      if (kind === 'obj') {
        const m = /^(\s*mtllib\s+)(.*?)\s*$/.exec(line);
        if (m && m[2]) out.push({ uri: m[2], at: i, start: m[1].length, end: m[1].length + m[2].length });
        return;
      }
      const m = /^(\s*(?:map_\w+|bump|disp|decal|refl|norm)\s+)(.*?)\s*$/i.exec(line);
      if (!m || !m[2]) return;
      // options first: each with its numbers (the variable ones take up to 3 numbers)
      let rest = m[2]; let off = m[1].length;
      for (;;) {
        const o = /^(-\w+)\s+/.exec(rest);
        if (!o || !OPT_ARGS[o[1]]) break;
        let eat = o[0].length; let n = 0;
        for (; n < OPT_ARGS[o[1]]; n += 1) {
          const a = /^(\S+)(\s+|$)/.exec(rest.slice(eat));
          if (!a || (n > 0 && !/^[-+]?\d*\.?\d+(e[-+]?\d+)?$/i.test(a[1]) && OPT_ARGS[o[1]] === 3)) break;
          eat += a[0].length;
        }
        rest = rest.slice(eat); off += eat;
      }
      if (rest) out.push({ uri: rest, at: i, start: off, end: off + rest.length });
    });
    return out;
  }
  // what a URI is: { type: 'data' | 'remote' | 'none' } (nothing to carry), { type: 'abs', path } or { type: 'rel', segs, slash }
  function parseUri(uri, kind) {
    let s = String(uri || '').trim();
    if (!s) return { type: 'none' };
    if (/^data:/i.test(s)) return { type: 'data' };
    const gl = kind === 'gltf' || kind === 'glb';
    const dec = (x) => { if (!gl) return x; try { return decodeURIComponent(x); } catch { return x; } };
    if (/^file:/i.test(s)) { let p = dec(s.replace(/^file:\/\/(localhost)?/i, '')); if (/^\/[A-Za-z]:[\\/]/.test(p)) p = p.slice(1); return { type: 'abs', path: p }; }
    if (/^[A-Za-z]:[\\/]/.test(s) || /^[\\/]/.test(s)) return { type: 'abs', path: dec(s) };
    if (/^[a-z][a-z0-9+.-]*:/i.test(s)) return { type: 'remote' };
    if (gl) s = s.replace(/[?#].*$/, '');
    s = dec(s);
    return { type: 'rel', segs: s.split(/[\\/]+/).filter((x) => x && x !== '.'), slash: s.includes('\\') };
  }
  // segments with "." gone and ".." taken against what is before it (leading ".." kept: above the model's folder)
  function normSegs(segs) {
    const out = [];
    for (const s of segs) {
      if (s === '.' || !s) continue;
      if (s === '..' && out.length && out[out.length - 1] !== '..') out.pop(); else out.push(s);
    }
    return out;
  }
  const ups = (v) => { let k = 0; while (v[k] === '..') k += 1; return k; };

  // ---------- this computer's files ----------
  function fileAt(fs, p) { try { const st = fs.statSync(p); return st.isFile() ? p : null; } catch { return null; } }
  // a relative URI from a folder → the file (the same spelling first, else each name by another case: written on Windows)
  function resolveCi(fs, path, dir, segs) {
    const exact = fileAt(fs, path.resolve(dir, ...segs));
    if (exact) return exact;
    let cur = path.resolve(dir);
    for (let i = 0; i < segs.length; i += 1) {
      const s = segs[i];
      if (s === '..') { cur = path.dirname(cur); continue; }
      const next = path.join(cur, s);
      let st = null; try { st = fs.statSync(next); } catch { /* by another case */ }
      if (st) { cur = next; continue; }
      let names = []; try { names = fs.readdirSync(cur); } catch { return null; }
      const hit = names.find((n) => ciKey(n) === ciKey(s));
      if (!hit) return null;
      cur = path.join(cur, hit);
    }
    return fileAt(fs, cur);
  }
  // a model's own text (and its URIs), or its JSON chunk (.glb)
  function readNode(fs, n) {
    const st = fs.statSync(n.abs);
    if (n.kind === 'glb') {
      const fd = fs.openSync(n.abs, 'r');
      try {
        const h = Buffer.alloc(20); fs.readSync(fd, h, 0, 20, 0);
        if (h.readUInt32LE(0) !== 0x46546c67) return { uris: [], rewritable: false };
        const len = Math.min(h.readUInt32LE(12), MAX_TEXT);
        const all = Buffer.alloc(20 + len); h.copy(all); fs.readSync(fd, all, 20, len, 20);
        return { uris: gltfUris(glbJson(all)), rewritable: false };
      } finally { fs.closeSync(fd); }
    }
    if (st.size <= MAX_TEXT) {
      const text = fs.readFileSync(n.abs, 'utf8').replace(/^﻿/, '');
      if (n.kind === 'gltf') { const json = JSON.parse(text); return { json, text, uris: gltfUris(json), rewritable: true }; }
      return { text, uris: textUris(text, n.kind), rewritable: true };
    }
    if (n.kind !== 'obj') return { uris: [], rewritable: false, tooBig: true };
    // a big .obj: its mtllib lines found by chunks (not rewritten)
    const uris = []; const fd = fs.openSync(n.abs, 'r'); const buf = Buffer.alloc(1 << 20); let carry = ''; let pos = 0;
    try {
      for (;;) {
        const got = fs.readSync(fd, buf, 0, buf.length, pos); if (!got) break; pos += got;
        const parts = (carry + buf.subarray(0, got).toString('utf8')).split('\n'); carry = parts.pop();
        for (const l of parts) if (/^\s*mtllib\s/.test(l)) uris.push(...textUris(l, 'obj'));
      }
      if (/^\s*mtllib\s/.test(carry)) uris.push(...textUris(carry, 'obj'));
    } finally { fs.closeSync(fd); }
    return { uris, rewritable: false };
  }

  // ---------- the plan ----------
  function plan(mainAbs, { fs, path, name = null, maxLen = 220, maxDepth = 14 } = {}) {
    // (its own name: the caller's safe one, as before this round: nothing names the model itself)
    const main = { abs: mainAbs, kind: kindOf(mainAbs), vpath: [name || safeSeg(base(mainAbs), 120)], depth: 0, refs: [], main: true };
    const nodes = [main]; const byAbs = new Map([[ciKey(path.resolve(mainAbs)), main]]);
    const missing = []; const queue = [main];
    while (queue.length && nodes.length < MAX_NODES) {
      const c = queue.shift();
      let r;
      try { r = readNode(fs, c); } catch { r = { uris: [], rewritable: false }; }
      Object.assign(c, { json: r.json, text: r.text, rewritable: r.rewritable });
      if (r.tooBig) missing.push({ name: base(c.abs), of: base(c.abs), why: 'too big to look inside: the files it names weren\'t checked' });
      const cdir = c.vpath.slice(0, -1);
      for (const u of r.uris) {
        const p = parseUri(u.uri, c.kind);
        if (p.type !== 'abs' && p.type !== 'rel') continue;
        const shown = p.type === 'abs' ? base(p.path) : p.segs[p.segs.length - 1] || String(u.uri);
        const abs = p.type === 'abs' ? fileAt(fs, p.path) : p.segs.length ? resolveCi(fs, path, path.dirname(c.abs), p.segs) : null;
        if (!abs) { missing.push({ name: shown, of: base(c.abs) }); continue; }
        const want = p.type === 'rel' ? normSegs([...cdir, ...p.segs]) : null; // where the URI says it is (null: an absolute path)
        let n = byAbs.get(ciKey(path.resolve(abs)));
        if (!n) {
          if (nodes.length >= MAX_NODES) { missing.push({ name: shown, of: base(c.abs), why: 'too many files' }); continue; }
          n = { abs, kind: c.kind === 'obj' && kindOf(abs) === 'mtl' ? 'mtl' : null, vpath: want, // (a URI with "\\": its place kept, the URI written with "/")
            shown, parent: c, depth: c.depth + 1, refs: [] };
          nodes.push(n); byAbs.set(ciKey(path.resolve(abs)), n);
          if (n.kind && n.depth <= 3) queue.push(n);
        }
        c.refs.push({ u, n, want: p.slash ? null : want });
      }
    }
    // where each goes: its URI's place (with the folders above the model it climbs to, named as on this computer), or
    // moved to hearth-files/ when it can't (its parent's URI then rewritten); one that can't move is missing
    const realDir = path.resolve(path.dirname(mainAbs)).split(/[\\/]+/).filter(Boolean);
    let k = 0;
    const move = (n) => {
      const par = n.parent;
      if (!par || !par.rewritable) { n.drop = true; missing.push({ name: n.shown, of: base(par?.abs || mainAbs), why: 'its name can\'t travel and the model can\'t be changed' }); return; }
      k += 1; n.vpath = [...par.vpath.slice(0, -1), MOVED, `${k}-${safeSeg(n.shown)}`]; n.moved = true;
    };
    for (const n of nodes) if (!n.main && !n.vpath) move(n);
    let finalOf = null;
    for (let round = 0; round < 12; round += 1) {
      const live = nodes.filter((n) => !n.drop);
      const up = Math.max(0, ...live.map((n) => ups(n.vpath)));
      const prefix = up <= realDir.length ? realDir.slice(realDir.length - up) : null;
      const bad = new Set();
      if (!prefix || !prefix.every(segOk)) { for (const n of live) if (!n.main && ups(n.vpath) === up && up > 0) bad.add(n); }
      else {
        finalOf = (n) => normSegs([...prefix, ...n.vpath]);
        const seen = new Map();
        for (const n of live) {
          const f = finalOf(n);
          const ok = f.length && !f.includes('..') && f.every(segOk) && f.join('/').length <= maxLen && f.length <= maxDepth;
          if (!ok && !n.main) { bad.add(n); continue; }
          const key = ciKey(f.join('/'));
          if (seen.has(key) && !n.main) { bad.add(n); continue; }
          seen.set(key, n);
        }
      }
      if (!bad.size) break;
      for (const n of bad) { if (n.moved) { n.drop = true; missing.push({ name: n.shown, of: base(n.parent?.abs || mainAbs), why: 'its place in the project file is too deep' }); } else move(n); }
      finalOf = null;
    }
    if (!finalOf) return { main: { rel: main.vpath.join('/') }, files: [], missing: [...missing, ...nodes.filter((n) => !n.main && !n.drop).map((n) => ({ name: n.shown, of: base(n.parent.abs), why: 'it couldn\'t be placed' }))], moved: 0 };
    // the URIs that must change: a ref whose file isn't where its URI says
    const enc = (segs, kind) => segs.map((s) => (kind === 'gltf' || kind === 'glb' ? encodeURIComponent(s) : s)).join('/');
    const relFrom = (fromDir, to) => { let i = 0; while (i < fromDir.length && i < to.length - 1 && fromDir[i] === to[i]) i += 1; return [...fromDir.slice(i).map(() => '..'), ...to.slice(i)]; };
    let moved = 0;
    for (const c of nodes) {
      if (c.drop || !c.refs.length) continue;
      const cdir = finalOf(c).slice(0, -1);
      const edits = [];
      for (const r of c.refs) {
        if (r.n.drop) continue;
        const at = finalOf(r.n);
        const said = r.want ? finalOf({ vpath: r.want }) : null;
        if (said && said.join('/') === at.join('/')) continue;
        edits.push({ r, to: enc(relFrom(cdir, at), c.kind) });
      }
      if (!edits.length) continue;
      if (!c.rewritable) { for (const e of edits) { e.r.n.drop = true; missing.push({ name: e.r.n.shown, of: base(c.abs), why: 'its name can\'t travel and the model can\'t be changed' }); } continue; }
      moved += edits.length;
      if (c.kind === 'gltf') { const j = JSON.parse(JSON.stringify(c.json)); for (const e of edits) j[e.r.u.at[0]][e.r.u.at[1]].uri = e.to; c.data = Buffer.from(JSON.stringify(j, null, /\n/.test(c.text) ? 2 : 0)); }
      else {
        const lines = c.text.split('\n');
        for (const e of edits) { const l = lines[e.r.u.at]; lines[e.r.u.at] = l.slice(0, e.r.u.start) + e.to + l.slice(e.r.u.end); }
        c.data = Buffer.from(lines.join('\n'));
      }
    }
    const used = new Set(); // (a file only a dropped one named: not carried)
    const walk = (c) => { for (const r of c.refs || []) if (!r.n.drop && !used.has(r.n)) { used.add(r.n); walk(r.n); } };
    walk(main);
    const files = nodes.filter((n) => !n.main && used.has(n)).map((n) => ({ abs: n.abs, rel: finalOf(n).join('/'), ...(n.data ? { data: n.data } : {}) }));
    return { main: { rel: finalOf(main).join('/'), ...(main.data ? { data: main.data } : {}) }, files, missing, moved };
  }
  // the lines "What was skipped" shows for a plan's missing files
  const missingLines = (missing, how = 'not on this computer') => (missing || []).map((m) => `${m.name} (used by ${m.of}: ${m.why || how})`);

  return { kindOf, isModel, segOk, safeSeg, parseUri, normSegs, gltfUris, glbJson, textUris, resolveCi, plan, missingLines, MOVED };
})();
if (typeof module !== 'undefined') module.exports = AssetDepsCore;
