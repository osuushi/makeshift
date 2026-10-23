import { isBuiltinDecorator } from "../decorators/builtins.js";
import {
  pendingCustomContinuation,
  resolveCustomContinuation,
} from "../decorators/custom-continuation.js";
import { editDecorators } from "../decorators/edits.js";
import { continueGearGroups } from "../decorators/gear-support.js";
import { type DecoratorInspectionRequest, inspectDecorator } from "../decorators/inspection.js";
import { editJavaScriptDecorators, needsJavaScript } from "../decorators/javascript-edits.js";
import { type EnabledDefinition, JavaScriptDecorators } from "../decorators/javascript-hooks.js";
import { initializeDecoratorRuntime } from "../decorators/javascript-runtime.js";
import { editWithPresets } from "../decorators/preset-edits.js";
import { inspectThreads } from "../decorators/thread-inspection.js";
import type { SketchDocument } from "../sketch/document.js";
import type { ModelRequest } from "../sketch/model-api.js";

/** Local enablement is intentionally absent from archives and Undo snapshots. */
export class DecoratorSession {
  async query(
    document: SketchDocument,
    request: Extract<ModelRequest, { kind: "decorator-inspect" | "decorator-draft" }>,
  ) {
    try {
      if (request.kind === "decorator-inspect")
        return { decoratorInspection: await this.inspect(document, request.query) };
      if (request.edit.action !== "settings")
        throw new Error("Only decorator settings can be drafted");
      const candidate =
        (await this.edit(document, { kind: "decorator", edit: request.edit })) ??
        editDecorators(document, request.edit);
      return { decoratorDraft: candidate.decorators ?? [] };
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) };
    }
  }
  async continue(document: SketchDocument): Promise<SketchDocument> {
    if (!document.decorators?.some((d) => pendingCustomContinuation.has(d)))
      return continueGearGroups(document);
    return resolveCustomContinuation(document, await this.hooks());
  }
  async inspect(document: SketchDocument, query: DecoratorInspectionRequest) {
    return isBuiltinDecorator(query.definition)
      ? inspectThreads(document, query)
      : inspectDecorator(document, query, await this.hooks());
  }
  async edit(document: SketchDocument, request: ModelRequest): Promise<SketchDocument | null> {
    if (request.kind === "decorator-enable") {
      this.enable(document, request.id, request.version, request.enabled);
      return document;
    }
    if (request.kind === "decorator")
      return editWithPresets(document, request.edit, async (source, edit) =>
        needsJavaScript(source, edit)
          ? editJavaScriptDecorators(source, edit, await this.hooks())
          : editDecorators(source, edit),
      );
    return null;
  }
  fork(): DecoratorSession {
    const session = new DecoratorSession();
    session.adopt(this);
    return session;
  }
  adopt(session: DecoratorSession): void {
    this.enabled = [...session.enabled];
    this.runtime = session.runtime;
  }
  private enabled: EnabledDefinition[] = [];
  private runtime?: ReturnType<typeof initializeDecoratorRuntime>;
  get sources(): readonly EnabledDefinition[] {
    return this.enabled;
  }
  clear(): void {
    this.enabled = [];
  }
  enable(document: SketchDocument, id: string, version: number, enabled: boolean): void {
    if (typeof enabled !== "boolean") throw new Error("Invalid decorator enablement");
    const definition = document.decoratorDefinitions?.find(
      (d) => d.id === id && d.version === version,
    );
    if (!definition) throw new Error("Select an existing bundled decorator");
    this.enabled = this.enabled.filter((d) => d.id !== id || d.version !== version);
    if (enabled) this.enabled.push({ id, version, source: definition.source });
  }
  async hooks(): Promise<JavaScriptDecorators> {
    this.runtime ??= initializeDecoratorRuntime();
    return new JavaScriptDecorators(await this.runtime, this.enabled);
  }
}
