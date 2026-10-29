// (round 67 fix) Astra × Claude over Codex's app-server transport (what real Astra uses): the server sends codexTurn at
// turn/started, which every Astra seat took for the end of her turn ("No answer" in ≈ 0.6 s). Run through
// dev/collab-appserver-smoke.js, which fills in the fake engines (dev/fake-codex-server.js, dev/fake-claude-astra.js).
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 30000) => { const t = Date.now(); while (Date.now() - t < ms) { const v = await fn(); if (v) return v; await sleep(150); } return null; };
H.config.settings = { ...(H.config.settings || {}), enginePaths: { codex: '__FAKE_CODEX_SERVER__', claude: '__FAKE_CLAUDE__' } };
const A = H.agents().find((a) => a.engine === 'codex' && !a.dock);
const C = H.agents().find((a) => a.engine === 'claude' && !a.dock);
delete A.codexTransport; // the app-server, as a real Astra
await saveConfig();
await sleep(600);
activate(C.id);
await sleep(200);
await Commands.tryRun('/relay astra→claude 1 test this', C.id);
const m = await until(() => { const x = [...(Native.chatOf(C.id)?.messages || [])].reverse().find((y) => y.role === 'collab' && y.mode === 'relay'); return x?.status && x.status !== 'running' && x; });
const astra = m?.parts.find((p) => m.seats[p.seat].engine === 'codex');
const claude = m?.parts.find((p) => m.seats[p.seat].engine === 'claude');
const out = { status: m?.status, astra: astra && { status: astra.status, ms: astra.ms, error: astra.error, text: astra.text.slice(0, 60) }, claudeRan: Boolean(claude), claude: claude && claude.status };
out.ok = m?.status === 'done' && astra?.status === 'done' && Boolean(astra.text) && claude?.status === 'done';
return JSON.stringify(out);
