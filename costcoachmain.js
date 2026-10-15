// 🧭 Cost coach (round 43, costcoach), main side: reads the chats changed in the last days, one at a time, and hands the
// window compact per-reply records (costcoach-core.js recordsOf: usage, thinking, what came with the message, missions,
// routines, handoffs). Reads only; nothing is written, nothing leaves the computer. Loaded on first use (main.js lazyIpc).
const fs = require('fs');
const path = require('path');
const Core = require('./costcoach-core');

const MAX_RECORDS = 20000;
async function scan(chatsDir, { days = Core.WINDOW_DAYS, now = Date.now() } = {}) {
  const from = now - days * 864e5;
  const out = { records: [], chats: {}, from, now };
  let names = [];
  try { names = (await fs.promises.readdir(chatsDir)).filter((f) => f.endsWith('.json')); } catch { return out; }
  for (const f of names) {
    const file = path.join(chatsDir, f);
    let st;
    try { st = await fs.promises.stat(file); } catch { continue; }
    if (st.mtimeMs < from || st.size > 60e6) continue; // not touched in the window: no reply in it
    let chat;
    try { chat = JSON.parse(await fs.promises.readFile(file, 'utf8')); } catch { continue; } // held / half-written: skipped, never "empty"
    const recs = Core.recordsOf(chat, { from, to: now });
    if (recs.length) {
      out.chats[chat.id] = { agent: chat.agentId, title: String(chat.title || '').slice(0, 80) };
      for (const r of recs) { if (out.records.length >= MAX_RECORDS) break; out.records.push(r); }
    }
    await new Promise((r) => setImmediate(r)); // one chat at a time: the window stays smooth
  }
  return out;
}

// (main.js lazyIpc finds the channels by how they are spelled below: keep the parameter named ipcMain)
function register(ipcMain, opts = {}) {
  ipcMain.handle('costcoach:scan', async (_e, o) => {
    try { return await scan(path.join(opts.dataDir || require('./store').DATA_DIR, 'chats'), { days: Math.max(1, Math.min(35, Number(o?.days) || Core.WINDOW_DAYS)) }); } catch (err) { return { error: err.message, records: [], chats: {} }; }
  });
}

module.exports = { register, scan };
