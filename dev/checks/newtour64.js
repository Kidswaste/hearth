// (round 64, newtour64) ✦ Try what's new on a fresh profile: /try is there before its group loads; each of the 13 paths
// opens its place and rings a visible control (its first step); opening never writes the quest journal; Try it drafts
// the exact command and counts as tried; Skip / Later / Done saved; a round's Try it runs its paths in order; the Try it
// row in What's new ("N of 13 tried") and in the patch notes of rounds 61–63; the one Hints offer, never again after
// "Not now".
//   node dev/smoke.js --script dev/checks/newtour64.js
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, what, n = 200) => { for (let i = 0; i < n; i++) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(60); } throw Error(`timed out: ${what}`); };
const out = { steps: [], paths: {} }; const fails = [];
const step = (name, ok, info) => { out.steps.push(`${ok ? '✓' : '✖'} ${name}${info === undefined ? '' : `: ${typeof info === 'string' ? info : JSON.stringify(info)}`}`); if (!ok) fails.push(name); };
const vis = (n) => Boolean(n && n.isConnected && n.getClientRects().length && getComputedStyle(n).visibility !== 'hidden');
const agent = H.claudeAgent().id;
const card = () => document.querySelector('.tour-card');
const prog = () => store.get('trynew.progress', {});
const tidy = () => { document.querySelectorAll('dialog[open]').forEach((d) => d.close()); try { if (typeof WeekQuest !== 'undefined') WeekQuest.close(); } catch { /* fine */ } try { if (typeof SoundBank !== 'undefined') SoundBank.close(); } catch { /* fine */ } };
const journal = async () => (await window.hub.kvGet('quest-journal', null, { status: true }))?.state;

await wait(1200);
// ---------- 1. the command before the group ----------
step('/try is registered before its group loads', Boolean(Commands.get('try')) && !Lazy.isIn('trynew'));
await Commands.tryRun('/try list', agent);
await until(() => Lazy.isIn('trynew') && window.TryNew, 'the group loads on /try');
step('the group loads on /try (after discover: Tour)', Boolean(typeof Tour !== 'undefined' && window.TryNew && TryNewCore.PATHS.length === 13));
const j0 = await journal();

// ---------- 2. every path: the right place, a visible control ringed ----------
for (const p of TryNewCore.PATHS) {
  tidy();
  const t0 = performance.now();
  TryNew.start(p.id);
  let ok = false; let info = '';
  try {
    await until(() => card()?.dataset.tour === `try-${p.id}` && (document.querySelector('.tour-card:not(.out) .tour-hint') || document.querySelector('.tour-ring:not(.tour-ring-solo)')), `${p.id} painted`, 260);
    const ring = document.querySelector('.tour-ring:not(.tour-ring-solo)');
    const hint = document.querySelector('.tour-card .tour-hint');
    const r = ring?.getBoundingClientRect();
    // the ring sits on a visible element: something real under its middle
    const under = r ? document.elementsFromPoint(r.left + r.width / 2, r.top + r.height / 2).find((n) => !n.classList.contains('tour-ring') && !n.closest('.tour-card')) : null;
    ok = Boolean(ring && !hint && r.width > 4 && r.height > 4 && under);
    info = `${Math.round(performance.now() - t0)} ms · ${H.surfaceIdFor?.(H.activeId) || H.activeId} · ${under ? `${under.tagName.toLowerCase()}.${String(under.className).split(' ')[0]}` : 'nothing'}`;
  } catch (err) { info = err.message; }
  out.paths[p.id] = info;
  step(`${p.icon} ${p.name}: opens its place and rings a visible control`, ok, info);
  if (p.id === 'park') await smoke({ shot: `${window.SMOKE_TMP || '/tmp'}/newtour64-park.png` });
  Tour.stop();
}
step('opening every place wrote nothing to the quest journal', (await journal()) === j0, { before: j0, after: await journal() });
step('just looking marks paths as paused, never tried', Object.values(prog()).every((v) => v.state === 'later') && Object.keys(prog()).length === 13, prog());

// ---------- 3. Try it, Skip, Later, Done ----------
store.set('trynew.progress', {});
tidy();
TryNew.start('tracker');
await until(() => card()?.dataset.tour === 'try-tracker' && card().querySelector('.tour-try'), 'tracker card');
card().querySelector('.tour-try').click();
const ta = await until(() => [...document.querySelectorAll('.surface.active .composer textarea')].find((t) => /\/quest add airpods/.test(t.value)), 'the command in the chat box', 60).catch(() => null);
step('Try it puts the exact command in the chat box (nothing sent)', Boolean(ta), ta?.value);
step('Try it counts as tried', prog().tracker?.state === 'tried', prog().tracker);
if (ta) { ta.value = ''; ta.dispatchEvent(new Event('input', { bubbles: true })); }
Tour.stop();
step('pausing a tried path keeps it tried', prog().tracker?.state === 'tried');

TryNew.start('paris');
await until(() => card()?.dataset.tour === 'try-paris' && card().querySelector('.tour-skip'), 'paris card');
card().querySelector('.tour-skip').click();
step('Skip: saved as skipped, the card goes', prog().paris?.state === 'skipped' && !card(), prog().paris);

TryNew.start('walk');
await until(() => card()?.dataset.tour === 'try-walk' && card().querySelector('.tour-later'), 'walk card');
card().querySelector('.tour-next').click();
await until(() => card()?.dataset.step === '1', 'walk step 2');
card().querySelector('.tour-later').click();
step('Later: saved as paused at its step', prog().walk?.state === 'later' && Tour.progress()['try-walk']?.step === 1, { p: prog().walk, t: Tour.progress()['try-walk'] });
TryNew.start('walk');
await until(() => card()?.dataset.tour === 'try-walk', 'walk again');
step('a paused path picks up at the same step', card().dataset.step === '1');
Tour.stop();

tidy();
TryNew.start('shows');
await until(() => card()?.dataset.tour === 'try-shows' && card().querySelector('.tour-next'), 'shows card');
card().querySelector('.tour-next').click(); // one step: Done ✓
await wait(100);
step('Done ✓ marks it tried', prog().shows?.state === 'tried', prog().shows);
step('"N of 13 tried" counts it', TryNewCore.label(prog()) === '2 of 13 tried', TryNewCore.label(prog()));

// ---------- 4. a round's Try it: its paths in order ----------
tidy();
TryNew.startRound(63);
await until(() => card()?.dataset.tour, 'round 63 starts', 200).catch(() => null);
const first = card()?.dataset.tour;
step('round 63 starts with the paused walk', first === 'try-walk', first);
card()?.querySelector('.tour-skip')?.click();
const second = await until(() => card()?.dataset.tour !== 'try-walk' && card()?.dataset.tour, 'the next path follows', 200).catch(() => null);
step('after Skip the round\'s next path follows by itself', second === 'try-soundbank', second);
card()?.querySelector('.tour-later')?.click();
await wait(700);
step('Later stops the round', !card() && !TryNew.chain, { card: card()?.dataset.tour, chain: TryNew.chain });
tidy();

// ---------- 5. What's new and the patch notes ----------
await Lazy.load('whatsnew');
await WhatsNew.open({ since: 60 });
const row = await until(() => document.querySelector('dialog.wn-dialog[open] .tn-row'), 'the Try it row in What\'s new', 120).catch(() => null);
step('What\'s new: a Try it per round (61–63) and "N of 13 tried"', Boolean(row && row.querySelectorAll('.tn-round').length === 3 && /2 of 13 tried/.test(row.textContent)), row?.textContent);
row?.querySelector('.tn-round[data-round="62"]')?.click();
await until(() => card()?.dataset.tour, 'round 62 from What\'s new', 200).catch(() => null);
step('its Round 62 button closes What\'s new and starts round 62', !document.querySelector('dialog.wn-dialog[open]') && card()?.dataset.tour === 'try-week', card()?.dataset.tour);
Tour.stop(); tidy();
await Lazy.load('patchnotes');
await PatchNotes.open('round-61.md');
const pn = await until(() => document.querySelector('dialog.pn-dialog[open] .tn-pn'), 'patch notes button', 100).catch(() => null);
step('Patch notes of round 61: ✦ Try it · N of 5 tried', Boolean(pn && /Try it · 2 of 5 tried/.test(pn.textContent)), pn?.textContent);
const pick = document.querySelector('dialog.pn-dialog .pn-pick');
if (pick && [...pick.options].some((o) => o.value === 'round-60.md')) { pick.value = 'round-60.md'; pick.dispatchEvent(new Event('change')); await wait(400); step('…and nothing for a round without paths', !document.querySelector('dialog.pn-dialog .tn-pn')); }
tidy();

// ---------- 6. the one offer ----------
Hints.config({ gap: 0, start: 0, startNotice: 0, quiet: 0 });
store.set('trynew.test', 1);
const offered = TryNew.offer();
const oc = await until(() => document.querySelector('.tn-card'), 'the offer card', 120).catch(() => null);
step('one Hints offer: the card shows', Boolean(oc && vis(oc)));
if (oc) await smoke({ shot: `${window.SMOKE_TMP || '/tmp'}/newtour64-offer.png` });
oc?.querySelector('.tn-no')?.click();
await offered;
await wait(250);
step('Not now: gone, remembered forever', !document.querySelector('.tn-card') && store.get('trynew.offer') === 'off');
step('no nag: offering again does nothing', (await TryNew.offer()) === false && !document.querySelector('.tn-card'));
Hints.config(null);

// ---------- 7. a card on screen, for the eye (the Sound bank from an earlier path goes: it would cover the ✦ Preset window) ----------
await Lazy.load('creative'); await SoundBank.open();
TryNew.start('preset');
await until(() => card()?.dataset.tour === 'try-preset' && document.querySelector('.tour-ring:not(.tour-ring-solo)'), 'preset card').catch(() => null);
step('another path\'s Sound bank closes: the ✦ Preset window is ringed', Boolean(document.querySelector('.tour-ring:not(.tour-ring-solo)')) && !document.querySelector('.tour-card .tour-hint') && !document.querySelector('.sb-win:not([hidden])'));
await smoke({ shot: `${window.SMOKE_TMP || '/tmp'}/newtour64-preset.png` });
Tour.stop(); tidy();
step('the journal is still untouched at the end', (await journal()) === j0);

out.pass = fails.length === 0;
out.fails = fails;
return JSON.stringify(out, null, 1);
