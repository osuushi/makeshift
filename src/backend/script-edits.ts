import type { ScriptOperation } from "../agent-script/api.js";
import { pruneGuides } from "../guides/model.js";
import type { SketchDocument } from "../sketch/document.js";
import type { DecoratorSession } from "./decorator-session.js";
import type { DocumentStore } from "./document-store.js";
import { validateDocument } from "./document-validation.js";
import type { NativeSolver } from "./native-solver.js";
import { scriptDecorator } from "./script-decorators.js";
import { scriptOperation } from "./script-operation.js";
import type { SolidCalculator } from "./solid-calculator.js";
import type { SolidEdits } from "./solid-edits.js";

/** Owner's one temporary script candidate. No accepted data or separate Undo store. */
export class ScriptEdits {
  private candidate: SketchDocument | null = null;
  private name = "";
  private pending: Promise<unknown> | null = null;
  private cancelled = false;
  private stopping: Promise<void> | null = null;
  private count = 0;
  private decoratorSession: DecoratorSession | null = null;
  constructor(
    private store: () => DocumentStore,
    private solids: SolidEdits,
    private kernel: SolidCalculator,
    private solver: NativeSolver,
    private decorators: DecoratorSession,
  ) {}
  get busy(): boolean {
    return this.candidate !== null;
  }
  begin(name: string): void {
    if (this.busy) throw new Error("Another script is running");
    this.name = name;
    this.decoratorSession = this.decorators.fork();
    this.candidate = this.store().data;
    this.cancelled = false;
    this.count = 0;
    this.kernel.begin();
  }
  async step(operation: ScriptOperation): Promise<unknown> {
    if (!this.candidate || this.cancelled) throw new Error("Script has ended");
    if (this.pending)
      throw new Error("Await each script operation; parallel edits are unsupported");
    if (++this.count > 100) throw new Error("Script exceeds 100 modeling operations");
    const session = this.decoratorSession;
    if (!session) throw new Error("Script has ended");
    const pending =
      operation.kind === "decorators" ||
      operation.kind === "editDecorator" ||
      operation.kind === "editDecoratorDefinition" ||
      operation.kind === "enableDecorator" ||
      operation.kind === "inspectDecorator"
        ? scriptDecorator(this.candidate, operation, session)
        : scriptOperation(this.candidate, operation, this.solids, this.solver, this.kernel);
    this.pending = pending;
    try {
      const result = await pending;
      if (this.cancelled) throw new Error("Script cancelled");
      result.document = await session.continue(result.document);
      result.document = pruneGuides(result.document);
      if (this.cancelled) throw new Error("Script cancelled");
      validateDocument(result.document);
      this.candidate = result.document;
      return result.result;
    } finally {
      this.pending = null;
    }
  }
  finish(): boolean {
    if (!this.candidate || this.cancelled || this.pending)
      throw new Error("Script is not ready to finish");
    const changed = this.store().accept(this.candidate, {
      kind: "script",
      parameters: { name: this.name, operations: this.count },
    });
    if (this.decoratorSession) this.decorators.adopt(this.decoratorSession);
    this.decoratorSession = null;
    this.candidate = null;
    return changed;
  }
  cancel(error = "Script cancelled"): Promise<void> {
    if (this.stopping) return this.stopping;
    this.cancelled = true;
    this.stopping = this.discard(error).finally(() => {
      this.stopping = null;
    });
    return this.stopping;
  }
  private async discard(error: string): Promise<void> {
    await Promise.allSettled([this.kernel.cancel(), this.solver.cancel(), this.pending]);
    if (this.candidate)
      this.store().record(
        { kind: "script", parameters: { name: this.name, operations: this.count } },
        error === "Script cancelled" ? "cancelled" : "failed",
        error,
      );
    this.candidate = null;
    this.decoratorSession = null;
  }
}
