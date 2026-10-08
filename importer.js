// Imports past conversations from the data exports of claude.ai and chatgpt.com.
// claude.ai: Settings → Privacy → Export data.   ChatGPT: Settings → Data controls → Export data.
// Both arrive by email as a .zip containing conversations.json. Also reads a bare conversations.json, split
// exports (conversations-000.json…), an object wrapping the list ({ conversations: [...] }), and generic chat
// JSON ([{ title, messages: [{ role, content }] }], including Hearth's own chat files).
// Handles the export variants seen in the wild: claude.ai content blocks (text, thinking, tool use, attachments),
// ChatGPT trees without current_node, multimodal parts, code / quote blocks, hidden system and tool messages.
const { execFileSync } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const store = require('./store');
// Windows' own bsdtar (Git's GNU tar on the PATH can't write zips); the Mac's tar is bsdtar.
const TAR = process.platform === 'win32' ? require('path').join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe') : 'tar';
const ATTACH_CHARS = 4000; // pasted / attached text kept per message (the rest is cut, the chat stays light)

function extractZip(zipPath) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-hub-import-'));
  // Windows 10+ ships bsdtar, which reads .zip files (GNU tar on Linux doesn't: unzip there).
  if (process.platform === 'linux') execFileSync('unzip', ['-q', '-o', zipPath, '-d', dir]);
  else execFileSync(TAR, ['-xf', zipPath, '-C', dir], { windowsHide: true });
  return dir;
}

function findConversationFiles(dir) {
  const found = [];
  const walk = (d) => {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/^conversations.*\.json$/i.test(entry.name)) found.push(full);
    }
  };
  walk(dir);
  return found.sort();
}

const toMs = (value) => {
  if (!value) return Date.now();
  if (typeof value === 'number') return value < 1e12 ? value * 1000 : value;
  const t = Date.parse(value);
  return Number.isNaN(t) ? Date.now() : t;
};
const cut = (s, n = ATTACH_CHARS) => (s.length > n ? `${s.slice(0, n)}\n… (${s.length - n} more characters not imported)` : s);

// ---------- claude.ai ----------
function claudeText(m) {
  const blocks = Array.isArray(m.content) ? m.content : [];
  let text = '';
  if (blocks.length) {
    text = blocks.map((c) => {
      if (c.type === 'text') return c.text || '';
      if (c.type === 'tool_use') return c.name ? `*[used ${c.name}]*` : '';
      if (c.type === 'tool_result' || c.type === 'thinking' || c.type === 'redacted_thinking') return '';
      return typeof c.text === 'string' ? c.text : '';
    }).filter(Boolean).join('\n\n');
  }
  if (!text.trim()) text = m.text || '';
  // pasted text and attached files: their extracted text (cut) or at least their names
  const extras = [];
  for (const a of m.attachments || []) {
    const name = a.file_name || a.name || 'attachment';
    extras.push(a.extracted_content ? `📎 ${name}:\n\`\`\`\n${cut(String(a.extracted_content))}\n\`\`\`` : `📎 ${name}`);
  }
  for (const f of m.files || []) extras.push(`📎 ${f.file_name || f.name || 'file'}`);
  return [text.trim(), ...extras].filter(Boolean).join('\n\n');
}
function fromClaude(conv) {
  const messages = (conv.chat_messages || []).map((m) => {
    const role = m.sender === 'human' || m.sender === 'user' ? 'user' : m.sender === 'assistant' ? 'assistant' : null;
    return role ? { role, text: claudeText(m), at: toMs(m.created_at) } : null;
  }).filter((m) => m?.text);
  return {
    sourceId: conv.uuid || conv.id || hashOf(conv.name, conv.created_at),
    title: conv.name || messages[0]?.text.slice(0, 48) || 'Untitled chat',
    createdAt: toMs(conv.created_at),
    updatedAt: toMs(conv.updated_at || conv.created_at),
    messages,
  };
}

// ---------- ChatGPT ----------
function chatgptText(m) {
  const c = m.content || {};
  const type = c.content_type || 'text';
  if (['thoughts', 'reasoning_recap', 'execution_output', 'system_error', 'user_editable_context', 'model_editable_context'].includes(type)) return '';
  if (type === 'code') return c.text ? `\`\`\`${c.language && c.language !== 'unknown' ? c.language : ''}\n${c.text}\n\`\`\`` : '';
  if (type === 'tether_quote') return c.text ? `> ${(c.title ? `${c.title}: ` : '') + c.text.replace(/\n/g, '\n> ')}` : '';
  if (type === 'tether_browsing_display') return c.summary || '';
  const parts = Array.isArray(c.parts) ? c.parts : c.text ? [c.text] : [];
  return parts.map((p) => {
    if (typeof p === 'string') return p;
    if (p && typeof p === 'object') {
      if (typeof p.text === 'string') return p.text;
      if (/image/.test(p.content_type || '')) return '*[image]*';
      if (/audio/.test(p.content_type || '')) return p.text || '*[voice]*';
    }
    return '';
  }).filter(Boolean).join('\n\n').trim();
}
// ChatGPT stores each conversation as a tree; follow the branch that was last shown (or the newest leaf).
function fromChatGPT(conv) {
  const nodes = conv.mapping || {};
  let leaf = conv.current_node && nodes[conv.current_node] ? conv.current_node : null;
  if (!leaf) {
    let best = -1;
    for (const [id, n] of Object.entries(nodes)) {
      if (n.children?.length) continue;
      const t = n.message?.create_time || 0;
      if (t >= best) { best = t; leaf = id; }
    }
  }
  const chain = [];
  const seen = new Set();
  for (let id = leaf; id && nodes[id] && !seen.has(id); id = nodes[id].parent) { seen.add(id); chain.push(nodes[id]); }
  const messages = chain.reverse().map(({ message: m }) => {
    if (!m || !['user', 'assistant'].includes(m.author?.role)) return null;
    if (m.metadata?.is_visually_hidden_from_conversation || m.metadata?.is_user_system_message) return null;
    if (m.recipient && m.recipient !== 'all') return null; // calls to tools (browser, python…)
    const text = chatgptText(m);
    return text ? { role: m.author.role, text, at: toMs(m.create_time || conv.create_time) } : null;
  }).filter(Boolean);
  return {
    sourceId: conv.conversation_id || conv.id || hashOf(conv.title, conv.create_time),
    title: conv.title || messages[0]?.text.slice(0, 48) || 'Untitled chat',
    createdAt: toMs(conv.create_time),
    updatedAt: toMs(conv.update_time || conv.create_time),
    messages,
  };
}

// ---------- generic ([{ title, messages: [{ role, content | text }] }], Hearth chat files) ----------
function fromGeneric(conv) {
  const messages = (conv.messages || []).map((m) => {
    const role = /^(user|human)$/i.test(m.role || m.sender || '') ? 'user' : /^(assistant|ai|bot|model)$/i.test(m.role || m.sender || '') ? 'assistant' : null;
    const text = typeof m.text === 'string' ? m.text : typeof m.content === 'string' ? m.content : Array.isArray(m.content) ? m.content.map((c) => (typeof c === 'string' ? c : c?.text || '')).join('\n\n') : '';
    return role && text.trim() ? { role, text: text.trim(), at: toMs(m.at || m.created_at || m.timestamp) } : null;
  }).filter(Boolean);
  return {
    sourceId: conv.id || conv.uuid || hashOf(conv.title, JSON.stringify(messages[0] || '')),
    title: conv.title || conv.name || messages[0]?.text.slice(0, 48) || 'Untitled chat',
    createdAt: toMs(conv.createdAt || conv.created_at || messages[0]?.at),
    updatedAt: toMs(conv.updatedAt || conv.updated_at || messages.at(-1)?.at),
    messages,
  };
}

const hashOf = (...parts) => crypto.createHash('sha1').update(parts.map((p) => JSON.stringify(p ?? null)).join('|')).digest('hex');

function detect(conversations) {
  const sample = conversations.find((c) => c && typeof c === 'object') || {};
  if ('chat_messages' in sample) return 'claude.ai';
  if ('mapping' in sample) return 'chatgpt.com';
  if (Array.isArray(sample.messages)) return 'chat file';
  return null;
}
// The list of conversations in a parsed file, whatever its wrapping.
function listOf(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.conversations)) return data.conversations;
  if (data && typeof data === 'object' && (data.chat_messages || data.mapping || Array.isArray(data.messages))) return [data]; // one conversation
  return null;
}

// agentFor(source) picks which agent the imported chats belong to.
// options: { dryRun } reports what would happen without saving; onProgress({ done, total, file }) as it goes.
// Returns a Promise of the summary.
async function importFile(filePath, agentFor, { dryRun = false, onProgress } = {}) {
  const tempDir = /\.zip$/i.test(filePath) ? extractZip(filePath) : null;
  try {
    const files = tempDir ? findConversationFiles(tempDir) : [filePath];
    if (!files.length) throw new Error('No conversations.json found in that file.');
    const summary = { imported: 0, skipped: 0, duplicates: 0, alreadyThere: 0, empty: 0, failed: 0, messages: 0, sources: {}, counts: {}, titles: [], first: null, last: null, dryRun, files: files.length };
    let recognized = false;
    const seen = new Set();
    const parsed = [];
    for (const file of files) {
      let data;
      try { data = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { summary.failed += 1; continue; }
      const conversations = listOf(data);
      if (!conversations) continue;
      const source = detect(conversations);
      if (!source) continue;
      recognized = true;
      parsed.push({ file, conversations, source });
    }
    if (!recognized) throw new Error("That file doesn't look like a claude.ai or ChatGPT export.");
    const total = parsed.reduce((n, p) => n + p.conversations.length, 0);
    let done = 0;
    for (const { file, conversations, source } of parsed) {
      const agentId = agentFor(source === 'chat file' ? 'claude.ai' : source);
      const convert = source === 'claude.ai' ? fromClaude : source === 'chatgpt.com' ? fromChatGPT : fromGeneric;
      for (const conv of conversations) {
        done += 1;
        if (onProgress && (done % 25 === 0 || done === total)) onProgress({ done, total, file: path.basename(file) });
        if (done % 50 === 0) await new Promise((r) => setImmediate(r)); // lets the progress reach the window
        let chat;
        try { chat = convert(conv); } catch { summary.failed += 1; continue; }
        if (!chat.messages.length) { summary.empty += 1; summary.skipped += 1; continue; }
        const id = `imp-${crypto.createHash('sha1').update(`${source}:${chat.sourceId}`).digest('hex').slice(0, 16)}`;
        // the same conversation twice in one export (split files overlap) counts once
        if (seen.has(id)) { summary.duplicates += 1; summary.skipped += 1; continue; }
        seen.add(id);
        // Re-importing the same export must not overwrite a chat you've continued since.
        if (store.getChat(id)) { summary.alreadyThere += 1; summary.skipped += 1; continue; }
        if (!dryRun) {
          store.saveChat({
            id, agentId, title: chat.title.slice(0, 80), createdAt: chat.createdAt, updatedAt: chat.updatedAt,
            imported: source, session: {}, messages: chat.messages,
          });
        }
        summary.imported += 1;
        summary.messages += chat.messages.length;
        summary.sources[source] = agentId;
        summary.counts[source] = (summary.counts[source] || 0) + 1;
        if (summary.titles.length < 8) summary.titles.push(chat.title.slice(0, 60));
        summary.first = Math.min(summary.first ?? chat.createdAt, chat.createdAt);
        summary.last = Math.max(summary.last ?? chat.updatedAt, chat.updatedAt);
      }
    }
    return summary;
  } finally {
    if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

module.exports = { importFile, _test: { fromClaude, fromChatGPT, fromGeneric, detect, listOf } };
