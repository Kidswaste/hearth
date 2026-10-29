// 🧭 Cost coach (round 43, costcoach), main side: reads the chats changed in the last days, one at a time, and hands the
// window compact per-reply records (costcoach-core.js recordsOf: usage, thinking, what came with the message, missions,
// routines, handoffs). Reads only; nothing is written, nothing leaves the computer. Loaded on first use (main.js lazyIpc).
const fs = require('fs');
const path = require('path');
const Core = require('./costcoach-core');

const MAX_RECORDS = 20000;
// (round 83) the store's files thread, when there is one (Electron); tests / no thread: parsed here as before
const offThread = () => { try { const s = require('./store'); return process.versions.electron && s.runOff ? s.runOff : null; } catch { return null; } };
async function scan(chatsDir, { days = Core.WINDOW_DAYS, now = Date.now(), runOff = offThread() } = {}) {
  const from = now - days * 864e5;
  const out = { records: [], chats: {}, from, now };
  let names = [];
  try { names = (await fs.promises.readdir(chatsDir)).filter((f) => f.endsWith('.json')); } catch { return out; }
  for (const f of names) {
    const file = path.join(chatsDir, f);
    let st;
    try { st = await fs.promises.stat(file); } catch { continue; }
    if (st.mtimeMs < from || st.size > 60e6) continue; // not touched in the window: no reply in it
    // (round 83, idleburst83) read and parsed on the store's files thread (storework.js costRecords): a long chat's
    // JSON.parse held the main process 70–140 ms at a time, 2 minutes after every start; here when there's no thread
    let got = null;
    if (runOff) { try { got = await runOff('costRecords', { file, from, to: now }); } catch { got = undefined; } }
    if (got === undefined || !runOff) {
      let chat;
      try { chat = JSON.parse(await fs.promises.readFile(file, 'utf8')); } catch { continue; } // held / half-written: skipped, never "empty"
      got = { id: chat.id, agent: chat.agentId, title: String(chat.title || '').slice(0, 80), recs: Core.recordsOf(chat, { from, to: now }) };
    }
    if (got?.recs?.length) {
      out.chats[got.id] = { agent: got.agent, title: got.title };
      for (const r of got.recs) { if (out.records.length >= MAX_RECORDS) break; out.records.push(r); }
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
