# Live (round 6): the Lab changes in front of you, no more whole-preview reloads

You asked: "Don't renew the whole window when the chat makes a change in three.js; the reloading should be local or
things should be building in front of me. If it needs a reload then do it visually in a pretty way."

Every change from the Three Director, Astra, a jam, the nodes, your sliders or a scene switch now lands **inside the
running preview**: three.js stays loaded, the music and live sound keep playing, the other layers keep running with
their slider values and camera. The preview page is only rebuilt for what truly needs a new page (another three.js
version, a frame size that needs another pixel ratio, the Stage window, ⟲ Restart from scratch), and then it holds a
picture of your scene and cross-fades. The Hearth window itself never reloads. No new settings, buttons or commands.

## Before / after: page reloads per action
Measured by `dev/checks/live.js` (it counts what the preview page itself reports: a reloaded page says "ready", an
in-place run says "ran"), on the code before this round and after it, same 24 actions:

| Action | Before: page reloads | After: page reloads | After: what happens instead |
|---|---|---|---|
| `three_edit_code` (one layer) | 0 | 0 | that layer re-runs, cross-fading from its old picture |
| `three_set_code`, sketch with several layers | 0 | 0 | the selected layer re-runs (cross-fade) |
| `three_set_code`, **one-layer sketch** | **1** | 0 | the layer re-runs (cross-fade) |
| `three_add_layer` | 0 | 0 | the new layer wipes in |
| `three_update_layer` (opacity, position…) | 0 | 0 | props only, nothing re-runs |
| `three_update_layer` (code) | 0 | 0 | that layer re-runs (cross-fade) |
| Director undo (`/undo-edit`) | 0 | 0 | that layer re-runs (cross-fade) |
| `three_remove_layer` | 0 | 0 | the layer fades out |
| Sliders, looks, palette, FX presets, slider Save | 0 | 0 | values only |
| Node graph compile | 0 | 0 | that layer re-runs (cross-fade) |
| **Jam round** (a captured sketch put back) | **1** | 0 | only the layers that changed re-run |
| Assist pick (a look) | 0 | 0 | values only |
| **▶ Run / Ctrl+Enter** | **1** | 0 | every layer restarts in the same page, cross-fading |
| **Sliders panel shown** | **1** | 0 | layers that need slider hooks re-run in place (usually none) |
| **Scene switch** (another chat / sketch) | **1** | 0 | the new stack runs in the same page, cross-fading; a shared song keeps playing |
| **Scene switch back** | **1** | 0 | same |
| Frame size fit ↔ exact size (new pixel ratio) | 1 | 1 | unavoidable: pretty reload |
| Frame size between exact sizes | 0 | 0 | — |
| ⟲ Restart from scratch | 1 | 1 | wanted: pretty reload |
| **Total over the 24 actions** | **9** | **3** (only the unavoidable ones) | |

Also: removing the song (no page reload, it just stops); a director edit in a background chat's scene (its hidden
page re-runs only the changed layers instead of starting over); a backstage edit to the scene on screen.

Leak check (30 director edits in a row, `dev/checks/live.js`): live WebGL contexts 2 → 2, renderers 2 → 2, window
listeners 2 → 2, sketch intervals 2 → 2, canvases 2 → 2, layer boxes 2 → 2, leftover transition pictures 0 → 0,
JS heap 10 MB → 10 MB.

## Local changes instead of reloads
1. **One-layer sketches re-run in place.** `three_set_code` on a sketch with a single layer used to reload the whole preview; now it re-runs that layer like any other edit.
2. **Jam rounds and restores apply in place.** Putting a round back (jam.js, undo points, ↺) re-runs only the layers whose code changed; the rest keep running, props update.
3. **Scene switches without a new page.** Switching chats or sketches runs the new scene's layers in the same page: three.js stays loaded, the live sound stays on, a song shared by both scenes keeps playing, and a scene without a song stops the previous one.
4. **▶ Run (and Ctrl+Enter) restarts every layer in place.** It still starts everything from the beginning, without reloading the page; ⟲ Restart from scratch (Shift+click) still gives a brand-new page for a sketch that bugged out.
5. **Opening the sliders panel no longer reloads.** Layers re-run only when their slider hooks are missing (usually none).
6. **A slider that can't attach re-runs only its layer.**
7. **Backstage edits to the scene on screen land in place.** The editor, sliders and layer list follow; only changed layers re-run.
8. **The backstage page reuses itself.** A director editing a background chat's scene re-runs only the changed layers of its hidden page instead of starting it over, so its screenshots come faster.
9. **Taking the song out stops it, no reload.**
10. **Only truly global changes reload:** another three.js version, a switch between "fit" and an exact frame size (new pixel ratio), the Stage window, ⟲ Restart from scratch, or a preview page that isn't up.

## Building in front of you
11. **Code changes cross-fade.** When a layer's code changes, a picture of that layer as it was stays on top and fades into the new version as soon as the new code has drawn its first frame. Edits in quick succession keep the first picture, so there's never a blank gap.
12. **New layers wipe in.** A layer the director (or you) adds appears with a short top-down wipe and fade, to its own opacity.
13. **Removed layers fade out** instead of vanishing.
14. **Whole-scene cross-fade.** A scene switch or ▶ Run cross-fades from a picture of the old stack to the new one once every new layer has drawn.
15. **"building…" on the preview corner.** A small pill with a shimmer shows in the preview's top-left corner while the Three Director works on the scene on screen (its turn and its Lab calls), and lingers a moment so quick calls read as one stretch of work.
16. **The layer being rebuilt shimmers in the layer list** until its first new frame is drawn.
17. **Frozen picture, live edits.** With ❚❚ Freeze on, a layer that re-runs still draws its first frame, so you see the edit.

## Pretty reloads (when one can't be avoided)
18. **The reload keeps your scene on screen.** Before the page is replaced, it sends a quick picture of the current frame; the cover over the preview holds that picture (not a dark panel).
19. **The cover fades when the new scene has drawn,** not when the page has merely loaded: no half-built frame, no black flash. A picture that arrives late still goes on the cover.
20. **No double reloads.** Opening / closing the Stage window used to load the page twice; a run sent while a page is still loading now waits for it, and runs still waiting for the page are replaced by the newest one.

## Under the hood (robustness)
21. **Nothing piles up over many edits:** each layer generation disposes its renderers and GPU context, removes its window listeners (including ones added with a bare `addEventListener(…)` in a module, which weren't tracked before), and its timers; old module blob URLs are released.
22. **Styles a sketch put on the page (body background, `<style>` tags…) are reset between scenes** running in the same page.
23. **A run delivered twice can't double a layer** (the sandbox tears down a layer that already runs before running it again).
24. All transitions are Web Animations on opacity / clip-path (compositor), nothing moves from JS per frame; reduced motion (system setting) shortens them to nothing, the app's calm / off motion settings slow or stop the shimmer.
25. **`dev/checks/live.js`** measures reloads vs in-place runs per action, checks each transition actually animates, the cover during a reload, and the 30-edit leak check; `ThreeLab.live.counts()` lists the preview's reloads and in-place updates with the director tool that caused them.

## Where to look
- Hub side: `tools/three.js` (`run()` — hot / sync / in-place / reload; `sandboxFrame` — the pretty reload; "building…"),
  `tools/three-backstage.js` (in-place backstage), `tools/three-lab.css` (pill + row shimmer).
- Sandbox: `tools/three-sandbox.html` ("live edits" section: pictures, cross-fade, wipe-in, ghost fade-out, `swap-layers`,
  `stack-drawn`, `media-unload`, `__labHealth`).
