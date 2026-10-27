// (round 71, studiohours71) 🎛 Studio hours: the thinking with no DOM (node-tested by dev/studiohours71-test.js).
// The music time of bouncelog66's Sessions (kv 'music-sessions', logged or not, plus the live session) summed up the
// way the owner lives it: weeks Monday → Sunday in PARIS time (whatever the computer's clock says), days that are 23 or
// 25 hours long on the DST Sundays, and a session that runs past midnight split between its days (and weeks) in
// proportion to the clock time on each side (a row keeps its active minutes, not when inside it they were played).
//   · summary(rows, now, { goal, live, loops }) → this week (7 days), the last 8 weeks, longest session, most-used
//     instrument (Serum 2 vs Vital), sketches saved, loops trimmed, park sessions, the soft goal ring
//   · the goal is optional (off by default). A missed week is never named: the next week only says "New week, fresh start".
//   · sundayNote(rows, now): Sunday from 18:00 Paris, "You made music 3 times this week 🎛", never when there were none.
(function (root, make) { if (typeof module === 'object' && module.exports) module.exports = make(); else root.StudioHoursCore = make(); })(typeof self !== 'undefined' ? self : globalThis, () => {
  const MIN = 60000, DAY = 86400000, TZ = 'Europe/Paris', WEEKS = 8, NOTE_HOUR = 18;
  const GOALS = [0, 120, 180, 240, 360]; // the goal chips, in minutes (0 = off)

  // ---------- Paris time, on any computer clock ----------
  let fmt = null;
  function parts(ms) {
    fmt = fmt || new Intl.DateTimeFormat('en-GB', { timeZone: TZ, year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric', hourCycle: 'h23' });
    const o = {}; for (const p of fmt.formatToParts(new Date(ms))) o[p.type] = p.value;
    return { y: +o.year, m: +o.month, d: +o.day, h: +o.hour % 24, min: +o.minute, s: +o.second };
  }
  /** minutes Paris is ahead of UTC at that moment (60 in winter, 120 in summer) */
  function offset(ms) { const t = Math.floor(ms / 1000) * 1000, p = parts(t); return Math.round((Date.UTC(p.y, p.m - 1, p.d, p.h, p.min, p.s) - t) / MIN); }
  const pad = (n) => String(n).padStart(2, '0');
  const keyOf = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;
  const ymd = (k) => k.split('-').map(Number);
  /** the Paris calendar day of a moment: 'YYYY-MM-DD' */
  const dayKey = (ms) => { const p = parts(ms); return keyOf(p.y, p.m, p.d); };
  function addDays(k, n) { const [y, m, d] = ymd(k), t = new Date(Date.UTC(y, m - 1, d + n)); return keyOf(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate()); }
  /** 0 = Monday … 6 = Sunday */
  const weekday = (k) => { const [y, m, d] = ymd(k); return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7; };
  /** the moment a Paris day starts (midnight is never inside a DST jump: those are at 02:00 / 03:00) */
  function midnight(k) {
    const [y, m, d] = ymd(k), wall = Date.UTC(y, m - 1, d);
    let t = wall - offset(wall) * MIN; t = wall - offset(t) * MIN; return t;
  }
  /** the Monday of a moment's Paris week: 'YYYY-MM-DD' */
  const weekKey = (ms) => { const k = dayKey(ms); return addDays(k, -weekday(k)); };
  const hour = (ms) => parts(ms).h;

  // ---------- words ----------
  /** 200 → "3 h 20", 240 → "4 h", 45 → "45 min" */
  function clock(minutes) { const m = Math.max(0, Math.round(minutes)); if (m < 60) return `${m} min`; const h = Math.floor(m / 60), r = m % 60; return r ? `${h} h ${pad(r)}` : `${h} h`; }
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const short = (k) => { const [, m, d] = ymd(k); return `${d} ${MONTHS[m - 1]}`; };
  const dayName = (k) => `${DAYS[weekday(k)]} ${short(k)}`;
  const times = (n) => (n === 1 ? 'once' : n === 2 ? 'twice' : `${n} times`);
  /** Serum 2 / Vital as the desk names them (anything else keeps its own name) */
  const instrument = (name) => (/serum/i.test(name) ? 'Serum 2' : /vital/i.test(name) ? 'Vital' : String(name || '').trim().slice(0, 40));

  // ---------- the rows ----------
  const iso = (x) => typeof x === 'string' && Number.isFinite(Date.parse(x));
  /** a Sessions row we can count (the same fields bouncelog66 stores; anything else is skipped, never guessed) */
  const okRow = (r) => !!r && typeof r.id === 'string' && iso(r.start) && iso(r.end) && Number.isFinite(r.minutes) && r.minutes >= 0 && r.minutes < 100000;
  /** the rows to count: stored ones, the live session over its stored copy (same id), damaged rows left out */
  function rowsOf(stored, live = null) {
    const list = (Array.isArray(stored?.sessions) ? stored.sessions : Array.isArray(stored) ? stored : []).filter(okRow);
    if (okRow(live)) { const i = list.findIndex((r) => r.id === live.id); if (i >= 0) list[i] = live; else list.push(live); }
    return list;
  }
  /** a row's active time per Paris day: [{ day, ms }]. Across midnight, shared in proportion to the clock time each side. */
  function split(r) {
    const s = Date.parse(r.start), e = Date.parse(r.end), act = Math.max(0, r.minutes) * MIN;
    if (!act) return [];
    if (!(e > s)) return [{ day: dayKey(s), ms: act }];
    const out = []; let k = dayKey(s);
    for (let i = 0; i < 60; i++) {
      const a = midnight(k), b = midnight(addDays(k, 1)), lo = Math.max(s, a), hi = Math.min(e, b);
      if (hi > lo) out.push({ day: k, ms: act * (hi - lo) / (e - s) });
      if (b >= e) break; k = addDays(k, 1);
    }
    return out;
  }

  // ---------- the summary ----------
  const blank = () => ({ minutes: 0, sessions: 0, sketches: 0, loops: 0, park: 0 });
  /** rows: stored + live (rowsOf); loops: trimmed loops' cards ({ kind: 'sketch-loop', at }); goal: minutes a week (0 = off) */
  function summary(rows, now = Date.now(), { goal = 0, loops = [] } = {}) {
    const wk = weekKey(now), first = addDays(wk, -7 * (WEEKS - 1)), today = dayKey(now);
    const perDay = new Map(), weekOfDay = (d) => addDays(d, -weekday(d));
    for (const r of rows) for (const p of split(r)) perDay.set(p.day, (perDay.get(p.day) || 0) + p.ms);
    const days = Array.from({ length: 7 }, (_, i) => { const day = addDays(wk, i); return { day, name: DAYS[i], minutes: (perDay.get(day) || 0) / MIN, today: day === today, later: day > today }; });
    const weeks = Array.from({ length: WEEKS }, (_, i) => { const key = addDays(first, 7 * i); return { key, label: short(key), minutes: 0, current: key === wk }; });
    for (const [day, ms] of perDay) { const w = weeks.find((x) => x.key === weekOfDay(day)); if (w) w.minutes += ms / MIN; }
    const week = blank(), all = blank(), inst = new Map();
    let longest = null;
    const lo = midnight(first), hi = midnight(addDays(wk, 7)), weekLo = midnight(wk);
    for (const r of rows) {
      const s = Date.parse(r.start); if (s < lo || s >= hi) continue; // a session belongs to the week (and the 8) it started in
      const thisWeek = s >= weekLo;
      for (const box of thisWeek ? [week, all] : [all]) { box.sessions++; if (r.used?.park) box.park++; }
      if (!longest || r.minutes > longest.minutes) longest = { minutes: r.minutes, day: dayKey(s), name: dayName(dayKey(s)) };
      const names = [...new Set((Array.isArray(r.instruments) ? r.instruments : []).map(instrument).filter(Boolean))];
      for (const n of names) inst.set(n, (inst.get(n) || 0) + r.minutes / names.length); // two instruments in one session: each gets half
    }
    // a sketch / a loop counts in the week it was saved, whatever session it came from
    for (const r of rows) for (const k of Array.isArray(r.sketches) ? r.sketches : []) { const t = Date.parse(k?.at); if (t >= lo && t < hi) { all.sketches++; if (t >= weekLo) week.sketches++; } }
    for (const l of Array.isArray(loops) ? loops : []) { if (l?.kind !== 'sketch-loop') continue; const t = Date.parse(l.at); if (t >= lo && t < hi) { all.loops++; if (t >= weekLo) week.loops++; } }
    week.minutes = weeks[WEEKS - 1].minutes; all.minutes = weeks.reduce((a, w) => a + w.minutes, 0);
    const instruments = [...inst].map(([name, minutes]) => ({ name, minutes })).sort((a, b) => b.minutes - a.minutes || a.name.localeCompare(b.name));
    return { week: { key: wk, label: short(wk), ...week, days }, weeks, all, longest, instruments, top: instruments[0] || null, goal: goalOf(goal, week.minutes, weeks[WEEKS - 2].minutes), any: rows.length > 0 };
  }
  /** the soft ring: never a word about a missed week (the next week just starts fresh) */
  function goalOf(goal, done, lastWeek) {
    const g = Math.round(Number(goal) || 0); if (!(g > 0)) return null;
    const reached = done >= g, frac = Math.min(1, done / g);
    const line = reached ? `Goal reached ✓ · ${clock(g)} this week` : lastWeek < g ? 'New week, fresh start' : `${clock(done)} of ${clock(g)}`;
    return { minutes: g, frac, reached, line };
  }
  /** the tracker row's words */
  const rowText = (sum) => (!sum.any ? 'Studio hours: your music time shows here' : sum.week.minutes >= 1 ? `This week: ${clock(sum.week.minutes)} making music` : 'This week: new week, fresh start');

  // ---------- Sunday evening ----------
  /** Sunday from 18:00 Paris, with at least one session this week: { week, text }. Never with none. */
  function sundayNote(rows, now = Date.now()) {
    if (weekday(dayKey(now)) !== 6 || hour(now) < NOTE_HOUR) return null;
    const wk = weekKey(now), lo = midnight(wk), n = rows.filter((r) => { const s = Date.parse(r.start); return s >= lo && s <= now && r.minutes > 0; }).length;
    return n ? { week: wk, count: n, text: `You made music ${times(n)} this week 🎛` } : null;
  }
  /** cheap gate (no rows needed): is it Sunday from 18:00 in Paris? → the day's key, or '' */
  const sundayEvening = (now = Date.now()) => { const k = dayKey(now); return weekday(k) === 6 && hour(now) >= NOTE_HOUR ? k : ''; };

  return { MIN, DAY, TZ, WEEKS, NOTE_HOUR, GOALS, parts, offset, dayKey, addDays, weekday, midnight, weekKey, hour, clock, short, dayName, times, instrument,
    okRow, rowsOf, split, summary, goalOf, rowText, sundayNote, sundayEvening };
});
