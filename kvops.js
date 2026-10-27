// (round 73, chatsteady73; round 75, syncstate75: its own file, shared by store.js and the store thread storework.js)
// A store changed a few fields at a time (the feature-usage counts, usage.js): [op, path, value] changes applied to the
// store's value. inc: add to a number · max · def: set when missing · set · del. Paths are arrays of string keys; a bad
// path (or one through __proto__ / constructor / prototype) does nothing.
'use strict';
const BAD_KEY = new Set(['__proto__', 'constructor', 'prototype']);
function applyOps(root, ops) {
  for (const x of Array.isArray(ops) ? ops : []) {
    const [op, p, v] = Array.isArray(x) ? x : [];
    if (!Array.isArray(p) || !p.length || p.some((k) => typeof k !== 'string' || BAD_KEY.has(k))) continue;
    let o = root;
    for (const k of p.slice(0, -1)) { if (!o[k] || typeof o[k] !== 'object' || Array.isArray(o[k])) o[k] = {}; o = o[k]; }
    const k = p[p.length - 1];
    if (op === 'inc') o[k] = (Number(o[k]) || 0) + (Number(v) || 0);
    else if (op === 'max') o[k] = Math.max(Number(o[k]) || 0, Number(v) || 0);
    else if (op === 'def') { if (o[k] === undefined) o[k] = v; } else if (op === 'set') o[k] = v;
    else if (op === 'del') delete o[k];
  }
  return root;
}
module.exports = { applyOps };
