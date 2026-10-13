// Smart routing (round 28, router). With "How hard it thinks" on Smart (⋯ AI setup), each message picks its own model
// and effort from local rules (no extra model call): chit-chat and short questions go to a lighter model with little
// thinking, code / builds / analyses keep the chat's own model and think harder. Only that one message: the chat's
// saved model never changes, and a model or effort the owner picked for the chat (or a mission set for the message)
// is never routed away. The reply shows the pick small ("Sonnet · low", hover: why); one click asks again, thinking
// harder (the chat's strong model, high effort). Quick and Deep stay fixed.
// Cache rule: models and efforts each keep their own prompt cache, so a chat whose context is already big never steps
// DOWN mid-conversation (re-reading it uncached would cost more than the lighter model saves); it can still step up.
// Pure rules (decide / classify) run in Node too: dev/router-test.js.
const Router = (() => {
  const TIERS = ['chat', 'quick', 'normal', 'hard'];
  // what each tier asks for; no model = the chat's own (agent default), so routing only ever picks a cheaper one
  const PLAN = {
    claude: { chat: { model: 'haiku', effort: 'low' }, quick: { model: 'sonnet', effort: 'low' }, normal: { effort: 'medium' }, hard: { effort: 'high' } },
    codex: { chat: { model: 'gpt-6-luna', effort: 'minimal' }, quick: { model: 'gpt-6-sol', effort: 'low' }, normal: { effort: 'medium' }, hard: { effort: 'high' } },
  };
  // cheapest → strongest; an unknown model counts as the strongest (never "upgraded" by a route)
  const RANK = { claude: [/haiku/i, /sonnet/i, /opus/i, /fable|mythos/i], codex: [/luna/i, /-sol\b|^sol$/i, /astra/i] };
  const NAMES = { claude: ['Haiku', 'Sonnet', 'Opus', 'Fable'], codex: ['Luna', 'Sol', 'Astra'] };
  const rankOf = (engine, model) => { if (!model) return 99; const i = (RANK[engine] || []).findIndex((re) => re.test(model)); return i < 0 ? 99 : i; };
  const nameOf = (engine, model) => { if (!model) return 'Default'; const i = (RANK[engine] || []).findIndex((re) => re.test(model)); return i < 0 ? String(model) : NAMES[engine][i]; };
  // A big context sticks: below this many tokens a switch costs little (the cache is rebuilt from a small prefix).
  const STICKY_TOKENS = 20000;

  const CODE = /```|=>|\b(?:function|const|let|var|import|export|class|def|return|async|await)\b[^\n]*[({=;:]|\w+\.\w+\([^)]*\)|<\/?[a-z][a-z0-9-]*[ >]|\bat \S+:\d+|Traceback|\b\w*Error\b:|\b(?!(?:three|node|p5|d3|vue|next|react|tone)\.js\b)[\w-]+\.(?:js|ts|tsx|py|glsl|frag|vert|json|css|html|sh|swift|cs|cpp|rs|go)\b/;
  const CODEWORD = /\b(?:function|shader|glsl|script|api|regex|bug|component|endpoint|algorithm|sql|query|compile[rd]?|repo|commit|typescript|javascript|python)\b/i;
  const BUILD = /\b(?:build|make|create|implement|write|code|refactor|fix|debug|port|migrate|optimi[sz]e|generate|set up|wire|animate|render|rewrite|add (?:a|an|the|some|more))\b/i;
  const ANALYSIS = /\b(?:analy[sz]e|analysis|compare|comparison|review|audit|plan|design|architect\w*|strategy|trade-?offs?|pros and cons|why (?:does|is|do|did|are)|explain (?:why|how)|step by step|in depth|deep dive|research|evaluate|investigate|prove|diagnose)\b/i;
  const HARDER = /\b(?:think (?:hard|harder|carefully|deeply|it through)|carefully|thorough(?:ly)?|ultrathink|rigorous(?:ly)?|take your time)\b/i;
  const LIGHT = /\b(?:quick(?:ly)?|briefly|brief|short answer|tl;?dr|one (?:word|line|sentence)|just tell me|in a word)\b/i;
  const CHAT = /^(?:hi|hey|hello|yo|thanks?|thank you|thx|ty|ok(?:ay)?|cool|nice|great|perfect|awesome|love it|lol|haha|good (?:morning|night|evening|job)|bye|cheers|got it|sounds good|yes|no|yep|nope|sure|wow)\b/i;
  const FOLLOW = /^(?:yes|yep|yeah|sure|ok(?:ay)?|go(?: ahead| for it| on)?|do it|do that|continue|keep going|proceed|next|again|try again|same|please do|let'?s do it|sounds good,? (?:go|do it))\b/i;
  const QUESTION = /\?\s*$|^(?:what|who|when|where|which|how|is|are|can|could|does|do|should|would|will|why)\b/i;

  // What kind of message this is: { tier, why }. ctx: { attachments, images, director, prevTier }
  function classify(text, ctx = {}) {
    const t = String(text || '').trim();
    const words = t ? t.split(/\s+/).length : 0;
    const chars = t.length;
    const files = (ctx.attachments || []).filter((a) => a && a.kind !== 'image');
    const fileTokens = files.reduce((s, a) => s + (a.tokens || (a.kind === 'text' ? 2000 : 4000)), 0);
    const images = (ctx.images || 0) + (ctx.attachments || []).filter((a) => a && a.kind === 'image').length;
    const code = CODE.test(t);
    const codeWord = CODEWORD.test(t);
    const build = BUILD.test(t);
    const analysis = ANALYSIS.test(t);
    if (HARDER.test(t)) return { tier: 'hard', why: 'you asked it to think it through' };
    if (ctx.prevTier && words <= 6 && FOLLOW.test(t)) return { tier: ctx.prevTier, why: 'a go-ahead: same as the last reply' };
    if (code && (build || analysis || chars > 400)) return { tier: 'hard', why: 'code to write, fix or explain' };
    if (ctx.director && build && words >= 3) return { tier: 'hard', why: 'a build in the Lab' };
    if (codeWord && build && words >= 4) return { tier: 'hard', why: 'code to write or fix' };
    if (analysis && words >= 8) return { tier: 'hard', why: 'an analysis or a plan' };
    if (chars > 3000) return { tier: 'hard', why: 'a long, detailed message' };
    if (fileTokens > 8000) return { tier: 'hard', why: 'big files attached' };
    const light = LIGHT.test(t) && words <= 30;
    if (code || build || analysis || files.length || chars > 400 || words > 60) {
      const why = code ? 'some code' : build ? 'something to make' : analysis ? 'something to think over' : files.length ? 'files attached' : 'a longer message';
      return light && !code ? { tier: 'quick', why: `${why}, but you asked for it quick` } : { tier: 'normal', why };
    }
    if (light) return { tier: 'quick', why: 'you asked for a quick answer' };
    let r;
    if (CHAT.test(t) && words <= 6 && !/\?/.test(t)) r = { tier: 'chat', why: 'chit-chat' };
    else if (QUESTION.test(t) && words <= 25) r = { tier: 'quick', why: 'a short question' };
    else if (words <= 12) r = { tier: 'quick', why: 'a small ask' };
    else r = { tier: 'normal', why: 'an everyday message' };
    // floors: a picture or a Lab director's tools want at least the middle model
    if ((images || ctx.director) && TIERS.indexOf(r.tier) < 1) r = { tier: 'quick', why: images ? 'a picture to look at' : 'a Lab chat (its tools need a steady model)' };
    if (images && r.tier === 'quick' && words > 12) r = { tier: 'normal', why: 'a picture to look at' };
    return r;
  }

  const fmtK = (n) => (n >= 1000 ? `${Math.round(n / 1000)}k` : String(n));
  // The pick for one message, or null when there is nothing to route (the owner pinned both model and effort).
  // input: { engine, text, attachments, images, director, history: [messages before this one], pinned: { model, effort },
  //          baseModel (the chat's own model: what "no model" means), force: an effort for "ask again, thinking harder" }
  function decide(input) {
    const engine = PLAN[input.engine] ? input.engine : 'claude';
    const pinned = input.pinned || {};
    if (pinned.model && pinned.effort && !input.force) return null;
    const history = input.history || [];
    const lastReply = [...history].reverse().find((m) => m.role === 'assistant');
    const prevTier = lastReply?.route?.tier || (lastReply ? 'normal' : null);
    let pick;
    if (input.force) pick = { tier: 'hard', why: 'you asked it to think harder' };
    else pick = classify(input.text, { attachments: input.attachments, images: input.images, director: input.director, prevTier });
    // a big context never steps down (its cache belongs to the model + effort it has)
    let kept = false;
    const ctxTokens = lastReply?.usage?.input || 0;
    if (!input.force && lastReply && ctxTokens >= STICKY_TOKENS && TIERS.indexOf(pick.tier) < TIERS.indexOf(prevTier)) {
      pick = { tier: prevTier, why: `${pick.why}; kept as before: switching now would re-read ${fmtK(ctxTokens)} tokens without the cache` };
      kept = true;
    }
    const plan = PLAN[engine][pick.tier];
    const base = pinned.model || input.baseModel || '';
    let model = null;
    if (!pinned.model && plan.model && rankOf(engine, plan.model) < rankOf(engine, base)) model = plan.model;
    let effort = pinned.effort && !input.force ? null : (input.force ? (input.force === true ? 'high' : input.force) : plan.effort);
    const shown = model || base;
    const shownEffort = effort || pinned.effort || 'medium';
    return { tier: pick.tier, model, effort, why: pick.why, kept, forced: Boolean(input.force), label: `${nameOf(engine, shown)} · ${shownEffort}`, engine };
  }

  // ---------- in the app ----------
  const routes = new Map(); // chat id -> the pick for the reply on its way
  const forced = new Map(); // chat id -> effort for its next send ("ask again, thinking harder")
  const smartOn = (agent) => Boolean(agent) && agent.mode === 'native' && (!agent.effort || agent.effort === 'medium');

  function pickFor(agentId, chat, raw, last, options = {}, { compact = false, force = null } = {}) {
    const agent = H.agent(agentId);
    if (!agent || compact || last?.compactReq) return null;
    if (!force && !smartOn(agent)) return null;
    const engine = options.engine || chat.engine || agent.engine;
    const twin = engine !== agent.engine ? H.agents().find((a) => a.mode === 'native' && a.engine === engine) : null;
    return decide({
      engine, text: last?.role === 'user' ? last.text : raw, attachments: last?.attachments, images: (last?.images || []).length,
      director: Boolean(agent.dock), history: chat.messages.slice(0, last?.role === 'user' ? -1 : undefined),
      pinned: { model: options.model, effort: options.effort }, baseModel: twin ? twin.model : agent.model, force,
    });
  }
  function onOptions(agentId, chat, raw, last, options, how = {}) {
    routes.delete(chat.id);
    const force = forced.get(chat.id) || null;
    forced.delete(chat.id);
    const d = pickFor(agentId, chat, raw, last, options, { compact: how.compact, force });
    if (!d) return;
    if (d.model) options.model = d.model;
    if (d.effort) options.effort = d.effort;
    routes.set(chat.id, d);
  }
  function onFinish(event, chat, extras) {
    const d = routes.get(chat.id);
    routes.delete(chat.id);
    if (!d) return;
    extras.route = { tier: d.tier, label: d.label, why: d.why, ...(d.model ? { model: d.model } : {}), ...(d.effort ? { effort: d.effort } : {}), ...(d.kept ? { kept: true } : {}), ...(d.forced ? { forced: true } : {}) };
    if (d.model) extras.model = d.model; // the meter prices the model that really answered
  }

  // "Ask again, thinking harder": the last reply again, the chat's own model, high effort (xhigh when it was high)
  async function harder(agentId) {
    const chat = Native.current(agentId);
    if (!chat) return 'No chat open.';
    if (Native.isBusy(chat.id)) return 'It is still answering.';
    const reply = [...chat.messages].reverse().find((m) => m.role === 'assistant' || m.role === 'error');
    const effort = reply?.route?.effort === 'high' || reply?.route?.effort === 'xhigh' ? 'xhigh' : 'high';
    forced.set(chat.id, effort);
    await Native.retry(agentId);
    if (!Native.isBusy(chat.id)) { forced.delete(chat.id); return 'Nothing to ask again.'; }
    return null;
  }
  function chip(node, m, index, agent) {
    if (m.role !== 'assistant' || !m.route) return;
    const foot = node.querySelector(':scope > .msg-foot');
    if (!foot || foot.querySelector('.route-chip')) return;
    const r = m.route;
    const b = el('button', { type: 'button', class: `route-chip${r.forced ? ' forced' : ''}`, text: r.label,
      title: `Picked for this message: ${r.why}.\nClick: ask again, thinking harder (its own model, ${r.effort === 'high' || r.effort === 'xhigh' ? 'xhigh' : 'high'} effort)` });
    b.addEventListener('click', async (e) => {
      e.stopPropagation();
      const chat = Native.current(agent.id);
      const lastReply = chat ? chat.messages.map((x) => x.role).lastIndexOf('assistant') : -1;
      if (!chat || lastReply !== index || index !== chat.messages.length - 1) { toast('Only the last reply can be asked again', { timeout: 1600 }); return; }
      const said = await harder(agent.id);
      if (said) toast(said, { timeout: 1600 });
    });
    foot.insertBefore(b, foot.querySelector('.msg-time'));
  }
  // what Smart would pick for these words in this chat (/route test …)
  function preview(agentId, text) {
    const chat = Native.current(agentId) || { messages: [] };
    const agent = H.agent(agentId);
    const d = decide({ engine: agent?.engine, text, director: Boolean(agent?.dock), history: chat.messages, pinned: { model: chat.model, effort: chat.effort }, baseModel: agent?.model });
    return d ? `${d.label}: ${d.why}${smartOn(agent) ? '' : ' (this AI is not on Smart: ⋯ AI setup → How hard it thinks)'}` : 'This chat has its own model and effort: nothing to pick.';
  }

  if (typeof Native !== 'undefined' && Native.hooks) {
    (Native.hooks.options ||= []).push(onOptions);
    Native.hooks.finish.push(onFinish);
    Native.hooks.message.push(chip);
  }
  if (typeof Commands !== 'undefined' && !Commands.get('route')) {
    Commands.register({
      name: 'route', area: 'Chat', args: '[harder | test <words>]',
      desc: 'Smart: which model and effort the last reply got and why; ask again thinking harder; or test some words',
      keywords: 'smart router model effort cheaper think harder',
      examples: ['/route', '/route harder', '/route test fix this shader'],
      complete: () => [{ value: 'harder', hint: 'ask again, thinking harder' }, { value: 'test ', hint: 'what Smart would pick' }],
      run: async (args, ctx) => {
        const a = String(args || '').trim();
        if (/^harder$/i.test(a)) return (await harder(ctx.agentId)) || null;
        if (/^test\s+/i.test(a)) return preview(ctx.agentId, a.replace(/^test\s+/i, ''));
        const r = [...(Native.current(ctx.agentId)?.messages || [])].reverse().find((m) => m.role === 'assistant')?.route;
        return r ? `Last reply: ${r.label}: ${r.why}.` : `No routed reply yet. ${smartOn(H.agent(ctx.agentId)) ? 'Smart is on: the next reply shows its pick.' : 'Smart is off for this AI (⋯ AI setup → How hard it thinks → Smart).'}`;
      },
    });
  }

  return { decide, classify, rankOf, nameOf, PLAN, TIERS, STICKY_TOKENS, harder, preview, smartOn, pickFor, _routes: routes };
})();
if (typeof module !== 'undefined') module.exports = Router;
