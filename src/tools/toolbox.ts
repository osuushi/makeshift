import type { SketchEditor } from "../sketch/editor.js";
import { type ToolResult, toolCatalog } from "./catalog.js";
import { toolShortcut } from "./menu-list.js";
import "./toolbox.css";

type ToolButton = { id: string; label: string; icon: string };
const sketchTools: ToolButton[] = [
  { id: "select", label: "Arrow", icon: '<path d="M5 3v17l5-5 3 7 3-1-3-7h7L5 3Z"/>' },
  {
    id: "line",
    label: "Line",
    icon: '<path d="m5 19 14-14"/><circle cx="5" cy="19" r="2"/><circle cx="19" cy="5" r="2"/>',
  },
  {
    id: "rectangle",
    label: "Rectangle",
    icon: '<rect x="4" y="4" width="16" height="16" rx="1"/>',
  },
  { id: "circle", label: "Circle", icon: '<circle cx="12" cy="12" r="8"/>' },
  {
    id: "pen",
    label: "Pen",
    icon: '<path d="m4 20 4-1 10-10-3-3L5 16l-1 4Z"/><path d="m13 7 3 3"/>',
  },
  {
    id: "trim",
    label: "Trim",
    icon: '<path d="M4 4 20 20M20 4 4 20"/><path d="M8 8 4 4m12 12 4 4"/>',
  },
];
const modelingTools: ToolButton[] = [
  sketchTools[0],
  {
    id: "start-sketch",
    label: "Sketch",
    icon: '<path d="M4 4h12v12H4z"/><path d="m13 13 6-6 2 2-6 6-3 1 1-3Z"/>',
  },
  {
    id: "cube",
    label: "Cube",
    icon: '<path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="M3 8v9l9 5 9-5V8M12 13v9"/>',
  },
  {
    id: "cylinder",
    label: "Cylinder",
    icon: '<ellipse cx="12" cy="6" rx="8" ry="3"/><path d="M4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6"/><path d="M4 18c0 1.7 3.6 3 8 3s8-1.3 8-3"/>',
  },
  {
    id: "sphere",
    label: "Sphere",
    icon: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 2.5 3 13.5 0 18M12 3c-3 2.5-3 13.5 0 18"/>',
  },
  {
    id: "cone",
    label: "Cone",
    icon: '<path d="m12 3 9 17H3L12 3Z"/><ellipse cx="12" cy="20" rx="9" ry="3"/>',
  },
  {
    id: "drill",
    label: "Drill",
    icon: '<path d="M9 3h6v4H9zM8 7h8l2 5v5l-6 5-6-5v-5l2-5Z"/><path d="M12 12v7"/>',
  },
  {
    id: "extrude",
    label: "Extrude",
    icon: '<path d="M4 9 12 5l8 4-8 4-8-4Z"/><path d="M4 9v7l8 4 8-4V9M12 13v7M8 7l8 4v6"/>',
  },
  {
    id: "offset",
    label: "Offset",
    icon: '<path d="M5 5h12v12H5z"/><path d="M8 8h12v12H8zM2 2h12v12"/>',
  },
];

/** Compact, mode-specific launchers backed by the shared command catalog. */
export class Toolbox {
  private root = document.createElement("aside");
  private grid = document.createElement("div");
  private observer: ResizeObserver;
  private signature = "";
  constructor(
    private editor: SketchEditor,
    app: HTMLElement,
    private entities: HTMLElement,
    mountMore: (host: HTMLElement) => void,
  ) {
    this.root.className = "toolbox";
    this.root.setAttribute("aria-label", "Common tools");
    this.grid.className = "toolbox-grid";
    const footer = document.createElement("div");
    footer.className = "toolbox-footer";
    mountMore(footer);
    this.root.append(this.grid, footer);
    app.append(this.root);
    this.observer = new ResizeObserver(this.position);
    this.observer.observe(entities);
    window.addEventListener("resize", this.position);
    editor.world.changed.add(this.update);
    this.update();
  }
  private position = (): void => {
    const bounds = this.entities.getBoundingClientRect();
    const top = Math.ceil(bounds.bottom + 8);
    this.root.style.top = `${top}px`;
    this.root.style.maxHeight = `${Math.max(120, window.innerHeight - top - 12)}px`;
  };
  private update = (): void => {
    const sketch = this.editor.world.active !== null;
    const tools = sketch ? sketchTools : modelingTools;
    const catalog = toolCatalog(this.editor);
    const signature = JSON.stringify([
      sketch,
      this.editor.tool,
      this.editor.modeling.tool,
      this.editor.interactions.current?.kind,
      catalog.results().map((tool) => [tool.id, tool.unavailable]),
    ]);
    if (signature === this.signature) return;
    this.signature = signature;
    this.root.dataset.mode = sketch ? "sketch" : "modeling";
    this.grid.replaceChildren();
    for (const item of tools) {
      const tool = catalog.results().find((candidate) => candidate.id === item.id);
      if (!tool) continue;
      this.grid.append(this.button(item, tool, sketch));
    }
    this.position();
  };
  private button(item: ToolButton, tool: ToolResult, sketch: boolean): HTMLButtonElement {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "toolbox-item";
    button.dataset.tool = item.id;
    button.disabled = !!tool.unavailable;
    button.title = [
      item.label,
      tool.shortcut ? `Shortcut ${toolShortcut(tool.shortcut)}` : "",
      tool.unavailable,
    ]
      .filter(Boolean)
      .join(" · ");
    button.setAttribute("aria-label", item.label);
    const active = this.activeTool(sketch) === item.id;
    button.setAttribute("aria-pressed", String(active));
    button.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${item.icon}</svg><span>${item.label}</span>${tool.shortcut ? `<kbd>${toolShortcut(tool.shortcut)}</kbd>` : ""}`;
    button.onclick = () => void toolCatalog(this.editor).invoke(item.id);
    return button;
  }
  private activeTool(sketch: boolean): string | null {
    if (sketch) return this.editor.tool;
    const kind = this.editor.interactions.current?.kind;
    if (kind === "face-offset") return "offset";
    if (kind && modelingTools.some((tool) => tool.id === kind)) return kind;
    const selected = this.editor.modeling.tool;
    if (selected && modelingTools.some((tool) => tool.id === selected)) return selected;
    return this.editor.tool === "select" ? "select" : null;
  }
  dispose(): void {
    this.observer.disconnect();
    window.removeEventListener("resize", this.position);
    this.editor.world.changed.delete(this.update);
    this.root.remove();
  }
}
