// ⏳ Usage left (round 48): the fake Claude Code reports its plan's usage with a reply (rate_limit_event: the 5-hour
// session at 58 %, the week at 83 %) → the Usage window shows one card per AI with a slim bar per window (left, used,
// the reset countdown, "as of just now"), the forecast line, today's tokens with a sparkline; the 80 % note comes once
// through Hints; How to save from now on lists Cost coach's fixes (one click, Undo); a refused message ("5-hour limit
// reached ∙ resets 6pm", a 429-like refusal) puts the session at 100 % with its reset; Claude Code's local /usage
// (no model turn) is read when the window opens; /usage-left in words. Astra's card uses a stubbed account read (the
// fake codex has no app-server).
//   node dev/smoke.js --fake-engines --check-timeout 240000 --script dev/checks/usagelimits.js --shot /tmp/usagelimits.png
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 15000) => { const t = Date.now(); while (Date.now() - t < ms) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(100); } return null; };
const problems = []; const ok = (c, what) => { if (!c) problems.push(what); return Boolean(c); };
const out = {};
const toasts = () => [...document.querySelectorAll('#toasts > *')].map((t) => t.textContent).join(' | ');
const sw = (o) => window.hub.kvSet('fake-switches', o);
store.set('hints.test', { gap: 0, start: 0, startNotice: 0 }); Hints.config({ gap: 0, start: 0, startNotice: 0, quiet: 0, idle: 0 });

ok(Lazy.state().some((g) => g.name === 'usagelimits'), 'its own lazy group');
await Lazy.load('budget'); await Lazy.load('undoall'); await Lazy.load('costcoach'); await Lazy.load('usagelimits');
await until(() => typeof UsageLimits !== 'undefined' && typeof CostCoach !== 'undefined');
ok(Commands.get('usage-left') && !Commands.duplicates().some((d) => d.name === 'usage-left' || d.name === 'limits'), '/usage-left exists once');

const A = H.claudeAgent();
const astra = H.agents().find((a) => a.mode === 'native' && a.engine === 'codex');
activate(A.id); await wait(300);
const me = H.agent(A.id); me.effort = 'high'; me.lighterAt = 0; delete me.verbosity; await saveConfig(); await wait(300);
UndoAll._test?.rebase?.();
// Astra's account (the fake codex has no app-server): what codex-usage.js normalize() gives
const now0 = Date.now();
const astraFake = () => ({ available: true, checkedAt: Date.now(), buckets: [{ id: 'codex', name: 'Codex', windows: [{ key: 'primary', used: 12, remaining: 88, minutes: 300, resetsAt: now0 + 3.4 * 36e5 }, { key: 'secondary', used: 37, remaining: 63, minutes: 10080, resetsAt: now0 + 5 * 864e5 }] }] });

// ---------- fake week for the tips (Cost coach's scan) ----------
function chat(id, { n, base, grow, out: o, think = 0, text, at0 }) {
  const messages = [];
  for (let k = 0; k < n; k++) {
    const at = at0 + k * 8 * 60e3;
    messages.push({ role: 'user', text, at: at - 2000 });
    const i = base + grow * k;
    messages.push({ role: 'assistant', text: 'Done.', at, usage: { input: i, output: o, cached: k ? Math.round((i - grow) * 0.9) : 0, cacheWrite: k ? grow : i }, ...(think ? { thinking: 'x'.repeat(think * 4) } : {}) });
  }
  return { id, agentId: A.id, title: id, created: at0, updated: at0 + n * 8 * 60e3, messages };
}
for (const c of [
  chat('ul-long-scene', { n: 22, base: 3000, grow: 3000, out: 900, text: 'make the orb pinker and slower', at0: now0 - 2 * 864e5 }),
  chat('ul-quick-asks', { n: 30, base: 1500, grow: 300, out: 4000, think: 2500, text: 'what bpm suits this?', at0: now0 - 864e5 }),
  chat('ul-long-answers', { n: 20, base: 1500, grow: 500, out: 9000, think: 500, text: 'explain how bloom works in three.js and when to use it', at0: now0 - 3 * 864e5 }),
]) await window.hub.saveChat(c);

// ---------- 1. a reply carries the plan's usage (rate_limit_event) ----------
const s = Math.floor(Date.now() / 1000);
await sw({ claudeRateEvent: { status: 'allowed_warning', rateLimitType: 'seven_day', utilization: 0.83, resetsAt: s + 3 * 86400 + 600, unifiedWindows: { five_hour: { utilization: 0.58, resetsAt: s + 7800 + 30 }, seven_day: { utilization: 0.83, resetsAt: s + 3 * 86400 + 600 } } } });
Native.newChat(A.id); await wait(200);
await Native.send(A.id, 'hello there');
const got = await until(() => UsageLimits.state?.engines?.claude?.windows?.seven_day, 30000);
await until(() => !Native.isBusy(H.activeChat[A.id]), 30000);
out.claude = UsageLimits.state?.engines?.claude?.windows;
ok(got && Math.round(got.used) === 83 && got.source === 'event', `the week from the reply's rate_limit_event (${JSON.stringify(got)})`);
ok(Math.round(out.claude?.five_hour?.used) === 58, 'the session from unifiedWindows');
// the 80 % note, once
const note = await until(() => /Claude has 17% of its weekly limit left/.test(toasts()) && toasts(), 12000);
ok(note, `the 80 % heads-up through Hints (${toasts()})`);
await wait(300);
const again = await UsageLimits.check();
ok(again.length === 0, 'the note comes once per window');
const disk = await until(async () => { const r = await window.hub.kvGet('usage-limits', null); return Object.keys(r?.noted || {}).length ? r : null; }, 8000);
out.disk = disk || await window.hub.kvGet('usage-limits', null);
ok(disk?.engines?.claude?.windows?.seven_day && Object.keys(disk.noted || {}).some((k) => /seven_day.*:80$/.test(k)), 'kv usage-limits on disk (the number and the note)');

// ---------- 2. the Usage window ----------
if (astra) await UsageLimits.note('codex', UsageLimitsCore.fromCodex(astraFake())); // what readAstra notes from a real account read
await Meter.dashboard();
const cards = await until(() => { const c = document.querySelectorAll('dialog.meter-dlg[open] .ul-card'); return c.length >= (astra ? 2 : 1) && document.querySelector('.ul-codex .ul-win') ? c : null; }, 20000);
ok(cards, 'one card per AI in the Usage window');
const cc = document.querySelector('.ul-card.ul-claude');
out.claudeCard = cc?.innerText;
ok(cc && /Session/.test(cc.innerText) && /42%\s*left/.test(cc.innerText) && /resets in 2 h 1[01] min/.test(cc.innerText), 'Claude: the session bar with 42 % left and its countdown');
ok(cc && /This week/.test(cc.innerText) && /17%\s*left/.test(cc.innerText) && /83% used/.test(cc.innerText), 'Claude: the week bar, 17 % left');
ok(cc && /as of just now/.test(cc.innerText), 'how fresh: "as of just now"');
ok(cc?.querySelector('.ul-ahead')?.textContent.length > 20, `a heads-up line (${cc?.querySelector('.ul-ahead')?.textContent})`);
ok(cc?.querySelector('.ul-win.lv-near') && cc.querySelector('.ul-bar[role="meter"][aria-label*="17% left"]'), 'the week is "near" (warm color) and its bar is named for screen readers');
ok(cc?.querySelector('.ul-spark polyline') && /Today ≈/.test(cc.innerText), 'today / 7 days tokens with a sparkline');
const ac = document.querySelector('.ul-card.ul-codex');
out.astraCard = ac?.innerText;
if (astra) ok(ac && /88%\s*left/.test(ac.innerText) && /63%\s*left/.test(ac.innerText), 'Astra: its account windows');
const tips = await until(() => { const t = document.querySelectorAll('.ul-tips .ul-tip'); return t.length ? t : null; }, 40000);
out.tips = [...(tips || [])].map((t) => t.innerText.replace(/\s+/g, ' '));
ok(tips && tips.length >= 2 && tips.length <= 3, `How to save from now on: up to 3 fixes (${JSON.stringify(out.tips)})`);
ok(out.tips.every((t) => /saved? ≈ \d/.test(t) && /estimated/.test(t)), 'each with its saving, marked as an estimate');
ok(!out.tips.some((t) => /\d{3,}% of/.test(t)), 'no share of the limit from a tiny local count');
await smoke({ shot: '/tmp/usagelimits-card.png' });
// one click, then Undo
const tip = [...tips].find((t) => /Let Smart decide/.test(t.innerText)) || tips[0];
const go = tip.querySelector('.ul-go'); const label = go.textContent;
go.click();
const undo = await until(() => tip.querySelector('.ul-undo'), 8000);
ok(undo && /✓ Done/.test(go.textContent), `a tip applies in one click (${label})`);
out.after = { effort: H.agent(A.id).effort, lighterAt: H.agent(A.id).lighterAt };
undo?.click();
await until(() => !tip.querySelector('.ul-undo') && go.textContent === label, 8000);
await wait(400);
ok(H.agent(A.id).effort === 'high' && !H.agent(A.id).lighterAt, `Undo puts it back (${JSON.stringify({ effort: H.agent(A.id).effort, lighterAt: H.agent(A.id).lighterAt })})`);
document.querySelector('dialog.meter-dlg[open]')?.close(); await wait(200);

// ---------- 3. a refused message (the session limit) ----------
await sw({ claudeLimit: 'once', limitForm: 'session' });
await Native.send(A.id, 'one more please');
const refused = await until(() => { const w = UsageLimits.state?.engines?.claude?.windows?.five_hour; return w?.source === 'error' ? w : null; }, 30000);
ok(refused && refused.used === 100 && new Date(refused.resetsAt).getHours() === 18, `the refusal: the session at 100 %, resets 6 pm (${JSON.stringify(refused)})`);
await sw({});
await wait(500);
Offline?._test?.clear?.();

// ---------- 4. Claude Code's local /usage (no model turn) ----------
await sw({ claudeVersion: '2.1.301', claudeUsageText: 'Current session: 9% used · resets 11pm\nCurrent week (all models): 84% used · resets Oct 31, 9am' });
const r = await UsageLimits.readClaude({ fresh: true });
ok(r?.ok && /Current session/.test(r.text), `the local /usage read (${JSON.stringify(r)})`);
const wk = UsageLimits.state?.engines?.claude?.windows?.seven_day;
ok(wk?.source === 'usage' && wk.used === 84, `the week from /usage (${JSON.stringify(wk)})`);
await sw({ claudeVersion: '2.1.200' });
const old = await UsageLimits.readClaude({ fresh: true });
ok(old && !old.ok && old.why === 'old', `an older Claude Code is never asked (${JSON.stringify(old)})`);
await sw({});

// ---------- 5. in words ----------
const words = await Commands.tryRun('/usage-left', A.id);
out.words = String(UsageLimits.words());
ok(/Claude \(as of/.test(out.words) && /This week: 16% left/.test(out.words), `/usage-left in words (${out.words})`);
await Meter.dashboard();
await until(() => document.querySelector('.ul-card.ul-claude .ul-win'), 10000);
await wait(600);
await smoke({ shot: '/tmp/usagelimits-card2.png' });
// the Light look: the cards follow the theme (readable text on its background)
const wasTheme = H.config.theme;
H.config.theme = { ...(H.config.theme || {}), ...AppUI.THEMES.light, preset: 'light' }; delete H.config.theme.label; delete H.config.theme.group;
applyTheme(document.getElementById('user-theme').textContent); await wait(500);
const lum = (c) => { const m = String(c).match(/[\d.]+/g) || [0, 0, 0]; return (0.2126 * m[0] + 0.7152 * m[1] + 0.0722 * m[2]) / 255; };
const who = document.querySelector('.ul-card.ul-claude .ul-who');
out.light = who ? { text: getComputedStyle(who).color, bg: getComputedStyle(document.body).backgroundColor } : null;
ok(out.light && lum(out.light.text) < 0.4 && lum(out.light.bg) > 0.7, `light look: dark text on a light background (${JSON.stringify(out.light)})`);
await smoke({ shot: '/tmp/usagelimits-light.png' });
H.config.theme = wasTheme; applyTheme(document.getElementById('user-theme').textContent); await wait(200);
store.set('hints.test', null); Hints.config(null);
return JSON.stringify({ pass: problems.length === 0, problems, out, cmd: Boolean(words) }, null, 1);
