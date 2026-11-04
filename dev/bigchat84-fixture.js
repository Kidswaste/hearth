#!/usr/bin/env node
// (round 84, bigchat84) the app check's data (dev/checks/bigchat84.js): bigchat82's small profile with one GIANT chat
// (dev/bigprofile.js --chats 40 --long 4 --projects 4 --giant 1: 6,000 messages, ≈ 63 MB, made up with a fixed seed;
// never real data), plus what export / restore need:
//   · a rare word in message #30 (a find that lands in a resting block)
//   · (round 114, findaccents114) French with accents in message #40, "L’Église Saint-Zéphyrin84" (Alt+F typed without
//     its accents finds it there); the folder's fixture-114.txt says the fixture has it (dev/run-checks.js makes it again
//     when it's missing)
//   · an earlier version of the giant chat (10 messages fewer), kept as a restore keeps one (data/.versions/chat-…)
//   · a second giant chat in Recently deleted (data/trash/claude-giant1.json)
//   node dev/bigchat84-fixture.js [dir]          (default /tmp/hearth-bigchat84)
'use strict';
const fs = require('fs');
const path = require('path');
const { bigprofile } = require('./bigprofile');
const SS = require('../scenesafe-core');

const RARE = 'zanzibar84quokka';
const ACCENTS = { at: 40, text: 'L’Église Saint-Zéphyrin84', typed: "l'eglise saint-zephyrin84" }; // (round 114)
function make(dir = '/tmp/hearth-bigchat84') {
  fs.rmSync(dir, { recursive: true, force: true });
  const r = bigprofile(dir, { chats: 40, long: 4, projects: 4, giant: 1 });
  const file = path.join(dir, 'chats', 'claude-giant0.json');
  const chat = JSON.parse(fs.readFileSync(file, 'utf8'));
  chat.messages[30].text += ` ${RARE}`;
  chat.messages[ACCENTS.at].text += `\n\nRendez-vous à ${ACCENTS.text}, avec les Söhne et un café crème.`;
  fs.writeFileSync(file, JSON.stringify(chat, null, 2));
  const at = Date.now() - 3600e3;
  const vdir = path.join(dir, '.versions', 'chat-claude-giant0'); fs.mkdirSync(vdir, { recursive: true });
  fs.writeFileSync(path.join(vdir, SS.copyName(at, 0, 'before')), JSON.stringify({ v: 1, kind: 'chat', id: chat.id, at, machine: 'this computer', thing: { ...chat, messages: chat.messages.slice(0, -10), updatedAt: at } }));
  fs.mkdirSync(path.join(dir, 'trash'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'trash', 'claude-giant1.json'), JSON.stringify({ ...chat, id: 'claude-giant1', title: 'A giant chat deleted' }, null, 2));
  fs.writeFileSync(path.join(dir, 'fixture-114.txt'), 'bigchat84 with round 114\'s accents in #40\n');
  return { ...r, rare: RARE, accents: ACCENTS, version: chat.messages.length - 10 };
}
if (require.main === module) { const t0 = Date.now(); console.log(JSON.stringify({ ...make(process.argv[2] || undefined), ms: Date.now() - t0 })); }
module.exports = { make, RARE, ACCENTS };
