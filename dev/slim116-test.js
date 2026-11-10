#!/usr/bin/env node
// (round 116, slim116) Hearth without the Life tab (quests, Paris, outings, shows…) and the music studio (Sound desk,
// VST hosting, live set, park jam…): docs/upgrades/slim116.md. Plain Node, reads source text only (≈ 1 s), part of `unit`.
//   1. require-scan: every remaining file's references resolve — require('./x') / require('../x') / require(path.join(
//      __dirname | ROOT, 'a', 'b')), main.js's lazyIpc('x.js'), path.join(__dirname, 'x.js|html|py'), new Worker('…'),
//      index.html's scripts and stylesheets, lazy-data.js's groups (files, css, after), dev/run-checks.js's unit tests
//      and every name in its GROUPS (a check, a unit test or another group)
//   2. leftover grep: no file outside docs/ names a removed module, global, lazy group, IPC channel, hub bridge or the
//      Life tab's surface (a line that says slim116 explains the cut and is allowed)
// The owner's data is never read here (and the app never deletes the old stores: they just aren't read any more).
//   node dev/slim116-test.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const problems = [];
let checks = 0;
const bad = (msg) => problems.push(msg);
const rel = (p) => path.relative(ROOT, p).split(path.sep).join('/');
const SKIP_DIRS = new Set(['.git', 'node_modules', 'electron', 'electron-mac', 'data', 'docs', '.claude']);
function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name) && !e.name.startsWith('.')) walk(path.join(dir, e.name), out); } else out.push(path.join(dir, e.name));
  }
  return out;
}
const FILES = walk(ROOT).filter((f) => /\.(js|mjs|cjs|html|css|json|py)$/.test(f) && !/[\\/]tools[\\/]basisu[\\/]/.test(f));
const read = (f) => fs.readFileSync(f, 'utf8');
const exists = (p) => fs.existsSync(p);
const resolves = (p) => ['', '.js', '.json', '.mjs', '.cjs', '/index.js'].some((x) => exists(p + x));

// ---------- 1. require-scan ----------
// requires that are meant not to resolve from where they're written: code a test sends into an app copy (run from the
// app's root), and a module some Hearth copies don't have (in a try)
const NOT_HERE = new Set(['dev/bigchat82-delta.js|./store.js', 'dev/configsafe-test.js|./config.json', 'dev/emptyread104-test.js|./store', 'dev/importer-test.js|./store', 'dev/store-thread-test.js|./store.js', 'gamemodemain.js|./gameperfmain']);
const code = (src) => src.replace(/^[ \t]*\/\/[^\n]*$/gm, ''); // whole-line comments (notes like this one) aren't code
for (const f of FILES.filter((x) => /\.(js|mjs|cjs)$/.test(x))) {
  const src = code(read(f)); const dir = path.dirname(f);
  for (const m of src.matchAll(/\brequire\(\s*(['"])(\.{1,2}\/[^'"]+)\1\s*\)/g)) { checks++; if (!NOT_HERE.has(`${rel(f)}|${m[2]}`) && !resolves(path.resolve(dir, m[2]))) bad(`${rel(f)}: require('${m[2]}') doesn't resolve`); }
  for (const m of src.matchAll(/\brequire\(\s*path\.join\(\s*(__dirname|ROOT)\s*((?:,\s*'[^']+'\s*)+)\)\s*\)/g)) {
    const parts = [...m[2].matchAll(/'([^']+)'/g)].map((x) => x[1]);
    const base = m[1] === '__dirname' ? dir : ROOT;
    checks++; if (!resolves(path.join(base, ...parts))) bad(`${rel(f)}: require(path.join(${m[1]}, ${parts.join(', ')})) doesn't resolve`);
  }
  // a file of the app named next to the code (preloads, pages, helpers): path.join(__dirname, 'x.js' | 'tools', 'x.html' …)
  for (const m of src.matchAll(/path\.join\(\s*__dirname\s*((?:,\s*'[^']+'\s*)+)\)/g)) {
    const parts = [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
    if (!/\.(js|html|py)$/.test(parts.at(-1)) || parts.some((p) => p.includes('..') || p.startsWith('data'))) continue;
    checks++; if (!exists(path.join(dir, ...parts))) bad(`${rel(f)}: path.join(__dirname, ${parts.map((p) => `'${p}'`).join(', ')}) is missing`);
  }
  for (const m of src.matchAll(/new (?:Shared)?Worker\(\s*'([^'$`]+\.js)'/g)) { checks++; if (!exists(path.join(ROOT, m[1])) && !exists(path.join(dir, m[1]))) bad(`${rel(f)}: new Worker('${m[1]}') is missing`); }
}
const mainSrc = read(path.join(ROOT, 'main.js'));
for (const m of mainSrc.matchAll(/lazyIpc\('([^']+)'/g)) { if (m[1] === 'file') continue; checks++; if (!exists(path.join(ROOT, m[1]))) bad(`main.js: lazyIpc('${m[1]}') is missing`); }
const html = read(path.join(ROOT, 'index.html'));
for (const m of html.matchAll(/<(?:script[^>]*\ssrc|link[^>]*\shref)="([^"#?]+)/g)) { if (/^https?:/.test(m[1])) continue; checks++; if (!exists(path.join(ROOT, m[1]))) bad(`index.html: ${m[1]} is missing`); }
const LazyData = new Function(`${read(path.join(ROOT, 'lazy-data.js'))}; return LazyData;`)(); // eslint-disable-line no-new-func
const groups = new Set(LazyData.GROUPS.map((g) => g.name));
for (const g of LazyData.GROUPS) {
  for (const f of [...g.files, ...(g.css || [])]) { checks++; if (!exists(path.join(ROOT, f))) bad(`lazy-data.js ${g.name}: ${f} is missing`); }
  for (const a of g.after || []) { checks++; if (!groups.has(a)) bad(`lazy-data.js ${g.name}: after '${a}' isn't a group`); }
}
for (const name of Object.keys(LazyData.META || {})) { checks++; if (!groups.has(name)) bad(`lazy-data.js META: '${name}' isn't a group (node dev/lazy-manifest.js)`); }
// dev/run-checks.js: unit tests are files; GROUPS name checks, unit tests or groups
const rc = read(path.join(__dirname, 'run-checks.js'));
const UNIT = [...rc.matchAll(/^(?:const UNIT = \[|UNIT\.push\()([^\n]*)/gm)].flatMap((m) => [...m[1].split('//')[0].matchAll(/'([^']+)'/g)].map((x) => x[1]));
for (const u of UNIT) { checks++; if (!exists(path.join(__dirname, `${u}.js`))) bad(`run-checks.js UNIT: dev/${u}.js is missing`); }
const gsrc = rc.slice(rc.indexOf('const GROUPS = {'), rc.indexOf('\n};', rc.indexOf('const GROUPS = {')));
const gkeys = new Set([...gsrc.matchAll(/^\s+'?([\w-]+)'?: /gm)].map((m) => m[1]));
const checkNames = new Set(fs.readdirSync(path.join(__dirname, 'checks')).filter((f) => f.endsWith('.js')).map((f) => f.slice(0, -3)));
for (const m of gsrc.matchAll(/^\s+'?([\w-]+)'?: \[([^\]]*)\]/gm)) {
  for (const [, n] of m[2].matchAll(/'([^']+)'/g)) {
    checks++;
    const ok = n.startsWith('unit:') ? exists(path.join(__dirname, `${n.slice(5)}.js`)) : checkNames.has(n) || gkeys.has(n);
    if (!ok) bad(`run-checks.js GROUPS.${m[1]}: '${n}' is no check, unit test or group`);
  }
}

// ---------- 2. leftover grep ----------
const REMOVED_FILES = `audiodoctor-core.js audiodoctor.css audiodoctor.js audiodoctormain.js beforego-core.js beforego.css beforego.js
bouncelogmain.js clickfirst.css clickfirst.js creative-vst-doctor.py creative-vst-embed.py creative-vst-host.py creative-vst-liveset.py
creative-vst-midimap.py creative-vst-offline.py creative-vst-sketch.py creative-vstmain.js dawsendmain.js eatnearby-core.js eatnearby.css
eatnearby.js follow-core.js follow-hook.js follow.css follow.js device_HearthQuest.py invite-core.js invite-hook.js invite.css invite.js
leavesoon-core.js leavesoon.css leavesoon.js leavesoonmain.js outing-guide-core.js outing-guide.css outing-guide.js outing-guidemain.js
parisphotosmain.js questguide-core.js questguide-flp.js questguide-preload.js questguide-project.js questguide-window.css
questguide-window.html questguide-window.js questguide.css questguide.js questguidemain.js questhud-core.js questhud.css questhud.js
ratp-core.js ratpmain.js refabmain.js rewards-core.js rewards.css rewards.js showprep-core.js showprep.css showprep.js showprepmain.js
showsync-core.js showsync-syndicated.js showsync-venues.js showsync.css showsync.js showsyncmain.js sketchpadsmain.js soundbankmain.js
tickets-core.js tickets-hook.js tickets.css tickets.js ticketsmain.js audiodoctor-desk.js bouncelog-core.js bouncelog.css bouncelog.js
dawsend-core.js dawsend.css dawsend.js errands-core.js errands.css errands.js herepin-core.js herepin.css herepin.js liveset-core.js
liveset-quest.js liveset.css liveset.js loopsong-core.js loopsong.css loopsong.js midilearn-core.js midilearn.css midilearn.js
outing-core.js outing-desk.css outing-desk.js parisjournal-core.js parisjournal.css parisjournal.js parisphotos-core.js parisphotos.css
parisphotos.js parkjam-core.js parkjam.css parkjam.js preset-hover-core.js preset-hover.css preset-hover.js quest-atlas-index.js
quest-atlas-worker.js quest-atlas.js quest-catalog.js quest-chat-core.js quest-chat.js quest-core.js quest-journal.css quest-journal.js
quest-mapfirst.css quest-mapfirst.js quest-paris-ui.js quest-paris.js quest-project.js quest-proof.js quest-review.js quest-shelf.js
quest-walk-core.js quest-walk.css quest-walk.js refab-core.js refab.css refab.js sketchpads-core.js sketchpads.css sketchpads.js
soundbank-core.js soundbank.css soundbank.js studiohours-core.js studiohours.css studiohours.js workbench-vst-embed.js
workbench-vst-live.js workbench-vst.css workbench-vst.js trynew-core.js trynew.css trynew.js trynew71-core.js
weekendplan-core.js weekendplan.css weekendplan.js weekquest-core.js weekquest-nudge.js weekquest.css weekquest.js
weekquestmain.js`.split(/\s+/);
const REMOVED_GLOBALS = `QuestCore QuestHud QuestHudCore QuestJournal QuestGuide QuestGuideCore QuestParis QuestParisUI QuestReview QuestProof
QuestChat QuestChatCore QuestCatalog QuestWalk QuestWalkCore QuestMapFirst QuestAtlas QuestShelf QuestProject OutingCore OutingDesk
ShowSync ShowSyncCore ShowPrep ShowPrepCore WeekQuest WeekQuestCore WeekNudge WeekendPlan WeekendPlanCore RewardsCore RewardShelf
ClickFirst TryNew TryNewCore TryNew71Core TicketsCore TicketsHook RatpCore LeaveSoon LeaveSoonCore EatNearby EatNearbyCore BeforeGo
BeforeGoCore InviteCore InviteHook FollowCore FollowHook HerePin HerePinCore ErrandsCore ParisJournal ParisJournalCore ParisPhotos
ParisPhotosCore StudioHours StudioHoursCore WorkbenchVST WorkbenchVSTLive WorkbenchVSTEmbed PresetHover PresetHoverCore ParkJam
ParkJamCore LoopSong LoopSongCore LiveSet LiveSetCore BounceLog BounceLogCore SoundBank SoundBankCore AudioDoctor AudioDoctorCore
AudioDoctorDesk SketchPads SketchPadsCore RefAB RefabCore MidiLearn MidiLearnCore DawSend DawSendCore MIDIMAP_ACTIONS`.split(/\s+/);
const REMOVED_GROUPS = 'questjournal audiodoctor questcore questhud weekquest weekendplan leavesoon eatnearby beforego tickets follow studiohours invite sketchpads refab midilearn dawsend trynew'.split(' ');
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const LEFT = [
  [new RegExp(`(?<![\\w.-])(${REMOVED_FILES.map(esc).join('|')})(?![\\w-])`), 'a removed file'],
  [new RegExp(`\\b(${REMOVED_GLOBALS.join('|')})\\b`), 'a removed module'],
  [new RegExp(`Lazy\\.\\w+\\(\\s*['"](${REMOVED_GROUPS.join('|')})['"]`), 'a removed lazy group'],
  [/['"`](creative-vst|soundbank|audiodoctor|bouncelog|dawsend|sketchpads|parisphotos|questguide|weekquest|shows|leave|tickets):|['"`]outing:guide/, 'a removed IPC channel'],
  [/\bhub\??\.(questGuide|onQuestGuide\w*|outingGuide|onOutingGuide|vst|soundbank|parkSong|audioDoctor|liveset|bouncelog|dawsend|sketchpads|parisPhotos|weekquest|shows|leave|tickets)\b/, 'a removed preload bridge'],
  [/['"`]tool:quests['"`]|\bchat_sound\b/, 'the Life tab / the Sound desk tool'],
];
const SELF = path.join(__dirname, 'slim116-test.js');
for (const f of FILES) {
  if (f === SELF) continue;
  const lines = read(f).split('\n');
  lines.forEach((line, i) => {
    if (line.includes('slim116')) return; // a line that explains the cut
    for (const [re, what] of LEFT) { const m = line.match(re); if (m) bad(`${rel(f)}:${i + 1}: ${what} (${m[0]}): ${line.trim().slice(0, 140)}`); }
  });
  checks++;
}

if (problems.length) { console.log(problems.slice(0, 200).join('\n')); console.log(`slim116-test: ${problems.length} problem(s) in ${checks} checks`); process.exit(1); }
console.log(`slim116-test: ${checks} checks passed (${FILES.length} files: every reference resolves, nothing names the Life tab or the music studio)`);
