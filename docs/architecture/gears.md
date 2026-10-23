# Involute gear decorator

2026-09-27. Pitch-surface interaction approved by the founder and implemented.
The tool supports external/internal cylinders, conic bevel faces and planar racks,
including disconnected partial faces. Helical means cylindrical helicals and
inclined racks; conic gears use straight spherical-involute teeth.

## Interaction and ownership

Select faces and invoke **Gear**. The selected geometry supplies a target pitch
surface, not the tooth-tip blank. Teeth add and remove material around it.
Decorators never resize or move accepted BRep geometry. DocumentOwner owns
attachments, fitted dimensions and settings with snapshot Undo; preview and export
consume that same accepted metadata.

External spur cylinders applied together share a saved gear group. Applying Gear
separately joins contacting gear groups as well. Reapplying Gear to selected older
independent gears creates a group. An explicit `gearGroup` on Apply adds selected
cylinders to an existing group. The sidebar lists groups even without a selection;
clicking a group selects all members and discloses body names, face counts, target
and fitted pitch diameters, and individual integer tooth counts. Select new faces
and use **Add selection to Gears N**; removal still acts only on selected faces.
Groups are independent of tagged geometry groups and cross body boundaries.
Remembered spur presets restore pressure and fitting limits; rotary count and
phase are fitted to the current cylinders rather than recalled from another gear.
Adding faces to an existing group uses that group's settings.

Shared controls are **Maximum normal module** (initially 1 mm), **Pitch diameter
tolerance** (initially 0.2 mm on diameter, not radius), **Minimum tooth tip width**
(initially 0.4 mm), pressure angle, thinning and root clearance. Tooth counts and
phases are fitted rather than directly edited on a multi-gear group. The fit
minimizes squared pitch-diameter corrections, preferring the larger module on a
tie. Counts remain within 6–400 and above the existing undercut threshold. Tip
width is measured as the chord between the involute flanks at the tip circle,
after thinning. This is a geometric feature-size limit, not a printer calibration.
The saved `gearPitchRadius` affects only the decorator's generated geometry.

Every geometry edit refits the whole group in its temporary candidate, including
other members' tooth counts and profiles. Existing tangent, parallel, axially
overlapping pitch contacts retain current axis spacing and receive tooth/space
phase alignment. A contacting pair fixes module from its integer tooth-count sum;
other contacts propagate those integer sums. Conflicting phase loops reject.
Nothing moves the axes or changes another body's BRep. If fitting cannot satisfy
the limits, the geometry edit remains valid and the group shows **Gear group
cannot fit**. Invalid profiles are withheld from preview/export; changing the group
limits or geometry can repair them. Resize and its group refit share one Undo step.
Copied groups receive independent IDs. Undo/Redo and save/open retain membership,
limits and fitted dimensions. Sampling error remains separate from fit tolerance.

Automatic group fitting currently covers external spur cylinders with zero
profile shift. Internal, helical, bevel and rack gears retain independent controls;
explicit settings with a tooth count retain the independent calculation route.
A single automatically grouped spur gear also fits the printable limits. Independent
gears with explicit settings retain integer teeth per revolution (default 40), pressure angle
(20 degrees), helix angle/hand, phase, normal thinning, root clearance (initially
0.25 module) and profile shift. Counts refer to a full revolution even on a sector.
Thinning is millimeters per gear, not pair-wide backlash. The former **Resize to
module** geometry control has been removed: decorator controls never edit BRep.

Racks expose normal module (initially 1 mm), numeric in-plane travel direction,
linear phase in mm and tooth inclination using the helix/hand controls. The
saved plane frame defines zero direction independently of the camera. The trimmed
extent clips a repeating profile. Rotary count and phase controls are hidden
for racks; helix/hand are hidden for bevels. Mixed selections patch only instances
to which a field applies. Numeric typing previews; Enter/blur accepts and Escape
cancels. Reselection, continuation, partial removal and repair share the existing
decorator routes. A face still has at most one active decoration.

## Support and continuity

Partition by body, analytic support and material side. Cylinders share radius
and axis line; opposite parameter-axis signs are equivalent. Cones share apex,
axis, opening angle and nappe. Rack faces share plane and oriented material side.
Native face presentation and agent inspection expose cone apex, direction,
semi-angle in degrees and material side; analytic metadata is derived from BRep.

Save a reference frame, settings and support kind/material side. Cones also save
an axial reference range at application; its far section defines the reported
module and physical thinning. Partial removal does not change that reference.
Rigid transforms carry the frame; copies receive independent instance IDs.
Scaling independent gears preserves integer count, angles, phase, clearance/profile
coefficients and physical thinning; grouped gears refit within the shared limits. Reflection
preserves configured hand. Ineligible surface changes and ambiguous merges become
unresolved. Explicit reassign establishes a new frame/reference section.

Use immediate topology correspondence to retain compatible split descendants.
Never restart phase at face seams or gaps, or merge independent instances after
an edit. Trim each selected patch independently, including holes and separated
axial domains. Existing adjacent-plane/cylinder clipping keeps modifiers out of
unselected boundaries. General arbitrary curved-neighbor extension remains the
same limitation as the thread domain pipeline.

## Geometry and calculation affordances

Cylindrical profiles use involute flanks with explicit root/tip transitions.
Helical lofts rotate cross-sections by z*tan(beta)/pitchRadius, with the chosen
hand. Racks use the matching normal-system straight flank profile. Roots below
the base circle connect radially; generated cutter trochoids/root fillets are
not implemented. Combinations requiring undercut, pointed/overlapping teeth or
internal tips below the base circle reject with a reason.

Bevel profiles use a spherical involute of a base cone, not a stretched planar
involute. With pitch semi-angle delta and pressure alpha,
sin(deltaBase) = sin(delta)*cos(alpha). A great-circle tangent unwrapped from
that base cone gives the flank azimuth. Teeth follow rays from the common apex.
Coverage must stop before the apex; supported semi-angles are 3–80 degrees.
Spiral bevels reject explicitly. Sampled 1:1, 90-degree bevel engagement is checked;
this is not universal pair compatibility or a manufacturing-standard certification.

Agent `decorators()` lists the built-in `freac.gear` v1 schema. `inspectDecorator`
returns resolved rotary module, pressure angle, pitch/base/tip/root dimensions,
lead and support/frame information. Its optional `normalModule` returns
`requiredPitchRadius` without editing geometry. Cone results include the saved
reference section and cone angles. Transverse pressure and half-width results
are radians; user settings use degrees. Original face domains remain available
through ordinary geometry inspection.

For cylinders, d = z*mn/cos(beta), mt = mn/cos(beta), and
tan(alphaT) = tan(alphaN)/cos(beta). Unshifted external reference center distance
is r1+r2; internal reference distance is rRing-rPinion. Rack transverse pitch is
pi*mt. Profile-shifted pairs require operating-distance calculations. Positive
profile shift moves the generating reference outward: it thickens external
teeth and widens internal tooth spaces. The same exact calculations supply panel
readouts and agent inspection. Agents can `replaceFace`/`offsetFaces`, move bodies
and `editDecorator` within one awaited script transaction and one Undo step.

Export sampling uses the minimum of 0.004 mm, smallest normal module/100 and
positive thinning/8, with a 0.00001 mm floor. Preview uses a coarser profile.
Numerical Boolean precision and tessellation error remain separate from intended
thinning/clearance. Export retessellates a read-only snapshot, retains closed-mesh
validation and does not mutate accepted data. Long jobs use existing worker status
and cancellation. Bounded sampling and pair probes are not a general proof of
maximum deviation or physical fit.

Mathematical references: [KHK gear dimensions](https://khkgears.net/gear-knowledge/gear-technical-reference/calculation-gear-dimensions/)
and the published [spherical-involute equations](https://journals.sagepub.com/doi/10.1177/16878140211037120).
No upstream implementation code was copied.

## Verification and limits

`tests/gear-groups.test.ts` and `tests/gear-group-resize.test.ts` use the founder's
13/7 mm capture for both application orders, legacy matching, shared sizing,
engagement, STL/3MF encoding, native resize, fit limits, repair and atomic Undo.
`tests/gear-groups-ui.mjs` checks real group disclosure/addition, layout, numeric
cancellation, removal and cylinder offset followed by warning repair in hidden
Electron.

`tests/gears-ui.mjs` exercises real pointer/keyboard creation, gear/rack/bevel
settings, numeric cancellation, Undo/Redo, reselection,
removal, save/open, previews and STL/3MF downloads in headless Chromium/WebKit and
hidden Electron. Native tests cover internal/external and helical export,
disconnected sectors/axial patches, continuation, copied placement, agent dimension
inspection and atomic geometry/settings scripts. Engagement tests sample spur,
opposite-hand helical, internal, rack/pinion and straight-bevel pairs.

The separate [agent gear-train evaluation](../development.md#gear-train-behavioral-evaluations)
exercises fresh agents building pairs/compound spur trains and relocating an existing
axis. Its geometric grading and ordinary re-editing checks evaluate the resulting
models; transcripts separately establish what the agent actually verified.

These checks do not establish arbitrary gear-chain interference, assembly, load
capacity, physical printer fit, or iPad input. Agents remain responsible for
choosing and checking arrangements outside automatic external spur-group fitting.
