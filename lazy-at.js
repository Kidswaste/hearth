// (round 16) Marks where a lazy group's files used to be in index.html: <script defer src="lazy-at.js#lab,video">.
// lazy.js registers the group's stand-ins here, so commands, aliases and menus come out in the old order.
window.Lazy?.at(decodeURIComponent((document.currentScript?.src || '').split('#')[1] || ''));
