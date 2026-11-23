import { inspectionView } from "../agent/inspection-view.js";
import type { ScriptApi, ScriptOperation } from "../agent-script/api.js";
import { scriptTimeoutMs } from "../model/calculation-limits.js";
import type { SketchEditor } from "../sketch/editor.js";
import { webOwner } from "./start.js";

function execute(source: string, selection: ScriptApi["selection"], signal: AbortSignal) {
  const worker = new Worker(new URL("./script-worker.ts", import.meta.url), { type: "module" });
  let abort: () => void;
  return new Promise<unknown>((resolve, reject) => {
    abort = () => reject(new Error("Script cancelled."));
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) return abort();
    worker.onerror = (event) => reject(new Error(event.message || "Script worker failed."));
    worker.onmessage = async ({ data }) => {
      try {
        if (data.error !== undefined) throw new Error(data.error);
        if ("result" in data) return resolve(data.result);
        const result = await webOwner.scripts.step(data.operation as ScriptOperation);
        if (!signal.aborted) worker.postMessage({ result });
      } catch (error) {
        reject(error);
      }
    };
    worker.postMessage({ source, selection });
  }).finally(() => {
    if (abort) signal.removeEventListener("abort", abort);
    worker.terminate();
  });
}

export async function runWebScript(editor: SketchEditor, source: string, signal: AbortSignal) {
  if (!source.trim() || source.length > 256 * 1024)
    throw new Error("Supply up to 256 KiB of JavaScript.");
  const view = inspectionView(editor, false);
  webOwner.beginScript("WebMCP");
  try {
    editor.store.scriptState(true);
    const result = await execute(
      source,
      view.selection,
      AbortSignal.any([signal, AbortSignal.timeout(scriptTimeoutMs)]),
    );
    signal.throwIfAborted();
    const changed = webOwner.scripts.finish();
    return { changed, result };
  } catch (error) {
    await webOwner.scripts.cancel(error instanceof Error ? error.message : String(error));
    throw error;
  } finally {
    editor.store.scriptState(false, structuredClone(webOwner.view));
    editor.refresh();
  }
}
