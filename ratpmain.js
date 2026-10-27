// (round 69, ratp69) The Paris Métro's line status, the main side: fetched only when a leave reminder needs it (its one
// check ~30 min before it rings, or when you open the ✦ tracker with a Métro trip coming up), never on a timer of its
// own. One answer serves every reminder for 10 minutes (2 when nothing answered). Providers, in order:
//   · prim       IDFM's PRIM "Perturbations" feed (free key, Settings › Housekeeping › Paris Métro status key…; the key
//                is kept like Hearth's other keys: encrypted on this computer by appsmain.js, sent only to PRIM in its
//                `apikey` header, never logged, never shown to a page or a chat)
//   · community  the community RATP API (no key; best effort: it may be down)
// Nothing personal goes out: the feeds are fetched whole (no place, no Home, no route, no line list in the request).
// Offline / refused / a strange answer → { state: 'unknown', why } and the reminder rings as always.
// Checks: HEARTH_RATP_BASE points both providers at dev/fake-ratp.js; in any smoke run without it nothing is fetched.
const R = require('./ratp-core');

const PROVIDERS = {
  prim: { url: (base) => `${base || 'https://prim.iledefrance-mobilites.fr'}${base ? '/prim' : ''}/marketplace/disruptions_bulk/disruptions/v2`, needsKey: true, parse: R.parsePrim },
  community: { url: (base) => `${base || 'https://api-ratp.pierre-grimaud.fr'}${base ? '/community' : ''}/v4/traffic/metros`, needsKey: false, parse: R.parseCommunity },
};

function defaultFetch() {
  try { const { net } = require('electron'); if (net?.fetch) return (u, o) => net.fetch(u, o); } catch { /* not in Electron */ }
  return typeof fetch === 'function' ? fetch : null;
}
function defaultKey() {
  try { return require('./appsmain').getKey('prim'); } catch { return null; } // appsmain: the same encrypted key store as Meshy's
}

function create({ fetch: doFetch = defaultFetch(), getKey = defaultKey, base = process.env.HEARTH_RATP_BASE || null, now = () => Date.now(), timeout = 8000, offline = !process.env.HEARTH_RATP_BASE && !!process.env.HEARTH_TEST_SAVE_DIR } = {}) {
  let cache = null, inflight = null;
  const log = []; // (checks) what was asked: provider, keyed or not, the answer's state — never the key
  async function one(name, key) {
    const p = PROVIDERS[name];
    const ac = typeof AbortController === 'function' ? new AbortController() : null;
    const t = ac ? setTimeout(() => ac.abort(), timeout) : null;
    try {
      const res = await doFetch(p.url(base), { headers: { accept: 'application/json', ...(p.needsKey ? { apikey: key } : {}) }, signal: ac?.signal });
      if (res.status === 401 || res.status === 403) return { state: 'unknown', why: 'badkey' };
      if (!res.ok) return { state: 'unknown', why: 'offline' };
      return { ...p.parse(await res.json(), now()), at: now() };
    } catch (err) {
      if (err?.name !== 'AbortError') console.warn('[ratp] status:', String(err?.message || err).slice(0, 120)); // the message only: no URL, no header
      return { state: 'unknown', why: 'offline' };
    } finally { if (t) clearTimeout(t); }
  }
  async function load() {
    if (offline || !doFetch) return { state: 'unknown', why: offline ? 'test' : 'offline', at: now() };
    let key = null; try { key = getKey() || null; } catch { key = null; }
    let last = null;
    for (const name of key ? ['prim', 'community'] : ['community']) {
      const r = await one(name, key);
      log.push({ provider: name, keyed: name === 'prim', state: r.state, why: r.why || null, at: now() });
      if (log.length > 40) log.shift();
      if (r.state === 'ok') return r;
      last = name === 'prim' ? r : last || r;
    }
    return { state: 'unknown', why: key ? last?.why || 'offline' : 'nokey', at: now() };
  }
  /** the line status (cached: 10 min, 2 min when unknown); fresh: true skips the cache */
  async function status({ fresh = false } = {}) {
    if (!fresh && cache && now() - cache.at < (cache.state === 'ok' ? R.FRESH : R.FRESH_UNKNOWN)) return cache;
    if (inflight) return inflight;
    inflight = load().then((r) => { cache = r; return r; }).finally(() => { inflight = null; });
    return inflight;
  }
  const hasKey = () => { try { return !!getKey(); } catch { return false; } };
  return { status, hasKey, forget: () => { cache = null; }, _log: log, get base() { return base; } };
}

module.exports = { create, PROVIDERS };
