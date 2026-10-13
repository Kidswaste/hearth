// Find images like this (round 30, pinboard stream), the pure part: no DOM of Hearth's own and no Electron, so
// dev/pinboard-test.js runs it in plain Node against saved fixture pages, and the main side (boardpinsmain.js,
// appsmain.js) builds the same page script from it.
//   SITES                         Pinterest, Unsplash, Are.na, Cosmos: their search page, what a result's link looks like
//   searchUrl(site, query, base)  the site's search page for words (base: a test page standing in for the site)
//   pageRead(opts)                runs IN the site's page: the pictures on screen now (± a quarter screen), each with its
//                                 link, its alt text and its card's title; whether the page asks to sign in. It reads
//                                 only what is shown; it never clicks, never scrolls, never touches a box.
//   readExpr(opts) / SCROLL_EXPR  the expressions sent to the page (Chrome over CDP, or a Hearth window)
//   normalize(read, site)         raw → pins { key, image, thumb, link, title, w, h, site }: the site's own results
//                                 only (no avatars, logos, ads), the largest picture, a clean title, one per picture
//   knownFrom(items) · dedupe(pins, known) · merge(a, b)   what's already on the board / already found
// Nothing here downloads anything: the owner's picks are saved by the board (board:fetch) like a dropped picture.
const PinboardCore = (() => {
  const SITES = {
    pinterest: { id: 'pinterest', name: 'Pinterest', icon: '📌', home: 'https://www.pinterest.com/', search: 'https://www.pinterest.com/search/pins/?q={q}', link: /\/pin\/[\w-]+/, app: 'pinterest' },
    unsplash: { id: 'unsplash', name: 'Unsplash', icon: '📷', home: 'https://unsplash.com/', search: 'https://unsplash.com/s/photos/{q-}', link: /\/photos\/[\w-]+/, app: 'unsplash' },
    arena: { id: 'arena', name: 'Are.na', icon: '◼', home: 'https://www.are.na/', search: 'https://www.are.na/search/{q}', link: /\/block\/\d+/, app: 'arena' },
    cosmos: { id: 'cosmos', name: 'Cosmos', icon: '✳', home: 'https://www.cosmos.so/', search: 'https://www.cosmos.so/search/elements/{q}', link: /\/e\/[\w-]+/, app: 'cosmos' },
  };
  const ORDER = ['pinterest', 'unsplash', 'arena', 'cosmos'];
  const siteOf = (id) => SITES[String(id || '').toLowerCase()] || SITES.pinterest;

  // a test base ("http://127.0.0.1:port/pinboard/search?q={q}") or the site's own search page
  function searchUrl(site, query, base = null) {
    const s = siteOf(site);
    const words = String(query || '').replace(/\s+/g, ' ').trim().slice(0, 120);
    const tpl = base && /^(https?|file):/i.test(String(base)) ? String(base) : s.search;
    if (!words) return base ? tpl.replace(/[?&][^=]+=\{q-?\}/, '').replace(/\{q-?\}/, '') : s.home;
    return tpl.replace('{q-}', encodeURIComponent(words.toLowerCase().replace(/\s+/g, '-'))).replace('{q}', encodeURIComponent(words));
  }

  // ---------- in the page ----------
  // (self-contained: it is sent to the page as text. Plain DOM reads only.)
  function pageRead(o) {
    o = o || {};
    const H = window.innerHeight || 800;
    const min = o.min || 90;
    const max = o.max || 60;
    const CARD = '[data-test-id="pin"], [data-test-id="pinWrapper"], [data-grid-item], figure, article, li';
    const CAP = '[data-test-id="pinrep-title"], [data-test-id="pin-title"], figcaption, h2, h3, [class*="title"]';
    const text = (n) => (n ? String(n.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 160) : '');
    const out = [];
    const imgs = document.querySelectorAll('img');
    for (let i = 0; i < imgs.length && out.length < max; i++) {
      const img = imgs[i];
      const r = img.getBoundingClientRect();
      if (r.width < min || r.height < min) continue; // avatars, logos, icons
      if (r.bottom < -H * 0.25 || r.top > H * 1.25) continue; // only what is on screen (and just around it)
      const a = img.closest('a[href]');
      const card = img.closest(CARD);
      const cap = card ? card.querySelector(CAP) : null;
      const cardText = text(card).slice(0, 80);
      out.push({
        src: img.currentSrc || img.getAttribute('src') || '', srcset: img.getAttribute('srcset') || '', alt: img.getAttribute('alt') || '',
        w: Math.round(r.width), h: Math.round(r.height), top: Math.round(r.top), left: Math.round(r.left), nw: img.naturalWidth || 0, nh: img.naturalHeight || 0,
        href: a ? a.href : '', label: a ? a.getAttribute('aria-label') || a.getAttribute('title') || '' : '', cap: cap && cap !== img ? text(cap) : '',
        ad: /promoted by|sponsored/i.test(cardText),
      });
    }
    const de = document.documentElement || {};
    return {
      url: location.href, title: document.title, h: H, y: Math.round(window.scrollY || 0),
      end: (window.scrollY || 0) + H >= (de.scrollHeight || 0) - 4,
      signin: Boolean(document.querySelector('input[type="password"]')), // (only noticed, never touched)
      raw: out,
    };
  }
  const readExpr = (o = {}) => `(${pageRead.toString()})(${JSON.stringify({ min: o.min, max: o.max })})`;
  // one modest step down the page (85% of a screen), like the owner's own scroll
  const SCROLL_EXPR = '(() => { const y = scrollY; scrollBy({ top: Math.round(innerHeight * 0.85), left: 0, behavior: "instant" }); return scrollY !== y; })()';

  // ---------- back in Hearth ----------
  const abs = (u, base) => { try { return new URL(String(u || '').trim(), base || undefined).href; } catch { return ''; } };
  // the largest picture in srcset ("…236x… 1x, …736x… 3x" or "… 474w"), else src
  function bestSrc(srcset, src, base) {
    let best = null; let n0 = 0;
    for (const part of String(srcset || '').split(/,\s+(?=\S)/)) {
      const [u, d = '1x'] = part.trim().split(/\s+/);
      if (!u) continue;
      const n = parseFloat(d) * (/x$/i.test(d) ? 1000 : 1) || 1;
      if (n >= n0) { n0 = n; best = u; }
    }
    return abs(best || src, base) || abs(src, base);
  }
  // the biggest version the site serves for the same picture
  function upgrade(url) {
    try {
      const u = new URL(url);
      if (/(^|\.)pinimg\.com$/.test(u.hostname) || /\/pinboard\/i\//.test(u.pathname)) u.pathname = u.pathname.replace(/\/(\d+x\d*|originals)\//, '/736x/');
      else if (/images\.unsplash\.com$/.test(u.hostname)) { u.searchParams.set('w', '1600'); u.searchParams.delete('h'); u.searchParams.delete('crop'); u.searchParams.set('q', '80'); u.searchParams.set('fit', 'max'); }
      return u.href;
    } catch { return url; }
  }
  // one key per picture, whatever size the address asks for (pinimg's 236x / 474x / 736x, Unsplash's ?w=, CDN queries)
  function keyOf(url) {
    try {
      const u = new URL(url);
      if (u.protocol === 'data:') return `data:${url.length}:${url.slice(-48)}`;
      const p = u.pathname.replace(/\/(\d+x\d*|originals)\//, '/').replace(/\.(jpe?g|png|webp|gif|avif)$/i, '').toLowerCase();
      const host = /pinimg\.com$/.test(u.hostname) ? 'pinimg' : u.hostname.replace(/^www\./, '');
      return `${host}${p}`;
    } catch { return String(url || ''); }
  }
  const linkKey = (url) => { try { const u = new URL(url); return `${u.hostname.replace(/^www\./, '').replace(/^[a-z]{2}\.pinterest\./, 'pinterest.')}${u.pathname.replace(/\/+$/, '')}`.toLowerCase(); } catch { return ''; } };
  // a short readable title: the card's own title, the link's label, then the alt text (without Pinterest's
  // "This may contain:"), never a generic word
  const GENERIC = /^(pin|pin page|image|photo|picture|img|thumbnail|untitled|null|undefined|\d+)$/i;
  function cleanTitle(...cands) {
    for (const c of cands) {
      const t = String(c || '').replace(/^(this may contain|cette image peut contenir)\s*:\s*/i, '').replace(/\s+/g, ' ').trim();
      if (t && !GENERIC.test(t) && t.length > 1) return t.length > 100 ? `${t.slice(0, 99)}…` : t;
    }
    return '';
  }
  function normalize(read, site) {
    const s = siteOf(site);
    const base = read?.url || '';
    const out = []; const keys = new Set(); const links = new Set();
    for (const r of read?.raw || []) {
      if (r.ad) continue;
      const link = abs(r.href, base);
      if (s.link && !(link && s.link.test(new URL(link).pathname))) continue; // the site's own results only
      const shown = abs(r.src, base) || bestSrc(r.srcset, r.src, base);
      const image = upgrade(bestSrc(r.srcset, r.src, base));
      if (!/^(https?|data):/i.test(image) || /^data:(?!image\/)/i.test(image)) continue;
      const key = keyOf(image); const lk = linkKey(link);
      if (keys.has(key) || (lk && links.has(lk))) continue;
      keys.add(key); if (lk) links.add(lk);
      out.push({ key, image, thumb: shown || image, link, title: cleanTitle(r.cap, r.label, r.alt), w: r.nw || r.w, h: r.nh || r.h, site: s.id, top: r.top });
    }
    // the order the owner sees them: rows from the top, left to right
    return out.sort((a, b) => (Math.abs(a.top - b.top) < 40 ? 0 : a.top - b.top)).map(({ top, ...p }) => p); // eslint-disable-line no-unused-vars
  }
  // what the board already has (its pictures' addresses, their source links, the pins added before)
  function knownFrom(items = []) {
    const keys = new Set(); const links = new Set();
    for (const i of items) {
      if (i.pinKey) keys.add(i.pinKey);
      if (i.url && /^(https?|data):/.test(i.url)) keys.add(keyOf(i.url));
      if (i.source) { const k = linkKey(i.source); if (k) links.add(k); }
    }
    return { keys, links };
  }
  function dedupe(pins, known = { keys: new Set(), links: new Set() }) {
    const fresh = []; const dupes = [];
    for (const p of pins) ((known.keys.has(p.key) || (p.link && known.links.has(linkKey(p.link)))) ? dupes : fresh).push(p);
    return { fresh, dupes };
  }
  // results of the next screen added after the ones already found (same picture or same link: once)
  function merge(a = [], b = []) {
    const keys = new Set(a.map((p) => p.key)); const links = new Set(a.map((p) => linkKey(p.link)).filter(Boolean));
    const out = a.slice();
    for (const p of b) { const lk = linkKey(p.link); if (keys.has(p.key) || (lk && links.has(lk))) continue; keys.add(p.key); if (lk) links.add(lk); out.push(p); }
    return out;
  }

  return { SITES, ORDER, siteOf, searchUrl, pageRead, readExpr, SCROLL_EXPR, bestSrc, upgrade, keyOf, linkKey, cleanTitle, normalize, knownFrom, dedupe, merge };
})();
if (typeof module !== 'undefined') module.exports = PinboardCore;
