// Report to the developer (round 21, devreport): the pure part, shared by the window (devreport.js) and the Node tests
// (dev/devreport-test.js). Nothing here touches the network, the disk or the page.
//   mask(text, { home, appDir })  secrets out (AccessRules.redact + a few more token shapes, private keys, e-mail
//                                 names), the home folder → ~, file:// URLs of the app → app-relative "file.js:12"
//   appStack(stack, opts)         a stack trace down to the app's own lines ("native.js:1387 send"), ≤ 12 lines
//   keyOf(text)                   the same error with another path / number / id is the same report (for the dedupe)
//   dupOf(list, key, now)         a report of that error sent in the last day, if any
//   body(r, { chat })             the issue's Markdown (sections, a hidden id line the developer's fix can name)
//   issueUrl(title, body)         the prefilled github.com/…/issues/new URL, the body trimmed to fit (with a note)
//   fixedBy(messages, reports)    which sent reports a batch of commit messages fixes ("Fixes #12", "fixes hr-ab12cd")
const DevReportCore = (() => {
  const REPO = 'kidswaste/hearth';
  const LABEL = 'hearth-report';
  const DAY = 864e5;
  const URL_MAX = 7000; // GitHub (and browsers) cut longer new-issue links; the full text goes to the clipboard
  const R = typeof AccessRules !== 'undefined' ? AccessRules : (typeof require === 'function' ? (() => { try { return require('./access-rules.js'); } catch { return null; } })() : null);
  const redact = (t) => (R?.redact ? R.redact(t) : String(t ?? ''));
  const esc = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  function mask(text, { home = '', appDir = '' } = {}) {
    let t = redact(String(text ?? ''));
    t = t
      .replace(/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(-----END [A-Z ]*PRIVATE KEY-----|$)/g, '••• (private key removed)')
      .replace(/\b(github_pat_[A-Za-z0-9_]{20,}|sk-ant-[A-Za-z0-9_-]{8,}|eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{6,}|npm_[A-Za-z0-9]{20,}|glpat-[A-Za-z0-9_-]{16,})/g, '•••')
      .replace(/((?:client[_-]?secret|access[_-]?key|private[_-]?key|session[_-]?id|cookie)["']?\s*[:=]\s*["']?)[^\s"'&,;]+/gi, '$1•••')
      .replace(/([?&](?:key|token|access_token|sig|signature|code)=)[^&\s]+/gi, '$1•••')
      .replace(/\b([A-Za-z0-9._%+-])[A-Za-z0-9._%+-]*@([A-Za-z0-9.-]+\.[A-Za-z]{2,})\b/g, '$1•••@$2');
    // the app's own files: "file:///Users/x/Library/…/Hearth/tools/three.js:120:7" → "tools/three.js:120"
    if (appDir) {
      const a = String(appDir).replace(/[\\/]+$/, '');
      const fwd = a.replace(/\\/g, '/');
      for (const v of new Set([fwd, encodeURI(fwd)])) t = t.replace(new RegExp(`file:\\/\\/\\/?${esc(v.replace(/^\//, ''))}\\/`, 'gi'), '');
      t = t.split(`${a}${a.includes('\\') ? '\\' : '/'}`).join('').split(`${fwd}/`).join('').split(a).join('‹app›');
    }
    if (home) {
      const h = String(home).replace(/[\\/]+$/, '');
      t = t.split(h).join('~').split(h.replace(/\\/g, '/')).join('~');
    }
    // any other home folder (another computer's paths, a synced log): the user name goes
    t = t.replace(/(^|[\s"'(=:])\/(Users|home)\/[^/\s"')]+/g, '$1~').replace(/\b[A-Za-z]:\\Users\\[^\\\s"')]+/g, '~').replace(/file:\/\/~/g, '~');
    return t;
  }

  // the app's lines of a stack: "    at send (file:///…/native.js:1387:12)" → "native.js:1387 send"
  function appStack(stack, opts = {}) {
    const out = [];
    for (const raw of String(stack || '').split('\n').slice(1)) {
      const line = mask(raw.trim(), opts);
      const m = line.match(/^at (?:async )?(?:(.+?) \()?(.+?)\)?$/);
      if (!m) continue;
      const where = (() => { try { return decodeURI(m[2]); } catch { return m[2]; } })().replace(/:(\d+):\d+$/, ':$1');
      if (/^(node:|electron\/|internal\/|<anonymous>$|native$|file:|https?:|~)/.test(where)) continue; // only the app's own files
      out.push(`${where}${m[1] ? ` ${m[1].replace(/^Object\./, '')}` : ''}`);
      if (out.length >= 12) break;
    }
    return out;
  }

  const keyOf = (text) => String(text || '').split('\n')[0].replace(/(?:[A-Za-z]:)?[\\/][^\s'"`)]+/g, '‹path›').replace(/\b[0-9a-f]{8,}\b/gi, '‹id›').replace(/\d+(\.\d+)?/g, '#').replace(/\s+/g, ' ').trim().toLowerCase().slice(0, 160);
  const dupOf = (list, key, now = Date.now()) => (key ? (list || []).find((x) => x.key === key && now - (x.at || 0) < DAY) || null : null);
  const newId = () => `hr-${Math.random().toString(36).slice(2, 8)}`;

  const fence = (s) => { const t = String(s || '').replace(/\n{3,}/g, '\n\n').trimEnd(); return `\`\`\`\n${t.replace(/```/g, 'ˋˋˋ')}\n\`\`\``; };
  // r: { id, title, what, doing, error: { message, stack[] }, logs: { engine[], errors[], jank[] }, info: {…}, steps[], chat }
  function body(r, { chat = false } = {}) {
    const L = [`<!-- hearth-report ${r.id} -->`];
    if (r.what) L.push(`**What went wrong:** ${r.what}`);
    if (r.doing) L.push(`**What I was doing:** ${r.doing}`);
    if (r.error?.message) {
      L.push('### Error', fence([r.error.message, ...(r.error.stack || []).map((l) => `  at ${l}`)].join('\n')));
    }
    const logs = r.logs || {};
    const parts = [
      logs.errors?.length ? `# error log (most frequent first)\n${logs.errors.join('\n')}` : '',
      logs.jank?.length ? `# jank: top culprits\n${logs.jank.join('\n')}` : '',
      logs.engine?.length ? `# engine.log (tail)\n${logs.engine.join('\n')}` : '',
      logs.extra?.length ? logs.extra.join('\n') : '',
    ].filter(Boolean);
    if (parts.length) L.push('### Recent log', fence(parts.join('\n\n')));
    const i = r.info || {};
    const env = [
      `- Hearth: ${i.head || '?'}${i.branch && i.branch !== 'main' ? ` (branch ${i.branch})` : ''}${i.dirty ? `, ${i.dirty} file${i.dirty === 1 ? '' : 's'} edited by hand` : ''}`,
      `- OS: ${[i.os, i.release, i.arch].filter(Boolean).join(' ') || '?'}`,
      `- Electron ${i.electron || '?'} · Chrome ${i.chrome || '?'} · Node ${i.node || '?'}`,
      i.engines ? `- Engines: ${i.engines}` : '',
      i.where ? `- Where: ${i.where}` : '',
      r.steps?.length ? `- The chat's last steps: ${r.steps.join(', ')}` : '',
    ].filter(Boolean);
    L.push('### Hearth', env.join('\n'));
    if (chat && r.chat) L.push(`<!-- chat -->\n<details><summary>Chat text (shared by the owner)</summary>\n\n${fence(r.chat)}\n</details>\n<!-- /chat -->`);
    L.push(`---\n_Sent from Hearth's "Report to the developer" (${r.id}). Developer: put \`Fixes #<this issue>\` in the fix commit; the owner sees "your report is fixed" after ⬆ Update._`);
    return L.join('\n\n');
  }

  function issueUrl(title, text, max = URL_MAX) {
    const base = `https://github.com/${REPO}/issues/new?labels=${encodeURIComponent(LABEL)}&title=${encodeURIComponent(String(title).slice(0, 200))}&body=`;
    const full = encodeURIComponent(text);
    if (base.length + full.length <= max) return { url: base + full, trimmed: false };
    const note = '\n\n…(trimmed to fit the link: the full report is on the clipboard, paste it here over this text)';
    let lo = 0; let hi = text.length;
    while (lo < hi) { const mid = Math.ceil((lo + hi) / 2); if (base.length + encodeURIComponent(text.slice(0, mid) + note).length <= max) lo = mid; else hi = mid - 1; }
    return { url: base + encodeURIComponent(text.slice(0, lo) + note), trimmed: true };
  }

  // commit messages → the sent reports they fix
  const FIX = /\b(?:fix(?:e[sd])?|close[sd]?|resolve[sd]?)\b[:\s]*(?:(?:kidswaste\/hearth)?#(\d+)|(hr-[a-z0-9]{6}))/gi;
  function fixedBy(messages, reports) {
    const nums = new Set(); const ids = new Set();
    for (const m of messages || []) for (const x of String(m || '').matchAll(FIX)) { if (x[1]) nums.add(Number(x[1])); if (x[2]) ids.add(x[2].toLowerCase()); }
    return (reports || []).filter((r) => r.state !== 'fixed' && ((r.number && nums.has(Number(r.number))) || ids.has(String(r.id).toLowerCase())));
  }

  return { REPO, LABEL, DAY, URL_MAX, mask, appStack, keyOf, dupOf, newId, body, issueUrl, fixedBy };
})();
if (typeof module !== 'undefined') module.exports = DevReportCore;
