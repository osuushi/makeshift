# Exact geometry performance investigation

Start with [the results overview](results-overview.md) for the source-pinned
combined application measurements, kernel findings and remaining work.
The [baseline provenance correction](baseline-provenance-review.md) supersedes
early attribution of the startup prebuilt binary to the starting source commit.

## Authority and scope

Follow [the user’s brief](../../planning/geometry-performance-research-brief.md).
Research branch: `research/geometry-performance`. Starting application commit:
`7861122fb791c71692d7b48a70bfcb3a381fc95a`.
Pinned OCCT: `a016080bf6738d6aeae020badee4e888ad1540a5` (7.9.3), including the
existing rounded-offset precision adaptation. No preview, mesh approximation,
GPU, or weakened validation work is authorized by this investigation.

## Resource ownership

All benchmarks, builds, and other heavy jobs must hold the exclusive lock
`/tmp/makeshift-geometry-compute.lock`. Main agent owns measurements. Research
agents inspect source and write separate notes, without heavy computation.
Example: `flock /tmp/makeshift-geometry-compute.lock COMMAND ...`.

## Reproduction

Run from the repository root with Node 24.15.0 selected by `.nvmrc` and the
adapted Release kernel built with the repository setup script. The macOS-specific
NVM path in AGENTS.md is absent on this Linux machine. The existing environment
activation script `/workspace/.tools/activate-makeshift.sh` selects the exact
pinned Node and local CMake; no default Node runtime was used.

```sh
source /workspace/.tools/activate-makeshift.sh
flock /tmp/makeshift-geometry-compute.lock node tests/geometry-performance/run.mjs \
  docs/research/geometry-performance/results/example.jsonl \
  'shell-cylindrical|boolean|extrude' 20 \
  'serial:.build/kernel/bin/makeshift-kernel:1,pool4:.build/kernel/bin/makeshift-kernel:4'
node tests/geometry-performance/summarize.mjs \
  docs/research/geometry-performance/results/example.jsonl \
  docs/research/geometry-performance/results/example-summary.json
```

Use a new output filename on every run; the runner appends durable samples.
One warmup per case/configuration is recorded and excluded from summary statistics.
Measured configurations run sequentially in deterministically shuffled blocks.
Native processes remain alive between samples; startup is included only in the
first request of a new process, generally a warmup. Input geometry is prepared
once using the first configuration and reused unchanged for every alternative.
Timing includes JSON round-trip and output parsing. Nested native phase timings
are recorded separately and overlap; never add nested totals to parent totals.
Each sample includes cgroup CPU statistics before and after the request.

The summary reports paired median speedups and deterministic bootstrap intervals
(10,000 resamples of complete paired blocks). These describe observed repeatability
on this instance, not hardware universality or a guaranteed population interval
under arbitrary correlated host contention. Increase independent blocks/rerun
when drift or anomalies remain. The first label encountered is the comparison
reference; check labels when reading summaries.

Geometry comparison covers result count, volumes, centers, bounds, face/edge counts,
signatures and predecessor correspondence, with relative numeric tolerance 1e-7.
Ordered comparison is retained separately. Repeated baseline shell Booleans change
entity enumeration and the orientation of generated edges' first face use, even
in serial mode. The multiset comparison retains face orientation and the pairing
of signatures with predecessor IDs, but excludes edge-use orientation. This is
explicitly a different check; ordered differences are not silently discarded.
It supplements rather than replaces native BRep validity and the operation’s strict
acceptance checks. It does not certify arbitrary geometry or prove identical mesh
output. Failed cases remain failures and are reported separately from speedups.

## Environment

- Linux x86_64, GCC Release `-O3 -DNDEBUG`; wrapper C++20, OCCT C++17.
- AMD EPYC 9V74 virtual machine, 5 visible logical CPUs and affinity CPUs 0–4.
- Cgroup CPU quota `400000 100000`: four CPU equivalents, not a guarantee of
  consistent single-core speed. Memory limit 16 GiB.
- OCCT built without TBB; built-in OSD pool is available.
- Existing SDK libraries were provisioned and receipt-verified. The application
  executable requires separate source/build provenance; an SDK receipt does not
  certify that executable's revision.
- `/tmp/makeshift-kernel-baseline` is the preserved **startup prebuilt artifact**.
  A later combined output check shows it omits starting-source chamfer metadata,
  so it cannot be attributed to commit 7861122. A fresh detached checkout/build
  of that exact commit is now saved as `/tmp/makeshift-kernel-source-baseline`.

## Investigation log

### Initial source map and smoke tests

- `main.cpp`: decode checks BRep validity and topology signatures; `volume()` uses
  strict span-based integration for every nonplanar shape. Presentation integrates
  volume again, then separately integrates center of mass.
- `geometry.cpp`: implicit target selection uses a Common Boolean plus volume for
  auto/subtract/intersect, then performs the final Cut/Common. Union uses shape
  distance after bounding-box filtering. Explicit non-auto targets bypass detection.
- `booleans.cpp`: lazy operations already avoid eager constructor rebuilds;
  parallel and non-destructive flags are already enabled. Multi-body operations
  and multi-profile sweeps fold pairwise. Output is validated at several levels.
- `shell.cpp`: preparation, offset construction, face correspondence, and wall
  verification are separately timed. Closed shells require an additional Boolean.
- `offset-geometry.cpp`: exact BRep check and self-interference checker are serial.
- `shell-validation.cpp`: whole-skin separation uses the eager serial distance
  constructor. Its parallel option must be set before performing, not afterwards.

Initial legacy smoke benchmark: captured face deletion rejected after 52.8 s at
one thread and 28.3 s at two. It is outside the first benchmark matrix; its
rejection time must not be mistaken for a successful modeling operation.
The legacy run was terminated during later samples to focus the requested paths;
partial observations are exploratory, not sufficient evidence of a speedup.

New smoke matrix preserves raw measurements in `results/smoke.jsonl`. Preliminary
serial observations: spline shell roughly 300 ms; perforated-body union roughly
550 ms; implicit subtraction roughly 150 ms. The bent-sweep closed shell rejects
boundary validation. Larger samples and phase analysis follow.

### Thread-count baseline: 20 paired blocks

`results/thread-baseline.jsonl` and `thread-baseline-summary.json` cover 14 cases
at 1/2/4 threads, each with 20 measured samples plus a warmup. Source and binaries
remain unchanged throughout. Example median times (serial → four threads):

| Case | Serial ms | Four threads ms | Paired median speedup |
| --- | ---: | ---: | ---: |
| Perforated extrusion | 128.1 | 98.3 | 1.33× |
| Perforated Cut | 140.3 | 116.0 | 1.21× |
| Perforated Fuse | 546.0 | 512.4 | 1.06× |
| Implicit subtract extrusion | 151.2 | 127.0 | 1.22× |
| Spline cylindrical shell, open | 290.8 | 254.5 | 1.15× |
| Notched cylinder shell, closed | 633.4 | 600.6 | 1.03× |

The complete summaries contain variability and paired bootstrap intervals.
These do not support a universal serial/default policy. Visible logical CPUs are
five, so the four-core quota mismatch is modest here. No automatic thread-policy
change has been made. Generated shell face order and some edge-use orientations
vary even within the serial baseline; orientation-independent geometry/signature
and predecessor multisets match. Existing strict shell checks remain active.

Phase observations: perforated Fuse construction itself is about 22 ms, while
presentation topology/metadata costs roughly 400 ms; investigate thickness rays
and continuity prep rather than blaming the Boolean alone. Offset-circle twist
spends about 2.45 s per strict volume integration and repeats it during extraction
and presentation; its successful loft/accuracy stage is tens of milliseconds.

### First candidates in progress

- Shell parallel candidate enables exact BRepCheck, self-interference, and skin
  distance CPU APIs before execution. All tolerance/predicate checks are retained.
  Preserved executable: `/tmp/makeshift-kernel-shell-parallel`.
- Volume reuse candidate adds an optional exact scalar to a final Result, supplied
  only after `solids()` integrates the same final immutable shape. Presentation
  reuses it; other construction routes fall back to the existing integration.
  Triangulation changes do not affect this exact integration. No cross-request or
  pointer-key cache is introduced; center-of-mass integration stays unchanged.

The provisioned application objects required a complete incremental rebuild on
the first build invocation. The compute lock kept this compilation outside all
timed runs. Record successful candidate tests before calling either ready.

### Shell parallel measurements: 20 paired blocks

`results/shell-parallel.jsonl` compares the startup prebuilt artifact and the
rebuilt parallel-only candidate at four threads. A later provenance check finds
the startup artifact is stale relative to the starting source (missing chamfer
metadata). These early timings therefore do not isolate the parallel change
against source-pinned 7861122; retain them as artifact observations pending a
fresh-source retest. Five successful captured/synthetic shell choices and
one existing rejection are included, each with 20 paired measured samples.

| Case | Baseline ms | Parallel ms | Paired speedup, bootstrap 95% |
| --- | ---: | ---: | --- |
| Cylindrical spline, closed | 271.4 | 219.0 | 1.23× [1.19, 1.27] |
| Cylindrical spline, open | 252.0 | 216.9 | 1.18× [1.12, 1.22] |
| Notched cylinder, closed | 599.4 | 501.2 | 1.19× [1.17, 1.22] |
| Notched cylinder, captured opening | 543.9 | 459.7 | 1.18× [1.16, 1.20] |
| Bent sweep, captured openings | 1090.6 | 848.2 | 1.28× [1.26, 1.33] |

The bent sweep’s closed choice still rejects with the same boundary error. Its
rejection-time improvement is kept separate from successful geometry speedups.
All geometry/predecessor multisets match; original ordered differences in the
closed spline/notched examples persist. Bent/open spline ordered results match.
The bent wall’s strict validity phase drops from about 400 ms to 200 ms and skin
separation from about 88 ms to 44 ms in representative phase records. No checks
were removed. Relevant regression suite is queued after the next experiment.

### Exact final-volume reuse: 20 paired blocks

`results/volume-reuse.jsonl` compares the parallel-only binary against the same
binary plus final scalar reuse. Offset-circle twist median: 4886.3 → 2513.1 ms;
paired speedup 1.93× [1.90, 1.99]. Ordered geometry/predecessor summaries match.
Perforated extrusion showed only a noisy 1.02× [0.99, 1.06]; do not claim a reliable
gain there. Perforated Cut showed 1.03× [1.00, 1.06], a small ancillary benefit.
No tolerance, integration reference, or geometry construction changed.

The rebuilt parallel+volume binary passed all 15 targeted compiled test files:
body Boolean, seven face-offset files, five Shell files, symmetric extrusion and
tagged-group Boolean continuity (see actual file list in `results/regression-1.log`).
Compilation via `tsc -p tsconfig.test.json` preceded the test run. Tests ran serially
at four kernel threads under the compute lock; elapsed 78.7 s. This is native/model
regression coverage, not manual pointer/keyboard acceptance or WebAssembly proof.

### Boolean kernel pilot: 8 paired blocks

Standalone `tests/geometry-performance/boolean-kernel.cpp` bypasses application
presentation and measures OCCT Boolean building itself. Six analytic layouts
(dense/sparse/oblique, 4/16 tools), OBB on/off and history on/off are interleaved.
`results/boolean-kernel-pilot.jsonl` retains 1080 records including warmups.
All measured results pass BRep validity, volume, solid-count and 252-point occupancy
comparison to the corresponding sequential baseline. This does not establish
application entity-history equivalence or arbitrary geometry correctness.

At 16 tools, history enabled and OBB disabled, batched Fuse/Cut speedups were
3.67×/2.85× on dense layout, 2.54×/2.07× on oblique layout, and 10.08×/4.13× on
disjoint sparse layout. Absolute dense Fuse times: 71.3 → 19.2 ms. Disjoint sparse
speedups start from small absolute costs: 16.6 → 1.6 ms for Fuse.
Reusing a pair’s PaveFiller for Common+Cut showed roughly 1.34–1.47× on these
simple pairs. Larger independent retests and application history validation are
required before integration. OBB/history configuration results remain in the full
summary; do not assume their effects generalize or disable required histories.

### Presentation reuse: 30 paired blocks

The ray-only pilot (`results/ray-reuse.jsonl`, 20 blocks) did not establish a
reliable union improvement: about 1.02× [0.99, 1.04]. Retain this negative result.
Adding lazy exact UV classification/point reuse to the same immutable presentation
context does establish gains (`results/uv-reuse.jsonl`, 30 paired blocks):

| Case | Candidate median ms | Paired speedup, bootstrap 95% |
| --- | ---: | --- |
| Perforated Fuse | 453.4 | 1.133× [1.117, 1.144] |
| Extrusion, implicit union | 425.0 | 1.178× [1.161, 1.186] |
| Extrusion, explicit union | 414.0 | 1.169× [1.146, 1.181] |

Ordinary perforated extrusion/Cut changes remain small or uncertain. The cache
retains the original UV grid, classification tolerances, ray ranges, blocker/tie
rules and candidate order. It stores only exact IN eligibility and surface point;
reverse probes copy points before translation. Keys include orientation/location.
No approximate preview or geometry change is involved.

`results/uv-full-output.json` compares all metadata and displayed coordinates on
13 extrusion/Boolean cases, with baseline repeat checks: all matched in original
order. Native thickness assertions passed, including tiny reference reverse
sampling, repeated shared-context queries, translated same-topology instances and
reversed source orientation (`results/offset-thickness-regression.log`). The same
15 model/native regression files passed again, zero failures, 78.4 s, after `tsc`
(`results/regression-uv.log`). Manual UI and WebAssembly remain untested.

### Volume axis sensitivity: 30 confirmation blocks

`results/volume-axis-summary.json` summarizes unchanged OCCT integration on fixed
exported BReps, with 30 samples per reference axis/method. The offset-circle twist
has a rational U-degree-2/V-degree-8 side surface. Its Z-plane integration median
is 2518 ms; X/Y medians are 2.05/1.69 ms. All repeated masses are deterministic.
For this analytic swept-circle volume, X/Y also agree more closely with πr²h.
This is an integration-conditioning opportunity, not a safe general axis patch.

The bent shell ordinary adaptive integral differs from the span GK result by
0.163 mm³ despite a tiny reported error. Notched-shell GK axes differ by up to
2.61e-5 mm³; some reported GK errors exceed requested 1e-10. Therefore replacing
GK with ordinary adaptive integration or universally choosing another axis is
not validated. Current application checks only finite/nonnegative GK status,
not the requested error bound: a pre-existing accuracy limitation to investigate.

### Isolated kernel fixed-V experiment

`patches/bspline-fixed-v-cache.patch` modifies pinned OCCT BSplSLib_Cache D1 to
reuse first-stage V polynomial coefficients within a stable span/parameter.
Arithmetic order is preserved. Cache storage is thread-local; unique generation
keys change on construction/BuildCache to prevent stale reuse. The class is
noncopyable upstream. TKMath and TKG3d were rebuilt together in the ignored kernel
build; experimental libraries are isolated under
`.cache/geometry-performance/bspline-cache/lib`. Installed production SDK is
unchanged. Public-header D1 harnesses use separately linked RPATH executables.

Circle and bent-shell spline fixtures produced 29,655 and 28,701 D1 evaluations
per executable across grids, spans, fixed/alternating V, reversed/located faces
and four shared-adaptor readers within warmed spans: every digest matched exactly,
no reader failures. Twenty synthetic spline/Bezier faces add 572,238 evaluations
per executable, all bit-identical, covering rational/non-rational, equal/unequal
degrees, repeated knots and periodic supports. The notched shell has no direct
spline/Bezier faces and gives no D1 coverage.

`results/fixed-v-paired-30-summary.json` confirms Z-axis integration gains over
30 randomized paired blocks: circle 1.506× [1.481, 1.541], candidate 1621 ms;
bent shell 1.217× [1.193, 1.236], candidate 52.5 ms. All 30 mass/error bit patterns
match each baseline. Notched gain is uncertain: 1.009× [1.000, 1.036].
The initial runner failed because this sandbox disallows synchronous spawning;
the metadata-only failed run is retained. Awaited asynchronous invocations remain
strictly serial and work normally.

`results/fixed-v-application-summary.json` compares unchanged UV-reuse application
objects relinked with either library pair, 20 blocks. Circle request 1.519×
[1.482, 1.546], candidate 1646 ms; bent-shell request only 1.018× [1.006, 1.032];
notched request 0.994× [0.978, 1.016], no reliable change. Geometry/predecessor
multisets match; original notched face enumeration variability persists.
All 16 regression files passed at four threads, 83.3 s, including circle twist
(`results/regression-fixed-v.log`). The research-only `select-kernel.mjs` preload
hook selects an immutable test executable without editing the SDK or application.

Counter-only preload traces separate cause from elapsed time: Z performs
22,242,432 spline D1 calls across warmup and one measured integration; X performs
14,688. Fixed-V reuse leaves the D1 count unchanged but cuts degree-8 first-stage
polynomial calls from 22,242,432 to 59,972. These traces include fixture reading
and validity preparation; instrumented times are not benchmark evidence.
See volume research for lifecycle, ABI and licensing implications. No fork has
been integrated into the application SDK or build recipe.

### Redundant extrusion construction: 40 paired blocks

Committed plain symmetric extrusion builds one centered exact prism, replacing
two half prisms plus Fuse. Signed travel and the existing half-depth zero-draft
threshold remain intact; draft/twist continue through their original construction.
Perforated request median 263.3 → 99.8 ms, 2.650× [2.574, 2.700]; box 30.7 →
4.95 ms, 6.254× [6.175, 6.432] (`results/construction-reuse-summary.json`).
Calculation and metadata costs both fall because artificial midpoint side seams
are absent: perforated faces 60 → 31; box faces 10 → 6. Topology counts are
deliberately different, so the usual identity-style outcome comparison reports
a mismatch; it was not relaxed to declare equivalence.

`results/symmetric-material-summary.json` records 20 material comparisons across
both signs, holes, zero/below-threshold draft, and translated XZ placements.
All pass exact-method BRep checks, same solid count, bounds/volume, warning-free
no-fuzzy two-way Cuts (zero difference mass), and 686 occupancy samples each.
These are numerical/topological checks, not a formal equality certificate.

Committed implicit Intersect also retains its already constructed Common and
mapped history: 46.7 → 37.2 ms, 1.251× [1.233, 1.298]. Explicit Intersect control
is unchanged within noise: 0.993× [0.974, 1.006]. Full ordered native metadata
matches on both routes. Five regression files passed, including signed/drafted/
twisted symmetric edits, Boolean eligibility, projected cylindrical operations,
tags, and a new implicit multi-target/explicit comparison with Undo/Redo/Open
(`results/regression-construction.log`, 11.2 s).

### Projection setup reuse: negative result

`patches/application-projector-reuse.patch` reuses a request-local surface extrema
setup across checkParallel samples. Source audit found the surface-only Init
default uses a different tolerance from the old point/surface constructor;
the prototype explicitly retained Precision::Confusion and all sampling/checks.
Across six shell choices and 30 paired blocks, no reliable gain appeared; every
95% speedup interval crossed 1 (`results/projector-reuse-summary.json`). The
prototype is saved but reverted from application source. No broader face-offset
performance conclusion follows from this shell-only test.

### Boolean preprocessing reuse: 40 paired blocks

Committed request-local BooleanProbe retains a positive Common's PaveFiller for
the matching immutable pair's subsequent Cut. It keeps the original tolerance,
parallelism, non-destructive setting, origin mapping and periodic repair route;
repaired geometry receives fresh preprocessing. Explicit Auto targets without a
positive probe fall back to the ordinary path. Growing union operands cannot
reuse a filler for an earlier pair.

Implicit Auto improved 1.045× [1.014, 1.072], candidate 115.9 ms; implicit
Subtract improved 1.055× [1.035, 1.083], candidate 116.8 ms. Explicit Auto's
1.029× [0.999, 1.049] is uncertain. Explicit Subtract and both Intersect controls
show no reliable change (`results/pave-reuse-summary.json`). All thirteen original
ordered full native outputs matched, including metadata and meshes. Six model
regression files passed in 22.1 s; the added explicit-Auto/disjoint-target test
passed after recompiling tests. All six new cubic Auto/Subtract/Intersect routes
also matched ordered output (`results/pave-cubic-full-output.json`). Retention
memory for many positive target bodies still needs measurement.

### Boolean batching confirmation: 40 paired blocks

The larger standalone kernel run preserves validity, volumes, solid counts and
252 occupancy probes in all measured configurations. With sixteen dense tools,
batch Fuse improved 3.722× [3.685, 3.782], candidate 19.7 ms; batch Cut improved
2.843× [2.815, 2.896], candidate 18.8 ms. Sixteen oblique tools improved 2.562×
for Fuse and 2.039× for Cut. Sparse batches have larger relative gains but small
absolute costs. Four-tool Common/Cut preprocessing reuse improved 1.312–1.437×.
See `results/boolean-kernel-confirmation-summary.json` and its raw JSONL.

This remains a kernel experiment, not an adopted application batching policy:
material probes do not prove equivalent history, intermediate tolerance policy,
or every downstream topology expectation. OBB/history switches were controls,
not a justification to disable correspondence or enable OBB universally.

### Isolated fork reproduction

`tests/geometry-performance/build-fixed-v.sh --relink-app` successfully reproduced
the isolated TKMath/TKG3d build and latest application relink. The script owns the
shared compute lock, verifies the pinned recipe and normalized original two-file
hashes, and restores entry source bytes/mtimes. It does not install into the SDK.
Experimental build objects remain experimental; the untouched SDK is the baseline.
See `results/fixed-v-reproduction-confirmed.log`. The preceding failed log is
retained: nested locking and editing a running shell script were corrected before
the successful run. Do not wrap this script in another flock or edit it while it
is executing. The relink helper passed strict Pyright checks.

### Tangent face-chain reuse: 40 paired blocks

Committed request-local adjacency/ordered-continuity reuse improved perforated
open Shell 1.035× [1.009, 1.050] and cubic explicit Auto 1.030× [1.006, 1.061].
Most other cases remain within noise; do not describe this as a broad measured
speedup (`results/face-chain-reuse-summary.json`). Exact full output matched
every case with a stable baseline repeat; closed-shell baseline enumeration and
thickness tie variability remain explicit. A native legacy-algorithm comparison
passed 159 exact ordered face comparisons, including seam ancestry, fillets,
reversed/located/shared-TShape instances, duplicate/unknown seeds and nonmanifold
ancestry. Ten model test files passed in two suites (35.8 s and 34.3 s).

The first standalone compile lacked this environment's Boost header path; the
corrected native parity run passed. See the confirmed log. This change removes
repeated global edge scans without changing traversal order or assuming continuity
symmetry. The continuity cache is serial and local to unchanged geometry.

### Many-target preprocessing: memory and timing confirmation

Three-block pilots cover cubic/perforated shapes, 1/4/16 independent overlapping
bodies, implicit Subtract and explicit Auto, with an additional disjoint control.
Twenty fresh-process paired blocks confirm implicit Subtract at 1/16 targets.
All saved representative full native replies match, including ordered history
and display metadata; only the BREP byte encoding is excluded. There is no
baseline-repeat evidence for each fresh representative, so this is not a proof
of deterministic output over every possible input.

Cubic single-target improved 1.173× [1.117, 1.190], candidate 67.2 ms; sixteen
targets improved 1.326× [1.293, 1.346], candidate 639 ms. Perforated gains were
uncertain at one target and absent at sixteen (0.997× [0.972, 1.026]). These are
serial-thread fresh-process requests including remaining startup, not the warmed
four-thread timings above. Candidate sixteen-target cubic HWM median is 43.69 MiB;
paired increase is 14.29 MiB [13.89, 14.49]. Perforated sixteen-target HWM is
88.49 MiB, paired increase 1.44 MiB [0.84, 2.05]. Retained preprocessing therefore
has a real workload-dependent memory cost; larger target counts need a policy.
See `results/pave-multitarget-confirmation-summary.json` and
`results/pave-multitarget-memory-summary.json`. Snapshots exclude fixture setup,
but HWM includes native startup and the whole request, not a phase-specific peak.

### Reference-plane and translation accuracy

The analytical open-face diagnostic confirms pinned GK mirrors the supplied
plane offset: a +Z face with area 15 at height 4 and plane origin 2 returns flux
90 instead of geometric 30; height 127/origin 125 returns 3780 instead of 30.
Closed-solid cancellation conceals this convention. At large translations,
mirroring the supplied plane improves some closed-solid conditioning. It is
insufficient for a thin box: a located 1e-4 mm thick box at Z=3e6 still has
1.70e-6 relative mass error while the estimate is 1.40e-11. This is an accuracy
counterexample, not a faster accepted algorithm. The three-sample analytic
primitive run is retained in `results/quadrature-primitives.jsonl`; its elapsed
times are observations rather than paired speedup evidence. See
[the translation analysis](quadrature-translation-research.md).

### Unchanged shell validation reuse: 40 paired blocks

The candidate removes two repeat validations of geometry already validated by
prepare(forceCopy=true) or by canonicalization after modifier/SameParameter.
Every original predicate remains, and every check following actual mutation
remains. Source audit includes read-only recognition, non-destructive equivalence
Booleans and ArgumentAnalyzer's explicit non-destructive self-intersection path.

Successful cases improved: cylindrical closed 1.226× [1.202, 1.251], open 1.206×
[1.175, 1.235]; notched closed 1.125× [1.109, 1.137], captured 1.138× [1.118,
1.162]; perforated closed 1.063× [1.040, 1.081], open 1.046× [1.015, 1.080];
bent captured 1.055× [1.049, 1.074]. The invalid bent closed case still returns
the same boundary rejection; its timing is not successful Shell performance.
All sample geometry/predecessor multisets match, with baseline enumeration/tie
variability still explicit (`results/shell-validation-reuse-summary.json`).

Five Shell test files and captured Erode passed. An adjacent special Erode suite
passed 16/17 cases in both pre-change and candidate executables. The failing
sphere-plane-fillet reports "Erosion left an open or unowned surface" in both,
and the original investigation baseline reproduces it too. Preserve this
pre-existing limitation rather than treating the full regression suite as green.
The first file-level reporter hid the underlying assertion; TAP without test
isolation captured the identical named failure. No Erode approximation work
was performed as part of this investigation.

### Mass-only recentering: accuracy experiment

Fourteen primitive source encoding/location/orientation checks remain unchanged
after the value-only placement experiments. A locally defined thin box moved to
Z=3e6 improves mirrored Z-plane actual mass error from 1.70e-6 to 4.44e-12 when
root placement is removed or the value copy is recentered. A nested far-child
location requires global recentering; removing only the root location misses it.
Intrinsic world-coordinate supports retain about 1.7e-6 discrepancy from nominal
dimensions in every variant. That control can contain construction roundoff,
so it is not independently an integration-error certificate. Application
integration is not adopted. A closed-solid-only application prototype was tested
in thirty randomized paired blocks: twisted circle 1.029× (95% bootstrap interval
1.020–1.040), cubic implicit Subtract 1.000× (0.980–1.059), notched Shell 1.004×
(0.967–1.015), and bent captured Shell 0.996× (0.985–1.013). All summary geometry
checks matched. This does not justify broad application adoption for speed;
the production prototype was reverted and both prototype patches retained.
Results: `results/mass-recenter-solids-confirmation.jsonl` and
`results/mass-recenter-solids-confirmation-summary.json`.
Timings in `results/quadrature-recenter-confirmed.jsonl`
are observations, not randomized paired speedup measurements.

### Twisted extrusion global flux axis

The application candidate passes a transverse global axis
hint for unmodified twisted extrusion solids (New and neutral Union/Auto).
Boolean-modified results, Common eligibility volumes, ordinary prism and normal
extrusion retain the existing policy. Only `TopAbs_SOLID` accepts the hint, and
the previous fallback axes remain. GK, spline span subdivision, epsilon 1e-10,
and validation predicates are unchanged. A single global flux axis integrates
the same closed-solid scalar volume; independent per-face axes would not.

Forty randomized paired blocks confirm the circle offset/twist request at
43.18× (95% paired bootstrap interval 42.29–44.09), median 2503→58.06 ms.
Neutral Auto confirms 43.34× (42.80–44.28), median 2515→57.53 ms. Do not
generalize this pathological fixture's factor to arbitrary extrusions.
Thirty-three named regression tests passed in six files, and all 24 additional
orientation/sign/angle/symmetric/neutral Auto/draft/polygon fixtures match the
baseline's full ordered metadata at 1e-9 and volumes at 1e-10. Only BRep text
contents are excluded from the metadata comparison, but a separate exact text
check confirms all 24 baseline-repeat and baseline/candidate BRep encodings
identical. Largest relative volume delta is 5.10e-11. Raw full replies and actual
public GK plane arguments/errors/flags are retained in
`results/twist-volume-axis-variants.jsonl`; the preload shim is correctness-only.
Ideal area-times-travel values are diagnostic, not certified volumes of fitted
surfaces. The forty-block randomized comparison runs without the shim:
`results/twist-volume-axis-confirmation{,-summary}` (JSONL/JSON). The unchanged
perforated extrusion control was 0.975× (0.956–0.998); cubic Subtract 0.967×
(0.932–1.018). A 120-block control-only retest is running to investigate the
small slowdown instead of attributing it to the hint without evidence. That
retest finds perforated 0.993× (0.981–1.009), compatible with no change; cubic
Subtract 0.976× (0.963–0.996), a small measured executable regression that remains
to be localized. Raw results and summaries are
`results/twist-volume-axis-controls-retest.jsonl` / `-summary.json`.
See [source and numerical safety review](volume-axis-review.md).
The fixed exact-BRep translation diagnostic subsequently completed: analytic
invariant circle/cylinder meets actual relative 1e-10 for all 36 evaluations;
fitted-circle X translation discrepancy is ≤3.64e-12, with unknown independent
fitted volume. Y/Z diagnostics expose existing conditioning/status limitations.
Both original BReps remain exactly unchanged. Small-volume/slender/perforated
and broader fitted-sweep cases remain follow-up work.

## Pending experiments

### Incremental fixed-V fork after axis conditioning

Relinking the exact 7811ec5 application objects against the isolated matching
TKMath/TKG3d pair (verified by ldd) gives forty-pair bent captured Shell 1.034×
(95% interval 1.017–1.059), median 802.0→774.8 ms. Circle is only 1.020×
(0.997–1.035), 59.0→57.9 ms, compatible with no gain. Cubic implicit Subtract
1.029× (0.981–1.051) and notched captured Shell 0.994× (0.983–1.014) are also
uncertain. All summary geometry/predecessor multisets match; notched face
enumeration remains variable within baseline too. Full 28-case comparison
matches every stable baseline case. Raw evidence is
`results/fixed-v-with-axis-{confirmation.jsonl,confirmation-summary.json,full-output.json}`.
The fork application SHA256 is
`945d7cf3ca055077ab204913a40d2a3d87adfb99fe5cf60ea4d1a1445555fcff`.
SDK libraries remain untouched. The evaluator patch remains a prototype;
its previous pathological-circle benefit cannot be multiplied by the new
43× application improvement or presented as a broad remaining gain.

### Small-volume and slender twist checks

Six scales from 5e-6 to 1, two annulus scales, and slender travel test sixteen
cases. All accepted baseline/candidate cases match full metadata and genuine
relative volume at 1e-10 without a max(1,volume) floor; the three smallest
offset twists retain the same construction-accuracy rejection. No new result
or rejection appears. Analytic invariant and fitted nominal references are
labeled separately, and threshold classifications/raw replies are retained in
`results/twist-volume-axis-scales.jsonl`. Small invariant cases exercise the
existing 1e-12 minimum-solid threshold. This is regression evidence, not
independent accuracy certification of arbitrary fitted surfaces.

## Next work

Current follow-up: streaming Common→Cut completes each positive pair before
releasing its intersection data. Twenty fresh paired blocks preserve cubic
sixteen-target speed (1.297× versus no reuse), while reducing HWM 14.531 MiB
versus retained reuse (95% interval 13.834–14.693 MiB). Twenty-six regressions
pass. Repeated closed-Shell captures resolve the apparent face31/36 discrepancy
to the same geometric source/target descriptors; baseline itself varies face
enumeration. This is documented separately from formal BRep identity. See the
Boolean and presentation notes for full evidence and remaining exceptional cases.

Two isolated quadrature prototypes now have reproducible preload builds.
Roundoff floor gives no consistent speed benefit in its three-block pilot.
Prepared-table caching preserves 264 scalar rows bit-for-bit, including four
additional high-order boundaries, and passes thirty fresh paired concurrency
processes covering both Perform overloads. Captured-volume pilot mass/error
bits also match; forty-block confirmation is running. Source/SDK are unchanged.

That confirmation has finished: all480 measured mass/error records per variant
match exactly, but every speed confidence interval includes1. Prepared-table
caching is therefore a measured negative result on this corpus. The pilot's
apparent gain disappeared with larger samples. Independent contiguous interval
storage passes all264 scalar-row comparisons and an initial concurrent check;
its captured-volume pilot is running. Focused streaming controls also pass all
20cases ×3 paired repeats with zero exact metadata differences or expectation
failures; fresh-decode source checks do not establish in-request TShape immutability.

Contiguous interval storage forty-pair confirmation now preserves all mass/error
bits and measures small GK integration gains: circle-Z 1.039× (1.034–1.056),
circle-X 1.057× (1.047–1.115), bent-X 1.021× (1.007–1.040). This does not imply
the same application gain; current circle-X integration is only about 2 ms.
Exact ray-query repetition counters rule out a broad query cache on perforated
Fuse (one repeated attempt of 2,080). Analytic ray line/adaptor setup reuse now
has isolated SDK-compatible builds, 6,900 bit-identical public query rows per
variant, and thirty passing native regression cases for the first variant.
Untimed constructor counts fall sharply, but an initial forty-pair 1.3% Fuse
effect does not reproduce in another forty-block three-way run. The leaner
variant resolves no gain on any of eight workloads. Setup reuse is therefore
a measured negative result on this corpus, rather than an adopted kernel patch.
An independent early exact ray-range filter is being prepared for execution;
skipping irrelevant classifiers changes possible exceptions and is explicitly
not assumed to preserve the complete generic kernel API contract.

1. Broaden isolated fixed-V fork corpus checks before deciding whether to adopt
   the patch; reproduction is validated.
2. Test fixed fitted BRep volume under large placements and small-volume
   threshold decisions. Mass-only recentering primitive checks passed; the broad
   application prototype was tested and reverted after no broad speed benefit.
3. Establish application-safe Boolean batching and a many-target retained
   preprocessing policy; standalone batching and retention costs are measured.
4. Investigate volume quadrature conditioning/accuracy without weakening geometry
   contracts or accepting misleading error estimates.
5. Profile next shell/extrusion bottlenecks and preserve negative results.

Research notes: [Shell](shell-research.md), [Booleans](boolean-research.md),
[volume/kernel](volume-kernel-research.md), [presentation](presentation-research.md).
Additional notes: [quadrature](quadrature-research.md),
[reference translation](quadrature-translation-research.md),
[recentering](quadrature-recenter.md), [literature](quadrature-literature.md),
[upstream backports](upstream-opportunities.md),
[roundoff-floor experiment](kronrod-roundoff-research.md),
[quadrature allocation/table audit](kronrod-allocation-research.md),
[interval storage](interval-research.md), [ray setup](ray-setup-research.md),
[early ray range filtering](ray-range-research.md).
