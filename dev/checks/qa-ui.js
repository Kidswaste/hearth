// QA: how the round-1 UIs render together under a theme (Lab sliders, timeline, FX picker, meter strip,
// add-on dialogs, Video Review). Set the theme and the view first, then screenshot:
//   node dev/smoke.js --eval "window.QA_THEME='forge-light'; window.QA_VIEW='lab'" --script dev/checks/qa-ui.js --shot x.png
// QA_VIEW: lab (sliders + timeline) | fx (the FX picker over the Lab) | video | nodes | kit | usage
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const theme = window.QA_THEME || 'forgeheart';
const view = window.QA_VIEW || 'lab';
const out = { theme, view };
await Commands.tryRun(`/theme ${theme}`, H.claudeAgent().id);
await wait(800);
out.preset = H.config.theme?.preset;
if (['lab', 'fx', 'nodes'].includes(view)) {
  activate('tool:three'); await wait(3500);
  try { const c = await ThreeLab.cmd({ show: true }); out.lab = Boolean(c); } catch (e) { out.labErr = e.message; }
  await wait(1500);
  await Commands.tryRun('/sliders on', H.claudeAgent().id);
  await wait(600);
  if (view === 'fx') { ThreeFX.openPicker('add'); await wait(1200); }
  if (view === 'nodes') { await Commands.tryRun('/nodes', H.claudeAgent().id); await wait(1500); }
}
if (view === 'video') { activate('tool:ae'); await wait(3000); }
if (view === 'kit') { await Commands.tryRun('/kit', H.claudeAgent().id); await wait(1000); }
if (view === 'usage') { await Commands.tryRun('/usage', H.claudeAgent().id); await wait(1500); }
// inputs that came out unreadable: text color equal to background, or zero-size controls that should show
const bad = [];
for (const n of [...document.querySelectorAll('input, select, button, textarea')].filter((x) => x.offsetParent).slice(0, 800)) {
  const cs = getComputedStyle(n);
  if (n.type !== 'range' && n.type !== 'checkbox' && n.type !== 'color' && cs.color === cs.backgroundColor && cs.backgroundColor !== 'rgba(0, 0, 0, 0)') bad.push(`${n.tagName}.${n.className} same fg/bg ${cs.color}`);
  if ((n.type === 'range' || n.type === 'checkbox') && (n.offsetWidth < 6 || n.offsetHeight < 6)) bad.push(`${n.type}.${n.className} ${n.offsetWidth}x${n.offsetHeight}`);
}
out.bad = [...new Set(bad)].slice(0, 30);
return JSON.stringify(out, null, 1);
