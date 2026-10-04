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
OCCT compilation is substantial. `.cache/web` and `.build/web-{solver,kernel}` are
separate from desktop SDKs. The kernel build produces `makeshift-occt.js/.wasm`
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
