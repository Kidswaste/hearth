// (round 67, invite67) 👋 Bring someone: the invite template builder (invite-core.js) in both languages and all three
// tones, with missing fields (no lineup, no venue, no date, no ticket, date only, sold out), Paris time whatever the
// computer's zone (tonight / tomorrow / a 1 am start / summer and winter time), the easy out always there, the
// "Open in…" links (they only fill the text), the ✨ Rewrite tidy-up, and the social quests an invite can be logged on
// (Codex's own QuestCore / QuestParis rules: only a next step about inviting, never a paused or unrelated quest).
//   node dev/invite67-test.js
const assert = require('node:assert/strict');
const IC = require('../invite-core');
const C = require('../tools/quest-core');
const P = require('../tools/quest-paris');
let checks = 0;
const test = (name, fn) => { fn(); checks++; console.log('✓ ' + name); };
// Paris wall-clock → epoch ms (CET +1 in winter, CEST +2 in summer)
const paris = (y, m, d, h = 0, mi = 0) => { const guess = Date.UTC(y, m - 1, d, h, mi); return guess - IC.offset(guess - 2 * 3600e3) * 60e3; };
const NOW = paris(2026, 10, 26, 12); // Monday 26 October 2026, noon (winter time since the 25th)
const show = (o = {}) => ({ key: 'sx', title: 'Machine Club', start: paris(2026, 10, 30, 23, 30), venue: { name: 'La Machine du Moulin Rouge', address: '90 Bd de Clichy' }, lineup: ['Ben UFO', 'Call Super'], tickets: [{ platform: 'shotgun', url: 'https://shotgun.live/en/events/machine-club' }], platforms: ['shotgun'], ...o });

// ---------- every tone × language ----------
for (const lang of IC.LANGS) for (const tone of IC.TONES) {
  test(`${lang} · ${tone}: show name, date, venue, ticket link, easy out`, () => {
    const t = IC.build({ show: show(), tone, lang, now: NOW });
    assert.ok(t.includes('Machine Club'), t);
    assert.ok(t.includes(lang === 'fr' ? 'Ben UFO et Call Super' : 'Ben UFO & Call Super'), t);
    assert.ok(t.includes('La Machine du Moulin Rouge'), t);
    assert.ok(t.includes(lang === 'fr' ? 'vendredi 30 octobre à 23h30' : 'on Friday 30 Oct at 11:30pm'), t);
    assert.ok(/\nhttps:|: https:\/\/shotgun\.live\/en\/events\/machine-club(\n|$)/.test(t), t); // the link alone at the end of its line
    assert.ok(IC.hasOut(t, lang), t);
    if (lang === 'en') assert.ok(/no worries if not/i.test(t), t); else assert.ok(/aucun souci/i.test(t), t);
    assert.ok(t.length < 400, t.length);
    assert.equal(t.split('\n').length, 3);
  });
}
test('the three tones read differently (same show, same language)', () => {
  for (const lang of IC.LANGS) { const set = new Set(IC.TONES.map((tone) => IC.build({ show: show(), tone, lang, now: NOW }))); assert.equal(set.size, 3); }
});
test('low-pressure says so up front; hyped has energy', () => {
  assert.match(IC.build({ show: show(), tone: 'low', lang: 'en', now: NOW }), /^Just an idea, no pressure/);
  assert.match(IC.build({ show: show(), tone: 'low', lang: 'fr', now: NOW }), /^Petite idée, sans pression/);
  assert.match(IC.build({ show: show(), tone: 'hyped', lang: 'en', now: NOW }), /🔥/);
});
test('unknown tone / language fall back to casual / French (the default)', () => {
  assert.equal(IC.build({ show: show(), tone: 'pushy', lang: 'de', now: NOW }), IC.build({ show: show(), tone: 'casual', lang: 'fr', now: NOW }));
  assert.equal(IC.build({ show: show(), now: NOW }), IC.build({ show: show(), tone: 'casual', lang: 'fr', now: NOW }));
});

// ---------- missing fields ----------
test('no lineup: the title alone', () => {
  const t = IC.build({ show: show({ lineup: [] }), lang: 'en', now: NOW });
  assert.match(t, /see Machine Club at La Machine/); assert.ok(!/ with /.test(t.split('\n')[0]));
});
test('a title that already names the artist is not repeated', () => {
  const t = IC.build({ show: show({ title: 'Arlo Parks', lineup: ['Arlo Parks'] }), lang: 'en', now: NOW });
  assert.match(t, /see Arlo Parks at La Machine/); assert.ok(!/Arlo Parks with Arlo Parks/.test(t));
});
test('three or more artists: two names "and more"', () => {
  assert.match(IC.build({ show: show({ lineup: ['A1', 'B2', 'C3'] }), lang: 'en', now: NOW }), /with A1 & B2 and more/);
  assert.match(IC.build({ show: show({ lineup: ['A1', 'B2', 'C3'] }), lang: 'fr', now: NOW }), /avec A1 et B2 et d’autres/);
});
test('no title and no lineup: "a show" / "un concert"', () => {
  assert.match(IC.build({ show: show({ title: '', lineup: [] }), lang: 'en', now: NOW }), /going to see a show at/);
  assert.match(IC.build({ show: show({ title: '', lineup: [] }), lang: 'fr', now: NOW }), /voir un concert à/);
});
test('no venue: no "at"', () => {
  for (const lang of IC.LANGS) { const t = IC.build({ show: show({ venue: {} }), lang, now: NOW }); assert.ok(!/ (at|à) (on |vendredi)/.test(t), t); assert.ok(!t.includes('undefined'), t); assert.ok(IC.hasOut(t, lang)); }
  assert.match(IC.build({ show: show({ venue: null }), lang: 'en', now: NOW }), /Call Super on Friday 30 Oct/);
});
test('no date: the sentence still reads, no "Invalid Date" / NaN', () => {
  for (const lang of IC.LANGS) for (const start of [undefined, null, NaN, 0, 'x']) {
    const t = IC.build({ show: show({ start }), lang, now: NOW }); assert.ok(!/NaN|Invalid|undefined/.test(t), t); assert.ok(IC.hasOut(t, lang));
  }
  assert.match(IC.build({ show: show({ start: undefined }), lang: 'en', now: NOW }), /Moulin Rouge\. Want to come\?/);
});
test('no ticket link: no ticket line (two lines), still the easy out', () => {
  for (const lang of IC.LANGS) for (const tone of IC.TONES) {
    const t = IC.build({ show: show({ tickets: [] }), tone, lang, now: NOW }); assert.equal(t.split('\n').length, 2, t); assert.ok(!/https?:/.test(t)); assert.ok(IC.hasOut(t, lang));
  }
  assert.ok(!/http/.test(IC.build({ show: show({ tickets: [{ platform: 'dice', url: 'javascript:alert(1)' }] }), lang: 'en', now: NOW })), 'only https links');
  assert.ok(!/http/.test(IC.build({ show: show({ tickets: undefined }), lang: 'en', now: NOW })));
});
test('sold out: says so (resale), with or without a link', () => {
  assert.match(IC.build({ show: show({ soldOut: true }), lang: 'en', now: NOW }), /sold out, maybe resale: https:/);
  assert.match(IC.build({ show: show({ soldOut: true }), lang: 'fr', now: NOW }), /complet, il reste peut-être la revente : https:/);
  assert.match(IC.build({ show: show({ soldOut: true, tickets: [] }), lang: 'en', now: NOW }), /sold out, so it would be resale/);
});
test('an empty show object or none at all never throws', () => {
  for (const lang of IC.LANGS) { assert.ok(IC.hasOut(IC.build({ show: {}, lang }), lang)); assert.ok(IC.hasOut(IC.build({ lang }), lang)); assert.ok(IC.hasOut(IC.build(), 'fr')); }
});
test('date only: the day, no time', () => {
  assert.match(IC.build({ show: show({ dateOnly: true, start: paris(2026, 10, 31, 0) }), lang: 'en', now: NOW }), /on Saturday 31 Oct\. Want/);
  assert.match(IC.build({ show: show({ dateOnly: true, start: paris(2026, 10, 31, 0) }), lang: 'fr', now: NOW }), /samedi 31 octobre\. Ça te dit/);
});

// ---------- when, in Paris time ----------
test('tonight / tomorrow (evening and afternoon)', () => {
  assert.equal(IC.when({ start: paris(2026, 10, 26, 20) }, 'en', NOW), 'tonight at 8pm');
  assert.equal(IC.when({ start: paris(2026, 10, 26, 20) }, 'fr', NOW), 'ce soir à 20h');
  assert.equal(IC.when({ start: paris(2026, 10, 26, 15) }, 'en', NOW), 'today at 3pm');
  assert.equal(IC.when({ start: paris(2026, 10, 27, 19, 30) }, 'en', NOW), 'tomorrow night at 7:30pm');
  assert.equal(IC.when({ start: paris(2026, 10, 27, 19, 30) }, 'fr', NOW), 'demain soir à 19h30');
  assert.equal(IC.when({ start: paris(2026, 10, 27, 14) }, 'fr', NOW), 'demain à 14h');
});
test('a 1 am start belongs to the night before', () => {
  assert.equal(IC.when({ start: paris(2026, 10, 31, 1) }, 'en', NOW), 'on Friday night, 30 Oct (1am)');
  assert.equal(IC.when({ start: paris(2026, 10, 31, 1) }, 'fr', NOW), 'dans la nuit de vendredi 30 octobre (1h)');
  assert.equal(IC.when({ start: paris(2026, 10, 27, 0, 30) }, 'en', NOW), 'tonight (12:30am)');
  assert.equal(IC.when({ start: paris(2026, 10, 28, 2) }, 'fr', NOW), 'demain dans la nuit (2h)');
});
test('Paris time whatever the zone: summer (UTC+2) and winter (UTC+1)', () => {
  assert.equal(IC.when({ start: Date.UTC(2026, 6, 10, 18) }, 'en', Date.UTC(2026, 6, 1)), 'on Friday 10 Jul at 8pm'); // 18:00 UTC in July = 20:00 Paris
  assert.equal(IC.when({ start: Date.UTC(2026, 11, 11, 19) }, 'en', Date.UTC(2026, 11, 1)), 'on Friday 11 Dec at 8pm'); // 19:00 UTC in December = 20:00 Paris
  assert.equal(IC.when({ start: Date.UTC(2026, 9, 25, 0, 30) }, 'en', Date.UTC(2026, 9, 1)), 'on Saturday night, 24 Oct (2:30am)'); // the night summer time ends
});
test('summary: one line with the show, venue and when', () => {
  assert.equal(IC.summary(show(), 'en', NOW), 'Machine Club with Ben UFO & Call Super · La Machine du Moulin Rouge · Friday 30 Oct at 11:30pm');
});

// ---------- Open in… (never sends) ----------
test('links: WhatsApp share link with the text, Messages only on a Mac, Instagram inbox (text copied by the window)', () => {
  const text = IC.build({ show: show(), lang: 'fr', now: NOW }), mac = IC.links(text, 'mac'), win = IC.links(text, 'win');
  assert.ok(mac.whatsapp.startsWith('https://wa.me/?text=')); assert.equal(decodeURIComponent(mac.whatsapp.split('text=')[1]), text);
  assert.ok(mac.messages.startsWith('sms:&body=')); assert.equal(decodeURIComponent(mac.messages.split('body=')[1]), text);
  assert.equal(win.messages, null);
  assert.equal(mac.instagram, 'https://www.instagram.com/direct/inbox/');
  assert.ok(!/send|phone=/.test(mac.whatsapp.split('?')[0] + mac.whatsapp.split('text=')[0]), 'no recipient, no auto-send');
});

// ---------- ✨ Rewrite with Claude (only on click) ----------
test('rewrite prompt: language, tone, keep the facts and the easy out, short', () => {
  const t = IC.build({ show: show(), tone: 'hyped', lang: 'en', now: NOW }), p = IC.rewritePrompt(t, 'hyped', 'en');
  assert.match(p, /in English, excited and fun, under 60 words/); assert.match(p, /no worries if not/); assert.ok(p.endsWith(t)); assert.ok(p.length < 900);
  assert.match(IC.rewritePrompt(t, 'low', 'fr'), /French \(tutoiement\), gentle and low-pressure.*\n.*aucun souci/);
});
test('rewrite tidy: keeps the ticket link and the easy out even if the AI dropped them; strips quotes / fences', () => {
  const orig = IC.build({ show: show(), lang: 'en', now: NOW });
  const t = IC.tidyRewrite('"Hey, Machine Club Friday with Ben UFO, come along?"', orig, 'en');
  assert.ok(t.startsWith('Hey, Machine Club')); assert.ok(t.includes('Tickets: https://shotgun.live/en/events/machine-club')); assert.ok(IC.hasOut(t, 'en'));
  const f = IC.tidyRewrite('```\nSalut ! Machine Club vendredi ? Les billets : https://shotgun.live/en/events/machine-club — aucun souci sinon\n```', IC.build({ show: show(), lang: 'fr', now: NOW }), 'fr');
  assert.ok(!/```/.test(f)); assert.equal((f.match(/https:/g) || []).length, 1); assert.ok(!/\nAucun souci si t’es pas dispo/.test(f), 'already had an easy out');
  assert.equal(IC.tidyRewrite('', orig, 'en'), orig, 'an empty answer keeps the draft');
});

// ---------- social quests an invite can be logged on (Codex's rules) ----------
const fresh = () => C.upgrade(C.validate(C.initial()));
test('a fresh journal: nothing to log on (no invite step open)', () => { assert.deepEqual(IC.matchQuests(C, fresh(), show()), []); });
test('"Before the show" with a friend: its first step (Make the invite easy) matches and ranks first', () => {
  const s = fresh(); const friend = s.world.friends[0]?.id;
  assert.ok(friend, 'the journal has a friend to start from');
  P.startSocial(s, 'show-warmup', friend, 'pp-point-ephemere');
  P.startSocial(s, 'check-in', friend, 'place-canal');
  const m = IC.matchQuests(C, s, show());
  assert.equal(m.length, 2, JSON.stringify(m));
  assert.match(m[0].quest, /^Before the show/); assert.equal(m[0].step, 'Make the invite easy'); assert.ok(m[0].score > m[1].score);
  assert.ok(C.available(s, m[0].qid));
});
test('a world plan\'s "Open the invitation" matches once its first step is done; a paused one never does', () => {
  const s = fresh(); const plan = C.saveWorldPlan(s, { kind: 'outing', title: 'Gig night', district: C.districts[0].id, destination: 'Paris' });
  const c = C.planCampaign(s, plan.id);
  assert.equal(IC.matchQuests(C, s).filter((x) => x.cid === c.id).length, 0, 'the plan step is first');
  const studio = s.studio; s.studio = false; C.complete(s, c.quests[0].id, { note: 'plan' }); s.studio = studio; // (the plan step done the quick way; the Studio's own rule asks a review)
  assert.equal(IC.matchQuests(C, s).find((x) => x.cid === c.id)?.step, 'Open the invitation');
  c.paused = true; assert.equal(IC.matchQuests(C, s).filter((x) => x.cid === c.id).length, 0);
});
test('the drink quest (its steps are about talking, not inviting) is never matched', () => {
  const s = fresh(); P.startPersonal(s, 'drink');
  assert.ok(s.campaigns.some((c) => c.id === 'c-pq-drink'));
  assert.equal(IC.matchQuests(C, s).length, 0);
});
test('submitting the proof note on the matched step passes Codex\'s checks (and needs no AI, no reply)', () => {
  const s = fresh(); P.startSocial(s, 'show-warmup', s.world.friends[0].id, 'pp-point-ephemere');
  const m = IC.matchQuests(C, s, show())[0], text = IC.build({ show: show(), lang: 'en', now: NOW });
  const note = IC.proofNote({ show: show(), tone: 'casual', lang: 'en', text, at: NOW });
  assert.match(note, /^# Invited someone\nShow: Machine Club with Ben UFO & Call Super · La Machine du Moulin Rouge/);
  assert.match(note, /Who it went to and their answer are not recorded/); assert.ok(note.includes('> No worries if not!'));
  const proof = { type: 'file', title: 'Invited someone: Machine Club', path: '/tmp/invite.md', kind: 'text/markdown', bytes: note.length, fingerprint: 'a'.repeat(64), images: [], excerpt: note, analysis: '', coverage: IC.PROOF_COVERAGE };
  const item = C.submit(s, m.qid, proof, 'Invited someone');
  assert.equal(item.review, null, 'saved as proof, no review, no XP yet'); assert.equal(C.done(s, m.qid), false);
  C.validate(s);
});

console.log(`\n${checks} checks passed (invite67)`);
