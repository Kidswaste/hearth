// After Effects kit content: expression generators, ExtendScript scripts, comp presets,
// delivery bitrates and a shortcut reference.
const AEData = (() => {
  const n = (name, label, value, extra = {}) => ({ name, label, value, type: 'number', ...extra });
  const t = (name, label, value, extra = {}) => ({ name, label, value, type: 'text', ...extra });
  const s = (name, label, value, options) => ({ name, label, value, type: 'select', options });
  const c = (name, label, value) => ({ name, label, value, type: 'checkbox' });
  const q = (v) => JSON.stringify(String(v));

  const EXPRESSIONS = [
    { cat: 'Motion', name: 'Wiggle', where: 'Any property', params: [n('freq', 'Wiggles per second', 2), n('amp', 'Amount', 30)], code: (p) => `wiggle(${p.freq}, ${p.amp});` },
    { cat: 'Motion', name: 'Wiggle one axis', where: 'Position', params: [s('axis', 'Axis', 'x', ['x', 'y']), n('freq', 'Wiggles per second', 2), n('amp', 'Amount', 40)],
      code: (p) => `var w = wiggle(${p.freq}, ${p.amp});\n${p.axis === 'x' ? '[w[0], value[1]]' : '[value[0], w[1]]'};` },
    { cat: 'Motion', name: 'Smooth wiggle (seeded)', where: 'Any property', params: [n('freq', 'Wiggles per second', 1), n('amp', 'Amount', 25), n('octaves', 'Octaves (detail)', 2), n('mult', 'Octave multiplier', 0.5)],
      code: (p) => `seedRandom(index, true); // each layer wiggles differently but consistently\nwiggle(${p.freq}, ${p.amp}, ${p.octaves}, ${p.mult});` },
    { cat: 'Motion', name: 'Loop keyframes', where: 'Any keyframed property', params: [s('type', 'Loop type', 'cycle', ['cycle', 'pingpong', 'offset', 'continue'])], code: (p) => `loopOut(${q(p.type)});` },
    { cat: 'Motion', name: 'Loop before and after', where: 'Any keyframed property', params: [s('type', 'Loop type', 'cycle', ['cycle', 'pingpong', 'offset'])],
      code: (p) => `if (numKeys > 1 && time < key(1).time) loopIn(${q(p.type)}); else loopOut(${q(p.type)});` },
    { cat: 'Motion', name: 'Constant rotation', where: 'Rotation', params: [n('speed', 'Degrees per second', 90)], code: (p) => `value + time * ${p.speed};` },
    { cat: 'Motion', name: 'Inertial bounce', where: 'Any keyframed property', params: [n('amp', 'Amplitude', 0.05), n('freq', 'Frequency', 4), n('decay', 'Decay', 8)],
      code: (p) => `var amp = ${p.amp}, freq = ${p.freq}, decay = ${p.decay};
var n = 0;
if (numKeys > 0) { n = nearestKey(time).index; if (key(n).time > time) n--; }
var t = n > 0 ? time - key(n).time : 0;
if (n > 0 && t < 1) {
  var v = velocityAtTime(key(n).time - thisComp.frameDuration / 10);
  value + v * amp * Math.sin(freq * t * 2 * Math.PI) / Math.exp(decay * t);
} else value;` },
    { cat: 'Motion', name: 'Squash & stretch on keyframes', where: 'Scale', params: [n('amp', 'Amount (%)', 12), n('freq', 'Frequency', 3), n('decay', 'Decay', 6)],
      code: (p) => `var amp = ${p.amp}, freq = ${p.freq}, decay = ${p.decay};
var n = 0;
if (numKeys > 0) { n = nearestKey(time).index; if (key(n).time > time) n--; }
var t = n > 0 ? time - key(n).time : 0;
var s = n > 0 ? amp * Math.sin(freq * t * 2 * Math.PI) / Math.exp(decay * t) : 0;
[value[0] * (1 + s / 100), value[1] * (1 - s / 100)];` },
    { cat: 'Motion', name: 'Follow layer above (delay)', where: 'Position', params: [n('delay', 'Delay (frames)', 3)],
      code: (p) => `thisComp.layer(index - 1).transform.position.valueAtTime(time - framesToTime(${p.delay}));` },
    { cat: 'Motion', name: 'Look at layer (2D)', where: 'Rotation', params: [t('target', 'Target layer name', 'Target'), n('offset', 'Angle offset (°)', 0)],
      code: (p) => `var d = sub(thisComp.layer(${q(p.target)}).toComp([0, 0]), toComp(anchorPoint));\nradiansToDegrees(Math.atan2(d[1], d[0])) + ${p.offset};` },
    { cat: 'Motion', name: 'Move along a mask path', where: 'Position', params: [t('layer', 'Layer with the mask', 'Path'), t('mask', 'Mask name', 'Mask 1')],
      code: (p) => `var path = thisComp.layer(${q(p.layer)}).mask(${q(p.mask)}).maskPath;\nvar progress = linear(time, inPoint, outPoint, 0, 1);\nthisComp.layer(${q(p.layer)}).toComp(path.pointOnPath(progress));` },
    { cat: 'Motion', name: 'Pulse to a beat', where: 'Scale', params: [n('bpm', 'Beats per minute', 120), n('amount', 'Pulse amount (%)', 12)],
      code: (p) => `var beat = time * ${p.bpm} / 60;\nvar s = 100 + ${p.amount} * Math.pow(1 - (beat % 1), 3);\n[value[0] * s / 100, value[1] * s / 100];` },
    { cat: 'Motion', name: 'Smooth out jitter', where: 'Any property', params: [n('width', 'Window (seconds)', 0.2), n('samples', 'Samples', 5)], code: (p) => `smooth(${p.width}, ${p.samples});` },
    { cat: 'Motion', name: 'Play keyframes at each marker', where: 'Any keyframed property', params: [],
      code: () => `// Keyframes start at 0s; each layer marker replays them.
var n = 0;
if (marker.numKeys > 0) { n = marker.nearestKey(time).index; if (marker.key(n).time > time) n--; }
n > 0 ? valueAtTime(time - marker.key(n).time) : valueAtTime(0);` },
    { cat: 'Opacity', name: 'Auto fade in & out', where: 'Opacity', params: [n('fadeIn', 'Fade in (frames)', 12), n('fadeOut', 'Fade out (frames)', 12)],
      code: (p) => `var fi = framesToTime(${p.fadeIn}), fo = framesToTime(${p.fadeOut});\nMath.min(linear(time, inPoint, inPoint + fi, 0, value), linear(time, outPoint - fo, outPoint, value, 0));` },
    { cat: 'Opacity', name: 'Blink', where: 'Opacity', params: [n('rate', 'Blinks per second', 2), n('duty', 'Visible part (%)', 50)],
      code: (p) => `((time * ${p.rate}) % 1) < ${p.duty / 100} ? value : 0;` },
    { cat: 'Opacity', name: 'Fade by distance to a layer', where: 'Opacity', params: [t('target', 'Target layer name', 'Camera Null'), n('near', 'Fully visible within (px)', 200), n('far', 'Invisible beyond (px)', 800)],
      code: (p) => `var d = length(toComp(anchorPoint), thisComp.layer(${q(p.target)}).toComp([0, 0]));\nlinear(d, ${p.near}, ${p.far}, value, 0);` },
    { cat: 'Text', name: 'Number counter', where: 'Source Text', params: [n('from', 'Start value', 0), n('to', 'End value', 1000), n('duration', 'Duration (seconds)', 2), n('decimals', 'Decimals', 0), c('commas', 'Thousands separators', true), t('prefix', 'Prefix', ''), t('suffix', 'Suffix', '')],
      code: (p) => `var v = ease(time, inPoint, inPoint + ${p.duration}, ${p.from}, ${p.to});
var s = v.toFixed(${p.decimals});
${p.commas ? 's = s.replace(/\\B(?=(\\d{3})+(?!\\d))/g, ",");\n' : ''}${[p.prefix ? q(p.prefix) : null, 's', p.suffix ? q(p.suffix) : null].filter(Boolean).join(' + ')};` },
    { cat: 'Text', name: 'Typewriter', where: 'Source Text', params: [n('cps', 'Characters per second', 18), c('cursor', 'Blinking cursor', true)],
      code: (p) => `var n = Math.max(0, Math.floor((time - inPoint) * ${p.cps}));\nvalue.substr(0, n)${p.cursor ? ' + (Math.floor(time * 2) % 2 ? "|" : "")' : ''};` },
    { cat: 'Text', name: 'Uppercase', where: 'Source Text', params: [], code: () => 'value.toUpperCase();' },
    { cat: 'Text', name: 'Timecode / clock display', where: 'Source Text', params: [s('format', 'Format', 'mm:ss', ['mm:ss', 'hh:mm:ss', 'timecode'])],
      code: (p) => (p.format === 'timecode' ? 'timeToTimecode(time);' : `var t = Math.floor(time);
function pad(x) { return (x < 10 ? "0" : "") + x; }
${p.format === 'hh:mm:ss' ? 'pad(Math.floor(t / 3600)) + ":" + pad(Math.floor(t / 60) % 60) + ":" + pad(t % 60);' : 'pad(Math.floor(t / 60)) + ":" + pad(t % 60);'}`) },
    { cat: 'Shapes', name: 'Auto box behind text: size', where: 'Rectangle Size (shape layer)', params: [t('text', 'Text layer name', 'Title'), n('padX', 'Horizontal padding', 40), n('padY', 'Vertical padding', 20)],
      code: (p) => `var r = thisComp.layer(${q(p.text)}).sourceRectAtTime(time, false);\n[r.width + ${p.padX * 2}, r.height + ${p.padY * 2}];` },
    { cat: 'Shapes', name: 'Auto box behind text: position', where: 'Rectangle Position (shape layer)', params: [t('text', 'Text layer name', 'Title')],
      code: (p) => `var L = thisComp.layer(${q(p.text)});\nvar r = L.sourceRectAtTime(time, false);\nfromComp(L.toComp([r.left + r.width / 2, r.top + r.height / 2]));` },
    { cat: 'Shapes', name: 'Keep stroke width when scaling', where: 'Stroke Width', params: [],
      code: () => 'value / length(toComp([0, 0]), toComp([0.7071, 0.7071])) || 0.001;' },
    { cat: 'Rigging', name: 'Slider to range (linear map)', where: 'Any property (add a Slider Control first)', params: [t('slider', 'Slider effect name', 'Slider Control'), n('inMin', 'Slider from', 0), n('inMax', 'Slider to', 100), n('outMin', 'Value from', 0), n('outMax', 'Value to', 360)],
      code: (p) => `var s = effect(${q(p.slider)})("Slider");\nlinear(s, ${p.inMin}, ${p.inMax}, ${p.outMin}, ${p.outMax});` },
    { cat: 'Rigging', name: 'Keep scale when parented', where: 'Scale', params: [],
      code: () => `var ps = parent.transform.scale.value, s = [];\nfor (var i = 0; i < value.length; i++) s[i] = value[i] * 100 / ps[i];\ns;` },
    { cat: 'Rigging', name: 'Clamp', where: 'Any property', params: [n('min', 'Minimum', 0), n('max', 'Maximum', 100)], code: (p) => `clamp(value, ${p.min}, ${p.max});` },
    { cat: 'Rigging', name: 'Random value (fixed per layer)', where: 'Any property', params: [n('min', 'Minimum', 0), n('max', 'Maximum', 100), n('seed', 'Seed', 1)],
      code: (p) => `seedRandom(index * ${p.seed}, true);\nrandom(${p.min}, ${p.max});` },
    { cat: 'Time', name: 'Freeze frame', where: 'Time Remap', params: [n('frame', 'Frame to hold', 0)], code: (p) => `framesToTime(${p.frame});` },
    { cat: 'Time', name: 'Slow motion / speed', where: 'Time Remap', params: [n('speed', 'Speed (%)', 50)], code: (p) => `(time - inPoint) * ${p.speed / 100};` },
  ];

  // ExtendScript bodies; the hub wraps each in an undo group and a try/catch before running it.
  const SCRIPTS = [
    { name: 'Rename selected layers', desc: 'Names layers from a pattern; # becomes a number', params: [t('pattern', 'Pattern (## = 2-digit number)', 'Layer ##'), n('start', 'Start at', 1)],
      code: (p) => `var comp = app.project.activeItem;
if (!(comp instanceof CompItem)) throw new Error("Open a composition first.");
var layers = comp.selectedLayers;
if (!layers.length) throw new Error("Select some layers first.");
var pattern = ${q(p.pattern)}, n = ${p.start};
for (var i = 0; i < layers.length; i++) {
  var name = pattern.replace(/#+/, function (h) { var s = String(n + i); while (s.length < h.length) s = "0" + s; return s; });
  layers[i].name = name;
}` },
    { name: 'Sequence layers', desc: 'Staggers selected layers in selection order', params: [n('offset', 'Offset between layers (frames)', 5)],
      code: (p) => `var comp = app.project.activeItem;
if (!(comp instanceof CompItem)) throw new Error("Open a composition first.");
var layers = comp.selectedLayers;
if (layers.length < 2) throw new Error("Select at least two layers.");
var step = ${p.offset} * comp.frameDuration, start = layers[0].startTime;
for (var i = 0; i < layers.length; i++) layers[i].startTime = start + i * step;` },
    { name: 'Precompose each layer', desc: 'Puts every selected layer in its own precomp', params: [c('move', 'Move all attributes into the precomp', true)],
      code: (p) => `var comp = app.project.activeItem;
if (!(comp instanceof CompItem)) throw new Error("Open a composition first.");
var layers = comp.selectedLayers;
if (!layers.length) throw new Error("Select some layers first.");
var idx = [];
for (var i = 0; i < layers.length; i++) idx.push(layers[i].index);
idx.sort(function (a, b) { return b - a; });
for (var j = 0; j < idx.length; j++) comp.layers.precompose([idx[j]], comp.layer(idx[j]).name + " comp", ${p.move ? 'true' : 'false'});` },
    { name: 'Center anchor points', desc: 'Moves anchors to the visual center without moving the layers', params: [],
      code: () => `var comp = app.project.activeItem;
if (!(comp instanceof CompItem)) throw new Error("Open a composition first.");
var layers = comp.selectedLayers;
if (!layers.length) throw new Error("Select some layers first.");
for (var i = 0; i < layers.length; i++) {
  var L = layers[i];
  if (!L.sourceRectAtTime) continue;
  var r = L.sourceRectAtTime(comp.time, false);
  var ap = L.property("ADBE Transform Group").property("ADBE Anchor Point");
  var pos = L.property("ADBE Transform Group").property("ADBE Position");
  var oldA = ap.value, newA = [r.left + r.width / 2, r.top + r.height / 2];
  if (oldA.length > 2) newA.push(oldA[2]);
  var sc = L.property("ADBE Transform Group").property("ADBE Scale").value;
  var dx = (newA[0] - oldA[0]) * sc[0] / 100, dy = (newA[1] - oldA[1]) * sc[1] / 100;
  if (ap.numKeys || pos.numKeys) continue; // animated anchors/positions are skipped
  ap.setValue(newA);
  var p = pos.value; p[0] += dx; p[1] += dy; pos.setValue(p);
}` },
    { name: 'Null controller for selection', desc: 'Adds a null at the selection center and parents the layers to it', params: [t('name', 'Null name', 'Controller')],
      code: (p) => `var comp = app.project.activeItem;
if (!(comp instanceof CompItem)) throw new Error("Open a composition first.");
var layers = comp.selectedLayers;
if (!layers.length) throw new Error("Select some layers first.");
var sx = 0, sy = 0;
for (var i = 0; i < layers.length; i++) { var pp = layers[i].property("ADBE Transform Group").property("ADBE Position").value; sx += pp[0]; sy += pp[1]; }
var nul = comp.layers.addNull();
nul.name = ${q(p.name)};
nul.property("ADBE Transform Group").property("ADBE Position").setValue([sx / layers.length, sy / layers.length]);
nul.moveBefore(layers[0]);
for (var j = 0; j < layers.length; j++) layers[j].parent = nul;` },
    { name: 'Markers every N frames', desc: 'Adds comp markers at a fixed interval (beats, cuts…)', params: [n('every', 'Every (frames)', 15), t('label', 'Marker label (# = count)', '#')],
      code: (p) => `var comp = app.project.activeItem;
if (!(comp instanceof CompItem)) throw new Error("Open a composition first.");
var step = ${p.every} * comp.frameDuration, k = 1;
for (var t = 0; t < comp.duration; t += step) {
  comp.markerProperty.setValueAtTime(t, new MarkerValue(${q(p.label)}.replace("#", k++)));
}` },
    { name: 'Reverse layer order', desc: 'Flips the stacking order of the selected layers', params: [],
      code: () => `var comp = app.project.activeItem;
if (!(comp instanceof CompItem)) throw new Error("Open a composition first.");
var layers = comp.selectedLayers;
if (layers.length < 2) throw new Error("Select at least two layers.");
layers.sort(function (a, b) { return a.index - b.index; });
var top = layers[0].index;
for (var i = layers.length - 1; i >= 0; i--) layers[i].moveBefore(comp.layer(top));` },
    { name: 'Trim comp to work area', desc: 'Shortens the comp to its work area and shifts layers', params: [],
      code: () => `var comp = app.project.activeItem;
if (!(comp instanceof CompItem)) throw new Error("Open a composition first.");
var start = comp.workAreaStart, dur = comp.workAreaDuration;
for (var i = 1; i <= comp.numLayers; i++) {
  var L = comp.layer(i), locked = L.locked;
  L.locked = false; L.startTime -= start; L.locked = locked;
}
comp.duration = dur;
comp.workAreaStart = 0;` },
    { name: 'Distribute in a grid', desc: 'Lays selected layers out in rows and columns', params: [n('cols', 'Columns', 4), n('gapX', 'Horizontal spacing (px)', 300), n('gapY', 'Vertical spacing (px)', 300)],
      code: (p) => `var comp = app.project.activeItem;
if (!(comp instanceof CompItem)) throw new Error("Open a composition first.");
var layers = comp.selectedLayers;
if (!layers.length) throw new Error("Select some layers first.");
var cols = ${p.cols}, rows = Math.ceil(layers.length / cols);
var ox = comp.width / 2 - (Math.min(cols, layers.length) - 1) * ${p.gapX} / 2, oy = comp.height / 2 - (rows - 1) * ${p.gapY} / 2;
for (var i = 0; i < layers.length; i++) {
  var pos = layers[i].property("ADBE Transform Group").property("ADBE Position");
  var v = pos.value; v[0] = ox + (i % cols) * ${p.gapX}; v[1] = oy + Math.floor(i / cols) * ${p.gapY};
  pos.setValue(v);
}` },
    { name: 'Randomize positions', desc: 'Scatters selected layers inside the comp', params: [n('margin', 'Margin from edges (px)', 100)],
      code: (p) => `var comp = app.project.activeItem;
if (!(comp instanceof CompItem)) throw new Error("Open a composition first.");
var layers = comp.selectedLayers;
if (!layers.length) throw new Error("Select some layers first.");
for (var i = 0; i < layers.length; i++) {
  var pos = layers[i].property("ADBE Transform Group").property("ADBE Position"), v = pos.value;
  v[0] = ${p.margin} + Math.random() * (comp.width - 2 * ${p.margin});
  v[1] = ${p.margin} + Math.random() * (comp.height - 2 * ${p.margin});
  pos.setValue(v);
}` },
    { name: 'Add selected comps to Render Queue', desc: 'Queues each selected comp in the Project panel', params: [t('template', 'Output module template (optional)', '')],
      code: (p) => `var items = app.project.selection, added = 0;
for (var i = 0; i < items.length; i++) {
  if (!(items[i] instanceof CompItem)) continue;
  var rq = app.project.renderQueue.items.add(items[i]);
  ${p.template ? `try { rq.outputModule(1).applyTemplate(${q(p.template)}); } catch (e) {}` : ''}
  added++;
}
if (!added) throw new Error("Select one or more comps in the Project panel.");
alert("Added " + added + " comp(s) to the Render Queue.");` },
    { name: 'Incremental save', desc: 'Saves a numbered copy next to the project (_v001, _v002…)', params: [],
      code: () => `var f = app.project.file;
if (!f) throw new Error("Save the project once first.");
var base = f.fsName.replace(/(_v\\d{3})?\\.aep$/i, ""), n = 1, out;
do { out = new File(base + "_v" + ("00" + n).slice(-3) + ".aep"); n++; } while (out.exists);
app.project.save(out);` },
    { name: 'Uppercase text layers', desc: 'Converts selected text layers to UPPERCASE', params: [],
      code: () => `var comp = app.project.activeItem;
if (!(comp instanceof CompItem)) throw new Error("Open a composition first.");
var layers = comp.selectedLayers;
for (var i = 0; i < layers.length; i++) {
  if (!(layers[i] instanceof TextLayer)) continue;
  var st = layers[i].property("ADBE Text Properties").property("ADBE Text Document");
  if (st.numKeys) continue;
  var d = st.value; d.text = d.text.toUpperCase(); st.setValue(d);
}` },
    { name: 'Project report', desc: 'Counts comps, footage, layers and missing files', params: [],
      code: () => `var comps = 0, footage = 0, missing = 0, layers = 0;
for (var i = 1; i <= app.project.numItems; i++) {
  var it = app.project.item(i);
  if (it instanceof CompItem) { comps++; layers += it.numLayers; }
  if (it instanceof FootageItem) { footage++; if (it.footageMissing) missing++; }
}
alert("Comps: " + comps + "\\nLayers: " + layers + "\\nFootage: " + footage + "\\nMissing footage: " + missing);` },
  ];

  const scriptCreateComp = (p) => `var comp = app.project.items.addComp(${q(p.name)}, ${p.w}, ${p.h}, 1, ${p.duration}, ${p.fps});
comp.openInViewer();`;
  const scriptSwatches = (colors) => `var comp = app.project.activeItem;
if (!(comp instanceof CompItem)) comp = app.project.items.addComp("Palette", 1920, 1080, 1, 10, 30);
var colors = ${JSON.stringify(colors)};
var w = Math.round(comp.width / colors.length);
for (var i = colors.length - 1; i >= 0; i--) {
  var s = comp.layers.addSolid(colors[i].rgb, "Swatch " + colors[i].hex, w, comp.height, 1);
  s.property("ADBE Transform Group").property("ADBE Position").setValue([w * i + w / 2, comp.height / 2]);
}
comp.openInViewer();`;

  const PRESETS = [
    { group: 'Video', name: 'YouTube 1080p', w: 1920, h: 1080, fps: 30 }, { group: 'Video', name: 'YouTube 1080p60', w: 1920, h: 1080, fps: 60 },
    { group: 'Video', name: '4K UHD', w: 3840, h: 2160, fps: 30 }, { group: 'Video', name: 'Cinema 4K DCI', w: 4096, h: 2160, fps: 24 },
    { group: 'Social', name: 'Shorts / Reels / TikTok', w: 1080, h: 1920, fps: 30 }, { group: 'Social', name: 'Instagram square', w: 1080, h: 1080, fps: 30 },
    { group: 'Social', name: 'Instagram portrait 4:5', w: 1080, h: 1350, fps: 30 }, { group: 'Social', name: 'X / Twitter 16:9', w: 1280, h: 720, fps: 30 },
    { group: 'Game', name: 'Steam trailer', w: 1920, h: 1080, fps: 60 }, { group: 'Game', name: 'Steam header capsule', w: 920, h: 430, fps: 30 },
    { group: 'Game', name: 'Steam main capsule', w: 1232, h: 706, fps: 30 }, { group: 'Game', name: 'Steam vertical capsule', w: 748, h: 896, fps: 30 },
    { group: 'Game', name: 'Steam library hero', w: 3840, h: 1240, fps: 30 }, { group: 'Game', name: 'Steam library capsule', w: 600, h: 900, fps: 30 },
    { group: 'Game', name: 'itch.io cover image', w: 630, h: 500, fps: 30 }, { group: 'Game', name: 'itch.io embed (960×600)', w: 960, h: 600, fps: 60 },
    { group: 'Other', name: 'GIF (800 wide)', w: 800, h: 450, fps: 15 }, { group: 'Other', name: 'Twitch overlay', w: 1920, h: 1080, fps: 60 },
    { group: 'Other', name: 'Discord sticker / emote', w: 320, h: 320, fps: 30 },
  ];

  // Common upload targets (Mbps, H.264 SDR).
  const BITRATES = [
    ['YouTube 1080p (24–30 fps)', 8], ['YouTube 1080p (48–60 fps)', 12], ['YouTube 1440p (30 fps)', 16], ['YouTube 4K (30 fps)', 40], ['YouTube 4K (60 fps)', 60],
    ['Instagram / Reels', 5], ['TikTok', 10], ['Steam trailer 1080p', 8], ['Twitch stream 1080p60', 6], ['Web hero video', 3],
  ];

  const SHORTCUTS = [
    ['Preview', 'Space', 'Play / stop preview'], ['Preview', 'Numpad 0', 'Preview (RAM)'], ['Preview', 'J / K', 'Previous / next visible keyframe or marker'],
    ['Preview', 'Page Up / Page Down', 'Previous / next frame'], ['Preview', 'Home / End', 'Go to start / end'], ['Preview', 'Shift+Page Down', 'Forward 10 frames'],
    ['Preview', 'Shift+/', 'Fit comp to window'], ['Preview', '. / ,', 'Zoom in / out of the comp'], ['Preview', 'Alt+/', 'Fit comp up to 100%'],
    ['Work area', 'B / N', 'Set work area start / end'], ['Work area', 'Ctrl+Alt+B', 'Work area to selected layers'],
    ['Layers', 'Ctrl+D', 'Duplicate layer'], ['Layers', 'Ctrl+Shift+D', 'Split layer at current time'], ['Layers', 'Alt+[ / Alt+]', 'Trim in / out point to current time'],
    ['Layers', '[ / ]', 'Move in / out point to current time'], ['Layers', 'Ctrl+Shift+C', 'Precompose'], ['Layers', 'Ctrl+Alt+Shift+L', 'New light'],
    ['Layers', 'Ctrl+Y', 'New solid'], ['Layers', 'Ctrl+Alt+Shift+Y', 'New null object'], ['Layers', 'Ctrl+Alt+Y', 'New adjustment layer'],
    ['Layers', 'Ctrl+Alt+Shift+T', 'New text layer'], ['Layers', 'Ctrl+Alt+Shift+C', 'New camera'], ['Layers', 'Ctrl+] / Ctrl+[', 'Bring layer forward / backward'],
    ['Layers', 'Ctrl+Shift+] / [', 'Bring to front / send to back'], ['Layers', 'Ctrl+Alt+F', 'Fit layer to comp'], ['Layers', 'Ctrl+Alt+Shift+H / G', 'Fit to comp width / height'],
    ['Layers', 'Ctrl+L', 'Lock layer'], ['Layers', 'Ctrl+Shift+Y', 'Layer solid settings'], ['Layers', 'Alt+Page Up/Down', 'Nudge layer one frame in time'],
    ['Properties', 'P / S / R / T / A', 'Position / Scale / Rotation / Opacity / Anchor'], ['Properties', 'U', 'Show animated properties'], ['Properties', 'UU', 'Show modified properties'],
    ['Properties', 'E', 'Show effects'], ['Properties', 'M / MM', 'Masks / all mask properties'], ['Properties', 'L', 'Audio levels'], ['Properties', 'LL', 'Audio waveform'],
    ['Properties', 'EE', 'Show expressions'], ['Properties', 'Shift+(letter)', 'Add another property to the view'],
    ['Keyframes', 'F9', 'Easy ease'], ['Keyframes', 'Shift+F9 / Ctrl+Shift+F9', 'Easy ease in / out'], ['Keyframes', 'Ctrl+Shift+K', 'Keyframe velocity'],
    ['Keyframes', 'Ctrl+Alt+K', 'Keyframe interpolation'], ['Keyframes', 'Alt+Shift+(P/S/R/T)', 'Add/remove keyframe for that property'], ['Keyframes', 'Shift+F3', 'Graph editor'],
    ['Keyframes', 'Alt+click stopwatch', 'Add expression'], ['Keyframes', 'Ctrl+Alt+H', 'Convert to hold keyframe (toggle)'],
    ['Markers', '* (numpad)', 'Add marker'], ['Markers', 'Shift+0–9 (main kbd)', 'Set comp marker'], ['Markers', '0–9 (main kbd)', 'Go to comp marker'],
    ['Tools', 'V', 'Selection tool'], ['Tools', 'H', 'Hand tool'], ['Tools', 'Z', 'Zoom tool'], ['Tools', 'W', 'Rotation tool'], ['Tools', 'Q', 'Shape tools (cycle)'],
    ['Tools', 'G', 'Pen tool'], ['Tools', 'Ctrl+T', 'Type tool'], ['Tools', 'Y', 'Pan behind (anchor point) tool'], ['Tools', 'C', 'Camera tools (cycle)'], ['Tools', 'Alt+W', 'Roto brush'],
    ['Project', 'Ctrl+N', 'New composition'], ['Project', 'Ctrl+K', 'Composition settings'], ['Project', 'Ctrl+I', 'Import file'], ['Project', 'Ctrl+M', 'Add to Render Queue'],
    ['Project', 'Ctrl+Alt+M', 'Add to Media Encoder queue'], ['Project', 'Ctrl+Alt+S', 'Increment and save'], ['Project', 'Ctrl+Alt+/', 'Replace selected layers with the selected Project item'],
    ['Project', 'Ctrl+Alt+E', 'Edit original'], ['Project', 'Ctrl+Shift+N', 'New project'], ['Project', 'Ctrl+Alt+Shift+K', 'Keyboard shortcut editor'],
    ['View', "Ctrl+'", 'Toggle grid'], ['View', 'Ctrl+R', 'Toggle rulers'], ['View', "'", 'Title/action safe guides'], ['View', 'Ctrl+Shift+H', 'Show/hide layer controls'],
    ['View', '`', 'Maximize panel under cursor'], ['View', 'Alt+4', 'Toggle alpha channel view'], ['View', 'Ctrl+Alt+Shift+N', 'New comp viewer'],
  ];

  return { EXPRESSIONS, SCRIPTS, PRESETS, BITRATES, SHORTCUTS, scriptCreateComp, scriptSwatches };
})();
