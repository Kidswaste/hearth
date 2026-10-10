// Pictures and videos a reply made show big in the chat (chat-media.js): names without a full path ("out/poster.png",
// "sandbox:/mnt/data/clip.mp4") found in the workspace, a file written while the reply ran found by itself, the
// small cards for them replaced by the big ones, ⤢ / a click opens the full-size viewer, ⬇ saves a copy, /media off.
//   node dev/smoke.js --fake-engines --check-timeout 200000 --script dev/checks/chat-media.js --shot /tmp/chat-media.png
const VID = '/tmp/hearth-capture-test/cfr25.mp4';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 20000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch { /* not yet */ } await wait(120); } return false; };
const fail = []; const out = {};
const ok = (cond, what) => { if (!cond) fail.push(what); return Boolean(cond); };
const C = H.claudeAgent();
const v = () => Native.view(C.id);
const png = (color) => { const c = document.createElement('canvas'); c.width = 320; c.height = 180; const g = c.getContext('2d'); g.fillStyle = color; g.fillRect(0, 0, 320, 180); return c.toDataURL('image/png').split(',')[1]; };
try {
  activate(C.id);
  await until(() => Native.hasView(C.id));
  Native.newChat(C.id);
  const { roots } = await window.hub.chatMedia.find({});
  const ws = roots[0];
  ok(ws && /workspace$/.test(ws), `the workspace is searched (${ws})`);
  const sep = ws.includes('\\') ? '\\' : '/';
  await window.hub.fs.write(`${ws}${sep}out${sep}poster.png`, png('#e0337a'), { base64: true });
  await window.hub.fs.copy(VID, `${ws}${sep}clip.mp4`);
  await wait(2000); // older than the reply: found by name only

  // the reply names both without a full path; a third file is written as it starts (the fake replies at once)
  await window.hub.fs.write(`${ws}${sep}fresh-render.png`, png('#33c0e0'), { base64: true });
  await Native.send(C.id, 'slow out/poster.png sandbox:/mnt/data/clip.mp4');
  await until(() => Native.current(C.id).messages.at(-1)?.role === 'assistant', 60000);
  await until(() => (Native.current(C.id).messages.at(-1)?.things || []).length >= 3, 8000);
  const m = Native.current(C.id).messages.at(-1);
  out.things = (m.things || []).map((t) => `${t.k}:${t.name}:${t.src}`);
  ok(m.things?.some((t) => t.name === 'poster.png' && t.path.endsWith(`out${sep}poster.png`)), 'out/poster.png found by name');
  ok(m.things?.some((t) => t.name === 'clip.mp4' && t.k === 'video'), 'sandbox:/mnt/data/clip.mp4 found by its file name');
  ok(m.things?.some((t) => t.name === 'fresh-render.png' && t.src === 'made'), 'a file written while the reply ran is found by itself');

  await until(() => v().list.querySelector('.msg.assistant:last-of-type .cm-heroes, .msg.assistant .cm-heroes'), 5000);
  const last = [...v().list.querySelectorAll('.msg.assistant')].at(-1);
  const heroes = [...last.querySelectorAll('.cm-hero')];
  out.heroes = heroes.map((f) => f.querySelector('.cm-name')?.textContent);
  ok(heroes.length === 2, `two big ones under the reply (${heroes.length})`);
  const img = last.querySelector('.cm-hero img.cm-media');
  await until(() => img?.complete && img.naturalWidth > 0, 5000);
  ok(img && img.naturalWidth === 320, `the picture loads at full size (${img?.naturalWidth})`);
  ok(img && img.getBoundingClientRect().width > 250, `and is drawn big (${Math.round(img?.getBoundingClientRect().width || 0)} px)`);
  const vid = last.querySelector('.cm-hero video.cm-media');
  if (vid) { await until(() => vid.readyState >= 1, 5000); ok(vid.controls && vid.duration > 0, `the video plays in place (${vid.duration})`); }
  const keys = [...last.querySelectorAll('.thing')].map((n) => n.dataset.key);
  ok(!keys.some((k) => heroes.some((f) => f.dataset.key === k)), 'no small card repeats a big one');
  ok(last.querySelectorAll('.thing').length === (m.things.length - 2), `the rest stay small cards (${keys.length})`);

  // full size
  heroes[0].querySelector('.cm-media').click();
  ok(await until(() => document.querySelector('dialog.cap-view[open]'), 4000), 'a click opens the full-size viewer');
  document.querySelector('dialog.cap-view[open]')?.close();
  await wait(200);

  // /media off → small cards again
  await Commands.tryRun('/media off', C.id); await wait(500);
  const last2 = [...v().list.querySelectorAll('.msg.assistant')].at(-1);
  ok(!last2.querySelector('.cm-hero') && last2.querySelectorAll('.thing').length === m.things.length, '/media off: small cards only');
  await Commands.tryRun('/media on', C.id); await wait(300);
  await window.hub.fs.trash([`${ws}${sep}out${sep}poster.png`, `${ws}${sep}clip.mp4`, `${ws}${sep}fresh-render.png`]).catch(() => {});
} catch (err) { fail.push(`threw: ${err.message}`); }
return JSON.stringify({ ok: !fail.length, fail, ...out }, null, 1);
