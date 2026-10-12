// A fake OBS Studio for the interop checks (round 25): an obs-websocket v5 server (Hello with an auth challenge,
// Identify checked with the password, requests, events) with three scenes, recording and streaming, plus GET /state
// for the check to read what "OBS" did. No OBS needed.
//   const f = await require('./fake-obs').start({ password: 'pw' })  →  { url, state, password, close() }
//   node dev/fake-obs.js [port] [password]      (standalone, for trying /obs by hand)
const http = require('http');
const crypto = require('crypto');

const sha64 = (s) => crypto.createHash('sha256').update(s).digest('base64');
function frame(op, payload) {
  const len = payload.length;
  const h = len < 126 ? Buffer.from([0x80 | op, len]) : len < 65536 ? Buffer.from([0x80 | op, 126, len >> 8, len & 255]) : (() => { const b = Buffer.alloc(10); b[0] = 0x80 | op; b[1] = 127; b.writeUInt32BE(0, 2); b.writeUInt32BE(len, 6); return b; })();
  return Buffer.concat([h, payload]);
}

function start({ port = 0, password = 'hearth-test-pw' } = {}) {
  const S = { scenes: ['Intro', 'Main', 'Outro'], current: 'Intro', record: false, stream: false, inputs: [], log: [], identified: 0, authFails: 0, clients: 0 };
  const socks = new Set();
  const event = (eventType, eventData, intent) => { const t = frame(1, Buffer.from(JSON.stringify({ op: 5, d: { eventType, eventIntent: intent, eventData } }))); for (const s of socks) if (s.ok) s.write(t); };
  function request(type, data = {}) {
    S.log.push(type);
    switch (type) {
      case 'GetVersion': return { obsVersion: '31.0.0', obsWebSocketVersion: '5.5.0', rpcVersion: 1, availableRequests: [] };
      case 'GetStats': return { cpuUsage: 3.2, activeFps: 60, renderSkippedFrames: 0, outputSkippedFrames: 0 };
      case 'GetSceneList': return { currentProgramSceneName: S.current, currentPreviewSceneName: null, scenes: S.scenes.map((n, i) => ({ sceneName: n, sceneIndex: S.scenes.length - 1 - i })).reverse() };
      case 'GetCurrentProgramScene': return { currentProgramSceneName: S.current, sceneName: S.current };
      case 'SetCurrentProgramScene': if (!S.scenes.includes(data.sceneName)) throw Object.assign(new Error('No source was found by the name of the scene'), { code: 600 }); S.current = data.sceneName; event('CurrentProgramSceneChanged', { sceneName: S.current }, 4); return {};
      case 'GetRecordStatus': return { outputActive: S.record, outputPaused: false, outputTimecode: '00:00:00.000', outputDuration: 0, outputBytes: 0 };
      case 'StartRecord': if (S.record) throw Object.assign(new Error('Output already active'), { code: 500 }); S.record = true; event('RecordStateChanged', { outputActive: true, outputState: 'OBS_WEBSOCKET_OUTPUT_STARTED' }, 64); return {};
      case 'StopRecord': if (!S.record) throw Object.assign(new Error('Output not active'), { code: 501 }); S.record = false; event('RecordStateChanged', { outputActive: false, outputState: 'OBS_WEBSOCKET_OUTPUT_STOPPED', outputPath: '/tmp/fake.mkv' }, 64); return { outputPath: '/tmp/fake.mkv' };
      case 'ToggleRecord': return request(S.record ? 'StopRecord' : 'StartRecord');
      case 'GetStreamStatus': return { outputActive: S.stream, outputTimecode: '00:00:00.000' };
      case 'StartStream': S.stream = true; event('StreamStateChanged', { outputActive: true, outputState: 'OBS_WEBSOCKET_OUTPUT_STARTED' }, 64); return {};
      case 'StopStream': S.stream = false; event('StreamStateChanged', { outputActive: false, outputState: 'OBS_WEBSOCKET_OUTPUT_STOPPED' }, 64); return {};
      case 'GetInputList': return { inputs: S.inputs.map((x) => ({ inputName: x.inputName, inputKind: x.inputKind })) };
      case 'CreateInput': if (S.inputs.some((x) => x.inputName === data.inputName)) throw Object.assign(new Error('An input already exists by that input name'), { code: 601 }); S.inputs.push({ ...data }); return { inputUuid: crypto.randomUUID(), sceneItemId: S.inputs.length };
      default: throw Object.assign(new Error(`Unknown request ${type}`), { code: 204 });
    }
  }
  const srv = http.createServer((req, res) => {
    if (req.url === '/state') { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ...S, log: S.log.slice(-60) })); return; }
    res.writeHead(404); res.end();
  });
  srv.on('upgrade', (req, sock) => {
    const accept = crypto.createHash('sha1').update(`${req.headers['sec-websocket-key']}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`).digest('base64');
    sock.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\nSec-WebSocket-Protocol: obswebsocket.json\r\n\r\n`);
    socks.add(sock); S.clients += 1;
    const salt = crypto.randomBytes(16).toString('base64'); const challenge = crypto.randomBytes(16).toString('base64');
    sock.write(frame(1, Buffer.from(JSON.stringify({ op: 0, d: { obsWebSocketVersion: '5.5.0', rpcVersion: 1, ...(password ? { authentication: { challenge, salt } } : {}) } }))));
    const closeWith = (code, why) => { const b = Buffer.alloc(2 + Buffer.byteLength(why)); b.writeUInt16BE(code); b.write(why, 2); sock.end(frame(8, b)); };
    let buf = Buffer.alloc(0);
    sock.on('data', (d) => {
      buf = Buffer.concat([buf, d]);
      while (buf.length >= 2) {
        const op = buf[0] & 0x0f; let len = buf[1] & 0x7f; let off = 2;
        if (len === 126) { if (buf.length < 4) return; len = buf.readUInt16BE(2); off = 4; } else if (len === 127) { if (buf.length < 10) return; len = buf.readUInt32BE(6); off = 10; }
        if (buf.length < off + 4 + len) return;
        const mask = buf.subarray(off, off + 4); const data = Buffer.from(buf.subarray(off + 4, off + 4 + len)); buf = buf.subarray(off + 4 + len);
        for (let i = 0; i < data.length; i += 1) data[i] ^= mask[i & 3];
        if (op === 8) { sock.end(frame(8, data.subarray(0, 2))); return; }
        if (op !== 1) continue;
        const m = JSON.parse(data.toString('utf8'));
        if (m.op === 1) {
          if (password && m.d.authentication !== sha64(sha64(password + salt) + challenge)) { S.authFails += 1; closeWith(4009, 'Authentication failed.'); return; }
          sock.ok = true; S.identified += 1;
          sock.write(frame(1, Buffer.from(JSON.stringify({ op: 2, d: { negotiatedRpcVersion: 1 } }))));
        } else if (m.op === 6) {
          if (!sock.ok) { closeWith(4007, 'Not identified'); return; }
          let d;
          try { d = { requestType: m.d.requestType, requestId: m.d.requestId, requestStatus: { result: true, code: 100 }, responseData: request(m.d.requestType, m.d.requestData) }; } catch (err) { d = { requestType: m.d.requestType, requestId: m.d.requestId, requestStatus: { result: false, code: err.code || 600, comment: err.message } }; }
          sock.write(frame(1, Buffer.from(JSON.stringify({ op: 7, d }))));
        }
      }
    });
    sock.on('error', () => {}); sock.on('close', () => socks.delete(sock));
  });
  return new Promise((resolve) => srv.listen(port, '127.0.0.1', () => {
    const p = srv.address().port;
    resolve({ url: `ws://127.0.0.1:${p}`, state: `http://127.0.0.1:${p}/state`, password, S, close: () => { for (const s of socks) s.destroy(); srv.close(); } });
  }));
}

module.exports = { start };
if (require.main === module) start({ port: Number(process.argv[2]) || 4455, password: process.argv[3] ?? 'hearth-test-pw' }).then((f) => console.log(`fake OBS on ${f.url} (password ${f.password ? 'set' : 'none'})`));
