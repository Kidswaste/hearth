# Map and Studio responsiveness

Material controls previously generated four texture maps synchronously and encoded a PNG on every input. A local Node baseline took 58 ms at 256px and 202 ms at 512px, excluding image encoding and DOM work. Sketch pointer moves serialized and decoded every stroke as SVG. Storyboard playback read block geometry after writing the transport on every frame. Map typing rebuilt its profile, filters and surrounding page; background layers also repainted hidden maps.

This pass keeps all stations, brushes, outputs, map layers, events and saved formats:

- Texture pixels run in a local worker with transferable buffers. One job runs at a time; intermediate slider values collapse into one latest request. Exports wait for the latest result. Inspecting a channel or repeating a tile uses cached pixels; the preview no longer encodes PNGs. Leaving the station terminates its worker.
- Finished sketch strokes are cached on a canvas. Pointer events paint only the active stroke, at most once per animation frame. SVG remains the export representation; undo, redo, mirror, all brushes and storyboard transfers remain available.
- Storyboard geometry is measured by ResizeObserver after layout changes, rather than during playback. The playhead uses a transform; playing-shot classes change only when the shot changes.
- Studio reactivates its editors when returning from Chat/Life or restoring the window. Previously pause disposed their handlers without remounting them on return.
- Map search keeps its input, profile and navigation mounted, updating pins and the place panel once per frame. Layer updates coalesce and hidden pages defer their paint until shown. Returning still checks for fresh show listings.
- Map tiles use an index and transforms; route SVGs survive pans and rebuild only for changed routes, zoom or viewport size. Existing tile requests, caching, attribution and zoom-detail rules are unchanged.

## Validation

`dev/checks/responsive-studio-map.js` runs in isolated Electron with a 512px material, 180 existing strokes and 24 storyboard shots. Latest run: 30 slider events took 1.7 ms of synchronous handler time and generated two worker jobs; all four maps matched the generator byte for byte. Five map-search events took 0.5 ms of synchronous handler time. Playback made zero per-frame block layout reads, hidden layer updates made zero content mutations, and route/tile reuse and drawing after navigation passed. One earlier drawing measurement included a 1.3-second frame-wait outlier; the instrumented rerun measured 4.6 ms of drawing handlers and 20.5 ms for the first burst through its frame wait. These are handler/resource measurements, not an end-to-end latency guarantee or a native-GPU benchmark.

The existing workbench check exercised PNG/SVG/project/contact-sheet/animatic exports, drawing, undo/redo, reorder/duplicate/delete shots, timing, persistence and a real renderer reload. The workspace-navigation check preserved chats, projects and quest progress. Wide/narrow sketch and storyboard screenshots were inspected. Workbench (13), quest (27), field, story-format, map-session, boot (2551) and lazy-group checks passed. No additional eager scripts or styles were added.

No saved-data migration or feature removal is involved. Claude's existing local edits are outside this patch. The user has asked Codex to lead Hearth development while Claude tokens recover; coordination is recorded in repository issue #2.
