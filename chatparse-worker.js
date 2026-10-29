// (round 82, bigchat82) a GIANT chat's bytes parsed off the window's thread: native.js getChat fetches them in parts
// (4 MB each: a few ms of the main process per part) and hands them over here without a copy; this puts them together,
// decodes and parses them, and the window receives the finished chat (the same structured copy it used to receive from
// the main process, which never holds such a chat whole any more). Decoding + parsing 60 MB on the window itself took
// ≈ 0.5 s; receiving the parsed chat ≈ 0.1–0.2 s.
// (round 84, bigchat84) …and that 0.1–0.2 s was ONE task of the window (the whole chat's structured copy read at once).
// With `chunk`, the chat comes back in slices: first its own fields (with an empty `messages` in its place, so the
// keys keep their order), then its messages in batches of about `chunk` bytes, each its own message (its own task in
// the window: a few ms each, with clicks and frames in between): its last `tail` messages first. The last says `done`.
const sizeOf = (v, d = 0) => { // roughly the bytes a value takes (its strings' length): where to cut the batches
  if (typeof v === 'string') return v.length + 2;
  if (v === null || typeof v !== 'object' || d > 6) return 8;
  let n = 2; if (Array.isArray(v)) { for (const x of v) n += sizeOf(x, d + 1) + 1; } else for (const k in v) n += k.length + 4 + sizeOf(v[k], d + 1);
  return n;
};
self.onmessage = (e) => {
  const { id, parts, chunk, tail = 0 } = e.data || {};
  let chat = null; let err = null;
  try {
    const list = Array.isArray(parts) ? parts : [];
    const all = list.length === 1 ? list[0] : new Uint8Array(list.reduce((n, b) => n + b.length, 0));
    if (list.length !== 1) { let o = 0; for (const b of list) { all.set(b, o); o += b.length; } }
    chat = JSON.parse(new TextDecoder().decode(all));
  } catch (x) { err = String(x?.message || x); }
  const ms = chat && Array.isArray(chat.messages) ? chat.messages : null;
  if (!chunk || !ms || err) { self.postMessage({ id, chat, err, done: true }); return; }
  const head = {}; for (const k of Object.keys(chat)) head[k] = k === 'messages' ? [] : chat[k];
  self.postMessage({ id, head, n: ms.length, done: !ms.length });
  // the end first (`tail` messages: what the chat shows when it opens; their replies can be rendered meanwhile), then
  // the rest in order; the window puts them in order once all are in
  const cut = Math.max(0, ms.length - tail);
  const send = (lo, hi, last) => {
    for (let i = lo; i < hi;) {
      let j = i; let b = 0;
      while (j < hi && (j === i || b < chunk)) { b += sizeOf(ms[j]); j += 1; }
      self.postMessage({ id, from: i, msgs: ms.slice(i, j), tail: lo === cut && cut > 0, done: last && j >= hi });
      i = j;
    }
  };
  send(cut, ms.length, cut === 0); if (cut) send(0, cut, true);
};
