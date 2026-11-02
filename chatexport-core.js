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
  // the whole-chat JSON's text around its message list: [before it, after it]
  function jsonAround(chat) {
    const mark = `\u0001hearth-export-${Math.random().toString(36).slice(2)}\u0001`;
    const head = JSON.stringify({ ...chat, session: undefined, hearthExport: 1, messages: mark }, null, 2); // (messages keeps its place)
    const at = head.indexOf(JSON.stringify(mark));
    return [head.slice(0, at), head.slice(at + JSON.stringify(mark).length)];
  }
  const jsonMsg = (m, i) => `${i ? ',\n    ' : '[\n    '}${(JSON.stringify(m, null, 2) ?? 'null').replace(/\n/g, '\n    ')}`;
  function* json(chat) {
    const ms = chat && Array.isArray(chat.messages) ? chat.messages : null;
    if (!ms) { yield JSON.stringify({ ...chat, session: undefined, hearthExport: 1 }, null, 2); return; }
    const [pre, post] = jsonAround(chat);
    yield pre;
    if (!ms.length) yield '[]';
    else {
      for (let i = 0; i < ms.length; i++) yield jsonMsg(ms[i], i);
      yield '\n  ]';
    }
    yield post;
  }
  // Native.chatMarkdown, piece by piece (o.name: the AI's name, o.date: the chat's date as shown)
  const mdHead = (chat, o) => `# ${chat.title}\n\n_${o.name || chat.agentId} · ${o.date}_\n\n`;
  const mdMsg = (m, first, o) => `${first ? '' : '\n\n---\n\n'}**${m.role === 'user' ? 'You' : m.role === 'opinion' ? `${m.from} (second opinion)` : o.agentName || 'Assistant'}:**\n\n${m.text}`;
  function* md(chat, o = {}) {
    yield mdHead(chat, o);
    let first = true;
    for (const m of chat.messages) {
      if (m.role === 'error') continue;
      yield mdMsg(m, first, o);
      first = false;
    }
    yield '\n';
  }
  // the plain text: the Markdown without ** __ ` (each piece meets the next at a line break, which no pattern crosses)
  const plain = (p) => p.replace(/\*\*|__|`/g, '');
  function* txt(chat, o = {}) { for (const p of md(chat, o)) yield plain(p); }
  // (round 104, checksgc104) the same texts from a chat whose messages come a range at a time (ranges: an async
  // iterable of arrays of messages, in order, ranges.n in all: chatwin.js ranges, a windowed giant chat read through
  // once without loading it whole). A count that doesn't add up to n throws: never a part of the chat as the whole
  async function* jsonFrom(chat, ranges) {
    const [pre, post] = jsonAround(chat);
    yield pre;
    if (!ranges.n) yield '[]';
    else {
      let i = 0;
      for await (const r of ranges) for (let j = 0; j < r.length; j++) { yield jsonMsg(r[j], i); i += 1; }
      if (i !== ranges.n) throw new Error(`the chat read ${i} of ${ranges.n} messages`);
      yield '\n  ]';
    }
    yield post;
  }
  async function* mdFrom(chat, ranges, o = {}) {
    yield mdHead(chat, o);
    let first = true; let i = 0;
    for await (const r of ranges) {
      for (let j = 0; j < r.length; j++) { const m = r[j]; i += 1; if (m.role === 'error') continue; yield mdMsg(m, first, o); first = false; }
    }
    if (i !== ranges.n) throw new Error(`the chat read ${i} of ${ranges.n} messages`);
    yield '\n';
  }
  async function* txtFrom(chat, ranges, o = {}) { for await (const p of mdFrom(chat, ranges, o)) yield plain(p); }
  // the web page: o.head (its <head> and title), o.row(m, i) (one message's <section>, the reply's HTML from the caller)
  function* html(chat, o) {
    yield o.head;
    let first = true;
    for (let i = 0; i < chat.messages.length; i++) { const m = chat.messages[i]; if (m.role === 'error') continue; yield `${first ? '' : '\n'}${o.row(m, i)}`; first = false; }
    yield '\n';
  }
  // (round 105, merge105) the web page from ranges (as jsonFrom): each range's replies rendered in batches of about
  // o.batch characters by o.render(texts) → Promise<html[]> (chat-cmds.js: the Markdown worker, md.js), then its rows,
  // o.row(m, i, html) (html: the reply's, undefined for the others). Only one range's messages and HTML are held at a
  // time. The same text as html() with the same row; a count that doesn't add up to n throws (never a part as the whole)
  const isReply = (m) => m.role !== 'error' && m.role !== 'user' && typeof m.text === 'string';
  async function* htmlFrom(chat, ranges, o) {
    const batch = o.batch ?? 5e5;
    yield o.head;
    let first = true; let i = 0;
    for await (const r of ranges) {
      const todo = []; for (let j = 0; j < r.length; j++) if (isReply(r[j])) todo.push(j);
      const h = new Map();
      for (let k = 0; k < todo.length;) {
        let j = k; let n = 0; while (j < todo.length && (j === k || n < batch)) { n += r[todo[j]].text.length; j += 1; }
        const some = todo.slice(k, j); k = j;
        const out = await o.render(some.map((x) => r[x].text));
        if (!Array.isArray(out) || out.length !== some.length) throw new Error('A part of this chat\'s page didn\'t render: nothing was written.');
        some.forEach((x, y) => h.set(x, out[y]));
      }
      for (let j = 0; j < r.length; j++) { const m = r[j]; const at = i; i += 1; if (m.role === 'error') continue; yield `${first ? '' : '\n'}${o.row(m, at, h.get(j))}`; first = false; }
    }
    if (i !== ranges.n) throw new Error(`the chat read ${i} of ${ranges.n} messages`);
    yield '\n';
  }
  // pieces → parts of about `part` characters, each handed to write(text) (awaited: the window's turn ends there), and a
  // pause (o.pause) whenever `slice` ms went by making them. → the characters written
  async function pump(pieces, write, { part = 2e6, slice = 12, pause = () => new Promise((r) => setTimeout(r, 0)), now = () => performance.now() } = {}) {
    let buf = []; let n = 0; let all = 0; let t = now();
    const take = async (p) => {
      buf.push(p); n += p.length;
      if (n >= part) { all += n; await write(buf.join('')); buf = []; n = 0; t = now(); } else if (now() - t > slice) { await pause(); t = now(); }
    };
    if (pieces[Symbol.asyncIterator]) { for await (const p of pieces) await take(p); } else for (const p of pieces) await take(p); // (round 104: jsonFrom / mdFrom / txtFrom)
    if (n || !all) { all += n; await write(buf.join('')); }
    return all;
  }
  return { json, md, txt, html, pump, jsonFrom, mdFrom, txtFrom, htmlFrom };
}));
