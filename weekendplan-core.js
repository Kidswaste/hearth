// (round 66, weekendplan66) 🗓 Plan my weekend, the thinking with no DOM (node-tested: dev/weekendplan-test.js).
// From Thursday 17:00 to Sunday night the ✦ tracker offers one button; this file decides what the card proposes, from
// what Hearth already has (nothing fetched here):
//   · a night out   — this weekend's shows from showsync61's saved list (Fri first), else an open personal quest
//   · outside        — music at the park (the c-pq-park quest) on the better afternoon of Sat / Sun (a forecast when one
//                     reached Hearth, else Saturday), else an unvisited Paris place
//   · nearby         — an unvisited Paris place close to the park (or before the show), right after it
//   · studio session — an open music project, else the park loops waiting to be arranged, else one 8-bar idea
// Each slot has its options ranked; `choose(built, swaps)` is the plan (a slot's Swap = the next valid option), always
// the same for the same inputs: no clock, no randomness inside. `accept` turns kept slots into real quests through their
// owners' makers and weekquest62's week plan (s.weekly), each item with its time. XP still only follows proof + review.
(function (root, make) { if (typeof module === 'object' && module.exports) module.exports = make(require('./weekquest-core.js')); else root.WeekendPlanCore = make(null); })(typeof self !== 'undefined' ? self : this, (WQ) => {
  const W = () => WQ || (typeof WeekQuestCore !== 'undefined' ? WeekQuestCore : null); // the questhud group loads weekquest-core.js first
  const pad = (n) => String(n).padStart(2, '0');
  const hm = (t) => { const d = new Date(t); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
  const mins = (time) => { const [h, m] = String(time).split(':').map(Number); return h * 60 + m; };
  const ok = (x) => x && Number.isFinite(x.lat) && Number.isFinite(x.lon);
  const hash = (t) => { let h = 2166136261; for (const ch of String(t)) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); };
  const MUSIC = /\b(music|song|songs|track|tracks|beat|beats|ep|lp|album|mix|demo|serum|vital|synth|loop|loops|remix|bounce|sound|producer|jam)\b/i;

  // ---------- when the button shows: Thursday from 17:00 through Sunday ----------
  let clock = () => Date.now(); // checks set a Thursday-evening clock with setClock (the app's own clock otherwise)
  const now = () => clock(), setClock = (fn) => { clock = typeof fn === 'function' ? fn : () => Date.now(); };
  function inWindow(now) { const d = new Date(now), wd = d.getDay(); return wd === 5 || wd === 6 || wd === 0 || (wd === 4 && d.getHours() >= 17); }
  // The weekend in view: Fri / Sat / Sun of this week (Mon-based), the days still ahead from today
  function weekend(now) {
    const w = W(), today = w.key(new Date(now)), week = w.monday(today), days = [4, 5, 6].map((i) => w.addDays(week, i));
    const a = w.parse(days[0]), b = w.parse(days[2]), mo = (d) => d.toLocaleString('en', { month: 'short' });
    return { week, today, days: days.filter((d) => d >= today), all: days, from: today, label: a.getMonth() === b.getMonth() ? `Fri ${a.getDate()} – Sun ${b.getDate()} ${mo(b)}` : `Fri ${a.getDate()} ${mo(a)} – Sun ${b.getDate()} ${mo(b)}` };
  }
  const startOf = (w, day, time) => { const d = w.parse(day), [h, m] = time.split(':').map(Number); d.setHours(h, m, 0, 0); return d.getTime(); };

  // ---------- what can fill each slot ----------
  // inputs: C (QuestCore), s (journal), now, shows (showsync61 list), guide (QuestParis.guide), personal (QuestParis.personal),
  // weather ([{date, rain, tmax}] or null), parkAt ({lat, lon, name}: the park quest's pin), projects ([{id, name, status,
  // updated, notes, persona, open}]: kv 'projects'), takes (park takes [{sketch, loop, at}])
  function build({ C, s, now, shows = [], guide = [], personal = [], weather = null, parkAt = null, projects = [], takes = [] }) {
    const w = W(), wk = weekend(now), days = new Set(wk.days);
    const later = (day, time, lead = 20) => startOf(w, day, time) > now + lead * 60000; // a slot that starts in under 20 min is past
    const has = (cid) => s.campaigns.find((c) => c.id === cid) || null;
    const doneCamp = (cid) => { const c = has(cid); return Boolean(c && C.campaignDone(s, c)); };
    const WD = (d) => w.weekday(d);
    // night out: shows (Fri first, then by start; sold out last), then open personal quests in the evening
    const night = [];
    const nights = shows.filter((x) => x && !x.cancelled && Number.isFinite(x.start) && days.has(w.nightOf(x.start)) && x.start > now + 20 * 60000 && !doneCamp(`c-show-${x.key}`))
      .sort((a, b) => (Boolean(a.soldOut) - Boolean(b.soldOut)) || a.start - b.start || String(a.key).localeCompare(String(b.key)));
    for (const x of nights) {
      const who = x.lineup?.length ? x.lineup.slice(0, 2).join(' & ') : x.title, where = x.venue?.name || 'the venue', day = w.nightOf(x.start);
      night.push({ id: `show-${x.key}`, kind: 'show', title: `Go see ${who} at ${where}`.slice(0, 160), why: `${WD(day)} ${hm(x.start)} · ${where}${x.soldOut ? ' · sold out' : ''}${x.platforms?.length ? ` · ${x.platforms.join(' + ')}` : ''}`,
        day, time: hm(x.start), mins: 180, show: x, campaign: `c-show-${x.key}`, at: ok(x.venue) ? { lat: x.venue.lat, lon: x.venue.lon, name: where } : null });
    }
    for (const c of s.campaigns) {
      if (!/^c-pq-/.test(c.id) || c.id === 'c-pq-park' || c.paused || C.campaignDone(s, c)) continue; // only personal quests the owner already started
      const q = C.next(s, c); if (!q) continue;
      const day = wk.days.find((d) => later(d, '19:00')); if (!day) continue;
      night.push({ id: `pq-${c.id.slice(5)}`, kind: 'personal', title: c.title, why: `${WD(day)} evening · still open, next: ${q.title}`.slice(0, 300), day, time: '19:00', mins: 90, campaign: c.id, personal: c.id.slice(5), at: null });
    }
    // outside: the park on Sat / Sun afternoons (best weather first; no forecast → Saturday first), then unvisited places
    const outside = [];
    const park = has('c-pq-park'), parkDone = Boolean(park && C.campaignDone(s, park)), parkOpen = park ? !park.paused || parkDone : personal.some((t) => t.key === 'park');
    const fc = (d) => (Array.isArray(weather) ? weather.find((x) => x.date === d) : null);
    const parkDays = wk.days.filter((d) => ['Sat', 'Sun'].includes(WD(d)) && later(d, '15:00'));
    if (parkOpen || parkDone) {
      const scored = parkDays.map((d) => { const f = fc(d); return { d, f, score: f ? (w.goodDay(f) ? 0 : f.rain >= 60 ? 2 : 1) * 1000 + f.rain - f.tmax : WD(d) === 'Sat' ? 0 : 1 }; }).sort((a, b) => a.score - b.score || a.d.localeCompare(b.d));
      for (const { d, f } of scored) {
        const why = f ? `${WD(d)} ${w.goodDay(f) ? 'looks good' : f.rain >= 60 ? 'looks wet' : 'is so-so'}: ${Math.round(f.tmax)}°, ${Math.round(f.rain)}% rain` : `${WD(d)} afternoon · no forecast: check the sky before you go`;
        outside.push(parkDone
          ? { id: `jam-${d}`, kind: 'jam', title: `Another park jam${parkAt?.name ? ` at ${parkAt.name}` : ''}`.slice(0, 100), why: `${why} · Park mode in the Sound desk`, day: d, time: '15:00', mins: 120, at: ok(parkAt) ? parkAt : null }
          : { id: `park-${d}`, kind: 'park', title: 'Make music at the park', why: `${why} · Park mode in the Sound desk`, day: d, time: '15:00', mins: 120, campaign: 'c-pq-park', personal: 'park', at: ok(parkAt) ? parkAt : null });
      }
    }
    // the place pool (unvisited, not started): guide places and the owner's own pins
    const visited = new Set((s.atlas?.places || []).filter((p) => p.visitedAt).map((p) => p.id));
    const pid = (id) => String(id).replace(/^(pp|place)-/, '');
    const pool = guide.filter((g) => ok(g) && !visited.has(g.id) && !has(`c-pp-${pid(g.id)}`)).map((g) => ({ id: g.id, name: g.name, lat: g.lat, lon: g.lon, why: g.why, guide: true }));
    for (const p of s.atlas?.places || []) if (ok(p) && !p.visitedAt && !pool.some((g) => g.id === p.id || (p.guide && g.id === p.guide)) && !has(`c-world-outing-${p.id}`)) pool.push({ id: p.id, name: p.name, lat: p.lat, lon: p.lon, why: p.quest, guide: false });
    pool.sort((a, b) => a.id.localeCompare(b.id));
    for (const d of parkDays.length ? parkDays : wk.days.filter((x) => later(x, '15:00'))) {
      const i = pool.length ? parseInt(hash(`${wk.week}/${d}`), 36) % pool.length : -1; if (i < 0) break;
      const p = pool[i]; outside.push({ id: `place-${p.id}`, kind: 'place', title: `Visit ${p.name}`.slice(0, 160), why: `${WD(d)} afternoon · ${(p.why || 'a place on your map you haven’t been to yet').slice(0, 200)}`, day: d, time: '15:00', mins: 90, place: p.id, guide: p.guide, at: { lat: p.lat, lon: p.lon, name: p.name } });
    }
    // studio session sources (a day and time are given in choose(), away from the park afternoon)
    const studio = [];
    const music = projects.filter((p) => p && p.id && (p.status || 'active') === 'active' && (p.persona === 'producer' || MUSIC.test(`${p.name} ${p.notes || ''}`)))
      .sort((a, b) => (Boolean(b.open) - Boolean(a.open)) || (b.updated || 0) - (a.updated || 0) || String(a.id).localeCompare(String(b.id)));
    for (const p of music.slice(0, 3)) studio.push({ id: `studio-${hash(p.id)}`, kind: 'studio', title: `Studio session: ${p.name}`.slice(0, 100), why: `${p.open ? 'The project you have open' : 'Your open music project'}${p.updated ? ` · last touched ${ago(now, p.updated)}` : ''}`, mins: 120, project: { id: p.id, name: String(p.name).slice(0, 48) } });
    const sketches = new Map(); for (const t of takes) if (t?.sketch) sketches.set(t.sketch, (sketches.get(t.sketch) || 0) + 1);
    const [sk, n] = [...sketches.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0] || [];
    if (sk) studio.push({ id: `studio-loops-${hash(sk)}`, kind: 'studio', title: 'Studio session: turn your park loops into a song', why: `${n} loop${n === 1 ? '' : 's'} waiting in ${String(sk).slice(0, 60)} · Arrange loops in the Sound desk`, mins: 120, loops: { sketch: String(sk).slice(0, 120), count: n } });
    studio.push({ id: 'studio-idea', kind: 'studio', title: 'Studio session: one 8-bar idea', why: 'Serum 2 or Vital, one preset, eight bars: small enough to finish', mins: 90 });
    return { weekend: wk, night, outside, pool, studio };
  }
  const ago = (now, t) => { const d = Math.max(0, Math.round((now - t) / 86400e3)); return d === 0 ? 'today' : d === 1 ? 'yesterday' : `${d} days ago`; };

  // ---------- the plan: one option per slot, Swap = the next valid one ----------
  const SLOTS = [
    { id: 'night', label: 'Night out', icon: '♫' },
    { id: 'outside', label: 'Outside', icon: '☀' },
    { id: 'nearby', label: 'Nearby', icon: '📍' },
    { id: 'studio', label: 'Studio session', icon: '🎛' },
  ];
  const clash = (a, b) => a.day === b.day && mins(a.time) < mins(b.time) + b.mins && mins(b.time) < mins(a.time) + a.mins;
  // swaps: { slotId: n } (how many times Swap was clicked). now: only to drop studio times already past.
  function choose(built, swaps = {}, now = 0) {
    const w = W(), wk = built.weekend, picked = [], out = [];
    const usable = (o) => !picked.some((p) => p.id === o.id || (p.place && p.place === o.place) || (p.campaign && p.campaign === o.campaign) || clash(p, o));
    const pick = (slot, list) => {
      const valid = list.filter(usable), n = valid.length, i = n ? (swaps[slot.id] || 0) % n : 0, o = n ? valid[i] : null;
      if (o) picked.push(o);
      out.push({ ...slot, option: o, index: i, count: n });
      return o;
    };
    pick(SLOTS[0], built.night);
    const outside = pick(SLOTS[1], built.outside);
    // nearby: unvisited places closest to the afternoon spot (right after it), else before the night's show
    const anchor = outside?.at ? { ...outside.at, day: outside.day, end: mins(outside.time) + outside.mins, after: true } : picked[0]?.at ? { ...picked[0].at, day: picked[0].day, end: mins(picked[0].time) - 120, after: false } : null;
    const near = [];
    if (anchor && anchor.end >= 9 * 60) {
      const time = `${pad(Math.floor(anchor.end / 60))}:${pad(anchor.end % 60)}`;
      const ranked = built.pool.map((p) => ({ p, d: w.km(anchor, p) })).filter((x) => x.d >= 0.15).sort((a, b) => a.d - b.d || a.p.id.localeCompare(b.p.id)).slice(0, 6);
      for (const { p, d } of ranked) if (startOf(w, anchor.day, time) > now) near.push({ id: `place-${p.id}`, kind: 'place', title: `Visit ${p.name}`.slice(0, 160), why: `${w.say(d)} from ${anchor.name}${anchor.after ? ' · right after' : ' · before the show'}`, day: anchor.day, time, mins: 90, place: p.id, guide: p.guide, at: { lat: p.lat, lon: p.lon, name: p.name } });
    }
    pick(SLOTS[2], near);
    // studio: Sunday unless the afternoon outside is Sunday; 14:00, else 11:00 or 18:00 when that clashes or has passed
    const order = [...wk.days].sort((a, b) => (a === outside?.day) - (b === outside?.day) || b.localeCompare(a));
    const studio = [];
    for (const src of built.studio) for (const day of order) for (const time of ['14:00', '11:00', '18:00']) { const o = { ...src, day, time }; if (startOf(w, day, time) > now + 20 * 60000 && !picked.some((p) => clash(p, o))) { studio.push(o); break; } }
    const firstDay = {}; // one studio option per source: its best day
    pick(SLOTS[3], studio.filter((o) => (firstDay[o.id] ? false : (firstDay[o.id] = true))));
    return out;
  }

  // ---------- accepting: kept slots → real quests on the week plan, with their time ----------
  // makers: { show, place, personal } as weekquest62 passes them (ShowSyncCore.showCampaign, QuestParis.startPlace /
  // QuestCore.placeQuest, QuestParis.startPersonal). Runs on a draft inside QuestHud.write. Returns the plan items.
  const STEPS = {
    project: (name) => [`Open “${name}” and play the last version once, start to end`, 'Change one thing you can hear: eight bars, one sound or one transition', 'Bounce a rough and write one line for next time'],
    loops: () => ['Open Arrange loops in the Sound desk and drop in your park takes', 'Lay out a start, a middle and an ending', 'Export a rough mix'],
    idea: () => ['Open Serum 2 or Vital and pick one preset you like', 'Make an eight-bar idea from it', 'Save it with a name and today’s date'],
  };
  function accept(C, s, week, picks, makers = {}) {
    const w = W(), active = s.active, items = [];
    const plan = w.plan(s, week);
    for (const o of picks) {
      const id = `wk-wp-${String(o.id).toLowerCase().replace(/[^a-z0-9-]/g, '-')}`.slice(0, 80);
      let sug = { ...o, id: `wp-${o.id}` };
      const old = plan.items.find((x) => x.id === id);
      if (old) { sug = { ...sug, kind: old.kind, campaign: old.campaign, quest: old.quest }; } // already planned: only its day / time move
      else if (o.kind === 'studio' || o.kind === 'jam') {
        const lines = o.kind === 'jam' ? ['Open the Sound desk in Park mode and pack headphones', 'Record one loop outside', 'Keep the take as your proof'] : o.project ? STEPS.project(o.project.name) : o.loops ? STEPS.loops() : STEPS.idea();
        const c = C.addCampaign(s, { title: o.title.slice(0, 100), why: `${o.kind === 'jam' ? 'A weekend park jam' : 'A weekend studio session'}, from 🗓 Plan my weekend. ${o.why || ''}`.slice(0, 600), path: 'music', milestones: lines });
        if (o.project) c.projectId = o.project.id; // (weekendplan66) which project the session is for
        sug = { ...sug, kind: o.kind, campaign: c.id };
      }
      const it = w.accept(C, s, week, sug, o.day, makers);
      it.time = o.time; it.weekend = true; it.why = `${o.time} · ${String(o.why || '').replace(/^\d\d:\d\d · /, '')}`.slice(0, 300);
      const c = it.campaign && s.campaigns.find((x) => x.id === it.campaign); if (c?.paused) c.paused = false;
      items.push(it);
    }
    s.active = s.campaigns.some((c) => c.id === active) ? active : s.active; // the main quest the owner tracks stays
    plan.items.sort((a, b) => a.day.localeCompare(b.day) || String(a.time || '').localeCompare(String(b.time || '')));
    w.checkWeekly(s.weekly);
    return items;
  }
  // what of this weekend is already on the week plan (to mark slots "planned")
  function planned(s, built) { const p = W().planOf(s, built.weekend.week); return new Set((p?.items || []).filter((it) => it.weekend).map((it) => it.id)); }
  const itemId = (o) => `wk-wp-${String(o.id).toLowerCase().replace(/[^a-z0-9-]/g, '-')}`.slice(0, 80);
  // one line per slot (the chat and the check)
  const line = (sl) => (sl.option ? `${W().weekday(sl.option.day)} ${sl.option.time} · ${sl.option.title}` : `${sl.label}: nothing to propose`);

  return { now, setClock, inWindow, weekend, build, choose, accept, planned, itemId, line, SLOTS, MUSIC, clash };
});
