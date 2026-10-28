#!/usr/bin/env node
// (round 56, fixes56) chatsafe's rule, checked in the code: a chat's agent id (which AI it belongs to) is set when the
// chat is made and never changed after. The only ways a chat gets an agent id:
//   - made: a new chat object with a new id (a new chat, an import, a handoff / "Continue with Claude…" copy, a split…)
//   - "Bring back <its AI>": the AI comes back under the SAME id; the chat file isn't written at all
//   - an old chat that names no AI at all, opened in Claude's view (where the chats list shows it): Claude's id written
//     down, nothing moved (native.js render)
// This scan reads every file Hearth ships (renderer, main side, MCP servers, tools/) and fails on:
//   A. `x.agentId = …` (also ||= / ??=) anywhere not listed in ALLOW below with why it isn't a chat being moved
//   B. a copy of an object that keeps its id with a new agentId: `{ ...x, agentId: … }` / Object.assign(x, { agentId })
//      with no new `id:` in the same literal
// A new place that sets an agent id either makes a chat (a new id) or is not a chat: add it to ALLOW with the reason.
//   node dev/chatsafe-scan.js      (unit:chatsafe-scan) → "N files, 0 problems" or FAIL lines
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SKIP = new Set(['dev', 'docs', 'data', 'electron', 'electron-mac', 'node_modules', '.git', '.claude', 'mac', 'assets', 'tools/basisu']);
// [file, a piece of the line, why it's fine]
const ALLOW = [
  ['makes.js', 'part.agentId = agent.id', 'a make\'s part (its chat room is made right there with a new id)'],
  ['options.js', 'sheet.agentId = a.id', 'the AI setup sheet: which AI it shows, not a chat'],
  ['options.js', 'sheet.agentId = x.id', 'the AI setup sheet\'s AI chips: which AI it shows, not a chat'],
  ['apps-meshy.js', '{ ...base, agentId: ctx.agentId || base.agentId }', 'a Meshy job\'s note of who asked (for its permission card), not a chat'],
  ['quickstart.js', '{ ...labNow(), agentId: director()?.id || null', 'Quick start\'s picture of the Lab (which director is there), not a chat'],
  ['routines.js', 'agentId, chatId: chat.id, title: chat.title', 'a 🔁 Keep going routine: the chat it runs in (the chat keeps its own AI) · (round 74) Codex\'s budget spread now sits between ...spec and agentId'],
  ['projbundle.js', 'c.chat.agentId = agent.id;', 'a project bundle\'s chat being imported: it gets a fresh id here (ids.chat → fresh(), round 75 projbundle75) before it is saved'],
  ['versions-core.js', 'if (current?.agentId) v.agentId = current.agentId;', 'an earlier version of a chat put back keeps the chat\'s CURRENT AI (versions75): the rule itself, not a move'],
  ['twocomputers.js', '{ ...p, agentId: a.id, agent: a.name }', 'a row of the file-access list (which AI\'s folder), not a chat'],
  ['voice.js', 'S.agentId = agentId', 'voice input state: which chat composer gets the words'],
  ['native.js', 'if (chat && !chat.agentId && (agentId === home || !home)) { chat.agentId = agentId;', 'a chat that names no AI, opened in Claude\'s view (its home in the chats list): written down, nothing moved'],
];

function files(dir = ROOT, rel = '') {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const r = `${rel}${e.name}`;
    if (e.isDirectory()) { if (!SKIP.has(e.name) && !SKIP.has(r)) out.push(...files(path.join(dir, e.name), `${r}/`)); } else if (/\.(?:m?js|cjs)$/.test(e.name) || (/\.html$/.test(e.name) && rel.startsWith('tools/'))) out.push(r);
  }
  return out;
}
// the object literal starting at `{` (index a) on its line, nested braces skipped (strings aren't parsed: good enough here)
function literal(line, a) {
  let d = 0;
  for (let i = a; i < line.length; i++) { if (line[i] === '{') d++; else if (line[i] === '}') { d--; if (!d) return line.slice(a, i + 1); } }
  return line.slice(a);
}
// the top level of a literal only (what's inside nested braces / brackets / parentheses blanked)
function top(lit) {
  let d = 0; let s = '';
  for (let i = 0; i < lit.length; i++) { const c = lit[i]; if ('{[('.includes(c)) { d++; s += d === 1 ? c : ' '; } else if ('}])'.includes(c)) { s += d === 1 ? c : ' '; d--; } else s += d === 1 ? c : ' '; }
  return s;
}
function scan() {
  const problems = []; const used = new Set(); let n = 0;
  for (const f of files()) {
    n++;
    const lines = fs.readFileSync(path.join(ROOT, f), 'utf8').split('\n');
    lines.forEach((line, i) => {
      if (/^\s*\/\//.test(line)) return;
      const at = `${f}:${i + 1}`;
      // A. a member assignment of agentId
      for (const m of line.matchAll(/([\w$\])]+)\.agentId\s*(?:\|\||\?\?)?=(?![=>])/g)) {
        const ok = ALLOW.find(([file, piece]) => file === f && line.includes(piece));
        if (ok) used.add(ok); else problems.push(`${at}: sets ${m[1]}.agentId (${line.trim().slice(0, 120)})`);
      }
      if (/Object\.assign\(\s*\w+\s*,\s*\{[^}]*\bagentId\s*:/.test(line) && !/Object\.assign\(\s*\{\s*\}/.test(line)) {
        const ok = ALLOW.find(([file, piece]) => file === f && line.includes(piece));
        if (ok) used.add(ok); else problems.push(`${at}: Object.assign(…, { agentId }) (${line.trim().slice(0, 120)})`);
      }
    });
    // B. a copy that keeps the object's id with a new agentId (over the whole file: a literal can span lines)
    const text = lines.join('\n');
    for (const m of text.matchAll(/\{\s*\.\.\.(?![({[\s])/g)) { // (a spread of a fresh literal, `...(x ? { … } : {})`, copies nothing)
      const lit = literal(text, m.index);
      const t = top(lit);
      if (!/[,{]\s*agentId\s*[:,}]/.test(t) || /[,{]\s*id\s*[:,}]/.test(t)) continue; // no agentId / a new id: a new chat (made / copied)
      const ln = text.slice(0, m.index).split('\n').length;
      if (/^\s*\/\//.test(lines[ln - 1])) continue;
      const ok = ALLOW.find(([file, piece]) => file === f && lit.replace(/\s+/g, ' ').includes(piece));
      if (ok) used.add(ok); else problems.push(`${f}:${ln}: copies an object with a new agentId and its old id (${t.replace(/\s+/g, ' ').trim().slice(0, 120)})`);
    }
  }
  for (const x of ALLOW) if (!used.has(x)) problems.push(`ALLOW entry no longer found (remove it): ${x[0]}: ${x[1]}`);
  return { files: n, problems };
}

if (require.main === module) {
  const r = scan();
  // the scan itself catches each kind (a quick self-test on made-up lines)
  const self = [];
  const probe = (line) => { const m = []; for (const x of line.matchAll(/([\w$\])]+)\.agentId\s*(?:\|\||\?\?)?=(?![=>])/g)) m.push(x); const a = line.indexOf('{'); const t = a >= 0 ? top(literal(line, a)) : ''; return m.length > 0 || (/^\{\s*\.\.\.[\w$.?()[\]]+/.test(t) && /[,{]\s*agentId\s*[:,}]/.test(t) && !/[,{]\s*id\s*[:,}]/.test(t)); };
  for (const bad of ['chat.agentId = other.id;', 'c.agentId ||= H.claudeAgent().id;', 'const moved = { ...chat, agentId: to.id };', 'save({ ...c, agentId, updatedAt: now });', 'const moved = {\n  ...chat,\n  agentId: to.id,\n};']) if (!probe(bad)) self.push(`the scan misses: ${bad}`);
  for (const good of ['if (chat.agentId === a.id) x();', 'const copy = { ...chat, id: `${to}-${t}`, agentId: to };', 'const k = { ...o, meta: { agentId: 1 } };', 'f(a.agentId => 1)']) if (probe(good)) self.push(`the scan wrongly flags: ${good}`);
  const all = [...self, ...r.problems];
  for (const p of all) console.log(`FAIL ${p}`);
  console.log(`${r.files} files, ${all.length} problem(s)`);
  process.exit(all.length ? 1 : 0);
}
module.exports = { scan };
