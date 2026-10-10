// Round 13 (speed): errors to fixes. The error log (habits.js) already knows what goes wrong most; here are the fixes
// Hearth can do in one click, matched on the error's words: update the engine, sign in, install ffmpeg, check the
// engines and their tool (MCP) setup, try the reply again, open the Lab, reload the sequence's preview. An error
// toast that matches one gets it as its button; /habits fix lists your errors with theirs. When the same error comes
// back (3 times, the last one within a day), one quiet note says so, once a day, with the fix when there is one.
// Nothing here calls an engine: every fix is an existing command or a local action.
const SpeedFix = (() => {
  const cmd = (line) => () => Commands.exec(line, H.claudeAgent()?.id);
  const has = (name) => () => Boolean(Commands.get(name));
  const engineOf = (t) => (/codex|astra|openai|chatgpt/i.test(t) ? 'codex' : 'claude');
  const FIXES = [
    { id: 'engine-update', re: /version.{0,40}(too old|outdated|not supported)|too old|update (claude|codex|the engine)|unknown (option|argument|flag)|unexpected argument|upgrade (claude|codex)/i,
      label: 'Update the engine', ok: has('engine-update'), run: (t) => Commands.exec(`/engine-update ${engineOf(t)}`, H.claudeAgent()?.id) },
    { id: 'sign-in', re: /not signed in|sign[- ]?in|log ?in (again|first)|not logged in|unauthori[sz]ed|\b401\b|invalid api key|authentication|expired (token|session)/i,
      label: 'Sign in', ok: has('login'), run: (t) => { const a = engineOf(t) === 'codex' && Commands.get('astra-login') ? '/astra-login' : '/login'; Commands.exec(a, H.claudeAgent()?.id); } },
    { id: 'ffmpeg', re: /ffmpeg|ffprobe|couldn'?t (load|read|decode).{0,60}\.(mp4|mov|mkv|webm|m4v)|codec|code 4\b/i,
      label: 'Install ffmpeg', ok: has('ffmpeg'), run: cmd('/ffmpeg install') },
    { id: 'mcp', re: /\bmcp\b|tool call.{0,30}(cancel|blocked|denied)|access was blocked|invalid mcp/i,
      label: 'Check the engines', ok: has('doctor'), run: cmd('/doctor') },
    { id: 'retry', re: /not answering|timed? ?out|econnreset|socket hang up|network|overloaded|\b529\b|\b5\d\d\b.{0,20}(error|server)|rate limit/i,
      label: 'Try again', ok: has('retry'), run: () => { const a = H.agent(H.activeId)?.mode === 'native' ? H.activeId : H.claudeAgent()?.id; Commands.exec('/retry', a); } },
    { id: 'lab', re: /open the three\.js lab first|the three\.js lab did not load|lab is not open/i,
      label: 'Open the Lab', run: () => activate('tool:three') },
    { id: 'seq-reload', re: /webgl|context lost|sequence.{0,40}(stuck|frozen|black)|preview.{0,30}(stuck|frozen|crash)/i,
      label: 'Reload the preview', ok: () => typeof ThreeSeq !== 'undefined' && Boolean(Commands.get('sequence')), run: cmd('/sequence reload') },
    { id: 'engines', re: /(claude|codex)( code)? (was )?not found|enoent.{0,40}(claude|codex)|no engine/i,
      label: 'Find the engines', ok: has('doctor'), run: cmd('/doctor') },
  ];
  if (typeof Habits !== 'undefined' && Habits.addFixes) Habits.addFixes(FIXES);

  // "this keeps happening": the 3rd time (or more) an error comes back within a day, once a day per error
  const DAY = 864e5;
  const hintsOn = () => store.get('speed.hints', true) !== false;
  if (typeof Habits !== 'undefined' && Habits.onRecord) {
    Habits.onRecord((it, key, prevLast) => {
      if (!hintsOn() || it.n < 3 || !prevLast || Date.now() - prevLast > DAY) return;
      const told = store.get('speed.errHints', {});
      if (Date.now() - (told[key] || 0) < DAY) return;
      told[key] = Date.now();
      for (const k of Object.keys(told)) if (Date.now() - told[k] > 7 * DAY) delete told[k];
      store.set('speed.errHints', told);
      const f = Habits.fixFor(`${it.sample}\n${it.fix || ''}`);
      const what = it.sample.length > 70 ? `${it.sample.slice(0, 69)}…` : it.sample;
      setTimeout(() => toast(`This keeps happening (${it.n}×): ${what}`, { timeout: 7000, action: f ? { label: f.label, fn: () => f.run(it.sample) } : { label: 'Your errors', fn: () => Commands.exec('/habits fix', H.claudeAgent()?.id) } }), 1200);
    });
  }
  return { FIXES, fixFor: (t) => (typeof Habits !== 'undefined' ? Habits.fixFor(t) : null) };
})();
