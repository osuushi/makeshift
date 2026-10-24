import type { SketchEditor } from "../sketch/editor.js";
import { gearFaces } from "./gear-faces.js";
import { toothTipWidth } from "./gear-group-fit.js";
import { groupEligible } from "./gear-group-geometry.js";
import { gearDefinition } from "./gear-settings.js";
import { inspectGear } from "./gear-support.js";
import type { DecoratorInstance } from "./types.js";

export function appendGearInformation(
  root: HTMLElement,
  editor: SketchEditor,
  instances: DecoratorInstance[],
) {
  if (instances[0].definition !== gearDefinition) return;
  const note = document.createElement("p");
  if (instances[0].gearGroup && instances.length > 1) {
    const sizes = instances.map((instance) => inspectGear(editor.store.data, instance));
    const width = Math.min(
      ...instances.map((instance, i) => toothTipWidth(instance, sizes[i].pitchRadius)),
    );
    note.textContent = `Normal module ${Number(sizes[0].normalModule.toFixed(3))} mm · minimum tip width ${Number(width.toFixed(3))} mm`;
    root.append(note);
    return;
  }
  note.textContent = instances
    .map((instance) => {
      const face = gearFaces(editor.store.data, instance.faces)[0];
      if (face.plane)
        return `Rack · normal module ${Number(Number(instance.settings.module).toFixed(3))} mm`;
      const dimensions = inspectGear(editor.store.data, instance);
      const correction =
        face.cylinder && instance.gearPitchRadius !== undefined
          ? ` · diameter correction ${Number((2 * (dimensions.pitchRadius - face.cylinder.radius)).toFixed(3))} mm · tip width ${Number(toothTipWidth(instance, dimensions.pitchRadius).toFixed(3))} mm`
          : "";
      return `${face.cone ? "Bevel reference" : "Pitch"} Ø${Number((2 * dimensions.pitchRadius).toFixed(3))} mm · ${instance.settings.teeth} teeth · normal module ${Number(dimensions.normalModule.toFixed(3))} mm${correction}`;
    })
    .join("; ");
  root.append(note);
}

/** Mixed selections edit only the members to which a geometric parameter applies. */
export function gearFieldInstances(
  editor: SketchEditor,
  instances: DecoratorInstance[],
  key: string,
) {
  if (instances[0].definition !== gearDefinition) return instances;
  return instances.filter((instance) => {
    const face = gearFaces(editor.store.data, instance.faces)[0];
    if (["diameterTolerance", "minimumTooth"].includes(key))
      return !!instance.gearGroup && groupEligible(editor.store.data, instance);
    if (key === "module" && instance.gearGroup && face.cylinder)
      return groupEligible(editor.store.data, instance);
    if (["module", "direction", "rackPhase"].includes(key)) return !!face.plane;
    if (["teeth", "phase"].includes(key)) return !face.plane;
    if (["helix", "hand"].includes(key)) return !face.cone;
    return true;
  });
}
