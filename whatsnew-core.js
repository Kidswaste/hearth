// ✦ Since you were away (round 42, whatsnew): the pure part, no DOM, Node-tested (dev/whatsnew-test.js on the real
// docs/patch-notes files). Hearth gets several rounds a day; the owner updates now and then and used to face a pile of
// notes (rounds 33–41 at once). This turns the missed rounds' docs/patch-notes/round-NN.md files into ONE short digest,
// locally (0 tokens):
//   · parse(text, round): the round's ## parts → items: each part's headline (its name + its first plain line), the
//     bullets with a bold name (details), the 🐞 Fixed bullets (fixes); "Good to know" stays in the full notes
//   · group: by what the owner does: Lab · Chats & AIs · Saving tokens · Mac & Windows · Everywhere · Fixes
//   · dedupe across rounds: the same name again → the later round's words win; a later "X (was Y)" / "replaces Y" →
//     Y goes; a later fix of something that is itself new in this digest folds into it (you never saw the bug)
//   · pick: the headlines first, Lab and chats ahead, plain-speed parts behind, a few per group, ≈ 12 lines, the rest
//     behind "and N more"
//   · goFor(item, AppSearchData): where its "Show me" jumps: a Settings row or an ⋯ AI setup row of Find anything
//     (appsearch-data.js), the Lab's own search on its name, or Find anything itself
const WhatsNewCore = (() => {
  const GROUPS = [
    { id: 'lab', label: 'Lab', icon: '◈' },
    { id: 'chats', label: 'Chats & AIs', icon: '💬' },
    { id: 'tokens', label: 'Saving tokens', icon: '🪙' },
    { id: 'macwin', label: 'Mac & Windows', icon: '💻' },
    { id: 'all', label: 'Everywhere', icon: '✦' },
    { id: 'fixes', label: 'Fixes', icon: '🐞' },
  ];
  const CAP = 12;
  // how many lines each group may take before the others had a turn (the rest fills up after)
  const PER = { lab: 3, chats: 2, tokens: 2, macwin: 2, all: 1, fixes: 2 };
  const WEIGHT = { lab: 3, chats: 2, tokens: 2, macwin: 1, all: 0, fixes: -4 };

  // ---------- plain text ----------
  const norm = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').replace(/^(?:a|an|the|one|your|my)\s+/, '').trim();
  // markdown → one plain line: no **, no `code`, no /commands (the owner doesn't use them; the app never shows them)
  function plain(s) {
    return String(s || '')
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
      .replace(/\s*\((?:[^()]*?\s)?`?\/[a-z][\w-]*[^()]*\)/gi, '')
      .replace(/`\/[a-z][^`]*`(?:\s+(?:brings|turns|makes|gives|shows)[^.;]*)?/gi, '')
      .replace(/`([^`]*)`/g, '$1')
      .replace(/\*\*([^*]+)\*\*/g, '$1').replace(/(^|\s)[*_]([^*_]+)[*_](?=\s|$|[,.;:])/g, '$1$2')
      .replace(/\s+([,.;:])/g, '$1').replace(/\s{2,}/g, ' ').replace(/^[\s,;:.—-]+/, '').trim();
  }
  // one line: the first sentence, cut at a word when it's still long
  function oneLine(s, max = 100) {
    let t = plain(s);
    const m = /^(.{24,}?[.!?])(?:\s|$)/.exec(t);
    if (m && m[1].length <= max) t = m[1];
    if (t.length > max) { const semi = t.lastIndexOf(';', max); t = semi > 40 ? t.slice(0, semi) : `${t.slice(0, t.lastIndexOf(' ', max - 1)).replace(/[\s,;:—-]+$/, '')}…`; }
    return t.replace(/[.;:]$/, '');
  }
  const ICON = /^[^\p{L}\p{N}]+/u;
  const QUAL = /\s*\((?:lab|mac and windows|mac & windows|mac|windows)\)\s*$/i;
  const isWhere = (s) => /^(\*\*find it:?\*\*|find it:|right-click|press |open |in the lab, right-click)/i.test(String(s).trim()) || (/›/.test(s) && String(s).length < 110 && /^[^.]*(›|—\s*0 tokens)/.test(s));

  // ---------- parse one round ----------
  // → { round, title, items: [{ id, round, kind: 'feature'|'detail'|'fix', part, icon, name, line, where, group, key, order }] }
  function parse(text, round) {
    const src = String(text || '').replace(/\r/g, '');
    const title = plain((/^#\s+(.+)$/m.exec(src) || [])[1] || `Round ${round}`);
    const items = [];
    let order = 0;
    for (const chunk of src.split(/\n(?=## )/).slice(1)) {
      const [head, ...body] = chunk.split('\n');
      const raw = head.replace(/^##\s*/, '').trim();
      const icon = ((ICON.exec(raw) || [])[0] || '').trim();
      const part = raw.replace(ICON, '').trim();
      if (!part || /^good to know/i.test(part)) continue;
      const name = part.replace(QUAL, '').trim();
      const fixes = /^(fixed|fixes|bugs? fixed)\b/i.test(part);
      const group = groupOf(raw, part);
      const intro = []; const bullets = []; let where = '';
      for (const l of body) {
        const t = l.trim();
        if (!t) continue;
        if (/^[-*]\s+/.test(t)) bullets.push(t.replace(/^[-*]\s+/, ''));
        else if (/^\*\*find it:?\*\*/i.test(t)) where = plain(t.replace(/^\*\*find it:?\*\*\s*/i, ''));
        else if (!bullets.length) intro.push(t);
      }
      const base = { round, part, icon, group };
      if (fixes) {
        for (const b of bullets) items.push({ ...base, id: `${round}:${order}`, kind: 'fix', name: '', line: oneLine(b), group: 'fixes', key: '', order: order++ });
        continue;
      }
      // the headline: the part's name + its first plain line (a "where it is" line is kept for Show me instead)
      const firstIntro = intro.find((t) => !isWhere(t));
      if (!where) { const w = intro.find((t) => isWhere(t)); if (w) where = plain(w).replace(/\s*—\s*0 tokens\.?$/i, ''); }
      // (a first bullet that is only a bold label, "**What drives it:** beat, bar…", says less than where it is)
      const b1 = bullets.find((b) => !/^\*\*(fixed|safety)/i.test(b)) || '';
      const whereLine = intro.find((t) => isWhere(t) && !/^\*\*find it/i.test(t));
      const head1 = firstIntro || (/^\*\*[^*]+:\*\*/.test(b1) && whereLine ? whereLine.replace(/\s*—\s*0 tokens\.?$/i, '') : b1);
      items.push({ ...base, id: `${round}:${order}`, kind: 'feature', name, line: oneLine(head1), where, key: norm(name.replace(/\s*\([^)]*\)\s*$/, '')), order: order++ });
      for (const b of bullets) {
        if (b === head1) continue;
        const fx = /^\*\*fixed:?\*\*:?\s*/i.exec(b);
        if (fx) { items.push({ ...base, id: `${round}:${order}`, kind: 'fix', name: '', line: oneLine(b.slice(fx[0].length)), group: 'fixes', key: '', about: norm(name), order: order++ }); continue; }
        const bold = /\*\*([^*]{3,48}?)\*\*/.exec(b);
        if (!bold || /^(safety|note|tip)\W*$/i.test(bold[1])) continue;
        let bname = plain(bold[1]).replace(/[:.…]+$/, '').trim();
        bname = bname.charAt(0).toUpperCase() + bname.slice(1);
        if (bname.length < 3 || /^[^\p{L}]*$/u.test(bname)) continue;
        items.push({ ...base, id: `${round}:${order}`, kind: 'detail', name: bname, line: oneLine(b), where: where || name, key: norm(bname), parent: norm(name), order: order++ });
      }
    }
    return { round, title, items };
  }

  // ---------- what the owner does ----------
  function groupOf(raw, part) {
    const t = `${raw}`;
    if (/^\W*(fixed|fixes)\b/i.test(part)) return 'fixes';
    if (/🪙/.test(t) || /\b(tokens?|cheaper|spending|shorter answers|continue lighter|lighter (tools|attachments|long chats)|leaner)\b/i.test(part)) return 'tokens';
    if (/[🍎🪟💻]/u.test(t) || /\((mac|windows|mac and windows)\)/i.test(part) || /\b(mac|windows|pc)\b/i.test(part)) return 'macwin';
    if (/\(lab\)/i.test(part) || /\b(lab|scenes?|preview|renders?|camera|music|formats|recipes|templates|director|before \/ after|sequence|shader|particles)\b/i.test(part)) return 'lab';
    if (/\b(chats?|ai|ais|astra|claude|missions?|smart|memory|answers?|replies|reply|keep going|offline|things go wrong|attachments)\b/i.test(part)) return 'chats';
    return 'all';
  }
  // plain speed / weight parts: good news, nothing to do or find
  const QUIET = /\b(smooth|smoother|rhythm|faster|lighter touch|^lighter$|stays light|in a blink)\b/i;

  // ---------- across rounds ----------
  // items of every round, oldest first → one list: later words win, renames drop the old name, fixes of new things fold
  function dedupe(rounds) {
    const out = new Map(); // key → item (features, details)
    const fixes = [];
    const folded = [];
    const all = rounds.slice().sort((a, b) => a.round - b.round).flatMap((r) => r.items);
    const renamedFrom = (it) => {
      const m = /\b(?:was|were|replaces|replaced|renamed from|used to be|formerly|instead of)\s+(?:the\s+)?["“]?([^"”),.;]{3,40})/i.exec(`${it.line} ${it.name}`);
      return m ? norm(m[1]) : '';
    };
    for (const it of all) {
      if (it.kind === 'fix') { fixes.push(it); continue; }
      if (it.kind === 'detail' && (out.get(it.key)?.kind === 'feature' || it.key === it.parent)) continue;
      const old = renamedFrom(it);
      if (old && out.has(old) && old !== it.key) { const was = out.get(old); out.delete(old); it.was = was.name; it.rounds = [...(was.rounds || [was.round]), it.round]; }
      const prev = out.get(it.key);
      if (prev) {
        if (prev.kind === 'feature' && it.kind === 'detail') continue;
        it.rounds = [...(prev.rounds || [prev.round]), it.round];
        if (!it.where) it.where = prev.where;
        out.delete(it.key);
      }
      out.set(it.key, it);
    }
    const items = [...out.values()];
    const keys = items.filter((x) => x.kind === 'feature' && x.key.length >= 4);
    const seenLine = new Set();
    const keptFixes = [];
    for (const f of fixes) {
      const ln = norm(f.line);
      if (seenLine.has(ln)) continue;
      seenLine.add(ln);
      // a fix of something that is itself new here (same round or earlier): the owner never met the bug
      const hit = keys.find((x) => (f.about === x.key || ` ${ln} `.includes(` ${x.key} `)) && firstRound(x) <= f.round);
      if (hit) { (hit.fixedIn ||= []).push(f.round); folded.push(f); continue; }
      keptFixes.push(f);
    }
    return { items: [...items, ...keptFixes], folded };
  }
  const firstRound = (x) => (x.rounds ? Math.min(...x.rounds) : x.round);

  // ---------- pick ≈ 12 ----------
  function score(it, lo, hi) {
    let s = it.kind === 'feature' ? 10 : it.kind === 'fix' ? 6 : 3;
    s += WEIGHT[it.group] || 0;
    s += hi > lo ? ((it.round - lo) / (hi - lo)) * 2 : 0; // newer a little ahead
    if (it.where) s += 1; // it has a place to show
    if (it.kind === 'feature' && QUIET.test(it.name)) s -= 4;
    if (it.fixedIn) s += 0.5;
    return s - it.order * 0.01;
  }
  // digest(rounds: [{ round, text }], { seen, cap }) → { from, to, rounds, groups: [{ id, label, icon, items }], more,
  // rest: same shape, total, folded }
  function digest(input, { seen = 0, cap = CAP } = {}) {
    const parsed = input.filter((r) => r.round > seen).map((r) => parse(r.text, r.round)).filter((r) => r.items.length);
    if (!parsed.length) return { from: 0, to: 0, rounds: [], groups: [], rest: [], more: 0, total: 0, folded: 0, shown: 0 };
    const lo = Math.min(...parsed.map((r) => r.round)); const hi = Math.max(...parsed.map((r) => r.round));
    const { items, folded } = dedupe(parsed);
    for (const it of items) it.score = score(it, lo, hi);
    const main = items.filter((x) => x.kind !== 'detail').sort((a, b) => b.score - a.score);
    const details = items.filter((x) => x.kind === 'detail').sort((a, b) => b.score - a.score);
    const picked = []; const count = {};
    // the fixes get their line or two at the end whatever the rest scores (one plain line each)
    const fixes = main.filter((x) => x.group === 'fixes');
    const room = cap - Math.min(PER.fixes, fixes.length);
    for (const it of main) { if (picked.length >= room) break; if (it.group === 'fixes') continue; if ((count[it.group] || 0) >= (PER[it.group] ?? 2)) continue; picked.push(it); count[it.group] = (count[it.group] || 0) + 1; }
    for (const it of main) { if (picked.length >= room) break; if (!picked.includes(it) && it.group !== 'fixes') picked.push(it); }
    for (const it of fixes) { if (picked.length >= cap || (count.fixes || 0) >= PER.fixes) break; picked.push(it); count.fixes = (count.fixes || 0) + 1; }
    // a short digest (one or two rounds) gets the bold-named details too
    for (const it of details) { if (picked.length >= cap) break; picked.push(it); }
    const rest = main.filter((x) => !picked.includes(x));
    const byGroup = (list) => GROUPS.map((g) => ({ ...g, items: list.filter((x) => x.group === g.id).sort((a, b) => b.score - a.score) })).filter((g) => g.items.length);
    return { from: lo, to: hi, rounds: parsed.map((r) => r.round).sort((a, b) => a - b), groups: byGroup(picked), rest: byGroup(rest), more: rest.length, total: main.length, folded: folded.length, shown: picked.length };
  }
  // the line as the owner reads it: "Name — what it does" (a fix is just its line)
  const text = (it) => (it.kind !== 'feature' || !it.name ? it.line : it.line ? `${it.name} — ${it.line}` : it.name);

  // ---------- Show me: Find anything's places ----------
  // a few parts whose place the notes don't spell out
  const PLACES = {
    'find anything': { type: 'palette' },
    'calmer settings': { type: 'set', id: 'set:look' },
    'big screen': { type: 'set', id: 'set:ui-size' },
    'calmer tips': { type: 'set', rec: { id: 'set:sw:hints', sec: 'Updates and tips', find: 'Don\'t show tips' } },
    'mac and pc side by side': { type: 'set', id: 'set:sync' },
    'mac and your pc': { type: 'set', id: 'set:sync' },
    'safe updates': { type: 'set', id: 'set:update-now' },
    'calmer ai setup': { type: 'ai', id: 'ai:use' },
    'smart learns from you': { type: 'ai', id: 'ai:learned' },
    'shorter answers': { type: 'ai', id: 'ai:length' },
    'continue lighter': { type: 'ai', id: 'ai:lighter' },
    'where its tokens go': { type: 'ai', id: 'ai:tokens-go' },
    'tidy memory': { type: 'ai', id: 'ai:memory-tidy' },
    'missions cost less': { type: 'ai', id: 'ai:next' },
  };
  // goFor(item, AppSearchData) → { type: 'set'|'ai', rec } | { type: 'lab', q } | { type: 'palette' } | null
  function goFor(it, D) {
    const pick = (id) => (D ? [...(D.SETTINGS || []), ...(D.AI_SETUP || [])].find((r) => r.id === id) : null);
    const ok = (g) => (g.rec ? g : g.id && pick(g.id) ? { type: g.type, rec: pick(g.id) } : g.type === 'palette' ? g : null);
    const keyOf = it.kind === 'detail' ? it.parent || norm(it.name) : it.key || norm(it.name);
    for (const [k, g] of Object.entries(PLACES)) if (keyOf === k || keyOf.endsWith(` ${k}`) || norm(it.name) === k) { const r = ok(g); if (r) return r; }
    // "⋯ AI setup › Spending › Where its tokens go" / "Settings › … › Backups…": the row by its words
    const where = plain(it.where || '');
    if (D && /ai setup/i.test(where)) {
      const segs = where.split(/›/).map((s) => norm(s.replace(/[…]/g, ''))).filter(Boolean).reverse();
      for (const s of segs) { const r = (D.AI_SETUP || []).find((x) => norm(x.find) === s || norm(x.label) === s) || (D.AI_SETUP || []).find((x) => s.length > 5 && norm(x.label).startsWith(s)); if (r) return { type: 'ai', rec: r }; }
    }
    if (D && /settings\s*›/i.test(where)) {
      const segs = where.split(/›/).map((s) => norm(s.replace(/[…]/g, ''))).filter(Boolean).reverse();
      for (const s of segs) { const r = (D.SETTINGS || []).find((x) => (x.find && norm(x.find) === s) || norm(x.label) === s); if (r) return { type: 'set', rec: r }; }
    }
    if (it.group === 'lab' && it.kind !== 'fix' && !QUIET.test(it.name)) return { type: 'lab', q: plain(it.kind === 'detail' ? it.name : it.name).replace(/\s*\(.*\)$/, '') };
    return null;
  }

  return { GROUPS, CAP, parse, dedupe, digest, groupOf, goFor, text, plain, oneLine, norm };
})();
if (typeof module !== 'undefined') module.exports = WhatsNewCore;
