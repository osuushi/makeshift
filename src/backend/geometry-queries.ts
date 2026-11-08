import type { ModelReply, ModelRequest, ModelView } from "../sketch/model-api.js";
import { validateFrame } from "../sketch/planes.js";
import { exportGeometry } from "./export-geometry.js";
import { measurementInput } from "./measurement-input.js";
import { SolidCalculator } from "./solid-calculator.js";
import { StepExporter } from "./step-exporter.js";

type Query = Extract<
  ModelRequest,
  {
    kind:
      | "sections"
      | "measure"
      | "export-geometry"
      | "export-step"
      | "center-of-mass"
      | "edge-finish-targets"
      | "cancel-edge-finish-targets"
      | "cancel-step-export";
  }
>;

export function isGeometryQuery(request: ModelRequest): request is Query {
  return (
    request.kind === "sections" ||
    request.kind === "measure" ||
    request.kind === "center-of-mass" ||
    request.kind === "edge-finish-targets" ||
    request.kind === "cancel-edge-finish-targets" ||
    request.kind === "cancel-step-export" ||
    request.kind === "export-step" ||
    request.kind === "export-geometry"
  );
}

/** Readouts, cancellable snap searches and STEP export own independent workers. */
export class GeometryQueries {
  private kernel: SolidCalculator;
  private step: StepExporter;
  private snaps: SolidCalculator;
  private snapPending = Promise.resolve();
  private snapCancellation = new AbortController();
  private pending = Promise.resolve();
  private closed = false;
  constructor(executable?: string) {
    this.kernel = new SolidCalculator(executable);
    this.snaps = new SolidCalculator(executable);
    this.step = new StepExporter(executable ?? SolidCalculator.executable, "STEP exporter");
  }
  call(view: ModelView, request: Query): Promise<ModelReply> {
    if (request.kind === "export-step" || request.kind.startsWith("cancel-"))
      return this.calculate(view, request);
    if (request.kind === "edge-finish-targets") {
      const signal = this.snapCancellation.signal;
      const result = this.snapPending.then(() =>
        signal.aborted ? { view, error: "Snap search cancelled" } : this.calculate(view, request),
      );
      this.snapPending = result.then(() => {});
      return result;
    }
    const result = this.pending.then(() => this.calculate(view, request));
    this.pending = result.then(() => {});
    return result;
  }
  private async calculate(view: ModelView, request: Query): Promise<ModelReply> {
    try {
      if (request.kind === "cancel-edge-finish-targets") {
        await this.cancelSnaps();
        return { view };
      }
      if (request.kind === "cancel-step-export") {
        await this.cancelStep();
        return { view };
      }
      if (this.closed) throw new Error("Geometry query cancelled");
      if (request.kind === "edge-finish-targets") {
        const reply = await this.snaps.calculate({
          ...request.operation,
          kind: request.kind,
          points: request.points,
          bodies: (view.data.bodies ?? []).filter((b) =>
            request.operation.edges.some((e) => e.body === b.id),
          ),
        });
        return { view, edgeFinishTargets: reply.edgeFinishTargets };
      }
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
    this.snapCancellation.abort();
    this.snaps.close();
  }
  async cancelSnaps(): Promise<void> {
    this.snapCancellation.abort();
    this.snapCancellation = new AbortController();
    await this.snaps.cancel();
  }
  async cancelStep(): Promise<void> {
    await this.step.cancel();
  }
}
