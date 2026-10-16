// A fixed, hash-allowed script in a local document avoids the host page's inline-script policy.
// Only the owning iframe parent can initialize this view; nothing is evaluated from messages.
(() => {
  let started = false;
  window.addEventListener('message', e => {
    if (e.source !== parent || e.data?.creative !== 'init' || started) return;
    const cfg = e.data.config;
    if (!cfg || !['motion', 'reactive', 'arena', 'maze', 'rhythm'].includes(cfg.mode) || !Array.isArray(cfg.colors) || cfg.colors.length !== 5 || !cfg.colors.every(c => typeof c === 'string' && /^hsl\([\d %.,]+\)$/.test(c)) || !Number.isFinite(cfg.bpm) || cfg.bpm < 40 || cfg.bpm > 220) return;
    if (cfg.mode === 'maze' && (!Array.isArray(cfg.maze?.grid) || cfg.maze.grid.length > 31 || cfg.maze.grid.some(r => !Array.isArray(r) || r.length > 39 || r.some(v => v !== 0 && v !== 1)))) return;
    started = true; CreativeGames.runtime(cfg);
  });
})();
