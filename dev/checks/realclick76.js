// A real mouse click works like a script's .click() (round 76, chatjump76). Two buttons did nothing to a real mouse
// while .click() worked: ⋯ AI setup's drawer covered the ⋯ that closes it (and the composer's ◎), and the game's
// "✎ Note (F8)" lost its click to the pointer lock the page asked for on mousedown. This drives EVERY visible button of
// the main views with real input (CDP mouse press + release at its middle), in the owner's look:
//   the rail (Projects, Life, Chats, the tools' shortcuts), a chat with replies (its header, the composer, message
//   buttons), ⋯ AI setup open, ◎ Missions open, the Lab, the board, the Projects home, Life
// and checks, per button, that the click reached it: the point at its middle is the button (not an overlay, a sheet
// or a tooltip over it), and a "click" event arrived with the button on its path (not lost to a mousedown handler
// that re-drew or moved it, a focus change that hid it, or a pointer lock). The click itself is stopped at the window
// before any handler runs (nothing is opened, sent or deleted); a press that already did its work on mousedown
// (a menu opening on press) counts as working. Covered buttons are reported with what covers them.
//   node dev/smoke.js --fake-engines --check-timeout 900000 --script dev/checks/realclick76.js
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 5000) => { const t = Date.now(); while (Date.now() - t < ms) { const v = await fn(); if (v) return v; await wait(60); } return null; };
const frames = (n = 2) => new Promise((r) => { const f = () => (--n <= 0 ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); });
const cdp = (method, params) => smoke({ cdp: method, params });
const out = { views: {}, fails: [] };
const claude = H.claudeAgent();
const desc = (n) => (n ? `${n.tagName.toLowerCase()}${n.id ? `#${n.id}` : ''}${[...(n.classList || [])].slice(0, 3).map((c) => `.${c}`).join('')}` : 'nothing');
const label = (b) => (b.getAttribute('aria-label') || b.textContent || b.title || '').replace(/\s+/g, ' ').trim().slice(0, 40) || desc(b);

H.config.theme = { ...(H.config.theme || {}), ...AppUI.THEMES.forgeheart, preset: 'forgeheart' };
delete H.config.theme.label; delete H.config.theme.group;
applyTheme(document.getElementById('user-theme').textContent);

// every click is stopped at the window before any handler (the probe's own record of what it reached)
let rec = null;
const swallow = (e) => { if (!rec || !e.isTrusted) return; rec.clicks.push(e.composedPath()); e.stopImmediatePropagation(); e.preventDefault(); };
addEventListener('click', swallow, true); addEventListener('auxclick', swallow, true); addEventListener('dblclick', swallow, true);
// a press that changes the page (a menu opening on mousedown) counts as the button working
const mo = new MutationObserver((rs) => { if (rec) rec.muts += rs.filter((r) => !(r.target.closest?.('.tip, [data-tip-pop], .tooltip'))).length; });
mo.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['hidden', 'open', 'class', 'aria-expanded'] });

const shown = (b) => {
  if (!b.isConnected || b.disabled || b.closest('[hidden], [inert], .opt-sheet.closing') || b.getAttribute('aria-disabled') === 'true') return null;
  // (inside a closed <details> the box still measures: the browser lays it out when asked; checkVisibility says no)
  if (b.checkVisibility && !b.checkVisibility({ visibilityProperty: true })) return null;
  const r = b.getBoundingClientRect();
  if (r.width < 4 || r.height < 4 || r.bottom <= 0 || r.right <= 0 || r.top >= innerHeight || r.left >= innerWidth) return null;
  const cs = getComputedStyle(b);
  if (cs.visibility === 'hidden' || Number(cs.opacity) < 0.05 || cs.pointerEvents === 'none') return null;
  return r;
};
// clipped away by a scrolling parent: brought into view first (the owner would scroll to it)
function reveal(b) {
  const r = b.getBoundingClientRect(); const x = r.left + r.width / 2; const y = r.top + r.height / 2;
  for (let p = b.parentElement; p && p !== document.body; p = p.parentElement) {
    const cs = getComputedStyle(p);
    if (!/(auto|scroll|hidden)/.test(cs.overflow + cs.overflowX + cs.overflowY)) continue;
    const q = p.getBoundingClientRect();
    if (x < q.left || x > q.right || y < q.top || y > q.bottom) { b.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' }); return true; }
  }
  if (x < 0 || y < 0 || x > innerWidth || y > innerHeight) { b.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' }); return true; }
  return false;
}
async function press(x, y) {
  await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none' });
  await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
  await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
}
const away = () => cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 2, y: Math.round(innerHeight / 2), button: 'none' });
// the buttons a view shows: the whole page, or only inside `scope`
const buttonsIn = (scope) => [...(scope || document).querySelectorAll('button, [role="button"], summary')].filter((b) => !b.closest('#menu, .toast, #smoke-probe, iframe, webview, .dev-only'));

async function sweep(view, scope = null, { skip = () => false } = {}) {
  const res = { tried: 0, reached: 0, onPress: 0, covered: [], lost: [], skipped: 0 };
  const seen = new Set();
  const list = buttonsIn(scope);
  for (const b of list) {
    if (seen.has(b)) continue; seen.add(b);
    if (!shown(b) || skip(b)) { res.skipped += 1; continue; }
    if (reveal(b)) await frames(2);
    const r = shown(b); if (!r) { res.skipped += 1; continue; }
    const x = Math.round(r.left + r.width / 2); const y = Math.round(r.top + r.height / 2);
    if (x < 0 || y < 0 || x >= innerWidth || y >= innerHeight) { res.skipped += 1; continue; } // (can't be brought on screen)
    await away(); await frames(1);
    const hit = document.elementFromPoint(x, y);
    // (a shadow host or the button's own children count as the button)
    const onIt = hit && (hit === b || b.contains(hit) || hit.closest?.('label')?.control === b);
    res.tried += 1;
    if (!onIt) { res.covered.push(`${label(b)} [${desc(b)}] under ${desc(hit)}${hit?.parentElement ? ` in ${desc(hit.parentElement)}` : ''}`); continue; }
    rec = { clicks: [], muts: 0 };
    await press(x, y); await frames(2);
    const { clicks, muts } = rec; rec = null;
    if (clicks.some((p) => p.includes(b))) res.reached += 1;
    else if (muts) res.onPress += 1;
    else res.lost.push(`${label(b)} [${desc(b)}]: no click reached it (${clicks.length ? `the click went to ${desc(clicks[0][0])}` : 'no click at all'})`);
    // anything a press opened goes (menus open on press)
    if (typeof hideMenu === 'function') hideMenu();
    if (!b.isConnected) await frames(1);
  }
  out.views[view] = `${res.tried} buttons: ${res.reached} clicked · ${res.onPress} worked on press · ${res.covered.length} covered · ${res.lost.length} lost (${res.skipped} not shown / skipped)`;
  for (const c of res.covered) out.fails.push(`${view}: ${c}`);
  for (const c of res.lost) out.fails.push(`${view}: ${c}`);
  return res;
}
const mid = (n) => { const r = n.getBoundingClientRect(); return [Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2)]; };
// a real click that is NOT swallowed (to open what the next sweep looks at)
async function realClick(n) { const [x, y] = mid(n); await press(x, y); await frames(2); }

try {
  // ---- a chat with replies (header, composer, message buttons) ----
  activate(claude.id); await wait(500);
  const at0 = Date.now() - 60000;
  const chat = { id: `rc76-${Math.random().toString(36).slice(2, 7)}`, agentId: claude.id, title: 'Real clicks', createdAt: at0, updatedAt: at0, messages: Array.from({ length: 6 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', text: i % 2 ? `Reply ${i}: some **words**, a list\n\n- one\n- two\n\n\`\`\`js\nconst a = ${i};\n\`\`\`` : `Question ${i}`, at: at0 + i * 1000 })) };
  await window.hub.saveChat(chat); Native.save(chat);
  Native.open(claude.id, chat.id);
  await until(() => Native.view(claude.id)?.list.querySelector('.msg[data-index="5"]'));
  await wait(600);
  // the rail first (its buttons only: they change the view, so they're swallowed like the rest)
  await sweep('rail', document.getElementById('agent-buttons') || document.getElementById('rail'));
  const v = Native.view(claude.id);
  // the last reply's buttons show on hover: pointed at first
  await sweep('chat', v.root, { skip: (b) => b.closest('.msg') && !b.closest('.msg[data-index="5"], .msg[data-index="4"]') });

  // ---- ⋯ AI setup open: the drawer's own buttons, and the chat's ⋯ / ◎ still reachable ----
  const dots = [...v.root.querySelectorAll('.native-head button')].find((n) => n.textContent.trim() === '⋯' && n.getBoundingClientRect().width);
  if (dots) {
    await realClick(dots);
    const sheet = await until(() => document.querySelector('.opt-sheet'), 6000);
    if (!sheet) out.fails.push('chat: a real click on ⋯ opened no AI setup');
    else {
      await wait(400);
      for (const d of sheet.querySelectorAll('details')) d.open = true; // (its folds open: their buttons too)
      await wait(600);
      await sweep('ai-setup', sheet);
      // the ⋯ that opened it is not under the drawer (it closes it)
      const hit = document.elementFromPoint(...mid(dots));
      if (!(hit === dots || dots.contains(hit))) out.fails.push(`ai-setup: the chat's ⋯ is under ${desc(hit)} while AI setup is open`);
      await realClick(dots); // the same ⋯ closes it
      if (!(await until(() => !document.querySelector('.opt-sheet'), 3000))) { out.fails.push('ai-setup: a real click on ⋯ didn\'t close AI setup'); Options.hide?.(); }
    }
  }
  // ---- ◎ Missions open ----
  const msb = v.root.querySelector('.ms-btn');
  if (msb) {
    await realClick(msb);
    const pop = await until(() => document.querySelector('.ms-pop'), 4000);
    if (!pop) out.fails.push('chat: a real click on ◎ opened no Missions');
    else { for (const d of pop.querySelectorAll('details')) d.open = true; await wait(200); await sweep('missions', pop); document.querySelector('.ms-pop')?.remove(); }
    await cdp('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  }

  // ---- the spaces and tools: opened (as the owner does), then every button in the page ----
  const visit = async (name, open) => { try { await open(); await wait(1200); await sweep(name, document.querySelector('#surfaces .surface.active') || document.querySelector('main')); } catch (err) { out.fails.push(`${name}: ${String(err.message || err).slice(0, 200)}`); } };
  await visit('lab', async () => { activate('tool:three'); await until(() => document.querySelector('#surfaces .surface.active .tool-body'), 8000); await wait(2500); });
  await visit('board', async () => { activate('tool:board'); });
  const space = (id) => document.querySelector(`#agent-buttons .space-button[data-space="${id}"]`);
  if (space('projects')) await visit('projects', () => realClick(space('projects')));
  if (space('life')) await visit('life', () => realClick(space('life')));
} catch (err) { out.fails.push(`check: ${String(err.stack || err.message || err).slice(0, 400)}`); }
removeEventListener('click', swallow, true); removeEventListener('auxclick', swallow, true); removeEventListener('dblclick', swallow, true); mo.disconnect();
const n = Object.values(out.views).reduce((a, s) => a + Number(String(s).split(' ')[0] || 0), 0);
out.summary = `${n} buttons clicked with the real mouse in ${Object.keys(out.views).length} views · ${out.fails.length} did nothing`;
out.ok = !out.fails.length;
return JSON.stringify(out, null, 1);
