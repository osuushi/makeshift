import type {
  BodyBoolean,
  BodyEdgeFinish,
  BodyErosion,
  BodyFaceOffset,
  BodyShell,
  BodyTransform,
  BooleanMode,
  EdgeMovement,
  Extrusion,
  FaceMovement,
  Revolution,
} from "../model/body.js";
import type { CleanupSelection } from "../model/cleanup.js";
import type { Projection } from "../model/projection.js";
import type { Sketch, SketchDocument } from "./document.js";
import type { EditIntent } from "./edit-intent.js";

import type { HistoryOperation, OperationHistoryEntry } from "./operation-history.js";
import type { PlaneFrame } from "./planes.js";

export type ModelRequest =
  | { kind: "reconstruct-mesh"; input: import("../model/mesh-fit.js").MeshReconstructionInput }
  | { kind: "tagged-group"; edit: import("../tags/model.js").TagEdit }
  | { kind: "export-step"; items: import("../model/step-export.js").StepItem[] }
  | { kind: "cancel-step-export" }
  | { kind: "export-geometry"; bodyIds?: string[] }
  | {
      kind: "decorator-draft";
      edit: Extract<import("../decorators/types.js").DecoratorEdit, { action: "settings" }>;
    }
  | { kind: "decorator"; edit: import("../decorators/types.js").DecoratorEdit }
  | { kind: "decorator-definition"; edit: import("../decorators/definition.js").DefinitionEdit }
  | { kind: "decorator-enable"; id: string; version: number; enabled: boolean }
  | {
      kind: "decorator-inspect";
      query: import("../decorators/inspection.js").DecoratorInspectionRequest;
    }
  | { kind: "offset-sketch"; sketchId: string; curves: string[]; amount: number }
  | { kind: "sections"; frame: PlaneFrame; bodies: string[] }
  | { kind: "selection"; changes: import("./history-selection.js").SelectionChanges }
  | { kind: "body-appearance"; appearance: import("../model/body-appearance.js").BodyAppearance }
  | { kind: "rename-entity"; id: string; name: string }
  | { kind: "reorder-entity"; id: string; beforeId: string | null }
  | { kind: "check-plane-cut"; operation: import("../model/plane-cut.js").PlaneCut }
  | { kind: "scale"; operation: import("../model/scale.js").ScaleOperation }
  | { kind: "plane-cut"; operation: import("../model/plane-cut.js").PlaneCut }
  | {
      kind: "construction-plane";
      plane: import("../model/construction-plane.js").ConstructionPlane;
    }
  | { kind: "delete-plane"; id: string }
  | { kind: "mirror"; operation: import("../model/mirror.js").MirrorOperation }
  | { kind: "measure"; targets: import("../model/measurement.js").MeasurementTarget[] }
  | { kind: "cancel-preview" }
  | { kind: "supersede-preview"; interrupt?: boolean }
  | { kind: "check-cleanup" | "read-history" }
  | { kind: "cleanup" | "delete-topology"; selection: CleanupSelection[] }
  | { kind: "accept"; cleanup?: boolean }
  | { kind: "project"; projection: Projection }
  | { kind: "open"; document: SketchDocument }
  | { kind: "transform-bodies"; transform: BodyTransform }
  | { kind: "move-edges"; operation: EdgeMovement }
  | { kind: "move-faces"; operation: FaceMovement }
  | { kind: "boolean-bodies"; operation: BodyBoolean }
  | { kind: "edge-finish-selection"; operation: Omit<BodyEdgeFinish, "size"> }
  | { kind: "shell"; operation: BodyShell }
  | { kind: "erode"; operation: BodyErosion }
  | { kind: "offset-faces"; operation: BodyFaceOffset }
  | { kind: "finish-edges"; operation: BodyEdgeFinish }
  | { kind: "loft"; operation: import("../model/loft.js").Loft }
  | { kind: "revolve"; revolution: Revolution }
  | { kind: "extrude"; extrusion: Extrusion }
  | {
      kind: "place-sketch";
      sketchId: string;
      frame: PlaneFrame;
      duplicate?: boolean;
      additional?: { sketchId: string; frame: PlaneFrame }[];
    }
  | { kind: "merge-sketches"; targetSketchId: string; sourceSketchIds: string[] }
  | {
      kind: "delete-entities";
      bodyIds: string[];
      sketchIds: string[];
      topology?: CleanupSelection[];
    }
  | { kind: "delete-sketch"; sketchId: string }
  | { kind: "navigation-history"; direction: "undo" | "redo" }
  | { kind: "read" | "discard" | "undo" | "redo" | "new" }
  | { kind: "preview" | "edit"; sketch: Sketch; intent?: EditIntent }
  | { kind: "remove" | "clear"; sketchId: string; ids?: string[] };
export interface ModelView {
  canUndoView?: boolean;
  canRedoView?: boolean;
  erosionQuality?: import("../model/erosion-quality.js").ErosionQuality[];
  meshFit?: import("../model/mesh-fit.js").MeshFitStatistics;
  decoratorSources?: readonly import("../decorators/javascript-hooks.js").EnabledDefinition[];
  historyNavigation?: import("./history-navigation.js").HistoryNavigation;
  historyOperation?: HistoryOperation;
  historySelection?: import("./history-selection.js").HistorySelection;
  planeCutAvailable?: boolean;
  data: SketchDocument;
  offsetDistance?: number;
  offsetSelection?: BodyFaceOffset["faces"];
  cleanupAvailable?: boolean;
  edgeSize?: number;
  edgeSelection?: BodyEdgeFinish["edges"];
  booleanMode?: BooleanMode;
  booleanTargets?: string[];
  canUndo: boolean;
  canRedo: boolean;
  candidate: SketchDocument | null;
  solveCount: number;
  solveMs: number;
}
export type ModelReply = {
  erosionAllowance?: number;
  step?: string;
  decoratorDraft?: readonly import("../decorators/types.js").DecoratorInstance[];
  decoratorInspection?: import("../decorators/inspection.js").DecoratorInspection;
  exportDocument?: SketchDocument;
  sections?: import("../model/sketch-section.js").SketchSection[];
  documentChanged?: boolean;
  view: ModelView;
  error?: string;
  history?: OperationHistoryEntry[];
  measurement?: import("../model/measurement.js").Measurement;
};
export type ModelCall = (request: ModelRequest) => Promise<ModelReply>;
