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
Chromium, WebKit and hidden Electron controls run on separate Linux workers;
Electron also runs the full host interaction suite under Xvfb. A small macOS job
checks the built host/preload boundary, native geometry, document persistence,
process handling and Finder PATH. Signing and notarization remain release checks.
The final `check` job requires every lane to succeed, including after a lane
fails or is skipped. Runtime artifacts expire after one day.

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
