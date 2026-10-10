# Makeshift landing page

Static landing page for makeshift.horse. Hosting will use a separate GitHub Pages
repository, like the web editor. No domain or deployment configuration is changed.

## Preview and regenerate demos

Activate the repository's `.nvmrc` version first (`nvm use`). With dependencies,
native binaries (`npm run build:native`), Playwright Chromium
(`npx playwright install chromium`), and `ffmpeg`/`ffprobe` installed:

```sh
npm run demos:check
npx vite website --host 127.0.0.1 --port 4175 --strictPort
```

Open http://127.0.0.1:4175. `demos:check` records all seven recipes, checks their
geometry and encoded media, then exercises the static gallery. Record only with
`npm run demos:record`. `DEMO_ONLY=extrude npm run demos:record` is useful during
recipe development; a partial manifest cannot be packaged for release.

The site uses ordinary HTML/CSS and a small carousel module. Serve the entire
website directory with a static HTTP server. Generated `assets/demos/` is ignored;
a fresh checkout must generate it or unpack a matching release website bundle.

## Recording contract

`scripts/demos/recipes.mjs` defines primitives, sketching, extrude, revolve,
fillet/chamfer, threads and knurling. Each clip starts with an isolated browser
context and an explicit document reset. Setup uses normal controls. Recorded
input uses the same pointer/keyboard controls and real geometry backend, with
read-only inspection assertions on the demonstrated results. The visible pointer
is a presentation overlay; app controls and geometry are unmodified.

Camera framing happens before recording. Drawing and editing drags last about
two seconds, with short holds before and after meaningful changes. Sketching
includes a rectangle, circle, bowed edge and dragged corner fillet.

The Playwright demo skill's fixed-step capture helper advances the browser clock
at 30 fps, captures numbered frames and encodes H.264/yuv420p MP4. Each export
checks frame count, duration, dimensions and frame rate using ffprobe. This
preserves application animation timing; it does **not** measure live performance.
Workers and native calculations remain asynchronous, with bounded completion
checks. Clips end with a JPEG poster of the actual accepted result.

Temporary frames and diagnostic model snapshots live in `.cache/feature-demo-frames/`;
completed frame directories are removed. A failed run exits nonzero and cannot
publish a complete new manifest. The manifest records source commit, backend,
viewport and encoding metadata. `DEMO_OUTPUT` can select a separate output directory.

## CI and releases

The required Check workflow includes `feature-demos`: Chromium executes and
encodes the same seven recipes, then tests reduced motion, keyboard navigation,
play/pause, decoding every video, and responsive widths. It uploads generated
media and gallery screenshots for inspection. This explicitly requested demo
contract is separate from the compact application smoke/regression lanes.

Both desktop and web release workflows regenerate the demos before publication.
Desktop uses the release source with native geometry; web uses the just-built
static WASM app (`npm run demos:record -- --web`). Release failures block
publication. `npm run demos:package -- DESTINATION` validates the complete
manifest against a clean HEAD and emits `Makeshift-website.tar.gz` plus
`website-demos.json`. The bundle is ready for the later separate Pages host;
these workflows do not deploy or configure makeshift.horse.

The gallery advances when a clip finishes, offers explicit selection and pause,
pauses outside the viewport/background tabs, and starts paused under reduced
motion. Labels remain outside the model. Videos are muted and play inline.

## Content

Product claims follow the README and current architecture/topic docs. The icon
comes from `assets/public/`. The old public-build screenshot has been removed.
The primary action currently links to the verified `20261010T103958Z` Apple
Silicon preview DMG; update that download link deliberately when publishing the
landing page. `releases/latest` does not select these prereleases. Keep the
application and desktop update feeds on their existing hosts.
