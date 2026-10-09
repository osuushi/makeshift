# Developing Makeshift

Build options and verification commands for contributors. For an introduction and
everyday use, see [Makeshift](../README.md).

## Setup and run

Install Node.js 24 (24.15.0 or later within 24.x), which includes npm. With nvm,
run `nvm install` and `nvm use` in this repository; `.nvmrc` pins the tested version.
The sketch solver also needs a C++20 compiler and CMake. On macOS, install Xcode
Command Line Tools and Homebrew's `cmake` package. Linux needs compiler/CMake
packages. Windows needs a C++20-capable Visual Studio toolchain and CMake.
Setup downloads checksum-pinned Eigen 5.0.1 and Boost 1.90.0 archives into
`.cache/release-inputs` and uses their headers explicitly. No Qt or FreeCAD build
is needed. Linux/Windows build execution remains unverified.

Run all commands in this guide from the repository root, after activating `.nvmrc`:

```sh
npm ci
npm run setup:native
npm run setup:kernel
npm run setup:mesh
npm run dev
```

`dev` starts Vite and one Electron window, with renderer hot reload. Closing the
window or pressing Ctrl+C stops the owned development server. Electron launch flags
can be passed after `--`; use `npm run dev -- --user-data-dir=/path/to/qa-profile`
for an isolated review session. Changes to the
Electron entry or backend require restarting `dev`. `setup:native` downloads hash-verified PlaneGCS sources at the recorded FreeCAD
commit and builds a separate calculator. It needs network access on first use;
its source and build caches live in `.cache/solver` and `.build/solver`. Normal
`dev`/`build` runs rebuild the calculator incrementally without downloading sources.
On POSIX hosts, `npm run build:native` also configures/builds the small read-only
agent session helper under `.build/host-native`. It uses C++20 and system process
APIs, with no geometry SDK or downloaded source. macOS defaults match Node's
architecture and the 14.0 deployment target; the existing native environment
overrides apply. macOS release preparation copies/signs it with the calculators.
`setup:mesh` downloads checksum-pinned Manifold 3.5.3 and oneTBB 2022.3.0 sources
into `.cache/mesh-inputs` and builds the stateless native export calculator in
`.build/mesh`. Ordinary builds rebuild it from those prepared sources.
`setup:kernel` downloads checksum-verified OCCT 7.9.3 source and builds the modeling
libraries, STEP translator (`TKDESTEP`) and Makeshift's separate solid calculator.
Its transitive toolkit dependencies are built without FreeType or X11; STEP
export does not initialize graphics. This initial source build takes
longer; its cache is `.cache/kernel` and the calculator is `.build/kernel`.
Alternatively, set `OCCT_ROOT` to an installed SDK produced by this checkout's
`setup:kernel` recipe, including `TKDESTEP`. A stock OCCT 7.9.3 SDK is not equivalent:
Makeshift adapts rounded offset joins to shared-boundary precision. Setup and direct
CMake configuration require the recipe/build receipt, matching
platform/architecture/deployment target and checksums of the installed SDK files.
An older SDK without a receipt must be rebuilt; a version number or manually
copied marker is insufficient. The receipt records local build provenance and
integrity, not a third-party signature. Finder `.DS_Store` files are excluded
from SDK receipts and ignored during verification, including entries recorded by
older receipt writers. Added, missing or changed SDK payload files still fail
verification.
On macOS, all three native setup
commands explicitly default to Node's architecture, replacing any stale CMake
architecture selection. `CMAKE_OSX_ARCHITECTURES` remains an explicit override.
On Apple Silicon, use an ARM64 Node installation; an Intel Node running under
Rosetta defaults to Intel native builds. After correcting Node or an architecture
override, rerun `setup:native`, `setup:kernel` and `setup:mesh`; ordinary incremental builds
reuse their existing CMake configuration.
The checksum-pinned source build and receipt-verified installed/cached SDK routes
are verified on macOS arm64. This does not establish a fresh operating-system setup.
Codex worktree setup shares downloaded solver/header inputs and keeps `.build`
local. It uses the main checkout's installed OCCT SDK through `OCCT_ROOT` when
the build receipt matches this recipe/settings, its installed files verify and
the library supports the requested architecture.
It never shares OCCT's mutable CMake build directory; without a compatible installed
SDK, the worktree builds its own cache. Old kernel-cache symlinks are unlinked
without deleting the main cache. Explicit `OCCT_ROOT` overrides are preserved.
Its macOS defaults use Node's architecture and deployment target `14.0`,
matching the arm64 release SDK. Explicit environment overrides are preserved.
The macOS hook runs `bash scripts/setup-worktree.sh` after activating Node.
Install optional compiler caching with `brew install ccache`. Setup automatically
uses it when available, with a shared 2 GB cache in the main checkout's
`.cache/ccache` and checkout-relative compiler paths. The first compilation fills
the cache; later worktrees can reuse matching compiler outputs while retaining
independent CMake build directories. `CMAKE_CXX_COMPILER_LAUNCHER`, `CCACHE_DIR`,
`CCACHE_BASEDIR` and `CCACHE_MAXSIZE` overrides are preserved.
Mesh archives are shared by SHA-256 under the main checkout's `.cache/mesh-archives`
(`MAKESHIFT_MESH_ARCHIVE_CACHE` overrides this); extraction remains checkout-local.
Existing local mesh archives seed that cache after checksum verification.
For local macOS worktrees, completed dependency installations are cached under
the main checkout's `.cache/dependencies`. A matching installation is copied with
macOS copy-on-write support into an independent `node_modules`; changing files or
installing packages in one worktree cannot modify the snapshot or another worktree.
The key includes package manifests/lockfile, npm configuration, setup scripts,
Node/npm versions, platform/architecture and install-affecting environment.
Misses run `npm ci --prefer-offline --no-audit` and publish only after success.
Local/workspace-linked dependencies bypass the snapshot. Only `node_modules` is
captured; our current install hooks place their outputs there. If future lifecycle
hooks generate files elsewhere, extend the setup recipe before caching those outputs.
`MAKESHIFT_DEPENDENCY_CACHE=0 bash scripts/setup-worktree.sh` forces an ordinary install.
Standalone `npm ci` and CI/release installation are unchanged. Old snapshots can be
discarded by removing the main checkout's `.cache/dependencies` when no setup is
running; the next setup repopulates it. Run `npm audit` separately for dependency
auditing. Setup reports dependency/native phase durations, total setup duration
and cumulative compiler cache statistics. Missing ccache is reported and falls
back to normal compilation. To compare worktrees, use cache-statistics deltas;
unrelated concurrent builds also contribute to the shared counters.
Using Node's architecture avoids selecting Intel output under a translated shell.
The ordinary source-build route still checks its SDK marker against the build
settings, pinned setup sources and toolchain.
The fresh-checkout build used Node 24.15.0, Apple Clang 17, Eigen 5.0.1 and
Boost 1.90, without copying `node_modules/`, `.build/` or `.cache/` from another
checkout. This was a configured development Mac, not a fresh operating-system
installation. Linux/Windows builds remain unverified.

There is no pnpm or agent runtime dependency. The first Electron launch may download
its pinned runtime; installation, native source setup and that first launch require
network access.

`npm start` builds and launches the standalone app. `npm run dev:web` starts the shared frontend and a local development backend using the same
native calculator and document owner. It binds localhost and supports one editing
client; it is not a deployed remote-hosting implementation.

## Checks and clean builds

```sh
npm run build
npm run typecheck
npm run check
npm test
npx playwright install chromium webkit
npm run test:ui
npm run test:electron
npm run test:setup
npm run test:current-tools
```

Checks target the current `src/` application and honor Git ignores; they do not
format cached upstream sources.
`npm test` clears its generated output before compiling, so switching branches
cannot retain compiled tests from earlier code.

`test:current-tools` runs a bounded ordinary-control gate in headless Chromium,
WebKit and hidden Electron. It covers curve creation/editing, point links, Trim,
Transform, Extrude/Revolve, Face Offset, Fillet/Chamfer, Shell and plane cutting,
including the history/archive cases in those routes. `test:setup` checks SDK
receipt rejection and UI runtime selection. `tests/ui-runtime-cleanup.mjs` checks
resource closure after actual failed routes. The macOS PR/main workflow runs
these alongside the full unit suite and desktop host checks; it has no signing or
publication steps. Workflow execution on GitHub is separate from local verification.

Standalone UI launchers use `tests/ui-runtime.mjs` for runtime selection. Set
`MAKESHIFT_TEST_BROWSER=chromium`, `webkit` or `electron` to select one supported
runtime; a typo or unsupported runtime fails before launch. Existing dedicated
geometry suites retain their declared defaults. Captured geometry, decorators,
delayed delivery and physical-device checks remain separate from the ordinary gate.

To repeat setup from committed source, create a separate checkout with
`git worktree add --detach ../makeshift-clean HEAD`, enter it, activate `.nvmrc`,
and run the setup and check commands above. Start without copying `node_modules/`,
`.build/` or `.cache/` from another checkout. The compiler and CMake remain system
prerequisites; native sources and headers are downloaded and verified.

### STEP export

After native setup and `npm run build`, build the independent reader and run
geometry and ordinary control acceptance:

```sh
cmake -S native/kernel -B .build/kernel -DMAKESHIFT_KERNEL_TESTS=ON
cmake --build .build/kernel --target step-readback --config Release --parallel 4
npm test
node tests/step-geometry.mjs
node tests/bundled-step.mjs # macOS native relocation/signature check
node tests/ui-step-export.mjs
MAKESHIFT_TEST_BROWSER=chromium node tests/export-ui.mjs
MAKESHIFT_TEST_BROWSER=webkit node tests/export-ui.mjs
MAKESHIFT_TEST_BROWSER=electron node tests/export-ui.mjs
```

The reader checks exact surfaces, units, placement, volume, closed cavities and
AP242 mesh data. The UI route covers decorator choices, cancellation, visibility,
WASM fallback and unchanged accepted geometry in headless Chromium/WebKit and
hidden Electron. These checks do not certify third-party STEP application support.

### Sketch and solid tools

The orientable tool controls have a focused real-input suite. After `npm run build`,
run `node tests/orientable-tools-ui.mjs` for Chromium; set `MAKESHIFT_TEST_BROWSER=webkit`
or `MAKESHIFT_TEST_BROWSER=electron` for WebKit or hidden Electron. It covers operation
glyphs, camera projection, actual editing, cancellation, history and reopening.
`MAKESHIFT_TOOL_ROUTE` optionally selects comma-separated route names from the runner.

Mirror has a focused real-input suite for sketch and body reference picking,
copy/replace, offset, cancellation, Undo/Redo, Save/Open and subsequent edits.
After `npm run build`, run `node tests/mirror-ui.mjs` for headless Chromium/WebKit
and hidden Electron. `MAKESHIFT_TEST_BROWSER=chromium`, `webkit` or `electron` limits
the run to that runtime.

The limited interactive face Move tool has a focused real-input suite:

```sh
npm run test:face-move
MAKESHIFT_TEST_BROWSER=webkit npm run test:face-move
npm run build
MAKESHIFT_TEST_BROWSER=electron npm run test:face-move
MAKESHIFT_FACE_FEATURES_ONLY=1 npm run test:face-move
MAKESHIFT_FACE_GENERAL_ONLY=1 npm run test:face-move
MAKESHIFT_FACE_SHARED_ONLY=1 npm run test:face-move
```

Electron runs hidden. The suite covers hole/pocket/boss selection and movement,
invalid recovery, temporary previews, Undo/Redo, Save/Open and adjacent tools.
See [the modeling contract](architecture/modeling-tools.md) for supported selections and limits.

The experimental edge Move prototype has its own ordinary-input route:

```sh
npm run test:edge-move
MAKESHIFT_TEST_BROWSER=webkit npm run test:edge-move
npm run build
MAKESHIFT_TEST_BROWSER=electron npm run test:edge-move
```

It exercises round and rectangular chamfer shoulders, the local boundary-normal
handle on rotated geometry, rejection recovery, history, Save/Open, reselection
and the adjacent face-Move route; see [the movement contract](architecture/modeling-tools.md#boundary-reconnection-2026-09-17).

Edge and face Move always use shared boundary reconnection. It rebuilds neighboring
faces from moved boundaries, allowing
curved results, and uses the same path for hole/pocket/boss movement on planar stock.

```sh
npm run test:reconnection
MAKESHIFT_TEST_BROWSER=webkit npm run test:reconnection
npm run build
MAKESHIFT_TEST_BROWSER=electron npm run test:reconnection
```

The suite covers upper-rim/top-face movement, sideways reconnection, a single
chamfer edge, moving a reopened warped face, planar feature regressions and archives.
Use [the modeling contract](architecture/modeling-tools.md) to inspect the deformation
choices. This does not establish general arbitrary-BRep support.

The `MAKESHIFT_FACE_FEATURES_ONLY` UI route builds/selects/moves these six cases using
ordinary controls; it accepts the same browser selection as the full suite.
`MAKESHIFT_FACE_GENERAL_ONLY` opens the captured rounded-wall pocket and builds an
L-shaped boss plus L-shaped/rectangular through-holes through ordinary controls.
It also accepts `MAKESHIFT_TEST_BROWSER=webkit` or `electron` (hidden).
`MAKESHIFT_FACE_SHARED_ONLY` exercises the captured multi-wall hole whose distinct
faces share a cylinder. These routes now exercise the shared reconnection path.

### Slow calculations and performance

Slow calculations keep the camera usable and show an operation/elapsed-time indicator
with Cancel (or Escape). Conflicting edits stay disabled. Timeout, cancellation and
geometric rejection retain the accepted document and have distinct diagnostics.
Explicit acceptance completes normally. To verify the captured slow-deletion route:

```sh
npm run build
node tests/calculation-ui.mjs
```

This runs headless Chromium/WebKit and hidden Electron, including navigation,
cancellation, timeout, recovery and adjacent sketch interaction checks. To measure
captured deletion and open/closed Shell with 1/2/4 kernel threads, without other test
workloads running:

```sh
npm test
node tests/kernel-calculation-performance.mjs
MAKESHIFT_KERNEL_TIMING=1 node tests/kernel-calculation-performance.mjs
```

The benchmark accepts an optional kernel executable path for comparisons. Timings
include input/output; native phase timings go to stderr. General Booleans, meshing,
face deletion and Shell validation Booleans enable supported OCCT parallel paths,
using all detected logical CPUs by default. `MAKESHIFT_KERNEL_THREADS` can limit the
pool explicitly. A thread count does not guarantee that every algorithm or single
feature can use all cores.

The backend owns the current in-memory document and Undo. Reloading the renderer
preserves both; **New document** clears them. Failed and no-op attempts remain in
the same history, with inputs and errors, but Undo/Redo skip them. Open starts fresh
Undo history. Exact bodies and topology IDs are saved; display meshes are regenerated
on Open. Desktop uses native file dialogs and unsaved-work prompts; paired iPad
browses computer files, while the standalone web frontend uses upload/download.
There is no geometry autosave.
UI checks own headless Chromium/WebKit instances and close them after the run.
To check just one engine, use `MAKESHIFT_TEST_BROWSER=chromium npm run test:ui`
or `MAKESHIFT_TEST_BROWSER=webkit npm run test:ui`. Each run owns its server/backend.
Electron checks hide their window; on macOS they still require a desktop session.
Linux browser prerequisites can be installed with Playwright's `install --with-deps`
option in the test machine/VM. Linux/Windows builds and physical iPad interaction
remain unverified until exercised on those targets.

[Agent instructions](../AGENTS.md) point to the current process and design.
The [FreeCAD compendium](freecad/README.md) is a targeted reference library;
its earlier architectural inferences are not current implementation requirements.

## Native document checks

The desktop File menu supports New/Open/Save/Save As/Close and standard shortcuts.
Restarting reopens the last saved file. Unsaved edits prompt before replacement or
close; this is not autosave or crash recovery. New clears the remembered file.

After activating the repository Node version with `source ~/.nvm/nvm.sh && nvm use`:

```sh
npm run build
node tests/document-lifecycle.mjs
node tests/document-web.mjs
```

The lifecycle route uses hidden Electron and an isolated profile, real drawing,
and programmed native-dialog responses. The web route checks Chromium/WebKit
upload/download and Undo. Shared geometry test launchers also isolate their
Electron profiles and explicitly discard between cases.

## Agent terminal checks

### Gear-train behavioral evaluations

`scripts/evals/gear-trains.mjs` runs authenticated Codex against isolated hidden
Electron documents. It is an ad hoc model experiment, not part of CI. The defaults
are Astra/low and three cases: a 3:1 pair, a bounded 12:1 compound train, and
relocating an existing output axis. `oblique` is a separate 2:1 creation case.
After activating `.nvmrc`, build the app and compile the native test modules:

```sh
npm run build
npx tsc -p tsconfig.test.json
node --test scripts/evals/gear-grade.test.mjs
node scripts/evals/gear-render.mjs
MAKESHIFT_EVAL_OUTPUT=.cache/gear-eval/my-run node scripts/evals/gear-trains.mjs
node scripts/evals/gear-grade.mjs .cache/gear-eval/my-run/{pair,compound,revision}
node scripts/evals/gear-review.mjs .cache/gear-eval/my-run/{pair,compound,revision}
```

Use `MAKESHIFT_EVAL_CASES=oblique`, `MAKESHIFT_EVAL_MODEL`, `MAKESHIFT_EVAL_EFFORT`, and
`MAKESHIFT_CODEX_EXECUTABLE` to select cases and harness settings. Use a fresh output
directory for each run. `MAKESHIFT_EVAL_VARIANT` labels a guidance experiment;
`MAKESHIFT_EVAL_SKILL=/path/to/skill-folder` copies and explicitly invokes a candidate
`makeshift-gear-trains` skill in the isolated document workspace.

Results retain dated prompts, model/effort, CLI version, reference hashes, command
traces, timing, usage, authored files and `.makeshift` models. Review the trace and final
claims as well as `grade.json`: successful commands alone do not establish a good
result. The grader independently derives ratios, axes, module, width, envelope and
theoretical contact ratio from accepted geometry. It checks closed decorated export
meshes and samples every body pair for interference. The UI review reopens each
model and uses ordinary pointer/settings/Undo/Redo controls. Negative native fixtures
check that the grader detects bad phase, ratio, spacing and overlapping stages.
These cases cover unshifted external Z-axis spur trains only. Sampled collision
checks are not continuous motion, load, manufacture or arbitrary assembly validation.
The deterministic `gear-render.mjs` check verifies that the agent image includes
visible teeth while preserving model, camera and selection. It also supports
`MAKESHIFT_TEST_BROWSER=chromium` and `webkit` for the shared capture implementation;
the default Electron route uses the real CLI/host boundary.

### Terminal and interface checks

After activating `.nvmrc`, `npm ci` installs the pinned Ghostty-web and node-pty
dependencies and prepares node-pty's macOS helper. After `npm run build`, run
`node tests/agent-terminal.mjs` for hidden Electron and `node tests/agent-web.mjs`
for isolated Chromium/WebKit with a real test PTY. Run `node tests/agent-persistence.mjs`
for Save/Open/Save As, recovery and browser archive preservation. Set
`MAKESHIFT_CODEX_EXECUTABLE` and run `node tests/codex-portability.mjs` for a local
Codex transcript replay check without submitting a prompt. With that variable set,
`node tests/agent-orientation.mjs` checks hidden Electron commands/lifecycle plus
actual Codex prompt-input discovery and sandbox execution. These tests do not sign in
or use your browser. Linux/Windows builds and physical iPad input remain unverified.
On macOS, `node tests/agent-finder-launch.mjs` checks a minimal Finder-style PATH
in hidden Electron, shell discovery, child-tool lookup and explicit PATH precedence.
`node tests/codex-permissions.mjs` with the same executable variable checks workspace
writes, automatic review and the parent-directory boundary using an isolated config.
`node tests/agent-inspection.mjs` exercises CLI inspection in hidden Electron;
`MAKESHIFT_TEST_BROWSER=chromium` or `webkit` exercises the shared inspection route.
`node tests/agent-quit-save.mjs` checks clean quit and final shutdown-write preservation.
`node tests/agent-script.mjs` covers typed creation, selection edits, atomic Undo/Redo,
failure/cancellation and manual re-editing in hidden Electron; set
`MAKESHIFT_TEST_BROWSER=chromium` or `webkit` for the isolated shared-browser route.
Electron also checks CPU-bound cancellation and script/model Save/Open; the
orientation test exercises a real script through the installed Codex sandbox.
`node tests/agent-revolve.mjs` covers manual Revolve plus a typed CLI helical cut,
Undo/Redo, failed-script rollback, manual body movement and Save/Open; the same
`MAKESHIFT_TEST_BROWSER` settings exercise Chromium/WebKit.
That test also records a native top-face offset failure after the helical cut;
the rejected offset preserves the model and is not counted as successful editing.
TypeScript is a pinned runtime dependency so script checking needs no personal compiler.

## iPad checks

After `npm run build`, run `node tests/ipad-ui.mjs` for the real host with hidden
Electron and isolated Chromium/WebKit. Physical iPad/Pencil behavior remains unverified.

## Shell and topology deletion checks

After `npm run build`:

```sh
node tests/shell-ui.mjs
node tests/selection-operations-ui.mjs
node tests/delete-topology-ui.mjs
MAKESHIFT_TEST_BROWSER=webkit node tests/delete-topology-ui.mjs
MAKESHIFT_TEST_BROWSER=electron node tests/delete-topology-ui.mjs
```
