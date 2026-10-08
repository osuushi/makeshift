import { Vector3 } from "three";
import type { InteractionLease } from "../sketch/active-interaction.js";
import type { SketchEditor } from "../sketch/editor.js";
import { onModelKeydown } from "../sketch/model-keys.js";
import type { ModelingTarget } from "../sketch/model-selection-state.js";
import type { Vector } from "../sketch/planes.js";
import { idleReason, toolCatalog } from "../tools/catalog.js";
import type { MeshFitStatistics } from "./mesh-fit.js";
import { type ImportedMesh, meshImportLimit } from "./mesh-import.js";
import { MeshImportView } from "./mesh-import-view.js";
import { MeshImportWidget } from "./mesh-import-widget.js";

export class MeshImportControls {
  private widget: MeshImportWidget;
  private view: MeshImportView;
  private lease: InteractionLease | null = null;
  private mesh: ImportedMesh | null = null;
  private worker: Worker | null = null;
  private running: Promise<void> | null = null;
  private original: ModelingTarget[] = [];
  private valid = false;
  private abort = new AbortController();
  private unregister: () => void;
  private file = document.createElement("input");
  constructor(
    private editor: SketchEditor,
    overlay: HTMLElement,
  ) {
    this.widget = new MeshImportWidget(overlay);
    this.view = new MeshImportView(editor);
    this.file.type = "file";
    this.file.accept = ".stl,.obj";
    this.file.hidden = true;
    overlay.append(this.file);
    this.file.onchange = () => {
      const file = this.file.files?.[0];
      if (file) void this.start(file);
      this.file.value = "";
    };
    this.unregister = toolCatalog(editor).register({
      id: "import-mesh",
      label: "Import mesh",
      category: "Document & Edit",
      aliases: ["STL", "OBJ", "reconstruct", "mesh to solid"],
      description: "Fit an editable solid to a closed STL or OBJ without holes",
      reason: () => idleReason(editor) ?? (editor.world.active ? "Return to Modeling first" : null),
      run: () => this.file.click(),
    });
    this.widget.fit.onclick = () => void this.fit();
    this.widget.accept.onclick = () => void this.finish();
    this.widget.cancel.onclick = () => void this.cancel();
    this.widget.view.onchange = () => this.show();
    for (const input of [this.widget.tolerance, this.widget.patches, this.widget.units])
      input.addEventListener("input", () => this.invalidate(input === this.widget.units));
    onModelKeydown(
      (event) => {
        if (!this.lease || !["Enter", "Escape"].includes(event.key)) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        if (event.key === "Escape") void this.cancel();
        else if (this.valid) void this.finish();
        else void this.fit();
      },
      { signal: this.abort.signal, capture: true },
    );
    editor.world.changed.add(this.update);
  }
  private async start(file: File): Promise<void> {
    if (this.editor.blocked || this.editor.interactions.current) return;
    this.lease = this.editor.interactions.acquire(
      "mesh-import",
      () => this.cancel(),
      async () => {
        if (!this.valid) return false;
        await this.finish();
        return !this.lease;
      },
      {
        settled: async () => {
          await this.running;
        },
        navigation: "when-released",
      },
    );
    if (!this.lease) return;
    const lease = this.lease;
    this.editor.notice = "Import mesh · Fit preview, then accept · Escape to cancel";
    this.editor.message = "";
    this.original = [...this.editor.modeling.targets];
    this.editor.modeling.targets = [];
    this.widget.root.hidden = false;
    this.widget.title.textContent = file.name;
    this.widget.units.value = "1";
    this.widget.view.value = "source";
    this.widget.status.textContent = "Reading mesh…";
    this.editor.refresh();
    try {
      if (file.size > meshImportLimit) throw new Error("Choose a mesh file smaller than 25 MB");
      const bytes = await file.arrayBuffer();
      if (this.lease !== lease || lease.phase !== "editing") return;
      const worker = new Worker(new URL("./mesh-import-worker.ts", import.meta.url), {
        type: "module",
      });
      this.worker = worker;
      worker.onmessage = (event: MessageEvent<{ mesh?: ImportedMesh; error?: string }>) => {
        worker.terminate();
        if (this.worker !== worker || this.lease !== lease) return;
        this.worker = null;
        if (event.data.error || !event.data.mesh) {
          this.widget.status.textContent = event.data.error ?? "Could not read mesh";
          this.editor.refresh();
          return;
        }
        this.loaded(event.data.mesh);
      };
      worker.onerror = () => {
        worker.terminate();
        if (this.worker !== worker) return;
        this.worker = null;
        this.widget.status.textContent = "Could not read mesh";
        this.editor.refresh();
      };
      worker.postMessage({ name: file.name, bytes }, [bytes]);
    } catch (error) {
      if (this.lease === lease)
        this.widget.status.textContent = error instanceof Error ? error.message : String(error);
      this.editor.refresh();
    }
  }
  private loaded(mesh: ImportedMesh): void {
    this.mesh = mesh;
    this.view.set(mesh, 1);
    this.view.frame();
    const size = this.view.bounds.getSize(new Vector3()).length();
    this.widget.tolerance.value = String(Number(Math.max(1e-6, size * 0.005).toPrecision(3)));
    this.widget.status.textContent = `${mesh.triangles.length.toLocaleString()} triangles · Choose accuracy, then fit`;
    this.lease?.trackHistory(
      this.widget.root,
      () => [this.widget.tolerance.value, this.widget.patches.value, this.widget.units.value],
      async (values) => {
        [this.widget.tolerance.value, this.widget.patches.value, this.widget.units.value] = values;
        this.invalidate(true);
        await this.fit();
      },
    );
    this.show();
  }
  private invalidate(reframe = false): void {
    if (!this.mesh || !this.lease || this.running) return;
    this.valid = false;
    this.widget.view.value = "source";
    this.lease.show(null);
    this.view.set(this.mesh, Number(this.widget.units.value));
    if (reframe) this.view.frame();
    this.widget.status.textContent = "Parameters changed · Fit preview to inspect the result";
    this.show();
  }
  private fit(): Promise<void> {
    if (this.running || !this.mesh || this.lease?.phase !== "editing")
      return this.running ?? Promise.resolve();
    this.running = this.calculate().finally(() => {
      this.running = null;
      this.editor.refresh();
    });
    this.editor.refresh();
    return this.running;
  }
  private async calculate(): Promise<void> {
    const mesh = this.mesh,
      lease = this.lease;
    if (!mesh || !lease) return;
    this.valid = false;
    lease.show(null);
    this.widget.view.value = "source";
    this.view.show(true);
    const scale = Number(this.widget.units.value),
      tolerance = Number(this.widget.tolerance.value),
      maxPatches = Number(this.widget.patches.value);
    if (!Number.isFinite(tolerance) || tolerance < 1e-6) {
      this.widget.status.textContent = "Enter a positive accuracy in millimeters";
      return;
    }
    this.widget.status.textContent = "Matching and fitting surfaces…";
    const ok = await this.editor.store.request({
      kind: "reconstruct-mesh",
      input: {
        mesh: {
          vertices: mesh.vertices.map((p) => p.map((v) => v * scale) as Vector),
          triangles: mesh.triangles,
        },
        tolerance,
        maxPatches,
      },
    });
    if (this.lease !== lease || lease.phase !== "editing") return;
    this.valid = ok;
    const fit = this.editor.store.meshFit;
    this.widget.status.textContent =
      ok && fit
        ? `${surfaceSummary(fit)} · Max sampled error ${Math.max(fit.sampledMeshToSurface, fit.sampledSurfaceToMesh).toPrecision(3)} mm · Seam ${fit.sampledSeamAngle.toFixed(2)}°`
        : this.editor.message || "Could not fit this mesh";
    if (ok) this.widget.view.value = "fit";
    this.show();
  }
  private show(): void {
    if (!this.mesh || !this.lease) return;
    const mode = this.valid ? this.widget.view.value : "source",
      fit = this.editor.store.meshFit;
    this.lease.show(mode === "fit" ? this.editor.store.candidate : null);
    this.view.set(
      this.mesh,
      Number(this.widget.units.value),
      mode === "error" ? fit?.vertexErrors : undefined,
      Number(this.widget.tolerance.value),
    );
    this.view.show(mode !== "fit");
    this.widget.legend.hidden = mode !== "error";
    this.widget.legend.textContent = `0 → ${this.widget.tolerance.value} mm · Source-vertex distances; colors interpolate between samples`;
    this.editor.refresh();
  }
  private async finish(): Promise<void> {
    if (this.running || !this.valid || !this.lease) return;
    const lease = this.lease;
    if (!lease.close()) return;
    const before = new Set(this.editor.store.data.bodies?.map((b) => b.id));
    if (await this.editor.accept()) {
      this.editor.modeling.targets = (this.editor.store.data.bodies ?? [])
        .filter((b) => !before.has(b.id))
        .map((b) => ({ kind: "body", body: b.id }));
      this.end(lease);
    } else {
      lease.phase = "editing";
      this.editor.refresh();
    }
  }
  private async cancel(): Promise<void> {
    const lease = this.lease;
    if (!lease?.close()) return;
    this.worker?.terminate();
    this.worker = null;
    lease.show(null);
    this.view.show(false);
    await this.editor.store.cancelPreview();
    await this.running;
    this.editor.modeling.targets = this.original;
    this.end(lease);
  }
  private end(lease: InteractionLease): void {
    this.editor.notice = "";
    this.mesh = null;
    this.lease = null;
    this.valid = false;
    this.widget.root.hidden = true;
    this.view.clear();
    lease.release();
    this.editor.refresh();
  }
  private update = (): void => {
    if (!this.lease) return;
    const busy = !!this.worker || !!this.running || this.editor.blocked;
    for (const input of [this.widget.units, this.widget.tolerance, this.widget.patches])
      input.disabled = busy || !this.mesh;
    this.widget.fit.disabled = busy || !this.mesh;
    this.widget.accept.disabled = busy || !this.valid;
    this.widget.view.disabled = busy || !this.valid;
  };
  dispose(): void {
    this.worker?.terminate();
    this.abort.abort();
    this.unregister();
    this.editor.world.changed.delete(this.update);
    this.file.remove();
    this.view.dispose();
    this.widget.dispose();
  }
}

function surfaceSummary(fit: MeshFitStatistics): string {
  if (!fit.analyticFaces) return `${fit.patches} bicubic patches`;
  const regions = Object.entries(fit.analyticFaces)
    .filter(([, count]) => count)
    .map(([kind, count]) => `${count} ${count === 1 ? kind.slice(0, -1) : kind}`)
    .join(", ");
  return `${fit.patches} analytic ${fit.patches === 1 ? "face" : "faces"} (${regions})`;
}
