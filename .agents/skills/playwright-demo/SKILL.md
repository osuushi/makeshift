---
name: playwright-demo
description: Record smooth, captioned Makeshift demo videos with Playwright, including on slow software-rendered runners. Use fixed browser-clock steps and frame capture to preserve animation timing without depending on live rendering speed.
---

Use this when a user asks for demo videos or wants smoother recordings. Follow
the repository's AGENTS.md, activate its pinned Node version, and use actual
pointer/keyboard controls and the real geometry backend. This is a development
skill; it does not belong in the application's installed agent-skills directory.

## Fixed-step capture

1. Start Vite and a headless Chromium browser. Use an isolated context for each
   clip, a fixed viewport (960 × 640 works well), and normal motion preferences.
   Keep GPU presentation enabled. Do not use `recordVideo` at the same time.
2. Install `page.clock` before navigation, then prepare the fixture and camera
   using the ordinary UI while the clock still runs. Reset the document between
   clips: a new browser context alone does not reset the development backend.
3. Add readable captions and a visible pointer as presentation overlays only.
   Pause the clock after setup with `await page.clock.pauseAt(new Date())`.
4. For each output frame, apply any scheduled input, advance the clock by the
   next frame interval using `page.clock.runFor`, then take a screenshot. At
   30 fps, repeat 33, 33, 34 milliseconds to avoid accumulating clock drift.
   Use `runFor`, rather than `fastForward`, so intermediate animation callbacks
   run. Keep application animation durations and opacity settings unchanged.
5. Pump and capture frames while asynchronous UI actions are pending. Locator
   actionability, camera settling, and application timers may wait for animation
   frames; awaiting those actions with a paused clock can deadlock. Bound this
   pumping loop and propagate failures. Backend work and worker clocks are not
   controlled by the page clock: verify completion rather than assuming a sleep
   means native geometry is ready. Never run multiple frame pumps concurrently.
6. Encode numbered JPEG frames with ffmpeg at the same frame rate, using H.264,
   `yuv420p`, and `+faststart` for broadly playable MP4s. Generate frames in an
   empty directory and export only completed, verified recordings.
7. Verify frame count, duration, dimensions and frame rate with ffprobe. Inspect
   representative frames and assert the demonstrated state/geometry through
   the existing test inspection API. Close contexts, browser and server even
   when capture fails. Keep generated media and temporary frames out of Git.

Explain that this preserves the application's animation timing in a smooth
video; it is **not a measurement of live performance**. Rendering can take
longer than playback. Never present accelerated playback of a stalled live
recording as representative timing. If live performance matters, use a GPU
runner or the user's machine. Diagnose software rendering with WebGL's
`WEBGL_debug_renderer_info`; SwiftShader is CPU rendering.

## Bundled implementation

`scripts/fixed-step-capture.mjs` supplies a reusable frame pump, holds, bounded
UI actions, and MP4 export. `scripts/canonical-planes.mjs` records two actual
UI routes: primary/secondary grids during orbit, and secondary click gating
followed by selecting that grid for a real split preview.

From the repository root, with the pinned Node environment active and existing
native dependencies prepared:

```sh
node .agents/skills/playwright-demo/scripts/canonical-planes.mjs
```

Requires installed Playwright Chromium and `ffmpeg`/`ffprobe` on PATH. Default
output is `.cache/plane-demos/fixed-step/`; pass a destination directory as the
first argument to export elsewhere. Frame directories are recreated per run;
use a dedicated generated-artifact destination. A `manifest.json` records the
capture timing and frame count; separate state snapshots accompany the asserted
UI routes. For other demos, reuse the
capture helper and replace the fixture and routes, keeping acceptance checks
specific to what the user needs to see.

`scripts/plane-alignment.mjs` records coordinate and construction plane double-click
entry from near-90° roll, asserting the short turn and unchanged plane frames.
Run it with `node .agents/skills/playwright-demo/scripts/plane-alignment.mjs`; an
optional first argument selects its generated-artifact destination.
