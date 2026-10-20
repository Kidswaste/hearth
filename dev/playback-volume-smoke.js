const fs = require('fs'), os = require('os'), path = require('path'), { pathToFileURL } = require('url');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hearth-volume-'));
const frame = path.join(dir, 'frame.html'), script = path.join(dir, 'check.js');
const bootstrap = fs.readFileSync(path.join(__dirname, '../tools/three-sandbox.html'), 'utf8').match(/<script data-hearth-playback>[\s\S]*?<\/script>/)[0];
fs.writeFileSync(frame, `${bootstrap}<script>addEventListener("message",()=>parent.postMessage({volumeTest:true,level:window.__hearthVolume?.get()},"*"))</script>`);
fs.writeFileSync(script, fs.readFileSync(path.join(__dirname, 'checks/playback-volume.js'), 'utf8').replace('__VOLUME_FRAME__', pathToFileURL(frame).href));
const r = require('child_process').spawnSync(process.execPath, [path.join(__dirname, 'smoke.js'), '--fake-engines', '--script', script, '--shot', path.join(dir, 'volume.png')], { stdio: 'inherit', env: process.env });
process.exitCode = r.status || (r.error ? 1 : 0);
