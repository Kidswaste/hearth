// Local storage for hub-owned data: native chats, website conversations you've opened, memory,
// attachments, token usage and small named stores used by the tools (tasks, notes, prompts…).
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const CHATS_DIR = path.join(DATA_DIR, 'chats');
const KV_DIR = path.join(DATA_DIR, 'kv');
const TRASH_DIR = path.join(DATA_DIR, 'trash');
const TRASH_DAYS = 30;
const ATTACH_DIR = path.join(DATA_DIR, 'attachments');
const HISTORY_PATH = path.join(DATA_DIR, 'web-history.json');
const MEMORY_PATH = path.join(DATA_DIR, 'memory.json');
const USAGE_PATH = path.join(DATA_DIR, 'usage.json');
const SAFE_ID = /^[\w-]{1,80}$/;

for (const dir of [CHATS_DIR, KV_DIR, ATTACH_DIR, TRASH_DIR]) fs.mkdirSync(dir, { recursive: true });

// Deleted chats wait in data/trash for 30 days so a mistaken delete can be undone.
function trashChat(id) {
  const src = chatPath(id);
  if (!fs.existsSync(src)) return;
  fs.renameSync(src, path.join(TRASH_DIR, `${id}.json`));
}
function listTrash() {
  const cutoff = Date.now() - TRASH_DAYS * 864e5;
  const out = [];
  for (const f of fs.readdirSync(TRASH_DIR).filter((x) => x.endsWith('.json'))) {
    const file = path.join(TRASH_DIR, f);
    const deletedAt = fs.statSync(file).mtimeMs;
    if (deletedAt < cutoff) { fs.rmSync(file, { force: true }); continue; }
    const chat = readJson(file, null);
    if (chat) out.push({ id: chat.id, agentId: chat.agentId, title: chat.title, messages: chat.messages?.length || 0, deletedAt });
  }
  return out.sort((a, b) => b.deletedAt - a.deletedAt);
}
function restoreChat(id) {
  if (!SAFE_ID.test(id)) throw new Error(`bad chat id: ${id}`);
  const file = path.join(TRASH_DIR, `${id}.json`);
  if (!fs.existsSync(file)) return false;
  fs.renameSync(file, chatPath(id));
  return true;
}

function chatPath(id) {
  if (!SAFE_ID.test(id)) throw new Error(`bad chat id: ${id}`);
  return path.join(CHATS_DIR, `${id}.json`);
}

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

// Write to a temp file first so a crash mid-write can't corrupt a chat.
function writeJson(file, value) {
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2));
  fs.renameSync(tmp, file);
}

function allChats() {
  return fs.readdirSync(CHATS_DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => readJson(path.join(CHATS_DIR, f), null))
    .filter(Boolean);
}

function listChats() {
  return allChats()
    .map(({ id, agentId, title, updatedAt, pinned, model }) => ({ id, agentId, title, updatedAt, pinned: Boolean(pinned), model }))
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

// Full-text search through every native chat's messages.
function searchChats(query) {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  const hits = [];
  for (const chat of allChats()) {
    let count = 0;
    let snippet = null;
    for (const m of chat.messages || []) {
      const t = m.text || '';
      const i = t.toLowerCase().indexOf(q);
      if (i < 0) continue;
      count += 1;
      snippet ||= `${i > 50 ? '…' : ''}${t.slice(Math.max(0, i - 50), i + q.length + 70).replace(/\s+/g, ' ')}`;
    }
    if (count || chat.title?.toLowerCase().includes(q)) {
      hits.push({ id: chat.id, agentId: chat.agentId, title: chat.title, updatedAt: chat.updatedAt, count, snippet });
    }
  }
  return hits.sort((a, b) => b.count - a.count || b.updatedAt - a.updatedAt).slice(0, 100);
}

const kvPath = (name) => {
  if (!SAFE_ID.test(name)) throw new Error(`bad store name: ${name}`);
  return path.join(KV_DIR, `${name}.json`);
};

function saveAttachment(name, base64) {
  const safe = name.replace(/[^\w.\- ]+/g, '_').slice(-80) || 'file';
  const file = path.join(ATTACH_DIR, `${Date.now()}-${safe}`);
  fs.writeFileSync(file, Buffer.from(base64, 'base64'));
  return file;
}

// usage.json: { "2026-10-04": { claude: { input, output, replies } } }
function addUsage(agentId, usage) {
  if (!usage) return;
  const all = readJson(USAGE_PATH, {});
  const day = new Date().toLocaleDateString('en-CA');
  const entry = ((all[day] ||= {})[agentId] ||= { input: 0, output: 0, replies: 0 });
  entry.input += usage.input || 0;
  entry.output += usage.output || 0;
  entry.replies += 1;
  writeJson(USAGE_PATH, all);
}

module.exports = {
  DATA_DIR,
  ATTACH_DIR,
  listChats,
  searchChats,
  getChat: (id) => readJson(chatPath(id), null),
  saveChat: (chat) => writeJson(chatPath(chat.id), chat),
  deleteChat: (id) => trashChat(id),
  listTrash,
  restoreChat,
  getHistory: () => readJson(HISTORY_PATH, {}),
  saveHistory: (history) => writeJson(HISTORY_PATH, history),
  // { shared: "notes for every agent", agents: { [agentId]: "notes for one agent" } }
  getMemory: () => ({ shared: '', agents: {}, ...readJson(MEMORY_PATH, {}) }),
  saveMemory: (memory) => writeJson(MEMORY_PATH, memory),
  getKV: (name, fallback = null) => readJson(kvPath(name), fallback),
  setKV: (name, value) => {
    // Keep the previous version of every store as <name>.prev.json (one step of undo for tools).
    const file = kvPath(name);
    if (fs.existsSync(file)) fs.copyFileSync(file, file.replace(/\.json$/, '.prev.json'));
    writeJson(file, value);
  },
  saveAttachment,
  addUsage,
  getUsage: () => readJson(USAGE_PATH, {}),
};
