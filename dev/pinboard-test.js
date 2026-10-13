#!/usr/bin/env node
// Find images like this (round 30, pinboard): the page reading and de-duplication, in plain Node, against saved pages.
// pinboard-core.js's page script runs on a tiny DOM built from dev/fixtures/pinboard-*.html (tags, attributes, text,
// the simple selectors the script uses, each card's top from data-y), exactly as it is sent to Chrome / a Hearth
// window (readExpr). Then: the site's own results only (no logo, avatar, ad, shopping link, banner), the biggest
// picture of each, clean titles, one per picture / per link, what's on screen only, what's already on the board,
// merging the next screen, search addresses.   node dev/pinboard-test.js
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const C = require('../pinboard-core');

const fails = [];
const check = (ok, what) => { console.log(`${ok ? '✓' : '✖'} ${what}`); if (!ok) fails.push(what); };

// ---------- a tiny DOM: enough for the page script ----------
const VOID = new Set(['img', 'input', 'meta', 'br', 'link', 'hr', 'source', 'wbr']);
const decode = (s) => String(s).replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
function parseHtml(html) {
  const root = node('#document'); let cur = root;
  const re = /<!--[\s\S]*?-->|<(script|style)\b[^>]*>[\s\S]*?<\/\1>|<!doctype[^>]*>|<(\/?)([a-zA-Z][\w-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>|([^<]+)/gi;
  let m;
  while ((m = re.exec(html))) {
    if (m[5] != null) { cur.children.push({ text: decode(m[5]), parent: cur }); continue; }
    if (!m[3]) continue; // comments, doctype, scripts, styles
    const tag = m[3].toLowerCase();
    if (m[2]) { let n = cur; while (n && n.tagName !== tag) n = n.parent; if (n) cur = n.parent || root; continue; }
    const el = node(tag, cur);
    for (const a of m[4].matchAll(/([^\s=/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)) el.attrs.set(a[1].toLowerCase(), decode(a[2] ?? a[3] ?? a[4] ?? ''));
    cur.children.push(el);
    if (!VOID.has(tag) && !/\/\s*$/.test(m[4])) cur = el;
  }
  return root;
}
let BASE = 'http://127.0.0.1/'; let SCROLL = 0; // (rects are in the viewport: the page's top minus the scroll)
function node(tagName, parent = null) {
  const n = {
    tagName, parent, attrs: new Map(), children: [],
    getAttribute: (k) => (n.attrs.has(k) ? n.attrs.get(k) : null),
    get textContent() { return n.children.map((c) => (c.tagName ? c.textContent : c.text)).join(''); },
    get href() { try { return new URL(n.getAttribute('href'), BASE).href; } catch { return ''; } },
    currentSrc: '', naturalWidth: 0, naturalHeight: 0,
    matches: (sel) => sel.split(',').some((s) => simple(n, s.trim())),
    closest: (sel) => { for (let x = n; x && x.tagName !== '#document'; x = x.parent) if (x.matches(sel)) return x; return null; },
    querySelectorAll: (sel) => { const out = []; const walk = (x) => { for (const c of x.children) if (c.tagName) { if (c.matches(sel)) out.push(c); walk(c); } }; walk(n); return out; },
    querySelector: (sel) => n.querySelectorAll(sel)[0] || null,
    getBoundingClientRect: () => {
      let y = 0; for (let x = n; x; x = x.parent) if (x.attrs?.has('data-y')) { y = Number(x.attrs.get('data-y')) - SCROLL; break; }
      const w = Number(n.getAttribute('width')) || (n.tagName === 'img' ? 236 : 300); const h = Number(n.getAttribute('height')) || (n.tagName === 'img' ? 290 : 300);
      return { left: 16, top: y, width: w, height: h, right: 16 + w, bottom: y + h };
    },
  };
  return n;
}
// tag, .class, [attr], [attr="v"], [attr*="v"] (combined: tag[attr="v"])
function simple(n, s) {
  const m = s.match(/^([a-z][\w-]*)?((?:\.[\w-]+)*)((?:\[[^\]]+\])*)$/i);
  if (!m) return false;
  if (m[1] && n.tagName !== m[1].toLowerCase()) return false;
  for (const c of (m[2] || '').split('.').filter(Boolean)) if (!String(n.getAttribute('class') || '').split(/\s+/).includes(c)) return false;
  for (const a of (m[3] || '').matchAll(/\[([\w-]+)(?:([*^$]?=)"([^"]*)")?\]/g)) {
    const v = n.getAttribute(a[1].toLowerCase());
    if (v == null) return false;
    if (a[2] === '=' && v !== a[3]) return false;
    if (a[2] === '*=' && !v.includes(a[3])) return false;
  }
  return true;
}
function readFixture(file, url, { innerHeight = 900, scrollY = 0 } = {}) {
  BASE = url; SCROLL = scrollY;
  const doc = parseHtml(fs.readFileSync(path.join(__dirname, 'fixtures', file), 'utf8'));
  const html = doc.children.find((c) => c.tagName === 'html') || doc;
  const title = html.querySelector('title')?.textContent || '';
  const document = { querySelectorAll: doc.querySelectorAll, querySelector: doc.querySelector, title, documentElement: { scrollHeight: 2600 } };
  return vm.runInNewContext(C.readExpr({}), { window: { innerHeight, scrollY }, document, location: { href: url }, URL });
}

// ---------- Pinterest-like ----------
const url = 'http://127.0.0.1:9/pinboard/search/pins/?q=neon%20chrome';
const read = readFixture('pinboard-pinterest.html', url);
check(read.url === url && read.title === 'Pinterest-like search' && read.signin === false, 'the page script answers: address, title, no sign-in box');
check(read.raw.every((r) => r.w >= 90) && !read.raw.some((r) => /logo|avatar/.test(r.src)), `the logo and the avatar (32 px) are left out (${read.raw.length} pictures read)`);
check(read.raw.length === 16 && read.raw.every((r) => r.top < 900 * 1.25), 'only what is on screen (± a quarter screen): 4 rows of 4, not the 24 on the page');
const pins = C.normalize(read, 'pinterest');
const ids = pins.map((p) => p.link.match(/\/pin\/(\d+)/)?.[1]);
check(!ids.includes('1005') && ids.includes('1002'), 'the same picture saved as another pin shows once (the first)');
check(!ids.includes('1007'), 'the ad ("Promoted by…") is left out');
check(pins.every((p) => /\/pin\/\d+\/$/.test(p.link)) && !pins.some((p) => /shop\.example/.test(p.link)), 'a shopping link is not a pin: left out');
check(ids.filter((x) => x === '1003').length === 1 && !ids.includes(undefined), 'the same pin twice shows once');
check(pins.length === 12, `16 read → 12 pins (${pins.length})`);
check(pins.every((p) => /\/736x\//.test(p.image) && /\/236x\//.test(p.thumb)), 'the biggest picture (736x from the srcset) is what gets saved; the page\'s small one is the thumbnail');
check(pins[0].title === 'Neon chrome lettering' && pins[1].title === 'pink and teal gradient poster', `titles: the card's own title, else the alt text without "This may contain:" (${pins[0].title} · ${pins[1].title})`);
check(pins.every((p) => p.title && p.title !== 'Pin page'), 'never the link\'s generic "Pin page"');
check(pins.every((p) => p.site === 'pinterest' && p.key.startsWith('127.0.0.1/pinboard/i/ab/cd/ef/')), 'one key per picture, whatever its size');
check(pins.map((p) => p.link).join() === C.normalize(read, 'pinterest').map((p) => p.link).join(), 'the same page reads the same twice (stable order)');

// the next screen: further down, the rows below (and what was already found isn't repeated)
const read2 = readFixture('pinboard-pinterest.html', url, { scrollY: 760 });
const all = C.merge(pins, C.normalize(read2, 'pinterest'));
check(all.length > pins.length && new Set(all.map((p) => p.key)).size === all.length && new Set(all.map((p) => p.link)).size === all.length, `merging the next screen: ${pins.length} → ${all.length}, no picture or link twice`);

// what the board already has
const board = [
  { type: 'image', url: 'http://127.0.0.1:9/pinboard/i/736x/ab/cd/ef/h01.jpg' }, // the same picture, another size
  { type: 'image', source: 'http://127.0.0.1:9/pin/1004' }, // the same pin (no trailing slash)
  { type: 'image', pinKey: pins[5].key },
  { type: 'note', text: 'hi' },
];
const { fresh, dupes } = C.dedupe(pins, C.knownFrom(board));
check(dupes.length === 3 && fresh.length === 9 && !fresh.some((p) => /\/pin\/(1001|1004)\//.test(p.link)), `already on the board: ${dupes.length} (same picture, same pin link, an earlier pick) · ${fresh.length} new`);
check(C.linkKey('https://fr.pinterest.com/pin/123/?x=1') === C.linkKey('https://www.pinterest.com/pin/123'), 'a pin is the same pin on any Pinterest country site, with or without its query');

// ---------- Unsplash-like ----------
const uurl = 'http://127.0.0.1:9/pinboard/s/photos/forest';
const ur = readFixture('pinboard-unsplash.html', uurl);
const up = C.normalize(ur, 'unsplash');
check(up.length === 3 && up.every((p) => /\/photos\//.test(p.link)), `Unsplash-like: 3 photos (no banner, no sponsored one, no avatar, the same photo once) · ${up.map((p) => p.link.split('/').pop()).join(', ')}`);
check(/w=1200/.test(up[0].image) && /w=1600/.test(up.find((p) => /d4/.test(p.link)).image), 'w-descriptor srcsets: the widest');
check(up[0].title === 'Foggy pine forest' && up.find((p) => /d4/.test(p.link)).title === 'Desert dunes at dawn', 'titles: the link title, a figcaption');

// ---------- small parts ----------
check(C.upgrade('https://i.pinimg.com/236x/aa/bb/cc/x.jpg') === 'https://i.pinimg.com/736x/aa/bb/cc/x.jpg' && C.upgrade('https://i.pinimg.com/originals/aa/x.png') === 'https://i.pinimg.com/736x/aa/x.png', 'pinimg: the 736x picture');
const us = new URL(C.upgrade('https://images.unsplash.com/photo-1?ixid=a&w=400&h=300&crop=entropy'));
check(us.searchParams.get('w') === '1600' && !us.searchParams.has('h') && us.searchParams.get('ixid') === 'a', 'Unsplash: 1600 wide, uncropped, its id kept');
check(C.keyOf('https://i.pinimg.com/236x/aa/x.jpg') === C.keyOf('https://i.pinimg.com/736x/aa/x.jpg') && C.keyOf('https://images.unsplash.com/photo-1?w=400') === C.keyOf('https://images.unsplash.com/photo-1?w=1600'), 'keys: the same picture at any size');
check(C.bestSrc('a.jpg 1x, b.jpg 3x, c.jpg 2x', 'z.jpg', 'https://x.com/') === 'https://x.com/b.jpg' && C.bestSrc('', 'z.jpg', 'https://x.com/p/') === 'https://x.com/p/z.jpg', 'srcset: the largest; no srcset: src');
check(C.cleanTitle('', 'Pin page', 'This may contain: a cat') === 'a cat' && C.cleanTitle('x'.repeat(150)).length === 100, 'clean titles (generic words skipped, 100 characters at most)');
check(C.searchUrl('pinterest', 'dark  academia') === 'https://www.pinterest.com/search/pins/?q=dark%20academia' && C.searchUrl('unsplash', 'Foggy Forest') === 'https://unsplash.com/s/photos/foggy-forest' && C.searchUrl('pinterest', '') === 'https://www.pinterest.com/', 'search addresses (Unsplash: words with dashes; nothing: the home page)');
check(C.searchUrl('pinterest', 'neon', 'http://127.0.0.1:5/pinboard/search?q={q}') === 'http://127.0.0.1:5/pinboard/search?q=neon' && C.searchUrl('cosmos', 'x', 'javascript:alert(1)//{q}').startsWith('https://www.cosmos.so/'), 'a test base stands in for the site (only a web address)');
const sig = vm.runInNewContext(C.readExpr({}), { window: { innerHeight: 800, scrollY: 0 }, document: { querySelectorAll: () => [], querySelector: (s) => (/password/.test(s) ? {} : null), title: 'Log in', documentElement: { scrollHeight: 800 } }, location: { href: 'https://www.pinterest.com/login/' } });
check(sig.signin === true && sig.raw.length === 0 && sig.end === true, 'a sign-in page is noticed (a password box exists: never read, never touched)');
check(!/password"\]\)\.(value|focus|click)/.test(C.readExpr({})) && !/\.click\(|\.value\s*=|fetch\(|XMLHttpRequest/.test(C.readExpr({})), 'the page script only reads: no clicks, no typing, no requests');

console.log(fails.length ? `\n${fails.length} failed` : '\nall passed');
process.exit(fails.length ? 1 : 0);
