// Validate bytes actually written by the Electron smoke test, not only in-memory generators.
const fs = require('fs'), path = require('path'), assert = require('assert/strict'), vm = require('vm');
const dir = process.argv[2]; if (!dir) throw Error('Pass the smoke test --save-dir.');
const read = (name, encoding) => { const [kind, ext] = name.split('.'); return fs.readFileSync(path.join(dir, `hearth-${kind}-hearth-01.${ext}`), encoding); };
const png = read('poster.png'); assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a'); assert.equal(png.readUInt32BE(16), 512); assert.equal(png.readUInt32BE(20), 512);
const svg = read('poster.svg', 'utf8'); assert(svg.startsWith('<svg') && svg.endsWith('</svg>'));
const wav = read('drums.wav'); assert.equal(wav.subarray(0, 4).toString(), 'RIFF'); assert.equal(wav.subarray(8, 12).toString(), 'WAVE'); assert.equal(wav.readUInt32LE(4), wav.length - 8); assert.equal(wav.readUInt32LE(40), wav.length - 44); assert.equal(wav.readUInt32LE(24), 22050);
const midi = read('melody.mid'); assert.equal(midi.subarray(0, 4).toString(), 'MThd'); assert.equal(midi.readUInt32BE(18), midi.length - 22); assert.equal(midi.subarray(-4).toString('hex'), '00ff2f00');
for (const game of ['arena', 'maze', 'rhythm']) { const html = read(game + '.html', 'utf8'), script = html.match(/<script>([\s\S]*)<\/script>/)?.[1]; assert(script, game + ' executable export'); new vm.Script(script); assert(html.includes('<canvas') && !html.includes('https://')); }
const maze = JSON.parse(read('maze.json', 'utf8')); assert(maze.grid[maze.start[1]][maze.start[0]] === 0 && maze.grid[maze.goal[1]][maze.goal[0]] === 0); assert.equal(maze.grid.length, maze.height);
const recipe = JSON.parse(read('inspire.json', 'utf8')); assert.equal(recipe.feature, 'inspire'); assert.equal(recipe.settings.seed, 'hearth-01'); assert.equal(recipe.v, 1);
console.log('creative-export-test: all 9 exported files have valid format, dimensions/lengths and executable game source');
