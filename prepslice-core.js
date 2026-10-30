// (round 89, desk89) Export…'s prepare in slices. ProjBundleCore.prepare(body, opts) is a JSON copy of the whole body
// (Clink's: 4 MB with its 1,600-message chat), then the steps that leave out what wasn't chosen (shape), then the secrets
// scrub over every key and string. All in the task of the Export… click: 35–50 ms here, 50–80 ms with the rest of that
// task (projopen86, "What's left"). The same work, in pieces of a few ms:
//   1.–2. the JSON copy (ProjBundleCore.copy: JSON.parse(JSON.stringify(body))), in steps: copier() below takes the
//      body apart where JSON would and copies the rest with JSON itself, so the copy is JSON's to the last key
//   3. ProjBundleCore.shape(copy)    (the very same function prepare() runs)
//   4. the scrub, in steps of ≤ budgetMs: the same walk as ProjBundleCore.scrub, written as a loop that can stop and go
//      on. Same keys dropped (SECRET_KEY on a string or object value), same strings replaced (SECRET_STR, every match),
//      same depth rule (past 60 levels a value is kept as it is), same count, same key order, holes in arrays kept.
//      Nothing is looser: the patterns are ProjBundleCore's own (the string pattern is re-made from its source and
//      flags, so the two walks never share its lastIndex).
// → the same { body, leftOut, secrets } as ProjBundleCore.prepare (dev/desk89-test.js compares them on made-up bodies
// full of secrets of every kind, and on random ones).
const PrepSlice = (() => {
  const C = typeof ProjBundleCore !== 'undefined' ? ProjBundleCore : require('./projbundle-core.js');
  const MAX_DEPTH = 60; // ProjBundleCore.scrub's: deeper values are kept as they are
  // the scrub as steps: scrubber(obj).step(budgetMs, now) → true once done; .result() → { value, count }
  function scrubber(obj) {
    const KEY = C.SECRET_KEY;
    const STR = new RegExp(C.SECRET_STR.source, C.SECRET_STR.flags);
    let count = 0;
    const stack = [];
    const str = (v) => { if (!STR.test(v)) return v; STR.lastIndex = 0; return v.replace(STR, () => { count += 1; return '[secret removed]'; }); };
    // one value at its depth: a string or a plain value is done now; an array / object gets its new container (filled
    // later, in the same order the recursive walk fills it)
    const visit = (v, depth) => {
      if (depth > MAX_DEPTH) return v;
      if (typeof v === 'string') return str(v);
      if (Array.isArray(v)) { const out = new Array(v.length); stack.push({ a: v, out, i: 0, n: v.length, depth }); return out; }
      if (C.isObj(v)) { const e = Object.entries(v); const out = {}; stack.push({ e, out, i: 0, n: e.length, depth }); return out; }
      return v;
    };
    const value = visit(obj, 0);
    let done = !stack.length;
    function step(budgetMs = Infinity, now = () => Date.now()) {
      if (done) return true;
      const t0 = now(); let n = 0;
      while (stack.length) {
        const f = stack[stack.length - 1];
        if (f.i >= f.n) { stack.pop(); continue; }
        const i = f.i++;
        if (f.a) { if (i in f.a) f.out[i] = visit(f.a[i], f.depth + 1); } // (Array.prototype.map skips holes: so does this)
        else {
          const [k, x] = f.e[i];
          if (KEY.test(k) && (typeof x === 'string' || C.isObj(x))) count += 1;
          else f.out[k] = visit(x, f.depth + 1); // (assigned as the recursive walk does: o[k] = …)
        }
        if ((++n & 63) === 0 && now() - t0 >= budgetMs) return false;
      }
      done = true;
      return true;
    }
    return { step, result: () => ({ value, count }), done: () => done };
  }
  // The JSON copy as steps: copier(v).step(budgetMs, now) → true once done; .result() → JSON.parse(JSON.stringify(v)).
  // JSON.stringify of a 4–8 MB body is one 15–50 ms call, so the copy is taken apart where JSON would take it apart:
  // a plain object (its own prototype Object's or none, no toJSON) key by key in Object.keys order, an array index by
  // index (holes and what JSON can't write become null), down to SPLIT levels. Everything else is copied by JSON itself,
  // under the very key it has (a toJSON(key) sees the same key): JSON's own answer for it, its own errors (a BigInt, a
  // loop: the same TypeError). Plain values are what JSON makes of them: a string the same, a number the same or null
  // (NaN, ±Infinity; -0 is 0), true / false / null, and undefined / a function / a symbol left out (null in an array).
  // A key named "__proto__" is an own key in the copy, as JSON.parse makes it.
  const SPLIT = 8;
  const OMIT = Symbol('omit');
  const plain = (x) => { if (x === null || typeof x !== 'object') return false; if (typeof x.toJSON === 'function') return false; if (Array.isArray(x)) return true; const p = Object.getPrototypeOf(x); return p === Object.prototype || p === null; };
  const put = (o, k, v) => { if (k === '__proto__') Object.defineProperty(o, k, { value: v, writable: true, enumerable: true, configurable: true }); else o[k] = v; };
  function leaf(x, key) {
    switch (typeof x) {
      case 'string': case 'boolean': return x;
      case 'number': return Number.isFinite(x) ? (x === 0 ? 0 : x) : null;
      case 'undefined': case 'function': case 'symbol': return OMIT;
      default: break;
    }
    if (x === null) return null;
    // an object JSON writes its own way (a Date, a class's instance, a toJSON) or a BigInt: JSON itself, under its key
    const h = {}; put(h, key, x);
    const s = JSON.stringify(h);
    const back = JSON.parse(s);
    return Object.prototype.hasOwnProperty.call(back, key) ? Object.getOwnPropertyDescriptor(back, key).value : OMIT;
  }
  function copier(v) {
    const stack = [];
    const open = (x, depth) => {
      if (Array.isArray(x)) { const out = []; stack.push({ a: x, out, i: 0, n: x.length, depth }); return out; }
      const keys = Object.keys(x); const out = {}; stack.push({ o: x, keys, out, i: 0, n: keys.length, depth }); return out;
    };
    let value;
    if (v === undefined || !plain(v)) value = v === undefined ? undefined : JSON.parse(JSON.stringify(v)); // (ProjBundleCore.copy itself)
    else value = open(v, 0);
    let done = !stack.length;
    function step(budgetMs = Infinity, now = () => Date.now()) {
      if (done) return true;
      const t0 = now(); let n = 0;
      while (stack.length) {
        const f = stack[stack.length - 1];
        if (f.i >= f.n) { stack.pop(); continue; }
        const i = f.i++;
        const key = f.a ? String(i) : f.keys[i];
        const x = f.a ? f.a[i] : f.o[key];
        const c = plain(x) && f.depth + 1 < SPLIT ? open(x, f.depth + 1) : leaf(x, key);
        if (f.a) f.out.push(c === OMIT ? null : c);
        else if (c !== OMIT) put(f.out, key, c);
        if ((++n & 63) === 0 && now() - t0 >= budgetMs) return false;
      }
      done = true;
      return true;
    }
    return { step, result: () => value, done: () => done };
  }
  const nextTask = () => new Promise((r) => setTimeout(r, 0));
  // ProjBundleCore.prepare(body, opts), in tasks of ≤ budgetMs (the JSON copy's two halves are one task each)
  async function prepare(body, opts = {}, { budgetMs = 8, pause = nextTask, now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now()), stats = null } = {}) {
    if (body === undefined) return C.prepare(body, opts); // (as prepare does: it fails the same way)
    const t0 = now(); let slices = 0; let longest = 0;
    const timed = (fn) => { const a = now(); const r = fn(); longest = Math.max(longest, now() - a); slices += 1; return r; };
    const cp = copier(body);
    while (!timed(() => cp.step(budgetMs, now))) await pause();
    const b = cp.result();
    await pause();
    const leftOut = timed(() => C.shape(b, opts));
    const sc = scrubber(b);
    while (!timed(() => sc.step(budgetMs, now))) await pause();
    const r = sc.result();
    if (stats) Object.assign(stats, { ms: Math.round(now() - t0), slices, longestMs: Math.round(longest * 10) / 10 });
    return { body: r.value, leftOut, secrets: r.count };
  }
  return { scrubber, copier, prepare };
})();
if (typeof module !== 'undefined') module.exports = PrepSlice;
