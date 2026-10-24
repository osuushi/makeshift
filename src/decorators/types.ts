import type { ExportMesh } from "../model/export-mesh.js";
import type { PlaneFrame } from "../sketch/planes.js";

export type Settings = Record<string, string | number | boolean>;
export interface FaceReference {
  body: string;
  face: string;
}
export interface DecoratorInstance {
  readonly id: string;
  readonly definition: string;
  readonly version: number;
  readonly faces: readonly FaceReference[];
  readonly settings: Settings;
  readonly presetId?: string;
  /** Persistent local coordinates keep a helix continuous across face changes. */
  readonly frame: PlaneFrame;
  /** Original axial reference retained when coverage is split or partially removed. */
  readonly axialReference?: [number, number];
  readonly problem?: string;
  readonly state?: unknown;
  /** Cylindrical gears sharing compatible tooth profiles independent of placement. */
  readonly gearGroup?: string;
  /** Saved group preview color; synchronized across members by document edits. */
  readonly gearColor?: string;
  /** Fitted decorator pitch radius; never changes the support BRep. */
  readonly gearPitchRadius?: number;
}
export interface DecoratorField {
  key: string;
  label: string;
  type: "number" | "enum";
  unit?: string;
  min?: number;
  max?: number;
  default?: string | number | boolean;
  visibleWhen?: { key: string; values: readonly (string | number | boolean)[] };
  options?: readonly { value: string; label: string }[];
}
export interface MeshModification {
  operation: "add" | "subtract";
  mesh: ExportMesh;
}
export type DecoratorEdit =
  | {
      action: "preset";
      ids: string[];
      operation: "duplicate" | "rename" | "select";
      presetId?: string;
      name?: string;
    }
  | {
      action: "apply";
      definition: string;
      version?: number;
      faces: FaceReference[];
      settings?: Settings;
      gearGroup?: string;
      newGearGroup?: boolean;
    }
  | { action: "gear-color"; id: string; color: string }
  | { action: "settings"; ids: string[]; patch: Settings; replace?: boolean }
  | { action: "continue"; id: string; faces: FaceReference[] }
  | { action: "reassign"; id: string; faces: FaceReference[] }
  | { action: "discard"; id: string }
  | { action: "remove"; faces: FaceReference[] };
