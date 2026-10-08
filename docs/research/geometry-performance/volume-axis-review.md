# Twisted sweep volume-axis candidate source review

Research-only review, 2026-10-08. No build, native run, or benchmark in this
lane. Reviewed current `native/kernel/main.cpp`, `geometry.cpp`, `booleans.cpp`,
extrusion construction, and pinned OCCT BRepCheck/BRepGProp implementation.
OCCT source pin: `a016080bf6738d6aeae020badee4e888ad1540a5` (7.9.3).
The orchestrator reports 33 regression cases and 24 ordered output/volume
comparisons passing; those results were not independently executed here.

## Scope and safety findings

- `twistedVolumeReferenceAxis` acts on nonzero twisted ordinary extrusions.
  It excludes `normalExtrusion`, zero twist, and other operation kinds. The
  requested normal is parsed finite and checked unit-length by `sweep` before
  this helper can run. Nonfinite twist is rejected during construction.
- The preferred axis is a coordinate axis with minimum absolute requested
  normal component. This minimizes its projection onto the twist direction,
  including negative normals. Equal components deterministically choose X;
  a diagonal direction cannot have a perpendicular coordinate axis, but the
  chosen axis is still a mathematically valid global unit flux direction.
- Only `new` or Union with no selected Boolean participants gets the hint.
  Implicit/explicit Intersect, Subtract, and actual Union with bodies retain
  their existing volume path. A multiprofile tool can already contain unions
  of swept regions; the common requested direction remains only a performance
  predictor, not a statement that each resulting face is a pure swept wall.
- `solids` extracts `TopAbs_SOLID`, calls `validate`, then calls hinted `volume`.
  The main routine additionally guards on solid shape type. The closed-boundary
  hypothesis is therefore supplied by the preceding validator, not by an enum
  alone: pinned `BRepCheck_Analyzer` checks shell context in its solid branch,
  and `BRepCheck_Shell::InContext(SOLID)` checks `Closed()` and orientation
  ([Analyzer solid branch](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/BRepCheck/BRepCheck_Analyzer.cxx#L294),
  [Shell solid-context closure/orientation](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/BRepCheck/BRepCheck_Shell.cxx#L176)). Root reversal is harmless to
  scalar absolute mass, provided relative shell orientations remain consistent.
- `std::rotate(begin,preferred,preferred+1)` moves the preferred axis first
  while retaining the original ordering of all other axes. Valid axis range
  ensures `find` succeeds. Invalid/out-of-range hints simply retain fallback
  order. Planar solids continue to use their existing ordinary integration.
- Every plane GK retry resets `GProp_GProps` in the public OCCT routine before
  accumulating any faces ([plane-GK properties reset](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/BRepGProp/BRepGProp.cxx#L670)), so a failed attempt
  does not contaminate the next axis. Returning a finite nonnegative error is
  the existing success criterion; it does not certify that requested `1e-10`
  accuracy was attained. This review does not strengthen that legacy contract.
- Draft and symmetry retain construction/validation paths. A concentric-circle
  twist may be recognized invariant and produce an ordinary drafted extrusion;
  the nonzero input twist still hints its mass axis. This is mathematically
  valid but expands the numerical corpus beyond noninvariant twisted walls.
  `normalExtrusion` cannot accidentally receive that hint even if stale draft
  or twist fields appear in its request.

The axis change affects scalar volume and minimum-solid-volume acceptance;
it does not edit the shape or history. `Result::exactVolume` carries the measured
mass into presentation, so no subsequent unhinted integration replaces it.
No source-level semantic blocker was found within this narrow call path.

## Strongest follow-up correctness check

Use a **fixed exported fitted BRep**, not a newly fitted sweep for every axis,
to isolate integration differences. Retain its complete encoding/topology and
test at the origin, modest translated placement, and `[1e6,-2e6,3e6]`. Include
eccentric circle, narrow elliptical or rounded slot, annular/multiple-hole
profile, cubic boundary, highly slender travel/profile aspect ratios, and
oblique nearly tied normal components. Include invariant concentric twist with
draft and a symmetric drafted result; test selected-body Boolean cases as
controls that must retain the prior path.

For analytically exact primitives and invariant sections, compare actual error
against known represented geometry volume. An ideal section-area-times-travel
number is useful for twisted fixtures but is not automatically a reference for
the kernel's fitted BRep. For nonanalytic fitted shapes, use independently
converged higher-precision integration or conservative enclosures before
claiming certified relative accuracy; agreement of two OCCT axes is insufficient.
Track actual relative error as `abs(candidate-reference)/abs(reference)` for
positive mass, alongside an explicitly chosen absolute floor. Existing harness
`max(1,abs(volume))` comparisons impose an absolute tolerance for small solids,
so they can conceal large relative errors on tiny fixtures.

Specifically sweep geometry scales straddling
`geometry_policy::minimumSolidVolumeMm3`; assert that scalar-mass changes do
not create/drop a result incorrectly relative to an independent material
reference. Also retain error/status and face/span conditioning traces. Earlier
thin-box evidence already shows that large translations can make an apparently
tiny integration estimate miss true volume by about `1.7e-6` relative. The
candidate changes which axis encounters that rounding; it does not cure it.

Because this optimization edits no geometry, compare full BRep encodings as
well where deterministic baseline repeats allow it. The current harness ignores
the `brep` field; metadata equality alone cannot prove representation identity.
Source immutability can be checked independently of expected native serialization
nondeterminism.

### Source-only native/harness proposal

Add a separate research executable `volume-placement.cpp`, with CLI
`INPUT.brep OUTPUT.jsonl [KNOWN_VOLUME]`. It would read and exactly validate the
exported original once, then create `TopoDS_Shape` value copies with root
`Moved` translations. Each copy must preserve the TShape and orientation;
keep the original encoding for a before/after equality check. A translation is
volume-preserving. Do not use `BRepBuilderAPI_Transform`, resample poles, rerun
the twist constructor, or call a healing routine in this comparison.

The executable would serially evaluate XYZ plane normals (and their negatives)
using identical span mode, eps, CG/inertia flags, and both literal and mirrored
low-bound references. Emit input provenance, placement, bounds, exact validation,
root orientation, mass, reported error, actual absolute/relative discrepancy
when a known volume is legitimate, and elapsed time as diagnostics. Retain
failures. Reuse the recenter primitive harness's public API pattern, but accept
external fitted BReps instead of constructing a different geometry for each run.
Any recenter comparison must be labeled separately from the production candidate.

Extend `verify-twist-volumes.mjs` only to prepare/export a small explicit corpus
via one baseline kernel, then invoke this executable sequentially under the
orchestrator's compute lock. Scale the existing eccentric-circle profile to
produce ordinary and tiny volume variants; add a slender noncircular ellipse
or rounded slot and an annulus with an eccentric hole. For the latter ensure
the inner radius/offset makes a legitimate contained hole before construction.
Keep draft and neutral-Auto variants. Known ideal mass follows section area
times signed travel magnitude only where the construction represents a genuine
constant-section exact solid; otherwise it is a nominal diagnostic, not an
assertion target for the fitted BRep. The exported file and kernel/source pin
must accompany every result.

Use independent acceptance fields: `sameMaterialInput`, `sameOrderedMetadata`,
`baselineCandidateAbsoluteDelta`, `baselineCandidateRelativeDelta`, and
`referenceRelativeError`. For valid positive known mass, accept requested
relative accuracy only with `abs(error) <= eps * abs(reference)` (plus explicitly
documented floating reference uncertainty), rather than `eps*max(1,reference)`.
Apply separate explicit absolute criteria near zero and classify minimum-solid
threshold cases independently. A baseline/candidate match is useful regression
evidence even when both are inaccurate; it must never be labeled reference
accuracy. This proposal adds no active implementation or run claim.

## Effect on fixed-V evaluator-cache priority

The reported circle pilot moves the bottleneck from pathological axial nested
quadrature to a much smaller integration workload. If the 40-block confirmation
and broader correctness checks hold, fixed-V polynomial/evaluator preparation
caching is no longer the first remedy for this particular circle case. Profiling
the remaining approximately 57 ms should determine its payoff; a cache cannot
save evaluations that the axis choice avoids entirely.

The cache remains attractive as a broadly applicable independent optimization:
shell extrema/projection and real Boolean/non-twist quadrature do not receive
this hint, and oblique/high-degree surfaces may still require many evaluations.
Its acceptance can preserve evaluation semantics more directly than an axis
policy. Keep a modest cache experiment after confirming the application change,
but avoid prioritizing a kernel fork solely from the old 2.5-second circle
profile. The mechanisms are complementary and their speedups must be measured
together rather than multiplied from separate pilots.

## Standalone diagnostic and initial runs

[volume-placement.cpp](../../../tests/geometry-performance/volume-placement.cpp) implements the public-API proposal
for a single exactly validated solid BRep. CLI:

~~~text
volume-placement INPUT.brep OUTPUT.jsonl [KNOWN_VOLUME|-] [all|x|y|z]
~~~

It runs 36 serial GK evaluations by default: three added translations, three
axes, two reference conventions, and two normal signs. Selecting one axis gives
12 evaluations, useful because the original axial case can take seconds.
The zero translation retains the input's existing location: the label means
an added displacement of zero, not global recentering. No new support fitting
occurs. Scalar mass comparisons use absolute signed mass while preserving the
signed value in output. With a legitimate supplied positive reference, failure
of actual relative `1e-10` accuracy produces exit 1; without a reference only
API failures or invalid/mutated input cause failure. No estimated-error value
is promoted to an actual-accuracy assertion. Output paths must be new.

The code emits source pin, exact-validation result, original encoding hash/size,
placement/identity/bounds, all explicit flags, API status, mass, optional true
relative/absolute reference discrepancy, and diagnostic timing. Hashes are
string-encoded to avoid JSON integer precision loss; source immutability uses
full byte comparison. Every placement shares the original TShape and orientation.

Build and run only while holding the orchestrator compute lock:

~~~sh
c++ -O2 -std=c++20 -I .cache/kernel/sdk/include/opencascade \
  tests/geometry-performance/volume-placement.cpp \
  -L .cache/kernel/sdk/lib -Wl,--disable-new-dtags -Wl,-rpath,"$PWD/.cache/kernel/sdk/lib" \
  -lTKTopAlgo -lTKBRep -lTKGeomBase -lTKG3d -lTKG2d -lTKMath -lTKernel \
  -o /tmp/volume-placement
/tmp/volume-placement fitted.brep placement.jsonl - x
~~~

Caller must keep the exported BRep and binary/toolkit provenance alongside JSONL.
Known volume validity and reference uncertainty remain the caller's responsibility.

The orchestrator compiled this diagnostic with GCC, `-O3 -DNDEBUG -std=c++20`
and the pinned baseline SDK. Legacy RPATH (`--disable-new-dtags`) is required
for SDK transitive dependencies on this machine; the first RUNPATH-only build
failed to load TKGeomAlgo before performing any geometry work. Native reply
`brep` strings are hexadecimal, and must be decoded into raw bytes for this
standalone BRepTools reader. The initial hex-as-file attempt was rejected before
creating measurement output; retained `.brep` fixtures contain decoded bytes.

All 36 invariant-circle/cylinder measurements pass actual relative 1e-10
against the exact cylinder volume (double reference uncertainty approximately
machine precision), across all three placements, axis signs, and conventions.
All 36 fitted offset/twist evaluations also complete with unchanged source
encoding/location/orientation. Without a certified independent fitted-volume
reference, translation invariance is the comparison: maximum discrepancy from
the same-axis origin result is 3.64e-12 for X, 1.20e-10 for Y and 4.13e-10 for Z.
The candidate uses X on this Z-direction fixture. These observations do not
certify the unknown fitted volume or arbitrary hinted axes. Maximum reported
error exceeds requested tolerance substantially (X 1.66e-6, Y 3.01e-6,
Z 4.37e-5), yet OCCT status remains successful. The pre-existing finite/nonnegative
acceptance rule therefore is not a convergence guarantee. Even the invariant
cylinder's Z error estimate reaches 1.19e-9 while its actual error stays below
2.45e-11. All these are accuracy diagnostics, not statistical speed measurements.

Raw BReps, placement JSONL and `twist-volume-axis-placement-summary.json` are
retained under `results/`. Binary SHA256: baseline application
`a11de7309c47e9f98b9bc03772b83bc07615d20b0984e59f3223bfee9ad3c151`,
hinted application `bae92a96e28acfeab31f1ed52090246d8129b59ee21660e719e1df150b99cad3`,
diagnostic `0660f3a34ee5e5c59702617295da99a000f4412c9f086b629012ef6a452860fd`.
