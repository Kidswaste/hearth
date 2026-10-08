// Hearth's own icons: small inline SVGs (24×24, drawn with currentColor) for the agents, tools and rail buttons, so
// they read as one set in every look instead of letters and emoji. Icons.node(key) returns an <svg> element;
// Icons.for(item) picks one for an agent or a tool (null when there's none, e.g. a website agent).
const Icons = (() => {
  const S = (body, extra = '') => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" ${extra}>${body}</svg>`;
  const SVG = {
    // Claude: a soft eight-ray spark
    claude: S('<path d="M12 3.2v6.1M12 14.7v6.1M3.2 12h6.1M14.7 12h6.1M5.8 5.8l4.3 4.3M13.9 13.9l4.3 4.3M18.2 5.8l-4.3 4.3M10.1 13.9l-4.3 4.3"/><circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none"/>'),
    // Astra: a four-point star with an orbit
    astra: S('<path d="M12 3.5c.7 4.2 1.9 5.4 6.1 6.1-4.2.7-5.4 1.9-6.1 6.1-.7-4.2-1.9-5.4-6.1-6.1 4.2-.7 5.4-1.9 6.1-6.1z" fill="currentColor" fill-opacity=".18"/><ellipse cx="12" cy="13.5" rx="9.2" ry="3.6" transform="rotate(-18 12 13.5)" stroke-width="1.3" opacity=".7"/>'),
    // Hearth: the flame
    hearth: S('<path d="M12 21c-3.9 0-6.5-2.7-6.5-6.1 0-3.4 2.6-5.3 3.6-8.4.6 1.8 1.7 2.7 2.7 3.2-.1-2.6.8-4.7 2.7-6.7.2 3.3 4 5.9 4 10 0 4.6-2.7 8-6.5 8z" fill="currentColor" fill-opacity=".16"/><path d="M12 21c-1.7 0-2.9-1.2-2.9-2.8 0-1.8 1.6-2.6 2.2-4.3 1.6 1.2 3.6 2.2 3.6 4.4 0 1.5-1.2 2.7-2.9 2.7z"/>'),
    // Forgeheart: an anvil with a spark
    forge: S('<path d="M4 9h12.5c0 2.4-1.9 3.8-4.5 3.8V15h2.5l1.5 3H6l1.5-3H10v-2.2C7.2 12.8 4 11.7 4 9z" fill="currentColor" fill-opacity=".14"/><path d="M18.5 4.5l1-1M20.5 7.5h1.4M17.2 3V1.8"/>'),
    // Three.js Lab: a wireframe prism
    three: S('<path d="M12 2.8l8.2 14.6H3.8z" fill="currentColor" fill-opacity=".12"/><path d="M12 2.8l-2.6 14.6M12 2.8l3.6 14.6M3.8 17.4l5.6-4.1 6.2 4.1M9.4 13.3l10.8 4.1" stroke-width="1.2" opacity=".75"/>'),
    // a director: the prism in a viewfinder
    director: S('<path d="M4 8V4h4M16 4h4v4M20 16v4h-4M8 20H4v-4"/><path d="M12 7.2l4.6 8.2H7.4z" fill="currentColor" fill-opacity=".18"/>'),
    // Video Review: a frame with a play mark
    video: S('<rect x="3" y="5" width="18" height="14" rx="2.2"/><path d="M10 9.2v5.6l4.8-2.8z" fill="currentColor" stroke-width="1.2"/><path d="M3 9h2M3 15h2M19 9h2M19 15h2" stroke-width="1.3"/>'),
    // Video Director: a clapperboard
    clapper: S('<path d="M4 10h16v9a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 19z"/><path d="M4 10l-.6-3.2 15.3-2.9.6 3.3zM8.2 6.5l2.2 2.6M12.6 5.7l2.2 2.6"/>'),
    // a jam: two voices interleaving
    jam: S('<path d="M3 13c2.2-5.5 4.4-5.5 6.6 0s4.4 5.5 6.6 0 3.7-4.2 4.8-2"/><path d="M3 11c2.2 5.5 4.4 5.5 6.6 0s4.4-5.5 6.6 0 3.7 4.2 4.8 2" opacity=".55"/>'),
    // rail buttons
    plus: S('<path d="M12 5v14M5 12h14"/>'),
    command: S('<rect x="3.5" y="3.5" width="17" height="17" rx="4"/><path d="M9.5 15.5l5-7"/>'),
    notes: S('<path d="M6 3.5h8.5L19 8v12.5H6z"/><path d="M14.5 3.5V8H19M9 12h7M9 15.5h7M9 9h3"/>'),
    memory: S('<path d="M9.5 4.5a3 3 0 0 0-3 3 3.2 3.2 0 0 0-2 5.6A3.4 3.4 0 0 0 8 18.8a3 3 0 0 0 4 1V5.6a3 3 0 0 0-2.5-1.1zM14.5 4.5a3 3 0 0 1 3 3 3.2 3.2 0 0 1 2 5.6 3.4 3.4 0 0 1-3.5 5.7 3 3 0 0 1-4 1"/><path d="M8.5 10.5c1.2 0 2 .8 2 2M15.5 10.5c-1.2 0-2 .8-2 2" opacity=".7"/>'),
    panel: S('<rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/><path d="M9.5 4.5v15M5.8 8.5h1.7M5.8 11.5h1.7M5.8 14.5h1.7"/>'),
    grid: S('<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>'),
    broadcast: S('<circle cx="12" cy="12" r="2"/><path d="M8 8a5.6 5.6 0 0 0 0 8M16 8a5.6 5.6 0 0 1 0 8M5.2 5.2a9.6 9.6 0 0 0 0 13.6M18.8 5.2a9.6 9.6 0 0 1 0 13.6"/>'),
    gear: S('<circle cx="12" cy="12" r="3"/><path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M18.5 5.5l-1.7 1.7M7.2 16.8l-1.7 1.7"/><circle cx="12" cy="12" r="6.6" opacity=".5"/>'),
    web: S('<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.4 2.4 3.5 5.2 3.5 8.5s-1.1 6.1-3.5 8.5c-2.4-2.4-3.5-5.2-3.5-8.5s1.1-6.1 3.5-8.5z"/>'),
  };
  // agent / tool id (or engine) -> icon
  const BY_ID = { claude: 'claude', astra: 'astra', hearth: 'hearth', forgeheart: 'forge', forgedebug: 'forge', three: 'three', threedirector: 'director', ae: 'video', videodirector: 'clapper', jam: 'jam' };
  const BY_ENGINE = { claude: 'claude', codex: 'astra' };
  const BY_BUTTON = { 'add-btn': 'plus', 'palette-btn': 'command', 'notes-btn': 'notes', 'memory-btn': 'memory', 'panel-btn': 'panel', 'grid-btn': 'grid', 'bar-btn': 'broadcast', 'config-btn': 'gear' };

  const tpl = document.createElement('template');
  function node(key) {
    if (!SVG[key]) return null;
    tpl.innerHTML = SVG[key];
    const svg = tpl.content.firstElementChild.cloneNode(true);
    svg.classList.add('hi', `hi-${key}`);
    svg.setAttribute('aria-hidden', 'true');
    return svg;
  }
  // An agent or tool's icon key: by id (directors by what they direct), then by engine for native agents.
  function keyFor(item) {
    if (!item) return null;
    const id = String(item.id || '').replace(/\d+$/, '');
    if (BY_ID[id]) return BY_ID[id];
    if (item.dock === 'three' || item.threeTools) return 'director';
    if (item.dock === 'ae' || item.videoTools) return 'clapper';
    if (item.gameTools) return 'forge';
    if (item.mode === 'native' && BY_ENGINE[item.engine]) return BY_ENGINE[item.engine];
    return null;
  }
  const forItem = (item) => node(keyFor(item));

  // The static rail buttons (index.html) get their icons once the page is parsed.
  function decorateRail() {
    for (const [id, key] of Object.entries(BY_BUTTON)) {
      const b = document.getElementById(id);
      if (b && !b.querySelector('svg.hi')) b.replaceChildren(node(key));
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', decorateRail); else decorateRail();

  return { node, for: forItem, keyFor, keys: () => Object.keys(SVG), decorateRail };
})();
