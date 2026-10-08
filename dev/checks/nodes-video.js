// Smoke check for video flows (nodes-video.js): loads throwaway test videos, builds and runs flows (open, loop,
// export with ffmpeg, version → compare, a "Wait for me" step continued from chat, a gate), then shows the view.
//   sh dev/make-test-videos.sh /tmp/vids && node dev/smoke.js --eval "window.VIDS='/tmp/vids'" --script dev/checks/nodes-video.js --shot /tmp/flow.png
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const agent = H.claudeAgent().id;
const out = {};
activate('tool:ae');
await Review.ensureMounted();
H.config.settings = { ...H.config.settings, videoDirs: [window.VIDS] }; // not saved: this run only
await Review.load(true);
out.videos = Review.videos.length;
out.segButton = Boolean([...document.querySelectorAll('.vr-seg button')].find((b) => b.textContent === 'Flow'));
await Commands.tryRun('/video-flow socials4', agent);
await wait(300);
out.on = VideoNodes.on;
out.presetNodes = VideoNodes.view.getGraph().nodes.length;
// a flow of our own, built from chat
const V = VideoNodes.view;
V.setGraph(NodeView.emptyGraph('video'));
await Commands.tryRun('/video-flow-add library video=neon_tunnel_v2', agent);
await Commands.tryRun('/video-flow-add review', agent);
await Commands.tryRun('/video-flow-add loop mode=range range=[0.5,2]', agent);
await Commands.tryRun('/video-flow-add export preset=square fit=blur', agent);
await Commands.tryRun('/video-flow-add version which=previous', agent);
await Commands.tryRun('/video-flow-add compare mode=side', agent);
await Commands.tryRun('/video-flow-link review1.video compare1.a', agent);
await Commands.tryRun('/video-flow-link version1.video compare1.b', agent);
const g = V.getGraph();
out.built = g.nodes.map((n) => n.id).join(',');
out.links = g.links.map((l) => `${l.from.join('.')}>${l.to.join('.')}`).join(' ');
V.layout();
const r1 = await VideoNodes.run();
out.run1 = { ok: r1.ok, failed: r1.failed, total: r1.total, results: r1.results.map((x) => `${x.id}:${x.state}:${x.text}`) };
out.comparing = Review.state.cmp.path ? Review.state.cmp.path.split('/').pop() : null;
out.loop = Review.state.loop;
out.commands = VideoNodes.commandsText();
// wait-for-me + gate: continue from chat
VideoNodes.usePreset('review-notes');
const p2 = VideoNodes.run();
await wait(1500);
out.waiting = [...document.querySelectorAll('.vf-wait')].length;
out.flowHiddenWhileWaiting = !VideoNodes.on;
await Commands.tryRun('/video-flow-continue', agent);
const r2 = await p2;
out.run2 = r2.results.map((x) => `${x.id}:${x.state}:${x.text}`);
// back to the first flow for the screenshot
VideoNodes.setOn(true);
await wait(200);
V.setGraph(V.getGraph());
await Commands.tryRun('/video-flow render-compare', agent);
await wait(300);
const r3 = await VideoNodes.run();
out.run3 = r3.results.map((x) => `${x.id}:${x.state}:${x.text}`);
await wait(400);
return JSON.stringify(out, null, 1);
