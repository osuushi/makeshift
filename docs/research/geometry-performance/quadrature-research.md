# Volume quadrature, cancellation, and reference planes

Research-only source analysis, 2026-10-08. No kernel/application modification or
benchmark was performed for this note. Source pin:
`a016080bf6738d6aeae020badee4e888ad1540a5` (OCCT baseline source revision recorded by the main investigator).

## Runtime observations supplied by the main investigator

These are individual observations, not a paired statistical result:

| Circle fixture method | Time | Mass | Reported error |
| --- | ---: | ---: | ---: |
| GK, Z reference | 2518 ms | 6283.185307474675 | 7.55e-11 |
| GK, X reference | 2.05 ms | 6283.185307179816 | 1.05e-11 |
| GK, Y reference | 1.69 ms | 6283.185307179812 | 1.81e-11 |
| Ordinary adaptive | 2.47 ms | 6283.185307179566 | Not supplied |
| Analytic reference | — | 6283.185307179586 | — |

Z's mass discrepancy is about 2.951e-7, or 4.70e-11 relative to the analytic
reference. X/Y discrepancies are approximately 2.3e-10 absolute. Consequently
Z is dramatically slower without producing the closest result. The main
investigator also reports a bent fixture where ordinary integration misses by
0.163 mm³ despite reporting error approximately 4e-15, and a notched fixture
where GK reference axes differ by approximately 2.6e-5 at requested eps=1e-10.
Those results prohibit replacing GK globally with ordinary integration or
accepting a faster axis solely because its estimated error is small.

## What the pinned source actually does

1. [`BRepGProp::VolumePropertiesGK` and `volumePropertiesGK`](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/BRepGProp/BRepGProp.cxx#L577)
   accumulate signed per-face mass and estimated absolute errors, then divide
   total error by positive total mass. The same requested tolerance is passed
   to each face; it is not an explicitly allocated whole-solid absolute budget.
2. [`BRepGProp_VinertGK::PrivatePerform`](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/BRepGProp/BRepGProp_VinertGK.cxx#L278)
   integrates each boundary curve span with outer relative tolerance `0.9*eps`,
   and uses inner tolerance `0.1*eps/(t2-t1)`. Each nested call permits 1000
   iterations. Reported outer error is added to the maximum observed inner
   absolute error multiplied by boundary-span length.
3. [`BRepGProp_TFunction::Value`](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/BRepGProp/BRepGProp_TFunction.cxx#L56)
   performs the inner U integration, multiplying afterward by the pcurve's V
   derivative. It skips an inner integral when that derivative is below
   `Precision::Angular()`. It does not skip a nearly zero surface integrand.
4. [`BRepGProp_UFunction::VolumeValue`](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/BRepGProp/BRepGProp_UFunction.cxx#L75)
   evaluates D1 through [`BRepGProp_Face::Normal`](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/BRepGProp/BRepGProp_Face.cxx#L194).
   The normal is the oriented, **unnormalized** `Du × Dv`. By-plane mass uses
   `(normal·n) * ((P-location)·n-coeff[3])`. This is signed flux, not positive
   face area; individual contributions can be zero or cancel heavily.
5. [`math_KronrodSingleIntegration::Perform`](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/math/math_KronrodSingleIntegration.cxx#L143)
   divides absolute estimated error by `abs(integral)` whenever that integral
   exceeds `Epsilon(1.)`. Below that fixed, dimensionless threshold it compares
   absolute error to the same tolerance number. A local integral of 1e-12 with
   requested tolerance 1e-11 therefore demands roughly 1e-23 absolute error.
   A value slightly below machine epsilon instead gets an absolute comparison:
   there is a discontinuity in stopping behavior.
6. The same routine returns on iteration cap or stagnation `count > 50` without
   setting failure or requiring tolerance to have been met. `count` is cumulative,
   incremented on tiny value changes or tiny accumulated errors, not reset after
   useful progress. Thus `IsDone()` means evaluated successfully, not certified
   convergence. [`GKRule`](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/math/math_KronrodSingleIntegration.cxx#L282)
   estimates error from a Gauss/Kronrod discrepancy with an `asc` rescaling. It
   supplies no rigorous enclosure or explicit roundoff floor.
7. [`BRepGProp_Face::GetUKnots/GetTKnots`](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/BRepGProp/BRepGProp_Face.cxx#L635)
   provide U surface knots and outer pcurve knots for spline span decomposition.
   Span mode improves partitioning but does not solve signed cancellation.

This pipeline uses nested one-variable `math_Function` scalar outputs, not
`math_MultipleVarFunction`. The latter also has a scalar `Standard_Real& F`
output for multiple input variables, but is not the quadrature path here.

Ordinary adaptive integration has a different error policy.
[`BRepGProp_Gauss::Compute`](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/BRepGProp/BRepGProp_Gauss.cxx#L943)
scales tolerance using accumulated mass (the checked-in `IS_MIN_DIM` define is
enabled), and returns maximum subinterval error divided by face mass.
[`volumeProperties`](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/BRepGProp/BRepGProp.cxx#L310)
then returns the maximum face estimate. That estimate is not interchangeable
with GK's sum of estimated absolute face errors divided by total mass. Neither
is a proof that actual mass error is bounded by the reported number.

## Why Z can be pathological

Inference to test: a circle twisted about Z is geometrically close to a straight
cylindrical extrusion. Its side face has `normal·Z` identically zero for an exact
cylinder, but tiny nonzero values for a numerically represented spline surface
or its floating-point D1 evaluation. The nested inner integral may then have a
very small signed mass, while quadrature discrepancies and derivative noise
remain significant relative to that mass. Outer quadrature repeats the expensive
inner refinement at many pcurve parameters. X/Y give substantial side-face flux
and avoid that particular small denominator. Source supports this mechanism;
per-face/per-span traces are still needed to establish it for the actual fixture.

## A reference-plane sign issue to verify separately

[`gp_Pln::Coefficients`](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/gp/gp_Pln.hxx#L288)
returns `D=-n·origin`. [`VinertGK::Perform(plane)`](https://github.com/Open-Cascade-SAS/OCCT/blob/a016080bf6738d6aeae020badee4e888ad1540a5/src/BRepGProp/BRepGProp_VinertGK.cxx#L247)
sets `coeff[3]=D-n·location`, while `VolumeValue` subtracts that coefficient.
Algebraically its distance factor becomes `n·P-D`, or `n·(P+origin)`.
Thus the literal implemented flux uses the mirrored plane coordinate, rather
than the plane supplied by the caller. An axis plane at lower bound minus one
need not be exterior in the implemented integral.

For a closed consistently oriented solid, shifting a flux reference leaves the
exact volume unchanged by the divergence theorem. It can still alter numerical
cancellation profoundly. Test translated analytic boxes/cylinders and opposite
plane origins before deciding whether to patch this convention. Open faces and
historical compatibility require additional care; do not silently change it.

## Small experiments, ordered by safety

1. **Instrumentation first:** log inner/outer iteration counts, requested and
   achieved errors, signed integral, integrated absolute magnitude, face/span
   index, early-return reason, and `normal·axis` ranges. Keep timing runs separate
   from tracing. This distinguishes tiny flux from localized trimming problems.
2. **Exact structural zero recognition:** for mass-only plane integration,
   an analytic surface extruded parallel to `n` has identically zero projected
   Jacobian. A BSpline span can also be certified when its two transverse
   homogeneous coordinate ratios are independent of V: a sufficient restricted
   case has exactly equal transverse poles and equal weights across all V rows
   for each U index. Such a certificate can skip exactly zero side flux without
   relaxing tolerance. Do not infer this from sampled tiny normals, approximate
   circular symmetry, or V degree alone. Rational weights, transformations, and
   trimmed/offset surfaces must satisfy the certificate explicitly. The circle
   twist fixture may fail this sufficient certificate; that is a valid result.
3. **Opt-in absolute-budget experiment:** add an explicit absolute tolerance to
   the mass-only nested integrator, allocated across faces/spans and propagated
   through `abs(pcurve derivative)`. Stop when the summed absolute estimate meets
   a solid budget, rather than forcing relative accuracy on every tiny term.
   An enclosure `[Vhat-E,Vhat+E]` with `E <= eps*abs(Vhat)/(1+eps)` would imply
   relative accuracy against the true volume **if E were a rigorous bound**.
   The existing GK discrepancy is not such a bound. Treat this as experimental
   until validated against independent analytic/high-precision references.
   A bounding-box volume can provide a scale for initial work allocation, but
   cannot justify final relative tolerance: thin/sliver solids can occupy an
   arbitrarily tiny fraction of their box. A coarse estimated volume likewise
   needs uncertainty accounting and a retry path.
4. **Condition-aware reference selection:** degree/support information can rank
   axes for likely cost, but cannot certify a returned mass. Pole intervals can
   bound projected Jacobians per rational span if weights stay positive; zero
   certificates are useful, while generic degree heuristics are only predictors.
   Cross-axis agreement and tighter reruns strengthen evidence without proving
   accuracy; the notched fixture demonstrates why blind axis switching is unsafe.

The smallest broadly applicable optimization preserving the existing arithmetic
is the independent surface-evaluation cache experiment. Quadrature stopping or
reference changes intentionally alter evaluated samples and results, so require
their own correctness criteria; bit identity is not an appropriate acceptance
criterion for those mathematical changes.
