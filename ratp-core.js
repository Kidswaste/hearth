/* (round 69, ratp69) Leave reminders that are honest about the Métro: the thinking, with no DOM, no fs, no Electron, shared
   by the window (leavesoon.js: the trip it plans, the ✦ tracker's line status), the main process (leavesoonmain.js: ONE
   timer, a status check ~30 min before a reminder; ratpmain.js: the fetch) and the Node tests (dev/ratp69-test.js).
     metroAt(ms)               is the Métro running then (Paris time)? The last trains leave at about 00:40 on Sun–Thu
                               nights and about 01:40 on Fri / Sat nights; it opens again at about 05:30. Always "about".
     night(travel, targetAt)   a Métro trip that would board while it's closed becomes a walk ("Métro closed") or
                               "Noctilien / taxi — check" (and the leave time moves with it), or "the last one" when
                               leaving a bit earlier still catches the last train
     routeLines(a, b)          the lines of the estimated route between two stations of the bundled list: the shared
                               lines (one each), else one change (line X then Y at a station both serve), ≤ 3 options
     parsePrim / parseCommunity   a line-status answer (IDFM's PRIM "disruptions" feed, or the community RATP API)
                               → { state: 'ok', lines: { '9': [{ level, title, from, to }] }, known }
     verdict(options, status, from, to)   the route's status for that trip: "Line 9: OK", "⚠ Line 9: disrupted — leave
                               10 min earlier?", or "unknown" (offline, no key, a line the feed doesn't cover)
     nextCheck(items, now)     when the one status check of the soonest Métro reminder is due (~30 min before it rings)
   Nothing personal is ever sent: the status feeds are fetched whole (no place, no Home, no route in the request). */
(function (root, make) { if (typeof module === 'object' && module.exports) module.exports = make(); else root.RatpCore = make(); })(typeof self !== 'undefined' ? self : globalThis, () => {
  const MIN = 60e3;
  const LAST_WEEK = 40; // minutes after midnight: the last Métro on Sun–Thu nights (about 00:40)
  const LAST_WEEKEND = 100; // Fri and Sat nights (about 01:40)
  const FIRST = 330; // about 05:30: the first trains
  const NIGHT_WALK_MAX = 40; // minutes: with the Métro closed, up to this it says walk
  const ROAD = 1.4; // a night bus / taxi's way vs the straight line
  const NIGHT_M_PER_MIN = 300; // ~18 km/h: a Noctilien with its stops (a taxi is quicker: the estimate leaves early, never late)
  const NIGHT_WAIT = 15; // minutes: waiting for the night bus (or the taxi)
  const LAST_MARGIN = 2; // minutes: be on the platform before the last train
  const CHECK_BEFORE = 30 * MIN; // the one status check: this long before the reminder rings
  const FRESH = 10 * MIN; // a status answer is reused this long (one fetch serves every reminder)
  const FRESH_UNKNOWN = 2 * MIN; // offline / no answer: tried again no sooner than this
  const SOON = 6 * 3600e3; // opening a reminder checks the status only when its trip is this close
  const EARLIER = { disrupted: 10, blocked: 15 }; // minutes the "Leave earlier" click moves the leave time
  const RANK = { ok: 0, info: 0, disrupted: 1, blocked: 2 };
  const fin = Number.isFinite;
  const p2 = (n) => String(n).padStart(2, '0');
  const hmOf = (mins) => `${p2(Math.floor(mins / 60) % 24)}:${p2(mins % 60)}`;
  const floor5 = (ms) => Math.floor(ms / (5 * MIN)) * 5 * MIN;
  const about = (min) => (min <= 10 ? min : Math.max(10, Math.round(min / 5) * 5));
  const walkMin = (m) => Math.max(1, Math.ceil((m * 1.2) / 75)); // leavesoon-core's walk: streets ×1.2 at 4.5 km/h

  // ---------- Paris wall clock (the Métro runs on Paris time, whatever this computer's clock says) ----------
  let fmt = null;
  function parts(ms) {
    try {
      fmt = fmt || new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Paris', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', weekday: 'short', hourCycle: 'h23' });
      const o = {}; for (const p of fmt.formatToParts(new Date(ms))) o[p.type] = p.value;
      return { y: +o.year, m: +o.month, d: +o.day, h: +o.hour % 24, mi: +o.minute, wd: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(o.weekday) };
    } catch { const d = new Date(ms); return { y: d.getFullYear(), m: d.getMonth() + 1, d: d.getDate(), h: d.getHours(), mi: d.getMinutes(), wd: d.getDay() }; } // no time zones here: this computer's clock
  }
  const dayNo = (p) => Math.round(Date.UTC(p.y, p.m - 1, p.d) / 86400e3);
  /** the instant at `mins` minutes after midnight (Paris) of ms's Paris day (mins ≥ 1440: the next day) */
  function wallAt(ms, mins) {
    const p0 = parts(ms), d0 = dayNo(p0);
    let t = ms + (mins - (p0.h * 60 + p0.mi)) * MIN;
    for (let i = 0; i < 3; i++) { const q = parts(t), got = (dayNo(q) - d0) * 1440 + q.h * 60 + q.mi; if (got === mins) break; t += (mins - got) * MIN; } // a clock change in between
    return Math.floor(t / MIN) * MIN;
  }
  /** is the Métro running at ms? → { open, last (the last trains of that night), reopen (when closed), lastText, weekend } */
  function metroAt(ms) {
    const p = parts(ms), mins = p.h * 60 + p.mi;
    if (mins < FIRST) { // after midnight: the night belongs to the day before (a Friday night is Fri→Sat)
      const wd = (p.wd + 6) % 7, close = wd === 5 || wd === 6 ? LAST_WEEKEND : LAST_WEEK;
      const last = wallAt(ms, close);
      return { open: mins < close, last, reopen: mins < close ? null : wallAt(ms, FIRST), lastText: `about ${hmOf(close)}`, weekend: close === LAST_WEEKEND };
    }
    const close = p.wd === 5 || p.wd === 6 ? LAST_WEEKEND : LAST_WEEK;
    return { open: true, last: wallAt(ms, 1440 + close), reopen: null, lastText: `about ${hmOf(close)}`, weekend: close === LAST_WEEKEND };
  }

  /** travel (leavesoon-core's, with walkIn / m) for a trip that must arrive at targetAt → the same, or the honest night one */
  function night(travel, targetAt) {
    if (!travel || travel.mode !== 'metro' || !fin(targetAt) || !fin(travel.min)) return travel;
    const leave = floor5(targetAt - travel.min * MIN);
    const walkIn = fin(travel.walkIn) ? travel.walkIn : 0;
    const board = leave + walkIn * MIN;
    const m = metroAt(board);
    if (m.open) { // running: but say so when it's the last trains
      if (m.last - board <= 20 * MIN) return { ...travel, how: `${travel.how} · last Métro ${m.lastText}`, night: { last: m.lastText, close: true } };
      return travel;
    }
    const metres = fin(travel.m) ? travel.m : 0, walk = walkMin(metres), closed = `the Métro is closed then (last ${m.lastText}, back about 05:30)`;
    const alt = walk <= NIGHT_WALK_MAX
      ? { mode: 'walk', min: walk, text: `about ${about(walk)} min walk (Métro closed)`, how: `on foot: ${closed}` }
      : (() => { const n = Math.min(walk, Math.ceil((metres * ROAD) / NIGHT_M_PER_MIN) + NIGHT_WAIT); return { mode: 'night', min: n, text: `Noctilien / taxi — check (about ${about(n)} min)`, how: `${closed}: a night bus (Noctilien) or a taxi, about ${about(n)} min — check the times before you go` }; })();
    // leaving a bit earlier for the last train beats waiting for the night bus? (only that same night, before it)
    if (m.last < board) {
      const lastLeave = floor5(m.last - (walkIn + LAST_MARGIN) * MIN), altLeave = floor5(targetAt - alt.min * MIN);
      if (lastLeave >= altLeave && lastLeave < targetAt) return { ...travel, min: Math.round((targetAt - lastLeave) / MIN), text: `${travel.text}, the last one (${m.lastText})`, how: `${travel.how} · catch the last Métro (${m.lastText})`, night: { last: m.lastText, close: true } };
    }
    return { ...alt, m: travel.m, metro: travel.text, lines: [], night: { last: m.lastText, closed: true } };
  }

  // ---------- the lines of the estimated route ----------
  function stations() {
    if (typeof ShowPrepCore !== 'undefined' && ShowPrepCore?.STATIONS) return ShowPrepCore.STATIONS;
    try { if (typeof require === 'function') return require('./showprep-core').STATIONS; } catch { /* no list: no lines */ }
    return [];
  }
  function metres(a, b) {
    const r = Math.PI / 180, dLat = (b.lat - a.lat) * r, dLon = (b.lon - a.lon) * r;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLon / 2) ** 2;
    return 2 * 6371000 * Math.asin(Math.min(1, Math.sqrt(h)));
  }
  /** two station names (leavesoon-core's travel.from / .to) → up to 3 options [{ lines: ['8'], via }] , the chosen line first */
  function routeLines(fromName, toName, chosen = null, list = stations()) {
    const a = list.find((s) => s.name === fromName), b = list.find((s) => s.name === toName);
    if (!a || !b || a === b) return [];
    const shared = a.lines.filter((l) => b.lines.includes(l));
    if (shared.length) return [...new Set([chosen, ...shared].filter((l) => l && shared.includes(l)))].slice(0, 3).map((l) => ({ lines: [l], via: null }));
    const opts = [], seen = new Set();
    for (const t of list) {
      if (t === a || t === b) continue;
      for (const la of a.lines) if (t.lines.includes(la)) for (const lb of b.lines) if (lb !== la && t.lines.includes(lb)) opts.push({ lines: [la, lb], via: t.name, cost: metres(a, t) + metres(t, b) });
    }
    opts.sort((x, y) => x.cost - y.cost || x.via.localeCompare(y.via));
    const out = [];
    for (const o of opts) { const k = o.lines.join('>'); if (seen.has(k)) continue; seen.add(k); out.push({ lines: o.lines, via: o.via }); if (out.length >= 3) break; }
    return out.length ? out : [{ lines: [...new Set([a.lines[0], b.lines[0]])], via: null }]; // two changes: the lines at both ends
  }
  /** "Opéra → Bastille (line 8)" / "République → Bir-Hakeim (line 8, then 6 at La Motte-Picquet–Grenelle)" */
  function routeWords(fromName, toName, options) {
    const o = options?.[0]; if (!o) return `${fromName} → ${toName}`;
    return o.lines.length === 1 ? `${fromName} → ${toName} (line ${o.lines[0]})` : `${fromName} → ${toName} (line ${o.lines[0]}, then ${o.lines.slice(1).join(', then ')}${o.via ? ` at ${o.via}` : ''})`;
  }

  // ---------- line status: the feeds' answers → one shape ----------
  const LINE_IDS = { C01371: '1', C01372: '2', C01373: '3', C01386: '3bis', C01374: '4', C01375: '5', C01376: '6', C01377: '7', C01387: '7bis', C01378: '8', C01379: '9', C01380: '10', C01381: '11', C01382: '12', C01383: '13', C01384: '14' };
  const METRO = Object.values(LINE_IDS);
  /** "M9", "9", "3B", "3 bis", "line:IDFM:C01379" → "9" / "3bis" (null when it isn't a Métro line) */
  function lineName(v) {
    const s = String(v ?? '').trim();
    const id = /C0\d{4}/.exec(s); if (id && LINE_IDS[id[0]]) return LINE_IDS[id[0]];
    const m = /^(?:m(?:é|e)tro\s*|m|ligne\s*|line\s*)?(\d{1,2})\s*(b|bis)?$/i.exec(s);
    if (!m) return null;
    const n = `${+m[1]}${m[2] ? 'bis' : ''}`;
    return METRO.includes(n) ? n : null;
  }
  const plain = (s, n = 140) => String(s ?? '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#39;|&apos;/g, '’').replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim().slice(0, n);
  /** "20261026T053000" (Paris time) → ms */
  function primTime(s) {
    const m = /^(\d{4})(\d\d)(\d\d)T(\d\d)(\d\d)(\d\d)?$/.exec(String(s || ''));
    if (!m) return NaN;
    const guess = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]); // as if UTC, then moved by Paris's offset then
    const p = parts(guess), off = (Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi) - guess) / MIN;
    return guess - off * MIN;
  }
  /** IDFM PRIM "Perturbations" (disruptions_bulk v2): { disruptions: [{ id, applicationPeriods, severity, cause, title, message }], lines: [{ name / shortName, mode, impactedObjects: [{ disruptionIds }] }] } */
  function parsePrim(json, at = Date.now()) {
    if (!json || typeof json !== 'object' || !Array.isArray(json.disruptions) || !Array.isArray(json.lines)) throw Error('Not a line-status answer.');
    const byId = new Map(json.disruptions.filter((d) => d && d.id).map((d) => [String(d.id), d]));
    const lines = {};
    for (const l of json.lines) {
      if (!l || !/metro/i.test(String(l.mode || ''))) continue;
      const name = lineName(l.shortName ?? l.name) || lineName(l.id); if (!name) continue;
      const ids = new Set(); for (const o of l.impactedObjects || []) for (const id of o?.disruptionIds || []) ids.add(String(id));
      for (const id of ids) {
        const d = byId.get(id); if (!d) continue;
        const sev = String(d.severity || '').toUpperCase(), cause = String(d.cause || '').toUpperCase();
        const level = sev === 'BLOQUANTE' ? 'blocked' : sev === 'PERTURBEE' ? 'disrupted' : 'info';
        const periods = (Array.isArray(d.applicationPeriods) && d.applicationPeriods.length ? d.applicationPeriods : [{}]).map((p) => ({ from: fin(primTime(p.begin)) ? primTime(p.begin) : -Infinity, to: fin(primTime(p.end)) ? primTime(p.end) : Infinity }));
        for (const p of periods) (lines[name] = lines[name] || []).push({ level: cause === 'TRAVAUX' && level === 'info' ? 'info' : level, title: plain(d.title || d.message), ...p });
      }
    }
    return { state: 'ok', provider: 'prim', at, lines, known: METRO };
  }
  /** the community RATP API (api-ratp.pierre-grimaud.fr v4 /traffic/metros): { result: { metros: [{ line, slug, title, message }] } } */
  function parseCommunity(json, at = Date.now()) {
    const list = json?.result?.metros;
    if (!Array.isArray(list)) throw Error('Not a line-status answer.');
    const lines = {}, known = [];
    for (const x of list) {
      const name = lineName(x?.line); if (!name) continue;
      known.push(name);
      const slug = String(x.slug || '').toLowerCase();
      const level = slug === 'critique' ? 'blocked' : slug === 'alerte' ? 'disrupted' : slug === 'normal' ? null : 'info';
      if (level) (lines[name] = lines[name] || []).push({ level, title: plain(`${x.title || ''}${x.message ? `: ${x.message}` : ''}`), from: -Infinity, to: Infinity });
    }
    return { state: 'ok', provider: 'community', at, lines, known };
  }

  /** the route's status for a trip from..to: { state: 'ok' | 'disrupted' | 'blocked' | 'unknown', line, words, earlier, title, alt } */
  function verdict(options, status, from, to) {
    if (!Array.isArray(options) || !options.length) return null; // not a Métro trip: nothing to say
    if (!status || status.state !== 'ok') return { state: 'unknown', why: status?.why || 'offline', words: 'Line status unknown' };
    const t0 = fin(from) ? from : -Infinity, t1 = fin(to) ? to : Infinity;
    const look = (o) => {
      let worst = { rank: 0, level: 'ok', line: o.lines[0], title: '' }, unknown = false;
      for (const l of o.lines) {
        if (!status.known?.includes(l)) { unknown = true; continue; }
        for (const e of status.lines?.[l] || []) if (e.from <= t1 && e.to >= t0 && RANK[e.level] > worst.rank) worst = { rank: RANK[e.level], level: e.level, line: l, title: e.title };
      }
      return { ...worst, unknown };
    };
    const seen = options.map(look);
    const sure = seen.filter((s) => !s.unknown);
    if (!sure.length) return { state: 'unknown', why: 'notcovered', words: 'Line status unknown' };
    const best = sure.reduce((a, b) => (b.rank < a.rank ? b : a));
    const first = seen[0];
    if (best.rank === 0) {
      if (!first.unknown && first.rank > 0) { const alt = options[seen.indexOf(best)]; return { state: 'ok', line: best.line, alt: alt.lines.join(' → '), words: `Line ${first.line}: ${first.level === 'blocked' ? 'interrupted' : 'disrupted'} — take line ${alt.lines.join(', then ')} instead`, title: first.title }; }
      return { state: 'ok', line: best.line, words: `Line${options[0].lines.length > 1 ? 's' : ''} ${options[0].lines.join(' & ')}: OK` };
    }
    const earlier = EARLIER[best.level] || 10;
    return { state: best.level, line: best.line, earlier, title: best.title, words: `⚠ Line ${best.line}: ${best.level === 'blocked' ? 'interrupted' : 'disrupted'} — leave ${earlier} min earlier?` };
  }

  // ---------- when to check ----------
  const routed = (it) => it && it.travel?.mode === 'metro' && Array.isArray(it.travel.lines) && it.travel.lines.length > 0;
  /** the one status check due next: the soonest reminder still on, on the Métro, not yet checked in its last 30 minutes */
  function nextCheck(items, now) {
    let best = null;
    for (const it of items || []) {
      if (it.state !== 'on' || !routed(it) || it.notifyAt <= now) continue;
      const at = it.notifyAt - CHECK_BEFORE;
      if (fin(it.checkedAt) && it.checkedAt >= at - MIN) continue; // already checked in its window
      const when = Math.max(at, now);
      if (!best || when < best.at) best = { key: it.key, at: when };
    }
    return best;
  }
  /** the reminders a check covers: on (or rung / snoozed: not left yet), on the Métro, leaving within `ahead` */
  const covered = (items, now, ahead) => (items || []).filter((it) => routed(it) && ['on', 'fired', 'snoozed'].includes(it.state) && it.leaveAt > now - 15 * MIN && it.leaveAt - now <= ahead);

  /** "Add your free PRIM key in Settings" and the other plain reasons a status is unknown */
  const WHY = { nokey: 'Add your free PRIM key in Settings › Housekeeping for live line status (the no-key source didn’t answer).', badkey: 'The PRIM key was refused: check it in Settings › Housekeeping.', offline: 'Offline (or the status source didn’t answer): the reminder still rings.', notcovered: 'The status source doesn’t cover these lines.', test: 'No status source in checks.' };
  const whyText = (why) => WHY[why] || WHY.offline;

  return { LAST_WEEK, LAST_WEEKEND, FIRST, NIGHT_WALK_MAX, CHECK_BEFORE, FRESH, FRESH_UNKNOWN, SOON, EARLIER, METRO, parts, wallAt, metroAt, night, stations, routeLines, routeWords, lineName, primTime, parsePrim, parseCommunity, verdict, nextCheck, covered, routed, whyText, plain };
});
