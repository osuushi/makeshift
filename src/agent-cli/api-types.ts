import { scriptTypes } from "./script-types.js";
import { viewTypes } from "./view-types.js";

/** Standalone declarations distributed with the CLI; no application-private imports. */
const declarations = `/** CLI results and the typed makeshift scripting API. */
export type Vector = [number, number, number];
export interface Plane { origin: Vector; u: Vector; v: Vector }
export interface MakeshiftStatus {
  application: "Makeshift";
  document: { name: string; saved: boolean; edited: boolean; units: "mm" };
  capabilities: readonly ("help" | "docs" | "types" | "status" | "selection" | "select" | "inspect" | "render" | "run" | "view" | "faces" | "context" | "settings")[];
}
export type Target =
  | { kind: "tagged-group"; taggedGroup: string }
  | { kind: "plane"; plane: string }
  | { kind: "body"; body: string }
  | { kind: "face"; body: string; face: string }
  | { kind: "edge"; body: string; edge: string }
  | { kind: "sketch"; sketch: string }
  | { kind: "profile"; sketch: string; profile: string }
  | { kind: "curve" | "midpoint" | "curve-center"; sketch: string; curve: string }
  | { kind: "endpoint"; sketch: string; curve: string; end: "a" | "b" }
  | { kind: "group" | "group-center"; sketch: string; group: string }
  | { kind: "group-handle"; sketch: string; group: string; handle: "corner" | "edge"; index: number };
export interface ViewContext {
  mode: "sketch" | "modeling";
  activeSketch: string | null;
  selection: Target[];
  selectedPoints: { target: Target; position: Vector }[];
  hidden: string[];
  bodiesVisible: boolean;
  camera: { projection: "orthographic"; position: number[]; target: number[]; up: number[];
    width: number; height: number; near: number; far: number };
  clipping: { kind: "visual"; plane: Plane; equations: number[][] } | null;
}
/** select: resulting UI selection, with no geometry mutation. */
export interface MakeshiftSelect { units: "mm"; context: ViewContext }
export interface Distance { value: number; points: [Vector, Vector] }
export interface Measurement {
  properties: { label: string; value: number; unit: "mm" | "mm²" | "°" }[];
  relationships: string[];
  distance?: Distance; minimumGap?: Distance; maximumGap?: Distance;
  approximate?: boolean; gapReason?: string;
}
/** selection and inspect ID. Geometry fields depend on target kind; see makeshift docs. */
export interface MakeshiftSelection {
  units: "mm"; context: ViewContext;
  targets: { target: Target; geometry: Record<string, unknown> }[];
  measurement: Measurement | null; measurementError?: string;
}
export interface BodySummary {
  kind: "body"; id: string; volume: number; center: Vector;
  /** [minX, minY, minZ, maxX, maxY, maxZ], mm; conservative kernel bounds. */
  bounds: number[]; boundsKind: string; dimensions: number[];
  faces: string[]; edges: string[]; visible: boolean;
}
/** inspect without ID. */
export interface MakeshiftOverview {
  taggedGroups: readonly TaggedGroup[];
  decorators: readonly DecoratorInstance[];
  decoratorDefinitions: readonly DecoratorDefinition[];
  builtinDecorators: DecoratorCatalog["builtins"];
  units: "mm"; context: ViewContext; bodies: BodySummary[];
  constructionPlanes: { kind: "plane"; id: string; frame: Plane; visible: boolean }[];
  sketches: { kind: "sketch"; id: string; plane: Plane; visible: boolean;
    profiles: { sketch: string; profile: string; area: number;
      outer: { curve: string; start: number; end: number }[];
      holes: { curve: string; start: number; end: number }[][] }[];
    curves: { id: string; kind: "segment" | "circle" | "arc" | "bezier" }[];
    constraints: number; groups: { id: string; kind: "rectangle" }[] }[];
}
/** render. The path is machine-local and expires with this Agent launch. */
export interface MakeshiftRender extends ViewContext {
  units: "mm"; path: string; width: number; height: number; note: string;
}
${viewTypes}
${scriptTypes}`;

export function typesFor(mode: "modeling" | "view"): string {
  return (
    declarations +
    `\ndeclare global {
      const makeshift: ${mode === "view" ? "MakeshiftView" : "MakeshiftScript"};
      /** Compatibility alias for scripts saved before the Makeshift rename. */
      const freac: typeof makeshift;
    }\n`
  );
}
export const types = typesFor("modeling");
