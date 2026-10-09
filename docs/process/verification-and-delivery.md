# Verification, setup and delivery

Read when this procedure is needed. [Process overview](../development-process.md).

## Test placement and cost

Founder decision, 2026-10-09: optimize test scope before buying CI capacity.
Default to fast unit tests. Use real native model tests for geometry and a small
Electron smoke plus focused integration regressions for the application boundary.
Do not prove every feature and every parameter combination through a browser.
A large test count or an exhaustive feature journey is not a delivery requirement.

The retired routine UI journeys already have lower-level coverage: curve creation,
constraints and transforms in `rectangle`, `circle`, `arc`, `bezier`, `point-links`,
`trim` and `scale` tests; solid operations in `body-*` and `plane-cut*`; mode/shortcut
combinations in `tool-switching` and `modeling-shortcuts`; layout families in
`widget-clearance`, `widget-viewport` and `orientable-frames`; decorator validation,
meshes and history in `decorator-*`; and Reopen state/topology in `reopen-*`.
These are `.test.ts` files under `tests/`, automatically included in the model gate.
The focused UI inventory keeps only the additional integration boundary checks.

Choose the lowest layer that can catch the failure:

| Behavior | Required test layer |
| --- | --- |
| Pure calculations, selection order, shortcuts, layout math, parameter validity | Unit test |
| Native geometry, topology, document ownership, persistence data, Undo/Redo matrices | Direct model/native integration test |
| App boot, preload sandbox, real pointer-to-native geometry, native file dialogs | Compact hidden Electron smoke |
| Escaped focus, event ordering, stale worker presentation, keyboard/menu dispatch or reload failures | One focused Electron regression |
| WebKit-specific layout, touch delivery or browser-only file/runtime behavior | A focused named compatibility case in that runtime |

Prefer extending an existing lower-level fixture over creating a second journey.
For a geometry bug, reproduce the captured model directly and compare independent
coordinates, dimensions, areas or volumes. Do not mock the solver and call that
geometry acceptance. Keep actual geometry and latency assertions intact.

A permanent UI regression needs a concrete failure and an explanation of why a
unit/model test cannot catch its boundary. Cover that failure once in Electron;
put the case matrix below the UI. A file named "regressions" that replays ordinary
creation, editing and adjacent tools is still broad feature coverage. Do not add
it to CI by default. Do not add repeated screenshots, reloads, save/reopen or
adjacent feature tours to every bug fixture. Retain these only when they exercise
the failure. Run one focused real pointer/keyboard route for changed interaction
wiring; run both a button and a shortcut only when their distinct dispatch matters.

`scripts/ci-ui-suites.mjs` owns the bounded PR regression inventory, reasons and
linked lower-level coverage. It has an aggregate timing budget and a suite-count
cap checked by `tests/ci-partition.mjs`. Adding a case normally means replacing or
narrowing redundant coverage, not adding another shard. A justified budget change
must be explicit and measured; do not pad timing estimates or bypass the inventory
with extra workflow steps. The same policy applies to unit tests: add a distinct
behavioral assertion, not tests mirroring implementation details.

Broad historical UI journeys remain available for targeted diagnosis in
`scripts/ui-review-suites.mjs` and `ui-review-routes.mjs`; they are not automatic
PR/release gates. Do not respond to a failing focused regression by launching the
entire historical suite in every runtime. Local UI helpers default to one runtime,
Electron when supported. Select a browser explicitly with `MAKESHIFT_TEST_BROWSER`
when investigating that browser. Explicit browser-only fixtures remain supported.

## Routine acceptance

For a focused change, run the affected lower-level tests and a small adjacent set.
Do not rerun the entire model/UI inventory after every edit. CI runs the complete
required gate once per pushed commit; repeat a local full run only when a changed
boundary or unresolved failure justifies it.

Run `npm run typecheck` and `npm run check` before native compilation. `test:setup`
checks launcher/setup and runtime selection; `typecheck:ui` covers the opted-in
JavaScript fixtures in `tsconfig.ui.json`.

`npm test` runs the complete unit/model inventory serially. CI balances it across
five Linux workers with `scripts/ci-model-tests.mjs` and measured file durations.
Each worker preserves `--test-concurrency=1`: concurrent native calculations can
exhaust the existing wall-clock limits. New test files remain included by default.
Only seven individually reproduced numerical/timing failures run on Mac, selected
by exact test names in `scripts/ci-model-suites.mjs`; the Mac gate requires seven
passes. Calculation limits and assertions remain unchanged.

The PR workflow builds each native runtime once and shares its executable archive,
preserving permissions and symlinks. Exact native caches include sources, recipes,
locked dependencies, platform/architecture and SDK/toolchain identity. Cache misses
build normally, SDK libraries are required, and native coverage assertions still
run on cache hits. Renderer and host TypeScript rebuild on every run.

`npm run test:smoke` exercises the built hidden Electron app: sandbox, pointer-drawn
rectangle, real native extrusion, temporary preview, acceptance, Undo/Redo, renderer
reload and native Save/Open. It runs on Linux and Mac. `npm run test:regressions`
runs the focused Electron inventory; CI divides it into three serial Linux workers.
`test:ui` aliases the smoke; `test:electron` runs smoke plus focused regressions.
The old full sweeps require explicit `test:ui:extended` or `test:electron:extended`.
No general Chromium/WebKit/Electron feature matrix or second exhaustive Electron
sweep runs on every push. Unit/model coverage remains required for those features.

macOS retains Finder PATH/process setup regressions, native navigation and the
WebKit high-DPI narrow-header Settings regression. These are platform exceptions,
not authorization for another broad browser sweep. The seven model exceptions
cover filleted-sphere erosion/placement, captured erosion calculation limits,
captured plate-hole movement volume, spherical thickness signature and conic
projection validity. The erosion cancellation case still runs on Linux. Restore
an exception to Linux after resolving its reproduced failure; a single successful
probe does not establish that a timing failure is resolved.

Standalone WASM/browser release acceptance remains in `test:web`: Electron cannot
establish browser file behavior or a standalone WASM runtime. Desktop WebKit also
does not establish iPad touch/Pencil usability; actual device feedback remains
separate. Signing and notarization remain desktop release checks.

Linux Electron runs under Xvfb with SwiftShader and offscreen hidden windows.
`MAKESHIFT_TEST_FRAME_MODE=on-demand` preserves input/native/DOM behavior while
captures request fresh GPU frames. The demand-frame regression protects this test
mode. Ordinary application rendering is unchanged. Native navigation retains its
Mac fixture sequence because offscreen Linux navigation is not accepted.

The final `check` job requires every lane to succeed even if another fails or is
skipped; cancelled runs skip that job. Runtime artifacts expire after one day.
Every test owns and closes its app, native children, browser, profile and port,
including after failure. Visible apps are for founder review. Do not inspect or
control the founder's browser without asking; use owned isolated test sessions.
Report the actual runtime and route tested, including any unverified device gap.

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
