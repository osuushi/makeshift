# Stokes quadrature literature and cancellation-aware volume research

Research-only reading, 2026-10-08. No compilation, geometry execution, or
benchmark in this lane. This note distinguishes published results from our
proposed algorithms. It supplements [quadrature-research.md](quadrature-research.md)
and [quadrature-translation-research.md](quadrature-translation-research.md).

## Accessible texts actually read

| Source | Access and reading scope | Exact accessible URL |
| --- | --- | --- |
| Gunderman, Weiss, Evans, *High-accuracy mesh-free quadrature for trimmed parametric surfaces and volumes*, Computer-Aided Design 141 (2021), 103093, DOI 10.1016/j.cad.2021.103093 | Full arXiv v2 HTML, dated 2 January 2022: introduction, algorithm sections 2.1–2.3, numerical methodology/results 3.1–3.7, conclusions, appendices A/B. Publisher full text and linked supplementary plots were not read. This supersedes the earlier abstract-only reading. | https://arxiv.org/html/2101.06497 |
| Gunderman, Weiss, Evans, *Spectral mesh-free quadrature for planar regions bounded by rational parametric curves* | Accessible arXiv v2 HTML, dated 14 September 2020. Read introduction, sections 2.1–2.7 including pole/exactness construction, selected numerical results 3.2–3.5, discussion 4, and worked circle example excerpts. Did not independently audit the referenced rational quadrature library or all appendices. | https://arxiv.org/html/2005.07780 |
| QUADPACK `dqagse`, Piessens/de Doncker | Complete public Fortran routine/prologue, including global error bookkeeping and termination. Original source states revision 18 May 1983. This is implementation evidence, not a trimmed-surface paper. | https://www.netlib.org/quadpack/dqagse.f |
| QUADPACK `dqk21` | Complete public Fortran routine/prologue, including error rescaling and roundoff floor. | https://www.netlib.org/quadpack/dqk21.f |

### Published trimmed-surface/volume method

The 2021 paper applies surface-coordinate Green integration after a divergence
reduction of volume (§§2.1–2.2). It uses rational Bézier patches, with NURBS
extraction, oriented parameter-space trim curves, and nested Gaussian rules.
The volume antiderivative direction is arbitrary (§2.2); implementation uses Z,
a control-point lower bound for its reference, and zero parameter reference
(§2.3.1). Untrimmed patches use tensor-product rules and exact vanishing
boundary terms (§2.3.2). Tests increase equal Gaussian orders nonadaptively
(§3.3); adaptivity is future work (§4). Geometry approximation causes a separate
error plateau (§3.7). The reported comparisons use mesh/octree alternatives
and unoptimized MATLAB, not OCCT (§3.4). Thus the paper supports exact-boundary
high-order integration, but supplies no globally budgeted cancellation-aware
error certificate or demonstrated native-kernel speedup. Its third integration
for the volume antiderivative is unnecessary for constant-density scalar mass:
that antiderivative is already elementary.

### Published rational planar method

The 2020 paper's Spectral PE rule integrates polynomial planar fields over
rational-curve boundaries using known denominator poles and multiplicities
(§2.4). Ordinary Gaussian outer rules lack that rational exactness. Positive
weights exclude denominator roots on the integration interval (§2.5.3).
Polynomial-basis conversion in its prototype root calculation loses precision
at higher degree (§2.5.1). A distant antiderivative reference increases floating
point instability (§2.5.2). Multiple oriented loops are supported (§2.7).
Nonpolynomial fields still need refinement (§3.4). Extension of polynomial
exactness to general rational surfaces is identified as future research because
their poles can form algebraic curves (§4). Its planar result therefore offers
a plausible specialized planar-face experiment, not an exactness guarantee for
our freeform BRep mass calculation. MATLAB timings (§3.5) do not establish OCCT
performance.

### Global adaptation precedent

QUADPACK `dqagse` maintains the sum of subinterval absolute error estimates,
refines a high-error interval, and compares against an absolute/relative global
target (source lines 166–187, 278–347). It reports subdivision, roundoff, and
nonconvergence failures rather than equating successful evaluation with accuracy
(prologue lines 57–103). `dqk21` floors its error estimate at approximately
50 machine epsilons times estimated integral of the absolute integrand
(lines 175–179). These are practical safeguards, not rigorous enclosures. They
do not bound error in externally supplied noisy geometry evaluations or nested
inner integrals automatically. Their public implementation is a useful design
reference; copying a one-dimensional API wholesale would leave our nested
error propagation unresolved.

## Our derivation: what a mass-only axis change can preserve

Let `a` be one fixed unit direction and `c` one fixed reference point. Define
`F(x) = a * dot(a, x-c)`. Its divergence is one, so for a closed consistently
oriented boundary,

~~~text
V = integral_boundary dot(a, N(x)) * dot(a, x-c) dA
  = sum_faces integral_trimmed_UV dot(a, Ru cross Rv) * dot(a, R-c) du dv.
~~~

Here `Ru cross Rv` includes face orientation and is unnormalized. Translation
of `c` cancels over a closed boundary in exact arithmetic. A global X, Y, Z or
other unit axis is mathematically legitimate for scalar mass. This proof says
nothing about roundoff, the API's mirrored-plane convention, error estimates,
or open shells. Changing individual faces to unrelated flux axes generally
breaks the shared divergence identity; the missing correction cannot be assumed
zero. By contrast, swapping the *parameter integration* direction U/V on a
face is a local change of integration coordinates and can preserve the same
physical flux when trim orientation and boundary terms are handled correctly.

The published untrimmed exact-zero terms establish a useful principle: skip
only structurally absent work. For the mass flux above, a plane containing `a`,
or an exact extrusion parallel to `a`, has projected Jacobian identically zero.
Restricted rational control-net identities can prove the same fact, as detailed
in the translation note. A small sampled `dot(a,N)`, near alignment, a tiny
quadrature result, or an approximate analytical recognition is insufficient.
Such predicates would remove possibly meaningful signed material. Certificates
must account for located supports, orientation, rational weights, and offset
wrappers; this is our mathematical proposal, not a result implemented by the
read papers.

## Our derivation: why nested relative targets can waste work

For signed contributions `Ii`, independent bounds `|error_i| <= eps*|Ii|`
would yield `|total_error| <= eps*sum_i |Ii|`. Define the cancellation ratio
`kappa = sum_i |Ii| / |sum_i Ii|`. Then the implied global relative bound is
`eps*kappa`, not `eps`. Moreover a near-zero individual signed integral can
force unreasonable local absolute precision even when that contribution would
be negligible under a legitimate global budget. This occurs at both face sums
and nested boundary/span sums. Actual embedded-rule estimates are weaker than
these hypothetical bounds.

For an outer discrete rule `Q = sum_j wj * vprime_j * A_j`, an inner antiderivative
estimate with absolute error `ej` contributes at most
`sum_j |wj*vprime_j|*ej` to **that discrete rule**. A practical estimator must
propagate this term in addition to outer quadrature discrepancy, avoid signed
error cancellation, and carry it separately through faces/spans. Bounds at the
sampled nodes alone do not certify inner error between nodes; a rigorous total
bound would additionally need interval-uniform inner error control or a bound
for the composed outer integrand. The current maximum-inner-error times span
length cannot ignore the pcurve derivative factor merely because the inner
call itself was successful.

Proposed whole-solid experimental policy:

1. Maintain signed mass, sum of estimated absolute contributions, outer error,
   propagated inner error, and evaluation/accumulation roundoff indicators.
2. Allocate an explicit absolute budget across nonzero faces and spans; unused
   budget can move to the highest estimated-error work. Bounds on pcurve
   derivative factors determine inner budgets. Split at actual spline and trim
   breakpoints rather than refining across discontinuities.
3. Use a pilot mass only to schedule work. Revise the target as the mass and its
   uncertainty change. Bounding-box volume is a scale, not a relative accuracy
   certificate for arbitrarily thin or nearly canceling solids.
4. Report stagnation or an unattainable roundoff floor distinctly. More nodes
   cannot recover dimensions already lost during construction or world-point
   evaluation. Recenter before evaluation where placement semantics permit;
   compensated summation addresses accumulation, not inaccurate input samples.
5. If an actual enclosure were available, `E <= eps*abs(Vhat)/(1+eps)` would
   guarantee relative error `eps` against the true nonzero volume. A GK
   discrepancy and cross-axis agreement are evidence, not such an enclosure.

These steps are a proposed research algorithm, not a replacement accepted on
the strength of literature convergence plots. Tolerance values retain volume
units in absolute budgets; no dimensionless magic threshold should switch
between relative and absolute behavior.

## Applicability and next experiments

**Highest confidence:** reuse/cache exact surface evaluations independently of
quadrature mathematics. The published approaches also repeatedly evaluate
parametric supports; no published result is needed to justify immutable
request-local preparation reuse.

**Next controlled algorithm experiment:** instrument per-face/span cancellation
and inner error amplification, then prototype explicit absolute budgets on a
standalone scalar-mass integrator. Compare evaluation counts and actual analytic
error separately. Include the far-translated thin box where existing estimated
error understates actual error, curved rational extrusions, holes/slivers, and
the existing bent/notched freeform counterexamples. Keep actual pcurves and
surfaces: the papers' trim approximation/refinement machinery must not silently
alter Makeshift topology or geometry. Require convergence status and conservative
fallbacks; no relaxed eps or sample-based zero skipping.

**Restricted polynomial experiment:** on planar faces with exactly rational
trim curves, constant projected flux is an affine polynomial of planar
coordinates. The planar Spectral PE construction has the right mathematical
class. Its preparation cost, root sensitivity, seam/orientation handling and
existing analytic-path performance must be measured before adoption. On a
generic rational surface, multiplying constant spatial density by the projected
Jacobian and coordinate height produces a rational parameter integrand; constant
density does not make this a polynomial planar problem. Nonrational polynomial
surfaces with polynomial trims permit degree-based Gaussian exactness, but
rational trims again change the integrand class.

**Longer-term proof work:** positive rational weights supply a denominator
lower bound on each Bernstein span. Interval/Bernstein bounds could support
structural-zero proofs, derivative bounds, and genuine conservative integration
errors. Those are original candidate directions, with potential preparation
cost and dependency on the represented geometry. The read papers do not supply
a ready-made certified, fast general NURBS-solid mass routine.

No global axis policy, plane-sign API change, or quadrature replacement is
approved by this note. The existing primitive/recenter outputs are independent
evidence and must remain visible alongside any proposed speed improvement.
