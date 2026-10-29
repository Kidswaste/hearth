// (round 84, bigchat84) /export of a long chat, made a piece at a time (chat-cmds.js): a GIANT chat (6,000 messages,
// 60 MB) exported as JSON was one JSON.stringify of it all on the window's thread (≈ 0.4 s, then 60 MB sent to the main
// process at once, written there in one go); as a web page, every reply's Markdown rendered in one task (seconds).
// Here each format is a list of pieces (one per message, in order) whose joined text is EXACTLY what the whole-chat
// way made (dev/bigchat84-test.js checks it byte for byte), and pump() turns them into parts of about 2 MB written as
// they're made, a few ms of the window at a time. Pure: no DOM (the web page's Markdown comes from the caller).
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.ChatExport = api;
}(typeof self !== 'undefined' ? self : this, () => {
  // JSON.stringify({ ...chat, session: undefined, hearthExport: 1 }, null, 2), its messages one by one: the list sits
  // at depth 1, so each message is its own stringify with every line indented 4 more spaces (JSON text has no raw
  // line breaks inside strings: only the layout's)
  function* json(chat) {
    const ms = chat && Array.isArray(chat.messages) ? chat.messages : null;
    if (!ms) { yield JSON.stringify({ ...chat, session: undefined, hearthExport: 1 }, null, 2); return; }
    const mark = `\u0001hearth-export-${Math.random().toString(36).slice(2)}\u0001`;
    const head = JSON.stringify({ ...chat, session: undefined, hearthExport: 1, messages: mark }, null, 2); // (messages keeps its place)
    const at = head.indexOf(JSON.stringify(mark));
    yield head.slice(0, at);
    if (!ms.length) yield '[]';
    else {
      for (let i = 0; i < ms.length; i++) yield `${i ? ',\n    ' : '[\n    '}${(JSON.stringify(ms[i], null, 2) ?? 'null').replace(/\n/g, '\n    ')}`;
      yield '\n  ]';
    }
    yield head.slice(at + JSON.stringify(mark).length);
  }
  // Native.chatMarkdown, piece by piece (o.name: the AI's name, o.date: the chat's date as shown)
  function* md(chat, o = {}) {
    yield `# ${chat.title}\n\n_${o.name || chat.agentId} · ${o.date}_\n\n`;
    let first = true;
    for (const m of chat.messages) {
      if (m.role === 'error') continue;
      yield `${first ? '' : '\n\n---\n\n'}**${m.role === 'user' ? 'You' : m.role === 'opinion' ? `${m.from} (second opinion)` : o.agentName || 'Assistant'}:**\n\n${m.text}`;
      first = false;
    }
    yield '\n';
  }
  // the plain text: the Markdown without ** __ ` (each piece meets the next at a line break, which no pattern crosses)
  function* txt(chat, o = {}) { for (const p of md(chat, o)) yield p.replace(/\*\*|__|`/g, ''); }
  // the web page: o.head (its <head> and title), o.row(m, i) (one message's <section>, the reply's HTML from the caller)
  function* html(chat, o) {
    yield o.head;
    let first = true;
    for (let i = 0; i < chat.messages.length; i++) { const m = chat.messages[i]; if (m.role === 'error') continue; yield `${first ? '' : '\n'}${o.row(m, i)}`; first = false; }
    yield '\n';
  }
  // pieces → parts of about `part` characters, each handed to write(text) (awaited: the window's turn ends there), and a
  // pause (o.pause) whenever `slice` ms went by making them. → the characters written
  async function pump(pieces, write, { part = 2e6, slice = 12, pause = () => new Promise((r) => setTimeout(r, 0)), now = () => performance.now() } = {}) {
    let buf = []; let n = 0; let all = 0; let t = now();
    for (const p of pieces) {
      buf.push(p); n += p.length;
      if (n >= part) { all += n; await write(buf.join('')); buf = []; n = 0; t = now(); } else if (now() - t > slice) { await pause(); t = now(); }
    }
    if (n || !all) { all += n; await write(buf.join('')); }
    return all;
  }
  return { json, md, txt, html, pump };
}));
