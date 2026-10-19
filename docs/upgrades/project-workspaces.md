# Project workspaces

Projects is now Hearth's front page. Each project has a linked chat, scene, moodboard and a separate creative worktable. Existing scenes and chats are reused when available; creating from a chosen scene or moodboard makes a copy. Legacy loose chats and the shared worktable remain accessible. No project, chat or quest migration deletes data.

The new-project dialog collects a name, idea, AI personality, Serum 2 / Vital selection, starting scene, moodboard and optional files. Project setup remains editable. Optional AI descriptions use supplied project facts. The Projects menu can ask AI for an animated frontpage: a bounded scene recipe drives a locally bundled Three.js worker, with reduced-motion support and a static fallback. It sleeps offscreen and is terminated when leaving the gallery.

The rail has Projects, Life, Forgeheart and Clink, plus a small Chats entry. Add, edit, reorder or remove project/tool shortcuts through the plus button and shortcut context menu. Creative board groups materials, seamless tiles, drawing, storyboard and shelf. The project's chat follows its tools using one composer; text drafts, attachments and queued prompts are separated by chat.

## Opening and closing

An accessible loading dialog shows actual preparation stages, an animated ship or crossed brushes, a small interactive spin and reduced-motion support. Opening is serialized. A newer request cancels the previous load; callbacks cannot switch back to an abandoned project.

Opening reads the saved chat and scoped worktable, loads the linked scene, waits for its song/reference reads, and uses the existing Present preparation messages to load assets, compile shaders and upload textures. A scene already being prepared is reused. The selected saved instrument is restored silently in the native host; unused plugins are not all instantiated. Missing installations keep their saved presets and report what needs setup. Loading errors offer retry, the scene editor, or a return to Projects.

Closing flushes chat drafts, scene code and slider edits, moodboards, worktable edits and the current native instrument state before releasing the workspace. Save errors keep the project context and offer retry. The preview document is unloaded, releasing its GPU/audio/game resources; reference bytes and workbench workers are released, audio and video previews stop, and instrument hosts close. Recordings must finish before a project closes. Background AI conversations remain intact. Persistent data, metadata caches and reusable application UI remain available.

`ProjectWorkspace.state()` reports the phase and measured file, scene, instrument and total preparation times. It does not estimate a fake completion time. `ThreeLab.workspace.state()` reports preparation and release state.

## Responsiveness and compatibility

Large Paris pin catalogs use a spatial-index worker and coalesce viewport queries; smaller catalogs reuse projected coordinates. Closed maps terminate their workers. Worktable validation/import runs in a worker, and editing saves are coalesced before IPC. No Windows-only dependency was introduced into the project UI: existing platform-aware file, audio and plugin APIs remain in use.

Validation includes pure project/index and workbench checks; real Electron project creation, routing, reload and data isolation; cancel/retry and simulated save failures; drawing/storyboard exports; 10,000 map pins and worker teardown; fake native-engine streaming and fake-host instrument save/restore. An isolated copy of the owner's 56-layer Clink scene was opened, prepared, closed and reopened. Smoke tests use software rendering, so those timings are not estimates for the owner's GPU. Physical Mac and UA audio hardware were not available for this pass.

Changes are renderer-side and delivered through Hearth's updater. Reload the Hearth window to activate them; the updater preserves unrelated local changes.
