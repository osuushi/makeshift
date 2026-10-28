import type { InteractionLease } from "../sketch/active-interaction.js";
import type { SketchEditor } from "../sketch/editor.js";
import type { ToolAction } from "./catalog.js";
import { pickSelectionCandidate, selectionCandidates } from "./selection-candidates.js";
import { SelectionEmphasis } from "./selection-emphasis.js";
import type { ToolSelection } from "./tool-selection.js";
import { selectionPickers } from "./tool-selection.js";

export function collectToolSelection(
  editor: SketchEditor,
  tool: ToolAction,
  selection: ToolSelection,
  proceed: () => Promise<boolean>,
): void {
  new SelectionStep(editor, tool, selection, proceed);
}
class SelectionStep {
  private root = document.createElement("div");
  private prompt = document.createElement("span");
  private next = document.createElement("button");
  private abort = new AbortController();
  private lease: InteractionLease | null = null;
  private emphasis: SelectionEmphasis;
  private candidates;
  private previous;
  private workspace;
  private accepted;
  private acceptedContent;
  private previousModelTool;
  private previousSketchTool;
  private instruction;
  constructor(
    private editor: SketchEditor,
    tool: ToolAction,
    private selection: ToolSelection,
    private proceed: () => Promise<boolean>,
  ) {
    this.previous = selection.targets;
    this.previousModelTool = editor.modeling.tool;
    this.previousSketchTool = editor.tool;
    this.instruction = ["union", "subtract", "intersect"].includes(selection.id)
      ? "Select at least two bodies"
      : (tool.reason() ?? "Select compatible geometry");
    this.workspace = editor.world.workspace;
    this.accepted = editor.store.data;
    this.acceptedContent = JSON.stringify(this.accepted);
    this.candidates = selectionCandidates(selection);
    // Retain eligible categories even when the count/combination still needs editing.
    selection.targets = this.previous.filter((target) =>
      this.previous
        .filter((other) => selection.category(other) === selection.category(target))
        .every((other) => selection.accepts(other)),
    );
    this.emphasis = new SelectionEmphasis(editor, this.candidates, selection);
    this.lease = editor.interactions.acquire("tool-selection", () => this.cancel(), undefined, {
      navigation: "when-released",
      selectsLocally: () => true,
    });
    this.root.className = "tool-selection-step";
    this.root.setAttribute("role", "group");
    this.root.setAttribute("aria-label", "Select tool inputs");
    this.prompt.setAttribute("role", "status");
    const cancel = document.createElement("button");
    cancel.textContent = "Cancel";
    cancel.onclick = () => this.cancel();
    this.next.textContent = "Next";
    this.next.onclick = () => void this.finish();
    this.root.append(this.prompt, cancel, this.next);
    editor.world.host.append(this.root);
    this.root.dataset.tool = selection.id;
    this.root.dataset.label = "label" in tool ? String(tool.label) : selection.id;
    selectionPickers.set(editor, {
      choose: (target) => this.choose(target),
      hover: () => {},
      available: (target) =>
        this.candidates.some((c) => selection.key(c.target) === selection.key(target)),
      selected: (target) =>
        selection.targets.some((t) => selection.key(t) === selection.key(target)),
    });
    this.installInput();
    editor.world.changed.add(this.update);
    editor.modeling.setTool(null);
    editor.tool = "select";
    editor.creationArmed = false;
    editor.world.canvas.focus();
    editor.refresh();
  }
  private installInput(): void {
    const options = { capture: true, signal: this.abort.signal };
    for (const type of ["pointerdown", "pointerup", "click", "dblclick"] as const)
      window.addEventListener(
        type,
        (event) => {
          if (event.target !== this.editor.world.canvas || event.button || event.altKey) return;
          event.preventDefault();
          event.stopImmediatePropagation();
          if (type !== "click" || this.editor.blocked) return;
          const target = pickSelectionCandidate(this.selection, this.candidates, {
            x: event.clientX,
            y: event.clientY,
          });
          if (!target) return;
          this.choose(target, event.shiftKey && !event.ctrlKey && !event.metaKey);
        },
        options,
      );
    window.addEventListener(
      "keydown",
      (event) => {
        if (
          !["Escape", "Enter"].includes(event.key) ||
          (event.target instanceof Element &&
            event.target.closest("input, textarea, .agent-dock, dialog"))
        )
          return;
        event.preventDefault();
        event.stopImmediatePropagation();
        if (event.key === "Escape") this.cancel();
        else void this.finish();
      },
      options,
    );
  }
  private choose(target: import("./tool-selection.js").ToolTarget, addOnly = false): void {
    if (!this.selection.accepts(target) || this.editor.blocked) return;
    const key = this.selection.key(target);
    const current = this.selection.targets;
    this.selection.targets = this.selection.policy.single
      ? [target]
      : current.some((t) => this.selection.key(t) === key)
        ? addOnly
          ? current
          : current.filter((t) => this.selection.key(t) !== key)
        : [...current, target];
    this.editor.refresh();
    if (this.selection.policy.single && this.selection.valid()) void this.finish();
  }
  private update = (): void => {
    const data = this.editor.store.data;
    if (
      this.editor.world.workspace !== this.workspace ||
      (data !== this.accepted && JSON.stringify(data) !== this.acceptedContent)
    ) {
      this.end();
      this.editor.refresh();
      return;
    }
    // Selection/navigation replies republish the same accepted document.
    this.accepted = data;
    this.emphasis.update();
    this.next.disabled = this.editor.blocked || !this.selection.valid();
    const count = this.selection.targets.length;
    this.prompt.textContent = `${this.root.dataset.label}: ${this.candidates.length ? `${this.instruction} (highlighted)` : "No eligible geometry is visible"} · ${count} selected${this.next.disabled && count ? ` · ${this.selection.reason() ?? "Choose compatible inputs"}` : ""}`;
  };
  private async finish(): Promise<void> {
    if (this.editor.blocked || !this.selection.valid()) return;
    this.end();
    await this.proceed();
  }
  private cancel(): void {
    this.selection.targets = this.previous;
    this.editor.modeling.setTool(this.previousModelTool);
    this.editor.tool = this.previousSketchTool;
    this.end();
    this.editor.refresh();
  }
  private end(): void {
    selectionPickers.delete(this.editor);
    this.abort.abort();
    this.editor.world.changed.delete(this.update);
    this.emphasis.dispose();
    this.root.remove();
    this.lease?.release();
    this.lease = null;
  }
}
