import type { SketchEditor } from "../sketch/editor.js";
import { circularExtrusion } from "./circular-extrusion.js";
import { CircularPrimitiveControls } from "./circular-primitive-controls.js";
import { createDrill, drillPlane } from "./drill-primitive.js";
import type { ExtrudeControls } from "./extrude-controls.js";
import type { RevolveControls } from "./revolve-controls.js";
import { createSphere } from "./sphere-primitive.js";

/** Guided tools stop at the ordinary editable Extrude/Revolve handoff. */
export function primitiveTools(
  editor: SketchEditor,
  overlay: HTMLElement,
  extrude: ExtrudeControls,
  revolve: RevolveControls,
): () => void {
  const tools = [
    new CircularPrimitiveControls(editor, overlay, {
      id: "cylinder",
      label: "Cylinder",
      shape: "cylinder",
      aliases: ["round prism", "tube"],
      hint: "Cylinder · Click to place · Drag from center to size · Continue in Extrude",
      description: "Place a circle, then adjust its Union extrusion",
      create: (placement, lease) =>
        circularExtrusion(editor, extrude, placement, lease, {
          distance: placement.radius * 2,
          symmetric: false,
          mode: "union",
        }),
    }),
    new CircularPrimitiveControls(editor, overlay, {
      id: "sphere",
      label: "Sphere",
      shape: "sphere",
      aliases: ["ball"],
      hint: "Sphere · Click to place · Drag from center to size · Continue in Revolve",
      description: "Place a bisected circle, then explore its 360° Union revolution",
      create: async (placement, lease) => {
        await createSphere(editor, revolve, placement, lease);
      },
    }),
    new CircularPrimitiveControls(editor, overlay, {
      id: "cone",
      label: "Cone",
      shape: "cone",
      aliases: ["spike", "taper"],
      hint: "Cone · Click to place · Drag from center to size · Continue in Extrude",
      description: "Place a circle, then draft its extrusion to an exact point",
      create: (placement, lease) =>
        circularExtrusion(editor, extrude, placement, lease, {
          distance: placement.radius * 2,
          symmetric: false,
          mode: "union",
          draft: { mode: "offset", value: -placement.radius },
        }),
    }),
    new CircularPrimitiveControls(editor, overlay, {
      id: "drill",
      label: "Drill",
      shape: "drill",
      aliases: ["hole", "bore", "through hole"],
      hint: "Drill · Choose a planar body face · Click or drag a circle · Subtract through the body",
      description: "Cut a circular hole inward through the selected face's entire body",
      plane: (screen) => drillPlane(editor, screen),
      create: (placement, lease) => createDrill(editor, extrude, placement, lease),
    }),
  ];
  return () => {
    for (const tool of tools) tool.dispose();
  };
}
