const assert = require('node:assert/strict');
const P = require('../tools/quest-proof'), R = require('../tools/quest-review'), C = require('../tools/quest-core');
const q = { id: 'q-proof', projectId: 'project-a', title: 'Clink: polish Folio’s attack', done: 'Improve an attack pose and show the comparison.', projectTask: { target: 'Folio', chatId: 'foreign' } };
const p = { id: 'project-a', name: 'Clink', workspace: { chatId: 'clinky' }, items: [{ type: 'chat', ref: 'notes' }] };
const message = (text, at, more = {}) => ({ text, role: 'assistant', at, ...more });
const chat = { id: 'clinky', title: 'Clinky', agentId: 'astra', messages: [message('Folio became Kiddy. Here is the character redesign and attack comparison.', 100), message('I reworked the attack pose. Here is the comparison; tested with clean recovery.', 300, { opens: [{ path: '/proof/comparison.png' }, { path: '/proof/test.txt' }] })] };
let count = 0; async function test(name, fn) { await fn(); console.log('✓ ' + name); count++; }
const fake = { chatFiles: R.chatFiles, chat: async (chat, i, opts) => ({ type: 'chat', title: chat.title, chatId: chat.id, agentId: chat.agentId, messageId: String(i), excerpt: chat.messages[i].text, analysis: '', coverage: 'Test fixture saved text.', images: opts.maxImages ? R.chatImages(chat.messages[i]) : [], fingerprint: String(i).repeat(64) }), localFile: async path => ({ type: 'file', title: path.split('/').pop(), path, bytes: 100, kind: 'txt', images: [], excerpt: 'Expected windup, actual windup. Pass.', analysis: 'Actual text.', coverage: 'Text file.', fingerprint: 'a'.repeat(64) }) };
(async () => {
  await test('chat scope rejects an unrelated project and foreign source IDs', () => { assert.deepEqual(P.chatIds(q, p), ['clinky', 'notes']); assert.deepEqual(P.chatIds(q, { ...p, id: 'other' }), []); });
  await test('selection retains the current result and marks an older rename as reference', () => {
    const selected = P.select(q, p, [chat, { ...chat, id: 'foreign' }], 200);
    assert.equal(selected.length, 2); assert.equal(selected[0].index, 1); assert.equal(selected[0].older, false); assert.equal(selected[1].older, true);
  });
  await test('stale, unrelated and merely requested work do not trigger automatic review', () => {
    assert.deepEqual(P.select(q, p, [chat], 400), []);
    assert.deepEqual(P.select(q, p, [{ ...chat, messages: [message('A weather forecast and a shopping list for tomorrow.', 300)] }], 200), []);
    assert.deepEqual(P.select(q, p, [{ ...chat, messages: [message('Please polish Folio’s attack and improve the pose.', 300, { role: 'user' })] }], 200), []);
  });
  await test('native uploaded files with a short reply use the immediate quest discussion, not arbitrary paths', () => {
    const upload = { role: 'user', text: 'Here it is', at: 300, attachments: [{ kind: 'file', name: 'bounce.wav' }], sent: 'Here it is\n\n[Attached files, open them with your read-only commands]\nC:/exports/bounce.wav' };
    assert.deepEqual(R.chatFiles(upload), ['C:/exports/bounce.wav']);
    assert.deepEqual(R.chatFiles({ ...upload, attachments: [], sent: upload.sent }), []);
    const selected = P.select(q, p, [{ ...chat, messages: [message('Show Folio’s attack pose comparison in the next reply.', 250), upload] }], 200);
    assert.equal(selected[0].index, 1);
  });
  await test('collection reads only linked chats, bundles exact sources and linked exports, hashes repeatably', async () => {
    const reads = [], options = { since: 200, getChat: async id => { reads.push(id); return id === chat.id ? chat : null; }, review: fake };
    const a = await P.collect(q, p, options), b = await P.collect(q, p, options);
    assert.ok(reads.every(id => ['clinky', 'notes'].includes(id))); assert.equal(a.proof.fingerprint, b.proof.fingerprint);
    assert.equal(a.proof.images.length, 1); assert.equal(a.proof.attachments[0].title, 'test.txt'); assert.equal(a.sources[0].messageId, '1'); assert.ok(a.proof.excerpt.includes('Earlier reference'));
    C.checkProof(a.proof); assert.throws(() => C.checkProof({ ...a.proof, sources: [{ ...a.sources[0], at: NaN }] }));
  });
  await test('busy chat and cancellation prevent collection, with no saved submission', async () => {
    let reads = 0; await assert.rejects(P.collect(q, p, { busy: () => true, getChat: async () => { reads++; } }), /still working/); assert.equal(reads, 0);
    let cancelled = false;
    await assert.rejects(P.collect(q, p, { getChat: async () => { cancelled = true; return chat; }, cancelled: () => cancelled, review: fake }), /cancelled/);
  });
  await test('a missing linked chat/export leaves an honest usable partial bundle or manual fallback', async () => {
    const empty = await P.collect(q, p, { getChat: async () => { throw Error('not here'); } }); assert.equal(empty.proof, null);
    const partial = await P.collect(q, p, { since: 200, getChat: async () => chat, review: { ...fake, localFile: async () => { throw Error('not on this computer'); } } });
    assert.equal(partial.proof.attachments.length, 0); assert.ok(partial.proof.analysis.includes('not on this computer')); C.checkProof(partial.proof);
  });
  console.log(`${count} automatic proof checks passed`);
})().catch(err => { console.error(err); process.exitCode = 1; });
