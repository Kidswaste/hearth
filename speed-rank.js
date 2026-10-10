// Round 13 (speed): rank by habit. What you actually use, where you are, at this time of day, lately, comes first in
// the "/" menu (chat-slash.js: "Your usual in <tool>"), the typed "/" matches (commands.js setRanker), the command
// bar's empty row (cmdbar.js), Ctrl/⌘+K (appui.js paletteItems) and the Commands page ("Your usual", principal ones in
// your order). Things you never use keep their old order after them, so nothing moves away, they just sink.
// All local and computed when a list opens: Speed.score() on a few hundred counted keys, no tokens, no timers.
const SpeedRank = (() => {
  const S = Speed;
  const nameOfKey = (k) => k.slice(k.indexOf('/') + 1);
  // a command's habit score here and now (0 = never used)
  const of = (name, where) => S.score(S.cmdKey(name), where);
  // the commands you use most here, now: [def], best first (used at least `min` times)
  function top(where = S.place(), n = 6, { min = 2, skip = [] } = {}) {
    const out = new Map();
    for (const [k, s] of Object.entries(S.data.stats)) {
      if (!k.startsWith('Chat command › /') || s.n < min) continue;
      const d = Commands.get(nameOfKey(k));
      if (!d || d.hidden || S.META.has(d.name) || skip.includes(d.name)) continue;
      const sc = S.score(k, where);
      if (!out.has(d.name) || out.get(d.name)[1] < sc) out.set(d.name, [d, sc]);
    }
    return [...out.values()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([d]) => d);
  }
  // names or defs in habit order (stable: the never-used keep their order, after the used ones)
  function sort(list, where = S.place()) {
    return list.map((x, i) => ({ x, i, s: of(typeof x === 'string' ? x : x?.name, where) })).sort((a, b) => b.s - a.s || a.i - b.i).map((o) => o.x);
  }
  // the palette's items: Again first (when there is something to repeat), then what you pick most here, now
  function palette(items) {
    const where = S.place();
    const keyOf = (it) => {
      const keys = [`Command palette › ${it.label}`];
      if (it.kind === 'Agent') { const a = H.agents().find((x) => x.name === it.label); if (a) keys.push(`Open › ${a.id}`); }
      if (it.kind === 'Tool') { const t = Tools.enabled().find((x) => x.name === it.label); if (t) keys.push(`Open › tool:${t.id}`); }
      return keys;
    };
    const ranked = items.map((it, i) => ({ it, i, s: keyOf(it).reduce((m, k) => Math.max(m, S.score(k, where)), 0) })).sort((a, b) => b.s - a.s || a.i - b.i).map((o) => o.it);
    const a = S.lastAction();
    if (!a) return ranked;
    return [{ kind: 'Again', label: '↻ Again', detail: a.label, keys: 'Ctrl+.', run: () => S.redo(a) }, ...ranked.filter((it) => it.label !== 'Again: repeat your last action')];
  }
  // "/" typed: after the exact name, pinned and recent ones, your habits break the ties (commands.js)
  if (typeof Commands !== 'undefined' && Commands.setRanker) Commands.setRanker((name) => of(name));
  // a short line of what ranks first here now (/habits now)
  function explain(where = S.place()) {
    const t = top(where, 8, { min: 1 });
    const tod = S.TOD[S.todOf()];
    return t.length ? `**Your usual in ${S.placeLabel(where)} this ${tod}:** ${t.map((d) => `\`/${d.name}\``).join(' · ')}` : `Nothing ranked yet in ${S.placeLabel(where)}: the commands you run here move up as you use them.`;
  }
  return { of, top, sort, palette, explain };
})();
