import {
  appendClipboard,
  cloneClipboard,
  type PasteTarget,
  readClipboard,
} from "../clipboard/geometry.js";
import type { SketchDocument } from "../sketch/document.js";
import { validateFrame } from "../sketch/planes.js";
import { validateDocument } from "./document-validation.js";
import { openDocument } from "./open-document.js";
import type { SolidCalculator } from "./solid-calculator.js";

export async function pasteGeometry(
  document: SketchDocument,
  text: string,
  kernel: SolidCalculator,
  target?: PasteTarget,
): Promise<SketchDocument> {
  const source = readClipboard(text);
  // Validate original identities/references before re-keying can mask duplicates.
  validateDocument({ units: "mm", ...source } as SketchDocument);
  for (const body of source.bodies)
    if (typeof body.brep !== "string" || !body.brep.trim())
      throw new Error("Clipboard body has no exact geometry");
  if (target) {
    validateFrame(target.plane);
    if (typeof target.id !== "string" || !target.id) throw new Error("Invalid paste sketch");
  }
  const copy = cloneClipboard(source);
  const imported = copy.bodies.length
    ? await openDocument({ units: "mm", ...copy } as SketchDocument, kernel)
    : { units: "mm" as const, ...copy, bodies: [] };
  const next = appendClipboard(document, imported, target);
  validateDocument(next);
  return next;
}
