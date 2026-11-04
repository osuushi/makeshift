import type { SketchEditor } from "../sketch/editor.js";
import type { ModelingTarget } from "../sketch/model-selection-state.js";
import { modelingKey } from "../sketch/model-selection-state.js";
import { profilesFor } from "../sketch/profiles.js";
import type { SelectionTarget } from "../sketch/selection-target.js";
import { targetKey } from "../sketch/selection-target.js";
import type { ToolAction } from "./catalog.js";
import { narrowCategories, type SelectionPolicy, selectionPolicies } from "./selection-policy.js";

export const selectionPickers = new WeakMap<
  SketchEditor,
  {
    choose: (target: ModelingTarget) => void;
    hover: (target: ModelingTarget | null) => void;
    available: (target: ModelingTarget) => boolean;
    selected: (target: ModelingTarget) => boolean;
  }
>();
export type ToolTarget = ModelingTarget | SelectionTarget;
export class ToolSelection {
  readonly policy;
  readonly planar: boolean;
  constructor(
    readonly editor: SketchEditor,
    readonly id: string,
    readonly reason: () => string | null,
    policy?: SelectionPolicy,
  ) {
    this.policy = policy ?? selectionPolicies[id];
    this.planar = !!editor.world.active;
  }
  get applicable(): boolean {
    return (
      !!this.policy &&
      !!(this.planar ? this.editor.sketch && this.policy.sketch : this.policy.model)
    );
  }
  category(target: ToolTarget): string {
    return target.kind === "curve"
      ? (this.editor.sketch?.curves.find((c) => c.id === target.curve)?.kind ?? "curve")
      : target.kind;
  }
  key(target: ToolTarget): string {
    return `${target.kind}:${this.planar ? targetKey(target as SelectionTarget) : modelingKey(target as ModelingTarget)}`;
  }
  get targets(): ToolTarget[] {
    return this.planar ? [...this.editor.selected.targets] : this.editor.modeling.targets;
  }
  set targets(targets: ToolTarget[]) {
    if (this.planar) this.editor.selected.replace(targets as SelectionTarget[]);
    else this.editor.modeling.targets = targets as ModelingTarget[];
  }
  /** Whole sketches contribute every region before ordinary category refinement.
   * The sketch token retains the curves (including open edges) in Modeling.
   * Tools accepting whole sketches keep that authoritative entity selection.
   */
  get refinementTargets(): ToolTarget[] {
    if (this.planar || this.policy.model?.includes("sketch")) return this.targets;
    const expanded = this.targets.flatMap((target): ToolTarget[] => {
      if (target.kind !== "sketch") return [target];
      const sketch = this.editor.store.data.sketches.find((s) => s.id === target.sketch);
      return [
        target,
        ...(sketch
          ? profilesFor(sketch).map(
              (profile): ModelingTarget => ({
                kind: "profile",
                sketch: sketch.id,
                profile,
              }),
            )
          : []),
      ];
    });
    return [...new Map(expanded.map((target) => [this.key(target), target])).values()];
  }
  accepts(target: ToolTarget): boolean {
    const categories = this.planar ? this.policy.sketch : this.policy.model;
    if (!categories?.includes(this.category(target))) return false;
    if (!this.planar && target.kind === "face") {
      const face = this.editor.store.data.bodies
        ?.find((b) => b.id === target.body)
        ?.faces.find((f) => f.id === target.face);
      if (["revolve", "loft", "sketch-on-face"].includes(this.id)) return !!face?.plane;
      if (this.id === "extrude") return !!(face?.plane || face?.cylinder || face?.offsetHandle);
      if (["threads", "knurling"].includes(this.id)) return !!face?.cylinder;
    }
    return true;
  }
  valid(targets = this.targets): boolean {
    if (!targets.length || !targets.every((target) => this.accepts(target))) return false;
    const previous = this.targets;
    const chosen = this.editor.modeling.tool;
    try {
      this.targets = targets;
      if (
        ["union", "subtract", "intersect"].includes(this.id) &&
        !this.editor.modeling.resolve("boolean").available
      )
        return false;
      return !this.reason();
    } finally {
      this.targets = previous;
      this.editor.modeling.setTool(chosen);
    }
  }
  narrow(): ToolTarget[] | null {
    return narrowCategories(
      this.refinementTargets,
      (target) => this.category(target),
      (targets) => this.valid(targets),
    );
  }
}
export function toolSelection(
  editor: SketchEditor,
  tool: Omit<ToolAction, "run">,
): ToolSelection | null {
  if (!("id" in tool) || typeof tool.id !== "string") return null;
  if ((!selectionPolicies[tool.id] && !tool.selection) || !editor.world) return null;
  const selection = new ToolSelection(editor, tool.id, tool.reason, tool.selection);
  return selection.applicable ? selection : null;
}
