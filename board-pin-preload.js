// Preload of the Pinterest window (boardpinsmain.js), sandboxed and isolated from the page: an "＋ Board" button on the
// pin under the pointer and a small "→ your board · 3 added" pill. Only the pin the owner clicks (a real click) is
// read: its picture's largest address, its pin link and its title. Nothing is exposed to the page, nothing else is
// read, no request is made from here.
const { ipcRenderer } = require('electron');

let btn = null; let pill = null; let current = null; let status = { board: '', added: 0 };
const big = (img) => { const r = img.getBoundingClientRect(); return r.width >= 60 && r.height >= 60; };
// the largest picture in srcset ("…236x… 1x, …736x… 3x" or "… 474w"), else what the page shows
function bestSrc(img) {
  const set = String(img.getAttribute('srcset') || '').split(',').map((s) => s.trim().split(/\s+/)).filter((p) => p[0]);
  let best = null; let bestN = 0;
  for (const [u, d] of set) { const n = parseFloat(d) * (/x$/.test(d || '') ? 1000 : 1) || 1; if (n >= bestN) { bestN = n; best = u; } }
  try { return new URL(best || img.currentSrc || img.src, location.href).href; } catch { return img.currentSrc || img.src; }
}
function pinOf(img) {
  const a = img.closest('a[href]');
  const href = a ? a.href : '';
  const link = /\/pin\//.test(href) ? href : /\/pin\//.test(location.pathname) ? location.href : href || location.href;
  const title = img.getAttribute('alt') || a?.getAttribute('aria-label') || document.title || '';
  return { image: bestSrc(img), link, title, w: img.naturalWidth, h: img.naturalHeight };
}
function place() {
  if (!btn || !current || !current.isConnected) { if (btn) btn.hidden = true; return; }
  const r = current.getBoundingClientRect();
  if (r.bottom < 0 || r.top > innerHeight) { btn.hidden = true; return; }
  btn.hidden = false;
  btn.style.left = `${Math.max(4, r.right - 112)}px`;
  btn.style.top = `${Math.max(4, r.top + 8)}px`;
}
function build() {
  if (btn) return;
  btn = document.createElement('button');
  btn.id = 'hearth-pin-add'; btn.type = 'button'; btn.textContent = '＋ Board'; btn.hidden = true;
  btn.title = 'Add this pin to your Hearth board (its link stays as the source)';
  Object.assign(btn.style, { position: 'fixed', zIndex: 2147483647, padding: '7px 12px', borderRadius: '999px', border: '0', font: '600 13px system-ui, sans-serif', background: '#ff6a1a', color: '#fff', boxShadow: '0 4px 14px rgba(0,0,0,.3)', cursor: 'pointer' });
  btn.addEventListener('mousedown', (e) => { e.preventDefault(); e.stopPropagation(); }, true);
  btn.addEventListener('click', (e) => {
    e.preventDefault(); e.stopPropagation();
    if (!e.isTrusted || !current) return; // only the owner's own click
    ipcRenderer.send('pins:add', pinOf(current));
    btn.textContent = '✓ Added'; setTimeout(() => { if (btn) btn.textContent = '＋ Board'; }, 1200);
  }, true);
  pill = document.createElement('div');
  pill.id = 'hearth-pin-pill';
  Object.assign(pill.style, { position: 'fixed', left: '12px', bottom: '12px', zIndex: 2147483647, padding: '6px 12px', borderRadius: '999px', background: 'rgba(20,20,24,.86)', color: '#ffd28a', font: '600 12px system-ui, sans-serif', pointerEvents: 'none' });
  paintPill();
  document.documentElement.append(btn, pill);
}
function paintPill() { if (pill) pill.textContent = `▦ Hearth${status.board ? ` → ${status.board}` : ''}${status.added ? ` · ${status.added} added` : ''} · ＋ Board on a pin, or drag it`; }

addEventListener('mouseover', (e) => {
  const img = e.target?.closest?.('img');
  if (img && big(img)) { current = img; build(); place(); }
}, true);
addEventListener('scroll', () => place(), true);
addEventListener('resize', () => place());
// dragging a pin out (onto the board): Hearth learns which pin the dropped picture was, to keep its link
addEventListener('dragstart', (e) => {
  const img = e.target?.closest?.('img') || (e.target?.querySelector && e.target.querySelector('img'));
  if (e.isTrusted && img) ipcRenderer.send('pins:drag', pinOf(img));
}, true);
ipcRenderer.on('pins:status', (_e, s) => { status = s || status; paintPill(); });
addEventListener('DOMContentLoaded', () => build());
