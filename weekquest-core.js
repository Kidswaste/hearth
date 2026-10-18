// (round 62, weekquest62) A weekly quest rhythm, the thinking with no DOM: which 3–5 quests to propose for a week (this
// week's shows from showsync61's cached list, Paris places not yet visited near where the owner will be, personal quests
// still open, a park-music session on a dry day when a forecast reached us), the week plan (each quest on a day), the one
// gentle nudge's next time, and the week in review (what got done, XP, the streak of weeks with a real-life quest, the
// moments / proofs collected, a one-line reflection prompt).
// One store: Codex's quest journal. The plan, the nudge setting and the review pages live in `s.weekly` (an extra field
// QuestCore.validate keeps as it is; checked here by checkWeekly before every save). Quests themselves are ordinary
// campaigns made by their owners' own makers (ShowSyncCore.showCampaign, QuestParis.startPlace / startPersonal,
// QuestCore.placeQuest), so XP still only follows proof + review. Node-testable: dev/weekquest-test.js.
(function (root, make) { if (typeof module === 'object' && module.exports) module.exports = make(); else root.WeekQuestCore = make(); })(typeof self !== 'undefined' ? self : this, () => {
  const DAY = 86400e3;
  const pad = (n) => String(n).padStart(2, '0');
  const key = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; // local date, like QuestCore.day
  const parse = (k) => { const [y, m, d] = String(k).split('-').map(Number); return new Date(y, m - 1, d); };
  const addDays = (k, n) => { const d = parse(k); d.setDate(d.getDate() + n); return key(d); };
  const monday = (k) => { const d = parse(k); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return key(d); };
  const days = (week) => [0, 1, 2, 3, 4, 5, 6].map((i) => addDays(week, i));
  const WD = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const weekday = (k) => WD[(parse(k).getDay() + 6) % 7];
  const nightOf = (t) => key(new Date(new Date(t).getHours() < 6 ? t - 6 * 3600e3 : t)); // a 2 am start is the night before (showsync61's rule)
  const hm = (t) => { const d = new Date(t); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
  // The week a plan is for: on Sunday, the coming week; otherwise the rest of this week. The days before `from` are past.
  function planWeek(now = Date.now()) {
    const today = key(new Date(now)), sunday = new Date(now).getDay() === 0;
    const week = sunday ? addDays(today, 1) : monday(today);
    return { week, days: days(week), from: sunday ? week : today, today };
  }
  // The week a review is for: this week (Mon–Sun with today); `last` = the week before.
  const reviewWeek = (now = Date.now(), last = false) => addDays(monday(key(new Date(now))), last ? -7 : 0);
  const label = (week) => { const a = parse(week), b = parse(addDays(week, 6)); const m = (d) => d.toLocaleString('en', { month: 'short' }); return a.getMonth() === b.getMonth() ? `${a.getDate()}–${b.getDate()} ${m(b)}` : `${a.getDate()} ${m(a)} – ${b.getDate()} ${m(b)}`; };

  // ---------- what counts as a real-life quest (out in the world, not at the desk) ----------
  const LIFE_IDS = /^c-(show|pp|pq|world-outing)-/;
  function lifeCampaign(c) { return Boolean(c && (c.path === 'life' || LIFE_IDS.test(c.id) || c.mapPlace || c.parisPlace)); }
  function isLife(s, q) { const c = q?.campaign ? s.campaigns.find((x) => x.id === q.campaign) : null; return c ? lifeCampaign(c) : q?.path === 'life'; }

  // ---------- the store inside the journal ----------
  const NUDGE = { on: false, time: '18:00', last: '' }; // off until the owner turns it on in the card
  function weekly(s) {
    if (!s.weekly || typeof s.weekly !== 'object') s.weekly = { v: 1, plans: [], reviews: [], nudge: { ...NUDGE } };
    s.weekly.plans ||= []; s.weekly.reviews ||= []; s.weekly.nudge = { ...NUDGE, ...(s.weekly.nudge || {}) };
    return s.weekly;
  }
  const read = (s) => s?.weekly || { v: 1, plans: [], reviews: [], nudge: { ...NUDGE } }; // never writes
  const planOf = (s, week) => read(s).plans.find((p) => p.week === week) || null;
  function plan(s, week) {
    const w = weekly(s); let p = w.plans.find((x) => x.week === week);
    if (!p) { p = { week, at: new Date().toISOString(), items: [] }; w.plans.push(p); w.plans.sort((a, b) => a.week.localeCompare(b.week)); while (w.plans.length > 12) w.plans.shift(); }
    return p;
  }
  const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
  const quietOk = (t) => TIME.test(t) && t >= '07:00' && t <= '22:00'; // never a nudge at night, whatever the OS's own quiet hours say
  // The shape of s.weekly (QuestCore.validate doesn't know it): throws on anything off, before a save
  function checkWeekly(w) {
    if (w == null) return w;
    const obj = (x) => x && typeof x === 'object' && !Array.isArray(x), str = (x, n) => typeof x === 'string' && x.length <= n, dk = (x) => typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x);
    if (!obj(w) || w.v !== 1 || !Array.isArray(w.plans) || w.plans.length > 12 || !Array.isArray(w.reviews) || w.reviews.length > 104 || !obj(w.nudge)) throw Error('Invalid week plan.');
    if (typeof w.nudge.on !== 'boolean' || !quietOk(w.nudge.time) || !(w.nudge.last === '' || dk(w.nudge.last))) throw Error('Invalid nudge setting.');
    for (const p of w.plans) {
      if (!obj(p) || !dk(p.week) || !Array.isArray(p.items) || p.items.length > 7) throw Error('Invalid week plan.');
      const ids = new Set();
      for (const it of p.items) if (!obj(it) || !str(it.id, 80) || ids.has(it.id) || !ids.add(it.id) || !dk(it.day) || !str(it.title, 160) || !str(it.kind, 20) || !(it.quest == null || str(it.quest, 100)) || !(it.campaign == null || str(it.campaign, 100)) || (!it.quest && !it.campaign) || !str(it.why || '', 300)) throw Error('Invalid planned quest.');
    }
    for (const r of w.reviews) if (!obj(r) || !dk(r.week) || !Array.isArray(r.done) || r.done.length > 60 || !Array.isArray(r.moments) || r.moments.length > 12 || !Number.isFinite(r.xp) || !Number.isInteger(r.streak) || !str(r.prompt, 200) || !str(r.reflection || '', 300)) throw Error('Invalid week page.');
    return w;
  }

  // ---------- resolving a planned item to the quest to do now ----------
  // A campaign item follows its campaign's next step (the ticket before the night, the "go" on the night); a quest item is that quest
  function questOf(C, s, it) {
    if (it.campaign) { const c = s.campaigns.find((x) => x.id === it.campaign); return c && !c.paused ? C.next(s, c) : null; }
    const q = C.find(s, it.quest); return q && !C.done(s, q.id) && !C.skipped(s, q.id) && C.available(s, q.id) ? q : null;
  }
  const finished = (C, s, it) => (it.campaign ? Boolean(s.campaigns.find((x) => x.id === it.campaign) && C.campaignDone(s, s.campaigns.find((x) => x.id === it.campaign))) : C.done(s, it.quest));
  // Today's planned quests that are still open (the chip follows the first)
  function todays(C, s, date) {
    const out = [];
    for (const p of read(s).plans) for (const it of p.items) if (it.day === date) { const q = questOf(C, s, it); if (q) out.push({ item: it, quest: q }); }
    return out;
  }

  // ---------- proposing 3–5 quests for a week ----------
  const km = (a, b) => { const R = 6371, r = Math.PI / 180, dLat = (b.lat - a.lat) * r, dLon = (b.lon - a.lon) * r; const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLon / 2) ** 2; return 2 * R * Math.asin(Math.min(1, Math.sqrt(h))); };
  const say = (k) => (k < 1 ? `${Math.max(100, Math.round(k * 10) * 100)} m` : `${k.toFixed(1)} km`);
  const hash = (t) => { let h = 2166136261; for (const ch of String(t)) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); };
  const ok = (x) => x && Number.isFinite(x.lat) && Number.isFinite(x.lon);
  // A good day for music outdoors: little rain and mild enough to sit on a bench
  const goodDay = (w) => w && Number.isFinite(w.rain) && Number.isFinite(w.tmax) && w.rain < 35 && w.tmax >= 13;
  // inputs: C (QuestCore), s (the journal), shows (showsync61's list), guide (QuestParis.guide), personal (QuestParis.personal),
  // weather ([{ date, rain %, tmax °C }] or null when no forecast reached us), anchor ({ lat, lon, name } or null), week (planWeek())
  function candidates({ C, s, shows = [], guide = [], personal = [], weather = null, anchor = null, week }) {
    const open = new Set(week.days.filter((d) => d >= week.from)), out = [];
    const has = (cid) => s.campaigns.find((c) => c.id === cid) || null;
    const doneCamp = (cid) => { const c = has(cid); return Boolean(c && C.campaignDone(s, c)); };
    // 1. this week's shows (showsync61), the nights still ahead; a show already finished as a quest is skipped
    const nights = shows.filter((x) => x && !x.cancelled && Number.isFinite(x.start) && open.has(nightOf(x.start)) && !doneCamp(`c-show-${x.key}`)).sort((a, b) => a.start - b.start);
    for (const x of nights) {
      const who = x.lineup?.length ? x.lineup.slice(0, 2).join(' & ') : x.title, where = x.venue?.name || 'the venue';
      out.push({ id: `show-${x.key}`, kind: 'show', title: `Go see ${who} at ${where}`.slice(0, 160), why: `${weekday(nightOf(x.start))} ${hm(x.start)}${x.soldOut ? ' · sold out' : ''}${x.platforms?.length ? ` · ${x.platforms.join(' + ')}` : ''}`,
        day: nightOf(x.start), fixed: true, show: x, campaign: `c-show-${x.key}`, at: ok(x.venue) ? { lat: x.venue.lat, lon: x.venue.lon, name: where } : null, rank: 10 });
    }
    // 2. personal quests still open (AirPods, the drink offer…) and other real-life campaigns already started
    for (const c of s.campaigns) {
      if (c.paused || C.campaignDone(s, c) || !lifeCampaign(c) || /^c-show-/.test(c.id)) continue;
      const q = C.next(s, c); if (!q) continue;
      const started = c.quests.some((x) => C.done(s, x.id) || C.record(s, x.id).startedAt);
      if (/^c-pq-/.test(c.id) && c.id !== 'c-pq-park') out.push({ id: `pq-${c.id.slice(5)}`, kind: 'personal', title: c.title, why: `Still open · next: ${q.title}`.slice(0, 300), campaign: c.id, rank: started ? 8 : 7 });
      else if (!/^c-pq-/.test(c.id) && started) out.push({ id: `camp-${hash(c.id)}`, kind: 'quest', title: c.title, why: `Halfway there · next: ${q.title}`.slice(0, 300), campaign: c.id, rank: 5 });
    }
    // 3. Paris places not yet visited, nearest to where the owner will be (a planned show's venue first, else their spot)
    const anchors = out.filter((x) => x.at).map((x) => ({ ...x.at, day: x.day, show: x.title }));
    if (ok(anchor)) anchors.push({ ...anchor, day: null });
    const visited = new Set((s.atlas?.places || []).filter((p) => p.visitedAt).map((p) => p.id));
    const pool = guide.filter((g) => ok(g) && !visited.has(g.id) && !doneCamp(`c-pp-${g.id.replace(/^(pp|place)-/, '')}`) && !has(`c-pp-${g.id.replace(/^(pp|place)-/, '')}`)).map((g) => ({ id: g.id, name: g.name, lat: g.lat, lon: g.lon, why: g.why, best: g.best, guide: true }));
    for (const p of s.atlas?.places || []) if (!p.visitedAt && !pool.some((g) => g.id === p.id) && !guide.some((g) => g.id === p.id) && !has(`c-world-outing-${p.id}`) && ok(p)) pool.push({ id: p.id, name: p.name, lat: p.lat, lon: p.lon, why: p.quest, guide: false });
    const placed = [];
    if (anchors.length) {
      for (const p of pool) {
        if (anchors.some((a) => a.show && km(a, p) < 0.15)) continue; // the venue itself is already the night's quest
        let best = null; for (const a of anchors) { const d = km(a, p); if (!best || d < best.d) best = { d, a }; } if (best.d <= 3) placed.push({ p, ...best });
      }
      placed.sort((a, b) => a.d - b.d);
    } else if (pool.length) { const i = parseInt(hash(week.week), 36) % pool.length; placed.push({ p: pool[i], d: null, a: null }); }
    const seenDay = new Set();
    for (const { p, d, a } of placed) {
      if (a?.day && seenDay.has(a.day)) continue; if (a?.day) seenDay.add(a.day);
      out.push({ id: `place-${p.id}`, kind: 'place', title: `Visit ${p.name}`.slice(0, 160), place: p.id, guide: p.guide,
        why: (a?.show ? `${say(d)} from ${a.name}: before the show` : a ? `${say(d)} from ${a.name}` : p.why || 'A place on your map you haven’t been to yet').slice(0, 300),
        day: a?.day || null, rank: a?.day ? 6 : 4 });
      if (out.filter((x) => x.kind === 'place').length >= 2) break;
    }
    // 4. music at the park on a good day (a forecast only when one reached us; otherwise a weekend afternoon, sky unknown)
    const park = has('c-pq-park');
    const parkOpen = park ? !park.paused && !C.campaignDone(s, park) : personal.some((t) => t.key === 'park');
    if (parkOpen) {
      let day = null, why = '';
      if (Array.isArray(weather) && weather.length) {
        const good = weather.filter((w) => open.has(w.date) && goodDay(w)).sort((a, b) => (a.rain - b.rain) || (b.tmax - a.tmax));
        const weekend = good.find((w) => [5, 6].includes(WD.indexOf(weekday(w.date))));
        const pick = weekend && weekend.rain <= good[0].rain + 10 ? weekend : good[0];
        if (pick) { day = pick.date; why = `${weekday(pick.date)} looks good: ${Math.round(pick.tmax)}°, ${Math.round(pick.rain)}% rain`; }
      } else {
        day = [...open].filter((d) => ['Sat', 'Sun'].includes(weekday(d)))[0] || [...open].at(-1) || null;
        why = 'No forecast reached Hearth: pick a dry afternoon';
      }
      if (day) out.push({ id: 'park', kind: 'park', title: 'Make music at the park', why, day, fixed: Boolean(weather?.length), campaign: 'c-pq-park', personal: 'park', rank: 7 });
    }
    return out;
  }
  // Pick 3–5 (shows first, then the park, personal, places; at most two of a kind), leave out what's already planned,
  // and give each a day: its own (a show's night, a place near that night's venue, a good-weather day) or the least busy
  function propose(list, week, planned = [], max = 5) {
    const taken = new Set(planned.flatMap((it) => [it.id, it.campaign, it.quest].filter(Boolean)));
    const fresh = list.filter((x) => !taken.has(x.id) && !(x.campaign && taken.has(x.campaign)));
    const kinds = {}, pick = [];
    for (const x of [...fresh].sort((a, b) => b.rank - a.rank)) { if ((kinds[x.kind] || 0) >= 2 || pick.length >= max) continue; kinds[x.kind] = (kinds[x.kind] || 0) + 1; pick.push({ ...x }); }
    const open = week.days.filter((d) => d >= week.from), load = Object.fromEntries(open.map((d) => [d, 0]));
    for (const it of planned) if (it.day in load) load[it.day]++;
    for (const x of pick) if (x.day && x.day in load) load[x.day]++;
    for (const x of pick) if (!x.day || !(x.day in load)) { const d = open.reduce((b, d) => (load[d] < load[b] ? d : b), open[0]); x.day = d || null; if (d) load[d]++; }
    return pick.filter((x) => x.day).sort((a, b) => a.day.localeCompare(b.day) || b.rank - a.rank);
  }

  // ---------- changing the plan (on a draft of the journal, inside QuestJournal.mutate or the tracker's own save) ----------
  // makers: { show(showObj) → campaign, place(s, pid, guide) → campaign, personal(s, key) → campaign }: the quest's owners'
  // own functions. Starting a quest from the plan never changes the owner's tracked main quest.
  function accept(C, s, week, sug, day, makers = {}) {
    const p = plan(s, week);
    if (!week || !days(week).includes(day)) throw Error('Choose a day of that week.');
    if (p.items.length >= 7) throw Error('A week holds up to seven planned quests.');
    const active = s.active;
    let cid = sug.campaign || null, qid = sug.quest || null;
    if (sug.kind === 'show') {
      if (!s.campaigns.some((c) => c.id === cid)) { if (s.campaigns.length >= 100) throw Error('The journal holds up to 100 campaigns. Finish or remove one first.'); s.campaigns.push(makers.show(sug.show)); }
      const c = s.campaigns.find((x) => x.id === cid); c.paused = false;
    } else if (sug.kind === 'place') cid = makers.place(s, sug.place, sug.guide).id;
    else if (sug.kind === 'park' || (sug.kind === 'personal' && !s.campaigns.some((c) => c.id === cid))) cid = makers.personal(s, sug.personal || cid.replace(/^c-pq-/, '')).id;
    else if (sug.kind === 'walk') cid = makers.walk(s, sug).id; // (round 63, questwalk63) a walk on a free afternoon: QuestWalkCore.save
    else if (sug.kind === 'idea') cid = C.addCampaign(s, { title: sug.title, why: sug.why || 'An idea for this week, from "suggest more".', path: 'life', milestones: [sug.title] }).id; // an AI idea: a one-step campaign of the owner's own
    s.active = s.campaigns.some((c) => c.id === active) ? active : s.active; // keep the main quest the owner tracks
    const id = `wk-${String(sug.id).toLowerCase().replace(/[^a-z0-9-]/g, '-')}`.slice(0, 80);
    const old = p.items.find((x) => x.id === id);
    if (old) { old.day = day; return old; }
    const it = { id, kind: sug.kind, title: String(sug.title).slice(0, 160), why: String(sug.why || '').slice(0, 300), day, quest: cid ? null : qid, campaign: cid };
    p.items.push(it); p.items.sort((a, b) => a.day.localeCompare(b.day));
    return it;
  }
  function move(s, week, id, day) { const p = plan(s, week), it = p.items.find((x) => x.id === id); if (!it) throw Error('That quest is no longer in the plan.'); if (!days(week).includes(day)) throw Error('Choose a day of that week.'); it.day = day; p.items.sort((a, b) => a.day.localeCompare(b.day)); return it; }
  function drop(s, week, id) { const p = plan(s, week), n = p.items.length; p.items = p.items.filter((x) => x.id !== id); return n !== p.items.length; }
  function setNudge(s, o = {}) { const n = weekly(s).nudge; if ('on' in o) n.on = Boolean(o.on); if ('time' in o) { if (!quietOk(o.time)) throw Error('Pick a time between 07:00 and 22:00.'); n.time = o.time; } if ('last' in o) n.last = o.last; return { ...n }; }

  // ---------- the one gentle nudge ----------
  // The next nudge: on a planned day with an open quest, at the chosen time, never twice the same day; null when off.
  // Hearth opening up to 2 h after the time (asleep, closed) still gets that day's nudge once ({ late: true }).
  const at = (k, time) => { const d = parse(k), [h, m] = time.split(':').map(Number); d.setHours(h, m, 0, 0); return d.getTime(); };
  function nextNudge(C, s, now = Date.now()) {
    const n = read(s).nudge; if (!n?.on || !quietOk(n.time)) return null;
    const today = key(new Date(now));
    for (let i = 0; i < 8; i++) {
      const d = addDays(today, i); if (d === n.last) continue;
      const list = todays(C, s, d); if (!list.length) continue;
      const t = at(d, n.time);
      if (t > now) return { at: t, day: d, quest: list[0].quest.id, title: list[0].quest.title, item: list[0].item.title };
      if (i === 0 && now - t < 2 * 3600e3) return { at: now, day: d, quest: list[0].quest.id, title: list[0].quest.title, item: list[0].item.title, late: true };
    }
    return null;
  }

  // ---------- the week in review ----------
  const PROMPTS = ['What surprised you this week?', 'Which moment would you go back to?', 'What made going out easier this time?', 'Who or what made you smile out there?',
    'What’s one thing you’d do again next week?', 'What did you notice that you’d have missed at home?', 'What felt brave, even a little?', 'What would make next week lighter?'];
  const promptFor = (week) => PROMPTS[Math.round(parse(week).getTime() / (7 * DAY)) % PROMPTS.length];
  const inWeek = (iso, week) => { if (!iso) return false; const t = Date.parse(iso); return t >= parse(week).getTime() && t < parse(addDays(week, 7)).getTime(); };
  function streak(C, s, week) {
    const weeks = new Set(C.allQuests(s).filter((q) => C.done(s, q.id) && isLife(s, q)).map((q) => monday(key(new Date(C.record(s, q.id).completedAt)))));
    let n = 0, w = week; while (weeks.has(w)) { n++; w = addDays(w, -7); }
    let before = 0; w = addDays(week, -7); while (weeks.has(w)) { before++; w = addDays(w, -7); }
    return { n, before };
  }
  function review(C, s, week) {
    const all = C.allQuests(s), done = [], titles = new Map(all.map((q) => [q.id, q.title]));
    let xp = 0;
    for (const q of all) {
      const r = C.record(s, q.id);
      if (r.completedAt && inWeek(r.completedAt, week)) { done.push({ id: q.id, title: String(q.title).slice(0, 250), path: q.path, at: r.completedAt, xp: q.xp, life: isLife(s, q) }); xp += r.startedAt && !inWeek(r.startedAt, week) ? q.xp - 5 : q.xp; } // its 5 XP start may have been earned an earlier week
      else if (r.startedAt && inWeek(r.startedAt, week)) xp += 5;
    }
    done.sort((a, b) => a.at.localeCompare(b.at));
    const moments = [];
    for (const [qid, list] of Object.entries(s.submissions || {})) for (const sub of list) if (inWeek(sub.at, week)) moments.push({ quest: qid, title: String(titles.get(qid) || 'A quest').slice(0, 160), what: String(sub.proof?.title || 'Proof').slice(0, 160), type: sub.proof?.type || 'file', images: (sub.proof?.images || []).slice(0, 2), path: sub.proof?.path || '', note: String(sub.proof?.excerpt || sub.intent || '').replace(/\s+/g, ' ').slice(0, 160), at: sub.at });
    for (const q of done) { const a = C.record(s, q.id).artifact; if (a?.path && !moments.some((m) => m.path === a.path)) moments.push({ quest: q.id, title: q.title.slice(0, 160), what: String(a.label).slice(0, 160), type: 'file', images: /\.(png|jpe?g|webp|gif)$/i.test(a.path) ? [a.path] : [], path: a.path, note: String(C.record(s, q.id).note || '').slice(0, 160), at: q.at }); }
    for (const c of s.collection || []) if (inWeek(c.at, week)) moments.push({ quest: null, title: String(c.title).slice(0, 160), what: 'On your shelf', type: c.proof?.type || 'file', images: (c.proof?.images || []).slice(0, 2), path: c.proof?.path || '', note: String(c.proof?.excerpt || '').replace(/\s+/g, ' ').slice(0, 160), at: c.at });
    moments.sort((a, b) => a.at.localeCompare(b.at));
    const p = planOf(s, week), st = streak(C, s, week);
    // a planned quest counts as done when its campaign finished, or one of its steps was finished that week
    const stepDone = (it) => { const c = it.campaign && s.campaigns.find((x) => x.id === it.campaign); return Boolean(c && c.quests.some((q) => inWeek(C.record(s, q.id).completedAt, week))); };
    const planned = p ? p.items.map((it) => ({ title: it.title, day: it.day, done: finished(C, s, it) || stepDone(it) })) : [];
    return { week, label: label(week), done: done.slice(0, 60), xp, life: done.filter((d) => d.life).length, streak: st.n, before: st.before, moments: moments.slice(0, 12), planned, prompt: promptFor(week), saved: read(s).reviews.find((r) => r.week === week) || null };
  }
  // Save the review as a page of the journal (one per week; saving again replaces it, the reflection kept unless given)
  function saveReview(s, rv, reflection) {
    const w = weekly(s), old = w.reviews.find((r) => r.week === rv.week);
    const page = { week: rv.week, at: new Date().toISOString(), done: rv.done.map(({ id, title, path, at, xp, life }) => ({ id, title, path, at, xp, life })), xp: rv.xp, streak: rv.streak, moments: rv.moments.map(({ quest, title, what, type, images, path, note, at }) => ({ quest, title, what, type, images, path, note, at })), planned: rv.planned.slice(0, 7), prompt: rv.prompt, reflection: String(reflection ?? old?.reflection ?? '').trim().slice(0, 300) };
    if (old) Object.assign(old, page); else { w.reviews.push(page); w.reviews.sort((a, b) => a.week.localeCompare(b.week)); while (w.reviews.length > 104) w.reviews.shift(); }
    return page;
  }
  // One line for the chat
  function reviewLine(rv) {
    return `Week of ${rv.label}: ${rv.done.length ? `${rv.done.length} quest${rv.done.length === 1 ? '' : 's'} done` : 'no quest finished yet'} · +${rv.xp} XP · ${rv.streak ? `${rv.streak}-week streak out in the world` : rv.before ? `your ${rv.before}-week streak waits for one real-life quest` : 'no real-life streak yet'}${rv.moments.length ? ` · ${rv.moments.length} moment${rv.moments.length === 1 ? '' : 's'} kept` : ''}`;
  }

  // ---------- "suggest more" (only when the owner asks): a tiny prompt and a forgiving reader ----------
  function askPrompt(week, have, places = []) {
    return `Suggest 3 small real-life quests in Paris for the week of ${label(week)} for a music producer who goes to shows. Already planned: ${have.map((x) => x.title).join('; ') || 'nothing'}.${places.length ? ` Places on their map: ${places.slice(0, 8).join(', ')}.` : ''} Kind, doable in under 2 hours, no pickup lines. Reply with exactly 3 lines: Title — one short reason.`;
  }
  function parseAsk(text) {
    return String(text || '').split('\n').map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').trim()).filter((l) => l.length > 3).slice(0, 3).map((l, i) => {
      const [t, why = ''] = l.split(/\s+[—–-]\s+/); return { id: `ai-${hash(t)}`, kind: 'idea', title: t.replace(/\*\*/g, '').slice(0, 120), why: why.slice(0, 200), rank: 3 - i * 0.1 };
    });
  }

  return { DAY, key, parse, addDays, monday, days, weekday, nightOf, planWeek, reviewWeek, label, lifeCampaign, isLife, weekly, read, planOf, plan, checkWeekly, quietOk, questOf, todays, candidates, propose, accept, move, drop, setNudge, nextNudge, PROMPTS, promptFor, streak, review, saveReview, reviewLine, askPrompt, parseAsk, km, say, goodDay };
});
