// Check this AI (round 32, aicheck). The owner, on Windows, lost an hour: Astra's commands were "blocked by policy",
// Claude's too until a fix, and nothing said what was wrong or what to press. So ⋯ AI setup → What it can use has one
// row, "Check this AI": a short real test through the AI's own engine, then a plain checklist with a fix on each
// failing line.
//   · Found and signed in: the engine is there, its version is new enough, it's signed in (EngineHealth's check, no
//     tokens) → Install / Update / Sign in (EngineHealth.fix: a visible window, the command shown first; Hearth never
//     sees a password).
//   · It answers, reads its folder, writes a file there, runs a command: ONE tiny run (lean: no Hearth tools, the
//     cheapest model, the least thinking; the AI's own Files setting kept: engines.js options.accessCheck). Hearth puts
//     a probe file with a code in the AI's first folder; the AI reads it, writes a new file, lists the folder. Hearth
//     judges from what happened (the code in the reply, the file on disk, the command's own result), not from what the
//     AI says, then moves both files to the Trash (recoverable).
//     → Allow edits / Allow commands (the AI's Files level, access.js), Run without its sandbox… (Astra on Windows, the
//     warned opt-in), Update Claude Code (its command tool refused at Full), Open AI setup.
//   · The last result and its time stay on the row (per computer: engines are per computer), so it can be read later.
//   · The one-line refusal notes in a chat (access.js) offer "Check this AI" too: one obvious next step.
// Nothing is added to normal prompts. /check-ai runs it from a chat.
const AiCheck = (() => {
  const LABEL = { claude: 'Claude Code', codex: 'Codex' };
  const KEY = (id) => `aicheck.last.${id}`;
  const TIMEOUT = 3 * 60000;
  const live = new Map(); // agentId → { lines, at } while a check runs
  const runs = new Map(); // engine chat id → event handler
  let wired = false;
  const short = (s, n = 140) => { const t = String(s ?? '').replace(/\s+/g, ' ').trim(); return t.length > n ? `${t.slice(0, n - 1)}…` : t; };
  const sep = (p) => (/^[A-Za-z]:\\/.test(p) || String(p).includes('\\') ? '\\' : '/');
  const join = (a, b) => `${String(a).replace(/[\\/]+$/, '')}${sep(a)}${b}`;
  const agentOf = (id) => (typeof H !== 'undefined' ? H.agent(id) : null);
  const changed = (agentId) => document.dispatchEvent(new CustomEvent('hearth:aicheck', { detail: { agentId } }));
  const last = (agentId) => { try { return store.get(KEY(agentId), null); } catch { return null; } };
  const keep = (agentId, r) => { try { store.set(KEY(agentId), r); } catch { /* no storage */ } };
  function wire() {
    if (wired) return;
    wired = true;
    const hand = (ev) => { const fn = runs.get(ev?.chatId); if (fn) fn(ev); };
    window.hub.onEngineEvent(hand);
    window.hub.onEngineLive?.(hand); // steps (a tool call's result) come on the live channel
  }
  async function onWindows() {
    if (typeof Access !== 'undefined' && Access.onWindows?.()) return true;
    try { return (await window.hub.platform?.()) === 'win32'; } catch { return false; }
  }

  // ---------- the engine: found, version, signed in (no tokens) ----------
  function engineLines(r, engine) {
    const L = LABEL[engine];
    const cmd = r?.plan?.command || '';
    if (!r?.found) return [{ k: 'found', ok: false, text: `${L} isn't installed (or Hearth can't find it)`, fix: 'install', cmd }];
    const lines = [{ k: 'found', ok: !r.broken, text: r.broken ? `${L} didn't answer (a broken copy?)` : `${L} found`, ...(r.broken ? { fix: 'update', cmd } : {}) }];
    if (r.tooOld) lines.push({ k: 'version', ok: false, text: `Version ${r.semver || '?'} is too old: it needs ${r.min} or newer`, fix: r.newer ? 'use-newest' : 'update', cmd });
    else lines.push({ k: 'version', ok: !r.broken, text: `Version ${r.semver || r.version || '?'}${r.min ? ` (needs ${r.min}+)` : ''}` });
    if (r.signedIn === false) lines.push({ k: 'signin', ok: false, text: `Not signed in to ${L}`, fix: 'login' });
    else lines.push({ k: 'signin', ok: r.signedIn === true ? true : null, text: r.signedIn === true ? 'Signed in' : 'Signed in? (the test message tells)' });
    return lines;
  }

  // ---------- one tiny real run ----------
  function runOnce(agent, text, options) {
    wire();
    const id = `aicheck-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    return new Promise((resolve) => {
      const seen = { tools: new Map(), steps: new Map(), failed: [], text: '' };
      const t0 = Date.now();
      const timer = setTimeout(() => { window.hub.stop(id).catch?.(() => {}); end({ type: 'error', message: `No answer after ${TIMEOUT / 60000} minutes` }); }, TIMEOUT);
      const end = (ev) => {
        clearTimeout(timer);
        runs.delete(id);
        if (ev.type === 'done' && ev.usage) document.dispatchEvent(new CustomEvent('hearth:usage', { detail: { agentId: agent.id, usage: ev.usage, source: 'check' } }));
        resolve({ ok: ev.type === 'done', text: ev.type === 'done' ? (ev.text || seen.text) : seen.text, error: ev.message || null, needsLogin: Boolean(ev.needsLogin), fixAction: ev.fixAction || null, usage: ev.usage || null, ms: Date.now() - t0, seen });
      };
      runs.set(id, (ev) => {
        if (ev.access?.failed) seen.failed.push(ev.access);
        if (ev.type === 'delta') seen.text += ev.text;
        else if (ev.type === 'tool' && ev.access && ev.id) seen.tools.set(ev.id, ev.access.action);
        else if (ev.type === 'tool' && ev.access && !ev.id) seen.tools.set(`w${seen.tools.size}`, ev.access.action);
        else if (ev.type === 'step' && ev.id) seen.steps.set(ev.id, ev.ok !== false && !ev.access?.failed);
        else if (ev.type === 'done' || ev.type === 'error' || ev.type === 'stopped') end(ev);
      });
      window.hub.send({ agentId: agent.id, chatId: id, session: {}, text, options }).catch((err) => runs.get(id) && end({ type: 'error', message: err.message }));
    });
  }
  // the cheapest model + least thinking for this engine (router.js's lightest tier); the AI's own effort as fallback
  function cheap(engine) {
    const p = (typeof Router !== 'undefined' && Router.PLAN?.[engine]?.chat) || {};
    return { model: p.model, effort: p.effort || (engine === 'codex' ? 'minimal' : 'low') };
  }
  const PERSONA = 'You are testing your own tools for the user\'s desktop app. Do exactly the steps asked, nothing more, then answer in one short line.';

  // ---------- the check ----------
  async function run(agentId) {
    const agent = agentOf(agentId);
    if (!agent || agent.mode !== 'native') throw new Error('Pick a chat AI (Claude or Astra) first.');
    if (live.has(agentId)) return live.get(agentId).promise;
    const state = { at: Date.now(), engine: agent.engine, lines: [{ k: 'found', ok: null, text: `Looking for ${LABEL[agent.engine]}…` }], running: true };
    const promise = check(agent, state).catch((err) => {
      state.lines.push({ k: 'error', ok: false, text: `The check stopped: ${short(err.message, 160)}`, fix: 'again' });
      return state;
    }).then((r) => {
      live.delete(agentId);
      const out = { at: r.at, done: Date.now(), engine: r.engine, lines: r.lines, tokens: r.tokens || 0 };
      keep(agentId, out);
      changed(agentId);
      return out;
    });
    state.promise = promise;
    live.set(agentId, state);
    changed(agentId);
    return promise;
  }
  async function check(agent, state) {
    const engine = agent.engine;
    const show = (lines) => { state.lines = lines; changed(agent.id); };
    const rep = await EngineHealth.check({ fresh: true, engines: [engine] });
    const lines = engineLines(rep?.[engine], engine);
    show([...lines]);
    const skip = (k, text) => ({ k, ok: null, text: `${text}: not checked (fix the line above first)` });
    if (lines.some((l) => l.ok === false)) {
      show([...lines, skip('answers', 'Answers a message'), skip('read', 'Reads its folder'), skip('write', 'Writes a file there'), skip('run', 'Runs a command')]);
      return state;
    }
    // the AI's own Files setting (⋯ AI setup → Files on this computer)
    const acc = typeof Access !== 'undefined' && Access.aiEffective ? Access.aiEffective(agent) : { level: 'off', folders: [] };
    const win = await onWindows();
    const folder = acc.folders[0];
    const folderOk = folder ? Boolean(await window.hub.fs.stat(folder).catch(() => null)) : false;
    const id = Math.random().toString(36).slice(2, 8);
    const code = `ember-${Math.floor(1000 + Math.random() * 9000)}`;
    const probe = folderOk ? join(folder, `.hearth-check-${id}.txt`) : '';
    const made = folderOk ? join(folder, `.hearth-check-${id}-new.txt`) : '';
    const filesOn = acc.level !== 'off' && folderOk;
    show([...lines, { k: 'answers', ok: null, text: filesOn ? 'Sending one tiny test (reads, writes, runs a command)…' : 'Sending one tiny test message…' }]);
    if (filesOn) await window.hub.fs.write(probe, `Hearth check code: ${code}\n`);
    const text = filesOn
      ? `Hearth setup check (a test of your tools for the user; keep it short).\n1. Read the file \`${probe}\` and note the code in it.\n2. Create the file \`${made}\` containing just: ok\n3. Run one shell command that lists the folder \`${folder}\` (${win ? 'Get-ChildItem' : 'ls'}).\nThen reply in one line: the code, then for each step "ok" or the error you got. Do nothing else.`
      : 'Hearth setup check: reply with just OK.';
    const c = cheap(engine);
    const base = { lean: true, persona: PERSONA, effort: c.effort, verbosity: 'low', ...(filesOn ? { accessCheck: true, access: { level: acc.level, folders: acc.folders.slice(0, 12) } } : {}) };
    let r = await runOnce(agent, text, { ...base, model: c.model });
    // a cheap model this account can't use: once more with the AI's own model
    if (!r.ok && c.model && /model/i.test(r.error || '') && !r.needsLogin) r = await runOnce(agent, text, base);
    state.tokens = r.usage ? (r.usage.input || 0) + (r.usage.output || 0) : 0;
    const out = lines.map((l) => ({ ...l }));
    const sign = out.find((l) => l.k === 'signin');
    // the real answer settles "signed in?" when the engine couldn't say
    if (r.needsLogin) Object.assign(sign, { ok: false, text: `Not signed in to ${LABEL[engine]}`, fix: 'login' });
    else if (sign.ok === null && r.ok) Object.assign(sign, { ok: true, text: 'Signed in' });
    // (round 35, bugbash2) no answer because of the internet, a busy service, a usage limit or a VPN (offline-core.js
    // reads the engine's error like the chat does): said in those words, and the folder lines aren't judged (they read
    // "Can't read / write / run" with "Open AI setup" before, for a setup that was fine)
    const net = !r.ok && !r.needsLogin && typeof OfflineCore !== 'undefined' ? OfflineCore.classify(String(r.error || '')) : null;
    const netWhy = net && { offline: 'no internet right now', busy: `${LABEL[engine]}'s service is busy right now`, limit: `usage limit reached${net.resetAt ? ` until ${OfflineCore.clock(net.resetAt)}` : ''}`, proxy: 'a VPN or proxy on this network may be blocking it' }[net.kind];
    out.push(r.ok
      ? { k: 'answers', ok: true, text: `Answers a message (${(r.ms / 1000).toFixed(1)} s${state.tokens ? `, ≈ ${state.tokens.toLocaleString()} tokens` : ''})` }
      : { k: 'answers', ok: false, text: `Didn't answer: ${netWhy || short(String(r.error || 'stopped').split('\n')[0], 160)}`, fix: r.needsLogin ? 'login' : ['install', 'update'].includes(r.fixAction) ? r.fixAction : 'again', cmd: rep?.[engine]?.plan?.command || '' });
    if (netWhy && filesOn) { // (Files Off / no folder: the lines below say so, whatever the answer)
      const wait = (k, t) => ({ k, ok: null, text: `${t}: not checked (it didn't answer; check again ${net.kind === 'offline' ? 'once you\'re back online' : 'in a moment'})` });
      out.push(wait('read', 'Reads its folder'), wait('write', 'Writes a file there'), wait('run', 'Runs a command'));
      const left = [];
      for (const p of [probe, made]) if (p && await window.hub.fs.stat(p).catch(() => null)) left.push(p);
      if (left.length) await window.hub.fs.trash(left).catch(() => {});
      state.lines = out;
      return state;
    }
    // ---- files: judged from what happened ----
    const L = (typeof AccessRules !== 'undefined' && AccessRules.LEVEL_LABEL) || { off: 'Off', read: 'Read', write: 'Read & write', full: 'Full' };
    const rank = (l) => ['off', 'read', 'write', 'full'].indexOf(l);
    if (!filesOn) {
      const why = acc.level === 'off' ? `Files on this computer is Off` : `its folder isn't there${folder ? ` (${short(folder, 60)})` : ''}`;
      out.push({ k: 'read', ok: false, text: `Can't read its folder: ${why}`, fix: acc.level === 'off' ? 'level-write' : 'setup' });
      out.push({ k: 'write', ok: false, text: `Can't write a file there: ${why}`, fix: acc.level === 'off' ? 'level-write' : 'setup' });
      out.push({ k: 'run', ok: false, text: `Can't run a command: ${why}`, fix: acc.level === 'off' ? 'level-full' : 'setup' });
      state.lines = out;
      return state;
    }
    const said = `${r.text}`;
    const policy = r.seen.failed.find((f) => f.policy);
    const astraWin = engine === 'codex' && (win || Boolean(policy)) && agent.astraNoSandbox !== true;
    const sandboxFix = astraWin && policy ? (rank(acc.level) < rank('write') ? 'astra-open' : 'nosandbox') : null;
    // read: the code came back
    const readOk = said.includes(code);
    out.push(readOk ? { k: 'read', ok: true, text: `Reads its folder (${short(folder, 60)})` }
      : { k: 'read', ok: false, text: `Can't read its folder${policy && engine === 'codex' ? ': its sandbox blocked the command it reads with (blocked by policy)' : r.ok ? '' : ' (no answer)'}`, fix: sandboxFix || 'setup' });
    // write: the file is there
    const st = await window.hub.fs.stat(made).catch(() => null);
    const writeOk = Boolean(st && !st.isDir);
    const writeFail = r.seen.failed.find((f) => f.action === 'write');
    out.push(writeOk ? { k: 'write', ok: true, text: 'Writes a file there (a test file, now in the Trash)' }
      : { k: 'write', ok: false, text: `Can't write a file there${rank(acc.level) < rank('write') ? `: Files is ${L[acc.level]} (reading only)` : writeFail?.why ? `: ${short(writeFail.why, 90)}` : sandboxFix ? ': its sandbox blocks it (blocked by policy)' : ''}`, fix: rank(acc.level) < rank('write') ? (sandboxFix === 'astra-open' ? 'astra-open' : 'level-write') : sandboxFix || 'setup' });
    // run: a command ran and its own result came back fine
    const runIds = [...r.seen.tools].filter(([, a]) => a === 'run').map(([k]) => k);
    const runOk = runIds.some((k) => r.seen.steps.get(k) === true);
    const runFail = r.seen.failed.find((f) => f.action === 'run');
    let runFix = 'setup';
    let runWhy = runFail?.why ? `: ${short(runFail.why, 90)}` : '';
    if (engine === 'claude' && rank(acc.level) < rank('full')) { runFix = 'level-full'; runWhy = `: Files is ${L[acc.level]} (commands need Full)`; }
    else if (engine === 'claude' && runFail?.policy) { runFix = 'update'; runWhy = `: Claude Code blocked its command tool${runFail.tool ? ` (${runFail.tool})` : ''} before Hearth's check`; }
    else if (sandboxFix) { runFix = sandboxFix; runWhy = `: its sandbox blocks commands${win ? ' on Windows' : ''} (blocked by policy)`; }
    out.push(runOk ? { k: 'run', ok: true, text: 'Runs a command (listed its folder)' } : { k: 'run', ok: false, text: `Can't run a command${runWhy}`, fix: runFix, ...(runFix === 'update' ? { cmd: rep?.[engine]?.plan?.command || '' } : {}) });
    // the test files go to the Trash (recoverable), never deleted for good
    const left = [];
    for (const p of [probe, made]) if (await window.hub.fs.stat(p).catch(() => null)) left.push(p);
    if (left.length) await window.hub.fs.trash(left).catch(() => {});
    state.lines = out;
    return state;
  }

  // ---------- fixes ----------
  const FIX = {
    install: { label: (e) => `Install ${LABEL[e]}`, tip: (l) => `Runs in a visible window${l.cmd ? `: ${l.cmd}` : ''}` },
    update: { label: (e) => `Update ${LABEL[e]}`, tip: (l) => `Runs in a visible window${l.cmd ? `: ${l.cmd}` : ''}` },
    'use-newest': { label: () => 'Use the newest copy', tip: () => 'Settings → Engines pins an older copy: use the newest one' },
    login: { label: (e) => `Sign in to ${LABEL[e]}`, tip: () => 'Opens its own sign-in window (Hearth never sees your password)' },
    'level-write': { label: () => 'Allow edits', tip: () => 'Files on this computer → Read & write (every chat with this AI)' },
    'level-full': { label: () => 'Allow commands', tip: () => 'Files on this computer → Full (risky things still ask you first)' },
    nosandbox: { label: () => 'Run without its sandbox…', tip: () => 'Asks first: without its sandbox, deletes it runs itself can\'t go to the Trash' },
    'astra-open': { label: () => 'Read & write, without its sandbox…', tip: () => 'Files → Read & write, then asks before it runs commands without its sandbox' },
    setup: { label: () => 'Open AI setup', tip: () => 'Files on this computer: the level and folders' },
    again: { label: () => 'Check again', tip: () => 'Uses a few tokens' },
  };
  async function fix(agentId, line) {
    const agent = agentOf(agentId);
    const e = agent?.engine;
    const k = line.fix;
    if (['install', 'update', 'login', 'use-newest'].includes(k)) { const r = await EngineHealth.fix(e, k); return Boolean(r?.ok); }
    if (k === 'level-write') { await Access.setAiLevel(agentId, 'write'); return true; }
    if (k === 'level-full') { await Access.setAiLevel(agentId, 'full'); return true; }
    if (k === 'nosandbox') return Access.setNoSandbox(agentId, true);
    if (k === 'astra-open') { await Access.setAiLevel(agentId, 'write'); return Access.setNoSandbox(agentId, true); }
    if (k === 'again') { run(agentId).catch(() => {}); return false; }
    if (k === 'setup') { reveal(agentId, '.access-ai'); return false; }
    return false;
  }
  function markFixed(agentId, k) {
    const r = last(agentId);
    const l = r?.lines?.find((x) => x.k === k);
    if (!l) return;
    l.fixed = true;
    keep(agentId, r);
    changed(agentId);
  }

  // ---------- the row in ⋯ AI setup ----------
  const when = (t) => { const d = new Date(t); const today = new Date().toDateString() === d.toDateString(); return today ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : d.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }); };
  function summaryOf(r) {
    const bad = r.lines.filter((l) => l.ok === false).length;
    const good = r.lines.filter((l) => l.ok === true).length;
    return bad ? `${bad} to fix · ${when(r.done || r.at)}` : `${good} of ${r.lines.length} ok · ${when(r.done || r.at)}`;
  }
  function section(agentId) {
    const box = el('div', { class: 'aicheck', attrs: { 'data-agent': agentId } });
    let open = null; // the list shows when a check runs, after one, or when the last one had something to fix
    const paint = () => {
      const agent = agentOf(agentId);
      if (!agent) { box.replaceChildren(); return; }
      const now = live.get(agentId);
      const r = now || last(agentId);
      if (now) open = true; // a check that runs always shows its lines
      else if (open === null) open = Boolean(r && r.lines.some((l) => l.ok === false));
      const go = el('button', { type: 'button', class: 'ghost small aicheck-go', text: now ? 'Checking…' : r ? 'Check again' : 'Check', disabled: Boolean(now),
        title: `A short real test through ${LABEL[agent.engine]}: found and signed in, reads its folder, writes a test file there (then to the Trash), runs a command. Uses a few tokens.`,
        on: { click: (ev) => { ev.preventDefault(); open = true; run(agentId).catch((err) => toast(err.message, { type: 'error' })); } } });
      const head = el('div', { class: 'opt-row aicheck-row' },
        el('span', { class: 'opt-label', text: 'Check this AI' }),
        r && !now ? el('button', { type: 'button', class: `link aicheck-last${r.lines.some((l) => l.ok === false) ? ' aicheck-last-bad' : ''}`, text: summaryOf(r), title: open ? 'Hide the list' : 'Show the last result', on: { click: (ev) => { ev.preventDefault(); open = !open; paint(); } } }) : null,
        go);
      const shown = new Set(); // one button per fix (reading and commands can share "Run without its sandbox…")
      const list = open && r ? el('ul', { class: 'aicheck-list' }, r.lines.map((l) => {
        const f = l.fix && !l.fixed && FIX[l.fix] && !now && !shown.has(l.fix);
        if (f) shown.add(l.fix);
        return el('li', { class: `aicheck-line aicheck-${l.ok === true ? 'ok' : l.ok === false ? 'bad' : 'wait'}`, attrs: { 'data-k': l.k } },
          el('span', { class: 'aicheck-mark', text: l.ok === true ? '✓' : l.ok === false ? '✗' : now ? '…' : '·' }),
          el('span', { class: 'aicheck-text', text: l.fixed ? `${l.text} · changed: check again` : l.text }),
          f ? el('button', { type: 'button', class: 'ghost small aicheck-fix', text: FIX[l.fix].label(agent.engine), title: FIX[l.fix].tip(l),
            on: { click: async (ev) => { ev.preventDefault(); const b = ev.currentTarget; b.disabled = true; try { if (await fix(agentId, l)) markFixed(agentId, l.k); } catch (err) { toast(err.message, { type: 'error' }); } b.disabled = false; } } }) : null);
      })) : null;
      box.replaceChildren(head, list || '');
    };
    paint();
    // (round 34, lightweight) one listener for every box: a closed ⋯ AI setup's box is let go at once, not
    // kept (with its whole sheet) until a check happens to run
    box.lwPaint = paint; // (held by the box only: a box nobody shows is collected with its paint)
    for (const r of boxes) if (!r.deref()) boxes.delete(r);
    boxes.add(new WeakRef(box));
    if (!heard) { heard = true; document.addEventListener('hearth:aicheck', (e) => { for (const r of boxes) { const b = r.deref(); if (!b) boxes.delete(r); else if (b.isConnected && b.dataset.agent === e.detail?.agentId) b.lwPaint(); } }); }
    return box;
  }
  const boxes = new Set(); // WeakRefs of the boxes shown (data-agent: whose)
  let heard = false;
  // ⋯ AI setup on this AI, scrolled to a part of it
  function reveal(agentId, sel = '.aicheck') {
    if (typeof Options === 'undefined') return;
    const S = Options.sheet;
    if (!S || S.page || S.agentId !== agentId) Options.open({ agentId });
    setTimeout(() => document.querySelector(`aside.opt-sheet ${sel}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 80);
  }
  // From a chat's refusal note (access.js) or /check-ai: AI setup opens on this AI and the check runs there.
  function openAndRun(agentId) {
    reveal(agentId);
    return run(agentId);
  }

  if (typeof Commands !== 'undefined' && !Commands.get('check-ai')) {
    Commands.register({
      name: 'check-ai', area: 'Agents', args: '',
      desc: 'Check this AI: found, signed in, can read / write its folder, can run a command, with a fix on each failing line (a few tokens)',
      keywords: 'test diagnose blocked by policy sandbox commands files permission doctor why',
      run: (args, ctx) => {
        const id = H.agent(ctx.agentId)?.mode === 'native' ? ctx.agentId : H.claudeAgent()?.id;
        openAndRun(id).catch((err) => toast(err.message, { type: 'error' }));
        return null;
      },
    });
  }
  return { run, section, openAndRun, last, fix, _engineLines: engineLines };
})();
