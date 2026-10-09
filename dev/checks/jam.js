// Jam (jam.js) end to end with the fake engines: /jam with no setup (the Three Director is made on the spot), real
// MCP builds by the fake Claude, Astra's directions (fake Codex, with a picture), the card and the Lab badge, the
// final pick + saved look, /jam keep, /jam again, a broken build fixed / reverted, Astra down (Claude critiques
// itself), Esc stops, an Astra director that builds every other round, and no duplicate commands.
//   node dev/smoke.js --fake-engines --eval "window.JAM_SHOTS='/tmp'" --script dev/checks/jam.js --wait 6000 --check-timeout 600000 --shot /tmp/jam.png
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 20000) => { const t = Date.now(); while (Date.now() - t < ms) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(150); } return null; };
const out = {};
const C = H.claudeAgent();
const shots = window.JAM_SHOTS || window.SMOKE_SAVES; // --eval "window.JAM_SHOTS='/some/dir'" keeps the pictures
const card = (m) => document.querySelector(`.jam-card[data-jid="${m.id}"]`);
const brief = (m) => ({
  idea: m.idea, status: m.status, total: m.total,
  rounds: m.list.map((R) => `${R.n} ${R.lead}${R.ok ? '' : ' BROKEN'}${R.reverted != null ? ` reverted→${R.reverted}` : ''} | ${R.build?.text?.slice(0, 70)}${R.dir ? ` | ${R.dir.by}${R.dir.self ? '(self)' : ''}: ${R.dir.text.replace(/\n/g, ' / ').slice(0, 70)}` : ''}${R.thumb ? ' 🖼' : ''}`),
  best: m.best, picks: m.picks, saved: m.saved, notes: m.notes,
  tokens: Object.fromEntries(Object.entries(m.tokens).map(([k, t]) => [k, `${t.input} in · ${t.output} out · ${t.turns} turns`])),
});
const jamDone = () => until(() => !Jam.running(), 240000);

// 1. /jam with no director yet, 3 rounds, an idea
const t0 = Date.now();
await Commands.tryRun('/jam 3 neon knot that punches on the bass', C.id);
const host = await until(() => H.agents().find((a) => a.dock === 'three'));
out.directorMade = Boolean(host);
let m = await until(() => Jam.latest());
// the badge while it runs, and a picture mid-jam
out.badgeSeen = await until(() => document.querySelector('.jam-badge')?.textContent, 30000);
await until(() => m.list.some((R) => R.status === 'directing'), 60000);
out.badgeDirecting = document.querySelector('.jam-badge')?.textContent;
// round 5: the scene tag shows both agents (the one at work lit) and the card's filmstrip grows
{
  const jamChat = Jam._test.state()?.chat?.id;
  const tagAvs = [...document.querySelectorAll('.scene-tag .scene-av')];
  out.tagDuringJam = { workers: ChatScenes.workers(jamChat), avatars: tagAvs.map((a) => `${a.dataset.engine}${a.classList.contains('on') ? '+' : ''}${a.querySelector('svg') ? ' svg' : ''}`), linked: ChatScenes.linkOf(jamChat) === m.sketchId };
  out.filmDuringJam = { frames: card(m)?.querySelectorAll('.jam-frame[data-n]').length, todo: card(m)?.querySelectorAll('.jam-frame.todo').length, live: Boolean(card(m)?.querySelector('.jam-frame.live')) };
}
await smoke({ shot: `${shots}/jam-running.png` });
await jamDone();
{
  const jamChat = H.activeChat[host.id];
  out.afterJam = { workersCleared: !ChatScenes.workers(jamChat), rowStill: Boolean(ChatScenes.thumbOf(jamChat)), recap: m.recap, notificationRecap: m.recap && card(m)?.querySelector('.jam-recap')?.textContent === m.recap };
  // the timeline: scrub previews a round in the card, a click keeps it
  const wrap = card(m)?.querySelector('.jam-film-wrap');
  wrap?.show(2);
  out.scrub = { frames: card(m)?.querySelectorAll('.jam-frame[data-n]').length, peek: wrap?.querySelector('.jam-peek-text')?.textContent, shown: wrap?.classList.contains('scrubbing'), img: Boolean(wrap?.querySelector('.jam-peek-img')?.src) };
  await smoke({ shot: `${shots}/jam-scrub.png` });
  wrap?.show(null);
}
out.first = brief(m);
out.buildPrompt = Jam._test.buildPrompt(m, { n: 2 }, { key: 'claude' }, ThreeLab.director, m.list[0]);
out.firstSecs = Math.round((Date.now() - t0) / 1000);
out.labSketch = ThreeLab.director.capture().sketch;
out.labErrors = ThreeLab.director.report().errors.length;
out.badgeGone = !document.querySelector('.jam-badge');
const c1 = card(m);
out.card = c1 && { rows: c1.querySelectorAll('.jam-row').length, foot: c1.querySelector('.jam-foot')?.textContent, tok: c1.querySelector('.jam-tok')?.textContent };
out.chatText = m.text.slice(0, 200);
out.looks = ThreeLab.peek()?.looks?.().map((l) => (typeof l === 'string' ? l : l.name));
await smoke({ shot: `${shots}/jam-done.png` });

// 2. /jam keep 1 puts round 1 back (here by a click on its frame in the timeline); a row click unfolds it
const r1 = m.list[0].snap.layers.map((L) => L.code).join('\n');
card(m)?.querySelector('.jam-frame[data-n="1"]')?.click();
await until(() => m.best?.n === 1, 8000);
out.keep = m.best;
out.keepMatches = ThreeLab.director.capture().layers.map((L) => L.code).join('\n') === r1;
card(m)?.querySelectorAll('.jam-row')[1]?.click();
await wait(150);
out.unfolded = Boolean(card(m)?.querySelector('.jam-row.open'));

// 3. /jam again: 2 more rounds on the result
await Commands.tryRun('/jam again', host.id);
await until(() => Jam.running(), 5000);
// you open your own sketch mid-jam: the next turn goes back to the jam's sketch
await until(() => m.list.length >= 4 && m.list[3].status !== 'building', 60000);
ThreeLab.director.openSketch(m.start.snap.sketchId);
await jamDone();
out.again = { rounds: m.list.length, status: m.status, best: m.best?.n, onJamSketch: ThreeLab.director.capture().sketchId === m.sketchId};
await wait(900);
{ const own = (await window.hub.kvGet('three-sketches', [])).find((x) => x.id === m.start.snap.sketchId); out.ownSketchUntouched = Boolean(own) && JSON.stringify((own.layers || []).map((L) => L.code)) === JSON.stringify(m.start.snap.layers.map((L) => L.code)); }

// 3b. round 5: switching chats mid-jam. The jam goes on backstage on its own sketch (its chat's scene); the other
// chat's scene stays on screen untouched; coming back shows the jam. Then share the result, and /jam on a song
// remembers that song's idea.
{
  const jamChat = H.activeChat[host.id];
  Native.newChat(host.id);
  await until(() => ThreeLab.scenes.get(ThreeLab.scenes.currentId())?.name === 'New chat', 8000);
  await Native.send(host.id, 'Other chat: violet calm');
  await until(() => !Native.isBusy(H.activeChat[host.id]), 30000);
  const other = H.activeChat[host.id];
  const otherSk = ChatScenes.linkOf(other);
  Native.open(host.id, jamChat);
  await until(() => ThreeLab.scenes.currentId() === m.sketchId, 8000);
  await Commands.tryRun('/jam again 2', host.id);
  await until(() => Jam.running(), 5000);
  await until(() => m.list.at(-1)?.status === 'building', 20000);
  Native.open(host.id, other); // mid-build
  await until(() => ThreeLab.scenes.currentId() === otherSk, 8000);
  const otherCode = ThreeLab.scenes.layersOf(ThreeLab.scenes.get(otherSk)).map((L) => L.code).join('\n');
  const n0 = m.list.length;
  await jamDone();
  const S = ThreeLab.scenes;
  out.midJamSwitch = {
    status: m.status, rounds: m.list.length, since: n0, best: m.best?.n,
    otherOnScreen: S.currentId() === otherSk,
    otherUntouched: S.layersOf(S.get(otherSk)).map((L) => L.code).join('\n') === otherCode,
    jamEditsInJamSketch: m.list.slice(-2).every((R) => R.snap?.sketchId === m.sketchId),
    backstageCalls: ThreeBackstage.log().filter((e) => e.chatId === jamChat).map((e) => e.tool).slice(-6),
    rowStill: Boolean(ChatScenes.thumbOf(jamChat)),
  };
  Native.open(host.id, jamChat);
  await until(() => S.currentId() === m.sketchId, 8000);
  out.midJamSwitch.backOnJam = S.currentId() === m.sketchId;
  out.midJamSwitch.keptInLab = JSON.stringify(S.layersOf(S.get(m.sketchId)).map((L) => L.code)) === JSON.stringify(m.list.find((R) => R.n === m.best?.n)?.snap.layers.map((L) => L.code));
  await wait(1200);
  await smoke({ shot: `${shots}/jam-recap.png` });
  // share: a still to the clipboard and a 10-second clip (saved to the test folder)
  out.share = await Jam.share(m).catch((err) => `error: ${err.message}`);
  out.shareRecording = (await until(() => ThreeLab.director.media?.recording, 5000)) ? 'recording' : 'not seen';
  await wait(11500);
  // the song's idea: a jam kept on a song is remembered; /jam with no idea on that song reuses it
  const song = '/tmp/hearth-test-videos/drop_visual_16x9.mp4';
  if (await window.hub.fs.stat(song).then(() => true, () => false)) {
    const c = await ThreeLab.cmd();
    await c.loadSong(song);
    await until(() => ThreeLab.director.media?.loaded, 8000);
    await Commands.tryRun('/jam 1', host.id);
    const m1 = await until(() => (Jam.latest() !== m ? Jam.latest() : null));
    await jamDone();
    await Commands.tryRun('/jam 1', host.id);
    const m2 = await until(() => (Jam.latest() !== m1 ? Jam.latest() : null));
    await jamDone();
    out.songIdea = { first: m1.idea, song: m1.song, remembered: Jam._test.ideas()[m1.song], second: m2.idea, from: m2.ideaFrom };
    m = m2;
  } else out.songIdea = 'skipped (no test video)';
}

// 4. broken builds: fixed first by the next turn; the jam never ends broken
await Commands.tryRun('/jam 4 jam-break glitch rings', host.id);
const mb = await until(() => (Jam.latest() !== m ? Jam.latest() : null));
await jamDone();
out.broken = brief(mb);
out.brokenLabErrors = ThreeLab.director.report().errors.length;

// 4b. every build broken: two in a row go back to the last good version; the jam ends on a working sketch
await Commands.tryRun('/jam 3 jam-break-hard', host.id);
const mh = await until(() => (Jam.latest() !== mb ? Jam.latest() : null));
await jamDone();
out.brokenHard = brief(mh);
out.brokenHardLabErrors = ThreeLab.director.report().errors.length;

// 5. Astra down: Claude critiques its own builds (said once)
await Commands.tryRun('/jam 2 jam-astra-down', host.id);
const md = await until(() => (Jam.latest() !== mh ? Jam.latest() : null));
await jamDone();
out.astraDown = brief(md);

// 6. Esc stops a running jam; the Lab stays good
activate('tool:three');
await Commands.tryRun('/jam 4 stop me', host.id);
const ms = await until(() => (Jam.latest() !== md ? Jam.latest() : null));
await until(() => ms.list.length >= 1 && ms.list[0].status !== 'building', 60000);
document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
await until(() => !Jam.running(), 60000);
out.stopped = { status: ms.status, rounds: ms.list.length, badgeGone: !document.querySelector('.jam-badge'), labErrors: ThreeLab.director.report().errors.length };

// 7. an Astra director with hub tools builds every other round
H.config.agents.push({ id: 'astradirector', name: 'Astra Director', mode: 'native', engine: 'codex', threeTools: true, hubTools: true, enabled: true });
await saveConfig();
await wait(600);
await Commands.tryRun('/jam 2 chrome rings', host.id);
const ma = await until(() => (Jam.latest() !== ms ? Jam.latest() : null));
await jamDone();
out.astraBuilds = brief(ma);

// 8. commands: /jam is in the menu, no duplicate names
out.cmd = Commands.get('jam') && { area: Commands.get('jam').area, args: Commands.get('jam').args };
out.complete = Commands.get('jam').complete('').map((x) => x.value);
out.dups = Commands.duplicates().length;
out.chipJam = [...document.querySelectorAll('.dd-chip')].map((c) => c.textContent).filter((t) => /Jam/.test(t));
activate('tool:three');
await wait(300);
card(m)?.scrollIntoView({ block: 'center' });
await wait(300);
return JSON.stringify(out, null, 1);
