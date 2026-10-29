// (round 82, bigchat82) a GIANT chat's bytes parsed off the window's thread: native.js getChat fetches them in parts
// (4 MB each: a few ms of the main process per part) and hands them over here without a copy; this puts them together,
// decodes and parses them, and the window receives the finished chat (the same structured copy it used to receive from
// the main process, which never holds such a chat whole any more). Decoding + parsing 60 MB on the window itself took
// ≈ 0.5 s; receiving the parsed chat ≈ 0.1–0.2 s.
self.onmessage = (e) => {
  const { id, parts } = e.data || {};
  let chat = null; let err = null;
  try {
    const list = Array.isArray(parts) ? parts : [];
    const all = list.length === 1 ? list[0] : new Uint8Array(list.reduce((n, b) => n + b.length, 0));
    if (list.length !== 1) { let o = 0; for (const b of list) { all.set(b, o); o += b.length; } }
    chat = JSON.parse(new TextDecoder().decode(all));
  } catch (x) { err = String(x?.message || x); }
  self.postMessage({ id, chat, err });
};
