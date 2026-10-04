import { exactBodies } from "../model/exact-body.js";
import type { KernelModelRequest, KernelReply } from "./kernel-reply.js";
import { readKernelReply } from "./kernel-reply-validation.js";
import type { KernelRequest } from "./kernel-request.js";
import { NativeCalculator } from "./native-calculator.js";

export class SolidCalculator extends NativeCalculator<KernelRequest, unknown> {
  static readonly executable = ".build/kernel/bin/makeshift-kernel";
  private superseded = false;
  constructor(executable = SolidCalculator.executable) {
    super(executable, "Solid kernel");
  }
  override async calculate<Input extends KernelRequest>(input: Input): Promise<KernelReply<Input>> {
    // Enforce the wire envelope here even when callers hold a full accepted Body.
    const reply = await super.calculate({ ...input, bodies: exactBodies(input.bodies) });
    return readKernelReply(input, reply);
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
    if (this.superseded) throw new Error("Preview superseded");
    // Finish the current probe so useful geometry can still reach the viewport.
    // Supersession prevents subsequent probes, rather than starving every frame.
    return this.calculate(input);
  }
}
