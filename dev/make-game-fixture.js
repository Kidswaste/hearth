#!/usr/bin/env node
// ▶ Play's fixtures (round 52, gamemode), in a throwaway folder: node dev/make-game-fixture.js /tmp/hearth-gamemode
//   html/          the test game (dev/fixtures/game-html) with three.js copied into html/lib/ (from $HEARTH_THREE_DIR or
//                  /opt/cdn-cache/three@0.186.1/package), loaded by ▶ Play from its folder as it is
//   lab-scene.json the game-like Lab scene in three layers (dev/fixtures/game-lab-scene.js)
const fs = require('fs');
const path = require('path');
const dest = path.resolve(process.argv[2] || '/tmp/hearth-gamemode');
const THREE = process.env.HEARTH_THREE_DIR || '/opt/cdn-cache/three@0.186.1/package';
const src = path.join(__dirname, 'fixtures', 'game-html');
fs.mkdirSync(path.join(dest, 'html', 'lib'), { recursive: true });
fs.cpSync(src, path.join(dest, 'html'), { recursive: true });
for (const f of ['three.module.js', 'three.core.js']) { const p = path.join(THREE, 'build', f); if (fs.existsSync(p)) fs.copyFileSync(p, path.join(dest, 'html', 'lib', f)); }
if (!fs.existsSync(path.join(dest, 'html', 'lib', 'three.module.js'))) throw new Error(`no three.js at ${THREE} (set HEARTH_THREE_DIR)`);
fs.writeFileSync(path.join(dest, 'lab-scene.json'), JSON.stringify(require('./fixtures/game-lab-scene.js')));
console.log(dest);
