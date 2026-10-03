# Toolpath-rendered logo

The current [icon preview](icon.png), [oblique preview](icon-detail.png) and
[64/96/128 px comparison](sizes.png) use the founder's `makeshift-logo-5.makeshift`,
copied byte for byte as `source.makeshift`. V5 restores the solid white backing
and raises the right side of the arrow as a third silhouette at Z=6–7 mm.
The original orange and violet solids are identical to the preceding model.
The model is 39 × 39 × 7 mm, with 1 mm raised shapes, and contains four bodies.
The new arrow piece uses the same art-directed violet as the other right-side
piece; its saved CAD appearance is orange. Slicer profiles and all Blender
appearance settings are unchanged from the preceding v4 render.
The approved application icon remains in the parent folder. No image generation
is involved.

`icon.gcode` is a real OrcaSlicer 2.4.2 Arachne slice, with nominal 1.5 mm widths
(up from 1.15 mm), 0.2 mm layers, and one top outer wall. Actual Arachne widths
vary with local geometry. Top and bottom surfaces use monotonic infill rather
than monotonic line. Arachne minimum bead width is 5%, minimum feature size is
1%, and gap fill is enabled everywhere without length filtering. This artistic
slice includes strands as narrow as 0.071 mm. Solid infill has a fixed 45° raster
so visible surfaces at different layer heights all catch the top-left light. A fresh native export
validated the closed oriented STL before slicing.

## Reproduce

Install repository dependencies and Blender. From the repository root:

```sh
source /Users/adacohen/.nvm/nvm.sh && nvm use
node assets/branding/printed-logo/render-gcode.mjs
```

Optional arguments are G-code file, output directory and appearance (`icon`, the
default, or `realistic`). `BLENDER` overrides the installed macOS binary. Outputs
go to `.cache/printed-logo/orca-icon/`: bead geometry, source hash/counts,
transparent PNGs and editable Blender scenes. Only deposited object coordinates
are centered; the input path shapes and widths are retained.

To regenerate the current slice, build the Makeshift native kernel as described
in the root README and install OrcaSlicer, then run:

```sh
source /Users/adacohen/.nvm/nvm.sh && nvm use
node assets/branding/printed-logo/slice-infill.mjs 45 .cache/printed-logo/model-v5 1.5
node assets/branding/printed-logo/render-gcode.mjs .cache/printed-logo/model-v5/plate_1.gcode .cache/printed-logo/model-v5/render icon
```

Slice arguments are angle, output directory and nominal line width. The recipe
explicitly selects the four saved body IDs, including the new raised arrow piece.
It reads the installed Orca BBL
printer/process/filament presets, applies configuration values from the founder's
original `source.gcode`, overrides seven width settings, and fixes the solid
infill direction rather than alternating it by layer. It also applies the
monotonic surfaces and fine gap-fill limits above. Settings and slicer data
stay inside the output cache; user profiles are not edited. `ORCA_SLICER` and
`ORCA_RESOURCES` override binary and resource locations. Slice metadata records
the model hash, selected IDs, angle, width, pattern and gap-fill limits.

`icon-source.json` records the rendered G-code hash and geometry counts. Small
PNGs use Lanczos downsampling of the 1024 px render. The comparison shows native
sizes against the previous v4 recessed-floor save with the same monotonic slice settings.

## Appearance

The icon preset uses a 35%-of-layer-height bead crown, distant top-left area
light, restrained fill and satin plastic. Both lights are ten times farther than
the initial setup, with diameter scaled by ten and power by 100. Vertical render
scale stays at 0.6: backing 3.6 mm, raised relief 0.6 mm, total height 4.2 mm for
this model. Shader normals compensate vertical compression to preserve print-line
contrast; cast shadows use the thinner geometry. The top camera stays fixed;
the oblique camera avoids reflecting the key directly.

Blender 4.0.0 Beta uses Cycles, procedural microtexture, orthographic framing and
RGBA output. Background Blender needs macOS graphics services; a sandboxed
launch crashed in Metal initialization before Python ran.

## Path reconstruction

The parser handles millimeter G0/G1 motion, XY I/J-format G2/G3 arcs,
absolute/relative positioning and extrusion, G92 resets, retraction repayment,
and Prusa/Orca feature, height and width comments. Orca object markers exclude
priming, calibration and shutdown. Printer commands are read as data; none execute.

Arcs use 0.005 mm chord tolerance and a maximum 5° step, retaining exact endpoints.
The independent implementation follows documented
[center-format G2/G3 semantics](https://www.linuxcnc.org/docs/stable/html/gcode/g-code.html#gcode:g2-g3).
Unsupported deposited arc formats, non-planar extrusion, inch units, firmware
retractions and tool changes fail explicitly within object scope.

Declared widths preserve the slicer's intended footprint. Without width metadata,
width is inferred from deposited volume using the
[Slic3r rounded-rectangle flow model](https://manual.slic3r.org/advanced/flow-math).
Volume-derived width is also retained for audit. Cross-sections have rounded ends
and overlapping shells at sharp turns. Strands narrower than the layer height
use convex elliptical cross-sections instead of an inverted rounded rectangle.
Shells are closed and oriented, but are not Boolean-fused. This is a kinematic
visualization, without thermal, pressure,
shrinkage or fusion simulation; mesh volume is not an exact conservation model.

Colours are art-directed: white backing through Z=6 mm, orange/violet raised
silhouettes assigned from exterior contours. The single-extruder G-code does not
encode three-colour fabrication. `render.py` owns shading independently of slicing.

## Previous artwork and contour correction

The previous [realistic view](styled.png) and [oblique view](detail.png) use the
founder's original `source.gcode` and `makeshift-logo-2` geometry. Their provenance
is in `render-source.json`; they are not previews of the new model. Earlier icon
iterations, inputs and scenes remain in Git and `.cache/printed-logo/`.

The old standalone export of `makeshift-logo-2` included five bodies, with
an overlapping orange silhouette that already had the pointed tip in its STL.
Rendering the supplied Orca G-code corrected that selection mismatch. The current
model has four bodies; the new slicing recipe selects all four explicitly.
`generate.mjs`, `slicer.ini` and `fine.png` retain the earlier Prusa experiment and
do not produce the current previews.

## Checks

```sh
source /Users/adacohen/.nvm/nvm.sh && nvm use
node --test assets/branding/printed-logo/*.test.mjs
node_modules/.bin/biome check assets/branding/printed-logo
node_modules/.bin/tsc --ignoreConfig --noEmit --strict --module nodenext --target es2024 --types node --skipLibCheck assets/branding/printed-logo/export.ts
npm exec --yes --package pyright@1.1.414 -- pyright --project assets/branding/printed-logo/pyrightconfig.json
```

Tests cover arcs, the original rounded-tip fixture and swept footprint, object
scope, widths, E modes, resets, retractions, relative XYZ, unsupported motions and
shell closure/orientation and convex sub-layer-width strands. Current top and
oblique renders and native small-size previews were inspected. No physical print
was made.
