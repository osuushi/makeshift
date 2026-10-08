# Gauss–Kronrod scratch and table preparation audit

Source-only, 2026-10-08. No compilation or numerical execution in this lane.
OCCT pin `a016080bf6738d6aeae020badee4e888ad1540a5`, matching installed headers.
The orchestrator reports the roundoff-floor preload passes scalar controls but
does not speed original circle-Z integration; those runs were not repeated here.

## Scratch heap-allocation hypothesis is disproved by this pin

[`math_VectorBase.hxx`](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/math/math_VectorBase.hxx#L62)
already declares `THE_BUFFER_SIZE=32` and an inline `std::array` buffer.
Its [constructor](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/math/math_VectorBase.lxx#L23)
passes that buffer to `NCollection_Array1` with `useBuffer=true` for lengths at
most 32. The array then borrows it rather than allocating. Therefore GKRule's
`f1,f2` lengths `(KronrodOrder-1)/2` are stack-backed through order **65**.
Replacing them with `NCollection_LocalArray<double,16>` sized `(order+1)/2`
would add heap fallbacks starting at order 33, where the original still uses
its stack buffer. No patch claiming to remove these allocations was prepared.

Pinned BRepGProp's inner and outer initial orders clamp to 5–15
([TFunction](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/BRepGProp/BRepGProp_TFunction.cxx#L130),
[VinertGK](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/BRepGProp/BRepGProp_VinertGK.cxx#L394)).
Both scratch arrays and all four point/weight vectors in `Perform` already avoid
heap allocation at those orders. Adaptive interval sequences can allocate,
but that is a different hypothesis and must not be conflated with scratch.

## What repeated preparation still does

[`math::KronrodPointsAndWeights`](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/math/math_Kronrod.cxx#L3008)
has literal tables through odd order 123; it walks to a table offset and fills
the caller's point/weight vectors each time. Beyond 123 it computes a rule.
[`math::OrderedGaussPointsAndWeights`](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/math/math.cxx#L2004)
similarly fills literal tables through order 61 and computes higher orders.
There is already a precomputed mathematical table, but no retained read-only
vector view in `Perform`; repeated function calls refill stack vectors.
GKRule accepts const vector references and reads them without mutation. A
bounded retained prepared-vector cache can avoid this work without changing
samples, weights, accumulation order, tolerances, error formulas or status.

## Independent patch artifact

[patches/kronrod-table-cache.patch](patches/kronrod-table-cache.patch) is against
the **original** pinned source, independent of the roundoff-floor patch.
Full temporary candidate is `/tmp/kronrod-table-cache-candidate.cxx`.
It lazily retains exactly six immutable prepared rules: orders 5,7,9,11,13,15.
Each is a function-local `static const` object, initialized using the original
two public preparation functions. C++ thread-safe initialization synchronizes
the first call per order; subsequent calls read the same object. No invalid or
unbounded order enters the cache. Every other order follows the original
preparation path, including computation of high-order rules.

Each retained rule has four vectors containing 32-double inline buffers plus
array metadata. The fixed budget is `6*sizeof(KronrodTables)`, approximately
7–8 KiB on a typical 64-bit build; exact size should be recorded after compile.
No per-thread multiplication, unbounded map, eviction, mutex per quadrature
call, mutable shared scratch, or escaping references exist. The prepared
vectors must never be modified after construction; the inspected GKRule only
reads them. Unused local fallback vectors retain their ordinary inline buffers
but have logical length one on cached calls; this patch avoids **table filling**,
not the inline buffer's stack footprint.

The entire original GKRule suffix was asserted byte-for-byte unchanged by the
artifact-generation script. Constructor/status and adaptive value/error logic
also remain unchanged. The only intentional difference is input-rule retention
and references to those identical prepared vectors. No headers or class layout
are modified; original OCCT notices are retained. Use the same licensing and
preload-control/binding checks documented in
[kronrod-roundoff-research.md](kronrod-roundoff-research.md).

~~~text
original SHA256 2490173f1ff9fe92300abbd2fe64fffba1c8691bf185cae45ec978e531fdb467
candidate SHA256 264930ad551a0c10a8c57991db1d312ce44148d1857a578c443921a6b6b5305c
patch SHA256 c5b466fc4f16309a7bc26e70872bca693aea383b56f0c6b9113985dd46032fd9
~~~

A fresh temporary original copy was successfully patched and byte-compared to
the final candidate; original source hash remains unchanged. Full candidate is 431 lines and
patch 108 lines. Upstream source already exceeds 300 lines, and adaptive
`Perform` already exceeds 80; the new rule-cache functions remain short.
No unrelated upstream refactoring was performed.

## Correctness gates and expected payoff

- Compare unmodified source preload control with SDK first, then candidate:
  value/error bits, iteration counts, order and successful/failed evaluation
  must match for both Perform overloads and public GKRule.
- Include cache-boundary orders 3,5,15,17,31,33,65,123,125 and even inputs that
  `Perform` rounds up. Exercise repeated and interleaved orders; invalid order,
  failing functions, reverse bounds, nonfinite samples and reused objects retain
  the original semantics. This patch introduces no new finite guards or floor.
- A concurrency correctness run must simultaneously first-initialize the same
  order and initialize different orders, checking bitwise results. No timed
  benchmarks run concurrently on the shared machine.
- Require full circle-Z/bent/notched mass/error bits and ordered native outputs
  on stable baseline repeats. Preserve original failures and run the application
  hinted-axis cases separately; sampling-rule preparation might be negligible
  once axial pathological work is avoided.
- Counter-only instrumentation should count preparation calls and total
  `Perform`/GKRule calls. Cache should remove repeated preparation, not D1 calls
  or adaptive iterations. Measure untimed counts separately from performance.

The likely benefit is bounded by repeated small table preparation costs, not
two eliminated heap allocations per GKRule. A negative result would be useful:
it would direct attention toward interval storage, nested call overhead or
actual evaluator work with the false scratch-allocation premise removed.

## Initial execution: scalar parity

The orchestrator compiled the independent table patch against the unchanged SDK.
Reproduction: `bash tests/geometry-performance/build-kronrod-preloads.sh`
(owns the shared lock). It builds original-source control, floor and table
modules in `.cache/geometry-performance/kronrod/lib` from checked temporary
copies, leaves source/header/SDK unchanged, and saves candidate source/hashes.

The adaptive scalar diagnostic ran 12 cases at 18 requested orders:
3 through 17 inclusive, then 21,33,65. All 216 candidate rows are byte-identical
to both SDK and original-source control, including values, estimates, iterations,
sample counts, statuses and even-order normalization. Captured files follow
`results/kronrod-scalar-{sdk,control,table}-ORDER.jsonl`.
This establishes preservation of those numerical results, not universal accuracy.
The original kink case fails the generous 1e-9 independent relative-error gate
at requested order3 (actual 9.37e-5, estimated zero) and orders8/9
(actual 1.63e-9, estimate 8.52e-11). Candidate preserves the same failures.
Requested8 normalizes to9; these are two rule-order failures rather than three
different rules. All other selected accuracy gates pass. Cancellation and tiny
integrals are diagnostic cases outside the exit accuracy gate, as labeled.

Four further requested orders31,123,124,125 also match byte-for-byte (48 rows),
covering literal-table/computed-rule boundaries; requested124 normalizes to125.
The full selected adaptive scalar matrix is therefore 264 identical rows.

`kronrod-concurrency.cpp` ran thirty fresh SDK/table process pairs. Each starts
24 readers simultaneously: six orders, four readers per order, two per Perform
overload. Every reader repeats16 calls and compares bits/status/order/sample
counts with serial references computed after stress. All process outputs match
byte-for-byte and adaptive smooth-function accuracy gates pass. This is 11,520
calls per variant across30 first-use waves; no race detector or universal
thread-safety claim. The retained JSONL files are the final representative pair,
not all thirty repetitions. SDK/table file hashes are identical; command exits
and byte comparisons were checked for every pair by the orchestrator.

Captured-solid pilot covers3 randomized blocks on circle, bent and notched
BReps at X/Y/Z and ordinary adaptive integration: all36 mass/error records per
variant match bit-for-bit. Timings are noisy. Notched X/Z suggest a possible
small gain, but three blocks do not establish it. A40-block paired confirmation
against the original-source control is running. Raw pilot and summary are
`results/kronrod-table-volume-pilot.jsonl` and its `-summary.json` companion.
No production integration or confirmed speedup is claimed yet.

## Forty-block confirmation: negative performance result

Confirmation finished with forty randomized paired blocks on all three BReps,
four axes/methods each. All480 measured mass/error records per variant match
bit-for-bit; no evaluation failures. Every paired speed confidence interval
includes1. Circle-Z is1.008× (95% interval0.992–1.015), bent-X1.008×
(0.990–1.016), and notched-X0.987× (0.970–1.030). The pilot's apparent
notched-X/Z gain did not survive larger sampling. No performance adoption is
justified on these workloads. Raw confirmation and summary:
`results/kronrod-table-volume-confirmation.jsonl` and `-summary.json`.
Preserve this negative result rather than presenting table preparation as a
measured bottleneck. Interval storage is being tested independently next.
