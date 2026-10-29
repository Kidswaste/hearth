// Recall (round 30): the ways into "what did we decide about X?", loaded right after the first screen (tiny); the
// results card itself (recall.js) loads on first use. Everything is local and free: the index of every chat's
// messages lives on the store thread (storework.js op recall, recall-core.js) and is built in idle moments only:
// never at startup (the first pass waits ~45 s, then one ~12 ms slice per idle moment, never while you type, drag
// or scroll), and once it has caught up nothing runs at all; a question catches up the chats that changed since.
// (round 83, idleburst83) a pause ≥ 4× each slice after it, and the index kept on disk between starts (storework.js).
//   · the chats panel's search box: a "Find the answer" row when what you typed is a question
//   · ◎ Missions › "Remind me what we decided": your message becomes the question; nothing is sent
//   · /decided <question> (the app's internal API; /recall is taken: /drafts' alias)
const RecallHooks = (() => {
  const isQuestion = (q) => {
    const s = String(q || '').trim();
    if (s.split(/\s+/).length < 2) return false;
    return /\?$/.test(s) || /^(?:what|whats|what's|why|how|when|where|which|who|did|do|does|should|can|could|is|are|was|were|remind|recall|have we|had we)\b/i.test(s) || /\b(?:decid|agree|settle|chose|pick)/i.test(s);
  };
  async function ui() {
    if (window.Lazy?.load) await window.Lazy.load('recallui');
    if (typeof Recall === 'undefined') throw new Error('Recall isn\'t loaded');
    return Recall;
  }
  const open = (q, o = {}) => ui().then((R) => R.open(q, o)).catch((err) => { toast(err.message, { type: 'error' }); return null; });

  // ---------- the chats panel: "Find the answer" under the search box's results ----------
  function panelRow() {
    const q = document.getElementById('chat-search')?.value.trim() || '';
    const root = document.getElementById('chat-groups');
    if (!root) return;
    root.querySelector(':scope > .recall-row')?.remove();
    if (q.length < 6 || !isQuestion(q)) return;
    const b = el('button', { class: 'show-more recall-row', type: 'button', title: 'Looks through every chat here on this computer: free, nothing is sent', on: { click: () => open(q) } },
      el('span', { class: 'recall-ic', text: '🔎' }), ` Find the answer: “${q.length > 48 ? `${q.slice(0, 47)}…` : q}”`);
    const deep = root.querySelector(':scope > .deep-search');
    if (deep) root.insertBefore(b, deep); else root.append(b);
  }
  if (typeof Panel !== 'undefined' && Panel.hooks?.render) { Panel.hooks.render.push(panelRow); panelRow(); }

  // ---------- ◎ Missions: "Remind me what we decided" ----------
  if (typeof Missions !== 'undefined' && Missions.add) {
    Missions.add({ id: 'recall', more: true, icon: '🔎', label: 'Remind me what we decided', desc: 'Finds it in all your chats, here on this computer, for free: the decisions and the open questions as short quotes, each with its chat, its date and a jump to it. Nothing is sent unless you ask the AI to sum them up (the cost is shown first, and only the quotes go).',
      submit: (agentId, text) => { open(text, { agentId }); return true; } });
  }

  // ---------- the chat command ----------
  if (typeof Commands !== 'undefined' && !Commands.get('decided')) {
    Commands.register({ name: 'decided', aliases: ['what-did-we-decide'], args: '<question>', area: 'Chat', desc: 'What did we decide about…? Searches every chat here, free: decisions and open questions as quotes',
      keywords: 'remind me what we decided remember find answer decision past chats',
      examples: ['/decided what did we decide about the intro font?'],
      run: async (args, ctx) => { await open(args, { agentId: ctx?.agentId }); } });
  }

  // ---------- the index, built in idle moments ----------
  let state = 'wait'; // wait → building → ready (a question catches up what changed after that)
  const idle = (fn) => (window.requestIdleCallback ? requestIdleCallback(fn, { timeout: 4000 }) : setTimeout(fn, 200));
  function slice() {
    if (state !== 'building') return;
    if (window.Jank?.busy?.() || document.hidden) { setTimeout(() => idle(slice), 1500); return; }
    Promise.resolve(window.hub?.recall?.({ budgetMs: 12 })).then((r) => {
      if (!r || !r.left) { state = 'ready'; return; }
      // (round 83, idleburst83) a pause after each slice (≥ 4× its time): the store thread works ≤ ~20 % of a CPU on it,
      // not back to back (an idle page asks again at once: a whole CPU for minutes after every start on a big profile)
      setTimeout(() => idle(slice), Math.max(60, (Number(r.ms) || 12) * 4));
    }).catch(() => { state = 'wait'; }); // no store thread: a question does it
  }
  function build() { if (state === 'wait' && window.hub?.recall) { state = 'building'; idle(slice); } return state; }
  setTimeout(build, 45000);

  return { open, isQuestion, build, state: () => state };
})();
window.RecallHooks = RecallHooks;
