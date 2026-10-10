# Implementation map

Read for work in this area, not on every resume. [Architecture index](../architecture.md).
Later founder decisions override earlier proposals.
Cubic editing/projection (2026-09-16) supersedes any earlier spline exclusion.

## Current implementation

The current application is the root npm package: [Electron entry](../../src/main.ts),
[document application](../../src/host/document-application.ts),
[per-window host session](../../src/host/document-window.ts) and [renderer composition](../../src/sketch/main.ts). Sources live under `src/`, with stateless native calculators under `native/`.
The retired prototype and its command/revision protocol are preserved only in
[Git history](../history/README.md#retired-prototype).

| Current responsibility | Implementation |
| --- | --- |
| Shared curves/constraints; backend acceptance and snapshot Undo/Redo | [Model](../../src/sketch/document.ts), [validation](../../src/sketch/sketch-validation.ts), [document owner](../../src/backend/document-owner.ts), [history](../../src/backend/document-store.ts) |
| Analytic rectangle/segment edits and endpoint continuity | [Geometry](../../src/sketch/geometry.ts), [rectangle edits](../../src/sketch/rectangle-edit.ts), [line edits](../../src/sketch/line-edit.ts) |
| Ordered typed selection; tool and temporary editor state | [Selected targets](../../src/sketch/selected-targets.ts), [editor](../../src/sketch/editor.ts) |
| Active edit ownership; pointer intent and candidate calculation | [Interaction owner](../../src/sketch/active-interaction.ts), [gestures](../../src/sketch/gestures.ts), [drag start](../../src/sketch/drag-state.ts), [drag update](../../src/sketch/drag-update.ts) |
| Actual hit candidates and snapping | [Picking](../../src/sketch/picking.ts), [snapping](../../src/sketch/snapping.ts) |
| World/camera, outlines and local controls | [World](../../src/sketch/world.ts), [drawing](../../src/sketch/drawing.ts), [dimensions](../../src/sketch/dimensions.ts), [selection overlay](../../src/sketch/selection-overlay.ts) |
| Body resource lifetime and view style | [Body drawables](../../src/model/body-drawable.ts), [body view](../../src/model/body-view.ts) |
| Body face/edge hit queries and overlap depth | [Pointer probe](../../src/model/body-picking.ts), [mesh ray hits](../../src/model/body-ray-hits.ts), [edge candidates](../../src/model/edge-selection.ts) |

Pointer and numeric edits pass temporary typed intent alongside target geometry:
point projection, rigid transform, dimension edit, or ordered pair application.
The backend translates stable feature references into solver targets. Coordinate
deltas describe requested changes; they do not classify the operation or infer
pair order. Intent is never persisted. Unconstrained geometry keeps its direct
edit path; constrained geometry uses native PlaneGCS.

Rectangle convenience edits retain analytic anchor construction and previous-extents
solver seeding. Routing depends on relationships on that rectangle, never an
unrelated constraint elsewhere. Unchanged groups remain fixed. Point/edge
coincidence, numeric locks, angles and curved relationships share this adapter.
Current verification and the next concrete action belong in the local brief.
