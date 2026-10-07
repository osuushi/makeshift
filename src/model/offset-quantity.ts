import type { BodyFaceOffset, Face } from "./body.js";
import { type FaceFinish, sharedThickness } from "./face-offset-targets.js";

export type OffsetMode = "thickness" | "radius" | "offset";
/** Display units for one fixed offset baseline; changing modes never changes geometry. */
export class OffsetQuantity {
  mode: OffsetMode = "offset";
  thickness: Face["thickness"] = null;
  radius: Face["sphere"] = null;
  private blend: FaceFinish | null = null;
  private scale = 1;
  configure(faces: readonly Face[], targets: BodyFaceOffset["faces"], blend: FaceFinish | null) {
    this.blend = blend;
    this.scale = blend?.distanceScale ?? 1;
    this.thickness = blend ? null : sharedThickness(faces, targets);
    const first = faces[0]?.cylinder ?? faces[0]?.sphere;
    this.radius = blend
      ? { radius: blend.radius, outward: blend.outward === 1 ? -1 : 1 }
      : first &&
          faces.every((face) => {
            const other = face.cylinder ?? face.sphere;
            return (
              other &&
              Math.abs(other.radius - first.radius) < 1e-7 &&
              other.outward === first.outward
            );
          })
        ? first
        : null;
    this.mode = this.thickness ? "thickness" : this.radius ? "radius" : "offset";
  }
  get modes(): OffsetMode[] {
    return [
      ...(this.thickness ? ["thickness" as const] : []),
      ...(this.radius ? ["radius" as const] : []),
      "offset",
    ];
  }
  setMode(value: string) {
    if (this.modes.includes(value as OffsetMode)) this.mode = value as OffsetMode;
  }
  value(distance: number): number {
    if (this.mode === "thickness" && this.thickness)
      return this.thickness.distance + this.thickness.slope * distance;
    if (this.mode === "radius" && this.radius)
      return this.radius.radius + this.radius.outward * distance * this.scale;
    return distance;
  }
  distance(value: number): number {
    if (this.mode !== "offset" && (value < 0 || (value === 0 && !this.blend))) return NaN;
    if (this.mode === "thickness" && this.thickness)
      return (value - this.thickness.distance) * this.thickness.slope;
    if (this.mode === "radius" && this.radius)
      return ((value - this.radius.radius) * this.radius.outward) / this.scale;
    return value;
  }
  clamp(distance: number): number {
    if (!this.blend || !Number.isFinite(distance)) return distance;
    return (
      this.blend.outward * Math.min(this.blend.outward * distance, this.blend.radius / this.scale)
    );
  }
  finishInput(distance: number): Pick<BodyFaceOffset, "radius" | "chamfer"> {
    return this.blend
      ? {
          radius: Math.max(0, this.blend.radius - distance * this.blend.outward * this.scale),
          ...(this.blend.chamfer ? { chamfer: true } : {}),
        }
      : {};
  }
  get notice(): string {
    const action = this.blend
      ? this.blend.chamfer
        ? "Resize chamfer · enter distance"
        : "Resize fillet · enter radius"
      : "Offset faces";
    return `${action} · drag outward to add material · Enter to accept · Escape to cancel`;
  }
}
