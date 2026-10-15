// ◧ Try it first (round 43, directorpreview): the pure part, loadable in Node (dev/directorpreview-test.js).
// A director turn's edits wait on the scene in memory (the preview shows them) while the scenes file keeps the scene as
// it was: diskList() is what the Lab's save writes meanwhile. line() names the edit in one short line (the bar, the
// toast, and "Try another way", which sends it back so the director doesn't do the same thing again).
const TryCore = (() => {
  const clone = (x) => JSON.parse(JSON.stringify(x));
  // the scenes list as the file should hold it while trials wait: a trial's scene as it was when the turn started; a
  // scene made during a trial isn't written yet (while the turn runs: any new one; after it: the one the chat moved to)
  function diskList(list, trials) {
    const live = (trials || []).filter((t) => t && t.sketch && t.sceneId);
    if (!live.length) return list;
    const before = new Map(live.map((t) => [t.sceneId, t.sketch]));
    const hide = new Set(live.flatMap((t) => t.newIds || []));
    const running = live.filter((t) => t.running && Array.isArray(t.startIds)).map((t) => new Set(t.startIds));
    const out = [];
    for (const x of list || []) {
      if (!x?.id) { out.push(x); continue; }
      if (hide.has(x.id)) continue;
      if (running.some((s) => !s.has(x.id))) continue;
      out.push(before.has(x.id) ? clone(before.get(x.id)) : x);
    }
    return out;
  }
  const words = (s) => String(s || '').replace(/\s+/g, ' ').trim();
  const cut = (s, n) => { const t = words(s); return t.length > n ? `${t.slice(0, n - 1).replace(/[\s,;:·-]+$/, '')}…` : t; };
  // the reply's first sentence, without Markdown (what the director said it did)
  function firstSentence(text, max = 70) {
    const t = words(String(text || '').replace(/```[\s\S]*?```/g, ' ').replace(/[*_`#>]+/g, '').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1'));
    if (!t) return '';
    const m = /^(.+?[.!?])(\s|$)/.exec(t);
    return cut(m ? m[1] : t, max);
  }
  // one line for the edit: what changed in the scene (the time machine's summary) + what the director said, ≤ 140
  function line({ summary = '', newScene = '', reply = '' } = {}) {
    const parts = [];
    if (newScene) parts.push(`made a new scene “${cut(newScene, 40)}”`);
    if (summary && summary !== 'no change') parts.push(summary);
    const said = firstSentence(reply);
    if (said) parts.push(`“${said}”`);
    return cut(parts.join(' · ') || 'an edit to the scene', 140);
  }
  // "Try another way": short on purpose (the session already has the ask); the rejected edit in one line
  function followUp(edit) {
    return `Not that one: I undid it, so the scene is back as it was (it was: ${cut(edit, 140)}). Try a different approach to my last ask.`;
  }
  // tokens of one or more turns
  function addUsage(a, u) {
    const o = a || { input: 0, output: 0, cached: 0, turns: 0 };
    if (!u) return o;
    o.input += Number(u.input) || 0; o.output += Number(u.output) || 0; o.cached += Number(u.cached) || 0; o.turns += 1;
    return o;
  }
  const fmt = (n) => (n >= 10000 ? `${Math.round(n / 1000)}k` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(Math.round(n)));
  function costText(u) {
    const total = (u?.input || 0) + (u?.output || 0);
    if (!total) return '';
    return `${fmt(total)} tokens${u.cached ? ` (${fmt(u.cached)} cached)` : ''}${u.turns > 1 ? ` · ${u.turns} replies` : ''}`;
  }
  const whoName = (by) => (by === 'codex' ? 'Astra' : 'Claude');
  return { diskList, firstSentence, line, followUp, addUsage, costText, fmt, whoName, clone };
})();
if (typeof module !== 'undefined') module.exports = TryCore;
