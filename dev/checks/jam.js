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
await smoke({ shot: `${shots}/jam-running.png` });
await jamDone();
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

// 2. /jam keep 1 puts round 1 back; a row click unfolds it
const r1 = m.list[0].snap.layers.map((L) => L.code).join('\n');
out.keep = await Jam.keep(1);
out.keepMatches = ThreeLab.director.capture().layers.map((L) => L.code).join('\n') === r1;
card(m)?.querySelectorAll('.jam-row')[1]?.click();
await wait(150);
out.unfolded = Boolean(card(m)?.querySelector('.jam-row.open'));

// 3. /jam again: 2 more rounds on the result
await Commands.tryRun('/jam again', host.id);
await until(() => Jam.running(), 5000);
await jamDone();
out.again = { rounds: m.list.length, status: m.status, best: m.best?.n };

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
