# Isolated roundoff-aware Gauss–Kronrod experiment proposal

Source-only audit, 2026-10-08. No build/run in this lane. OCCT source pin
`a016080bf6738d6aeae020badee4e888ad1540a5` (7.9.3); existing SDK headers match
the inspected class. This proposes an experiment, not an adopted accuracy policy.

## What exists and what is absent

Pinned [math_KronrodSingleIntegration::Perform](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/math/math_KronrodSingleIntegration.cxx#L143)
refines its largest estimated-error interval. Above `Epsilon(1.)` signed mass it
uses relative error; below that fixed numerical threshold it switches to an
absolute comparison. A near-canceling `1e-12` integral requested at `1e-11`
therefore demands about `1e-23` absolute error. This is distinct from an
integrand that is uniformly tiny and has no substantial cancellation.

The routine returns after the iteration cap or cumulative stagnation counter
`count > 50`. It retains `myIsDone=true` even when `myErrorReached` exceeds the
requested tolerance. The counter increments for small value change **or** tiny
current absolute error and is never reset after useful improvement.

Pinned [GKRule](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/math/math_KronrodSingleIntegration.cxx#L282)
computes a Gauss/Kronrod difference and `asc`, the estimated integral of absolute
deviation from the sampled mean. It computes neither `resabs` (integral of
absolute function magnitude) nor a roundoff floor. `asc` cannot replace
`resabs`: a nonzero constant has zero deviation and nonzero absolute magnitude.
The error scaling also differs from QUADPACK: OCCT only reduces its raw error
when the scale is below one; do not describe it as a verbatim `dqk21` algorithm.

Public-source comparison, actually read:

- [QUADPACK dqk21](https://www.netlib.org/quadpack/dqk21.f), lines 140–179,
  accumulates `resabs` using the same samples, rescales embedded-rule error,
  and applies a `50*machine_epsilon*resabs` floor when above an underflow guard.
- [QUADPACK dqagse](https://www.netlib.org/quadpack/dqagse.f), lines 239–252,
  reports roundoff termination when initial error is near this floor and above
  the requested target. Later roundoff/stagnation checks and global error-sum
  bookkeeping appear at lines 294–347. Its public error status distinguishes
  unattained accuracy from successful convergence; estimates can still be wrong.

Those numerical safeguards do not bound errors in an external geometry
evaluation. A nearly zero projected normal can result from subtracting two
large cross-product terms; quadrature `resabs` then measures the already noisy
small values, not the magnitude of their precursor arithmetic. Consequently
the floor may leave the original circle pathology unresolved. No near-zero
geometry value should be replaced by zero on this basis.

## Minimal isolated implementation design

Keep the SDK and application unchanged. Copy **the complete pinned original
`.cxx`** into a temporary experiment tree and apply a narrow recorded patch.
Preserve original copyright/licensing headers and include the upstream license
and exception with the research artifact. Record the source hash, patch hash,
compiler/options and exact SDK shared-library hashes. Do not distribute a
replacement binary without its corresponding source and build provenance.

Do not add members or alter the installed header. Introduce an internal helper
with the existing rule inputs plus an output `resabs`. Keep public `GKRule` as
an ABI-compatible wrapper. Compute `resabs` from its already stored `fc,f1,f2`
and Kronrod weights, scaling by `abs(halfInterval)`; no extra `Value()` call or
surface evaluation is needed. Retain original quadrature value/order/weight
logic and original discrepancy rescaling. Floor the reported local absolute
error at `max(originalError, 50*machineEpsilon*resabs)`, with explicit finite
checks and an underflow guard. Exact-zero functions retain zero floor.

Use the helper in adaptive `Perform` to obtain initial and child `resabs`.
Track absolute-magnitude estimates alongside interval errors using local
sequences, so the floor for the current partition is the sum of its local
floors. Maintain the existing relative/absolute reporting convention for this
isolated comparison. Do not reduce estimated error to make a tolerance check
pass. Avoid negative error sums from incremental subtraction; recompute the
current positive sums if cancellation in bookkeeping threatens the floor.

Initial experimental stopping condition, after computing and reporting the
floored error:

~~~text
absoluteTarget = tolerance * abs(value)    if abs(value) > existing threshold
               = tolerance               otherwise
floor = 50 * machineEpsilon * resabs
roundoffLimited = finite inputs && floor > absoluteTarget
                  && absoluteError <= 2 * floor
~~~

This mirrors QUADPACK's initial near-roundoff test in spirit. It is a practical
stagnation diagnosis, not a proof that no more accurate value exists. Use the
same condition after subdivision with the **global** floor/error sums. Keep
existing cap/stagnation exits visible, and log termination reason outside the
object only in a separate untimed instrumentation build. Never stop solely
because the target is below the floor while estimated truncation error is
large: that would skip useful approximation work.

Two explicit research variants are needed:

1. **Legacy evaluation-status variant:** return at the roundoff condition with
   `myIsDone=true`, accurate recorded value/error fields, and error still above
   requested tolerance. This preserves the old meaning of `IsDone` as successful
   evaluation and can test performance; it must not claim convergence.
2. **Strict failure variant:** mark the roundoff termination unsuccessful so
   BRepGProp reports failure and the application tries another axis. Preserve
   diagnostics externally because callers cannot read result fields when
   `IsDone=false`. This changes fallback behavior, so compare it separately.

The unchanged header has no distinct convergence/roundoff status. Production
integration would need an explicit reviewed reporting contract or caller checks;
a preload prototype cannot silently make that contract rigorous. Global
scalar-mass absolute budgeting remains a separate broader algorithm.

## Preload isolation and verification

Compile the full candidate translation unit as `-O2 -std=c++20 -fPIC -shared`,
against **the same SDK headers**, link its dependencies (`TKMath`, `TKernel`),
and retain the matching library search path. Use default symbol visibility;
do not introduce hidden exports, `-Bsymbolic`, alternate allocators, changed
packing, fast-math, or class-layout changes. An illustrative command, not run:

~~~sh
c++ -O2 -std=c++20 -fPIC -shared \
  -I .cache/kernel/sdk/include/opencascade /tmp/kronrod-candidate.cxx \
  -L .cache/kernel/sdk/lib -Wl,-rpath,"$PWD/.cache/kernel/sdk/lib" \
  -lTKMath -lTKernel -o /tmp/kronrod-roundoff.so
~~~

`LD_PRELOAD` affects dynamic symbol resolution, not arbitrary statically bound
or inlined calls. Inspect exported mangled constructors, both `Perform`
overloads and `GKRule` with `nm -D`/`readelf`, and inspect the relevant SDK call
relocations. Verify actual binding with a counter-only run or `LD_DEBUG=bindings`;
do not benchmark instrumented binding traces. The public constructors must
resolve consistently to the candidate and its private helper must stay local.
Check the existing executable has dynamic TKMath dependencies. If protected
visibility, symbolic binding, LTO/internal direct calls or static linkage bypass
the preload, use isolated relinking; do not infer that a no-effect run disproves
the numerical hypothesis. Do not stack this preload with an evaluator-cache
candidate initially: separate mechanisms before measuring their combination.

## Independent correctness and performance sequence

1. Build an **unmodified full-source preload control** first. It must reproduce
   baseline scalar values/error bits and full native outcome on the same BReps;
   this establishes isolation/ABI correctness before the algorithm experiment.
2. Independently test scalar functions: zero, constant, low-degree polynomial,
   odd/near-canceling functions with known nonzero residual, sharply localized
   smooth features, and positive oscillatory functions. Require retained error
   floors and distinct unattained-tolerance reporting. Perturb function amplitude
   and translate integration intervals. No floor can certify an unsampled spike.
3. Run original **unhinted circle Z**, bent shell and notched cylinder on fixed
   exported input BReps, same spans/eps/flags, plus X/Y controls. Preserve full
   reported error/status/actual mass. Existing ordinary-integration failures on
   bent/notched prohibit validating the candidate against ordinary mass alone.
4. Add analytic placed/translated box, thin box, cylinder, sphere, rational
   spline fixtures, narrow holes/slivers, and threshold-adjacent solids. Compare
   genuine relative reference error for small masses, not `max(1,mass)` deltas.
   For fitted freeform BReps, use independent higher-precision convergence or
   conservative bounds; nominal ideal sweep mass and two-axis agreement are
   supplementary evidence only.
5. Trace per-call resabs, discrepancy, floor, target, iterations and reason in
   an untimed run. A success hypothesis is reduced futile refinement with no
   worse independent error and an honest elevated estimate; a high floor alone
   is not evidence of accuracy. If measured noise greatly exceeds the quadrature
   floor, investigate D1 conditioning/global budget instead of enlarging the
   floor until the desired speed appears.
6. Only after correctness, run serialized randomized paired blocks with an
   immutable baseline executable and isolated preload candidate. Record input,
   outputs and distribution uncertainty. Compare application default-axis paths
   separately from original Z: the committed axis hint may already avoid most
   work, reducing this patch's practical value.

Reject any claimed speedup obtained by zeroing flux, reducing an error estimate,
loosening eps, suppressing an attained-error/status failure, or changing the
represented BRep. This experiment's useful outcome can also be a negative
result: QUADPACK-style roundoff logic may improve honesty without materially
speeding geometric derivative noise.

## Patch preparation record

[patches/kronrod-roundoff-floor.patch](patches/kronrod-roundoff-floor.patch)
applies to the pinned original `src/math/math_KronrodSingleIntegration.cxx`.
Full candidate copy: `/tmp/kronrod-roundoff-candidate.cxx`. The original source
and installed SDK header were left unchanged. A fresh temporary original copy
was patched and compared byte-for-byte to the candidate; this verifies artifact
application, not C++ compilation or numerical correctness.

~~~text
original SHA256 2490173f1ff9fe92300abbd2fe64fffba1c8691bf185cae45ec978e531fdb467
candidate SHA256 cc7c31b62d60c0fd4bfb06a369682e726a5525649d2c18e2ac8d7a35f638329f
patch SHA256 701fd60b2783cd94af382bc6f9084726582565faa55f2a476e217e707af4fbd8
SDK header SHA256 51cbbc87fe53b1e525a31013445dddf3b0352ae952a62d48e1fb947d3884904b
~~~

The helper retains original sampled value operations and discrepancy rescaling,
then derives `resabs` from stored samples and raises error to the roundoff floor.
The public same-signature `GKRule` wrapper also returns floored absolute error,
so the no-tolerance `Perform` API sees the new honest estimate. Tolerance
`Perform` calls the helper directly, stores interval floors, and recomputes
positive global error/floor sums after replacement instead of subtracting a
large old estimate from a small new one. It preserves the original signed-value
update, existing tolerance threshold, iteration cap, cumulative stagnation
behavior and legacy successful-evaluation status on roundoff termination.
Nonfinite bounds/tolerance and nonfinite rule/accumulation results are rejected.
The `error <= 2*floor` comparison is written `0.5*error <= floor` to avoid
overflow of twice a large finite floor.

Source-size exception recorded rather than hiding it by unrelated refactoring:
upstream original is already 382 lines; full candidate is 461 lines. Adaptive
`Perform` exceeds 80 lines (as upstream already does); helper rule body is about
102 lines. The focused artifact is 223 patch lines. There is no installed header
change, member/layout change, copied QUADPACK code, or production SDK mutation.
Original OCCT notices remain in the complete source. Corresponding pinned
licenses are [LICENSE_LGPL_21.txt](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/LICENSE_LGPL_21.txt)
and [OCCT_LGPL_EXCEPTION.txt](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/OCCT_LGPL_EXCEPTION.txt).

Additional scalar test requirements before any acceptance:

- Adaptive reverse bounds: signed value must negate, floor/error stay
  nonnegative. The helper uses `abs(halfInterval)` for its new floor; existing
  upstream `asc` signed scaling is intentionally retained, so full error
  bitwise symmetry is not promised. The no-tolerance API already rejects
  negative-width intervals; this patch does not expand that contract.
- Exact zero and zero-width adaptive interval: no artificial positive floor
  or extra subdivisions. Tiny subnormal amplitudes: floor is disabled below
  `min_normal/(50*epsilon)` like the QUADPACK underflow guard; document that
  this is a practical floor, not subnormal arithmetic certification.
- Cancellation with nonzero residual: retain positive above-target errors when
  roundoff termination is selected; constant nonzero functions at excessively
  strict eps must not report zero error just because Gauss/Kronrod agree.
- Multi-interval replacement: ensure global absolute error is at least the
  recomputed sum of interval floors and never negative; compare retained values
  against analytic references after large-error intervals become small.
- NaN/Inf samples with `Value()` returning true, NaN/Inf bounds/tolerance, and
  finite samples overflowing integral or absolute-magnitude accumulation must
  return unsuccessful evaluation. The legacy class still has no separate
  converged status, and existing prior fields on input failure are not valid
  diagnostics. Callers must check `IsDone` before accessing them.

These are pending tests for the orchestrator's baseline-control and candidate
preload builds. No numerical result or speedup is claimed by this artifact.

## Initial execution results

The orchestrator compiled the original-source control and floor prototype as
isolated ABI-compatible preloads against the unchanged SDK. The reproducible
builder is `bash tests/geometry-performance/build-kronrod-preloads.sh`; it owns
the shared lock, checks original source/header hashes, applies patches only to
temporary copies and preserves matching candidate sources in the ignored cache.

Twelve scalar cases at orders 15 and 21 pass the diagnostic accuracy gates for
SDK, original-source control and floor. SDK/control rows are byte-identical.
Cancellation examples illustrate why an estimated-error/status success is not
an independent accuracy certificate: the floor raises an unrealistically small
estimate without changing the returned value. These tests do not cover all the
pending nonfinite, overflow, subnormal and zero-width cases listed above.

Three randomized paired blocks on each of the three captured fixed BReps test
X/Y/Z and ordinary adaptive integration. All 36 measured masses per variant
match the SDK bit-for-bit; original-source control errors also match exactly.
Floor changes reported GK errors, with ordinary adaptive errors unchanged.
The pilot gives no consistent speed benefit: circle-Z speed ratio is 0.935,
bent X 1.066 but Y 0.962/Z 0.967, and notched X/Y/Z 0.979/0.929/0.896.
Three blocks are insufficient to establish small performance effects; the
pattern does not justify adoption or a claimed speedup. Keep this as a negative
performance pilot, with possible error-reporting relevance separate from speed.
Raw rows and seeded summaries are in `results/kronrod-floor-volume-pilot.jsonl`
and `results/kronrod-floor-volume-pilot-summary.json`. The production SDK and
application do not use this patch.
