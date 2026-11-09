// (round 161, fix161) ⚡ Lite mode's flag on <html> before the first paint. powerwise.js (deferred: it runs after the
// whole page is parsed) sets it too, but the first frame could be painted before it ran (fewer, smaller stylesheets
// since round 159 made that likelier): the first frames then had their animations and glow. This parser-blocking line
// runs at the top of <head> (the CSP allows no inline script); powerwise.js keeps owning the switch after it.
try { if (localStorage.getItem('hub.lite') === 'true') document.documentElement.setAttribute('data-lite', ''); } catch { /* no storage: Lite off */ }
