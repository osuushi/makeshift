export type Vector = [number, number, number];
export interface Plane {
  origin: Vector;
  u: Vector;
  v: Vector;
}
export interface MakeshiftStatus {
  application: "Makeshift";
  document: { name: string; saved: boolean; edited: boolean; units: "mm" };
  capabilities: readonly (
    | "help"
    | "docs"
    | "types"
    | "status"
    | "selection"
    | "select"
    | "inspect"
    | "render"
    | "run"
    | "view"
    | "faces"
    | "context"
    | "settings"
  )[];
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
  | {
      kind: "group-handle";
      sketch: string;
      group: string;
      handle: "corner" | "edge";
      index: number;
    };
