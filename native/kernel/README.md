# Exact solid calculator

Makeshift-owned C++ adapter using OCCT 7.9.3, pinned by `scripts/setup-kernel.mjs` to
`a016080bf6738d6aeae020badee4e888ad1540a5`. OCCT is dynamically linked; upstream
source is downloaded into the ignored cache, not copied into Makeshift source files.
Its upstream distribution includes `LICENSE_LGPL_21.txt` and
`OCCT_LGPL_EXCEPTION.txt`; retain these notices and corresponding source access
when packaging the runtime. This directory does not introduce an application
license decision or a binary distribution pipeline.

Makeshift applies one dated, reproducible adaptation in `scripts/setup-kernel.mjs`:
rounded offset edge pipes receive an explicit 1e-7 mm approximation tolerance
instead of OCCT's independent 1e-4 mm default. Re-run `npm run setup:kernel` after
updating; its SDK cache key includes this script. An external `OCCT_ROOT` must
contain the same adaptation to reproduce these Shell results. The source bundle
includes the pinned original archive and the setup script that produces the modified
source, under the existing OCCT license and exception. No shared SDK is patched.

JSON lines carry exact operands and current-operation inputs. The process retains
no document or feature history. Results contain exact serialized BRep, derived
triangles/outlines, geometric planar frames, and immediate operation correspondence.
The TypeScript document owner assigns IDs and accepts or discards the whole result.

Face/edge arrays pair IDs with the topology order of that exact serialized BRep.
Deserialization checks geometry signatures before accepting the association.
Signatures are a corruption/order guard, not a general topology-matching algorithm.
Boolean correspondence uses OCCT operation history; ambiguous splits/merges get
new IDs in the owner. Future semantic labels and migration policies are deferred.

## Interactive performance

The setup scripts build OCCT, the wrapper and PlaneGCS in **Release** (`-O3` with
Apple Clang in the inspected macOS build), not `-O0`. Keep that default for drag
performance. Symbols and optimization are independent; an `-O1 -g` developer
configuration is a build/debugging tradeoff, not an upgrade over this default.

The host runs one calculation at a time. Drag controllers retain only the latest
pending target. Fillet/face-offset supersession finishes the current native probe
but stops further feasibility probes for an obsolete target. Escape terminates
a cancellable calculation's stateless calculator (including immediate topology
deletion) and waits for its exit; the next edit
starts a fresh process. Accepted edits cannot be interrupted by that control.

General and Shell-validation Booleans, sweep self-interference checks, face deletion and meshing use OCCT's built-in
thread pool, using all detected logical processors by default.
`MAKESHIFT_KERNEL_THREADS=1 npm run dev` selects serial execution for comparisons; positive values are capped at the machine's logical
processor count. This does not parallelize document edits or every OCCT algorithm.
TBB is not required: the pinned
[OSD_Parallel implementation](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/OSD/OSD_Parallel.cxx#L176-L188)
selects OCCT threads when TBB is absent.

`MAKESHIFT_KERNEL_TIMING=1 npm run dev` prints parse, operand decode/validation,
calculation, presentation and output timings on stderr for ordinary solid
requests. Selection/projection and failures currently report total time plus the
completed phases. Deletion logs healing build/validation; Shell logs preparation,
offset, correspondence and individual wall-validation phases. Timings never enter
the JSON geometry response.
Sweeps additionally log helical piece construction/unions, loft construction and
section-accuracy retries, BRep/self-interference validation, and presentation's
meshing, properties and topology/JSON phases. Nested timings overlap; do not add
their totals to the containing request's phases.

After `npm test`, run `node tests/kernel-performance.mjs` for a small five-box
extrusion benchmark. An optional executable path compares another wrapper build
against the same installed OCCT. It reports milliseconds for 15 warm samples per
mode; results exclude renderer/input latency and are not a performance assertion.
On the development Mac, removing redundant overlap/distance work and enabling four
threads changed median new/auto/union round trips from 23.7/29.3/38.0 ms to
8.2/17.0/23.4 ms. Serial optimized results were 8.3/18.7/24.6 ms: avoiding work was
the larger improvement. This synthetic case does not establish the cause of a
founder-reported lag until the captured interaction is profiled.

The captured deletion/Shell benchmark is `node tests/kernel-calculation-performance.mjs`
after build and `npm test`, with the same optional executable argument. Run it alone:
it reports one bounded deletion attempt and three warm Shell samples per thread count.
On the development Mac (2026-09-17), exact analytic projection plus parallel validation
changed median open/closed -4 mm Shell on `shell-cylindrical-splines.json` from
488/560 ms to 184/203 ms at four threads (about 62%/64% lower latency). Optimized
one-thread medians were 207/225 ms; two threads gave 179/196 ms. These measurements
used the former four-thread default; the founder subsequently selected all detected
logical CPUs as the default. Identical tolerances and
validation checks remain; projection uses OCCT's exact equivalent surface with a
generic fallback, not an approximation.

The 12-face/28-edge captured deletion still exceeded 10 seconds at 1/2/4 threads.
Its timeout is a responsiveness/cancellation regression fixture, not a claim that
healing now succeeds. Preparation was about 34 ms; the unresolved cost is healing.

## Revolve and twisted Extrude benchmark

From a configured checkout, activate the repository's `.nvmrc` runtime, then run:

```sh
npx tsc -p tsconfig.test.json
MAKESHIFT_KERNEL_TIMING=1 node tests/kernel-sweep-performance.mjs
```

Optional arguments are executable path, case-name substring and warm sample count
(default three, after one discarded warmup). An empty executable argument selects
the default build. Run alone; compare the same requests against a saved baseline
Release executable linked to the same OCCT SDK. Output includes sample times,
volume, topology/triangle counts, BRep size and SHA-256. These are native round trips
including mesh/JSON output, not pointer-to-screen latency or a performance assertion.

On the development Mac, 2026-09-21, with default thread count and timing enabled:

| Representative case | Before median | After median |
| --- | ---: | ---: |
| Ordinary 360° revolution | 6.0 ms | 5.4 ms |
| Two-turn triangular helix | 1053 ms | 567 ms |
| 18-turn triangular helix | 13763 ms | 8706 ms |
| 90° square twist | 722 ms | 142 ms |
| 450° square twist | 5802 ms | 971 ms |
| 90° square twist with draft | 686 ms | 187 ms |
| 90° cubic twist | 184 ms | 76 ms |
| 90° cubic twist with draft | 2902 ms | 1747 ms |
| 18-turn helix unioned with a cylinder | 15511 ms | 9999 ms |

These are three warm samples per case; the complete matrix's reported BRep hashes,
volumes, topology counts and triangle counts match exactly before/after. Profiles
and stock are synthetic, including an 18-turn, 1 mm-pitch triangular thread; this
does not establish latency on every captured model or fix the earlier invalid union.

The expensive twist stage was sampled boundary-distance verification (about 5–5.6 s
for the 450° square), while the successful loft build took about 6 ms. Reusing
initialized trimmed-face extrema removes repeated projection setup, with the
original shape-distance fallback. Every station and tolerance remains. Sweep
self-interference now uses the configured thread pool; an unchanged no-hole twist
no longer receives the same check twice. Hole Booleans still receive a final check.
The [pinned-source analysis](../../docs/freecad/kernel-topology.md#sweep-validation-performance-2026-09-21)
records the API evidence and limitations.

The dedicated native distance comparison checks 62 samples around faces, edges,
corners, interior points, trimmed holes, placed faces and spline surfaces:

```sh
cmake -S native/kernel -B .build/kernel -DMAKESHIFT_KERNEL_TESTS=ON
cmake --build .build/kernel --config Release --parallel 2
ctest --test-dir .build/kernel -C Release --output-on-failure
```

Remaining targets: helical self-interference and repeated half-turn unions;
cubic draft's repeated full-solid construction to obtain section contours; and
topology/property output on dense results. Smooth dragging is still unresolved.
A lightweight swept-mesh display during motion, followed by exact construction
and validation after a pause and before acceptance, is a proposed next experiment.
It is not implemented or an approved change to accepted geometry/Undo semantics.

### Circular twist (2026-10-03)

The sweep benchmark also includes `circle-centered`, `circle-offset` and
`rounded-square-offset`: radius 10 mm, depth 20 mm, twist 90°, and an axis
displaced 5 mm for the latter two. The rounded square uses exact 9 mm corner
fillets with 2 mm straight joins. On the development Mac, the saved baseline
off-center circle took 35,008 ms (one warm sample after warmup); the revised
circle took 2,882 ms median of three warm samples (2,868–2,886 ms). The centered
case now takes 4.1 ms median and retains ordinary cylinder topology. Baseline
rounded-square timing was 3,143 ms (one warm sample after warmup).

Profiling places the circle's delay in span-based volume integration, called
during solid extraction and presentation, rather than loft construction,
interference checks or meshing. Keeping circular seams fixed alone took about
32 seconds. Exact rational sections eliminate the expensive full-circle
polynomial conic fit: the final off-center result retains three faces/three
edges, with 1,000 display triangles versus 3,894 before. Integration still costs
about 1.43 seconds per call on this origin-centered fixture; this improvement
does not make every preview instantaneous. `volume bounds`/`integrate` timings
distinguish bounds optimization from integration. See the pinned-source analysis
in [kernel/topology](../../docs/freecad/kernel-topology.md#circular-twist-representation-2026-10-03).

## Periodic subtraction preparation

A failed subtraction with invalid cylindrical result faces gets one bounded
preparation path: split the implicated source cylinders on a deep copy, preserve
copy/division/Boolean correspondence, then rebuild the cut. Source precision,
adaptively integrated volume, new boundary curve/surface agreement and final BRep
validity remain required. This does not enlarge fuzzy tolerance or modify the
accepted operand. The result may retain extra cylindrical face subdivisions.
`tests/body-reverse-hole.test.ts` uses the captured tangent half-hole and exact
material probes; `node tests/reverse-hole-ui.mjs` exercises ordinary input. Set
`MAKESHIFT_TEST_BROWSER=webkit` or `electron` for the other supported test runtimes.
