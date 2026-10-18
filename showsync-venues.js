// Shotgun ticketed nights, independently published by the venues themselves.
// Only these reviewed programme/detail URLs are read; no proxy, account or browser automation.
const Core = require('./showsync-core');
const DAY = 86400e3;
const VENUES = [
  { slug: 'badaboum', name: 'Badaboum', url: 'https://badaboum.paris/agenda/', prefix: '/evenement/', address: '2 Rue des Taillandiers, 75011 Paris' },
  { slug: 'mia-mao', name: 'Mia Mao', url: 'https://www.miamao.fr/agenda/', prefix: '/show/', address: '2 Rue de la Clôture, 75019 Paris' },
  { slug: 'glazart', name: 'Glazart', url: 'https://www.glazart.com/agenda-concerts/', prefix: /^\/\d{2}-\d{2}-\d{2}-[\w-]+\/$/, address: '7 Avenue de la Porte de la Villette, 75019 Paris' }
];
const sources = () => VENUES.map(v => ({ id: 'shotgun-programme-' + v.slug, platform: 'shotgun', kind: 'programme', url: v.url, label: v.name + ' · venue programme' }));
const config = src => VENUES.find(v => src.id === 'shotgun-programme-' + v.slug && src.url === v.url);
const decode = s => String(s || '').replace(/&#(x[\da-f]+|\d+);/gi, (m, n) => { const c = n[0].toLowerCase() === 'x' ? parseInt(n.slice(1), 16) : +n; return c > 0 && c <= 0x10ffff ? String.fromCodePoint(c) : m; }).replace(/&(amp|nbsp|quot|apos|rsquo|lsquo|ndash|mdash|gt|lt);/g, (_, n) => ({ amp:'&', nbsp:' ', quot:'"', apos:"'", rsquo:'’', lsquo:'‘', ndash:'–', mdash:'—', gt:'>', lt:'<' }[n]));
const clean = s => decode(String(s || '').replace(/<!--[\s\S]*?-->/g, '').replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, '').replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
const field = (html, cls) => clean(new RegExp('<([a-z][\\w-]*)\\b[^>]*class=["\'][^"\']*\\b' + cls + '\\b[^"\']*["\'][^>]*>([\\s\\S]*?)<\\/\\1>', 'i').exec(html)?.[2]);
const months = ['jan', 'fev', 'mar', 'avr', 'mai', 'juin', 'juil', 'aou', 'sep', 'oct', 'nov', 'dec'];
function dateParts(text) {
  const s = Core.fold(text), n = /\b(\d{1,2})[./](\d{1,2})[./](\d{4}|\d{2})\b/.exec(s);
  if (n) return [+n[3] < 100 ? 2000 + +n[3] : +n[3], +n[2], +n[1]];
  const m = /\b(\d{1,2})\s+([a-z]+),?\s+(20\d{2})\b/.exec(s);
  if (!m) return null;
  const mon = months.findIndex(x => m[2].startsWith(x));
  return mon < 0 ? null : [+m[3], mon + 1, +m[1]];
}
// Convert published Paris wall time, including DST, independently of the computer's time zone.
const paris = new Intl.DateTimeFormat('en-GB', { timeZone:'Europe/Paris', year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', hourCycle:'h23' });
function parisTime(parts, hm = [0, 0]) {
  if (!parts || parts[0] < 2020 || parts[0] > 2100 || hm[0] > 23 || hm[1] > 59) return NaN;
  const [y,m,d] = parts, [h,minute] = hm, target = Date.UTC(y,m-1,d,h,minute);
  let t = target;
  for (let i = 0; i < 3; i++) { const p = Object.fromEntries(paris.formatToParts(t).map(x => [x.type, x.value])); t += target - Date.UTC(+p.year,+p.month-1,+p.day,+p.hour,+p.minute); }
  const p = Object.fromEntries(paris.formatToParts(t).map(x => [x.type, x.value]));
  return +p.year===y && +p.month===m && +p.day===d && +p.hour===h && +p.minute===minute ? t : NaN;
}
function detailUrl(value, src) {
  const v = config(src); if (!v) return '';
  try { const u = new URL(decode(value), src.url); if (u.origin !== new URL(v.url).origin || u.username || u.password || u.search || u.hash) return '';
    const match = typeof v.prefix === 'string' ? u.pathname.startsWith(v.prefix) && /^[\w-]+\/$/.test(u.pathname.slice(v.prefix.length)) : v.prefix.test(u.pathname);
    return match ? u.href : '';
  } catch { return ''; }
}
function listing(html, src, now = Date.now()) {
  const found = new Map();
  for (const a of String(html).matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const url = detailUrl(a[1], src); if (!url) continue;
    const date = dateParts(clean(a[2])) || dateParts(new URL(url).pathname.replace(/-/g, '.'));
    const day = parisTime(date);
    if (Number.isFinite(day) && day >= now - DAY && day < now + 21 * DAY) found.set(url, { url, day });
  }
  return [...found.values()].sort((a,b) => a.day-b.day).slice(0, 24);
}
function ticketUrl(html) {
  return [...String(html || '').matchAll(/<a\b[^>]*href=["']([^"']+)["']/gi)].map(m => Core.sourceFromUrl(decode(m[1]))).find(s => s?.platform === 'shotgun' && s.kind === 'event')?.url || '';
}
function event(html, src, url, now = Date.now()) {
  const v = config(src); if (!v || !detailUrl(url, src) || Core.looksBlocked(html)) return null;
  let title, date, hours;
  if (v.slug === 'badaboum') { title = clean(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i.exec(html)?.[1]); date = field(html, 'date'); hours = field(html, 'heure'); }
  else if (v.slug === 'mia-mao') { title = field(html, 'c-record_title'); date = field(html, 'c-date'); hours = date; }
  else { const ps = [...html.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)].map(m => clean(m[1])); const i = ps.findIndex(p => /\d{2}\.\d{2}\.20\d{2}\s*>/.test(p)); if (i < 0) return null; date = hours = ps[i]; title = ps[i+1]; }
  const startHours = v.slug === 'badaboum' ? hours : (hours || '').replace(/^.*?(?:>|—)\s*/, '');
  const time = /^(\d{1,2})[hH:](\d{2})?(?=\s|[-–—]|$)/.exec(startHours || ''), parts = dateParts(date);
  if (!title || !time || !parts) return null; // no guessed midnight start
  const start = parisTime(parts, [+time[1], +(time[2] || 0)]); if (!Number.isFinite(start)) return null;
  const ticket = ticketUrl(html);
  if (!ticket) return null; // never relabel another ticket service as Shotgun
  let end = null;
  const span = /\b(\d{1,2})[hH:](\d{2})?\s*[-–—]\s*(\d{1,2})[hH:](\d{2})?/i.exec(v.slug === 'mia-mao' ? clean(html) : hours);
  if (span) { let next = parts; if (+span[3]*60+ +(span[4]||0) <= +time[1]*60+ +(time[2]||0)) { const d = new Date(Date.UTC(parts[0],parts[1]-1,parts[2]+1)); next=[d.getUTCFullYear(),d.getUTCMonth()+1,d.getUTCDate()]; } const e=parisTime(next,[+span[3],+(span[4]||0)]); if(e>start && e-start<DAY)end=e; }
  const s = Core.fromEvent({ name:title, startDate:new Date(start).toISOString(), endDate:end?new Date(end).toISOString():null, url:ticket, location:{ name:v.name, address:v.address }, eventStatus:/\b(annule|cancelled|reporte)\b/i.test(Core.fold(title))?'EventCancelled':undefined }, src);
  if (s) s.programme = { name:v.name, url, checkedAt:now };
  return s;
}
module.exports = { sources, config, detailUrl, listing, event, ticketUrl, parisTime, dateParts };
