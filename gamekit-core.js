// The game start (round 180, gamekit), the pure part: the layers a "Game" project begins with, as code. A small
// playable game in the v2 (WebGPU) format: four layers that share one state (window.GAME), read the game kit's
// input, run their rules in onStep (60 a second) and keep a run and the best score with save.
// Loads in the window (lazy group "projcreate") and in Node (dev/gamekit-test.js). docs/upgrades/gamekit180.md.
(function (root, make) { if (typeof module === 'object') module.exports = make(); else root.GameKitCore = make(); })(typeof self !== 'undefined' ? self : this, () => {
  const LOGIC = `// Game logic: the rules, 60 steps a second (onStep). It draws nothing: the other layers draw what is in window.GAME.
// input: held / pressed / released by a key's place ('KeyW', 'Space') or 'Mouse0' (left) · 'Mouse2' (right); input.pad(0).
// save: this game's saves, kept by Hearth (▶ Play › right-click › Saves shows them).
export default async ({ onStep, input, save }) => {
  const G = window.GAME = { player: { x: 0, y: 0, z: 0, vy: 0 }, coins: [], score: 0, best: 0, time: 0, paused: false, cam: { x: 0, y: 9, z: 11 } };
  const spot = () => ({ x: (Math.random() - 0.5) * 16, z: (Math.random() - 0.5) * 16 });
  for (let i = 0; i < 6; i += 1) G.coins.push(spot());
  // the best score is a setting; "auto" is the run in progress. A playtest started from a save (Saves › ▶ Playtest
  // from this save) names it in save.start()
  G.best = await save.get('best', 0);
  const from = await save.read((await save.start()) || 'auto');
  if (from) { G.score = from.score || 0; G.player.x = from.x || 0; G.player.z = from.z || 0; }
  const keep = () => save.write('auto', { score: G.score, x: G.player.x, z: G.player.z }).catch(() => {});
  const off = onStep((dt) => {
    if (input.pressed('KeyP')) G.paused = !G.paused;
    if (input.pressed('KeyR')) { G.score = 0; G.player.x = 0; G.player.z = 0; keep(); }
    if (G.paused) return;
    G.time += dt;
    const P = G.player; const pad = input.pad(0);
    const mx = input.axis('KeyA', 'KeyD') + input.axis('ArrowLeft', 'ArrowRight') + pad.lx;
    const mz = input.axis('KeyW', 'KeyS') + input.axis('ArrowUp', 'ArrowDown') + pad.ly;
    const len = Math.max(1, Math.hypot(mx, mz));
    const speed = input.held('ShiftLeft') || input.mouse.right || pad.buttons[2] ? 9 : 5; // Shift / the right mouse button: run
    P.x = Math.max(-9.5, Math.min(9.5, P.x + (mx / len) * speed * dt));
    P.z = Math.max(-9.5, Math.min(9.5, P.z + (mz / len) * speed * dt));
    if ((input.pressed('Space') || input.pressed('Mouse0') || pad.buttons[0]) && P.y === 0) P.vy = 7; // jump
    P.vy -= 20 * dt; P.y = Math.max(0, P.y + P.vy * dt); if (P.y === 0) P.vy = 0;
    for (const c of G.coins) {
      if (Math.hypot(c.x - P.x, c.z - P.z) > 0.9 || P.y > 1) continue;
      Object.assign(c, spot()); G.score += 1;
      if (G.score > G.best) { G.best = G.score; save.set('best', G.best); }
      if (G.score % 5 === 0) keep();
    }
    G.cam.x += (P.x - G.cam.x) * 0.08; G.cam.z += (P.z + 11 - G.cam.z) * 0.08;
  });
  return () => { off(); };
};
`;
  const CAM = '    camera.position.set(G.cam.x, G.cam.y, G.cam.z); camera.lookAt(G.cam.x, 0, G.cam.z - 11);\n';
  const WORLD = `// World: the ground, the light and the coins. It only draws what the Game logic layer keeps in window.GAME.
export default ({ THREE, scene, camera, onFrame }) => {
  scene.background = new THREE.Color('#10131c');
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(20, 20), new THREE.MeshStandardNodeMaterial({ color: '#232a3d', roughness: 0.9 }));
  ground.rotation.x = -Math.PI / 2; scene.add(ground);
  scene.add(new THREE.GridHelper(20, 20, '#3b4666', '#2b3350'));
  scene.add(new THREE.HemisphereLight('#bcd0ff', '#1a1420', 1.4));
  const sun = new THREE.DirectionalLight('#fff1d6', 2); sun.position.set(4, 8, 3); scene.add(sun);
  const geo = new THREE.CylinderGeometry(0.35, 0.35, 0.08, 24);
  const mat = new THREE.MeshStandardNodeMaterial({ color: '#ffd166', emissive: '#7a5200', metalness: 0.6, roughness: 0.3 });
  const coins = [];
  onFrame((t) => {
    const G = window.GAME; if (!G) return;
    while (coins.length < G.coins.length) { const m = new THREE.Mesh(geo, mat); m.rotation.x = Math.PI / 2; scene.add(m); coins.push(m); }
    G.coins.forEach((c, i) => { coins[i].position.set(c.x, 0.6 + Math.sin(t * 3 + i) * 0.1, c.z); coins[i].rotation.z = t * 2; });
${CAM}  });
};
`;
  const PLAYER = `// Player: the character and its shadow, where the Game logic layer says it is (window.GAME.player).
export default ({ THREE, scene, camera, onFrame }) => {
  scene.add(new THREE.HemisphereLight('#ffffff', '#30203a', 1.6));
  const sun = new THREE.DirectionalLight('#fff1d6', 2); sun.position.set(4, 8, 3); scene.add(sun);
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.4, 0.7, 6, 16), new THREE.MeshStandardNodeMaterial({ color: '#ff5d8f', roughness: 0.4 }));
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.45, 24), new THREE.MeshBasicNodeMaterial({ color: '#000000', transparent: true, opacity: 0.35 }));
  shadow.rotation.x = -Math.PI / 2;
  scene.add(body, shadow);
  onFrame(() => {
    const G = window.GAME; if (!G) return;
    body.position.set(G.player.x, 0.75 + G.player.y, G.player.z);
    shadow.position.set(G.player.x, 0.02, G.player.z); shadow.scale.setScalar(1 / (1 + G.player.y * 0.4));
${CAM}  });
};
`;
  const HUD = `// HUD: the score and the keys, as text over the picture (plain page elements: quick to change, sharp at any size).
export default ({ onFrame }) => {
  const el = document.createElement('div');
  el.style.cssText = 'position:fixed;left:18px;top:14px;z-index:5;font:600 18px/1.5 system-ui,sans-serif;color:#fff;text-shadow:0 1px 3px #000;pointer-events:none;white-space:pre';
  document.body.append(el);
  let last = '';
  onFrame(() => {
    const G = window.GAME; if (!G) return;
    const s = 'Coins ' + G.score + '   Best ' + G.best + (G.paused ? '   PAUSED' : '') + '\\nWASD / stick: move · Space / click: jump · Shift / right mouse: run · P: pause · R: new run';
    if (s !== last) { el.textContent = s; last = s; }
  });
  return () => el.remove();
};
`;
  // bottom first (the Lab's order): the world, the player over it, the HUD, the rules on top of the list
  const layers = () => [{ name: 'World', code: WORLD }, { name: 'Player', code: PLAYER }, { name: 'HUD', code: HUD }, { name: 'Game logic', code: LOGIC }];
  // a project is a game when its workspace says so (set by the new-project card's Game start, or by the owner)
  const isGame = (p) => Boolean(p && p.workspace && p.workspace.kind === 'game');
  // what the Lab's report tells the AI in a game project (read on demand, never in the prompt)
  const NOTE = 'a game project: v2 layers get input, save and onStep (three_do help games); the owner playtests with ▶ Playtest';
  return { layers, isGame, NOTE };
});
