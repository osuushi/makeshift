import "../tools/tool-prerequisites.css";
import "../tools/selection-step.css";
import { DecoratorPanel } from "../decorators/panel.js";
import { decoratorOverlay } from "../decorators/preview.js";
import { GuideControls } from "../guides/controls.js";
import { BodyActions } from "../model/body-actions.js";
import { BodyEdgeFinishControls } from "../model/body-edge-finish-controls.js";
import { BodyMoveControls } from "../model/body-move-controls.js";
import { BooleanControls } from "../model/boolean-controls.js";
import { CleanupControls } from "../model/cleanup-controls.js";
import { ConstructionPlaneControls } from "../model/construction-plane-controls.js";
import { CrossSectionControls } from "../model/cross-section-controls.js";
import { DeleteTopologyAction } from "../model/delete-topology-action.js";
import { DxfImportControls } from "../model/dxf-import-controls.js";
import { EdgeLoopControls } from "../model/edge-loop-controls.js";
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
import { installSelectionSection } from "../model/selection-section.js";
import { ShellControls } from "../model/shell-controls.js";
import { StepImportControls } from "../model/step-import-controls.js";
import { TopologyMoveControls } from "../model/topology-move-controls.js";
import { EditorPanes } from "../panes/editor-panes.js";
import { installSettings } from "../preferences/settings.js";
import { TagControls } from "../tags/controls.js";
import { installPlaneBounds } from "./plane-bounds.js";
import { planeEntryTools } from "./plane-entry-tools.js";
import { sketchEntryTool } from "./sketch-entry-tool.js";
import { installViewInspection } from "./view-inspection.js";
import "../model/entity-viewer.css";
import { BodyEdgeControls } from "../model/body-edge-controls.js";
import { bodyView } from "../model/body-view.js";
import { visibilityControls } from "../model/visibility-controls.js";
import "./style.css";
import "./modeling.css";
import { ProfileEditControls } from "../model/profile-edit-controls.js";
import { ModelControls } from "./model-controls.js";
import { modelHighlight } from "./model-highlight.js";
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
import { PenControls } from "./pen-controls.js";
import { PointChooser } from "./point-chooser.js";
import { PointEdgeControls } from "./point-edge-controls.js";
import { PointTangentControls } from "./point-tangent-controls.js";
import { drawRegionFills } from "./region-fill.js";
import { SelectionOverlay } from "./selection-overlay.js";
import { TransformOverlay } from "./transform-overlay.js";
import { TrimControls } from "./trim-controls.js";
import { installWorkspaceStatus } from "./workspace-status.js";
import { World } from "./world.js";
import { installWorldLabels } from "./world-labels.js";

const app = document.querySelector<HTMLElement>("#app");
if (!app) throw new Error("Missing app root");
app.innerHTML = `<div id="world"></div><div id="overlay"></div>
  <header class="workspace-toolbar" aria-label="Workspace controls">
    <button type="button" class="toolbar-app-menu" title="Makeshift menu"><img src="./makeshift.png" alt=""/></button>
    <div class="toolbar-context"><span class="mode-label">Modeling</span></div>
    <div class="exchange-menus" role="group" aria-label="Import and export"></div>
    <div class="toolbar-preferences"></div>
  </header>
  <footer class="workspace-footer"><div class="status" role="status"></div><div class="navigation-hint">Two-finger scroll · pan &nbsp; ⌘-drag · orbit &nbsp; Pinch · zoom &nbsp; Hold · choose overlap</div></footer>`;
const host = app.querySelector<HTMLElement>("#world"),
  overlay = app.querySelector<HTMLElement>("#overlay"),
  status = app.querySelector<HTMLElement>(".status");
if (!host || !overlay || !status) throw new Error("Missing viewport elements");
const panes = new EditorPanes(app);
const numeric = new NumericEdit(),
  world = new World(host, overlay),
  editor = new SketchEditor(world, numeric);
installWorkspaceStatus(editor, app, status);
installPlaneBounds(editor);
const decorators = new DecoratorPanel(
  editor,
  app,
  panes.content("Decorators"),
  panes.content("Gear groups"),
);
const disposeDecorators = decoratorOverlay(editor);
const disposeLabels = installWorldLabels(editor, overlay),
  disposeDrawing = drawSketches(editor),
  disposeFills = drawRegionFills(editor);
const guides = new GuideControls(
  editor,
  overlay,
  (point) => faceOffsets.guide(point) ?? modelControls.extrusion.guide(point),
);
const disposeCalculation = calculationControls(editor, app);
const modelControls = new ModelControls(editor, overlay);
const profileEdits = new ProfileEditControls(editor, overlay);
const shells = new ShellControls(editor, overlay);
const erosion = new ErosionControls(editor, overlay);
const dxfImport = new DxfImportControls(editor, overlay);
const stepImport = new StepImportControls(editor, overlay);
const meshImport = new MeshImportControls(editor, overlay);
const faceOffsets = new FaceOffsetControls(editor, overlay);
const faceMoves = new TopologyMoveControls(editor, overlay);
const edgeMoves = new TopologyMoveControls(editor, overlay, "edges");
const bodyFinishes = new BodyEdgeFinishControls(editor, overlay);
const edgeLoops = new EdgeLoopControls(editor, overlay);
const tags = new TagControls(editor, app);
const entities = new EntityViewer(editor, app, tags, guides);
const booleans = new BooleanControls(editor, overlay, entities);
const bodyMove = new BodyMoveControls(editor, overlay);
const disposeReopen = reopenControls(editor, async ({ request }) => {
  if (request.kind === "begin-profile-edit") profileEdits.reopen();
  else if (request.kind === "extrude") await modelControls.reopenExtrude(request.extrusion);
  else if (request.kind === "boolean-bodies") await booleans.reopen(request.operation);
  else if (request.kind === "revolve") await modelControls.reopenRevolve(request.revolution);
  else if (request.kind === "loft") await modelControls.reopenLoft(request.operation);
  else if (request.kind === "shell") await shells.reopen(request.operation);
  else if (request.kind === "erode") await erosion.reopen(request.operation);
  else if (request.kind === "finish-edges") await bodyFinishes.reopen(request.operation);
  else if (request.kind === "offset-faces") await faceOffsets.reopen(request.operation);
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
const transforms = new TransformOverlay(editor, overlay, (axis) => numeric.activateTransform(axis));
const constraints = new ConstraintDisplay(editor, panes.content("Constraints"));
const pointEdge = new PointEdgeControls(editor, constraints.available);
const pointTangent = new PointTangentControls(editor, constraints.available);
const pointChooser = new PointChooser(editor, overlay);
const lineConstraints = new LineConstraints(editor, constraints.available);
const curvedConstraints = new CurvedConstraints(editor, constraints.available);
const pen = new PenControls(editor, overlay);
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
editor.workspaceEntry.selectedConstructionPlane = () => constructionPlanes.selected();
const disposeSketchEntryTool = sketchEntryTool(editor);
// Section placement publishes its gizmo anchor before the Transform layer controls refresh.
const crossSection = new CrossSectionControls(editor, overlay, constructionPlanes.picker, () =>
  constructionPlanes.selectedFrame(),
);
const scaling = new ScaleControls(
  editor,
  overlay,
  () => {
    if (constructionPlanes.selected() && !editor.modeling.targets.length)
      return constructionPlanes.transform();
    if (editor.world.active) return editor.activateMove();
    else if (
      editor.modeling.targets.every(
        (target) => target.kind === "sketch" || target.kind === "profile",
      )
    )
      return modelControls.move();
    else {
      editor.modeling.setTool("move");
      editor.refresh();
    }
  },
  () => !!constructionPlanes.selected(),
);
const projection = new ProjectionControls(editor, overlay, constructionPlanes.picker, entities);
const sections = new SectionControls(editor);
const disposeSelectionSection = installSelectionSection(editor);
const bodyEdges = new BodyEdgeControls(editor);
const disposeVisibility = visibilityControls(editor, () => constructionPlanes.selected()?.id);
const measurements = new MeasurementControls(editor, app, panes.content("Measurements"));
const overlaps = new OverlapInput(editor, (plane) => constructionPlanes.select(plane));
const planeCuts = new PlaneCutControls(editor, overlay, constructionPlanes.picker, entities);
const disposePlaneEntry = planeEntryTools(editor);
const disposeSettings = installSettings(editor, app);
const disposePaneControls = panes.mountControls(editor, entities.element, status);
const disposeHost =
  import.meta.env.MODE === "web"
    ? (await import("../web/chrome.js")).installWebChrome(editor, app)
    : (await import("./host-controls.js")).installHostControls(editor, app, panes);
installViewInspection(editor, sections);
world.draw();
export const ready = editor.store.request({ kind: "read" }).then((success) => {
  if (!success) throw new Error(editor.message || "The document could not be loaded.");
  world.draw();
});
window.addEventListener("pagehide", (event) => {
  if (event.persisted) return;
  disposePaneControls();
  decorators.dispose();
  panes.dispose();
  disposeDecorators();
  disposeHost();
  disposeSettings();
  disposeSketchEntryTool();
  modelingTools.dispose();
  disposeControls();
  disposeCalculation();
  disposeReopen();
  modelControls.dispose();
  profileEdits.dispose();
  bodyMove.dispose();
  bodyActions.dispose();
  cleanup.dispose();
  deleteAction.dispose();
  booleans.dispose();
  faceOffsets.dispose();
  shells.dispose();
  erosion.dispose();
  meshImport.dispose();
  stepImport.dispose();
  dxfImport.dispose();
  faceMoves.dispose();
  edgeMoves.dispose();
  bodyFinishes.dispose();
  edgeLoops.dispose();
  disposeModelHighlight();
  disposeBodies();
  bodyEdges.dispose();
  projection.dispose();
  sections.dispose();
  mirror.dispose();
  scaling.dispose();
  disposeVisibility();
  tags.dispose();
  guides.dispose();
  entities.dispose();
  overlaps.dispose();
  crossSection.dispose();
  disposeSelectionSection();
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
  pen.dispose();
  trim.dispose();
  offsets.dispose();
  disposePlaneEntry();
  disposeLabels();
  world.dispose();
});
