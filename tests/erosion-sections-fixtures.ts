import { readFileSync } from "node:fs";
import type { DocumentOwner } from "../src/backend/document-owner.js";
import type { SketchDocument } from "../src/sketch/document.js";
import { planes } from "../src/sketch/planes.js";
import { box, combine, cylinder } from "./erosion-special-primitives.js";

export const lobedErosionSource = (
  JSON.parse(readFileSync("tests/fixtures/erosion-lobed-fillet.json", "utf8")) as {
    document: SketchDocument;
  }
).document;

export async function erosionBores(owner: DocumentOwner) {
  const solid = await box(owner, [-15, -12, 0], [30, 24, 12]);
  const first = await cylinder(owner, 3, 12, { ...planes.XY, origin: [-7, 0, 0] });
  const second = await cylinder(owner, 2, 12, { ...planes.XY, origin: [7, 0, 0] });
  return combine(owner, [solid, first, second], "subtract");
}

export function boreInteriorVolume(depth: number) {
  const area =
    (30 - 2 * depth) * (24 - 2 * depth) - Math.PI * ((3 + depth) ** 2 + (2 + depth) ** 2);
  return area * (12 - 2 * depth);
}
