// (round 67, invite67) 👋 Bring someone in the real app, on a throwaway profile, with showsync61's saved sample shows
// (dev/fixtures/showsync through shows:test: the list is read once and cached by the main process; no network) and the
// computer marked offline for the weekend plan. By clicking only: the show card's "👋 Bring someone" (from the ✦ list
// and from a venue pin on the Paris map), the weekend plan's night-out slot. The card: the invite written from the
// template (no AI call) with the show's name, venue, ticket link and an easy out; tone and language by click; Copy;
// Open in WhatsApp / Instagram only hand a link to the OS (no Messages outside a Mac), nothing is sent; ✨ Rewrite asks
// only on click (a stand-in answer here) and keeps the link and the easy out; "I sent it" saves the invite as the
// owner's own proof on the "Before the show" social quest's invite step (no review, no XP, Codex's journal valid) and
// nothing was logged before that click; /shows invite opens the same card.
//   node dev/smoke.js --script dev/checks/invite67.js
const atlasImageSource = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
Object.defineProperty(HTMLImageElement.prototype, 'src', { ...atlasImageSource, set(value) { if (String(value).startsWith('https://tile.openstreetmap.org/')) { this.dataset.tileFixture = String(value); queueMicrotask(() => this.dispatchEvent(new Event('error'))); return; } atlasImageSource.set.call(this, value); } });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, what, n = 160) => { for (let i = 0; i < n; i++) { let v; try { v = await fn(); } catch { v = null; } if (v) return v; await wait(60); } throw Error(`timed out: ${what}`); };
const out = { steps: [] }; const errors = [];
const step = (name, ok, info) => { out.steps.push(`${ok ? '✓' : '✖'} ${name}${info === undefined ? '' : `: ${typeof info === 'string' ? info.slice(0, 300) : JSON.stringify(info).slice(0, 300)}`}`); if (!ok) errors.push(name); };
const said = [];
const run = async (line) => { said.length = 0; await Commands.tryRun(line, H.claudeAgent().id, null, { say: (t) => said.push(String(t)), note: () => {}, error: (t) => said.push('ERROR ' + t) }); await until(() => said.some((t) => !/^Reading/.test(t)), line, 250); return said.filter((t) => !/^Reading/.test(t)).join('\n'); };
const top = () => [...document.querySelectorAll('dialog.qj-dialog[open]')].at(-1) || null;
const btnIn = (root, re) => [...(root?.querySelectorAll('button') || [])].find((b) => re.test((b.querySelector('.qj-action-text')?.textContent ?? b.textContent).trim()));
const iv = () => document.querySelector('dialog.iv-dialog[open]');
const ivBtn = (re) => btnIn(iv(), re);
const text = () => iv()?.querySelector('.iv-text')?.value || '';
const vis = (n) => Boolean(n && !n.hidden && n.getClientRects().length && getComputedStyle(n).visibility !== 'hidden');
const shot = (n) => smoke({ shot: `${window.SMOKE_SAVES}/invite67-${n}.png` });
const disk = async () => (await window.hub.kvGet('quest-journal')) || {};
// every AI call counted: the template needs none, the rewrite only on its click
let asks = 0; const realAsk = window.hub.askOnce; window.hub.askOnce = (...a) => { asks++; return realAsk(...a); };

try {
  const t = await window.hub.shows.test({ dev: window.SMOKE_DEV }); if (!t?.ok) throw Error('shows:test unavailable: ' + JSON.stringify(t));
  await run('/shows'); // reads the saved sample responses once; the main process caches the list (later reads use the cache)

  // ---------- a journal with one social quest waiting for an invite ("Before the show", with a friend) ----------
  await Lazy.load('questcore'); await Lazy.load('questjournal');
  const C = QuestCore, seed = C.upgrade(C.initial());
  QuestParis.startSocial(seed, 'show-warmup', seed.world.friends[0].id, 'pp-point-ephemere');
  await window.hub.kvSet('quest-journal', C.validate(seed));
  await until(() => typeof QuestHud !== 'undefined', 'the tracker'); await QuestHud.refresh();
  const warmCamp = (await disk()).campaigns.find((c) => c.socialMission === 'show-warmup');
  const inviteQ = warmCamp.quests[0].id;
  step('fixture: "Before the show" is open on its invite step', /invite/i.test(warmCamp.quests[0].title), warmCamp.quests[0].title);
  step('the invite card is not loaded before a click', !Lazy.isIn('invite') && typeof Invite === 'undefined');

  // ---------- 1. the ✦ Shows list → a show's card → 👋 Bring someone ----------
  activate('tool:quests');
  await until(() => QuestJournal.ready?.(), 'journal ready');
  QuestJournal.navigate('world');
  (await until(() => document.querySelector('[data-focus="map-shows"]'), 'shows icon')).click();
  const row = await until(() => [...document.querySelectorAll('dialog.qj-dialog[open] .ss-row')].find((r) => /Ben UFO/.test(r.textContent)), 'Ben UFO row');
  row.click();
  const bring = await until(() => btnIn(top(), /^👋 Bring someone$/), 'the button on the show card');
  step('show card: a labelled "👋 Bring someone" button beside Make it a quest', vis(bring) && !!btnIn(top(), /Make it a quest/), [...top().querySelectorAll('.qj-actions button')].map((b) => b.textContent.trim()));
  bring.click();
  await until(() => iv(), 'the invite card');
  const ufo = ShowSync.upcoming().find((s) => /Ben UFO/.test(s.title)), url = ufo.tickets.find((x) => x.url).url;
  step('the card opens above the show card, loaded on that click', Lazy.isIn('invite') && vis(iv()) && !!top(), iv().querySelector('.iv-sub')?.textContent);
  step('default: French, casual — the show, its venue, the date, the ticket link, an easy out', text().startsWith('Hey ! Je vais voir') && text().includes(ufo.venue.name) && text().includes(url) && /aucun souci/i.test(text()) && text().includes(InviteCore.when(ufo, 'fr')), text());
  step('labelled tone and language buttons', [...iv().querySelectorAll('.iv-tone .iv-pill')].map((b) => b.textContent).join('|') === 'Casual|Hyped|Low-pressure' && [...iv().querySelectorAll('.iv-lang .iv-pill')].map((b) => b.textContent).join('|') === 'Français|English');
  step('no AI call to write it', asks === 0, asks);
  await shot('card');

  // tone / language by click
  ivBtn(/^Hyped$/).click(); await wait(40);
  step('Hyped', /🔥/.test(text()) && /aucun souci/i.test(text()) && ivBtn(/^Hyped$/).getAttribute('aria-pressed') === 'true', text());
  ivBtn(/^English$/).click(); await wait(40);
  step('English (the tone kept)', /^So excited:/.test(text()) && /no worries if not/i.test(text()), text());
  ivBtn(/^Low-pressure$/).click(); await wait(40);
  step('Low-pressure', /^Just an idea, no pressure/.test(text()) && /no worries if not/i.test(text()) && text().includes(url), text());

  // Copy · Open in… (only opens; never sends)
  Invite._test.noOpen = true;
  ivBtn(/^Copy$/).click();
  await until(() => /Copied|Couldn’t copy/.test(iv().querySelector('.iv-status').textContent), 'copy status');
  let clip = ''; try { clip = await navigator.clipboard.readText(); } catch { clip = '(unreadable)'; }
  step('Copy: the text on the clipboard, "nothing is sent"', /Copied/.test(iv().querySelector('.iv-status').textContent) && (clip === text() || clip === '(unreadable)'), { status: iv().querySelector('.iv-status').textContent, same: clip === text() });
  ivBtn(/^WhatsApp$/).click(); await until(() => Invite._test.opened.length === 1, 'whatsapp link');
  const wa = Invite._test.opened[0];
  step('Open in WhatsApp: its share link with the text filled in, no recipient', wa.startsWith('https://wa.me/?text=') && decodeURIComponent(wa.split('text=')[1]) === text(), wa.slice(0, 80));
  step('Messages only on a Mac', window.hub.native.os === 'mac' ? !!ivBtn(/^Messages$/) : !ivBtn(/^Messages$/), window.hub.native.os);
  ivBtn(/^Instagram$/).click(); await until(() => Invite._test.opened.length === 2, 'instagram link');
  step('Open in Instagram: text copied, the inbox opens to paste it', Invite._test.opened[1] === 'https://www.instagram.com/direct/inbox/' && /paste it/.test(iv().querySelector('.iv-status').textContent));
  step('still no AI call; nothing logged yet', asks === 0 && !((await disk()).submissions?.[inviteQ]?.length), { asks });

  // ✨ Rewrite with Claude: only on click (a stand-in answer)
  let asked = 0; Invite._test.ask = async (prompt) => { asked++; out.prompt = prompt.slice(0, 120); return { ok: true, text: '"Hey! Ben UFO at La Machine, fancy coming along?"', usage: { input: 120, output: 30 } }; };
  step('the rewrite never ran by itself', asked === 0);
  ivBtn(/Rewrite with Claude/).click();
  await until(() => /Reworded by Claude/.test(iv().querySelector('.iv-status').textContent), 'reworded');
  step('✨ Rewrite: one ask on click; the answer keeps the ticket link and the easy out', asked === 1 && text().startsWith('Hey! Ben UFO at La Machine') && text().includes(url) && /no worries if not/i.test(text()), text());
  step('…its prompt names the language and tone', /in English, gentle and low-pressure/.test(out.prompt), out.prompt);

  // I sent it → the social quest's invite step
  const hint = await until(() => iv().querySelector('.iv-sent .iv-hint'), 'the quest hint');
  step('"I sent it" says which quest it logs on', /Before the show/.test(hint.textContent), hint.textContent);
  await shot('sent-row');
  ivBtn(/I sent it/).click();
  await until(async () => (await disk()).submissions?.[inviteQ]?.length === 1, 'the proof on the invite step');
  const d = await disk(), sub = d.submissions[inviteQ][0];
  step('saved as the owner\'s own proof on "Make the invite easy": no review, step not done (no XP yet)', sub.intent === 'Invited someone' && sub.review === null && !C.done(d, inviteQ) && /^Invited someone: /.test(sub.proof.title), { intent: sub.intent, title: sub.proof.title });
  step('the note holds the invite, never who it went to', /> Hey! Ben UFO/.test(sub.proof.excerpt) && /Who it went to and their answer are not recorded/.test(sub.proof.excerpt));
  step('Codex\'s journal rules still pass', (() => { try { C.validate(d); return true; } catch (e) { return e.message; } })() === true);
  await until(() => iv().querySelector('.iv-done'), 'logged line');
  step('the card says it\'s logged', /Logged “Invited someone” on Before the show/.test(iv().querySelector('.iv-done').textContent));
  iv().querySelector('.iv-x').click(); await wait(80);
  step('× closes the card; the show card is still there', !iv() && !!top());
  document.querySelectorAll('dialog.qj-dialog[open]').forEach((x) => x.close()); await wait(150);

  // ---------- 2. a venue pin on the map → its next show → 👋 Bring someone ----------
  const pin = await until(() => [...document.querySelectorAll('.qj-atlas-pin[data-place^="show-venue-"]')].find((p) => /Machine/i.test(p.getAttribute('aria-label') || p.textContent)), 'Machine pin');
  pin.click();
  const pinBring = await until(() => btnIn(top()?.querySelector('.ss-next'), /^👋 Bring someone$/), 'the button in the venue card');
  step('venue pin: the next show carries "👋 Bring someone"', vis(pinBring));
  pinBring.click(); await until(() => iv(), 'card from the pin');
  step('…opening the card for that show (remembered: English, low-pressure)', /^Just an idea, no pressure/.test(text()) && Invite.state().from === 'card');
  iv().close(); document.querySelectorAll('dialog.qj-dialog[open]').forEach((x) => x.close()); await wait(150);

  // ---------- 3. the weekend plan's night-out slot (offline, the saved shows) ----------
  const onLine = Object.getOwnPropertyDescriptor(Navigator.prototype, 'onLine');
  Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false });
  const d0 = new Date(); d0.setHours(18, 0, 0, 0); while (d0.getDay() !== 4 || d0.getTime() < Date.now() - 6 * 3600e3) d0.setDate(d0.getDate() + 1);
  const THU = d0.getTime(); WeekendPlanCore.setClock(() => THU);
  await Lazy.load('weekendplan');
  const fri = new Date(THU + 24 * 3600e3); fri.setHours(20, 0, 0, 0);
  WeekendPlan._test.shows = [{ ...ufo, key: 'iv-fri', start: fri.getTime(), end: fri.getTime() + 4 * 3600e3, doors: null }];
  WeekendPlan._test.projects = []; WeekendPlan._test.takes = [];
  activate(H.claudeAgent().id); await wait(150);
  QuestHud.close(); await QuestHud.open();
  (await until(() => [...document.querySelectorAll('.qh-panel .wp-hud')].find(vis), 'Plan my weekend')).click();
  const wpBring = await until(() => document.querySelector('.wp-panel .wp-slot[data-slot="night"] .wp-bring'), 'the night slot\'s button');
  step('weekend plan: the night-out slot has "👋 Bring someone"', vis(wpBring) && wpBring.textContent === '👋 Bring someone' && /Offline/.test(document.querySelector('.wp-status')?.textContent || ''));
  await shot('weekend');
  wpBring.click(); await until(() => iv(), 'card from the weekend plan');
  step('…the card for that show, the weekend card stays open under it', /Ben UFO/.test(text()) && !!document.querySelector('.wp-panel') && Invite.state().from === 'weekend');
  iv().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); iv()?.close(); await wait(100);
  step('closing the invite card leaves the weekend card', !iv() && !!document.querySelector('.wp-panel'));
  WeekendPlan.close(); QuestHud.close();
  if (onLine) delete navigator.onLine; WeekendPlanCore.setClock(null);

  // ---------- 4. chat (secondary) ----------
  const reply = await run('/shows invite ben ufo');
  step('/shows invite <show> opens the same card', !!iv() && /invite card for .*Ben UFO/.test(reply), reply);
  iv()?.close();
  step('no real AI call during the whole check', asks === 0, asks);
} catch (err) {
  step('no exception', false, err.stack || err.message);
}
window.hub.askOnce = realAsk;
return JSON.stringify({ pass: !errors.length, errors, ...out }, null, 1);
