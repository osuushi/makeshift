import type { SketchEditor } from "../sketch/editor.js";
import { planes } from "../sketch/planes.js";
import { bodyCenter } from "./body-placement.js";
import type { DisplayDocument } from "./display-document.js";
import { entityRows } from "./entity-presentation.js";
import type { EntityViewer } from "./entity-viewer.js";
import type { PlaneCut } from "./plane-cut.js";
import { planeCutEdges } from "./plane-cut-edges.js";
import { PlaneCutView } from "./plane-cut-view.js";
import { PlaneCutWidget } from "./plane-cut-widget.js";
import type { PlaneReferenceSource } from "./plane-interior-pick.js";
import { planeKey } from "./plane-reference-candidates.js";

export class PlaneCutFeedback {
  readonly widget: PlaneCutWidget;
  private view: PlaneCutView;
  private source: Pick<PlaneCut, "mode" | "targets"> | null = null;
  private cutter: Pick<PlaneCut, "frame" | "surface"> | null = null;
  private reference: PlaneReferenceSource | null = null;
  private status = "";
  private valid = false;
  private inputs = document.createElement("div");
  constructor(
    private editor: SketchEditor,
    overlay: HTMLElement,
    private entities: EntityViewer,
    accept: () => void,
    cancel: () => void,
  ) {
    this.widget = new PlaneCutWidget(overlay, accept, cancel);
    this.view = new PlaneCutView(editor);
    this.inputs.className = "plane-cut-inputs";
    editor.world.changed.add(this.update);
  }
  begin(source: Pick<PlaneCut, "mode" | "targets">): void {
    this.source = source;
    this.entities.operationRows.append(this.inputs);
    this.entities.sourcePicker = {
      hover: () => {},
      selected: (target) =>
        target.kind === "body" && source.targets.some((t) => t.body === target.body),
      role: (target) =>
        target.kind !== "body"
          ? undefined
          : source.targets.some((t) => t.body === target.body)
            ? "target"
            : this.reference?.kind === "face" && this.reference.body === target.body
              ? "tool"
              : undefined,
    };
    const bodies = this.editor.store.data.bodies ?? [];
    this.view.showTargets(
      source.targets.flatMap((target) => {
        const body = bodies.find((body) => body.id === target.body);
        return body ? [{ body, faces: target.faces }] : [];
      }),
    );
    this.show(null, null, null);
  }
  show(
    cutter: Pick<PlaneCut, "frame" | "surface"> | null,
    reference: PlaneReferenceSource | null,
    candidate: DisplayDocument | null,
  ): void {
    this.cutter = cutter;
    this.reference = reference ?? (cutter?.surface ? { kind: "face", ...cutter.surface } : null);
    this.valid = !!candidate;
    const edges = candidate ? planeCutEdges(candidate, this.editor.store.cutEdges) : [];
    this.showCutter();
    this.view.showEdges(edges);
    const count =
      candidate?.bodies?.filter(
        (body) =>
          !this.editor.store.data.bodies?.some(
            (original) =>
              original.id === body.id && !this.source?.targets.some((t) => t.body === original.id),
          ),
      ).length ?? 0;
    this.status = candidate
      ? `Preview · ${edges.length} section edges highlighted${this.source?.mode === "split" ? ` · ${count} result bodies` : ""}`
      : cutter
        ? "This cutter has no valid preview · Pick another reference"
        : "Pick an outlined plane or face";
    this.update();
  }
  private showCutter(): void {
    const surface = this.cutter?.surface;
    const body = this.editor.store.data.bodies?.find((b) => b.id === surface?.body);
    const face = body?.faces.find((f) => f.id === surface?.face);
    this.view.showCutter(this.cutter?.frame ?? null, body && face ? { body, face } : undefined);
  }
  private name(id: string, kind: "Body" | "Plane"): string {
    const data = this.editor.store.data;
    const ids =
      kind === "Body" ? data.bodies?.map((b) => b.id) : data.constructionPlanes?.map((p) => p.id);
    return entityRows(data, ids ?? [], kind).find((row) => row.id === id)?.name ?? kind;
  }
  private cutterName(): string {
    if (this.reference?.kind === "world-plane") return `${this.reference.id} world plane`;
    if (this.reference?.kind === "plane") return this.name(this.reference.id, "Plane");
    if (this.reference?.kind === "face") {
      const ref = this.reference;
      const face = this.editor.store.data.bodies
        ?.find((b) => b.id === ref.body)
        ?.faces.find((f) => f.id === ref.face);
      return `${this.name(ref.body, "Body")} · ${face?.plane ? "planar" : "curved"} face`;
    }
    const frame = this.cutter?.frame;
    if (!frame) return "Choose a reference";
    const saved = this.editor.store.data.constructionPlanes?.find(
      (p) => planeKey(p.frame) === planeKey(frame),
    );
    if (saved) return this.name(saved.id, "Plane");
    const world = Object.entries(planes).find(
      ([, worldFrame]) => planeKey(worldFrame) === planeKey(frame),
    );
    return world ? `${world[0]} world plane` : "Planar face";
  }
  private update = (): void => {
    if (!this.source) return;
    const busy = this.editor.blocked;
    const title = this.source.mode === "split" ? "Split Body" : "Imprint";
    const status = busy ? "Calculating preview…" : this.status;
    this.inputs.replaceChildren();
    const heading = document.createElement("h3");
    heading.textContent = title;
    this.inputs.append(heading);
    for (const [role, text] of [
      ...this.source.targets.map((target) => [
        "target",
        `Target · ${this.name(target.body, "Body")}${target.faces ? ` · ${target.faces.length} faces` : ""}`,
      ]),
      ["tool", `Cutter · ${this.cutterName()}`],
      ["result", status],
    ]) {
      const row = document.createElement("p");
      row.dataset.role = role;
      row.textContent = text;
      this.inputs.append(row);
    }
    for (const button of this.entities.referenceRows.querySelectorAll<HTMLElement>(
      "[data-plane]",
    )) {
      const row = button.closest<HTMLElement>(".entity-row");
      if (row)
        row.dataset.booleanRole =
          this.reference?.kind === "plane" && this.reference.id === button.dataset.plane
            ? "tool"
            : "";
    }
    const bodies =
      this.editor.store.data.bodies?.filter((b) =>
        this.source?.targets.some((t) => t.body === b.id),
      ) ?? [];
    const top = Math.min(
      ...bodies.flatMap((body) => {
        const [x0, y0, z0, x1, y1, z1] = body.bounds;
        return [x0, x1].flatMap((x) =>
          [y0, y1].flatMap((y) => [z0, z1].map((z) => this.editor.world.project([x, y, z]).y)),
        );
      }),
    );
    const center = this.editor.world.project(bodyCenter(bodies));
    this.showCutter();
    this.widget.update(title, status, busy, this.valid, { x: center.x, y: top });
    this.view.resize();
  };
  clear(): void {
    this.source = null;
    this.cutter = null;
    this.reference = null;
    this.entities.sourcePicker = null;
    this.inputs.remove();
    this.widget.root.hidden = true;
    this.view.clear();
    for (const row of this.entities.referenceRows.querySelectorAll<HTMLElement>(
      "[data-boolean-role]",
    ))
      row.dataset.booleanRole = "";
  }
  dispose(): void {
    this.clear();
    this.editor.world.changed.delete(this.update);
    this.widget.dispose();
    this.view.dispose();
  }
}
