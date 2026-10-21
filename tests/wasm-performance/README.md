# Browser kernel benchmark

An opt-in comparison of native Release, Chromium WASM and WebKit WASM using the
2026-10-21 iPad capture in `tests/fixtures/ipad-two-arc-performance.json`.
This is not part of the routine CI matrix. Run on an otherwise idle Mac; finish
compilation before collecting timings.

From the repository root, with the native and standalone web builds prepared:

```sh
source ~/.nvm/nvm.sh
nvm use
npx tsc -p tsconfig.test.json
node tests/wasm-performance/run.mjs .cache/wasm-performance/baseline.json 5
```

After rebuilding the change, repeat into `after.json` and compare:

```sh
node tests/wasm-performance/compare.mjs .cache/wasm-performance/baseline.json .cache/wasm-performance/after.json
```

Comparison requires the same host, fixture, engine versions and probe count, and
checks geometry again before reporting a timing change. UI output includes actual
input intervals and drag duration alongside observed preview updates.

Use `docs/web-build.md` to install the pinned Emscripten SDK and build web mode.
Install matching browsers with `npx playwright install chromium webkit` if needed.
After frontend-only changes, `npx vite build --mode web` updates the standalone
app without recompiling OCCT. Native changes require rebuilding both calculators.

## Fixture and measurements

The original capture was a Safari webarchive containing the JSON fixture inside
an HTML `pre`. Its final body already had two fillets. The small checked-in fixture
preserves the exact sketch, extrusion settings and observed final dimensions;
`cases.mjs` reconstructs the earlier operands through the current native kernel.
It selects edges geometrically and expands the two junction chains through OCCT.
It does not reuse obsolete topology IDs from the final captured body.

The cases cover the 10 mm extrusion, a 2 mm fillet on its clean junctions, the
earlier 0.0605 mm larger top-rim fillet, the subsequent direct 2 mm junction attempt,
and its complete size-limit search. The native reconstruction reproduces the
capture's 0.4874 mm result, volume, bounds and topology counts. All runtimes receive
the same serialized operands. The limiter uses the actual shared implementation.

Native runs include one thread and the host's logical CPU count. Browser runs use
the actual built main/side WASM modules inside module workers. Phase timings are
enabled through the existing `MAKESHIFT_KERNEL_TIMING` environment variable;
exporting Emscripten's `ENV` allows this without enabling logging in the product.
Each case records its first call separately, then repeated samples. The reported
median sums calculator round trips for a complete operation, excluding the test
driver's waits and Playwright transport. Browser round trips include worker message
transfer; `computeMilliseconds` separately measures work inside the worker.
Native timings include process pipe transfer. This is not pointer-to-pixel latency.
Nested phase timings overlap: do not add parent and child totals.

The two UI drags run on the actual standalone app through pointer/keyboard input.
They measure the first extrusion after Open and a drag after an explicit numeric
extrusion warmup. Open itself initializes the kernel to inspect the document;
neither drag promises cold worker initialization, browser compilation or HTTP cache.
Worker initialization is timed separately by the raw calculator benchmark. A wall-clock sequence
targets an 80 ms input cadence, with no virtual clock or injected calculation
delay. Actual trusted pointer-event timestamps are recorded: an overloaded browser
can delay automation input, so compare those intervals as well as completion times.
Read-only instrumentation counts worker creation/termination and samples
displayed candidate changes at approximately 50 ms intervals. This is an observed
update count, not an exact frame-rate measurement. Each route verifies the final
10 mm preview, temporary ownership, acceptance, and one-step Undo/Redo.

Reports contain source revision/diff, host and engine versions, artifact hashes,
raw samples/probes, phase times, geometry summaries and UI events. BRep hashes are
recorded but not required to match across compilers. Geometry comparison checks
success/failure, volume, bounds and face/edge counts. Differences remain explicit
in the report and console; they are not treated as performance improvements.

## Focused runs

```sh
MAKESHIFT_BENCHMARK_ENGINES=webkit MAKESHIFT_BENCHMARK_DRAG=0 \
  node tests/wasm-performance/run.mjs .cache/wasm-performance/webkit.json 5
MAKESHIFT_BENCHMARK_CASE=extrude MAKESHIFT_BENCHMARK_ENGINES=native-1,chromium,webkit \
  node tests/wasm-performance/run.mjs .cache/wasm-performance/extrude.json 5
```

`MAKESHIFT_BENCHMARK_NATIVE` can select a saved native executable. Preserve the
matching SDK libraries when comparing one. Avoid concurrent benchmark processes.
The runner owns and closes its native children, browsers, contexts and HTTP server.
Playwright's WebKit is a patched build, not installed Safari; validate important
improvements in shipping Safari and on an iPad separately.

For a same-compiler optimization, save the original native executable before
rebuilding and compare complete results, including meshes and translated bounds:

```sh
node tests/wasm-performance/verify-results.mjs BEFORE_KERNEL AFTER_KERNEL
node tests/wasm-performance/verify-cancellation.mjs
```

The second command uses real browser controls to verify that invalid extrusion
input and Escape still interrupt pending work, clear the preview and allow the
next edit. These focused browser checks remain opt-in alongside the benchmark.
