// Tool workspaces that live in the rail next to agents (Forgeheart, Three.js Lab, After Effects).
// Each tool registers { id, name, icon, color, description, mount(el), onShow?() }.
const Tools = (() => {
  const registry = new Map();
  const DEFAULT_ORDER = ['forgeheart', 'three', 'ae'];

  function define(tool) { registry.set(tool.id, tool); }

  // config.tools: { order: [...ids], hidden: [...ids] }
  function settings() {
    const t = H.config?.tools || {};
    return { order: t.order || DEFAULT_ORDER, hidden: t.hidden || [] };
  }
  function all() {
    const { order } = settings();
    const ids = [...order.filter((id) => registry.has(id)), ...[...registry.keys()].filter((id) => !order.includes(id))];
    return ids.map((id) => registry.get(id));
  }
  function enabled() {
    const { hidden } = settings();
    return all().filter((t) => !hidden.includes(t.id));
  }
  function save(next) {
    H.config.tools = { ...settings(), ...next };
    saveConfig();
  }
  function move(id, delta) {
    const order = all().map((t) => t.id);
    const i = order.indexOf(id);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= order.length) return;
    [order[i], order[j]] = [order[j], order[i]];
    save({ order });
  }
  function setHidden(id, hide) {
    const hidden = new Set(settings().hidden);
    if (hide) hidden.add(id); else hidden.delete(id);
    save({ hidden: [...hidden] });
  }

  function createSurface(tool) {
    const host = el('section', { class: 'surface tool-surface', dataset: { id: `tool:${tool.id}` } });
    host.style.setProperty('--agent', tool.color);
    const head = el('header', { class: 'tool-head' },
      el('span', { class: 'tool-icon', text: tool.icon }),
      el('span', { class: 'tool-title', text: tool.name }),
      el('span', { class: 'tool-desc', text: tool.description || '' }));
    const body = el('div', { class: 'tool-body' });
    host.append(head, body);
    const surface = { el: host, mode: 'tool', tool, body, head, mounted: false };
    return surface;
  }

  // Tools mount lazily the first time you open them, so startup stays fast.
  function shown(tool) {
    const s = H.surfaces.get(`tool:${tool.id}`);
    if (!s) return;
    if (!s.mounted) {
      s.mounted = true;
      try { tool.mount(s.body, s.head); } catch (err) { s.body.append(el('p', { class: 'hint', text: `This tool failed to load: ${err.message}` })); console.error(err); }
    }
    tool.onShow?.();
  }

  return { define, all, enabled, move, setHidden, createSurface, shown, get: (id) => registry.get(id) };
})();
