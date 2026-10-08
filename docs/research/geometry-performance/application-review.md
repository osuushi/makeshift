# Application geometry optimization source review

Source-only review, 2026-10-08, compared with Makeshift baseline `7861122`.
Reviewed application source at HEAD `27a797d` and current production files;
no production edits, compilation or benchmarks performed. OCCT source pin is
`a016080bf6738d6aeae020badee4e888ad1540a5` (7.9.3). No kernel preload candidate
is installed in the SDK. This review identifies source constraints and missing
gates; it is not a new passing-test report.

## Conclusion and strongest remaining gates

No new deterministic geometry/history blocker was found in the inspected
application paths. The strongest open correctness gate is **independent scalar
mass accuracy on tiny/slender and translated fitted geometry**, including result
acceptance around minimum-solid volume. Stable baseline/current outputs alone
cannot establish it. Streaming's successful-path ownership and original target
ordering are supported by source; eager execution is intentionally different,
so a general exception/allocator trace equivalence claim would be incorrect.

### Twisted scalar-volume hint: bounded application candidate, numerical policy

[twistedVolumeReferenceAxis](../../../native/kernel/geometry.cpp#L90) chooses a
coordinate axis with smallest absolute requested extrusion-normal component.
It runs only for nonzero ordinary extrusion twist, excluding normal extrusion
and other operation kinds. The tool was already constructed with finite unit
normal checks, finite twist validation and geometry validation. Negative travel,
normal sign and diagonal ties do not invalidate a **single global** flux axis.
The diagonal tie picks X; it need not be perfectly perpendicular to be valid.

Call sites are `new` and Union with no selected participants
([calculateSweep](../../../native/kernel/geometry.cpp#L129)); actual body Boolean
outputs and implicit overlap classification retain the existing integration
policy. Input twist can be nonzero even when a concentric profile is invariant
and construction returns an ordinary draft; that case still receives the hint.
Multiprofile swept regions may have been unioned into the tool already, so this
is a heuristic about conditioning, not a certificate of zero axial side flux.

[solids](../../../native/kernel/booleans.cpp#L106) exactly extracts solid shapes,
calls existing validation, then supplies the hint to volume. The OCCT
[Analyzer solid branch](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/BRepCheck/BRepCheck_Analyzer.cxx#L294)
and [shell solid context](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/BRepCheck/BRepCheck_Shell.cxx#L209)
check closure/orientation; relying on TopAbs_SOLID alone would not suffice.
[volume](../../../native/kernel/main.cpp#L72) puts the preferred axis first and
retains remaining fallback order. Each GK retry
[resets properties](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/BRepGProp/BRepGProp.cxx#L670),
so failed partial properties do not accumulate across axes.

**Concrete limitation:** the success gate remains finite nonnegative reported
error, not `reported_error <= requested_eps`, and reported error is not an
actual enclosure. Choosing a faster accepted axis can change scalar mass and
therefore result inclusion at `minimumSolidVolumeMm3`. Existing plane-origin
sign convention and world-coordinate cancellation remain untouched. Required
gates: fixed exported BRep at added modest/far translations; slender/eccentric
and perforated profiles; invariant draft, symmetry and oblique ties; actual
relative known-reference error for small positive mass, not a `max(1,mass)`
comparison floor. Fitted ideal sweep volume must remain nominal unless it is
a valid reference for the represented BRep. Details in volume-axis-review.md.

### Common → Cut: ownership is correct; error order is deliberately bounded

[BooleanProbe](../../../native/kernel/booleans.cpp#L92) owns source/tool values
and the completed Common builder. A Cut constructed from its DSFiller borrows
that filler; the pinned
[BuilderAlgo constructor/destructor](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/BRepAlgoAPI/BRepAlgoAPI_BuilderAlgo.cxx#L39)
records `myIsIntersectionNeeded=false` and does not delete a borrowed filler.
[BOPAlgo_Builder](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/BOPAlgo/BOPAlgo_Builder.cxx#L315)
uses the filler DS/context and copies its fuzzy/non-destructive settings.
Application source keeps the Common alive for the entire Cut build, repair,
validation and history extraction. Shared filler builds are sequential, not
concurrent. Sources/tools, fuzzy choice and argument order match the completed
pair; history remains enabled. These are essential conditions, not a generic
permission to reuse filler data after operand mutation.

If Cut repair changes source topology,
[finishBoolean](../../../native/kernel/booleans.cpp#L68) explicitly constructs a
new default Cut rather than borrowing old data, preserving the original pair's
fuzzy tolerance. This prevents reuse of stale intersection topology. The
ordinary booleanShape path uses the same finish/mapOrigins logic; implicit
Intersect maps the retained Common history rather than rerunning construction.

[StreamingSweepCuts::add](../../../native/kernel/streaming-sweep-cuts.h#L18)
immediately finishes positive pairs and retains owning TopoDS result/history
values or an exception_ptr. The local Common is then destroyed; no filler,
builder reference or non-owning history-list pointer is retained. Operand
pointers target the unchanged request bodies vector, whose lifetime encloses
classification and result assembly. append locates those same bodies and
materializes solids in original selected-body order, after participants have
been appended. Empty/null successful Cut results remain consumed successes,
not fresh Cut retries.

[calculateSweep](../../../native/kernel/geometry.cpp#L137) streams implicit
Subtract and Auto, including explicit Auto. Explicit non-Auto targets retain
their fresh path. With explicit Auto, nonpositive explicit targets remain in
the final selected list and fall back to fresh Cut if any positive target makes
Auto subtract. Fully neutral Auto still performs Union with its original
explicit-target semantics. `eligibleTargets`/target filtering occurs before
probe construction. The overlapping/disjoint mixture is a necessary control,
not only the all-positive case.

**Error boundary:** Cut exceptions caught in add are replayed only when that
body is reached in selected order. Later classification errors can therefore
still precede them, as classification preceded all final Cuts in baseline.
However solid extraction/volume failures occur in append and are not deferred;
precomputed Cut/history creation happens earlier, and allocator failures during
pending.push_back are outside the catch. A failed earlier append stops later
results even though their Cuts may already have run. Do not claim equality of
all execution, resource-failure or debug-dump traces. No geometry result is
returned after the request fails. Known OOM/classifier-error/eager-Cut cases
need explicit documentation and focused controls rather than a broad parity
assertion. Source-only review found no new uncaught lifetime bug.

Remaining useful gates: periodic-seam repair on reused filler; multi-solid/null
Cut results; explicit Auto with positive/contact/disjoint targets and filtering;
stable full predecessor metadata; repeated request source encoding; and failure
priority between classification, earlier append and stored later Cut exceptions.
The storage grows with final result/history, not retained fillers; linear
pending lookup gives quadratic body-lookup work at very large target counts,
a performance limit rather than changed geometry semantics.

### Other integrated changes and their constraints

- [Result::exactVolume](../../../native/kernel/kernel.h#L26) reuses scalar mass
  measured by solids in [presentation](../../../native/kernel/presentation.cpp#L186).
  Current calls do not mutate support geometry after setting it; meshing adds
  derived representations. It is still a mutable public Result field: future
  geometry edits must clear/recompute it. Ordinary center-of-mass integration
  remains separate, so a better mass hint does not certify the reported center.
- [OffsetThicknessContext](../../../native/kernel/offset-thickness.cpp#L107)
  and [FaceChainContext](../../../native/kernel/face-chains.cpp#L45) are serial,
  request-local and constructed after preparation/meshing. Sample keys retain
  face orientation/location, point results are copied before reverse translation,
  and reverse source classifier/ray/tie checks remain. Continuity caches ordered
  pairs, preserving asymmetric projection and BFS edge/neighbor order. They must
  not survive mutations or be concurrently reused. Public sample u/v range is
  an internal precondition (currently all callers use 1–11), not a checked API.
- [Plain symmetric prism](../../../native/kernel/extrude-symmetric.cpp#L32)
  deliberately removes artificial midplane face seams. It keeps the existing
  half-depth draft threshold and skips twist-present inputs. This has material
  equivalence gates, not face-count/identity parity. Downstream attachment/edit
  behavior on changed topology needs model tests beyond identical solid volume.
- Shell duplicate-validation removal follows a validated preparation/modifier
  lifecycle; post-mutation predicates remain. Fresh parallel validator/extrema
  configuration preserves requested exact checks but does not constitute a
  thread-safety proof. Run the existing model corpus at production worker count
  and serial controls; retain nondeterministic representation differences.

## Ready application paths versus isolated prototypes

The above files are current application candidates/integrated research-branch
changes. Their combined baseline/current run must use immutable binaries and
record complete output, input, thread/toolkit provenance and model regressions.
Geometry multiset rounding and the perforated-shell descriptor reconciliation
are diagnostics; they do not replace authoritative ordered metadata or exact
material checks when topology intentionally changes.

Fixed-V evaluator, roundoff-floor, quadrature-table/interval-storage, ray setup,
ray-range and recenter artifacts remain **isolated research prototypes**.
None is adopted by the untouched SDK. Passing isolated scalar/probe tests or
allocation counts does not establish a production speedup or broad correctness.
Do not combine these libraries into the application confirmation implicitly.
