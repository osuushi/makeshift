import { CalculationFailure } from "../model/calculation-failure.js";
import { type ExactBody, exactBodies } from "../model/exact-body.js";
import type { Vector } from "../sketch/planes.js";
import type { KernelModelRequest, KernelReply } from "./kernel-reply.js";
import { readKernelReply } from "./kernel-reply-validation.js";
import type { KernelRequest } from "./kernel-request.js";
import { NativeCalculator } from "./native-calculator.js";

export class SolidCalculator extends NativeCalculator<KernelRequest, unknown> {
  static readonly executable = ".build/kernel/bin/makeshift-kernel";
  private superseded = false;
  private deferred: {
    reply: unknown;
    input: KernelRequest;
  } | null = null;
  private massCenters = new Map<string, Promise<Vector>>();
  constructor(executable = SolidCalculator.executable) {
    super(executable, "Solid kernel");
  }
  override async calculate<Input extends KernelRequest>(input: Input): Promise<KernelReply<Input>> {
    // Enforce the wire envelope here even when callers hold a full accepted Body.
    const completed = input.kind === "complete-preview" ? this.deferred?.input : undefined;
    this.deferred = null;
    const request = { ...input, bodies: exactBodies(operandBodies(input)) };
    const reply = await super.calculate(request, input.kind === "measure" ? 10_000 : undefined);
    const result = readKernelReply<Input>(request, reply, completed);
    if ("presentation" in input && input.presentation)
      this.deferred = { reply: result, input: request };
    return result;
  }
  /** The single retained native shape matches this exact in-memory reply. */
  retains(result: unknown): boolean {
    return this.deferred !== null && this.deferred.reply === result;
  }
  /** Bounded derived-data cache: exact geometry, never body IDs, determines reuse. */
  async centerOfMass(body: ExactBody): Promise<Vector> {
    let pending = this.massCenters.get(body.brep);
    if (!pending) {
      pending = this.calculate({ kind: "center-of-mass", bodies: [body] }).then(
        (reply) => reply.centerOfMass,
      );
      this.massCenters.set(body.brep, pending);
      const oldest = this.massCenters.keys().next().value;
      if (this.massCenters.size > 16 && oldest !== undefined) this.massCenters.delete(oldest);
      const calculation = pending;
      void pending.catch(() => {
        if (this.massCenters.get(body.brep) === calculation) this.massCenters.delete(body.brep);
      });
    }
    return [...(await pending)];
  }
  override close(): void {
    this.deferred = null;
    this.massCenters.clear();
    super.close();
  }
  override async cancel(): Promise<void> {
    if (this.deferred) this.close();
    await super.cancel();
  }
  begin(): void {
    this.superseded = false;
  }
  supersede(): void {
    this.superseded = true;
  }
  get wasSuperseded(): boolean {
    return this.superseded;
  }
  async probe<Input extends KernelModelRequest>(input: Input): Promise<KernelReply<Input>> {
    if (this.superseded) throw new CalculationFailure("superseded", "Preview superseded");
    // Finish the current probe so useful geometry can still reach the viewport.
    // Supersession prevents subsequent probes, rather than starving every frame.
    return this.calculate(input);
  }
}

// Completion consumes retained geometry. Surface edits read only selected owners.
function operandBodies(input: KernelRequest): readonly ExactBody[] {
  if (input.kind === "complete-preview") return [];
  const selected =
    input.kind === "offset-faces"
      ? input.faces
      : input.kind === "edge-finish" || input.kind === "edge-finish-selection"
        ? input.edges
        : null;
  if (!selected) return input.bodies;
  const ids = new Set(selected.map((item) => item.body));
  return input.bodies.filter((body) => ids.has(body.id));
}
