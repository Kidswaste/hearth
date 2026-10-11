// Where the Lab keeps its edits (round 17, novideo): the Lab sequences ("seq:<name>") and the cuts of a footage
// video on the Lab timeline, in kv `video-cuts` ({ key: CutData edit }), the same store Video Review's editor used,
// so every sequence made before it was removed is still there. Saves are debounced and flushed at unload.
//   CutStore.editFor(key) → edit | null · storeEdit(key, edit, label) · sequences() → [{ key, name, seconds }]
//   newSequence(name, { format }) → key · deleteSequence(key) · on('change', fn) ({ path, from })
const CutStore = (() => {
  const C = CutData;
  const isSeq = (k) => String(k || '').startsWith('seq:');
  let cuts = null;
  let loading = null;
  const listeners = {};
  const emit = (ev, d) => { for (const fn of listeners[ev] || []) { try { fn(d); } catch (err) { console.error(err); } } };
  let pending = false;
  const write = debounce(() => { pending = false; window.hub.kvSet('video-cuts', cuts); }, 400);
  const save = () => { pending = true; write(); };
  addEventListener('beforeunload', () => { if (pending && cuts) { pending = false; window.hub.kvSet('video-cuts', cuts); } });
  async function load() {
    if (cuts) return cuts;
    loading ||= window.hub.kvGet('video-cuts', {}).then((x) => { cuts = x || {}; return cuts; }).catch(() => { cuts = {}; return cuts; });
    return loading;
  }
  async function editFor(key) { await load(); return cuts[key] ? C.normalize(cuts[key]) : null; }
  // a footage cut that is the whole video again (no cut, nothing rich) isn't kept
  async function storeEdit(key, e, label = 'From the Lab') {
    await load();
    const d = e?.clips?.[0]?.max || 0;
    if (!e || (!isSeq(key) && !C.isRich(e) && C.isIdentity(e, key, d) && !e.mark)) delete cuts[key];
    else { const { lastItem: _l, ...keep } = e; cuts[key] = keep; }
    save();
    emit('change', { path: key, from: 'lab', label });
    return true;
  }
  const sequences = () => Object.keys(cuts || {}).filter(isSeq).map((k) => ({ key: k, name: k.slice(4), seconds: Number(C.total(C.normalize(cuts[k])).toFixed(2)) }));
  async function newSequence(name = 'Sequence', { format = '9:16' } = {}) {
    await load();
    let key = `seq:${String(name).trim() || 'Sequence'}`;
    for (let i = 2; cuts[key]; i += 1) key = `seq:${name} ${i}`;
    const FX = typeof EditFX !== 'undefined' ? EditFX : null;
    const f = FX?.FORMATS?.find((x) => x.id === format) || FX?.FORMATS?.[0] || { w: 1080, h: 1920 };
    cuts[key] = C.setSeq({ ...C.empty(), clips: [{ id: C.uid(), kind: 'gap', dur: 5, slot: 1 }] }, { w: f.w, h: f.h, fps: 30 });
    save();
    emit('change', { path: key, from: 'store' });
    return key;
  }
  function deleteSequence(key) { if (!cuts?.[key]) return false; delete cuts[key]; save(); emit('change', { path: key, from: 'store', deleted: true }); return true; }
  function on(ev, fn) { (listeners[ev] ||= []).push(fn); return () => { listeners[ev] = listeners[ev].filter((f) => f !== fn); }; }
  load();
  return { load, editFor, storeEdit, sequences, newSequence, deleteSequence, on };
})();
