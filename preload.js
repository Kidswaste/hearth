const { contextBridge, ipcRenderer, webFrame, webUtils } = require('electron');

const on = (channel) => (cb) => ipcRenderer.on(channel, (_e, data) => cb(data));
const call = (channel) => (...args) => ipcRenderer.invoke(channel, ...args);
// (round 38, bigscreen) the size of everything for this screen, before the page's first frame (main.js picks it)
const startZoom = Number((process.argv.find((a) => a.startsWith('--hearth-zoom=')) || '').slice(14)) || 1;
if (startZoom !== 1) { try { webFrame.setZoomFactor(startZoom); } catch { /* the page re-applies it */ } }
// (round 154, mem154) the window has been hidden or minimised a while (memtrimmain.js): Blink's caches emptied and a
// full garbage collection under "memory pressure" (webFrame.clearCache), then the page drops its own caches
// ('hearth:mem-trim'). Asked by the main process only; nothing the page can call.
// (round 176, keep176) { deep } after 5 min out of sight: the page lets go of the chats it keeps ready first
// ('hearth:mem-trim-deep'), so this GC takes them
ipcRenderer.on('mem:trim', (_e, o) => {
  try { window.dispatchEvent(new Event(o?.deep ? 'hearth:mem-trim-deep' : 'hearth:mem-trim')); } catch { /* no page yet */ }
  try { webFrame.clearCache(); } catch { /* old Electron */ }
});

contextBridge.exposeInMainWorld('hub', {
  // (round 72, longrun72) how many IPC listeners this window holds (in all, and per channel with more than one): the
  // hub.onX(cb) subscriptions have no "off", so one made again and again piles up for as long as the window lives
  ipcListeners: () => { const multi = {}; let total = 0; for (const n of ipcRenderer.eventNames()) { const c = ipcRenderer.listenerCount(n); total += c; if (c > 1) multi[String(n)] = c; } return { total, multi }; },
  getConfig: call('config:get'),
  saveConfig: call('config:save'),
  onConfigChanged: on('config:changed'),
  onShortcut: on('shortcut'),
  openFile: call('open-file'),
  openExternal: call('open-external'),
  openDataFolder: call('open-data-folder'),

  listChats: call('chats:list'),
  getChat: call('chats:get'),
  saveChat: call('chats:save'),
  openChat: call('chats:open'), openChatPart: call('chats:part'), saveChatDelta: call('chats:delta'), chatWin: call('chats:win'), // (round 82, bigchat82) giant chats: opened as bytes, saved by what changed (chatsave.js) · (round 86) windowed: ranges, find
  deleteChat: call('chats:delete'),
  searchChatText: call('chats:searchText'),
  projFind: call('projects:find'), // (round 81, projsearch81) Find in this project ({ spec, q?, budgetMs? }) → grouped hits / { left } (projfind-core.js on the store thread)
  chatFind: call('chats:find'), // (round 113, search113) ({ q, budgetMs?, limit? }) → { hits: [{ chatId, agentId, title, k, snippet, count, project }], total, left, unread }
  recall: call('chats:recall'), // (round 30) ({ q?, budgetMs? }) → ranked decisions / open questions / mentions, or { left } (recall-core.js)
  listChatTrash: call('chats:trash'),
  restoreChat: call('chats:restore'),
  importChats: call('chats:import'), // (opts?: { path, dryRun }) → summary; no path opens a file dialog
  onImportProgress: on('import:progress'),
  backup: { now: call('backup:now'), list: call('backup:list'), dir: call('backup:dir'), pick: call('backup:pick'), restore: call('backup:restore') },
  pickFolder: call('pick-folder'),
  getMemory: call('memory:get'),
  saveMemory: call('memory:save'),
  getConnectors: call('connectors:get'),
  refreshConnectors: call('connectors:refresh'),
  connections: { test: call('connections:test'), which: call('connections:which') }, // (round 26) the owner's own MCP servers (connectionsmain.js)
  getHistory: call('history:get'),
  saveHistory: call('history:save'),
  kvGet: call('kv:get'),
  kvPick: call('kv:pick'), // (round 73) a big list store's rows with only some fields: kvPick('three-sketches', ['id', 'name', 'updatedAt'])
  kvSet: call('kv:set'),
  kvMerge: call('kv:merge'), // (round 73, chatsteady73) a store saved by what changed: [op, path, value] (store.js mergeKV)
  saveAttachment: call('attachments:save'),
  importRef: call('refs:import'),
  importRefWhole: call('refs:importWhole'), refUses: call('refs:uses'), // (round 99, labmodels99)
  attachmentsDir: call('attachments:dir'),
  getUsage: call('usage:get'),
  getTokenStats: (...a) => ipcRenderer.invoke('usage:stats', ...a).then((r) => (typeof r === 'string' ? JSON.parse(r) : r)), // (round 121, sendlag121) the stats as text from the store thread: parsed here, not in the main process
  getCodexUsage: call('usage:codex'),
  codex: { capabilities: call('codex:capabilities'), steer: call('codex:steer'), answer: call('codex:answer'), workspace: call('codex:workspace') },
  rebuildTokenStats: call('usage:rebuild'),

  send: call('engine:send'),
  stop: call('engine:stop'),
  stopAll: call('engine:stopAll'),
  login: call('engine:login'),
  engineStatus: call('engine:status'),
  perfLag: call('perf:lag'), // (round 20, offmain) main-process event-loop delay since the last ask (dev checks)
  bootStatus: call('boot:status'), // (round 19) what a slow start waits for in the main process (splash.js)
  bootReady: () => ipcRenderer.send('boot:ready'), // (round 107, startup107) the first screen is up: main.js's waiting work may run (start.js)
  engineDoctor: call('engine:doctor'),
  engineInstalls: call('engine:installs'),
  engineFix: call('engine:fix'),
  signinLink: call('engine:signinLink'), // (signin111) the engine's own sign-in link, shown in Hearth when no window opened
  signinLinkStop: call('engine:signinLinkStop'),
  onSigninLink: on('engine:signin-link'),
  macFix: call('mac:fix'), // (round 33, macpolish) { target, action, dry } → the exact command, then run after a click
  macVolumes: call('mac:volumes'), // (round 33) which disks ignore case, the boot disk's name (the chats' folder checks)
  ffmpegStatus: call('tools:ffmpeg'),
  ffmpegInstall: call('tools:installFfmpeg'),
  onEngineInstalls: on('engine:installs'),
  onEngineEvent: on('engine:event'),
  onEngineLive: on('engine:live'), // (round 21) what a running reply is doing (steps, subagents, pulses)

  // window & desktop
  showWindow: call('window:show'),
  flashWindow: call('window:flash'),
  // (round 36, nativefeel) the frame main.js made (inset: the Mac's traffic lights in the rail), light / dark, menus
  native: {
    frame: (process.argv.find((a) => a.startsWith('--hearth-frame=')) || '').slice(15) || 'system',
    os: process.platform === 'darwin' ? 'mac' : process.platform === 'win32' ? 'win' : 'linux',
    look: call('native:look'), titleDblClick: call('native:titleDblClick'), info: call('native:info'),
    onOsScheme: on('native:os-scheme'), onState: on('native:state'), onMenu: on('native:menu'),
  },
  // (round 38, bigscreen) full screen (⛶), the size of everything per screen
  big: {
    startZoom,
    info: call('big:info'), fullscreen: call('big:fullscreen'), zoom: call('big:zoom'), testBounds: call('big:testBounds'),
    onDisplay: on('big:display'),
  },
  isWindowFocused: call('window:isFocused'),
  reloadWindow: call('window:reload'),
  onWindowFocus: on('window:focus'),
  findStart: call('find:start'),
  findStop: call('find:stop'),
  onFindResult: on('find:result'),
  createShortcuts: call('shortcuts:create'),
  restartApp: call('app:restart'),
  askOnce: call('engine:once'),
  parityProbe: { run: call('parityprobe:run'), onStep: on('parityprobe:step') }, // (round 120, astraprobe120) Check Astra works like Claude (parityprobe.js)
  captureWindow: call('window:capture'),
  setOnTop: call('window:onTop'),
  exportData: call('data:export'),
  packForMac: call('data:packForMac'),
  platform: call('app:platform'),
  liveStart: call('live:start'),
  bgState: call('bg:state'), // (round 16) /background: pace of the background work, memory / CPU per process
  npStart: call('np:start'),
  npStop: call('np:stop'),
  npControl: call('np:control'),
  onNowPlaying: on('np:update'),
  stageOpen: call('stage:open'),
  stageOnTop: call('stage:onTop'),
  stageClose: call('stage:close'),
  stageFocus: call('stage:focus'),
  stageDisplays: call('stage:displays'), stagePlace: call('stage:place'), // (round 22) live output on a second screen
  stageSend: (msg) => ipcRenderer.send('stage:to', msg),
  // (round 52, gamemode) ▶ Play: a game in its own full-screen window (gamemodemain.js)
  game: { play: call('game:play'), leave: call('game:leave'), state: call('game:state'), displays: call('game:displays'), eval: call('game:eval'), key: call('game:key'), click: call('game:click'), onLeft: on('game:left'), loop: call('game:loop'), onLoop: on('game:loop-ev'), budget: call('game:budget-get'), latency: call('game:latency'), notes: call('game:notes'), onNotes: on('game:notes-ev'), hitch: call('game:hitch'), onHitch: on('game:hitch-ev'), onChip: on('game:chip-ev'), perfCard: call('game:perf-card') }, // (round 76, gpuplay76) perfCard: 📈 the performance test's card in the game window · // (round 53, playloop: playloopmain.js) · (round 55, playbudget) budget: the helpers kept off per game · (round 56, playlatency) latency: /game latency · (round 62, playnotes62) notes / onNotes: playtest notes (playnotesmain.js) · (round 63, hitchmap63) hitch / onHitch: the hitch map (hitchmapmain.js) · (round 64, clickfirst64) onChip: the F chip's ● Record hitch map clicked
  gameTest: { script: call('game:script'), stop: call('game:script-stop'), shot: call('game:shot') }, // (round 53, directorgame) the director's play-test into the ▶ Play window (directorgamemain.js)
  onStageMessage: on('stage:from'),
  onStageClosed: on('stage:closed'),
  // (Nov 9, labplayer) the Lab preview in its own app and graphics process, laid over the preview area (labplayermain.js)
  labPlayer: { open: call('labplayer:open'), close: call('labplayer:close'), state: call('labplayer:state'), send: (msg) => ipcRenderer.send('labplayer:to', msg), rect: (r) => ipcRenderer.send('labplayer:rect', r), onMessage: on('labplayer:from'), onClosed: on('labplayer:closed') },
  setZoom: (factor) => webFrame.setZoomFactor(factor),
  getZoom: () => webFrame.getZoomFactor(),
  pathForFile: (file) => webUtils.getPathForFile(file),
  // (round 38, dragdrop) files with Finder / Explorer: a native drag out, what a drop really is (folder, missing, still in
  // iCloud), files copied in Finder / Explorer (dragdropmain.js)
  dragdrop: { out: (spec) => ipcRenderer.send('dragdrop:out', spec), check: call('dragdrop:check'), clipboard: call('dragdrop:clipboard') },
  onTray: (cb) => {
    ipcRenderer.on('tray:new-chat', () => cb('new-chat'));
    ipcRenderer.on('tray:palette', () => cb('palette'));
    ipcRenderer.on('tray:ideas', () => cb('ideas')); // (round 71, quickidea71) a saved Project idea to put in its place (quietly)
    ipcRenderer.on('tray:ideas-open', () => cb('ideas-open')); // … and the small window's "All ideas"
  },
  onContextAction: (cb) => {
    ipcRenderer.on('context:ask', (_e, text) => cb('ask', text));
    ipcRenderer.on('context:note', (_e, text) => cb('note', text));
  },
  onDownload: on('download:update'),
  // (round 153c, labwin153) the Lab in its own lean window (labwinmain.js): scene = the scene this window owns (the Lab
  // window only; null in Hearth's window)
  labwin: {
    scene: (process.argv.find((a) => a.startsWith('--hearth-labwin=')) || '').slice(16) || null,
    open: call('labwin:open'), close: call('labwin:close'), focus: call('labwin:focus'), state: call('labwin:state'),
    call: call('labwin:call'), result: call('labwin:result'), ask: call('labwin:ask'), showMain: call('labwin:showMain'), hideMain: call('labwin:hideMain'),
    note: (o) => ipcRenderer.send('labwin:note', o),
    onCall: on('labwin:call'), onClosed: on('labwin:closed'), onAsk: on('labwin:ask'), onNote: on('labwin:note'), onShowChat: on('labwin:showChat'),
  },
  onGameCall: on('game:call'),
  onGameHops: on('game:hops'), // (round 74, labcalls74) a call's hop times, after it answered
  gameResult: (id, result) => ipcRenderer.invoke('game:result', id, result),
  directorCost: call('director:cost'), // (agents?) → per-message cost of each director's tools (mcp/cost.js)
  directorGuide: call('director:guide'), // (topic) → the Three Director's guide text for that topic
  tokenAudit: call('tokenaudit:measure'), // (round 36) (agent) → its fixed part per message: prompt parts, tool definitions, what turning each off saves
  tokenAuditSeed: call('tokenaudit:seed'), // (round 36) () → tool calls in the last 35 days of chats (the tool-use log's start)
  usageLimitsClaude: call('usagelimits:claude'), // (round 48) ({ fresh }) → Claude Code's local /usage text (no model request) or { ok: false, why }
  costCoachScan: call('costcoach:scan'), // (round 43) ({ days }) → { records, chats }: the replies of the last days, compact (costcoach-core.js recordsOf)

  // files & tools
  fs: {
    list: call('fs:list'),
    read: call('fs:read'),
    write: call('fs:write'),
    stat: call('fs:stat'),
    search: call('fs:search'),
    trash: call('fs:trash'),
    zip: call('fs:zip'),
    diff: call('fs:diff'),
    reveal: call('fs:reveal'),
    open: call('fs:open'),
    copy: call('fs:copy'),
    watch: call('fs:watch'),
    unwatch: call('fs:unwatch'),
    home: call('fs:home'),
    onChanged: on('fs:changed'),
  },
  chatMedia: { find: call('chatmedia:find') },
  // (round 23) voice (voicemain.js): local speech-to-text in a child process, the model download, the system's voices
  // (round 25) camera / body tracking's files (motionmain.js): status, the one download after a yes, bytes for the preview's Worker
  motion: { status: call('motion:status'), download: call('motion:download'), cancel: call('motion:cancel'), read: call('motion:read'), remove: call('motion:remove'), camera: call('motion:camera'), onProgress: on('motion:progress') },
  voice: { status: call('voice:status'), transcribe: call('voice:transcribe'), cancel: call('voice:cancel'), download: call('voice:download'), say: call('voice:say'), hush: call('voice:hush'), voices: call('voice:voices'), mic: call('voice:mic'), onPartial: on('voice:partial'), onProgress: on('voice:progress') },
  // (round 24) phone remote (remotemain.js): the local network server, pairing, devices; messages both ways
  remote: { start: call('remote:start'), stop: call('remote:stop'), status: call('remote:status'), pair: call('remote:pair'), kick: call('remote:kick'), forget: call('remote:forget'), idle: call('remote:idle'), test: call('remote:test'), send: (o) => ipcRenderer.send('remote:send', o), frame: (d) => ipcRenderer.send('remote:frame', d), onMsg: on('remote:msg'), onJoin: on('remote:join'), onLeave: on('remote:leave'), onCode: on('remote:code'), onDevices: on('remote:devices'), onAlert: on('remote:alert'), onStopped: on('remote:stopped') },
  // (round 136, phone136) 📱 on my phone (phoneviewmain.js): a render or the live preview over the local network
  phone: { start: call('phone:start'), stop: call('phone:stop'), status: call('phone:status'), test: call('phone:test'), label: (t) => ipcRenderer.send('phone:label', t), frame: (d) => ipcRenderer.send('phone:frame', d), onStatus: on('phone:status'), onStopped: on('phone:stopped'), onWant: on('phone:want') },
  // (round 25) interop (interopmain.js): OSC over UDP, Ableton Link tempo, the OBS Browser Source page and its frames, obs-websocket
  interop: { oscStart: call('interop:osc-start'), oscStop: call('interop:osc-stop'), oscStatus: call('interop:osc-status'), oscSend: (o) => ipcRenderer.send('interop:osc-send', o), onOsc: on('interop:osc'), linkStart: call('interop:link-start'), linkStop: call('interop:link-stop'), linkStatus: call('interop:link-status'), onLink: on('interop:link'), pageStart: call('interop:page-start'), pageStop: call('interop:page-stop'), pageStatus: call('interop:page-status'), pageCfg: call('interop:page-cfg'), frame: (buf) => ipcRenderer.send('interop:page-frame', buf), onViewers: on('interop:viewers'), obsConnect: call('interop:obs-connect'), obsDisconnect: call('interop:obs-disconnect'), obsStatus: call('interop:obs-status'), obsPassword: call('interop:obs-password'), obsReq: call('interop:obs-req'), onObs: on('interop:obs'), onObsEvent: on('interop:obs-event'), test: call('interop:test') },
  // (round 27) Ready to post (publishmain.js): the checks' numbers, the cover ideas
  publish: { analyze: call('publish:analyze') },
  // (round 28) packs (packsmain.js): a scene and everything it uses as one .hearthpack; peek before anything is added
  packs: { plan: call('packs:plan'), write: call('packs:write'), peek: call('packs:peek'), unpack: call('packs:unpack'), pending: call('packs:pending'), onOpen: on('packs:open') },
  // (round 75, projbundle75) a whole project as one .hearthproject (projbundlemain.js): export / check / unpack, streamed with progress + cancel
  projbundle: { sizes: call('projbundle:sizes'), export: call('projbundle:export'), peek: call('projbundle:peek'), unpack: call('projbundle:unpack'), discard: call('projbundle:discard'), cancel: call('projbundle:cancel'), onProgress: on('projbundle:progress'), chats: call('projbundle:chats'), adopt: call('projbundle:adopt'), release: call('projbundle:release'), copyAsset: call('projbundle:copyAsset'), untake: call('projbundle:untake') }, // (round 85, projbig85) giant chats by name · (round 98, bundle98) copyAsset: a model of several files copied whole; untake: a failed import's writes to the Trash
  // (round 26) hooks (hooksmain.js): the folders a hook watches, and the new files in them
  hooks: { watch: call('hooks:watch'), onFile: on('hooks:file') },
  // (round 19, reach) paths from the other computer → this one's; open / reveal / preview what a chat made (reachmain.js)
  reach: { resolve: call('reach:resolve'), open: call('reach:open'), info: call('reach:info') },
  // (round 35, twocomputers) which computer this is, media found again after switching computers (twocomputersmain.js)
  scenesafe: { scan: call('scenes:scan') }, // (round 43, scenesafe) 🛟 Recover lost scenes (scenesafemain.js)
  backupauto: { state: call('backupauto:state'), list: call('backupauto:list'), run: call('backupauto:run'), verify: call('backupauto:verify'), inspect: call('backupauto:inspect'), places: call('backupauto:places'), setDir: call('backupauto:setDir'), setAuto: call('backupauto:setAuto'), before: call('backupauto:before'), battery: call('backupauto:battery'), reveal: call('backupauto:reveal'), test: call('backupauto:test'), onChanged: on('backupauto:changed') }, // (round 45, backupauto) automatic, checked backups (backupautomain.js)
  versions: { list: call('versions:list'), read: call('versions:read'), keep: call('versions:keep'), restore: call('versions:restore'), undo: call('versions:undo'), deleted: call('versions:deleted'), thing: call('versions:thing'), undelete: call('versions:undelete') }, // (round 75, versions75) 🕘 Earlier versions / Deleted things (versionsmain.js)
  datasafe: { health: call('data:health'), recheck: call('data:recheck'), scan: call('data:scan'), recover: call('data:recover'), onDoubt: on('data:doubt') }, // (round 43, datasafe) what couldn't be read · 🛟 Recover… (datasafemain.js)
  chatsafe: { bring: call('chatsafe:bring') }, // (round 55, chatsafe55) Bring back the AI a chat waits for (chatsafemain.js)
  fw: { want: call('fw:want'), own: call('fw:own'), state: call('fw:state'), test: call('fw:test'), onChanges: on('fw:changes') }, // (round 42, filewatch) files changed outside Hearth (filewatchmain.js)
  two: { info: call('two:info'), hash: call('two:hash'), relink: call('two:relink'), link: call('two:link'), exists: call('two:exists'), pickFile: call('two:pickFile') },
  firstrun: { facts: call('firstrun:facts'), folders: call('firstrun:folders'), perm: call('firstrun:perm'), run: call('firstrun:run') }, // (round 28) Check this computer (firstrunmain.js)
  update: { status: call('update:status'), apply: call('update:apply'), restart: call('update:restart'), reload: call('update:reload'), back: call('update:back'), fix: call('update:fix') }, // (round 37) back: the previous version · fix: the one fix for a failed update
  power: { state: call('power:state'), hold: call('power:hold'), release: call('power:release'), allow: call('power:allow'), quiet: call('power:quiet'), test: call('power:test'), onState: on('power:state') }, // (round 39, powerwise) staying awake while it matters, battery / saver, wake (powerwisemain.js)
  notify: { send: call('notify:send'), seen: call('notify:seen'), onGo: on('notify:go'), test: call('notify:test') }, // (round 44, notify) desktop notifications (notifymain.js): send one, the chat was looked at, where a click goes, (checks) a recorder
  net: { probe: call('net:probe'), onPower: on('net:power'), prepareProject: call('net:prepareProject') }, // connection + this computer's offline project check
  quickIdea: { op: (a) => ipcRenderer.invoke('quickidea:op', a), onChanged: on('quickidea:changed') }, // (round 71, quickidea71) 💡 the ideas inbox (quickideamain.js): list · move · placed · trash · restore · empty-trash · open (the small window)
  safetynet: { last: call('safetynet:last'), reloading: call('safetynet:reloading'), status: call('safetynet:status'), keep: call('safetynet:keep'), done: call('safetynet:done'), testCrash: call('safetynet:test-crash') }, // (round 29) after an unexpected exit: what was kept (safetynetmain.js)
  crashsafe: { take: call('crashsafe:take'), done: call('crashsafe:done'), ack: call('crashsafe:ack'), test: call('crashsafe:test'), check: call('crashsafe:check'), unstick: call('crashsafe:unstick'), onOrphan: on('crashsafe:orphan'), onFlush: on('crashsafe:flush'), onFrames: on('crashsafe:frames') }, // (round 50) replies cut off by a crash, renders cut off, the computer going down (crashsafemain.js)
  devreport: { info: call('devreport:info'), gh: call('devreport:gh'), send: call('devreport:send'), states: call('devreport:states'), log: call('devreport:log'), crashes: call('devreport:crashes'), annotate: call('devreport:annotate') }, // (round 21) Report to the developer
  fetchText: call('net:text'),
  openDialog: call('dialog:open'),
  saveFile: call('dialog:saveFile'),
  saveStream: { start: call('dialog:saveStart'), part: call('dialog:savePart'), end: call('dialog:saveEnd') }, // (round 84, bigchat84) a big file saved in parts (a giant chat's export)
  // mood board (boardmain.js): copies into data/board/media, page pictures, website snapshots
  board: { dir: call('board:dir'), import: call('board:import'), save: call('board:save'), fetch: call('board:fetch'), snap: call('board:snap'), unused: call('board:unused'),
    // (round 14) the Pinterest window (boardpinsmain.js): pins(op, args) + the pins the owner adds / drags out
    pins: call('board:pins'), onPin: on('board:pin'), onPinDrag: on('board:pin-drag') },
  ae: {
    status: call('ae:status'),
    run: call('ae:run'),
    running: call('ae:running'),
    // (round 67) a script that answers later (aemain.js runJob): job(code, label) → { ok, job }, then onJobDone
    job: call('ae:job'), jobs: call('ae:jobs'), onJobDone: on('ae:job-done'),
  },
  // Capture (capturemain.js): screenshots / recordings of Hearth itself, the exact frame reader
  capture: {
    dir: call('capture:dir'),
    shot: call('capture:shot'),
    save: call('capture:save'),
    list: call('capture:list'),
    copyImage: call('capture:copyImage'),
    trash: call('capture:trash'),
    prep: call('capture:prep'),
    recOpen: call('capture:recOpen'),
    recWrite: call('capture:recWrite'),
    recClose: call('capture:recClose'),
    finish: call('capture:finish'),
    indicator: call('capture:indicator'),
    frames: call('capture:frames'),
    edit: call('capture:edit'),
    windowSize: call('capture:windowSize'),
    startDrag: (p) => ipcRenderer.send('capture:drag', p),
    onKey: on('capture:key'),
    onIndicator: on('capture:indicator'),
    onProgress: on('capture:progress'),
  },
  // Sync through a cloud drive folder (syncmain.js)
  sync: {
    status: call('sync:status'), detect: call('sync:detect'), on: call('sync:on'), off: call('sync:off'), now: call('sync:now'),
    pause: call('sync:pause'), big: call('sync:big'), conflicts: call('sync:conflicts'), resolve: call('sync:resolve'),
    trash: call('sync:trash'), restore: call('sync:restore'), open: call('sync:open'), download: call('sync:download'), ack: call('sync:ack'), preview: call('sync:preview'), resolveAll: call('sync:resolveAll'), autoResolve: call('sync:autoResolve'), onAutoResolved: on('sync:auto-resolved'),
    onStatus: on('sync:status'), onPulled: on('sync:pulled'),
    kinds: call('sync:kinds'), freeable: call('sync:freeable'), free: call('sync:free'), // (round 73, syncmedia73) What syncs · Free up space
    fix: call('sync:fix'), // (round 74, synchard74) a blocked file's fix button
    showFolder: call('sync:showFolder'), // (round 99, kvrename99) the folder path too long for Hearth's own files: show the folder to move
    aside: call('sync:aside'), // (round 78, guardloss78) conflicts' losing sides kept aside (sync panel)
    packs: call('sync:packs'), // (round 89, packs89) Send very long chats in pieces (Settings › Sync)
    keepCopy: call('sync:keepCopy'), keepTheirs: call('sync:keepTheirs'), putAway: call('sync:putAway'), chatDiff: call('sync:chatDiff'), // (round 94, keptaside94) the compare view (keptasidemain.js)
    devices: call('sync:devices'), forget: call('sync:forget'), packSpace: call('sync:packSpace'), packFree: call('sync:packFree'), // (round 90, devices90) Your computers · Forget this computer… · pieces' space, Free up
  },
  video: {
    tools: call('video:tools'),
    probe: call('video:probe'),
    transcode: call('video:transcode'),
    cancel: call('video:cancel'),
    rmtemp: call('video:rmtemp'),
    onJob: on('video:job-event'),
  },
  // Adobe apps (adobemain.js): status, ExtendScript, open with, the Hearth bridge (Premiere / Media Encoder), web apps
  adobe: { status: call('adobe:status'), run: call('adobe:run'), open: call('adobe:open'), running: call('adobe:running'), bridge: call('adobe:bridge'), presets: call('adobe:presets'), dir: call('adobe:dir'), web: call('adobe:web') },
  // Publishing (deploymain.js): CLIs + sign-in, build, local preview + check, deploy, remove, roll back
  deploy: { status: call('deploy:status'), login: call('deploy:login'), build: call('deploy:build'), preview: call('deploy:preview'), verify: call('deploy:verify'), run: call('deploy:run'), remove: call('deploy:remove'), rollback: call('deploy:rollback'), dir: call('deploy:dir'), onEvent: (cb) => { const fn = (_e, d) => cb(d); ipcRenderer.on('deploy:event', fn); return () => ipcRenderer.removeListener('deploy:event', fn); } },
  // The render queue (rendersmain.js): run / pause / resume / cancel a queued ffmpeg job, encoders of this ffmpeg
  // App windows (appsmain.js): each app in its own window and session, downloads, keys (never readable here), Meshy jobs
  apps: {
    open: call('apps:open'), close: call('apps:close'), closeAll: call('apps:closeAll'), windows: call('apps:windows'), nav: call('apps:nav'),
    paste: call('apps:paste'), picture: call('apps:picture'), catalog: call('apps:catalog'), downloads: call('apps:downloads'), dirs: call('apps:dirs'),
    key: call('apps:key'), fetchTo: call('apps:fetchTo'), fetchJson: call('apps:fetchJson'), meshy: call('apps:meshy'), status: call('apps:status'),
    page: call('apps:page'), chrome: call('apps:chrome'), // (round 30) the AI's hands on an app's page; this app in Chrome or here
    onEvent: on('apps:event'),
  },
  // (round 30) Hearth's Chrome (chromemain.js): Google sign-in in the owner's real Chrome, driven over the DevTools protocol
  chrome: {
    status: call('chrome:status'), open: call('chrome:open'), page: call('chrome:page'), everyday: call('chrome:everyday'), signIn: call('chrome:signIn'),
    quit: call('chrome:quit'), profile: call('chrome:profile'), pref: call('chrome:pref'), onEvent: on('chrome:event'), onOffer: on('chrome:offer'),
    signedIn: call('chrome:signedIn'), // (round 31) "I'm signed in": Chrome's window goes back out of sight
  },
  // (round 31, chromeview) Chrome views (chromeviewmain.js): a page of the out-of-sight Chrome shown and used in Hearth
  cview: {
    start: call('cview:start'), stop: call('cview:stop'), visible: call('cview:visible'), resize: call('cview:resize'), nav: call('cview:nav'),
    cursor: call('cview:cursor'), menu: call('cview:menu'), signIn: call('cview:signIn'), signedIn: call('cview:signedIn'), info: call('cview:info'), test: call('cview:test'),
    input: (id, list) => ipcRenderer.send('cview:input', id, list), ack: (id, ms) => ipcRenderer.send('cview:ack', id, ms),
    onFrame: on('cview:frame'), onEvent: on('cview:event'),
  },
  // (round 20) jank watch (jankmain.js): main loop lag + GPU events since the last take, culprits' line numbers, display / GPU
  jank: { take: call('jank:take'), info: call('jank:info'), lines: call('jank:lines'), profile: call('jank:profile'), busy: (b) => ipcRenderer.send('jank:busy', b, Date.now()), off: (o) => ipcRenderer.send('jank:off', o),
    recent: call('jank:recent'), testStall: call('jank:test-stall') }, // (round 67, slowbutton67) the main side's last minute for 🐢 That was slow (+ busy's send time: how late the main process took it); testStall: test copies only
  bug: { note: call('bug:note'), recent: call('bug:recent'), start: call('bug:start'), saved: call('bug:saved'), test: call('bug:test') }, // (round 68, bugbutton68) 🪲 Something broke (bugmain.js): problems in, the card's list, the note after an unexpected close; test: test copies only
  // (round 24) the asset library (assetsmain.js): scans / hashes, bytes for thumbnails, the thumbnail cache, free sources, import, watch
  assets: {
    status: call('assets:status'), scan: call('assets:scan'), hash: call('assets:hash'), exists: call('assets:exists'), read: call('assets:read'), readText: call('assets:readText'),
    saveThumb: call('assets:saveThumb'), cacheInfo: call('assets:cacheInfo'), clearThumbs: call('assets:clearThumbs'), fetchJson: call('assets:fetchJson'), preview: call('assets:preview'),
    download: call('assets:download'), cancel: call('assets:cancel'), import: call('assets:import'), writePreset: call('assets:writePreset'), watch: call('assets:watch'), onEvent: on('assets:event'),
  },
  rfast: { open: call('rfast:open'), write: call('rfast:write'), end: call('rfast:end'), cancel: call('rfast:cancel') }, // (round 41, renderfast) frames streamed into ffmpeg (renderfastmain.js)
  glr: { state: call('glrecover:state'), shown: call('glrecover:shown'), sim: call('glrecover:sim'), onNote: on('glrecover:note') }, // (round 43, glrecover) the graphics card restarted / drawing without it (glrecovermain.js)
  gpuplay: { facts: call('gpuplay:facts'), copy: call('gpuplay:copy'), display: call('gpuplay:display') }, // (round 76, gpuplay76) 📈 Test play performance (gpuplaymain.js)
  gpu52: { info: call('gpu52:info'), shown: call('gpu52:shown'), reset: call('gpu52:reset'), sim: call('gpu52:sim'), onNote: on('gpu52:note') }, // (round 52, gpu52) the graphics path: Settings › Advanced › Graphics, /graphics (gpu52main.js)
  renders: { run: call('renders:run'), pause: call('renders:pause'), resume: call('renders:resume'), cancel: call('renders:cancel'), relay: call('renders:relay'), encoders: call('renders:encoders'), free: call('renders:free') },
  // (round 52, gameready) ▶ Play gets a game ready: file hashes, Hearth's optimized cache, the encoder, arming ▶ Play's window (gamereadymain.js)
  diskcalm: { measure: call('diskcalm:measure'), free: call('diskcalm:free'), tidy: call('diskcalm:tidy'), last: call('diskcalm:last'), test: call('diskcalm:test'), onTidied: on('diskcalm:tidied'), onHint: on('diskcalm:hint') }, // (round 53, diskcalm) Space Hearth uses (diskcalmmain.js)
  engineup: { state: call('engineup:state'), get: call('engineup:get'), cancel: call('engineup:cancel'), restart: call('engineup:restart'), forgetFailed: call('engineup:forget-failed'), test: call('engineup:test'), onProgress: on('engineup:progress') }, // (round 177, engine177) the engine update in Settings › This computer & sync: on a click only, its checksum checked (engineupmain.js)
  gameReady: { hash: call('gameready:hash'), plan: call('gameready:plan'), scan: call('gameready:scan'), tool: call('gameready:tool'), install: call('gameready:install'), optimize: call('gameready:optimize'), arm: call('gameready:arm'), served: call('gameready:served'), texplan: call('gameready:texplan'), speed: call('gameready:speed'), onProgress: on('gameready:progress') },
});
