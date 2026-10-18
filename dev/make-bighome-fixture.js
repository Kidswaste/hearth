#!/usr/bin/env node
// (round 65, mainhang65) A BIG data folder like the owner's after months of use, for dev/checks/mainhang65.js: thousands
// of chats (dev/make-chatlist-fixture.js), their .prev copies, attachments, the trash, a long feature-usage log, a big
// chat-meta, a Sound bank index with thousands of presets, the work journal. Never real data: all made up here.
//   node dev/make-bighome-fixture.js [dir] [chats]      (default /tmp/hearth-bighome 3000)
const fs = require('fs');
const path = require('path');
const { make } = require('./make-chatlist-fixture');

function bighome(dir = '/tmp/hearth-bighome', count = 3000) {
  const r = make(dir, count, 65);
  const chats = path.join(dir, 'chats');
  // .prev copies of a third of the chats (every save keeps one)
  const names = fs.readdirSync(chats);
  names.forEach((n, i) => { if (i % 3 === 0) fs.copyFileSync(path.join(chats, n), path.join(chats, n.replace(/\.json$/, '.prev.json'))); });
  // attachments (pictures pasted into chats, frame grabs)
  const att = path.join(dir, 'attachments'); fs.mkdirSync(att, { recursive: true });
  const blob = Buffer.alloc(48 * 1024, 7);
  for (let i = 0; i < 600; i++) fs.writeFileSync(path.join(att, `img-${i}.png`), blob);
  // trash (deleted chats, kept 30 days)
  const trash = path.join(dir, 'trash'); fs.mkdirSync(trash, { recursive: true });
  names.slice(0, 200).forEach((n) => fs.copyFileSync(path.join(chats, n), path.join(trash, n.replace(/^/, 'x'))));
  // a long feature-usage log
  const items = {}; for (let i = 0; i < 2500; i++) items[`Area ${i % 40} › Button ${i}`] = { n: 1 + (i % 50), first: Date.now() - 9e9, last: Date.now() - i * 1e5 };
  fs.writeFileSync(path.join(dir, 'kv', 'ui-usage.json'), JSON.stringify({ since: Date.now() - 9e9, items, days: {}, hidden: [] }));
  // the Sound bank's index: thousands of presets (Serum 2 / Vital factory banks)
  const sb = path.join(dir, 'creative-vst', 'soundbank'); fs.mkdirSync(sb, { recursive: true });
  const presets = {}; for (let i = 0; i < 6000; i++) presets[`p${i}`] = { id: `p${i}`, name: `Preset ${i}`, plugin: i % 2 ? 'Vital' : 'Serum 2', path: `C:/Users/you/Documents/Vital/Factory/Preset ${i}.vital`, tags: ['bass', 'pad'], features: Array.from({ length: 16 }, (_, k) => (i * k) % 97 / 97) };
  fs.writeFileSync(path.join(sb, 'index.json'), JSON.stringify({ v: 1, presets, banks: {}, settings: {} }));
  // the token stats, built long ago (every reply adds to them)
  const days = {}; for (let d = 0; d < 400; d++) days[new Date(Date.now() - d * 864e5).toISOString().slice(0, 10)] = { a: { claude: { i: 9000, o: 2000, r: 12 } }, m: {}, t: {}, h: {} };
  fs.writeFileSync(path.join(dir, 'kv', 'token-stats.json'), JSON.stringify({ v: 1, since: Date.now() - 400 * 864e5, backfilledAt: Date.now() - 300 * 864e5, days, chats: {} }));
  // a big work journal
  const sn = path.join(dir, 'safetynet'); fs.mkdirSync(sn, { recursive: true });
  fs.writeFileSync(path.join(sn, 'journal.json'), JSON.stringify(Array.from({ length: 4000 }, (_, i) => ({ at: Date.now() - i * 6e4, what: `edit ${i}`, file: `notes/${i}.md` }))));
  return { ...r, prev: Math.ceil(names.length / 3), attachments: 600, trash: 200 };
}

if (require.main === module) {
  const [dir, count] = process.argv.slice(2);
  console.log(JSON.stringify(bighome(dir || undefined, Number(count) || 3000)));
}
module.exports = { bighome };
