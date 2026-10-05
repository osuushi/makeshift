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

`npm test` runs test files serially. Native geometry checks include wall-clock
calculation limits; competing test workers can exhaust those limits on otherwise
valid fixtures. CI distributes the files across four Linux jobs using Node's
`--test-shard`, with `--test-concurrency=1` in each job. Keep the actual geometry
and latency assertions intact.

The PR workflow builds the Linux native runtime once and shares a tar archive
with the test jobs, preserving executable permissions and library symlinks.
Chromium and hidden Electron controls each run in three serial route
shards on separate Linux workers. Seven more workers run the complete Electron
host interaction suite under Xvfb, with serial routes and isolated apps in each,
except two native navigation routes retained on Mac with their fixture sequence.
Linux UI jobs select `MAKESHIFT_TEST_FRAME_MODE=on-demand`: input, native geometry,
camera, picking and DOM updates run normally, while captures request fresh GPU frames.
The demand-frame regression checks real input avoids GPU draws and screenshots
render current pixels, including after reload. For local diagnosis, prefix a UI
command with that environment variable; ordinary runs retain normal redraws.
macOS also builds its runtime once and shares an archive from the same run. Both
platform builds start independently of static checks. Four
parallel workers retain the full acceptance suite: platform-sensitive geometry,
WebKit controls, WebKit widget placement and Reopen topology, and the built
Electron host/preload boundary, document persistence, process handling and Finder
PATH. All four workers install WebKit; its acceptance blocks are distributed alongside
geometry and Electron work using measured hosted step durations. Every moved
WebKit block explicitly selects WebKit. Each worker runs its routes serially to
preserve geometry calculation limits.
Signing and notarization remain release checks.
The final `check` job requires every lane to succeed, including after a lane
fails or is skipped. Cancelled runs skip that final check so it cannot hold a
workflow concurrency slot. Runtime artifacts expire after one day. A completed OCCT
SDK is verified and cached even if compilation of an application calculator
fails afterward; incomplete SDKs cannot enter the cache.

The first Linux migration retains six required geometry files on Mac via
`scripts/ci-model-tests.mjs`: special erosion and its placement boundaries,
captured offset movement, offset thickness, exact projection and captured erosion
responsiveness. Linux currently
differs on the filleted hemisphere's erosion validity, a captured plate's volume,
an unchanged sphere's numerical signature and a conic projection reply. The
captured erosion can exceed its existing calculation limit on Linux. WebKit's
control suite remains required on Mac: Linux accepts a constrained rotation that
should reject and reports unhandled selection fetch errors across reload in
multiple routes. These are compatibility gaps, not relaxed
assertions. Remove each partition exception only after its unchanged route passes
on Linux. Normal `npm test` and `test:current-tools` still run every case.
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
