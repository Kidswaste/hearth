#!/usr/bin/env node
// (round 42, chatlistfast) A big, fake chat history for the chats-list checks: N chats (default 3,000) spread over
// Claude and Astra and two years, with folders, tags, pins, archived chats and a few unread-looking recent ones, like
// an owner who starts several chats every day. Never real data: everything is made up here, written into a throwaway
// data folder that `node dev/smoke.js --data <dir>` copies into its own app copy.
//   node dev/make-chatlist-fixture.js [dir] [count] [seed]     (default /tmp/hearth-chatlist-fixture 3000 42)
// Writes <dir>/chats/<id>.json (2–8 short messages each) and <dir>/kv/chat-meta.json (folders, tags, archived).
const fs = require('fs');
const path = require('path');

function make(dir = '/tmp/hearth-chatlist-fixture', count = 3000, seed = 42) {
  let s = seed >>> 0;
  const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  const WORDS = 'orb particles bloom kick snare hats intro logo teaser reel shader noise flow field glitch neon chrome glass ember forge spark title card lyric beat drop bass synth camera orbit dolly push loop palette cover vinyl poster grain film lut grade fog rain city night sunrise ocean wave tunnel portal crystal metal liquid smoke fire ice storm galaxy star nebula ribbon trail mesh terrain voxel pixel ascii type kinetic mask matte stencil sequence edit cut render export instagram tiktok reels story square vertical wide'.split(' ');
  const VERBS = ['Make', 'Fix', 'Tweak', 'Try', 'Build', 'Polish', 'Ideas for', 'Why does', 'Speed up', 'Animate', 'Sync', 'Render', 'Plan', 'Review'];
  const FOLDERS = ['Work', 'Intro video', 'Client — Nova', 'Shaders', 'Music visuals', 'Experiments', 'Hearth dev', 'Posters', 'Reels', 'Personal', 'Lyric videos', 'VJ set', 'Archive 2025', 'Research', 'Logos', 'Stage', 'Templates', 'Tutorials', 'Bugs', 'Later'];
  const TAGS = ['wip', 'done', 'idea', 'client', 'music', 'three', 'shader', 'urgent', 'ref', 'loop', 'type', 'cam', 'bug', 'perf', 'v2'];
  const now = Date.now();
  const chatsDir = path.join(dir, 'chats');
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(chatsDir, { recursive: true });
  fs.mkdirSync(path.join(dir, 'kv'), { recursive: true });
  const meta = {};
  for (let i = 0; i < count; i++) {
    const agentId = rnd() < 0.8 ? 'claude' : 'astra';
    const id = `${agentId}-fx${i.toString(36).padStart(4, '0')}`;
    // newer chats are denser (a few a day lately, fewer two years back)
    const age = Math.pow(rnd(), 2.2) * 730 * 864e5;
    const updatedAt = Math.round(now - age);
    const title = `${pick(VERBS)} ${pick(WORDS)} ${pick(WORDS)}${rnd() < 0.3 ? ` ${pick(WORDS)}` : ''}${rnd() < 0.15 ? ` #${1 + Math.floor(rnd() * 40)}` : ''}`;
    const n = 2 + Math.floor(rnd() * 7);
    const messages = [];
    for (let k = 0; k < n; k++) {
      const role = k % 2 ? 'assistant' : 'user';
      const words = Array.from({ length: role === 'user' ? 6 + Math.floor(rnd() * 14) : 20 + Math.floor(rnd() * 60) }, () => pick(WORDS)).join(' ');
      messages.push({ role, text: k === 0 ? `${title}: ${words}` : words, at: updatedAt - (n - k) * 60e3 });
    }
    const chat = { id, agentId, title, createdAt: updatedAt - n * 60e3, updatedAt, messages };
    if (rnd() < 0.012) chat.pinned = true;
    fs.writeFileSync(path.join(chatsDir, `${id}.json`), JSON.stringify(chat));
    const m = {};
    if (rnd() < 0.35) m.folder = pick(FOLDERS);
    if (rnd() < 0.25) m.tags = [...new Set([pick(TAGS), ...(rnd() < 0.3 ? [pick(TAGS)] : [])])];
    if (rnd() < 0.12) m.archived = true;
    if (Object.keys(m).length) meta[id] = m;
  }
  fs.writeFileSync(path.join(dir, 'kv', 'chat-meta.json'), JSON.stringify(meta));
  return { dir, count, folders: FOLDERS.length, meta: Object.keys(meta).length };
}

if (require.main === module) {
  const [dir, count, seed] = process.argv.slice(2);
  console.log(JSON.stringify(make(dir || undefined, Number(count) || 3000, Number(seed) || 42)));
}
module.exports = { make };
