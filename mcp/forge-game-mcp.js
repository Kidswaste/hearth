// MCP server (stdio, JSON-RPC 2.0) that gives Claude tools to drive the live Forgeheart debug game
// running inside Agent Hub. Each call is forwarded to the hub over its local bridge.
const { serve } = require('./common');

const GAME_GUIDE = `Forgeheart runs as one big classic script, so its globals are reachable by name in forge_eval:
- S: saved game state (S.stage, S.maxStage, S.gold, S.eq{weapon,weapon2,helm,chest,gloves,boots,belt,ring1,ring2,amulet,ultima,jewel1-4}, S.inv[], S.tree{}, S.shards).
- C: live combat (C.px/C.py player position, C.hp, C.en[] enemies {x,y,type,hp,maxhp,elite,spd}, C.boss, C.bossList, C.loot).
- FOES: enemy types: kes_drone, kes_biter, kes_scout, kes_raider, vul_charge, vul_immol, aeg_picket, aeg_bulwark, aeg_siege, obs_shard, obs_weave, obs_lance, hal_spotter, hal_tether, hal_battery, rif_mote, rif_siphon, rif_weaver, rif_plaguehost, cat. Tweak e.g. FOES.kes_drone.spd.
- spawnFoe(type, mult) spawns one enemy near the edge of view (returns it, or null at the cap combatEnemyCap()); the game may swap types it doesn't allow at the current stage. spawnBoss() spawns the stage boss.
- startStage(n) restarts combat at stage n. stats() returns the computed player sheet (dps, hp, dr, …).
- makeItem(slot, ilvl, rarity) and makeUnique(ilvl, uniqueId) create gear; UNIQUES (206 entries {id, slot, n}) and AFF (affixes) are the data tables.
- window.__fhDbg is the Debug Deck: {paused, timeScale, god, oneshot, noclipdmg, fastult}. window.__fhToggleDebug() opens the deck panel (F1).
- After changing S, call save() and renderHdr(); set ST=null when gear/tree changes so stats recompute. toast(text,'success') shows an in-game message.
- The game opens on a title screen (button #mm-start, "Ignite the Forge"). forge_status reports onTitleScreen; use forge_debug {start:true} before testing combat so the player can see it.
- forge_eval changes are lost on reload: keep one with forge_patch save.`;

const TOOLS = [
  { name: 'forge_status', description: 'The live debug game now: stage, gold, player HP, enemies by type, boss, debug flags, gear, onTitleScreen.', inputSchema: { type: 'object', properties: {} } },
  { name: 'forge_spawn', description: 'Spawn enemies: type = a FOES type, "random" or "boss" (the stage boss).',
    inputSchema: { type: 'object', properties: { type: { type: 'string', default: 'random' }, count: { type: 'integer', minimum: 1, maximum: 200, default: 10 }, mult: { type: 'number', description: 'strength ×', default: 1 } } } },
  { name: 'forge_debug', description: 'Debug Deck options and cheats; only the fields you pass change. timeScale 0.1–8; stage jumps there; start leaves the title screen.',
    inputSchema: { type: 'object', properties: {
      god: { type: 'boolean' }, oneshot: { type: 'boolean' }, paused: { type: 'boolean' }, timeScale: { type: 'number' },
      gold: { type: 'number' }, stage: { type: 'integer' }, killAll: { type: 'boolean' }, heal: { type: 'boolean' }, openDeck: { type: 'boolean' }, start: { type: 'boolean' } } } },
  { name: 'forge_eval', description: 'Run JS in the live game like the console (last expression returned, Promises awaited; the globals are in your instructions). For anything the other tools don\'t cover; changes last until reload.',
    inputSchema: { type: 'object', properties: { code: { type: 'string' } }, required: ['code'] } },
  { name: 'forge_screenshot', description: 'See the live game now.', inputSchema: { type: 'object', properties: {} } },
  { name: 'forge_reload', description: 'Reload the game (saved patches re-apply).', inputSchema: { type: 'object', properties: {} } },
  { name: 'forge_patch', description: 'Saved patches: JS that runs now and after every reload (e.g. "fast drones": FOES.kes_drone.spd *= 2). action save (name, code, description; a used name is replaced) | list | remove (name; reload to fully undo).',
    inputSchema: { type: 'object', properties: { action: { type: 'string', enum: ['save', 'list', 'remove'] }, name: { type: 'string' }, code: { type: 'string' }, description: { type: 'string' } }, required: ['action'] } },
];

// The guide reaches the agent through its system prompt (engines.js), which the hub controls: the CLI may drop MCP
// instructions when the system prompt is replaced, and saying it once is cheaper than repeating it in forge_eval.
// forge_patch { action } reaches the hub as forge_patch_save / _list / _remove (bridge.js), the names it always had.
module.exports = serve({ name: 'forgeheart-debug', instructions: '', guide: GAME_GUIDE, tools: TOOLS }, module);
