// Flows (round 10): the owner's chat commands as small node graphs he walks through. A flow is a few steps
// (nodes): an action that runs an existing chat command, a choice (options as buttons, yes / no), a text input, an
// "AI does this" step (a prompt to Claude or Astra), a check that waits for something, and a result. Every walk
// through a flow is a run: an object kept on disk (kv `flow-runs`) with the flow it followed, where it is, every
// choice / text / output with times, and a status (running · waiting for you · waiting for AI · hung · done ·
// stopped). Runs survive a restart: a step that was running when Hearth closed (or ran too long, or whose engine
// stopped) is "hung", and resume() picks it up again from that step. A finished run can run again from the start
// with the same answers (same prompt, new result), branch from any step with a changed answer (the old run keeps its
// history, like chat branches), or be refined (keep the output, say what to change, the AI redoes it).
//
// This file is the engine only (no DOM): it runs in the app and in Node for the unit tests (dev/flows-test.js).
// The app plugs in its environment with Flows.configure({ … }) (flows-ui.js): how a command runs, how an AI step
// asks, where runs are saved, what a command's arguments are.
//
// Flow JSON (also what a chat writes for "make a flow for X", checked by validate()):
//   { id, name, desc, icon, area, start: 'n1', nodes: [
//     { id: 'n1', kind: 'choice', title: 'Everything OK?', var: 'ok', options: ['yes', 'no'] | [{ label, value, next, set }], next },
//     { id, kind: 'text', title, var, placeholder, optional, argsOf: 'cmd' (hint + suggestions from that command), next },
//     { id, kind: 'action', title, cmd: '/doctor {mode}', var, next, onError },
//     { id, kind: 'ai', title, engine: 'claude' | 'astra', prompt: 'Plan {about}…', inChat: false, var, next },
//     { id, kind: 'check', title, cmd: '/x' (polled) | ask: 'Is it done?' (you confirm), match: 'regex', every: ms, timeout: ms, next, onFail },
//     { id, kind: 'result', title, text: '{last}' } ] }
// Text in cmd / prompt / text fills {var} from the run's answers and outputs ({last} = the latest output).
const Flows = (() => {
  const KINDS = ['start', 'action', 'choice', 'text', 'ai', 'check', 'result'];
  const STATUS = ['running', 'waiting-you', 'waiting-ai', 'hung', 'done', 'stopped'];
  const STATUS_LABEL = { running: 'running', 'waiting-you': 'waiting for you', 'waiting-ai': 'waiting for AI', hung: 'hung: pick up here', done: 'done', stopped: 'stopped' };
  // how long a step may run before it counts as hung (a check uses its own timeout)
  const LIMIT = { action: 120000, ai: 360000, check: 180000 };
  const KEEP_RUNS = 80; // the newest runs kept on disk
  const OUT_MAX = 6000; // characters of output kept per step
  const flows = new Map(); // id → flow
  const runs = new Map(); // id → run
  const listeners = new Set();
  let env = {
    now: () => Date.now(),
    load: async (_name, def) => def,
    save: async () => {},
    runCommand: async () => '', // (line, { run, node }) → text output
    ask: async () => '', // ({ engine, prompt, run, node, inChat }) → reply text
    cmdInfo: () => null, // name → { name, args, desc } | null
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
  };
  let seq = 0;
  const uid = (p = 'r') => `${p}${env.now().toString(36)}${(seq++).toString(36)}`;
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const trim = (s, n = OUT_MAX) => { const t = String(s ?? ''); return t.length > n ? `${t.slice(0, n)}…` : t; };
  function configure(e) { env = { ...env, ...e }; return env; }
  const onChange = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
  function emit(run, what = 'change') { for (const fn of listeners) { try { fn(run, what); } catch (err) { console.warn(err); } } }

  // ---------- flows ----------
  // options: ['yes', 'no'] → [{ label: 'Yes', value: 'yes' }, …]
  const normOption = (o) => (typeof o === 'string' ? { label: o.charAt(0).toUpperCase() + o.slice(1), value: o } : { ...o, label: o.label ?? String(o.value), value: o.value ?? o.label });
  function normalize(flow) {
    const f = clone(flow || {});
    f.nodes = (Array.isArray(f.nodes) ? f.nodes : []).map((n) => ({ ...n, kind: n.kind || 'action', ...(n.options ? { options: n.options.map(normOption) } : {}) }));
    if (!f.start && f.nodes[0]) f.start = f.nodes[0].id;
    f.id = String(f.id || slug(f.name || 'flow'));
    f.name = String(f.name || f.id);
    return f;
  }
  const slug = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'flow';
  // { ok, errors: [text], warnings: [text] }: what's wrong with a flow before it can run (authoring / chats' JSON)
  function validate(flow) {
    const errors = []; const warnings = [];
    const f = normalize(flow);
    if (!f.nodes.length) errors.push('A flow needs at least one step');
    const ids = new Set();
    for (const n of f.nodes) {
      if (!n.id) { errors.push(`A step has no id (${n.title || n.kind})`); continue; }
      if (ids.has(n.id)) errors.push(`Two steps are called ${n.id}`);
      ids.add(n.id);
      if (!KINDS.includes(n.kind)) errors.push(`${n.id}: unknown kind "${n.kind}" (one of ${KINDS.join(', ')})`);
      if (n.kind === 'choice' && !(n.options || []).length) errors.push(`${n.id}: a choice needs options`);
      if (n.kind === 'action') {
        if (!/^[/{]/.test(String(n.cmd || ''))) errors.push(`${n.id}: an action runs a /command (cmd)`);
        else {
          const name = String(n.cmd).slice(1).split(/\s+/)[0].replace(/[{}]/g, '');
          if (!/^\{/.test(String(n.cmd).slice(1)) && name && !env.cmdInfo(name)) warnings.push(`${n.id}: /${name} isn't a command here`);
        }
      }
      if (n.kind === 'ai' && !String(n.prompt || '').trim()) errors.push(`${n.id}: an AI step needs a prompt`);
      if (n.kind === 'check' && !n.cmd && !n.ask) errors.push(`${n.id}: a check polls a /command (cmd) or asks you (ask)`);
    }
    const refs = (n) => [n.next, n.onError, n.onFail, ...(n.options || []).map((o) => o.next)].filter(Boolean);
    for (const n of f.nodes) for (const r of refs(n)) if (!ids.has(r)) errors.push(`${n.id} leads to "${r}", which isn't a step`);
    if (f.start && !ids.has(f.start)) errors.push(`start "${f.start}" isn't a step`);
    // steps nothing leads to (only a warning: an author may keep spares)
    const reach = new Set(); const stack = [f.start];
    while (stack.length) { const id = stack.pop(); if (!id || reach.has(id)) continue; reach.add(id); const n = f.nodes.find((x) => x.id === id); if (n) stack.push(...refs(n)); }
    for (const n of f.nodes) if (!reach.has(n.id)) warnings.push(`${n.id} (${n.title || n.kind}) can't be reached`);
    return { ok: !errors.length, errors, warnings, flow: f };
  }
  function define(flow, { source = 'builtin' } = {}) {
    const f = normalize(flow);
    f.source = f.source || source;
    flows.set(f.id, f);
    return f;
  }
  const get = (id) => flows.get(String(id || '')) || [...flows.values()].find((f) => f.name.toLowerCase() === String(id || '').toLowerCase()) || null;
  const list = () => [...flows.values()];
  function remove(id) { return flows.delete(id); }
  // A flow out of an AI reply: the first ```json block (or the whole text) parsed, normalized and checked.
  function fromText(text) {
    const s = String(text || '');
    const m = s.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, s.slice(s.indexOf('{'), s.lastIndexOf('}') + 1)];
    let obj;
    try { obj = JSON.parse(m[1]); } catch (err) { return { ok: false, errors: [`Not JSON: ${err.message}`], warnings: [] }; }
    return validate(obj);
  }

  // ---------- runs ----------
  const nodeOf = (run, id) => run.flow.nodes.find((n) => n.id === id) || null;
  const openEntry = (run) => { const e = run.steps.at(-1); return e && ['running', 'waiting', 'hung'].includes(e.status) ? e : null; };
  // {name} → the run's answers / outputs; {last} → the newest output
  function fill(text, vars) {
    return String(text || '').replace(/\{(\w+)\}/g, (_, k) => (vars[k] == null ? '' : String(vars[k]))).replace(/[ \t]{2,}/g, ' ').trim();
  }
  function setStatus(run, status, why = '') {
    run.status = status;
    run.why = why || undefined;
    run.updated = env.now();
  }
  const touch = (run) => { run.updated = env.now(); persistSoon(); emit(run); };

  function newRun(flow, { chatId = null, agentId = null, vars = {}, startVars = null, parent = null, replay = null, hints = null, title = '' } = {}) {
    const run = {
      startVars: { ...(startVars || vars) },
      id: uid('run'), flowId: flow.id, flowName: flow.name, flow: clone(flow), chatId, agentId,
      status: 'running', at: flow.start, steps: [], vars: { ...vars }, created: env.now(), updated: env.now(),
      gen: 0, parent, branches: [], replay: replay || undefined, hints: hints || undefined, title: title || undefined,
    };
    runs.set(run.id, run);
    return run;
  }
  async function start(flowId, opts = {}) {
    const flow = typeof flowId === 'object' ? normalize(flowId) : get(flowId);
    if (!flow) throw new Error(`No flow "${flowId}" (/flows lists them)`);
    const run = newRun(flow, opts);
    touch(run);
    await advance(run);
    return run;
  }
  // Moves a run on through every step that needs no one (actions, AI, checks) until it waits for you or ends.
  async function advance(run) {
    const gen = run.gen;
    for (let guard = 0; guard < 400; guard++) {
      if (run.gen !== gen || ['stopped', 'hung', 'done'].includes(run.status)) return run;
      const node = nodeOf(run, run.at);
      if (!node) { finish(run); return run; }
      let entry = openEntry(run);
      if (!entry || entry.node !== node.id) {
        entry = { node: node.id, kind: node.kind, title: node.title || node.kind, started: env.now(), status: 'running' };
        run.steps.push(entry);
      }
      // a step for some answers only: skipIf / skipUnless name a variable
      if ((node.skipIf && run.vars[node.skipIf]) || (node.skipUnless && !run.vars[node.skipUnless])) { complete(run, entry, node, { skipped: true }); continue; }
      if (node.kind === 'choice' || node.kind === 'text' || (node.kind === 'check' && node.ask && !node.cmd)) {
        // options from a command's own argument suggestions (/theme → every look), after the flow's own
        if (node.kind === 'choice' && node.optionsFrom && !entry.options && env.cmdOptions) {
          let more = [];
          try { more = (await env.cmdOptions(String(node.optionsFrom).replace(/^\//, ''), run)) || []; } catch { /* the flow's own options stay */ }
          const seen = new Set((node.options || []).map((o) => String(o.value)));
          entry.options = [...(node.options || []), ...more.map(normOption).filter((o) => !seen.has(String(o.value)) && seen.add(String(o.value)))].slice(0, 30);
          if (run.gen !== gen) return run;
        }
        // a text step that fills a command's arguments is skipped when that command takes none
        if (node.kind === 'text' && node.argsOf) {
          const info = env.cmdInfo(String(run.vars[node.argsOf] || '').replace(/^\//, ''));
          if (info && !String(info.args || '').trim()) { complete(run, entry, node, { input: '', skipped: true }); continue; }
          if (info) entry.hint = `/${info.name} ${info.args}`;
        }
        const replayed = run.replay && Object.prototype.hasOwnProperty.call(run.replay, node.id) ? run.replay[node.id] : undefined;
        if (replayed !== undefined) {
          delete run.replay[node.id];
          try { applyAnswer(run, entry, node, replayed, { replayed: true }); continue; } catch { /* that answer no longer fits: ask */ }
        }
        entry.status = 'waiting';
        setStatus(run, 'waiting-you');
        touch(run);
        return run;
      }
      if (node.kind === 'start') { complete(run, entry, node, {}); continue; }
      if (node.kind === 'result') {
        const out = fill(node.text || '{last}', run.vars);
        entry.output = trim(out);
        run.result = entry.output;
        complete(run, entry, node, {});
        if (!node.next) { finish(run); return run; }
        continue;
      }
      // action / ai / check: the work, with the run marked so a restart in the middle shows as hung
      setStatus(run, node.kind === 'ai' ? 'waiting-ai' : 'running');
      entry.status = 'running';
      entry.started = entry.started || env.now();
      touch(run);
      let out; let failed = null;
      try {
        if (node.kind === 'action') {
          const line = fill(node.cmd, run.vars);
          entry.input = line;
          out = await env.runCommand(line, { run, node });
        } else if (node.kind === 'ai') {
          const prompt = fill(node.prompt, run.vars);
          entry.input = trim(prompt, 1200);
          entry.engine = node.engine || 'claude';
          out = await env.ask({ engine: entry.engine, prompt, run, node, inChat: Boolean(node.inChat) });
          if (out == null || !String(out).trim()) throw new Error(`${entry.engine === 'astra' ? 'Astra' : 'Claude'} gave no answer`);
        } else {
          out = await check(run, node, entry, gen);
          if (out === CHECK_FAILED) { if (run.gen !== gen) return run; failed = new Error(`${node.title || 'The check'}: not there after ${Math.round((node.timeout || LIMIT.check) / 1000)} s`); out = ''; }
        }
      } catch (err) { failed = err; }
      if (run.gen !== gen || run.status === 'stopped') return run; // resumed, stopped or branched meanwhile: that one carries on
      if (failed) {
        const to = node.onError || (node.kind === 'check' ? node.onFail : null);
        entry.error = String(failed.message || failed).slice(0, 400);
        if (to) { complete(run, entry, node, { output: '', next: to, status: 'error' }); continue; }
        entry.status = 'hung';
        setStatus(run, 'hung', entry.error);
        touch(run);
        return run;
      }
      complete(run, entry, node, { output: out });
    }
    setStatus(run, 'hung', 'The flow went round in circles (400 steps)');
    touch(run);
    return run;
  }
  const CHECK_FAILED = Symbol('check failed');
  // polls node.cmd every node.every ms until its output matches node.match (or isn't empty), up to node.timeout
  async function check(run, node, entry, gen) {
    const every = Math.max(200, Number(node.every) || 3000);
    const limit = Number(node.timeout) || LIMIT.check;
    const re = node.match ? new RegExp(node.match, 'i') : null;
    const t0 = env.now();
    let tries = 0;
    for (;;) {
      const line = fill(node.cmd, run.vars);
      entry.input = line;
      const out = String(await env.runCommand(line, { run, node }) ?? '');
      tries += 1; entry.tries = tries;
      if (run.gen !== gen) return CHECK_FAILED;
      if (re ? re.test(out) : out.trim()) return out;
      if (env.now() - t0 + every > limit) return CHECK_FAILED;
      await env.sleep(every);
    }
  }
  function complete(run, entry, node, { input, output, choice, next, status = 'done', skipped, replayed } = {}) {
    entry.status = skipped ? 'skipped' : status;
    if (skipped && (node.kind === 'text' || node.kind === 'choice')) run.vars[node.var || node.id] = ''; // not last time's
    entry.ended = env.now();
    if (input !== undefined) entry.input = input;
    if (choice !== undefined) entry.choice = choice;
    if (replayed) entry.replayed = true;
    if (output !== undefined) {
      entry.output = trim(output);
      run.vars[node.var || node.id] = entry.output;
      if (String(output).trim()) run.vars.last = entry.output;
    }
    entry.vars = { ...run.vars }; // what the run knew after this step (branches start from it)
    run.at = next !== undefined ? next : node.next || null;
  }
  // value: a choice's value (or its label / number), a text's words
  function applyAnswer(run, entry, node, value, extra = {}) {
    if (node.kind === 'choice') {
      const opts = entry.options || node.options || [];
      const v = String(value ?? '').trim();
      const o = opts.find((x) => String(x.value).toLowerCase() === v.toLowerCase()) || opts.find((x) => String(x.label).toLowerCase() === v.toLowerCase())
        || (/^\d+$/.test(v) ? opts[Number(v) - 1] : null) || opts.find((x) => String(x.label).toLowerCase().startsWith(v.toLowerCase()) && v);
      if (!o) throw new Error(`“${value}” isn't one of: ${opts.map((x) => x.label).join(', ')}`);
      run.vars[node.var || node.id] = o.value;
      for (const [k, val] of Object.entries(o.set || {})) run.vars[k] = val;
      complete(run, entry, node, { choice: o.label, input: o.value, next: o.next || node.next || null, ...extra });
    } else if (node.kind === 'check') { // a check that asks you: yes moves on, no goes to onFail (or waits)
      const yes = /^(y|yes|ok|done|1|true)$/i.test(String(value).trim());
      if (!yes && !node.onFail) throw new Error('Waiting until it is: answer yes when it is done');
      complete(run, entry, node, { choice: yes ? 'Yes' : 'No', input: yes ? 'yes' : 'no', next: yes ? node.next || null : node.onFail, ...extra });
    } else {
      const t = String(value ?? '').trim();
      if (!t && !node.optional && !node.argsOf) throw new Error(`${node.title || 'This step'} needs some text`);
      run.vars[node.var || node.id] = t;
      complete(run, entry, node, { input: t, ...extra });
    }
  }
  // The answer to the step that waits for you: a choice, words, or yes / no.
  async function answer(runId, value) {
    const run = typeof runId === 'object' ? runId : runs.get(runId);
    if (!run) throw new Error('No such run');
    const entry = openEntry(run);
    const node = entry && nodeOf(run, entry.node);
    if (!node || run.status !== 'waiting-you') throw new Error(`${run.flowName} isn't waiting for an answer (${STATUS_LABEL[run.status] || run.status})`);
    applyAnswer(run, entry, node, value);
    setStatus(run, 'running');
    touch(run);
    await advance(run);
    return run;
  }
  function finish(run) {
    setStatus(run, 'done');
    run.at = null;
    run.ended = env.now();
    if (run.result == null) run.result = run.vars.last || '';
    touch(run);
  }
  function stop(runId) {
    const run = runs.get(runId?.id || runId);
    if (!run || run.status === 'done') return run;
    run.gen += 1;
    const e = openEntry(run);
    if (e) { e.status = 'stopped'; e.ended = env.now(); }
    setStatus(run, 'stopped');
    touch(run);
    return run;
  }
  // Pick up here: a hung or stopped run starts its current step again (the steps before it stay done).
  async function resume(runId) {
    const run = runs.get(runId?.id || runId);
    if (!run) throw new Error('No such run');
    if (run.status === 'done') throw new Error('That run is done: run it again or refine it');
    if (run.status === 'waiting-you') return run;
    run.gen += 1;
    const e = run.steps.at(-1);
    if (e && ['running', 'hung', 'stopped', 'waiting'].includes(e.status) && e.node === run.at) { e.status = 'retried'; e.ended = env.now(); }
    run.resumed = (run.resumed || 0) + 1;
    setStatus(run, 'running');
    touch(run);
    await advance(run);
    return run;
  }
  // Hung: steps running longer than they should (checked now and then) and, after a restart, every step that
  // was running when Hearth closed.
  function checkHung(now = env.now()) {
    const out = [];
    for (const run of runs.values()) {
      if (run.status !== 'running' && run.status !== 'waiting-ai') continue;
      const e = openEntry(run);
      const node = e && nodeOf(run, e.node);
      if (!e || !node) continue;
      const limit = Number(node.timeout) || LIMIT[node.kind] || LIMIT.action;
      if (now - (e.started || now) > limit + (node.kind === 'check' ? 5000 : 0)) {
        run.gen += 1; // whatever was still running for it no longer moves it
        e.status = 'hung';
        setStatus(run, 'hung', `${node.title || node.kind} ran for more than ${Math.round(limit / 1000)} s`);
        touch(run); out.push(run);
      }
    }
    return out;
  }
  // The same flow again from the start with the same answers: AI steps and actions run again (a new result).
  async function rerun(runId) {
    const old = runs.get(runId?.id || runId);
    if (!old) throw new Error('No such run');
    const replay = {};
    for (const e of old.steps) if ((e.kind === 'choice' || e.kind === 'text' || (e.kind === 'check' && e.choice)) && e.status === 'done' && e.input !== undefined) replay[e.node] = e.input;
    const run = newRun(old.flow, { chatId: old.chatId, agentId: old.agentId, vars: old.startVars || {}, parent: { run: old.id, step: 0, kind: 'again' }, replay, title: old.title });
    old.branches = [...(old.branches || []), run.id];
    touch(old); touch(run);
    await advance(run);
    return run;
  }
  // Change the answer of step `index` (0-based in run.steps) and continue from there in a new run (a branch);
  // the steps before it are copied, later choices show the old answers as hints.
  async function branch(runId, index, value) {
    const old = runs.get(runId?.id || runId);
    if (!old) throw new Error('No such run');
    const at = old.steps[index];
    if (!at) throw new Error(`No step ${index + 1} in that run`);
    const node = nodeOf(old, at.node);
    const kept = old.steps.slice(0, index).map((e) => ({ ...e, copied: true }));
    const vars = { ...(kept.at(-1)?.vars || old.startVars || {}) };
    const hints = {};
    for (const e of old.steps.slice(index + 1)) if (e.input !== undefined && (e.kind === 'choice' || e.kind === 'text')) hints[e.node] = e.input;
    const run = newRun(old.flow, { chatId: old.chatId, agentId: old.agentId, vars, startVars: old.startVars || {}, parent: { run: old.id, step: index, kind: 'branch' }, hints, title: old.title });
    run.steps = kept;
    run.at = at.node;
    if (value !== undefined && node && ['choice', 'text', 'check'].includes(node.kind)) run.replay = { [node.id]: value };
    old.branches = [...(old.branches || []), run.id];
    touch(old); touch(run);
    await advance(run);
    return run;
  }
  // Fine-tune a finished result: a "what should change?" step (unless you already said), then the AI redoes the
  // result keeping what works, then the result again. Added to this run (its steps keep the history).
  async function refine(runId, text = '', { engine } = {}) {
    const run = runs.get(runId?.id || runId);
    if (!run) throw new Error('No such run');
    if (run.status !== 'done') throw new Error('Refine a finished run (this one is not done yet)');
    const k = (run.refines || 0) + 1;
    run.refines = k;
    const eng = engine || run.flow.nodes.filter((n) => n.kind === 'ai').at(-1)?.engine || 'claude';
    const ask = { id: `refine-ask${k}`, kind: 'text', title: 'What should change?', var: `change${k}`, placeholder: 'e.g. shorter, warmer colors, a slower start…', next: `refine${k}` };
    const ai = { id: `refine${k}`, kind: 'ai', title: `Refine ${k}`, engine: eng, var: `refined${k}`,
      prompt: `Here is a result you made:\n"""\n{last}\n"""\nKeep what works and change only this: {change${k}}\nReply with the full new result.`, next: `refined-result${k}` };
    const res = { id: `refined-result${k}`, kind: 'result', title: `Refined ${k}`, text: `{refined${k}}` };
    const lastId = run.steps.at(-1)?.node;
    run.flow.nodes.push(ask, ai, res);
    const lastNode = nodeOf(run, lastId);
    if (lastNode && !lastNode.next) lastNode.refinedTo = ask.id; // drawn as a wire in the view
    run.at = ask.id;
    if (text) run.replay = { ...(run.replay || {}), [ask.id]: text };
    setStatus(run, 'running');
    run.ended = undefined;
    run.gen += 1;
    touch(run);
    await advance(run);
    return run;
  }

  // ---------- reading runs (the UI, the chats) ----------
  const getRun = (id) => runs.get(id) || null;
  const allRuns = () => [...runs.values()].sort((a, b) => b.updated - a.updated);
  const active = () => allRuns().filter((r) => r.status !== 'done' && r.status !== 'stopped');
  const ofChat = (chatId) => allRuns().filter((r) => r.chatId === chatId);
  // the step waiting now, as plain data: { node, entry, kind, title, options, hint, placeholder }
  function waiting(run) {
    const r = typeof run === 'object' ? run : runs.get(run);
    const e = r && openEntry(r);
    const node = e && e.status === 'waiting' && nodeOf(r, e.node);
    if (!node) return null;
    return { node, entry: e, kind: node.kind, title: node.title || node.kind, text: node.text || node.ask || '', options: node.kind === 'check' ? [{ label: 'Yes', value: 'yes' }, ...(node.onFail ? [{ label: 'No', value: 'no' }] : [])] : e.options || node.options || [], hint: e.hint || '', placeholder: node.placeholder || '', last: r.hints?.[node.id], guess: guessOf(r, node) };
  }
  // a choice Hearth can pre-pick from an earlier output (Doctor: "both engines can work" → Yes)
  function guessOf(run, node) {
    const g = node.guess;
    if (!g) return undefined;
    const v = String(run.vars[g.var] ?? '');
    if (!v) return undefined;
    try { return new RegExp(g.match, 'i').test(v) ? g.value : g.else; } catch { return undefined; }
  }
  // the step a run is on (waiting, running or hung), or null when it is done
  function current(run) {
    const r = typeof run === 'object' ? run : runs.get(run);
    const e = r && openEntry(r);
    return e ? { entry: e, node: nodeOf(r, e.node) } : null;
  }
  // One short line for a chat (token-frugal): "Doctor · step 3 · Fix it? — waiting for you · yes | no"
  function line(run) {
    const r = typeof run === 'object' ? run : runs.get(run);
    if (!r) return '';
    const w = waiting(r);
    const n = r.steps.filter((e) => e.status === 'done' || e.status === 'skipped').length;
    const opts = w && w.options.length ? ` · ${w.options.map((o) => o.value).join(' | ')}` : w?.kind === 'text' ? ' · (words)' : '';
    return `${r.flowName} (run ${r.id}) · ${n} step${n === 1 ? '' : 's'} done · ${w ? `“${w.title}” ` : ''}${STATUS_LABEL[r.status] || r.status}${r.why ? ` (${r.why})` : ''}${r.status === 'waiting-you' ? opts : ''}${r.status === 'done' && r.result ? ` · result: ${String(r.result).replace(/\s+/g, ' ').slice(0, 120)}` : ''}`;
  }

  // ---------- disk ----------
  let saveTimer = null;
  function persistSoon() { clearTimeout(saveTimer); saveTimer = setTimeout(persist, 250); }
  async function persist() {
    clearTimeout(saveTimer); saveTimer = null;
    const keep = allRuns().slice(0, KEEP_RUNS).map((r) => ({ ...r, flow: r.flow }));
    for (const id of [...runs.keys()]) if (!keep.some((r) => r.id === id)) runs.delete(id);
    await env.save('flow-runs', { v: 1, runs: keep });
  }
  // On start: the runs from disk; a step that was running when Hearth closed is hung (pick up here).
  async function restore() {
    const data = await env.load('flow-runs', { v: 1, runs: [] });
    runs.clear();
    for (const r of data?.runs || []) {
      if (!r?.id || !r.flow) continue;
      if (r.status === 'running' || r.status === 'waiting-ai') {
        const e = r.steps?.at(-1);
        if (e && e.status === 'running') e.status = 'hung';
        r.status = 'hung';
        r.why = 'Hearth closed during this step';
      }
      r.gen = 0;
      runs.set(r.id, r);
    }
    return runs.size;
  }

  return {
    KINDS, STATUS, STATUS_LABEL, LIMIT, configure, onChange, define, get, list, remove, validate, normalize, fromText, fill, slug,
    start, answer, advance, stop, resume, checkHung, rerun, branch, refine, restore, persist,
    run: getRun, runs: allRuns, active, ofChat, waiting, current, line, nodeOf,
  };
})();
if (typeof module !== 'undefined') module.exports = Flows;
