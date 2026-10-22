# Batched Twist boundary candidates

Native and WASM builds use CPU candidate search and exact refinement by default
for Twist's intermediate section accuracy check. No runtime setting is needed.
`MAKESHIFT_KERNEL_GPU_SEARCH=ON` additionally compiles the experimental WebGPU
bridge; GPU execution still requires an explicit `gpu` runtime mode and a host
bridge. Missing GPU support falls back to CPU search.

For diagnosis, `MAKESHIFT_SWEEP_CANDIDATES=off` selects the original sequential
distance checks; `cpu` explicitly selects the default, and `invalid` exercises
missing-seed fallback. The benchmark worker passes `MAKESHIFT_BENCHMARK_CANDIDATES`
through to this setting when supplied; leaving it unset exercises the build default.

The CPU samples boundary supports at eight subdivisions per spline knot span (or
across an analytic surface's finite parameter range). Samples preserve their face
and exact UV coordinates. A balanced CPU spatial index or a WebGPU nearest-sample
search proposes one seed per query point. Both paths use the same sample set and
same subsequent OCCT refinement. Sampling stays on the CPU in this experiment;
the earlier standalone GPU surface-evaluation throughput is not used here.

OCCT refines that seed in double precision, evaluates the resulting support point,
checks its distance, and classifies its UV against the trimmed face. Only a finite
point within the original tolerance and classified IN/ON is a successful witness.
A missing, invalid, unsupported or unsuccessful proposal invokes the unchanged
cached face-extrema/full-shape distance path. Final solid validation is retained.
GPU f32 distances never decide acceptance or rejection, and no global-minimum claim
is needed: a verified positive proximity witness suffices for this check.

The APIs used are OCCT's
[`Extrema_GenLocateExtPS::Perform`](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/Extrema/Extrema_GenLocateExtPS.cxx)
and [`BRepClass_FaceClassifier`](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/BRepClass/BRepClass_FaceClassifier.cxx).
This is Makeshift's witness/fallback composition of public APIs, not copied OCCT
implementation or a replacement for OCCT topology.

The experimental WASM runtime calls a benchmark-only bridge. A dedicated child
worker owns WebGPU; the calculator worker waits on shared memory with a bounded
timeout. The browser main thread does not wait. Only the benchmark server enables
COOP/COEP. The GPU path is a calculator-operation experiment, not an enabled editor
feature, deployment change, or iPad claim. Closing its page owns both workers.

## Reproduce

Prepare the native calculator as for the [main benchmark](README.md), then the
default WASM-exception build using [the build instructions](../../docs/web-build.md#exception-runtime-and-profiling-builds).
From the repository root, activate Node before commands:

```sh
source ~/.nvm/nvm.sh && nvm use
npx tsc -p tsconfig.test.json
cmake -S native/kernel -B .build/web-wasm-exceptions-kernel -DMAKESHIFT_KERNEL_GPU_SEARCH=ON
cmake --build .build/web-wasm-exceptions-kernel -j 6
MAKESHIFT_WEB_EXCEPTIONS=wasm npx vite build --mode web --outDir "$PWD/.cache/wasm-performance/candidate-web"
```

Run `off`, `cpu`, and `gpu` separately with identical assets and no other active
builds. Each run includes a first call and five warmed calls. Full hidden Chromium
is selected for **all three** modes; the harness rejects a software GPU adapter.

```sh
MAKESHIFT_BENCHMARK_WEB=.cache/wasm-performance/candidate-web \
MAKESHIFT_BENCHMARK_CANDIDATES=gpu MAKESHIFT_BENCHMARK_SUITE=broad \
MAKESHIFT_BENCHMARK_ENGINES=chromium MAKESHIFT_BENCHMARK_CASE=twist \
MAKESHIFT_BENCHMARK_DRAG=0 \
node tests/wasm-performance/run.mjs .cache/wasm-performance/candidate-gpu.json 5
node tests/wasm-performance/compare.mjs .cache/wasm-performance/candidate-off.json .cache/wasm-performance/candidate-gpu.json
node tests/wasm-performance/candidate-check.mjs .cache/wasm-performance/candidate-off.json .cache/wasm-performance/candidate-cpu.json .cache/wasm-performance/candidate-gpu.json
```

`candidate-check.mjs` requires identical inputs/binaries, complete returned-result
hashes, and completed hardware GPU batches when GPU execution is requested.
`invalid-gpu` runs the shader then deliberately corrupts every returned index;
`unavailable-gpu` leaves the bridge unavailable. Both must reproduce the baseline.
The native `sweep-distance-test` in ordinary builds checks default/explicit CPU candidates,
missing candidates and native GPU-unavailable fallback on edges/corners, holes,
large translated/rotated faces, rational splines/seams and tolerance boundaries.

Operation timings include query construction, support sampling, packing, worker
transport, GPU upload/dispatch/readback, CPU refinement, fallbacks, solid validation,
tessellation and JSON transport. Worker initialization, including adapter/pipeline setup, is recorded
separately from operation timing. Rejected first loft attempts still gather a whole batch, which can cost
more than the original early exit. GPU bridge errors choose CPU search; missing or
invalid candidate indices use the original distance check.

Restore the shared experimental build cache before ordinary exception builds:

```sh
cmake -S native/kernel -B .build/web-wasm-exceptions-kernel -DMAKESHIFT_KERNEL_GPU_SEARCH=OFF
cmake --build .build/web-wasm-exceptions-kernel -j 6
```

## Whole-operation result (2026-10-21)

On the Apple M2 Max / full Chromium, all seven Twist cases returned byte-identical
complete results across unchanged, CPU and GPU modes, including the exact BRep.
Five warmed calls after a separate first call showed 4–40% lower times for the
five principal Twist cases; the offset-circle cases improved 24–27%.

A second run alternated three already-initialized calculator workers, with exactly
one active calculation. Six warmed observations per mode rotated which mode ran
first. The table uses the harness's median observation (upper middle for even
counts), in milliseconds:

| Operation | Unchanged | CPU spatial index + refinement | GPU search + CPU refinement |
| --- | ---: | ---: | ---: |
| Twist 90° | 202.2 | 175.4 | 174.9 |
| Twist 450° | 1,208.7 | 724.3 | 716.2 |
| Cubic Twist + draft | 2,332.3 | 2,250.3 | 2,252.5 |

This is a useful whole-operation gain from seeded refinement, but little additional
gain from GPU search at these batch sizes. In the 450° run, combined candidate
search across both loft attempts costs 2.14 ms on the CPU and 3.66 ms through the
GPU, including packing/transfers/waits. The successful pass has 2,232 query points
and 1,638 grid samples. GPU seeds yield 2,080 verified witnesses and 152 fallback
queries; the double-precision CPU index yields 2,071 and 161. Floating-point
near-ties can select different seeds, so a small whole-operation difference is
not evidence of faster hardware search. CPU/GPU timing ranges overlap here.

Solid validation still costs about 272 ms and presentation about 276 ms in the
GPU 450° median observation. Those stages account for most of the remaining
runtime. Cubic draft also spends substantial time constructing sections, so its
whole-operation improvement is only about 3.4%. No final geometry check was
removed to obtain these results.

The broader 68-case comparison also passed complete-result equality and unchanged
expected rejections. Corrupted and unavailable GPU candidates reproduce all seven
Twist results. Native witness tests, hardware shader checks, worker cancellation
and recovery, TypeScript checks and repository lint passed (eight existing lint
warnings).

These are warmed calculator request/reply times, not pointer-to-screen latency or
a multi-device study. They do not reproduce the earlier large synthetic surface
batch's GPU throughput advantage inside these whole operations. The GPU path stays
an opt-in experiment; CPU seeding and exact refinement are now the default product
path.

To reproduce the alternating comparison and focused browser boundary checks:

```sh
MAKESHIFT_BENCHMARK_WEB=.cache/wasm-performance/candidate-web \
node tests/wasm-performance/candidate-interleaved.mjs .cache/wasm-performance/candidate-interleaved.json
MAKESHIFT_BENCHMARK_WEB=.cache/wasm-performance/candidate-web \
MAKESHIFT_BENCHMARK_CANDIDATES=gpu node tests/wasm-performance/candidate-cancel.mjs
MAKESHIFT_BENCHMARK_CANDIDATES=gpu node tests/wasm-performance/candidate-shader-check.mjs
```

The shader check compares 257 queries with an exact integer-distance reference,
including ties. The cancellation check verifies that terminating the calculator
also removes its GPU child, then completes an operation in a fresh worker. These
cover the new browser/worker boundary; they do not claim editor interaction or
physical iPad acceptance.
