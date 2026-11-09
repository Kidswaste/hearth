// (round 153a, lite153) Power-wise's main-process half (split from powerwise.js so no window parses it): the reasons to
// keep the computer awake, the blocker that counts them per reason and always releases them, and the readers of Mac Low
// Power Mode / Windows battery saver. powerwise.js merges these into its exports for Node (powerwisemain.js and
// dev/powerwise-test.js require('./powerwise') as before).
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


module.exports = { REASONS, ORDER, AGENT_AFTER_MS, BIG_DOWNLOAD, DOWNLOAD_AFTER_MS, describe, createBlocker, parseMacLowPower, parseWinSaver, WIN_SAVER_PS };
