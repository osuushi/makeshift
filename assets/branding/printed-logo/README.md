# Toolpath-rendered logo

First-review artwork from the founder's `makeshift-logo.makeshift`, copied here
as `source.makeshift`. The approved application icon remains in the parent folder.

Review the [styled preview](styled.png), [fine preview](fine.png), and
[oblique layer view](detail.png).

The complete route is saved Makeshift BRep → existing OCCT kernel inspection at
0.01 mm deflection → closed, oriented STL export → PrusaSlicer G-code → deposited
bead meshes → Blender Cycles. No image generation is involved.

## Reproduce

Install the repository dependencies and build the native kernel following the
root README. Install Blender and PrusaSlicer. From the repository root on macOS:

```sh
source /Users/adacohen/.nvm/nvm.sh && nvm use
node assets/branding/printed-logo/generate.mjs
```

The default input is the committed model. Outputs go to
`.cache/printed-logo/final/`: STL, both G-code files, bead geometry, transparent
1024 px PNGs and editable Blender scenes. The script also records the source SHA-256.
Arguments are input file, output directory, square resolution, and sample count:

```sh
node assets/branding/printed-logo/generate.mjs assets/branding/printed-logo/source.makeshift .cache/printed-logo/final 1024 64
```

`PRUSA_SLICER` and `BLENDER` can override executable paths. Defaults use their
installed macOS app binaries. This run used PrusaSlicer 2.6.0-alpha4 and Blender
4.0.0 Beta; the background Blender process requires access to macOS graphics
services. A sandboxed launch crashed in Metal initialization before Python ran.

`fine` uses a 0.4 mm nozzle, 0.45 mm line width and 0.2 mm layers. `styled` uses
a 0.8 mm nozzle, 0.95 mm line width and 0.4 mm layers. Both slice the same 40 × 40 ×
8 mm solid. Wider lines are actual slicer settings, rather than a texture overlay.

For an oblique view with visible side layers:

```sh
/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup --disable-autoexec --python assets/branding/printed-logo/render.py -- .cache/printed-logo/final/styled-beads.json .cache/printed-logo/final/detail.png 1024 64 detail
```

## Deposition and shading

The parser handles millimeter G0/G1, absolute/relative positioning and extrusion,
G92 resets, retraction repayment and slicer height/type comments. It rejects arcs,
inch units, firmware retractions, tool changes and non-planar extrusion. Travel
and stationary priming generate no visible geometry.

Extruded filament volume divided by XY move length determines bead cross-sectional
area. Width uses the [Slic3r rounded-rectangle flow model](https://manual.slic3r.org/advanced/flow-math).
The rendered cross-section has a small crown (4% of layer height), rounded ends,
and overlapping deposits at sharp turns. Those are geometric approximations:
rendered mesh volume is not an exact conservation calculation. Crowning avoids
coplanar surface interference at overlapping roofs. Individual deposits are
closed oriented shells; they overlap and are not Boolean-fused into a print mesh.

This is a kinematic visualization, without a heat, pressure, cooling, sagging,
shrinkage or material-fusion solver. It cannot predict physical print quality.
An excessively wide nozzle also leaves slicer gaps in the model's narrow corners.

Colour is an art-directed shader assignment: backing through Z=6 mm is white;
disconnected raised silhouettes receive orange and violet based on their exterior
contours. This single-extruder G-code does not encode a three-colour fabrication
plan. It is a geometry preview profile, without a printer's startup/purge routine.

`render.py` owns satin plastic shaders, procedural microtexture, softbox lighting,
orthographic framing and RGBA output. Change these independently of slicing.

## Checks

```sh
source /Users/adacohen/.nvm/nvm.sh && nvm use
node --test assets/branding/printed-logo/beads.test.mjs
node_modules/.bin/biome check assets/branding/printed-logo
node_modules/.bin/tsc --ignoreConfig --noEmit --strict --module nodenext --target es2024 --types node --skipLibCheck assets/branding/printed-logo/export.ts
npm exec --yes --package pyright@1.1.414 -- pyright --project assets/branding/printed-logo/pyrightconfig.json
```

Tests cover volume reconstruction, E modes, resets, retractions, relative XYZ,
unsupported motions and closure/orientation of sharp-return deposition shells.
The real model was exported, sliced and rendered in Blender; the final PNGs were
visually inspected and checked for clean alpha. No physical print was made.
