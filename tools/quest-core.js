(function (root, make) { if (typeof module === 'object') module.exports = make(require('./quest-catalog')); else root.QuestCore = make(root.QuestCatalog); })(typeof self !== 'undefined' ? self : this, D => {
  const clone = value => JSON.parse(JSON.stringify(value));
  const day = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  const text = (s, max = 500) => String(s || '').trim().slice(0, max);
  const id = prefix => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  const paths = D.paths;
  const initial = () => ({ v: 1, campaigns: clone(D.campaigns), active: 'c-material', sideQuests: [], records: {}, tiny: {}, rewards: [
    { id: 'r-play', name: 'An hour of guilt-free gaming', cost: 20 }, { id: 'r-film', name: 'A film night, picked by me', cost: 35 },
  ], redemptions: [], ideas: [], motion: true, plan: null, focus: null, updatedAt: null });
  const allQuests = s => [...s.campaigns.flatMap(c => c.quests.map(q => ({ ...q, campaign: c.id, path: c.path }))), ...s.sideQuests];
  const find = (s, qid) => allQuests(s).find(q => q.id === qid);
  const record = (s, qid) => s.records[qid] || {};
  const done = (s, qid) => Boolean(record(s, qid).completedAt);
  const skipped = (s, qid) => Boolean(record(s, qid).skippedAt);
  const next = (s, c) => c?.quests.find(q => !done(s, q.id) && !skipped(s, q.id)) || null;
  const campaignDone = (s, c) => c.quests.every(q => done(s, q.id));
  const sideCount = s => s.sideQuests.filter(q => !done(s, q.id) && !skipped(s, q.id) && !q.parked).length;
  const earned = (s, q) => done(s, q.id) ? q.xp : record(s, q.id).startedAt ? 5 : 0;
  const xp = (s, path) => allQuests(s).filter(q => !path || q.path === path).reduce((n, q) => n + earned(s, q), 0);
  const balance = s => Math.floor(xp(s) / 5) - s.redemptions.filter(r => !r.returnedAt).reduce((n, r) => n + r.cost, 0);
  function level(total) { let n = 1; while (total >= 50 * n * (n + 1)) n++; const base = 50 * n * (n - 1), end = 50 * n * (n + 1); return { n, base, end, progress: (total - base) / (end - base), left: end - total }; }
  const skills = (s, path) => paths.find(p => p.id === path).skills.map((name, i) => ({ name, threshold: [0, 30, 90, 180, 300][i], unlocked: xp(s, path) >= [0, 30, 90, 180, 300][i] }));
  function available(s, qid) { const q = find(s, qid); if (!q || skipped(s, qid)) return false; const c = s.campaigns.find(c => c.id === q.campaign); return c ? !c.paused && next(s, c)?.id === qid : !q.parked; }
  function daily(date = day()) {
    const n = Math.floor(Date.parse(date + 'T12:00:00Z') / 86400000);
    return [0, 1, 2].map(i => { const [path, title, goal, tiny, tool] = D.daily[(n + i * 2) % D.daily.length]; return { id: `q-day-${date}-${i}`, path, title, done: goal, tiny, tool, minutes: 5, xp: 20, deep: 'Spend ten extra minutes exploring the idea, only if you want to.', day: date }; });
  }
  function trackSide(s, q) { if (s.sideQuests.some(x => x.id === q.id)) return; if (sideCount(s) >= 3) throw Error('Keep up to three side quests. Park, skip or finish one first.'); s.sideQuests.push(clone(q)); }
  function skip(s, qid, at = new Date().toISOString()) {
    if (skipped(s, qid)) return;
    if (done(s, qid) || !available(s, qid)) throw Error('Only an available, unfinished quest can be skipped.');
    s.records[qid] = { ...record(s, qid), skippedAt: at };
    if (s.focus?.quest === qid) s.focus = null;
    if (s.plan?.quest === qid) s.plan = null;
  }
  function dismiss(s, q) {
    // Daily suggestions may be declined even when all three active slots are occupied.
    if (!s.sideQuests.some(x => x.id === q.id)) s.sideQuests.push(clone(q));
    skip(s, q.id);
  }
  function revisit(s, qid) {
    if (!skipped(s, qid)) return;
    const q = find(s, qid); if (!q) throw Error('Quest not found.');
    if (!q.campaign && sideCount(s) >= 3) throw Error('Park, skip or finish a side quest before bringing this one back.');
    delete s.records[qid].skippedAt;
    if (q.campaign) { s.active = q.campaign; s.campaigns.find(c => c.id === q.campaign).paused = false; }
    else s.sideQuests.find(x => x.id === qid).parked = false;
  }
  function saveIdea(s, { id: existing, title, goal, path, minutes }) {
    title = text(title, 150); goal = text(goal || title, 500);
    if (!title || !goal) throw Error('Give your next quest a name and a finish line.');
    if (!paths.some(p => p.id === path) || ![5, 15, 30].includes(minutes)) throw Error('Choose a path and a quest size.');
    const ideas = s.ideas ||= [], found = existing && ideas.find(i => i.id === existing);
    if (existing && (!found || found.questId)) throw Error('Only an unused idea can be edited.');
    if (!existing && ideas.length >= 100) throw Error('Your idea box is full. Remove an unused idea first.');
    const idea = { id: found?.id || id('idea'), title, goal, path, minutes, createdAt: found?.createdAt || new Date().toISOString() };
    if (found) Object.assign(found, idea); else ideas.push(idea);
    return idea;
  }
  function startIdea(s, iid) {
    const idea = (s.ideas || []).find(i => i.id === iid); if (!idea) throw Error('Idea not found.');
    if (idea.questId) return find(s, idea.questId);
    const q = { id: `q-${idea.id}`, title: idea.title, path: idea.path, done: idea.goal, minutes: idea.minutes, xp: ({ 5: 20, 15: 35, 30: 50 })[idea.minutes], tiny: 'Open what you need and take one small action toward this finish line.', deep: 'Try one variation after reaching your finish line, only if you want to.', tool: null };
    trackSide(s, q); idea.questId = q.id; return q;
  }
  function recommend(s, { minutes = 5, energy = 'steady', path = 'any' } = {}, today = day()) {
    if (![2, 5, 15, 30].includes(minutes) || !['low', 'steady'].includes(energy) || (path !== 'any' && !paths.some(p => p.id === path))) throw Error('Choose a time, energy level and path.');
    const choices = allQuests(s).filter(q => !done(s, q.id) && available(s, q.id)).map(q => ({ ...q, kind: 'quest', priority: q.campaign === s.active ? 0 : q.campaign ? 3 : 1 }));
    if (sideCount(s) < 3) {
      choices.push(...(s.ideas || []).filter(i => !i.questId).map(i => ({ ...i, done: i.goal, tiny: 'Open what you need and take one small action toward this finish line.', kind: 'idea', priority: 2 })));
      choices.push(...daily(today).filter(q => !s.sideQuests.some(x => x.id === q.id)).map(q => ({ ...q, kind: 'daily', priority: 4 })));
    }
    return choices.filter(q => path === 'any' || q.path === path).map(q => {
      const tiny = energy === 'low' || q.minutes > minutes;
      return { id: q.id, kind: q.kind, title: q.title, path: q.path, mode: tiny ? 'tiny' : 'normal', minutes: tiny ? 2 : q.minutes, fullMinutes: q.minutes, action: tiny ? s.tiny[q.id] || q.tiny : q.done, priority: q.priority, reason: tiny ? 'A two-minute start. The full finish line can wait.' : q.kind === 'idea' ? 'An idea you saved, sized for this session.' : q.campaign === s.active ? 'The next step in your tracked campaign.' : 'A finish line that fits the time you chose.' };
    }).sort((a, b) => (energy === 'steady' ? Number(a.mode === 'tiny') - Number(b.mode === 'tiny') : 0) || a.priority - b.priority || a.minutes - b.minutes || a.id.localeCompare(b.id)).slice(0, 3);
  }
  function choose(s, pick) {
    let q;
    if (pick.kind === 'idea') q = startIdea(s, pick.id);
    else if (pick.kind === 'daily') { q = daily().find(q => q.id === pick.id); if (!q) throw Error('That daily suggestion has changed. Pick again.'); trackSide(s, q); }
    else if (pick.kind === 'quest') q = find(s, pick.id);
    if (!q || done(s, q.id) || !available(s, q.id)) throw Error('That quest is no longer available. Pick again.');
    if (q.campaign) s.active = q.campaign;
    return q;
  }
  function planQuest(s, qid, action, minutes = 5) {
    action = text(action, 500);
    if (!find(s, qid) || done(s, qid) || !available(s, qid)) throw Error('Plan an available, unfinished quest.');
    if (!action || !Number.isInteger(minutes) || minutes < 1 || minutes > 120) throw Error('Write one next action and choose a session length.');
    s.plan = { quest: qid, action, minutes, at: new Date().toISOString() }; return s.plan;
  }
  function gains(before, after) {
    const skillGains = paths.flatMap(p => { const previous = skills(before, p.id); return skills(after, p.id).filter((n, i) => n.unlocked && !previous[i].unlocked).map(n => ({ name: n.name, path: p.id })); });
    const previousBalance = balance(before), currentBalance = balance(after);
    const rewards = after.rewards.filter(r => previousBalance < r.cost && currentBalance >= r.cost).map(r => r.name);
    return { xp: xp(after) - xp(before), levels: level(xp(after)).n - level(xp(before)).n, skills: skillGains, rewards };
  }
  function startSmall(s, qid, at = new Date().toISOString()) { if (!available(s, qid)) throw Error('Start with the next available quest.'); const r = record(s, qid); if (r.startedAt || r.completedAt) return 0; s.records[qid] = { ...r, startedAt: at }; return 5; }
  function complete(s, qid, details = {}, at = new Date().toISOString()) {
    if (done(s, qid)) return 0;
    if (!available(s, qid)) throw Error('Finish the earlier quest first, or resume this campaign.');
    const q = find(s, qid), before = earned(s, q), r = record(s, qid);
    s.records[qid] = { ...r, completedAt: at, note: text(details.note, 2000), artifact: details.artifact ? { label: text(details.artifact.label, 160), path: text(details.artifact.path, 2000), kind: text(details.artifact.kind, 30) } : null };
    if (s.focus?.quest === qid) s.focus = null;
    if (s.plan?.quest === qid) s.plan = null;
    return q.xp - before;
  }
  function undo(s, qid) {
    const q = find(s, qid); if (!q || !done(s, qid)) return;
    const c = s.campaigns.find(c => c.id === q.campaign), index = c?.quests.findIndex(q => q.id === qid);
    if (c?.quests.slice(index + 1).some(q => record(s, q.id).startedAt || done(s, q.id))) throw Error('Undo the later quests in this campaign first.');
    const loss = q.xp - (record(s, qid).startedAt ? 5 : 0);
    if (balance(s) < Math.floor(xp(s) / 5) - Math.floor((xp(s) - loss) / 5)) throw Error('Return a redeemed reward first; these sparks have already been used.');
    const r = record(s, qid); s.records[qid] = r.startedAt ? { startedAt: r.startedAt } : {};
  }
  function addCampaign(s, { title, why, path, milestones }) {
    title = text(title, 100); why = text(why, 600); if (!title) throw Error('Give your campaign a name.');
    if (!paths.some(p => p.id === path)) throw Error('Choose a path.');
    const lines = milestones.map(x => text(x, 250)).filter(Boolean); if (!lines.length || lines.length > 12) throw Error('Add between one and twelve milestones.');
    if (s.campaigns.length >= 100) throw Error('The journal holds up to 100 campaigns.');
    const cid = id('c');
    const c = { id: cid, title, why, path, custom: true, subtitle: 'YOUR CAMPAIGN', badge: title, quests: lines.map((line, i) => ({ id: `q-${cid}-${i}`, title: line, done: line, tiny: 'Write down the first physical action you can take in two minutes.', deep: 'Improve one detail only after this milestone is finished.', minutes: 15, xp: i === lines.length - 1 ? 60 : 35, tool: null })) };
    s.campaigns.push(c); s.active = cid; return c;
  }
  function redeem(s, rid, at = new Date().toISOString()) { const r = s.rewards.find(r => r.id === rid); if (!r) throw Error('Reward not found.'); if (balance(s) < r.cost) throw Error(`You need ${r.cost - balance(s)} more sparks for this reward.`); const receipt = { id: id('r'), rewardId: rid, name: r.name, cost: r.cost, at }; s.redemptions.push(receipt); return receipt; }
  function stats(s) { const quests = allQuests(s), finished = quests.filter(q => done(s, q.id)); return { xp: xp(s), level: level(xp(s)), sparks: balance(s), finished: finished.length, campaigns: s.campaigns.filter(c => campaignDone(s, c)).length, days: new Set(finished.map(q => record(s, q.id).completedAt.slice(0, 10))).size }; }
  // Validate before accepting disk data or an import. Unknown/corrupt journals never become a new blank save.
  function validate(s) {
    const obj = x => x && typeof x === 'object' && !Array.isArray(x);
    const str = (x, n) => typeof x === 'string' && x.length <= n;
    const ident = x => str(x, 100) && /^[a-z][a-z0-9-]+$/.test(x);
    const date = x => typeof x === 'string' && Number.isFinite(Date.parse(x));
    if (!obj(s) || s.v !== 1 || !Array.isArray(s.campaigns) || s.campaigns.length > 100 || !Array.isArray(s.sideQuests) || s.sideQuests.length > 10000 || !obj(s.records) || !obj(s.tiny) || !Array.isArray(s.rewards) || s.rewards.length > 100 || !Array.isArray(s.redemptions) || s.redemptions.length > 10000) throw Error('Unsupported or damaged quest journal. Your original is preserved.');
    const ids = new Set();
    function unique(x) { if (!ident(x) || ids.has(x)) throw Error('Invalid or duplicate journal ID.'); ids.add(x); }
    function quest(q) { unique(q.id); if (!str(q.title, 250) || !str(q.done, 1000) || !str(q.tiny, 500) || !str(q.deep, 1000) || !Number.isInteger(q.xp) || q.xp < 5 || q.xp > 100 || !Number.isFinite(q.minutes) || q.minutes < 1 || q.minutes > 120 || (q.tool != null && !['tiles', 'lab', 'sounds', 'slice', 'rack', 'files', 'arena'].includes(q.tool))) throw Error('Invalid quest details.'); }
    for (const c of s.campaigns) { unique(c.id); if (!str(c.title, 100) || !str(c.why, 600) || !paths.some(p => p.id === c.path) || !Array.isArray(c.quests) || !c.quests.length || c.quests.length > 12) throw Error('Invalid campaign.'); c.quests.forEach(quest); }
    for (const q of s.sideQuests) { if (!paths.some(p => p.id === q.path)) throw Error('Invalid quest path.'); quest(q); }
    const qids = new Set(allQuests(s).map(q => q.id));
    if (s.plan != null && (!obj(s.plan) || !qids.has(s.plan.quest) || !str(s.plan.action, 500) || !s.plan.action.trim() || !Number.isInteger(s.plan.minutes) || s.plan.minutes < 1 || s.plan.minutes > 120 || !date(s.plan.at))) throw Error('Invalid next-session note.');
    if (s.motion != null && typeof s.motion !== 'boolean') throw Error('Invalid studio motion setting.');
    if (s.ideas != null && (!Array.isArray(s.ideas) || s.ideas.length > 100)) throw Error('Invalid quest idea box.');
    const ideaQuests = new Set();
    for (const i of s.ideas || []) { unique(i.id); if (!str(i.title, 150) || !i.title.trim() || !str(i.goal, 500) || !i.goal.trim() || !paths.some(p => p.id === i.path) || ![5, 15, 30].includes(i.minutes) || !date(i.createdAt) || (i.questId != null && (!s.sideQuests.some(q => q.id === i.questId) || ideaQuests.has(i.questId)))) throw Error('Invalid quest idea.'); if (i.questId) ideaQuests.add(i.questId); }
    for (const r of Object.values(s.records)) if (r?.skippedAt != null && (!date(r.skippedAt) || r.completedAt)) throw Error('Invalid skipped quest history.');
    for (const [key, r] of Object.entries(s.records)) { if (!qids.has(key) || !obj(r) || (r.completedAt && !date(r.completedAt)) || (r.startedAt && !date(r.startedAt)) || (r.note != null && !str(r.note, 2000)) || (r.artifact != null && (!obj(r.artifact) || !str(r.artifact.label, 160) || !str(r.artifact.path, 2000) || !str(r.artifact.kind, 30)))) throw Error('Invalid quest history.'); }
    for (const [key, value] of Object.entries(s.tiny)) if (!qids.has(key) || !str(value, 500)) throw Error('Invalid small step.');
    for (const r of s.rewards) { unique(r.id); if (!str(r.name, 160) || !Number.isInteger(r.cost) || r.cost < 1 || r.cost > 10000) throw Error('Invalid reward.'); }
    for (const r of s.redemptions) { unique(r.id); if (!ident(r.rewardId) || !str(r.name, 160) || !Number.isInteger(r.cost) || r.cost < 1 || r.cost > 10000 || !date(r.at) || (r.returnedAt && !date(r.returnedAt))) throw Error('Invalid reward history.'); }
    if (s.active !== null && !s.campaigns.some(c => c.id === s.active)) throw Error('Invalid tracked campaign.');
    if (s.focus != null && (!obj(s.focus) || !qids.has(s.focus.quest) || !Number.isFinite(s.focus.end) || !Number.isFinite(s.focus.remaining) || s.focus.remaining < 0 || s.focus.remaining > 7200000)) throw Error('Invalid focus session.');
    if (balance(s) < 0) throw Error('Reward history exceeds earned sparks.');
    return clone(s);
  }
  return { paths, initial, clone, day, id, text, allQuests, find, record, done, skipped, next, campaignDone, sideCount, earned, xp, balance, level, skills, available, daily, trackSide, skip, dismiss, revisit, saveIdea, startIdea, recommend, choose, planQuest, gains, startSmall, complete, undo, addCampaign, redeem, stats, validate };
});
