# Contiguous adaptive GK interval-storage experiment

Source-only audit and artifact preparation, 2026-10-08. No build or benchmark
in this lane. OCCT pin `a016080bf6738d6aeae020badee4e888ad1540a5` (7.9.3).
This independent patch targets the original integration source, not the
roundoff-floor or prepared-table candidates.

## Execution checkpoint

The orchestrator compiled the isolated interval module using
`bash tests/geometry-performance/build-kronrod-preloads.sh interval` (owns lock).
All 264 adaptive scalar rows across 22 requested orders match SDK bit-for-bit,
including original low-order kink accuracy failures. One synchronized 24-reader
process pair covering both Perform overloads also matches the existing SDK
representative bits/status/order/sample counts. These tests do not yet cover
every pending tie/sample-order/exception case below.

Three-block captured-volume pilot on all three BReps/four axes preserves all 36
measured mass/error records exactly. Circle-Z suggests 1.025×, while most other
intervals include no effect and bent-X has noisy slower samples. Forty randomized
paired blocks are running before any performance conclusion. Raw pilot and
summary are `results/kronrod-interval-volume-pilot.jsonl` and `-summary.json`.

Untimed public-API counters on warmup plus one measured volume evaluation show
the original circle-Z calls tolerance Perform 63,402 times: 59,976 refine, with
1,560,870 evaluated subdivisions and at least 1,500,894 stored subdivisions.
Two successful evaluations return above requested tolerance at the 1000-iteration
cap. Circle-X calls it 1,722 times, only 32 refine, with 1,088 evaluated and at
least 1,056 stored subdivisions. Its successful complete-rule sample estimate
is 31,526 versus 22,296,650 for Z; these are inferred scalar Value counts, not
measured geometry D1 counts. Bent-X has 4,258 calls, 3,332 refining, 10,308 evaluated
and at least 6,976 stored splits; four calls return above requested tolerance.
This illustrates work that the committed axis change already avoids for the
circle. It does not establish interval-allocation time share or accuracy.
Raw counter reports and full diagnostic outputs are
`results/kronrod-iterations-{circle-x,circle-z,bent-x}{,-stderr}.jsonl`.
Their timings are invalidated by instrumentation and must not enter benchmarks.

Forty-block confirmation is complete: all 480 measured mass/error rows per
variant match bit-for-bit. Circle-Z is 1.039× (95% interval 1.034–1.056),
circle-X 1.057× (1.047–1.115), bent-X 1.021× (1.007–1.040), notched-Z
1.038× (1.029–1.063). Most GK axes show a modest resolved improvement;
bent and notched ordinary adaptive controls remain compatible with no effect.
Raw confirmation and summary are `results/kronrod-interval-volume-confirmation.jsonl`
and `-summary.json`. This is isolated integration performance, not current
application speed: a few percent of a roughly 2 ms circle-X integral is only
a small fraction of its 58 ms request. Broader scalar/exception and application
checks remain before any integration decision. The SDK remains unchanged.

## Linked-storage costs and realistic limits

[`TColStd_SequenceOfReal`](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/TColStd/TColStd_SequenceOfReal.hxx)
aliases `NCollection_Sequence<Standard_Real>`. Each node has previous/next
pointers and one double; ordinary 64-bit payload is about 24 bytes before
allocator overhead. [Append/InsertAfter](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/NCollection/NCollection_Sequence.hxx#L358)
allocate separate nodes through the common allocator, which forwards to
`Standard::Allocate`; destruction individually frees every node.

Adaptive `Perform` starts three sequences: two endpoints, one error and one
value, hence four nodes. Each completed stored split inserts three nodes. At
`k` stored intervals that is `3*k+1` nodes, approximately `72*k+24` payload
bytes, plus allocator metadata and sequence objects. Count-stop returns happen
before the last insertion; it is wrong to count all evaluated splits as stored
splits. Only integration calls needing refinement create the sequences.

[`NCollection_BaseSequence::Find`](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/NCollection/NCollection_BaseSequence.cxx#L450)
chooses traversal from first/current/last node. `Value` and `ChangeValue` retain
a current-index/node cache. Thus the left-to-right largest-error scan normally
advances one link per access; it is **O(k) per scan**, not an O(k²) scan simply
because it uses indexed syntax. Over k adaptive splits the repeated scan still
has quadratic total work. Accessing/inserting at the selected interval also
walks links from a cached/end position. The opportunity is node allocation/free,
pointer chasing, cache locality and constant factors, not a promised change
to the asymptotic largest-error search.

Both mass integration levels explicitly pass `maxIterations=1000`
([TFunction](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/BRepGProp/BRepGProp_TFunction.cxx#L123),
[VinertGK](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/BRepGProp/BRepGProp_VinertGK.cxx#L321)).
A normal capped call stores at most roughly 1000 intervals; each outer function
evaluation can invoke several fresh inner calls. The cumulative count>50
heuristic can stop earlier, but does not guarantee only 50 splits because its
increments depend on measured changes. Actual per-call split distributions
have not been measured by this lane. The reported millions of circle D1 calls
cannot alone establish average interval count or allocation time fraction.

## Small independent patch

[patches/kronrod-contiguous-intervals.patch](patches/kronrod-contiguous-intervals.patch)
adds a private contiguous sequence adapter and changes exactly the three local
sequence declarations in adaptive `Perform`. Full candidate:
`/tmp/kronrod-contiguous-intervals-candidate.cxx`.

The adapter uses three independent `std::vector<double>` buffers, each reserving
32 doubles only after the original early convergence/cap returns. It retains
1-based indexing and original checked range-exception messages. InsertAfter(i)
inserts at vector offset i: an endpoint midpoint remains between the exact same
old boundaries, and child errors/values retain the same left/right ordering.
Existing `> maxerr` scans keep the leftmost maximum on ties. Vector insertion
shifts stored double values without recomputation; it can invalidate pointers,
but original `Perform` retains no vector element references across insertion.

The entire original methods/rule suffix was asserted byte-for-byte unchanged
after normalizing the three type declarations. Therefore midpoint, function
sample order, both child evaluations, incremental signed-value/error arithmetic,
count updates, relative/absolute threshold, cap, failure returns, and insertion
timing remain exactly the same source operations. No reordered heap/priority
queue, coalesced interval, new finite guard, error floor, or recalculated sum is
introduced. Installed headers, object layout and exported ABI stay unchanged.

The three initial buffer reservations use about 768 bytes total capacity per
refining call. Geometric growth at the 1000-iteration cap gives roughly 24 KiB
of scalar payload across three buffers, versus roughly 72 KiB of list-node
payload and thousands of individual nodes. Exact allocator/peak statistics need
measurement. Contiguous insertion is O(k) shifting rather than constant-time
link rewiring after lookup; costs can trade off. `std::vector` allocation failure
uses its standard exception, so out-of-memory/resource-failure behavior is not
bit-identical to OCCT allocation exceptions. Do not claim equivalence under
allocation failure. No new large eager allocation follows user maxIterations.

For `nint==0`, the original next access is `anIntervals(0)`, raising
`Standard_OutOfRange` in a checks-enabled build. The adapter explicitly uses
the same range macro and message; it does not turn this invalid state into a
different interval selection or silent convergence. If a build disables those
checks, original invalid access is undefined; preserving an undefined outcome
is not a valid correctness criterion. Nonfinite samples/failure semantics remain
the original behavior because the numerical body is unchanged.

~~~text
original SHA256 2490173f1ff9fe92300abbd2fe64fffba1c8691bf185cae45ec978e531fdb467
candidate SHA256 e90b496ff0d079f7c505f311cc0eef2cf663a85c238db1a9a6e132e36a381a4b
patch SHA256 611fc30789624a8fc4d9ca789775aa469e4ceef02212cd90026080b38f7ca336
~~~

Fresh temporary original was patched and compared byte-for-byte to the final
candidate. Original source/SDK were untouched. Full candidate has 411 lines
(upstream original 382); the existing adaptive function exceeds 80 lines and
was not refactored. Adapter methods remain short; patch is 51 lines. Original
OCCT notices remain; corresponding license/exception and preload ABI/binding
provenance requirements are documented in the roundoff research note.

## Acceptance and measurement plan

1. Unmodified-source preload control must reproduce SDK bits/status first.
   Compile the candidate separately from other GK experiments; confirm actual
   interposition before inferring any result.
2. Compare scalar values, absolute/relative error bits, order, iterations and
   success/failure for easy converged calls, severe cancellation, forced small
   caps, failing callbacks after the first/second child, reverse bounds and
   nonfinite callbacks. Include equal-error symmetric regions to verify the
   exact leftmost tie and order; capture sample-argument order on untimed runs.
3. Exercise insertion at first/middle/last interval and growth across 32/64
   capacities. Preserve every exception/status seen in the stable baseline.
   Failure cases do not become declared success through storage replacement.
4. Compare original circle-Z, bent and notched fixed BReps for mass/error bits,
   then stable full native output and current hinted-axis controls. Preserve
   all output differences instead of accepting rounded descriptors by default.
5. Count stored splits, initial/peak interval counts and allocations in a
   separate untimed instrumented run. Then run serialized randomized paired
   blocks; distinguish fewer allocations from unchanged D1/evaluation counts.
   This is independent of the table-fill cache, and their combined gain cannot
   be inferred by multiplying isolated speedups.

The adapter prototype deliberately leaves scan complexity and numerical policy
alone. A more elaborate priority structure would require a separate proof of
left-to-right tie/order preservation and should follow evidence that scanning,
rather than geometry evaluation or allocation, is the remaining bottleneck.

## Counter-only preload trace prepared

[trace-kronrod-iterations.cpp](../../../tests/geometry-performance/trace-kronrod-iterations.cpp)
defines exact public `Perform` overload wrappers and forwards with
`dlsym(RTLD_NEXT, ...)` using Linux Itanium ABI function pointers with explicit
`this`, matching installed SDK signatures. Read-only `nm -D libTKMath.so`
confirmed both exported symbols:

~~~text
_ZN29math_KronrodSingleIntegration7PerformER13math_Functionddi
_ZN29math_KronrodSingleIntegration7PerformER13math_Functionddidi
~~~

Atomic counters distinguish entered, normal returned, unsuccessful and thrown
calls for each overload. Only successful calls expose public iteration/order
fields: failure fields are not inspected. Histograms cover iterations 0–1001
and orders 0–255, with overflow buckets, plus successful iteration totals,
refining-call count and above-requested-tolerance count. Its one process-end
JSON stderr record explicitly retains the legacy distinction between evaluation
success and attained tolerance. Threads must have stopped using integrators
before normal process teardown; abrupt termination cannot guarantee output.

For successful calls, `iterations-1` counts completed evaluated splits. Actual
stored splits lie between that sum minus successful refining-call count and
that sum, because a stagnation return can precede the final insertion. The
trace records this conservative lower bound and completed upper estimate,
not an invented exact allocation count. It estimates successful rule sample
calls as `order*(2*iterations-1)` only under the inspected complete-rule loop.
This is not geometry D1 count, excludes failed/throwing callbacks, and does not
include standalone direct GKRule invocations. Nested outer and inner Perform
calls are both counted; do not interpret their sum as top-level requests.

Illustrative command, not compiled or executed by this lane:

~~~sh
c++ -O2 -std=c++20 -fPIC -shared -I.cache/kernel/sdk/include/opencascade \
  tests/geometry-performance/trace-kronrod-iterations.cpp -ldl \
  -o /tmp/trace-kronrod.so
LD_PRELOAD=/tmp/trace-kronrod.so /tmp/volume-kernel INPUT.brep z 1
~~~

Use the actual CLI of the chosen immutable harness. Run original Z, current
hinted-axis requests and shell controls serially; retain full stderr and exact
input/binary/toolkit provenance. First verify counters are actually reached,
since symbolic/direct bindings may bypass a preload. For candidate-library
counting, order the trace before the candidate in LD_PRELOAD and verify
RTLD_NEXT resolves to that candidate, not accidentally the SDK. Missing symbol
resolution exits127 with a clear diagnostic. This is an untimed trace only:
atomics, wrapper calls and dynamic dispatch invalidate performance comparisons.
The source is below300 lines and functions below80; no build/run claim.
