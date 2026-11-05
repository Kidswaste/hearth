// (round 116, projchats116) Every chat belongs to exactly one project. One focused check:
//   · the migration: a chat in zero, one or several projects (kept in one, the others' links recorded; nothing deleted;
//     undo puts them back; a second run changes nothing)
//   · two computers migrating at once make the SAME “Earlier chats” (one project once sync merges, never two)
//   · a projects store that can't be read: the migration is skipped (nothing written), and it runs once it can be read
//   · a new chat lands in the open project (or the one picked), a director's in its scene's project
//   · Move to project: the real Projects.add / “Move to project…” menu: out of the old project, into the new one
//   · and no chat is left without a project
//   · (round 125, askwhen125) the “Which project?” window opens only for the owner's own New chat with no project known
// The window's files (projects.js, projchats.js) run in a small fake window (vm): no Electron, no user data.
//   node dev/projchats116-test.js
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.join(__dirname, '..');
const C = require(path.join(ROOT, 'projects-core.js'));
const K = require(path.join(ROOT, 'projchats-core.js'));
const { merge3 } = require(path.join(ROOT, 'sync-merge.js'));
let n = 0; let failed = 0;
const tests = [];
const ok = (name, fn) => tests.push([name, fn]);
const clone = (x) => JSON.parse(JSON.stringify(x));
const AT = Date.UTC(2026, 10, 4);

function store3() {
  const a = C.create({ id: 'pjA', name: 'Stoop Ronin', at: 10 });
  const b = C.create({ id: 'pjB', name: 'Neon', at: 20 });
  const c = C.create({ id: 'pjC', name: 'Album', at: 30 });
  C.addItem(a, { type: 'chat', ref: 'c-one', at: 100 });
  C.addItem(a, { type: 'chat', ref: 'c-many', at: 300 }); // joined A later
  C.addItem(b, { type: 'chat', ref: 'c-many', at: 200 }); // B first
  C.addItem(c, { type: 'chat', ref: 'c-many', at: 400 });
  C.addItem(c, { type: 'chat', ref: 'c-own', at: 500 });
  C.addItem(b, { type: 'chat', ref: 'c-own', at: 50 });
  c.workspace = { chatId: 'c-own' }; // C's own chat: it stays in C even though B had it first
  C.addItem(a, { type: 'scene', ref: 's1' });
  return C.normalize({ v: 1, list: [a, b, c], dismissed: [] });
}
const chats = [{ id: 'c-one', title: 'one' }, { id: 'c-many', title: 'many' }, { id: 'c-own', title: 'own' }, { id: 'c-none', title: 'none', createdAt: 77 }, { id: 'c-none2', title: 'none 2', createdAt: 88 }];

ok('migration: none → Earlier chats, one stays, several → one (its own project first, else the first it joined); records kept', () => {
  const d = store3();
  const r = K.sweep(d, chats, { at: AT });
  assert.ok(r.changed);
  const pr = K.problems(d, chats);
  assert.deepStrictEqual(pr, { none: [], several: [] }, 'no chat without a project, none in several');
  const of = (id) => d.list.filter((p) => C.has(p, 'chat', id)).map((p) => p.id);
  assert.deepStrictEqual(of('c-one'), ['pjA']);
  assert.deepStrictEqual(of('c-many'), ['pjB'], 'the first project it joined');
  assert.deepStrictEqual(of('c-own'), ['pjC'], 'the project whose own chat it is');
  assert.deepStrictEqual(of('c-none'), [K.EARLIER_ID]);
  const e = d.list.find(K.isEarlier);
  assert.strictEqual(e.name, 'Earlier chats');
  assert.strictEqual(e.items.find((x) => x.ref === 'c-none').was, 'no-project');
  // the old links: recorded on the projects they left (reversible), the scene untouched, no project deleted
  const A = d.list.find((p) => p.id === 'pjA');
  assert.deepStrictEqual(A.chatsMovedOut.map((x) => [x.id, x.to, x.item.at]), [['c-many', 'pjB', 300]]);
  assert.ok(C.has(A, 'scene', 's1'));
  assert.strictEqual(d.list.length, 4);
  // a second run: nothing to do
  assert.strictEqual(K.sweep(d, chats, { at: AT + 1 }).changed, false);
  // it survives the store's own cleaning (sync / reload) and undo puts every old link back
  const again = C.normalize(clone(d));
  assert.deepStrictEqual(again.list.find((p) => p.id === 'pjA').chatsMovedOut.length, 1);
  K.undo(again);
  assert.ok(C.has(again.list.find((p) => p.id === 'pjA'), 'chat', 'c-many') && C.has(again.list.find((p) => p.id === 'pjC'), 'chat', 'c-many'));
});

ok('Earlier chats ranks last: a chat that is also in a real project leaves Earlier chats', () => {
  const d = store3();
  K.sweep(d, chats, { at: AT });
  C.addItem(d.list.find((p) => p.id === 'pjA'), { type: 'chat', ref: 'c-none', at: 1 }); // (a restored project, an arrival)
  K.sweep(d, chats, { at: AT });
  assert.deepStrictEqual(d.list.filter((p) => C.has(p, 'chat', 'c-none')).map((p) => p.id), ['pjA']);
});

ok('two computers at once: the same “Earlier chats” (fixed id, name, look, times); sync merges it into one', () => {
  const base = store3();
  const win = clone(base); const mac = clone(base);
  K.sweep(win, chats.filter((c) => c.id !== 'c-none2'), { at: AT });
  K.sweep(mac, chats.filter((c) => c.id !== 'c-none'), { at: AT + 5000 });
  const ew = win.list.find(K.isEarlier); const em = mac.list.find(K.isEarlier);
  const head = (p) => { const { items: _i, ...rest } = p; return rest; };
  assert.deepStrictEqual(head(ew), head(em), 'same project on both');
  const m = merge3(base, win, mac);
  const merged = C.normalize(m.value);
  const earlier = merged.list.filter(K.isEarlier);
  assert.strictEqual(earlier.length, 1, 'one Earlier chats, not two');
  assert.deepStrictEqual(earlier[0].items.map((x) => x.ref).sort(), ['c-none', 'c-none2']);
  assert.deepStrictEqual(K.problems(merged, chats), { none: [], several: [] });
});

ok('Move: core move takes it out of every other project (recorded), into the new one', () => {
  const d = store3(); K.sweep(d, chats, { at: AT });
  assert.ok(K.move(d, 'c-one', 'pjC', { at: AT }));
  assert.deepStrictEqual(d.list.filter((p) => C.has(p, 'chat', 'c-one')).map((p) => p.id), ['pjC']);
  assert.strictEqual(d.list.find((p) => p.id === 'pjA').chatsMovedOut.at(-1).to, 'pjC');
  assert.strictEqual(K.targetFor({ scope: null }), K.EARLIER_ID, 'never none');
  assert.strictEqual(K.targetFor({ pending: 'pjB', scope: 'pjA' }), 'pjB');
  assert.strictEqual(K.targetFor({ scope: 'pjA', sceneProject: 'pjC', director: true }), 'pjC', 'a director chat: its scene\'s project');
});

// ---------- the window's side, in a fake window ----------
function fakeWindow({ stored, status = 'ok', chatList = chats }) {
  const writes = [];
  const timers = [];
  const asked = []; const toasts = []; // (round 125, askwhen125) the “Which project?” windows opened, the notes shown
  const kv = { projects: clone(stored) };
  const local = new Map();
  const hooks = { scope: [], row: [], render: [], itemMenu: [] }; // (round 121, listtidy121) panel.js's hooks now: no top / skip / view / menu
  let st = status;
  const H = {
    chats: chatList.map((c) => ({ agentId: 'claude', updatedAt: 1, ...c })), activeChat: {}, activeId: 'claude',
    agent: (id) => ({ claude: { id: 'claude', name: 'Claude', mode: 'native' }, director: { id: 'director', name: 'Three Director', mode: 'native', dock: 'three' } })[id] || null,
    agents: () => [H.agent('claude'), H.agent('director')], claudeAgent: () => H.agent('claude'), surfaceIdFor: () => '',
  };
  const ctx = {
    console, JSON, Math, Date, Promise, Map, Set, Array, Object, String, Number, Boolean, Error, structuredClone,
    setTimeout: (fn, ms) => { const t = setTimeout(fn, Math.min(ms || 0, 5)); t.unref(); timers.push(t); return t; },
    clearTimeout, setInterval: () => 0,
    addEventListener: () => {}, dispatchEvent: () => {}, CustomEvent: class { constructor(t, o) { this.type = t; this.detail = o?.detail; } },
    document: { querySelector: () => null, addEventListener: () => {}, body: { append: () => {} } },
    navigator: { userActivation: { isActive: true } }, // (round 125, askwhen125) a click a moment ago: no longer a reason to ask
    store: { get: (k, f) => (local.has(k) ? clone(local.get(k)) : f), set: (k, v) => local.set(k, v) },
    toast: (t) => toasts.push(String(t)), showMenu: () => {}, Modal: {}, activate: () => {}, Tools: {}, H,
    Panel: { hooks, render: () => {}, soon: () => {}, view: () => null, setView: () => {} },
    el: (tag, o) => ({ tag, o, append: () => {}, addEventListener: () => {}, close: () => {}, style: { setProperty: () => {} }, showModal() { asked.push(o?.attrs?.['aria-label']); } }),
    Native: { hooks: { newChat: [] }, newChat: (id, opts = {}) => { for (const fn of ctx.Native.hooks.newChat) fn(id, opts); } },
    ChatScenes: { linkOf: () => null },
  };
  ctx.window = ctx;
  ctx.hub = ctx.window.hub = {
    kvGet: async (name, fallback, o) => {
      if (o?.status) return st === 'unreadable' ? { state: 'unreadable' } : kv[name] == null ? { state: 'missing' } : { state: 'ok', value: clone(kv[name]) };
      if (st === 'unreadable') return fallback; // (the plain read gives the fallback: the window's copy is empty)
      return kv[name] == null ? fallback : clone(kv[name]);
    },
    kvSet: async (name, value) => { writes.push(name); kv[name] = clone(value); return {}; },
  };
  vm.createContext(ctx);
  for (const f of ['makes-core.js', 'projects-core.js', 'projects.js', 'projchats-core.js', 'projchats.js']) vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
  return { ctx, H, kv, writes, hooks, local, asked, toasts, setStatus: (s) => { st = s; } };
}
const inP = (P, id) => clone(P.all().filter((p) => C.has(p, 'chat', id)).map((p) => p.id));
const tick = (ms = 30) => new Promise((r) => setTimeout(r, ms));

ok('a store that can\'t be read: the migration is skipped (nothing written, not marked done, every chat still listed); also when only the window\'s own read failed', async () => {
  const w = fakeWindow({ stored: store3(), status: 'unreadable' });
  await tick();
  const PC = w.ctx.ProjChats;
  assert.strictEqual(PC._ok(), false);
  assert.deepStrictEqual(w.writes, [], 'nothing written over the store');
  assert.strictEqual(w.hooks.scope[0](w.H.chats[0]), true, 'the list fails open: chats still show');
  assert.ok(w.local.get('projchats.migrated') == null, 'not marked done: it tries again');
  // also when the store reads fine but this window's own read had failed (its copy empty): skipped
  w.setStatus('ok');
  assert.strictEqual(await PC.readOk(), false, 'disk has projects, the window none: wait');
});

ok('readable: it runs once; the list shows the open project; New chat lands there; Move to project…; never without a project', async () => {
  const w = fakeWindow({ stored: store3() });
  const { ctx, H } = w; const P = ctx.Projects; const PC = ctx.ProjChats;
  await tick();
  assert.strictEqual(PC._ok(), true);
  assert.ok(w.local.get('projchats.migrated'), 'marked done');
  assert.ok(w.writes.includes('projects'), 'saved through the projects store');
  assert.deepStrictEqual(K.problems(w.kv.projects, H.chats), { none: [], several: [] }, 'what was written: one project per chat');
  assert.ok(!w.ctx.Projects.panelTop && !w.ctx.Projects.panelSkip && !('top' in w.hooks) && !('skip' in w.hooks), 'no general groups (other projects, makes) in the list'); // (round 121, listtidy121) gone at their source
  // the list: the open project's chats only
  PC.setScope('pjA');
  assert.strictEqual(w.hooks.scope[0]({ id: 'c-one' }), true);
  assert.strictEqual(w.hooks.scope[0]({ id: 'c-many' }), false);
  assert.strictEqual(w.hooks.scope[0](null), false, 'website groups are not project chats');
  // New chat (any way it's asked for) → the open project
  ctx.Native.newChat('claude');
  H.chats = [{ id: 'c-new', agentId: 'claude', title: 'fresh', updatedAt: 2 }, ...H.chats];
  H.activeChat.claude = 'c-new';
  w.hooks.render.forEach((f) => f());
  await tick(1300);
  assert.deepStrictEqual(inP(P, 'c-new'), ['pjA']);
  // Move to project… (the chat's right-click menu): out of A, into C; no “take out” for a chat
  const m = P.projectMenu('chat', 'c-new', 'fresh');
  assert.strictEqual(m.label, 'Move to project…');
  const row = m.items().find((x) => x.label && x.label.includes('Album'));
  row.action();
  assert.deepStrictEqual(inP(P, 'c-new'), ['pjC']);
  const inA = m.items().find((x) => x.label && x.label.includes('Album'));
  assert.strictEqual(inA.checked, true);
  inA.action(); // clicking the project it's in does nothing (never left without one)
  assert.deepStrictEqual(inP(P, 'c-new'), ['pjC']);
  assert.ok(!P.itemMenu(P.get('pjC'), { type: 'chat', ref: 'c-new', name: 'fresh', id: 'chat:c-new' }).some((x) => /Take out/.test(x.label || '')), 'no “Take out” for a chat');
  // Projects.add of a chat anywhere (Add › A chat, /project add) is a move too
  P.add(P.get('pjB'), 'chat', 'c-new', 'fresh');
  assert.deepStrictEqual(inP(P, 'c-new'), ['pjB']);
  // no project open and the question cancelled: the new chat still gets one (Earlier chats)
  PC.setScope(null);
  H.chats = [{ id: 'c-lost', agentId: 'claude', title: 'x', updatedAt: 3 }, ...H.chats];
  H.activeChat.claude = 'c-lost';
  w.hooks.render.forEach((f) => f());
  await tick(1300);
  assert.deepStrictEqual(inP(P, 'c-lost'), [K.EARLIER_ID]);
  await P.flush();
  assert.deepStrictEqual(K.problems(w.kv.projects, H.chats), { none: [], several: [] }, 'no chat without a project');
});

ok('a director\'s new chat goes to the project of the scene on screen', async () => {
  const w = fakeWindow({ stored: store3() });
  const { ctx, H } = w; const P = ctx.Projects; const PC = ctx.ProjChats;
  await tick();
  PC.setScope('pjB');
  // the Lab shows pjA's scene: Projects.currentScene() is what the Lab says (stubbed: no Lab here)
  ctx.Lazy = { loaded: () => true }; ctx.ThreeLab = { scenes: { currentId: () => 's1' } };
  ctx.Native.newChat('director');
  H.chats = [{ id: 'd-new', agentId: 'director', title: 'lab', updatedAt: 4 }, ...H.chats];
  H.activeChat.director = 'd-new';
  w.hooks.render.forEach((f) => f());
  await tick(1300);
  assert.deepStrictEqual(inP(P, 'd-new'), ['pjA']);
});

// ---------- (round 125, askwhen125) the “Which project?” window: only for the owner's own New chat ----------
const made = async (w, id, agentId = 'claude') => { // the chat appears in the list (its first save) and is placed
  w.H.chats = [{ id, agentId, title: id, updatedAt: 9 }, ...w.H.chats];
  w.H.activeChat[agentId] = id;
  w.hooks.render.forEach((f) => f());
  await tick(1300);
};
ok('askwhen125: the owner\'s New chat with no project open asks which project', async () => {
  const w = fakeWindow({ stored: store3() });
  await tick();
  w.ctx.ProjChats.setScope(null);
  w.ctx.Native.newChat('claude', { byOwner: true });
  assert.deepStrictEqual(w.asked, ['Which project is this chat for?']);
});
ok('askwhen125: a chat code starts just after a click does not ask: Earlier chats, with a note', async () => {
  const w = fakeWindow({ stored: store3() });
  await tick();
  w.ctx.ProjChats.setScope(null);
  assert.strictEqual(w.ctx.navigator.userActivation.isActive, true, 'a click a moment ago');
  w.ctx.Native.newChat('claude');
  assert.deepStrictEqual(w.asked, [], 'no window');
  await made(w, 'c-code');
  assert.deepStrictEqual(inP(w.ctx.Projects, 'c-code'), [K.EARLIER_ID]);
  assert.ok(w.toasts.some((t) => /no project was open/.test(t)), 'the note says where it went');
});
ok('askwhen125: a chat the Lab starts (Ask Claude about this layer) goes to the scene\'s project, no question', async () => {
  const w = fakeWindow({ stored: store3() });
  await tick();
  w.ctx.ProjChats.setScope(null);
  w.ctx.Lazy = { loaded: () => true }; w.ctx.ThreeLab = { scenes: { currentId: () => 's1' } }; // pjA's scene on screen
  w.ctx.Native.newChat('claude');
  assert.deepStrictEqual(w.asked, []);
  await made(w, 'c-lab');
  assert.deepStrictEqual(inP(w.ctx.Projects, 'c-lab'), ['pjA']);
});
ok('askwhen125: the owner\'s New chat with a project open goes there, no question', async () => {
  const w = fakeWindow({ stored: store3() });
  await tick();
  w.ctx.ProjChats.setScope('pjB');
  w.ctx.Native.newChat('claude', { byOwner: true });
  assert.deepStrictEqual(w.asked, []);
  await made(w, 'c-mine');
  assert.deepStrictEqual(inP(w.ctx.Projects, 'c-mine'), ['pjB']);
});

(async () => {
  for (const [name, fn] of tests) {
    n += 1;
    try { await fn(); console.log(`ok ${n} ${name}`); } catch (err) { failed += 1; console.log(`FAIL ${n} ${name}\n  ${err.stack.split('\n').slice(0, 4).join('\n  ')}`); }
  }
  console.log(failed ? `${failed} of ${n} failed` : `all ${n} passed`);
  process.exit(failed ? 1 : 0);
})();
