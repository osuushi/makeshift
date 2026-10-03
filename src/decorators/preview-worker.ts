import javascriptWasm from "@jitl/quickjs-wasmfile-release-sync/wasm?url";
import wasmUrl from "manifold-3d/manifold.wasm?url";
import type { QuickJSWASMModule } from "quickjs-emscripten-core";
import type { DisplayDocument } from "../model/display-document.js";
import { isBuiltinDecorator } from "./builtins.js";
import { gearPreview } from "./gear-runtime.js";
import { gearDefinition } from "./gear-settings.js";
import type { EnabledDefinition } from "./javascript-hooks.js";
import {
  decoratorLivePreview,
  decoratorPreview,
  initializeMeshRuntime,
  PreviewRuntimeRequired,
} from "./mesh-runtime.js";
import { type PreviewFeedback, PreviewHistories } from "./preview-feedback.js";
import { packPreviewMesh } from "./preview-wire.js";
import type { DecoratorInstance } from "./types.js";

async function renderGear(document: DisplayDocument, instance: DecoratorInstance) {
  runtime ??= initializeMeshRuntime(wasmUrl);
  const mesh = gearPreview(await runtime, document, instance);
  return {
    id: instance.id,
    body: instance.faces[0].body,
    faces: instance.faces,
    ...packPreviewMesh(mesh),
  };
}

const histories = new PreviewHistories();
type RenderState = { signature?: string; live: boolean };
const rendered = new Map<string, RenderState>();
let runtime: ReturnType<typeof initializeMeshRuntime> | undefined;
let javascriptRuntime: Promise<QuickJSWASMModule> | undefined;

function nextRenderState(id: string, signature: string | undefined, live: boolean): RenderState {
  const previous = rendered.get(id);
  return {
    signature,
    live: live && (previous?.live === true || previous?.signature !== signature),
  };
}

function needsRender(id: string, next: RenderState): boolean {
  const previous = rendered.get(id);
  return previous?.signature !== next.signature || previous?.live !== next.live;
}

async function javascriptDecorators(sources?: EnabledDefinition[]) {
  const [{ JavaScriptDecorators }, { initializeDecoratorRuntime }] = await Promise.all([
    import("./javascript-hooks.js"),
    import("./javascript-runtime.js"),
  ]);
  if (!javascriptRuntime) javascriptRuntime = initializeDecoratorRuntime(javascriptWasm);
  return new JavaScriptDecorators(await javascriptRuntime, sources);
}

function liveGroupCount(document: DisplayDocument, sources?: EnabledDefinition[]): number {
  return (document.decorators ?? []).filter((instance) => {
    if (instance.problem) return false;
    if (isBuiltinDecorator(instance.definition)) return true;
    const definition = document.decoratorDefinitions?.find(
      (entry) => entry.id === instance.definition && entry.version === instance.version,
    );
    return (
      !!definition?.preview &&
      !!definition.livePreview &&
      !!sources?.some(
        (source) =>
          source.id === definition.id &&
          source.version === definition.version &&
          source.source === definition.source,
      )
    );
  }).length;
}

async function renderInstance(
  document: DisplayDocument,
  instance: DecoratorInstance,
  live: boolean,
  feedback: PreviewFeedback,
  javascript: Awaited<ReturnType<typeof javascriptDecorators>> | undefined,
) {
  const started = performance.now();
  if (instance.definition === gearDefinition)
    return {
      mesh: await renderGear(document, instance),
      state: null,
      record: false,
      durationMs: performance.now() - started,
    };
  if (!isBuiltinDecorator(instance.definition)) {
    const result = javascript?.preview(document, instance, live, feedback);
    return {
      durationMs: performance.now() - started,
      record: !!result,
      mesh: result?.mesh
        ? {
            id: instance.id,
            body: instance.faces[0].body,
            faces: instance.faces,
            ...packPreviewMesh(result.mesh),
          }
        : null,
      state: result?.state ?? null,
    };
  }
  const preview = (module?: Awaited<ReturnType<typeof initializeMeshRuntime>>) =>
    live
      ? decoratorLivePreview(module, document, instance, feedback)
      : { mesh: decoratorPreview(module, document, instance), state: null };
  let result: ReturnType<typeof preview>;
  try {
    result = preview();
  } catch (error) {
    if (!(error instanceof PreviewRuntimeRequired)) throw error;
    if (!runtime) runtime = initializeMeshRuntime(wasmUrl);
    result = preview(await runtime);
  }
  return {
    durationMs: performance.now() - started,
    record: true,
    mesh: {
      id: instance.id,
      body: instance.faces[0].body,
      faces: instance.faces,
      ...packPreviewMesh(result.mesh),
    },
    state: result.state,
  };
}

self.onmessage = async (
  event: MessageEvent<{
    document: DisplayDocument;
    sources?: EnabledDefinition[];
    live: boolean;
    signatures: [string, string][];
  }>,
) => {
  try {
    const messageStarted = performance.now();
    const { document, sources, live } = event.data;
    const signatures = new Map(event.data.signatures);
    const hasJavaScript = document.decorators?.some(
      (instance) =>
        !isBuiltinDecorator(instance.definition) &&
        needsRender(instance.id, nextRenderState(instance.id, signatures.get(instance.id), live)),
    );
    const javascript = hasJavaScript ? await javascriptDecorators(sources) : undefined;
    const meshes = [],
      processedIds: string[] = [],
      errors: string[] = [],
      samples: { id: string; live: boolean; durationMs: number; state: unknown }[] = [];
    histories.retain(new Set(document.decorators?.map((instance) => instance.id)));
    for (const id of rendered.keys()) if (!signatures.has(id)) rendered.delete(id);
    const targetMs = Math.max(16, 100 / Math.max(1, liveGroupCount(document, sources)));
    for (const instance of document.decorators ?? []) {
      if (instance.problem) continue;
      const next = nextRenderState(instance.id, signatures.get(instance.id), live);
      if (!needsRender(instance.id, next)) continue;
      processedIds.push(instance.id);
      try {
        const signature = JSON.stringify([
          instance.definition,
          instance.version,
          instance.faces,
          instance.settings,
        ]);
        const feedback = histories.feedback(instance.id, signature, targetMs);
        const result = await renderInstance(document, instance, next.live, feedback, javascript);
        const durationMs = result.durationMs;
        if (next.live && result.record)
          histories.record(instance.id, signature, durationMs, result.state);
        samples.push({ id: instance.id, live: next.live, durationMs, state: result.state });
        if (result.mesh) meshes.push(result.mesh);
        rendered.set(instance.id, next);
      } catch (error) {
        errors.push(error instanceof Error ? error.message : String(error));
      }
    }
    self.postMessage(
      {
        meshes,
        processedIds,
        error: errors.join("; ") || undefined,
        elapsedMs: performance.now() - messageStarted,
        samples,
      },
      meshes.flatMap(({ positions, indices }) => [positions.buffer, indices.buffer]),
    );
  } catch (error) {
    self.postMessage({ error: error instanceof Error ? error.message : String(error) });
  }
};
