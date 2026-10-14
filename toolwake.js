// (round 41, toolslim) Opt-in tool sets sleep until an AI is likely to need them. Main process, plain Node (engines.js
// requires it; dev/toolslim-test.js tests it).
//
// The board, capture, Adobe, publishing and app tools are switched on per AI by the owner; each one rides along with
// every message of that AI (≈ 150–480 tokens of definitions, plus a prompt line for the board and apps). Most messages
// never use them. So a set the AI has on is SENT only when:
//   - this AI used one of its tools in the last 7 days (any chat), or the set was switched on in the last 7 days;
//   - the message names what it's for (a board, references, Pinterest; a screenshot, a recording, frames; Photoshop,
//     Premiere…; publishing, Vercel, a website; Meshy, Suno, Figma…);
//   - this engine session already had it (sticky, so the tool list never shrinks under a chat: the prompt cache keeps
//     hitting; a set that wakes mid-chat costs one re-read once, like a picture's Read tool);
//   - the chat itself turned it on (a chat's /capture-tools on).
// Otherwise it sleeps: no definitions, no prompt line, until one of those is true. Nothing is turned off: the owner's
// switches are unchanged, and the set is back the moment it's named.
const fs = require('fs');
const path = require('path');

const DAYS = 7;
const DAY = 86400000;
const SETS = ['boardTools', 'captureTools', 'adobeTools', 'deployTools', 'appsTools'];
// what a message says when it needs a set (whole words, any case). Kept narrow on purpose: a word the owner uses all
// the time for other things (vibe, song, frame, TikTok, app) would wake a set for nothing.
const WORDS = {
  boardTools: /\b(mood ?boards?|boards?|references?|refs?|inspo|inspiration|pinterest)\b/i,
  captureTools: /\b(screen ?shots?|screen ?record\w*|record(s|ed|ing|ings)?|captures?|frames|footage|videos?|clips?|timecodes?|contact sheets?|gifs?|tours?)\b/i,
  adobeTools: /\b(adobe|photoshop|illustrator|premiere|media ?encoder|indesign|after ?effects|psd|extendscript)\b/i,
  deployTools: /\b(deploy\w*|publish\w*|vercel|netlify|cloudflare|github pages|web ?sites?|web ?pages?|hosting|go live|roll ?back)\b/i,
  appsTools: /\b(meshy|suno|figma|spline|sketchfab|mixamo|poly ?haven|unsplash|coolors|google fonts|runway|elevenlabs|youtube studio|3d models?|app windows?)\b/i,
};
// a tool call's name (Claude: mcp__board__board_vibe; Codex: "board · board_vibe") → its set
const TOOL = [[/(^|[_\s·])board_/, 'boardTools'], [/(^|[_\s·])capture_/, 'captureTools'], [/(^|[_\s·])adobe_/, 'adobeTools'], [/(^|[_\s·])deploy_/, 'deployTools'], [/(^|[_\s·])(apps|meshy)_/, 'appsTools']];
const setOfTool = (name) => (TOOL.find(([re]) => re.test(String(name || ''))) || [])[1] || null;

let file = null;
let log = null; // { agentId: { set: last time it was used or switched on (ms) } }
const read = () => { if (!log) { try { log = JSON.parse(fs.readFileSync(file, 'utf8')) || {}; } catch { log = {}; } } return log; };
const write = () => { if (!file) return; try { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(log)); } catch { /* best effort */ } };
function setFile(f) { file = f; log = null; }

// a use (or a first sighting: the owner just switched it on) keeps the set awake for DAYS; written at most hourly
function note(agentId, set, now = Date.now()) {
  if (!agentId || !SETS.includes(set)) return;
  const mine = (read()[agentId] ||= {});
  if (mine[set] && now - mine[set] < 3600000) return;
  mine[set] = now;
  write();
}
function noteTool(agentId, name, now = Date.now()) { const s = setOfTool(name); if (s) note(agentId, s, now); }

// The opt-in sets this message leaves out (sleeping), and the sets the session keeps from now on (sticky).
//   agent: the agent as send() built it; text: the message; session: the chat's engine session (its .sets is the
//   sticky list); keep: sets the chat itself turned on (always sent).
//   base: the agent as the owner set it up (before a run's own changes): a set switched off there is forgotten, so
//   switching it on again later starts a fresh week.
function plan(agent, { text = '', session = null, keep = [], now = Date.now(), base = null } = {}) {
  if (base && agent.id) { const m = read()[agent.id]; const off = m ? SETS.filter((k) => m[k] && !base[k]) : []; if (off.length) { for (const k of off) delete m[k]; write(); } }
  const on = SETS.filter((k) => agent[k]);
  if (!on.length) return { sleep: [], sticky: Array.isArray(session?.sets) ? session.sets : [] };
  const had = new Set(Array.isArray(session?.sets) ? session.sets : []);
  const mine = read()[agent.id] || {};
  const sleep = [];
  for (const k of on) {
    if (keep.includes(k) || had.has(k) || WORDS[k].test(String(text || ''))) continue;
    if (!mine[k]) { note(agent.id, k, now); continue; } // switched on since we last looked: a week to show it's used
    if (now - mine[k] < DAYS * DAY) continue;
    sleep.push(k);
  }
  const sticky = [...new Set([...had, ...on.filter((k) => !sleep.includes(k))])].sort();
  return { sleep, sticky };
}

module.exports = { plan, note, noteTool, setOfTool, setFile, SETS, WORDS, DAYS, _test: { reset: () => { log = null; }, get log() { return read(); } } };
