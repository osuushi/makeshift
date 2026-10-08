# Exact geometry performance investigation

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
It supplements rather than replaces native BRep validity and the operation’s strict
acceptance checks. It does not certify arbitrary geometry or prove identical mesh
output. Failed cases remain failures and are reported separately from speedups.

## Environment

- Linux x86_64, GCC Release `-O3 -DNDEBUG`; wrapper C++20, OCCT C++17.
- AMD EPYC 9V74 virtual machine, 5 visible logical CPUs and affinity CPUs 0–4.
- Cgroup CPU quota `400000 100000`: four CPU equivalents, not a guarantee of
  consistent single-core speed. Memory limit 16 GiB.
- OCCT built without TBB; built-in OSD pool is available.
- Existing SDK/build artifacts were already provisioned and receipt-verified by
  the setup flow; no need to rebuild the whole kernel to establish the baseline.
- Baseline calculator preserved at `/tmp/makeshift-kernel-baseline` for this
  session; reproduce future baselines from the starting commit and same SDK.

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

## Pending experiments

1. Establish thread-count baselines across exact shell/Boolean/extrusion cases.
2. Enable existing CPU parallel APIs in shell checks, retaining all predicates.
3. Isolate repeated volume integration and geometry validation; consider
   request-local reuse only where shape mutation and ownership are controlled.
4. Compare intersection preprocessing reuse and multi-tool batching with the
   current sequential operations, including correspondence and degenerate cases.
5. Use measured phase bottlenecks to select upstream kernel experiments.

Research notes: [Shell](shell-research.md), [Booleans](boolean-research.md).
