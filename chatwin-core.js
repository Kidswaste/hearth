// (round 86, chatwindow86) Long chats' older messages stay on disk until you scroll up to them: the pure part, shared by
// the window (chatwin.js), the store thread (storework.js ops chatWinOpen / chatRange / chatFind) and the Node tests
// (dev/chatwindow86-test.js). A GIANT chat (≥ 8 MB on disk) opened "windowed" holds in the window only its own fields,
// its last ≈ 300 messages (plus its pinned ones and the blocks you scrolled up to) and one small record per message
// (META below: its height in the chat, its small fields). Everything else stays in the file.
//
// The rule that keeps it safe: a message that isn't loaded is NEVER "not there". `chat.messages` stays an array of the
// chat's TRUE length (makeArray): the loaded messages are themselves; an unloaded one reads as a STUB (stubOf) that
// gives only its small fields (role, at, usage, flags…: what the chat's lookups by role or by usage need) and THROWS
// (NotLoaded) on any of its other fields (text, thinking, tools, things…). Anything that would walk the whole chat for
// its content therefore stops with an error instead of seeing a part as the whole: JSON.stringify, a copy ({ ...m }),
// structuredClone and the window's saves can't carry a stub (Proxy objects can't be cloned; their big fields throw).
// Writes are guarded the same way: a stub can't be changed, and the array refuses a write at index k unless every
// message from k to the end is loaded (so a splice / unshift / sort over unloaded messages stops before it moves
// anything it can't see), and a stub can never be written into it. A refused array write marks the chat "poisoned"
// (chatwin.js: its saves stop and it is read again from disk), since an array method may have moved loaded messages
// before it reached the refused write.
'use strict';
const ChatWinCore = (() => {
  // ---------- one record per message (META) ----------
  // the height a message takes in a chat (native.js guessH / textPx: the same numbers, checked in the test)
  const COLLAPSE_PX = 900; const CODE_FOLD_LINES = 28;
  function textPx(m, cpl) {
    const t = String(m.text || '');
    let px = 0; let code = -1;
    for (let p = 0, e; ; p = e + 1) {
      e = t.indexOf('\n', p); if (e < 0) e = t.length; const n = e - p;
      if (n >= 3 && t.startsWith('```', p)) { code = code < 0 ? 0 : -1; px += code ? 0 : 34; } else if (code >= 0) { if (code++ < CODE_FOLD_LINES) px += 19; } else px += n ? Math.ceil(n / cpl) * 23 : 6;
      if (e >= t.length) break;
    }
    if (m.role !== 'user' && px > COLLAPSE_PX) px = 440;
    return px;
  }
  const msgPx = (m, cpl) => (!m || m.compactReq ? 0 : textPx(m, cpl) + 64 + (m.thinking ? 40 : 0) + (m.tools?.length ? 30 : 0) + (m.shows?.length || 0) * 260 + (m.things?.length ? 300 : 0) + (m.attachments?.length ? 34 : 0));
  // a field a stub may give: a short value (its content fields never, whatever their size)
  const BIG = new Set(['text', 'thinking', 'sent', 'ctx']);
  const small = (x) => x === null || typeof x === 'boolean' || typeof x === 'number' || (typeof x === 'string' && x.length <= 80) || (typeof x === 'object' && JSON.stringify(x).length <= 200);
  // a message's record: [height, its keys in order, its small fields] (a message that isn't an object: [height, null, itself])
  function metaOf(m, cpl) {
    const h = msgPx(m, cpl);
    if (m === null || typeof m !== 'object' || Array.isArray(m)) return [h, null, m];
    const keys = Object.keys(m); const s = {};
    for (const k of keys) if (!BIG.has(k) && small(m[k])) s[k] = m[k];
    return [h, keys, s];
  }

  // ---------- the errors ----------
  class NotLoaded extends Error {
    constructor(k, key) { super(`This long chat is still loading its older messages (message ${k + 1}${key ? `, ${String(key)}` : ''}): try again in a moment.`); this.code = 'ENOTLOADED'; this.k = k; }
  }

  // ---------- stubs ----------
  const STUBS = new WeakSet();
  const isStub = (x) => x !== null && typeof x === 'object' && STUBS.has(x);
  const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
  // a small object value read-only (a change to it would be lost: it throws)
  const RO = new WeakMap();
  function ro(x, k, w) {
    if (x === null || typeof x !== 'object') return x;
    let p = RO.get(x);
    if (!p) {
      const no = (t, q) => w(k, q);
      p = new Proxy(x, { get: (t, q) => ro(Reflect.get(t, q), k, w), set: no, defineProperty: no, deleteProperty: no, setPrototypeOf: no, preventExtensions: no });
      RO.set(x, p);
    }
    return p;
  }
  // (one Set per distinct list of keys: most messages share a few)
  const SETS = new Map();
  const keySet = (keys) => { const id = keys.join('\u0001'); let x = SETS.get(id); if (!x) { if (SETS.size > 500) SETS.clear(); SETS.set(id, (x = new Set(keys))); } return x; };
  // meta: the message's record · miss(k, key) and write(k, key) throw
  function stubOf(meta, k, miss, write) {
    if (!meta) throw new NotLoaded(k);
    if (meta[1] === null) return meta[2]; // (not an object: the value itself, exact)
    const keys = meta[1]; const s = meta[2]; const has = keySet(keys);
    const no = (t, p) => write(k, p);
    const px = new Proxy({}, {
      get(t, p) { if (typeof p === 'string' && has.has(p)) { if (own(s, p)) return ro(s[p], k, write); return miss(k, p); } return Reflect.get(t, p); },
      has: (t, p) => has.has(p) || Reflect.has(t, p),
      ownKeys: () => [...keys],
      getOwnPropertyDescriptor(t, p) { if (typeof p !== 'string' || !has.has(p)) return undefined; if (!own(s, p)) return miss(k, p); return { value: ro(s[p], k, write), writable: true, enumerable: true, configurable: true }; },
      set: no, defineProperty: no, deleteProperty: no, setPrototypeOf: no, preventExtensions: no,
    });
    STUBS.add(px);
    return px;
  }

  // ---------- the messages array ----------
  const idx = (p) => { if (typeof p !== 'string') return -1; const c = p.charCodeAt(0); if (c < 48 || c > 57) return -1; const k = +p; return k >>> 0 === k && k < 4294967295 && String(k) === p ? k : -1; };
  // o: { n (the chat's true count), loaded ([[k, message]]), meta (k → record), miss(k, key), refuse(k, why) }
  // → { px: the array the chat holds, t: its target (the loaded messages own their index), put(k, m), drop(k), tf(),
  //     keys() (the loaded indexes, ascending), loaded(k), stubs }
  function makeArray(o) {
    const t = new Array(o.n);
    const stubs = new Map(); const gone = new Set();
    let tf = o.n; // every index in [tf, length) is loaded
    const miss = (k, key) => o.miss(k, key);
    const write = (k, key) => o.refuse(k, `a change to message ${k + 1} (${String(key)}) that isn't loaded`, false);
    const stub = (k) => { let s = stubs.get(k); if (s === undefined) { s = stubOf(o.meta(k), k, miss, write); stubs.set(k, s); } return s; };
    const fix = () => { if (tf > t.length) tf = t.length; while (tf > 0 && (tf - 1) in t) tf -= 1; };
    const put = (k, m) => { if (k < 0 || k >= t.length) return; t[k] = m; stubs.delete(k); gone.delete(k); fix(); };
    const drop = (k) => { if (!(k in t)) return; delete t[k]; if (k >= tf) tf = k + 1; };
    for (const [k, m] of o.loaded || []) if (k >= 0 && k < o.n) t[k] = m;
    fix();
    const guard = (k, v) => { if (isStub(v)) o.refuse(k, 'an unloaded message written into the chat', true); if (k < tf && k < t.length) o.refuse(k, `a change at message ${k + 1} with older messages not loaded after it`, true); };
    const px = new Proxy(t, {
      get(tt, p, r) {
        const k = idx(p);
        if (k < 0) return Reflect.get(tt, p, r);
        if (k >= tt.length || gone.has(k)) return undefined;
        return k in tt ? tt[k] : stub(k);
      },
      has(tt, p) { const k = idx(p); return k < 0 ? Reflect.has(tt, p) : k < tt.length && !gone.has(k); },
      set(tt, p, v, r) {
        const k = idx(p);
        if (k >= 0) { guard(k, v); tt[k] = v; gone.delete(k); stubs.delete(k); return true; }
        if (p === 'length') {
          const n = Number(v);
          if (n > tt.length) o.refuse(tt.length, 'the chat made longer with nothing in its new places', true);
          if (n < tt.length) { for (const k of stubs.keys()) if (k >= n) stubs.delete(k); for (const k of gone) if (k >= n) gone.delete(k); tt.length = n; fix(); }
          return true;
        }
        return Reflect.set(tt, p, v, r);
      },
      deleteProperty(tt, p) {
        const k = idx(p);
        if (k < 0) return Reflect.deleteProperty(tt, p);
        if (k >= tt.length) return true;
        guard(k, undefined); delete tt[k]; gone.add(k); return true;
      },
      defineProperty(tt, p, d) {
        const k = idx(p);
        if (k < 0) return Reflect.defineProperty(tt, p, d);
        guard(k, d.value);
        if (!('value' in d)) o.refuse(k, 'an accessor on a message', true);
        tt[k] = d.value; gone.delete(k); stubs.delete(k); return true;
      },
      ownKeys(tt) { const out = []; for (let k = 0; k < tt.length; k++) if (!gone.has(k)) out.push(String(k)); for (const k of Reflect.ownKeys(tt)) if (idx(k) < 0) out.push(k); return out; },
      getOwnPropertyDescriptor(tt, p) {
        const k = idx(p);
        if (k < 0 || k >= tt.length || gone.has(k) || k in tt) return Reflect.getOwnPropertyDescriptor(tt, p);
        return { value: stub(k), writable: true, enumerable: true, configurable: true };
      },
      setPrototypeOf: () => false, preventExtensions: () => false,
    });
    // (a message deleted out of the list (`delete`) is a hole, as in any array: saved as null, the same as a whole save)
    const keys = () => { const out = []; for (const k of Object.keys(t)) { const i = idx(k); if (i >= 0 && !gone.has(i)) out.push(i); } for (const k of gone) if (k < t.length) out.push(k); return out.sort((a, b) => a - b); };
    return { px, t, put, drop, tf: () => tf, keys, loaded: (k) => k in t || gone.has(k), stubs, gone };
  }

  // ---------- saving by change (native.js saveChat's way, for a windowed chat) ----------
  // s: native.js's shape record { ver, keys, head (Map), msgs (a shape per message; a windowed chat's are those of its
  // loaded messages only: an unloaded message is unchanged by definition, it can't be touched) }; ks: the loaded
  // indexes; at(k): message k (loaded); SH: { shapeOf, sameShape }. → the change { keys, set, n, msgs, trunc } (null:
  // nothing changed). trunc: the chat got SHORTER on purpose (edit-from-here, retry, a cut): the store thread refuses a
  // shorter chat without it.
  function delta(chat, s, ks, at, SH) {
    const keys = Object.keys(chat); const set = {}; let n = keys.length !== s.keys.length || keys.some((k, i) => k !== s.keys[i]) ? 1 : 0;
    for (const k of keys) if (k !== 'messages' && (!s.head.has(k) || !SH.sameShape(s.head.get(k), chat[k]))) { set[k] = chat[k]; s.head.set(k, SH.shapeOf(chat[k])); n += 1; }
    for (const k of [...s.head.keys()]) if (!keys.includes(k)) { s.head.delete(k); n += 1; }
    const len = chat.messages.length; const msgs = [];
    for (const k of ks) { if (k >= len) continue; const m = at(k); if (k >= s.msgs.length || !SH.sameShape(s.msgs[k], m)) { msgs.push([k, m]); s.msgs[k] = SH.shapeOf(m); } }
    const trunc = len < s.msgs.length;
    if (!n && !msgs.length && !trunc && len === s.msgs.length) return null;
    s.msgs.length = len; s.keys = keys;
    return { keys, set, n: len, msgs, ...(trunc ? { trunc: true } : {}) };
  }

  // ---------- find in the chat (the store thread's side, exact) ----------
  // the test chat-rest.js restingHits makes on a message (needle: lowercase)
  const findHit = (m, needle) => Boolean(m) && !m.compactReq && (String(m.text || '').toLowerCase().includes(needle) || String(m.thinking || '').toLowerCase().includes(needle));

  return { textPx, msgPx, metaOf, small, BIG, NotLoaded, stubOf, isStub, makeArray, delta, findHit, idx };
})();
if (typeof module !== 'undefined') module.exports = ChatWinCore; else window.ChatWinCore = ChatWinCore;
