// /remote: the phone remote from a chat (round 24, remote; remote.js, remotemain.js).
//   /remote · on · off · pair · devices · kick <name> · forget <name> · idle <minutes> · card
(() => {
  const AREA = 'Three.js Lab';
  const SUBS = ['on', 'off', 'pair', 'devices', 'kick', 'forget', 'idle', 'card', 'status'];
  const words = (s) => String(s || '').trim().split(/\s+/).filter(Boolean);
  const find = (list, q) => { const n = String(q || '').toLowerCase(); return list.find((d) => String(d.peer ?? d.id).toLowerCase() === n || d.name.toLowerCase() === n) || list.find((d) => d.name.toLowerCase().includes(n)) || null; };
  function status(st) {
    if (!st.on) return '📱 Phone remote: off · /remote on (same Wi-Fi as the phone)';
    return [
      `📱 Phone remote on: ${st.url}${st.code ? ` · pairing code ${st.code.code}` : ''}`,
      st.online.length ? `Connected: ${st.online.map((p) => `${p.name} (${p.addr})`).join(', ')}` : 'Nobody connected',
      `${st.devices.length} paired device${st.devices.length === 1 ? '' : 's'} · off after ${st.idleMin} min with nobody connected`,
    ].join('\n');
  }
  async function run(args) {
    const w = words(args); const sub = (w[0] || '').toLowerCase(); const tail = w.slice(1).join(' ');
    if (!sub || sub === 'status') return status(await Remote.refresh());
    if (sub === 'on') { const st = await Remote.on(); return `${status(st)}\nScan the QR code on the 📱 card, or open the address on the phone.`; }
    if (sub === 'off') { await Remote.off(); return '📱 Phone remote off'; }
    if (sub === 'card') { await Remote.refresh(); Remote.open(); return Remote.status?.on ? 'The 📱 card is open (bottom right)' : 'The remote is off: /remote on'; }
    if (sub === 'pair') { const c = await Remote.pair(); Remote.open(); return `Pairing code: ${c.code} (5 minutes, one phone)`; }
    if (sub === 'idle') { const n = await Remote.idle(Number(w[1])); return `Off after ${n} min with nobody connected`; }
    if (sub === 'devices') {
      const st = await Remote.refresh();
      return st.devices.length ? st.devices.map((d, i) => `${i + 1}. ${d.name}${d.online ? ' ● connected' : ''} · paired ${new Date(d.created).toLocaleDateString()}${d.lastSeen ? ` · last ${new Date(d.lastSeen).toLocaleString()}` : ''}`).join('\n') + '\n/remote kick <name> disconnects · /remote forget <name> revokes' : 'No paired devices';
    }
    if (sub === 'kick') { const st = await Remote.refresh(); const p = find(st.online, tail); if (!p) throw new Error(`Connected: ${st.online.map((x) => x.name).join(', ') || 'nobody'}`); await Remote.kick(p.peer); return `Disconnected ${p.name}`; }
    if (sub === 'forget') {
      const st = await Remote.refresh(); const d = /^\d+$/.test(tail) ? st.devices[Number(tail) - 1] : find(st.devices, tail);
      if (!d) throw new Error(`Paired: ${st.devices.map((x) => x.name).join(', ') || 'none'}`);
      await Remote.forget(d.id); return `Forgot ${d.name}: it must pair again`;
    }
    throw new Error(`/remote ${SUBS.join(' | ')}`);
  }
  const complete = (a) => {
    const w = String(a || '').split(/\s+/);
    if (w.length <= 1) return SUBS.filter((x) => x.startsWith(w[0] || '')).map((x) => `${x} `);
    const st = Remote.status;
    if (w[0] === 'kick') return (st?.online || []).map((p) => `kick ${p.name}`);
    if (w[0] === 'forget') return (st?.devices || []).map((d) => `forget ${d.name}`);
    if (w[0] === 'idle') return ['5', '10', '30', '60'].map((n) => `idle ${n}`);
    return [];
  };
  if (!Commands.get('remote')) Commands.register({ name: 'remote', desc: 'Phone remote for the Lab and the live stage over your Wi-Fi: faders, XY pad, shuffle / freeze / tap / save / black-out, the set list with GO, a live preview; pair with a code, kick or forget devices', args: '[on|off|pair|devices|kick <name>|forget <name>|idle <min>|card]', area: AREA, run, complete, aliases: ['phone'] });
  for (const [label, fn] of [['Lab: Phone remote on (QR code)', () => Remote.on()], ['Lab: Phone remote off', () => Remote.off()], ['Lab: Phone remote: who is connected', async () => { await Remote.refresh(); Remote.open(); }]]) {
    AppUI.addAction(label, async () => { try { await fn(); } catch (err) { toast(err.message, { type: 'error' }); } });
  }
})();
