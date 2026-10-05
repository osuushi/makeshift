import { DecoratorPanel } from "../decorators/panel.js";
import { decoratorOverlay } from "../decorators/preview.js";
import { BodyActions } from "../model/body-actions.js";
import { BodyEdgeFinishControls } from "../model/body-edge-finish-controls.js";
import { BodyMoveControls } from "../model/body-move-controls.js";
import { BooleanControls } from "../model/boolean-controls.js";
import { CleanupControls } from "../model/cleanup-controls.js";
import { ConstructionPlaneControls } from "../model/construction-plane-controls.js";
import { CrossSectionControls } from "../model/cross-section-controls.js";
import { DeleteTopologyAction } from "../model/delete-topology-action.js";
import { EntityViewer } from "../model/entity-viewer.js";
import { ErosionControls } from "../model/erosion-controls.js";
import { FaceOffsetControls } from "../model/face-offset-controls.js";
import { MeasurementControls } from "../model/measurement-controls.js";
import { MeshImportControls } from "../model/mesh-import-controls.js";
import { MirrorControls } from "../model/mirror-controls.js";
import { ModelingTools } from "../model/modeling-tools.js";
import { OverlapInput } from "../model/overlap-input.js";
import { PlaneCutControls } from "../model/plane-cut-controls.js";
import { ProjectionControls } from "../model/projection-controls.js";
import { reopenControls } from "../model/reopen-controls.js";
import { ScaleControls } from "../model/scale-controls.js";
import { SectionControls } from "../model/section-controls.js";
import { ShellControls } from "../model/shell-controls.js";
import { TopologyMoveControls } from "../model/topology-move-controls.js";
import { installSettings } from "../preferences/settings.js";
import { TagControls } from "../tags/controls.js";
import { ToolMenu } from "../tools/menu.js";
import { installPlaneBounds } from "./plane-bounds.js";
import { planeEntryTools } from "./plane-entry-tools.js";
import { installViewInspection } from "./view-inspection.js";
import "../model/entity-viewer.css";
import { BodyEdgeControls } from "../model/body-edge-controls.js";
import { pickFace } from "../model/body-picking.js";
import { bodyView } from "../model/body-view.js";
import { visibilityControls } from "../model/visibility-controls.js";
import "./style.css";
import "./modeling.css";
import { pickSavedPlane } from "../model/saved-plane-picking.js";
import { ModelControls } from "./model-controls.js";
import { modelHighlight } from "./model-highlight.js";
import { pickModels } from "./model-selection.js";
import "./edit-overlay.css";
import "./constraints.css";
import "./fillet.css";
import "./trim.css";
import "./offset.css";
import { BezierControls } from "./bezier-controls.js";
import { BowControls } from "./bow-controls.js";
import { calculationControls } from "./calculation-controls.js";
import { ConstraintDisplay } from "./constraint-display.js";
import { installControls } from "./controls.js";
import { CurvedConstraints } from "./curved-constraints.js";
import { Dimensions } from "./dimensions.js";
import { drawSketches } from "./drawing.js";
import { SketchEditor } from "./editor.js";
import { FilletControls } from "./fillet-controls.js";
import { PointerGestures } from "./gestures.js";
import { LineConstraints } from "./line-constraints.js";
import { NumericEdit } from "./numeric-edit.js";
import { OffsetControls } from "./offset-controls.js";
import { PointChooser } from "./point-chooser.js";
import { PointEdgeControls } from "./point-edge-controls.js";
import { PointTangentControls } from "./point-tangent-controls.js";
import { drawRegionFills } from "./region-fill.js";
import { SelectionOverlay } from "./selection-overlay.js";
import { TransformOverlay } from "./transform-overlay.js";
import { TrimControls } from "./trim-controls.js";
import { World } from "./world.js";
import { worldLabels } from "./world-labels.js";

const app = document.querySelector<HTMLElement>("#app");
if (!app) throw new Error("Missing app root");
app.innerHTML = `<div id="world"></div><div id="overlay"></div>
  <header><div class="brand"><img src="./makeshift.png" alt=""/><strong>Makeshift</strong></div><span class="mode-label">Modeling</span></header>
  <footer class="workspace-footer"><div class="status" role="status"></div><div class="navigation-hint">Two-finger scroll · pan &nbsp; ⌘-drag · orbit &nbsp; Pinch · zoom &nbsp; Hold · choose overlap</div></footer>`;
const host = app.querySelector<HTMLElement>("#world"),
  overlay = app.querySelector<HTMLElement>("#overlay"),
  status = app.querySelector<HTMLElement>(".status");
if (!host || !overlay || !status) throw new Error("Missing viewport elements");
const numeric = new NumericEdit(),
  world = new World(host, overlay),
  editor = new SketchEditor(world, numeric);
installPlaneBounds(editor);
const readouts = document.createElement("div");
readouts.className = "selection-readouts";
app.append(readouts);
const decorators = new DecoratorPanel(editor, app);
const disposeDecorators = decoratorOverlay(editor);
const disposeCalculation = calculationControls(editor, app);
const disposeLabels = worldLabels(
    world,
    overlay,
    (point, depth) => {
      const hit = world.planePicker ? pickFace(editor, point) : undefined;
      const face =
        hit &&
        editor.display.bodies
          ?.find((body) => body.id === hit.body)
          ?.faces.find((face) => face.id === hit.face);
      return (
        (!world.planePicker && pickModels(editor, point).length > 0) ||
        (!!face?.plane && !!hit && hit.depth <= depth + 1e-5) ||
        !!pickSavedPlane(editor, point, depth)
      );
    },
    () => {
      editor.modeling.hover = null;
      editor.refresh();
    },
  ),
  disposeDrawing = drawSketches(editor),
  disposeFills = drawRegionFills(editor);
const modelControls = new ModelControls(editor, overlay);
const shells = new ShellControls(editor, overlay);
const erosion = new ErosionControls(editor, overlay);
const meshImport = new MeshImportControls(editor, overlay);
const faceOffsets = new FaceOffsetControls(editor, overlay);
const faceMoves = new TopologyMoveControls(editor, overlay);
const edgeMoves = new TopologyMoveControls(editor, overlay, "edges");
const bodyFinishes = new BodyEdgeFinishControls(editor, overlay);
const tags = new TagControls(editor, app);
const entities = new EntityViewer(editor, app, tags);
const booleans = new BooleanControls(editor, overlay, entities);
const bodyMove = new BodyMoveControls(editor, overlay);
const disposeReopen = reopenControls(editor, async ({ request, cleanup: clean }) => {
  if (request.kind === "extrude") await modelControls.reopenExtrude(request.extrusion, clean);
  else if (request.kind === "boolean-bodies") await booleans.reopen(request.operation, clean);
  else if (request.kind === "revolve") await modelControls.reopenRevolve(request.revolution, clean);
  else if (request.kind === "loft") await modelControls.reopenLoft(request.operation, clean);
  else if (request.kind === "shell") await shells.reopen(request.operation);
  else if (request.kind === "erode") await erosion.reopen(request.operation);
  else if (request.kind === "finish-edges") await bodyFinishes.reopen(request.operation, clean);
  else if (request.kind === "offset-faces") await faceOffsets.reopen(request.operation, clean);
  else if (request.kind === "cleanup") await cleanup.reopen(request.selection);
  else if (request.kind === "scale") await scaling.reopen(request.operation);
  else if (request.kind === "mirror") await mirror.reopen(request.operation);
  else if (request.kind === "plane-cut") await planeCuts.reopen(request.operation);
  else if (request.kind === "project") await projection.reopen(request.projection);
  else if (request.kind === "transform-bodies") await bodyMove.reopen(request.transform);
  else if (request.kind === "move-faces") await faceMoves.reopen(request.operation);
  else if (request.kind === "move-edges") await edgeMoves.reopen(request.operation);
  else if (request.kind === "construction-plane") await constructionPlanes.reopen(request.plane);
  else {
    const unsupported: never = request;
    throw new Error(`Unsupported restored operation: ${JSON.stringify(unsupported)}`);
  }
});
const cleanup = new CleanupControls(editor, overlay);
const disposeModelHighlight = modelHighlight(editor);
const disposeBodies = bodyView(editor);
const selection = new SelectionOverlay(editor, overlay);
const transforms = new TransformOverlay(editor, overlay);
const constraints = new ConstraintDisplay(editor, readouts);
const pointEdge = new PointEdgeControls(editor, constraints.available);
const pointTangent = new PointTangentControls(editor, constraints.available);
const pointChooser = new PointChooser(editor, overlay);
const lineConstraints = new LineConstraints(editor, constraints.available);
const curvedConstraints = new CurvedConstraints(editor, constraints.available);
const beziers = new BezierControls(editor, overlay);
const bows = new BowControls(editor, overlay);
const fillets = new FilletControls(editor, overlay);
const trim = new TrimControls(editor, overlay);
const offsets = new OffsetControls(editor, overlay);
const dimensions = new Dimensions(editor, overlay),
  gestures = new PointerGestures(editor);
numeric.connect(dimensions, gestures);
const disposeControls = installControls(editor, numeric, app);
const modelingTools = new ModelingTools(
  editor,
  () => modelControls.activateRevolve(),
  () => modelControls.activateLoft(),
  (mode) => bodyFinishes.setMode(mode),
);
const bodyActions = new BodyActions(
  editor,
  (copy) => bodyMove.enable(copy),
  booleans.start,
  cleanup.start,
);
const deleteAction = new DeleteTopologyAction(editor);
const mirror = new MirrorControls(editor, overlay);
const constructionPlanes = new ConstructionPlaneControls(editor, overlay, entities.referenceRows);
const scaling = new ScaleControls(
  editor,
  overlay,
  () => {
    if (constructionPlanes.selected()) return constructionPlanes.transform();
    if (editor.world.active) return editor.activateMove();
    else if (
      editor.modeling.targets.every(
        (target) => target.kind === "sketch" || target.kind === "profile",
      )
    )
      modelControls.move();
    else {
      editor.modeling.setTool("move");
      editor.refresh();
    }
  },
  () => !!constructionPlanes.selected(),
);
const projection = new ProjectionControls(editor, overlay, constructionPlanes.picker, entities);
const sections = new SectionControls(editor);
const bodyEdges = new BodyEdgeControls(editor);
const disposeVisibility = visibilityControls(editor, () => constructionPlanes.selected()?.id);
const crossSection = new CrossSectionControls(editor, overlay, constructionPlanes.picker, () =>
  constructionPlanes.selectedFrame(),
);
const measurements = new MeasurementControls(editor, app, readouts);
const overlaps = new OverlapInput(editor, (plane) => constructionPlanes.select(plane));
const planeCuts = new PlaneCutControls(editor, overlay, constructionPlanes.picker);
const disposeHost =
  import.meta.env.MODE === "web"
    ? (await import("../web/chrome.js")).installWebChrome(editor, app)
    : (await import("./host-controls.js")).installHostControls(editor, app);
const disposePlaneEntry = planeEntryTools(editor);
const disposeSettings = installSettings(editor, app);
const toolMenu = new ToolMenu(editor, app);
world.changed.add(() => {
  const mode = app.querySelector(".mode-label");
  if (mode) mode.textContent = world.active ? "Sketching" : "Modeling";
  status.textContent =
    (editor.store.slow ? (world.active ? "Solving sketch…" : "Calculating geometry…") : "") ||
    editor.message ||
    editor.notice ||
    (world.active
      ? `${world.active} sketch · ${world.spacing} mm grid · ${editor.tool === "trim" ? "Trim · click a span · Option-drag to brush" : (editor.snap?.label ?? (editor.moveMode ? "Transform · Shift uniform · Option about anchor · ⌘-drag box moves" : "Shift bypasses geometry snaps · Option / Alt draws/resizes about center"))}`
      : editor.modeling.targets.length
        ? `${editor.modeling.targets.length} ${editor.modeling.targets.every((t) => t.kind === "body") ? "body" : editor.modeling.targets.every((t) => t.kind === "edge") ? "edge" : editor.modeling.targets.every((t) => t.kind === "face") ? "face" : editor.modeling.targets.every((t) => t.kind === "sketch") ? "sketch" : editor.modeling.targets.every((t) => t.kind === "profile") ? "region" : "item"} selected${editor.modeling.targets.every((t) => t.kind === "body" || t.kind === "sketch") ? " · M to transform" : ""}`
        : world.selectedPlane
          ? `${world.selectedPlane} plane selected · Enter to sketch`
          : editor.tool === "rectangle"
            ? "Rectangle · Choose a plane to sketch"
            : editor.tool === "trim"
              ? "Trim · Choose a plane to sketch"
              : "Choose a plane to sketch");
});
installViewInspection(editor, sections);
world.draw();
void editor.store.request({ kind: "read" });
window.addEventListener("pagehide", (event) => {
  if (event.persisted) return;
  decorators.dispose();
  disposeDecorators();
  disposeHost();
  disposeSettings();
  toolMenu.dispose();
  modelingTools.dispose();
  disposeControls();
  disposeCalculation();
  disposeReopen();
  modelControls.dispose();
  bodyMove.dispose();
  bodyActions.dispose();
  cleanup.dispose();
  deleteAction.dispose();
  booleans.dispose();
  faceOffsets.dispose();
  shells.dispose();
  erosion.dispose();
  meshImport.dispose();
  faceMoves.dispose();
  edgeMoves.dispose();
  bodyFinishes.dispose();
  disposeModelHighlight();
  disposeBodies();
  bodyEdges.dispose();
  projection.dispose();
  sections.dispose();
  mirror.dispose();
  scaling.dispose();
  disposeVisibility();
  tags.dispose();
  entities.dispose();
  overlaps.dispose();
  crossSection.dispose();
  constructionPlanes.dispose();
  planeCuts.dispose();
  measurements.dispose();
  gestures.dispose();
  dimensions.dispose();
  numeric.dispose();
  disposeDrawing();
  disposeFills();
  selection.dispose();
  transforms.dispose();
  pointChooser.dispose();
  pointEdge.dispose();
  pointTangent.dispose();
  constraints.dispose();
  lineConstraints.dispose();
  curvedConstraints.dispose();
  fillets.dispose();
  bows.dispose();
  beziers.dispose();
  trim.dispose();
  offsets.dispose();
  disposePlaneEntry();
  disposeLabels();
  world.dispose();
});
