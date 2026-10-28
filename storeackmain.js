// (round 77, storeack77) The main process's StoreAck (storeack-core.js): the stores the main process holds in memory —
// quick ideas (quickideamain.js), the sound bank (soundbankmain.js), show listings (showsyncmain.js) — when the other
// computer's version arrives. syncmain.js hands it every sync:pulled list (before the window hears it) and the ack.
let ackFn = null;
const one = require('./storeack-core').create({ ack: (rels, since) => ackFn?.(rels, since) });
one.setAck = (fn) => { ackFn = typeof fn === 'function' ? fn : null; };
module.exports = one;
