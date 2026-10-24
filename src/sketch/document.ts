import type { Body } from "../model/body.js";
import { coplanar, type PlaneFrame, type Point } from "./planes.js";

export interface Segment {
  readonly id: string;
  readonly kind: "segment";
  readonly a: Point;
  readonly b: Point;
  readonly construction: boolean;
}
export interface Circle {
  readonly id: string;
  readonly kind: "circle";
  readonly center: Point;
  readonly radius: number;
  readonly construction: boolean;
}
export interface Arc {
  readonly id: string;
  readonly kind: "arc";
  readonly a: Point;
  readonly b: Point;
  readonly bulge: number;
  // At exactly 180 degrees either radius branch has identical geometry.
  readonly semicircleBranch?: "major";
  readonly construction: boolean;
}
export interface Bezier {
  readonly id: string;
  readonly kind: "bezier";
  readonly a: Point;
  readonly c1: Point;
  readonly c2: Point;
  readonly b: Point;
  readonly construction: boolean;
}
export type Curve = Segment | Circle | Arc | Bezier;
export interface Endpoint {
  readonly curve: string;
  readonly end: "a" | "b";
}
export type PointReference = Endpoint | { readonly curve: string; readonly end: "center" };
export interface NumericConstraint {
  readonly id: string;
  readonly kind: "length" | "radius";
  readonly curve: string;
  readonly value: number;
}
export interface AngleConstraint {
  readonly id: string;
  readonly kind: "corner-angle";
  readonly a: string;
  readonly b: string;
  readonly aEnd: "a" | "b";
  readonly bEnd: "a" | "b";
  readonly value: number;
}
export interface TangentConstraint {
  readonly id: string;
  readonly kind: "tangent";
  readonly a: string;
  readonly b: string;
  readonly side: -1 | 1 | "external" | "a-contains-b" | "b-contains-a";
  readonly junction?: { readonly aEnd: "a" | "b"; readonly bEnd: "a" | "b" };
}
export type Constraint =
  | {
      readonly id: string;
      readonly kind: "point-on-edge";
      readonly point: PointReference;
      readonly edge: string;
    }
  | TangentConstraint
  | AngleConstraint
  | NumericConstraint
  | { readonly id: string; readonly kind: "horizontal" | "vertical"; readonly a: string }
  | {
      readonly id: string;
      readonly kind: "coincident";
      readonly a: PointReference;
      readonly b: PointReference;
    }
  | {
      readonly id: string;
      readonly kind: "parallel" | "perpendicular" | "equal";
      readonly a: string;
      readonly b: string;
    };
export interface EditingGroup {
  readonly id: string;
  readonly kind: "rectangle";
  readonly members: readonly string[];
}
export interface Sketch {
  readonly id: string;
  readonly plane: PlaneFrame;
  readonly curves: readonly Curve[];
  readonly constraints: readonly Constraint[];
  readonly groups: readonly EditingGroup[];
}
export interface SketchDocument {
  readonly guidePoints?: readonly import("../guides/types.js").GuidePoint[];
  readonly sketchGrid?: import("./grid-settings.js").SketchGrid;
  readonly taggedGroups?: readonly import("../tags/model.js").TaggedGroup[];
  readonly decoratorDefinitions?: readonly import("../decorators/definition.js").DecoratorDefinition[];
  readonly decoratorPresets?: readonly import("../decorators/presets.js").DecoratorPreset[];
  readonly lastDecoratorChoices?: Record<
    string,
    import("../decorators/presets.js").DecoratorChoice
  >;
  readonly decorators?: readonly import("../decorators/types.js").DecoratorInstance[];
  readonly bodyAppearances?: readonly import("../model/body-appearance.js").BodyAppearance[];
  readonly entityPresentation?: readonly import("../model/entity-presentation.js").EntityPresentation[];
  readonly units: "mm";
  readonly constructionPlanes?: readonly import("../model/construction-plane.js").ConstructionPlane[];
  readonly bodies?: readonly Body[];
  readonly sketches: readonly Sketch[];
}
export const newId = (): string => {
  // LAN HTTP does not expose randomUUID; getRandomValues remains available.
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};
export const emptySketch = (plane: PlaneFrame): Sketch => ({
  id: newId(),
  plane,
  curves: [],
  constraints: [],
  groups: [],
});
export const samePlane = coplanar;
export const sketchOn = (doc: SketchDocument, plane: PlaneFrame): Sketch | undefined =>
  doc.sketches.find((sketch) => samePlane(sketch.plane, plane));
export const withSketch = (doc: SketchDocument, sketch: Sketch): SketchDocument => ({
  ...doc,
  sketches: doc.sketches.some((item) => item.id === sketch.id)
    ? doc.sketches.map((item) => (item.id === sketch.id ? sketch : item))
    : [...doc.sketches, sketch],
});
