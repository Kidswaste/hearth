#!/usr/bin/env node
// Moodboard qualities (round 67, moodqualities67), the pure part: shape language from synthetic pictures, the block a
// chat gets at each distance, "what I like" first, blends of 2–3, unmeasured / failed references never sending an
// empty block, the footage rule.   node dev/moodqualities-test.js
const path = require('path');
const V = require(path.join(__dirname, '..', 'board-vibe.js'));
const Q = require(path.join(__dirname, '..', 'board-qualities.js'));
const fails = [];
const check = (ok, what) => { console.log(`${ok ? '✓' : '✖'} ${what}`); if (!ok) fails.push(what); };
function img(w, h, f) { const d = new Uint8ClampedArray(w * h * 4); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const [r, g, b] = f(x, y); const i = (y * w + x) * 4; d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = 255; } return d; }

// ---------- shape language ----------
const boxes = V.fromPixels(img(160, 120, (x, y) => (((x / 20 | 0) + (y / 20 | 0)) % 2 ? [230, 230, 230] : [20, 20, 20])), 160, 120);
const circles = V.fromPixels(img(160, 120, (x, y) => (Math.hypot(x - 80, y - 60) % 18 < 9 ? [230, 220, 200] : [30, 30, 40])), 160, 120);
const diag = V.fromPixels(img(160, 120, (x, y) => ((((x + y) / 14) | 0) % 2 ? [240, 240, 240] : [10, 10, 10])), 160, 120);
const flat = V.fromPixels(img(160, 120, () => [120, 90, 70]), 160, 120);
check(boxes.shape && boxes.shape.straight > 0.8, `checkerboard: straight ${boxes.shape?.straight}`);
check(/straight lines/.test(Q.shapeWord(boxes)), `checkerboard words: ${Q.shapeWord(boxes)}`);
check(circles.shape && circles.shape.spread > 0.78 && circles.shape.straight < 0.4, `rings: spread ${circles.shape?.spread}, straight ${circles.shape?.straight}`);
check(/curves/.test(Q.shapeWord(circles)), `rings words: ${Q.shapeWord(circles)}`);
check(/diagonals/.test(Q.shapeWord(diag)), `stripes at 45°: ${Q.shapeWord(diag)} (${JSON.stringify(diag.shape)})`);
check(flat.shape === null || /soft, flat/.test(Q.shapeWord(flat) || 'soft, flat'), `flat picture: ${Q.shapeWord(flat)}`);

// ---------- one reference at each distance ----------
const warm = V.fromPixels(img(160, 90, (x, y) => (y < 50 ? [230, 140, 60] : [40, 25, 20])), 160, 90);
warm.moods = V.moods(warm); warm.aspect = '16:9';
const ref = { id: 'a', type: 'image', title: 'Dusk street in Lisbon', src: 'C:/x/dusk.jpg', vibe: warm, like: 'the way the orange light sits on the top half', note: 'tungsten', tags: ['dusk'], alt: 'a tram on a street' };
const close = Q.block([ref], { distance: 10 });
const mid = Q.block([ref], { distance: 50 });
const spirit = Q.block([ref], { distance: 90 });
console.log(`\n--- close ---\n${close}\n--- spirit ---\n${spirit}\n`);
check(close.indexOf('WHAT I LIKE') > 0 && close.indexOf('WHAT I LIKE') < close.indexOf('REFERENCE 1'), 'what I like comes before the reference');
check(/strongest signal/.test(close) && close.includes('"the way the orange light sits on the top half"'), 'the like line is quoted and marked strongest');
check(/palette: #[0-9a-f]{6} \d+%/i.test(close) && /brightness: 0\.\d\d of 1/.test(close) && /contrast: \d\.\d\d/.test(close) && /warmth [+-]\d\.\d\d/.test(close) && /saturation \d\.\d\d/.test(close), 'close: hex + shares, brightness, contrast, warmth, saturation numbers');
check(/grain \d\.\d\d/.test(close) && /detail \d\.\d\d of 1 \((clean|busy|some detail)\)/.test(close), 'close: grain and busy vs clean');
check(/centre of interest at \d+% across/.test(close) && /horizon \d+% down/.test(close) && /negative space \d+%/.test(close) && /symmetry/.test(close), 'close: composition numbers (centre, horizon, space, symmetry)');
check(/shape language:/.test(close), 'close: shape language');
check(/Dusk street/.test(close) && /seen: "a tram/.test(close), 'close: the title and what was seen');
check(/match the palette hexes/.test(close) && !/Don't reproduce the subject/.test(close), 'close: strict wording, no spirit rule');
check(/direction, not exact targets/.test(mid) && !/centre of interest/.test(mid) && /palette: #/.test(mid), 'in between: palette numbers, composition in words only');
check(!/#[0-9a-f]{6}/i.test(spirit.replace(/C:\/x\/dusk\.jpg/, '')) && !/brightness: 0\./.test(spirit) && /feel: /.test(spirit) && /colour families:/.test(spirit), 'spirit: mood-level words only, no hex values or numbers');
check(/Don't reproduce the subject, layout or recognisable elements/.test(spirit), 'spirit: says not to reproduce subject, layout, recognisable elements');
check(!/Lisbon|tram/.test(spirit), 'spirit: no title or "seen" text that names the subject');
check(spirit.includes('"the way the orange light sits on the top half"'), 'spirit still sends what I like');
check(/Vibe only/.test(close) && /Vibe only/.test(spirit), 'the vibe-only rule is kept');
check(/pictures themselves were NOT sent/.test(close), 'says the pictures were not sent');
check(Q.band(0).id === 'close' && Q.band(33).id === 'close' && Q.band(34).id === 'between' && Q.band(67).id === 'spirit' && Q.band('x').id === 'between' && Q.band(500).id === 'spirit', 'distance bands');

// ---------- footage permission stays explicit ----------
check(!/FOOTAGE ALLOWED/.test(close), 'no footage line without permission');
check(/FOOTAGE ALLOWED by the owner.*C:\/x\/dusk\.jpg/.test(Q.block([{ ...ref, footage: true }], { distance: 90 })), 'footage permission: the file path goes with it');

// ---------- unmeasured / failed ----------
const waiting = { id: 'w', type: 'video', title: 'clip', src: 'C:/x/c.mp4' };
const broken = { id: 'f', type: 'image', title: 'broken', src: 'C:/x/b.jpg', vibeError: 'The picture did not load' };
const tw = Q.block([waiting], { distance: 50 });
check(/still being measured/.test(tw) && /don't guess/.test(tw), `unmeasured clip says so: ${tw.split('\n').find((l) => /measured/.test(l))}`);
const tf = Q.block([broken], { distance: 50 });
check(/couldn't be measured \(The picture did not load\)/.test(tf) && !/still being measured/.test(tf), 'a read failure is named, not treated as "no data"');
check(Q.status(waiting).state === 'measuring' && Q.status(broken).state === 'failed' && Q.status(ref).state === 'ready' && Q.status({ type: 'note' }).state === 'none', 'status states');
check(Q.status({ type: 'web', snapError: 'offline', vibe: { palette: [{ hex: '#ff0000', share: 1 }] } }).state === 'failed', 'a site without a snapshot is failed (theme colour alone isn\'t a measurement)');

// ---------- clips ----------
const clipV = { ...warm, kind: 'clip', duration: 12.4, motion: 0.45, cutCount: 3, pace: 3.1, cutsPerMin: 15, lightArc: 'darkening' };
const tc = Q.block([{ id: 'c', type: 'video', title: 'run', vibe: clipV }], { distance: 20 });
check(/motion: 0\.45 of 1 \(lively\), 3 cuts, about 3\.1 s per shot \(15 cuts a minute\)/.test(tc) && /darkening over the clip/.test(tc), 'clip: motion speed and cuts');
check(/energy: lively, quick cuts/.test(Q.block([{ id: 'c', type: 'video', vibe: clipV }], { distance: 80 })), 'clip at spirit: energy words');

// ---------- blend of 2–3 ----------
const cool = V.fromPixels(img(160, 90, () => [40, 90, 200]), 160, 90); cool.moods = V.moods(cool);
const two = [ref, { id: 'b', type: 'image', title: 'blue', vibe: cool, like: 'calm blue' }];
const m = Q.blend(two);
check(m.count === 2 && m.palette.length >= 2 && Math.abs(m.palette.reduce((a, c) => a + c.share, 0) - 1) < 0.05, `blend: merged palette ${JSON.stringify(m.palette)}`);
check(m.light > Math.min(warm.light, cool.light) - 0.01 && m.light < Math.max(warm.light, cool.light) + 0.01, `blend: brightness between the two (${m.light})`);
const tb = Q.block(two, { distance: 40, blend: true });
console.log(`--- blend ---\n${tb}\n`);
check(/BLEND OF 2 REFERENCES/.test(tb) && !/REFERENCE 1/.test(tb) && /reference 1: "the way/.test(tb) && /reference 2: "calm blue"/.test(tb), 'blend block: one look, both likes first');
const tb3 = Q.block([...two, waiting], { distance: 40, blend: true });
check(/2 measured/.test(tb3) && /still being measured, not in the blend yet/.test(tb3), 'blend with an unmeasured clip says so');
const c = Q.card(two, 80);
check(c.measured === 2 && c.words.length >= 3 && c.band.id === 'spirit', `card: ${c.words.join(', ')}`);
const none = Q.block([waiting], { distance: 50, blend: true });
check(/none of them is measured yet/.test(none), 'a blend with nothing measured is never empty');

// ---------- a whole board stays short ----------
const many = Array.from({ length: 12 }, (_, i) => ({ id: `m${i}`, type: 'image', title: `p${i}`, vibe: i % 2 ? warm : cool }));
const tm = Q.block([...many, { id: 'n', type: 'note', text: 'slow push-ins' }], { distance: 50, board: 'Night' });
check(/BLEND OF 12 REFERENCES/.test(tm) && /MY WORDS ON THE BOARD/.test(tm) && /slow push-ins/.test(tm) && tm.length < 2500, `whole board: blended, ${tm.length} chars`);

console.log(fails.length ? `\n${fails.length} failed` : '\nall passed');
process.exit(fails.length ? 1 : 0);
