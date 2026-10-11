import { call } from "./model-transport.js";

/** Read-only backend queries do not occupy the document edit slot. */
export class ModelQueries {
  async sections(frame: import("./planes.js").PlaneFrame, bodies: string[]) {
    const reply = await call({ kind: "sections", frame, bodies });
    if (reply.error) throw new Error(reply.error);
    if (!reply.sections) throw new Error("Cross sections unavailable");
    return reply.sections;
  }
  async exportGeometry(bodyIds?: string[]) {
    const reply = await call({ kind: "export-geometry", bodyIds });
    if (reply.error) throw new Error(reply.error);
    if (!reply.exportDocument) throw new Error("Export geometry unavailable");
    return reply.exportDocument;
  }
  async exportStep(items: import("../model/step-export.js").StepItem[]) {
    const reply = await call({ kind: "export-step", items });
    if (reply.error) throw new Error(reply.error);
    if (!reply.step) throw new Error("STEP geometry unavailable");
    return reply.step;
  }
  async cancelStepExport(): Promise<void> {
    const reply = await call({ kind: "cancel-step-export" });
    if (reply.error) throw new Error(reply.error);
  }
  async draftDecorator(
    edit: Extract<import("../decorators/types.js").DecoratorEdit, { action: "settings" }>,
  ) {
    const reply = await call({ kind: "decorator-draft", edit });
    if (reply.error || !reply.decoratorDraft)
      throw new Error(reply.error ?? "Decorator draft unavailable");
    return reply.decoratorDraft;
  }
  async inspectDecorator(query: import("../decorators/inspection.js").DecoratorInspectionRequest) {
    const reply = await call({ kind: "decorator-inspect", query });
    if (reply.error || !reply.decoratorInspection)
      throw new Error(reply.error ?? "Decorator inspection unavailable");
    return reply.decoratorInspection;
  }
  async measure(targets: import("../model/measurement.js").MeasurementTarget[]) {
    const reply = await call({ kind: "measure", targets });
    if (reply.error) throw new Error(reply.error);
    if (!reply.measurement) throw new Error("Measurement unavailable");
    return reply.measurement;
  }
}
