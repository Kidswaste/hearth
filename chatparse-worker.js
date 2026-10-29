// (round 82, bigchat82) a GIANT chat's bytes parsed off the window's thread: native.js getChat hands the bytes over (no
// copy), this decodes and parses them, and the window receives the finished chat (the same structured copy it used to
// receive from the main process, which never holds such a chat whole any more). Decoding + parsing 60 MB on the window
// itself took ≈ 0.5 s; receiving the parsed chat ≈ 0.1–0.2 s.
self.onmessage = (e) => {
  const { id, bytes } = e.data || {};
  let chat = null; let err = null;
  try { chat = JSON.parse(new TextDecoder().decode(bytes)); } catch (x) { err = String(x?.message || x); }
  self.postMessage({ id, chat, err });
};
