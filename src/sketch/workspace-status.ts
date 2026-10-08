import type { SketchEditor } from "./editor.js";

/** Sketch and modeling hints share the same document and interaction status. */
export function installWorkspaceStatus(
  editor: SketchEditor,
  app: HTMLElement,
  status: HTMLElement,
): void {
  editor.world.changed.add(() => {
    const mode = app.querySelector(".mode-label");
    if (mode) mode.textContent = editor.world.active ? "Sketching" : "Modeling";
    status.textContent =
      (editor.store.slow
        ? editor.world.active
          ? "Solving sketch…"
          : "Calculating geometry…"
        : "") ||
      editor.message ||
      (editor.world.active && editor.tool === "pen"
        ? `Pen · ${editor.world.spacing} mm grid ${editor.gridSnap ? "on" : "off"} · click corners / drag smooth · Shift 45° / bypass snaps · Option / Alt corner · Enter finish`
        : "") ||
      editor.notice ||
      (editor.world.active
        ? `${editor.world.active} sketch · ${editor.world.spacing} mm grid · ${editor.tool === "trim" ? "Trim · click a span · Option-drag to brush" : (editor.snap?.label ?? (editor.moveMode ? "Transform · Shift uniform · Option about anchor · ⌘-drag box moves" : "Shift bypasses geometry snaps · Option / Alt draws/resizes about center"))}`
        : editor.modeling.targets.length
          ? `${editor.modeling.targets.length} ${editor.modeling.targets.every((t) => t.kind === "body") ? "body" : editor.modeling.targets.every((t) => t.kind === "edge") ? "edge" : editor.modeling.targets.every((t) => t.kind === "face") ? "face" : editor.modeling.targets.every((t) => t.kind === "sketch") ? "sketch" : editor.modeling.targets.every((t) => t.kind === "profile") ? "region" : "item"} selected${editor.modeling.targets.every((t) => t.kind === "body" || t.kind === "sketch") ? " · M to transform" : ""}`
          : editor.world.selectedPlane
            ? `${editor.world.selectedPlane} plane selected · Enter to sketch`
            : editor.tool === "rectangle"
              ? "Rectangle · Choose a plane to sketch"
              : editor.tool === "trim"
                ? "Trim · Choose a plane to sketch"
                : "Choose a plane to sketch");
  });
}
