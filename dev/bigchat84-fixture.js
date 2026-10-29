#!/usr/bin/env node
// (round 84, bigchat84) the app check's data (dev/checks/bigchat84.js): bigchat82's small profile with one GIANT chat
// (dev/bigprofile.js --chats 40 --long 4 --projects 4 --giant 1: 6,000 messages, ≈ 63 MB, made up with a fixed seed;
// never real data), plus what export / restore need:
//   · a rare word in message #30 (a find that lands in a resting block)
//   · an earlier version of the giant chat (10 messages fewer), kept as a restore keeps one (data/.versions/chat-…)
//   · a second giant chat in Recently deleted (data/trash/claude-giant1.json)
//   node dev/bigchat84-fixture.js [dir]          (default /tmp/hearth-bigchat84)
'use strict';
const fs = require('fs');
const path = require('path');
const { bigprofile } = require('./bigprofile');
const SS = require('../scenesafe-core');

const RARE = 'zanzibar84quokka';
function make(dir = '/tmp/hearth-bigchat84') {
  fs.rmSync(dir, { recursive: true, force: true });
  const r = bigprofile(dir, { chats: 40, long: 4, projects: 4, giant: 1 });
  const file = path.join(dir, 'chats', 'claude-giant0.json');
  const chat = JSON.parse(fs.readFileSync(file, 'utf8'));
  chat.messages[30].text += ` ${RARE}`;
  fs.writeFileSync(file, JSON.stringify(chat, null, 2));
  const at = Date.now() - 3600e3;
  const vdir = path.join(dir, '.versions', 'chat-claude-giant0'); fs.mkdirSync(vdir, { recursive: true });
  fs.writeFileSync(path.join(vdir, SS.copyName(at, 0, 'before')), JSON.stringify({ v: 1, kind: 'chat', id: chat.id, at, machine: 'this computer', thing: { ...chat, messages: chat.messages.slice(0, -10), updatedAt: at } }));
  fs.mkdirSync(path.join(dir, 'trash'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'trash', 'claude-giant1.json'), JSON.stringify({ ...chat, id: 'claude-giant1', title: 'A giant chat deleted' }, null, 2));
  return { ...r, rare: RARE, version: chat.messages.length - 10 };
}
if (require.main === module) { const t0 = Date.now(); console.log(JSON.stringify({ ...make(process.argv[2] || undefined), ms: Date.now() - t0 })); }
module.exports = { make, RARE };
