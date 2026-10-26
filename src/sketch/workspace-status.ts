import { activeTransformTool } from "../model/transform-layers.js";
import type { SketchEditor } from "./editor.js";

/** Sketch and modeling hints share the same document and interaction status. */
export function installWorkspaceStatus(
  editor: SketchEditor,
  app: HTMLElement,
  status: HTMLElement,
): void {
  const text = document.createElement("span");
  const dismiss = document.createElement("button");
  dismiss.type = "button";
  dismiss.className = "dismiss-feedback";
  dismiss.textContent = "×";
  dismiss.setAttribute("aria-label", "Dismiss error");
  status.replaceChildren(text, dismiss);
  const clear = (): void => {
    if (!editor.message) return;
    editor.message = "";
    editor.refresh();
  };
  dismiss.addEventListener("click", clear);
  // Capture clears the previous failure before the new action can report its own.
  window.addEventListener(
    "pointerdown",
    (event) => {
      if (!status.contains(event.target as Node)) clear();
    },
    true,
  );
  window.addEventListener(
    "keydown",
    (event) => {
      if (
        !["Shift", "Control", "Alt", "Meta", "Tab"].includes(event.key) &&
        !status.contains(event.target as Node)
      )
        clear();
    },
    true,
  );
  window.addEventListener("input", clear, true);
  editor.world.changed.add(() => {
    const error = Boolean(editor.message);
    status.classList.toggle("error-feedback", error);
    if (error) text.setAttribute("role", "alert");
    else text.removeAttribute("role");
    dismiss.hidden = !error;
    const mode = app.querySelector(".mode-label");
    if (mode) mode.textContent = editor.world.active ? "Sketching" : "Modeling";
    text.textContent =
      editor.message ||
      (editor.store.slow
        ? editor.world.active
          ? "Solving sketch…"
          : "Calculating geometry…"
        : "") ||
      (editor.world.active && editor.tool === "pen"
        ? `Pen · ${editor.world.spacing} mm grid ${editor.gridSnap ? "on" : "off"} · click corners / drag smooth · Shift 45° / bypass snaps · Option / Alt corner · Enter finish`
        : "") ||
      editor.notice ||
      (editor.world.active
        ? `${editor.world.active} sketch · ${editor.world.spacing} mm grid · ${editor.tool === "trim" ? "Trim · click a span · Option-drag to brush" : (editor.snap?.label ?? (editor.moveMode ? transformHint(editor) : "Shift bypasses geometry snaps · Option / Alt draws/resizes about center"))}`
        : editor.modeling.targets.length
          ? `${editor.modeling.targets.length} ${editor.modeling.targets.every((t) => t.kind === "body") ? "body" : editor.modeling.targets.every((t) => t.kind === "edge") ? "edge" : editor.modeling.targets.every((t) => t.kind === "face") ? "face" : editor.modeling.targets.every((t) => t.kind === "sketch") ? "sketch" : editor.modeling.targets.every((t) => t.kind === "profile") ? "region" : "item"} selected${editor.modeling.targets.every((t) => t.kind === "body" || t.kind === "sketch") ? " · M to move · ⌘T to transform" : ""}`
          : editor.world.selectedPlane
            ? `${editor.world.selectedPlane} plane selected · Enter to sketch`
            : editor.tool === "rectangle"
              ? "Rectangle · Choose a plane to sketch"
              : editor.tool === "trim"
                ? "Trim · Choose a plane to sketch"
                : "Choose a plane to sketch");
  });
}

function transformHint(editor: SketchEditor): string {
  const mode = activeTransformTool(editor);
  if (mode === "move") return "Move · Shift: finer grid · Option: copy";
  if (mode === "rotate") return "Rotate · Shift: finer angle · Option: copy";
  if (mode === "scale") return "Scale · Shift: uniform · Option: about anchor";
  return "Transform · Shift: finer move/rotate or uniform scale · Option: copy or anchor";
}
