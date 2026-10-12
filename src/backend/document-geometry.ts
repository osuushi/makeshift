import type { SketchDocument } from "../sketch/document.js";
import type { ModelRequest } from "../sketch/model-api.js";
import type { DecoratorSession } from "./decorator-session.js";
import { editDocument } from "./document-edits.js";
import { openDocument } from "./open-document.js";
import { pasteGeometry } from "./paste-geometry.js";
import type { SolidCalculator } from "./solid-calculator.js";
import type { SolidEdits } from "./solid-edits.js";

/** Prepare geometry for direct edits; DocumentOwner controls cancellation and acceptance. */
export class DocumentGeometry {
  constructor(
    private kernel: SolidCalculator,
    private solids: SolidEdits,
    private decorators: DecoratorSession,
  ) {}
  open(document: SketchDocument) {
    return openDocument(document, this.kernel);
  }
  paste(document: SketchDocument, request: Extract<ModelRequest, { kind: "paste-geometry" }>) {
    return pasteGeometry(document, request.text, this.kernel, request.target);
  }
  async delete(
    document: SketchDocument,
    request: Extract<ModelRequest, { kind: "delete-entities" }>,
  ) {
    const reduced = editDocument(document, request);
    const candidate = request.topology?.length
      ? await this.solids.removeTopology(reduced, request.topology, "delete-topology")
      : reduced;
    return this.decorators.continue(candidate);
  }
}
