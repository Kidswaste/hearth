// (round 63, rewards63) 🎁 Real rewards for real quests — the screens and the chat, on Codex's own reward bay.
// Sidequest Studio already has rewards (s.rewards in sparks, claim → enjoyed / returned, "save toward this", a monthly
// treat envelope). This adds, without a second store:
//   - the ✦ tracker panel: "120 XP to your next reward: a new record", Claim… with a confirm, a claimed jar reward
//     waiting for you to move the money, this week's streak bonus
//   - Studio › Rewards: a small "real rewards" shelf (next reward in XP, the savings jar, kind starters, every claim)
//   - chat: /reward, /reward add <name> <xp>, /reward redeem <name>, /reward history (+ ideas, goal, edit, remove, jar)
//   - the streak bonus from weekquest62's streak, granted once a week when a quest change shows it's due
// All writes go through QuestHud.write (QuestJournal.mutate when the Studio holds the journal; otherwise the Studio's
// own read → validate → change → validate → atomic save), announced as 'hearth:quests'. Idle cost: none (one event
// listener; no timers, no polling). No AI. Hearth never touches money: the jar is notes of what YOU moved.
const RewardShelf = (() => {
  const R = RewardsCore;
  let confirming = null; // the reward id the tracker panel is asking "Claim it?" about
  let granting = false;
  const W = () => (typeof WeekQuestCore !== 'undefined' ? WeekQuestCore : null);
  const write = (fn, message) => QuestHud.write(fn, message);
  const repaint = () => QuestHud.repaint?.();
  const xpWords = (r) => `${R.xpOf(r.cost)} XP`;

  // ---------- writes (each one = one journal save) ----------
  async function claim(rid) {
    const { result, after } = await write((s) => R.redeem(window.QuestCore, s, rid), 'Reward claimed. Enjoy it.');
    confirming = null;
    const r = after.rewards.find((x) => x.id === rid);
    const msg = `🎁 Claimed: ${result.name}${r?.jar ? ` · move ${R.money(r.jar)} into your jar yourself, then tick “I moved it”` : ''} · your XP and level stay where they are`;
    toast(msg, { timeout: 4200 }); repaint(); return msg;
  }
  async function moved(receipt) {
    const { S } = QuestHud.journal(); const p = R.jar(S).pending.find((x) => x.receipt === receipt);
    if (!p) return 'Nothing to move for that one.';
    await write((s) => R.jarMove(window.QuestCore, s, { amount: p.amount, receipt, note: p.name }), 'Noted in your savings jar.');
    const msg = `🫙 ${R.money(p.amount)} noted in your jar (you moved it; Hearth never touches money) · ${R.money(R.jar(QuestHud.journal().S).total)} in the jar`;
    toast(msg, { timeout: 3000 }); repaint(); return msg;
  }
  async function bonusCheck(state) {
    const C = window.QuestCore, w = W();
    if (granting || !C || !w || !state || !R.bonusDue(C, w, state)) return null;
    granting = true;
    try {
      const { result } = await write((s) => R.grantBonus(C, w, s), 'Streak bonus added to your rewards.');
      if (result) toast(`✦ Streak bonus: +${R.xpOf(result.sparks)} XP toward your rewards (${result.streak} weeks in a row out in the world)`, { timeout: 4200 });
      return result;
    } catch { return null; } finally { granting = false; }
  }
  // a quest changed (the Studio, the tracker, another stream): is this week's streak bonus due? (once a week at most)
  document.addEventListener('hearth:quests', (e) => { const st = e.detail?.state; if (st && !granting) Promise.resolve().then(() => bonusCheck(st)); });

  // ---------- the ✦ tracker panel: a few rows under today's picks ----------
  function hudRows(C, S, btn) {
    if (!C || !S || !Array.isArray(S.rewards)) return [];
    // (round 64, clickfirst64) the section's own link, in words: "All rewards ›" opens Sidequest Studio › Rewards
    const shelf = () => { QuestHud.close(); return QuestHud.openStudio(null, 'rewards'); };
    const cd = R.next(C, S), rows = [el('div', { class: 'qh-sec cf-sec' }, el('span', { text: 'Rewards' }), el('button', { type: 'button', class: 'cf-link', text: 'All rewards ›', dataset: { k: 'rw-all' }, on: { click: (e) => { e.stopPropagation(); shelf().catch((err) => toast(calmError(err), { type: 'error' })); } } }))];
    if (!cd) {
      rows.push(el('div', { class: 'qh-row rw-row' }, el('span', { class: 'qh-pi', text: '🎁' }), el('div', { class: 'qh-row-main' }, el('span', { class: 'qh-row-title', text: 'Something to look forward to' }), el('span', { class: 'qh-sub', text: 'Pick a starter reward or add your own' })),
        btn('Pick one', () => shelf(), 'qh-take', 'Sidequest Studio › Rewards: kind starters, one click each (a record at Superfly, a long breakfast…)'))); // (round 64, clickfirst64) was "Ideas" (a toast to read): now the shelf where a starter is one click
      return rows;
    }
    if (confirming === cd.id && cd.ready) {
      rows.push(el('div', { class: 'qh-card rw-confirm', attrs: { role: 'group', 'aria-label': `Claim ${cd.name}?` } },
        el('strong', { text: `Claim “${cd.name}”?` }),
        el('span', { class: 'qh-sub', text: `${cd.xp} XP of rewards · your XP and level stay where they are${cd.jar ? ` · you'll move ${R.money(cd.jar)} into your jar yourself` : ''}${cd.amount ? ` · €${cd.amount.toFixed(2)} from your treat envelope` : ''}` }),
        el('div', { class: 'rw-actions' }, btn('Claim it', () => claim(cd.id), 'qh-primary rw-yes'), btn('Not now', () => { confirming = null; repaint(); }, 'rw-no'))));
    } else {
      const row = el('div', { class: `qh-row rw-row${cd.ready ? ' rw-ready' : ''}`, title: cd.note || cd.name },
        el('span', { class: 'qh-pi', text: '🎁' }),
        el('div', { class: 'qh-row-main' }, el('span', { class: 'qh-row-title', text: cd.ready ? `Ready: ${cd.name}` : `${cd.toGo} XP to your next reward: ${cd.name}` }),
          el('span', { class: 'qh-bar qh-wide' }, el('i', { style: { width: `${Math.round(cd.frac * 100)}%` } }))));
      if (cd.ready) row.append(btn('Claim…', () => { confirming = cd.id; repaint(); }, 'qh-take rw-claim', `Claim ${cd.name} (${cd.xp} XP)`));
      rows.push(row);
    }
    for (const p of R.jar(S).pending.slice(0, 2)) {
      rows.push(el('div', { class: 'qh-row rw-row' }, el('span', { class: 'qh-pi', text: '🫙' }),
        el('div', { class: 'qh-row-main' }, el('span', { class: 'qh-row-title', text: `Move ${R.money(p.amount)} into your jar yourself` }), el('span', { class: 'qh-sub', text: p.name })),
        btn('I moved it', () => moved(p.receipt), 'qh-take rw-moved', 'Hearth only notes it; it never touches money')));
    }
    const w = W(), b = w ? R.bonusThisWeek(w, S) : null;
    if (b) rows.push(el('div', { class: 'qh-sub rw-bonus', text: `✦ Streak bonus this week: +${R.xpOf(b.sparks)} XP (${b.streak} weeks in a row)` }));
    return rows;
  }

  // ---------- Studio › Rewards: the real-rewards shelf (Codex's helpers, Codex's look) ----------
  // h: { E, label, p, button, meter, row, mutate, redeemDialog, rewardForm, dialog, field }
  function studio(h, state) {
    const C = window.QuestCore; if (!C || !state) return null;
    const { E, label, p, button, meter, row, mutate } = h;
    const cd = R.next(C, state), w = R.wallet(C, state), j = R.jar(state), wk = W(), b = wk ? R.bonusThisWeek(wk, state) : null;
    const shelf = E('section', { class: 'qj-card rw-shelf', attrs: { 'aria-label': 'Real rewards' } }, label('REAL REWARDS / FOR REAL QUESTS'));
    if (cd) {
      const r = state.rewards.find((x) => x.id === cd.id);
      shelf.append(E('h3', { class: 'rw-next', text: R.say(cd) }), meter(Math.round(cd.frac * cd.cost), cd.cost, `Progress toward ${cd.name}`));
      if (cd.ready && r) shelf.append(row(button('Claim it…', () => h.redeemDialog(r), 'qj-primary'), button('Edit', () => h.rewardForm(r), 'qj-quiet')));
    } else shelf.append(E('h3', { class: 'rw-next', text: 'Pick something to look forward to.' }));
    shelf.append(p(`${w.spendXp} XP to spend on rewards · ${w.xp} XP earned in all (your level never goes down)${w.bonus ? ` · streak bonuses +${w.bonusXp} XP` : ''}`, 'rw-wallet'));
    if (b) shelf.append(p(`✦ This week's streak bonus: +${R.xpOf(b.sparks)} XP for ${b.streak} weeks in a row out in the world (at most ${R.xpOf(R.BONUS_MAX)} XP a week).`, 'rw-bonus'));
    // the savings jar
    const jarBox = E('div', { class: 'rw-jar' }, label(`${j.name.toUpperCase()} / YOU MOVE THE MONEY`), E('strong', { text: `${R.money(j.total)} in the jar` }));
    for (const x of j.pending) jarBox.append(E('div', { class: 'rw-jar-row' }, p(`Move ${R.money(x.amount)} for “${x.name}”`), button('I moved it', () => mutate((s) => R.jarMove(C, s, { amount: x.amount, receipt: x.receipt, note: x.name }), 'Noted in your savings jar.'), 'qj-quiet')));
    jarBox.append(row(button('Note a move', () => jarDialog(h, state), 'qj-quiet')), p('Hearth never moves or sees money: these are your own notes.', 'rw-fine'));
    shelf.append(jarBox);
    // kind starters (only the ones you don't have yet)
    const st = R.starters(state);
    if (st.length) {
      const ideas = E('div', { class: 'qj-tangible-ideas rw-starters' });
      for (const x of st) ideas.append(button(`+ ${x.name} · ${x.xp} XP`, () => mutate((s) => R.addStarter(C, s, x.key), `Added: ${x.name}. Edit it any time.`), 'qj-quiet'));
      shelf.append(label('KIND STARTERS / YOURS TO EDIT'), ideas);
    }
    // every claim (Codex's reward log keeps the enjoyed / returned ones; this is the whole list)
    const hist = R.history(state, 20);
    if (hist.length) {
      const d = E('details', { class: 'qj-fold rw-history' }, E('summary', { text: `Every claim (${state.redemptions.length})` }));
      for (const x of hist) d.append(p(`${new Date(x.at).toLocaleDateString()} · ${x.name} · ${x.xp} XP · ${x.state}`));
      shelf.append(d);
    }
    return shelf;
  }
  function jarDialog(h, state) {
    h.dialog('Note a move', (body, d) => {
      const amount = h.field('Amount · EUR (minus when you take some out)', { value: '10', type: 'number' }), note = h.field('What for', { value: '', max: 200, placeholder: 'Concert fund' });
      amount.input.step = '.01';
      body.append(amount.node, note.node, h.p(`Your jar holds ${R.money(R.jar(state).total)}. You move the money yourself; Hearth only keeps this note.`),
        h.button('Save note', async () => { await h.mutate((s) => R.jarMove(window.QuestCore, s, { amount: Number(amount.input.value), note: note.input.value }), 'Noted in your savings jar.'); d.close(); }, 'qj-primary'));
    }, 'SAVINGS JAR');
  }

  // ---------- chat: /reward ----------
  function addIdeasNote(ctx) {
    const { S } = QuestHud.journal(), st = R.starters(S);
    const text = st.length ? `Kind starters (edit any of them later in Sidequest Studio › Rewards):\n${st.map((x, i) => `${i + 1}. ${x.name} · ${x.xp} XP${x.jar ? ` (+${R.money(x.jar)} into your jar)` : ''}`).join('\n')}` : 'You already have every starter. /reward add <name> <xp> for your own.';
    const actions = st.slice(0, 5).map((x, i) => ({ label: `Add ${i + 1}`, run: () => addStarter(x.key).then((m) => ctx?.say?.(m)) }));
    if (st.length > 1) actions.push({ label: 'Add all', run: () => addAll().then((m) => ctx?.say?.(m)) });
    if (ctx?.note) ctx.note(text, { actions, id: 'rewards' }); else { QuestHud.open(); toast(text, { timeout: 5000 }); }
  }
  async function addStarter(key) {
    const { result: r, after } = await write((s) => R.addStarter(window.QuestCore, s, key), 'Reward added.');
    repaint(); return `🎁 Added: ${r.name} · ${xpWords(r)} · ${R.say(R.card(window.QuestCore, after, r))}`;
  }
  async function addAll() {
    const { S } = QuestHud.journal(), keys = R.starters(S).map((x) => x.key);
    await write((s) => keys.forEach((k) => R.addStarter(window.QuestCore, s, k)), 'Rewards added.');
    repaint(); return `🎁 Added ${keys.length} starter rewards. /reward shows the next one.`;
  }
  function find(S, name) {
    const r = R.match(S, name);
    if (!r) throw Error(name ? `No reward called “${name}” (or more than one fits). Your rewards: ${S.rewards.slice(0, 8).map((x) => x.name).join(' · ') || 'none yet'}` : 'Which reward? /reward redeem <name>');
    return r;
  }
  async function cmd(args, ctx) {
    const { sub, rest } = R.parse(args);
    await QuestHud.refresh();
    const { C, S, status } = QuestHud.journal();
    const say = (text, actions) => (ctx?.note ? ctx.note(text, { actions, id: 'rewards' }) : ctx?.say ? ctx.say(text) : toast(text));
    if (status === 'missing') { say('No quest journal yet. Open Sidequest Studio to start your first quest; rewards come with it.', [{ label: 'Open Sidequest Studio', run: () => QuestHud.openStudio() }]); return; }
    if (status !== 'ok' || !C || !S) return 'Your quest journal could not be read just now. Nothing was changed.';
    if (!sub) {
      await bonusCheck(S);
      const s2 = QuestHud.journal().S, cd = R.next(C, s2);
      const actions = [];
      if (cd?.ready) actions.push({ label: `Claim ${cd.name.slice(0, 28)}…`, run: () => confirmNote(ctx, cd.id) });
      if (!cd) actions.push({ label: 'Starter ideas', run: () => addIdeasNote(ctx) });
      actions.push({ label: 'Reward shelf', run: () => QuestHud.openStudio(null, 'rewards') });
      say(R.summary(C, s2), actions); return;
    }
    if (sub === 'help') return '/reward · /reward add <name> <xp> (+€10 for the jar) · /reward redeem <name> · /reward history · /reward ideas · /reward goal <name> · /reward edit <name> <xp> · /reward remove <name> · /reward jar [+10 | -25 | moved | name <name>]';
    if (sub === 'add') {
      const v = R.parseAdd(rest);
      if (v.xp == null) throw Error('Give it a cost in XP at the end, e.g. /reward add a new record at Superfly 300');
      const { result: r, after } = await write((s) => R.add(C, s, v), 'Reward added.');
      repaint(); return `🎁 Added: ${r.name} · ${xpWords(r)} (✧ ${r.cost})${r.jar ? ` · claiming it means moving ${R.money(r.jar)} into your jar yourself` : ''} · ${R.say(R.card(C, after, r))}`;
    }
    if (sub === 'redeem') { const r = find(S, rest); return confirmNote(ctx, r.id); }
    if (sub === 'history') {
      const h = R.history(S, 15);
      if (!h.length) return 'No rewards claimed yet. /reward shows the next one.';
      return `Your claims (newest first):\n${h.map((x) => `· ${new Date(x.at).toLocaleDateString()} — ${x.name} · ${x.xp} XP · ${x.state}${x.note ? ` · “${x.note}”` : ''}`).join('\n')}`;
    }
    if (sub === 'ideas') { if (/^all$/i.test(rest)) return addAll(); addIdeasNote(ctx); return; }
    if (sub === 'goal') {
      if (!rest || /^(off|none|clear)$/i.test(rest)) { await write((s) => { s.rewardGoal = null; }, 'Reward goal cleared.'); repaint(); return 'Goal cleared: the tracker shows your nearest reward.'; }
      const r = find(S, rest); await write((s) => { s.rewardGoal = r.id; }, 'Saving toward this.'); repaint();
      return `★ Saving toward ${r.name} · ${R.say(R.card(C, QuestHud.journal().S, r))}`;
    }
    if (sub === 'edit') {
      const v = R.parseAdd(rest), r = find(S, v.name);
      if (v.xp == null) throw Error('Give the new cost in XP, e.g. /reward edit superfly 350 (or edit the words in Sidequest Studio › Rewards).');
      await write((s) => R.edit(C, s, r.id, { xp: v.xp }), 'Reward updated.'); repaint();
      return `🎁 ${r.name} now costs ${R.sparksFor(v.xp) * R.XP} XP.`;
    }
    if (sub === 'remove') {
      const r = find(S, rest);
      say(`Remove “${r.name}” from your rewards? Its past claims stay in your history.`, [{ label: 'Remove it', run: () => write((s) => R.remove(s, r.id), 'Reward removed.').then(() => { repaint(); ctx?.say?.(`Removed: ${r.name}`); }) }, { label: 'Keep it', run: () => {} }]);
      return;
    }
    if (sub === 'jar') return jarCmd(rest, C, S, ctx, say);
    // a reward by name: its progress
    const r = R.match(S, rest);
    if (!r) return `No reward called “${rest}”. /reward help lists the words.`;
    const cd = R.card(C, S, r);
    say(`🎁 ${r.name} · ${cd.xp} XP · ${R.say(cd)}`, cd.ready ? [{ label: 'Claim it…', run: () => confirmNote(ctx, r.id) }] : []);
  }
  // the chat's confirm before a claim (nothing is written until "Yes, claim it")
  function confirmNote(ctx, rid) {
    const { C, S } = QuestHud.journal(), r = S.rewards.find((x) => x.id === rid), cd = R.card(C, S, r);
    if (!cd.ready) return `${R.say(cd)}. Nothing was claimed.`;
    const text = `Claim “${r.name}” for ${cd.xp} XP? Your XP and level stay where they are; you'll have ${R.wallet(C, S).spendXp - cd.xp} XP left to spend.${cd.jar ? ` You move ${R.money(cd.jar)} into your jar yourself.` : ''}`;
    if (!ctx?.note) { confirming = rid; QuestHud.open(); repaint(); return; }
    ctx.note(text, { id: 'rewards', actions: [{ label: 'Yes, claim it', run: () => claim(rid).then((m) => ctx.say?.(m)).catch((err) => ctx.say?.(calmError(err))) }, { label: 'Not now', run: () => ctx.say?.('Kept for later.') }] });
  }
  async function jarCmd(rest, C, S, ctx, say) {
    const j = R.jar(S), t = rest.trim();
    if (!t) {
      const lines = [`🫙 ${j.name}: ${R.money(j.total)}${j.toMove ? ` · ${R.money(j.toMove)} to move yourself` : ''}`, ...j.moves.slice(0, 5).map((m) => `· ${new Date(m.at).toLocaleDateString()} ${m.amount > 0 ? '+' : '−'}${R.money(Math.abs(m.amount))}${m.note ? ` ${m.note}` : ''}`), 'Hearth never moves or sees money: /reward jar +10 notes what you moved, -25 what you took out.'];
      say(lines.join('\n'), j.pending.map((p) => ({ label: `I moved ${R.money(p.amount)}`, run: () => moved(p.receipt).then((m) => ctx?.say?.(m)) }))); return;
    }
    if (/^moved$/i.test(t)) {
      if (!j.pending.length) return 'Nothing waiting to be moved.';
      await write((s) => j.pending.forEach((p) => R.jarMove(C, s, { amount: p.amount, receipt: p.receipt, note: p.name })), 'Noted in your savings jar.'); repaint();
      return `🫙 Noted ${R.money(j.toMove)} you moved · ${R.money(R.jar(QuestHud.journal().S).total)} in the jar`;
    }
    const nm = t.match(/^name\s+(.+)$/i);
    if (nm) { await write((s) => R.jarName(s, nm[1]), 'Jar renamed.'); return `🫙 Your jar is now “${R.jar(QuestHud.journal().S).name}”.`; }
    const m = t.match(/^([+\-−]?)\s*€?\s*(\d{1,5}(?:[.,]\d{1,2})?)\s*(?:€|eur(?:os?)?)?\s*(.*)$/i);
    if (!m) throw Error('Try /reward jar +10 (you moved €10 in), /reward jar -25 ticket (you took €25 out), or /reward jar moved.');
    const amount = (m[1] === '-' || m[1] === '−' ? -1 : 1) * Number(m[2].replace(',', '.'));
    await write((s) => R.jarMove(C, s, { amount, note: m[3] }), 'Noted in your savings jar.'); repaint();
    return `🫙 Noted ${amount > 0 ? '+' : '−'}${R.money(Math.abs(amount))} · ${R.money(R.jar(QuestHud.journal().S).total)} in the jar (you move the money; Hearth only keeps the note)`;
  }
  function complete(args) {
    const t = String(args || ''), { S } = QuestHud.journal();
    const hints = { add: '<name> <xp>', redeem: 'claim a reward', history: 'every claim', ideas: 'kind starters', goal: 'save toward one', edit: '<name> <xp>', remove: 'a reward', jar: 'your savings jar', help: 'all the words' };
    if (!/\s/.test(t)) return R.SUBS.filter((s) => s.startsWith(t.toLowerCase())).map((s) => ({ value: s, hint: hints[s] }));
    const { sub, rest } = R.parse(t);
    if (sub === 'jar') return ['+10', '-25', 'moved', 'name '].filter((x) => x.startsWith(rest)).map((x) => ({ value: `jar ${x}` }));
    if (!['redeem', 'goal', 'edit', 'remove'].includes(sub) || !S) return [];
    const n = R.norm(rest);
    return S.rewards.filter((r) => !n || R.norm(r.name).includes(n)).slice(0, 10).map((r) => ({ value: `${sub} ${r.name}`, label: r.name, hint: `${R.xpOf(r.cost)} XP` }));
  }
  if (!Commands.get('reward')) {
    Commands.register({ name: 'reward', aliases: ['rewards'], args: '[add <name> <xp> | redeem <name> | history | ideas | goal <name> | edit <name> <xp> | remove <name> | jar [+10|-25|moved]]', area: 'Create',
      desc: 'Real rewards for your quests: what\'s next and how much XP to go, add one in XP, claim it (with a confirm), every claim, a savings jar you fill yourself', run: cmd, complete,
      examples: ['/reward', '/reward add a new record at Superfly 300', '/reward redeem superfly', '/reward history', '/reward jar +10'], keywords: 'reward rewards treat redeem claim xp sparks savings jar streak bonus superfly record breakfast preset' });
  }
  AppUI.addAction('Quest: my next reward', () => QuestHud.open());
  AppUI.addAction('Quest: open my reward shelf', () => QuestHud.openStudio(null, 'rewards').catch((err) => toast(calmError(err), { type: 'error' })));
  return { hudRows, studio, claim, moved, bonusCheck, run: cmd, complete, state: () => ({ confirming }), confirm: (rid) => { confirming = rid; repaint(); } };
})();
