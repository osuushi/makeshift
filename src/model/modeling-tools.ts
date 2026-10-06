import type { SketchEditor } from "../sketch/editor.js";
import { onModelKeydown } from "../sketch/model-keys.js";
import type { ModelingTool } from "../sketch/model-selection-state.js";
import { toolCatalog } from "../tools/catalog.js";
import { modelingShortcut, modelingShortcutLabel } from "./modeling-shortcuts.js";
import { SelectionTools } from "./selection-tools.js";

const entries = [
  ["extrude", "Extrude", ["extrusion"], ["twist", "draft", "push pull"]],
  ["offset", "Offset faces", ["face offset"], ["thickness", "resize"]],
  ["shell", "Shell", ["thickness", "hollow"], ["wall"]],
  ["erode", "Erode", ["erosion", "cavity", "shrink body"], ["interior", "minimum thickness"]],
  ["move", "Move", ["translate", "rotate"], []],
  ["fillet", "Fillet", ["round", "rounding"], []],
  ["chamfer", "Chamfer", ["bevel"], []],
  ["loft", "Loft", ["sections", "blend profiles"], ["smooth", "ruled"]],
  ["revolve", "Revolve", ["revolution", "lathe"], ["screw", "helix"]],
] as const;
export class ModelingTools {
  private menu: SelectionTools;
  private abort = new AbortController();
  private disposers: (() => void)[] = [];
  constructor(
    private editor: SketchEditor,
    private revolve: () => void,
    private loft: () => void,
    private edgeMode: (mode: "fillet" | "chamfer") => void,
  ) {
    const catalog = toolCatalog(editor);
    for (const [tool, label, aliases, related] of entries) {
      if (tool === "move") continue;
      this.disposers.push(
        catalog.register({
          id: tool,
          finishEdit: () =>
            !(
              editor.interactions.current?.kind === "body-edge-finish" &&
              (tool === "fillet" || tool === "chamfer")
            ) && editor.interactions.current?.kind !== (tool === "offset" ? "face-offset" : tool),
          label,
          shortcut: modelingShortcutLabel(tool),
          aliases,
          related,
          category: "Solid",
          reason: () => this.reason(tool),
          run: () => this.choose(tool),
        }),
      );
    }
    this.menu = new SelectionTools(editor);
    onModelKeydown(
      (event) => {
        if (
          editor.world.active ||
          event.ctrlKey ||
          event.metaKey ||
          event.altKey ||
          (event.target instanceof HTMLElement &&
            (event.target.matches("input, select, textarea") || event.target.isContentEditable))
        )
          return;
        if (editor.isDragging) return;
        const current = editor.interactions.current;
        const tool = modelingShortcut(
          event,
          current
            ? { kind: current.kind, canFinish: !!current.finish && current.phase === "editing" }
            : null,
        );
        if (!tool) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        void catalog.invoke(tool);
      },
      { signal: this.abort.signal, capture: true },
    );
  }
  private reason(tool: ModelingTool): string | null {
    if (this.editor.world.active) return "Return to Modeling and select solid geometry";
    if (!this.editor.modeling.targets.length && tool !== "loft")
      return {
        shell: "Select a body or faces to shell",
        erode: "Select complete bodies to erode",
        offset: "Select faces or bodies to offset",
        move: "Select bodies, faces or edges to move",
        fillet: "Select solid faces or edges to round",
        chamfer: "Select solid faces or edges to bevel",
        extrude: "Select a closed profile or solid face",
        revolve: "Select a closed profile or planar face",
        loft: "Choose ordered sections",
      }[tool];
    if (this.editor.modeling.targets.length) {
      const result = this.editor.modeling.resolve(tool);
      if (!result.available) return result.reason;
    }
    const current = this.editor.interactions.current;
    if (current && !current.finish) return "Finish or cancel the current edit first";
    return null;
  }
  private async choose(tool: ModelingTool): Promise<boolean> {
    const editor = this.editor;
    if (editor.blocked || editor.isDragging || this.reason(tool)) return false;
    if (
      editor.interactions.current?.kind === "body-edge-finish" &&
      (tool === "fillet" || tool === "chamfer")
    ) {
      this.edgeMode(tool);
      return true;
    }
    if (editor.modeling.tool === tool && editor.interactions.current) return true;
    const current = editor.interactions.current;
    if (current && !(await current.finish?.())) {
      editor.message ||= "Finish or cancel the current edit before switching tools";
      return false;
    }
    if (this.reason(tool)) return false;
    editor.modeling.setTool(tool);
    editor.notice = "";
    if (tool === "revolve") this.revolve();
    if (tool === "loft") this.loft();
    if (
      (tool === "fillet" || tool === "chamfer") &&
      editor.modeling.targets.some((target) => target.kind === "face")
    )
      this.edgeMode(tool);
    editor.refresh();
    return true;
  }
  dispose(): void {
    this.abort.abort();
    this.menu.dispose();
    for (const dispose of this.disposers) dispose();
  }
}
