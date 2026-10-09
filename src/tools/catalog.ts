import { completeInteraction } from "../sketch/complete-interaction.js";
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
  /** Complete the current edit by default; false preserves same-owner/local actions. */
  finishEdit?: boolean | (() => boolean);
  allowBusy?: boolean;
  showInTools?: boolean;
}
export type ToolAction = Pick<ToolDefinition, "reason" | "run" | "finishEdit" | "allowBusy">;
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
  get switching(): boolean {
    return this.running;
  }
  private switches(tool: Pick<ToolAction, "finishEdit">): boolean {
    return typeof tool.finishEdit === "function" ? tool.finishEdit() : tool.finishEdit !== false;
  }
  reason(tool: Omit<ToolAction, "run">): string | null {
    if (this.running) return "Switching tools…";
    const current = this.editor.interactions.current;
    if (current?.captured || (!current && this.editor.isDragging))
      return "Finish the current drag first";
    if (
      current &&
      this.switches(tool) &&
      current.phase !== "closing" &&
      !this.editor.store.scriptRunning
    )
      return null;
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
    if (tool) await this.activate(tool);
  }
  async activate(tool: ToolAction): Promise<boolean> {
    const reason = this.reason(tool);
    if (reason) {
      this.editor.message = reason;
      this.editor.refresh();
      return false;
    }
    this.running = true;
    this.editor.refresh();
    try {
      const current = this.editor.interactions.current;
      if (current && this.switches(tool)) {
        if (!(await completeInteraction(this.editor))) {
          this.editor.message ||= "Could not complete the current edit";
          return false;
        }
        this.editor.refresh();
        const unavailable = tool.reason();
        if (unavailable) {
          this.editor.message = unavailable;
          return false;
        }
      }
      const result = await tool.run();
      const registered = [...this.entries.values()].find((entry) => entry === tool);
      // Recency records an admitted invocation, not later geometry acceptance.
      if (result !== false && registered && registered.showInTools !== false)
        this.recentIds = [
          registered.id,
          ...this.recentIds.filter((prior) => prior !== registered.id),
        ].slice(0, 10);
      return result !== false;
    } catch (error) {
      this.editor.message = error instanceof Error ? error.message : String(error);
      return false;
    } finally {
      this.running = false;
      this.editor.refresh();
    }
  }
}
