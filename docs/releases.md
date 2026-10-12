# macOS releases

Makeshift's original code is LGPL-2.1-or-later; dependency licenses remain unchanged.
The first distribution target is Apple Silicon on macOS 14 or newer, outside the
App Store. Release builds are manually requested from `main`; they do not run
on pushes or pull requests. Intel and Windows installers are outside this release
pipeline. Signed Apple Silicon releases receive automatic preview updates.

## Release everything from GitHub

After **Check** passes on `main`, run **Actions → Release all → Run workflow**
with `main` selected. It verifies Check for that exact commit, then runs the
existing macOS and web release pipelines in parallel from the same commit.
This publishes the signed macOS app, matching sources and preview update feed,
the standalone web app and sources, and the web and landing-demo deployments.
The existing `macos-release`, `web-release` and `github-pages` environments,
credentials and approval rules still apply.

The individual **Release macOS arm64** and **Release web mode** actions remain
available. Publication is independent: one pipeline can finish even if the other
fails. Retry a failed job in the combined run to avoid repeating successful
releases. Builds and signing are serialized with individual runs of the same
pipeline, and another Release all run does not cancel a release in progress.

## Local package and verification

From the repository root, activate `.nvmrc` (`source ~/.nvm/nvm.sh && nvm use` on
the development Mac). Install CMake and Xcode Command Line Tools, then:

```sh
npm ci
export CMAKE_OSX_ARCHITECTURES=arm64
export MACOSX_DEPLOYMENT_TARGET=14.0
npm run setup:native
npm run setup:kernel
npm run setup:mesh
npm run package:mac
node scripts/release/verify.mjs
node tests/release-package.mjs
MAKESHIFT_TEST_EXECUTABLE="$PWD/.build/packages/Makeshift-darwin-arm64/Makeshift.app/Contents/MacOS/Makeshift" node tests/agent-finder-launch.mjs
```

The app is `.build/packages/Makeshift-darwin-arm64/Makeshift.app`. `npm run make:mac`
also makes a DMG under `.build/packages/make/`. Without `MAKESHIFT_SIGN=1` these are
local development artifacts, not notarized downloads. The packaged app includes
its native calculators, OCCT libraries, runtime dependencies and offline licenses;
it does not require Node, Homebrew, a checkout or a coding agent to draw geometry.
An external coding agent remains an optional separate installation.

The root postinstall explicitly installs Electron's runtime: Electron 44's npm
package no longer does that automatically. License generation uses the downloaded
runtime's notices, so it must be present before release preparation.

The hidden package test uses a temporary user profile, unrelated working directory
and restricted PATH. It exercises sketch/solid geometry, Undo, save/reopen, the PTY
and shipped CLI, and offline notices. It does not establish clean-device
Gatekeeper behavior. Verify the signed DMG downloaded through a browser on a
separate Mac before sending it to recipients.

The Finder agent test launches the packaged app with a minimal PATH and an isolated
shell configuration. It checks agent discovery, child-tool PATH inheritance and
explicit PATH precedence. The release workflow runs it before and after signing.

## GitHub signing setup

Create a GitHub environment named `macos-release` with these secrets:

| Secret | Value |
| --- | --- |
| `APPLE_CERTIFICATE_P12_BASE64` | Base64 export of Developer ID Application certificate **and private key** |
| `APPLE_CERTIFICATE_PASSWORD` | Export password |
| `APPLE_SIGNING_IDENTITY` | Exact `Developer ID Application: … (TEAMID)` identity |
| `APPLE_ID` | Developer account email |
| `APPLE_TEAM_ID` | Apple developer Team ID |
| `APPLE_APP_SPECIFIC_PASSWORD` | Apple app-specific password for notarization |

Use Developer ID Application, not an Apple Development or Mac App Store
certificate. An individual paid Developer Program membership is sufficient.
Do not put credentials in the checkout, chat, logs or caches. The workflow imports
its certificate into a temporary keychain and removes it even if signing fails.

Run **Actions → Release macOS arm64 → Run workflow**, selecting `main` after its
**Check** workflow passes. Release requires the newest main-push Check run for
the exact source commit to have completed successfully; missing, pending, failed
or cancelled checks stop the release before native setup. Wait for Check to pass
and dispatch again if necessary. The workflow token needs `actions: read`.

Check owns static checks, the partitioned unit/native model suite, compact Electron
smoke and focused platform regressions. Release does not repeat the full model
suite serially on macOS. It retains release metadata, packaged app, update and
Finder launch checks, with separate steps for metadata, packaging and unsigned
verification so their costs are visible in Actions.

Release checks signing secrets before the expensive build, selects arm64
`macos-15` and Xcode 16.4, builds and tests the unsigned app,
signs and notarizes the app and DMG, tests the signed
app, and only then publishes a prerelease. Failed source preparation prevents
publishing the app release. Do not enable automatic cancellation while signing.
GitHub's runner image can remove an Xcode installation; update the explicit
selection and revalidate the deployment target if that happens.

Every release name displays UTC ISO 8601 (`2026-09-22T14:35:12Z`). Tags and filenames
use its basic form (`20260922T143512Z`). npm and Apple metadata receive numeric
versions, while `build.json`, Info.plist and About retain the full timestamp and
commit. The timestamp is generated once per run. Reruns get a new release identity.
The stable bundle ID is `com.osuushi.freac`.
Keeping this identifier preserves the application's signing identity across the rename.

## Automatic preview updates

GitHub Releases hosts the DMG and a ZIP of the final signed, notarized, stapled
app. GitHub Pages hosts only the static feed at
`https://osuushi.github.io/makeshift/updates/preview/darwin-arm64/RELEASES.json`.
Enable Pages with **Settings → Pages → Source: GitHub Actions** before the first
release using this workflow. The `github-pages` environment must allow `main`.
This pipeline owns the Pages deployment; a future website must include this feed
in its deployment rather than replace it. No update server or app credentials
are needed; the repository and release downloads must remain public.

GitHub redirects the former repository URL and release downloads after the rename,
but does not redirect its former Pages URL. Installed Freac releases still use
the `/freac/` update feed and need one manual Makeshift installation to switch to
the new feed. Keep the former repository name unused so its repository redirect remains.

The release job creates the manifest from the same `build.json` as the app,
publishes all release assets, then deploys Pages. The preview feed explicitly
selects our timestamped prereleases; it never relies on GitHub's latest-release
selection, which would also encounter source-only releases. Only the newest
full ZIP is needed in the manifest; previous release assets remain available.
Do not increase the minimum supported OS without separating incompatible clients
onto an appropriate feed. The generator rejects builds outside macOS 14 arm64.

Only signed packages contain `updates.json`; development and unsigned packages
do not make update requests. Makeshift checks 30 seconds after launch and every six
hours, or through **Makeshift → Check for Updates…**. A downloaded update offers
**Restart to update** or **Later**. Restart passes through the normal tool guard,
agent shutdown and unsaved-document Save/Cancel/Discard flow. Later keeps working;
Electron applies the staged update after a normal quit. Background network errors
are logged quietly; manual checks report failure. Hidden acceptance runs do not
schedule network checks.

Electron's `serverType: "json"` initializes Squirrel with its application version
([AutoUpdater::SetFeedURL, pinned Electron source](https://github.com/electron/electron/blob/07e460719c75b2ec5ee4893f7d2192ef31c7b8c2/shell/browser/auto_updater_mac.mm#L83)).
Makeshift uses the numeric `package.json` version (`year.day-of-year.seconds-of-day`)
for feed comparisons, preserving ordering across same-day builds and year changes.
The JSON shape and deferred installation are described in the
[Electron update guide](https://www.electronjs.org/docs/latest/tutorial/updates)
and [autoUpdater API](https://www.electronjs.org/docs/latest/api/auto-updater).
We rely on Electron/Squirrel for download, signature validation and installation.

Run `npm run test:release` and, after `npm run build`, `node tests/app-updates.mjs`.
The hidden Electron test draws real geometry and exercises the menu, Later,
Cancel and save-before-install with the OS update transport stubbed. It does not
prove signed installation. It also checks that an installer error restores the
normal save-on-close guard. Release acceptance requires installing signed build A
in a writable Applications folder, publishing newer signed build B, checking for
updates, canceling once with edited geometry, then saving and restarting. Verify
B's About timestamp and reopen the saved drawing. Existing builds without the
updater need one manual installation. No signed A→B update has been verified yet.

## Source and license distribution

Help → Third-party licenses and About → Third-party licenses work offline.
The inventory includes installed production npm packages (including embedded
renderer dependencies), preserved Electron/Chromium notices, native dependencies,
Vite's renderer helper and the terminal WASM's additional notices. An unsupported
new npm license must be reviewed before release; package metadata alone is not
an audit of embedded code.

`node scripts/release/sources.mjs` requires a clean tree at the packaged commit.
It creates `Makeshift-<timestamp>-sources.tar.gz` containing the complete Makeshift tree,
OCCT's original archive and the dated precision adaptation in `scripts/setup-kernel.mjs`,
original/adapted PlaneGCS files, pinned Eigen and Boost
archives, licenses and build instructions. `SHA256SUMS` covers each release asset.
The scripts verify the native source checksums even on cache hits.

Electron 44.3.0 includes Chromium 152.0.7977.78. Preserve their matching source
archives and Electron patches as well as their notices. The complete Chromium
archive is about 6 GB and exceeds GitHub's per-asset limit. A Linux job downloads
and verifies the official archive, splits it into six parts, and creates a
source-only prerelease `runtime-sources-electron-44.3.0`. Later app releases reuse
that source release, avoiding a repeated 6 GB download and preserving macOS cache
space. `packaging/runtime-sources.json` pins checksums and exact versions;
`packaging/RUNTIME-SOURCES.md` describes reconstruction and runtime rebuilds.
Update these pins and audit the runtime notices whenever Electron changes.

Everyone receiving the app must also be able to get its Makeshift/native source
archive and the matching runtime source release. A private GitHub release needs
repository access: if sharing a DMG through a private folder, make the source
materials available to those recipients there too. Do not delete source releases
that accompany binaries still being distributed. No Apple private keys are part
of the source materials or necessary for local modifications.

To rebuild Makeshift/native components, extract its sources archive, activate Node 24,
install CMake/compiler, and run the local build commands above. The archive's
`.cache` contains verified native inputs, so native source setup needs no upstream
download. npm dependencies and Electron still come from their locked downloads.
Use `MAKESHIFT_ELECTRON_ZIP_DIR` to supply a locally rebuilt Electron zip distribution.

For a local OCCT replacement, build the modified 7.9.3-compatible shared libraries
with the same arm64/deployment target and configure Makeshift with `OCCT_ROOT` pointing
to that SDK; package again without `MAKESHIFT_SIGN`. For PlaneGCS, change the source
under `.cache/solver/source` after setup and use `npm run build` (rerunning
`setup:native` restores the pinned adaptations). The entire solver wrapper is
LGPL, so no proprietary relinking objects are needed. To use a modified installed
copy, replace the matching files under `Makeshift.app/Contents/Resources/native`,
preserve their install names and re-sign the modified app locally:

```sh
find /path/to/Modified-Makeshift.app/Contents/Resources/native -type f \
  -exec codesign --force --sign - --options=0 {} \;
codesign --force --deep --sign - --options=0 /path/to/Modified-Makeshift.app
```

This ad-hoc command is for personal modified copies. It clears the hardened-runtime
flags that otherwise require matching Developer ID teams for loaded libraries.
The explicit native pass is necessary because `--deep` does not discover every
helper executable stored under Resources.
The production pipeline
signs nested code through Electron's signing tools. Original Developer ID
signatures/notarization cannot attest to modified bytes; macOS may require local
approval for a downloaded or modified app. Do not disable system-wide Gatekeeper.

## Caches

The workflow caches npm downloads, Electron downloads, verified native sources,
the installed OCCT SDK and a bounded 1 GB C++ compiler cache. SDK keys include
source/build scripts, target architecture, minimum OS, compiler, SDK and CMake
versions. Native wrapper edits reuse the SDK; toolchain or OCCT changes invalidate
it. `ccache` handles changed compiler inputs; CMake configures freshly on each
runner. No keys, keychains, signed packages or notarization tickets are cached.
Caches are accelerators; cold builds remain supported. The runtime source release
is durable distribution material, not an Actions cache.
Native source, SDK, compiler and Electron caches are saved immediately after the
native build, so a later packaging or signing failure does not discard them.

CI downloads Eigen from the repository's `native-sources-eigen-5.0.1` source-only
release because GitLab rejected the hosted runner's download with HTTP 406.
This is the unchanged upstream archive; native setup verifies its pinned SHA-256
before extraction. Keep this source release available for cold builds.

Measure cold, warm, and small-native-change runs from Actions timing and
`ccache --show-stats`. Local build checks do not establish CI cache-hit timings.
