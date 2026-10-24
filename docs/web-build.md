# Building and releasing web mode

The web target has no Node, Electron or native-server runtime dependency. Build
prerequisites are Git, CMake, the repository's Node version and Emscripten 4.0.20.

```sh
source ~/.nvm/nvm.sh
nvm use
npm ci --ignore-scripts
git clone https://github.com/emscripten-core/emsdk.git .cache/emsdk
git -C .cache/emsdk checkout e4fe26ef59168ff44f4c23c466e497bf60b3411e
.cache/emsdk/emsdk install 4.0.20
.cache/emsdk/emsdk activate 4.0.20
source .cache/emsdk/emsdk_env.sh
nvm use
npm run build:web
npm run preview:web
```

A release
source archive already supplies the pinned OCCT, PlaneGCS, Eigen and Boost inputs
under `.cache`; normal source checkout builds download and verify them. The first
OCCT compilation is substantial. `.cache/web-wasm-exceptions` and
`.build/web-wasm-exceptions-{solver,kernel}` are separate from desktop SDKs.
The kernel build produces `makeshift-occt.js/.wasm`
(OCCT and runtime) plus `makeshift-kernel.wasm` (Makeshift implementation), linked
at worker initialization. `MAIN_MODULE=2` limits exports to the interface the side
module uses. A native implementation change can update only the small side-module
URL; a change to that imported interface can update both. Recipe changes invalidate
the web SDK cache, and a manifest verifies installed files before linking.
Change/replace the relevant source and rebuild to replace LGPL components;
no signing key or agent runtime is required.

`npm run test:web` serves the built files under `/makeshift/` using a plain static
HTTP server and drives headless Chromium/WebKit through drawing, movement, constraints,
extrusion, mesh import, Remesh/Analytic erosion, history, archive round trips, STEP export,
calculator failure/cancellation and portrait pen/touch emulation. Physical iPad/Pencil
behavior remains a device check. Install them with
`npx playwright install chromium webkit` (Linux may need `--with-deps`).
`npm run size:web` reports raw, gzip and Brotli sizes, not guaranteed network sizes.
`WEB_MODE=1 node tests/control-menu-ui.mjs` verifies the built web app's Mouse/Trackpad
menu, saved preference and camera gestures in both browsers; releases also run this route.

For opt-in native/Chromium/WebKit kernel measurements and real-time extrusion
dragging, see the [captured-fixture benchmark](../tests/wasm-performance/README.md).
It records cold worker initialization, warm operations, phase timings and worker
restarts separately; run it without concurrent builds or other benchmarks.

## Exception runtime and profiling builds

Both browser builds undefine `OCC_CONVERT_SIGNALS`: browser calculators do not
install OCCT native signal handlers, and their unused `setjmp` bookkeeping is
expensive inside geometry loops. Normal C++ exceptions, `-O3` and all geometry
checks remain enabled. This setting also applies to the dedicated native SDK.

The default uses standardized native WebAssembly exceptions. Ordinary builds and
web releases select this runtime without an environment override:

```sh
npm run build:web
node tests/wasm-performance/verify-exceptions.mjs
npm run test:web
```

This uses `-fwasm-exceptions -sWASM_LEGACY_EXCEPTIONS=0` throughout OCCT,
PlaneGCS and both calculator modules. Besides their runtime overhead, combining
OCCT's unused signal-conversion jumps with native WASM exceptions produced invalid
branch-table code in both exception formats with the pinned compiler.
The build retains ordinary C++ exceptions and `-O3`; it does not disable geometry
validation. It selects the standardized exception format. Its independent inputs
and SDK live under `.cache/web-wasm-exceptions`, with calculators in
`.build/web-wasm-exceptions-{solver,kernel}`. The SDK receipt prevents linking
one exception ABI against the other. The final site still goes to `.build/web`.
If invoking Vite or notices separately, supply the same environment variable to
each command. Release metadata records `webExceptions`; a matching source archive
must be rebuilt with that setting.

For comparison or compatibility investigation, build the JavaScript exception
runtime with `MAKESHIFT_WEB_EXCEPTIONS=javascript npm run build:web`. It retains
its separate `.cache/web` and `.build/web-{solver,kernel}` directories. Supply the
same override to separately invoked Vite, notices and release commands. Unset it
to restore the native WASM exception default.

Chromium/WebKit editing and exception-recovery tests pass, and the founder approved
an iOS 26.3 iPad simulator smoke test. Physical iPad and older browser versions
remain unverified; the default requires standardized WASM exception support.
The focused exception check catches a real OCCT exception across the main/side
module boundary, checks ordinary request errors, and then calculates valid geometry
in the same worker after each failure.

For named sampled stacks, set `MAKESHIFT_WEB_PROFILING=1` when running
`npm run build:wasm`, then rebuild the web assets with the matching exception
setting. This retains function names at Release optimization while stripping
unused DWARF sections that crash the pinned linker. Profiling is off by default;
use the [benchmark instructions](../tests/wasm-performance/README.md#sampled-cpu-stacks)
to capture the calculator worker's profile.

The [batched Twist candidate experiment](../tests/wasm-performance/CANDIDATES.md)
adds an opt-in GPU search bridge and exact CPU witness refinement to the
WASM-exception calculator. It is not enabled in ordinary web builds.

## Independent Pages repository

The deployment repository is the minimal public
[`osuushi/makeshift-web`](https://github.com/osuushi/makeshift-web) repo. Enable Pages with **Deploy from a branch**, branch
`gh-pages`, directory `/`. The main Makeshift repository owns the manual
**Release web mode** workflow; it only releases from `main`.

Configure the main repo with:

- Repository variable `WEB_PAGES_REPOSITORY`: `owner/deployment-repo`.
- Secret `WEB_PAGES_DEPLOY_KEY`: a dedicated SSH private deploy key. Add its public
  key to the deployment repo with write access. Do not use a personal SSH key.
- Optional protection rules on the `web-release` environment.

The workflow installs the pinned compiler, caches build inputs, builds the static
target, checks TypeScript/style and runs both browser routes. It publishes a
`web-TIMESTAMP` prerelease in the main repo containing `makeshift-web.zip`, matching
source/third-party notices and build metadata, then pushes that tested site to the
deployment repo. Pages branch deployment runs there. The source repo's macOS releases
and update-feed site continue independently.

The web publisher retains previous hashed assets so existing tabs keep working.
It never force-pushes. If deployment fails after release publication, the release
artifacts remain available and the last deployed site is unaffected. Re-deploy the
matching ZIP and metadata with `scripts/web/publish.mjs`; rebuilding is unnecessary.
Do not run two publishers against the same deployment repo.
