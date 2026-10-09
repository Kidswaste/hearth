// The Video Director drives the editor through the real MCP server (mcp/video-mcp.js → gamebridge → the page):
// reads the edit, splits, adds a transition, a title with a keyframe, a look, looks at an exact frame, runs a chat
// command, undoes, lists presets. With the fake engines (dev/fake-claude.js "mcp:" lines make real calls).
//   node dev/make-editor-videos.js /tmp/hearth-editor-videos
//   node dev/smoke.js --fake-engines --check-timeout 300000 --script dev/checks/editor-mcp.js --shot /tmp/editor-mcp.png
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 20000) => { const t = Date.now(); while (Date.now() - t < ms) { try { if (await fn()) return true; } catch { /* not yet */ } await wait(100); } return false; };
const out = {};
const SRC = window.EDITOR_VIDS || '/tmp/hearth-editor-videos';
const VIDS = `${window.SMOKE_SAVES}/renders`;
await window.hub.fs.write(`${VIDS}/.keep`, '');
for (const f of (await window.hub.fs.list(SRC)).filter((x) => !x.isDir)) await window.hub.fs.copy(f.path, `${VIDS}/${f.name}`);
Commands.tryRun('/director-setup video', H.claudeAgent().id);
// it asks first: "Add it"
await until(() => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Add it'), 8000);
[...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Add it')?.click();
await until(() => H.agents().some((a) => a.dock === 'ae'));
const agent = H.agents().find((a) => a.dock === 'ae');
activate('tool:ae');
await Review.ensureMounted();
H.config.settings = { ...H.config.settings, videoDirs: [VIDS] };
await Review.load(true);
await until(() => Review.videos.length >= 4, 10000);
const A = Review.videos.find((v) => /frames_a_30/.test(v.path)).path;
await Review.open(A); await Review.waitReady(); await wait(300);
const calls = [
  ['video_edit_read', {}],
  ['video_edit', { op: 'split', at: 2 }],
  ['video_edit', { op: 'transition', clip: 2, type: 'dissolve', dur: 0.5 }],
  ['video_edit', { op: 'add', kind: 'title', text: 'HELLO', at: 0.5, dur: 2, style: 'gold', anim: 'pop' }],
  ['video_edit', { op: 'keyframe', clip: 'T1.1', prop: 'scale', value: 1.2, at: 1, ease: 'backOut' }],
  ['video_edit', { op: 'look', clip: 1, look: 'cyberpunk' }],
  ['video_edit', { op: 'effect', clip: 1, effect: 'soft-glow', amt: 0.5 }],
  ['video_edit_frame', { frame: 45, width: 360 }],
  ['video_edit', { op: 'command', line: '/edit-list' }],
  ['video_edit', { op: 'marker', at: '00:00:03:00', label: 'drop', note: 'big hit here' }],
  ['video_edit', { op: 'speed', clip: 1, value: 2 }],
  ['video_edit', { op: 'undo' }],
  ['video_edit_read', { what: 'presets', kind: 'transition', search: 'wipe' }],
  ['video_edit', { op: 'nope' }],
];
await Native.send(agent.id, `mcp please\nmcp: ${JSON.stringify(calls)}`);
await until(() => !Native.isBusy(H.activeChat[agent.id]), 120000);
const reply = Native.current(agent.id).messages.at(-1);
out.lines = reply.text.split('\n').filter((l) => l.startsWith('- ')).map((l) => l.slice(0, 170));
const e = VideoCut.edit;
const okLine = (re) => out.lines.some((l) => re.test(l));
out.checks = {
  read: okLine(/video_edit_read: \d+ chars · frames_a_30\.mp4 · 540x960 · 30 fps/),
  split: e.clips.length === 2,
  transition: e.clips[1].trans?.type === 'dissolve',
  title: e.tracks?.find((k) => k.type === 'text')?.items[0]?.text === 'HELLO',
  keyframe: e.tracks?.find((k) => k.type === 'text')?.items[0]?.keys?.scale?.some((k) => k.ease === 'backOut'),
  look: e.clips[0].color?.look === 'cyberpunk',
  effect: e.clips[0].fx?.[0]?.id === 'soft-glow',
  frameImage: okLine(/video_edit_frame: \d+ chars \+ 1 image · frame f45/),
  command: okLine(/video_edit: \d+ chars · \*\*frames_a_30\.mp4\*\*/) || okLine(/V2|T1|title/),
  marker: e.markers.some((m) => m.note === 'big hit here'),
  undoSpeed: (e.clips[0].speed || 1) === 1,
  presets: okLine(/wipe-left/),
  unknownOp: okLine(/ERROR .*Unknown op/),
};
out.ok = Object.values(out.checks).every(Boolean);
return JSON.stringify(out, null, 1);
