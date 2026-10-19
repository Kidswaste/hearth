// Read-only account limits. No thread, model request, credit purchase, or reset redemption.
const { Connection } = require('./codex-server');
const finite = (n) => typeof n === 'number' && Number.isFinite(n);
function normalize(result, checkedAt = Date.now()) {
  const mapped = result?.rateLimitsByLimitId;
  const source = mapped && Object.keys(mapped).length ? Object.entries(mapped)
    : result?.rateLimits ? [[result.rateLimits.limitId || 'codex', result.rateLimits]] : [];
  const buckets = source.map(([id, b]) => ({
    id, name: b.limitName || (id === 'codex' ? 'Codex' : id), model: b.normalModelSlug || null,
    plan: b.planType || null,
    windows: ['primary', 'secondary'].flatMap((key) => {
      const w = b[key]; if (!w || !finite(w.usedPercent)) return [];
      return [{ key, used: Math.max(0, Math.min(100, w.usedPercent)), remaining: Math.max(0, Math.min(100, 100 - w.usedPercent)),
        minutes: finite(w.windowDurationMins) && w.windowDurationMins > 0 ? w.windowDurationMins : null,
        resetsAt: finite(w.resetsAt) ? w.resetsAt * 1000 : null }];
    }),
  }));
  return { checkedAt, buckets, available: buckets.some(b => b.windows.length),
    ordinaryUsageAllowed: typeof result?.ordinaryUsageAllowed === 'boolean' ? result.ordinaryUsageAllowed : null };
}
class AccountUsage {
  constructor(options) { this.options = options; }
  async read({ fresh = false } = {}) {
    if (this.pending) return this.pending;
    if (!fresh && this.snapshot && Date.now() - this.snapshot.checkedAt < 60000) return this.snapshot;
    this.pending = this.fetch().finally(() => { this.pending = null; });
    return this.pending;
  }
  async fetch() {
    clearTimeout(this.timer);
    try {
      if (!this.conn || this.conn.closed) this.conn = new Connection({ ...this.options, requestMs: 15000 });
      await this.conn.ready;
      this.snapshot = normalize(await this.conn.request('account/rateLimits/read', {}));
      this.timer = setTimeout(() => this.close(), 5 * 60000); this.timer.unref?.();
    } catch {
      this.close();
      this.snapshot = { checkedAt: Date.now(), available: false, buckets: [], error: 'Account limits unavailable. Check the Codex sign-in in Settings → Engines, then try again.' };
    }
    return this.snapshot;
  }
  close() { clearTimeout(this.timer); this.conn?.close(); this.conn = null; }
}
module.exports = { AccountUsage, normalize };
