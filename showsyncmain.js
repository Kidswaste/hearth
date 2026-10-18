// (round 61, showsync61) This week's shows from Shotgun and DICE, fetched from the owner's own computer (the main
// process): politely, at most once a day per page (or when asked), nothing at all while idle. The pure parts are in
// showsync-core.js; required by main.js with one line (register(ipcMain, { dataDir })).
//   · robots.txt read once a day per site and obeyed; an honest user agent; If-None-Match / If-Modified-Since;
//     one site at a time, 1.5 s between requests to it; a protection page (Cloudflare…) stops that site until tomorrow
//   · data/showsync/: cache.json (last good shows per page + robots), geo.json (an address → coordinates, once),
//     logos.json + logos/<id>.png (each venue's public picture, shrunk to 96 px), settings.json (what to follow)
//     — careful reads (datasafe-core: a file that can't be read is never treated as empty, never saved over) and
//     atomic writes (crashsafe-core)
//   · coordinates the platform gives win; otherwise OpenStreetMap's Nominatim, ≤ 8 new addresses per refresh, 1.1 s
//     apart (its usage policy), cached forever (misses retried after 30 days)
// IPC: shows:get · shows:refresh ({ force }) · shows:settings (patch) · shows:follow (url) · shows:unfollow (id|name)
//      · shows:test (tests only: fixture responses instead of the network)
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const { pathToFileURL } = require('url');
const Core = require('./showsync-core');
const Programmes = require('./showsync-venues');
const DS = require('./datasafe-core');
const CS = require('./crashsafe-core');

const DAY = 86400e3;
const RETRY_AFTER = 20 * 3600e3; // "once a day", with some slack for a morning vs evening start
const MIN_GAP = 10 * 60e3; // even when asked, a page is fetched at most every 10 minutes
const BLOCK_PAUSE = DAY; // a site that asked for a browser check is left alone for a day
const MAX_HTML = 6 << 20, MAX_IMG = 3 << 20;

function create({ dataDir, fetch, shrink, wait = (ms) => new Promise((r) => setTimeout(r, ms)), now = () => Date.now(), log = () => {} }) {
  const dir = path.join(dataDir, 'showsync'), logoDir = path.join(dir, 'logos');
  const file = (n) => path.join(dir, n);
  const stores = {};
  function read(name, fallback) {
    if (stores[name]) return stores[name].value;
    const r = DS.load(fs, file(name), fallback);
    stores[name] = { value: r.value && typeof r.value === 'object' ? r.value : fallback, canSave: r.canSave };
    return stores[name].value;
  }
  async function save(name) {
    const s = stores[name]; if (!s || !s.canSave) return false; // never save over a file that couldn't be read
    await fsp.mkdir(dir, { recursive: true });
    await CS.writeAtomic(fsp, file(name), JSON.stringify(s.value));
    return true;
  }
  const settings = () => { const s = read('settings.json', { v: 1, enabled: false, from: 'paris', follows: [] }); s.follows ||= []; s.from ||= 'paris'; return s; };
  const cache = () => { const c = read('cache.json', Core.emptyCache()); c.sources ||= {}; c.robots ||= {}; c.hosts ||= {}; return c; };
  const geo = () => read('geo.json', {});
  const logos = () => read('logos.json', {});
  const sources = () => { const s = settings(); return [...(s.from === 'followed' ? [] : [...Core.defaultSources(), ...Programmes.sources()]), ...s.follows].filter((x, i, a) => x && a.findIndex((y) => y.id === x.id) === i).slice(0, 19); };

  // ---------- one polite request ----------
  const lastHit = new Map();
  async function politeFetch(url, o = {}) {
    const host = new URL(url).hostname, since = now() - (lastHit.get(host) || 0);
    if (since < 1500) await wait(1500 - since);
    lastHit.set(host, now());
    const res = await fetch(url, { headers: { 'User-Agent': Core.UA, 'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.8', ...(o.headers || {}) }, redirect: o.redirect || 'follow', signal: AbortSignal.timeout(o.timeout || 15000) });
    return res;
  }
  async function body(res, max) {
    const len = Number(res.headers.get('content-length') || 0); if (len > max) throw Error('too big');
    const buf = Buffer.from(await res.arrayBuffer()); if (buf.length > max) throw Error('too big');
    return buf;
  }
  // robots.txt once a day per site: 4xx = no rules, 5xx / unreachable = don't fetch (RFC 9309)
  async function robots(url) {
    const c = cache(), u = new URL(url), host = u.hostname, r = c.robots[host];
    if (!r || now() - r.at > DAY) {
      try {
        const res = await politeFetch(`https://${host}/robots.txt`, { headers: { Accept: 'text/plain' } });
        c.robots[host] = res.ok ? { at: now(), txt: (await body(res, 512 << 10)).toString('utf8').slice(0, 60000) } : res.status < 500 ? { at: now(), txt: '' } : { at: now(), txt: null };
      } catch { c.robots[host] = { at: now() - DAY + 3600e3, txt: null }; } // unreachable: try again in an hour
    }
    const txt = c.robots[host].txt;
    if (txt === null) return 'unknown';
    return Core.robotsAllows(txt, u.pathname + u.search) ? 'allow' : 'deny';
  }
  async function fetchSource(src, { htmlOnly = false, trustedOrigin = null, validators = null } = {}) {
    if (!htmlOnly && Programmes.config(src)) return fetchProgramme(src);
    const c = cache(), old = validators || c.sources[src.id], host = new URL(src.url).hostname;
    if (c.hosts[host]?.blockedUntil > now()) return { ok: false, blocked: true, status: c.hosts[host].status || 403 };
    const rb = await robots(src.url);
    if (rb === 'deny') return { ok: false, robots: true };
    if (rb === 'unknown') return { ok: false, status: 0 };
    const headers = { Accept: 'text/html,application/xhtml+xml' };
    if (old?.etag && (old.shows?.length || old.show)) headers['If-None-Match'] = old.etag;
    if (old?.lastModified && (old.shows?.length || old.show)) headers['If-Modified-Since'] = old.lastModified;
    let res; try { res = await politeFetch(src.url, { headers, redirect:trustedOrigin ? 'error' : 'follow' }); } catch (err) { log('fetch', src.url, err.message); return { ok: false, status: 0 }; }
    const meta = { etag: res.headers.get('etag'), lastModified: res.headers.get('last-modified') };
    if (res.status === 304) return { ok: true, notModified: true, status: 304, ...meta };
    let finalHost = host; try { finalHost = new URL(res.url || src.url).hostname; } catch { /* keep */ }
    if (trustedOrigin ? new URL(res.url || src.url).origin !== trustedOrigin : !Core.PLATFORMS[src.platform].host.test(finalHost)) return { ok: false, status: res.status || 0 }; // redirected off the reviewed source
    const challenge = /challenge/i.test(res.headers.get('cf-mitigated') || '');
    if (challenge || [401, 403, 429, 503].includes(res.status)) { c.hosts[host] = { blockedUntil: now() + BLOCK_PAUSE, status: res.status }; return { ok: false, blocked: true, status: res.status }; }
    if (!res.ok) return { ok: false, status: res.status };
    let html; try { html = (await body(res, MAX_HTML)).toString('utf8'); } catch { return { ok: false, status: res.status }; }
    if (Core.looksBlocked(html)) { c.hosts[host] = { blockedUntil: now() + BLOCK_PAUSE, status: res.status }; return { ok: false, blocked: true, status: res.status }; }
    if (htmlOnly) return { ok: true, status: res.status, html, ...meta };
    const parsed = Core.parsePage(html, src);
    if (parsed.blocked) { c.hosts[host] = { blockedUntil: now() + BLOCK_PAUSE, status: res.status }; return { ok: false, blocked: true, status: res.status }; }
    return { ok: true, status: res.status, shows: parsed.shows, via: parsed.via, ...meta };
  }

  async function fetchProgramme(src) {
    const trustedOrigin = new URL(src.url).origin;
    const page = await fetchSource(src, { htmlOnly:true, trustedOrigin, validators:{} });
    if (!page.ok) return page;
    const entries = read('programmes.json', {}), shows = []; let partial = false, unavailable = false;
    for (const { url } of Programmes.listing(page.html, src, now())) {
      const old = entries[url];
      if(unavailable){if(old?.show)shows.push(old.show);partial=true;continue;}
      if (old && now()-old.at < RETRY_AFTER) { if(old.show)shows.push(old.show); partial ||= !!old.failed; continue; }
      const result = await fetchSource({ ...src, url }, { htmlOnly:true, trustedOrigin, validators:old || {} });
      unavailable = !result.ok && (!result.status || result.blocked || result.robots || result.status>=500);
      const show = result.notModified && old?.show ? { ...old.show, programme:{ ...old.show.programme, checkedAt:now() } } : result.ok ? Programmes.event(result.html, src, url, now()) : null;
      const failed = !result.ok || (!show && (!!old?.show || !!Programmes.ticketUrl(result.html)));
      // A broken page keeps its last good event; a successful page without Shotgun tickets isn't invented.
      entries[url] = { at:now(), show:show || (failed ? old?.show : null), failed, etag:result.etag || old?.etag, lastModified:result.lastModified || old?.lastModified };
      if(entries[url].show)shows.push(entries[url].show);
      partial ||= failed;
    }
    // Bound the detail cache; only upcoming/recent events need to survive a restart.
    for (const [url, e] of Object.entries(entries)) if(e.at < now()-30*DAY)delete entries[url];
    return { ok:true, status:200, shows, via:'venue-programme', partial };
  }

  // ---------- coordinates and logos, once each ----------
  async function geocode(vs) {
    const g = geo(); let n = 0;
    for (const { key, v } of Core.geoNeeded(vs, g, now()).slice(0, 8)) {
      try {
        if (n++) await wait(1100);
        const res = await fetch(Core.nominatimUrl(v.address || `${v.name}, Paris`), { headers: { 'User-Agent': Core.UA, Accept: 'application/json' }, signal: AbortSignal.timeout(10000) });
        if (!res.ok) { if (res.status === 429 || res.status === 403) break; continue; }
        const hit = Core.parseGeo(await res.json());
        g[key] = hit ? { ...hit, at: now() } : { miss: true, at: now() };
      } catch { break; } // offline: the rest wait for the next refresh
    }
    if (n) await save('geo.json');
  }
  const logoFile = (url) => path.join(logoDir, `${Core.hash(url)}.png`);
  async function fetchLogos(vs) {
    const L = logos(); let n = 0;
    const want = vs.map((v) => v.image).filter((u, i, a) => u && a.indexOf(u) === i).filter((u) => !L[u] || (L[u].fail && now() - L[u].at > 7 * DAY) || (L[u].file && !fs.existsSync(logoFile(u))));
    for (const url of want.slice(0, 12)) {
      n++;
      try {
        const res = await politeFetch(url, { headers: { Accept: 'image/png,image/jpeg,image/gif,image/*;q=0.8' }, timeout: 12000 });
        if (!res.ok || !/^image\//i.test(res.headers.get('content-type') || '')) throw Error(`status ${res.status}`);
        const png = await shrink(await body(res, MAX_IMG));
        if (!png) throw Error('not a picture this computer can read');
        await fsp.mkdir(logoDir, { recursive: true });
        await CS.writeAtomic(fsp, logoFile(url), png);
        L[url] = { file: path.basename(logoFile(url)), at: now() };
      } catch (err) { L[url] = { fail: true, at: now(), why: String(err.message).slice(0, 80) }; }
    }
    if (n) await save('logos.json');
  }

  // ---------- refresh ----------
  let running = null;
  function refresh({ force = false } = {}) {
    if (running) return running;
    running = (async () => {
      const s = settings(); if (!s.enabled) { s.enabled = true; await save('settings.json'); }
      const c = cache(); let touched = 0;
      // The broad city page replaces concerts-only. Keep the last good list, but not its URL validators.
      const current = Core.defaultSources()[0], legacy = Core.sourceFromUrl('https://shotgun.live/en/concerts/paris');
      if (!c.sources[current.id] && c.sources[legacy.id]) c.sources[current.id] = { ...c.sources[legacy.id], id:current.id, url:current.url, lastTry:0, etag:null, lastModified:null };
      const update = async src => {
        const old = c.sources[src.id], age = now() - (old?.lastTry || 0);
        if (age < MIN_GAP || (!force && age < RETRY_AFTER)) return;
        touched++;
        Core.applyResult(c, src, await fetchSource(src), now());
      };
      const srcs = sources();
      for (const src of srcs.filter(s=>!Programmes.config(s))) await update(src);
      // Independent venue hosts can load together; each host still has one sequential, throttled reader.
      await Promise.all(srcs.filter(s=>Programmes.config(s)).map(update));
      await save('programmes.json');
      if (touched) { c.refreshedAt = now(); await save('cache.json'); }
      const vs = Core.venues(Core.allShows(c, sources()).filter((x) => x.start > now() - DAY));
      // Give the three recovery venues first use of the bounded geocoding budget, so a busy city feed cannot hide them.
      vs.sort((a,b)=>Number(b.shows.some(s=>s.programme))-Number(a.shows.some(s=>s.programme)));
      await geocode(vs);
      await fetchLogos(Core.applyGeo(vs, geo()).filter((v) => Core.inParis(v.lat, v.lon) || v.shows.some((x) => x.start < now() + 8 * DAY)));
      return snapshot();
    })().finally(() => { running = null; });
    return running;
  }
  // what the window shows: the merged upcoming list (3 weeks), coordinates / logos filled in, one status line
  function snapshot() {
    const s = settings(), c = cache(), srcs = sources(), g = geo(), L = logos();
    const shows = Core.allShows(c, srcs).filter((x) => (x.end || x.start + 4 * 3600e3) >= now() && x.start < now() + 21 * DAY).slice(0, 300);
    for (const x of shows) {
      if (!Number.isFinite(x.venue.lat)) { const hit = g[Core.geoKey(x.venue.address || `${x.venue.name} Paris`)]; if (hit && !hit.miss) { x.venue.lat = hit.lat; x.venue.lon = hit.lon; } }
      const lg = x.venue.image && L[x.venue.image]; x.venue.logo = lg?.file ? pathToFileURL(path.join(logoDir, lg.file)).href : '';
      if (!Number.isFinite(x.venue.lat)) { x.venue.lat = null; x.venue.lon = null; }
    }
    return { enabled: !!s.enabled, from: s.from, follows: s.follows, sources: srcs.map((x) => ({ ...x, problem: c.sources[x.id]?.problem || null, lastOk: c.sources[x.id]?.lastOk || null, count: c.sources[x.id]?.shows?.length || 0 })),
      shows, status: Core.statusLine(c, srcs, now()), refreshedAt: c.refreshedAt, stale: srcs.some(x=>!c.sources[x.id]?.lastTry || now()-c.sources[x.id].lastTry>RETRY_AFTER), busy: !!running };
  }
  async function setSettings(patch = {}) {
    const s = settings();
    if (patch.from === 'paris' || patch.from === 'followed') s.from = patch.from;
    if (typeof patch.enabled === 'boolean') s.enabled = patch.enabled;
    await save('settings.json'); return snapshot();
  }
  async function follow(url) {
    const src = Core.sourceFromUrl(url);
    if (!src) throw Error('Paste a Shotgun or DICE link: a venue (shotgun.live/…/venues/…, dice.fm/venue/…), an artist or an event.');
    const s = settings(); if (!s.follows.some((x) => x.id === src.id)) { if (s.follows.length >= 14) throw Error('Hearth follows up to 14 pages. Unfollow one first.'); s.follows.push(src); }
    await save('settings.json'); return src;
  }
  async function unfollow(q) {
    const s = settings(), f = Core.fold(q);
    const i = s.follows.findIndex((x) => x.id === q || Core.fold(x.label).includes(f) || x.url === q);
    if (i < 0) throw Error('Not followed.');
    const [gone] = s.follows.splice(i, 1); await save('settings.json'); return gone;
  }
  return { refresh, snapshot, setSettings, follow, unfollow, sources, _stores: stores, get busy() { return !!running; } };
}

// Electron: shrink a picture to ≤ 96 px PNG (nativeImage reads PNG / JPEG / GIF on every platform)
function electronShrink(buf) {
  const { nativeImage } = require('electron');
  const img = nativeImage.createFromBuffer(buf); if (img.isEmpty()) return null;
  const { width, height } = img.getSize(); if (!width || !height) return null;
  const out = width >= height ? img.resize({ width: Math.min(96, width), quality: 'good' }) : img.resize({ height: Math.min(96, height), quality: 'good' });
  return out.toPNG();
}

let api = null;
function register(ipcMain, { dataDir }) {
  const { net } = require('electron');
  let fetcher = (u, o) => net.fetch(u, o);
  api = create({ dataDir, fetch: (u, o) => fetcher(u, o), shrink: electronShrink, log: (...a) => console.warn('[showsync]', ...a) });
  const safe = (fn) => async (_e, ...a) => { try { return { ok: true, value: await fn(...a) } } catch (err) { return { ok: false, error: err.message } } };
  ipcMain.handle('shows:get', safe(() => api.snapshot()));
  ipcMain.handle('shows:refresh', safe((o) => api.refresh(o || {})));
  ipcMain.handle('shows:settings', safe((p) => api.setSettings(p || {})));
  ipcMain.handle('shows:follow', safe((u) => api.follow(u)));
  ipcMain.handle('shows:unfollow', safe((q) => api.unfollow(q)));
  // (round 62, showprep62) the show night reminder: one timer, only while a reminder is switched on (showprepmain.js)
  try { require('./showprepmain').register(ipcMain, { dataDir, getWin: () => require('electron').BrowserWindow.getAllWindows().find((w) => !w.isDestroyed() && /\/index\.html(?:[?#]|$)/.test(w.webContents.getURL())) }); } catch (err) { console.warn('[showprep]', err.message); }
  // tests only (dev/smoke.js): fixture responses instead of the network; a URL that has none fails like offline
  // { overrides } installs dev/fixtures/showsync (+ overrides: url → { file | body, status, headers } | null);
  // { advance: ms } moves the sync's clock on (so "tomorrow's" refresh can run); { report: true } → the URLs asked
  let hits = [], skew = 0, F = null;
  if (process.env.HEARTH_TEST_SAVE_DIR) ipcMain.handle('shows:test', safe(({ overrides, advance, report, dev } = {}) => {
    if (report) return { hits: hits.map((h) => h.url) };
    if (advance) { skew += advance; return { skew }; }
    F ||= require(path.join(dev || path.join(__dirname, 'dev'), 'showsync-fixtures.js')); // the smoke copy has no dev/: the check names the real one
    hits = []; fetcher = F.fakeFetch({ overrides: overrides || {}, hits });
    if (!api._test) { api = create({ dataDir, fetch: (u, o) => fetcher(u, o), shrink: electronShrink, wait: async () => {}, now: () => Date.now() + skew }); api._test = true; }
    return { ok: true };
  }));
}
module.exports = { create, register, electronShrink };
