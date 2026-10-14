// (round 35, streamrender) A huge, realistic reply for the fake engines (dev/fake-common.js), to measure streaming:
// long Markdown with headings and inline formatting, big code blocks (JS with GLSL in template literals, block
// comments, strings), a long table, a long nested list with tasks, many pictures, callouts and formulas.
//   "huge"               every part (≈ 100 KB; FAKE_HUGE_KB sets the size)
//   "huge-code" / "huge-table" / "huge-list" / "huge-images" / "huge-text"   one kind only (same size)
//   "huge-160k", "huge-code-40k"   another size (in thousands of characters)
// Pictures point at https://img.hearth.test/<w>x<h>/<n>.png: dev/smoke.js answers them with a real PNG of that size
// after a short delay (FAKE_IMG_MS in the check's page, default 400 ms), like a slow network.
// Deterministic: the same words give the same reply.
const WORDS = 'the field breathes with every kick while the camera drifts through soft fog and the bloom catches each bright particle as it swirls past layered rings of light that fold and unfold in time with the bass line'.split(' ');
let seed = 7;
const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
const pick = (a) => a[Math.floor(rnd() * a.length)];
const words = (n) => Array.from({ length: n }, () => pick(WORDS)).join(' ');
const sentence = () => { const s = words(8 + Math.floor(rnd() * 14)); return `${s[0].toUpperCase()}${s.slice(1)}.`; };
// a paragraph with the inline things models write: bold, italics, code, links, a formula now and then
function para(i) {
  const s = [sentence(), sentence(), sentence()];
  s[0] = s[0].replace(/(\w+) (\w+)/, '**$1 $2**');
  if (i % 2) s[1] = s[1].replace(/ (\w+) /, ' `$1()` ');
  if (i % 3 === 0) s[2] = s[2].replace(/(\w+)\.$/, '[$1](https://threejs.org/docs/) — see *the docs*.');
  if (i % 7 === 0) s.push('The falloff is $a = e^{-k t}$ with $k$ near 2.');
  return s.join(' ');
}

function code(lines) {
  const out = ["import * as THREE from 'three';", "import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';", '', '/*', ' * Particle field that reacts to the music.', ' * Bass pushes the rings out, hats sparkle the tips.', ' */'];
  out.push('const vertexShader = `', 'uniform float uTime;', 'uniform float uBass;', 'attribute float aSeed;', 'varying float vGlow;', 'void main() {', '  vec3 p = position;', '  float r = length(p.xz);', '  p.y += sin(r * 4.0 - uTime * 2.0) * 0.2 * uBass;', '  vGlow = smoothstep(0.2, 1.0, uBass) * aSeed;', '  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);', '  gl_PointSize = 2.0 + 6.0 * vGlow;', '}', '`;', '');
  let i = 0;
  while (out.length < lines) {
    i += 1;
    out.push(`// ring ${i}: ${words(6)}`);
    out.push(`function ring${i}(scene, opts = { count: ${200 + i * 13}, radius: ${(1 + i * 0.07).toFixed(2)}, color: '#${(0x223344 + i * 4111).toString(16).slice(-6)}' }) {`);
    out.push('  const geo = new THREE.BufferGeometry();');
    out.push('  const pos = new Float32Array(opts.count * 3);');
    out.push('  for (let k = 0; k < opts.count; k++) {');
    out.push(`    const a = (k / opts.count) * Math.PI * 2; // angle of particle k`);
    out.push('    pos[k * 3] = Math.cos(a) * opts.radius;');
    out.push(`    pos[k * 3 + 1] = (Math.random() - 0.5) * ${(0.1 + (i % 5) * 0.05).toFixed(2)};`);
    out.push('    pos[k * 3 + 2] = Math.sin(a) * opts.radius;');
    out.push('  }');
    out.push("  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));");
    if (i % 4 === 0) out.push('  /* a block comment that spans', `     two lines: ${words(5)} */`);
    out.push(`  const mat = new THREE.PointsMaterial({ size: ${(0.02 + i * 0.001).toFixed(3)}, color: opts.color, transparent: true });`);
    out.push(`  const msg = "ring ${i} ready: " + opts.count + ' points';`);
    out.push('  scene.add(new THREE.Points(geo, mat));');
    out.push('  return msg;');
    out.push('}');
    out.push('');
  }
  return `\`\`\`js\n${out.slice(0, lines).join('\n')}\n\`\`\``;
}
function glsl(lines) {
  const out = ['precision highp float;', 'uniform float uTime;', 'uniform vec2 uRes;', 'varying vec2 vUv;'];
  let i = 0;
  while (out.length < lines) { i += 1; out.push(`// layer ${i}`, `float wave${i}(vec2 p) { return sin(p.x * ${i}.0 + uTime) * cos(p.y * ${i + 1}.0 - uTime * 0.${i % 9 + 1}); }`); }
  out.push('void main() { vec2 p = vUv * 2.0 - 1.0; float v = wave1(p); gl_FragColor = vec4(vec3(v), 1.0); }');
  return `\`\`\`glsl\n${out.join('\n')}\n\`\`\``;
}
function table(rows) {
  const out = ['| # | Slider | Default | Range | What it does |', '| ---: | --- | :---: | --- | --- |'];
  for (let i = 1; i <= rows; i++) out.push(`| ${i} | \`${pick(['bloom', 'spin', 'punch', 'fog', 'hue', 'rings', 'size', 'trail'])}${i}\` | ${(rnd() * 3).toFixed(2)} | 0 – ${1 + (i % 5)} | ${i % 4 === 0 ? '**' : ''}${words(5 + (i % 6))}${i % 4 === 0 ? '**' : ''} |`);
  return out.join('\n');
}
function list(items) {
  const out = [];
  for (let i = 1; i <= items; i++) {
    out.push(i % 9 === 0 ? `- [${i % 2 ? 'x' : ' '}] ${words(6)}` : `- ${i % 5 === 0 ? '**Step** ' : ''}${words(5 + (i % 7))}${i % 3 === 0 ? ' with `code`' : ''}`);
    if (i % 6 === 0) { out.push(`  - ${words(5)}`); out.push(`  - ${words(4)} ==highlight==`); }
  }
  return out.join('\n');
}
function images(n, base) {
  const out = [];
  for (let i = 1; i <= n; i++) {
    const [w, h] = [[640, 360], [400, 400], [300, 500], [1200, 675], [200, 120]][i % 5];
    out.push(`![Reference ${base + i}](https://img.hearth.test/${w}x${h}/${base + i}.png)\n\n${para(i)}`);
  }
  return out.join('\n\n');
}

function huge(msg) {
  const m = msg.match(/\bhuge(?:-(code|table|list|images|text))?(?:-(\d+)k)?\b/i);
  if (!m) return null;
  seed = 7;
  const kind = (m[1] || '').toLowerCase();
  const kb = Number(m[2] || process.env.FAKE_HUGE_KB || 100);
  const parts = [];
  const size = () => parts.join('\n\n').length;
  const add = (s) => parts.push(s);
  add('# A music-reactive particle field\n\nHere is the whole thing, step by step. I kept every part so you can paste it as is.');
  let n = 0;
  while (size() < kb * 1000) {
    n += 1;
    if (!kind || kind === 'text') { add(`## Part ${n}: ${words(4)}`); for (let i = 0; i < 4; i++) add(para(n * 10 + i)); }
    if (!kind || kind === 'list') add(`### Checklist ${n}\n${list(kind ? 120 : 40)}`);
    if (!kind || kind === 'code') { add(`The code for part ${n}:`); add(code(kind ? 400 : 160)); if (n % 2 === 0) add(glsl(kind ? 120 : 40)); }
    if (!kind || kind === 'table') { add(`### Sliders ${n}`); add(table(kind ? 150 : 50)); }
    if (!kind || kind === 'images') add(images(kind ? 12 : 4, n * 100));
    if (!kind) { add('> [!TIP] Keep it light\n> Lower the point count on a laptop.\n> The rings still read well at half.'); add('$$\nI(t) = \\sum_i a_i \\sin(\\omega_i t)\n$$'); add('---'); }
  }
  add('That is all: run it and tell me what to change.');
  return parts.join('\n\n');
}

module.exports = { huge };
