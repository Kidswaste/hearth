// Imports past conversations from the data exports of claude.ai and chatgpt.com.
// claude.ai: Settings → Privacy → Export data.   ChatGPT: Settings → Data controls → Export data.
// Both arrive by email as a .zip containing conversations.json.
const { execFileSync } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const store = require('./store');

function extractZip(zipPath) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-hub-import-'));
  // Windows 10+ ships bsdtar, which reads .zip files.
  execFileSync('tar.exe', ['-xf', zipPath, '-C', dir], { windowsHide: true });
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
  return found;
}

const toMs = (value) => {
  if (!value) return Date.now();
  if (typeof value === 'number') return value < 1e12 ? value * 1000 : value;
  const t = Date.parse(value);
  return Number.isNaN(t) ? Date.now() : t;
};

function fromClaude(conv) {
  const messages = (conv.chat_messages || []).map((m) => {
    const text = m.text || (m.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('\n\n');
    return { role: m.sender === 'human' ? 'user' : 'assistant', text: (text || '').trim(), at: toMs(m.created_at) };
  }).filter((m) => m.text);
  return {
    sourceId: conv.uuid,
    title: conv.name || messages[0]?.text.slice(0, 48) || 'Untitled chat',
    createdAt: toMs(conv.created_at),
    updatedAt: toMs(conv.updated_at),
    messages,
  };
}

// ChatGPT stores each conversation as a tree; follow the branch that was last shown.
function fromChatGPT(conv) {
  const nodes = conv.mapping || {};
  const chain = [];
  for (let id = conv.current_node; id && nodes[id]; id = nodes[id].parent) chain.push(nodes[id]);
  const messages = chain.reverse().map(({ message: m }) => {
    if (!m || !['user', 'assistant'].includes(m.author?.role)) return null;
    if (m.metadata?.is_visually_hidden_from_conversation) return null;
    const parts = m.content?.parts || (m.content?.text ? [m.content.text] : []);
    const text = parts.filter((p) => typeof p === 'string').join('\n\n').trim();
    return text ? { role: m.author.role, text, at: toMs(m.create_time) } : null;
  }).filter(Boolean);
  return {
    sourceId: conv.conversation_id || conv.id || crypto.createHash('sha1').update(JSON.stringify(conv.title) + conv.create_time).digest('hex'),
    title: conv.title || 'Untitled chat',
    createdAt: toMs(conv.create_time),
    updatedAt: toMs(conv.update_time),
    messages,
  };
}

function detect(conversations) {
  const sample = conversations.find(Boolean) || {};
  if ('chat_messages' in sample) return 'claude.ai';
  if ('mapping' in sample) return 'chatgpt.com';
  return null;
}

// agentFor(source) picks which agent the imported chats belong to.
function importFile(filePath, agentFor) {
  const tempDir = /\.zip$/i.test(filePath) ? extractZip(filePath) : null;
  try {
    const files = tempDir ? findConversationFiles(tempDir) : [filePath];
    if (!files.length) throw new Error('No conversations.json found in that file.');
    const summary = { imported: 0, skipped: 0, sources: {} };
    let recognized = false;
    for (const file of files) {
      const conversations = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (!Array.isArray(conversations)) continue;
      const source = detect(conversations);
      if (!source) continue;
      recognized = true;
      const agentId = agentFor(source);
      const convert = source === 'claude.ai' ? fromClaude : fromChatGPT;
      for (const conv of conversations) {
        const chat = convert(conv);
        if (!chat.messages.length) { summary.skipped += 1; continue; }
        const id = `imp-${crypto.createHash('sha1').update(`${source}:${chat.sourceId}`).digest('hex').slice(0, 16)}`;
        // Re-importing the same export must not overwrite a chat you've continued since.
        if (store.getChat(id)) { summary.skipped += 1; continue; }
        store.saveChat({
          id, agentId, title: chat.title.slice(0, 80), createdAt: chat.createdAt, updatedAt: chat.updatedAt,
          imported: source, session: {}, messages: chat.messages,
        });
        summary.imported += 1;
        summary.sources[source] = agentId;
      }
    }
    if (!recognized) throw new Error("That file doesn't look like a claude.ai or ChatGPT export.");
    return summary;
  } finally {
    if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

module.exports = { importFile };
