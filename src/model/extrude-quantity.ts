import type { SketchEditor } from "../sketch/editor.js";
import type { OffsetMode } from "./offset-quantity.js";
import { OffsetQuantity } from "./offset-quantity.js";

/** Normal extrusion shares the radius/distance units of Offset, without its propagation. */
export class ExtrudeQuantity {
  readonly select = document.createElement("select");
  private quantity = new OffsetQuantity();
  private normal = false;
  constructor(changed: () => void) {
    this.select.className = "offset-quantity";
    this.select.setAttribute("aria-label", "Extrusion measurement");
    this.select.onchange = () => {
      this.quantity.setMode(this.select.value);
      changed();
    };
  }
  configure(editor: SketchEditor, active: boolean, normal: boolean) {
    this.normal = normal;
    this.select.hidden = !normal;
    if (!normal || active) return;
    const resolution = editor.modeling.resolve("extrude");
    if (!resolution.available) return;
    const faces = resolution.inputs.flatMap((source) =>
      "face" in source
        ? (editor.store.data.bodies
            ?.flatMap((body) => body.faces)
            .filter((face) => face.id === source.face) ?? [])
        : [],
    );
    this.quantity.configure(faces, [], null);
    // Thickness references belong to Offset's continuing-wall semantics.
    this.quantity.thickness = null;
    this.quantity.mode = this.quantity.radius ? "radius" : "offset";
    this.select.replaceChildren(
      ...this.quantity.modes.map(
        (mode) => new Option(mode === "radius" ? "Radius" : "Distance", mode),
      ),
    );
    this.select.value = this.quantity.mode;
  }
  get mode(): OffsetMode {
    return this.quantity.mode;
  }
  setMode(mode: OffsetMode): void {
    this.quantity.setMode(mode);
    this.select.value = this.quantity.mode;
  }
  display(distance: number): number {
    return this.normal ? this.quantity.value(distance) : distance;
  }
  distance(value: number): number {
    return this.normal ? this.quantity.distance(value) : value;
  }
}
