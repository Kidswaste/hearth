// The Three Director builds and edits the Lab sequence through the real MCP server (mcp/three-mcp.js → gamebridge →
// the Lab), as Claude and then as Astra: three_do sequence add scene N at bar 9 (the song /tmp/hearth-test-song.wav
// gives the bars), a title, a transition, trim, a frame with its picture, render a short 1:1, the help topic
// (answered by the server), and the Video Director's hearth_help knows the sequence too.
//   node dev/smoke.js --fake-engines --check-timeout 600000 --script dev/checks/sequence-mcp.js
const { step } = J;
const { wait, until } = SQL;
const ids = await SQL.scenes();
const claude = H.claudeAgent();
activate(claude.id); await wait(300);
Commands.tryRun('/director-setup', claude.id);
await until(() => [...document.querySelectorAll('dialog[open] button, .modal button')].some((b) => /Add it/.test(b.textContent)) || H.agents().some((a) => a.dock === 'three'), 6000);
[...document.querySelectorAll('dialog[open] button, .modal button')].find((b) => /Add it/.test(b.textContent))?.click();
await until(() => H.agents().some((a) => a.dock === 'three'), 8000);
const dir = H.agents().find((a) => a.dock === 'three');
step('Three Director docked', Boolean(dir));
// a sequence with the song, empty
await SQL.lab();
await ThreeSeq.create('Director seq', { empty: true, format: '9:16', show: true });
await ThreeSeq.add({ path: SQL.SONG, song: true });
await until(() => ThreeSeq.status().grid, 20000);
const ask = async (calls, label) => {
  await Native.send(dir.id, `mcp ${label}\nmcp: ${JSON.stringify(calls)}`);
  await until(() => !Native.isBusy(H.activeChat[dir.id]), 400000);
  const reply = Native.current(dir.id).messages.at(-1);
  return reply.text.split('\n').filter((l) => l.startsWith('- ')).map((l) => l.slice(0, 260));
};
const calls = [
  ['three_do', { cmd: 'sequence', op: 'add', scene: 'Seq Red' }],
  ['three_do', { cmd: 'sequence', op: 'add', scene: 'Seq Green', at: 'bar 9' }],
  ['three_do', { cmd: 'sequence', op: 'add', title: 'NIGHT DRIVE', at: 1, secs: 2 }],
  ['three_do', { cmd: 'sequence', op: 'transition', clip: 3, type: 'dip-black' }],
  ['three_do', { cmd: 'sequence', op: 'trim', clip: 1, edge: 'out', to: 'bar 3' }],
  ['three_do', { cmd: 'sequence', op: 'frame', at: 'f45' }],
  ['three_do', { cmd: 'sequence', op: 'status' }],
  ['three_do', { cmd: 'help', topic: 'sequence' }],
];
const lines = await ask(calls, 'claude');
const has = (re) => lines.some((l) => re.test(l));
const e = ThreeSeq.edit;
const tm = ThreeSeqData.timing(e);
const g = ThreeSeq._S.L.player.timeline().grid;
const bar = 60 / g.bpm * (g.beatsPerBar || 4);
const bar9 = (g.downbeat || 0) + 8 * bar;
const green = tm.find((x) => x.clip.sketch === ids.green);
step('Claude: add scene "Seq Red" (first, 4 bars)', e.clips[0]?.sketch === ids.red, ThreeSeq.status().clips);
step('Claude: add "Seq Green" at bar 9 → it starts at bar 9 (a gap keeps the time)', Boolean(green) && Math.abs(green.start - bar9) < 0.06, { start: green?.start, bar9 });
step('Claude: a title on the Titles track', (e.tracks || []).some((k) => k.items.some((x) => x.text === 'NIGHT DRIVE')));
step('Claude: transition dip-black into clip 3', e.clips[2]?.trans?.type === 'dip-black', ThreeSeq.status().clips);
step('Claude: trim clip 1 to end at bar 3', Math.abs(tm[0].end - ((g.downbeat || 0) + 2 * bar)) < 0.06, { end: tm[0].end, want: (g.downbeat || 0) + 2 * bar });
step('Claude: frame f45 comes back with its picture', has(/three_do: .*\+ 1 image/) && has(/frame: 45/), lines.find((l) => /frame: 45/.test(l)));
step('Claude: status lists the clips', has(/three_do: .*scene “Seq Red”/));
step('Claude: help sequence answered by the server (no hub call)', has(/three_do: .*THE LAB SEQUENCE/));
// Astra (fake Codex) as the director: the same tools
Commands.tryRun('/director-engine astra', dir.id);
await until(() => H.agent(dir.id).engine === 'codex', 8000); await wait(500);
const lines2 = await ask([
  ['three_do', { cmd: 'sequence', op: 'add', scene: 'Seq Blue', bars: 1 }],
  ['three_do', { cmd: 'sequence', op: 'length', clip: 1, bars: 1 }],
  ['three_do', { cmd: 'sequence', op: 'render', format: '1:1' }],
], 'astra');
step('Astra: add "Seq Blue" for 1 bar', ThreeSeq.edit.clips.some((c) => c.sketch === ids.blue), lines2[0]);
const rendered = lines2.find((l) => /file: /.test(l)) || '';
const file = (rendered.match(/file: ([^,·]+?\.mp4)/) || [])[1];
const pr = file ? await window.hub.video.probe(file.trim()) : null;
step('Astra: render 1:1 → a 1080×1080 video in Video Review', pr?.w === 1080 && pr?.h === 1080, { rendered, pr });
Commands.tryRun('/director-engine claude', dir.id);
await wait(300);
return J.done();
