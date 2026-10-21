# Kernel benchmarks and profiling

An opt-in comparison of native Release, Chromium WASM and WebKit WASM using the
2026-10-21 iPad capture in `tests/fixtures/ipad-two-arc-performance.json`.
The broad suite also shares canonical inputs with the existing native geometry
and sweep benchmarks. It covers primitives, meshing, fillet/chamfer, face offset,
cuts, scale, draft, loft, path sweeps, revolutions, helices, twists, Booleans,
Shell and captured failures: 68 cases in the initial matrix.
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

## Broad matrix

Start with a bounded scout, then select families for repeated measurements:

```sh
MAKESHIFT_BENCHMARK_SUITE=broad MAKESHIFT_BENCHMARK_DRAG=0 \
  MAKESHIFT_BENCHMARK_TIMEOUT_MS=30000 \
  node tests/wasm-performance/run.mjs .cache/wasm-performance/scout.json 0
node tests/wasm-performance/summarize.mjs .cache/wasm-performance/scout.json
MAKESHIFT_BENCHMARK_SUITE=broad MAKESHIFT_BENCHMARK_DRAG=0 \
  MAKESHIFT_BENCHMARK_CASE='^(helix|twist|shell)' \
  node tests/wasm-performance/run.mjs .cache/wasm-performance/sweeps.json 3
```

Zero repeats records the first observation only; it is a scout, not a warmed
median. A timeout kills that calculator and starts a fresh one for the next case.
Reports retain harness failures separately from normal kernel rejections and exit
unsuccessfully if a timeout or geometry mismatch occurs. The comparison command
checks canonical input hashes and refuses to mix first-call and warmed timings.
`MAKESHIFT_BENCHMARK_WEB` selects a preserved web directory, including its matching
asset inventory, so independently built runtimes can be compared without swapping files.

## Sampled CPU stacks

macOS sampling needs permission to inspect the benchmark's own child process:

```sh
node tests/wasm-performance/profile-native.mjs helix-18
node tests/wasm-performance/profile-native.mjs twist-cubic-draft
```

These save the exact request, resulting BRep when successful, phase trace and
`sample` call graph under `.cache/wasm-performance/profiles`. A sampling window may
cover only part of a long operation. Profiled wall times are not performance comparisons.

For named Chromium WASM stacks, configure the kernel with
`-DMAKESHIFT_WEB_PROFILING=ON`, rebuild it and rebuild the web assets. Then run:

```sh
node tests/wasm-performance/profile-browser.mjs helix-2
node tests/wasm-performance/profile-browser.mjs twist-cubic-draft
```

The Chrome CPU profiler attaches to the actual calculator worker and writes a
`.cpuprofile` readable by DevTools. Release optimization remains enabled. Profiling
retains function names while stripping unused DWARF custom sections; the pinned
linker otherwise crashes relocating those sections. Keep profiling artifacts
separate from ordinary timing comparisons and release assets.

## Hardware GPU surface experiment

`export-surface-batch.cpp` decomposes actual BRep spline supports through OCCT's
public Bézier conversion API. It preserves rational weights and records independent
double-precision D1 references, plus direct, cached serial and cached all-core native evaluator timings.
The WGSL implementation evaluates position and both derivatives in batches. Each
patch uses a local origin to reduce coordinate-rounding loss. It does not process
trimming, construct intersection curves, or accept application geometry.

The builder reads the configured native SDK path and uses C++20 with `-O3`:

```sh
node tests/wasm-performance/build-surface-batch.mjs
node tests/wasm-performance/run-surface-gpu.mjs \
  .cache/wasm-performance/profiles/helix-18.brep .cache/wasm-performance/gpu-helix
```

The runner uses full hidden Chromium (`channel: chromium`) because its headless
shell did not expose an adapter on the test Mac. It records adapter identity and
rejects software adapters. Playwright WebKit capability is reported independently;
absence there does not establish absence in shipping Safari. Developer timestamp
queries measure one separate compute pass. The repeated wall times include input
upload, dispatch, output copy, mapping and a CPU copy, with reusable buffers;
allocation and pipeline creation are separate. The CPU all-core samples include
thread creation/join and one adaptor cache per thread; a persistent pool could lower
that setup cost. Patch extraction and packing are
not included in those repeated dispatch times. Returning arrays through Playwright
and numerical comparison happen afterward. UV/patch queries are generated
procedurally on both CPU and GPU; an arbitrary adaptive query buffer would add
upload work that this regular-grid experiment does not measure.

This is a throughput and precision experiment. Independent queries are batched
artificially; OCCT currently asks for many of them serially inside adaptive searches.
Do not multiply the stage speedup by whole-operation time. Error counts against
1e-7 and 1e-3 mm expose why f32 output needs refinement before exact CAD decisions.

A second, deliberately experimental shader uses two f32 components per value:

```sh
MAKESHIFT_GPU_PRECISION=double-single node tests/wasm-performance/run-surface-gpu.mjs \
  .cache/wasm-performance/profiles/helix-18.brep .cache/wasm-performance/gpu-compensated
```

This is not a proven higher-precision backend. On the tested Metal adapter it failed
its elementary rounding probe: adding 16,777,216 and 1 returned a high/low sum of
16,777,216. The surface samples likewise retained nanometre-scale errors. This is
consistent with the [WGSL reassociation and fusion rules](https://www.w3.org/TR/2026/CRD-WGSL-20260921/#reassociation-and-fusion),
which allow operation reordering, and its [`fma` accuracy contract](https://www.w3.org/TR/2026/CRD-WGSL-20260921/#fma-builtin),
which does not require a single-rounding fused operation. The probe is runtime
evidence; attributing the particular generated instruction sequence would require
backend disassembly. Do not assume textbook compensated arithmetic remains exact
when translated into WGSL. Both shaders remain research-only.

## Candidate-pool experiment

`build-particle-heap.mjs` builds an isolated macOS library from the exact pinned
`Extrema_GenExtCS.cxx`, retaining its LGPL notices. During initial grid selection,
a stable heap replaces repeated scans of the 48-particle pool. Ties retain original
slot order, and only a decreased worst entry is updated. The source SDK is untouched.
`particle-heap-test.cpp` checks every selected slot against the original pool for
500,000 iterations, including ties and rejected nonfinite candidates.

The traced library is for confirming actual use, not measuring speed. The untraced
library can be passed through `MAKESHIFT_BENCHMARK_LIBRARY_DIR`; its hash is recorded.
The `control` variant recompiles the unchanged upstream source with the same
compiler options as `plain`, so timing it separates the heap change from differences
between the experimental compilation and the installed SDK. The builder records
both library hashes and the compiler/options in `provenance.json`.
The builder reuses the matching native SDK's compiled objects from its sibling
`build` directory and replaces only `Extrema_GenExtCS.cxx.o`. The original SDK is
never overwritten. The default native source/build layout is required. A copied
standalone SDK without its source and object files cannot run this experiment.
The child alone receives `DYLD_LIBRARY_PATH`; normal app processes are unaffected.
Simple symbol preloading did not replace this path on macOS, so a trace must
confirm actual calls before interpreting a timing result.

```sh
node tests/wasm-performance/build-particle-heap.mjs
MAKESHIFT_BENCHMARK_LIBRARY_DIR="$PWD/.cache/wasm-performance/particle-heap/plain" \
  MAKESHIFT_BENCHMARK_SUITE=broad MAKESHIFT_BENCHMARK_ENGINES=native-1 \
  MAKESHIFT_BENCHMARK_DRAG=0 node tests/wasm-performance/run.mjs \
  .cache/wasm-performance/heap.json 3
node tests/wasm-performance/verify-library.mjs .cache/wasm-performance/particle-heap/plain
```

`verify-library.mjs` compares complete JSON replies, including BRep, meshes and
signatures. Passing `-` as the library directory provides an unchanged baseline
control. It reports differences and exits unsuccessfully without weakening the
comparison. Two notched-cylinder Shell cases are not byte-for-byte repeatable even between
unchanged native processes; broad geometric summaries are a separate, less strict
check. The isolated library remains a research experiment; it is not installed
into the product SDK.

For a same-compiler optimization, save the original native executable before
rebuilding and compare complete results, including meshes and translated bounds:

```sh
node tests/wasm-performance/verify-results.mjs BEFORE_KERNEL AFTER_KERNEL
node tests/wasm-performance/verify-cancellation.mjs
```

The second command uses real browser controls to verify that invalid extrusion
input and Escape still interrupt pending work, clear the preview and allow the
next edit. These focused browser checks remain opt-in alongside the benchmark.

## Measured findings, 2026-10-21

Apple M2 Max, 12 logical CPU cores, Darwin 24.6.0, Node 24.15.0,
Chromium 151.0.7922.34 and Playwright WebKit 26.5. Builds finished before timing.
The repeated broad baseline contains 66 cases, each with a separate first call and
three warm observations. All four runtimes completed with matching geometry
summaries and the two expected kernel rejections. This establishes the checks
described above, not mathematical equivalence of arbitrary BReps across compilers.
The initial 68-case, first-call scout additionally exercised the 18-turn helix and
captured face deletion: the browsers exceeded its 30-second budget on both, and
native exceeded it on deletion. Those timeouts are retained in the scout report.

Representative baseline warm medians, in milliseconds:

| Operation | Native, 1 thread | Native, 12 threads | Chromium | WebKit |
| --- | ---: | ---: | ---: | ---: |
| Box creation | 3.3 | 3.6 | 15.9 | 26 |
| Two-turn helix | 1,306 | 493 | 3,360 | 3,935 |
| Cubic twist with draft | 2,045 | 1,944 | 3,444 | 4,929 |
| Shell on captured bent sweep | 1,412 | 1,126 | 2,425 | 3,837 |
| Captured fillet size search, 17 probes | 2,707 | 2,567 | 5,297 | 7,633 |

The sampled native stacks identify polynomial and spline evaluation
(`PLib::EvalPolynomial`, `NoDerivativeEvalPolynomial`, `BSplCLib::Bohm`) inside
intersection walking and distance minimization. For the two-turn helix, native
serial phase timing assigns about 489 ms to piece unions and 758 ms to volume
and self-interference validation; threading reduces both substantially. Cubic
twist/draft instead spends about 560 ms constructing sections and 636 ms in its
accuracy pass, which barely change with thread count. Validation is necessary;
turning it off would not be a valid acceleration.

The captured deletion follows healing, edge/face interference and extrema search.
Its sample contains many self hits in `math_PSOParticlesPool::GetWorstParticle`,
alongside spline evaluation and PSO. That motivated the stable-heap experiment.
The 12-second native sample windows do not cover every phase of the longest calls.
Chromium's sampled profiles additionally show substantial WASM/JavaScript
transitions, table lookups and stack saves around the JavaScript exception runtime.
That motivated the opt-in exception build; its results must be attributed to the
combined exception and unused-signal-conversion change.

### WASM exception experiment

Both 66-case browser comparisons passed canonical-input, repeated-outcome and
cross-build geometry-summary checks. Warm medians in milliseconds:

| Operation | Chromium default → experimental | WebKit default → experimental |
| --- | ---: | ---: |
| Two-turn helix | 3,360 → 1,534 | 3,935 → 1,550 |
| Cubic twist with draft | 3,444 → 2,260 | 4,929 → 2,375 |
| Shell on captured bent sweep | 2,425 → 1,527 | 3,837 → 1,655 |
| Captured fillet size search | 5,297 → 3,205 | 7,633 → 3,305 |

Summing the 66 per-case medians gives 36.04 → 18.49 seconds in Chromium and
57.12 → 19.29 seconds in WebKit. Those sums describe this case mix; they are not
application latency or an expected speedup for every drawing. Every observed
case median improved, but three repetitions are not a statistical confidence study.
Both builds use `-O3`. This experiment combines standardized WASM exceptions and
removal of unused OCCT signal conversion; it does not isolate their contributions.
In separate sampled worker profiles, the combined self-sample share of
WASM/JavaScript transition frames, table lookup and `stackSave` drops from about
23% to 1%. Those profiled calls are diagnostic evidence, not the timing comparison.
The default remains JavaScript exceptions. See [the build option](../../docs/web-build.md#opt-in-exception-and-profiling-builds).

Both builds passed the full existing web editing test in Chromium and WebKit.
The experiment also passed actual-pointer invalid-input/Escape cancellation and
subsequent recovery, plus OCCT/std-exception checks followed by valid operations in
the same worker. Physical iPad Safari and older browser versions remain untested.

### Native candidate-pool result

On captured face deletion, the installed SDK takes 52.48 seconds and the unchanged
source rebuilt with the experimental compiler options takes 52.56 seconds. The
heap takes 40.02 seconds: a 23.9% reduction against the rebuild control, using three
warm observations after a separate first call. All return the same rejection;
this makes a failed operation faster, not a previously invalid deletion valid.
The traced run recorded 361,140 heap constructions and 89,707,688 root updates.

The 66-case native comparison passes all geometry summaries with both thread
settings, but summed medians improve only 2.4% serially and 1.2% with all cores.
It is a targeted improvement. Complete direct replies match for 65 of 67 cases;
the other two are the notched-cylinder Shell cases that also differ between
unchanged baseline processes. Those full-result differences remain unresolved
and are not counted as strict equivalence. The 500,000-selection unit comparison
separately verifies the heap's ordering and tie behavior.

A balanced helix-union tree was also tested and removed: it did not improve serial
timing and its all-core improvement on the long helix was only about 9%.

### GPU surface-evaluation results

Full Chromium used the actual Apple M2 Max Metal adapter, with
`isFallbackAdapter: false`. The test inputs contain 108 Bézier patches from the
18-turn helix and 50 from the cubic twist/draft BRep. Timings below are milliseconds;
CPU columns use cached OCCT D1 evaluation (three warm observations), and GPU uses
five warm upload/dispatch/readback observations:

| Surface set | Queries | CPU, 1 thread | CPU, 12 threads | GPU, including transfers |
| --- | ---: | ---: | ---: | ---: |
| Helix | 1,024 | 0.171 | 0.326 | 0.600 |
| Helix | 16,384 | 0.950 | 0.528 | 0.500 |
| Helix | 262,144 | 13.654 | 2.861 | 4.100 |
| Cubic twist/draft | 1,024 | 0.534 | 0.560 | 0.500 |
| Cubic twist/draft | 16,384 | 6.160 | 1.403 | 0.800 |
| Cubic twist/draft | 262,144 | 94.743 | 14.053 | 3.700 |

The expensive large batch shows a 3.8× throughput gain over all-core CPU evaluation.
The large helix batch is slower on the GPU. This is why comparing only with
uncached, single-threaded OCCT would exaggerate the opportunity. CPU thread startup
and allocation are included; a persistent pool may improve that baseline further.
Extraction costs about 4.1 ms for the helix and 2.5 ms for twist/draft. Packing takes
0.9–1.3 ms and pipeline creation in these runs takes 1.4–1.6 ms; shader caching can
affect first-use cost. These setup costs are recorded separately from the table.

Cached CPU output agrees with direct OCCT evaluation to within 1.5e-13 in the
sampled components. GPU maximum position errors are 5.3 nm and 15.5 nm respectively:
small in everyday dimensions, but most samples exceed the 1e-7 mm comparison
threshold. No samples exceed 1e-3 mm or produce nonfinite values. The compensated
shader's failed arithmetic probe is documented above; it does not solve this gap.
Playwright WebKit reported no `navigator.gpu`, so this GPU path has no WebKit or
physical iPad runtime validation.

The surface-evaluation result motivated a real-operation follow-up:
[batched Twist candidates](CANDIDATES.md) now compares GPU search, a CPU spatial
index and unchanged execution, followed by OCCT refinement and validation.
The surface throughput above remains a subkernel result, not a whole-operation
speedup or an accepted GPU topology path.
