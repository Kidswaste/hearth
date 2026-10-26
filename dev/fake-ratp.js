#!/usr/bin/env node
// (round 69, ratp69) A fake of the two Métro line-status sources for checks (nothing real is reached):
//   GET /prim/marketplace/disruptions_bulk/disruptions/v2   IDFM PRIM's "Perturbations" shape; needs an `apikey` header
//                                                            starting with "good" (else 401)
//   GET /community/v4/traffic/metros                         the community RATP API's shape (no key)
//   GET /__mode?prim=normal|disrupted|blocked|down&community=normal|disrupted|down&line=9   what they answer next
//   GET /__log                                               every status request: path, whether a key came, the query
//                                                            string and the other header names — never the key itself
//   node dev/fake-ratp.js [port]   ·   require('./fake-ratp').start(port?) → Promise<{ base, server, log, close }>
const http = require('http');

const LINE_IDS = { 1: 'C01371', 2: 'C01372', 3: 'C01373', 4: 'C01374', 5: 'C01375', 6: 'C01376', 7: 'C01377', 8: 'C01378', 9: 'C01379', 10: 'C01380', 11: 'C01381', 12: 'C01382', 13: 'C01383', 14: 'C01384' };
const stamp = (ms) => { const d = new Date(ms); const p = (n) => String(n).padStart(2, '0'); return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}T${p(d.getUTCHours())}${p(d.getUTCMinutes())}00`; }; // days either side: the zone doesn't matter

function prim(mode, line) {
  const lines = Object.entries(LINE_IDS).map(([n, id]) => ({ id: `line:IDFM:${id}`, name: n, shortName: n, mode: 'Metro', networkId: 'network:IDFM:Operator_100', impactedObjects: [] }));
  const disruptions = [{ id: 'works-2', applicationPeriods: [{ begin: '20200101T000000', end: '20991231T235900' }], lastUpdate: stamp(Date.now()), cause: 'TRAVAUX', severity: 'INFORMATION', title: 'Ligne 2 : travaux de nuit', message: '<p>Travaux</p>' }];
  lines.find((l) => l.name === '2').impactedObjects.push({ type: 'line', id: 'line:IDFM:C01372', name: '2', disruptionIds: ['works-2'] });
  if (mode === 'disrupted' || mode === 'blocked') {
    disruptions.push({ id: `d-${line}`, applicationPeriods: [{ begin: stamp(Date.now() - 86400e3 * 2), end: stamp(Date.now() + 86400e3 * 30) }], lastUpdate: stamp(Date.now()), cause: 'PERTURBATION', severity: mode === 'blocked' ? 'BLOQUANTE' : 'PERTURBEE', title: `Métro ${line} : trafic perturbé`, message: `<p>Ligne ${line} : <b>colis suspect</b> à Voltaire.</p>` });
    lines.find((l) => l.name === String(line))?.impactedObjects.push({ type: 'line', id: `line:IDFM:${LINE_IDS[line]}`, name: String(line), disruptionIds: [`d-${line}`] });
  }
  return { disruptions, lines: lines.filter((l) => l.impactedObjects.length), lastUpdatedDate: stamp(Date.now()) };
}
function community(mode, line) {
  const metros = Object.keys(LINE_IDS).concat(['3B', '7B']).map((n) => ({ line: n, slug: 'normal', title: 'Trafic normal', message: 'Trafic normal sur l\'ensemble de la ligne.' }));
  if (mode === 'disrupted') Object.assign(metros.find((m) => m.line === String(line)), { slug: 'alerte', title: 'Trafic perturbé', message: `Ligne ${line} : colis suspect.` });
  return { result: { metros }, _metadata: { call: 'GET /traffic/metros', version: 4 } };
}

function start(port = 0) {
  const st = { prim: 'normal', community: 'normal', line: 9 };
  const log = [];
  const server = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    const json = (code, body) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };
    if (u.pathname === '/__mode') { for (const k of ['prim', 'community']) if (u.searchParams.get(k)) st[k] = u.searchParams.get(k); if (u.searchParams.get('line')) st.line = u.searchParams.get('line'); if (u.searchParams.get('clear')) log.length = 0; return json(200, st); }
    if (u.pathname === '/__log') return json(200, log);
    const key = req.headers.apikey;
    const which = u.pathname.startsWith('/prim/') ? 'prim' : u.pathname.startsWith('/community/') ? 'community' : null;
    log.push({ path: u.pathname, provider: which, keyed: !!key, query: u.search, method: req.method, headers: Object.keys(req.headers).filter((h) => !['host', 'connection', 'apikey'].includes(h)).sort() });
    if (which === 'prim' && u.pathname === '/prim/marketplace/disruptions_bulk/disruptions/v2') {
      if (!key || !String(key).startsWith('good')) return json(401, { message: 'Invalid apikey' });
      if (st.prim === 'down') return json(503, { message: 'down' });
      return json(200, prim(st.prim, st.line));
    }
    if (which === 'community' && u.pathname === '/community/v4/traffic/metros') {
      if (st.community === 'down') { res.destroy(); return undefined; } // the connection drops: "offline"
      return json(200, community(st.community, st.line));
    }
    return json(404, { message: 'not found' });
  });
  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => {
    const base = `http://127.0.0.1:${server.address().port}`;
    resolve({ base, server, log, state: st, close: () => new Promise((r) => server.close(r)) });
  }));
}
module.exports = { start, prim, community };
if (require.main === module) start(Number(process.argv[2]) || 0).then((f) => console.log(f.base));
