# Architecture

Read this overview on resume; follow only the links relevant to the active work.
The current user request determines active work and product intent. Detailed design
includes dated proposals: later founder decisions win.

## Stable boundaries

- Each document window has its own TypeScript backend DocumentOwner, accepted geometry, validation and
  snapshot Undo/Redo. Renderer state is input intent, selection, camera and a view.
- PlaneGCS and OCCT calculate geometry; neither owns an application document.
  One edit runs at a time. Accepted data, temporary candidates and UI state stay distinct.
- Stable document-local IDs identify curves and topology. Solver/render indexes
  are not identities. Ordinary typed edits serve both manual tools and the agent.
- Sketches are continuing planar workspaces of curves and constraints. Rectangles
  are convenience groups. Regions derive from geometry; display meshes do not define it.
- Bodies store materialized exact geometry, independent of source sketches.
  Operation correspondence tracks topology without a feature-history replay system.
- Sketch gestures accept on completion. Extrude retains a temporary candidate
  through release and accepts on completing/exiting the tool, in one Undo step.
- Electron, strict TypeScript, Three.js, Biome, backend PlaneGCS and OCCT are selected.
  Keep host APIs out of shared model/interaction code; preserve WebKit compatibility.
- No public revisions, retry ledgers, concurrent mutation or speculative frameworks.

Cubic Bézier editing and tolerance-bounded projection were approved on 2026-09-16.
They supersede earlier spline exclusions. Preserve analytic geometry when natural;
general NURBS editing and semantic ancestry are not required. Precision recovery
is a later operation on current geometry, through ordinary Undo.

## Read for the task

| Area | Detail |
| --- | --- |
| Agent shell (proposal) | [Harness, portable workspace, CLI and scripting](architecture/agent-shell.md) |
| Standalone web build | [Local WASM, browser files and independent Pages releases](architecture/web.md) |
| iPad document handoff | [LAN transport, single editor, input and files](architecture/ipad.md) |
| Ownership, model, code entry points | [Document model](architecture/model.md), [implementation map](architecture/implementation.md) |
| Async edits, cancellation, history, files | [Edit lifecycle](architecture/edit-lifecycle.md), [persistence](architecture/persistence.md) |
| Camera, plane entry, picking, point chooser | [Navigation](architecture/navigation.md), [selection](architecture/selection.md) |
| Interface scale and local settings | [Interface preferences](architecture/interface-preferences.md) |
| Creation, circle/arc editing | [Curve editing](architecture/curve-editing.md), [curved controls](architecture/curved-controls.md) |
| Orientable widget visuals | [Design language and implementation references](design/orientable-widgets.md) |
| Tool search and discovery | [Panel replacement, matching and menu interaction](design/tool-menu.md) |
| Guided 3D shape tools | [Product philosophy and Cube flow](product/3d-tools.md) |
| Movement, resize, rotation | [Transforms](architecture/transforms.md), [founder corrections](architecture/movement-corrections.md) |
| Construction planes, solid split and surface imprint | [Plane tools](architecture/plane-tools.md) |
| Constraints, Fuse/Unfuse, attachment | [Constraints](architecture/constraints.md), [point links](architecture/point-links.md), [drawing attachments](architecture/drawing-attachments.md) |
| Trim, offset, regions | [Curve modification](architecture/curve-modification.md) |
| Native solving and drag targets | [Solver integration](architecture/solver.md) |
| Native units and geometry budgets | [Numerical geometry](architecture/numerical-geometry.md) |
| Bodies, modeling selection, tool switching | [Materialized solids](architecture/solids.md), [modeling tools](architecture/modeling-tools.md), [solid-loop design](sketch-solid-loop.md) |
| Topology inspection and surface replacement | [Composable topology editing](architecture/topology-editing.md) |
| Mesh reconstruction | [STL/OBJ import, analytic recovery, bicubic fitting and accuracy limits](architecture/mesh-fitting.md) |
| Loft | [Ordered sections, correspondence and acceptance](architecture/loft.md) |
| Shell | [Shell interaction and validation](architecture/shell.md) |
| Erode | [Remesh erosion quality and Analytic thickness bounds](architecture/erosion.md) |
| Selection measurements | [Distances, gaps and relationships](architecture/measurements.md) |
| Draft and cleanup | [Extrusion draft](architecture/extrusion-draft.md), [solid cleanup](architecture/solid-cleanup.md) |
| Decorators | [Export-time mesh modifiers, threads and JavaScript extensions](architecture/decorators.md), [knurling](architecture/knurling.md) |
| Tagged geometry groups | [Named selections, modal editing and topology continuation](architecture/tagged-groups.md) |
| Gear decorator | [Pitch surfaces, gear controls and agent calculations](architecture/gears.md) |

## Maintaining this index

Keep this file a short map and stable ownership summary. Put detailed behavior in
its topic file; replace superseded statements there instead of appending another
correction here. Runtime evidence belongs in the active local brief and test results,
not architecture. Do not recursively read all linked files on resume.
