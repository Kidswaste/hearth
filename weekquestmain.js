// (round 62, weekquest62) The week plan's forecast, main side: Paris's daily rain chance and high for the next 8 days from
// Open-Meteo (free, no key, no account). Asked only when the owner opens the week card (never in the background), kept
// 3 hours in memory, 5 s at most per try; unreachable or odd → { ok: false } and the card simply plans without weather.
const URL = 'https://api.open-meteo.com/v1/forecast?latitude=48.8566&longitude=2.3522&daily=temperature_2m_max,precipitation_probability_max&timezone=Europe%2FParis&forecast_days=8';
let cache = null; // { at, days }
function shape(j) {
  const d = j?.daily; if (!d || !Array.isArray(d.time)) return null;
  const days = d.time.map((date, i) => ({ date: String(date).slice(0, 10), tmax: Number(d.temperature_2m_max?.[i]), rain: Number(d.precipitation_probability_max?.[i]) }))
    .filter((x) => /^\d{4}-\d{2}-\d{2}$/.test(x.date) && Number.isFinite(x.tmax) && Number.isFinite(x.rain));
  return days.length ? days.slice(0, 8) : null;
}
async function weather({ fetch: f = globalThis.fetch, now = Date.now() } = {}) {
  if (cache && now - cache.at < 3 * 3600e3) return { ok: true, days: cache.days, cached: true };
  try {
    const res = await f(URL, { headers: { 'User-Agent': 'Hearth/62 (weekly quest plan; once per look)', Accept: 'application/json' }, signal: AbortSignal.timeout(5000) });
    if (!res.ok) return { ok: false, why: `HTTP ${res.status}` };
    const days = shape(await res.json()); if (!days) return { ok: false, why: 'unexpected answer' };
    cache = { at: now, days }; return { ok: true, days };
  } catch (err) { return { ok: false, why: err.name === 'TimeoutError' ? 'timeout' : 'offline' }; }
}
function register(ipcMain) {
  const { net } = require('electron');
  ipcMain.handle('weekquest:weather', () => weather({ fetch: (u, o) => net.fetch(u, o) }));
}
module.exports = { register, weather, shape, URL, _reset: () => { cache = null; } };
