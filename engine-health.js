// Engine health (round 9 "robust"): Hearth knows the owner's real Claude Code and Codex installs up front and says
// exactly what to do when one can't work.
//   - At startup (once the window is idle) the main process checks every copy of each engine (installs.js: version
//     read once per binary, the newest working copy preferred, signed in?). If an engine an agent uses is missing,
//     too old for the model, not answering or signed out, ONE calm notice says so with a one-click fix: the update /
//     install / sign-in runs in a visible Terminal / PowerShell window (Hearth never sees a password) and the engine is
//     checked again when that window's work ends ("Claude Code 2.1.400 is ready").
//   - A failed reply whose error has a fix gets its button right under it (Update Claude Code, Install Codex, Run
//     /doctor); sign-in keeps its own button (native.js).
//   - /doctor: one card for both engines (every copy, versions, sign-in, what Hearth leaves out, tool servers, prompt
//     sizes) with the fixes as buttons. /astra-doctor is the same card. /engines lists the copies (and picks one),
//     /engine-update runs an update.
// No settings: Settings → Engines still pins a program when you want one.
const EngineHealth = (() => {
  const LABEL = { claude: 'Claude Code', codex: 'Codex' };
  const ENGINES = ['claude', 'codex'];
  let last = null; // the latest report from the main process
  let checking = null;
  const used = (engine) => H.agents().some((a) => a.mode === 'native' && a.engine === engine);
  const home = (p) => String(p || '').replace(/^\/(Users|home)\/[^/]+/, '~').replace(/^[A-Z]:\\Users\\[^\\]+/i, '~');
  const winName = () => (last?.platform === 'win32' ? 'PowerShell' : 'Terminal');

  async function check({ fresh = false, engines } = {}) {
    if (checking && !fresh) return checking;
    checking = window.hub.engineInstalls({ fresh, engines }).then((r) => { last = { ...(last || {}), ...r }; return last; }).finally(() => { checking = null; });
    return checking;
  }

  // What's wrong with one engine's report, worst first → [{ kind, text, action, label }]
  function problemsOf(r) {
    if (!r) return [];
    const L = r.label || LABEL[r.engine];
    if (!r.found) return [{ kind: 'missing', text: `${L} isn't installed (or Hearth can't find it)`, action: 'install', label: `Install ${L}` }];
    const out = [];
    if (r.broken) out.push({ kind: 'broken', text: `${L} at ${home(r.chosen)} didn't answer`, action: 'update', label: `Update ${L}` });
    if (r.tooOld) out.push({ kind: 'old', text: `${L} ${r.semver} is too old (the model needs ${r.min} or newer)`, action: r.newer ? 'use-newest' : 'update', label: r.newer ? `Use ${r.newer.version}` : `Update ${L}` });
    else if (r.newer) out.push({ kind: 'newer', text: `Settings → Engines uses ${L} ${r.semver || '?'}; a newer one is installed (${r.newer.version})`, action: 'use-newest', label: `Use ${r.newer.version}` });
    if (r.signedIn === false) out.push({ kind: 'login', text: `${L} isn't signed in`, action: 'login', label: `Sign in to ${L}` });
    return out;
  }
  const problems = (report = last) => ENGINES.filter(used).flatMap((e) => problemsOf(report?.[e]).map((p) => ({ ...p, engine: e })));

  // ---------- the one calm notice ----------
  const SEEN = 'engineHealth.seen';
  function notice(report) {
    const list = problems(report);
    if (!list.length) return null;
    // the same problem with the same copy shows once a day at most
    const sig = list.map((p) => `${p.engine}:${p.kind}:${report[p.engine]?.chosen || ''}:${report[p.engine]?.semver || ''}`).join('|');
    const seen = store.get(SEEN, {});
    if (seen.sig === sig && Date.now() - (seen.at || 0) < 20 * 3600e3) return null;
    store.set(SEEN, { sig, at: Date.now() });
    const [p] = list;
    const more = list.length > 1 ? ` (+${list.length - 1} more: /doctor)` : '';
    return toast(`${p.text}.${more}`, { timeout: 14000, action: { label: p.label, fn: () => fix(p.engine, p.action) } });
  }

  // ---------- fixes ----------
  async function fix(engine, action) {
    const L = LABEL[engine];
    if (action === 'doctor') { Commands.exec('/doctor', H.activeId); return { ok: true }; }
    if (action === 'use-newest') {
      // Settings → Engines pinned an older copy: unpin it, so the newest working one is used
      const paths = { ...(H.settings().enginePaths || {}) };
      delete paths[engine];
      H.config.settings = { ...H.settings(), enginePaths: paths };
      saveConfig();
      const r = await check({ engines: [engine] });
      toast(`${L}: Hearth now uses ${r[engine]?.version || 'the newest copy'}${r[engine]?.chosen ? ` (${home(r[engine].chosen)})` : ''}.`, { timeout: 5000 });
      return { ok: true };
    }
    const r = await window.hub.engineFix(engine, action);
    if (!r?.ok) {
      toast(`Couldn't open a window (${r?.error || 'unknown'}). Run this yourself: ${r?.command || ''}`, { type: 'error', timeout: 0, action: r?.command ? { label: 'Copy', fn: () => copyText(r.command, 'Command copied') } : undefined });
      return r;
    }
    const verb = action === 'login' ? `Signing in to ${L}` : action === 'install' ? `Installing ${L}` : `Updating ${L}`;
    toast(`${verb} in the ${r.window === 'test' ? 'test' : r.window} window… Hearth checks again when it's done.`, { timeout: 6000 });
    return r;
  }
  // a check after a fix window finished (or gave up after 20 minutes)
  window.hub.onEngineInstalls?.((r) => {
    last = { ...(last || {}), ...r };
    const engine = r.fixed?.engine;
    if (!engine || !r[engine]) return;
    const left = problemsOf(r[engine]);
    const e = r[engine];
    if (!left.length) toast(`${LABEL[engine]} ${e.semver || ''} is ready${e.signedIn ? ' and signed in' : ''} ✓`, { timeout: 6000 });
    else if (r.fixed.finished) toast(`${left[0].text}.`, { timeout: 12000, action: { label: left[0].label, fn: () => fix(engine, left[0].action) } });
    for (const id of H.agents().filter((a) => a.mode === 'native' && a.engine === engine).map((a) => a.id)) Native.refresh?.(id, { keepScroll: true });
  });

  // ---------- the buttons under a failed reply ----------
  const FIX_LABEL = { update: (e) => `Update ${LABEL[e]}`, install: (e) => `Install ${LABEL[e]}`, doctor: () => 'Run /doctor' };
  Native.hooks?.message?.push((node, m, index, agent) => {
    if (m.role !== 'error' || !m.fixAction || !FIX_LABEL[m.fixAction] || node.querySelector('.engine-fix')) return;
    if (Native.chatOf(agent.id)?.messages?.length - 1 !== index) return; // only under the latest error
    const engine = m.fixEngine || agent.engine;
    node.append(el('button', { class: 'primary small engine-fix', text: FIX_LABEL[m.fixAction](engine), title: 'Runs in a visible window; Hearth checks again when it is done', on: { click: async (e) => {
      const b = e.currentTarget;
      const r = await fix(engine, m.fixAction);
      if (r?.ok && m.fixAction !== 'doctor') b.replaceWith(el('span', { class: 'hint', text: `Finish in the ${r.window} window, then press Retry.` }));
    } } }));
  });

  // ---------- /doctor ----------
  function enginesText(r) {
    const out = [];
    for (const e of ENGINES) {
      const x = r[e];
      if (!x) continue;
      const mark = !x.found || x.broken || x.tooOld || x.signedIn === false ? '✗' : '✓';
      out.push(`- ${mark} **${x.label}**${x.found ? ` ${x.semver || x.version || '(no version)'} · ${x.from === 'settings' ? 'Settings → Engines' : KIND[x.from] || x.from} · \`${home(x.chosen)}\`` : ': not found'}${x.signedIn === true ? ' · signed in' : x.signedIn === false ? ' · **not signed in**' : ''}${x.tooOld ? ` · **too old** (needs ${x.min}+)` : x.min ? ` · needs ${x.min}+` : ''}${used(e) ? '' : ' · no agent uses it'}`);
      const others = (x.copies || []).filter((c) => !c.chosen);
      if (others.length) out.push(`  - other copies: ${others.map((c) => `${c.semver || '?'} (${KIND[c.kind] || c.kind}) \`${home(c.path)}\`${c.ok === false ? ' too old' : ''}`).join(' · ')}`);
      if (x.found && (x.tooOld || x.broken)) out.push(`  - update: \`${x.plan?.command}\``);
    }
    return out.join('\n');
  }
  const KIND = { homebrew: 'Homebrew', npm: 'npm', bun: 'Bun', desktop: 'desktop app', native: 'installer', other: 'on PATH', settings: 'Settings → Engines' };
  function actionsFor(r, ctx) {
    const acts = problems(r).map((p) => ({ label: p.label, run: () => fix(p.engine, p.action) }));
    acts.push({ label: 'Check again', run: () => runDoctor('', ctx) });
    return acts;
  }
  // The Astra report without what the engines section already says (found / version / sign-in and their fixes).
  const ENGINE_LINE = /(Codex|Claude Code) (found|not found|didn't answer)|^- [✓✗•] (Not signed in|Signed in)|astra-login|Install the (Codex|Claude)|didn't answer `--version`/;
  function astraPart(t) {
    const lines = String(t).replace(/^\*\*Astra diagnostics\*\*/, '**Astra and tools**').split('\n').filter((l) => !ENGINE_LINE.test(l));
    const fixAt = lines.indexOf('**To fix**');
    if (fixAt >= 0) {
      let end = lines.findIndex((l, i) => i > fixAt && /^\*\*/.test(l));
      if (end < 0) end = lines.length;
      if (!lines.slice(fixAt + 1, end).some((l) => /^- /.test(l))) lines.splice(fixAt, end - fixAt);
    }
    return lines.filter((l, i) => l !== 'All good.' && !(l === '' && lines[i - 1] === '')).join('\n').trim();
  }
  let astraDoctor = null; // the Astra part (prompt sizes, tool servers, Astra's settings) from astra.js
  async function runDoctor(args, ctx) {
    const r = await check({ fresh: true }).catch((err) => ({ error: err.message }));
    if (r.error) return `Couldn't check the engines: ${r.error}`;
    const list = problems(r);
    const parts = [`**Doctor** · ${list.length ? `${list.length} thing${list.length > 1 ? 's' : ''} to fix` : 'both engines can work'}`, enginesText(r)];
    if (list.length) parts.push(`**To fix** (buttons below run it in a ${winName()} window; Hearth never sees your password)\n${list.map((p) => `- ${p.text}`).join('\n')}`);
    if (astraDoctor) { try { const t = await astraDoctor(args, ctx); if (t) parts.push(astraPart(t)); } catch (err) { parts.push(`(Astra details failed: ${err.message})`); } }
    const text = parts.join('\n\n');
    if (ctx?.note) { ctx.note(text, { actions: actionsFor(r, ctx), id: 'doctor' }); return undefined; }
    return text;
  }

  function registerCommands() {
    const R = (def) => Commands.register(def);
    const old = Commands.get('astra-doctor');
    if (old && !astraDoctor) astraDoctor = old.run;
    const doctor = { area: 'Agents', args: '[--run]', complete: () => [{ value: '--run', hint: 'also send Astra a tiny test message (a few tokens)' }], run: (args, ctx) => runDoctor(args, ctx) };
    if (!Commands.get('doctor')) R({ name: 'doctor', desc: 'Check Claude Code and Codex in one card: every copy, versions, signed in, too old? with one-click fixes', keywords: 'update sign in login version broken engine fix', ...doctor });
    if (old) R({ ...old, ...doctor, name: 'astra-doctor', aliases: [], area: old.area, desc: 'The same card as /doctor (Codex and Claude, with fixes)', override: true });
    R({
      name: 'engines', aliases: ['engine'], area: 'Agents', override: true, args: '[claude|codex auto|<path>]',
      desc: 'Every Claude Code / Codex copy on this computer with its version; "claude auto" uses the newest, a path pins one',
      complete: (a) => (a.trim().split(/\s+/).length <= 1 ? ENGINES.map((e) => ({ value: `${e} `, hint: last?.[e]?.semver || '' })) : [{ value: `${a.trim().split(/\s+/)[0]} auto`, hint: 'the newest working copy (default)' }, ...((last?.[a.trim().split(/\s+/)[0]]?.copies) || []).map((c) => ({ value: `${a.trim().split(/\s+/)[0]} ${c.path}`, hint: c.semver || '?' }))]),
      run: async (args) => {
        const [e, ...rest] = args.trim().split(/\s+/).filter(Boolean);
        const want = rest.join(' ');
        if (e && ENGINES.includes(e) && want) {
          const paths = { ...(H.settings().enginePaths || {}) };
          if (/^auto$/i.test(want)) delete paths[e]; else paths[e] = want;
          H.config.settings = { ...H.settings(), enginePaths: paths };
          saveConfig();
          await new Promise((res) => setTimeout(res, 300));
        }
        const r = await check({ fresh: false });
        H.engineStatus = Object.fromEntries(ENGINES.map((x) => [x, Boolean(r[x]?.found)]));
        return `**Engines**\n${enginesText(r)}\n\nHearth uses the newest working copy unless Settings → Engines (or \`/engines claude <path>\`) pins one; \`/engines claude auto\` unpins it. /doctor fixes problems.`;
      },
    });
    if (!Commands.get('engine-update')) {
      R({
        name: 'engine-update', area: 'Agents', args: '[claude|codex]', desc: 'Update Claude Code (or Codex) in a visible Terminal / PowerShell window, then check it again',
        keywords: 'upgrade claude update brew npm install', complete: () => ENGINES.map((e) => ({ value: e, hint: last?.[e]?.plan?.command || '' })),
        run: async (args, ctx) => {
          const e = ENGINES.includes(args.trim()) ? args.trim() : H.agent(ctx.agentId)?.engine || 'claude';
          const r = last?.[e] || (await check({ engines: [e] }))[e];
          const out = await fix(e, r?.found ? 'update' : 'install');
          return out?.ok ? `Running \`${out.command}\` in a ${out.window} window. Hearth checks ${LABEL[e]} again when it's done.` : `Couldn't open a window: run \`${out?.command || r?.plan?.command}\` yourself.`;
        },
      });
    }
  }

  // ---------- startup: one check once the window is idle ----------
  function start() {
    registerCommands();
    const go = () => check().then((r) => notice(r)).catch((err) => console.warn('engine check', err));
    setTimeout(() => (window.requestIdleCallback ? requestIdleCallback(go, { timeout: 4000 }) : go()), 2500);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();

  return { check, problems, problemsOf, fix, notice, report: () => last, runDoctor };
})();
