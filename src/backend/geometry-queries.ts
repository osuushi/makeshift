import type { ModelReply, ModelRequest, ModelView } from "../sketch/model-api.js";
import { validateFrame } from "../sketch/planes.js";
import { exportGeometry } from "./export-geometry.js";
import { measurementInput } from "./measurement-input.js";
import { SolidCalculator } from "./solid-calculator.js";
import { StepExporter } from "./step-exporter.js";

type Query = Extract<
  ModelRequest,
  { kind: "sections" | "measure" | "export-geometry" | "export-step" | "center-of-mass" }
>;

export function isGeometryQuery(request: ModelRequest): request is Query {
  return (
    request.kind === "sections" ||
    request.kind === "measure" ||
    request.kind === "center-of-mass" ||
    request.kind === "export-step" ||
    request.kind === "export-geometry"
  );
}

/** Geometry readouts share a worker; STEP has its own cancellable snapshot writer. */
export class GeometryQueries {
  private kernel: SolidCalculator;
  private step: StepExporter;
  private pending = Promise.resolve();
  private closed = false;
  constructor(executable?: string) {
    this.kernel = new SolidCalculator(executable);
    this.step = new StepExporter(executable ?? SolidCalculator.executable, "STEP exporter");
  }
  call(view: ModelView, request: Query): Promise<ModelReply> {
    if (request.kind === "export-step") return this.calculate(view, request);
    const result = this.pending.then(() => this.calculate(view, request));
    this.pending = result.then(() => {});
    return result;
  }
  private async calculate(view: ModelView, request: Query): Promise<ModelReply> {
    try {
      if (this.closed) throw new Error("Geometry query cancelled");
      if (request.kind === "center-of-mass") {
        const body = view.data.bodies?.find((body) => body.id === request.body);
        if (!body) throw new Error("Unknown center-of-mass body");
        return { view, centerOfMass: await this.kernel.centerOfMass(body) };
      }
      if (request.kind === "export-step") {
        return { view, step: await this.step.export(request.items) };
      }
      if (request.kind === "export-geometry")
        return {
          view,
          exportDocument: await exportGeometry(view.data, this.kernel, request.bodyIds),
        };
      if (request.kind === "measure") {
        const result = await this.kernel.calculate(measurementInput(view.data, request.targets));
        return { view, measurement: result.measurement };
      }
      validateFrame(request.frame);
      const result = await this.kernel.calculate({
        kind: "sections",
        frame: request.frame,
        bodies: (view.data.bodies ?? []).filter((b) => request.bodies.includes(b.id)),
      });
      return { view, sections: result.sections };
    } catch (error) {
      return { view, error: error instanceof Error ? error.message : String(error) };
    }
  }
  close(): void {
    this.closed = true;
    this.kernel.close();
    this.step.close();
  }
  async cancelStep(): Promise<void> {
    await this.step.cancel();
  }
}
