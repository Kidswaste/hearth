// (round 67) Collaboration eyes: a duo / council / debate / relay / critique seat or a quick /ask-astra runs lean (no
// tools), so it used to see nothing of the scene it was asked about. Started from a chat that owns a Lab scene, every
// seat now gets the same look at it: a fresh frame of that chat's own scene (on screen or backstage) as image input,
// and its layer list with the selected one, as a few lines of text. Read-only Lab calls (no version is recorded), and
// nothing at all when the Lab isn't loaded or the chat has no scene.
const CollabEyes = (() => {
  const MAX_LINES = 20;
  const labIn = () => (!window.Lazy?.isIn || Lazy.isIn('lab')) && typeof ThreeLab !== 'undefined' && ThreeLab.scenes && typeof HubBridge !== 'undefined';
  const sceneOf = (chatId) => (chatId && typeof ChatScenes !== 'undefined' && ChatScenes.linkOf?.(chatId)) || null;

  function layerText(v) {
    const raw = typeof v?.layers === 'string' ? v.layers
      : Array.isArray(v?.layers) ? v.layers.map((l) => `${l.selected ? '* ' : ''}${l.name || l.id}`).join('\n') : '';
    const lines = raw.split('\n').map((x) => x.trimEnd()).filter((x) => x && !/^\(bottom first/.test(x)); // the heading says it
    return lines.length > MAX_LINES ? [...lines.slice(0, MAX_LINES), `… ${lines.length - MAX_LINES} more`].join('\n') : lines.join('\n');
  }

  // { name, text, images: [path] } or null. picture: false = the layer list only (the caller attaches its own picture).
  async function packet(chatId, { picture = true } = {}) {
    const sk = labIn() && sceneOf(chatId);
    if (!sk) return null;
    const ctx = { chatId };
    const lay = await HubBridge.call('three_layers', {}, ctx).catch(() => null);
    let img = null;
    if (picture) {
      const shot = await HubBridge.call('three_screenshot', { size: 'medium', force: true }, ctx).catch(() => null);
      const data = shot?.ok && shot.images?.[0]?.data;
      if (data) img = await window.hub.saveAttachment(`scene-${sk}-${Date.now()}.jpg`, data).catch(() => null);
    }
    const name = (lay?.ok && lay.value?.sketch) || ThreeLab.scenes.get?.(sk)?.name || 'this chat\'s scene';
    const layers = lay?.ok ? layerText(lay.value) : '';
    const pic = img ? 'The attached picture is a fresh frame of it.' : picture ? '(No picture: the scene isn\'t drawing right now.)' : '';
    const text = `[The scene this is about: "${name}". ${pic}${layers ? `\nLayers, bottom first (* = selected):\n${layers}` : ''}]`;
    return { name, text, images: img ? [img] : [] };
  }

  return { packet, _test: { layerText } };
})();
window.CollabEyes = CollabEyes;
