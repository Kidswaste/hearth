// (round 153c, labwin153) The Lab window's first script (lab-window.html): which lazy groups exist in this window, and
// quiet stand-ins for the chat app's modules the Lab's code may touch (the chats list, the native chat view, the usage
// scanner, the meter). Nothing here runs in Hearth's own window.
window.HearthLabWindow = (() => {
  const scene = window.hub?.labwin?.scene || new URLSearchParams(location.search).get('scene') || null;
  // name → 'soon' (loads right after the window is up) or 'use' (only when the Lab asks for it). Everything else (chats,
  // boards, projects, usage, sync panels, memory, routines, budget…) does not exist in this window.
  const SOON = ['kit', 'nodes', 'labintent', 'cmdbar', 'glrecover', 'keyslines', 'dragdrop'];
  const USE = ['lab', 'codeflow', 'blocks', 'labsay', 'gallery', 'packs', 'labvar', 'framebar', 'scenedoctor', 'critique',
    'multiformat', 'labtemplates', 'kinetictype', 'labvis', 'labshapes', 'presentready', 'labmaterials', 'projlook', 'takes',
    'scenevers', 'speedcheck', 'refmatch', 'matchscore', 'renderpre', 'preflight', 'perform', 'explain', 'campath', 'audiomap',
    'outline', 'dials', 'favs', 'songmap', 'sectionmood', 'lyrics', 'dropmedia', 'labrecipes', 'labkeys', 'labdirection',
    'labfinish', 'labbatch', 'labsearch', 'searchcore', 'renders', 'gamemode', 'gameready', 'gameperf', 'interop', 'remote',
    'phoneview'];
  const groups = Object.fromEntries([...SOON.map((n) => [n, 'soon']), ...USE.map((n) => [n, 'use'])]);
  return { scene, groups, t0: performance.now() };
})();

// what went wrong in this window (dev/checks/labwin153.js reads it; Hearth's own error reporting lives in its window)
window.__lwErrs = [];
addEventListener('error', (e) => { if (window.__lwErrs.length < 60) window.__lwErrs.push(`${e.message} @ ${String(e.filename || '').split('/').pop()}:${e.lineno}`); });
addEventListener('unhandledrejection', (e) => { if (window.__lwErrs.length < 60) window.__lwErrs.push(`rejection: ${e.reason?.message || e.reason}`); });
{ const ce = console.error.bind(console); console.error = (...a) => { if (window.__lwErrs.length < 60) window.__lwErrs.push(`console.error: ${a.map((x) => x?.message || String(x)).join(' ').slice(0, 300)}`); ce(...a); }; }

// a stand-in that answers anything: a property is another stand-in, a call does nothing and returns undefined
const LabWinQuiet = (() => {
  const fn = (own = {}) => new Proxy(Object.assign(() => undefined, own), {
    get: (o, k) => (k in o ? o[k] : k === 'then' || typeof k === 'symbol' ? undefined : (o[k] = fn())),
    apply: () => undefined,
  });
  return { make: fn };
})();
// the usage scanner, the meter, the chats list, the agents' manager: not in this window
var Usage = LabWinQuiet.make({ init() {}, open() {}, key() {}, agentTool() {}, count() {} });
var Meter = LabWinQuiet.make({ init() {} });
var Panel = LabWinQuiet.make({ render() {}, highlight() {}, setFilter() {}, waitingIn: () => [] });
var Manager = LabWinQuiet.make({ open() {} });
// the native chat view: its place in the Lab (the dock) holds the Lab window's slim drawer (lab-window.js), and a
// message the Lab sends to its director goes to that chat in Hearth's window
var Native = LabWinQuiet.make({
  mount: (agentId, host) => (typeof LabWinDrawer !== 'undefined' ? LabWinDrawer.mount(agentId, host) : undefined),
  refresh() {}, focus() {}, newChat() {}, setDraft: (agentId, text) => (typeof LabWinDrawer !== 'undefined' ? LabWinDrawer.draft(text) : undefined),
  send: (agentId, text, o) => (typeof LabWinDrawer !== 'undefined' ? LabWinDrawer.send(agentId, text, o) : Promise.reject(new Error('Hearth is not open'))),
  busy: () => false, current: () => null, chatOf: () => null,
});
