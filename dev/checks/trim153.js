// (round 153, trim153) Trim Hearth: the feature registry covers every lazy group (switchable or always on, once each);
// always-on features can't be switched off; the panel shows usage numbers ("used N times", "never used on this
// computer") and Suggested only pre-selects; Apply switches features off; after a reload a switched-off feature's
// groups never load (no file of theirs in the page, no stand-in commands / Ctrl/⌘+K lines / keys-sheet lines, its
// buttons hidden, Lazy.load refuses calmly, so none of its timers run); turning one back on is live (its group loads,
// its commands come back); its data was never touched. docs/upgrades/trim153.md
//   node dev/smoke.js --fake-engines --check-timeout 600000 --script dev/checks/trim153.js
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 20000) => { const t = Date.now(); while (Date.now() - t < ms) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(120); } return null; };
const out = { steps: [], problems: [] };
const step = (ok, label, extra) => { out.steps.push(`${ok ? '✓' : '✖'} ${label}${extra !== undefined ? ` · ${JSON.stringify(extra).slice(0, 400)}` : ''}`); if (!ok) out.problems.push(label); };
try {
  localStorage.removeItem('hub.trim.off'); localStorage.removeItem('hub.trim.use');
  await Lazy.load('trim');
  step(typeof Trim !== 'undefined' && typeof TrimData !== 'undefined' && typeof HearthFeatures !== 'undefined', 'the trim group loads; HearthFeatures is there');
  // 1. the registry covers every lazy group exactly once
  const all = LazyData.GROUPS.map((g) => g.name);
  const list = HearthFeatures.list();
  const seen = new Map();
  for (const f of list) for (const g of f.groups) seen.set(g, [...(seen.get(g) || []), f.id]);
  const missing = all.filter((g) => !seen.has(g));
  const twice = [...seen].filter(([, ids]) => ids.length > 1).map(([g, ids]) => `${g}: ${ids.join(', ')}`);
  const unknown = [...seen.keys()].filter((g) => !all.includes(g));
  step(!missing.length && !twice.length && !unknown.length, 'every lazy group is in exactly one feature (switchable or always on)', { missing, twice, unknown });
  const opt = list.filter((f) => !f.core);
  step(opt.length >= 40 && opt.every((f) => f.name && f.desc && f.area), `${opt.length} switchable features, each with a name, area and one line`, opt.filter((f) => !f.name || !f.desc).map((f) => f.id));
  // no always-on group needs a switchable one (it would go off with it)
  const optGroups = new Set(opt.flatMap((f) => f.groups));
  const coreNeeds = LazyData.GROUPS.filter((g) => !optGroups.has(g.name) && (g.after || []).some((d) => optGroups.has(d))).map((g) => g.name);
  step(!coreNeeds.length, 'no always-on group needs a switchable one', coreNeeds);
  step(Math.abs(Object.keys(TrimData.KB).length - all.length) === 0, 'every group has a size (node dev/trim-weights.js)');
  // 2. always-on features can't be switched off
  const coreTry = ['chat', 'projects', 'lab', 'settings', 'updates', 'safety', 'sync'].map((id) => [id, HearthFeatures.set(id, false), Trim.setFeature(id, false).ok]);
  step(coreTry.every(([, a, b]) => a === false && b === false) && !localStorage.getItem('hub.trim.off'), 'always-on features (chat, projects, Lab, settings, updates, safety nets, sync) can\'t be switched off', coreTry);
  // 3. usage numbers: three uses of /variations, one of the mood board's command; the rest never used
  Usage.track('Chat command › /variations'); Usage.track('Chat command › /variations'); Usage.track('Chat command › /variations');
  Usage.track('Chat command › /board-info');
  const rows = Trim.rows();
  const v = rows.find((r) => r.id === 'variations');
  step(v?.use.n === 3 && v.use.last > 0, 'usage: Variations used 3 times', v?.use);
  step(rows[0].use.n <= rows[rows.length - 1].use.n, 'least used first');
  // data a switched-off feature owns, written before: it must still be there at the end
  await window.hub.kvSet('board-palettes', [{ name: 'trim153 probe', colors: ['#f4b63f'], tags: 'yours' }]);
  // 4. the panel: words, numbers, Suggested only pre-selects
  const dlg = Trim.open();
  const text = dlg.textContent;
  step(/Switched-off features don't load\. Your data stays; turn them back on anytime\./.test(text), 'the panel says what switching off means');
  const vRow = dlg.querySelector('.tr-row[data-id="variations"]');
  step(/used 3 times · last used today/.test(vRow?.textContent || ''), 'a row shows "used 3 times · last used today"', vRow?.textContent);
  step(/never used on this computer/.test(dlg.querySelector('.tr-row[data-id="lyrics"]')?.textContent || ''), 'an unused feature says "never used on this computer"');
  step(/\d+ KB|MB/.test(vRow?.textContent || '') && /loads (with Hearth|only when used)/.test(dlg.textContent), 'rows show a weight (KB) and when it loads');
  dlg.querySelector('.tr-suggest').click();
  const picked = [...dlg.querySelectorAll('.tr-row.tr-changed')].map((r) => r.dataset.id);
  step(picked.length > 5 && !picked.includes('variations') && !picked.includes('notify') && !localStorage.getItem('hub.trim.off'), 'Suggested pre-selects unused features (not the used one, not one that works by itself) and saves nothing', picked.length);
  dlg.querySelector('.tr-allon').click();
  // switch off: Mood board (loads with Hearth), Variations (only when used), Button sparkle effects; Apply
  for (const id of ['board', 'variations', 'juice']) dlg.querySelector(`.tr-row[data-id="${id}"] .tr-switch`).click();
  step(/Apply \(3\)/.test(dlg.querySelector('.tr-apply').textContent), 'Apply counts the three changes');
  step(Commands.get('variations')?.__lazy === 'labvar', '/variations is a stand-in before Apply');
  dlg.querySelector('.tr-apply').click();
  await wait(100);
  step(JSON.stringify(JSON.parse(localStorage.getItem('hub.trim.off') || '[]').sort()) === '["board","juice","variations"]', 'Apply saves the three switched off (on this computer only)', localStorage.getItem('hub.trim.off'));
  step(!dlg.isConnected, 'the panel closes');
  step(!Commands.get('variations'), 'live: /variations (not loaded yet) is gone at once');
  step(/tool:board/.test(document.getElementById('trim-hide')?.textContent || ''), 'live: the mood board\'s buttons are hidden');
  step([...document.querySelectorAll('#toasts .toast')].some((t) => /Reload Hearth to finish/.test(t.textContent)), 'a reload is offered (the mood board had loaded)');
  out.part1 = 'ok';
} catch (err) { out.problems.push(`threw: ${err.message}`); }
return out;
//@@ reload
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 30000) => { const t = Date.now(); while (Date.now() - t < ms) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(150); } return null; };
const out = { steps: [], problems: [] };
const step = (ok, label, extra) => { out.steps.push(`${ok ? '✓' : '✖'} ${label}${extra !== undefined ? ` · ${JSON.stringify(extra).slice(0, 400)}` : ''}`); if (!ok) out.problems.push(label); };
try {
  await until(() => window.Lazy && Lazy.calm, 20000);
  Lazy.calmNow();
  // every group that loads at the start is in (apart from the switched-off ones)
  await until(() => Lazy.state().filter((g) => g.tier === 'soon' && !g.off).every((g) => g.state === 'loaded'), 60000);
  await wait(1500);
  const st = new Map(Lazy.state().map((g) => [g.name, g]));
  step(['board', 'pinboard', 'labvar', 'juice'].every((n) => st.get(n)?.off && st.get(n).state === 'stub'), 'after the reload: the switched-off groups never loaded', ['board', 'pinboard', 'labvar', 'juice'].map((n) => st.get(n)));
  const files = ['board.js', 'board-data.js', 'juice.js', 'pinboard.js'].filter((f) => document.querySelector(`script[src="${f}"]`));
  step(!files.length && typeof Board === 'undefined' && typeof Juice === 'undefined', 'none of their code is in the page (so none of their timers or listeners run)', files);
  step(!Commands.get('board-info') && !Commands.get('variations') && !Commands.get('find-images'), 'their chat commands are gone (/board-info, /variations, /find-images)');
  const acts = (AppUI.actions?.() || []).map((a) => a.label);
  const theirs = [...Lazy.names('labvar').actions, ...Lazy.names('juice').actions, ...Lazy.names('board').actions];
  step(theirs.length > 0 && !acts.some((l) => theirs.includes(l)) && acts.some((l) => /Trim Hearth/.test(l)), 'their Ctrl/⌘+K lines are gone; Trim Hearth is there', acts.filter((l) => theirs.includes(l)));
  step(!Keys.all().some((k) => k.area === 'Board'), 'their keys-sheet lines are gone (Board)');
  step(/tool:board/.test(document.getElementById('trim-hide')?.textContent || ''), 'the mood board\'s buttons stay hidden');
  let err = null; try { await Lazy.load('board'); } catch (e) { err = e; }
  step(err?.code === 'EFEATUREOFF' && /switched off on this computer/.test(err.message), 'asking for it anyway is refused calmly (EFEATUREOFF)', err?.message);
  step(Commands.get('trim') && typeof Commands.get('trim').run === 'function', '/trim is there (also in the command bar, which lists the commands)');
  // the data it owns is still there
  const pal = await window.hub.kvGet('board-palettes', []);
  step(Array.isArray(pal) && pal.some((p) => p.name === 'trim153 probe'), 'its data stays (the mood board\'s saved palette)');
  step(Object.keys(Usage.data?.items || {}).some((k) => k === 'Chat command › /variations'), 'the usage counts stay');
  // re-enabling is live: the mood board (loads with Hearth) and Variations (on use)
  await Lazy.load('trim');
  const r1 = Trim.setFeature('board', true); const r2 = Trim.setFeature('variations', true);
  step(r1.ok && r2.ok && !r1.restart && !r2.restart, 'turning them back on needs no reload', [r1, r2]);
  step(Commands.get('variations')?.__lazy === 'labvar', '/variations is back at once');
  const loaded = await until(() => Lazy.loaded('board'), 30000);
  step(Boolean(loaded) && typeof Board !== 'undefined', 'the mood board loads by itself again');
  step(Boolean(Commands.get('board-info')), '/board-info is back');
  step(!/tool:board/.test(document.getElementById('trim-hide')?.textContent || ''), 'its buttons show again');
  step(JSON.stringify(HearthFeatures.offIds()) === '["juice"]' && !HearthFeatures.enabled('juice') && HearthFeatures.enabled('board'), 'HearthFeatures: juice still off, the board on', HearthFeatures.offIds());
  Trim.setFeature('juice', true);
  step(!localStorage.getItem('hub.trim.off') || localStorage.getItem('hub.trim.off') === '[]', 'everything back on');
} catch (err) { out.problems.push(`threw: ${err.message}`); }
return out;
