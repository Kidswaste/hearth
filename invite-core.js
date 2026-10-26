// (round 67, invite67) 👋 Bring someone, the thinking with no DOM (node-tested: dev/invite67-test.js).
// A show (showsync61's shape: title, start, doors, dateOnly, venue { name }, lineup, tickets [{ platform, url }], soldOut)
// → a short invite in French or English, in one of three tones, written here from templates: no AI, no tokens, nothing
// fetched or sent. Every invite keeps an easy way to say no ("no worries if not" / "aucun souci"). Also: the links
// that only OPEN a messaging app with the text filled in (never send), the prompt for the optional "✨ Rewrite with
// Claude" (only on click) and its tidy-up, the social quests an invite can be logged on (Codex's QuestCore rules: the
// quest's next open step must be about inviting), and the owner's own proof note for that step.
(function (root, make) { if (typeof module === 'object' && module.exports) module.exports = make(); else root.InviteCore = make(); })(typeof self !== 'undefined' ? self : this, () => {
  const TONES = ['casual', 'hyped', 'low'];
  const TONE_NAMES = { casual: 'Casual', hyped: 'Hyped', low: 'Low-pressure' };
  const LANGS = ['fr', 'en'];
  const LANG_NAMES = { fr: 'Français', en: 'English' };
  const tone = (t) => (TONES.includes(t) ? t : 'casual');
  const lang = (l) => (LANGS.includes(l) ? l : 'fr');
  const str = (x, n = 200) => (typeof x === 'string' ? x.replace(/\s+/g, ' ').trim().slice(0, n) : '');
  const fold = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

  // ---------- Paris time, whatever the computer's zone (EU rule: summer time from the last Sunday of March to the last
  // Sunday of October, both at 01:00 UTC) ----------
  const lastSunday = (y, m) => { const d = new Date(Date.UTC(y, m + 1, 0)); return Date.UTC(y, m, d.getUTCDate() - d.getUTCDay(), 1); };
  const offset = (ms) => { const y = new Date(ms).getUTCFullYear(); return ms >= lastSunday(y, 2) && ms < lastSunday(y, 9) ? 120 : 60; };
  function parts(ms) { const d = new Date(ms + offset(ms) * 60e3); return { y: d.getUTCFullYear(), m: d.getUTCMonth(), d: d.getUTCDate(), h: d.getUTCHours(), mi: d.getUTCMinutes(), dow: d.getUTCDay() }; }
  const dayNum = (p) => Math.round(Date.UTC(p.y, p.m, p.d) / 864e5);

  const W = {
    fr: { days: ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'], months: ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'] },
    en: { days: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'], months: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] }
  };
  const timeFr = (p) => `${p.h}h${p.mi ? String(p.mi).padStart(2, '0') : ''}`;
  const timeEn = (p) => { const h = p.h % 12 || 12; return `${h}${p.mi ? `:${String(p.mi).padStart(2, '0')}` : ''}${p.h < 12 ? 'am' : 'pm'}`; };
  // when, as a phrase that fits after the venue: "vendredi 30 octobre à 20h" · "on Friday 30 Oct at 8pm" · "ce soir à 20h"
  // · "tomorrow night at 11pm"; a start before 06:00 belongs to the night before ("Friday night (1am)"); no start → ''
  function when(show, l, now = Date.now()) {
    l = lang(l);
    const start = Number(show?.start);
    if (!Number.isFinite(start) || start <= 0) return '';
    const p = parts(start), today = dayNum(parts(now));
    const late = !show.dateOnly && p.h < 6, night = late ? parts(start - 6 * 3600e3) : p; // a 1 am start is "Friday night"
    const n = dayNum(night) - today, w = W[l], date = `${w.days[night.dow]} ${night.d} ${w.months[night.m]}`;
    const time = show.dateOnly ? '' : l === 'fr' ? timeFr(p) : timeEn(p);
    const evening = !show.dateOnly && (late || p.h >= 17);
    if (l === 'fr') {
      if (late) return n === 0 ? `cette nuit (${time})` : n === 1 ? `demain dans la nuit (${time})` : `dans la nuit de ${w.days[night.dow]} ${night.d} ${w.months[night.m]} (${time})`;
      if (n === 0) return time ? `${evening ? 'ce soir' : 'aujourd’hui'} à ${time}` : 'aujourd’hui';
      if (n === 1) return time ? `demain${evening ? ' soir' : ''} à ${time}` : 'demain';
      return time ? `${date} à ${time}` : date;
    }
    if (late) return n === 0 ? `tonight (${time})` : n === 1 ? `tomorrow night (${time})` : `on ${w.days[night.dow]} night, ${night.d} ${w.months[night.m]} (${time})`;
    if (n === 0) return time ? `${evening ? 'tonight' : 'today'} at ${time}` : 'today';
    if (n === 1) return time ? `tomorrow${evening ? ' night' : ''} at ${time}` : 'tomorrow';
    return time ? `on ${date} at ${time}` : `on ${date}`;
  }

  // the show's name: its title, with the lineup when the title doesn't already say who plays
  function what(show, l) {
    l = lang(l);
    const title = str(show?.title, 120), lineup = (Array.isArray(show?.lineup) ? show.lineup : []).map((x) => str(x, 60)).filter(Boolean);
    const and = l === 'fr' ? ' et ' : ' & ', more = l === 'fr' ? ' et d’autres' : ' and more';
    const names = lineup.length ? lineup.slice(0, 2).join(and) + (lineup.length > 2 ? more : '') : '';
    if (!title) return names || (l === 'fr' ? 'un concert' : 'a show');
    if (!names || fold(title).includes(fold(lineup[0]))) return title;
    return `${title}${l === 'fr' ? ' avec ' : ' with '}${names}`;
  }
  const venue = (show) => str(show?.venue?.name, 100);
  function ticket(show) {
    const t = (Array.isArray(show?.tickets) ? show.tickets : []).find((x) => /^https:\/\//i.test(String(x?.url || '')));
    return t ? String(t.url).slice(0, 500) : '';
  }

  // ---------- the templates: [main sentence, ticket line, easy out] (the easy out is never optional) ----------
  const T = {
    fr: {
      casual: { main: (s) => `Hey ! Je vais voir ${s}. Ça te dit de venir ?`, out: 'Aucun souci si t’es pas dispo !' },
      hyped: { main: (s) => `J’ai trop hâte : ${s} ! 🔥 Ça va être génial, tu viens avec moi ?`, out: 'Zéro pression : aucun souci si tu peux pas !' },
      low: { main: (s) => `Petite idée, sans pression : je pense aller voir ${s}. Si ça te tente, ce serait cool de t’avoir avec moi.`, out: 'Et si ce n’est pas le moment, aucun souci, vraiment.' },
      tickets: (u, soldOut) => (soldOut ? `C’est complet, il reste peut-être la revente : ${u}` : `Les billets : ${u}`),
      soldOutNoLink: 'C’est complet, il faudra voir la revente.',
      at: (v) => ` à ${v}`
    },
    en: {
      casual: { main: (s) => `Hey! I’m going to see ${s}. Want to come?`, out: 'No worries if not!' },
      hyped: { main: (s) => `So excited: ${s}! 🔥 It’s going to be great, want to come with me?`, out: 'Zero pressure, no worries if not!' },
      low: { main: (s) => `Just an idea, no pressure: I’m thinking of going to see ${s}. If you feel like it, it’d be nice to have you along.`, out: 'And if it’s not a good time, no worries if not, really.' },
      tickets: (u, soldOut) => (soldOut ? `It’s sold out, maybe resale: ${u}` : `Tickets: ${u}`),
      soldOutNoLink: 'It’s sold out, so it would be resale.',
      at: (v) => ` at ${v}`
    }
  };
  const OUT = { fr: /aucun souci/i, en: /no worries if not/i };
  const OUT_LINE = { fr: 'Aucun souci si t’es pas dispo !', en: 'No worries if not!' };
  const hasOut = (text, l) => OUT[lang(l)].test(String(text || ''));

  // build({ show, tone, lang, now }) → the invite (lines joined by \n; the link on its own line so apps make it clickable)
  function build({ show, tone: t, lang: l, now = Date.now() } = {}) {
    t = tone(t); l = lang(l);
    const L = T[l], v = venue(show), w = when(show, l, now), u = ticket(show);
    const subject = `${what(show, l)}${v ? L.at(v) : ''}${w ? ` ${w}` : ''}`;
    const lines = [L[t].main(subject)];
    if (u) lines.push(L.tickets(u, Boolean(show?.soldOut)));
    else if (show?.soldOut) lines.push(L.soldOutNoLink);
    lines.push(L[t].out);
    return lines.join('\n');
  }
  // one line saying which show (the card's head and the proof note)
  function summary(show, l = 'en', now = Date.now()) { const v = venue(show), w = when(show, l, now); return `${what(show, l)}${v ? ` · ${v}` : ''}${w ? ` · ${w.replace(/^on /, '')}` : ''}`; }

  // ---------- "Open in…": these only OPEN the app with the text filled in; the owner picks who and presses send ----------
  // WhatsApp: its official share link (fills the text, you choose the chat). Messages (Mac only): an sms: link with the
  // body. Instagram has no way to fill a message: the window copies the text first, then opens the inbox to paste it.
  function links(text, os = 'mac') {
    const t = encodeURIComponent(String(text || '').slice(0, 2000));
    return {
      whatsapp: `https://wa.me/?text=${t}`,
      messages: os === 'mac' ? `sms:&body=${t}` : null,
      instagram: 'https://www.instagram.com/direct/inbox/'
    };
  }

  // ---------- ✨ Rewrite with Claude (only when clicked): a small prompt, then the answer tidied so it still has the
  // ticket link and the easy out ----------
  function rewritePrompt(text, t, l) {
    t = tone(t); l = lang(l);
    const toneWords = { casual: 'casual and warm', hyped: 'excited and fun', low: 'gentle and low-pressure' }[t];
    return [`Rewrite this invitation to a friend for a show, in ${l === 'fr' ? 'French (tutoiement)' : 'English'}, ${toneWords}, under 60 words.`,
      'Keep the show name, date, venue and ticket link exactly. Keep an easy, guilt-free way to say no' + (l === 'fr' ? ' ("aucun souci" if not).' : ' ("no worries if not").'),
      'No pressure, no flattery, no assumptions about the person. Reply with the message only.', '', String(text || '').slice(0, 1200)].join('\n');
  }
  function tidyRewrite(out, original, l) {
    l = lang(l);
    let t = String(out || '').replace(/^```[a-z]*\n?|```$/gim, '').replace(/^["“«]\s*|\s*["”»]$/g, '').trim().slice(0, 1200);
    if (!t) return String(original || '');
    const url = (String(original || '').match(/https:\/\/\S+/) || [])[0];
    if (url && !t.includes(url)) t += `\n${l === 'fr' ? `Les billets : ${url}` : `Tickets: ${url}`}`;
    if (!hasOut(t, l)) t += `\n${OUT_LINE[l]}`;
    return t;
  }

  // ---------- logging "Invited someone" on a social quest (only when the owner clicks "I sent it") ----------
  // A quest matches when its next open step is about an invitation (Codex's steps: "Make the invite easy", "Open the
  // invitation", "Make the invitation easy", "Draft a low-pressure invitation"…) and it can take proof now. This show's
  // own quest and the "Before the show" outing come first.
  const INVITE = /\binvit/i;
  function matchQuests(C, s, show = null) {
    if (!C || !s) return [];
    const out = [];
    const fits = (q) => q && !C.done(s, q.id) && C.available(s, q.id) && INVITE.test(`${q.title || ''} ${q.done || ''} ${q.tiny || ''}`);
    for (const c of s.campaigns || []) {
      if (c.paused) continue;
      const q = C.next(s, c); if (!fits(q)) continue;
      let score = 1;
      if (show?.key && c.id === `c-show-${show.key}`) score += 4;
      if (c.socialMission === 'show-warmup' || /\b(show|gig|concert|night out|soirée)\b/i.test(`${c.title} ${c.subtitle || ''}`)) score += 2;
      if (c.socialMission || /social|friend|confidence|connection/i.test(`${c.subtitle || ''} ${c.path || ''}`)) score += 1;
      out.push({ qid: q.id, cid: c.id, quest: str(c.title, 100), step: str(q.title, 120), score });
    }
    for (const q of s.sideQuests || []) if (!q.parked && fits(q)) out.push({ qid: q.id, cid: null, quest: str(q.title, 100), step: str(q.title, 120), score: 1 });
    return out.sort((a, b) => b.score - a.score || a.quest.localeCompare(b.quest));
  }
  // the owner's own note for that step: the show and their own words; who it went to and any reply are never recorded
  function proofNote({ show, tone: t, lang: l, text, at = Date.now() }) {
    const d = parts(at);
    return [`# Invited someone`, `Show: ${summary(show, 'en', at)}`, `Tone: ${TONE_NAMES[tone(t)]} · ${LANG_NAMES[lang(l)]}`, `Sent by me on ${d.d} ${W.en.months[d.m]} ${d.y} (Paris time).`, '',
      'My invitation, in my own words:', '', ...String(text || '').slice(0, 1500).split('\n').map((x) => `> ${x}`), '',
      'Who it went to and their answer are not recorded: any answer is a good one.'].join('\n') + '\n';
  }
  const PROOF_COVERAGE = 'The owner’s own invitation draft, marked as sent by them. Who it went to and any reply are not recorded; sending was not independently verified.';

  return { TONES, TONE_NAMES, LANGS, LANG_NAMES, tone, lang, parts, offset, when, what, venue, ticket, build, summary, hasOut, links, rewritePrompt, tidyRewrite, matchQuests, proofNote, PROOF_COVERAGE, INVITE };
});
