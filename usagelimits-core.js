// ⏳ Usage left (round 48, usagelimits), the pure part: how much of each AI's plan is left per window (Claude's 5-hour
// session and weekly limits, Astra's Codex windows), how fresh each number is, a heads-up of when a window runs out at
// your pace, and the calm notes at 80 % / 95 % / reset. No DOM, no IPC, 0 tokens. Where the numbers come from:
//   fromEvent(info, at)      Claude Code's own stream-json `rate_limit_event` (rate_limit_info: status, rateLimitType,
//                            resetsAt in s, utilization 0–1, and unifiedWindows { five_hour, seven_day, … } when given)
//   fromError(text, now)     a refused message ("5-hour limit reached ∙ resets 6pm", "…usage limit reached|1760378400",
//                            429): that window is at 100 % until it resets (offline-core.js reads the reset time)
//   fromUsageText(text, now) `claude -p /usage` (a local command of Claude Code: no model request, 0 tokens):
//                            "Current session: 42% used · resets 6pm (Europe/Paris)"
//   fromCodex(result)        Astra's account limits (codex-usage.js normalize(): buckets × windows)
//   merge(state, engine, obs, now)   keeps the newest number per window + a few samples of the current cycle
//   view(win, now)           what a bar shows: used / left, the reset countdown, "as of 3 min ago" (null = not known)
//   forecast(win, o)         when the window runs out at your pace (local tokens since it started, else its own samples,
//                            else the average since it started), or how much will be used when it resets
//   heads(state, now)        the notes that are due (80 %, 95 %, reset), each once per window cycle
// Never invents a number: a window nobody reported stays "not known yet".
const UsageLimitsCore = (() => {
  const OC = typeof module !== 'undefined' && typeof require === 'function' ? require('./offline-core') : (typeof OfflineCore !== 'undefined' ? OfflineCore : null);
  const MIN = 60e3; const HOUR = 36e5; const DAY = 864e5;
  // the windows shown, in order (a per-model weekly bucket only when the engine reports it)
  const WINDOWS = {
    five_hour: { label: 'Session', long: 'session limit', ms: 5 * HOUR, order: 0 },
    seven_day: { label: 'This week', long: 'weekly limit', ms: 7 * DAY, order: 1 },
    seven_day_sonnet: { label: 'This week · Sonnet', long: 'weekly Sonnet limit', ms: 7 * DAY, order: 2 },
    seven_day_opus: { label: 'This week · Opus', long: 'weekly Opus limit', ms: 7 * DAY, order: 3 },
    limit: { label: 'A usage limit', long: 'usage limit', ms: null, order: 4 }, // a refusal that didn't say which window
  };
  const SAMPLES = 40;
  const finite = (n) => typeof n === 'number' && Number.isFinite(n);
  const round = (n) => Math.round(n);
  const fmt = (n) => {
    n = Math.round(n || 0);
    if (n >= 1e6) return `${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)}M`;
    if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k`;
    return String(n);
  };
  const labelOf = (key) => WINDOWS[key]?.label || String(key || 'window').replace(/_/g, ' ');
  const longOf = (key) => WINDOWS[key]?.long || `${labelOf(key).toLowerCase()} limit`;
  const msOf = (key, w) => (finite(w?.minutes) ? w.minutes * MIN : WINDOWS[key]?.ms || null);

  // ---------- reading what the engines say ----------
  // utilization is a fraction (0–1, can pass 1 when usage runs past the cap): shown as a percent
  const pct = (u) => (finite(u) ? Math.max(0, u * 100) : null);
  const secs = (s) => (finite(s) && s > 0 ? s * 1000 : null);
  function fromEvent(info, at = Date.now()) {
    if (!info || typeof info !== 'object') return [];
    const out = new Map();
    const uw = info.unifiedWindows && typeof info.unifiedWindows === 'object' ? info.unifiedWindows : {};
    for (const [key, w] of Object.entries(uw)) {
      if (!WINDOWS[key] || !w || !finite(w.utilization)) continue;
      out.set(key, { key, used: pct(w.utilization), resetsAt: secs(w.resetsAt), at, source: 'event' });
    }
    const key = typeof info.rateLimitType === 'string' && WINDOWS[info.rateLimitType] ? info.rateLimitType : null;
    if (key) {
      const prev = out.get(key);
      const used = finite(info.utilization) ? pct(info.utilization) : prev?.used ?? null;
      const o = { key, used: info.status === 'rejected' ? Math.max(100, used ?? 0) : used, resetsAt: secs(info.resetsAt) ?? prev?.resetsAt ?? null, at, source: 'event', status: info.status || null };
      if (o.used != null || o.resetsAt) out.set(key, o);
    }
    return [...out.values()];
  }
  function windowFromWords(t) {
    if (/opus/i.test(t)) return 'seven_day_opus';
    if (/sonnet/i.test(t)) return 'seven_day_sonnet';
    if (/week|7-day|seven/i.test(t)) return 'seven_day';
    if (/5-hour|five.hour|session/i.test(t)) return 'five_hour';
    return 'limit';
  }
  function fromError(text, now = Date.now()) {
    const c = OC?.classify(String(text || ''), { now });
    if (c?.kind !== 'limit') return [];
    return [{ key: windowFromWords(String(text)), used: 100, resetsAt: c.resetAt || null, at: now, source: 'error', status: 'rejected' }];
  }
  // "Current session: 42% used · resets 6pm (Europe/Paris)" · "Current week (all models): 31% used · resets Oct 18, 9am (…)"
  function fromUsageText(text, now = Date.now()) {
    const out = [];
    for (const line of String(text || '').split(/\r?\n/)) {
      const m = line.match(/^\s*Current (session|week(?:\s*\(([^)]*)\))?)\s*:?\s*(\d+(?:\.\d+)?)\s*%\s*used(?:\s*[·∙•-]\s*resets?\s+(.+))?/i);
      if (!m) continue;
      const scope = (m[2] || '').toLowerCase();
      const key = /^session/i.test(m[1]) ? 'five_hour' : !scope || /all/.test(scope) ? 'seven_day' : /sonnet/.test(scope) ? 'seven_day_sonnet' : /opus/.test(scope) ? 'seven_day_opus' : null;
      if (!key || out.some((o) => o.key === key)) continue;
      const resetsAt = m[4] && OC ? OC.parseReset(`resets ${m[4].trim()}`, now) : null;
      out.push({ key, used: Number(m[3]), resetsAt: resetsAt || null, at: now, source: 'usage' });
    }
    return out;
  }
  function fromCodex(result) {
    if (!result?.available) return [];
    const out = [];
    for (const b of result.buckets || []) {
      for (const w of b.windows || []) {
        if (!finite(w.used)) continue;
        const base = w.minutes === 300 ? 'five_hour' : w.minutes === 10080 ? 'seven_day' : w.minutes ? `w${w.minutes}` : w.key;
        const key = b.id === 'codex' || (result.buckets || []).length === 1 ? base : `${base}:${b.id}`;
        if (out.some((o) => o.key === key)) continue;
        const label = w.minutes === 300 ? 'Session' : w.minutes === 10080 ? 'This week' : w.minutes ? (w.minutes % 1440 === 0 ? `${w.minutes / 1440}-day window` : w.minutes % 60 === 0 ? `${w.minutes / 60}-hour window` : `${w.minutes}-minute window`) : 'Window';
        out.push({ key, label: b.id === 'codex' || (result.buckets || []).length === 1 ? label : `${label} · ${b.name}`, minutes: w.minutes || null, used: w.used, resetsAt: w.resetsAt || null, at: result.checkedAt || Date.now(), source: 'account' });
      }
    }
    return out;
  }

  // ---------- the store: the newest number per window, a few samples of the current cycle ----------
  // state = { v: 1, engines: { claude: { windows: { key: obs }, samples: { key: [[at, used]] } }, codex: … }, noted: { id: at } }
  function clean(s) {
    const o = s && typeof s === 'object' ? s : {};
    const engines = {};
    for (const [e, v] of Object.entries(o.engines || {})) {
      if (!v || typeof v !== 'object') continue;
      const windows = {}; const samples = {};
      for (const [k, w] of Object.entries(v.windows || {})) if (w && finite(w.at)) windows[k] = w;
      for (const [k, list] of Object.entries(v.samples || {})) if (Array.isArray(list)) samples[k] = list.filter((p) => Array.isArray(p) && finite(p[0]) && finite(p[1])).slice(-SAMPLES);
      engines[e] = { windows, samples };
    }
    const noted = {};
    const cut = Date.now() - 30 * DAY;
    for (const [k, at] of Object.entries(o.noted || {})) if (finite(at) && at > cut) noted[k] = at;
    return { v: 1, engines, noted, ...(o.claudeUsage && typeof o.claudeUsage === 'object' ? { claudeUsage: o.claudeUsage } : {}) };
  }
  const sameCycle = (a, b) => Boolean(a && b) && (!a.resetsAt || !b.resetsAt || Math.abs(a.resetsAt - b.resetsAt) < 2 * MIN);
  function merge(state, engine, list, now = Date.now()) {
    const s = clean(state);
    const e = (s.engines[engine] ||= { windows: {}, samples: {} });
    let changed = false;
    for (const ob of list || []) {
      if (!ob?.key || !finite(ob.at)) continue;
      const prev = e.windows[ob.key];
      if (prev && prev.at > ob.at) continue; // an older report never replaces a newer one
      const next = { ...ob };
      // "allowed" with no utilization in the same cycle: the number we had still holds
      let carried = false;
      if (next.used == null && prev && sameCycle(prev, next) && prev.used != null) { next.used = prev.used; carried = true; }
      if (!next.resetsAt && prev?.resetsAt && prev.resetsAt > now && next.source === 'error') next.resetsAt = prev.resetsAt;
      e.windows[ob.key] = next;
      changed = true;
      if (next.used == null || carried) continue; // a carried number isn't a new sample
      let list2 = (e.samples[ob.key] || []).filter((p) => !prev || sameCycle(prev, next));
      const last = list2[list2.length - 1];
      if (last && Math.abs(last[1] - next.used) < 0.05 && next.at - last[0] < 2 * MIN) continue;
      list2.push([next.at, next.used]);
      e.samples[ob.key] = list2.slice(-SAMPLES);
    }
    return { state: s, changed };
  }

  // ---------- words ----------
  function ago(ms) {
    if (!finite(ms) || ms < 60e3) return 'just now';
    if (ms < HOUR) return `${round(ms / MIN)} min ago`;
    if (ms < DAY) return `${round(ms / HOUR)} h ago`;
    const d = round(ms / DAY);
    return d === 1 ? 'yesterday' : `${d} days ago`;
  }
  function countdown(ms) {
    if (!finite(ms) || ms <= 0) return 'now';
    const m = Math.max(1, Math.round(ms / MIN));
    if (m < 60) return `${m} min`;
    const h = Math.floor(m / 60); const mm = m % 60;
    if (h < 24) return mm ? `${h} h ${mm} min` : `${h} h`;
    const d = Math.floor(h / 24); const hh = h % 24;
    return hh ? `${d} d ${hh} h` : `${d} d`;
  }
  // "6:00 pm" today, "Thu 6:00 pm" this week, "Oct 21, 6:00 pm" further
  function when(t, now = Date.now()) {
    const d = new Date(t); const n = new Date(now);
    const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
    if (d.toDateString() === n.toDateString()) return time;
    if (Math.abs(t - now) < 6 * DAY) return `${d.toLocaleDateString(undefined, { weekday: 'short' })} ${time}`;
    return `${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}, ${time}`;
  }

  // ---------- what a bar shows ----------
  function view(w, now = Date.now(), key = w?.key) {
    if (!w) return null;
    const label = w.label || labelOf(key);
    const reset = Boolean(w.resetsAt && now >= w.resetsAt);
    const used = reset || w.used == null ? null : Math.max(0, w.used);
    return {
      key, label, long: longOf(key), source: w.source, status: w.status || null,
      used: used == null ? null : Math.min(100, Math.round(used)), over: used != null && used >= 100,
      left: used == null ? null : Math.max(0, 100 - Math.round(used)),
      resetsAt: w.resetsAt || null, resetIn: w.resetsAt && !reset ? w.resetsAt - now : null, reset,
      at: w.at, age: now - w.at, ago: ago(now - w.at),
      level: used == null ? 'none' : used >= 95 ? 'high' : used >= 80 ? 'near' : 'ok',
    };
  }
  function views(state, engine, now = Date.now()) {
    const e = clean(state).engines[engine];
    if (!e) return [];
    return Object.entries(e.windows).map(([k, w]) => view(w, now, k)).filter(Boolean)
      .filter((v) => !(v.key === 'limit' && (v.reset || !v.resetsAt && v.age > 6 * HOUR))) // an unnamed refusal fades once it's over
      .sort((a, b) => (WINDOWS[a.key]?.order ?? 9) - (WINDOWS[b.key]?.order ?? 9) || a.label.localeCompare(b.label));
  }

  // ---------- the heads-up: when it runs out at your pace ----------
  // w: the window (used %, resetsAt, at); o.samples: [[at, used]] of this cycle; o.local: { inWindow, recentTokens,
  // recentMs } this AI's tokens counted on this computer since the window started, and over the recent span
  function forecast(w, { now = Date.now(), samples = [], local = null, key = w?.key } = {}) {
    if (!w || w.used == null) return { state: 'unknown' };
    if (w.resetsAt && now >= w.resetsAt) return { state: 'reset' };
    if (w.used >= 100 || w.status === 'rejected') return { state: 'reached', resetsAt: w.resetsAt || null };
    const D = msOf(key, w);
    if (!w.resetsAt || !D) return { state: 'unknown' };
    const start = w.resetsAt - D;
    const elapsed = w.at - start;
    let pace = null; let method = null; // percent per ms
    if (local && local.inWindow > 0 && local.recentTokens > 0 && local.recentMs >= HOUR && w.used >= 1) {
      pace = (w.used / local.inWindow) * (local.recentTokens / local.recentMs); method = 'tokens';
    }
    if (pace == null) {
      const s = (samples || []).filter((p) => p[0] >= start && p[0] <= w.at);
      const span = s.length >= 2 ? s[s.length - 1][0] - s[0][0] : 0;
      if (span >= Math.min(D / 10, 6 * HOUR) && s[s.length - 1][1] > s[0][1]) { pace = (s[s.length - 1][1] - s[0][1]) / span; method = 'samples'; }
    }
    if (pace == null) {
      if (elapsed < Math.min(D / 20, 6 * HOUR) || w.used < 1) return { state: 'early' };
      pace = w.used / elapsed; method = 'average';
    }
    if (!(pace > 0)) return { state: 'ok', atReset: Math.round(w.used), method };
    const hitAt = w.at + (100 - w.used) / pace;
    if (hitAt < w.resetsAt) return { state: 'hit', hitAt: Math.max(now, hitAt), method, atReset: 100 };
    return { state: 'ok', atReset: Math.min(99, Math.round(w.used + pace * (w.resetsAt - w.at))), method };
  }
  // one plain line for a forecast
  function forecastWords(f, key, now = Date.now(), resetsAt = null) {
    const long = longOf(key);
    const week = /^seven_day/.test(key);
    switch (f?.state) {
      case 'hit': return week ? `At your pace this week you'll reach the ${long} around ${when(f.hitAt, now)}${resetsAt ? ` (it resets ${when(resetsAt, now)})` : ''}.`
        : `At this pace the ${long} comes around ${when(f.hitAt, now)}${resetsAt ? `, ${countdown(resetsAt - f.hitAt)} before it resets` : ''}.`;
      case 'ok': return week ? `At your pace you'll have used about ${f.atReset}% of this week when it resets${resetsAt ? ` (${when(resetsAt, now)})` : ''}: you're fine.`
        : `At this pace you'll stay under the ${long}${resetsAt ? ` until it resets in ${countdown(resetsAt - now)}` : ''}.`;
      case 'reached': return `${long[0].toUpperCase()}${long.slice(1)} reached${f.resetsAt ? `: it resets ${f.resetsAt - now < DAY ? `in ${countdown(f.resetsAt - now)}` : when(f.resetsAt, now)}` : ''}.`;
      case 'early': return week ? 'Too early in the week to tell your pace.' : 'Too early in this session to tell your pace.';
      case 'reset': return `The ${long} has reset: new numbers come with your next message.`;
      default: return '';
    }
  }
  // the card's one heads-up: the most urgent window (reached > runs out soonest > the week's outlook)
  function headline(list) {
    const rank = (x) => (x.f.state === 'reached' ? 0 : x.f.state === 'hit' ? 1 : /^seven_day$/.test(x.key) ? 2 : x.key === 'five_hour' ? 3 : 4);
    const ok = list.filter((x) => x.words);
    ok.sort((a, b) => rank(a) - rank(b) || (a.f.hitAt || 0) - (b.f.hitAt || 0));
    return ok[0] || null;
  }

  // ---------- tokens on this computer (the meter's token-stats.json) ----------
  // stats.days[YYYY-MM-DD].a[agentId] = { i, o, … } in local days; ids: this engine's agents
  const dayKey = (t) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  function tokensOn(stats, day, ids) {
    const a = stats?.days?.[day]?.a || {};
    let n = 0;
    for (const id of ids) n += (a[id]?.i || 0) + (a[id]?.o || 0);
    return n;
  }
  // { today, week (7 days), spark: the last 7 days, inWindow (since `start`), recentTokens / recentMs (the last 48 h) }
  function localTokens(stats, ids, { now = Date.now(), start = null } = {}) {
    const days = Array.from({ length: 7 }, (_, i) => dayKey(now - (6 - i) * DAY));
    const spark = days.map((d) => tokensOn(stats, d, ids));
    const out = { today: spark[6], week: spark.reduce((s, x) => s + x, 0), spark };
    if (start) {
      let n = 0;
      for (let t = start; dayKey(t) <= dayKey(now); t += DAY) n += tokensOn(stats, dayKey(t), ids);
      out.inWindow = n;
      // the recent pace: yesterday and today (today counts its hours so far)
      const midnight = new Date(now); midnight.setHours(0, 0, 0, 0);
      const from = Math.max(start, midnight.getTime() - DAY);
      out.recentTokens = tokensOn(stats, dayKey(now), ids) + (from < midnight.getTime() ? tokensOn(stats, dayKey(now - DAY), ids) : 0);
      out.recentMs = now - from;
    }
    return out;
  }
  // a saving in tokens a week as a share of the weekly limit (when the window's tokens per percent are known)
  // Only when Hearth's own count is a fair sample of the window (≥ 100k tokens and ≥ 5 %): Claude Code used outside
  // Hearth counts toward the plan but not here, so a small local count would make every saving look huge.
  function shareOfWeek(saves, w, local) {
    if (!w || w.used == null || w.used < 5 || !(local?.inWindow >= 100000)) return null;
    const p = saves / (local.inWindow / w.used);
    return p >= 0.5 && p <= 60 ? Math.round(p) : null;
  }

  // ---------- the calm notes: 80 %, 95 %, and when it resets (once per window cycle) ----------
  const ENGINE_NAME = { claude: 'Claude', codex: 'Astra' };
  function heads(state, now = Date.now(), names = ENGINE_NAME) {
    const s = clean(state);
    const due = [];
    for (const [engine, e] of Object.entries(s.engines)) {
      for (const [key, w] of Object.entries(e.windows)) {
        if (key === 'limit' || !w.resetsAt || w.used == null) continue;
        const cycle = `${engine}:${key}:${Math.round(w.resetsAt / MIN)}`;
        const who = names[engine] || engine;
        const long = longOf(key);
        if (now >= w.resetsAt) {
          if ((s.noted[`${cycle}:80`] || s.noted[`${cycle}:95`]) && !s.noted[`${cycle}:reset`] && now - w.resetsAt < 12 * HOUR) {
            due.push({ id: `${cycle}:reset`, also: [], engine, key, level: 'reset', text: `${who}'s ${long} has reset: the full ${/^seven/.test(key) ? 'week' : 'session'} is yours again.` });
          }
          continue;
        }
        if (w.at < now - 12 * HOUR) continue; // an old number isn't news
        const level = w.used >= 95 ? 95 : w.used >= 80 ? 80 : 0;
        if (!level || s.noted[`${cycle}:${level}`]) continue;
        const left = Math.max(0, 100 - Math.round(w.used));
        const wait = w.resetsAt - now;
        const text = w.used >= 100
          ? `${who} reached its ${long}. It resets ${wait < DAY ? `in ${countdown(wait)}` : when(w.resetsAt, now)}.`
          : `${who} has ${left}% of its ${long} left. It resets ${wait < DAY ? `in ${countdown(wait)}` : when(w.resetsAt, now)}.`;
        due.push({ id: `${cycle}:${level}`, also: level === 95 ? [`${cycle}:80`] : [], engine, key, level, text });
      }
    }
    return due;
  }

  return { WINDOWS, fromEvent, fromError, fromUsageText, fromCodex, clean, merge, view, views, forecast, forecastWords, headline, localTokens, shareOfWeek, heads, ago, countdown, when, fmt, labelOf, longOf, dayKey, windowFromWords };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = UsageLimitsCore; else window.UsageLimitsCore = UsageLimitsCore;
