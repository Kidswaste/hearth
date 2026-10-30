// (round 92, labchat92) The chat ↔ Lab glue's pure parts (no DOM, no Lab): tested by dev/labchat92-test.js.
//   · caret: where the owner's cursor goes when an AI edit changes the text they're typing in (it stays on their
//     word instead of jumping to the end)
//   · wholeLayer: a code block in a reply that is a whole Lab layer (it can replace a layer or be added as one)
//   · staleRewrite: an AI's whole-layer rewrite that would drop what the owner typed since the AI last saw the layer
//   · outcome / tellText: what applying a reply's code did, in words, for the note and for the message the owner may send
//   · sceneLine: the one line a chat opened from the Lab gets about the scene (name, layers, selection, picked object)
(function (root) {
  const clip = (s, n) => { const t = String(s ?? '').replace(/\s+/g, ' ').trim(); return t.length > n ? `${t.slice(0, n - 1)}…` : t; };

  // old → next: a position in old, mapped into next (the changed part found by the common start and end)
  function caret(old, next, pos) {
    const a = String(old ?? ''); const b = String(next ?? '');
    const p = Math.max(0, Math.min(a.length, Number(pos) || 0));
    if (a === b) return p;
    const max = Math.min(a.length, b.length);
    let pre = 0;
    while (pre < max && a.charCodeAt(pre) === b.charCodeAt(pre)) pre += 1;
    let suf = 0;
    while (suf < max - pre && a.charCodeAt(a.length - 1 - suf) === b.charCodeAt(b.length - 1 - suf)) suf += 1;
    if (p <= pre) return p; // before the change: where it was
    if (p >= a.length - suf) return p + (b.length - a.length); // after it: moved by what was added or taken out
    return b.length - suf; // inside it: at the end of the new text
  }

  // a whole layer: an ES module that imports three and draws (its own renderer and loop), not a snippet
  function wholeLayer(code, lang = 'js') {
    const s = String(code || '');
    if (!/^(js|javascript|mjs|)$/i.test(String(lang || ''))) return false;
    if (s.length < 80 || s.length > 400000) return false;
    return /\bimport\b[^;\n]*['"]three['"]/.test(s) && /setAnimationLoop|requestAnimationFrame/.test(s) && /\.render\s*\(/.test(s);
  }

  // A rewrite of a whole layer (three_set_code / three_update_layer with code) is refused when the owner typed in that
  // layer within the last `windowMs` and the AI's last look at it (seenText) isn't the code as it is now: it would
  // silently drop the owner's typing. handAt: the owner's last keystroke in that layer (ms), 0 = never here.
  function staleRewrite({ handAt = 0, seenText = null, code = '', now = Date.now(), windowMs = 10 * 60 * 1000 } = {}) {
    if (!handAt || now - handAt > windowMs) return false;
    return seenText !== code;
  }
  const agoWords = (ms) => { const s = Math.max(1, Math.round(ms / 1000)); return s < 90 ? `${s} s` : `${Math.round(s / 60)} min`; };
  const staleError = (layer, ms) => `The owner is editing "${layer}" by hand (last change ${agoWords(ms)} ago) and your code doesn't have those changes, so nothing was changed. Read it again (three_read_code) and change your part with three_edit_code.`;

  // r: a Lab tool's answer value ({ errors, console, … }); health: [{ message, line, kind }] the scene's health for that layer
  function outcome(r, health = [], layer = '') {
    const v = r && typeof r === 'object' ? r : {};
    const errs = [];
    const seen = new Set();
    // the same error can come as a row ({ layer, message, line }), as a line ("[Ring] SyntaxError: … (line 9)") and
    // from the scene's health: said once
    const push = (message, line) => {
      let m = String(message ?? ''); let ln = line || null; let who = null;
      const x = /^\[([^\]]+)\]\s*(.*)$/s.exec(m); if (x) { who = x[1]; m = x[2]; }
      const y = /^(.*?)\s*\((?:at )?line (\d+)\)\s*$/s.exec(m); if (y) { m = y[1]; ln = ln || Number(y[2]); }
      if (who && layer && who !== layer) return;
      m = clip(m, 160);
      const k = m.toLowerCase().slice(0, 80);
      if (!m) return;
      if (seen.has(k)) { const e = errs.find((z) => z.key === k); if (e && !e.line && ln) e.line = ln; return; }
      seen.add(k); errs.push({ key: k, message: m, line: ln });
    };
    for (const e of Array.isArray(v.errors) ? v.errors : []) if (typeof e === 'string' || !e.layer || !layer || e.layer === layer) push(typeof e === 'string' ? e : e.message, e.line);
    for (const h of health || []) push(h.message, h.line);
    const con = (Array.isArray(v.console) ? v.console : typeof v.console === 'string' ? v.console.split('\n') : [])
      .map((l) => clip(l, 140)).filter((l) => l && !/\[(error|warn)\]/i.test(l)).slice(-4);
    const words = errs.length
      ? `${errs.length === 1 ? '1 error' : `${errs.length} errors`}: ${errs.slice(0, 2).map((e) => `${e.message}${e.line ? ` (line ${e.line})` : ''}`).join(' · ')}`
      : 'it runs with no errors';
    return { ok: !errs.length, errors: errs.map(({ message, line }) => ({ message, line })), console: con, words };
  }
  // the message the owner's click sends ("Tell Claude what happened"): short, no code (the AI wrote it)
  function tellText({ how = 'replaced', layer, scene, out, undone = false }) {
    const o = out || { errors: [], console: [] };
    const lines = [`I applied the code from your last reply: it ${how === 'added' ? `is a new layer "${layer}"` : `replaced the layer "${layer}"`} in the Lab scene "${scene}".`];
    if (o.errors.length) {
      lines.push(`It doesn't run yet: ${o.errors.length === 1 ? 'this error' : `${o.errors.length} errors`}:`);
      for (const e of o.errors.slice(0, 3)) lines.push(`- ${e.message}${e.line ? ` (line ${e.line})` : ''}`);
    } else lines.push('It runs with no errors.');
    if (o.console.length) lines.push(`Console: ${o.console.join(' | ')}`);
    if (undone) lines.push('I undid it, so the layer is as it was before.');
    lines.push(o.errors.length && !undone ? 'Please fix it.' : 'What next?');
    return lines.join('\n');
  }

  // the line a chat opened from the Lab gets (≈ 30–60 tokens): the scene, its layers, what's selected
  function sceneLine({ scene, layers = [], selected = null, picked = null } = {}) {
    const names = layers.slice(0, 16).map((n) => (n === selected ? `${clip(n, 28)}*` : clip(n, 28)));
    const more = layers.length > 16 ? ` +${layers.length - 16}` : '';
    return `[Lab scene "${clip(scene, 40)}" · layers, bottom first (* = selected): ${names.join(', ') || 'none'}${more}${picked ? ` · picked in the scene editor: ${clip(picked, 60)}` : ''}]`;
  }

  const api = { caret, wholeLayer, staleRewrite, staleError, outcome, tellText, sceneLine, agoWords };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.LabChatCore = api;
})(typeof window !== 'undefined' ? window : globalThis);
