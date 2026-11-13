# Native export mesh integration

`makeshift-mesh` evaluates temporary decorator-export mesh operations. It has no
application document, BRep state, or Undo history. The renderer worker retains
procedural generation and final packing/validation/encoding. `MeshPlan` records
only the Boolean, clipping and primitive operations used by current decorators.
It is neither persisted nor exposed as a decorator API.

## Build and provenance

From the repository root, activate `.nvmrc`, then run `npm run setup:mesh`.
CMake and a C++20 compiler are required. The setup downloads SHA-256-checked
archives specified in `scripts/mesh-inputs.mjs`. Ordinary `npm run build` rebuilds
the configured executable. No system Manifold/TBB package or personal cache is
required. All upstream source remains unmodified in ignored `.cache/mesh-inputs`.

- Manifold 3.5.3, Apache-2.0, commit
  [`0edd9d5`](https://github.com/elalish/manifold/tree/0edd9d54876f3135e431575214dd6d8a72866fee).
  The [public Manifold API](https://github.com/elalish/manifold/blob/0edd9d54876f3135e431575214dd6d8a72866fee/include/manifold/manifold.h)
  supplies `Boolean`, `TrimByPlane`, `Cylinder`, `Transform`, `GetTolerance` and
  `GetMeshGL64`. Both runtimes receive the same float32 local-coordinate vertices.
- oneTBB 2022.3.0, Apache-2.0 with included third-party notices, commit
  [`f1862f3`](https://github.com/uxlfoundation/oneTBB/tree/f1862f38f83568d96e814e469ab61f88336cc595).
  Manifold's [dependency configuration](https://github.com/elalish/manifold/blob/0edd9d54876f3135e431575214dd6d8a72866fee/cmake/manifoldDeps.cmake)
  supports this version as a static dependency. `MANIFOLD_PAR=ON` enables native
  parallel evaluation. CrossSection, language bindings and upstream tests are
  excluded from this executable.

No upstream implementation is copied into Makeshift's sources. Manifold and TBB are
statically linked into a separate process, avoiding TBB symbol conflicts with
other calculators. Release preparation packages that executable and both license
inventories; the matching source distribution includes the pinned archives.

## Calculation and cancellation

Each body uses a disposable process and one bounded, little-endian binary request
on stdin. Input meshes are float32 coordinates and uint32 indices. Operations
reference earlier operands; transforms and plane parameters use float64. The
process checks sizes, indices and finite values, evaluates the final mesh and
writes float64 positions and uint32 triangle indices plus its numerical tolerance
to stdout. Diagnostics
use stderr and a nonzero exit. Both directions are limited to 512 MiB per body.

The host allows one native export calculation at a time. Cancel/timeout terminates
its process, escalates to forced termination after 250 ms and drains exit before
reuse. Worker termination discards procedural generation and pending results.
No partial file is published. Application exit, renderer reload and renderer crash
also close the calculator. The default parallel cap is four threads (or the
reported hardware count if lower). `MAKESHIFT_MESH_THREADS=1..8` is a diagnostic override
for native benchmarking, not a document setting.

Conservative operand bounds construct cylindrical clipping tools without forcing
intermediate Booleans. Those tools still extend beyond the entire target and use
the existing radial error budget. Native results retain the Boolean positions in float64 through the handoff and
pass the collapsed facet repair, closure and orientation checks before encoding.

Electron uses binary IPC through the preload bridge. Browser development uses the
localhost binary export endpoint. Clients without that capability, including the
current iPad transport, retain the WASM worker. A reported native failure is surfaced,
not silently retried in another engine.

## Verification

After `npm run build` and `npx tsc -p tsconfig.test.json`:

```sh
node --test .cache/sketch-tests/tests/native-mesh*.test.js
node tests/native-export-ui.mjs
node tests/decorator-performance.mjs
```

The UI check uses isolated Chromium/WebKit and hidden Electron. The benchmark
includes fresh worker startup, HTTP handoff, process startup, native evaluation,
mesh return, validation and 3MF encoding. macOS arm64 has been exercised; Linux,
Windows and physical iPad performance require testing on those systems.
