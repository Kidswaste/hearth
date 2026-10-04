// Local storage for hub-owned data: native chats and the list of website conversations you've opened.
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const CHATS_DIR = path.join(DATA_DIR, 'chats');
const HISTORY_PATH = path.join(DATA_DIR, 'web-history.json');
const SAFE_ID = /^[\w-]{1,80}$/;

fs.mkdirSync(CHATS_DIR, { recursive: true });

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

function listChats() {
  return fs.readdirSync(CHATS_DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => readJson(path.join(CHATS_DIR, f), null))
    .filter(Boolean)
    .map(({ id, agentId, title, updatedAt }) => ({ id, agentId, title, updatedAt }))
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

module.exports = {
  DATA_DIR,
  listChats,
  getChat: (id) => readJson(chatPath(id), null),
  saveChat: (chat) => writeJson(chatPath(chat.id), chat),
  deleteChat: (id) => fs.rmSync(chatPath(id), { force: true }),
  getHistory: () => readJson(HISTORY_PATH, {}),
  saveHistory: (history) => writeJson(HISTORY_PATH, history),
};
