// Small independent read-only FLP observer: header, tempo, channel names and pattern-note records only.
// Format references: https://pyflp.readthedocs.io/en/latest/ and the public PyFLP field documentation.
// No plugin state is decoded, executed, modified, retained or transmitted.
const MAX_BYTES = 64 * 1024 * 1024;
function parse(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 22 || buf.length > MAX_BYTES || buf.toString('ascii', 0, 4) !== 'FLhd' || buf.readUInt32LE(4) !== 6 || buf.readUInt16LE(8) !== 0 || buf.toString('ascii', 14, 18) !== 'FLdt' || buf.readUInt32LE(18) !== buf.length - 22) throw new Error('This is not a complete supported FL Studio project. Save it again in FL Studio.');
  let offset = 22, version = '', bpm = null, channel = null, channelSection = false;
  const channels = new Map(), notes = new Map();
  while (offset < buf.length) {
    const id = buf[offset++]; let size = id < 64 ? 1 : id < 128 ? 2 : id < 192 ? 4 : 0;
    if (id >= 192) {
      let shift = 0, byte;
      do { if (offset >= buf.length || shift > 28) throw new Error('The FLP event length is incomplete. Save and try again.'); byte = buf[offset++]; size += (byte & 127) * (2 ** shift); shift += 7; } while (byte & 128);
    }
    if (size < 0 || offset + size > buf.length) throw new Error('The FLP is still being saved.');
    const begin = offset; offset += size;
    if (id === 199) version = buf.toString('ascii', begin, offset).replace(/\0.*$/, '');
    if (id === 156) bpm = buf.readUInt32LE(begin) / 1000;
    if (id === 66 && bpm === null) bpm = buf.readUInt16LE(begin);
    if (id === 64) {
      channel = buf.readUInt16LE(begin); channelSection = true;
      if (!channels.has(channel)) channels.set(channel, { id: channel, name: '', enabled: true });
    }
    // Mixer insert/end-of-channel markers stop plugin-name events from being attached to the last rack channel.
    if (id === 236 || id === 98) channelSection = false;
    if (channelSection && channel !== null && id === 0) channels.get(channel).enabled = !!buf[begin];
    if (channelSection && channel !== null && (id === 192 || id === 203)) {
      if (!version) throw new Error('FL Studio version missing; cannot safely read channel names.');
      const [major, minor] = version.split('.').map(Number);
      channels.get(channel).name = buf.toString(major > 11 || (major === 11 && minor >= 5) ? 'utf16le' : 'latin1', begin, offset).replace(/\0.*$/, '').slice(0, 100);
    }
    if (id === 224) {
      if (size % 24) throw new Error('This FL Studio note format is not supported yet.');
      for (let p = begin; p < offset; p += 24) {
        const rack = buf.readUInt16LE(p + 6), pitch = buf.readUInt16LE(p + 12), velocity = buf[p + 21];
        if (pitch < 132 && velocity > 0) notes.set(rack, (notes.get(rack) || 0) + 1);
      }
    }
  }
  if (!Number.isFinite(bpm) || bpm < 10 || bpm > 1000) throw new Error('No supported saved tempo was found in this FLP.');
  return { version, bpm, channels: [...channels.values()].map(c => ({ ...c, notes: notes.get(c.id) || 0 })) };
}
module.exports = { parse, MAX_BYTES };
