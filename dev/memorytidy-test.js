#!/usr/bin/env node
// (round 38, memorytidy) Tidy memory, the pure part (memorytidy-core.js) and what it does to the prompts:
//   · the same fact twice, near-duplicates, contradictions (newest wins), stale, wordy, place moves;
//   · apply / undo (facts saved since the tidy are kept);
//   · prevention: a <remember> that repeats or contradicts a fact replaces it (saveFacts / unsave);
//   · scopes: a Lab fact reaches only the Three Directors' prompts, every other prompt is byte for byte as before;
//   · cachewise: a fact the AI updated mid-chat keeps this chat's frozen prompt (engines.js onlyGrew + memory.replaced),
//     an owner's tidy applies at once; tokenaudit's memory part is the prompt's;
//   · smarter tidy: its prompt, the cost shown before, the reply parsed (bad lines skipped);
//   · measured: two months of saved facts (a scripted stream like the owner's), before → after.
// Engines + store + mcp/ are copied to a temp folder (a sample memory there, no real data).
//   node dev/memorytidy-test.js
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const M = require(path.join(ROOT, 'memorytidy-core.js'));
const CC = require(path.join(ROOT, 'context-core.js'));
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'memtidy-test-'));
for (const f of ['engines.js', 'store.js', 'scenesafe-core.js', 'datasafe-core.js', 'installs.js', 'access-rules.js', 'connectionsmain.js', 'recall-core.js', 'context-core.js', 'memorytidy-core.js']) { try { fs.copyFileSync(path.join(ROOT, f), path.join(dir, f)); } catch { /* optional */ } }
fs.cpSync(path.join(ROOT, 'mcp'), path.join(dir, 'mcp'), { recursive: true });
fs.mkdirSync(path.join(dir, 'data'), { recursive: true });
const writeMemory = (m) => fs.writeFileSync(path.join(dir, 'data', 'memory.json'), JSON.stringify(m));
writeMemory({ shared: '', agents: {} });
const engines = require(path.join(dir, 'engines.js'));
const Conn = require(path.join(dir, 'connectionsmain.js'));
Conn.setReader(() => ({ connections: [] }));
const T = engines._test;

const fails = [];
const check = (ok, what, info) => { console.log(`${ok ? '✓' : '✖'} ${what}`); if (!ok) { fails.push(what); if (info !== undefined) console.log('   ', typeof info === 'string' ? info : JSON.stringify(info).slice(0, 700)); } };
const DAY = 864e5;
const NOW = new Date(2026, 9, 14, 12).getTime();
const CLAUDE = { id: 'claude', name: 'Claude', engine: 'claude', mode: 'native' };
const ASTRA = { id: 'astra', name: 'Astra', engine: 'codex', mode: 'native' };
const DIRECTOR = { id: 'threedirector', name: 'Three Director', engine: 'claude', mode: 'native', dock: 'three', threeTools: true };
const AGENTS = [CLAUDE, ASTRA, DIRECTOR];

// ---------- 1. relations ----------
const R = (a, b) => M.relate(a, b) || { kind: null };
check(R('Prefers short answers', 'prefers short answers.').kind === 'same', 'the same fact, other case / full stop: same');
check(R('Prefers short answers', 'The user prefers short answers').kind === 'same', '“The user prefers…” = “Prefers…”: same');
check(R('Prefers short answers', 'Prefers short answers in French').kind === 'covered', 'one fact says all the other does: covered');
check(R('Uses a Mac', 'Now uses Windows').kind === 'conflict' && R('Uses a Mac', 'Now uses Windows').sure, 'Mac → Windows: a sure contradiction');
check(R('Prefers short answers', 'Wants detailed answers').kind === 'conflict', 'short → detailed answers: a contradiction');
check(R('Hates camera shake', 'Loves camera shake').kind === 'conflict', 'hates → loves the same thing: a contradiction');
check(R('Name is Sam', 'Name is Quentin').sure && R('Call me Sam', 'Call me Q').kind === 'conflict', 'a new name: a sure contradiction');
check(!R('The Lab is the main tool', 'The Lab is used for music videos').sure, '“X is …” about anything else: not sure (left unticked)');
check(R('Uses Blender for modeling', 'Uses Blender for rendering').kind === null, 'two different facts about one tool: no relation');
check(!R('Posts 9:16 visuals on Shorts', 'Posts 16:9 visuals on YouTube').sure, 'two platforms, two formats: not a sure contradiction');
check(R('Keep bloom subtle', 'Likes neon colors').kind === null, 'unrelated facts: no relation');

// ---------- 2. wording, staleness ----------
check(M.shorten('The user really prefers it when the responses are short.') === 'Prefers it when answers are short', `wordy → shorter (“${M.shorten('The user really prefers it when the responses are short.')}”)`);
check(M.shorten('The owner makes a lot of music visuals in order to post them') === 'Makes many music visuals to post them', 'filler phrases shortened');
check(M.shorten('Keep bloom subtle') === 'Keep bloom subtle', 'a short fact stays as it is');
check(M.stale({ text: 'Working on the Ember Tide video this week', added: NOW - 30 * DAY }, NOW)?.sure === true, '“this week”, saved a month ago: stale (sure)');
check(M.stale({ text: 'Working on the Ember Tide video this week', added: NOW - 3 * DAY }, NOW) === null, '“this week”, saved 3 days ago: kept');
check(M.stale({ text: 'Working on it this week' }, NOW)?.sure === false, '“this week” without a date: proposed, unticked');
check(M.stale({ text: 'Deadline for the intro is Oct 3' }, NOW)?.sure === true && M.stale({ text: 'Away until 2026-12-01' }, NOW) === null, 'a passed deadline is stale, a future one is not');
check(M.stale({ text: 'Born on May 3' }, NOW) === null && M.stale({ text: 'Posts every Friday by 6pm' }, NOW) === null, 'birthdays and routines are never stale');

// ---------- 3. the proposal ----------
const MEM = {
  shared: ['- Prefers short answers', '- I post 9:16 visuals on Shorts', '- Keep bloom subtle in Lab scenes', '- Uses a Mac', '- The user really prefers it when the responses are short.', '- Hates camera shake'].join('\n'),
  agents: {
    claude: ['- Call me Sam', '- Prefers short answers', '- Now uses Windows', '- Working on the Ember Tide video this week'].join('\n'),
    threedirector: ['- Likes neon palettes', '- Likes neon palettes'].join('\n'),
    astra: '',
  },
};
const META = { 'claude|Working on the Ember Tide video this week': { added: NOW - 30 * DAY }, 'claude|Now uses Windows': { added: NOW - 2 * DAY }, 'shared|Uses a Mac': { added: NOW - 60 * DAY } };
const p = M.propose(MEM, { meta: META, agents: AGENTS, now: NOW });
const kinds = p.changes.map((c) => `${c.kind}${c.sure ? '' : '?'}`).sort();
console.log('   proposal:', p.changes.map((c) => `${c.kind}${c.sure ? '' : '?'}: ${c.facts.map((f) => `[${f.scope}] ${f.text}`).join(' + ')} → ${c.after ? `[${c.scope}] ${c.after}` : '×'}`).join('\n             '));
const find = (kind, text) => p.changes.find((c) => c.kind === kind && c.facts.some((f) => f.text.includes(text)));
check(find('merge', 'Likes neon') && find('merge', 'Likes neon').after === 'Likes neon palettes', 'the same fact twice in one scope: merged into one');
check(find('merge', 'Prefers short answers')?.facts.some((f) => f.scope === 'claude') && find('merge', 'Prefers short answers').scope === 'shared', 'a fact in “All agents” and again for one AI: kept once, for everyone');
const upd = find('update', 'Uses a Mac');
check(upd && upd.after === 'Now uses Windows' && upd.sure && upd.scope === 'shared', `Mac (60 days ago) → Windows (2 days ago): the newest wins, for everyone (${upd?.after} · ${upd?.scope})`);
check(find('drop', 'Ember Tide')?.sure, 'a month-old “this week” fact: dropped (ticked)');
const mv = find('move', 'bloom');
check(mv && mv.scope === 'place:lab' && mv.sure, 'a Lab-only fact in “All agents”: moved to the Lab scope');
check(!find('move', '9:16') && !p.changes.some((c) => c.facts.some((f) => f.text === 'Call me Sam')), 'a general fact stays where it is');
check(find('merge', 'responses are short') || find('shorter', 'responses are short'), 'the wordy repeat of “short answers” is merged or shortened');
check(p.after < p.before, `the proposal shrinks memory (≈ ${p.before} → ${p.after} tokens)`);
check(!M.propose(MEM, { meta: META, agents: [CLAUDE], now: NOW }).changes.some((c) => c.kind === 'move'), 'no Three Director: nothing moves to the Lab (nobody would read it)');
const pinned = M.propose({ shared: '- Uses a Mac', agents: { claude: '- Now uses Windows' } }, { meta: { 'shared|Uses a Mac': { pinned: true } }, agents: AGENTS, now: NOW });
check(!pinned.changes.some((c) => c.kind === 'update'), 'a pinned fact is never replaced');

// ---------- 4. apply, undo ----------
const all = p.changes.filter((c) => c.sure);
const done = M.apply(MEM, all);
check(done.done === all.length, `apply makes every ticked change (${done.done}/${all.length})`);
const after = done.memory;
check(!/Uses a Mac/.test(after.shared) && /Now uses Windows/.test(after.shared) && !/Now uses Windows/.test(after.agents.claude), 'applied: the new fact replaced the old one, once');
check(/bloom/i.test(after.places?.lab || '') && !/bloom/i.test(after.shared), 'applied: the Lab fact is in the Lab scope only');
check((after.agents.threedirector.match(/neon/g) || []).length === 1, 'applied: the duplicate is gone');
const unticked = M.apply(MEM, []);
check(JSON.stringify(unticked.memory.shared) === JSON.stringify(MEM.shared), 'nothing ticked: nothing changes');
// the AI saves a fact after the tidy, then Undo: back as it was, the new fact kept
const later = M.saveFacts(after, CLAUDE, ['Prefers ember orange'], NOW).memory;
const back = M.undo(later, MEM, after);
check(back.shared === MEM.shared && /Prefers ember orange/.test(back.agents.claude) && back.agents.claude.startsWith(MEM.agents.claude) && !back.places?.lab, 'Undo: memory back as it was, a fact saved since is kept');
const stale = M.apply(MEM, [{ kind: 'drop', facts: [{ scope: 'shared', text: 'Not there any more' }], after: null }]);
check(stale.done === 0, 'a change whose fact is gone (memory changed since) is skipped');

// ---------- 5. prevention: <remember> replaces instead of appending ----------
let mem = { shared: '- Uses a Mac\n- Hates camera shake', agents: { claude: '- Prefers short answers' } };
let r = M.saveFacts(mem, CLAUDE, ['prefers short answers'], NOW);
check(r.skipped.length === 1 && r.memory.agents.claude === mem.agents.claude, 'a fact it already has: nothing added');
r = M.saveFacts(mem, CLAUDE, ['Now uses Windows'], NOW);
check(r.replaced.length === 1 && r.memory.shared === '- Now uses Windows\n- Hates camera shake' && r.memory.agents.claude === mem.agents.claude, 'a contradicting fact replaces the old one where it was (the shared Mac line)');
check(r.memory.replaced?.at(-1)?.from === '- Uses a Mac' && r.memory.replaced.at(-1).to === '- Now uses Windows', 'the replacement is logged for the frozen prompts');
const undone = M.unsave(r.memory, 'claude', ['Now uses Windows']);
check(undone.shared === mem.shared && !undone.replaced.length, 'Undo on the chip: the old fact comes back');
r = M.saveFacts(mem, CLAUDE, ['Prefers short answers in French'], NOW);
check(r.replaced.length === 1 && r.memory.agents.claude === '- Prefers short answers in French', 'a fact that says more replaces the one it extends');
r = M.saveFacts(mem, CLAUDE, ['Likes neon palettes'], NOW);
check(r.added.length === 1 && /Likes neon palettes$/.test(r.memory.agents.claude), 'a new fact is added as before');
r = M.saveFacts(mem, CLAUDE, ['The Lab is used for music videos'], NOW);
check(r.added.length === 1, 'an unsure match: added, never replaced');
const lab = { shared: '', places: { lab: '- Keep bloom subtle' }, agents: {} };
check(M.saveFacts(lab, DIRECTOR, ['keep bloom subtle'], NOW).skipped.length === 1 && M.saveFacts(lab, CLAUDE, ['keep bloom subtle'], NOW).added.length === 1, 'a Director knows its Lab facts; a plain chat doesn\'t see them');
let big = { shared: '', agents: {} };
for (let i = 0; i < 40; i++) big = M.saveFacts(big, CLAUDE, [`Uses a ${i % 2 ? 'Mac' : 'Windows PC'}`], NOW + i).memory;
check(big.agents.claude.split('\n').length === 1 && big.replaced.length <= 30, `40 back-and-forth saves keep one line (the replacement log capped at ${big.replaced.length})`);

// ---------- 6. scopes in the prompts (byte-stable) ----------
const SCOPED = { shared: '- I post 9:16 visuals on Shorts\n- Call me Sam', places: { lab: '- Keep bloom subtle' }, agents: { claude: '- Prefers short answers' } };
const PLAIN = { shared: SCOPED.shared, agents: SCOPED.agents };
writeMemory(PLAIN);
const before = AGENTS.map((a) => T.buildPrompt(a, { id: 's' }));
writeMemory(SCOPED);
const afterP = AGENTS.map((a) => T.buildPrompt(a, { id: 's2' }));
check(afterP[0] === before[0] && afterP[1] === before[1], 'a Lab fact: the plain Claude and Astra prompts are byte for byte as before');
check(/Keep bloom subtle/.test(afterP[2]) && !/Keep bloom subtle/.test(afterP[0]) && !/Keep bloom subtle/.test(afterP[1]), 'the Lab fact is only in the Three Director\'s prompt');
check(/9:16 visuals on Shorts\n- Keep bloom subtle$/m.test(afterP[2]) || /Shorts\n- Call me Sam\n- Keep bloom subtle/.test(afterP[2]), 'the order is fixed: shared, then the Lab, then its own');
check(T.buildPrompt(DIRECTOR, { id: 'x' }) === T.buildPrompt({ ...DIRECTOR }, { id: 'x' }) && T.buildPrompt(DIRECTOR, { id: 'x' }) === T.buildPrompt(Object.fromEntries(Object.entries(DIRECTOR).reverse()), { id: 'x' }), 'the same Director: the same bytes twice, whatever its keys\' order');
check(CC.memoryNotes(SCOPED, 'claude').length === 2 && CC.memoryNotes(SCOPED, DIRECTOR).length === 2 && CC.memoryNotes(SCOPED, { ...DIRECTOR, id: 'claude' }).length === 3, 'ContextCore.memoryNotes: an id gets shared + own, an agent its places too');
check(M.tokensFor(SCOPED, DIRECTOR) > M.tokensFor(SCOPED, CLAUDE) - 10 && M.tokensFor(SCOPED, CLAUDE) === CC.tok(CC.memoryBlock(CC.memoryNotes(SCOPED, CLAUDE))), 'the tidy\'s per-AI tokens are the prompt\'s memory block');
// tokenaudit reads the same parts the engine gets
const parts = T.promptParts ? T.promptParts(DIRECTOR, null) : engines.promptParts(DIRECTOR, null);
check(parts.find(([k]) => k === 'memory')?.[1].includes('Keep bloom subtle') && !(engines.promptParts || T.promptParts)(CLAUDE, null).find(([k]) => k === 'memory')?.[1].includes('bloom'), 'tokenaudit: the memory part has the Lab fact for the Director only');
// relevant mode (big memory) counts places too
const huge = { shared: '', places: { lab: Array.from({ length: 40 }, (_, i) => `- Lab fact number ${i} about the layers`).join('\n') }, agents: {} };
check(CC.memoryRelevant(DIRECTOR, huge) && !CC.memoryRelevant(CLAUDE, huge), 'a big Lab scope makes the Director\'s memory “relevant” mode, not the plain chat\'s');

// ---------- 7. cachewise: frozen per session ----------
writeMemory({ shared: '- Uses a Mac\n- Hates camera shake', agents: { claude: '- Call me Sam' } });
const sess = {};
const p0 = T.buildPrompt(CLAUDE, sess); sess.id = 'sess-1';
const saved = M.saveFacts({ shared: '- Uses a Mac\n- Hates camera shake', agents: { claude: '- Call me Sam' } }, CLAUDE, ['Now uses Windows'], NOW).memory;
writeMemory(saved);
const p1 = T.buildPrompt(CLAUDE, sess);
const fresh = T.buildPrompt(CLAUDE, {});
check(p0 === p1 && /Uses a Mac/.test(p1), 'a fact the AI updated mid-chat: this chat\'s prompt stays byte for byte (frozen)');
check(/Now uses Windows/.test(fresh) && !/Uses a Mac/.test(fresh), 'a new chat gets the updated fact only');
writeMemory({ ...saved, shared: '- Now uses Windows' }); // the owner tidies (drops a fact): applies at once
check(!/Hates camera shake/.test(T.buildPrompt(CLAUDE, sess)), 'an owner\'s tidy applies at once (as an edit did)');
check(T.onlyGrew('- a\n- b', '- c\n- b', [{ from: '- a', to: '- c' }]) && !T.onlyGrew('- a\n- b', '- b', [{ from: '- a', to: '- c' }]) && !T.onlyGrew('- a\n- b', '- c\n- b') && T.onlyGrew('a\nb', 'a\nc\nb'), 'only-grew: a logged replacement counts as growth only while its new line is there');

// ---------- 8. smarter tidy ----------
const list = M.facts({ shared: '- The user really really likes it when scenes have a slow camera drift and soft light\n- Keep bloom subtle\n- Uses a Mac', agents: { claude: '- Bloom should stay subtle' } });
const prompt = M.smarterPrompt(list);
check(/^Tidy these saved memory facts/.test(prompt) && /<facts>\n1\. The user really/.test(prompt) && prompt.split('\n').length < 20, 'the smarter prompt: tight, numbered facts, one-line answers');
const cost = M.smarterCost(list);
check(cost.total > 700 && cost.total < 1200 && cost.output <= 600, `its cost is known before it runs (≈ ${cost.total} tokens: ${cost.input} in, ${cost.output} out)`);
const parsed = M.parseSmarter('1 = Likes slow camera drift and soft light\n2,4 = Keep bloom subtle\n3 x\nSure, here you go!\n9 = nope\n2 = Longer text than the original fact ever was', list);
check(parsed.length === 3 && parsed[0].kind === 'shorter' && parsed[1].kind === 'merge' && parsed[1].scope === 'shared' && parsed[2].kind === 'drop' && parsed[2].sure === false, 'its reply → shorter / merge / drop (drops unticked); chatter, unknown numbers and reused facts skipped');
check(M.parseSmarter('3 = Uses a Mac computer for everything here', list).length === 0, 'a “shorter” wording that isn\'t shorter is skipped');

// ---------- 9. measured: two months of saved facts ----------
// A scripted stream like the owner's habits (music-driven Lab visuals with the Three Director, plain chats with Claude,
// Astra now and then; Mac and Windows; formats; one-off "this week" facts). Old: every <remember> appended. New: the
// same stream through saveFacts (prevention), then one local Tidy memory (sure changes only).
const STREAM = [
  [1, 'claude', 'The user makes music-driven three.js visuals'], [1, 'threedirector', 'Prefers slow camera moves'], [2, 'claude', 'Prefers short answers'],
  [2, 'threedirector', 'Keep bloom subtle'], [3, 'claude', 'The user posts 9:16 visuals on YouTube Shorts'], [3, 'astra', 'Prefers short answers'],
  [4, 'claude', 'Uses a Mac'], [5, 'threedirector', 'The user likes neon palettes'], [5, 'claude', 'Call me Q'],
  [6, 'threedirector', 'Hates camera shake'], [7, 'claude', 'The user really prefers it when the responses are short and to the point'], [8, 'threedirector', 'Keeps bloom subtle'],
  [9, 'claude', 'Working on the Ember Tide intro this week'], [10, 'threedirector', 'Likes neon palettes'], [11, 'astra', 'Uses a Mac'],
  [12, 'claude', 'Prefers sliders grouped by Colors, Formation and Particles'], [13, 'threedirector', 'Prefers sliders grouped by Colors, Formation and Particles'], [14, 'claude', 'Now uses Windows'],
  [15, 'claude', 'Saves and shuffles slider presets a lot'], [16, 'threedirector', 'Taps beats live to sync visuals'], [17, 'astra', 'Now uses Windows'],
  [18, 'claude', 'Likes neon palettes'], [19, 'claude', 'Prefers 60fps previews'], [20, 'threedirector', 'Prefers 60 fps previews'],
  [21, 'claude', 'The user makes music-driven three.js visuals for social media'], [22, 'claude', 'Deadline for the intro video is Oct 3'], [23, 'threedirector', 'Freezes frames to check the look'],
  [24, 'claude', 'Uses a Mac'], [25, 'astra', 'The user prefers short answers'], [26, 'threedirector', 'Avoid camera shake'],
  [27, 'claude', 'Works in 1080x1920 for Shorts'], [28, 'claude', 'Prefers detailed answers when debugging code'], [29, 'threedirector', 'Keep bloom subtle'],
  [30, 'claude', 'Busy rendering the album visuals right now'], [31, 'claude', 'Likes the Forgeheart gold accent'], [32, 'astra', 'Uses a Mac'],
  [33, 'threedirector', 'Prefers slow camera moves and soft light'], [34, 'claude', 'Call me Q'], [35, 'claude', 'Lab scenes should use layers for each new effect'],
  [36, 'threedirector', 'Every new effect goes in its own layer'], [37, 'claude', 'Now uses Windows'], [38, 'claude', 'Prefers short answers'],
  [40, 'claude', 'Posts on TikTok too'], [42, 'threedirector', 'Likes neon palettes and soft glow'], [44, 'claude', 'Uses a Mac'],
  [46, 'claude', 'Working on the Hearth intro video this week'], [48, 'threedirector', 'Hates camera shake'], [50, 'astra', 'Now uses Windows'],
  [52, 'claude', 'Uses Blender for models'], [54, 'claude', 'Keep bloom subtle in Lab scenes'], [56, 'threedirector', 'Prefers slow camera moves'],
  [58, 'claude', 'The user really likes it when sliders have clear labels'], [60, 'claude', 'Uses a Mac'],
];
const start = NOW - 61 * DAY;
let old = { shared: '- Make music visuals for Shorts', agents: {} };
let neu = { shared: '- Make music visuals for Shorts', agents: {} };
const stamps = {};
for (const [day, id, text] of STREAM) {
  const a = AGENTS.find((x) => x.id === id);
  old.agents[id] = [old.agents[id], `- ${text}`].filter(Boolean).join('\n');
  const rr = M.saveFacts(neu, a, [text], start + day * DAY);
  neu = rr.memory;
  for (const t of rr.added) stamps[`${id}|${t}`] = { added: start + day * DAY };
  for (const x of rr.replaced) stamps[`${x.scope}|${M.strip(x.to)}`] = { added: start + day * DAY };
}
const oldMeta = {};
STREAM.forEach(([day, id, text]) => { oldMeta[`${id}|${text}`] = { added: start + day * DAY }; });
const tidyOld = M.apply(old, M.propose(old, { meta: oldMeta, agents: AGENTS, now: NOW }).changes.filter((c) => c.sure)).memory;
const tidyNew = M.apply(neu, M.propose(neu, { meta: stamps, agents: AGENTS, now: NOW }).changes.filter((c) => c.sure)).memory;
const row = (label, m) => `${label.padEnd(34)} ${String(M.facts(m).length).padStart(3)} facts · ${AGENTS.map((a) => `${a.name} ${String(M.tokensFor(m, a)).padStart(4)}`).join(' · ')} · all ${M.allTokens(m)}`;
console.log('\n   measured (60 days, 54 saves; tokens of memory with each message):');
console.log(`   ${row('appended (before this round)', old)}`);
console.log(`   ${row('appended, then Tidy memory', tidyOld)}`);
console.log(`   ${row('replace-not-append (prevention)', neu)}`);
console.log(`   ${row('prevention + Tidy memory', tidyNew)}`);
const tOld = M.tokensFor(old, CLAUDE); const tNew = M.tokensFor(tidyNew, CLAUDE);
check(M.tokensFor(neu, CLAUDE) < tOld * 0.9, `prevention alone: Claude's memory ${tOld} → ${M.tokensFor(neu, CLAUDE)} tokens`);
check(tNew < tOld * 0.65 && M.tokensFor(tidyOld, CLAUDE) < tOld * 0.75, `with Tidy memory: Claude ${tOld} → ${M.tokensFor(tidyOld, CLAUDE)} (tidy) / ${tNew} (prevention + tidy)`);
check(/Windows|Mac/.test(tidyNew.shared + Object.values(tidyNew.agents).join('\n')) && (M.facts(tidyNew).map((f) => f.text).join('\n').match(/\b(Uses a Mac|Now uses Windows)\b/g) || []).length <= 3, 'the OS facts end as one line per AI (the newest), not ten');
check(!/Working on the Ember Tide/.test(JSON.stringify(tidyNew)) && !/Deadline for the intro video/.test(JSON.stringify(tidyNew)), 'old “this week” facts and passed deadlines are gone');

if (process.env.MEMTIDY_DUMP) console.log(JSON.stringify({ neu, tidyNew, tidyOld }, null, 1));
fs.rmSync(dir, { recursive: true, force: true });
console.log(fails.length ? `\n${fails.length} failed` : '\nall memorytidy checks passed');
process.exit(fails.length ? 1 : 0);
