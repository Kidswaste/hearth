// (round 61, showsync61) The saved sample responses in dev/fixtures/showsync as a fake fetch, for dev/showsync-test.js
// and the shows:test IPC (dev/checks/showsync61.js). No network: a URL without a fixture fails like being offline.
//   fakeFetch({ now, overrides: { url: { file | body, status, headers } | null }, hits }) → fetch(url, opts)
// {{D+n HH:MM}} in a text fixture becomes today + n days at HH:MM, local time, with its UTC offset.
const fs = require('fs');
const path = require('path');
const Core = require('../showsync-core');

const DIR = path.join(__dirname, 'fixtures', 'showsync');
const NOMINATIM_TRABENDO = Core.nominatimUrl('211 Avenue Jean Jaurès, 75019 Paris');
function fillDates(text, now = Date.now()) {
  return text.replace(/\{\{D\+(\d+) (\d\d):(\d\d)\}\}/g, (_, n, h, m) => {
    const d = new Date(now); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + Number(n)); d.setHours(Number(h), Number(m), 0, 0);
    const off = -d.getTimezoneOffset(), sign = off >= 0 ? '+' : '-', p = (x) => String(Math.floor(Math.abs(x))).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:00${sign}${p(off / 60)}:${p(off % 60)}`;
  });
}
function responses() {
  const map = JSON.parse(fs.readFileSync(path.join(DIR, 'responses.json'), 'utf8'));
  map[NOMINATIM_TRABENDO] = map['nominatim:Trabendo']; delete map['nominatim:Trabendo'];
  return map;
}
function fakeFetch({ now = Date.now(), overrides = {}, hits = [] } = {}) {
  const map = { ...responses(), ...(overrides.$programmes ? require('./showsync-programme-fixtures').fixtures(now).responses : {}), ...overrides };
  return async (url, opts = {}) => {
    hits.push({ url, headers: { ...(opts.headers || {}) } });
    const f = map[url];
    if (!f) throw Object.assign(new Error('offline (test fixture missing)'), { code: 'ENOTFOUND' });
    let buf = f.file ? fs.readFileSync(path.join(DIR, f.file)) : Buffer.from(f.body || '');
    if (!/\.png$/.test(f.file || '')) buf = Buffer.from(fillDates(buf.toString('utf8'), now));
    const status = f.status || 200;
    const res = new Response(status === 304 || status === 204 ? null : buf, { status, headers: f.headers || { 'content-type': 'text/html' } });
    Object.defineProperty(res, 'url', { value: url });
    return res;
  };
}
module.exports = { DIR, fillDates, responses, fakeFetch, NOMINATIM_TRABENDO };
