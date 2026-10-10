// Commands page core (round 11): every chat command explained and run input by input. No DOM, Node-testable
// (dev/cmdpage-test.js). Two jobs:
// 1. questionsFor(def, meta): the questions a command asks, one at a time, derived from its metadata: the args string
//    (`<size>` = it needs this, `[name]` = optional, `on|off` = yes or no, `[n]` = how many, `a|b|c` = pick one,
//    `</command>` = another command, top-level `x | y <z>` = one of several forms, each with its own follow-ups),
//    `complete()` (its suggestions become big buttons, filled in by the page), examples (their values become buttons),
//    plus "How many times?" (once / n times via /repeat / every N via /every) and "Then…" (chain the next command).
//    Explicit metadata (cmdpage-data.js `Q`) replaces the derived questions where the args string says too little.
// 2. buildFlow(stages): a Flows flow (flows.js) for a guided run: the questions of each chosen command, "Then…",
//    the next command's questions, a summary before anything runs, the commands in order (the result of one can feed
//    the next through {last}), the result. The run is an ordinary Flows run: kept on disk, resumed after a reload,
//    run again with the same answers, refined, shown as the same live card in the chat. The page regrows the flow
//    when "which command next?" is answered (Flows' `grow` hook), so the steps are a pure function of the commands
//    chosen and an "again" or a changed answer rebuilds them the same way.
const CmdPageCore = (() => {
  const MAX_STAGES = 4; // commands chained in one run
  const MAX_OPTIONAL = 3; // optional inputs asked one by one; more go into one "anything else?" box
  // placeholder words (an input you type) vs literal values (a choice): `<name | none>` = a name, or "none"
  const PLACEHOLDER = /^(#|n|x|n…|name|names|text|message|messages|words|word|what|question|task|command|cmd|time|times|seconds|secs|s|ms|minutes|days|filter|search|title|value|values|color|colors|colour|agent|model|board|tag|tags|note|fact|idea|prompt|expression|code|amount|percent|px|bpm|frames|frame|sequence|clip|slider|layer|node|nodes|preset|template|style|flow|answer|degrees|interval|delay|path|url|file|folder|chat|item name|item|query|topic|persona|language|level|lines|count|rounds|passes|seats|judge|kind|type|mode|side|background|ratio|focus|layout|lens|shape|stamp|starter|sticker|harmony|format|fps|from|to|at|range|scene|scene name|first message|instruction|instructions|fact to remember|label|key|field|action|tool|tab|area|category|playground|animation|transition|look|palette|move|part|max|start|end|in|out|adjustment|percent|factor|feature|bars|beats|size|group|video|picture|picture path|hex|hex codes|text color|any color|feedback|reply|subject|what you want to do|what it should do|goal|goal…|genre or behavior|layout or device|search or #tag|words or #tag|search or category|category or search|lfo|band|depth|v2\.1|script name|json args|backup zip path|path to export \.zip\/\.json|time math|zoom)$/i;
  const NUMERIC = /^(#|n|n…|count|rounds|passes|seats|seconds|secs|s|ms|minutes|days|amount|percent|px|bpm|frames|degrees|lines|fps|factor|max|bars|beats|interval|delay|0[–-]1|0[–-]100|2[–-]9|-?\d+[–-]\d+|\d+(\.\d+)?)$/i;
  const isPlaceholder = (w) => { const t = String(w).trim().replace(/[…]+$/, '').trim(); return !t || PLACEHOLDER.test(t) || /[<>=…]/.test(w) || /^#\w+/.test(t) && !/^#[0-9a-f]{3,8}$/i.test(t) || /\s/.test(t) && t.split(/\s+/).every((x) => PLACEHOLDER.test(x)); };
  const isNumeric = (w) => NUMERIC.test(String(w).trim().replace(/[…]+$/, '').trim());
  const article = (w) => (/^[aeiou]/i.test(w) && !/^(one|use)/i.test(w) ? 'an' : 'a');
  // "name" → "a name", "words" → "some words", "#" → "a number"
  function nounOf(w) {
    const t = String(w || '').replace(/[…]+$/, '').trim().toLowerCase();
    if (!t) return 'a value';
    if (t === '#' || t === 'n') return 'a number';
    if (/^(words|text|colors|frames|seconds|days|lines|rounds|passes|seats|tags|nodes|values|names|instructions|hex codes|bars|beats|messages)$/.test(t)) return `some ${t}`;
    if (/^(what you want to do|what it should do)$/.test(t)) return t;
    return `${article(t)} ${t}`;
  }
  // tokens of an args string: <…> required, […] optional, | between forms, bare words are literals
  function tokens(args) {
    return String(args || '').match(/<[^>]*>|\[[^\]]*\]|\||[^\s<[|]+/g) || [];
  }
  const inner = (t) => t.replace(/^[<[]|[>\]]$/g, '').trim();
  // one token → a question (or null for a lone literal that the form's own choice already covers)
  function questionOf(tok, { pos = 0, first = false } = {}) {
    const required = tok.startsWith('<');
    const optional = tok.startsWith('[');
    if (!required && !optional) return null;
    const body = inner(tok);
    if (!body) return null;
    if (/^\/|<\/|^\/?cmd\b|\/command|\/cmd/.test(body) || /^\//.test(body)) {
      return { kind: 'command', label: 'a command', required, free: true, multi: /…|;/.test(body), token: tok, pos };
    }
    const parts = body.split(/\s*\|\s*/).map((x) => x.trim()).filter(Boolean);
    const lits = parts.filter((p) => !isPlaceholder(p) && !/\s/.test(p) || /^\d+\s?(bars?|beats?|s|m)$/i.test(p));
    const holders = parts.filter((p) => !lits.includes(p));
    // on | off (maybe with a few more words): yes or no
    const low = lits.map((x) => x.toLowerCase());
    if (low.includes('on') && low.includes('off') && lits.length <= 3 && !holders.length) {
      const extra = lits.filter((x) => !/^(on|off)$/i.test(x));
      return { kind: 'yesno', label: 'on or off', required, free: false, token: tok, pos,
        options: [{ label: 'Yes (on)', value: 'on' }, { label: 'No (off)', value: 'off' }, ...extra.map((x) => ({ label: x, value: x }))] };
    }
    if (parts.length === 1 && holders.length === 1 && isNumeric(holders[0])) {
      const w = holders[0].replace(/[…]+$/, '');
      const range = w.match(/^(-?\d+(?:\.\d+)?)[–-](\d+(?:\.\d+)?)$/);
      const nums = range ? [range[1], ((Number(range[1]) + Number(range[2])) / 2).toString(), range[2]] : /^(seconds|secs|s)$/i.test(w) ? ['5', '10', '30'] : /^ms$/i.test(w) ? ['50', '100', '250'] : /^(percent)$/i.test(w) ? ['25', '50', '100'] : /^bpm$/i.test(w) ? ['90', '120', '128', '140'] : /^degrees$/i.test(w) ? ['15', '45', '90'] : ['1', '2', '3', '5', '10'];
      return { kind: 'count', label: /^(#|n)$/i.test(w) ? 'a number' : `how many ${w}`, unit: w, required, free: true, token: tok, pos, options: nums.map((v) => ({ label: v, value: v })) };
    }
    if (lits.length && !holders.length) return { kind: 'choice', label: parts.length > 4 ? 'one option' : parts.join(' or '), required, free: false, token: tok, pos, options: lits.map((x) => ({ label: x, value: x })) };
    const noun = holders.length ? nounOf(holders[0]) : 'a value';
    return { kind: 'text', label: lits.length ? `${noun} (or ${lits.slice(0, 3).join(', ')})` : noun, required, free: true, token: tok, pos, first,
      options: lits.map((x) => ({ label: x, value: x })), multi: /…/.test(body) };
  }
  // The questions in a sequence of tokens (one form of the command)
  function seqQuestions(toks) {
    const out = [];
    let lead = []; // literal words before any input ("rate <0.5-2>", "gain <auto|…>"): part of the value
    for (const t of toks) {
      if (t === '|') continue;
      if (!/^[<[]/.test(t)) { lead.push(t); continue; }
      const q = questionOf(t, { pos: out.length, first: !out.length });
      if (q) { if (lead.length) q.prefix = lead.join(' '); out.push(q); }
      lead = [];
    }
    return { qs: out, lead: lead.join(' ') };
  }
  // Top-level forms: "<answer> | resume | again | refine <what> | stop" → one choice of the form, each with its own follow-ups
  function forms(args) {
    const toks = tokens(args);
    if (!toks.includes('|')) return null;
    const groups = [[]];
    for (const t of toks) { if (t === '|') groups.push([]); else groups.at(-1).push(t); }
    const opts = [];
    let free = false; let freeLabel = '';
    for (const g of groups.filter((x) => x.length)) {
      const head = g[0];
      if (/^[<[]/.test(head)) {
        // a bracketed first token: its literals are options of their own, a placeholder means "type it"
        const q = questionOf(head, { first: true });
        const rest = seqQuestions(g.slice(1)).qs;
        if (q && q.options?.length && q.kind !== 'text') for (const o of q.options) opts.push({ label: o.label, value: o.value, then: rest });
        else if (q) { free = true; freeLabel = freeLabel || q.label; if (q.options) for (const o of q.options) opts.push({ label: o.label, value: o.value, then: rest }); }
        continue;
      }
      const words = []; let i = 0;
      while (i < g.length && !/^[<[]/.test(g[i])) words.push(g[i++]);
      const sq = seqQuestions(g.slice(i));
      opts.push({ label: words.join(' '), value: words.join(' '), then: sq.qs });
    }
    const seen = new Set();
    return { kind: free ? 'text' : 'choice', label: free ? `${freeLabel}, or one of these` : 'what you want it to do', required: !free || !/^\[/.test(toks[0]), free, pos: 0, first: true, form: true,
      options: opts.filter((o) => o.value && !seen.has(o.value) && seen.add(o.value)) };
  }
  // A short question title for the page: "This needs: a frame size", "Optional: a name", "Yes or no?", "How many?"
  function titleOf(q) {
    if (q.title) return q.title;
    if (q.kind === 'yesno') return `Yes or no?${q.label && q.label !== 'on or off' ? ` (${q.label})` : ''}`;
    if (q.kind === 'count') return q.required ? `How many? (${q.label})` : `Optional: how many? (${q.label})`;
    if (q.kind === 'command') return q.required ? 'This needs: a command to run' : 'Optional: a command to run';
    return `${q.required ? 'This needs' : 'Optional'}: ${q.label}`;
  }
  // Verbs that make a command worth repeating (once / n times / every…): it changes or makes something
  const REPEAT_RE = /^(shuffle|reshuffle|surprise|still|shot|screenshot|grab|tap|kick|snare|hit|marker|cue|nudge|next|prev|step|frame-step|next-frame|board-random|random|tame|exaggerate|undo|redo|retry|backup|lab-state|status|save|save-one|recolor|morph|rotate|zoom|repeat-|beat|bar|freeze|unfreeze|look-apply|theme|accent|palette|fx|preset|camera-move|kinetic|motion|animate|split|razor|cut-here|add-|dup-|duplicate|copy|paste)/;
  const EVERY_RE = /^(shuffle|reshuffle|surprise|still|shot|screenshot|backup|lab-state|status|theme|recolor|board-random|look-apply|save-one|grab|forge-shot|forge-snap|usage|tokens|meter)/;
  const NO_REPEAT_AREAS = /^(Flows)$/;
  function repeatOf(def, meta, qs) {
    if (meta && meta.repeat !== undefined) return meta.repeat === 'every' ? 'every' : meta.repeat ? 'count' : false;
    if (NO_REPEAT_AREAS.test(def.area || '') || qs.some((q) => q.kind === 'yesno' || q.kind === 'command')) return false;
    if (EVERY_RE.test(def.name)) return 'every';
    return REPEAT_RE.test(def.name) ? 'count' : false;
  }
  // Every value a question offers comes as { label, value, hint? }; suggestions from complete() are added by the page.
  // def: { name, args, area, desc, examples?, complete? (bool or fn), variants? } · meta: cmdpage-data.js Q[name]
  function questionsFor(def, meta = null) {
    if (!def || !def.name) return { qs: [], repeat: false, needs: 0 };
    let qs;
    if (meta && Array.isArray(meta.q)) qs = meta.q.map((q, i) => ({ kind: q.options && !q.free ? 'choice' : 'text', required: false, free: !q.options, pos: i, ...q, options: (q.options || []).map((o) => (typeof o === 'string' ? { label: o, value: o } : { ...o })) }));
    else {
      const f = forms(def.args);
      qs = f ? [f] : seqQuestions(tokens(def.args)).qs;
      const req = qs.filter((q) => q.required); const opt = qs.filter((q) => !q.required);
      // many optional inputs: the first few one by one, the rest in one "anything else?" box
      if (opt.length > MAX_OPTIONAL) {
        const keep = new Set(opt.slice(0, MAX_OPTIONAL));
        const rest = opt.slice(MAX_OPTIONAL);
        qs = qs.filter((q) => q.required || keep.has(q));
        qs.push({ kind: 'text', label: `anything else (${rest.map((q) => inner(q.token || '')).join(' ').slice(0, 60)})`, required: false, free: true, pos: qs.length, more: true });
      }
      void req;
    }
    // suggestions from the command's own examples ("/size 9:16" → 9:16) for the first input
    if (qs[0] && Array.isArray(def.examples)) {
      const vals = def.examples.map((e) => String(e).replace(/^\/\S+\s*/, '').trim()).filter((v) => v && !/^\//.test(v));
      const first = qs[0];
      const known = new Set((first.options || []).map((o) => String(o.value)));
      const fromEx = vals.map((v) => (first.free || first.form ? v : v.split(/\s+/)[0])).filter((v) => v && !known.has(v) && known.add(v));
      if (first.free && fromEx.length) first.examples = fromEx.slice(0, 6);
    }
    if (qs[0] && def.complete) qs[0].fromComplete = true;
    qs.forEach((q, i) => { q.id = q.id || `q${i + 1}`; q.title = titleOf(q); for (const o of q.options || []) for (const t of o.then || []) t.title = titleOf(t); });
    const repeat = repeatOf(def, meta, qs);
    return { qs, repeat, needs: qs.filter((q) => q.required).length };
  }
  // A list of questions is valid when every question has an id, a title, a kind, and choices have options.
  function checkQuestions(list) {
    const errs = [];
    const seen = new Set();
    for (const q of list.qs || []) {
      if (!q.id || seen.has(q.id)) errs.push(`bad id ${q.id}`);
      seen.add(q.id);
      if (!q.title) errs.push(`${q.id}: no title`);
      if (!['choice', 'yesno', 'count', 'text', 'command'].includes(q.kind)) errs.push(`${q.id}: kind ${q.kind}`);
      if ((q.kind === 'choice' || q.kind === 'yesno') && !(q.options || []).length) errs.push(`${q.id}: no options`);
      for (const o of q.options || []) if (o.value == null || o.label == null) errs.push(`${q.id}: an option without label / value`);
    }
    return errs;
  }

  // ---------- the guided run as a flow ----------
  const REPEAT_OPTS = (every) => [
    { label: 'Once', value: '' }, { label: '2 times', value: '/repeat 2' }, { label: '3 times', value: '/repeat 3' }, { label: '5 times', value: '/repeat 5' },
    ...(every ? [{ label: 'Every 30 seconds', value: '/every 30s' }, { label: 'Every 5 minutes', value: '/every 5m' }] : []),
  ];
  // stages: [{ name, qs, repeat }] (questionsFor of each chosen command, its name); returns a Flows flow
  function buildFlow(stages, { title = '', icon = '☰' } = {}) {
    const S = stages.slice(0, MAX_STAGES);
    const nodes = [];
    const sid = (i) => `s${i + 1}`;
    // a question node; follow-ups of a form's options get their own nodes, then back to `after`
    function qNodes(i, q, idBase, after) {
      const id = `${sid(i)}${idBase}`;
      const meta = { kind: q.kind, label: q.label, required: Boolean(q.required), free: Boolean(q.free), fromComplete: Boolean(q.fromComplete), examples: q.examples || undefined, cmd: S[i].name, pos: q.pos, prefix: q.prefix || undefined, unit: q.unit || undefined, more: q.more || undefined, form: q.form || undefined };
      const pure = (q.kind === 'choice' || q.kind === 'yesno') && !q.free;
      const opts = (q.options || []).map((o) => ({ label: o.label, value: String(o.value), hint: o.hint || undefined, then: o.then }));
      const vars = [`${id}`];
      if (pure || (q.form && opts.some((o) => o.then?.length))) {
        const options = [];
        opts.forEach((o, k) => {
          const follow = (o.then || []);
          let next = after;
          for (let m = follow.length - 1; m >= 0; m--) { const fid = `o${k + 1}q${m + 1}`; const made = qNodes(i, follow[m], `${idBase}${fid}`, next); next = made.first; vars.push(...made.vars); }
          options.push({ label: o.label, value: o.value, hint: o.hint, ...(next !== after ? { next } : {}) });
        });
        if (q.free) options.push({ label: 'Something else (type it)', value: '__type', next: `${id}t` });
        if (!q.required) options.push({ label: 'Skip', value: '', skip: true });
        nodes.push({ id, kind: 'choice', title: q.title, var: id, q: meta, options, next: after });
        if (q.free) nodes.push({ id: `${id}t`, kind: 'text', title: q.title, var: `${id}t`, q: { ...meta, typed: true }, optional: !q.required, next: after }); // its words stand for the choice (fillLine)
        return { first: id, vars };
      }
      nodes.push({ id, kind: 'text', title: q.title, var: id, q: { ...meta, options: opts.map(({ then, ...o }) => o) }, optional: !q.required, placeholder: q.placeholder || (q.examples?.[0] ? `e.g. ${q.examples[0]}` : ''), next: after });
      return { first: id, vars };
    }
    const stageStart = [];
    S.forEach((st, i) => {
      const after = `${sid(i)}rep`;
      const qs = st.qs || [];
      // build back to front so each question knows what follows it
      let next = st.repeat ? after : `${sid(i)}then`;
      const varsOf = [];
      const firsts = [];
      for (let j = qs.length - 1; j >= 0; j--) { const made = qNodes(i, qs[j], `q${j + 1}`, next); next = made.first; firsts.unshift(made.vars); }
      for (const v of firsts) varsOf.push(v);
      stageStart.push(next);
      st._vars = varsOf;
      if (st.repeat) nodes.push({ id: after, kind: 'choice', title: 'How many times?', var: after, q: { kind: 'count', label: 'how many times', cmd: st.name, repeat: true }, options: REPEAT_OPTS(st.repeat === 'every'), next: `${sid(i)}then` });
      const more = i + 1 < MAX_STAGES;
      nodes.push({ id: `${sid(i)}then`, kind: 'choice', title: 'Then…', var: `${sid(i)}then`, q: { kind: 'chain', cmd: st.name },
        options: [{ label: 'That\'s all: show me what will happen', value: 'done', next: 'summary' }, ...(more ? [{ label: 'Then another command… (it can use this result)', value: 'more', next: `${sid(i + 1)}pick` }] : [])] });
      if (more) {
        const nx = S[i + 1];
        nodes.push({ id: `${sid(i + 1)}pick`, kind: 'text', title: 'Which command next?', var: `${sid(i + 1)}cmd`, q: { kind: 'command', label: 'the next command', pick: i + 1, required: true }, placeholder: 'shuffle, still, board-add…', next: nx ? null : 'summary' });
      }
    });
    // each pick leads to the first question of its stage
    S.forEach((st, i) => { const p = nodes.find((n) => n.id === `${sid(i)}pick`); if (p) p.next = stageStart[i]; });
    // the summary, then the commands in order, then the result
    nodes.push({ id: 'summary', kind: 'choice', title: 'Ready? This is what will happen', var: 'go', q: { kind: 'summary' },
      options: [{ label: '▶ Run', value: 'run', next: `${sid(0)}run` }, { label: 'Not now', value: 'no', next: 'cancelled' }] });
    S.forEach((st, i) => {
      const parts = (st._vars || []).map((vs) => vs.map((v) => `{${v}}`).join(' '));
      const line = `${st.repeat ? `{${sid(i)}rep} ` : ''}/${st.name} ${parts.join(' ')}`;
      nodes.push({ id: `${sid(i)}run`, kind: 'action', title: `Run /${st.name}`, cmd: line.replace(/\s+/g, ' ').trim(), refill: true, var: `out${i + 1}`, next: i + 1 < S.length ? `${sid(i + 1)}run` : 'result' });
      delete st._vars;
    });
    nodes.push({ id: 'result', kind: 'result', title: 'Done', text: '{last}' });
    nodes.push({ id: 'cancelled', kind: 'result', title: 'Nothing ran', text: 'Nothing ran (Not now). Again starts it over.' });
    const name = title || S.map((s) => `/${s.name}`).join(' → ');
    return { id: `cmd-${S.map((s) => s.name).join('+')}`.slice(0, 80), name, icon, guided: true, commands: S.map((s) => s.name), start: stageStart[0] || 'summary', nodes };
  }
  // The values the "Skip" / "type it" options leave: the variable to read for a question node
  function valueOf(run, node) {
    const v = run.vars[node.var || node.id];
    if (v === '__type') return run.vars[`${node.id}t`] ?? '';
    return v ?? '';
  }
  // A step's command line with the run's answers: "Something else (type it)" stands for the words typed after it,
  // {last} is the result of the step before (one line); display: true names it instead ("the result of step 1")
  function fillLine(cmd, vars, { display = false } = {}) {
    return String(cmd || '').replace(/\{(\w+)\}/g, (_, k) => {
      if (k === 'last' || vars[k] === '{last}') return display ? '‹the result before›' : String(vars.last ?? '').replace(/\s+/g, ' ').trim().slice(0, 2000);
      const v = vars[k];
      if (v == null) return '';
      if (v === '__type') return String(vars[`${k}t`] ?? '');
      return String(v);
    }).replace(/\s{2,}/g, ' ').trim();
  }
  // The command lines a run will run (or ran), filled with its answers: for the summary
  function planLines(flow, vars) {
    return flow.nodes.filter((n) => n.kind === 'action' && n.refill).map((n) => {
      const line = fillLine(n.cmd, vars, { display: true });
      const rep = line.match(/^\/(repeat|every)\s+(\S+)\s+(\/[\s\S]*)$/);
      return { id: n.id, line: rep ? rep[3] : line, raw: line, times: rep ? (rep[1] === 'repeat' ? `${rep[2]} times` : `every ${rep[2]}`) : '', feeds: /‹the result before›/.test(line) };
    });
  }
  // How far a run is: { at, total } counted over the question steps on its way (done + the ones left on the path)
  function progress(run, nodeOf) {
    const QK = (n) => n && (n.kind === 'choice' || n.kind === 'text') && n.q;
    const done = run.steps.filter((e) => (e.status === 'done' || e.status === 'skipped') && QK(nodeOf(run, e.node))).length;
    let left = 0; let id = run.at; const seen = new Set();
    while (id && !seen.has(id)) {
      seen.add(id);
      const n = nodeOf(run, id);
      if (!n || n.kind === 'action' || n.kind === 'result') break;
      if (QK(n)) left += 1;
      if (n.id === 'summary') break;
      id = n.kind === 'choice' ? ((n.options || []).find((o) => !o.skip && o.value !== 'more')?.next || n.next) : n.next;
    }
    return { at: Math.min(done + 1, done + left), total: done + left, done };
  }
  return { MAX_STAGES, tokens, questionOf, questionsFor, checkQuestions, buildFlow, planLines, fillLine, progress, valueOf, titleOf, isPlaceholder, nounOf, forms, REPEAT_OPTS };
})();
if (typeof module !== 'undefined') module.exports = CmdPageCore;
