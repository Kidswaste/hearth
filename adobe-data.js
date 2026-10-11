// The Adobe suite bridges' model (round 14; adobemain.js runs the scripts, adobe.js drives them from Hearth and chat).
// No DOM and no Electron: it runs in the app, in the main process and in Node for the unit tests (dev/adobe-test.js).
//   APPS                         the apps Hearth drives: how to find them (Mac / Windows), how scripts reach them
//   wrap(code, resultFile)       an ExtendScript program around `code` (a function body): it returns JSON and also
//                                writes it to resultFile (UTF-8), so every runner (AppleScript, COM, the CEP bridge)
//                                reads the same answer whatever its own text encoding
//   ps / ai / id / pr / me / ae  the actions as ExtendScript (open, layered board, actions, export sizes, back to Hearth,
//                                SVG export, FCP XML import, Media Encoder queue…)
//   applescript(app, file)       the osascript program that runs a script file in a Mac app
//   vbscript(app, file)          the cscript program that runs it on Windows (COM)
//   toFcpXml(edit, opts)         a CutData edit (the Lab sequence) as Final Cut Pro 7 XML (xmeml 4), which Premiere imports
//   cepManifest() / cepPanel()   the small invisible "Hearth bridge" panel for Premiere Pro and Media Encoder (they
//                                have no AppleScript / COM door: the panel runs the scripts Hearth drops in a folder)
const AdobeData = (() => {
  // how: 'js' = AppleScript `do javascript` / COM DoJavaScriptFile, 'idjs' = InDesign's `do script … language
  // javascript` / DoScript, 'cep' = the Hearth bridge panel, 'ae' = the After Effects bridge (aemain.js)
  // mac: the folder in /Applications and the .app inside it; win: the .exe under Program Files\Adobe\<folder>
  const APPS = [
    { id: 'photoshop', name: 'Photoshop', short: 'Ps', folder: /^Adobe Photoshop/i, app: /^Adobe Photoshop.*\.app$/i, win: ['Photoshop.exe'], com: 'Photoshop.Application', how: 'js', opens: /\.(psd|psb|png|jpe?g|tiff?|gif|webp|bmp|heic|exr|hdr|tga)$/i, color: '#31a8ff', web: 'https://www.adobe.com/products/photoshop.html' },
    { id: 'illustrator', name: 'Illustrator', short: 'Ai', folder: /^Adobe Illustrator/i, app: /^Adobe Illustrator.*\.app$/i, win: [['Support Files', 'Contents', 'Windows', 'Illustrator.exe']], com: 'Illustrator.Application', how: 'js', opens: /\.(ai|eps|svg|pdf|png|jpe?g)$/i, color: '#ff9a00' },
    { id: 'premiere', name: 'Premiere Pro', short: 'Pr', folder: /^Adobe Premiere Pro/i, app: /^Adobe Premiere Pro.*\.app$/i, win: ['Adobe Premiere Pro.exe'], cep: 'PPRO', how: 'cep', opens: /\.(prproj|xml|mp4|mov|m4v|webm|mxf|wav|mp3|aif+)$/i, color: '#9999ff' },
    { id: 'mediaencoder', name: 'Media Encoder', short: 'Me', folder: /^Adobe Media Encoder/i, app: /^Adobe Media Encoder.*\.app$/i, win: ['Adobe Media Encoder.exe'], cep: 'AME', how: 'cep', opens: /\.(mp4|mov|m4v|webm|mxf|avi|prproj|aep)$/i, color: '#8f7cff' },
    { id: 'indesign', name: 'InDesign', short: 'Id', folder: /^Adobe InDesign/i, app: /^Adobe InDesign.*\.app$/i, win: ['InDesign.exe'], com: 'InDesign.Application', how: 'idjs', opens: /\.(indd|idml|pdf)$/i, color: '#ff3366' },
    { id: 'aftereffects', name: 'After Effects', short: 'Ae', how: 'ae', opens: /\.(aep|mp4|mov|png|jpe?g|psd|ai|wav|mp3)$/i, color: '#9999ff' },
  ];
  const ALIASES = { ps: 'photoshop', photoshop: 'photoshop', ai: 'illustrator', illustrator: 'illustrator', pr: 'premiere', ppro: 'premiere', premiere: 'premiere', 'premiere pro': 'premiere', me: 'mediaencoder', ame: 'mediaencoder', 'media encoder': 'mediaencoder', mediaencoder: 'mediaencoder', encoder: 'mediaencoder', id: 'indesign', indesign: 'indesign', ae: 'aftereffects', 'after effects': 'aftereffects', aftereffects: 'aftereffects' };
  const app = (id) => APPS.find((a) => a.id === (ALIASES[String(id || '').toLowerCase().trim()] || id)) || null;
  // the web apps (windows in Hearth: the Apps registry, or a window of their own)
  const WEB = [
    { id: 'adobe-express', name: 'Adobe Express', icon: '✦', url: 'https://new.express.adobe.com/', desc: 'Quick social posts, flyers, resize for every network, templates' },
    { id: 'adobe-firefly', name: 'Adobe Firefly', icon: '✧', url: 'https://firefly.adobe.com/', desc: 'Generate images, video and sound effects (uses your generative credits)' },
  ];

  // ---------- ExtendScript plumbing ----------
  // A JS value as an ExtendScript literal (JSON is valid ES3 except for two line separators).
  const lit = (v) => JSON.stringify(v === undefined ? null : v).replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
  // Old ExtendScript engines have no JSON: a small serializer (Files and Folders become their paths).
  const JSON_ES3 = 'function __hq(s){return \'"\'+String(s).replace(/[\\\\"]/g,function(c){return \'\\\\\'+c;}).replace(/\\n/g,\'\\\\n\').replace(/\\r/g,\'\\\\r\').replace(/\\t/g,\'\\\\t\')+\'"\';}\n'
    + 'function __hj(v){if(v===null||v===undefined)return \'null\';var t=typeof v;if(t===\'number\')return isFinite(v)?String(v):\'null\';if(t===\'boolean\')return String(v);if(t===\'string\')return __hq(v);'
    + 'if((typeof File!==\'undefined\'&&v instanceof File)||(typeof Folder!==\'undefined\'&&v instanceof Folder))return __hq(v.fsName);'
    + 'if(v instanceof Array){var a=[];for(var i=0;i<v.length;i++)a.push(__hj(v[i]));return \'[\'+a.join(\',\')+\']\';}'
    + 'var o=[];for(var k in v){if(v.hasOwnProperty(k)&&typeof v[k]!==\'function\')o.push(__hq(k)+\':\'+__hj(v[k]));}return \'{\'+o.join(\',\')+\'}\';}\n';
  // code: a function body that returns a value; it may throw (the error comes back in plain words).
  function wrap(code, resultFile) {
    return `// Made by Hearth (adobe-data.js). Safe to delete.\n${JSON_ES3}(function(){\nvar __s;\ntry { var __r = (function(){\n${code}\n})(); __s = '{"ok":true,"value":' + __hj(__r) + '}'; }\n`
      + 'catch (e) { __s = \'{"ok":false,"error":\' + __hq(String(e && e.message ? e.message : e) + (e && e.line ? \' (line \' + e.line + \')\' : \'\')) + \'}\'; }\n'
      + `${resultFile ? `try { var __f = new File(${lit(resultFile)}); __f.encoding = 'UTF-8'; __f.open('w'); __f.write(__s); __f.close(); } catch (e2) {}\n` : ''}return __s;\n})();\n`;
  }
  // The answer a runner printed (or the result file held): { ok, value } / { ok: false, error }.
  function parseResult(text) {
    const s = String(text || '').trim();
    if (!s) return null;
    const line = s.split(/\r?\n/).reverse().find((l) => /^\{"ok":/.test(l.trim())) || s;
    try { const r = JSON.parse(line.trim()); return typeof r === 'object' && r && 'ok' in r ? r : { ok: true, value: r }; } catch { return { ok: true, value: s }; }
  }

  // ---------- Photoshop ----------
  const PS_PRE = 'app.displayDialogs = DialogModes.NO; var __ru = app.preferences.rulerUnits; app.preferences.rulerUnits = Units.PIXELS;';
  const PS_POST = 'app.preferences.rulerUnits = __ru;';
  const psBody = (body) => `${PS_PRE}\ntry {\n${body}\n} finally { ${PS_POST} }`;
  const ps = {
    // open a file (a Lab still, a board picture, a render's frame); the document comes to the front
    open: (file) => psBody(`var d = app.open(new File(${lit(file)}));\nreturn { name: d.name, w: d.width.as('px'), h: d.height.as('px'), layers: d.layers.length };`),
    // the open documents
    docs: () => 'var out = []; for (var i = 0; i < app.documents.length; i++) { var d = app.documents[i]; var p = null; try { p = d.fullName.fsName; } catch (e) {} out.push({ name: d.name, path: p, w: d.width.as(\'px\'), h: d.height.as(\'px\'), active: d === app.activeDocument }); } return out;',
    // a board (pictures at their places on the board) as one layered document, saved as a PSD
    // items: [{ path, name, x, y, w, h }] bottom first, in the document's pixels
    board: ({ items, w, h, name = 'Hearth board', out, bg = 'white' }) => psBody(`var items = ${lit(items)};
var doc = app.documents.add(${Math.round(w)}, ${Math.round(h)}, 72, ${lit(name)}, NewDocumentMode.RGB, ${bg === 'transparent' ? 'DocumentFill.TRANSPARENT' : bg === 'black' ? 'DocumentFill.BACKGROUNDCOLOR' : 'DocumentFill.WHITE'});
var placed = 0, skipped = [];
for (var i = 0; i < items.length; i++) {
  var it = items[i]; var f = new File(it.path);
  if (!f.exists) { skipped.push(it.name || it.path); continue; }
  var src = app.open(f);
  try { if (src.layers.length > 1) src.flatten(); src.resizeImage(UnitValue(Math.max(1, Math.round(it.w)), 'px'), UnitValue(Math.max(1, Math.round(it.h)), 'px'), 72, ResampleMethod.BICUBIC); src.activeLayer.duplicate(doc, ElementPlacement.PLACEATBEGINNING); }
  finally { src.close(SaveOptions.DONOTSAVECHANGES); }
  app.activeDocument = doc;
  var L = doc.layers[0]; L.name = it.name || f.name; var b = L.bounds;
  L.translate(UnitValue(Math.round(it.x) - b[0].as('px'), 'px'), UnitValue(Math.round(it.y) - b[1].as('px'), 'px'));
  placed++;
}
${out ? `doc.saveAs(new File(${lit(out)}), new PhotoshopSaveOptions(), false);` : ''}
return { name: doc.name, layers: placed, skipped: skipped, path: ${out ? lit(out) : 'null'} };`),
    // run one of the owner's actions (on a file, or on the document in front)
    action: ({ set, action, file }) => psBody(`${file ? `app.open(new File(${lit(file)}));\n` : ''}if (!app.documents.length) throw new Error('Open a document first');\napp.doAction(${lit(action)}, ${lit(set)});\nreturn { done: ${lit(action)}, set: ${lit(set)}, doc: app.activeDocument.name };`),
    // the owner's action sets (Photoshop doesn't list them in its DOM: read them through the action manager)
    actions: () => 'var out = []; for (var i = 1; i < 200; i++) { var r = new ActionReference(); r.putIndex(charIDToTypeID(\'ASet\'), i); var d; try { d = executeActionGet(r); } catch (e) { break; } var set = d.getString(charIDToTypeID(\'Nm  \')); var n = d.hasKey(charIDToTypeID(\'NmbC\')) ? d.getInteger(charIDToTypeID(\'NmbC\')) : 0; var acts = []; for (var j = 1; j <= n; j++) { var r2 = new ActionReference(); r2.putIndex(charIDToTypeID(\'Actn\'), j); r2.putIndex(charIDToTypeID(\'ASet\'), i); try { acts.push(executeActionGet(r2).getString(charIDToTypeID(\'Nm  \'))); } catch (e2) {} } out.push({ set: set, actions: acts }); } return out;',
    // the front document at several sizes (social formats…): each one covers its frame (centered crop), saved as PNG / JPG
    sizes: ({ sizes, dir, format = 'png', file }) => psBody(`${file ? `app.open(new File(${lit(file)}));\n` : ''}if (!app.documents.length) throw new Error('Open a document first');
var src = app.activeDocument; var sizes = ${lit(sizes)}; var out = [];
var base = src.name.replace(/\\.[^.]+$/, '');
var folder = new Folder(${lit(dir)}); if (!folder.exists) folder.create();
for (var i = 0; i < sizes.length; i++) {
  var s = sizes[i]; var d = src.duplicate(base + ' ' + s.name, true);
  try {
    var W = d.width.as('px'), H = d.height.as('px');
    var tw = s.w || Math.round(W * s.h / H), th = s.h || Math.round(H * s.w / W);
    var k = Math.max(tw / W, th / H);
    d.resizeImage(UnitValue(Math.round(W * k), 'px'), UnitValue(Math.round(H * k), 'px'), 72, ResampleMethod.BICUBIC);
    d.resizeCanvas(UnitValue(tw, 'px'), UnitValue(th, 'px'), AnchorPosition.MIDDLECENTER);
    var f = new File(folder.fsName + '/' + base + '-' + s.name.replace(/[^A-Za-z0-9x-]+/g, '_') + '.' + ${lit(format === 'jpg' ? 'jpg' : 'png')});
    ${format === 'jpg' ? 'var o = new JPEGSaveOptions(); o.quality = 11;' : 'var o = new PNGSaveOptions(); o.compression = 6;'}
    d.saveAs(f, o, true); out.push(f.fsName);
  } finally { d.close(SaveOptions.DONOTSAVECHANGES); }
}
return out;`),
    // the front document back into Hearth: a flattened PNG copy (the document itself isn't touched)
    back: ({ out }) => psBody(`if (!app.documents.length) throw new Error('No document is open in Photoshop');
var d = app.activeDocument; var src = null; try { src = d.fullName.fsName; } catch (e) {}
var c = d.duplicate(d.name + ' (Hearth)', true);
try { var o = new PNGSaveOptions(); o.compression = 6; c.saveAs(new File(${lit(out)}), o, true); } finally { c.close(SaveOptions.DONOTSAVECHANGES); }
return { path: ${lit(out)}, name: d.name, source: src, w: d.width.as('px'), h: d.height.as('px') };`),
    // a picture as a new layer of the front document (or a new document)
    place: ({ file }) => psBody(`if (!app.documents.length) { var d0 = app.open(new File(${lit(file)})); return { name: d0.name, newDoc: true }; }
var doc = app.activeDocument; var src = app.open(new File(${lit(file)}));
try { if (src.layers.length > 1) src.flatten(); src.activeLayer.duplicate(doc, ElementPlacement.PLACEATBEGINNING); } finally { src.close(SaveOptions.DONOTSAVECHANGES); }
app.activeDocument = doc; doc.layers[0].name = ${lit(String(file).split(/[\\/]/).pop())};
return { name: doc.name, layers: doc.layers.length };`),
    version: () => 'return { app: app.name, version: app.version };',
  };

  // ---------- Illustrator ----------
  const ai = {
    open: (file) => `var d = app.open(new File(${lit(file)}));\nreturn { name: d.name, artboards: d.artboards.length };`,
    // a file (or the front document) as SVG for the Lab: outlined text, embedded pictures
    svg: ({ file, out }) => `var opened = false; var d;
if (${lit(file || '')}) { d = app.open(new File(${lit(file || '')})); opened = true; } else { if (!app.documents.length) throw new Error('No document is open in Illustrator'); d = app.activeDocument; }
try { var o = new ExportOptionsSVG(); o.embedRasterImages = true; o.fontType = SVGFontType.OUTLINEFONT; o.cssProperties = SVGCSSPropertyLocation.PRESENTATIONATTRIBUTES; o.documentEncoding = SVGDocumentEncoding.UTF8;
d.exportFile(new File(${lit(out)}), ExportType.SVG, o); }
finally { if (opened) d.close(SaveOptions.DONOTSAVECHANGES); }
return { path: ${lit(out)}, name: d.name };`,
    png: ({ file, out, scale = 200 }) => `var opened = false; var d;
if (${lit(file || '')}) { d = app.open(new File(${lit(file || '')})); opened = true; } else { if (!app.documents.length) throw new Error('No document is open in Illustrator'); d = app.activeDocument; }
try { var o = new ExportOptionsPNG24(); o.artBoardClipping = true; o.transparency = true; o.antiAliasing = true; o.horizontalScale = ${Number(scale) || 100}; o.verticalScale = ${Number(scale) || 100};
d.exportFile(new File(${lit(out)}), ExportType.PNG24, o); }
finally { if (opened) d.close(SaveOptions.DONOTSAVECHANGES); }
return { path: ${lit(out)}, name: d.name };`,
    // a picture placed in a new document (to trace or lay out)
    place: ({ file }) => `var d = app.documents.length ? app.activeDocument : app.documents.add();\nvar p = d.placedItems.add(); p.file = new File(${lit(file)});\nreturn { name: d.name, placed: p.name || ${lit(String(file).split(/[\\/]/).pop())} };`,
    docs: () => 'var out = []; for (var i = 0; i < app.documents.length; i++) { var d = app.documents[i]; var p = null; try { p = d.fullName.fsName; } catch (e) {} out.push({ name: d.name, path: p }); } return out;',
    version: () => 'return { app: app.name, version: app.version };',
  };

  // ---------- InDesign ----------
  const id = {
    open: (file) => `var d = app.open(new File(${lit(file)}));\nreturn { name: d.name, pages: d.pages.length };`,
    pdf: ({ file, out }) => `var opened = false; var d;
if (${lit(file || '')}) { d = app.open(new File(${lit(file || '')})); opened = true; } else { if (!app.documents.length) throw new Error('No document is open in InDesign'); d = app.activeDocument; }
try { d.exportFile(ExportFormat.PDF_TYPE, new File(${lit(out)}), false); } finally { if (opened) d.close(SaveOptions.NO); }
return { path: ${lit(out)}, name: d.name };`,
    place: ({ file }) => `var d = app.documents.length ? app.activeDocument : app.documents.add();\nvar r = d.pages[0].place(new File(${lit(file)}));\nreturn { name: d.name, placed: r.length };`,
    version: () => 'return { app: app.name, version: app.version };',
  };

  // ---------- Premiere Pro (through the Hearth bridge panel) ----------
  const pr = {
    // the Lab sequence (FCP XML) or media files into the open project (a new project when none is open)
    importFiles: ({ files, project, sequence }) => `var files = ${lit(files)};
if (!app.project || !app.project.path) { if (${lit(project || '')}) app.newProject(${lit(project || '')}); }
if (!app.project) throw new Error('Open or create a project in Premiere Pro first');
var before = app.project.sequences.numSequences;
var ok = app.project.importFiles(files, true, app.project.getInsertionBin(), false);
${sequence ? `var root = app.project.rootItem; var item = null;
for (var i = root.children.numItems - 1; i >= 0; i--) { var c = root.children[i]; if (c.name === ${lit(String(files[0] || '').split(/[\\/]/).pop())}) { item = c; break; } }
if (item) app.project.createNewSequenceFromClips(${lit(sequence)}, [item], app.project.getInsertionBin());` : ''}
return { project: app.project.name, imported: files.length, ok: ok !== false, sequences: app.project.sequences.numSequences, newSequences: app.project.sequences.numSequences - before };`,
    // the active sequence to Media Encoder with a preset (.epr), then start the queue
    queue: ({ out, preset, start = true }) => `var s = app.project && app.project.activeSequence; if (!s) throw new Error('Open a sequence in Premiere Pro first');
app.encoder.launchEncoder();
var id = app.encoder.encodeSequence(s, ${lit(out)}, ${lit(preset || '')}, app.encoder.ENCODE_ENTIRE, 1);
${start ? 'app.encoder.startBatch();' : ''}
return { sequence: s.name, job: id, out: ${lit(out)} };`,
    info: () => 'var p = app.project; var seqs = []; if (p) for (var i = 0; i < p.sequences.numSequences; i++) seqs.push(p.sequences[i].name);\nreturn { version: app.version, project: p ? p.name : null, path: p ? p.path : null, sequences: seqs, active: p && p.activeSequence ? p.activeSequence.name : null };',
  };

  // ---------- Media Encoder (through the Hearth bridge panel) ----------
  const me = {
    // a file into the queue: with a preset (.epr) and an output path, or Media Encoder's default preset
    queue: ({ file, preset, format = 'H.264', out, start = true }) => `var fe = app.getFrontend(); if (!fe) throw new Error('Media Encoder isn\\'t ready yet');
var ok = ${preset ? `fe.addFileToBatch(${lit(file)}, ${lit(format)}, ${lit(preset)}, ${lit(out || '')})` : `fe.addItemToBatch(${lit(file)})`};
${start ? 'var h = app.getEncoderHost(); if (h) h.runBatch();' : ''}
return { queued: ok !== false, file: ${lit(file)}, preset: ${lit(preset || 'default')}, started: ${Boolean(start)} };`,
    info: () => 'return { version: app.version || null };',
  };

  // ---------- After Effects (aemain.js's own runner; no return value) ----------
  const ae = {
    importFile: ({ file, comp }) => `var f = new File(${lit(file)}); if (!f.exists) { alert("Hearth: file not found\\n" + f.fsName); } else {
var it = app.project.importFile(new ImportOptions(f));
${comp ? 'if (it && it.hasVideo !== false && it.width) { var c = app.project.items.addComp(it.name, it.width, it.height, it.pixelAspect || 1, it.duration || 10, it.frameRate || 30); c.layers.add(it); c.openInViewer(); }' : ''} }`,
    open: (file) => `app.open(new File(${lit(file)}));`,
  };

  // ---------- runners ----------
  const asStr = (s) => `"${String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
  // the osascript program for a script file (AppleScript `do javascript` takes a file; InDesign uses `do script`)
  function applescript(a, file, { appName, activate = true } = {}) {
    const name = asStr(appName || `Adobe ${a.name}`);
    const run = a.how === 'idjs' ? 'do script f language javascript' : 'do javascript f';
    return `set f to POSIX file ${asStr(file)}\ntell application ${name}\n${activate ? '  activate\n' : ''}  ${run}\nend tell`;
  }
  // the cscript program (COM) for a script file; InDesign reads the code itself (DoScript takes code, not a path)
  function vbscript(a, file) {
    const q = (s) => `"${String(s).replace(/"/g, '""')}"`;
    const lines = ['On Error Resume Next', `Set app = CreateObject(${q(a.com)})`, 'If Err.Number <> 0 Then', `  WScript.StdErr.WriteLine "COM: ${a.name} isn't registered (" & Err.Description & ")"`, '  WScript.Quit 3', 'End If', 'On Error GoTo 0'];
    if (a.how === 'idjs') {
      lines.push('Set s = CreateObject("ADODB.Stream")', 's.Type = 2', 's.Charset = "utf-8"', 's.Open', `s.LoadFromFile ${q(file)}`, 'code = s.ReadText', 's.Close', 'r = app.DoScript(code, 1246973031)');
    } else lines.push(`r = app.DoJavaScriptFile(${q(file)})`);
    lines.push('WScript.Echo r');
    return `${lines.join('\r\n')}\r\n`;
  }
  // macOS / COM failures in plain words
  function explain(text, a) {
    const s = String(text || '');
    const n = a?.name || 'the Adobe app';
    if (/-1743|not authori[sz]ed/i.test(s)) return `macOS blocked Hearth from controlling ${n}. Allow it in System Settings → Privacy & Security → Automation → Hearth → ${n}, then try again.`;
    if (/-1728|-1708|doesn.t understand/i.test(s)) return `${n} didn't accept the script. Make sure it finished starting (and no dialog is open in it), then try again.`;
    if (/-600|isn.t running/i.test(s)) return `${n} isn't running and couldn't be started.`;
    if (/-10814|Can.t get application|Application isn.t running|can.t find/i.test(s)) return `macOS couldn't find ${n} by name. Set its location with /adobe where ${a?.id || ''} <path>.`;
    if (/isn't registered|80040154|ActiveX component/i.test(s)) return `${n}'s scripting (COM) isn't registered on this PC: start ${n} once as usual, then try again.`;
    if (/timed? ?out/i.test(s)) return `${n} took too long to answer (a dialog may be waiting in it).`;
    return s.trim().split('\n').filter(Boolean).pop() || `${n} didn't answer`;
  }

  // ---------- Final Cut Pro 7 XML (Premiere: File → Import, or the bridge) ----------
  const xmlEsc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const fileUrl = (p) => {
    const s = String(p || '').replace(/\\/g, '/');
    return `file://localhost${s.startsWith('/') ? '' : '/'}${s.split('/').map((x, i) => (i === 0 && /^[A-Za-z]:$/.test(x) ? x : encodeURIComponent(x))).join('/')}`;
  };
  function rateOf(fps) {
    const f = Number(fps) || 30;
    const ntsc = [23.976, 29.97, 59.94, 47.952, 119.88].some((x) => Math.abs(f - x) < 0.01);
    return { timebase: Math.round(f), ntsc, fps: f };
  }
  const baseName = (p) => String(p || '').split(/[\\/]/).pop();
  // edit: CutData shape ({ clips: [{ kind, src, in, out, speed… }], tracks: [{ type, items }] }). Cuts only:
  // transitions, titles, looks and speed changes stay in Hearth (listed in notes so the owner knows).
  function toFcpXml(edit, { fps = 30, w = 1920, h = 1080, name = 'Hearth edit', layout = null } = {}) {
    const R = rateOf(fps);
    const fr = (s) => Math.round((Number(s) || 0) * R.fps);
    const rate = `<rate><timebase>${R.timebase}</timebase><ntsc>${R.ntsc ? 'TRUE' : 'FALSE'}</ntsc></rate>`;
    const notes = [];
    const files = new Map(); // src -> { id, maxOut }
    const fileId = (src, out) => { let f = files.get(src); if (!f) { f = { id: `file-${files.size + 1}`, maxOut: 0, written: false }; files.set(src, f); } f.maxOut = Math.max(f.maxOut, out); return f; };
    const L = layout ? layout(edit) : (() => { let t = 0; return (edit.clips || []).map((clip) => { const d = ((clip.out || 0) - (clip.in || 0)) / (clip.speed || 1); const x = { clip, start: t, end: t + d }; t += d; return x; }); })();
    const v1 = []; const a1 = [];
    let n = 0;
    for (const x of L) {
      const c = x.clip;
      if (c.kind !== 'video' || !c.src) { if (c.kind) notes.push(`${c.kind} at ${x.start.toFixed(2)} s stays in Hearth`); continue; }
      if (c.speed && c.speed !== 1) notes.push(`${baseName(c.src)}: speed ${c.speed}× (set it again in Premiere)`);
      if (c.reverse) notes.push(`${baseName(c.src)}: reversed (set it again in Premiere)`);
      if (x.td) notes.push(`transition at ${x.start.toFixed(2)} s became a cut`);
      n += 1;
      v1.push({ n, src: c.src, name: baseName(c.src), start: fr(x.start), end: fr(x.end), in: fr(c.in), out: fr(c.in) + (fr(x.end) - fr(x.start)) });
      if (!c.mute) a1.push(v1[v1.length - 1]);
    }
    const extraV = []; const extraA = [];
    for (const k of edit.tracks || []) {
      for (const it of k.items || []) {
        const len = it.out != null && it.in != null ? ((it.out - it.in) / (it.speed || 1)) : (it.dur || 0);
        if (!it.src || !['video', 'image', 'audio'].includes(it.kind)) { if (it.kind) notes.push(`${it.kind} on ${k.name || k.type} stays in Hearth`); continue; }
        const row = { n: (n += 1), src: it.src, name: baseName(it.src), start: fr(it.start), end: fr(it.start + len), in: fr(it.in || 0), out: fr(it.in || 0) + fr(len) };
        (it.kind === 'audio' ? extraA : extraV).push(row);
      }
    }
    const fileXml = (src, out) => {
      const f = fileId(src, out);
      if (f.written) return `<file id="${f.id}"/>`;
      f.written = true;
      return `<file id="${f.id}"><name>${xmlEsc(baseName(src))}</name><pathurl>${xmlEsc(fileUrl(src))}</pathurl>${rate}<media><video/><audio/></media></file>`;
    };
    const item = (x, kind) => `<clipitem id="${kind}-clip-${x.n}"><name>${xmlEsc(x.name)}</name><enabled>TRUE</enabled><duration>${Math.max(x.out, 1)}</duration>${rate}<start>${x.start}</start><end>${x.end}</end><in>${x.in}</in><out>${x.out}</out>${fileXml(x.src, x.out)}${kind === 'audio' ? '<sourcetrack><mediatype>audio</mediatype><trackindex>1</trackindex></sourcetrack>' : ''}</clipitem>`;
    const track = (rows, kind) => `<track>${rows.map((x) => item(x, kind)).join('')}</track>`;
    const total = Math.max(0, ...[...v1, ...a1, ...extraV, ...extraA].map((x) => x.end));
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE xmeml>
<xmeml version="4">
<sequence id="hearth-seq"><name>${xmlEsc(name)}</name><duration>${total}</duration>${rate}
<media>
<video><format><samplecharacteristics>${rate}<width>${Math.round(w)}</width><height>${Math.round(h)}</height><pixelaspectratio>square</pixelaspectratio></samplecharacteristics></format>
${track(v1, 'video')}${extraV.length ? `\n${track(extraV, 'video')}` : ''}
</video>
<audio>
${track(a1, 'audio')}${extraA.length ? `\n${track(extraA, 'audio')}` : ''}
</audio>
</media>
</sequence>
</xmeml>
`;
    return { xml, clips: v1.length + extraV.length + extraA.length, frames: total, notes: [...new Set(notes)] };
  }

  // ---------- the Hearth bridge (CEP panel for Premiere Pro and Media Encoder) ----------
  // An invisible panel that starts with the app, watches <queue>/<HOST>/ for *.jsx files Hearth drops there, runs
  // each one ($.evalFile) and renames it to .done. The script itself writes its answer next to it (wrap()).
  const BRIDGE_ID = 'com.hearth.bridge';
  function cepManifest() {
    return `<?xml version="1.0" encoding="UTF-8"?>
<ExtensionManifest Version="7.0" ExtensionBundleId="${BRIDGE_ID}" ExtensionBundleVersion="1.0.0" ExtensionBundleName="Hearth bridge">
  <ExtensionList><Extension Id="${BRIDGE_ID}.panel" Version="1.0.0"/></ExtensionList>
  <ExecutionEnvironment>
    <HostList><Host Name="PPRO" Version="[13.0,99.9]"/><Host Name="AME" Version="[13.0,99.9]"/></HostList>
    <LocaleList><Locale Code="All"/></LocaleList>
    <RequiredRuntimeList><RequiredRuntime Name="CSXS" Version="9.0"/></RequiredRuntimeList>
  </ExecutionEnvironment>
  <DispatchInfoList><Extension Id="${BRIDGE_ID}.panel"><DispatchInfo>
    <Resources><MainPath>./index.html</MainPath><CEFCommandLine><Parameter>--enable-nodejs</Parameter><Parameter>--mixed-context</Parameter></CEFCommandLine></Resources>
    <Lifecycle><AutoVisible>false</AutoVisible><StartOn><Event>com.adobe.csxs.events.ApplicationActivate</Event><Event>applicationActivate</Event></StartOn></Lifecycle>
    <UI><Type>Custom</Type><Geometry><Size><Height>1</Height><Width>1</Width></Size></Geometry></UI>
  </DispatchInfo></Extension></DispatchInfoList>
</ExtensionManifest>
`;
  }
  function cepPanel(queueRoot) {
    return `<!doctype html>
<html><head><meta charset="utf-8"><title>Hearth bridge</title></head><body>
<script>
// Hearth bridge: runs the scripts Hearth drops in its queue folder (one folder per app), then marks them done.
(function () {
  var fs = require('fs'); var path = require('path');
  var cep = window.__adobe_cep__;
  var host = 'PPRO'; try { host = JSON.parse(cep.getHostEnvironment()).appName || host; } catch (e) {}
  var dir = path.join(${JSON.stringify(queueRoot)}, host);
  try { fs.mkdirSync(dir, { recursive: true }); } catch (e) {}
  try { fs.writeFileSync(path.join(dir, 'alive.txt'), String(Date.now())); } catch (e) {}
  var busy = false;
  function tick() {
    try { fs.writeFileSync(path.join(dir, 'alive.txt'), String(Date.now())); } catch (e) {}
    if (busy) return;
    var jobs = []; try { jobs = fs.readdirSync(dir).filter(function (f) { return /\\.jsx$/.test(f); }).sort(); } catch (e) { return; }
    if (!jobs.length) return;
    busy = true;
    var file = path.join(dir, jobs[0]);
    var code = '$.evalFile(new File(' + JSON.stringify(file.replace(/\\\\/g, '/')) + '))';
    cep.evalScript(code, function (r) { try { fs.renameSync(file, file + '.done'); } catch (e) {} busy = false; });
  }
  setInterval(tick, 400);
})();
</script>
</body></html>
`;
  }

  // ---------- helpers for the renderer ----------
  // social sizes for "export sizes" (the Lab's frames)
  const SIZES = [
    { name: '1080x1920', w: 1080, h: 1920, hint: 'Reels / TikTok / Shorts / Story' },
    { name: '1080x1350', w: 1080, h: 1350, hint: 'Feed 4:5' },
    { name: '1080x1080', w: 1080, h: 1080, hint: 'Square' },
    { name: '1920x1080', w: 1920, h: 1080, hint: 'YouTube / 16:9' },
    { name: '1200x630', w: 1200, h: 630, hint: 'Link preview (Open Graph)' },
  ];
  // "9:16 4:5" / "1080x1920" / "socials" → sizes
  function pickSizes(text) {
    const s = String(text || '').toLowerCase();
    if (!s.trim() || /\b(all|socials?)\b/.test(s)) return SIZES.slice(0, 4);
    const out = [];
    const ratio = { '9:16': '1080x1920', '4:5': '1080x1350', '1:1': '1080x1080', '16:9': '1920x1080', og: '1200x630' };
    for (const [k, v] of Object.entries(ratio)) if (s.includes(k)) out.push(SIZES.find((z) => z.name === v));
    for (const m of s.matchAll(/(\d{2,5})\s*[x×]\s*(\d{2,5})/g)) { const name = `${m[1]}x${m[2]}`; if (!out.some((z) => z.name === name)) out.push({ name, w: Number(m[1]), h: Number(m[2]) }); }
    return out;
  }
  // board items → layered-document items (board coordinates scaled so the longest side is ≤ maxSide)
  function boardLayout(items, { maxSide = 4000, pad = 40 } = {}) {
    const pics = items.filter((i) => i.src && /^(image|gif)$/.test(i.type || 'image'));
    if (!pics.length) return null;
    const x0 = Math.min(...pics.map((i) => i.x)) - pad; const y0 = Math.min(...pics.map((i) => i.y)) - pad;
    const x1 = Math.max(...pics.map((i) => i.x + i.w)) + pad; const y1 = Math.max(...pics.map((i) => i.y + i.h)) + pad;
    const k = Math.min(1.5, maxSide / Math.max(x1 - x0, y1 - y0));
    const order = pics.slice().sort((a, b) => (a.z || 0) - (b.z || 0));
    return { w: Math.round((x1 - x0) * k), h: Math.round((y1 - y0) * k), items: order.map((i) => ({ path: i.src, name: i.title || baseName(i.src), x: Math.round((i.x - x0) * k), y: Math.round((i.y - y0) * k), w: Math.round(i.w * k), h: Math.round(i.h * k) })) };
  }
  const slug = (s) => String(s || 'hearth').normalize('NFKD').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-').slice(0, 60) || 'hearth';

  return { APPS, WEB, ALIASES, app, lit, wrap, parseResult, ps, ai, id, pr, me, ae, applescript, vbscript, explain, toFcpXml, fileUrl, rateOf, BRIDGE_ID, cepManifest, cepPanel, SIZES, pickSizes, boardLayout, slug, baseName };
})();
if (typeof module !== 'undefined') module.exports = AdobeData;
