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
import { type Drawing, defaultBench } from "../model/benches.js";
import { usedDefinitions } from "../security/drawing-trust.js";
import type { SketchDocument } from "../sketch/document.js";
import type { ModelRequest } from "../sketch/model-api.js";

/** Local enablement is intentionally absent from archives and Undo snapshots. */
export class DecoratorSession {
  authorize?: (doc: SketchDocument) => Promise<boolean>;
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
  async continue(document: SketchDocument, source?: SketchDocument): Promise<SketchDocument> {
    if (source?.bodies === document.bodies && source?.decorators === document.decorators)
      return document;
    if (!document.decorators?.some((d) => pendingCustomContinuation.has(d)))
      return continueGearGroups(document, source);
    return resolveCustomContinuation(document, await this.hooks(), source);
  }
  async inspect(document: SketchDocument, query: DecoratorInspectionRequest) {
    return isBuiltinDecorator(query.definition)
      ? inspectThreads(document, query)
      : inspectDecorator(document, query, await this.hooks());
  }
  async edit(document: SketchDocument, request: ModelRequest): Promise<SketchDocument | null> {
    if (request.kind === "decorator-enable") {
      await this.enable(document, request.id, request.version, request.enabled);
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
    session.authorize = this.authorize;
    return session;
  }
  adopt(session: DecoratorSession): void {
    this.enabled = [...session.enabled];
    this.runtime = session.runtime;
  }
  private enabled: EnabledDefinition[] = [];
  private bench = defaultBench.id;
  private benchSources = new Map<string, EnabledDefinition[]>();
  private runtime?: ReturnType<typeof initializeDecoratorRuntime>;
  get sources(): readonly EnabledDefinition[] {
    return this.enabled;
  }
  clear(bench = defaultBench.id): void {
    this.bench = bench;
    this.benchSources.clear();
    this.enabled = [];
  }
  switchBench(bench: string): void {
    this.benchSources.set(this.bench, this.enabled);
    this.bench = bench;
    this.enabled = this.benchSources.get(bench) ?? [];
  }
  async restoreSaved(drawing: Drawing, active: SketchDocument): Promise<void> {
    const sources = new Map(
      drawing.benches.map(({ id, document }) => [
        id,
        usedDefinitions(document).map(({ id, version, source }) => ({ id, version, source })),
      ]),
    );
    if (![...sources.values()].some((value) => value.length)) return;
    if (this.authorize && !(await this.authorize(active)))
      throw new Error("Custom decorator code is disabled.");
    this.benchSources = sources;
    this.enabled = sources.get(this.bench) ?? [];
  }
  async enable(document: SketchDocument, id: string, version: number, enabled: boolean) {
    if (typeof enabled !== "boolean") throw new Error("Invalid decorator enablement");
    const definition = document.decoratorDefinitions?.find(
      (d) => d.id === id && d.version === version,
    );
    if (!definition) throw new Error("Select an existing bundled decorator");
    if (enabled && this.authorize && !(await this.authorize(document)))
      throw new Error("Custom decorator code is disabled.");
    this.enabled = this.enabled.filter((d) => d.id !== id || d.version !== version);
    if (enabled) this.enabled.push({ id, version, source: definition.source });
  }
  async hooks(): Promise<JavaScriptDecorators> {
    this.runtime ??= initializeDecoratorRuntime();
    return new JavaScriptDecorators(await this.runtime, this.enabled);
  }
}
