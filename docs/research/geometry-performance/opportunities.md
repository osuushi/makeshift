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
| Prefer transverse global flux for unmodified twisted extrusion volume | Circle offset/twist New 43.18× and neutral Auto 43.34×, about 2.5 s→58 ms | 40 pairs; 24 byte-identical BReps; 33 regressions; additional placement and 16 scale/slender checks | Pathological fixture; no universal accuracy claim; 120-pair cubic control shows small 2.4% regression requiring localization |
| One centered prism for plain symmetric extrusion | Perforated 2.65×; box 6.25× | 40 blocks; 20 two-way material checks; signed/draft/location cases | Removes artificial midpoint seams; topology counts intentionally differ |
| Parallelize strict Shell checks | Several successful shells 1.18–1.28× | 20 blocks; original predicates/tolerances retained | Thread benefit depends on available CPU; no general thread-count policy |
| Remove repeat validation of unchanged Shell source | Successful shells 1.05–1.23× | 40 blocks; mutation audit; five Shell files and captured Erode pass | Adjacent Erode sphere-plane-fillet also fails on original baseline |
| Cache ray setup and lazy exact UV sampling per body | Perforated unions 1.13–1.18× | 30 blocks; full metadata; focused reverse/located/repeated-query tests | Unchanged geometry, serial request lifetime; ray setup alone showed no reliable gain |
| Retain already computed implicit Intersect Common/history | 1.25× on perforated case | 40 blocks; ordered full output; multi-target Undo/Redo/Open checks | Explicit route unchanged; positive Common is specific to immutable pair |
| Reuse positive Common PaveFiller for subsequent Cut, completing pairs as they are classified | Fresh cubic 1.20×/1.30× at 1/16 targets; preserves retained-reuse timing while reducing cubic n16 HWM 14.53 MiB | 20 fresh paired blocks, three strategies; 26 regressions; Auto/disjoint pilot | Perforated gains about 3%; focused failure/repair controls remain pending; memory benefit varies |
| Reuse directed tangent-face continuity/adjacency per presentation | Two cases about 1.03–1.04×; most cases within noise | 40 blocks; 159 exact ordered native comparisons; ten test files | Modest measured gain; unchanged topology and orientation/location keys required |

These remain research-branch changes. Review final combined behavior, build
provenance and integration policy before representing them as a shipped release.

## Kernel prototype and follow-up ranking

| Priority | Opportunity | Evidence and expected value | Effort / risk |
| --- | --- | --- | --- |
| 1 | Fixed-V BSpline polynomial stage reuse | Bit-identical evaluator/mass/error checks; after application axis improvement, bent Shell 1.034× in 40 pairs; circle 1.020× compatible with noise | Narrow fork, medium integration effort; matching TKMath/TKG3d rebuild; earlier pathological gain is not an additional current benefit |
| 2 | Correct quadrature conditioning and whole-solid error budgets | One circle has over 22 million D1 calls per traced warm+measured pair; alternative axes need orders of magnitude fewer. Near-zero local relative targets explain wasted work | High algorithm effort; correctness first. Axis/method switching alone lacks a sufficient accuracy contract |
| 3 | Mass-only value recentering | Analytic located/nested thin-box counterexample corrected without source mutation; 30-pair application test shows only 1.029× on circle and no broad gain, prototype reverted | Low implementation effort, medium numerical-policy risk; cannot repair construction roundoff in intrinsic world-coordinate supports |
| 4 | Batch compatible Boolean operands | Forty-block kernel confirmation: dense sixteen-tool Fuse 3.72×, Cut 2.84×; oblique 2.56×/2.04× | Medium effort; application history, intermediate fuzzy tolerance and topology must be verified |
| 5 | Extend streaming preprocessing validation | Current candidate removes cubic n16 retention penalty with no resolved speed loss | Complete exceptional/repair and source-state checks before broad robustness claims |
| 6 | Targeted upstream lookup/location/cache backports | Pinned applicability audited; several release-summary changes miss normal closed-solid paths | Instrument hit counts before implementing; small changes may have little end-to-end value |

Projection extrema setup reuse was a measured negative result across thirty
paired blocks; its patch is retained and production source reverted. Do not repeat
it as a presumed win. Hardware-specific GPU paths, mesh fallbacks and preview
masking remain outside this investigation.

The current evidence establishes avoidable application work and a specific
kernel evaluator bottleneck. It does not establish OCCT's fundamental performance
ceiling or parity with any proprietary kernel.

Quadrature roundoff-floor pilot preserves volume values but offers no consistent
speed benefit. Prepared-rule table caching has byte-identical scalar and captured
volume outputs, but forty-block confirmation finds no resolved speed benefit. Neither kernel
patch is installed in the production SDK.

Contiguous interval storage is a more promising narrow prototype: forty paired
blocks show 1.039× circle-Z and 1.021× bent-X integration gains with identical
mass/error bits. Application benefit is unmeasured and may be very small after
axis conditioning. Analytic ray setup reuse is prepared for testing; allocation
counts and robust lifetime controls must precede any speed claim.
