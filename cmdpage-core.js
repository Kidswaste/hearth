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
  // Placeholder words (an input you type) vs literal values (a choice). Alone in brackets almost any word is a
  // placeholder (`[board]` = a board's name) unless it reads as a flag (`[copy]`, `[hq]`, `[quiet]`); among several
  // `a|b|c` only the strong ones are (`<name | none>` = a name, or "none"; `[look|effect|size]` = three choices).
  const STRONG = /^(#|n|x|name|names|text|message|messages|words|word|what|question|task|command|cmd|time|seconds|secs|ms|minutes|days|filter|search|title|value|values|agent|model|tag|tags|note|fact|idea|prompt|expression|code|amount|percent|px|bpm|frames|frame|degrees|interval|delay|path|url|file|folder|query|topic|language|group|answer|step|round|beat|clip|slider|layer|node|preset|template|style|flow|sequence|board|chat|color|colors|goal|any color|hex codes|picture path|item name|scene name|first message|instruction|instructions|fact to remember|lines|count|rounds|passes|seats|factor|max)$/i;
  const LOOSE = /^(level|kind|type|mode|side|background|ratio|focus|layout|lens|shape|stamp|starter|sticker|harmony|format|fps|from|to|at|range|scene|label|key|field|action|tool|tab|area|category|playground|animation|transition|look|palette|move|part|start|end|in|out|adjustment|feature|bars|beats|size|video|picture|hex|text color|feedback|reply|subject|what you want to do|what it should do|genre or behavior|layout or device|search or #tag|words or #tag|search or category|category or search|lfo|band|depth|script name|json args|backup zip path|path to export \.zip\/\.json|time math|zoom|persona|judge|item|v2\.1|seed|ease|loop|duration|speed|opacity|volume|angle|width|height|padding|gap|source|target|output|input|direction|position|corner|amount%|depth%)$/i;
  const NUMERIC = /^(#|n|count|rounds|passes|seats|seconds|secs|ms|minutes|days|amount|percent|px|bpm|frames|degrees|lines|fps|factor|max|bars|beats|interval|delay|-?\d+(\.\d+)?[–-]\d+(\.\d+)?|n bullets)$/i;
  // among several a|b|c values only these read as "you type it" (`[look|effect|size]` stays three choices)
  const VSTRONG = /^(#|n|x|name|text|message|words|what|question|task|command|expression|code|filter|search|idea|prompt|fact|answer|model|agent|time|seconds|ms|tag|goal|query|topic|path|url|value|group|any color|hex codes)$/i;
  const clean = (w) => String(w || '').trim().replace(/^[<[]|[>\]]$/g, '').replace(/[…]+$/, '').trim();
  const strongPh = (w) => { const t = clean(w); return !t || STRONG.test(t) || /[<>=]/.test(w) || (/^#\w+/.test(t) && !/^#[0-9a-f]{3,8}$/i.test(t)) || (/\s/.test(t) && t.split(/\s+/).every((x) => STRONG.test(x) || LOOSE.test(x) || /^or$/i.test(x))); };
  const anyPh = (w) => strongPh(w) || LOOSE.test(clean(w));
  const isPlaceholder = anyPh;
  const isNumeric = (w) => NUMERIC.test(clean(w)) || /^N$/.test(String(w).trim());
  const article = (w) => (/^[aeiou]/i.test(w) && !/^(one|use)/i.test(w) ? 'an' : 'a');
  // "name" → "a name", "words" → "some words", "#" → "a number"
  function nounOf(w) {
    const t = clean(w).toLowerCase();
    if (!t) return 'a value';
    if (t === '#' || t === 'n') return 'a number';
    if (/^(words|text|colors|frames|seconds|days|lines|rounds|passes|seats|tags|nodes|values|names|instructions|hex codes|bars|beats|messages)$/.test(t)) return `some ${t}`;
    if (/^(what you want to do|what it should do)$/.test(t)) return t;
    return `${article(t)} ${t}`;
  }
  // Tokens of an args string, brackets nested: <…> required, […] optional, | between forms, bare words literal.
  function tokens(args) {
    const s = String(args || '');
    const out = [];
    let i = 0;
    while (i < s.length) {
      const c = s[i];
      if (/\s/.test(c)) { i++; continue; }
      if (c === '|') { out.push('|'); i++; continue; }
      if (c === '<' || c === '[') {
        let depth = 0; let j = i;
        for (; j < s.length; j++) { if (s[j] === '<' || s[j] === '[') depth++; else if (s[j] === '>' || s[j] === ']') { depth--; if (!depth) break; } }
        out.push(s.slice(i, j + 1)); i = j + 1; continue;
      }
      let j = i;
      while (j < s.length && !/[\s|<[]/.test(s[j])) j++;
      out.push(s.slice(i, j)); i = j;
    }
    return out;
  }
  const inner = (t) => String(t).replace(/^[<[]/, '').replace(/[>\]]$/, '').trim();
  // splits on | outside nested brackets
  function splitTop(body) {
    const parts = ['']; let depth = 0;
    for (const c of body) {
      if (c === '<' || c === '[') depth++;
      if (c === '>' || c === ']') depth--;
      if (c === '|' && depth <= 0) parts.push(''); else parts[parts.length - 1] += c;
    }
    return parts.map((x) => x.trim()).filter(Boolean);
  }
  const NUM_OPTS = (w) => {
    const range = clean(w).match(/^(-?\d+(?:\.\d+)?)[–-](\d+(?:\.\d+)?)$/);
    if (range) return [range[1], String(Math.round(((Number(range[1]) + Number(range[2])) / 2) * 100) / 100), range[2]];
    const t = clean(w).toLowerCase();
    return t === 'interval' ? ['30s', '1m', '5m', '8 bars'] : t === 'delay' ? ['30s', '2m', '10m'] : /^(seconds|secs)$/.test(t) ? ['5', '10', '30'] : t === 'ms' ? ['50', '100', '250']
      : t === 'percent' ? ['25', '50', '100'] : t === 'bpm' ? ['90', '120', '128', '140'] : t === 'degrees' ? ['15', '45', '90'] : t === 'days' ? ['1', '7', '30'] : t === 'fps' ? ['24', '30', '60'] : ['1', '2', '3', '5', '10'];
  };
  const ELLIPSIS = /^(…|\.\.\.)$/;
  // "a number from 0.5 to 4", "how many rounds", "how often", "a tempo (BPM)"
  function countLabel(w) {
    const t = clean(w);
    const r = t.match(/^(-?\d+(?:\.\d+)?)[–-](\d+(?:\.\d+)?)$/);
    if (r) return `a number from ${r[1]} to ${r[2]}`;
    return ({ '#': 'a number', n: 'a number', N: 'a number', ms: 'a time in milliseconds', seconds: 'how many seconds', secs: 'how many seconds', interval: 'how often', delay: 'how long to wait', bpm: 'a tempo (BPM)', percent: 'a percentage', px: 'a size in pixels', degrees: 'an angle in degrees', fps: 'frames per second', factor: 'a factor', amount: 'an amount', max: 'a maximum' })[t] || `how many ${t}`;
  }
  // one bracketed token → a question
  function questionOf(tok, { pos = 0, first = false } = {}) {
    const required = tok.startsWith('<');
    if (!required && !tok.startsWith('[')) return null;
    const body = inner(tok);
    if (!body) return null;
    const base = { required, token: tok, pos, first };
    if (/^\/|<\/|\/command|\/cmd/.test(body)) return { ...base, kind: 'command', label: 'a command', free: true, multi: /…|;/.test(body) };
    const parts = splitTop(body);
    // several forms inside ("[reset | status | save <name>]", "[last | code [n] | all]"): one choice, follow-ups per form
    if (parts.length > 1 && parts.some((p) => /\s/.test(p) && /[<[]/.test(p))) { const f = formsOf(parts.map((p) => tokens(p)), required); return f && { ...base, ...f }; }
    if (parts.length === 1) {
      const t = tokens(body);
      // "seed N", "rate <0.5-2>": a word, then the input
      if (t.length === 2 && !/[<[]/.test(t[0]) && !STRONG.test(t[0]) && (/^[<[]/.test(t[1]) || /^(#|n|N)$/.test(t[1]) || /^-?\d+(\.\d+)?[–-]\d/.test(t[1]))) {
        const q = questionOf(`<${inner(t[1])}>`, { pos, first });
        return q && { ...q, required, token: tok, prefix: t[0], label: `${t[0]}: ${q.label}` };
      }
      if (isNumeric(body)) return { ...base, kind: 'count', label: countLabel(body), unit: clean(body), free: true, options: NUM_OPTS(body).map((v) => ({ label: v, value: v })) };
      if (anyPh(body) || /\s/.test(body)) return { ...base, kind: 'text', label: nounOf(body), free: true, multi: /…/.test(body), options: [] };
      // a flag: [copy], [hq], [quiet] → yes or no
      return { ...base, kind: 'yesno', label: body, flag: true, free: false, options: [{ label: `Yes (${body})`, value: body }, { label: 'No', value: '' }] };
    }
    const dots = parts.some((p) => ELLIPSIS.test(p));
    const multiPh = (p) => VSTRONG.test(clean(p)) || /[<>=]/.test(p) || (/\s/.test(clean(p)) && strongPh(p));
    const multiNum = (p) => /^(#|n|N)$/.test(clean(p)) || /^-?\d+(\.\d+)?[–-]\d/.test(clean(p)) || /^(ms|bpm|seconds|px|percent)$/i.test(clean(p));
    const lits = parts.filter((p) => !ELLIPSIS.test(p) && ((!multiPh(p) && !multiNum(p)) || /^\d+(\.\d+)?$|^\d+\s?(bars?|beats?|s|m)$/i.test(p)));
    const holders = parts.filter((p) => !lits.includes(p) && !ELLIPSIS.test(p));
    const low = lits.map((x) => x.toLowerCase());
    if (low.includes('on') && low.includes('off') && lits.length <= 3 && !holders.length) {
      const extra = lits.filter((x) => !/^(on|off)$/i.test(x));
      return { ...base, kind: 'yesno', label: 'on or off', free: false, options: [{ label: 'Yes (on)', value: 'on' }, { label: 'No (off)', value: 'off' }, ...extra.map((x) => ({ label: x, value: x }))] };
    }
    const opts = lits.map((x) => ({ label: x, value: x }));
    if (!holders.length) return { ...base, kind: 'choice', label: parts.length > 4 ? 'one option' : lits.join(' or '), free: dots, options: opts };
    if (holders.length === 1 && multiNum(holders[0])) return { ...base, kind: 'count', label: `${countLabel(holders[0])}${lits.length ? ` (or ${lits.slice(0, 3).join(', ')})` : ''}`, unit: clean(holders[0]), free: true, options: [...NUM_OPTS(holders[0]).map((v) => ({ label: v, value: v })), ...opts] };
    const noun = nounOf(holders[0]);
    return { ...base, kind: 'text', label: lits.length ? `${noun} (or ${lits.slice(0, 3).join(', ')})` : noun, free: true, options: opts, multi: /…/.test(body) };
  }
  // The questions in a sequence of tokens (one form of the command)
  function seqQuestions(toks) {
    const out = [];
    let lead = []; // literal words before an input ("rate <0.5-2>", "gain <auto|…>"): written before the value
    for (const t of toks) {
      if (t === '|') continue;
      if (!/^[<[]/.test(t)) { lead.push(t); continue; }
      const q = questionOf(t, { pos: out.length, first: !out.length });
      if (q) {
        if (lead.length) { q.prefix = [lead.join(' '), q.prefix].filter(Boolean).join(' '); q.label = `${lead.join(' ')}: ${q.label}`; }
        out.push(q);
      }
      lead = [];
    }
    return { qs: out, lead: lead.join(' ') };
  }
  // Forms: [[tokens], …] → one question: a choice of the form, each option with its own follow-up questions
  function formsOf(groups, required = true) {
    const opts = [];
    let free = false; let freeLabel = ''; let anyOptional = false;
    for (const g of groups.filter((x) => x.length)) {
      const head = g[0];
      if (/^[<[]/.test(head)) {
        // a bracketed first token: its literal values are forms of their own, a placeholder means "type it"
        if (head.startsWith('[')) anyOptional = true;
        const q = questionOf(head, { first: true });
        const rest = seqQuestions(g.slice(1)).qs;
        if (!q) continue;
        if (q.kind === 'choice' || q.kind === 'yesno') {
          for (const o of q.options) if (o.value) opts.push({ label: o.label, value: o.value, then: rest });
          if (q.free) { free = true; freeLabel = freeLabel || 'something else'; }
        } else {
          free = true; freeLabel = freeLabel || q.label.replace(/ \(or .*$/, '');
          for (const o of q.options || []) if (!/^\d+$/.test(o.value)) opts.push({ label: o.label, value: o.value, then: rest });
        }
        continue;
      }
      const words = []; let i = 0;
      while (i < g.length && !/^[<[]/.test(g[i])) words.push(g[i++]);
      const sq = seqQuestions(g.slice(i));
      opts.push({ label: words.join(' '), value: words.join(' '), then: sq.qs });
    }
    const seen = new Set();
    const options = opts.filter((o) => o.value && !seen.has(o.value) && seen.add(o.value));
    if (!options.length && !free) return null;
    return { kind: free ? 'text' : 'choice', label: free ? `${freeLabel}, or one of these` : 'what you want it to do', required: required && !anyOptional, free, form: true, options };
  }
  // Top-level forms: "<answer> | resume | again | refine <what> | stop"
  function forms(args) {
    const toks = tokens(args);
    if (!toks.includes('|')) return null;
    const groups = [[]];
    for (const t of toks) { if (t === '|') groups.push([]); else groups.at(-1).push(t); }
    // "on | off", "game | clean": one plain choice (required: nothing is in brackets)
    if (groups.every((g) => g.length === 1 && !/^[<[]/.test(g[0]))) return questionOf(`<${groups.map((g) => g[0]).join('|')}>`, { first: true });
    const f = formsOf(groups, !/^\[/.test(toks[0]));
    return f && { ...f, pos: 0, first: true };
  }
  // A short question title for the page: "This needs: a frame size", "Optional: a name", "Yes or no?", "How many?"
  function titleOf(q) {
    if (q.title) return q.title;
    if (q.kind === 'yesno') return `Yes or no?${q.label && q.label !== 'on or off' ? ` (${q.label})` : ''}`;
    if (q.kind === 'count') return /^how many /.test(q.label) ? `${q.required ? '' : 'Optional: '}${q.required ? 'H' : 'h'}ow many ${q.label.slice(9)}?` : `${q.required ? 'This needs' : 'Optional'}: ${q.label}`;
    if (q.kind === 'command') return q.required ? 'This needs: a command to run' : 'Optional: a command to run';
    return `${q.required ? 'This needs' : 'Optional'}: ${q.label}`;
  }
  // Verbs that make a command worth repeating (once / n times / every…): it changes or makes something
  const REPEAT_RE = /^(shuffle|reshuffle|surprise|still|shot|screenshot|grab|tap|kick|snare|hit|marker|cue|nudge|next|prev|step|frame-step|next-frame|board-random|random|tame|exaggerate|undo|redo|retry|backup|lab-state|status|save|save-one|recolor|morph|rotate|zoom|repeat-|beat|bar|look-apply|theme|accent|palette|fx|preset|camera-move|kinetic|motion|animate|split|razor|cut-here|add-|dup-|duplicate|copy|paste)/;
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
      const vars = [`${id}${q.prefix ? `|${q.prefix}` : ''}`]; // {id|prefix}: "seed 7" only when answered
      if (pure || (q.form && opts.some((o) => o.then?.length))) {
        const options = [];
        opts.forEach((o, k) => {
          const follow = (o.then || []);
          let next = after;
          const fv = [];
          for (let m = follow.length - 1; m >= 0; m--) { const made = qNodes(i, follow[m], `${idBase}o${k + 1}q${m + 1}`, next); next = made.first; fv.unshift(...made.vars); }
          vars.push(...fv);
          options.push({ label: o.label, value: o.value, hint: o.hint, ...(next !== after ? { next } : {}) });
        });
        if (q.free) options.push({ label: 'Something else (type it)', value: '__type', next: `${id}t` });
        if (!q.required && !options.some((x) => x.value === '')) options.push({ label: 'Skip', value: '', skip: true });
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
    return String(cmd || '').replace(/\{(\w+)(?:\|([^}]*))?\}/g, (_, k, pre) => {
      let v = vars[k];
      if (v === '__type') v = vars[`${k}t`];
      if (k === 'last' || v === '{last}') v = display ? '‹the result before›' : String(vars.last ?? '').replace(/\s+/g, ' ').trim().slice(0, 2000);
      if (v == null || v === '') return '';
      return pre ? `${pre} ${v}` : String(v);
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
