// The Three Director works footage frame by frame through the real MCP server (mcp/three-mcp.js → gamebridge → the
// Lab), as Claude and then as Astra: go to a frame, step, read the exact frame with its picture, cut the footage on a
// frame, list the cut, keyframes on frames, the footage help topic (answered by the server, no hub call).
//   node dev/make-lab-footage.js /tmp/labframes-media
//   node dev/smoke.js --fake-engines --check-timeout 400000 --lib dev/checks/journey-lib.js --lib dev/checks/labframes-lib.js --script dev/checks/labframes-mcp.js
const { step } = J;
const { wait, until } = LF;
const claude = H.claudeAgent();
activate(claude.id); await wait(300);
Commands.tryRun('/director-setup', claude.id);
await until(() => [...document.querySelectorAll('dialog[open] button, .modal button')].some((b) => /Add it/.test(b.textContent)) || H.agents().some((a) => a.dock === 'three'), 6000);
[...document.querySelectorAll('dialog[open] button, .modal button')].find((b) => /Add it/.test(b.textContent))?.click();
await until(() => H.agents().some((a) => a.dock === 'three'), 8000);
const dir = H.agents().find((a) => a.dock === 'three');
step('Three Director docked', Boolean(dir));
await LF.setup(`${LF.MEDIA}/frames_silent_24.mp4`);
const ask = async (calls, label) => {
  await Native.send(dir.id, `mcp ${label}\nmcp: ${JSON.stringify(calls)}`);
  await until(() => !Native.isBusy(H.activeChat[dir.id]), 150000);
  const reply = Native.current(dir.id).messages.at(-1);
  return reply.text.split('\n').filter((l) => l.startsWith('- ')).map((l) => l.slice(0, 220));
};
const calls = [
  ['three_media_control', { action: 'frame', frame: 'f30' }],
  ['three_media_control', { action: 'step', n: 5 }],
  ['three_media_control', { action: 'read', see: true }],
  ['three_do', { cmd: 'footage', action: 'split', frame: 48 }],
  ['three_do', { cmd: 'footage', action: 'cuts' }],
  ['three_do', { cmd: 'keyframes', layer: 'selected', property: 'opacity', keys: [{ frame: 24, value: 0 }, { frame: 48, value: 1 }] }],
  ['three_do', { cmd: 'help', topic: 'footage' }],
];
const lines = await ask(calls, 'claude');
const has = (re) => lines.some((l) => re.test(l));
step('Claude: three_media_control frame "f30" → frame 30, exact', has(/three_media_control: .*frame: 30.*exact: true/), lines[1]);
step('Claude: step 5 → frame 35', has(/three_media_control: .*frame: 35/), lines[2]);
step('Claude: read with see → the exact frame + its picture', has(/three_media_control: .*\+ 1 image.*frame: 35/), lines[3]);
step('Claude: three_do footage split at frame 48, then the cut listed', ThreeFrames.parts?.length === 2 && has(/three_do: .*f48/), ThreeFrames.describe());
step('Claude: keyframes on frames 24 and 48 (1 s and 2 s)', /1s=0.*2s=1/.test(JSON.stringify(ThreeLab.director.timeline().layers)), JSON.stringify(ThreeLab.director.timeline().layers).slice(0, 200));
step('Claude: three_do help footage answered by the server', has(/three_do: .*FOOTAGE/), lines.find((l) => /FOOTAGE/.test(l)));
step('the server lists the three tools lean (media_control mentions footage, three_do has footage)', has(/server three-mcp\.js: \d+ tools/), lines[0]);
// Astra (fake Codex) as the director: the same tools
Commands.tryRun('/director-engine astra', dir.id);
await until(() => H.agent(dir.id).engine === 'codex', 8000); await wait(500);
const lines2 = await ask([['three_media_control', { action: 'frame', frame: '00:00:02:12' }], ['three_do', { cmd: 'footage', action: 'info' }]], 'astra');
step('Astra: frame by timecode 00:00:02:12 → frame 60, exact', lines2.some((l) => /three_media_control: .*frame: 60.*exact: true/.test(l)), lines2);
step('Astra: three_do footage info', lines2.some((l) => /three_do: .*fps: 24/.test(l)), lines2.at(-1));
Commands.tryRun('/director-engine claude', dir.id);
await wait(300);
return J.done();
