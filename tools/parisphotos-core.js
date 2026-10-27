// (round 69, photos69) Photos in My Paris: the thinking, with no DOM (node-tested by dev/photos69-test.js; also required
// by parisphotosmain.js to read a folder's photos). It reads EXIF from the photo's own bytes (JPEG APP1, HEIC's Exif
// item, PNG's eXIf chunk): when it was taken, where (GPS), which way up. It turns a camera's wall-clock time into a real
// moment in time (the photo's own offset, else its GPS clock, else the time zone of the computer: Paris for the owner,
// summer / winter time included), sizes the copies Hearth keeps (long edge 2048 + a 400 px thumb), names them, keeps
// the small list of which photo belongs to which My Paris moment (kv paris-photos), and SUGGESTS which photos of a
// folder go with which moment by time and, when both have one, by distance. Suggestions only: nothing is added here.
// Nothing here fetches, uploads or calls an AI. The owner's original photos are only ever read.
(function (root, make) { if (typeof module === 'object') module.exports = make(); else root.ParisPhotosCore = make(); })(typeof self !== 'undefined' ? self : this, () => {
  const KV = 'paris-photos';
  const BIG = 2048, THUMB = 400, MAX_PER_MOMENT = 60, MAX_BYTES = 60 * 1048576;
  const EXT = /\.(jpe?g|png|heic|heif)$/i;
  const pad = (n, w = 2) => String(n).padStart(w, '0');

  // ---------- what a file is ----------
  /** 'jpeg' | 'png' | 'heic' | '' from the first bytes (the name can lie). */
  function kindOf(b) {
    if (!b || b.length < 12) return '';
    if (b[0] === 0xff && b[1] === 0xd8) return 'jpeg';
    if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'png';
    const box = String.fromCharCode(b[4], b[5], b[6], b[7]), brand = String.fromCharCode(b[8], b[9], b[10], b[11]);
    if (box === 'ftyp' && /^(heic|heix|heim|heis|hevc|hevx|mif1|msf1|avif)$/.test(brand)) return brand === 'avif' ? '' : 'heic';
    return '';
  }
  const isPhotoName = (name) => EXT.test(String(name || ''));

  // ---------- EXIF ----------
  // TIFF types: size of one value
  const SIZE = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8 };
  function tiff(b, start) {
    if (start < 0 || start + 8 > b.length) return null;
    const le = b[start] === 0x49 && b[start + 1] === 0x49, be = b[start] === 0x4d && b[start + 1] === 0x4d;
    if (!le && !be) return null;
    const u16 = (o) => (o + 2 > b.length ? NaN : le ? b[o] | (b[o + 1] << 8) : (b[o] << 8) | b[o + 1]);
    const u32 = (o) => (o + 4 > b.length ? NaN : le ? (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16)) + b[o + 3] * 0x1000000 : b[o] * 0x1000000 + ((b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]));
    if (u16(start + 2) !== 42) return null;
    function ifd(off) {
      const out = {}, at = start + off, n = u16(at);
      if (!Number.isFinite(n) || n > 400 || at + 2 + n * 12 > b.length) return out;
      for (let i = 0; i < n; i++) {
        const e = at + 2 + i * 12, tag = u16(e), type = u16(e + 2), count = u32(e + 4), size = (SIZE[type] || 0) * count;
        if (!size || size > 65536) continue;
        const v = size <= 4 ? e + 8 : start + u32(e + 8);
        if (!Number.isFinite(v) || v + size > b.length) continue;
        if (type === 2) { let s = ''; for (let k = 0; k < count; k++) { const c = b[v + k]; if (!c) break; s += String.fromCharCode(c); } out[tag] = s.trim(); }
        else if (type === 3) out[tag] = count === 1 ? u16(v) : Array.from({ length: count }, (_, k) => u16(v + 2 * k));
        else if (type === 4 || type === 9) out[tag] = count === 1 ? u32(v) : Array.from({ length: count }, (_, k) => u32(v + 4 * k));
        else if (type === 5 || type === 10) out[tag] = Array.from({ length: count }, (_, k) => { const d = u32(v + 8 * k + 4); return d ? u32(v + 8 * k) / d : 0; });
        else if (type === 1 || type === 7) out[tag] = count <= 4 ? Array.from(b.subarray(v, v + count)) : null;
      }
      return out;
    }
    const i0 = ifd(u32(start + 4)), ex = Number.isFinite(i0[0x8769]) ? ifd(i0[0x8769]) : {}, gp = Number.isFinite(i0[0x8825]) ? ifd(i0[0x8825]) : {};
    const dms = (a, ref) => (Array.isArray(a) && a.length === 3 && a.every(Number.isFinite) ? (a[0] + a[1] / 60 + a[2] / 3600) * (/^[SW]/i.test(ref || '') ? -1 : 1) : null);
    const lat = dms(gp[2], gp[1]), lon = dms(gp[4], gp[3]);
    const gpsOk = lat !== null && lon !== null && Math.abs(lat) <= 90 && Math.abs(lon) <= 180 && !(lat === 0 && lon === 0);
    const gt = Array.isArray(gp[7]) && gp[7].length === 3 ? gp[7] : null;
    return {
      date: ex[0x9003] || ex[0x9004] || i0[0x0132] || '', offset: ex[0x9011] || ex[0x9010] || '',
      orientation: Number.isInteger(i0[0x0112]) && i0[0x0112] >= 1 && i0[0x0112] <= 8 ? i0[0x0112] : 1,
      gps: gpsOk ? { lat: Math.round(lat * 1e6) / 1e6, lon: Math.round(lon * 1e6) / 1e6 } : null,
      gpsTime: gpsOk && gp[0x1d] && gt ? `${gp[0x1d].replace(/:/g, '-')}T${pad(Math.floor(gt[0]))}:${pad(Math.floor(gt[1]))}:${pad(Math.floor(gt[2]))}Z` : '',
      make: i0[0x010f] || '', model: i0[0x0110] || '',
    };
  }
  // "Exif\0\0" then a TIFF header: how HEIC keeps it (and a fallback for odd JPEGs)
  function findTiff(b, from = 0, to = b.length) {
    for (let i = from; i + 10 < to; i++) {
      if (b[i] !== 0x45 || b[i + 1] !== 0x78 || b[i + 2] !== 0x69 || b[i + 3] !== 0x66 || b[i + 4] || b[i + 5]) continue;
      const t = i + 6; if ((b[t] === 0x49 && b[t + 1] === 0x49 && b[t + 2] === 42) || (b[t] === 0x4d && b[t + 1] === 0x4d && b[t + 3] === 42)) return t;
    }
    return -1;
  }
  /** EXIF of a photo's bytes (the whole file or its first part): { date, offset, orientation, gps, gpsTime, w, h } or null. */
  function readExif(input) {
    const b = input instanceof Uint8Array ? input : new Uint8Array(input || []), kind = kindOf(b);
    let t = -1, w = 0, h = 0;
    if (kind === 'jpeg') {
      for (let o = 2; o + 4 <= b.length;) {
        if (b[o] !== 0xff) break;
        const m = b[o + 1]; if (m === 0xd8 || (m >= 0xd0 && m <= 0xd7) || m === 0x01) { o += 2; continue; }
        if (m === 0xda || m === 0xd9) break;
        const len = (b[o + 2] << 8) | b[o + 3]; if (len < 2) break;
        if (m === 0xe1 && t < 0 && b[o + 4] === 0x45 && b[o + 5] === 0x78 && b[o + 6] === 0x69 && b[o + 7] === 0x66) t = o + 10;
        if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc && o + 9 <= b.length) { h = (b[o + 5] << 8) | b[o + 6]; w = (b[o + 7] << 8) | b[o + 8]; }
        o += 2 + len;
      }
    } else if (kind === 'png') {
      if (b.length >= 24) { w = ((b[16] << 24) >>> 0) + ((b[17] << 16) | (b[18] << 8) | b[19]); h = ((b[20] << 24) >>> 0) + ((b[21] << 16) | (b[22] << 8) | b[23]); }
      for (let o = 8; o + 12 <= b.length;) {
        const len = ((b[o] << 24) >>> 0) + ((b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]), type = String.fromCharCode(b[o + 4], b[o + 5], b[o + 6], b[o + 7]);
        if (type === 'eXIf') { t = o + 8; break; }
        if (type === 'IDAT' || type === 'IEND') break;
        o += 12 + len;
      }
    } else if (kind === 'heic') t = findTiff(b, 0, Math.min(b.length, 4 * 1048576));
    else return null;
    const x = t >= 0 ? tiff(b, t) : null;
    return { kind, date: '', offset: '', orientation: 1, gps: null, gpsTime: '', make: '', model: '', ...(x || {}), w, h };
  }

  // ---------- time: a camera's wall clock → a real moment ----------
  const fmts = new Map();
  /** minutes ahead of UTC in an IANA zone at a moment (Europe/Paris: +120 in summer, +60 in winter) */
  function zoneOffset(zone, t) {
    let f = fmts.get(zone);
    if (!f) { f = new Intl.DateTimeFormat('en-US', { timeZone: zone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }); fmts.set(zone, f); }
    const p = Object.fromEntries(f.formatToParts(new Date(t)).map((x) => [x.type, x.value]));
    return Math.round((Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second) - Math.floor(t / 1000) * 1000) / 60000);
  }
  /** a wall-clock time in a zone → ms. The hour that happens twice (late October) is the first one (summer time); the
   * hour that doesn't exist (late March) moves forward, the way a clock does. */
  function fromZone(y, mo, d, h, mi, s, zone) {
    const guess = Date.UTC(y, mo - 1, d, h, mi, s);
    const offs = [...new Set([zoneOffset(zone, guess - 864e5), zoneOffset(zone, guess + 864e5)])];
    const ok = offs.map((o) => guess - o * 60000).filter((t) => zoneOffset(zone, t) * 60000 === guess - t).sort((a, b) => a - b);
    return ok.length ? ok[0] : guess - offs[0] * 60000;
  }
  const offsetMin = (s) => { const m = /^([+-])(\d\d):?(\d\d)$/.exec(String(s || '').trim()); return m ? (m[1] === '-' ? -1 : 1) * (+m[2] * 60 + +m[3]) : null; };
  /** When the photo was taken: { at (ms), from: 'offset' | 'gps' | 'zone', local: 'YYYY-MM-DD HH:MM' } or null.
   *   offset: the camera wrote its own UTC offset (phones since ~2018) → exact, wherever it was taken
   *   gps:    the GPS clock (UTC) agrees with the wall clock within 14 h → exact
   *   zone:   the wall clock read in `zone` (the computer's time zone; Paris for the owner) */
  function takenAt(x, { zone = 'Europe/Paris' } = {}) {
    const m = /^(\d{4})[:-](\d\d)[:-](\d\d)[ T](\d\d):(\d\d)(?::(\d\d))?/.exec(String(x?.date || ''));
    if (!m) return null;
    const [y, mo, d, h, mi, s] = m.slice(1).map((v) => Number(v || 0));
    if (y < 1990 || mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59) return null;
    const local = `${y}-${pad(mo)}-${pad(d)} ${pad(h)}:${pad(mi)}`, wall = Date.UTC(y, mo - 1, d, h, mi, s);
    const o = offsetMin(x.offset); if (o !== null) return { at: wall - o * 60000, from: 'offset', local };
    const g = x.gpsTime ? Date.parse(x.gpsTime) : NaN;
    if (Number.isFinite(g) && Math.abs(wall - g) <= 14 * 3600e3) { const off = Math.round((wall - g) / 900e3) * 900e3; return { at: wall - off, from: 'gps', local }; } // the offset the camera was at, to the quarter hour
    try { return { at: fromZone(y, mo, d, h, mi, s, zone), from: 'zone', local }; } catch { return { at: wall, from: 'zone', local }; }
  }
  /** the day / clock words of a moment in a zone ("24 Oct · 21:40") */
  function clock(t, zone = 'Europe/Paris') {
    try { return new Date(t).toLocaleString('en-GB', { timeZone: zone, day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false }).replace(',', ' ·'); } catch { return new Date(t).toISOString().slice(0, 16).replace('T', ' '); }
  }
  const dayIn = (t, zone) => { try { return new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(t)); } catch { return new Date(t).toISOString().slice(0, 10); } };

  // ---------- the copies Hearth keeps ----------
  /** the size of a copy: the long edge at most `long`, never bigger than the photo */
  function fit(w, h, long) {
    w = Math.max(1, Math.round(w || 1)); h = Math.max(1, Math.round(h || 1));
    const k = Math.min(1, long / Math.max(w, h));
    return { w: Math.max(1, Math.round(w * k)), h: Math.max(1, Math.round(h * k)) };
  }
  /** which way the pixels go after EXIF orientation 5–8 (a quarter turn): width and height swap */
  const turned = (o) => o >= 5 && o <= 8;
  /** the copies' names, inside Hearth's data folder: paris-photos/<YYYY-MM>/<id>.jpg and <id>.thumb.jpg */
  function names(id, month) {
    if (!/^ph-[a-z0-9-]{4,60}$/.test(id) || !/^\d{4}-\d\d$/.test(month)) throw Error('bad photo id');
    return { file: `paris-photos/${month}/${id}.jpg`, thumb: `paris-photos/${month}/${id}.thumb.jpg` };
  }
  const REL = /^paris-photos\/\d{4}-\d\d\/ph-[a-z0-9-]{4,60}(\.thumb)?\.jpg$/;
  const newId = (t, rnd) => `ph-${new Date(t).toISOString().slice(0, 10).replace(/-/g, '')}-${String(rnd).toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 10) || 'x'}`;

  /** An EXIF block (an APP1 segment) for a copy: when it was taken, and where only when the owner keeps it. Also used by
   * the tests to make photos the way phones do. { date: 'YYYY:MM:DD HH:MM:SS', offset: '+02:00', gps: { lat, lon },
   * gpsTime: ISO, orientation } */
  function makeExif({ date = '', offset = '', gps = null, gpsTime = '', orientation = 0, make = '' } = {}) {
    const ascii = (s) => { const a = [...String(s)].map((c) => c.charCodeAt(0) & 0x7f); a.push(0); return a; };
    const rat = (vals) => vals.flatMap(([n, d]) => [n >>> 24 & 255, n >>> 16 & 255, n >>> 8 & 255, n & 255, d >>> 24 & 255, d >>> 16 & 255, d >>> 8 & 255, d & 255]);
    const dms = (v) => { v = Math.abs(v); const d = Math.floor(v), m = Math.floor((v - d) * 60), s = Math.round(((v - d) * 60 - m) * 60 * 10000); return rat([[d, 1], [m, 1], [s, 10000]]); };
    const e = (tag, type, count, bytes) => ({ tag, type, count, bytes });
    const i0 = [], ex = [], gp = [];
    if (make) i0.push(e(0x010f, 2, ascii(make).length, ascii(make)));
    if (orientation) i0.push(e(0x0112, 3, 1, [0, orientation, 0, 0]));
    if (date) ex.push(e(0x9003, 2, 20, ascii(date).concat(Array(20).fill(0)).slice(0, 20)));
    if (offset) ex.push(e(0x9011, 2, 7, ascii(offset).slice(0, 7)));
    if (gps) {
      gp.push(e(1, 2, 2, [gps.lat < 0 ? 83 : 78, 0, 0, 0]), e(2, 5, 3, dms(gps.lat)), e(3, 2, 2, [gps.lon < 0 ? 87 : 69, 0, 0, 0]), e(4, 5, 3, dms(gps.lon)));
      if (gpsTime) { const g = new Date(gpsTime); gp.push(e(7, 5, 3, rat([[g.getUTCHours(), 1], [g.getUTCMinutes(), 1], [g.getUTCSeconds(), 1]])), e(0x1d, 2, 11, ascii(g.toISOString().slice(0, 10).replace(/-/g, ':')))); }
    }
    const ptrs = (ex.length ? 1 : 0) + (gp.length ? 1 : 0);
    const sizeOf = (list, extra = 0) => { const n = list.length + extra; return 2 + 12 * n + 4 + list.reduce((a, x) => a + (x.bytes.length > 4 ? x.bytes.length + (x.bytes.length & 1) : 0), 0); };
    const s0 = sizeOf(i0, ptrs), sEx = ex.length ? sizeOf(ex) : 0, exOff = 8 + s0, gpOff = exOff + sEx;
    if (ex.length) i0.push(e(0x8769, 4, 1, [exOff >>> 24 & 255, exOff >>> 16 & 255, exOff >>> 8 & 255, exOff & 255]));
    if (gp.length) i0.push(e(0x8825, 4, 1, [gpOff >>> 24 & 255, gpOff >>> 16 & 255, gpOff >>> 8 & 255, gpOff & 255]));
    const out = [0x4d, 0x4d, 0, 42, 0, 0, 0, 8];
    const write = (list, base) => {
      list.sort((a, b) => a.tag - b.tag);
      const head = [], data = []; let dOff = base + 2 + 12 * list.length + 4;
      head.push(list.length >> 8, list.length & 255);
      for (const x of list) {
        head.push(x.tag >> 8, x.tag & 255, x.type >> 8, x.type & 255, x.count >>> 24 & 255, x.count >>> 16 & 255, x.count >>> 8 & 255, x.count & 255);
        if (x.bytes.length <= 4) head.push(...x.bytes, ...Array(4 - x.bytes.length).fill(0));
        else { head.push(dOff >>> 24 & 255, dOff >>> 16 & 255, dOff >>> 8 & 255, dOff & 255); data.push(...x.bytes); if (x.bytes.length & 1) data.push(0); dOff += x.bytes.length + (x.bytes.length & 1); }
      }
      head.push(0, 0, 0, 0); out.push(...head, ...data);
    };
    write(i0, 8); if (ex.length) write(ex, exOff); if (gp.length) write(gp, gpOff);
    const body = [0x45, 0x78, 0x69, 0x66, 0, 0, ...out], len = body.length + 2;
    return new Uint8Array([0xff, 0xe1, len >> 8, len & 255, ...body]);
  }
  /** a JPEG with every EXIF / XMP block taken out (and `app1` put in its place when given): what Hearth stores */
  function withExif(jpeg, app1 = null) {
    const b = jpeg instanceof Uint8Array ? jpeg : new Uint8Array(jpeg);
    if (kindOf(b) !== 'jpeg') return b;
    const parts = [b.subarray(0, 2)]; if (app1) parts.push(app1);
    let o = 2;
    while (o + 4 <= b.length && b[o] === 0xff) {
      const m = b[o + 1]; if (m === 0xda) break;
      const len = (b[o + 2] << 8) | b[o + 3];
      if (m !== 0xe1) parts.push(b.subarray(o, o + 2 + len)); // APP1 = EXIF / XMP (GPS lives there): dropped
      o += 2 + len;
    }
    parts.push(b.subarray(o));
    const out = new Uint8Array(parts.reduce((a, p) => a + p.length, 0)); let k = 0; for (const p of parts) { out.set(p, k); k += p.length; }
    return out;
  }
  const exifDate = (t, zone) => { try { const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: zone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(new Date(t)).map((x) => [x.type, x.value])); return `${p.year}:${p.month}:${p.day} ${pad(+p.hour % 24)}:${p.minute}:${p.second}`; } catch { return ''; } };
  const offsetWords = (min) => `${min < 0 ? '-' : '+'}${pad(Math.floor(Math.abs(min) / 60))}:${pad(Math.abs(min) % 60)}`;

  // ---------- which moment a photo belongs to ----------
  /** meters between two points */
  function meters(a, b) {
    const R = 6371000, r = Math.PI / 180, dLat = (b.lat - a.lat) * r, dLon = (b.lon - a.lon) * r;
    const x = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(x)));
  }
  const H = 3600e3;
  /** the time a moment covers, in ms: a show from an hour before it starts to 7 h after (doors to the last métro); a
   * place visit the 4 h before you ticked it done (+1 h); a walk from its first stop to its last; a park session from
   * its first take to its last; a music session for its length; ±1 h of slack around the walks and sessions */
  function windowOf(m) {
    const at = Date.parse(m?.at); if (!Number.isFinite(at)) return null;
    const from = Date.parse(m.from), until = Date.parse(m.until);
    if (m.kind === 'show') return [at - H, at + 7 * H];
    if (m.kind === 'walk') return [(Number.isFinite(from) ? from : at - 3 * H) - H, at + H];
    if (m.kind === 'park') return [at - H, (Number.isFinite(until) ? until : at) + H];
    if (m.kind === 'music') return [at - H / 2, (Number.isFinite(until) ? until : at + H) + H / 2];
    return [at - 4 * H, at + H];
  }
  const spotsOf = (m) => [m.place, ...(m.spots || [])].filter((p) => p && Number.isFinite(p.lat) && Number.isFinite(p.lon));
  /** How well a photo fits a moment: { score 0–1, why } or null. Time decides (inside the moment's window, or the same
   * day when the photo was taken close by); a photo with GPS more than 2 km from every spot of a moment with a place is
   * never suggested for it. A photo with no date of its own (only the file's date) counts less. */
  function fitOf(ph, m, { zone = 'Europe/Paris' } = {}) {
    const w = windowOf(m); if (!w || !Number.isFinite(ph?.at)) return null;
    const spots = spotsOf(m);
    let d = null, near = null;
    if (ph.gps && spots.length) { for (const p of spots) { const x = meters(ph.gps, p); if (d === null || x < d) { d = x; near = p; } } if (d > 2000) return null; }
    let t;
    if (ph.at >= w[0] && ph.at <= w[1]) t = 1;
    else if (d !== null && d <= 500 && dayIn(ph.at, zone) === dayIn(Date.parse(m.at), zone)) t = 0.5;
    else return null;
    const where = d === null ? 0.7 : d <= 300 ? 1 : d <= 1000 ? 0.85 : 0.6;
    const score = Math.round(t * where * (ph.from === 'file' ? 0.6 : 1) * 1000) / 1000;
    const bits = [`taken ${clock(ph.at, zone)}${ph.from === 'file' ? ' (file date)' : ''}`];
    if (d !== null) bits.push(d < 1000 ? `${Math.max(10, Math.round(d / 10) * 10)} m from ${near.name || 'the place'}` : `${(d / 1000).toFixed(1)} km from ${near.name || 'the place'}`);
    else if (t === 1) bits.push(m.kind === 'show' ? 'during the show' : m.kind === 'walk' ? 'during the walk' : m.kind === 'park' || m.kind === 'music' ? 'during the session' : 'around your visit');
    return { score, why: bits.join(' · '), meters: d };
  }
  /** Folder photos ({ path, at, from, gps }) → suggestions per moment, best first. Each photo goes to at most one moment
   * (its best fit, ≥ 0.35); photos already kept for that moment (same hash or same original path) are left out. */
  function suggest(photos, moments, { zone = 'Europe/Paris', kept = null, min = 0.35 } = {}) {
    const groups = new Map(), unmatched = []; let noDate = 0, already = 0;
    for (const ph of photos || []) {
      if (!Number.isFinite(ph.at)) { noDate++; continue; }
      let best = null;
      for (const m of moments || []) { const f = fitOf(ph, m, { zone }); if (f && f.score >= min && (!best || f.score > best.f.score || (f.score === best.f.score && Math.abs(ph.at - Date.parse(m.at)) < Math.abs(ph.at - Date.parse(best.m.at))))) best = { m, f }; }
      if (!best) { unmatched.push(ph.path); continue; }
      if (kept && keptFor(kept, best.m).some((k) => (ph.hash && k.hash === ph.hash) || (ph.path && k.source === ph.path))) { already++; continue; }
      const g = groups.get(best.m.id) || { moment: best.m.id, title: best.m.title, kind: best.m.kind, at: best.m.at, photos: [] };
      g.photos.push({ path: ph.path, name: ph.name || '', at: ph.at, score: best.f.score, why: best.f.why, kind: ph.kind || '' }); groups.set(best.m.id, g);
    }
    const list = [...groups.values()].map((g) => ({ ...g, photos: g.photos.sort((a, b) => a.at - b.at), score: Math.max(...g.photos.map((p) => p.score)) })).sort((a, b) => String(b.at).localeCompare(String(a.at)));
    return { groups: list, unmatched, noDate, already, total: (photos || []).length };
  }

  // ---------- the list of kept photos (kv paris-photos) ----------
  const empty = () => ({ v: 1, photos: [] });
  function validate(v) {
    const s = v && typeof v === 'object' && !Array.isArray(v) ? v : {};
    const photos = (Array.isArray(s.photos) ? s.photos : []).filter((p) => p && typeof p.id === 'string' && typeof p.moment === 'string' && REL.test(p.file || '') && REL.test(p.thumb || '')).map((p) => ({
      id: p.id, moment: p.moment, file: p.file, thumb: p.thumb, w: Number(p.w) || 0, h: Number(p.h) || 0,
      taken: typeof p.taken === 'string' && Number.isFinite(Date.parse(p.taken)) ? p.taken : null, takenFrom: ['offset', 'gps', 'zone', 'file'].includes(p.takenFrom) ? p.takenFrom : null,
      name: String(p.name || '').slice(0, 200), source: String(p.source || '').slice(0, 1000), hash: /^[0-9a-f]{64}$/.test(p.hash || '') ? p.hash : '', addedAt: typeof p.addedAt === 'string' ? p.addedAt : '',
      ...(p.gps && Number.isFinite(p.gps.lat) && Number.isFinite(p.gps.lon) ? { gps: { lat: p.gps.lat, lon: p.gps.lon } } : {}),
    }));
    return { ...s, v: 1, photos };
  }
  /** the ids a moment's photos may be kept under: its own, and for a walk the stops it had before it was finished */
  const idsOf = (m) => [m.id, ...(m.parts || [])];
  /** a moment's photos, in the order they were taken (then added) */
  function keptFor(store, m) {
    const ids = new Set(idsOf(m));
    return (store?.photos || []).filter((p) => ids.has(p.moment)).sort((a, b) => String(a.taken || a.addedAt).localeCompare(String(b.taken || b.addedAt)));
  }
  function add(store, recs) {
    const s = validate(store), seen = new Set(s.photos.map((p) => `${p.moment}|${p.hash}`)), added = [];
    for (const r of recs) { if (r.hash && seen.has(`${r.moment}|${r.hash}`)) continue; seen.add(`${r.moment}|${r.hash}`); s.photos.push(r); added.push(r); }
    return { store: validate(s), added };
  }
  function remove(store, ids) { const s = validate(store), x = new Set(ids), gone = s.photos.filter((p) => x.has(p.id)); s.photos = s.photos.filter((p) => !x.has(p.id)); return { store: s, gone }; }
  /** up to `max` photos for the month's image card: one per moment first (the newest moments), then the rest; your
   * kept photos before the photo a moment already had (a show's photo, a proof photo) */
  function cardPhotos(moments, max = 4) {
    const per = (moments || []).map((m) => [...(m.photos || []).map((p) => p.thumbSrc || p.src || p.thumb || p.file), ...(m.photo ? [m.photo] : [])].filter(Boolean));
    const out = [];
    for (let round = 0; out.length < max && per.some((l) => l.length > round); round++) for (const l of per) { if (out.length >= max) break; if (l[round] && !out.includes(l[round])) out.push(l[round]); }
    return out;
  }

  return { KV, BIG, THUMB, MAX_PER_MOMENT, MAX_BYTES, kindOf, isPhotoName, readExif, findTiff, zoneOffset, fromZone, takenAt, clock, dayIn, fit, turned, names, newId, REL, makeExif, withExif, exifDate, offsetWords, meters, windowOf, fitOf, suggest, empty, validate, idsOf, keptFor, add, remove, cardPhotos };
});
