import { selectedGuides } from "../guides/selection.js";
import { guidesVisible } from "../guides/view-state.js";
import type { SketchEditor } from "../sketch/editor.js";
import { type ToolResult, toolCatalog } from "./catalog.js";
import { toolboxIcon } from "./toolbox-icons.js";

/** Reference visibility and contextual construction stay outside the editable tool tree. */
export class ToolboxReferences {
  readonly root = document.createElement("div");
  constructor(private editor: SketchEditor) {
    this.root.className = "toolbox-references";
  }
  update(tools: ReadonlyMap<string, ToolResult>): void {
    const ids = ["guide-points"];
    if (selectedGuides(this.editor).size) ids.push("construction-plane");
    this.root.replaceChildren(
      ...ids.flatMap((id) => {
        const tool = tools.get(id);
        if (!tool) return [];
        const button = document.createElement("button");
        button.type = "button";
        button.className = "toolbox-item";
        button.dataset.tool = id;
        button.setAttribute("aria-label", tool.label);
        button.setAttribute(
          "aria-pressed",
          String(id === "guide-points" && guidesVisible(this.editor)),
        );
        button.disabled = !!tool.unavailable;
        button.title = tool.unavailable ?? tool.description ?? tool.label;
        const label = document.createElement("span");
        label.textContent = tool.label;
        button.append(toolboxIcon(id), label);
        button.onclick = () => void toolCatalog(this.editor).invoke(id);
        return [button];
      }),
    );
  }
}
