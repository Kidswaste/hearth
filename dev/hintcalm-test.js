#!/usr/bin/env node
// (round 38, hintcalm) Unit tests for hints.js, the one-at-a-time hint queue, with a tiny stand-in page (no Electron):
// the start quiet, one on screen at a time (its own and another card), the gap between tips, what fits where you are
// first then rank, busy states (typing, dragging, a reply streaming, a dialog, Hearth in the background), Don't show
// tips (tips and lines silenced, notices and chips not), remembered once shown / forgotten, an offer that waited too long
// dropped and not remembered, the same id replacing a waiting one, lines in a chat not blocked by a card, essential
// notes at once whatever the queue does, and dodge() moving a note off the chat box and the Lab preview's centre.
//   node dev/hintcalm-test.js
'use strict';
const fs = require('fs');
const path = require('path');

let pass = 0; let fail = 0;
const ok = (cond, what) => { if (cond) pass += 1; else { fail += 1; console.log(`FAIL ${what}`); } };

// ---------- the stand-in page ----------
let now = 1.7e12;
const realNow = Date.now;
Date.now = () => now;
const later = (ms) => { now += ms; };
const handlers = {};
const g = globalThis;
g.window = g;
g.addEventListener = (type, fn) => { (handlers[type] ||= []).push(fn); };
g.dispatchEvent = () => true;
g.CustomEvent = class { constructor(type, o) { this.type = type; this.detail = o?.detail; } };
g.requestAnimationFrame = (fn) => fn();
g.setTimeout = () => 0; // the queue is pumped by hand here
g.clearTimeout = () => {};
const mem = new Map();
g.store = { get: (k, d) => (mem.has(k) ? JSON.parse(mem.get(k)) : d), set: (k, v) => mem.set(k, JSON.stringify(v)) };
g.toast = () => null;
class Element {
  constructor(rect = { left: 900, top: 600, right: 1200, bottom: 680 }) { this.isConnected = true; this.hidden = false; this.style = { translate: '' }; this.r = rect; this.classList = { contains: () => false }; }
  remove() { this.isConnected = false; }
  getBoundingClientRect() { const r = this.r; return { ...r, width: r.right - r.left, height: r.bottom - r.top }; }
  checkVisibility() { return this.isConnected; }
  querySelector() { return null; }
  closest() { return null; }
}
g.Element = Element;
const dom = { open: false, foreign: null, composers: [] };
g.document = {
  hidden: false, readyState: 'complete',
  addEventListener() {},
  querySelector(sel) {
    if (dom.open && sel.includes('dialog[open]')) return {};
    if (dom.foreign && sel.includes('.qs-card')) return dom.foreign;
    return null;
  },
  querySelectorAll(sel) { return sel === '.composer' ? dom.composers : []; },
};
let streaming = false;
g.H = { activeId: 'claude', agent: (id) => ({ claude: { id: 'claude', mode: 'native' }, 'tool:three': null }[id] || null), agents: () => [{ id: 'claude', mode: 'native' }] };
g.Native = { isAgentBusy: () => streaming };
const key = (tagName = 'TEXTAREA') => handlers.keydown.forEach((fn) => fn({ target: { tagName, isContentEditable: false } }));
const pointer = (type) => handlers[type].forEach((fn) => fn({}));

const src = fs.readFileSync(path.join(__dirname, '..', 'hints.js'), 'utf8');
const Hints = new Function(`${src}; return Hints;`)(); // eslint-disable-line no-new-func
const T0 = now;
const tick = async () => { Hints.pump(); for (let i = 0; i < 5; i++) await Promise.resolve(); };
// a hint whose show() puts a node "on screen"
const made = [];
const hint = (id, o = {}) => { const rec = { id, node: null, p: null }; rec.p = Hints.offer({ id, ...o, show: () => { if (o.nothing) return null; rec.node = new Element(o.rect); made.push(rec); return rec.node; } }); return rec; };
const reset = () => { for (const q of Hints.queue) q.resolve(false); Hints.queue.length = 0; for (const m of made) m.node?.remove(); made.length = 0; mem.clear(); Hints.config(null); dom.open = false; dom.foreign = null; streaming = false; g.document.hidden = false; g.H.activeId = 'claude'; pointer('pointerup'); later(60 * 60e3); };

(async () => {
  // ---------- the start quiet, then one at a time, then the gap ----------
  {
    now = T0 + 1000;
    const a = hint('a');
    await tick();
    ok(!a.node, 'a tip waits during the first seconds after Hearth opens');
    now = T0 + 6500;
    await tick();
    ok(a.node && (await a.p) === true, 'then it shows (and offer() says so)');
    ok(Hints.seen('a'), 'and it is remembered on this computer');
    const b = hint('b');
    await tick();
    ok(!b.node, 'one at a time: the next tip waits while the first is on screen');
    a.node.remove();
    later(10e3); await tick();
    ok(!b.node, 'the gap: no new tip a few seconds after the last one');
    later(3 * 60e3); await tick();
    ok(Boolean(b.node), '… and it shows once the gap has passed');
    ok((await hint('a').p) === false, 'a tip already shown is not offered again');
    Hints.forget('a');
    const a2 = hint('a');
    b.node.remove(); later(4 * 60e3); await tick();
    ok(Boolean(a2.node), 'forget(id): it can show again');
  }
  // ---------- another card on screen counts (the ✦ card opened by hand, a tour) ----------
  {
    reset();
    dom.foreign = new Element();
    const c = hint('c');
    await tick();
    ok(!c.node, 'another card on screen (opened by hand) holds the queue');
    dom.foreign = null; await tick();
    ok(Boolean(c.node), 'it goes when that card goes');
  }
  // ---------- where you are first, then rank ----------
  {
    reset();
    const lab = hint('lab-only', { place: 'lab', rank: 1 });
    const anyLow = hint('any-late', { rank: 80 });
    const chat = hint('chat-one', { place: 'chat', rank: 60 });
    await tick();
    ok(!lab.node && chat.node && !anyLow.node, 'in a chat: the chat hint first (before a lower-ranked "any"), the Lab one waits');
    chat.node.remove(); g.H.activeId = 'tool:three'; later(4 * 60e3); await tick();
    ok(lab.node && !anyLow.node, 'in the Lab: the Lab hint first (it fits here), even though "any" waited longer');
    lab.node.remove(); later(4 * 60e3); await tick();
    ok(Boolean(anyLow.node), 'then the "any" one');
    reset();
    const r2 = hint('r2', { rank: 20 }); const r1 = hint('r1', { rank: 10 }); const r3 = hint('r3', { rank: 30 });
    await tick();
    ok(r1.node && !r2.node && !r3.node, 'same place: the lower rank first');
  }
  // ---------- busy: typing, dragging, a reply streaming, a dialog, in the background ----------
  {
    reset();
    key();
    const t = hint('t');
    await tick();
    ok(!t.node && Hints.busy() === 'typing', 'never while you type');
    later(2000); await tick();
    ok(!t.node, '… also 2 s after the last key');
    later(2500); await tick();
    ok(Boolean(t.node), '… shows 4 s after the last key');
    reset();
    key('BUTTON'); // keys that aren't typing (a shortcut on a button) don't count
    ok(Hints.busy() === '', 'a key outside a text box is not typing');
    pointer('pointerdown'); later(400);
    const d = hint('d');
    await tick();
    ok(!d.node && Hints.busy() === 'dragging', 'never while you drag (a pointer held down)');
    pointer('pointerup'); await tick();
    ok(Boolean(d.node), '… shows once you let go');
    reset();
    streaming = true;
    const s = hint('s');
    await tick();
    ok(!s.node && Hints.busy() === 'streaming', 'never while a reply streams');
    streaming = false; await tick();
    ok(Boolean(s.node), '… shows when the reply ends');
    reset();
    dom.open = true;
    const o = hint('o');
    await tick();
    ok(!o.node && Hints.busy() === 'dialog', 'never over a dialog');
    dom.open = false; g.document.hidden = true; await tick();
    ok(!o.node && Hints.busy() === 'away', 'never while Hearth is in the background');
    g.document.hidden = false; await tick();
    ok(Boolean(o.node), '… shows when you are back and nothing is open');
    reset();
    key();
    const f = hint('f');
    Hints.flush(); for (let i = 0; i < 5; i++) await Promise.resolve();
    ok(Boolean(f.node), 'flush() shows the next one now (tests, "show me now")');
  }
  // ---------- kinds: notices first and not rate-limited, chips, lines ----------
  {
    reset();
    now += 1; const x = hint('x'); await tick(); x.node.remove();
    const n = hint('update:1', { kind: 'notice', rank: 0 });
    await tick();
    ok(Boolean(n.node), 'a notice (the update note) is not held by the gap');
    const tip = hint('tip-after', { rank: 5 });
    await tick();
    ok(!tip.node, 'the tip after it waits while the notice is on screen');
    n.node.remove(); later(60e3); await tick();
    ok(!tip.node, '… and a few minutes after it (one at a time, then the gap)');
    later(3 * 60e3); await tick();
    ok(Boolean(tip.node), '… then shows');
    reset();
    const card = hint('card'); await tick();
    const line = hint('line', { kind: 'inline' });
    await tick();
    ok(card.node && line.node, 'a line in a chat covers nothing: it shows next to a card');
    reset();
    streaming = true;
    const line2 = hint('line2', { kind: 'inline' });
    await tick();
    ok(!line2.node, 'a line still waits while a reply streams');
    streaming = false; await tick();
    ok(Boolean(line2.node), '… and comes after it');
    reset();
    dom.open = true;
    const line3 = hint('line3', { kind: 'inline' }); const tip3 = hint('tip3');
    await tick();
    ok(line3.node && !tip3.node, 'a line shows while a dialog is open (it is in the chat, not over the dialog); a tip waits');
    reset();
    const c1 = hint('chip', { kind: 'chip' }); await tick();
    ok(Boolean(c1.node) && !Hints.seen('chip'), 'a chip shows and is not remembered (it comes back after each change)');
    c1.node.remove();
    const tip2 = hint('tip2'); await tick();
    ok(Boolean(tip2.node), 'a chip does not start the gap');
    reset();
    const t1 = hint('t1'); await tick(); t1.node.remove();
    const c2 = hint('chip', { kind: 'chip' }); await tick();
    ok(Boolean(c2.node), 'a chip is not held by the gap');
  }
  // ---------- Don't show tips ----------
  {
    reset();
    const w = hint('waiting', { place: 'lab' });
    Hints.setOff(true);
    ok(Hints.off(), 'off');
    ok((await w.p) === false, 'turning tips off drops the waiting tips');
    const t = hint('t-off'); const l = hint('l-off', { kind: 'inline' });
    const n = hint('n-on', { kind: 'notice' }); const c = hint('c-on', { kind: 'chip' });
    await tick();
    ok((await t.p) === false && (await l.p) === false && !t.node && !l.node, 'tips and lines are silenced');
    ok(n.node && !c.node, 'notices still show (one at a time)');
    n.node.remove(); await tick();
    ok(Boolean(c.node), '… and chips');
    Hints.setOff(false);
    ok(!Hints.off(), 'back on');
    reset();
    const cur = hint('cur'); await tick();
    Hints.setOff(true);
    ok(!cur.node.isConnected, 'turning tips off closes the tip on screen');
  }
  // ---------- waited too long, still(), the same id, nothing to show ----------
  {
    reset();
    streaming = true;
    const old = hint('old', { ttl: 30e3 });
    later(31e3); await tick();
    ok((await old.p) === false && !Hints.seen('old'), 'an offer that waited too long is dropped and not remembered (it can come again)');
    streaming = false;
    let fits = true;
    const st = hint('st', { still: () => fits });
    fits = false; streaming = true; await tick();
    ok((await st.p) === false, 'still() false: dropped (the scene changed, the chat closed…)');
    streaming = false;
    reset();
    streaming = true;
    const v1 = hint('same'); const v2 = hint('same');
    ok((await v1.p) === false && Hints.queue.length === 1, 'the same id offered again replaces the waiting one');
    streaming = false; await tick();
    ok(Boolean(v2.node), '… and the newest shows');
    reset();
    const none = hint('none', { nothing: true }); await tick();
    ok((await none.p) === false && !Hints.seen('none'), 'show() that puts nothing on screen: not remembered, no gap');
    const next = hint('next'); await tick();
    ok(Boolean(next.node), '… the next tip is not held by it');
    ok((await Hints.offer({ id: '' , show: () => new Element() })) === false, 'an offer without an id is refused');
  }
  // ---------- essential notes: at once, whatever the queue does ----------
  {
    reset();
    const cur = hint('cur'); await tick();
    Hints.setOff(true); key(); streaming = true; dom.open = true;
    const e = new Element();
    const shown = Hints.essential(() => e);
    ok(shown === e && e.isConnected, 'an essential note shows at once (tips off, typing, a reply streaming, a dialog, a tip on screen)');
    ok(Hints.state().waiting.length === 0, '… without going through the queue');
    Hints.setOff(false);
    ok(cur, 'ok');
  }
  // ---------- dodge: off the chat box and the Lab preview's centre ----------
  {
    reset();
    dom.composers = [new Element({ left: 600, top: 700, right: 1400, bottom: 800 })];
    const n = new Element({ left: 1000, top: 720, right: 1300, bottom: 780 });
    const dy = Hints.dodge(n);
    ok(dy > 0 && n.style.translate === `0 ${-Math.round(dy)}px` && 780 - dy <= 700, `a note over the chat box moves up above it (${n.style.translate})`);
    const far = new Element({ left: 100, top: 100, right: 300, bottom: 160 });
    ok(Hints.dodge(far) === 0 && far.style.translate === '', 'a note elsewhere stays');
    dom.composers = [];
    g.ThreeLab = { stageHooks: { host: new Element({ left: 0, top: 0, right: 1000, bottom: 1000 }) } };
    const mid = new Element({ left: 400, top: 450, right: 600, bottom: 520 });
    Hints.dodge(mid);
    const r = mid.getBoundingClientRect();
    const ty = Number((mid.style.translate.split(' ')[1] || '0px').replace('px', ''));
    ok(r.bottom + ty <= 300, `a note over the preview's centre moves out of it (${mid.style.translate})`);
    const corner = new Element({ left: 20, top: 20, right: 220, bottom: 60 });
    ok(Hints.dodge(corner) === 0, 'a note in the preview\'s corner stays');
    delete g.ThreeLab;
  }
  // ---------- light: an offer and a pump ----------
  {
    reset();
    const t0 = process.hrtime.bigint();
    for (let i = 0; i < 200; i++) hint(`p${i}`, { place: i % 2 ? 'lab' : 'chat', rank: i % 7 });
    for (let i = 0; i < 50; i++) Hints.pump();
    const ms = Number(process.hrtime.bigint() - t0) / 1e6;
    ok(ms < 50, `200 offers and 50 pumps in ${ms.toFixed(1)} ms`);
  }
  Date.now = realNow;
  console.log(`${pass}/${pass + fail} passed`);
  process.exit(fail ? 1 : 0);
})().catch((err) => { console.error(err); process.exit(1); });
