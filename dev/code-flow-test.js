#!/usr/bin/env node
// Unit test for the code flow parser (nodes-code.js) in plain Node: samples in JS, TS, Python, GLSL, partial
// code, and every .js file of the app itself (it must not throw and must find functions and calls).
//   node dev/code-flow-test.js
const fs = require('fs');
const path = require('path');
const CF = require('../nodes-code.js');
let fails = 0;
const ok = (cond, msg) => { if (!cond) { fails += 1; console.log(`✕ ${msg}`); } else console.log(`✓ ${msg}`); };
const names = (r, kind) => r.units.filter((u) => !kind || u.kind === kind).map((u) => u.name);
const callsOf = (r, name) => { const u = r.units.find((x) => x.name === name); return u ? [...u.calls].map((id) => r.units.find((x) => x.id === id)?.name) : null; };

// JS: functions, arrows, classes, methods, callbacks, statements, template literals, regex
let r = CF.parse(`import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
const renderer = new THREE.WebGLRenderer({ antialias: true });
const scene = new THREE.Scene();
function makeBox(size = 1) { const m = mat(\`#\${size}\`); return new THREE.Mesh(geo(size), m); }
const geo = (s) => new THREE.BoxGeometry(s, s, s);
const mat = (c) => { const re = /#[0-9a-f]{6}/i; return new THREE.MeshStandardMaterial({ color: re.test(c) ? c : '#fff' }); };
class Spinner extends Base {
  constructor(obj) { super(); this.obj = obj; this.reset(); }
  reset() { this.t = 0; }
  update(dt) { this.t += dt; this.obj.rotation.y = this.t; if (this.t > 10) this.reset(); }
}
const box = makeBox(2);
scene.add(box);
const spin = new Spinner(box);
addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
});
renderer.setAnimationLoop((t) => {
  spin.update(0.016);
  renderer.render(scene, camera);
});
`, 'js');
ok(names(r, 'fn').includes('makeBox') && names(r, 'fn').includes('geo') && names(r, 'fn').includes('mat'), 'JS functions and arrows');
ok(names(r, 'class').includes('Spinner'), 'JS class');
ok(['constructor', 'reset', 'update'].every((n) => names(r, 'method').includes(n)), 'JS methods');
ok(callsOf(r, 'makeBox')?.includes('mat') && callsOf(r, 'makeBox')?.includes('geo'), 'makeBox calls mat and geo (inside a template literal too)');
ok(callsOf(r, 'update')?.includes('reset'), 'this.reset() resolves to the method');
ok(callsOf(r, 'constructor')?.includes('reset'), 'constructor calls reset');
ok(r.units.some((u) => u.kind === 'callback' && u.name === 'on resize'), 'addEventListener callback named "on resize"');
ok(r.units.some((u) => u.kind === 'callback' && u.name === 'every frame'), 'setAnimationLoop callback named "every frame"');
ok(callsOf(r, 'every frame')?.includes('update'), 'the frame callback calls update');
ok(r.units.filter((u) => u.kind === 'step').length >= 3, `top-level steps (${r.units.filter((u) => u.kind === 'step').length})`);
ok(r.units.some((u) => u.kind === 'import'), 'imports');
const stepCalls = r.units.filter((u) => u.kind === 'step').flatMap((u) => [...u.calls].map((id) => r.units.find((x) => x.id === id)?.name));
ok(stepCalls.includes('makeBox') && stepCalls.includes('Spinner'), 'steps call makeBox and new Spinner');

// TS
r = CF.parse(`interface Opts { size: number; color?: string }
type Mode = 'a' | 'b';
export function make<T extends Opts>(o: T): Mesh { return build(o.size); }
const build = (n: number): Mesh => { return new Mesh(n); };
export default class Thing implements X { private n = 0; run(m: Mode): void { make({ size: this.n }); } }
`, 'ts');
ok(names(r, 'type').includes('Opts') && names(r, 'type').includes('Mode'), 'TS interface and type');
ok(callsOf(r, 'make')?.includes('build'), 'TS generic function calls the typed arrow');
ok(callsOf(r, 'run')?.includes('make'), 'TS method calls make');

// Python
r = CF.parse(`import os
from math import sin

class Ball(Sprite):
    def __init__(self, x):
        self.x = x
        self.reset()

    def reset(self):
        self.vx = 0

    @property
    def speed(self):
        return abs(self.vx)

def main():
    b = Ball(3)
    for i in range(10):
        step(b)
    print(b.speed)

def step(b):
    b.reset()

if __name__ == "__main__":
    main()
`, 'py');
ok(names(r, 'class').includes('Ball'), 'Python class');
ok(['__init__', 'reset', 'speed'].every((n) => names(r, 'method').includes(n)), 'Python methods (with a decorator)');
ok(callsOf(r, '__init__')?.includes('reset'), 'self.reset() resolves');
ok(callsOf(r, 'main')?.includes('Ball') && callsOf(r, 'main')?.includes('step'), 'main calls Ball and step');
ok(r.units.some((u) => u.kind === 'step' && /__main__/.test(u.name)), 'the __main__ block is a step');
ok(r.units.some((u) => u.kind === 'step' && [...u.calls].some((id) => r.units.find((x) => x.id === id)?.name === 'main')), 'it calls main');

// GLSL
r = CF.parse(`precision highp float;
uniform float uTime;
uniform vec2 uResolution;
#define PI 3.14159
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9, 78.2))) * 43758.5); }
float noise(vec2 p) { vec2 i = floor(p); return mix(hash(i), hash(i + 1.0), 0.5); }
void main() {
  vec2 uv = gl_FragCoord.xy / uResolution;
  gl_FragColor = vec4(vec3(noise(uv * 8.0 + uTime)), 1.0);
}`, 'glsl');
ok(names(r).includes('hash') && names(r).includes('noise'), 'GLSL functions');
ok(r.units.some((u) => u.kind === 'entry' && u.name === 'main'), 'GLSL main is the entry');
ok(callsOf(r, 'main')?.includes('noise') && callsOf(r, 'noise')?.includes('hash'), 'GLSL calls');
ok(r.units.some((u) => u.kind === 'import' && /uTime/.test(u.text)), 'GLSL inputs node lists uniforms');

// partial code (a reply cut mid-stream)
r = CF.parse(`function a() { return b(1, "unterminated
function b(x) { if (x) { return a(`, 'js');
ok(r.units.length >= 1, 'partial code still parses');
r = CF.parse(`def f(x):
    return g(x
def g(`, 'py');
ok(r.units.length >= 1, 'partial Python still parses');
// language guessing
ok(CF.guessLang('def x():\n  pass') === 'py' && CF.guessLang('void main() { gl_FragColor = vec4(1.0); }') === 'glsl' && CF.guessLang('const a = () => 1;') === 'js' && CF.guessLang('{"a":1}', 'json') === null, 'language guessing');

// every JS file of the app: no throw, some functions found
const root = path.join(__dirname, '..');
const files = [...fs.readdirSync(root).filter((f) => f.endsWith('.js')).map((f) => path.join(root, f)), ...fs.readdirSync(path.join(root, 'tools')).filter((f) => f.endsWith('.js')).map((f) => path.join(root, 'tools', f))];
let total = 0; let t0 = Date.now();
for (const f of files) {
  const src = fs.readFileSync(f, 'utf8');
  try {
    const p = CF.parse(src, 'js');
    const fns = p.units.filter((u) => ['fn', 'method', 'callback', 'module'].includes(u.kind)).length;
    total += fns;
    if (!fns && src.length > 2000) { fails += 1; console.log(`✕ no functions found in ${path.basename(f)}`); }
  } catch (err) { fails += 1; console.log(`✕ ${path.basename(f)} threw: ${err.stack.split('\n').slice(0, 3).join(' | ')}`); }
}
console.log(`  ${files.length} app files: ${total} functions in ${Date.now() - t0} ms`);
const big = CF.parse(fs.readFileSync(path.join(root, 'nodes.js'), 'utf8'), 'js');
ok(big.units.some((u) => u.kind === 'module' && u.name === 'NodeView'), 'nodes.js: the NodeView IIFE is a module');
ok(callsOf(big, 'renderAll')?.includes('renderNode'), 'nodes.js: renderAll calls renderNode');
console.log(fails ? `\n${fails} failed` : '\nall passed');
process.exit(fails ? 1 : 0);
