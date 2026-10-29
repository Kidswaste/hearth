#!/usr/bin/env node
// (round 86, projopen86) the app check's data (dev/checks/projopen86.js): a small profile (dev/bigprofile.js --chats 40
// --long 6 --projects 10) where three projects are active and one of them is heavy. Made up with a fixed seed; never
// real data. On top of bigprofile's projects:
//   · "Clink" (pjbp0) gets a BIG scene: 6 layers, each with ≈ 450 lines of code and real drawing (its renderer, meshes,
//     sliders), and a LONG chat: 1,600 messages with code blocks and tables
//   · Clink also points at 300 files written the other computer's way (Windows: C:\Users\me\AppData\Roaming\Hearth\
//     data\workspace\clink\…), half of them here (data/workspace/clink), half not arrived: the export card maps each
//     one to this computer (reachmain localize)
//   · projects 1 and 2 stay medium (a 400-message chat, 6 related chats, 120 files): the name ▾ switches between the 3
//   node dev/projopen86-fixture.js [dir]          (default /tmp/hearth-projopen86)
'use strict';
const fs = require('fs');
const path = require('path');
const { bigprofile } = require('./bigprofile');

function make(dir = '/tmp/hearth-projopen86') {
  fs.rmSync(dir, { recursive: true, force: true });
  const r = bigprofile(dir, { chats: 40, long: 6, projects: 10, seed: 86 });
  let s = 8611;
  const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  const int = (a, b) => a + Math.floor(rnd() * (b - a + 1));
  const WORDS = 'orb particles bloom kick snare intro logo shader noise flow glitch neon chrome glass ember forge spark title beat drop bass synth camera orbit loop palette vinyl poster grain fog rain city night ocean tunnel portal crystal'.split(' ');
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  const sentence = (n) => Array.from({ length: n }, () => pick(WORDS)).join(' ');
  const kv = (n) => path.join(dir, 'kv', n);
  const pj = JSON.parse(fs.readFileSync(kv('projects.json'), 'utf8'));
  const clink = pj.list.find((p) => p.id === 'pjbp0');
  const now = Date.now();

  // the big scene: Clink's own scene, 6 layers that draw (as bigprofile's do: each says when its code starts)
  const sketches = JSON.parse(fs.readFileSync(kv('three-sketches.json'), 'utf8'));
  const sk = sketches.find((x) => x.id === clink.workspace.sceneId);
  const draw = sketches.find((x) => x.layers.length >= 2).layers[1].code.split('\n').filter((l) => !/^const v\d+ = /.test(l) && !/^\/\/ scene/.test(l) && !/^import /.test(l) && !/^const scene = new THREE\.Scene/.test(l));
  sk.name = 'Clink: the big one';
  sk.layers = Array.from({ length: 6 }, (_, l) => ({ id: l ? `l${l}` : 'main', name: l ? `Layer ${l}` : 'Main', slot: l, visible: true, opacity: 1,
    code: `import * as THREE from 'three';\n// big scene layer ${l}\n${Array.from({ length: 450 }, (_, k) => `const v${k} = ${(k * 0.37).toFixed(2)}; // knob ${k} ${pick(WORDS)}`).join('\n')}\nconst scene = new THREE.Scene();\n${draw.join('\n').replace(/\bP1\b/g, `P${l}`).replace(/alpha: (true|false)/, `alpha: ${l ? 'true' : 'false'}`)}\n` }));
  sk.code = sk.layers[0].code; sk.updatedAt = now;
  fs.writeFileSync(kv('three-sketches.json'), JSON.stringify(sketches));

  // the long chat: 1,600 messages, replies with lists, code and tables
  const reply = (k) => {
    const parts = [`Here is **${sentence(3)}** with \`${pick(WORDS)}\`.`, '', `- ${sentence(8)}`, `- ${sentence(10)}`, '', sentence(30 + int(0, 80))];
    if (k % 5 === 1) parts.push('', '```js', ...Array.from({ length: int(6, 30) }, (_, j) => `const v${j} = ${j * 3}; // ${sentence(4)}`), '```');
    if (k % 11 === 3) parts.push('', '| part | value |', '|---|---|', ...Array.from({ length: int(3, 10) }, (_, j) => `| ${pick(WORDS)} | ${j * 3} |`));
    return parts.join('\n');
  };
  const N = 1600; const t0 = now - N * 90e3;
  const messages = Array.from({ length: N }, (_, k) => (k % 2 === 0
    ? { role: 'user', text: `${sentence(int(5, 25))}?`, at: t0 + k * 90e3 }
    : { role: 'assistant', text: reply(k), at: t0 + k * 90e3, usage: { input: 2000, output: 600 }, model: 'claude-opus' }));
  const cf = path.join(dir, 'chats', `${clink.workspace.chatId}.json`);
  const chat = JSON.parse(fs.readFileSync(cf, 'utf8'));
  fs.writeFileSync(cf, JSON.stringify({ ...chat, messages, updatedAt: messages.at(-1).at }));

  // 300 files written the other computer's way, half of them here
  const here = path.join(dir, 'workspace', 'clink'); fs.mkdirSync(here, { recursive: true });
  for (let k = 0; k < 300; k++) {
    const name = `${pick(['ref', 'take', 'poster', 'clip'])}-w${k}.${pick(['png', 'wav', 'txt'])}`;
    if (k % 2 === 0) fs.writeFileSync(path.join(here, name), `made up ${k}`);
    const ref = `C:\\Users\\me\\AppData\\Roaming\\Hearth\\data\\workspace\\clink\\${name}`;
    clink.items.push({ id: `file:${ref}`, type: 'file', ref, name, at: now - k * 6e4 });
  }
  fs.writeFileSync(kv('projects.json'), JSON.stringify(pj));
  return { ...r, clinkItems: clink.items.length, bigScene: { layers: sk.layers.length, chars: sk.layers.reduce((n, L) => n + L.code.length, 0) }, longChat: N,
    active: pj.list.filter((p) => p.status === 'active').map((p) => p.name) };
}
if (require.main === module) { const t0 = Date.now(); console.log(JSON.stringify({ ...make(process.argv[2] || undefined), ms: Date.now() - t0 })); }
module.exports = { make };
