// "Let Astra decide" (decide.js) with the fake engines: the app look, a Lab effect, look and frame size, each
// picked by (fake) Astra, applied, and undone; the prompt stays small and its tokens are logged.
//   node dev/smoke.js --fake-engines --check-timeout 240000 --script dev/checks/decide.js --shot /tmp/decide.png
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const C = H.claudeAgent();
const out = {};
const run = (line) => Commands.tryRun(line, C.id);
activate(C.id); await wait(400);

// the app look
const t0 = H.config.theme?.preset;
await run('/decide theme'); await wait(1200);
out.theme = { before: t0, after: H.config.theme?.preset, last: Decide.last()?.by };
await run('/decide undo'); await wait(1200);
out.theme.undone = H.config.theme?.preset;

// the Lab: an effect, a look, the frame size
activate('tool:three'); await wait(3500);
const c = await ThreeLab.cmd(); await wait(1500);
const n0 = c.layers().length;
const r1 = await Decide.run('effect');
await wait(1500);
out.effect = { pick: r1.pick, by: r1.by, layers: [n0, c.layers().length] };
await Decide.undo(); await wait(1200);
out.effect.undone = c.layers().length;
const pal0 = JSON.stringify(c.palette());
const r2 = await Decide.run('look', { goal: 'dreamy' }); await wait(2500);
out.look = { pick: r2.pick, by: r2.by, paletteChanged: JSON.stringify(c.palette()) !== pal0, layers: c.layers().map((x) => x.name) };
await Decide.undo(); await wait(1500);
out.look.undone = { palette: JSON.stringify(c.palette()) === pal0, layers: c.layers().length };
const f0 = c.state.frame.id;
const r3 = await Decide.run('size'); await wait(1200);
out.size = { pick: r3.pick, before: f0, after: c.state.frame.id };
await Decide.undo(); await wait(800);
out.size.undone = c.state.frame.id;
out.log = store.get('decide.log', []).slice(0, 4).map((e) => `${e.kind}:${e.pick}:${e.by}:${e.input}+${e.output}:${e.promptChars}ch`);
out.ok = out.theme.after !== t0 && out.theme.undone === t0 && out.effect.layers[1] === n0 + 1 && out.effect.undone === n0
  && out.size.after !== f0 && out.size.undone === f0 && out.look.undone.palette && /Astra/.test(r1.by);
return JSON.stringify(out, null, 1);
