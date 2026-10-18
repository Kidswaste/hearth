// Only pixel generation runs here. The renderer owns controls, previews and saving.
importScripts('workbench-core.js');
self.onmessage = ({ data: { id, options } }) => {
  try {
    const maps = WorkbenchCore.texture(options);
    self.postMessage({ id, maps }, Object.values(maps).map(map => map.buffer));
  } catch (error) { self.postMessage({ id, error: error.message }); }
};
