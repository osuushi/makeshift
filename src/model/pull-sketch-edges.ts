import type { SketchEditor } from "../sketch/editor.js";
import type { ProjectionSource } from "./projection.js";
import { projectionDestination } from "./projection-selection.js";

/** A sketch-space solid pick copies its boundary; it never selects solid topology. */
export async function pullSketchEdges(
  editor: SketchEditor,
  source: Extract<ProjectionSource, { kind: "face" | "edge" }>,
): Promise<void> {
  const frame = editor.world.activeFrame;
  if (!frame || editor.blocked || editor.interactions.current) return;
  const destination = projectionDestination(editor, frame, editor.sketch?.id);
  const previous = new Set(editor.sketch?.curves.map((curve) => curve.id));
  let cancelled = false;
  const lease = editor.interactions.acquire("use-edge", async () => {
    cancelled = true;
    await editor.store.cancelPreview();
  });
  if (!lease) return;
  try {
    const ok = await editor.store.request({
      kind: "project",
      projection: { ...destination, sources: [source], direction: "target-normal" },
    });
    if (!ok || cancelled) return;
    lease.close();
    if (!(await editor.accept())) return;
    editor.modeling.targets = [];
    editor.modeling.alternatives = [];
    const sketch = editor.store.data.sketches.find((s) => s.id === destination.sketchId);
    editor.select(sketch?.curves.filter((curve) => !previous.has(curve.id)).map((c) => c.id) ?? []);
    editor.tool = "select";
    editor.creationArmed = false;
    editor.notice = "Pulled independent edges into sketch";
  } finally {
    if (editor.store.candidate) await editor.store.cancelPreview();
    lease.release();
    editor.refresh();
  }
}
