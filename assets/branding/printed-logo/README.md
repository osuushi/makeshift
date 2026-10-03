# Toolpath-rendered logo

The current [icon preview](icon.png), [oblique preview](icon-detail.png), and
[64/96/128 px comparison](sizes.png) render
`source.gcode`, the founder's exact `makeshift-logo-2_PLA_20m27s.gcode` export from
OrcaSlicer 2.4.2. It uses Arachne, nominal 1.15 mm extrusions, 0.2 mm layers and
one outer wall on the top surfaces. The approved application icon remains in the
parent folder. No image generation is involved.

The icon preset emphasizes actual bead geometry with a 35%-of-layer-height crown,
a smaller directional key across the print lines, restrained fill and slightly
glossier plastic. It exaggerates vertical relief for legibility at small sizes;
XY contours, line widths and layer heights retain the supplied toolpaths.
The previous [realistic view](styled.png) and [realistic oblique view](detail.png)
remain available.

## Reproduce

Install the repository dependencies and Blender. From the repository root:

```sh
source /Users/adacohen/.nvm/nvm.sh && nvm use
node assets/branding/printed-logo/render-gcode.mjs
```

Optional arguments are a G-code file, output directory and appearance (`icon`,
the default, or `realistic`). To reproduce the previous flatter appearance:

```sh
node assets/branding/printed-logo/render-gcode.mjs assets/branding/printed-logo/source.gcode .cache/printed-logo/orca-realistic realistic
```

`BLENDER` overrides
the default `/Applications/Blender.app/Contents/MacOS/Blender` executable.
Outputs go to `.cache/printed-logo/orca-icon/` by default: bead geometry, source hash and counts,
transparent PNGs and editable Blender scenes. Only deposited object coordinates
are centered; the source path shapes are preserved. This run rendered 395 paths,
12,201 segments after arc subdivision, and 40 layers. `render-source.json` records
the source SHA-256 and the applied XY translation. `icon-source.json` records the
icon preset. Small PNGs use Lanczos downsampling of the 1024 px render; the size
comparison shows them at native resolution alongside the previous realistic view.

Blender 4.0.0 Beta rendered the previews with the existing satin plastic shaders,
procedural microtexture, softbox lights and orthographic cameras. The background
process requires macOS graphics services; a sandboxed launch crashed during Metal
initialization before Python ran.

## Contour correction

The previous standalone export included all five saved bodies in
`source.makeshift`, including overlapping raised silhouettes. One included orange
body already has the pointed tip: its STL extends to X=3.386 mm there. The old
Prusa slice therefore had a pointed external perimeter before bead reconstruction.
The file's other orange silhouette and the supplied Orca G-code have a rounded tip.
The standalone exporter does not reproduce the app's visible-body selection.

The current render bypasses that ambiguous body selection and uses the supplied
G-code directly. The rounded orange top perimeter reaches X=1.002 mm after
centering; its regression fixture verifies both the decoded contour and the swept
bead footprint in both appearance presets. A full mesh comparison confirmed all
559,776 XY vertex positions and face topology are identical between presets.

`generate.mjs`, `export.ts`, `slicer.ini` and `fine.png` retain the earlier
experimental Makeshift BRep → OCCT inspection → STL → PrusaSlicer route. That
route exports every saved body and uses different slice settings; it is not the
source of the current previews. Earlier images and scenes remain recoverable in
Git and `.cache/printed-logo/v2/`.

## Deposition and shading

The parser handles millimeter G0/G1 motion, XY I/J-format G2/G3 arcs,
absolute/relative positioning and extrusion, G92 resets, retraction repayment,
and Prusa/Orca feature, height and width comments. Orca object markers exclude
machine priming, calibration and shutdown. Printer commands are read as data;
none are executed.

Arc subdivision uses a 0.005 mm chord tolerance and a maximum 5° step, retaining
exact endpoints. Arc semantics follow the documented
[center-format G2/G3 convention](https://www.linuxcnc.org/docs/stable/html/gcode/g-code.html#gcode:g2-g3);
the implementation is independently authored. Unsupported deposited arc formats,
non-planar extrusion, inch units, firmware retractions and tool changes fail
explicitly within the object scope.

Slicer-declared bead widths preserve the slicer's intended footprint, including
its flow calibration. Without width metadata, width is inferred from deposited
filament volume using the
[Slic3r rounded-rectangle flow model](https://manual.slic3r.org/advanced/flow-math).
The volume-derived width is also retained for audit when metadata is present.

Cross-sections have a crown (4% of layer height in `realistic`, 35% in `icon`), rounded ends, and
rounded overlapping deposits at sharp turns. Individual closed shells overlap;
they are not Boolean-fused. This is a kinematic visualization, without heat,
pressure, cooling, sagging, shrinkage or fusion simulation. Mesh volume is not
an exact conservation calculation.

Colour is an art-directed shader assignment: the backing through Z=6 mm is
white; raised silhouettes receive orange and violet based on their exterior
contours. The single-extruder G-code does not encode a three-colour fabrication
plan. `render.py` owns shading and framing independently of toolpath decoding.

## Checks

```sh
source /Users/adacohen/.nvm/nvm.sh && nvm use
node --test assets/branding/printed-logo/*.test.mjs
node_modules/.bin/biome check assets/branding/printed-logo
node_modules/.bin/tsc --ignoreConfig --noEmit --strict --module nodenext --target es2024 --types node --skipLibCheck assets/branding/printed-logo/export.ts
npm exec --yes --package pyright@1.1.414 -- pyright --project assets/branding/printed-logo/pyrightconfig.json
```

Tests cover circular arcs, the actual rounded tip and its bead footprint, object
scope, declared widths, extrusion modes, resets, retractions, relative XYZ,
unsupported motions and shell closure/orientation. Both current views were
rendered in Blender and visually inspected. No physical print was made.
