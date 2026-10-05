import type { SketchEditor } from "../sketch/editor.js";

export const categories = [
  ["Sketch", "Line, rectangle, curve and trim"],
  ["Solid", "Extrude, shell, fillet and combine"],
  ["Transform", "Move, duplicate, mirror and scale"],
  ["Constrain", "Relationships, point links and locks"],
  ["Reference", "Construction planes and projection"],
  ["Select", "Select and refine geometry"],
  ["View", "Visibility, grid and workspace"],
  ["Document & Edit", "Export and sketch cleanup"],
  ["Development", "Capture diagnostic fixtures"],
] as const;
export type Category = (typeof categories)[number][0];
export interface ToolDefinition {
  id: string;
  label: string;
  category: Category;
  description?: string;
  aliases?: readonly string[];
  related?: readonly string[];
  shortcut?: string;
  reason: () => string | null;
  run: () => unknown;
  allowBusy?: boolean;
  showInTools?: boolean;
}
export interface ToolResult extends ToolDefinition {
  unavailable: string | null;
}
const catalogs = new WeakMap<SketchEditor, ToolCatalog>();
export function toolCatalog(editor: SketchEditor): ToolCatalog {
  let catalog = catalogs.get(editor);
  if (!catalog) {
    catalog = new ToolCatalog(editor);
    catalogs.set(editor, catalog);
  }
  return catalog;
}
export function idleReason(editor: SketchEditor): string | null {
  return editor.interactions.current ? "Finish or cancel the current edit first" : null;
}
export class ToolCatalog {
  private entries = new Map<string, ToolDefinition>();
  private running = false;
  private recentIds: string[] = [];
  constructor(private editor: SketchEditor) {}
  register(tool: ToolDefinition): () => void {
    if (this.entries.has(tool.id)) throw new Error(`Duplicate tool: ${tool.id}`);
    this.entries.set(tool.id, tool);
    return () => {
      this.entries.delete(tool.id);
      this.recentIds = this.recentIds.filter((id) => id !== tool.id);
    };
  }
  reason(tool: ToolDefinition): string | null {
    if (this.running) return "Switching tools…";
    if (this.editor.isDragging) return "Finish the current drag first";
    if (this.editor.blocked && !tool.allowBusy) return "Wait for the current calculation";
    return tool.reason();
  }
  results(): ToolResult[] {
    return [...this.entries.values()].map((tool) => ({ ...tool, unavailable: this.reason(tool) }));
  }
  recent(): ToolResult[] {
    this.recentIds = this.recentIds.filter((id) => {
      const tool = this.entries.get(id);
      return tool && tool.showInTools !== false;
    });
    return this.recentIds.map((id) => {
      const tool = this.entries.get(id) as ToolDefinition;
      return { ...tool, unavailable: this.reason(tool) };
    });
  }
  async invoke(id: string): Promise<void> {
    const tool = this.entries.get(id);
    if (!tool) return;
    const reason = this.reason(tool);
    if (reason) {
      this.editor.message = reason;
      this.editor.refresh();
      return;
    }
    this.running = true;
    try {
      const result = await tool.run();
      // Recency records an admitted invocation, not later geometry acceptance.
      if (result !== false && tool.showInTools !== false && this.entries.get(id) === tool)
        this.recentIds = [id, ...this.recentIds.filter((prior) => prior !== id)].slice(0, 10);
    } catch (error) {
      this.editor.message = error instanceof Error ? error.message : String(error);
    } finally {
      this.running = false;
      this.editor.refresh();
    }
  }
}
