// Tour (round 15, "feel free to make me discover things"): What's new after a faked ⬆ Update (only the new numbered
// lines of the docs it changed, picked for the owner's habits, one card with ▶ Show me / × Not for me, /whats-new by
// round), one guided spotlight (ring + card, Next opens the place, Esc pauses, /tour picks up at the same step, /tour
// stays capture's for its own tours), the one-tip-a-day limit, the feature map with ✦ Surprise me, and ideas.
//   node dev/smoke.js --check-timeout 120000 --script dev/checks/tour-discover.js --shot /tmp/tour-discover.png
const SHOTS = window.TOUR_SHOTS || '/tmp/hearth-checks/tour-discover';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 15000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(120); } return false; };
const out = {}; const fail = [];
const ok = (cond, what) => { if (!cond) fail.push(what); return Boolean(cond); };
const shot = async (name) => { try { await smoke({ shot: `${SHOTS}-${name}.png` }); } catch { /* optional */ } };
const C = H.claudeAgent();
const say = async (line, agentId = C.id) => { let text = ''; await Commands.tryRun(line, agentId, null, { say: (t) => { text = String(t); }, note: (t) => { text = String(t); } }); return text; };
try {
  ok(!(Commands.duplicates?.() || []).length, `no duplicate commands (${(Commands.duplicates?.() || []).map((d) => d.name).join(' ')})`);
  for (const n of ['whats-new', 'tip', 'feature-map', 'surprise-me', 'ideas', 'spotlight']) ok(Commands.get(n), `/${n} registered`);
  await Discover.ready;
  // ---- 1. What's new after a faked update ----
  document.querySelectorAll('.speed-card').forEach((c) => c.remove()); // the pick-up card (the card waits for it)
  Discover.data.base['speed.md'] = 50; // speed.md had 50 lines before; eyes.md is new
  const speed = await Discover.loadDoc('speed.md', true);
  const eyes = await Discover.loadDoc('eyes.md', true);
  const j = { from: 'aaaaaaa', to: 'bbbbbbb', at: Date.now(), n: 3, files: ['docs/upgrades/speed.md', 'docs/upgrades/eyes.md', 'docs/upgrades/README.md', 'board.js'] };
  store.set('update.last', j);
  document.dispatchEvent(new CustomEvent('hearth:updated', { detail: j }));
  const rec = await until(() => Discover.data.updates.find((u) => u.at === j.at));
  const expect = speed.items.filter((x) => x.n > 50).length + eyes.items.length;
  out.update = { n: rec?.n, expect, files: rec?.files };
  ok(rec && rec.n === expect, `new lines only (${rec?.n} vs ${expect})`);
  ok(Discover.data.base['speed.md'] === Math.max(...speed.items.map((x) => x.n)), 'the base moved to the new end');
  ok(await Discover.fromUpdate(j) === null, 'the same update is shown once');
  const card = await until(() => document.querySelector('.dc-new'), 9000);
  ok(card, 'the What\'s new card');
  const rows = [...(card?.querySelectorAll('.dc-row') || [])];
  out.card = rows.map((r) => r.querySelector('b').textContent);
  ok(rows.length === 5, `5 rows (${rows.length})`);
  ok(/What's new · \d+ changes/.test(card?.textContent || ''), 'the card says how many');
  await shot('card');
  // × Not for me: the row goes, that kind sinks
  const hid = rows[1]?.dataset.item;
  rows[1]?.querySelector('.dc-no').click();
  ok(!card.querySelector(`[data-item="${hid}"]`) && Discover.data.hide.includes(hid), 'Not for me hides it');
  ok(!Discover.picked((await Discover.current()).items, 8).some((x) => x.id === hid), 'and it stays hidden');
  // ▶ Show me: a ring on a control, a command, or a tour
  const shown = await Discover.showMe(rows[0].dataset.item);
  out.showMe = shown;
  ok(shown && !/gone/.test(shown), `Show me did something (${shown})`);
  Tour.stop(); document.querySelectorAll('.tour-ring').forEach((r) => r.remove());
  Discover.closeCard();
  // /whats-new in a chat, by round, history
  const wn = await say('/whats-new');
  ok(/What's new · this update/.test(wn) && /1\. /.test(wn), `/whats-new lists this update (${wn.slice(0, 80)})`);
  const r14 = await say('/whats-new round 14');
  ok(/round 14/.test(r14), '/whats-new round 14');
  const hist = await say('/whats-new history');
  ok(/Round 14/.test(hist) && /Rounds 1–2/.test(hist) && /Your updates/.test(hist), '/whats-new history by round');
  // ---- 2. one guided spotlight ----
  ok(Commands.get('tour').variants?.length >= 2, '/tour is shared with capture');
  await say('/tour renders');
  const tc = await until(() => document.querySelector('.tour-card[data-tour="renders"]'));
  ok(tc && Tour.current?.id === 'renders', 'the renders tour card');
  ok(await until(() => document.querySelector('.tour-ring')), 'the ring on a real control');
  tc?.querySelector('.tour-next').click();
  ok(await until(() => Tour.current?.step === 1 && document.querySelector('.rq-pop')), 'Next opens the render queue');
  await shot('tour');
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  ok(await until(() => !Tour.current && !document.querySelector('.tour-card')), 'Esc pauses it');
  ok(Tour.progress().renders?.step === 1, 'its step is kept');
  await say('/tour renders');
  ok(await until(() => Tour.current?.step === 1), 'it picks up at the same step');
  Tour.stop();
  Renders.close?.();
  // ---- 3. the tip limit ----
  store.set('discover.tips', { day: '', seen: [], later: {}, off: false });
  const t1 = await Discover.maybeTip({ force: true });
  ok(t1 && document.querySelector('.dc-tip'), `a tip (${t1?.id})`);
  Discover.closeCard();
  await wait(200);
  ok(await Discover.maybeTip() === null, 'no second tip the same day');
  ok(!Discover.tipCandidates().some((t) => t.id === t1?.id), 'a shown tip is not shown again');
  store.set('discover.tips', { day: '', seen: [], later: {}, off: true });
  ok(await Discover.maybeTip() === null, 'Stop tips holds');
  // ---- 4. feature map + Surprise me ----
  Discover.openPane('map');
  const map = await until(() => document.querySelectorAll('.dc-pane[data-pane="map"] .dc-area').length > 5 && document.querySelector('.dc-pane[data-pane="map"]'));
  ok(map, 'the feature map on the Commands page');
  out.areas = Discover.featureMap().slice(0, 4).map((a) => `${a.area} ${a.used}/${a.total}`);
  await shot('map');
  const s1 = await Discover.surprise();
  ok(s1 && Commands.get(s1.cmd.slice(1).split(' ')[0]), `Surprise me picks a real command (${s1?.cmd})`);
  const s2 = await Discover.surprise();
  ok(s2 && s2.cmd !== s1?.cmd, `and not the same twice (${s2?.cmd})`);
  out.surprise = [s1?.cmd, s1?.how, s2?.cmd, s2?.how];
  // ---- 5. ideas ----
  const idf = DiscoverData.ideas({ boards: ['Neon Rose'], mood: ['dreamy'], scenes: ['Orb', 'Flame'], songs: ['night drive'], apps: ['meshy'] });
  ok(idf.some((x) => /“Neon Rose” board into a 9:16 loop/.test(x.text)) && idf.some((x) => /night drive/.test(x.text)), 'ideas from a board and a song');
  const live = await Discover.ideas();
  ok(live.length >= 1, `ideas here (${live.length})`);
  out.ideas = live.map((x) => x.text);
} catch (err) { fail.push(`threw: ${err.stack || err.message}`); }
out.fail = fail;
out.ok = !fail.length;
return JSON.stringify(out, null, 1);
