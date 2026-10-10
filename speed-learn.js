// Round 13 (speed): learned shortcuts. Hearth notices the little routines you repeat (open the Lab → 9:16 → Shuffle →
// Save) and offers, once, to turn one into a single key: Ctrl/⌘+Alt+1…9 run your one-key macros, and each is also a
// /command of your own (/macro keys lists them). The keys button's sheet starts with "Yours": the keys you really
// press, most used first, the key for something you keep doing with the mouse, and "Give it a key" for the ones
// that have none. Everything is counted locally when you act (Speed.onAction), nothing polls, no tokens.
//   /macro learned · /macro keys · /macro key <name> <1-9> · /macro unkey <1-9> · /macro forget-learned
const SpeedLearn = (() => {
  const S = Speed;
  const MIN_GAP = 4 * 60e3; // a routine's steps within 4 minutes
  const L = () => (S.data.learn ||= { seqs: {}, offered: {}, binds: {} });
  const hintsOn = () => store.get('speed.hints', true) !== false;
  const trail = []; // this session's actions: { id, step, label, t, i }
  const lastEnd = new Map(); // pattern → index of its last counted end (overlaps don't count twice)
  let lastOffer = 0;
  // an action as a macro step: a command as typed, a button by its name, a tool by its id
  function token(a) {
    if (a.kind === 'cmd' && S.repeatable(a)) return { id: a.line, step: a.line, label: a.line.length > 28 ? `${a.line.slice(0, 27)}…` : a.line };
    if (a.kind === 'click' && S.repeatable(a)) return { id: `click:${a.key}`, step: `/click ${a.key}`, label: a.label };
    if (a.kind === 'open') return { id: `open:${a.key}`, step: `/click ${a.key}`, label: a.label, open: true };
    return null;
  }
  S.onAction((a, i) => {
    const tk = token(a);
    if (!tk) return;
    // the same thing twice in a row is Again's job, not a routine
    if (trail.length && trail.at(-1).id === tk.id) { trail.at(-1).t = a.t; return; }
    trail.push({ ...tk, t: a.t, i });
    if (trail.length > 16) trail.shift();
    S.whenLoaded(() => learn(i));
  });
  function learn(i) {
    const seqs = L().seqs;
    const ready = [];
    for (let n = 2; n <= 5; n += 1) {
      if (trail.length < n) break;
      const w = trail.slice(-n);
      if (w.at(-1).t - w[0].t > MIN_GAP || new Set(w.map((x) => x.id)).size < n || w.at(-1).open || w.every((x) => x.open)) continue;
      const id = w.map((x) => x.id).join(' ⟶ ');
      const prev = lastEnd.get(id);
      if (prev != null && w[0].i <= prev) continue;
      lastEnd.set(id, trail.at(-1).i);
      const r = (seqs[id] ||= { n: 0, steps: w.map((x) => x.step), labels: w.map((x) => x.label), ids: w.map((x) => x.id) });
      r.n += 1; r.last = Date.now();
      // (a part or a rotation of a routine you already made is not offered again)
      const covered = Object.values(seqs).some((m) => m.made && m.ids && w.every((x) => m.ids.includes(x.id)));
      if (r.n >= (n === 2 ? 5 : 3) && !L().offered[id] && !r.made && !covered) ready.push([id, r, n]);
    }
    const ids = Object.keys(seqs);
    if (ids.length > 300) ids.sort((a, b) => (seqs[a].n - seqs[b].n) || (seqs[a].last - seqs[b].last)).slice(0, ids.length - 300).forEach((k) => delete seqs[k]);
    S.save();
    if (ready.length) offer(...ready.sort((a, b) => b[2] - a[2] || b[1].n - a[1].n)[0]);
  }
  // once per routine, at most one offer every 10 minutes, never while hints are off
  function offer(id, r) {
    if (!hintsOn() || Date.now() - lastOffer < 10 * 60e3) return;
    lastOffer = Date.now();
    L().offered[id] = Date.now();
    S.save();
    const d = freeDigit();
    toast(`You often do ${r.labels.join(' → ')} (${r.n}×). Make it one key?`, { timeout: 12000, action: { label: d ? `Make it ${Commands.keyText(`Ctrl+Alt+${d}`)}` : 'Make it a command', fn: () => make(id).catch((err) => toast(err.message, { type: 'error' })) } });
  }
  const freeDigit = () => { const b = L().binds; for (let d = 1; d <= 9; d += 1) if (!b[d] || !Commands.get(b[d])) return d; return 0; };
  const slug = (labels) => labels.map((l) => String(l).toLowerCase().replace(/^\/|^open\s+/, '').replace(/[^a-z0-9]+/g, ' ').trim().split(' ').slice(0, 2).join('-')).filter(Boolean).join('-').slice(0, 32).replace(/-+$/, '') || 'routine';
  // a routine → your own command (/alias … /run a ; b), and the next free Ctrl+Alt key
  async function make(id, { name = '', key = true } = {}) {
    const r = L().seqs[id];
    if (!r) throw new Error('That routine is no longer known');
    let nm = (name || slug(r.labels)).toLowerCase().replace(/^\//, '');
    for (let k = 2; Commands.get(nm) && k < 50; k += 1) nm = `${(name || slug(r.labels)).toLowerCase()}-${k}`;
    const body = r.steps.length > 1 ? `/run ${r.steps.join(' ; ')}` : r.steps[0];
    await Commands.tryRun(`/alias ${nm} ${body}`, H.claudeAgent()?.id, null, { say: () => {}, note: () => {}, history: false });
    if (!Commands.get(nm)) throw new Error(`Could not make /${nm}`);
    r.made = nm;
    const d = key ? freeDigit() : 0;
    if (d) L().binds[d] = nm;
    S.save();
    toast(`Made /${nm}${d ? ` · ${Commands.keyText(`Ctrl+Alt+${d}`)} runs it` : ''} (/macro keys)`, { timeout: 4000 });
    return { name: nm, digit: d };
  }
  // give something you do by mouse its own key: a one-step macro that presses that button
  async function keyForButton(key, label) {
    const id = `click:${key}`;
    L().seqs[id] ||= { n: 0, steps: [`/click ${key}`], labels: [label || key.split(' › ').pop()], ids: [id] };
    return make(id);
  }

  // ---------- Ctrl/⌘+Alt+1…9 ----------
  const toastSay = (t) => toast(String(t ?? '').replace(/\*\*([^*]+)\*\*/g, '$1').replace(/`([^`]+)`/g, '$1').slice(0, 220), { timeout: 2600 });
  async function runDigit(d) {
    const name = L().binds[d];
    if (!name || !Commands.get(name)) { toast(`${Commands.keyText(`Ctrl+Alt+${d}`)} is free: /macro key <name> ${d} gives it one of your commands (/macro learned suggests some)`, { timeout: 3200 }); return false; }
    await Commands.tryRun(`/${name}`, H.claudeAgent()?.id, null, { source: 'key', say: toastSay, note: toastSay });
    return true;
  }
  addEventListener('keydown', (e) => {
    if (!e.ctrlKey || !e.altKey || e.shiftKey || !/^Digit[1-9]$/.test(e.code) || e.defaultPrevented) return;
    // AltGr (Ctrl+Alt on Windows) types characters on many keyboards: in a text box only a real digit counts
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName) || e.target?.isContentEditable;
    if (typing && !/^[1-9]$/.test(e.key)) return;
    e.preventDefault(); e.stopPropagation();
    runDigit(Number(e.code.slice(5)));
  }, true);
  try { Keys.add({ area: 'Everywhere', keys: 'Ctrl+Alt+1…9', what: 'Your one-key macros (learned shortcuts; /macro keys)', run: () => Commands.exec('/macro keys', H.claudeAgent()?.id) }); } catch { /* keys.js not loaded */ }

  // ---------- /macro learned · keys · key · unkey ----------
  function learnedList(n = 6) {
    return Object.entries(L().seqs).filter(([, r]) => r.n >= 2 && r.steps.length >= 2).sort((a, b) => b[1].n - a[1].n || b[1].steps.length - a[1].steps.length).slice(0, n);
  }
  async function macroCmd(w, rest, ctx) {
    const b = L().binds;
    if (w === 'learned' || w === 'suggest') {
      const list = learnedList();
      if (!list.length) return 'No routine learned yet: when you repeat a few steps (a command, a button, another one) Hearth offers to make them one key.';
      const text = `**Routines you repeat** (most first)\n${list.map(([, r], i) => `${i + 1}. ${r.labels.join(' → ')} · ${r.n}×${r.made ? ` · /${r.made}` : ''}`).join('\n')}`;
      if (ctx?.note) { ctx.note(text, { id: 'speed-learned', actions: list.slice(0, 4).filter(([, r]) => !r.made).map(([id], i) => ({ label: `Make ${i + 1} one key`, run: () => make(id).catch((err) => toast(err.message, { type: 'error' })) })) }); return undefined; }
      return text;
    }
    if (w === 'keys') {
      const lines = Object.entries(b).filter(([, n]) => Commands.get(n)).map(([d, n]) => `- ${Commands.keyText(`Ctrl+Alt+${d}`)} → \`/${n}\``);
      return lines.length ? `**Your one-key macros**\n${lines.join('\n')}\n\n\`/macro key <name> <1-9>\` · \`/macro unkey <1-9>\`` : 'No one-key macros yet. `/macro key <name> <1-9>` gives one of your commands a key; `/macro learned` lists routines you repeat.';
    }
    if (w === 'key' || w === 'bind') {
      const m = String(rest || '').trim().match(/^\/?([\w-]+)\s+([1-9])$/);
      if (!m) return 'Use `/macro key <name> <1-9>`, e.g. `/macro key shuffle 3`.';
      if (!Commands.get(m[1])) return `No command /${m[1]}.`;
      b[m[2]] = Commands.get(m[1]).name; S.save();
      return `${Commands.keyText(`Ctrl+Alt+${m[2]}`)} runs \`/${b[m[2]]}\` now.`;
    }
    if (w === 'unkey') {
      const d = String(rest || '').trim();
      if (!b[d]) return `${Commands.keyText(`Ctrl+Alt+${d || '?'}`)} has no macro.`;
      const was = b[d]; delete b[d]; S.save();
      return `${Commands.keyText(`Ctrl+Alt+${d}`)} is free again (\`/${was}\` still works).`;
    }
    if (w === 'forget-learned') { L().seqs = {}; L().offered = {}; lastEnd.clear(); trail.length = 0; S.save(); return 'Forgot the routines it learned (your macros and keys stay).'; }
    return null;
  }

  // ---------- the keys sheet: "Yours" ----------
  const FEATURE = /^(Shortcut|Open|Chat command|Command palette|Agent tool) › /;
  // a key that already does what this button does: a keys-sheet line whose words name it, the one for here first
  function keyLineFor(label) {
    const w = String(label || '').toLowerCase().trim();
    if (w.length < 3) return null;
    const re = new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    // the line that names it earliest ("Save the sliders…" before "…as a look: save"), the one for here first
    const at = (e) => e.what.search(re) + (/\s(as|into|with|then)\s/i.test(e.what.slice(0, e.what.search(re) + w.length + 14)) ? 20 : 0);
    const hits = Keys.all().filter((e) => re.test(e.what) && !/click|drag|Hold|Point|Right/i.test(e.keys)).sort((a, b) => at(a) - at(b));
    return hits.find((e) => { try { return !e.when || e.when(); } catch { return false; } }) || hits[0] || null;
  }
  function yours() {
    const items = typeof Usage !== 'undefined' && Usage.data?.items ? Usage.data.items : {};
    const own = Object.entries(items).filter(([k, v]) => k.startsWith('Shortcut › ') && v.n > 0).sort((a, b) => b[1].n - a[1].n).slice(0, 5).map(([k, v]) => {
      const m = k.slice(11).match(/^(.*?)(?: \((.*)\))?$/) || [];
      const line = Keys.all().find((e) => e.keys === m[1]) || null;
      return { keys: m[1], what: line?.what || (m[2] ? `in ${m[2]}` : ''), n: v.n, line };
    });
    const clicks = Object.entries(items).filter(([k, v]) => !FEATURE.test(k) && v.n >= 4 && !S.DANGER.test(v.label || '')).sort((a, b) => b[1].n - a[1].n).slice(0, 14);
    const hasKey = []; const noKey = [];
    for (const [k, v] of clicks) {
      const line = keyLineFor(v.label || k.split(' › ').pop());
      if (line) { if (hasKey.length < 3 && !own.some((o) => o.keys === line.keys)) hasKey.push({ k, v, line }); } else if (noKey.length < 2) noKey.push({ k, v });
    }
    const binds = Object.entries(L().binds).filter(([, n]) => Commands.get(n));
    return { own, hasKey, noKey, binds };
  }
  // DOM for keys-ui.js (same classes as its groups); runLine(entry) is the sheet's own "press it"
  function sheet(close, runLine) {
    const y = yours();
    const K = (keys) => KeysUI.kbds(keys);
    const line = (keys, what, fn, title = '') => el('button', { type: 'button', class: 'ks-line', title, on: { click: fn } }, el('span', { class: 'ks-keys' }, K(keys)), el('span', { class: 'ks-what', text: what }));
    const rows = [
      ...y.own.map((o) => line(o.keys, `${o.what || 'your key'} · ${o.n}×`, () => (o.line ? runLine(o.line) : toast(`${KeysUI.keyText(o.keys)} ${o.what}`, { timeout: 2000 })), 'Your own most-used keys')),
      ...y.binds.map(([d, n]) => line(`Ctrl+Alt+${d}`, `/${n} (your macro)`, () => { close(); runDigit(Number(d)); })),
      ...y.hasKey.map(({ v, line: kl }) => line(kl.keys, `${v.label}: you click it ${v.n}× · this key does it`, () => runLine(kl), 'A key for something you do with the mouse')),
      ...y.noKey.map(({ k, v }) => el('button', { type: 'button', class: 'ks-line speed-give', title: 'Give it Ctrl+Alt+1…9', on: { click: () => { close(); keyForButton(k, v.label).catch((err) => toast(err.message, { type: 'error' })); } } },
        el('span', { class: 'ks-keys' }, el('span', { class: 'ks-word', text: '＋ key' })), el('span', { class: 'ks-what', text: `${v.label}: you click it ${v.n}× · give it a key` }))),
    ];
    const last = S.recent().find(S.repeatable);
    if (last && (last.x || 1) >= 3) rows.unshift(line('Ctrl+.', `Again: ${last.label} (you did it ${last.x}× in a row)`, () => { close(); S.again(); }));
    if (!rows.length) return [];
    return [el('div', { class: 'ks-group speed-yours' }, el('h4', { text: 'Yours · most used first' }), ...rows)];
  }

  queueMicrotask(() => {
    if (typeof AppUI === 'undefined' || !AppUI.addAction) return;
    AppUI.addAction('Learned shortcuts: routines you repeat, as one key', () => Commands.exec('/macro learned', H.claudeAgent()?.id));
    AppUI.addAction('Your one-key macros (Ctrl+Alt+1…9)', () => Commands.exec('/macro keys', H.claudeAgent()?.id));
  });

  return { macroCmd, make, keyForButton, runDigit, learnedList, sheet, yours, keyLineFor, trail: () => trail.slice(), freeDigit };
})();
