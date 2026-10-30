import {
  type Operation,
  type OperationInputs,
  type Resolution,
  resolveOperation,
} from "../model/operation-selection.js";
import { expandedSelection, selectionContext } from "../model/selection-context.js";
import { defaultModelingTool, type ModelingTool } from "../model/tool-policy.js";
import type { SketchDocument } from "./document.js";
import type { Vector } from "./planes.js";
import type { Profile } from "./profiles.js";

export type { ModelingTool } from "../model/tool-policy.js";
export type ModelingTarget =
  | { kind: "body"; body: string; sketch?: never }
  | { kind: "edge"; body: string; edge: string; point?: Vector; sketch?: never }
  | { kind: "face"; body: string; face: string; sketch?: never }
  | { kind: "sketch"; sketch: string }
  | { kind: "profile"; sketch: string; profile: Profile };
export const modelingKey = (target: ModelingTarget): string =>
  target.kind === "body"
    ? target.body
    : target.kind === "edge"
      ? target.edge
      : target.kind === "face"
        ? target.face
        : target.kind === "sketch"
          ? target.sketch
          : target.profile.key;
export class ModelSelection {
  readonly selectionChosen = new Set<() => void>();
  referencePlane: string | null = null;
  memberBody: string | null = null;
  allows(target: ModelingTarget): boolean {
    return (
      !this.memberBody ||
      ((target.kind === "face" || target.kind === "edge") && target.body === this.memberBody)
    );
  }
  private selected: ModelingTarget[] = [];
  get targets(): ModelingTarget[] {
    return this.selected;
  }
  set targets(targets: ModelingTarget[]) {
    const previous = this.key;
    this.selected = targets.filter((target) => this.allows(target));
    if (this.key !== previous) this.chosenTool = null;
  }
  private chosenTool: { key: string; tool: ModelingTool | null } | null = null;
  private get key(): string {
    return this.targets.map((target) => `${target.kind}:${modelingKey(target)}`).join("|");
  }
  get explicitTool(): ModelingTool | null {
    return this.chosenTool?.key === this.key ? this.chosenTool.tool : null;
  }
  get tool(): ModelingTool | null {
    if (this.chosenTool?.key === this.key) return this.chosenTool.tool;
    return this.document ? defaultModelingTool(this.targets, this.document) : null;
  }
  resolve<K extends Operation>(operation: K): Resolution<OperationInputs[K]> {
    return resolveOperation(
      operation,
      this.targets,
      this.document ?? { units: "mm", sketches: [] },
    );
  }

  setTool(tool: ModelingTool | null): void {
    this.chosenTool = { key: this.key, tool };
  }
  lastEdgeClick: { body: string; edge: string; point: Vector } | null = null;
  alternatives: ModelingTarget[] = [];
  hover: ModelingTarget | null = null;
  private document: SketchDocument | null = null;
  sync(document: SketchDocument): void {
    if (this.document === document) return;
    const previous = this.document;
    const sameBodies =
      (document.bodies ?? []).length === (previous?.bodies ?? []).length &&
      (document.bodies ?? []).every((body, index) => {
        const before = previous?.bodies?.[index];
        return body.id === before?.id && body.brep === before.brep;
      });
    if (!sameBodies) this.lastEdgeClick = null;
    this.document = document;
    this.targets = this.targets.filter(
      (t) =>
        (t.kind === "sketch" && document.sketches.some((s) => s.id === t.sketch)) ||
        (t.kind === "profile" &&
          sameBodies &&
          document.sketches.some(
            (sketch) =>
              sketch.id === t.sketch &&
              JSON.stringify(sketch) ===
                JSON.stringify(previous?.sketches.find((s) => s.id === t.sketch)),
          )) ||
        ((t.kind === "body" || t.kind === "edge" || t.kind === "face") &&
          !!document.bodies?.some(
            (b) =>
              b.id === t.body &&
              (t.kind === "body" ||
                (t.kind === "edge"
                  ? b.edges.some((e) => e.id === t.edge)
                  : b.faces.some((f) => f.id === t.face))),
          )),
    );
    this.hover = null;
    this.alternatives = [];
  }
  chooseProfiles(sketch: string, profiles: Profile[], add: boolean, toggle: boolean): void {
    const targets: ModelingTarget[] = profiles.map((profile) => ({
      kind: "profile",
      sketch,
      profile,
    }));
    if (targets.some((target) => !this.allows(target))) return;
    if (!add && !toggle) this.referencePlane = null;
    this.chosenTool = null;
    const keys = new Set(targets.map(modelingKey));
    const selected = new Set(this.targets.map(modelingKey));
    const allSelected = targets.every((target) => selected.has(modelingKey(target)));
    this.targets =
      toggle && allSelected
        ? this.targets.filter((target) => !keys.has(modelingKey(target)))
        : add || toggle
          ? [...this.targets, ...targets.filter((target) => !selected.has(modelingKey(target)))]
          : targets;
    for (const notify of this.selectionChosen) notify();
  }
  choose(target: ModelingTarget | null, add: boolean, toggle: boolean, remove = false): void {
    if (target && !this.allows(target)) return;
    if (!add && !toggle && !remove) this.referencePlane = null;
    this.chosenTool = null;
    if (!target) {
      if (!add && !toggle && !remove) {
        this.targets = [];
        for (const notify of this.selectionChosen) notify();
      }
      return;
    }
    if (target.kind === "edge" && target.point)
      this.lastEdgeClick = { body: target.body, edge: target.edge, point: target.point };
    if (
      (toggle || remove) &&
      target.kind === "face" &&
      this.document &&
      this.targets.some((t) => t.kind === "body" && t.body === target.body)
    ) {
      this.targets = expandedSelection(selectionContext(this.targets, this.document));
    }
    const exists = this.targets.some((t) => modelingKey(t) === modelingKey(target));
    this.targets =
      remove || (toggle && exists)
        ? this.targets.filter((t) =>
            remove && target.kind === "body"
              ? !("body" in t && t.body === target.body)
              : modelingKey(t) !== modelingKey(target),
          )
        : add || toggle
          ? exists
            ? this.targets
            : [...this.targets, target]
          : [target];
    for (const notify of this.selectionChosen) notify();
  }
}
