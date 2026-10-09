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
    // Board: a mood board of pinned references
    board: S('<rect x="3.5" y="4" width="17" height="16" rx="2.4"/><rect x="6.5" y="7" width="5.5" height="6" rx="1" fill="currentColor" fill-opacity=".2"/><path d="M14.5 7.5h3M14.5 10.5h3M6.5 16.5h11"/><path d="M9.2 7l-.6-1.6" stroke-width="1.3"/>'),
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
    // round 8 (polish8): the round 7 surfaces — capture, the editor, video projects, tours, frames — and their menus
    // Capture: a viewfinder around a record dot
    capture: S('<path d="M4 8.5V5.5A1.5 1.5 0 0 1 5.5 4h3M15.5 4h3A1.5 1.5 0 0 1 20 5.5v3M20 15.5v3a1.5 1.5 0 0 1-1.5 1.5h-3M8.5 20h-3A1.5 1.5 0 0 1 4 18.5v-3"/><circle cx="12" cy="12" r="3.4" fill="currentColor" fill-opacity=".28"/>'),
    // a screenshot: a camera
    shot: S('<path d="M4 8.5A1.5 1.5 0 0 1 5.5 7h2.3l1.4-2h5.6l1.4 2h2.3A1.5 1.5 0 0 1 20 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5z"/><circle cx="12" cy="13" r="3.4" fill="currentColor" fill-opacity=".16"/>'),
    // record: a ring with a filled dot
    rec: S('<circle cx="12" cy="12" r="8.2"/><circle cx="12" cy="12" r="4.2" fill="currentColor" stroke="none"/>'),
    stop: S('<rect x="6" y="6" width="12" height="12" rx="2.2" fill="currentColor" fill-opacity=".85" stroke="none"/>'),
    // the editor: three lanes of clips with a playhead
    editor: S('<rect x="3.5" y="5" width="8" height="4" rx="1" fill="currentColor" fill-opacity=".2"/><rect x="12.5" y="5" width="8" height="4" rx="1"/><rect x="3.5" y="11" width="12" height="3.5" rx="1"/><path d="M3.5 18.5h17" opacity=".6"/><path d="M14 3v18" stroke-width="1.5"/>'),
    // scissors (cut)
    cut: S('<circle cx="6.5" cy="7" r="2.6"/><circle cx="6.5" cy="17" r="2.6"/><path d="M8.6 8.6L20 18M8.6 15.4L20 6"/>'),
    // a video project: a film strip
    film: S('<rect x="4" y="3.5" width="16" height="17" rx="2"/><path d="M8 3.5v17M16 3.5v17M4 8h4M4 12h4M4 16h4M16 8h4M16 12h4M16 16h4"/>'),
    // frames read from a video: three offset frames
    frames: S('<rect x="8" y="3.5" width="12.5" height="9" rx="1.5" opacity=".55"/><rect x="5.8" y="6.8" width="12.5" height="9" rx="1.5" opacity=".8"/><rect x="3.5" y="10" width="12.5" height="9" rx="1.5" fill="currentColor" fill-opacity=".16"/>'),
    // a tour: a dotted path from a start dot to a flag
    tour: S('<circle cx="5.5" cy="18.5" r="2" fill="currentColor" fill-opacity=".3"/><path d="M7.5 17.5c3-1 2-5.5 5.5-6.5s4.5-2 4.5-4.5" stroke-dasharray="2 2.4"/><path d="M17.5 3v7M17.5 3.5h3.5l-1.2 1.6 1.2 1.6h-3.5"/>'),
    // beautified / for posts: sparkles
    sparkle: S('<path d="M10 3.5c.6 3.6 1.9 4.9 5.5 5.5-3.6.6-4.9 1.9-5.5 5.5-.6-3.6-1.9-4.9-5.5-5.5 3.6-.6 4.9-1.9 5.5-5.5z" fill="currentColor" fill-opacity=".2"/><path d="M17.5 13.5c.3 1.9 1 2.6 2.9 2.9-1.9.3-2.6 1-2.9 2.9-.3-1.9-1-2.6-2.9-2.9 1.9-.3 2.6-1 2.9-2.9z"/>'),
    // a social frame: a phone-shaped frame
    social: S('<rect x="7" y="3" width="10" height="18" rx="2.2"/><path d="M10.5 18h3" /><path d="M9.5 6.5h5v8h-5z" fill="currentColor" fill-opacity=".18" stroke-width="1.2"/>'),
    // export / render: an arrow leaving a tray
    export: S('<path d="M12 15V4M7.8 8.2L12 4l4.2 4.2"/><path d="M4.5 13.5v4.5A1.5 1.5 0 0 0 6 19.5h12a1.5 1.5 0 0 0 1.5-1.5v-4.5"/>'),
    // annotate: a pen
    pen: S('<path d="M4.5 19.5l1-4.2L16 4.8a1.8 1.8 0 0 1 2.6 0l.6.6a1.8 1.8 0 0 1 0 2.6L8.7 18.5z"/><path d="M14 6.8l3.2 3.2"/>'),
    // send to a chat: a speech bubble with an arrow
    tochat: S('<path d="M5 5.5h14A1.5 1.5 0 0 1 20.5 7v8.5A1.5 1.5 0 0 1 19 17h-8l-4.5 3.5V17H5a1.5 1.5 0 0 1-1.5-1.5V7A1.5 1.5 0 0 1 5 5.5z"/><path d="M9 11.3h6M12.6 8.8l2.5 2.5-2.5 2.5"/>'),
    // the keys button / keys sheet: a keyboard
    keys: S('<rect x="3" y="6" width="18" height="12" rx="2"/><path d="M7 10h.01M10 10h.01M13 10h.01M16 10h.01M7.5 14h9"/>'),
    // a vibe: three overlapping color drops
    vibe: S('<circle cx="9" cy="10" r="4.6" fill="currentColor" fill-opacity=".14"/><circle cx="15" cy="10" r="4.6"/><circle cx="12" cy="15" r="4.6" opacity=".7"/>'),
    // present: a screen with a play mark
    present: S('<rect x="3.5" y="4.5" width="17" height="12" rx="1.8"/><path d="M10.5 8.3v4.4l3.8-2.2z" fill="currentColor" stroke-width="1"/><path d="M9 20h6M12 16.5V20"/>'),
    // timecode / frame-exact: a stopwatch
    clock: S('<circle cx="12" cy="13.5" r="7"/><path d="M12 13.5V9.5M10 3.5h4M18 7.5l1.3-1.3"/>'),
    // settings of a feature: sliders
    sliders: S('<path d="M5 7h9M18 7h1M5 17h3M12 17h7M5 12h5M14 12h5"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/><circle cx="12" cy="12" r="2" opacity=".7"/>'),
    // locked (a read-only board)
    lock: S('<rect x="5" y="10.5" width="14" height="10" rx="2" fill="currentColor" fill-opacity=".14"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"/>'),
    // recent things: a clock arrow
    recent: S('<path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3"/><path d="M4.5 4.5v3.2h3.2M12 8v4.3l2.8 1.7"/>'),
  };
  // agent / tool id (or engine) -> icon
  const BY_ID = { claude: 'claude', astra: 'astra', hearth: 'hearth', forgeheart: 'forge', forgedebug: 'forge', three: 'three', threedirector: 'director', ae: 'video', videodirector: 'clapper', jam: 'jam', board: 'board', capture: 'capture', editor: 'editor' };
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

  // The raw markup (for a CSS mask: polish8.js turns a few into data: URLs for headings drawn by CSS)
  const svg = (key) => SVG[key] || null;
  return { node, for: forItem, keyFor, keys: () => Object.keys(SVG), decorateRail, svg };
})();
