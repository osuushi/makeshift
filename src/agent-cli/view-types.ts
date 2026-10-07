export const viewTypes = `
interface FaceBase { kind: "face"; id: string; body: string; edges: readonly string[]; visible: boolean }
/** Analytic support, not trimmed extent. All distances are mm. Other includes unclassified surfaces. */
export type FaceInfo = FaceBase & (
  | { surface: "plane"; plane: Plane; cylinder: null }
  | { surface: "cylinder"; plane: null; cylinder: { origin: Vector; axis: Vector; radius: number; outward: 1 | -1 } }
  | { surface: "cone"; plane: null; cylinder: null; cone: { apex: Vector; axis: Vector; semiAngle: number; outward: 1 | -1 } }
  | { surface: "other"; plane: null; cylinder: null }
);
export interface PlaneSettings {
  angleCutoff: number; fadeWidth: number; selectableMinimum: number;
  fullOpacityAbove: number; fadeMilliseconds: number;
  colors: Record<"XY" | "XZ" | "YZ", string>;
  palettes: Record<string, Record<"XY" | "XZ" | "YZ", string>>;
}
export interface ApplicationPreferences {
  canonicalPlanes: PlaneSettings; viewDisplay: { planes: number; grid: number };
}
export interface MakeshiftView {
  /** Read or patch device-local display preferences, outside geometry Undo. */
  settings(patch?: { canonicalPlanes?: Partial<PlaneSettings>; viewDisplay?: Partial<ApplicationPreferences["viewDisplay"]> }): Promise<ApplicationPreferences>;
  /** All accepted faces, including hidden bodies. Filter visible when requested. */
  faces(): Promise<FaceInfo[]>;
  /** Current view and ordered explicit targets, without kernel measurements. */
  context(): Promise<ViewContext>;
  /** Immediate selection change; outside geometry Undo. Empty replacement clears. */
  select(ids: readonly string[], mode?: "replace" | "add" | "remove"): Promise<MakeshiftSelect>;
}
`;
