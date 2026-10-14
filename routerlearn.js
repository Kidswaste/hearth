// Smart learns from you (round 39, routerlearn). Smart (router.js) picks a model + effort per message from fixed rules.
// This file watches, locally and for free, how each reply went for the owner, per AI and per kind of message (Smart's
// own kinds: chit-chat, quick questions, small asks, everyday makes, code fixes, Lab builds, analyses, pictures), and
// moves a kind one rung up or down when the evidence is consistent:
//   wanted more: asked again with a stronger model or more thinking (the pick's "think harder" click, Retry with another
//     model), switched to a stronger model right after a reply, "that's wrong / try again / think harder", stopped it
//     early, edited the Lab code right after a director turn, a Lab error / "fix it" soon after a director turn;
//   was enough: kept going (the next message is a new one, no complaint); was more than needed: asked again or
//     switched to a LIGHTER model.
// Rules (hysteresis: it prefers staying put): up when a change test (CUSUM) is sure the rung falls short too often
// (≈ 3 retries with more, or a complaint every 4 replies for ~30 replies; a rung that fits, one complaint in 12, never
// moves); down when you chose a lighter model twice with at most one complaint; back down from a learned step only after
// 40 clean replies in a row and two weeks; a probe one rung below the rule only after 50 clean replies and a week. A
// lighter rung is on trial for 30 replies (a complaint and a retry send it back). A rung that proved too weak is locked
// for 45 days. At most one rung from the rule either way (the top rung is the chat's own model at xhigh); pictures and
// Lab chats never drop to the lightest model; explicit asks ("think carefully", "quick")
// and go-aheads are never changed. A step up in a big chat (its context ≥ Router.STICKY_TOKENS) says, in the chat, that
// the message re-reads the chat once without the prompt cache (cachewise's line). The first change ever gets one calm
// line through Hints; ⋯ AI setup → How hard it thinks lists what it learned, each with ✕ to forget.
// Stored in kv router-learn (synced). Nothing is sent to any engine: the prompt stays byte-stable.
// The pure part (record / evaluate / describe) runs in Node: dev/routerlearn-test.js (rules + a weeks-long simulation).
const RouterLearn = (() => {
  const KINDS = { chat: 'chit-chat', question: 'quick questions', small: 'small asks', make: 'everyday makes', code: 'code fixes', lab: 'Lab builds', analysis: 'analyses and plans', picture: 'pictures' };
  // the rule's usual rung for each kind (router.js classify), and the lowest a kind may go
  const RUNGS = ['chat', 'quick', 'normal', 'hard', 'max'];
  const USUAL = { chat: 'chat', question: 'quick', small: 'quick', make: 'normal', code: 'hard', lab: 'hard', analysis: 'hard', picture: 'quick' };
  const FLOOR = { picture: 1, lab: 2 };
  const RUNG_NAMES = { chat: 'Lightest', quick: 'Quick', normal: 'Normal', hard: 'Deep', max: 'Deepest' };
  // + wanted more (weight), − was more than needed; accepted counts toward a clean run
  const SIGNALS = {
    stronger: { w: 1.5, what: 'asked again with a stronger model or more thinking' }, // the clearest one
    switchUp: { w: 1, what: 'switched to a stronger model right after' },
    complaint: { w: 1, what: 'said it was wrong or asked to try again' },
    labfix: { w: 1, what: 'asked for a fix in the Lab right after' },
    retry: { w: 0.5, what: 'asked again' },
    stopped: { w: 0.5, what: 'stopped it early' },
    edited: { w: 0.5, what: 'edited its code right after' },
    laberror: { w: 0.5, what: 'the Lab showed an error right after' },
    weaker: { w: -1, what: 'chose a lighter model' },
    accepted: { w: 0, what: 'kept going' },
  };
  // Up is a CUSUM change test: each reply adds evidence (a "wanted more" signal: its weight × ln(p1/p0); kept going:
  // ln((1−p1)/(1−p0))), floored at 0; up when it reaches h. p0 = how often a fitting rung still falls short (≈ 8 %),
  // p1 = clearly too weak (≈ 25 %). Few false steps when the rung fits; ≈ 10–35 replies to notice one that doesn't.
  const RULES = { p0: 0.08, p1: 0.25, h: 4.5, trial: 30, trialMore: 2.5, window: 20, downWeaker: 2, relaxClean: 40, relaxDays: 14, probeClean: 50, probeDays: 7, lockDays: 45, min: -1, max: 1, log: 60 };
  const DAY = 864e5;

  // ---------- the pure rules ----------
  const usualIndex = (kind) => RUNGS.indexOf(USUAL[kind] || 'normal');
  const rungOf = (kind, d) => RUNGS[Math.max(0, Math.min(RUNGS.length - 1, usualIndex(kind) + (d || 0)))];
  // can this kind sit d rungs from its usual one?
  function allowed(kind, d, rules = RULES) {
    if (d < rules.min || d > rules.max) return false;
    const i = usualIndex(kind) + d;
    return i >= (FLOOR[kind] || 0) && i <= RUNGS.length - 1;
  }
  const locked = (k, d, now, rules = RULES, days = rules.lockDays) => Boolean(k.fail && k.fail[d] && now - k.fail[d] < days * DAY);
  function tally(log) {
    let more = 0; let less = 0;
    for (const e of log) { const s = SIGNALS[e.s]; if (!s) continue; if (s.w > 0) more += s.w; else if (s.w < 0) less -= s.w; }
    return { more, less };
  }
  // replies in a row with nothing but "kept going", and when that run started
  function cleanRun(log) {
    let n = 0; let from = 0;
    for (let i = log.length - 1; i >= 0 && log[i].s === 'accepted'; i--) { n += 1; from = log[i].t; }
    return { n, from };
  }
  // one step: the evidence starts over at the new rung; a rung left for being too weak is remembered
  function step(k, kind, dir, why, now, what) {
    const from = k.d || 0;
    if (dir > 0) (k.fail ||= {})[from] = now;
    k.d = from + dir;
    k.at = now;
    k.log = [];
    k.trial = dir < 0; // a lighter rung is on trial: it goes back up sooner
    k.s = 0;
    const change = { kind, from, to: k.d, why, what, at: now };
    k.hist = [...(k.hist || []), change].slice(-5);
    return change;
  }
  // the most telling "wanted more" signal in a window, for the words
  function mostOf(log, sign) {
    const c = {};
    for (const e of log) { const s = SIGNALS[e.s]; if (s && Math.sign(s.w) === sign) c[e.s] = (c[e.s] || 0) + 1; }
    const top = Object.keys(c).sort((a, b) => c[b] - c[a])[0];
    return top ? `you ${SIGNALS[top].what}${c[top] > 1 ? ` (${c[top]} times)` : ''}` : '';
  }
  // what the evidence says now: a change, or null (stay put)
  function evaluate(k, kind, now, rules = RULES) {
    const d = k.d || 0;
    const win = (k.log || []).slice(-rules.window);
    const { more, less } = tally(win);
    if (k.trial && (k.log || []).length <= rules.trial && tally(k.log || []).more >= rules.trialMore && allowed(kind, d + 1, rules)) return step(k, kind, +1, 'back', now, mostOf(win, 1));
    if (k.trial && (k.log || []).length > rules.trial) k.trial = false;
    if ((k.s || 0) >= rules.h && allowed(kind, d + 1, rules)) return step(k, kind, +1, 'up', now, mostOf(win, 1));
    if (less >= rules.downWeaker && more <= 1 && allowed(kind, d - 1, rules) && !locked(k, d - 1, now, rules)) return step(k, kind, -1, 'down', now, mostOf(win, -1));
    const run = cleanRun(k.log || []);
    if (d > 0 && run.n >= rules.relaxClean && allowed(kind, d - 1, rules) && !locked(k, d - 1, now, rules, rules.relaxDays)) return step(k, kind, -1, 'relax', now, `${run.n} replies in a row went fine`);
    if (d === 0 && run.n >= rules.probeClean && now - (k.at || k.since || now) >= rules.probeDays * DAY && allowed(kind, -1, rules) && !locked(k, -1, now, rules)) return step(k, kind, -1, 'probe', now, `${run.n} replies in a row went fine`);
    return null;
  }
  // one outcome for one reply of this kind → a change or null. st: { [kind]: { d, log, at, fail, hist } }
  function record(st, kind, signal, now = Date.now(), rules = RULES) {
    if (!KINDS[kind] || !SIGNALS[signal]) return null;
    const k = (st[kind] ||= { d: 0, log: [], since: now });
    k.log = [...(k.log || []), { s: signal, t: now }].slice(-rules.log);
    const w = SIGNALS[signal].w;
    if (w > 0) k.s = (k.s || 0) + w * Math.log(rules.p1 / rules.p0);
    else if (signal === 'accepted') k.s = Math.max(0, (k.s || 0) + Math.log((1 - rules.p1) / (1 - rules.p0)));
    k.s = Math.round(k.s * 1000) / 1000;
    return evaluate(k, kind, now, rules);
  }
  const shiftsOf = (st) => Object.fromEntries(Object.entries(st || {}).filter(([kind, k]) => KINDS[kind] && k?.d).map(([kind, k]) => [kind, k.d]));
  // a model + effort in plain words for a rung ("Opus · xhigh"), given the AI's engine and own model
  function planWords(kind, d, engine = 'claude', base = '') {
    const R = typeof Router !== 'undefined' ? Router : null;
    const r = rungOf(kind, d);
    if (!R) return '';
    const plan = r === 'max' ? { effort: 'xhigh' } : (R.PLAN[engine] || R.PLAN.claude)[r];
    const model = plan.model && R.rankOf(engine, plan.model) < R.rankOf(engine, base) ? plan.model : base;
    return `${R.nameOf(engine, model)} · ${plan.effort || 'medium'}`;
  }
  // what it learned, for people: [{ kind, words: 'code fixes', rung: 'Deepest', d, plan, why }]
  function describe(st, { engine = 'claude', base = '' } = {}) {
    return Object.keys(KINDS).filter((kind) => st?.[kind]?.d).map((kind) => {
      const k = st[kind]; const last = (k.hist || []).at(-1);
      return { kind, words: KINDS[kind], rung: RUNG_NAMES[rungOf(kind, k.d)], d: k.d, plan: planWords(kind, k.d, engine, base), why: last?.what || '', at: k.at || 0 };
    });
  }
  const line = (items) => items.map((x) => `${x.words} → ${x.rung}`).join(' · ');

  // ---------- in the app ----------
  const inApp = typeof window !== 'undefined' && typeof Native !== 'undefined' && Boolean(Native.hooks);
  const KV = 'router-learn';
  let data = { v: 1, agents: {}, noted: false, off: false };
  let loaded = false;
  let saveT = 0;
  function save() { clearTimeout(saveT); saveT = setTimeout(() => { try { window.hub.kvSet(KV, data); } catch { /* next time */ } }, 800); }
  async function load() {
    try { const d = await window.hub.kvGet(KV, null); if (d && typeof d === 'object') data = { ...data, ...d, agents: d.agents || {} }; } catch { /* first run */ }
    loaded = true;
  }
  const stateOf = (agentId) => (data.agents[agentId] ||= {});
  function shifts(agentId) { return data.off || !agentId ? {} : shiftsOf(data.agents[agentId]); }

  // the reply each chat is waiting to hear about: chat id → { kind, d, at, userIndex, strength, chatModel, director, agentId }
  const waiting = new Map();
  const EFFORTS = ['minimal', 'low', 'medium', 'high', 'xhigh'];
  function strength(agentId, chat, model, effort) {
    const a = H.agent(agentId) || {};
    const engine = chat.engine || a.engine || 'claude';
    const m = model || chat.model || a.model || '';
    const e = effort || chat.effort || a.effort || 'medium';
    const R = typeof Router !== 'undefined' ? Router : null;
    return [R ? R.rankOf(engine, m) : 0, Math.max(0, EFFORTS.indexOf(e))];
  }
  const cmp = (x, y) => (x[0] - y[0]) || (x[1] - y[1]);
  const COMPLAINT = /\b(?:that'?s (?:wrong|not (?:it|right|what I (?:asked|meant|wanted)))|(?:it'?s|this is) (?:wrong|broken)|not what I (?:asked|meant|wanted)|try again|think (?:harder|again|more)|doesn'?t work|does not work|didn'?t work|still (?:broken|wrong|not working|doesn'?t)|you (?:broke|missed|forgot)|that broke|wrong answer|nope,? |no,? that)\b/i;
  const FIXASK = /\b(?:fix (?:it|this|that)|broken|black screen|blank|nothing shows|error|crash(?:ed|es)?|undo that)\b/i;

  function note(agentId, change) {
    if (!change) return;
    save();
    document.dispatchEvent(new CustomEvent('hearth:routerlearn', { detail: { agentId, change } }));
    if (data.noted) return;
    data.noted = true;
    const a = H.agent(agentId);
    const k = stateOf(agentId)[change.kind];
    const plan = planWords(change.kind, k?.d || 0, a?.engine, a?.model);
    const text = `🧭 Smart learned from you: **${KINDS[change.kind]}** now get **${RUNG_NAMES[rungOf(change.kind, change.to)]}**${plan ? ` (${plan})` : ''}${change.what ? `, after ${change.what}` : ''}. ⋯ AI setup → How hard it thinks shows what it learned; ✕ forgets it.`;
    const show = () => Native.note(agentId, text, { id: 'routerlearn' });
    if (window.Hints) Hints.offer({ id: 'routerlearn:first', kind: 'inline', ttl: 30 * 60000, show }); else show();
  }
  function hear(agentId, kind, signal, d) {
    if (data.off || !loaded || !KINDS[kind]) return null;
    const st = stateOf(agentId);
    if ((st[kind]?.d || 0) !== (d || 0)) return null; // the reply ran at a rung it has since left: old news
    const change = record(st, kind, signal);
    save();
    if (change) note(agentId, change);
    return change;
  }
  function settle(chatId, signal) {
    const w = waiting.get(chatId);
    if (!w) return null;
    waiting.delete(chatId);
    return hear(w.agentId, w.kind, signal, w.d);
  }

  // before each send (after router.js picked): what this send says about the last reply, and the cache line for a
  // learned step up in a big chat
  function onOptions(agentId, chat, raw, last, options = {}, how = {}) {
    if (how.compact || !chat) return;
    const w = waiting.get(chat.id);
    if (w && Date.now() - w.at < 2 * 3600e3) {
      const now = strength(agentId, chat, options.model, options.effort);
      if (how.fromHistory && last?.role === 'user' && chat.messages.length - 1 === w.userIndex) {
        const c = cmp(now, w.strength);
        settle(chat.id, c > 0 ? 'stronger' : c < 0 ? 'weaker' : 'retry');
      } else if (!how.fromHistory && last?.role === 'user') {
        const text = String(last.text || '');
        const soon = Date.now() - w.at < 10 * 60e3;
        const modelNow = strength(agentId, chat, chat.model || undefined, w.effort);
        const moved = (chat.model || '') !== (w.chatModel || '') ? cmp(modelNow, w.strength) : 0;
        if (COMPLAINT.test(text)) settle(chat.id, w.director && soon ? 'labfix' : 'complaint');
        else if (w.director && soon && text.split(/\s+/).length <= 14 && FIXASK.test(text)) settle(chat.id, 'labfix');
        else if (moved > 0 && soon) settle(chat.id, 'switchUp');
        else if (moved < 0 && soon) settle(chat.id, 'weaker');
        else if (Date.now() - w.at < 30 * 60e3) settle(chat.id, 'accepted');
        else waiting.delete(chat.id);
      } else waiting.delete(chat.id);
    } else if (w) waiting.delete(chat.id);
    // a step up Smart learned, in a chat whose context is big: say it costs one uncached re-read (cachewise's line)
    const d = typeof Router !== 'undefined' ? Router._routes?.get(chat.id) : null;
    if (d?.reread && d.learned > 0) {
      const warned = (chat.learnWarned ||= {});
      if (warned[d.kind] !== d.rung) {
        warned[d.kind] = d.rung;
        const fmt = (n) => (n >= 1000 ? `${Math.round(n / 1000)}k` : String(n));
        const text = `↻ Smart thinks harder on ${KINDS[d.kind] || 'this kind of message'} now (it learned that from you): this message re-reads the whole chat (≈ ${fmt(d.reread)} tokens) once without the prompt cache. That's fine; a new chat starts light.`;
        const show = () => Native.note(agentId, text, { id: 'cachewise' });
        if (window.Hints) Hints.offer({ id: `cachewise:${agentId}`, kind: 'inline', once: false, ttl: 15 * 60000, still: () => H.activeChat?.[agentId] === chat.id, show }); else show();
      }
    }
  }
  // a reply finished (router.js's finish hook ran first: extras.route is the pick it got)
  function onFinish(event, chat, extras) {
    const r = extras?.route;
    if (!chat || !r || r.forced || !KINDS[r.kind]) { if (chat && event?.type === 'done') waiting.delete(chat.id); return; }
    const agentId = chat.agentId;
    const d = stateOf(agentId)[r.kind]?.d || 0;
    if (event.type === 'stopped') {
      const asked = [...chat.messages].reverse().find((m) => m.role === 'user');
      if (asked?.at && Date.now() - asked.at < 90e3) hear(agentId, r.kind, 'stopped', d);
      waiting.delete(chat.id);
      return;
    }
    if (event.type !== 'done') { waiting.delete(chat.id); return; }
    const userIndex = chat.messages.map((m) => m.role).lastIndexOf('user');
    const a = H.agent(agentId);
    waiting.set(chat.id, { agentId, kind: r.kind, d, at: Date.now(), userIndex, effort: r.effort, chatModel: chat.model || '', director: a?.dock === 'three',
      strength: strength(agentId, chat, r.model, r.effort) });
  }
  // the owner typing in the Lab's code editor, or the Lab showing an error, right after a director turn
  function labAfter(signal) {
    const now = Date.now();
    for (const [chatId, w] of waiting) {
      if (!w.director || now - w.at > 3 * 60e3) continue;
      if (Native.isAgentBusy?.(w.agentId)) continue; // the director is at work again: its own edits / errors
      settle(chatId, signal);
    }
  }

  // ---------- what it learned, in ⋯ AI setup → How hard it thinks ----------
  function forget(agentId, kind = null) {
    const st = data.agents[agentId];
    if (!st) return 0;
    const kinds = kind ? [kind] : Object.keys(st);
    let n = 0;
    for (const k of kinds) if (st[k]) { if (st[k].d) n += 1; delete st[k]; }
    save();
    return n;
  }
  function row(a, repaint) {
    if (!a || data.off) return null;
    const items = describe(data.agents[a.id], { engine: a.engine, base: a.model });
    if (!items.length) return null;
    return el('div', { class: 'opt-learned' }, el('span', { class: 'rl-label', text: 'Smart has learned:' }),
      ...items.map((x) => el('span', { class: 'rl-item', title: `${x.words}: ${x.plan || x.rung}${x.why ? `, because ${x.why}` : ''}.\nIt keeps watching and moves back when you need it.` },
        `${x.words} → ${x.rung}`,
        el('button', { type: 'button', class: 'ghost rl-x', text: '✕', title: `Forget this: ${x.words} go back to Smart's usual pick`, on: { click: () => { forget(a.id, x.kind); repaint?.(); } } }))));
  }
  // /route learned · /route forget <kind|all> · /route learn on|off (router.js passes these here)
  function command(args, agentId) {
    const a = String(args || '').trim();
    const agent = H.agent(agentId);
    if (/^learn\s+(on|off)$/i.test(a)) { data.off = /off$/i.test(a); save(); return data.off ? 'Smart stopped learning from you (what it learned is kept but not used).' : 'Smart learns from you again.'; }
    if (/^forget\b/i.test(a)) {
      const w = a.replace(/^forget\s*/i, '').toLowerCase();
      const kind = Object.keys(KINDS).find((k) => k === w || KINDS[k].toLowerCase() === w || KINDS[k].toLowerCase().startsWith(w));
      if (w && w !== 'all' && !kind) return `Which one? ${Object.values(KINDS).join(', ')} or all.`;
      const n = forget(agentId, w === 'all' || !w ? null : kind);
      return n ? `Forgotten: Smart is back to its usual pick for ${w && w !== 'all' ? KINDS[kind] : 'everything'}.` : 'Nothing learned there to forget.';
    }
    const items = describe(data.agents[agentId], { engine: agent?.engine, base: agent?.model });
    return items.length ? `Smart has learned (${agent?.name || 'this AI'}): ${items.map((x) => `${x.words} → ${x.rung}${x.plan ? ` (${x.plan})` : ''}`).join(' · ')}.${data.off ? ' (Learning is off: /route learn on.)' : ''}` : `Smart hasn't learned anything for ${agent?.name || 'this AI'} yet: it moves a kind of message only after it sees the same thing several times.`;
  }

  if (inApp) {
    load();
    (Native.hooks.options ||= []).push(onOptions);
    Native.hooks.finish.push(onFinish);
    addEventListener('input', (e) => { if (e.isTrusted && e.target?.matches?.('textarea.ce-area') && e.target.closest?.('.three-editor')) labAfter('edited'); }, true);
    addEventListener('hearth:lab-error', () => labAfter('laberror'));
  }

  return { KINDS, RUNGS, USUAL, RULES, SIGNALS, RUNG_NAMES, record, evaluate, allowed, shiftsOf, describe, line, rungOf, planWords,
    shifts, forget, row, command, onOptions, onFinish, labAfter, hear, get data() { return data; }, get waiting() { return waiting; }, ready: () => loaded };
})();
if (typeof module !== 'undefined') module.exports = RouterLearn; else window.RouterLearn = RouterLearn;
