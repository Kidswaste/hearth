// Hooks, the plain part (round 26): what a hook is, in words, and the guard rails' arithmetic. No DOM, no Hearth
// globals, so dev/hooks-test.js runs it in Node. hooks.js (the live part and the ⋯ AI setup section) uses it.
// A hook lives on its AI (agent.hooks, like agent.instructions; never in the system prompt):
//   { id, on, when: { kind, dir?, at?, every?, from? }, then: { kind: 'message' | 'mission', text, mission? } }
const HooksCore = (() => {
  // the things Hearth can really notice (hooks.js wires each one to its signal)
  const EVENTS = [
    { kind: 'render', icon: '⇪', label: 'A render or export finishes', short: 'a render finishes' },
    { kind: 'labError', icon: '⚠', label: 'The Lab scene shows an error', short: 'the Lab scene errors' },
    { kind: 'file', icon: '📂', label: 'A file appears in a folder…', short: 'a file lands in a folder', needs: 'dir' },
    { kind: 'time', icon: '🕘', label: 'Every day at a time…', short: 'it is time', needs: 'at' },
    { kind: 'every', icon: '⟳', label: 'Every few hours…', short: 'every few hours', needs: 'every' },
    { kind: 'update', icon: '⬆', label: 'Hearth updates', short: 'Hearth updates' },
    { kind: 'reply', icon: '💬', label: 'Another AI finishes a reply', short: 'another AI replies', needs: 'from' },
    { kind: 'board', icon: '🖼', label: 'The mood board gets new things', short: 'the mood board gets new things' },
  ];
  const ev = (kind) => EVENTS.find((e) => e.kind === kind) || null;
  const MAX_PER_AI = 12;
  const MIN_GAP = 60000; // never more than once a minute
  const HOUR_CAP = 10; // a hook that fired 10 times in an hour pauses itself (a loop: an error the fix brings back…)
  const SAME_FACT_MS = 10 * 60000; // the same news twice in 10 minutes is told once
  const LATE_MS = 10 * 60000; // a daily time missed by more than this (Hearth was closed) waits for tomorrow

  const base = (p) => String(p || '').split(/[\\/]/).filter(Boolean).pop() || String(p || '');
  const clip = (s, n) => { const t = String(s ?? '').replace(/\s+/g, ' ').trim(); return t.length > n ? `${t.slice(0, n - 1)}…` : t; };
  const hhmm = (s) => { const m = /^(\d{1,2}):(\d{2})$/.exec(String(s || '').trim()); if (!m) return null; const h = Number(m[1]); const mi = Number(m[2]); return h < 24 && mi < 60 ? `${String(h).padStart(2, '0')}:${m[2]}` : null; };

  // a hook as typed or loaded, made safe: unknown kinds drop, texts capped, numbers in range
  function normalize(h) {
    if (!h || typeof h !== 'object' || !ev(h.when?.kind)) return null;
    const w = { kind: h.when.kind };
    if (w.kind === 'file') { w.dir = String(h.when.dir || '').trim(); if (!w.dir) return null; }
    if (w.kind === 'time') { w.at = hhmm(h.when.at); if (!w.at) return null; }
    if (w.kind === 'every') w.every = Math.min(24, Math.max(1, Math.round(Number(h.when.every) || 3)));
    if (w.kind === 'reply') w.from = String(h.when.from || 'any');
    const then = h.then?.kind === 'mission' && h.then.mission ? { kind: 'mission', mission: String(h.then.mission), text: String(h.then.text ?? '').trim().slice(0, 2000) } : { kind: 'message', text: String(h.then?.text ?? '').trim().slice(0, 2000) };
    if (!then.text) return null;
    return { id: String(h.id || `hk${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`), on: h.on !== false, when: w, then };
  }
  const listOf = (agent) => (Array.isArray(agent?.hooks) ? agent.hooks.map(normalize).filter(Boolean) : []);

  // "When a render finishes" / "Every day at 09:00" / "When a file lands in Downloads"
  function whenText(w, nameOf = (id) => id) {
    if (w.kind === 'file') return `When a file lands in ${base(w.dir)}`;
    if (w.kind === 'time') return `Every day at ${w.at}`;
    if (w.kind === 'every') return `Every ${w.every === 1 ? 'hour' : `${w.every} hours`}`;
    if (w.kind === 'reply') return w.from && w.from !== 'any' ? `When ${nameOf(w.from)} finishes a reply` : 'When another AI finishes a reply';
    return `When ${ev(w.kind)?.short || w.kind}`;
  }
  function thenText(t, missionName = (id) => id) {
    const words = `“${clip(t.text, 60)}”`;
    return t.kind === 'mission' ? `${missionName(t.mission)} with ${words}` : `it gets ${words}`;
  }
  const describe = (h, o = {}) => `${whenText(h.when, o.nameOf)} → ${thenText(h.then, o.missionName)}`;

  // the one factual line Hearth adds about what happened (shown in the chat with your words, never hidden in them)
  function fact(kind, d = {}) {
    if (kind === 'render') return `${d.failed ? 'A render failed' : 'A render finished'}: ${clip(d.title || 'render', 80)}${d.output ? ` → ${d.output}` : ''}${d.failed && d.reason ? ` (${clip(d.reason, 120)})` : ''}`;
    if (kind === 'labError') return `The Lab scene shows an error: ${clip(d.message, 200)}${d.line ? ` (line ${d.line})` : ''}${d.layer ? ` · layer ${clip(d.layer, 30)}` : ''}`;
    if (kind === 'file') return `A new file appeared in ${base(d.dir)}: ${d.path}`;
    if (kind === 'time') return `It's ${d.at} (your daily hook).`;
    if (kind === 'every') return `Your every-${d.every === 1 ? 'hour' : `${d.every}-hours`} hook (Hearth is open).`;
    if (kind === 'update') return `Hearth just updated${d.from && d.to ? ` (${d.from} → ${d.to}${d.n ? `, ${d.n} file${d.n === 1 ? '' : 's'}` : ''})` : ''}.`;
    if (kind === 'reply') return `${clip(d.name || 'Another AI', 30)} finished a reply in “${clip(d.title || 'a chat', 50)}”${d.excerpt ? `: “${clip(d.excerpt, 140)}”` : ''}`;
    if (kind === 'board') return `${d.n} new thing${d.n === 1 ? '' : 's'} on the mood board “${clip(d.board || 'board', 40)}”${d.kinds ? ` (${d.kinds})` : ''}.`;
    return clip(d.text || kind, 200);
  }
  // the message that goes out: Hearth's line on top, marked as Hearth's, then your words as you wrote them
  const compose = (factLine, words) => `> ⚡ From Hearth (hook): ${factLine}\n\n${String(words || '').trim()}`;

  // ---------- guard rails ----------
  // rec: { last, times: [ms…], fact, factAt } of one hook. → { ok } · { wait: ms } (too soon) · { skip: reason } · { cap: true }
  function gate(rec = {}, now = Date.now(), factLine = '') {
    if (factLine && rec.fact === factLine && now - (rec.factAt || 0) < SAME_FACT_MS) return { skip: 'same news' };
    const times = (rec.times || []).filter((t) => now - t < 3600000);
    if (times.length >= HOUR_CAP) return { cap: true };
    const since = now - (rec.last || 0);
    if (since < MIN_GAP) return { wait: MIN_GAP - since };
    return { ok: true };
  }
  const fired = (rec = {}, now = Date.now(), factLine = '') => ({ last: now, times: [...(rec.times || []).filter((t) => now - t < 3600000), now].slice(-HOUR_CAP), fact: factLine, factAt: now });

  // timers: is this time / every-N hook due now? (rec.last: when it last fired; rec.armed: when it was made / last checked)
  function due(w, rec = {}, now = Date.now()) {
    if (w.kind === 'every') { const from = Math.max(rec.last || 0, rec.armed || 0); return Boolean(from) && now - from >= w.every * 3600000; }
    if (w.kind === 'time') {
      const [h, m] = w.at.split(':').map(Number);
      const d = new Date(now); d.setHours(h, m, 0, 0);
      const t = d.getTime();
      return now >= t && now - t <= LATE_MS && (rec.last || 0) < t;
    }
    return false;
  }

  // a file worth telling about (not a download in progress, a lock or a hidden file)
  const junk = (name) => /^\.|^~\$|\.(crdownload|part|partial|download|tmp|temp|swp|lock)$|^Thumbs\.db$|^desktop\.ini$/i.test(base(name));

  // queued while the AI answers: one waiting fire per hook, the newest news, how many happened
  function coalesce(prev, factLine) { return { fact: factLine, n: (prev?.n || 0) + 1 }; }
  const queuedFact = (q) => (q.n > 1 ? `${q.fact} (and ${q.n - 1} more like it while it was busy)` : q.fact);

  return { EVENTS, ev, MAX_PER_AI, MIN_GAP, HOUR_CAP, SAME_FACT_MS, normalize, listOf, whenText, thenText, describe, fact, compose, gate, fired, due, junk, coalesce, queuedFact, hhmm, clip, base };
})();
if (typeof module !== 'undefined') module.exports = HooksCore;
