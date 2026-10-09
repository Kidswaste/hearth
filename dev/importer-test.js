// Unit test for importer.js on synthetic export variants (no data folder touched): node dev/importer-test.js importer.js
// Tests importer.js on synthetic export variants without touching any data folder.
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');
const src = fs.readFileSync(process.argv[2] || path.join(__dirname, '..', 'importer.js'), 'utf8').replace("require('./store')", 'globalThis.__fakeStore');
const saved = new Map();
globalThis.__fakeStore = { getChat: (id) => saved.get(id) || null, saveChat: (c) => saved.set(c.id, c) };
const m = new Module('importer-test');
m.paths = module.paths;
m._compile(src, 'importer-test.js');
const { importFile, _test } = m.exports;
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'imp-test-'));
const write = (name, data) => { const p = path.join(dir, name); fs.writeFileSync(p, JSON.stringify(data)); return p; };

const claude = [
  { uuid: 'c1', name: 'Shaders', created_at: '2026-01-01T10:00:00Z', updated_at: '2026-01-02T10:00:00Z', chat_messages: [
    { sender: 'human', text: '', content: [{ type: 'text', text: 'Make a shader' }], attachments: [{ file_name: 'notes.txt', extracted_content: 'x'.repeat(5000) }], created_at: '2026-01-01T10:00:00Z' },
    { sender: 'assistant', content: [{ type: 'thinking', thinking: 'hmm' }, { type: 'text', text: 'Here it is' }, { type: 'tool_use', name: 'artifacts' }], created_at: '2026-01-01T10:01:00Z' },
  ] },
  { uuid: 'c2', name: 'Empty', chat_messages: [] },
  { uuid: 'c1', name: 'Shaders dup', chat_messages: [{ sender: 'human', text: 'dup' }] },
];
const gpt = { conversations: [
  { id: 'g1', title: 'No current node', create_time: 1700000000, mapping: {
    root: { id: 'root', children: ['a'] },
    a: { id: 'a', parent: 'root', children: ['b'], message: { author: { role: 'system' }, content: { content_type: 'text', parts: ['sys'] }, metadata: { is_visually_hidden_from_conversation: true } } },
    b: { id: 'b', parent: 'a', children: ['c', 'c2'], message: { author: { role: 'user' }, create_time: 1700000001, content: { content_type: 'multimodal_text', parts: [{ content_type: 'image_asset_pointer' }, 'What is this?'] } } },
    c: { id: 'c', parent: 'b', children: [], message: { author: { role: 'assistant' }, create_time: 1700000002, content: { content_type: 'text', parts: ['old branch'] } } },
    c2: { id: 'c2', parent: 'b', children: ['d'], message: { author: { role: 'assistant' }, recipient: 'python', create_time: 1700000003, content: { content_type: 'code', language: 'python', text: 'print(1)' } } },
    d: { id: 'd', parent: 'c2', children: ['e'], message: { author: { role: 'tool' }, create_time: 1700000004, content: { content_type: 'execution_output', text: '1' } } },
    e: { id: 'e', parent: 'd', children: [], message: { author: { role: 'assistant' }, create_time: 1700000005, content: { content_type: 'text', parts: ['It prints 1'] } } },
  } },
] };
const generic = [{ title: 'Hearth chat', id: 'h1', messages: [{ role: 'user', text: 'hi', at: 1 }, { role: 'assistant', content: 'hello', at: 2 }] }];

const agentFor = (s) => (s === 'claude.ai' ? 'claude' : 'astra');
const check = (label, ok) => { console.log(`${ok ? 'ok ' : 'FAIL'} ${label}`); if (!ok) process.exitCode = 1; };

(async () => {
const p1 = write('conversations.json', claude);
const dry = await importFile(p1, agentFor, { dryRun: true });
check('dry run saves nothing', saved.size === 0 && dry.imported === 1 && dry.empty === 1 && dry.duplicates === 1);
const r1 = await importFile(p1, agentFor);
const chat = [...saved.values()][0];
check('claude imported 1', r1.imported === 1 && saved.size === 1);
check('claude content blocks', chat.messages[0].text.startsWith('Make a shader') && chat.messages[0].text.includes('📎 notes.txt') && chat.messages[0].text.includes('more characters not imported'));
check('claude thinking skipped, tool noted', chat.messages[1].text === 'Here it is\n\n*[used artifacts]*');
const r1b = await importFile(p1, agentFor);
check('re-import skipped as already there', r1b.imported === 0 && r1b.alreadyThere === 1);

const p2 = write('conversations-000.json', gpt);
const progress = [];
const r2 = await importFile(p2, agentFor, { onProgress: (p) => progress.push(p) });
const g = [...saved.values()].find((c) => c.imported === 'chatgpt.com');
check('chatgpt wrapped object + newest leaf', r2.imported === 1 && g.messages.length === 2);
check('chatgpt multimodal + hidden + tool calls', g.messages[0].text === '*[image]*\n\nWhat is this?' && g.messages[1].text === 'It prints 1');
check('progress reported', progress.length === 1 && progress[0].done === 1);

const p3 = write('chat.json', generic);
const r3 = await importFile(p3, agentFor);
check('generic chat file', r3.imported === 1 && r3.counts['chat file'] === 1);
let threw = false;
try { await importFile(write('nope.json', { foo: 1 }), agentFor); } catch { threw = true; }
check('unknown file rejected', threw);
fs.rmSync(dir, { recursive: true, force: true });
})();
