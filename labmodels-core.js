// (round 99, labmodels99) A 3D model made of several files, in the Lab itself. Round 98 (assetdeps-core.js) made such a
// model travel whole in project files; the Lab's own "add a reference" still copied the main file alone, and its preview
// read a reference as one file. Now:
//   - adding a reference copies the model and every file it names into data/refs/<time>-<name>/, in their layout
//     (store.js importRef → projbundlemain.js copyAsset → assetdeps-core.js plan); a file it names that isn't there is
//     named plainly (missingText: "wheels.bin isn't next to car.gltf")
//   - the preview gets the model's other files with it and its loaders find them (tools/three-sandbox.html
//     refModelResolve: a resource path of the model's own, its manager's URL modifier answering it)
//   - a drop of a folder, or of a .gltf with its .bin and pictures at once, adds the model once (groupDrop)
// Pure: no DOM, no IPC. The window loads it as a <script> (global LabModelsCore, lazy group "lab"), store.js /
// dev/labmodels99-test.js require() it.
const LabModelsCore = (() => {
  // a model that may name other files (its preview needs them: the Lab's loaders read .gltf / .glb / .obj (+ .mtl))
  const MULTI = /\.(gltf|glb|obj)$/i;
  const isMulti = (p) => MULTI.test(String(p || ''));
  // any model the Lab reads (a folder dropped: what is in it)
  const MODEL = /\.(glb|gltf|obj|fbx|stl|ply)$/i;
  const isModel = (p) => MODEL.test(String(p || ''));
  const base = (p) => String(p || '').replace(/[\\/]+$/, '').split(/[\\/]/).pop();
  // a reference copied whole: data/refs/<time>-<name>/<rel> → { dir, rel } (rel with "/"); a single file → null
  // (the same folder rule as tools/three.js trashRefFile and projbundlemain.js untake)
  function folderOf(p) {
    const m = /^(.*[\\/]refs[\\/]\d{10,}-[^\\/]+)[\\/](.+)$/.exec(String(p || ''));
    return m ? { dir: m[1], rel: m[2].split(/[\\/]+/).join('/') } : null;
  }
  // the plan's missing entries ({ name, of, why? }) in plain words
  function missingText(gone) {
    return (Array.isArray(gone) ? gone : []).filter((m) => m && m.name).map((m) => (m.why ? `${m.name} (used by ${m.of}): ${m.why}` : `${m.name} isn't next to ${m.of}`));
  }
  // "a/./b/../c" → "a/c" (null when it climbs out of the model's folder)
  function normRel(rel) {
    const out = [];
    for (const s of String(rel || '').split(/[\\/]+/)) {
      if (!s || s === '.') continue;
      if (s === '..') { if (!out.length) return null; out.pop(); } else out.push(s);
    }
    return out.join('/');
  }
  // what the preview resolves (tools/three-sandbox.html refModelResolve does the same; the unit test runs both):
  // a URL under the model's own prefix → the file of its folder (rel from the folder's top), else null
  //   prefix 'hearth-ref://m3/', files Map(rel → url); the URL is the loader's: resource path + the URI as written
  function resolve(url, prefix, files) {
    const u = String(url || '');
    if (!u.startsWith(prefix)) return null;
    let rest = u.slice(prefix.length).replace(/[?#].*$/, '');
    try { rest = rest.split('/').map((s) => decodeURIComponent(s)).join('/'); } catch { /* as written */ }
    const rel = normRel(rest);
    if (rel == null) return null;
    if (files.has(rel)) return files.get(rel);
    const lc = rel.normalize('NFC').toLowerCase(); // (written on Windows: another case)
    for (const [k, v] of files) if (k.normalize('NFC').toLowerCase() === lc) return v;
    return null;
  }
  // the preview's resource path for a model at `mainRel` in its folder: the prefix + the model's own folder
  const baseOf = (prefix, mainRel) => { const d = String(mainRel || '').split('/').slice(0, -1).join('/'); return d ? `${prefix}${d.split('/').map(encodeURIComponent).join('/')}/` : prefix; };
  const key = (p) => String(p || '').replace(/\\/g, '/').normalize('NFC').toLowerCase(); // winmac-ok (paths compared the Windows / Mac way: case and separators)
  // a drop (or a pick) of files and folders → what to add:
  //   entries [{ name, path, isDir }]; list(dir) → [{ path, name, isDir, size }] (a folder's files, recursive);
  //   uses(paths) → { [path]: [this computer's files the model names] }
  // → { add: [entry], with: [{ model, n }], folders: [{ name, why? }] }
  //   - a folder: the models in it (up to `maxModels`); none → named ("…: no 3D model in it")
  //   - a file a model of the drop names (its .bin, its .mtl, its pictures) isn't added on its own: it comes with the model
  async function groupDrop(entries, { list, uses, maxModels = 4 } = {}) {
    const add = []; const folders = [];
    for (const e of entries || []) {
      if (!e?.isDir) { add.push(e); continue; }
      let files = [];
      try { files = (await list(e.path)) || []; } catch (err) { folders.push({ name: e.name || base(e.path), why: `${e.name || base(e.path)}: its files couldn't be listed (${err?.message || 'error'})` }); continue; }
      const models = files.filter((f) => !f.isDir && isModel(f.name || f.path)).sort((a, b) => String(a.path).length - String(b.path).length || String(a.path).localeCompare(String(b.path)));
      if (!models.length) { folders.push({ name: e.name || base(e.path), why: `${e.name || base(e.path)} is a folder with no 3D model in it: drop the files inside it` }); continue; }
      folders.push({ name: e.name || base(e.path), models: Math.min(models.length, maxModels) });
      for (const f of models.slice(0, maxModels)) add.push({ name: f.name || base(f.path), path: f.path, size: f.size || 0, isDir: false, from: e.path });
    }
    const multi = add.filter((e) => e.path && isMulti(e.path));
    let used = {};
    if (multi.length && uses) { try { used = (await uses(multi.map((e) => e.path))) || {}; } catch { used = {}; } }
    const taken = new Map(); // file → the model that brings it
    for (const m of multi) for (const f of used[m.path] || []) if (key(f) !== key(m.path) && !taken.has(key(f))) taken.set(key(f), m);
    const out = []; const withN = new Map();
    for (const e of add) {
      const m = e.path ? taken.get(key(e.path)) : null;
      if (m && m !== e && !taken.has(key(m.path))) { withN.set(m, (withN.get(m) || 0) + 1); continue; }
      out.push(e);
    }
    return { add: out, with: [...withN].map(([model, n]) => ({ model: model.name || base(model.path), n })), folders };
  }
  return { isMulti, isModel, folderOf, missingText, normRel, resolve, baseOf, groupDrop, key };
})();
if (typeof module !== 'undefined') module.exports = LabModelsCore;
