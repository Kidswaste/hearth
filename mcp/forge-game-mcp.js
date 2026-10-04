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
- The game opens on a title screen (button #mm-start, "Ignite the Forge"). forge_status reports onTitleScreen; use forge_debug {start:true} before testing combat so the player can see it.`;

const TOOLS = [
  { name: 'forge_status', description: 'Current state of the live Forgeheart debug game: stage, gold, player HP, enemy count by type, boss, debug flags, gear summary.', inputSchema: { type: 'object', properties: {} } },
  { name: 'forge_spawn', description: 'Spawn enemies in the live game. Types: kes_drone, kes_biter, kes_scout, kes_raider, vul_charge, vul_immol, aeg_picket, aeg_bulwark, aeg_siege, obs_shard, obs_weave, obs_lance, hal_spotter, hal_tether, hal_battery, rif_mote, rif_siphon, rif_weaver, rif_plaguehost, cat, or "random", or "boss" for the stage boss.',
    inputSchema: { type: 'object', properties: { type: { type: 'string', description: 'Enemy type, "random" or "boss"', default: 'random' }, count: { type: 'integer', minimum: 1, maximum: 200, default: 10 }, mult: { type: 'number', description: 'Strength multiplier (1 = normal)', default: 1 } } } },
  { name: 'forge_debug', description: 'Set Debug Deck options and quick cheats. Only the fields you pass change.',
    inputSchema: { type: 'object', properties: {
      god: { type: 'boolean', description: 'Invulnerable player' }, oneshot: { type: 'boolean', description: 'Enemies die in one hit' },
      paused: { type: 'boolean' }, timeScale: { type: 'number', description: 'Simulation speed, 0.1–8' },
      gold: { type: 'number', description: 'Set gold' }, stage: { type: 'integer', description: 'Jump to this stage (restarts combat there)' },
      killAll: { type: 'boolean', description: 'Kill every enemy on screen' }, heal: { type: 'boolean', description: 'Refill player HP' },
      openDeck: { type: 'boolean', description: 'Open the in-game Debug Deck panel' },
      start: { type: 'boolean', description: 'Leave the title screen and enter the game (press "Ignite the Forge")' } } } },
  { name: 'forge_eval', description: `Run JavaScript inside the live game and get the result (JSON). The code is evaluated like the console: the value of the last expression is returned, Promises are awaited. Use it for anything the other tools don't cover, including changing values on the fly.\n\n${GAME_GUIDE}`,
    inputSchema: { type: 'object', properties: { code: { type: 'string' } }, required: ['code'] } },
  { name: 'forge_screenshot', description: 'Take a screenshot of the live game so you can see what is happening.', inputSchema: { type: 'object', properties: {} } },
  { name: 'forge_reload', description: 'Reload the game (saved patches re-apply automatically).', inputSchema: { type: 'object', properties: {} } },
  { name: 'forge_patch_save', description: 'Save a named patch: JavaScript that runs in the game now and again after every reload (e.g. "fast drones": FOES.kes_drone.spd *= 2). Saving with an existing name replaces it.',
    inputSchema: { type: 'object', properties: { name: { type: 'string' }, code: { type: 'string' }, description: { type: 'string' } }, required: ['name', 'code'] } },
  { name: 'forge_patch_list', description: 'List saved patches and whether they are on.', inputSchema: { type: 'object', properties: {} } },
  { name: 'forge_patch_remove', description: 'Turn off and delete a saved patch (reload the game to fully undo its effect).', inputSchema: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] } },
];


serve({ name: 'forgeheart-debug', instructions: GAME_GUIDE, tools: TOOLS });
