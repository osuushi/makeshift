# Verification, setup and delivery

Read when this procedure is needed. [Process overview](../development-process.md).

## Verification is about behavior

For each interaction increment, exercise creation **and subsequent editing**,
not merely a convenient creation demo. Use the actual controls involved, including
buttons and keyboard routes when both exist. Remove unnecessary duplicate controls
through the interaction design; do not leave apparently working buttons untested.

The small adjacent regression route includes selection, reselection, moving,
dimensions, tool exit/re-entry, Undo/Redo, Delete and Clear when present. Add
save/reopen once it exists. Relevant geometric checks use independent expected
coordinates, dimensions or areas, not the implementation's own derived answer.

Use headless Chromium and WebKit for routine shared-editor tests. Check the real
Electron preload/host route with hidden Electron or an isolated VM when that
boundary changes and at product checkpoints. No Firefox default. A browser run
does not establish Electron integration, and desktop WebKit does not establish
iPad touch/Pencil usability. Schedule actual device feedback; label it unverified
until performed. If a runtime cannot be exercised, report the gap plainly.

Mocks are useful for specific failures; a mocked solver is not geometry acceptance.
Tests must not create, select or commit through hidden controller methods when
claiming an ordinary user route. Read-only inspection can verify the resulting
model. Maintain a compact inventory of visible controls and their checked routes.

Run `npm run typecheck` and `npm run check` before native compilation.
`typecheck:ui` checks UI JavaScript fixtures listed in `tsconfig.ui.json` with `// @ts-check`;
annotate their Playwright `Page` parameters so nullable DOM measurements are checked.
Offset opts in; other UI fixtures remain unchecked until they are annotated.
Measure replacing SVG overlays with the bounded, atomic `overlayPoint` helper.

`npm test` runs test files serially. Native geometry checks include wall-clock
calculation limits; competing test workers can exhaust those limits on otherwise
valid fixtures. CI assigns files to five Linux workers using measured test durations
and longest-first balancing in `scripts/ci-partition.mjs`, preserving
`--test-concurrency=1`. Unmeasured files receive a small default weight and remain
required. Keep the actual geometry and latency assertions intact.

Both platform builds start independently of static checks. The PR workflow builds
each native runtime once and shares a tar archive with its test jobs, preserving
executable permissions and library symlinks. Exact native executable caches include
native sources, setup/build recipes, locked dependencies, platform/architecture and
SDK/toolchain identity. There are no fallback executable keys. SDK libraries must
also be restored before a cached executable can run; cache misses build normally.
Renderer and host TypeScript are rebuilt on every run. Native coverage assertions
run even on a cache hit. Signing and notarization remain release checks.

Shared Chromium, WebKit and hidden Electron UI suites run on Linux in sixteen
serial partitions per runtime. `scripts/ci-ui-suites.mjs` and `ci-ui-routes.mjs`
list runnable suites and timing weights. Ordinary controls, widget reachability
and edge finishes have independent entry points; dependent fixture sequences stay
intact. Seven additional workers retain the complete Electron host suite, except
two native navigation routes retained on Mac with their fixture sequence.
CI logs each suite's duration; update the weights when the distribution changes.
Do not append shard-specific workflow steps that escape balancing.

Linux UI jobs select `MAKESHIFT_TEST_FRAME_MODE=on-demand`: input, native geometry,
camera, picking and DOM updates run normally, while captures request fresh GPU frames.
The demand-frame regression checks real input avoids GPU draws and screenshots
render current pixels, including after reload. For local diagnosis, prefix a UI
command with that environment variable; ordinary runs retain normal redraws.
macOS acceptance uses the same frame mode and is limited to a built-host smoke
(native geometry, Save/Open, sandbox), Finder PATH and process setup regressions,
native navigation and WebKit high-DPI narrow-header layout,
plus the five individual numerical cases still failing on Linux.

`scripts/ci-model-suites.mjs` retains five individual geometry tests on Mac:
filleted-sphere erosion and rigid placement, captured plate-hole movement volume,
unchanged spherical thickness signature and conic projection validity. An unchanged
Linux probe passed 33 of the formerly partitioned 38 cases in run 37874047517.
Those 33, including erosion responsiveness and the other captured plate movements,
now run on Linux. Node name/skip filters partition cases exactly; the Mac gate also
requires exactly five passed tests so a renamed fixture cannot silently disappear.
Do not relax geometry, topology, history or calculation limits to remove exceptions.
The constrained-rotation WebKit route also passed unchanged on Linux and moved there.
Linux WebKit fails the existing high-DPI narrow-header Settings bounds check
(button bottom257px, required below250px); retain that unchanged suite on Mac.
The shared WebKit reload suites passed on Linux; their former broad Mac partition
is retired. Remove a remaining platform exception only after its unchanged route
passes on Linux.

The final `check` job requires every lane to succeed, including after a lane
fails or is skipped. Cancelled runs skip that final check. Runtime artifacts expire
after one day. A completed OCCT SDK is verified and cached even if compilation of
an application calculator fails afterward; incomplete SDKs cannot enter the cache.
Linux Electron test apps use SwiftShader under Xvfb because the worker's Mesa
renderer is blocklisted for WebGL. Hidden Linux test windows render offscreen:
otherwise the compositor delivers about one frame per second despite disabled
background throttling, making input slow and missing camera animation checks.
Visible desktop application rendering is unchanged.
Navigation over widgets and the native camera gesture route remain required on
Mac through `test:electron -- --navigation-only`; offscreen Linux navigation is
not yet accepted. Default `test:electron` still runs all 86 original routes.

Every routine run owns and closes its app, native child, browser, profile and port,
including after failure. Visible windows are for deliberate founder review only.
Founder instruction, 2026-09-20: do not inspect or control the founder's browser
without asking first. Ask the founder to test login and browser handoffs; automated
acceptance stays in owned, isolated test apps and browser profiles.

## Setup, commits and handoff

The first reset increment delivers reproducible setup and one documented development
command. Use Node 24 and npm, with one checked-in lockfile. Do not depend on an
agent runtime's package manager, personal PATH, prebuilt ignored cache, or hidden
environment variables. A fresh-checkout test must demonstrate the instructions.
Mark planned commands as planned until they exist and have been run.

Review tracked **and untracked/ignored** workspace artifacts when touching setup.
Validate generated paths before downloads/builds. A clean Git status alone would
not have detected the malformed `${P0_CACHE_DIR:-` cache tree. Identify ownership
and dependencies before deleting any existing cache or user's saved work.

Commit small, working, reviewed units with purpose-based messages. Keep unrelated
changes separate, preserve existing user work, and leave the old prototype
recoverable in Git. Do not delete it or promise old archive compatibility as part
of writing a restart plan.

A product handoff states: what the user can now do, how to run it, a short review
route, the runtimes actually tested, known gaps, and the commit. A pass count alone
is not readiness. Update the relevant topic documentation for lasting behavior or
limitations;
keep transient checks and the immediate next action in the local brief.

Use the current user request to choose the next increment. Do not resume
the old pocket, archive or terminal agenda from an outdated ticket or handoff.
