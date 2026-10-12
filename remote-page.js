// Hearth phone remote, the page (round 24, remote; served by remotemain.js, the Lab side is remote.js).
// No framework, one WebSocket. Pairing: the 6-digit code once; after that this phone answers each connection's
// challenge with an HMAC of its own key (the key never travels again). Faders: multi-touch, soft takeover (a fader
// picks the value up when your finger reaches it), batched once a frame. Writes only what changed (transforms).
(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const KEY = 'hearth.remote';
  const creds = () => { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { return null; } };
  const setCreds = (c) => { try { if (c) localStorage.setItem(KEY, JSON.stringify(c)); else localStorage.removeItem(KEY); } catch { /* private mode */ } };
  const pref = (k, d) => { try { const v = localStorage.getItem(`${KEY}.${k}`); return v == null ? d : JSON.parse(v); } catch { return d; } };
  const setPref = (k, v) => { try { localStorage.setItem(`${KEY}.${k}`, JSON.stringify(v)); } catch { /* private mode */ } };

  // ---------- SHA-256 / HMAC (crypto.subtle needs HTTPS; this page is plain HTTP on the LAN) ----------
  const K = new Uint32Array([0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2]);
  function sha256(bytes) {
    const l = bytes.length; const n = ((l + 9 + 63) >> 6) << 6; const m = new Uint8Array(n); m.set(bytes); m[l] = 0x80;
    const dv = new DataView(m.buffer); dv.setUint32(n - 4, l * 8); dv.setUint32(n - 8, Math.floor(l / 0x20000000));
    const H = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]); const W = new Uint32Array(64);
    const rot = (x, r) => (x >>> r) | (x << (32 - r));
    for (let o = 0; o < n; o += 64) {
      for (let i = 0; i < 16; i += 1) W[i] = dv.getUint32(o + i * 4);
      for (let i = 16; i < 64; i += 1) { const a = W[i - 15]; const b = W[i - 2]; W[i] = (W[i - 16] + (rot(a, 7) ^ rot(a, 18) ^ (a >>> 3)) + W[i - 7] + (rot(b, 17) ^ rot(b, 19) ^ (b >>> 10))) >>> 0; }
      let [a, b, c, d, e, f, g, h] = H;
      for (let i = 0; i < 64; i += 1) {
        const t1 = (h + (rot(e, 6) ^ rot(e, 11) ^ rot(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + W[i]) >>> 0;
        const t2 = ((rot(a, 2) ^ rot(a, 13) ^ rot(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) >>> 0;
        h = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
      }
      H[0] += a; H[1] += b; H[2] += c; H[3] += d; H[4] += e; H[5] += f; H[6] += g; H[7] += h;
    }
    const out = new Uint8Array(32); const ov = new DataView(out.buffer); H.forEach((x, i) => ov.setUint32(i * 4, x)); return out;
  }
  const hexBytes = (h) => new Uint8Array(h.match(/../g).map((x) => parseInt(x, 16)));
  const toHex = (b) => [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  function hmac(keyHex, msg) {
    const key = new Uint8Array(64); key.set(hexBytes(keyHex));
    const m = new TextEncoder().encode(msg);
    const inner = new Uint8Array(64 + m.length); for (let i = 0; i < 64; i += 1) inner[i] = key[i] ^ 0x36; inner.set(m, 64);
    const outer = new Uint8Array(96); for (let i = 0; i < 64; i += 1) outer[i] = key[i] ^ 0x5c; outer.set(sha256(inner), 64);
    return toHex(sha256(outer));
  }

  // ---------- the socket ----------
  let ws = null; let ok = false; let pairWith = null; let retry = 0; let retryT = 0; let pingT = 0; let stopped = false;
  const send = (m) => { if (ws && ws.readyState === 1 && ok) ws.send(JSON.stringify(m)); };
  function connect() {
    clearTimeout(retryT);
    try { ws?.close(); } catch { /* closed */ }
    ok = false; dot('');
    ws = new WebSocket(`ws://${location.host}/`);
    ws.binaryType = 'blob';
    ws.onmessage = (e) => { if (typeof e.data === 'string') { let m; try { m = JSON.parse(e.data); } catch { return; } onMsg(m); } else showFrame(e.data); };
    ws.onclose = (e) => {
      ok = false; dot('bad'); clearInterval(pingT);
      if (e.code === 4001) return gone('Disconnected by the computer.');
      if (e.code === 4003) { setCreds(null); return showPair('This phone was forgotten by the computer: pair again.'); }
      if (e.code === 4002) return; // a pairing answer (shown already)
      if (e.code === 1001) { stopped = true; gone('The remote was turned off on the computer.'); }
      if (creds() && !stopped) { retry = Math.min(retry + 1, 6); retryT = setTimeout(connect, 500 * retry); }
    };
  }
  function onMsg(m) {
    if (m.t === 'hi') {
      if (pairWith) { ws.send(JSON.stringify({ t: 'pair', code: pairWith.code, name: pairWith.name })); pairWith = null; return; }
      const c = creds();
      if (c) ws.send(JSON.stringify({ t: 'auth', id: c.id, mac: hmac(c.key, m.nonce) })); else showPair();
      return;
    }
    if (m.t === 'paired' || m.t === 'ok') {
      if (m.t === 'paired') setCreds({ id: m.id, key: m.key });
      ok = true; retry = 0; stopped = false; dot('ok'); $('gone').hidden = true; $('pair').hidden = true; $('tabs').hidden = false; tab(pref('tab', 'faders'));
      send({ t: 'state' }); send({ t: 'preview', on: pref('preview', true) });
      clearInterval(pingT); pingT = setInterval(() => send({ t: 'ping' }), 20000);
      return;
    }
    if (m.t === 'no') {
      if (m.why === 'code') showPair('Wrong code: look at the computer again.');
      else if (m.why === 'expired') showPair('No pairing code right now: on the computer, open the 📱 card → Pair a new phone.');
      else if (m.why === 'locked') showPair(`Too many tries: wait ${m.wait || 30} s.`);
      else { setCreds(null); showPair('This phone is not paired (any more): type the code.'); }
      return;
    }
    if (m.t === 'state') { state(m); return; }
    if (m.t === 'vals') { for (const [k, u] of Object.entries(m.v)) { const c = byKey.get(k); if (c && !c.held) { c.u = u; paintFader(c); } } paintXY(); return; } // (under a finger: the finger wins)
    if (m.t === 'meters') { for (const [k, v] of Object.entries(m.v)) { const c = byKey.get(k); if (c?.mt) { const s = `scaleY(${v})`; if (c.mts !== s) { c.mts = s; c.mt.style.transform = s; } } } return; }
    if (m.t === 'info') { infoOf(m); return; }
    if (m.t === 'toast') toast(m.text, m.err);
  }
  const dot = (cls) => { $('dot').className = cls; };
  function gone(text) { $('goneText').textContent = text; $('gone').hidden = false; }
  $('retry').addEventListener('click', () => { $('gone').hidden = true; stopped = false; connect(); });
  function showPair(msg) {
    $('pair').hidden = false; $('tabs').hidden = true; for (const s of document.querySelectorAll('.tab')) s.hidden = true;
    const p = $('pair').querySelector('p'); if (msg) p.textContent = msg;
    if (!$('name').value) $('name').value = pref('name', /iPad/.test(navigator.userAgent) ? 'iPad' : /iPhone/.test(navigator.userAgent) ? 'iPhone' : /Android/.test(navigator.userAgent) ? 'Android phone' : 'Phone');
  }
  $('pair').addEventListener('submit', (e) => {
    e.preventDefault();
    const code = $('code').value.replace(/\D/g, ''); if (code.length !== 6) { toast('Six digits', true); return; }
    setPref('name', $('name').value.trim());
    pairWith = { code, name: $('name').value.trim() }; $('code').value = '';
    connect();
  });

  // ---------- what the Lab sent ----------
  let S = { controls: [], scenes: [], setlist: [], layers: [] };
  const byKey = new Map(); // key → control (+ its elements)
  let group = pref('group', null);
  function state(m) {
    S = m; byKey.clear();
    for (const c of m.controls) byKey.set(c.key, c);
    infoOf(m);
    const groups = [...new Set(m.controls.map((c) => c.group))];
    if (!groups.includes(group)) group = groups[0] || null;
    chips($('groups'), groups.length > 1 ? groups.map((g) => ({ label: g, on: g === group, fn: () => { group = g; setPref('group', g); state(S); } })) : []);
    chips($('layers'), m.layers.length > 1 ? m.layers.map((L) => ({ label: L.name, on: L.selected, fn: () => send({ t: 'layer', name: L.name }) })) : []);
    const fz = $('fz'); fz.textContent = '';
    const list = m.controls.filter((c) => c.group === group);
    if (!list.length) fz.append(h('div', 'empty', m.scene ? 'This scene has no sliders yet' : 'Open a scene in the Lab'));
    for (const c of list) fz.append(c.kind === 'num' ? fader(c) : optBtn(c));
    axes(); scenesList();
  }
  function infoOf(m) {
    if (m.scene !== undefined) $('scene').textContent = m.scene?.name || 'No scene';
    if (m.bpm != null) $('bpm').textContent = `${m.bpm.toFixed(1)} BPM`;
    for (const [k, v] of Object.entries(m)) if (k !== 't' && k !== 'controls' && k !== 'scenes') S[k] = v;
    btnState(); setList();
  }
  const h = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  function chips(box, items) { box.textContent = ''; box.hidden = !items.length; for (const it of items) { const b = h('button', it.on ? 'on' : '', it.label); b.type = 'button'; b.onclick = it.fn; box.append(b); } }

  // ---------- faders: multi-touch, soft takeover, once a frame ----------
  const pend = new Map(); let raf = 0;
  const queue = (key, u) => { pend.set(key, u); if (!raf) raf = requestAnimationFrame(flush); };
  function flush() { raf = 0; if (!pend.size) return; send({ t: 'set', v: [...pend.entries()] }); pend.clear(); }
  const fmt = (c) => { const v = c.min + c.u * (c.max - c.min); return c.step >= 1 ? String(Math.round(v)) : Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(2); };
  function fader(c) {
    const box = h('div', 'fd'); const tr = h('div', 'tr'); const fl = h('i', 'fl'); const kn = h('i', 'kn'); const gh = h('i', 'gh');
    tr.append(fl, kn, gh);
    if (c.music) { c.mt = h('i', 'mt'); tr.append(c.mt); }
    c.vl = h('span', 'vl'); box.append(tr, h('b', 'lb', c.label), c.vl);
    Object.assign(c, { box, fl, kn, gh, tr, held: null });
    let H = 0;
    const at = (e) => Math.max(0, Math.min(1, 1 - (e.clientY - tr.getBoundingClientRect().top) / H));
    tr.addEventListener('pointerdown', (e) => {
      if (c.held) return;
      try { tr.setPointerCapture(e.pointerId); } catch { /* a synthetic pointer */ } H = tr.clientHeight || 1;
      const u = at(e); c.held = { id: e.pointerId, picked: Math.abs(u - c.u) <= 0.05, last: u };
      box.classList.add('held'); move(u);
    });
    tr.addEventListener('pointermove', (e) => { if (c.held?.id === e.pointerId) move(at(e)); });
    const up = (e) => {
      if (c.held?.id !== e.pointerId) return;
      if (c.held.picked) { pend.delete(c.key); c.u = c.held.last; send({ t: 'set', v: [[c.key, c.u]], rel: 1 }); }
      c.held = null; box.classList.remove('held', 'wait');
    };
    tr.addEventListener('pointerup', up); tr.addEventListener('pointercancel', up); tr.addEventListener('lostpointercapture', up);
    function move(u) {
      const s = c.held;
      if (!s.picked && (s.last - c.u) * (u - c.u) <= 0) s.picked = true; // the finger passed through the value
      s.last = u;
      if (!s.picked) { box.classList.add('wait'); const t = `translateY(${(1 - u) * H}px)`; if (gh.style.transform !== t) gh.style.transform = t; return; }
      box.classList.remove('wait');
      c.u = u; paintFader(c, true); queue(c.key, u);
    }
    paintFader(c, true);
    return box;
  }
  function paintFader(c, mine) {
    if (c.paintOpt) { c.paintOpt(); return; } // (switches repaint their label)
    if (!c.fl) return;
    if (c.held && !mine) return; // under a finger: the finger wins
    const H = c.tr.clientHeight || 300;
    const s = `scaleY(${c.u})`; if (c.fls !== s) { c.fls = s; c.fl.style.transform = s; }
    const k = `translateY(${(1 - c.u) * (H - 3)}px)`; if (c.kns !== k) { c.kns = k; c.kn.style.transform = k; }
    const v = c.kind === 'num' ? fmt(c) : c.value; if (c.vl.textContent !== v) c.vl.textContent = v;
  }
  // options and switches: a button that steps to the next one
  function optBtn(c) {
    const box = h('div', 'fd'); const b = h('button', 'opt'); b.type = 'button';
    c.vl = h('span', 'vl'); c.fl = null;
    const label = () => (c.kind === 'bool' ? (c.u >= 0.5 ? 'On' : 'Off') : c.options[Math.round(c.u * (c.options.length - 1))] ?? '');
    b.textContent = label();
    b.onclick = () => {
      if (c.kind === 'bool') c.u = c.u >= 0.5 ? 0 : 1;
      else { const n = c.options.length; const i = (Math.round(c.u * (n - 1)) + 1) % n; c.u = n > 1 ? i / (n - 1) : 0; }
      b.textContent = label(); send({ t: 'set', v: [[c.key, c.u]], rel: 1, jump: 1 }); buzz();
    };
    c.paintOpt = () => { const t = label(); if (b.textContent !== t) b.textContent = t; };
    box.append(b, h('b', 'lb', c.label), c.vl);
    return box;
  }

  // ---------- XY pad: two sliders at once (jumps where you touch, like a touch pad) ----------
  const xs = $('xs'); const ys = $('ys'); const xy = $('xy'); const dotXY = xy.querySelector('i');
  function axes() {
    const nums = S.controls.filter((c) => c.kind === 'num');
    for (const [sel, i] of [[xs, 0], [ys, 1]]) {
      const want = pref(`xy${i}`, null); sel.textContent = '';
      for (const c of nums) { const o = h('option', '', `${i ? 'Y' : 'X'}: ${c.label}`); o.value = c.key; sel.append(o); }
      sel.value = nums.some((c) => c.key === want) ? want : nums[Math.min(i, nums.length - 1)]?.key || '';
    }
    paintXY();
  }
  xs.onchange = () => { setPref('xy0', xs.value); paintXY(); }; ys.onchange = () => { setPref('xy1', ys.value); paintXY(); };
  let xyHeld = null;
  function paintXY() {
    const X = byKey.get(xs.value); const Y = byKey.get(ys.value); if (!X || !Y || xyHeld != null) return;
    const t = `translate(${X.u * xy.clientWidth}px, ${(1 - Y.u) * xy.clientHeight}px)`; if (dotXY.style.transform !== t) dotXY.style.transform = t;
  }
  const xyAt = (e) => { const r = xy.getBoundingClientRect(); return [Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)), Math.max(0, Math.min(1, 1 - (e.clientY - r.top) / r.height))]; };
  function xyMove(e, rel) {
    const [u, v] = xyAt(e); const X = byKey.get(xs.value); const Y = byKey.get(ys.value); if (!X || !Y) return;
    X.u = u; Y.u = v; dotXY.style.transform = `translate(${u * xy.clientWidth}px, ${(1 - v) * xy.clientHeight}px)`;
    if (rel) send({ t: 'set', v: [[X.key, u], [Y.key, v]], rel: 1, jump: 1 });
    else { send({ t: 'set', v: [[X.key, u], [Y.key, v]], jump: 1 }); }
  }
  let xyRaf = 0; let xyLast = null;
  xy.addEventListener('pointerdown', (e) => { if (xyHeld != null) return; xyHeld = e.pointerId; try { xy.setPointerCapture(e.pointerId); } catch { /* a synthetic pointer */ } xyMove(e); });
  xy.addEventListener('pointermove', (e) => { if (xyHeld !== e.pointerId) return; xyLast = e; if (!xyRaf) xyRaf = requestAnimationFrame(() => { xyRaf = 0; if (xyLast) xyMove(xyLast); }); });
  const xyUp = (e) => { if (xyHeld !== e.pointerId) return; xyMove(e, true); xyHeld = null; xyLast = null; };
  xy.addEventListener('pointerup', xyUp); xy.addEventListener('pointercancel', xyUp);

  // ---------- pads ----------
  const PADS = [['shuffle', '🎲 Shuffle'], ['shuffleBack', '↶ Back'], ['freeze', '❚❚ Freeze'], ['tap', '♩ Tap'], ['save', '💾 Save'], ['blackout', '■ Black-out'], ['look', '✦ Next look'], ['play', '▶ Play']];
  const padEls = {};
  for (const [a, label] of PADS) { const b = h('button', '', label); b.type = 'button'; b.onclick = () => { send({ t: 'act', a }); buzz(); }; padEls[a] = b; $('btns').append(b); }
  function btnState() {
    padEls.freeze.classList.toggle('on', Boolean(S.frozen)); padEls.blackout.classList.toggle('on', Boolean(S.black)); padEls.play.classList.toggle('on', Boolean(S.playing));
    $('go').classList.toggle('busy', Boolean(S.busy));
  }
  $('bpm').onclick = () => { send({ t: 'act', a: 'tap' }); buzz(); };
  const buzz = () => { try { navigator.vibrate?.(8); } catch { /* no vibration */ } };

  // ---------- set list and scenes ----------
  for (const [id, a] of [['go', 'go'], ['prev', 'prev'], ['next', 'next'], ['cut', 'cut'], ['setadd', 'setadd']]) $(id).onclick = () => { send({ t: 'act', a }); buzz(); };
  function setList() {
    const ol = $('sl'); const sig = JSON.stringify(S.setlist || []); if (ol.dataset.sig === sig) return; ol.dataset.sig = sig; ol.textContent = '';
    if (!S.setlist?.length) { ol.append(h('li', 'empty', 'No set list yet: ＋ This scene, or /stage set fill on the computer')); return; }
    for (const x of S.setlist) {
      const li = h('li', x.current ? 'cur' : x.cued ? 'cued' : ''); li.append(h('span', '', `${x.n}. ${x.name}${x.current ? '  ●' : x.cued ? '  ◌ cued' : ''}`));
      const b = h('button', '', 'Cue'); b.type = 'button'; b.onclick = () => { send({ t: 'cue', n: x.n }); buzz(); }; li.append(b); ol.append(li);
    }
  }
  function scenesList() {
    const ul = $('sc'); const q = $('q').value.toLowerCase().trim(); ul.textContent = '';
    for (const x of (S.scenes || []).filter((s) => !q || s.name.toLowerCase().includes(q)).slice(0, 80)) {
      const li = h('li', x.current ? 'cur' : ''); const name = h('span', '', x.name); name.onclick = () => { send({ t: 'scene', id: x.id }); buzz(); };
      const b = h('button', '', 'Cue'); b.type = 'button'; b.onclick = () => { send({ t: 'cue', id: x.id }); buzz(); };
      li.append(name, b); ul.append(li);
    }
  }
  $('q').addEventListener('input', scenesList);
  $('scene').onclick = () => tab('scenes');

  // ---------- tabs, preview, toasts ----------
  function tab(id) {
    for (const s of document.querySelectorAll('.tab')) s.hidden = s.id !== id;
    for (const b of $('tabs').children) b.classList.toggle('on', b.dataset.tab === id);
    setPref('tab', id);
    if (id === 'faders') for (const c of byKey.values()) paintFader(c);
    if (id === 'pads') paintXY();
  }
  for (const b of $('tabs').children) b.onclick = () => tab(b.dataset.tab);
  let frameUrl = null;
  function showFrame(blob) {
    if (!pref('preview', true)) return;
    const u = URL.createObjectURL(blob); const img = $('frame');
    img.onload = () => { if (frameUrl && frameUrl !== u) URL.revokeObjectURL(frameUrl); frameUrl = u; };
    img.src = u; img.hidden = false;
    window.__frames = (window.__frames || 0) + 1;
  }
  $('pv').classList.toggle('on', pref('preview', true));
  $('pv').onclick = () => { const on = !pref('preview', true); setPref('preview', on); $('pv').classList.toggle('on', on); if (!on) $('frame').hidden = true; send({ t: 'preview', on }); };
  let toastT = 0;
  function toast(text, err) { const t = $('toast'); t.textContent = text; t.className = err ? 'err' : ''; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; }, 2200); }
  document.addEventListener('visibilitychange', () => { if (!document.hidden && (!ws || ws.readyState > 1) && creds()) connect(); send({ t: 'preview', on: !document.hidden && pref('preview', true) }); });
  // (dev/checks/remote.js reads these)
  window.__remote = { get ok() { return ok; }, get state() { return S; }, controls: () => [...byKey.values()].map((c) => ({ key: c.key, u: c.u })), hmac, sha256: (s) => toHex(sha256(new TextEncoder().encode(s))) };
  connect();
})();
