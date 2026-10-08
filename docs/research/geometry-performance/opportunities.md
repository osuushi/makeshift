# Measured opportunities and next priorities

Checkpoint: 2026-10-08, research branch `research/geometry-performance`.
Numbers below are isolated paired experiments on this instance, not a comparison
with Parasolid or a prediction for every machine. Do not multiply isolated gains
to claim an unmeasured combined gain. Full methods and raw measurements are in
[the investigation log](README.md).

## Validated application changes on the research branch

| Change | Observed benefit | Evidence | Main limitation |
| --- | --- | --- | --- |
| Reuse the final solid's already computed exact volume | Circle offset/twist request 1.93× | 20 paired blocks; ordered output and regression checks | Only reusable for the identical final unchanged solid |
| Prefer transverse global flux for unmodified twisted extrusion volume | Circle offset/twist New 43.18× and neutral Auto 43.34×, about 2.5 s→58 ms | 40 pairs; 24 byte-identical BReps and relative volume delta ≤5.10e-11; 33 regressions | Pathological fixture; no arbitrary-extrusion claim; large-placement/tiny-volume accuracy follow-up pending; unchanged controls being retested |
| One centered prism for plain symmetric extrusion | Perforated 2.65×; box 6.25× | 40 blocks; 20 two-way material checks; signed/draft/location cases | Removes artificial midpoint seams; topology counts intentionally differ |
| Parallelize strict Shell checks | Several successful shells 1.18–1.28× | 20 blocks; original predicates/tolerances retained | Thread benefit depends on available CPU; no general thread-count policy |
| Remove repeat validation of unchanged Shell source | Successful shells 1.05–1.23× | 40 blocks; mutation audit; five Shell files and captured Erode pass | Adjacent Erode sphere-plane-fillet also fails on original baseline |
| Cache ray setup and lazy exact UV sampling per body | Perforated unions 1.13–1.18× | 30 blocks; full metadata; focused reverse/located/repeated-query tests | Unchanged geometry, serial request lifetime; ray setup alone showed no reliable gain |
| Retain already computed implicit Intersect Common/history | 1.25× on perforated case | 40 blocks; ordered full output; multi-target Undo/Redo/Open checks | Explicit route unchanged; positive Common is specific to immutable pair |
| Reuse positive Common PaveFiller for subsequent Cut | Warm perforated implicit routes 1.045–1.055×; fresh serial cubic 1.17×/1.33× at 1/16 targets | 40 warm blocks; 20 fresh-process confirmations; full output and disjoint controls | Cubic sixteen-target peak memory increases about 14.3 MiB; perforated sixteen-target speed gain absent |
| Reuse directed tangent-face continuity/adjacency per presentation | Two cases about 1.03–1.04×; most cases within noise | 40 blocks; 159 exact ordered native comparisons; ten test files | Modest measured gain; unchanged topology and orientation/location keys required |

These remain research-branch changes. Review final combined behavior, build
provenance and integration policy before representing them as a shipped release.

## Kernel prototype and follow-up ranking

| Priority | Opportunity | Evidence and expected value | Effort / risk |
| --- | --- | --- | --- |
| 1 | Fixed-V BSpline polynomial stage reuse | Bit-identical D1, mass and error checks; circle integration 1.51×, application 1.52×; bent integration 1.22× | Narrow fork, medium integration effort; private cache layout requires matching TKMath/TKG3d rebuild and source availability |
| 2 | Correct quadrature conditioning and whole-solid error budgets | One circle has over 22 million D1 calls per traced warm+measured pair; alternative axes need orders of magnitude fewer. Near-zero local relative targets explain wasted work | High algorithm effort; correctness first. Axis/method switching alone lacks a sufficient accuracy contract |
| 3 | Mass-only value recentering | Analytic located/nested thin-box counterexample corrected without source mutation; 30-pair application test shows only 1.029× on circle and no broad gain, prototype reverted | Low implementation effort, medium numerical-policy risk; cannot repair construction roundoff in intrinsic world-coordinate supports |
| 4 | Batch compatible Boolean operands | Forty-block kernel confirmation: dense sixteen-tool Fuse 3.72×, Cut 2.84×; oblique 2.56×/2.04× | Medium effort; application history, intermediate fuzzy tolerance and topology must be verified |
| 5 | Retention budgeting or streaming many-target preprocessing | Peak-memory increase depends strongly on geometry; cubic benefit remains clear | Medium effort; preserve operation/error ordering and immutable-operand assumptions |
| 6 | Targeted upstream lookup/location/cache backports | Pinned applicability audited; several release-summary changes miss normal closed-solid paths | Instrument hit counts before implementing; small changes may have little end-to-end value |

Projection extrema setup reuse was a measured negative result across thirty
paired blocks; its patch is retained and production source reverted. Do not repeat
it as a presumed win. Hardware-specific GPU paths, mesh fallbacks and preview
masking remain outside this investigation.

The current evidence establishes avoidable application work and a specific
kernel evaluator bottleneck. It does not establish OCCT's fundamental performance
ceiling or parity with any proprietary kernel.
