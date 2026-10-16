// Catalog reads never start a model turn. The inspector uses the actual chat's connection.
const { Connection } = require('./codex-server');
async function pages(request, method, params = {}) {
  const data = []; const seen = new Set(); let cursor = null;
  do {
    const r = await request(method, { ...params, limit: 100, cursor });
    data.push(...(r.data || [])); cursor = r.nextCursor;
    if (cursor && seen.has(cursor)) throw new Error('The catalog returned a repeated page. Refresh to try again.');
    if (cursor) seen.add(cursor);
    if (seen.size > 30) throw new Error('Catalog is too large to display.');
  } while (cursor);
  return data;
}
function mentions(value, enabled) {
  if (!enabled || !Array.isArray(value)) return [];
  return value.slice(0, 10).filter(a => a && /^[\w-]{1,180}$/.test(a.id) && typeof a.name === 'string' && a.name.length <= 160)
    .filter((a, i, all) => all.findIndex(b => b.id === a.id) === i)
    .map(a => ({ type: 'mention', name: a.name, path: `app://${a.id}` }));
}
class Catalog {
  constructor(options) { this.options = options; this.cache = new Map(); this.pending = new Map(); }
  async read(kind, refresh = false) {
    if (!['apps', 'models'].includes(kind)) throw new Error('Unknown catalog');
    if (this.pending.has(kind)) return this.pending.get(kind);
    const cached = this.cache.get(kind);
    if (!refresh && cached && Date.now() - cached.checkedAt < 60000) return cached;
    const job = this.fetch(kind).finally(() => this.pending.delete(kind)); this.pending.set(kind, job); return job;
  }
  async fetch(kind) {
    clearTimeout(this.timer);
    try {
      if (!this.conn || this.conn.closed) this.conn = new Connection({ ...this.options, requestMs: 30000 });
      await this.conn.ready;
      const request = (m, p) => this.conn.request(m, p, { soft: true });
      let result;
      if (kind === 'models') result = { data: await pages(request, 'model/list', { includeHidden: true }) };
      else {
        // The full marketplace can be slow/offline; installed runtime apps are useful immediately.
        const installed = (await request('app/installed', { forceRefresh: false })).apps || [];
        let metadata = []; let runtimeError = null;
        try {
          for (let i = 0; i < installed.length; i += 100) metadata.push(...((await request('app/read', { appIds: installed.slice(i, i + 100).map(a => a.id), includeTools: false })).apps || []));
        } catch (err) { runtimeError = 'App descriptions are unavailable; showing installed app names.'; }
        const data = installed.map(a => ({ ...metadata.find(m => m.id === a.id), id: a.id,
          name: metadata.find(m => m.id === a.id)?.name || a.runtimeName || a.id, isAccessible: true, isEnabled: a.enabled }));
        result = { data, installed, runtimeError, scope: 'account' };
      }
      result.checkedAt = Date.now(); this.cache.set(kind, result); return result;
    } catch (err) { this.cache.delete(kind); throw err; }
    finally { this.timer = setTimeout(() => this.close(), 5 * 60000); this.timer.unref?.(); }
  }
  close() { clearTimeout(this.timer); this.conn?.close(); this.conn = null; }
}
async function inspect(pool, chatId, kind, appId) {
  if (!pool) throw new Error('Send a message in this chat first, then refresh.');
  const request = (m, p) => pool.inspect(chatId, m, p);
  if (kind === 'connections') {
    const data = await pages(request, 'mcpServerStatus/list', { detail: 'toolsAndAuthOnly' });
    return { checkedAt: Date.now(), data: data.map(s => ({ name: s.name, authStatus: s.authStatus,
      runtimeStatus: s.runtimeStatus || 'unknown', error: s.toolsError || null,
      tools: Object.values(s.tools || {}).map(t => ({ name: t.name, description: t.description || '', readOnly: t.annotations?.readOnlyHint === true })) })) };
  }
  if (kind === 'appTools') {
    if (typeof appId !== 'string' || !/^[\w-]{1,180}$/.test(appId)) throw new Error('Invalid app');
    return request('app/read', { appIds: [appId], includeTools: true });
  }
  if (kind === 'installed') return request('app/installed', { forceRefresh: true });
  throw new Error('Unknown inspection');
}
module.exports = { Catalog, pages, mentions, inspect };
