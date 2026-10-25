import { Box3, Vector3 } from "three";
import { writeClipboard } from "../clipboard/geometry.js";
import { pasteSelection } from "../clipboard/paste-selection.js";
import type { InteractionLease } from "../sketch/active-interaction.js";
import type { Sketch } from "../sketch/document.js";
import type { SketchEditor } from "../sketch/editor.js";
import { worldCurveBounds } from "../sketch/world-curve-bounds.js";
import { idleReason, toolCatalog } from "../tools/catalog.js";
import { dxfLimit, type readDxf } from "./dxf-import.js";

export class DxfImportControls {
  private file = document.createElement("input");
  private unregister: () => void;
  private running: Promise<void> | null = null;
  private cancelled = false;
  private cancelRead: (() => void) | null = null;
  constructor(
    private editor: SketchEditor,
    overlay: HTMLElement,
  ) {
    this.file.type = "file";
    this.file.accept = ".dxf";
    this.file.hidden = true;
    overlay.append(this.file);
    this.file.onchange = () => {
      const file = this.file.files?.[0];
      this.file.value = "";
      if (file) this.start(file);
    };
    this.unregister = toolCatalog(editor).register({
      id: "import-dxf",
      label: "Import DXF sketch",
      category: "Document & Edit",
      description:
        "Editable 2D lines, arcs, circles and polylines on the current plane (XY in Modeling)",
      reason: () => idleReason(editor),
      run: () => this.file.click(),
    });
  }
  private start(file: File): void {
    const editor = this.editor;
    if (editor.blocked || idleReason(editor)) return;
    this.cancelled = false;
    const lease = editor.interactions.acquire(
      "dxf-import",
      async () => {
        this.cancelled = true;
        this.cancelRead?.();
        await this.running;
      },
      async () => {
        await this.running;
        return true;
      },
      {
        navigation: "when-released",
        settled: async () => {
          await this.running;
        },
      },
    );
    if (!lease) return;
    editor.notice = "Importing DXF…";
    editor.message = "";
    editor.refresh();
    this.running = this.read(file, lease).finally(() => {
      this.running = null;
      editor.notice = "";
      lease.release();
      editor.refresh();
    });
  }
  private async read(file: File, lease: InteractionLease): Promise<void> {
    try {
      if (!file.size || file.size > dxfLimit)
        throw new Error("Choose a nonempty DXF file smaller than 25 MB");
      const text = await file.text();
      if (this.cancelled) return;
      const result = await this.parse(text);
      if (!result || this.cancelled || !lease.close()) return;
      const { sketch, unitless, skipped } = result;
      const ok = await pasteSelection(
        this.editor,
        writeClipboard({ sketches: [sketch], bodies: [] }),
      );
      if (ok) {
        this.frame(sketch);
        this.editor.message = `Imported ${sketch.curves.length} DXF curves · Move (M) to reposition${unitless ? " · No units declared; using millimeters" : ""}${skipped ? ` · Omitted ${skipped} annotation/point entities` : ""}`;
      }
    } catch (error) {
      this.editor.message = error instanceof Error ? error.message : String(error);
    }
  }
  private frame(sketch: Sketch): void {
    const world = this.editor.world;
    world.cancelCameraMotion();
    const bounds = new Box3();
    for (const curve of sketch.curves)
      for (const point of worldCurveBounds(curve, world.workspace?.frame ?? sketch.plane))
        bounds.expandByPoint(new Vector3(...point));
    const center = bounds.getCenter(new Vector3());
    const size = Math.max(1, bounds.getSize(new Vector3()).length());
    const direction = world.camera.position.clone().sub(world.target).normalize();
    world.target.copy(center);
    world.camera.position.copy(center).addScaledVector(direction, size * 2);
    const viewport = world.canvas.getBoundingClientRect();
    world.height = size * 1.6 * Math.max(1, viewport.height / Math.max(1, viewport.width));
    world.requestDraw();
  }
  private parse(text: string): Promise<ReturnType<typeof readDxf> | null> {
    return new Promise((resolve, reject) => {
      const worker = new Worker(new URL("./dxf-import-worker.ts", import.meta.url), {
        type: "module",
      });
      const finish = () => {
        worker.terminate();
        this.cancelRead = null;
      };
      this.cancelRead = () => {
        finish();
        resolve(null);
      };
      worker.onmessage = (
        event: MessageEvent<{ result?: ReturnType<typeof readDxf>; error?: string }>,
      ) => {
        finish();
        if (event.data.error) reject(new Error(event.data.error));
        else resolve(event.data.result ?? null);
      };
      worker.onerror = () => {
        finish();
        reject(new Error("Could not read DXF"));
      };
      worker.postMessage(text);
    });
  }
  dispose(): void {
    this.cancelled = true;
    this.cancelRead?.();
    this.unregister();
    this.file.remove();
  }
}
