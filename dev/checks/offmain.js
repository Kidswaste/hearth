// Heavy work off the main threads (round 20, offmain): main-thread busy ms (CDP TaskDuration), long tasks (> 50 ms,
// PerformanceObserver) and IPC round trips (a ping every few ms while the flow runs: p50 / p95 / worst) during the
// owner's real flows: opening a 300-message chat (then every message), searching every chat ("?" in Ctrl+K and
// /search), typing in the Ctrl+K palette and on the Commands page, saving a big Lab scenes store, the chats list
// rebuilt, and a sync pass over ~5 MB of chats. Also checks the results stay the same (search hits, Markdown).
// Compare before / after from the same machine (SwiftShader + a shared CPU).
//   node dev/smoke.js --fake-engines --check-timeout 300000 --script dev/checks/offmain.js
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 15000) => { const t = Date.now(); while (Date.now() - t < ms) { try { if (await fn()) return true; } catch { /* not yet */ } await wait(30); } return false; };
const out = { hidden: document.hidden };
const fail = [];
const claude = H.claudeAgent();
activate(claude.id); await wait(300);
await smoke({ cdp: 'Performance.enable', params: {} });
const metrics = async () => { const r = await smoke({ cdp: 'Performance.getMetrics', params: {} }); const o = {}; for (const m of r.metrics || []) o[m.name] = m.value; return o; };
const pct = (a, p) => (a.length ? Math.round(a[Math.min(a.length - 1, Math.floor(a.length * p))] * 10) / 10 : 0);
// one flow: renderer busy ms, long tasks, IPC latency while it runs
async function probe(name, fn) {
  const longs = [];
  const po = new PerformanceObserver((l) => longs.push(...l.getEntries().map((e) => e.duration)));
  try { po.observe({ type: 'longtask', buffered: false }); } catch { /* no long tasks API */ }
  let pinging = true; const rtt = [];
  const pinger = (async () => { while (pinging) { const t = performance.now(); await window.hub.bootStatus(); rtt.push(performance.now() - t); await wait(4); } })();
  await wait(60);
  await window.hub.perfLag?.();
  const m0 = await metrics(); const t0 = performance.now();
  let result;
  try { result = await fn(); } catch (err) { fail.push(`${name}: ${err.message}`); }
  const ms = performance.now() - t0;
  const m1 = await metrics();
  const lag = await window.hub.perfLag?.();
  await wait(60);
  pinging = false; await pinger; po.disconnect();
  rtt.sort((a, b) => a - b); longs.sort((a, b) => b - a);
  out[name] = { ms: Math.round(ms), busyMs: Math.round((m1.TaskDuration - m0.TaskDuration) * 1000), scriptMs: Math.round((m1.ScriptDuration - m0.ScriptDuration) * 1000), longTasks: longs.length, longestMs: Math.round(longs[0] || 0), ipc: { n: rtt.length, p50: pct(rtt, 0.5), p95: pct(rtt, 0.95), worst: pct(rtt, 1) }, mainBlockMs: lag?.maxMs ?? null };
  return result;
}

// ---------- data: 60 chats × 200 messages, one 300-message chat ----------
const WORDS = 'orb shader neon rose tempo kick snare bloom glass chrome ember forge layer slider palette camera drift pulse vapor grid'.split(' ');
const say = (i, k) => Array.from({ length: 50 }, (_, j) => WORDS[(i * 7 + j * 3 + k) % WORDS.length]).join(' ');
const para = (i) => `Reply ${i}: here is **some** text with \`code\` and a [link](https://example.com).\n\n- one\n- two\n\n${i % 10 === 0 ? '```js\nconst x = 1;\nfor (let i = 0; i < 10; i++) console.log(x * i);\n```' : 'Another paragraph of plain words to give it some height.'}${i % 5 === 0 ? `\n\n${Array.from({ length: 30 }, (_, k) => `Long paragraph ${k} with enough words to wrap across the line at least once or twice.`).join('\n\n')}` : ''}`;
const mkChat = (id, n, title, text) => { const at = Date.now() - n * 60000; return { id, agentId: claude.id, title, createdAt: at, updatedAt: at + n * 60000, messages: Array.from({ length: n }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', text: text(i), at: at + i * 60000 })) }; };
for (let c = 0; c < 60; c++) await window.hub.saveChat(mkChat(`om-many-${c}`, 200, `Many ${c}`, (i) => `${say(c, i)}${c === 17 && i === 33 ? ' zebracorn here' : ''}`));
const big = mkChat(`om-big-${Date.now()}`, 300, 'Offmain long chat', (i) => (i % 2 ? para(i) : `Question ${i}: what about this part?`));
await window.hub.saveChat(big);
H.chats = await window.hub.listChats(); Panel.render(); await wait(500);

// ---------- 1. opening a 300-message chat, then every message ----------
const v = () => Native.view(claude.id);
await probe('openLongChat', async () => {
  Native.open(claude.id, big.id);
  await until(() => v().list.querySelectorAll('.msg').length >= 40, 10000);
  await until(() => !v().list.querySelector('.body.md-pending'), 10000);
  await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
});
await wait(400);
await probe('showAllMessages', async () => {
  Native.showEarlier(claude.id);
  await until(() => v().list.querySelectorAll('.msg').length >= 300, 10000);
  await until(() => !v().list.querySelector('.body.md-pending'), 10000);
  await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
});
{ // the Markdown is the same as rendering it right here
  const node = v().list.querySelector('.msg.assistant[data-index="11"] > .body');
  const ref = document.createElement('div'); ref.innerHTML = window.renderMarkdownLive(big.messages[11].text);
  out.markdownSame = Boolean(node) && node.querySelector('p')?.innerHTML === ref.querySelector('p')?.innerHTML && node.querySelectorAll('li').length === ref.querySelectorAll('li').length && node.querySelectorAll('pre').length === ref.querySelectorAll('pre').length;
  if (!out.markdownSame) fail.push('markdown of a long chat differs from a direct render');
}
// switching away and back (rendered replies are cached)
await probe('reopenLongChat', async () => {
  Native.newChat(claude.id); await wait(200);
  Native.open(claude.id, big.id);
  await until(() => v().list.querySelectorAll('.msg').length >= 40, 10000);
  await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
});

// ---------- 2. searching every chat ----------
const hits = await probe('searchChats', async () => {
  let last = null;
  for (const q of ['ne', 'neo', 'neon', 'orb', 'orb r', 'orb rose', 'zebra', 'zebracorn']) last = await window.hub.searchChatText(q);
  return last;
});
out.searchHits = { zebracorn: hits?.length, first: hits?.[0]?.title, count: hits?.[0]?.count, snippet: (hits?.[0]?.snippet || '').slice(0, 40) };
if (hits?.length !== 1 || hits[0].title !== 'Many 17' || !/zebracorn/.test(hits[0].snippet)) fail.push(`search: ${JSON.stringify(out.searchHits)}`);
const neon = await window.hub.searchChatText('orb rose');
out.searchHits.orbRose = neon.length;
// "?" in the Ctrl+K palette, typed
await probe('paletteMessageSearch', async () => {
  AppUI.palette('');
  const input = document.querySelector('.palette-input');
  for (const ch of '?orb rose') { input.value += ch; input.dispatchEvent(new Event('input', { bubbles: true })); await wait(40); }
  await until(() => document.querySelectorAll('.palette-item').length > 0, 5000);
  await wait(200);
});
out.paletteMessageRows = document.querySelectorAll('.palette-item').length;
document.querySelector('.palette')?.remove();

// ---------- 3. typing in the Ctrl+K palette (≈1,000 entries) ----------
AppUI.palette(''); await wait(300);
await probe('paletteTyping', async () => {
  const input = document.querySelector('.palette-input');
  for (const ch of 'shuffle colors') { input.value += ch; input.dispatchEvent(new Event('input', { bubbles: true })); await wait(30); }
  await wait(100);
});
out.paletteRows = document.querySelectorAll('.palette-item').length;
out.paletteFirst = document.querySelector('.palette-item .p-label')?.textContent;
document.querySelector('.palette')?.remove();
// the Commands page search, typed
await until(() => typeof CmdPage !== 'undefined', 15000);
if (typeof CmdPage !== 'undefined') {
  CmdPage.open(); await wait(800);
  const s = document.querySelector('.cp-search');
  if (s) {
    await probe('commandsPageTyping', async () => {
      for (const ch of 'record the screen') { s.value += ch; s.dispatchEvent(new Event('input', { bubbles: true })); await wait(30); }
      await wait(250);
    });
    out.commandsPageFirst = document.querySelector('.cp-row')?.textContent?.slice(0, 40);
  }
  activate(claude.id); await wait(300);
}

// ---------- 4. saving a big Lab scenes store (40 scenes, ~4 MB) ----------
const code = `// scene\n${'const a = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 32), new THREE.MeshStandardMaterial({ color: 0xff6600 }));\n'.repeat(900)}`;
const sketches = Array.from({ length: 40 }, (_, i) => ({ id: `omS${i}`, name: `Scene ${i}`, code, updatedAt: Date.now(), tweaks: { a: i, b: [1, 2, 3] } }));
await probe('saveBigScenes', async () => { await window.hub.kvSet('three-sketches', sketches); sketches[0].name = 'Scene 0 b'; await window.hub.kvSet('three-sketches', sketches); });
const back = await window.hub.kvGet('three-sketches', []);
out.scenesSaved = back.length === 40 && back[0].name === 'Scene 0 b' && back[39].code.length === code.length;
if (!out.scenesSaved) fail.push('big scenes store did not round-trip');

// ---------- 5. the chats list rebuilt (every chat file) ----------
const listed = await probe('listChats', async () => { let l; for (let i = 0; i < 3; i++) l = await window.hub.listChats(); return l; });
out.listed = listed?.length;
if (!(listed?.length >= 61) || !listed.some((c) => c.id === big.id)) fail.push(`chats list: ${listed?.length}`);

// ---------- 6. a sync pass (temp folder as the cloud drive) ----------
const CLOUD = `/tmp/hearth-offmain-cloud-${Date.now()}`;
await window.hub.fs.write(`${CLOUD}/.keep`, '');
await probe('syncFirstPass', async () => {
  const r = await window.hub.sync.on({ root: CLOUD });
  if (!r?.ok) throw new Error(`sync on: ${r?.error}`);
  await until(async () => { const s = await window.hub.sync.status(); return s.lastOk && s.state !== 'syncing'; }, 60000);
});
for (let c = 0; c < 20; c++) await window.hub.saveChat(mkChat(`om-many-${c}`, 201, `Many ${c}`, (i) => `${say(c, i)} again`));
await probe('syncPass', async () => { await window.hub.sync.now({}); });
out.syncState = (await window.hub.sync.status()).state;
out.store = (await window.hub.perfLag?.())?.store;
await window.hub.sync.off();

out.fail = fail;
return JSON.stringify(out, null, 1);
