import { Box3, Vector3 } from "three";
import type { InteractionLease } from "../sketch/active-interaction.js";
import type { SketchEditor } from "../sketch/editor.js";
import { idleReason, toolCatalog } from "../tools/catalog.js";

/** File reading and calculation share one interaction until atomic acceptance. */
export class StepImportControls {
  private file = document.createElement("input");
  private unregister: () => void;
  private running: Promise<void> | null = null;
  constructor(
    private editor: SketchEditor,
    overlay: HTMLElement,
  ) {
    this.file.type = "file";
    this.file.accept = ".step,.stp";
    this.file.hidden = true;
    overlay.append(this.file);
    this.file.onchange = () => {
      const file = this.file.files?.[0];
      if (file) this.start(file);
      this.file.value = "";
    };
    this.unregister = toolCatalog(editor).register({
      id: "import-step",
      label: "Import STEP",
      category: "Document & Edit",
      aliases: ["STP", "import CAD", "import solid"],
      description: "Import exact solid bodies from a STEP file",
      reason: () => idleReason(editor) ?? (editor.world.active ? "Return to Modeling first" : null),
      run: () => this.file.click(),
    });
  }
  private start(file: File): void {
    const editor = this.editor;
    if (editor.blocked || editor.world.active || editor.interactions.current) return;
    let cancelled = false;
    const lease = editor.interactions.acquire(
      "step-import",
      async () => {
        if (!lease?.close()) return;
        cancelled = true;
        await editor.store.cancelPreview();
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
    this.running = this.read(file, lease, () => cancelled).finally(() => {
      this.running = null;
      editor.notice = "";
      lease.release();
      editor.refresh();
    });
  }
  private async read(file: File, lease: InteractionLease, cancelled: () => boolean): Promise<void> {
    const editor = this.editor;
    editor.notice = "Importing STEP…";
    editor.message = "";
    editor.refresh();
    try {
      if (!file.size || file.size > 25 * 1024 * 1024)
        throw new Error("Choose a nonempty STEP file smaller than 25 MB");
      const step = await file.text();
      if (cancelled()) return;
      const before = new Set(editor.store.data.bodies?.map((body) => body.id));
      const ok = await editor.store.request({ kind: "import-step", step });
      if (!ok || cancelled() || !lease.close()) return;
      if (!(await editor.accept())) {
        await editor.store.cancelPreview();
        return;
      }
      const imported = (editor.store.data.bodies ?? []).filter((body) => !before.has(body.id));
      editor.modeling.targets = imported.map((body) => ({ kind: "body", body: body.id }));
      const bounds = new Box3();
      for (const body of imported) {
        bounds.expandByPoint(new Vector3(...body.bounds.slice(0, 3)));
        bounds.expandByPoint(new Vector3(...body.bounds.slice(3, 6)));
      }
      const world = editor.world,
        center = bounds.getCenter(new Vector3());
      const size = bounds.getSize(new Vector3()).length();
      const direction = world.camera.position.clone().sub(world.target).normalize();
      world.target.copy(center);
      world.camera.position.copy(center).addScaledVector(direction, size * 2);
      world.height = Math.max(0.001, size * 1.4);
      world.requestDraw();
    } catch (error) {
      if (!cancelled()) editor.message = error instanceof Error ? error.message : String(error);
    }
  }
  dispose(): void {
    this.unregister();
    this.file.remove();
  }
}
