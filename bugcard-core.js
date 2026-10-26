// 🪲 Something broke (round 68, bugbutton68): the pure part, shared by the main process (bugmain.js keeps every problem
// redacted as it arrives) and the card (bugcard.js). No DOM, no clock of its own (`now` is passed), so
// dev/bugcard-test.js runs it in Node.
//   redact(text, o)       → the text with nothing private left: no folder above the Hearth folder (C:\Users\Bob\Hearth\
//                           native.js → Hearth/native.js; any other folder → [path]), no keys / tokens / passwords
//                           (sk-…, ghp_…, Bearer …, password=…, JWTs, long random strings), no e-mail addresses, no web
//                           addresses beyond their host, no quoted text long enough to be someone's words (chat text)
//   entry(raw, o)         → one problem, redacted and trimmed: { t, kind, src, what, at[], where, n, … } (null: nothing)
//   summarise(data, o)    → { found, headline, counts, lines[], tip, saved } in plain words
//   report(data, o)       → the text for 📋 Copy report for Claude (times, kinds, places, the redacted messages)
// Kinds: window errors 'error' / 'rejection', an error shown 'toast', a reply that failed 'reply', the main process's
// own 'main', a request to it that failed 'ipc', the graphics card 'gpu', the window's page crashing 'page', the
// window not answering 'hang', a program Hearth runs stopping 'child' (an AI engine, the VST plugin host, the After
// Effects bridge, a helper of Chromium), Hearth closing unexpectedly 'closed'.
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.BugCardCore = api;
}(typeof self !== 'undefined' ? self : this, () => {
  const MAX_WHAT = 240; // one message, at most (the first line)
  const QUOTE = 24; // a quoted run this long or longer is somebody's words: hidden
  const FRAMES = 4; // stack frames kept

  // ---------- redaction ----------
  const CODE_EXT = /\.(?:js|mjs|cjs|ts|py|html|node|dll|so|dylib|exe|asar|jsx|json)$/i; // file names worth keeping outside Hearth
  const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // one path → from the Hearth folder on ("Hearth/tools/three.js"), else [path] (and the name of a program / code file)
  function mapPath(p, app) {
    const parts = String(p).replace(/\\/g, '/').split('/').filter(Boolean);
    let i = parts.findIndex((x) => x.toLowerCase() === app.toLowerCase());
    if (i < 0) i = parts.findIndex((x) => x.toLowerCase() === 'hearth'); // (the owner's folder; a test copy has another name)
    if (i >= 0) return parts.slice(i).join('/');
    const last = parts[parts.length - 1] || '';
    return CODE_EXT.test(last) && last.length <= 48 ? `[path]/${last}` : '[path]';
  }
  const SECRETS = [
    [/-----BEGIN [A-Z ]+-----[\s\S]*?(?:-----END [A-Z ]+-----|$)/g, '[key]'],
    [/\bsk-(?:ant-|proj-)?[A-Za-z0-9_-]{12,}/g, '[key]'],
    [/\b(?:gh[pousr]_[A-Za-z0-9]{16,}|github_pat_[A-Za-z0-9_]{16,})/g, '[key]'],
    [/\bxox[abprs]-[A-Za-z0-9-]{8,}/g, '[key]'],
    [/\bAKIA[0-9A-Z]{16}\b/g, '[key]'],
    [/\bAIza[0-9A-Za-z_-]{30,}/g, '[key]'],
    [/\beyJ[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{4,}/g, '[token]'],
    [/\b(Bearer|Basic|Token)\s+[A-Za-z0-9._~+/=-]{8,}/gi, '$1 [hidden]'],
    // key = value / "key": "value" for anything that names a secret
    [/\b((?:[\w-]*[_-])?(?:password|passwd|pwd|passphrase|secret|token|api[_-]?key|apikey|access[_-]?key|private[_-]?key|auth(?:orization)?|cookie|session(?:[_-]?id)?|credentials?))(["']?\s*[:=]\s*)(["']?)[^\s"',;&})\]]+\3/gi, '$1$2[hidden]'],
    // somebody's words handed to a field (prompt / message / text…): hidden when quoted
    [/\b(prompt|message|text|content|draft|input|query)(["']?\s*[:=]\s*)("[^"\n]*"|'[^'\n]*')/gi, '$1$2"[text]"'],
    [/\b[A-Fa-f0-9]{32,}\b/g, '[hidden]'],
    [/\b(?=[A-Za-z0-9+/_-]*\d)(?=[A-Za-z0-9+/_-]*[A-Za-z])[A-Za-z0-9+/_-]{40,}={0,2}/g, '[hidden]'],
  ];
  // o: { appDir (the Hearth folder: its name is kept, never what's above it), home, max }
  function redact(input, o = {}) {
    let s = String(input ?? '');
    if (!s) return '';
    const app = String(o.appDir || '').replace(/[\\/]+$/, '').split(/[\\/]/).pop() || 'Hearth';
    // the Hearth folder, exactly (its parents may hold spaces; both slash styles; a Windows path in any letter case),
    // then its inside with forward slashes
    const d = String(o.appDir || '').replace(/[\\/]+$/, '');
    if (d.length >= 3) {
      for (const v of new Set([d, d.replace(/\\/g, '/'), d.replace(/\//g, '\\'), encodeURI(d.replace(/\\/g, '/'))])) s = s.replace(new RegExp(`(?:file:///?)?${escRe(v)}(?=[\\\\/:\\s"')]|$)`, 'gi'), app);
      s = s.replace(new RegExp(`\\b${escRe(app)}((?:\\\\[^\\s\\\\/"'\`<>|?*:]+)+)`, 'g'), (_m, rest) => app + rest.replace(/\\/g, '/'));
    }
    // the computer's user name (the home folder's last part), wherever it shows up alone
    const user = String(o.home || '').replace(/[\\/]+$/, '').split(/[\\/]/).pop();
    if (user && user.length >= 3 && !/^(home|users|root)$/i.test(user)) s = s.replace(new RegExp(`(?<![\\w-])${escRe(user)}(?![\\w-])`, 'gi'), '[user]');
    for (const [re, to] of SECRETS) s = s.replace(re, to);
    // file:// addresses → a path
    s = s.replace(/file:\/\/\/?([^\s"'`<>)]*)/gi, (_m, p) => { let q = p; try { q = decodeURIComponent(p); } catch { /* as it is */ } const ln = /(:\d+)+$/.exec(q)?.[0] || ''; return mapPath(q.slice(0, q.length - ln.length), app) + ln; });
    // web addresses → scheme + host (no user, path or query)
    s = s.replace(/\b([a-z][\w+.-]*):\/\/([^\s/"'`<>)?#]*)[^\s"'`<>)]*/gi, (m, sch, host) => {
      const h = host.replace(/^[^@]*@/, '[hidden]@');
      return `${sch}://${h}${m.length > sch.length + 3 + host.length ? '/…' : ''}`;
    });
    // a quoted path ("open 'C:\…\taxes 2026.pdf'"): the whole of it, spaces and all
    s = s.replace(/(['"])((?:[A-Za-z]:[\\/]|\\\\|~?\/)[^'"\n]*)\1/g, (m, q, p) => (/[\\/].*[\\/]|^~/.test(p) ? q + mapPath(p.replace(/^[A-Za-z]:|^~/, ''), app) + q : m));
    // Windows paths (C:\… , \\server\…) and POSIX ones (/Users/…, ~/…): folders may hold spaces, the last part doesn't
    s = s.replace(/(?:\b[A-Za-z]:[\\/]|\\\\[^\\\s]+\\)(?:[^\\/\n"'`<>|?*:]+[\\/])*[^\s\\/"'`<>|?*:,;)\]]*/g, (m) => mapPath(m.replace(/^[A-Za-z]:/, ''), app));
    s = s.replace(/(?<![\w.:/~\]-])~?\/(?=[^\s/])(?:[^/\n"'`<>|?*:]+\/)*[^\s/"'`<>|?*:,;)\]]*/g, (m) => {
      if (!/\/.*\//.test(m) && !m.startsWith('~')) return m; // one slash: "a / b", "and/or": not a path
      return mapPath(m.replace(/^~/, ''), app);
    });
    s = s.replace(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, '[email]');
    // quoted text long enough to be somebody's words (a chat message inside "… is not valid JSON")
    s = s.replace(new RegExp(`"[^"\\n]{${QUOTE},}"|'[^'\\n]{${QUOTE},}'|“[^”\\n]{${QUOTE},}”|\`[^\`\\n]{${QUOTE},}\``, 'g'), '"[text]"');
    const max = o.max || 4000;
    return s.length > max ? `${s.slice(0, max - 1)}…` : s;
  }

  // a stack → its first frames, each "fn (Hearth/file.js:12:5)" (redacted)
  function frames(stack, o = {}) {
    const out = [];
    for (const line of String(stack || '').split('\n')) {
      const m = /^\s*at\s+(?:(.*?)\s+\()?(.+?:\d+(?::\d+)?)\)?\s*$/.exec(line) || /^\s*([^@\s]*)@(.+?:\d+(?::\d+)?)\s*$/.exec(line);
      if (!m) continue;
      const fn = String(m[1] || '').replace(/^async\s+/, '').slice(0, 60);
      const at = redact(m[2], { ...o, max: 120 });
      out.push(fn ? `${redact(fn, { ...o, max: 60 })} (${at})` : at);
      if (out.length >= FRAMES) break;
    }
    return out;
  }

  const KINDS = new Set(['error', 'rejection', 'toast', 'reply', 'crash', 'main', 'ipc', 'gpu', 'page', 'hang', 'child', 'closed']);
  const firstLine = (s) => String(s || '').split('\n').map((x) => x.trim()).find(Boolean) || '';
  // raw → one problem, redacted ({ kind, message, stack?, t?, src?, where?, ch?, name?, code?, signal?, reason?, agent? })
  function entry(raw, o = {}) {
    if (!raw || typeof raw !== 'object') return null;
    let kind = String(raw.kind || '');
    if (kind === 'page' && raw.src === 'window') kind = 'error'; // (DevReportHooks calls a page error "page")
    if (!KINDS.has(kind)) kind = raw.src === 'main' ? 'main' : 'error';
    const msg = String(raw.message || raw.what || '');
    const e = { t: Number(raw.t || raw.at) || o.now || Date.now(), kind, src: raw.src === 'main' ? 'main' : 'window',
      what: redact(firstLine(msg.replace(/^Unhandled:\s*/, '')), { ...o, max: ['toast', 'reply'].includes(kind) ? 160 : MAX_WHAT }), n: Math.max(1, Number(raw.n) || 1) };
    const at = Array.isArray(raw.at) ? raw.at.map((x) => redact(x, { ...o, max: 160 })).slice(0, FRAMES) : frames(raw.stack, o);
    if (at.length) e.at = at;
    for (const k of ['where', 'ch', 'name', 'agent', 'reason', 'signal', 'origin']) if (raw[k] != null && raw[k] !== '') e[k] = redact(String(raw[k]), { ...o, max: 80 });
    if (raw.code != null && raw.code !== '' && Number.isFinite(Number(raw.code))) e.code = Number(raw.code);
    if (raw.last) e.last = Number(raw.last) || undefined;
    if (!e.what && !['gpu', 'page', 'hang', 'child', 'closed'].includes(kind)) return null;
    return e;
  }

  // ---------- plain words ----------
  const pad = (n) => String(n).padStart(2, '0');
  const clock = (t) => { const d = new Date(t); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
  const ago = (ms) => (ms < 90e3 ? 'just now' : ms < 90 * 60e3 ? `${Math.round(ms / 60e3)} min ago` : ms < 36 * 3600e3 ? `${Math.round(ms / 3600e3)} h ago` : `${Math.round(ms / 864e5)} days ago`);
  const exit = (e) => (e.signal ? `stopped from outside: ${e.signal}` : e.code != null ? `exit code ${e.code}` : (e.reason || 'stopped'));
  // one problem, in one sentence (o.plainIpc names a channel in the owner's words: SlowCardCore.plainIpc)
  function sentence(e, o = {}) {
    const w = e.what ? `: ${e.what}` : '';
    switch (e.kind) {
      case 'error': return `Something in the window broke${w}`;
      case 'rejection': return `A step in the window failed${w}`;
      case 'toast': return `An error was shown${w}`;
      case 'reply': return `A reply${e.agent ? ` from ${e.agent}` : ''} failed${w}`;
      case 'crash': return `Hearth crashed earlier${w}`;
      case 'main': return `Hearth's main process hit an error${w}`;
      case 'ipc': return `A request to Hearth's main process failed (${o.plainIpc ? o.plainIpc(e.ch) : e.ch || 'unnamed'})${w}`;
      case 'gpu': return e.src === 'main' ? `The graphics card's process stopped (${e.reason || 'crashed'})${e.code ? `, code ${e.code}` : ''}` : `The graphics card dropped a drawing${w}`;
      case 'page': return `The window's page crashed (${e.reason || e.what || 'gone'}) and reloaded`;
      case 'hang': return `${e.what || 'The window'} stopped answering`;
      case 'child': return `${e.name || 'A program Hearth runs'} stopped (${exit(e)})${e.what && e.what !== e.name ? `: ${e.what}` : ''}`;
      case 'closed': return 'Hearth closed unexpectedly (a crash, a forced quit or the computer turning off)';
      default: return e.what || 'Something went wrong';
    }
  }
  const GROUP = { error: 'window error', rejection: 'window error', toast: 'error shown', reply: 'reply failed', crash: 'crash', main: 'main-process error', ipc: 'failed request', gpu: 'graphics card', page: 'window crash', hang: 'window not answering', child: 'program stopped', closed: 'unexpected close' };
  const plural = (n, w) => `${n} ${w}${n === 1 ? '' : w.endsWith('s') ? 'es' : 's'}`;
  function countLine(entries) {
    const c = new Map();
    for (const e of entries) c.set(GROUP[e.kind] || e.kind, (c.get(GROUP[e.kind] || e.kind) || 0) + (e.n || 1));
    const parts = [...c].map(([k, n]) => plural(n, k));
    return parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}` : parts[0] || '';
  }
  const TIPS = {
    gpu: 'The graphics card restarted: Restart Hearth gets everything drawing normally again.',
    child: 'A program Hearth runs stopped. Restart Hearth starts it fresh; if it keeps stopping, copy the report for Claude.',
    page: 'The window came back by itself. If something still looks wrong, Restart Hearth.',
    hang: 'If it happens again, Restart Hearth, then copy the report for Claude.',
  };
  // data: { now, entries[], started (this run's start), saved? (a report kept after an unexpected close) }
  function summarise(data = {}, o = {}) {
    const now = data.now || Date.now();
    const list = (data.entries || []).filter(Boolean).slice().sort((a, b) => (b.last || b.t) - (a.last || a.t));
    const line = (e) => ({ t: e.last || e.t, time: clock(e.last || e.t), where: e.where || '', n: e.n || 1, kind: e.kind, text: sentence(e, o) });
    const out = { found: list.length > 0, headline: '', counts: '', lines: list.slice(0, 12).map(line), more: Math.max(0, list.length - 12), tip: '', saved: null };
    const since = data.started ? ` since Hearth started ${ago(now - data.started)}` : ' recently';
    if (!list.length) {
      out.headline = `Nothing broke that Hearth could see${since}.`;
      out.tip = 'If something looks wrong anyway: Restart Hearth usually clears it. To get it fixed for good, copy the report for Claude and say in a word what you saw.';
    } else {
      const e = list[0];
      out.headline = `${sentence(e, o).replace(/:.*$/, '')}, ${ago(now - (e.last || e.t))}${e.where ? `, in ${e.where}` : ''}.`;
      out.counts = `${data.started ? 'Since Hearth started' : 'Recently'}: ${countLine(list)}.`;
      out.tip = TIPS[e.kind] || 'Restart Hearth usually clears it. To get it fixed for good: 📋 Copy report for Claude, then paste it into a Claude chat with a word about what you were doing.';
    }
    const sv = data.saved;
    if (sv) {
      const prev = (sv.entries || []).filter(Boolean).slice().sort((a, b) => (b.last || b.t) - (a.last || a.t));
      const head = sv.kind === 'page' ? `The window crashed at ${clock(sv.at)} and came back` : `Hearth closed unexpectedly last time${sv.ended ? ` (last sign of life ${clock(sv.ended)})` : ''}`;
      out.saved = { id: sv.id, at: sv.at, head: `${head}.`,
        counts: prev.length ? `Before that: ${countLine(prev)}.` : 'Nothing had gone wrong before that, as far as Hearth saw (a forced quit or the computer turning off looks like this).',
        lines: prev.slice(0, 12).map(line), where: sv.view || (prev[0]?.where || '') };
    }
    return out;
  }

  // the report for a Claude dev session: plain, complete, redacted
  function report(data = {}, o = {}) {
    const now = data.now || Date.now();
    const s = o.summary || summarise(data, o);
    const iso = (t) => { const d = new Date(t); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${clock(t)}:${pad(d.getSeconds())}`; };
    const i = data.info || {};
    const row = (e) => `- ${iso(e.last || e.t)} · ${e.kind}${e.src === 'main' ? ' (main process)' : ''}${e.where ? ` · in ${e.where}` : ''}${(e.n || 1) > 1 ? ` · ×${e.n}` : ''}${e.ch ? ` · channel ${e.ch}` : ''}${e.name ? ` · ${e.name}` : ''}${e.code != null ? ` · code ${e.code}` : ''}${e.signal ? ` · ${e.signal}` : ''}${e.reason ? ` · ${e.reason}` : ''}${e.what && e.what !== e.name ? ` · ${e.what}` : ''}${e.at?.length ? `\n    at ${e.at.join('\n    at ')}` : ''}`;
    const L = ['🪲 "Something broke" report from Hearth (copied by the owner; redacted: no chat text, no keys or passwords, no folders above the Hearth folder)'];
    L.push(`Hearth ${i.version || '?'}${i.head ? ` (${i.head})` : ''} · ${i.os || i.platform || '?'} ${i.release || ''} ${i.arch || ''} · Electron ${i.electron || '?'}`.replace(/\s+/g, ' ').trim());
    L.push(`Now: ${iso(now)}${data.started ? ` · this start: ${iso(data.started)}` : ''}${data.view ? ` · on screen: ${data.view}` : ''}`);
    if (s.saved) {
      const sv = data.saved || {};
      L.push('', `## ${s.saved.head}`, `Saved ${iso(sv.at || now)}${sv.started ? ` · that run started ${iso(sv.started)}` : ''}${sv.ended ? ` · last sign of life ${iso(sv.ended)}` : ''}${s.saved.where ? ` · on screen then: ${s.saved.where}` : ''}`);
      const prev = (sv.entries || []).slice().sort((a, b) => (b.last || b.t) - (a.last || a.t));
      L.push(...(prev.length ? prev.map(row) : ['- (nothing recorded before it ended)']));
    }
    L.push('', '## This start', `Card said: ${s.headline}${s.counts ? ` ${s.counts}` : ''}`);
    const list = (data.entries || []).slice().sort((a, b) => (b.last || b.t) - (a.last || a.t));
    L.push(...(list.length ? list.map(row) : ['- (nothing recorded)']));
    return L.join('\n');
  }

  return { redact, frames, entry, summarise, report, sentence, countLine, clock, ago, KINDS };
}));
