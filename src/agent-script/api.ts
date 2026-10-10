import type { InspectionTarget } from "../agent/inspection-protocol.js";
import type {
  BodyBoolean,
  BodyEdgeFinish,
  BodyErosion,
  BodyFaceOffset,
  BodyShell,
  BodyTransform,
  Extrusion,
  FaceMovement,
  Revolution,
} from "../model/body.js";
import type { Loft } from "../model/loft.js";
import type { MeshFitInput, MeshFitStatistics } from "../model/mesh-fit.js";
import type { PathSweep } from "../model/path-sweep.js";
import type { PlaneCut } from "../model/plane-cut.js";
import type { ScaleOperation } from "../model/scale.js";
import type { BodyTopology, FaceReplacement } from "../model/topology-edit.js";
import type { PlaneFrame, PlaneId, Point } from "../sketch/planes.js";
import type { TagScriptApi, TagScriptOperation } from "../tags/script.js";
import type { DecoratorScriptApi, DecoratorScriptOperation } from "./decorators.js";

export type ScriptCurve =
  | { kind: "segment"; a: Point; b: Point }
  | { kind: "circle"; center: Point; radius: number }
  | { kind: "arc"; a: Point; b: Point; bulge: number }
  | { kind: "bezier"; a: Point; c1: Point; c2: Point; b: Point };
export interface SketchInput {
  plane: PlaneId | PlaneFrame;
  curves: ScriptCurve[];
}
export interface SketchResult {
  sketch: string;
  curves: string[];
  profiles: { sketch: string; profile: string }[];
}
export interface SolidResult {
  bodies: { id: string; volume: number; faces: string[]; edges: string[] }[];
}
export interface MeshFitResult extends SolidResult {
  fit: MeshFitStatistics;
}
export interface PlaneInput {
  id?: string;
  frame: PlaneFrame;
}
export interface PlaneResult {
  plane: string;
  frame: PlaneFrame;
}
export interface ScaleResult extends SolidResult {
  sketches: SketchResult[];
}
export type ScriptResult =
  | { centerOfMass: import("../sketch/planes.js").Vector }
  | readonly import("../tags/model.js").TaggedGroup[]
  | BodyTopology
  | SketchResult
  | SolidResult
  | MeshFitResult
  | ScaleResult
  | PlaneResult
  | { removed: string };
/** All distances are mm, angles degrees. Await each call; parallel edits reject. */
export interface ScriptApi extends DecoratorScriptApi, TagScriptApi {
  /** Fit shared bicubic surfaces to a triangle mesh using a supplied closed quad layout. */
  fitMesh(input: MeshFitInput): Promise<MeshFitResult>;
  topology(input: { body: string }): Promise<BodyTopology>;
  /** Uniform-density mass center in world millimeters; computed on demand and cached. */
  centerOfMass(input: {
    body: string;
  }): Promise<{ centerOfMass: import("../sketch/planes.js").Vector }>;
  replaceFace(input: FaceReplacement): Promise<SolidResult>;
  /** Omit id to create; supply an existing plane id to reposition. Frames are copied. */
  constructionPlane(input: PlaneInput): Promise<PlaneResult>;
  deleteConstructionPlane(input: { id: string }): Promise<{ removed: string }>;
  splitBody(input: Omit<PlaneCut, "mode">): Promise<SolidResult>;
  imprint(input: Omit<PlaneCut, "mode">): Promise<SolidResult>;
  scale(input: ScaleOperation): Promise<ScaleResult>;
  /** Sweep an initially perpendicular section along connected smooth 3D curves. */
  sweep(input: PathSweep): Promise<SolidResult>;
  /** Ordered operands; subtract removes later bodies from the first. */
  booleanBodies(input: BodyBoolean): Promise<SolidResult>;
  /** Zero is a no-op. Unachievable sizes reject, never silently clamp. */
  finishEdges(input: BodyEdgeFinish): Promise<SolidResult>;
  /** Negative thickness hollows inward; empty opening faces means a closed hollow body. */
  shell(input: BodyShell): Promise<SolidResult>;
  erode(input: BodyErosion): Promise<SolidResult>;
  /** Fixed at script start. Point selections never imply whole-curve selection. */
  readonly selection: readonly InspectionTarget[];
  /** Ordinary editable curves on an explicit plane; IDs assigned by Makeshift. */
  createSketch(input: SketchInput): Promise<SketchResult>;
  /** Extrude closed profiles or solid faces; curved faces follow their local normals. */
  extrude(input: Extrusion): Promise<SolidResult>;
  /** Revolve or sweep helically: height is total axial travel, not pitch per turn. */
  revolve(input: Revolution): Promise<SolidResult>;
  /** Connect ordered planar regions/faces; alignment steps adjust automatic seams. */
  loft(input: Loft): Promise<SolidResult>;
  /** Normal face offset. Unsupported or limited distances reject the whole script. */
  offsetFaces(input: BodyFaceOffset): Promise<SolidResult>;
  /** Translate/rotate selected solid faces with shared boundary reconnection. */
  moveFaces(input: FaceMovement): Promise<SolidResult>;
  /** Rigid movement/rotation or duplication of explicit bodies. */
  transformBodies(input: BodyTransform): Promise<SolidResult>;
}
export type ScriptOperation =
  | { kind: "fitMesh"; input: MeshFitInput }
  | TagScriptOperation
  | { kind: "topology"; input: { body: string } }
  | { kind: "centerOfMass"; input: { body: string } }
  | { kind: "replaceFace"; input: FaceReplacement }
  | DecoratorScriptOperation
  | { kind: "booleanBodies"; input: BodyBoolean }
  | { kind: "finishEdges"; input: BodyEdgeFinish }
  | { kind: "shell"; input: BodyShell }
  | { kind: "erode"; input: BodyErosion }
  | { kind: "sweep"; input: PathSweep }
  | { kind: "constructionPlane"; input: PlaneInput }
  | { kind: "deleteConstructionPlane"; input: { id: string } }
  | { kind: "splitBody"; input: Omit<PlaneCut, "mode"> }
  | { kind: "imprint"; input: Omit<PlaneCut, "mode"> }
  | { kind: "scale"; input: ScaleOperation }
  | { kind: "createSketch"; input: SketchInput }
  | { kind: "extrude"; input: Extrusion }
  | { kind: "revolve"; input: Revolution }
  | { kind: "loft"; input: Loft }
  | { kind: "offsetFaces"; input: BodyFaceOffset }
  | { kind: "moveFaces"; input: FaceMovement }
  | { kind: "transformBodies"; input: BodyTransform };
export interface ScriptRequest {
  action: "begin" | "step" | "finish" | "cancel" | "poll";
  token?: string;
  name?: string;
  error?: string;
  operation?: ScriptOperation;
}
