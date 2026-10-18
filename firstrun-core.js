// Check this computer (round 28, firstrun): the model behind the checklist (firstrun.js draws it). No DOM, no checks of
// its own: it turns what the existing parts report (engines' install check + EngineHealth.problemsOf, ffmpeg status,
// sync status / detect, reach, the updater, firstrunmain's facts) into one calm line per thing, in plain words, each
// with its state and at most one fix. Runs in Node for the unit test (dev/firstrun-test.js).
//   rows(f)        → [{ id, icon, title, state, text, cmd?, action?, link? }]
//                    state: 'ok' ready · 'fix' needed · 'optional' only for some features · 'note' read once · 'checking'
//                    cmd: the exact command the button runs, shown before the click · link: the official page
//                    action: { kind: 'engine' | 'ffmpeg' | 'sync' | 'folder' | 'perm' | 'run' | 'ack' | 'update' | 'link', label, … }
//   summary(rows)  → { need, optional, checking, ready, line }
//   autoDecision({ seen, test, chats }) → 'show' | 'mark' (a computer already in use: never shown by itself) | 'skip'
//   f: { platform, used: { claude, codex }, engines: { claude: { report, problems }, codex }, login: { claude, codex },
//        ffmpeg: { found, command }, sync: { status, detect, line }, folders: [...], perms, longPaths, appDir, home,
//        commands, update, acks: { smartscreen } } — a part not known yet is left out (its line says "checking…")
const FirstRunCore = (() => {
  const LINKS = {
    claude: 'https://docs.claude.com/en/docs/claude-code/setup',
    codex: 'https://github.com/openai/codex',
    ffmpeg: 'https://ffmpeg.org/download.html',
    git: 'https://git-scm.com/downloads',
    node: 'https://nodejs.org/en/download',
  };
  const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
  const shortPath = (p, home) => {
    let s = String(p || '');
    if (home && s.toLowerCase().startsWith(String(home).toLowerCase())) s = `~${s.slice(String(home).length)}`;
    else s = s.replace(/^\/(Users|home)\/[^/]+/, '~').replace(/^[A-Z]:\\Users\\[^\\]+/i, '~');
    return s.length > 52 ? `…${s.slice(-50)}` : s;
  };
  const checking = (id, icon, title) => ({ id, icon, title, state: 'checking', text: 'Checking…' });

  // ---- Claude Code / Codex: the install check's own problems (EngineHealth.problemsOf), worst first ----
  const ENGINE = {
    claude: { icon: '✳', title: 'Claude', for: 'your Claude chats' },
    codex: { icon: '✦', title: 'Codex (for Astra)', for: 'Astra' },
  };
  function engineRow(e, f) {
    const E = ENGINE[e];
    const x = f.engines?.[e];
    if (!x?.report) return checking(e, E.icon, E.title);
    const r = x.report;
    const probs = x.problems || [];
    const used = f.used?.[e] !== false;
    if (!probs.length) {
      const who = r.signedIn === true ? ', signed in' : r.signedIn === false ? '' : ' (sign-in looks fine)';
      return { id: e, icon: E.icon, title: E.title, state: 'ok', text: `${r.label || E.title} ${r.semver || r.version || ''}`.trim() + who + '.' };
    }
    const [p] = probs;
    const more = probs.length > 1 ? ` Then: ${probs.slice(1).map((q) => q.text.replace(/^\w/, (c) => c.toLowerCase())).join('; ')}.` : '';
    const row = { id: e, icon: E.icon, title: E.title, state: used ? 'fix' : 'optional', text: `${p.text}.${used ? '' : ` Only needed for ${E.for}.`}${more}`,
      action: { kind: 'engine', engine: e, act: p.action, label: p.label } };
    if (p.action === 'login') row.cmd = f.login?.[e] || null;
    else if (p.action !== 'use-newest') row.cmd = r.plan?.command || null;
    if (p.action === 'install') {
      row.link = { label: 'Official page', url: LINKS[e] };
      if (e === 'codex' && /\bnpm\b/.test(row.cmd || '')) row.text += ' The command needs Node.js (nodejs.org) first.';
    }
    return row;
  }

  function ffmpegRow(f) {
    const t = { id: 'ffmpeg', icon: '🎞', title: 'ffmpeg' };
    if (!f.ffmpeg) return checking(t.id, t.icon, t.title);
    if (f.ffmpeg.found) return { ...t, state: 'ok', text: 'Found: renders, exports and Ready to post work.' };
    return { ...t, state: 'fix', text: 'Not found. Renders, exports, Ready to post, sharp recordings and exact frames need it.', cmd: f.ffmpeg.command || null,
      action: { kind: 'ffmpeg', label: 'Install ffmpeg' }, link: { label: 'Official page', url: LINKS.ffmpeg } };
  }

  function syncRow(f) {
    const t = { id: 'sync', icon: '☁', title: 'Sync folder' };
    const s = f.sync;
    if (!s?.status) return checking(t.id, t.icon, t.title);
    if (s.status.on) {
      const bad = s.status.state === 'error' || (s.status.state === 'offline' && s.status.error === 'missing');
      return { ...t, state: bad ? 'fix' : 'ok', text: s.line || `On: ${s.status.label || 'your cloud drive'}.`, action: bad ? { kind: 'sync', label: 'Choose the drive…', change: true } : undefined };
    }
    const d = s.detect;
    if (!d) return checking(t.id, t.icon, t.title);
    if (d.inside) return { ...t, state: 'fix', text: `Hearth's data folder is inside ${d.inside.label}. Cloud apps lock and half-download files: run Hearth from a local folder, then sync to the drive.` };
    const p = d.proposed;
    if (p?.hearth) {
      const who = (p.hearth.machines || []).map((m) => m.name).filter(Boolean).join(', ');
      return { ...t, state: 'fix', text: `Your Hearth is in ${p.label}${who ? ` (from ${who})` : ''}. Join it: this computer gets the same chats, scenes and boards; nothing is overwritten.`, action: { kind: 'sync', label: 'Use this Hearth' } };
    }
    if (p) return { ...t, state: 'optional', text: `Off. Turn it on to keep this computer and your other one the same, through ${p.label}.`, action: { kind: 'sync', label: 'Turn on sync…' } };
    return { ...t, state: 'optional', text: 'Off. No cloud drive app found (iCloud Drive, Google Drive, Dropbox, OneDrive). Install one, or choose a folder one syncs.', action: { kind: 'sync', label: 'Choose a folder…' } };
  }

  function foldersRow(f) {
    const t = { id: 'folders', icon: '📁', title: 'Folders chats use' };
    if (!Array.isArray(f.folders)) return checking(t.id, t.icon, t.title);
    const list = f.folders;
    if (!list.length) return { ...t, state: 'ok', text: 'No chat uses a folder of its own yet.' };
    const missing = list.filter((x) => x.state === 'missing');
    const waiting = list.filter((x) => x.state === 'waiting');
    const mapped = list.filter((x) => x.state === 'mapped');
    const found = list.length - missing.length - waiting.length;
    if (missing.length) {
      const m = missing[0];
      const who = m.from?.length ? ` (${m.from.slice(0, 2).join(', ')})` : '';
      return { ...t, state: 'fix', text: `${plural(missing.length, 'folder')} from your other computer ${missing.length === 1 ? "isn't" : "aren't"} here: ${shortPath(m.path, f.home)}${who}. Show Hearth where ${missing.length === 1 ? 'it is' : 'the first one is'} on this computer.`,
        action: { kind: 'folder', label: 'Show where it is…', path: m.path } };
    }
    const bits = [`${plural(found, 'folder')} found here`];
    if (mapped.length) bits.push(`${mapped.length} matched from the other computer`);
    if (waiting.length) bits.push(`${waiting.length} still on ${waiting.length === 1 ? 'its' : 'their'} way through sync`);
    return { ...t, state: waiting.length ? 'note' : 'ok', text: `${bits.join(', ')}.` };
  }

  // ---- Mac: privacy permissions (only some features need them, so never "needed") ----
  const PERMS = [
    ['screen', '🖥', 'Screen recording', 'Hearth records and screenshots itself (capture, tours, the intro video).'],
    ['camera', '📷', 'Camera', 'Body, hand and face tracking in the Lab.'],
    ['microphone', '🎙', 'Microphone', 'Talking to chats and live sound in the Lab.'],
  ];
  function permRows(f) {
    if (f.platform !== 'darwin') return [];
    if (!f.perms) return PERMS.map(([id, icon, title]) => checking(`perm-${id}`, icon, title));
    return PERMS.map(([id, icon, title, why]) => {
      const s = f.perms[id];
      const t = { id: `perm-${id}`, icon, title };
      if (s === 'granted') return { ...t, state: 'ok', text: `Allowed. ${why}` };
      const ask = s === 'not-determined' || (id === 'screen' && s !== 'restricted');
      return { ...t, state: 'optional', text: `${s === 'denied' ? 'Not allowed' : s === 'restricted' ? 'Blocked by this Mac\'s settings' : 'Not asked yet'}. ${why} macOS asks once; after that it's a switch in System Settings › Privacy & Security.`,
        action: { kind: 'perm', which: id, how: ask && s !== 'denied' ? 'ask' : 'open', label: ask && s !== 'denied' ? 'Allow…' : 'Open System Settings' } };
    });
  }

  // ---- Windows: paths and the SmartScreen warning ----
  function winRows(f) {
    if (f.platform !== 'win32') return [];
    const rows = [];
    const t = { id: 'win-paths', icon: '🪟', title: 'Windows paths' };
    const where = f.appDir ? `Hearth runs from ${shortPath(f.appDir, f.home)}` : 'Hearth runs from its own folder';
    if (f.longPaths === undefined) rows.push(checking(t.id, t.icon, t.title));
    else if (f.longPaths === false) {
      rows.push({ ...t, state: 'optional', text: `${where}. Long file paths are off: files deep inside projects (node_modules, renders) can fail to save. Turning them on asks for administrator once.`,
        cmd: f.commands?.longpaths || null, action: { kind: 'run', id: 'longpaths', label: 'Allow long paths' } });
    } else rows.push({ ...t, state: 'ok', text: `${where}${f.longPaths ? '; long file paths are on' : ''}. Paths your Mac wrote are read as this PC's.` });
    rows.push(f.acks?.smartscreen
      ? { id: 'win-smartscreen', icon: '🛡', title: 'SmartScreen', state: 'ok', text: 'If “Windows protected your PC” shows for a Hearth shortcut or an installer: More info › Run anyway.' }
      : { id: 'win-smartscreen', icon: '🛡', title: 'SmartScreen', state: 'note', text: 'Hearth isn\'t a signed store app, so Windows may say “Windows protected your PC” the first time a shortcut or an installer opens. Click More info › Run anyway: nothing is wrong.',
        action: { kind: 'ack', id: 'smartscreen', label: 'Got it' } });
    return rows;
  }

  function updateRow(f) {
    const t = { id: 'update', icon: '⬆', title: 'Updates' };
    const u = f.update;
    if (!u) return checking(t.id, t.icon, t.title);
    if (u.ok) {
      const ahead = u.behind ? `${plural(u.behind, 'new change')} ready (⬆ in the rail).` : 'Up to date.';
      if (u.branch && u.branch !== 'main' && u.branch !== 'HEAD') return { ...t, state: 'note', text: `This copy is on “${u.branch}”; ⬆ Update brings in what's new on main. ${ahead}` };
      return { ...t, state: 'ok', text: `From main, looked for every half hour, never installed without your click. ${ahead}` };
    }
    if (u.reason === 'git') {
      if (f.platform === 'darwin') return { ...t, state: 'fix', text: 'Git isn\'t installed, so Hearth can\'t update itself. Apple\'s command line tools include it.', cmd: f.commands?.git || 'xcode-select --install', action: { kind: 'run', id: 'git', label: 'Install Git' } };
      return { ...t, state: 'fix', text: 'Git isn\'t installed, so Hearth can\'t update itself. Install it from the official page, then check again.', action: { kind: 'link', url: LINKS.git, label: 'Get Git' } };
    }
    if (u.reason === 'repo') return { ...t, state: 'note', text: 'This copy isn\'t a git checkout, so it doesn\'t update itself.' };
    // (round 60, winfresh60) GitHub said no (401 / 403 / not found): Hearth's code is private, never "offline"
    if (u.reason === 'auth' || u.why === 'auth') return { ...t, state: 'fix', text: 'Hearth\'s code is private on GitHub and this computer isn\'t signed in yet, so it can\'t update. Sign in once (GitHub\'s own window); Hearth never sees your password.', action: { kind: 'update', label: 'Sign in to GitHub' } };
    return { ...t, state: 'optional', text: 'Couldn\'t reach GitHub just now (offline?). Hearth looks again by itself.', action: { kind: 'update', label: 'Look again' } };
  }

  function rows(f = {}) {
    return [engineRow('claude', f), engineRow('codex', f), ffmpegRow(f), syncRow(f), foldersRow(f), ...permRows(f), ...winRows(f), updateRow(f)];
  }

  function summary(list) {
    const n = (s) => list.filter((r) => r.state === s).length;
    const need = n('fix'); const optional = n('optional') + n('note'); const wait = n('checking'); const ready = n('ok');
    const line = wait && !need ? `Checking ${plural(wait, 'thing')}…`
      : need ? `${plural(need, 'thing')} to set up${optional ? ` · ${optional} optional` : ''}`
        : `This computer is ready ✓${optional ? ` (${optional} optional)` : ''}`;
    return { need, optional, checking: wait, ready, line };
  }

  // the first launch: a fresh computer (no chats yet) shows the list once; a computer already in use is only marked
  function autoDecision({ seen, test, chats }) {
    if (seen || test) return 'skip';
    return chats > 0 ? 'mark' : 'show';
  }

  return { rows, summary, autoDecision, shortPath, LINKS, PERMS };
})();
if (typeof module !== 'undefined') module.exports = FirstRunCore;
