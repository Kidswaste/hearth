// Metadata only: no inference turns, installs, configuration writes or active-chat reconnects.
const INTERVAL = 30 * 60000;
function modelChecks(data, agents) {
  return agents.filter(a => a.mode === 'native' && a.engine === 'codex').map(a => {
    const model = a.model || null, effort = a.effort || null;
    const m = model ? data.find(m => m.model === model) : data.find(m => m.isDefault);
    return { name: a.name || a.id, model: model || m?.model || 'runtime default', effort,
      status: !m ? 'not-listed' : effort && !Array.isArray(m.supportedReasoningEfforts) ? 'unknown' :
        effort && !m.supportedReasoningEfforts.some(e => e.reasoningEffort === effort) ? 'unsupported-effort' : 'listed',
      upgrade: typeof m?.upgrade === 'string' && m.upgrade !== m.model ? m.upgrade : null };
  });
}
function create({ engines, getConfig, emit = () => {}, now = Date.now }) {
  let last = null, pending = null, configKey = '';
  function check({ fresh = false } = {}) {
    if (pending) return pending;
    let cfg;
    try { cfg = getConfig(); } catch (err) { return Promise.reject(err); }
    const key = JSON.stringify([cfg.settings?.enginePaths, (cfg.agents || []).map(a => [a.id, a.engine, a.model, a.effort])]);
    if (!fresh && last && key === configKey && now() - last.watch.checkedAt < INTERVAL) return Promise.resolve(last);
    pending = (async () => {
      engines.setEnginePaths(cfg.settings?.enginePaths);
      const report = await engines.checkInstalls({ fresh });
      const watch = { checkedAt: now(), intervalMs: INTERVAL, models: { status: 'unused', selections: [], catalog: [] } };
      if ((cfg.agents || []).some(a => a.mode === 'native' && a.engine === 'codex')) {
        if (!report.codex?.found || report.codex.broken) watch.models.status = 'runtime-unavailable';
        else {
          try {
            const result = await engines.codexCapabilities({ kind: 'models', refresh: true });
            if (!Array.isArray(result.data) || !result.data.length) throw new Error('Empty model catalog');
            watch.models = { status: 'checked', selections: modelChecks(result.data, cfg.agents),
              catalog: result.data.map(m => ({ model: m.model, name: m.displayName, hidden: Boolean(m.hidden) })) };
          } catch { watch.models.status = 'unavailable'; }
        }
      }
      watch.checkedAt = now();
      last = { ...report, watch }; configKey = key;
      emit(last); return last;
    })().finally(() => { pending = null; });
    return pending;
  }
  function start({ power, monitor, window, setTimer = setTimeout, clearTimer = clearTimeout }) {
    const run = () => check().catch(() => {});
    power.every('engine-health', INTERVAL, run, { first: 10000, wakeSettle: 60000 });
    let wakeTimer;
    const wake = () => { clearTimer(wakeTimer); wakeTimer = setTimer(() => { check({ fresh: true }).catch(() => {}); }, 60000); wakeTimer?.unref?.(); };
    monitor.on('resume', wake);
    window.on('focus', run);
    return () => { power.stop('engine-health'); clearTimer(wakeTimer); monitor.removeListener('resume', wake); window.removeListener('focus', run); };
  }
  return { check, start };
}
module.exports = { create, modelChecks, INTERVAL };
