// Power-wise (round 39, powerwise): Hearth keeps the computer awake only while it matters, does next to nothing in the
// background, goes lighter on battery and wakes up calmly. One file in two parts:
//   · the core (pure, no Electron, no window: required by powerwisemain.js and dev/powerwise-test.js, PowerCore in the
//     window): the reasons to stay awake, counted per reason and always released (owner gone, a time limit, "let it
//     sleep"); the battery policy; the background timer schedule (slower on battery and in the background, nothing
//     while asleep, a settle time and one timer at a time after a wake, a late timer read as a sleep);
//     Mac Low Power Mode / Windows battery saver read from the system's own words.
//   · the window (Power, only when loaded in the page): holds for renders / exports / All formats / recordings
//     (Renders' queue and capture's 'hearth:recording') and Present (the Lab preview full screen), the tiny ☕ in the
//     rail's status corner while one is held ("Keeping your computer awake: rendering"), the lighter look on battery
//     (calm motion, through look.js), one calm note through Hints the first time, and Power.every for the window's
//     background timers (updater, hooks, sleeping websites, the Lab's checks).
// Long AI turns, big downloads and updates are held by the main process (powerwisemain.js), where they run.
// Nothing here costs a token: no prompt, no engine flag, no message changes.
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PowerCore = api;
}(typeof self !== 'undefined' ? self : this, () => {
  const MIN = 60000; const HOUR = 60 * MIN;
  // why the computer stays awake: the words in the status corner, whether the screen must stay on too, and a time limit
  // after which a hold that was never released goes by itself (a crashed page, a reply whose end never came)
  const REASONS = {
    render: { label: 'rendering', ttl: 12 * HOUR },
    export: { label: 'exporting', ttl: 12 * HOUR },
    formats: { label: 'rendering all formats', ttl: 12 * HOUR },
    record: { label: 'recording', display: true, ttl: 6 * HOUR },
    present: { label: 'presenting', display: true, ttl: 8 * HOUR },
    agent: { label: 'an AI is working', ttl: 3 * HOUR },
    download: { label: 'downloading', ttl: 4 * HOUR },
    update: { label: 'updating Hearth', ttl: 30 * MIN },
  };
  const ORDER = Object.keys(REASONS);
  const AGENT_AFTER_MS = 45000; // an AI turn longer than this keeps the computer awake (short ones never touch it)
  const BIG_DOWNLOAD = 50 * 1024 * 1024; // a download this big holds at once; one of unknown size after DOWNLOAD_AFTER_MS
  const DOWNLOAD_AFTER_MS = 20000;
  // after a wake: the network and the cloud drive need a moment; timers then run one at a time
  const WAKE = { settle: 20000, stagger: 4000, sync: 15000, updater: 60000 };
  const LATE_MS = 60000; // a timer this much later than asked: the computer slept without telling us

  // ---------- staying awake: holds counted per reason, one system blocker ----------
  function describe(held) {
    const list = (held || []).filter((h) => !h.allowed);
    if (!list.length) return '';
    const words = [...new Set(list.map((h) => h.label))];
    const joined = words.length === 1 ? words[0] : `${words.slice(0, -1).join(', ')} and ${words.at(-1)}`;
    return `${list.some((h) => h.display) ? 'Keeping your screen on' : 'Keeping your computer awake'}: ${joined}`;
  }
  // start(type) → id / stop(id): Electron's powerSaveBlocker (or a stub in tests). Types: 'prevent-app-suspension'
  // (the computer stays awake, the screen may sleep) · 'prevent-display-sleep' (Present, recordings)
  function createBlocker({ start, stop, now = Date.now, setTimer = setTimeout, clearTimer = clearTimeout, onChange } = {}) {
    const holds = new Map(); // token → { token, reason, label, display, owner, since, until, allowed }
    let seq = 0; let cur = null; let expT = null; let quiet = 0;
    const live = () => [...holds.values()].filter((h) => !h.allowed);
    function view() {
      const by = new Map();
      for (const h of holds.values()) {
        const k = `${h.reason}|${h.allowed ? 1 : 0}`;
        const g = by.get(k) || { reason: h.reason, label: h.label, display: h.display, allowed: h.allowed, n: 0, since: h.since };
        g.n += 1; g.since = Math.min(g.since, h.since); g.display = g.display || h.display;
        by.set(k, g);
      }
      const held = [...by.values()].sort((a, b) => (ORDER.indexOf(a.reason) + 1 || 99) - (ORDER.indexOf(b.reason) + 1 || 99));
      return { type: cur?.type || null, held, text: describe(held), n: live().length };
    }
    function apply() {
      const L = live();
      const want = !L.length ? null : L.some((h) => h.display) ? 'prevent-display-sleep' : 'prevent-app-suspension';
      if (want !== (cur?.type || null)) {
        const was = cur; cur = null;
        // the new kind starts before the old one stops: never a gap where the computer could sleep mid-render
        if (want) { try { const id = start(want); cur = id == null ? null : { id, type: want }; } catch { cur = null; } }
        if (was) { try { stop(was.id); } catch { /* already stopped */ } }
      }
      if (!quiet) onChange?.(view());
    }
    function armExpiry() {
      if (expT) { clearTimer(expT); expT = null; }
      let next = Infinity;
      for (const h of holds.values()) next = Math.min(next, h.until);
      if (next === Infinity) return;
      expT = setTimer(() => { expT = null; expire(); }, Math.max(1000, Math.min(next - now(), 2 ** 31 - 1)));
      expT?.unref?.();
    }
    function expire() {
      const t = now(); const gone = [];
      for (const h of holds.values()) if (h.until <= t) { holds.delete(h.token); gone.push(h); }
      armExpiry();
      if (gone.length) apply();
      return gone;
    }
    function hold(reason, o = {}) {
      const R = REASONS[reason] || {};
      const token = ++seq; const t = now();
      holds.set(token, { token, reason: String(reason), label: String(o.label || R.label || reason), display: Boolean(o.display ?? R.display), owner: o.owner ?? null, since: t, until: t + (Number(o.ttl) > 0 ? Number(o.ttl) : R.ttl || 2 * HOUR), allowed: false });
      armExpiry(); apply();
      return token;
    }
    function release(token) {
      if (!holds.delete(token)) return false;
      armExpiry(); apply();
      return true;
    }
    function releaseWhere(test) {
      let n = 0;
      for (const h of [...holds.values()]) if (test(h)) { holds.delete(h.token); n += 1; }
      if (n) { armExpiry(); apply(); }
      return n;
    }
    // "let it sleep": the holds there now stop counting (they still end normally); new ones count again
    function allow() { let n = 0; for (const h of holds.values()) if (!h.allowed) { h.allowed = true; n += 1; } if (n) apply(); return n; }
    function releaseAll() { quiet = 1; const n = holds.size; holds.clear(); armExpiry(); apply(); quiet = 0; onChange?.(view()); return n; }
    return { hold, release, releaseOwner: (owner) => releaseWhere((h) => h.owner === owner), releaseReason: (reason, owner) => releaseWhere((h) => h.reason === reason && (owner === undefined || h.owner === owner)),
      allow, expire, releaseAll, view, holds: () => [...holds.values()].map((h) => ({ ...h })), active: () => Boolean(cur), type: () => cur?.type || null };
  }

  // ---------- the battery policy ----------
  // plugged: everything as usual · battery: lighter (calm motion, background checks at half pace, no warm preloads, the
  // Lab steps down by itself) · saver (Mac Low Power Mode / Windows battery saver, plugged in or not): lighter still
  function mode(st = {}) { return st.saver || st.lowPower ? 'saver' : st.battery ? 'battery' : 'plugged'; }
  function policy(st = {}) {
    const m = mode(st);
    return { mode: m, lite: m !== 'plugged', motion: m === 'plugged' ? null : 'calm', pollScale: m === 'saver' ? 3 : m === 'battery' ? 2 : 1, warm: m === 'plugged', labLite: m !== 'plugged' };
  }
  // macOS: `pmset -g` lists "lowpowermode 1" (Intel / older) or "powermode 1" (Apple silicon: 1 = low power)
  function parseMacLowPower(text) {
    const s = String(text || '');
    const m = s.match(/^\s*lowpowermode\s+(\d)/m) || s.match(/^\s*powermode\s+(\d)/m);
    return m ? m[1] === '1' : null;
  }
  // Windows: GetSystemPowerStatus' SystemStatusFlag (1 = battery saver on), printed by a small PowerShell line
  function parseWinSaver(text) {
    const m = String(text || '').match(/\b([01])\b/);
    return m ? m[1] === '1' : null;
  }
  const WIN_SAVER_PS = 'Add-Type -Namespace H -Name P -MemberDefinition \'[StructLayout(LayoutKind.Sequential)] public struct S { public byte A; public byte B; public byte L; public byte F; public int T; public int U; } [DllImport("kernel32.dll")] public static extern bool GetSystemPowerStatus(out S s);\'; $s = New-Object H.P+S; [void][H.P]::GetSystemPowerStatus([ref]$s); $s.F';

  // ---------- background timers ----------
  // how long until a background timer runs again, or null (not now: it waits for the next change of state)
  //   o.hidden: 'skip' (only while Hearth is on screen) · 'run' (same pace hidden) · default: hidden ×hiddenScale (2)
  //   o.battery: false = the same pace on battery · o.max / o.min: bounds
  function delay(base, st = {}, o = {}) {
    if (st.asleep) return null;
    if (st.hidden && o.hidden === 'skip') return null;
    let ms = base;
    if (o.battery !== false) ms *= policy(st).pollScale;
    if (st.hidden && o.hidden !== 'run') ms *= o.hiddenScale || 2;
    if (o.max) ms = Math.min(ms, o.max);
    return Math.max(o.min || 0, Math.round(ms));
  }
  // after a wake: a settle time, then one timer every `stagger` ms (slot = its place in line): no burst of catch-up work
  function wakeWait({ wokeAt = 0, now = Date.now(), slot = 0, settle = WAKE.settle, stagger = WAKE.stagger } = {}) {
    if (!wokeAt) return 0;
    return Math.max(0, wokeAt + settle + slot * stagger - now);
  }
  // Power.every / powerwisemain.every: timers that follow the state (state() → { hidden, battery, saver, asleep,
  // wokeAt }); setState() re-arms them; a timer that fires far later than asked means the computer slept: it waits
  // its turn after the wake instead of running at once
  function createScheduler({ state = () => ({}), now = Date.now, setTimer = setTimeout, clearTimer = clearTimeout, onWake } = {}) {
    const timers = new Map();
    let slots = 0; let wokeAt = 0;
    let hushed = null; // (round 52, presentready) while presenting: only the timers kept (a Set of ids) run; the others wait
    const st = () => ({ ...state(), wokeAt: Math.max(wokeAt, state().wokeAt || 0) });
    function arm(T) {
      if (T.t) { clearTimer(T.t); T.t = null; }
      if (T.stopped) return;
      if (hushed && !hushed.has(T.id)) { T.next = null; return; }
      const s = st();
      const d = delay(T.base, s, T.o);
      T.next = null;
      if (d == null) return;
      let wait = !T.last && T.o.first != null ? T.created + T.o.first - now() : (T.last || T.created) + d - now();
      // overdue (back on screen, plugged in again): not all at once, a short beat apart in line
      if (wait <= 0) wait = T.last ? 1000 + T.slot * 250 : 0;
      // (o.wakeSettle: a longer settle for this one, e.g. the updater's minute)
      const settle = T.o.wakeSettle ?? WAKE.settle;
      if (s.wokeAt && now() - s.wokeAt < settle + timers.size * WAKE.stagger) wait = Math.max(wait, wakeWait({ wokeAt: s.wokeAt, now: now(), slot: T.slot, settle }));
      T.next = now() + wait;
      T.expect = T.next;
      T.t = setTimer(() => fire(T), wait);
      T.t?.unref?.();
    }
    function fire(T) {
      T.t = null;
      if (T.stopped) return;
      // far later than asked (more than the slack hidden pages get): the computer slept; wait our turn after the wake
      const late = now() - (T.expect || now());
      if (late > Math.max(LATE_MS * 2, T.base)) { wakeUp(now()); return; }
      T.last = now(); T.runs += 1;
      try { const r = T.fn(); if (r && typeof r.catch === 'function') r.catch(() => {}); } catch (err) { try { console.warn('power timer', T.id, err?.message || err); } catch { /* no console */ } }
      arm(T);
    }
    function wakeUp(at = now()) {
      wokeAt = at; slots = 0;
      // one at a time after the settle time, the ones that are due first first
      const due = [...timers.values()].sort((a, b) => (a.next ?? Infinity) - (b.next ?? Infinity));
      for (const T of due) T.slot = slots++;
      onWake?.(at);
      for (const T of timers.values()) arm(T);
    }
    function every(id, base, fn, o = {}) {
      const old = timers.get(id); if (old) stop(id);
      const T = { id, base, fn, o, t: null, created: now(), last: 0, runs: 0, slot: timers.size, next: null, expect: 0, stopped: false };
      timers.set(id, T);
      arm(T);
      return () => stop(id);
    }
    function stop(id) { const T = timers.get(id); if (!T) return false; T.stopped = true; if (T.t) clearTimer(T.t); timers.delete(id); return true; }
    // the state changed (battery, hidden, asleep): a wake re-arms everyone in line, anything else just re-arms
    let was = null;
    function setState() {
      const s = state();
      if (was && was.asleep && !s.asleep) { wakeUp(s.wokeAt || now()); was = { ...s }; return; }
      was = { ...s };
      for (const T of timers.values()) arm(T);
    }
    function list() { return [...timers.values()].map((T) => ({ id: T.id, base: T.base, every: delay(T.base, st(), T.o), next: T.next ? T.next - now() : null, runs: T.runs, last: T.last, slot: T.slot })); }
    function runNow(id) { const T = timers.get(id); if (!T) return false; T.last = now(); T.runs += 1; try { T.fn(); } catch { /* the timer's own */ } arm(T); return true; }
    // (round 52, presentready) hush(true, keep): background timers wait (only the ids in keep run) · hush(false): they come
    // back, the overdue ones one at a time (the same line-up as after a wake, without its settle)
    function hush(on, keep = []) {
      if (Boolean(hushed) === Boolean(on)) { if (on) hushed = new Set(keep); return false; }
      hushed = on ? new Set(keep) : null;
      if (!on) { slots = 0; const due = [...timers.values()].sort((a, b) => (a.last || a.created) - (b.last || b.created)); for (const T of due) T.slot = slots++; }
      for (const T of timers.values()) arm(T);
      return true;
    }
    return { every, stop, setState, wakeUp, list, runNow, hush, get hushed() { return hushed ? [...hushed] : null; }, get wokeAt() { return wokeAt; } };
  }

  return { REASONS, ORDER, AGENT_AFTER_MS, BIG_DOWNLOAD, DOWNLOAD_AFTER_MS, WAKE, LATE_MS, describe, createBlocker, mode, policy, parseMacLowPower, parseWinSaver, WIN_SAVER_PS, delay, wakeWait, createScheduler };
}));

// ======================= the window =======================
if (typeof window !== 'undefined' && typeof document !== 'undefined' && !(typeof module === 'object' && module.exports)) {
  window.Power = (() => {
    const C = window.PowerCore;
    const api = () => window.hub?.power || null;
    // the computer's state as the main process sees it (battery, saver, asleep, wokeAt) + this page being hidden
    let sys = { battery: false, saver: false, lowPower: false, asleep: false, hidden: false, wokeAt: 0 };
    let awake = { type: null, held: [], text: '', n: 0 };
    const listeners = new Set();
    const stateNow = () => ({ ...sys, hidden: Boolean(sys.hidden || document.hidden) });
    const sched = C.createScheduler({ state: stateNow });
    const every = (id, ms, fn, o) => sched.every(id, ms, fn, o);
    const pol = () => C.policy(sys);

    // ---------- holds made here (renders, recordings, Present) ----------
    // set(key, reason, on): one hold per key (a render job, the recording, Present), whatever calls it how often
    const mine = new Map(); // key → { reason, token: Promise<token> }
    function set(key, reason, on, o = {}) {
      const had = mine.get(key);
      if (on && had && had.reason === reason) return true;
      if (had) { mine.delete(key); had.token.then((t) => t != null && api()?.release(t)).catch(() => {}); }
      if (!on) return false;
      const a = api(); if (!a) return false;
      mine.set(key, { reason, token: a.hold(reason, o).catch(() => null) });
      return true;
    }
    // hold(reason) → release(): for any other feature that wants it (a flow, a long export of its own)
    function hold(reason, o) { const key = `h${Math.random().toString(36).slice(2)}`; set(key, reason, true, o); return () => set(key, reason, false); }

    // Renders' queue (renders, exports, All formats, recordings): a hold per job while it runs or waits its turn
    // (a paused job lets the computer sleep)
    function kindOf(j) {
      if (j.kind === 'record') return 'record';
      if (/all[- ]formats/i.test(`${j.again?.line || ''} ${j.title || ''}`) || /^▦/.test(j.title || '')) return 'formats';
      if (j.kind === 'export' || j.kind === 'loop' || j.kind === 'cut') return 'export';
      return 'render';
    }
    function onJob(j) {
      if (!j?.id) return;
      const on = ['queued', 'starting', 'running'].includes(j.status);
      set(`rq:${j.id}`, kindOf(j), on);
    }
    // (only once its lazy group is in: touching Renders earlier would load it before the first screen)
    function watchRenders() {
      const R = window.Renders;
      if (watchRenders.done || !R?.onChange) return;
      watchRenders.done = true;
      R.onChange((j) => onJob(j));
      for (const j of R.list?.() || []) onJob(j);
    }
    // a recording that doesn't go through the queue (capture's own event) holds the screen on too
    document.addEventListener('hearth:recording', (e) => { const d = e.detail || {}; set('rec', 'record', Boolean(d.recording)); });
    // Present: the Lab preview full screen (tools/three.js adds .presenting); its own toggle runs in the same event
    document.addEventListener('fullscreenchange', () => setTimeout(() => {
      const f = document.fullscreenElement;
      set('present', 'present', Boolean(f && (f.classList.contains('presenting') || f.matches?.('.lab-preview, .preview-host, [data-present]'))));
    }, 0));

    // (round 52, presentready) quiet(on): while the Lab presents, background work waits — here (updates, cost and usage
    // checks, idle websites) and in the main process (backups, sync, config watching); tips wait too (Hints.busy) and
    // the weekly tidy / Freshen offers look at quietNow(). What you started yourself keeps going: 🔁 Keep going, hooks,
    // the Lab's own timers, renders. Off: they come back one at a time.
    const KEEP = ['routines', 'hooks', 'lab-media', 'lab-stall'];
    let quietOn = false;
    function quiet(on) {
      on = Boolean(on);
      if (on === quietOn) return false;
      quietOn = on;
      sched.hush(on, KEEP.concat([...sched.list().map((t) => t.id).filter((id) => /^chromeview/.test(id))]));
      api()?.quiet?.(on).catch?.(() => {});
      dispatchEvent(new CustomEvent('hearth:quiet', { detail: { on } }));
      return true;
    }

    // ---------- the ☕ in the rail's status corner (only while something is held) ----------
    let dot = null;
    function mountDot() {
      const rail = document.getElementById('rail');
      if (!rail) return null;
      if (!dot) {
        dot = el('button', { class: 'tool-btn pw-awake', id: 'pw-awake', type: 'button', hidden: true, dataset: { feature: 'Keeping awake' }, 'aria-label': 'Keeping your computer awake' }, el('span', { class: 'pw-ic', text: '☕' }));
        dot.addEventListener('click', (e) => { const r = dot.getBoundingClientRect(); showMenu(r.right + 6, Math.max(8, r.top - 120), menu()); e.stopPropagation(); });
        dot.addEventListener('contextmenu', (e) => { e.preventDefault(); showMenu(e.clientX + 6, e.clientY - 120, menu()); });
      }
      const anchor = document.getElementById('rq-badge') || document.getElementById('pg-dot') || document.getElementById('sync-dot') || document.getElementById('keys-btn');
      if (anchor ? dot.nextElementSibling !== anchor : dot.parentElement !== rail) (anchor ? anchor.before(dot) : rail.append(dot));
      return dot;
    }
    function paintDot() {
      const show = awake.n > 0;
      if (!show && !dot) return;
      if (!mountDot()) return;
      if (dot.hidden === show) dot.hidden = !show;
      const t = awake.text || 'Keeping your computer awake';
      if (dot.title !== t) { dot.title = t; dot.setAttribute('aria-label', t); }
      const k = awake.type === 'prevent-display-sleep' ? 'display' : 'system';
      if (dot.dataset.kind !== k) dot.dataset.kind = k;
    }
    function menu() {
      const items = [{ label: awake.text || 'Nothing is keeping your computer awake', disabled: true }];
      for (const h of awake.held.filter((x) => !x.allowed)) items.push({ label: `· ${h.label}${h.n > 1 ? ` ×${h.n}` : ''} (${ago(h.since)})`, disabled: true });
      if (awake.n) items.push({ label: 'Let the computer sleep anyway', action: () => allow() });
      items.push({ label: `Power: ${words()}`, disabled: true });
      return items;
    }
    const ago = (t) => { const s = Math.max(0, Math.round((Date.now() - t) / 1000)); return s < 60 ? `${s} s` : s < 3600 ? `${Math.round(s / 60)} min` : `${Math.round(s / 360) / 10} h`; };
    function words() {
      const m = pol().mode;
      return m === 'saver' ? 'battery saver: lighter (calm motion, slower background checks)' : m === 'battery' ? 'on battery: lighter (calm motion, slower background checks)' : 'plugged in: everything as usual';
    }
    async function allow() { const r = await api()?.allow?.().catch(() => null); toast('Your computer may sleep now (what runs keeps going until it does).', { timeout: 3500 }); return r; }

    // ---------- lighter on battery ----------
    let lastMode = null;
    function applyMode() {
      const p = pol();
      const root = document.documentElement;
      const v = p.mode === 'plugged' ? '' : p.mode;
      if ((root.dataset.power || '') !== v) { if (v) root.dataset.power = v; else delete root.dataset.power; }
      if (lastMode === p.mode) return;
      const first = lastMode == null; lastMode = p.mode;
      // look.js reads Power.lite() when it sets the motion tier (Full → Calm while lighter; never saved)
      try { if (typeof Look !== 'undefined') Look.apply(); } catch { /* the look comes back on its next apply */ }
      if (!first || p.lite) for (const fn of listeners) { try { fn(p); } catch (err) { console.warn('power', err); } }
      if (p.lite) note();
    }
    // the first time on battery, one calm note (through Hints: never over work, never twice)
    function note() {
      if (!window.Hints) return;
      Hints.offer({ id: 'power:battery', rank: 60, ttl: 20 * 60000, show: () => toast('On battery: Hearth goes lighter by itself — calmer animations, slower background checks, a lighter Lab preview. Plugged in, everything is back to full. Renders stay full quality.', { timeout: 9000 }) });
    }

    // ---------- state from the main process ----------
    function onState(s) {
      if (!s) return;
      const was = sys;
      sys = { battery: Boolean(s.battery), saver: Boolean(s.saver), lowPower: Boolean(s.lowPower), asleep: Boolean(s.asleep), hidden: Boolean(s.hidden), wokeAt: Number(s.wokeAt) || 0 };
      if (s.awake) { awake = s.awake; paintDot(); }
      if (was.battery !== sys.battery || was.saver !== sys.saver || was.lowPower !== sys.lowPower || was.asleep !== sys.asleep || was.hidden !== sys.hidden || was.wokeAt !== sys.wokeAt) sched.setState();
      applyMode();
      dispatchEvent(new CustomEvent('hearth:power', { detail: { ...sys, mode: pol().mode, awake: awake.text } }));
    }
    document.addEventListener('visibilitychange', () => sched.setState());

    function start() {
      const a = api();
      if (a) {
        a.onState?.(onState);
        a.state?.().then(onState).catch(() => {});
      }
      if (typeof Lazy !== 'undefined' && Lazy.when) Lazy.when('renders', watchRenders); else watchRenders();
      registerCommand();
    }
    function status() {
      const p = pol();
      const lines = [`**Power**: ${words()}`, awake.n ? `**${awake.text}**` : 'Nothing is keeping your computer awake.'];
      const ts = sched.list().map((t) => `${t.id} ${t.every == null ? 'paused' : `every ${Math.round(t.every / 1000)} s`}`);
      if (ts.length) lines.push(`Background checks here: ${ts.join(' · ')}`);
      if (p.lite) lines.push('Renders, stills and recordings stay full quality.');
      return lines.join('\n');
    }
    function registerCommand() {
      if (typeof Commands === 'undefined' || Commands.get('power')) return;
      Commands.register({
        name: 'power', area: 'App', args: '[status | sleep]', aliases: ['awake'].filter((n) => !Commands.get(n)),
        desc: 'What keeps the computer awake now, battery / saver, and the background pace; "sleep" lets the computer sleep anyway',
        complete: () => [{ value: 'status', hint: 'what keeps it awake, battery, background checks' }, { value: 'sleep', hint: 'let the computer sleep anyway' }],
        examples: ['/power', '/power sleep'],
        run: async (args) => { if (/^(sleep|allow)/i.test(String(args || '').trim())) { await allow(); return 'Your computer may sleep now.'; } return status(); },
      });
      if (typeof AppUI !== 'undefined') AppUI.addAction?.('Power: what keeps the computer awake, battery', () => toast(status().replace(/\*\*/g, ''), { timeout: 8000 }));
    }
    // (a deferred first-screen script runs while readyState is 'interactive', before commands.js / lazy.js: after them)
    if (document.readyState !== 'complete') document.addEventListener('DOMContentLoaded', start, { once: true }); else start();

    return {
      every, stop: (id) => sched.stop(id), hold, set, quiet, quietNow: () => quietOn, state: () => ({ ...stateNow(), mode: pol().mode, awake: { ...awake } }), policy: pol,
      lite: () => pol().lite, warm: () => pol().warm, scale: () => pol().pollScale, onMode: (fn) => { listeners.add(fn); return () => listeners.delete(fn); },
      status, timers: () => sched.list(), allow,
      _test: { onState, sched, mine: () => [...mine.keys()], kindOf },
    };
  })();
}
