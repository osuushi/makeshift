import { toolCatalog } from "../tools/catalog.js";
import type { SketchEditor } from "./editor.js";

/** Keep the touch-accessible control and searchable command on the same setting. */
export function installGridSnapControl(editor: SketchEditor): () => void {
  const catalog = toolCatalog(editor);
  const button = document.createElement("button");
  button.className = "grid-snap-control";
  button.setAttribute("aria-label", "Snap to grid");
  button.title = "Snap to grid (geometry snapping stays available)";
  button.onclick = () => void catalog.invoke("grid");
  const update = () => {
    button.textContent = `Grid snap: ${editor.gridSnap ? "On" : "Off"}`;
    button.setAttribute("aria-pressed", String(editor.gridSnap));
    button.disabled =
      catalog.switching || editor.blocked || !!editor.interactions.current?.captured;
  };
  editor.world.host.append(button);
  editor.world.changed.add(update);
  update();
  return () => {
    editor.world.changed.delete(update);
    button.remove();
  };
}
