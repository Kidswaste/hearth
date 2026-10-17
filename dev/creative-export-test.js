// Validate files written through Electron save IPC, rather than generator strings alone.
const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const dir=process.argv[2];if(!dir)throw Error('Pass the smoke --save-dir.');
const png=fs.readFileSync(path.join(dir,'hearth-seamless-tile.png'));
assert.equal(png.subarray(0,8).toString('hex'),'89504e470d0a1a0a');assert.equal(png.readUInt32BE(16),512);assert.equal(png.readUInt32BE(20),512);
const svg=fs.readFileSync(path.join(dir,'hearth-seamless-tile.svg'),'utf8');assert(svg.startsWith('<svg')&&svg.endsWith('</svg>')&&svg.includes('<pattern'));
console.log('creative-export-test: saved PNG dimensions and SVG repeat pattern valid');
