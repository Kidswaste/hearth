// Shared helpers for the end-to-end journeys (dev/checks/journey-*.js). Put in front of a journey with --lib:
//   node dev/smoke.js --fake-engines --check-timeout 400000 --lib dev/checks/journey-lib.js --script dev/checks/journey-lab.js
// Input goes through the harness's `smoke()` bridge as real CDP mouse / keyboard events (trusted events, real focus,
// real hit-testing), so a covered or zero-size button fails the step instead of being clicked through code.
// Env in the page: J.shotDir (default /tmp) for J.shot(name) pictures.
const J = (() => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const until = async (fn, ms = 15000) => { const t = Date.now(); while (Date.now() - t < ms) { try { if (await fn()) return true; } catch { /* not yet */ } await wait(100); } return false; };
  const out = { steps: [], problems: [], errors: [] };
  const origErr = console.error;
  console.error = (...a) => { out.errors.push(a.map(String).join(' ').slice(0, 240)); origErr(...a); };
  addEventListener('error', (e) => out.errors.push(`uncaught ${e.message}`));
  addEventListener('unhandledrejection', (e) => out.errors.push(`rejection ${e.reason?.message || e.reason}`));
  const step = (name, ok, info) => { console.log(`[J] ${ok ? '✓' : '✖'} ${name}`); out.steps.push(`${ok ? '✓' : '✖'} ${name}${info === undefined ? '' : ` · ${typeof info === 'string' ? info : JSON.stringify(info)}`}`); if (!ok) out.problems.push(name); return ok; };
  const q = (sel, root = document) => (typeof sel === 'string' ? root.querySelector(sel) : sel);
  const visible = (n) => { if (!n) return false; const r = n.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(n).visibility !== 'hidden'; };
  // The element at the middle of `node`: what a real click there would hit (null if something else covers it).
  const hitOk = (n) => { const r = n.getBoundingClientRect(); const t = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return t && (t === n || n.contains(t)); };
  async function mouse(type, x, y, extra = {}) { return smoke({ cdp: 'Input.dispatchMouseEvent', params: { type, x, y, button: 'left', clickCount: 1, ...extra } }); }
  async function click(sel, { right = false, double = false, at } = {}) {
    const n = q(sel);
    if (!visible(n)) throw new Error(`click: not visible: ${typeof sel === 'string' ? sel : n?.className || n}`);
    n.scrollIntoView?.({ block: 'nearest', inline: 'nearest', behavior: 'instant' });
    // smooth-scrolling panes: wait until the element stops moving
    let r = n.getBoundingClientRect();
    for (let i = 0; i < 20; i++) { await wait(50); const r2 = n.getBoundingClientRect(); if (r2.top === r.top && r2.left === r.left) break; r = r2; }
    const x = at ? r.left + at[0] * r.width : r.left + r.width / 2; const y = at ? r.top + at[1] * r.height : r.top + r.height / 2;
    // a real click hits whatever is on top: note it when that isn't the element (a toast, a tooltip, a sticky bar)
    const top = document.elementFromPoint(x, y);
    if (top && top !== n && !n.contains(top)) out.misses = [...(out.misses || []), `${(n.textContent || n.className || n.tagName).toString().trim().slice(0, 24)} → covered by ${top.tagName.toLowerCase()}.${String(top.className).slice(0, 40)} "${(top.textContent || '').trim().slice(0, 30)}"`];
    const button = right ? 'right' : 'left';
    await mouse('mouseMoved', x, y, { button: 'none' });
    for (let c = 1; c <= (double ? 2 : 1); c++) { await mouse('mousePressed', x, y, { button, clickCount: c }); await mouse('mouseReleased', x, y, { button, clickCount: c }); }
    await wait(120);
    return n;
  }
  async function drag(sel, from, to, steps = 8) {
    const n = q(sel); const r = n.getBoundingClientRect();
    const p = (f) => [r.left + f[0] * r.width, r.top + f[1] * r.height];
    const [x0, y0] = p(from); const [x1, y1] = p(to);
    await mouse('mouseMoved', x0, y0, { button: 'none' }); await mouse('mousePressed', x0, y0);
    for (let i = 1; i <= steps; i++) await mouse('mouseMoved', x0 + ((x1 - x0) * i) / steps, y0 + ((y1 - y0) * i) / steps, { buttons: 1 });
    await mouse('mouseReleased', x1, y1); await wait(120);
  }
  const KEYS = { Home: [36, 'Home'], End: [35, 'End'], PageUp: [33, 'PageUp'], PageDown: [34, 'PageDown'], F1: [112, 'F1'], F2: [113, 'F2'], Enter: [13, 'Enter', '\r'], Escape: [27, 'Escape'], Tab: [9, 'Tab'], Backspace: [8, 'Backspace'], ArrowDown: [40, 'ArrowDown'], ArrowUp: [38, 'ArrowUp'], ArrowLeft: [37, 'ArrowLeft'], ArrowRight: [39, 'ArrowRight'], ' ': [32, 'Space', ' '], Delete: [46, 'Delete'] };
  // key('Enter'), key('k', { ctrl: true }), key('9', { shift: true }) (a shifted digit sends the digit key with Shift).
  async function key(k, { ctrl = false, shift = false, alt = false, meta = false } = {}) {
    const mods = (alt ? 1 : 0) | (ctrl ? 2 : 0) | (meta ? 4 : 0) | (shift ? 8 : 0);
    let [code, codeName, text] = KEYS[k] || [];
    if (!code) {
      const up = k.length === 1 ? k.toUpperCase() : k;
      code = up.charCodeAt(0);
      codeName = /[0-9]/.test(k) ? `Digit${k}` : /[a-z]/i.test(k) ? `Key${up}` : k;
      text = ctrl || alt || meta ? undefined : shift ? up : k;
    }
    const keyName = k.length === 1 && shift && /[a-z]/.test(k) ? k.toUpperCase() : k === ' ' ? ' ' : k;
    await smoke({ cdp: 'Input.dispatchKeyEvent', params: { type: text ? 'keyDown' : 'rawKeyDown', key: keyName, code: codeName, windowsVirtualKeyCode: code, nativeVirtualKeyCode: code, modifiers: mods, text, unmodifiedText: text } });
    await smoke({ cdp: 'Input.dispatchKeyEvent', params: { type: 'keyUp', key: keyName, code: codeName, windowsVirtualKeyCode: code, nativeVirtualKeyCode: code, modifiers: mods } });
    await wait(60);
  }
  // Files the app saved through a (skipped) save dialog in this run.
  const saved = async () => ((await window.hub.fs.list?.(window.SMOKE_SAVES).catch(() => null)) || []).map((f) => f.name || f);
  async function type(text) { await smoke({ cdp: 'Input.insertText', params: { text } }); await wait(80); }
  let shots = 0;
  async function shot(name) { const f = `${J.shotDir || '/tmp'}/${String(++shots).padStart(2, '0')}-${name}.png`; await smoke({ shot: f }); return f; }
  // The last note / reply text in an agent's chat view.
  const lastNote = (agentId) => [...(Native.view(agentId)?.list?.querySelectorAll('.msg.note .body, .msg.assistant .body') || [])].at(-1)?.textContent.trim().slice(0, 160) || '';
  // Types a /command in the composer of `agentId`'s view the way a person does (click, type, Enter) and returns the note.
  async function command(agentId, text, ms = 600) {
    if (!visible(Native.view(agentId)?.input)) { activate(agentId); await wait(400); }
    await click(Native.view(agentId).input); await type(text); await wait(150); await key('Enter'); await wait(ms);
    return lastNote(agentId);
  }
  function done() { console.error = origErr; return JSON.stringify({ ok: !out.problems.length && !out.errors.length, ...out }, null, 1); }
  return { wait, until, out, step, q, visible, hitOk, click, drag, key, type, shot, lastNote, command, mouse, saved, done };
})();
