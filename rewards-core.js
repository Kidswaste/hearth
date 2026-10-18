// (round 63, rewards63) Real rewards for real quests: the thinking, no DOM (node-tested in dev/rewards-test.js).
// Built on what Codex's quest journal already has (tools/quest-core.js): s.rewards (name, cost in sparks, note,
// optional € amount), s.redemptions (claimed → enjoyed / returned), s.rewardGoal ("save toward this"), the monthly
// treat envelope, and sparks = one per 5 XP (redeeming never lowers your XP or level). This file adds, on top:
//   - XP words for the owner: a reward "costs 300 XP" = 60 sparks; "120 XP to your next reward" is exact (it counts
//     the XP already sitting between two sparks)
//   - the next reward (your goal, else the nearest one), what's ready, matching a reward by name, adding one in XP
//   - a few kind starter rewards from the owner's Paris / music life (editable like any other reward)
//   - a savings jar (s.rewardJar): € the owner moves THEMSELVES. A reward with `jar: 10` asks you to move €10 when it's
//     claimed (however it was claimed: here, the Studio or chat); "I moved it" notes it. Hearth never touches money.
//   - a small streak bonus (s.rewardBonus): once a week, when weekquest62's streak of real-life weeks is 2 or more,
//     +1 spark per streak week beyond the first, at most 4 sparks (20 XP) a week. QuestCore.balance counts it.
// Every change runs inside the journal's own write (QuestJournal.mutate / QuestHud.write): read → validate → change →
// validate → atomic save, announced as 'hearth:quests'.
(function (root, make) { if (typeof module === 'object' && module.exports) module.exports = make(); else root.RewardsCore = make(); })(typeof self !== 'undefined' ? self : this, () => {
  const XP = 5; // XP per spark (QuestCore: Math.floor(xp / 5))
  const BONUS_MAX = 4, BONUS_FROM = 2; // sparks a week at most; the streak (weeks in a row) it starts at
  const JAR_MAX = 500; // notes kept in the jar
  const obj = (x) => x && typeof x === 'object' && !Array.isArray(x);
  const norm = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9€]+/g, ' ').trim();
  const money = (n) => `€${Number(n).toFixed(Number.isInteger(+n) ? 0 : 2)}`;
  const sparksFor = (xp) => Math.min(10000, Math.max(1, Math.ceil(Number(xp) / XP)));
  const xpOf = (sparks) => sparks * XP;

  // Kind starters: things that mean something offline. Costs are suggestions; edit them in the Studio like any reward.
  const STARTERS = [
    { key: 'superfly', name: 'A new record at Superfly', xp: 300, art: 'music', note: 'Dig the bins at Superfly Records (rue Charlot) and bring one home. Listen to it start to finish the same night.' },
    { key: 'concert-fund', name: 'Concert ticket fund +€10', xp: 500, jar: 10, art: 'music', note: 'Move €10 into your concert jar yourself. When the jar holds a ticket, the next Shotgun or DICE night is on you.' },
    { key: 'enfants-rouges', name: 'A long breakfast at the Marché des Enfants Rouges', xp: 200, art: 'life', note: 'No phone on the table, no rush. Take a notebook if you feel like it.' },
    { key: 'serum-presets', name: 'A new Serum preset pack', xp: 400, art: 'skills', note: 'One pack you will actually play. Make one track sketch with it within the week.' },
    { key: 'cinema', name: 'A film at Le Champo, popcorn included', xp: 250, art: 'life', note: 'Pick the session on the day. Going alone counts.' },
  ];
  const starterId = (key) => `r-rw63-${key}`;

  // ---------- balance in XP words ----------
  // Spendable sparks are QuestCore.balance (earned + streak bonus − claimed, returned ones given back).
  function wallet(C, s) {
    const total = C.xp(s), sparks = C.balance(s), bonus = C.bonus ? C.bonus(s) : 0;
    return { xp: total, sparks, spendXp: xpOf(sparks), bonus, bonusXp: xpOf(bonus), partial: total % XP };
  }
  // Exact XP still to earn before a reward can be claimed (0 when it can be claimed now)
  function toGo(C, s, r) {
    const need = r.cost - C.balance(s);
    return need <= 0 ? 0 : need * XP - (C.xp(s) % XP);
  }
  function card(C, s, r) {
    const bal = C.balance(s), go = toGo(C, s, r);
    return { id: r.id, name: r.name, cost: r.cost, xp: xpOf(r.cost), jar: r.jar || 0, amount: r.amount || 0, goal: s.rewardGoal === r.id, ready: go === 0, toGo: go, frac: Math.max(0, Math.min(1, bal / r.cost)), note: r.note || '' };
  }
  // Your next reward: the one you're saving toward, else the biggest one you can claim now, else the nearest one ahead.
  // A reward claimed and still waiting to be enjoyed steps aside (it's already yours), unless it's the only one.
  function next(C, s) {
    if (!s?.rewards?.length) return null;
    const goal = s.rewards.find((r) => r.id === s.rewardGoal);
    if (goal) return card(C, s, goal);
    const open = new Set((s.redemptions || []).filter((r) => !r.returnedAt && !r.enjoyedAt).map((r) => r.rewardId));
    const free = s.rewards.filter((r) => !open.has(r.id));
    const list = [...(free.length ? free : s.rewards)].sort((a, b) => a.cost - b.cost || a.name.localeCompare(b.name));
    const now = list.filter((r) => toGo(C, s, r) === 0).pop();
    return card(C, s, now || list.find((r) => toGo(C, s, r) > 0) || list[0]);
  }
  const ready = (C, s) => (s?.rewards || []).filter((r) => toGo(C, s, r) === 0).sort((a, b) => b.cost - a.cost).map((r) => card(C, s, r));

  // A reward by name (or id): exact, then starts-with, then contains; ties → none (ask for more words)
  function match(s, name) {
    const n = norm(name); if (!n) return null;
    const list = s?.rewards || [];
    const byId = list.find((r) => r.id === String(name).trim()); if (byId) return byId;
    for (const test of [(x) => x === n, (x) => x.startsWith(n), (x) => x.includes(n), (x) => n.split(' ').every((w) => x.includes(w))]) {
      const hit = list.filter((r) => test(norm(r.name)));
      if (hit.length === 1) return hit[0];
      if (hit.length > 1) return null; // two rewards fit: ask for a few more words
    }
    return null;
  }

  // "/reward add new record at Superfly 300" · "… 300 xp" · "concert fund +10€ 500xp" → { name, xp, jar }
  function parseAdd(text) {
    let t = String(text || '').trim(), jar = 0, xp = null;
    const j = t.match(/(?:^|\s)\+\s*(?:€\s*)?(\d{1,4}(?:[.,]\d{1,2})?)\s*(?:€|eur(?:os?)?)?(?=\s|$)/i) || t.match(/(?:^|\s)(?:jar|€)\s*\+?\s*(\d{1,4}(?:[.,]\d{1,2})?)(?=\s|$)/i);
    if (j) { jar = Number(j[1].replace(',', '.')); }
    const x = t.match(/(?:^|\s)(\d{1,5})\s*(?:xp)?\s*$/i);
    if (x) { xp = Number(x[1]); t = t.slice(0, x.index).trim(); }
    t = t.replace(/\s*[-–·:]\s*$/, '').trim();
    // keep the "+€10" in the name (it says what the reward is), only strip a trailing jar word
    return { name: t.replace(/\s+/g, ' ').slice(0, 160), xp, jar };
  }
  function checkReward(v) {
    if (!v.name || !v.name.trim()) throw Error('Name the reward: /reward add <name> <xp>, e.g. /reward add a new record at Superfly 300');
    if (!Number.isFinite(v.xp) || v.xp < 5 || v.xp > 50000) throw Error('Give it a cost in XP between 5 and 50,000, e.g. 300.');
    if (v.jar != null && (!Number.isFinite(v.jar) || v.jar < 0 || v.jar > 10000)) throw Error('The jar amount is a number of euros between 0 and 10,000.');
  }
  // Adds a reward to Codex's s.rewards (same shape the Studio's "+ Add a reward" makes, plus optional jar / art)
  function add(C, s, { name, xp, note = '', jar = 0, art, id }) {
    name = C.text(name, 160); checkReward({ name, xp, jar });
    if (s.rewards.length >= 100) throw Error('The reward bay holds up to 100 rewards. Remove one first.');
    if (s.rewards.some((r) => norm(r.name) === norm(name))) throw Error(`You already have “${name}”.`);
    const r = { id: id && !s.rewards.some((x) => x.id === id) ? id : C.id('r'), name, cost: sparksFor(xp), note: C.text(note, 500) };
    if (jar) r.jar = Math.round(jar * 100) / 100;
    if (art) r.art = art;
    s.rewards.push(r); return r;
  }
  function addStarter(C, s, key) {
    const st = STARTERS.find((x) => x.key === key); if (!st) throw Error('No such starter reward.');
    const old = s.rewards.find((r) => r.id === starterId(key)); if (old) return old;
    return add(C, s, { ...st, id: starterId(key) });
  }
  const starters = (s) => STARTERS.filter((st) => !(s?.rewards || []).some((r) => r.id === starterId(st.key) || norm(r.name) === norm(st.name)));
  function edit(C, s, rid, { name, xp, jar, note }) {
    const r = s.rewards.find((x) => x.id === rid); if (!r) throw Error('Reward not found.');
    if (name != null) { r.name = C.text(name, 160); if (!r.name) throw Error('Name the reward.'); }
    if (xp != null) { checkReward({ name: r.name, xp }); r.cost = sparksFor(xp); }
    if (jar != null) { if (!(jar >= 0 && jar <= 10000)) throw Error('The jar amount is a number of euros between 0 and 10,000.'); if (jar) r.jar = Math.round(jar * 100) / 100; else delete r.jar; }
    if (note != null) r.note = C.text(note, 500);
    return r;
  }
  function remove(s, rid) {
    const i = s.rewards.findIndex((x) => x.id === rid); if (i < 0) throw Error('Reward not found.');
    const [r] = s.rewards.splice(i, 1);
    if (s.rewardGoal === rid) s.rewardGoal = null;
    return r; // its claims stay in your history (they carry their own name and cost)
  }
  // Claim it with Codex's own rule (C.redeem: never below zero, the monthly € envelope for priced treats)
  function redeem(C, s, rid, at) {
    const r = s.rewards.find((x) => x.id === rid); if (!r) throw Error('Reward not found.');
    const go = toGo(C, s, r);
    if (go > 0) throw Error(`${go} XP to go before “${r.name}”. Your XP is safe; nothing was claimed.`);
    return C.redeem(s, rid, at);
  }

  // ---------- history ----------
  function history(s, n = 20) {
    return [...(s?.redemptions || [])].sort((a, b) => Date.parse(b.at) - Date.parse(a.at)).slice(0, n)
      .map((r) => ({ id: r.id, name: r.name, xp: xpOf(r.cost), cost: r.cost, at: r.at, state: r.returnedAt ? 'returned' : r.enjoyedAt ? 'enjoyed' : 'claimed', note: r.note || '' }));
  }

  // ---------- savings jar (the owner moves the money; Hearth only keeps the notes) ----------
  function jarOf(s) { return obj(s?.rewardJar) ? s.rewardJar : { v: 1, name: 'Savings jar', moves: [] }; }
  function checkJar(j) {
    if (j == null) return true;
    if (!obj(j) || j.v !== 1 || typeof j.name !== 'string' || j.name.length > 80 || !Array.isArray(j.moves) || j.moves.length > JAR_MAX) throw Error('Invalid savings jar.');
    let total = 0;
    for (const m of j.moves) {
      if (!obj(m) || typeof m.id !== 'string' || !Number.isFinite(m.amount) || Math.abs(m.amount) > 10000 || m.amount === 0 || !Number.isFinite(Date.parse(m.at)) || (m.note != null && (typeof m.note !== 'string' || m.note.length > 200)) || (m.receipt != null && typeof m.receipt !== 'string')) throw Error('Invalid savings jar note.');
      total += m.amount;
    }
    if (total < -0.001) throw Error('The jar can\'t go below €0.');
    return true;
  }
  // { name, total (moved in − taken out), pending: claimed jar rewards still to move yourself }
  function jar(s) {
    const j = jarOf(s), moved = new Set(j.moves.map((m) => m.receipt).filter(Boolean));
    const byId = new Map((s?.rewards || []).map((r) => [r.id, r]));
    const pending = (s?.redemptions || []).filter((r) => !r.returnedAt && !moved.has(r.id) && byId.get(r.rewardId)?.jar)
      .map((r) => ({ receipt: r.id, name: r.name, amount: byId.get(r.rewardId).jar, at: r.at }));
    const total = Math.round(j.moves.reduce((n, m) => n + m.amount, 0) * 100) / 100;
    return { name: j.name, total, pending, toMove: pending.reduce((n, p) => n + p.amount, 0), moves: [...j.moves].reverse().slice(0, 20) };
  }
  // A note that you moved money (amount > 0) or took some out (amount < 0); receipt: the claimed jar reward it settles
  function jarMove(C, s, { amount, note = '', receipt = null, at = new Date().toISOString() }) {
    amount = Math.round(Number(amount) * 100) / 100;
    if (!Number.isFinite(amount) || amount === 0 || Math.abs(amount) > 10000) throw Error('Say how much you moved, e.g. /reward jar +10 (or -25 when you spend it).');
    const j = C.clone(jarOf(s));
    if (receipt && j.moves.some((m) => m.receipt === receipt)) throw Error('Already noted as moved.');
    if (jar(s).total + amount < 0) throw Error(`The jar holds ${money(jar(s).total)}: it can't go below €0.`);
    const m = { id: C.id('jar'), amount, at, note: C.text(note, 200) }; if (receipt) m.receipt = receipt;
    j.moves.push(m);
    while (j.moves.length > JAR_MAX) { // the oldest two notes fold into one, so the total never changes
      const [a, b] = j.moves.splice(0, 2), sum = Math.round((a.amount + b.amount) * 100) / 100;
      if (sum) j.moves.unshift({ id: b.id, amount: sum, at: b.at, note: 'Earlier notes' });
    }
    checkJar(j); s.rewardJar = j; return m;
  }
  function jarName(s, name) { const j = { ...jarOf(s) }; j.name = String(name || '').trim().slice(0, 80) || 'Savings jar'; s.rewardJar = { ...j, moves: [...j.moves] }; return j.name; }

  // ---------- streak bonus (from weekquest62's streak of real-life weeks) ----------
  // W = WeekQuestCore. Due once per week (Monday key), when this week's streak is ≥ 2: 1 spark per week beyond the first, ≤ 4.
  function bonusDue(C, W, s, now = Date.now()) {
    if (!s || !W) return null;
    const week = W.monday(W.key(new Date(now))), st = W.streak(C, s, week).n;
    if (st < BONUS_FROM) return null;
    if ((s.rewardBonus?.weeks || []).some((w) => w.week === week)) return null;
    return { week, streak: st, sparks: Math.min(BONUS_MAX, st - 1) };
  }
  function grantBonus(C, W, s, now = Date.now()) {
    const due = bonusDue(C, W, s, now); if (!due) return null;
    if (!obj(s.rewardBonus)) s.rewardBonus = { v: 1, weeks: [] };
    s.rewardBonus.weeks.push({ ...due, at: new Date(now).toISOString() });
    if (s.rewardBonus.weeks.length > 520) s.rewardBonus.weeks.splice(0, s.rewardBonus.weeks.length - 520);
    return due;
  }
  const bonusThisWeek = (W, s, now = Date.now()) => (s?.rewardBonus?.weeks || []).find((w) => w.week === W.monday(W.key(new Date(now)))) || null;

  // ---------- words ----------
  const say = (cd) => (!cd ? 'No rewards yet: /reward ideas, or /reward add <name> <xp>.' : cd.ready ? `Ready to claim: ${cd.name} (${cd.xp} XP)` : `${cd.toGo} XP to your next reward: ${cd.name}`);
  function summary(C, s) {
    const w = wallet(C, s), cd = next(C, s), rd = ready(C, s), j = jar(s);
    const lines = [`🎁 ${w.spendXp} XP to spend on rewards (✧ ${w.sparks}) · your ${w.xp} XP and level never go down`, say(cd)];
    if (rd.length > (cd?.ready ? 1 : 0)) lines.push(`Ready: ${rd.slice(0, 5).map((r) => r.name).join(' · ')}`);
    if (w.bonus) lines.push(`Streak bonus so far: +${w.bonusXp} XP`);
    if (j.total || j.pending.length) lines.push(`${j.name}: ${money(j.total)}${j.toMove ? ` · ${money(j.toMove)} to move yourself` : ''}`);
    return lines.join('\n');
  }
  const SUBS = ['add', 'redeem', 'history', 'ideas', 'goal', 'edit', 'remove', 'jar', 'help'];
  function parse(args) {
    const t = String(args || '').trim(), m = t.match(/^(\S+)\s*([\s\S]*)$/);
    if (!m) return { sub: '', rest: '' };
    const w = m[1].toLowerCase(), alias = { claim: 'redeem', new: 'add', log: 'history', suggest: 'ideas', starters: 'ideas', delete: 'remove', rm: 'remove', savings: 'jar' }[w] || w;
    return SUBS.includes(alias) ? { sub: alias, rest: m[2].trim() } : { sub: 'name', rest: t };
  }
  return { XP, BONUS_MAX, BONUS_FROM, STARTERS, starterId, norm, money, sparksFor, xpOf, wallet, toGo, card, next, ready, match, parseAdd, add, addStarter, starters, edit, remove, redeem, history, jar, jarOf, checkJar, jarMove, jarName, bonusDue, grantBonus, bonusThisWeek, say, summary, SUBS, parse };
});
