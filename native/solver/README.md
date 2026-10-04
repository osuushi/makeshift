# Native sketch calculator

A stateless calculation per input, over an owned child process's stdin/stdout.
It has no document, history or IDs. The TypeScript backend translates document
references into temporary parameter indexes and checks the returned residuals.

PlaneGCS comes from FreeCAD commit `78e4038a564e4c8bfebb40119b41d67531232223`.
`sources.json` pins every original input's SHA-256. `scripts/setup-native.mjs`
uses `scripts/solver-source.mjs` to verify and retain originals, adapt host
includes/export declarations, and explicitly defer the two QR tasks in WASM.
Native builds keep the upstream launch policy. `p0_base_compat.h` is Makeshift's logging/unreachable
shim from the previous proof. No upstream solver equations are modified.

Upstream source headers carry LGPL-2.1-or-later notices, retained in the build
inputs. Source: https://github.com/FreeCAD/FreeCAD/tree/78e4038a564e4c8bfebb40119b41d67531232223/src/Mod/Sketcher/App/planegcs
The additional Boost graph wrapper retains its upstream copyright/license header.
Eigen and Boost headers are build prerequisites and retain their own licenses.
Makeshift's wrapper and compatibility shim are LGPL-2.1-or-later, like the rest of
Makeshift's original code. Release source archives contain the complete Makeshift tree,
original and adapted PlaneGCS files, pinned headers, and rebuild instructions.
See [release compliance](../../docs/releases.md#source-and-license-distribution).

The upstream [QR launches in `System::diagnose`](https://github.com/FreeCAD/FreeCAD/blob/78e4038a564e4c8bfebb40119b41d67531232223/src/Mod/Sketcher/App/planegcs/GCS.cpp#L4937)
use `std::async` without a policy. In the single-threaded Emscripten runtime this
stalled initialization; deferred execution runs the same QR calculations on the
calculator worker. Chromium and WebKit drawing/constraint routes verify the port.
