#!/usr/bin/env node
// Phone remote (round 24): the QR maker (remote-qr.js) and the address rules (remotemain.js), in plain Node.
// The fingerprints are of matrices checked module for module against a reference encoder (python-qrcode 7.4.2, same
// version / level / mask, all 8 masks) when this was written.
//   node dev/remote-qr-test.js
const crypto = require('crypto');
const path = require('path');
const Q = require(path.join(__dirname, '..', 'remote-qr.js'));
const { isPrivate } = require(path.join(__dirname, '..', 'remotemain.js'));
let bad = 0;
const ok = (name, cond, info = '') => { if (!cond) bad += 1; console.log(`${cond ? '✓' : '✖'} ${name}${info ? ` ${info}` : ''}`); };
const fp = (m) => crypto.createHash('sha256').update(m.map((r) => r.map((b) => (b ? 1 : 0)).join('')).join('\n')).digest('hex').slice(0, 16);
for (const [t, mask, v, want] of [['http://192.168.1.23:47830/', null, 2, '232afa5cc31d9f52'], ['http://10.0.0.5:47831/', 3, 2, '3b69d5336b332d35'], ['y'.repeat(120), 5, 7, '4e424ade3b6c24a3'], ['w'.repeat(150), null, 8, 'c80b5944ae37045a']]) {
  const m = Q.matrix(t, { mask });
  ok(`QR ${t.length > 40 ? `${t[0]}×${t.length}` : t}`, m.version === v && fp(m) === want, `v${m.version}${m.ec} mask ${m.mask} ${fp(m)}`);
}
const m = Q.matrix('http://192.168.1.23:47830/');
const finder = (x, y) => [0, 6].every((d) => m[y][x + d] && m[y + d][x]) && !m[y + 1][x + 1] && m[y + 3][x + 3];
ok('finder patterns', finder(0, 0) && finder(m.length - 7, 0) && finder(0, m.length - 7));
ok('SVG', /^<svg[^>]+viewBox="0 0 33 33"/.test(Q.svg('http://192.168.1.23:47830/')));
let threw = false; try { Q.matrix('x'.repeat(400)); } catch { threw = true; }
ok('too long is refused', threw);
ok('private addresses', ['192.168.0.4', '10.1.2.3', '172.20.0.9', '127.0.0.1', '::ffff:192.168.1.9', '169.254.3.3', '::1', 'fe80::1'].every(isPrivate));
ok('public addresses refused', !['8.8.8.8', '172.32.0.1', '100.64.1.1', '::ffff:1.2.3.4', '2001:db8::1', ''].some(isPrivate));
console.log(bad ? `${bad} failed` : 'all passed');
process.exit(bad ? 1 : 0);
