import type { SketchDocument } from "../sketch/document.js";
import { gearDefinition } from "./gear-settings.js";
import type { DecoratorInstance } from "./types.js";

export function editGearColor(
  document: SketchDocument,
  id: string,
  color: string,
): readonly DecoratorInstance[] {
  if (!/^#[\da-f]{6}$/i.test(color)) throw new Error("Enter a six-digit hex color");
  const selected = document.decorators?.find((d) => d.id === id && d.definition === gearDefinition);
  if (!selected) throw new Error("Select an existing gear group");
  return (document.decorators ?? []).map((d) =>
    d.id === id || (selected.gearGroup && d.gearGroup === selected.gearGroup)
      ? { ...d, gearColor: color.toLowerCase() }
      : d,
  );
}
