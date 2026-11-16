// (round 183, forgechat183) The Forge chat, back in the Forgeheart window (throwaway data; dev/fake-forgeheart.html as
// the game: pass its path first):
//   node dev/smoke.js --fake-engines --eval "window.__fakeGame='<abs>/dev/fake-forgeheart.html'" --check-timeout 300000 --script dev/checks/forgechat183.js
//   1. an agent that drives the live game (companion 'forge-game') is docked in the Forgeheart tool: its chat is on the
//      right of that window, and it is not a separate chat in the rail any more
//   2. the window has ▶ Live game: the debug game runs there, and the forge_* tools drive it
//   3. a forge tool called while the game isn't up opens ▶ Live game first
//   4. forge_docs lists, reads and searches the design notes in the project folder
//   5. what the chat knows: the brief, the folder and the notes' names ride along with its messages (never a lean run)
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 15000, every = 100) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(every); } return null; };
const out = { info: {} }; const fail = [];
const ok = (c, m, info) => { if (!c) fail.push(info === undefined ? m : `${m} (${JSON.stringify(info).slice(0, 400)})`); return Boolean(c); };
try {
  ok(window.__fakeGame, 'the fake game\'s path was passed');
  // a project folder with two design notes
  const base = (await window.hub.attachmentsDir()).replace(/[\\/]attachments[\\/]?$/, '');
  const sep = base.includes('\\') ? '\\' : '/';
  const dir = `${base}${sep}forge-notes-check`;
  await window.hub.fs.write(`${dir}${sep}forgeheart-drones-update.md`, '# Drones\n\nDrones orbit the forge and auto-fire. The Kestrel swarm scales with stage.\n\n- [ ] rebalance drone fire rate\n');
  await window.hub.fs.write(`${dir}${sep}gameplay-rifts.md`, `# Rifts\n\nA rift opens every ten stages. Rift motes drop shards.\n\n${'Long body. '.repeat(1400)}`);
  H.config.settings = { ...H.config.settings, forgeDebugBuild: window.__fakeGame, forgeheartFolder: dir };
  H.config.agents.push({ id: 'forge-debug', name: 'Forge Debug', icon: '⚒', color: '#e07a2f', mode: 'native', engine: 'claude', gameTools: true, companion: 'forge-game', askAll: false });
  await saveConfig();

  // ---------- 1. docked in the Forgeheart window ----------
  const docked = await until(() => H.agent('forge-debug')?.dock === 'forgeheart', 8000);
  ok(docked, 'the game\'s agent is docked in the Forgeheart tool once the settings are applied', H.agent('forge-debug'));
  ok(!H.railAgents().some((a) => a.id === 'forge-debug') && H.surfaceIdFor('forge-debug') === 'tool:forgeheart', 'it lives in that window, not as a separate chat');
  await Lazy.load('addons');
  activate('tool:forgeheart');
  const surf = await until(() => { const s = document.querySelector('.tool-surface[data-id="tool:forgeheart"]'); return s?.querySelector('.tool-dock .composer, .tool-dock textarea, .tool-dock [contenteditable]') ? s : null; }, 20000);
  ok(surf && !surf.querySelector('.tool-dock').hidden, 'the Forgeheart window has the chat on its right', surf ? surf.querySelector('.tool-dock')?.className : null);
  ok([...(surf?.querySelectorAll('.dock-toggle') || [])].some((b) => /Forge Debug/.test(b.textContent)) && !surf?.querySelector('.forge-chat-btn'), 'its header has the chat\'s own show / hide button');
  ok(Forge.forgeAgent()?.id === 'forge-debug', 'the tool knows its chat');

  // ---------- 2. ▶ Live game ----------
  const tabBtn = [...(surf?.querySelectorAll('button, [role="tab"]') || [])].find((b) => /Live game/.test(b.textContent));
  ok(tabBtn, 'the window has ▶ Live game');
  // ---------- 3. a tool call opens it ----------
  const st = await HubBridge.call('forge_status', {}, {});
  out.info.status = JSON.stringify(st).slice(0, 200);
  ok(ForgeGame.isReady() && surf?.querySelector('.forge-live-game webview'), 'a forge tool called with the game not up opened ▶ Live game and waited for it');
  ok(st?.ok !== false && /stage/i.test(JSON.stringify(st)), 'forge_status answers from the live game', out.info.status);
  const sp = await HubBridge.call('forge_spawn', { type: 'random', count: 5 }, {});
  ok(sp?.ok !== false, 'forge_spawn drives it', JSON.stringify(sp).slice(0, 200));

  // ---------- 4. forge_docs ----------
  const list = await HubBridge.call('forge_docs', {}, {});
  const lv = list?.value || list;
  ok(lv?.notes?.length === 2 && lv.notes.some((n) => n.name === 'forgeheart-drones-update') && /survivor/.test(lv.brief || '') && lv.folder === dir, 'forge_docs lists the notes with the brief', JSON.stringify(list).slice(0, 300));
  const one = await HubBridge.call('forge_docs', { name: 'drones' }, {});
  ok(/Drones orbit the forge/.test((one?.value || one)?.text || ''), 'forge_docs {name} reads a note (part of its name is enough)', JSON.stringify(one).slice(0, 200));
  const big = await HubBridge.call('forge_docs', { name: 'gameplay-rifts' }, {});
  const bv = big?.value || big;
  ok(bv?.text?.length === 12000 && /offset: 12000/.test(bv.more || ''), 'a long note comes in parts', { len: bv?.text?.length, more: bv?.more });
  const part2 = await HubBridge.call('forge_docs', { name: 'gameplay-rifts', offset: 12000 }, {});
  ok(((part2?.value || part2)?.text || '').length > 100 && !(part2?.value || part2)?.more, 'and the next part follows');
  const found = await HubBridge.call('forge_docs', { find: 'shards' }, {});
  const fv = found?.value || found;
  ok(fv?.notes?.length === 1 && fv.notes[0].name === 'gameplay-rifts' && /shards/.test(fv.notes[0].lines.join(' ')), 'forge_docs {find} searches every note', JSON.stringify(found).slice(0, 300));
  const none = await HubBridge.call('forge_docs', { name: 'nope' }, {});
  ok(none?.ok === false || /No note named/.test(JSON.stringify(none)), 'a missing note says so');

  // ---------- 5. what the chat knows ----------
  const know = await Forge.knowledge({ fresh: true });
  ok(/^FORGEHEART: the owner's own game/.test(know) && /fullscreen survivor/.test(know) && know.includes(dir) && /forgeheart-drones-update, gameplay-rifts/.test(know) && know.length <= 2600, 'the knowledge: what it is, the brief, the folder, the notes\' names', know.slice(0, 300));
  const opts = (base0) => { const o = { ...base0 }; for (const fn of Native.hooks.options) { try { fn('forge-debug', { id: 'c-x' }, '', null, o); } catch { /* another hook's own needs */ } } return o; };
  ok(opts({}).gameBrief === know, 'it rides along with the Forge chat\'s messages');
  ok(!('gameBrief' in opts({ lean: true })), 'never on a lean run');
  const other = { }; for (const fn of Native.hooks.options) { try { fn(H.claudeAgent().id, { id: 'c-y' }, '', null, other); } catch { /* */ } }
  ok(!H.claudeAgent().gameTools ? !('gameBrief' in other) : true, 'a chat without the game\'s tools doesn\'t get it');

  // ---------- 6. what the game is doing right now, with each message ----------
  const line = Forge.nowLine({ onTitleScreen: false, stage: 12, maxStage: 20, gold: 52000, hp: 80, hpMax: 143, dps: 4300, enemies: 22, byType: { a: 9, b: 7, c: 4, d: 2 }, boss: null, debug: { god: true, paused: false, timeScale: 2 } }, { tab: 'docs', doc: 'gameplay-rifts' });
  ok(line === '[Forgeheart now: stage 12 (best 20) · gold 52k · HP 80/143 · DPS 4300 · 22 enemies (a 9, b 7, c 4) · god, speed 2× | the owner is on the docs tab, reading "gameplay-rifts"]', 'the line: stage, gold, HP, enemies, switches, and what the owner is looking at', line);
  ok(Forge.nowLine(null, { tab: 'live' }) === '', 'nothing to say: no line');
  const compose = async (agentId, text) => { let raw = text; for (const fn of Native.hooks.compose) { try { const t = await fn(agentId, { id: 'c-z', agentId, messages: [] }, raw, { role: 'user', text }); if (typeof t === 'string') raw = t; } catch { /* another hook's own needs */ } } return raw; };
  const sent = await compose('forge-debug', 'why is this so hard?');
  ok(/^why is this so hard\?/.test(sent) && /\[Forgeheart now: stage \d+/.test(sent) && /enem/.test(sent), 'a message to the Forge chat carries the live game\'s state', sent.slice(0, 300));
  ok(!/Forgeheart now/.test(await compose(H.claudeAgent().id, 'hello')), 'no other chat gets it');
  await wait(600);
} catch (err) { fail.push(`threw: ${err.stack || err}`); }
out.problems = fail;
out.ok = fail.length === 0;
return JSON.stringify(out, null, 1);
