import type { SketchDocument } from "../sketch/document.js";
import type { SketchEditor } from "../sketch/editor.js";
import { idleReason, toolCatalog } from "../tools/catalog.js";
import type { ExportMesh } from "./export-mesh.js";
import type { ExportFormat } from "./mesh-export.js";
import { type NativeExportBridge, nativeExportClient } from "./native-export-client.js";
import { type StepItem, stepItems } from "./step-export.js";
import { stepExportChoice } from "./step-export-choice.js";

type FileExportFormat = ExportFormat | "step";
type ExportJob = {
  worker?: Worker;
  native?: NativeExportBridge;
  cancelled?: boolean;
  step?: boolean;
  dismiss?: () => void;
};

class ExportSession {
  private job: ExportJob | null = null;
  constructor(private editor: SketchEditor) {}
  get visibleBodies() {
    const editor = this.editor;
    return (editor.store.data.bodies ?? []).filter(
      (body) => editor.bodiesVisible && editor.visibility.visible(body.id),
    );
  }
  get busy() {
    return !!this.job;
  }
  cancel(): void {
    if (this.job) void this.finish(this.job);
  }
  private async finish(current: ExportJob, error?: string) {
    if (this.job !== current || current.cancelled) return;
    current.cancelled = true;
    current.dismiss?.();
    current.worker?.terminate();
    try {
      await current.native?.cancel();
      if (current.step) await this.editor.store.cancelStepExport();
    } catch (cancelError) {
      error ??= cancelError instanceof Error ? cancelError.message : String(cancelError);
    }
    if (this.job !== current) return;
    this.job = null;
    const editor = this.editor;
    if (["Preparing export…", "Generating export mesh…", "Writing STEP…"].includes(editor.notice))
      editor.notice = "";
    if (error) editor.message = error;
    editor.refresh();
  }
  async run(extension: FileExportFormat) {
    const editor = this.editor;
    const bodyIds = this.visibleBodies.map((body) => body.id);
    if (editor.blocked || editor.interactions.current || this.job || !bodyIds.length) return;
    const current: ExportJob = {};
    this.job = current;
    editor.notice = "Preparing export…";
    editor.refresh();
    try {
      if (extension === "step") {
        const snapshot = editor.store.data;
        const decorated = snapshot.decorators?.some((instance) =>
          instance.faces.some((face) => bodyIds.includes(face.body)),
        );
        let choice: "decorated" | "exact" | null = "exact";
        if (decorated) {
          const prompt = stepExportChoice();
          current.dismiss = prompt.cancel;
          choice = await prompt.choice;
          current.dismiss = undefined;
        }
        if (this.job !== current || current.cancelled) return;
        if (!choice) return void this.finish(current);
        if (choice === "exact") {
          const bodies = (snapshot.bodies ?? []).filter((body) => bodyIds.includes(body.id));
          return await this.writeStep(current, stepItems(bodies));
        }
      }
      const sources = editor.store.decoratorSources;
      const snapshot = await editor.store.exportGeometry(bodyIds);
      if (this.job !== current || current.cancelled) return;
      const native = snapshot.decorators?.length ? await nativeExportClient() : undefined;
      if (this.job !== current || current.cancelled) return;
      current.native = native;
      this.startWorker(current, snapshot, extension, sources);
    } catch (error) {
      void this.finish(current, error instanceof Error ? error.message : String(error));
    }
  }
  private startWorker(
    current: ExportJob,
    snapshot: SketchDocument,
    extension: FileExportFormat,
    sources: SketchEditor["store"]["decoratorSources"],
  ): void {
    const bodies = snapshot.bodies ?? [];
    const decorated = new Set(snapshot.decorators?.flatMap((d) => d.faces.map((f) => f.body)));
    const meshBodies = extension === "step" ? bodies.filter((b) => decorated.has(b.id)) : bodies;
    const worker = new Worker(new URL("./export-worker.ts", import.meta.url), { type: "module" });
    current.worker = worker;
    worker.onmessage = (
      event: MessageEvent<{
        bytes?: Uint8Array<ArrayBuffer>;
        error?: string;
        nativeMesh?: ArrayBuffer;
        stepMeshes?: ExportMesh[];
      }>,
    ) => {
      if (this.job !== current || current.cancelled) return;
      if (event.data.nativeMesh) {
        void this.sendNative(current, event.data.nativeMesh);
        return;
      }
      if (event.data.stepMeshes) {
        const result = event.data.stepMeshes;
        if (result.length !== meshBodies.length || meshBodies.some((_, i) => !result[i]))
          return void this.finish(current, "Export mesh body count changed");
        const meshes = new Map(meshBodies.map((b, i) => [b.id, result[i]]));
        void this.writeStep(
          current,
          stepItems(
            bodies,
            bodies.map((b) => meshes.get(b.id)),
          ),
        );
        return;
      }
      if (event.data.bytes) download(event.data.bytes, extension);
      void this.finish(current, event.data.error);
    };
    worker.onerror = () => {
      void this.finish(current, "Could not export the solid mesh");
    };
    worker.postMessage({
      document: { ...snapshot, bodies: meshBodies },
      format: extension,
      sources,
      native: !!current.native,
    });
    this.editor.notice = "Generating export mesh…";
    this.editor.refresh();
  }
  private async writeStep(current: ExportJob, items: StepItem[]): Promise<void> {
    if (this.job !== current || current.cancelled) return;
    current.step = true;
    this.editor.notice = "Writing STEP…";
    this.editor.refresh();
    try {
      const step = await this.editor.store.exportStep(items);
      if (this.job !== current || current.cancelled) return;
      current.step = false;
      download(new TextEncoder().encode(step), "step");
      void this.finish(current);
    } catch (error) {
      current.step = false;
      void this.finish(current, error instanceof Error ? error.message : String(error));
    }
  }
  private async sendNative(current: ExportJob, input: ArrayBuffer) {
    try {
      if (!current.native) throw new Error("Native export unavailable");
      const output = await current.native.integrate(input);
      if (this.job === current && !current.cancelled)
        current.worker?.postMessage({ nativeResult: output }, [output]);
    } catch (error) {
      if (this.job === current && !current.cancelled)
        current.worker?.postMessage({
          nativeError: error instanceof Error ? error.message : String(error),
        });
    }
  }
}

export function exportControls(editor: SketchEditor): () => void {
  const session = new ExportSession(editor);
  const disposers = (["stl", "3mf", "step"] as const).map((format) =>
    toolCatalog(editor).register({
      id: `export-${format}`,
      finishEdit: true,
      label: `Export ${format.toUpperCase()}`,
      aliases: format === "step" ? ["stp"] : undefined,
      category: "Document & Edit",
      description:
        format === "step"
          ? "Exact solids; optional AP242 meshes for decorators, in millimeters"
          : "Visible accepted bodies in millimeters",
      reason: () =>
        idleReason(editor) ??
        (session.busy
          ? "Exporting…"
          : !session.visibleBodies.length
            ? "Create or show a solid body first"
            : null),
      run: () => {
        void session.run(format);
      },
    }),
  );
  disposers.push(
    toolCatalog(editor).register({
      id: "cancel-export",
      finishEdit: false,
      label: "Cancel export",
      category: "Document & Edit",
      reason: () => (session.busy ? null : "No export is running"),
      run: () => session.cancel(),
    }),
  );
  return () => {
    session.cancel();
    for (const dispose of disposers) dispose();
  };
}

function download(bytes: Uint8Array<ArrayBuffer>, extension: FileExportFormat): void {
  const type =
    extension === "step" ? "model/step" : extension === "3mf" ? "model/3mf" : "model/stl";
  const url = URL.createObjectURL(new Blob([bytes], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `Untitled.${extension}`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
