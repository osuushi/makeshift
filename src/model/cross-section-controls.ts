import * as THREE from "three";
import type { InteractionLease } from "../sketch/active-interaction.js";
import type { SketchEditor } from "../sketch/editor.js";
import { onModelKeydown } from "../sketch/model-keys.js";
import type { PlaneFrame } from "../sketch/planes.js";
import { flipSectionFrame, sectionClip } from "../sketch/view-clipping.js";
import { idleReason, toolCatalog } from "../tools/catalog.js";
import { CrossSectionPlaneView } from "./cross-section-plane-view.js";
import { PlanePlacement } from "./plane-placement.js";
import type { PlaneReferencePicker } from "./plane-reference-picker.js";
import "./cross-section.css";

/** View-only placement. The source plane is copied, never moved or linked. */
export class CrossSectionControls {
  private lease: InteractionLease | null = null;
  private previous: PlaneFrame | null = null;
  private valid = true;
  private placement: PlanePlacement;
  private view: CrossSectionPlaneView;
  private root = document.createElement("div");
  private buttons = new Map<string, HTMLButtonElement>();
  private abort = new AbortController();
  private disposeTool: () => void;
  constructor(
    private editor: SketchEditor,
    overlay: HTMLElement,
    private picker: PlaneReferencePicker,
    private selectedPlane: () => PlaneFrame | undefined,
  ) {
    this.disposeTool = toolCatalog(editor).register({
      id: "cross-section",
      finishEdit: () => !this.lease,
      label: "Cross section",
      category: "View",
      aliases: ["section view", "clipping plane", "cutaway"],
      description: "Inspect inside with a movable, rotatable plane and flip the visible side",
      reason: () =>
        editor.world.active ? "Return to Modeling first" : this.lease ? null : idleReason(editor),
      run: () => (this.lease ? this.finish() : this.begin()),
    });
    this.root.className = "cross-section-actions";
    this.root.setAttribute("aria-label", "Cross section controls");
    const label = document.createElement("span");
    label.textContent = "Cross section";
    this.root.append(label);
    this.addButton("Adjust section", () => this.begin());
    this.addButton("Choose section plane", () => this.choose());
    this.addButton("Flip side", () => this.flip());
    this.addButton("Done", () => void this.finish());
    this.addButton("Cancel", () => this.cancel());
    this.addButton("Turn off section", () => this.off());
    const flip = this.buttons.get("Flip side");
    if (flip) flip.title = "Reverse the cut 180° without moving the plane";
    overlay.append(this.root);
    this.view = new CrossSectionPlaneView(editor);
    this.placement = new PlanePlacement(
      editor,
      overlay,
      () =>
        this.lease && editor.world.crossSection
          ? { frame: editor.world.crossSection, lease: this.lease }
          : null,
      (frame) => {
        this.valid = !!frame;
        if (frame) {
          editor.world.crossSection = frame;
          editor.message = "";
        }
        editor.refresh();
      },
    );
    onModelKeydown(
      (event) => {
        if (!this.lease || !["Enter", "Escape"].includes(event.key)) return;
        if (
          event.key === "Enter" &&
          event.target instanceof HTMLButtonElement &&
          this.root.contains(event.target)
        ) {
          event.preventDefault();
          event.stopImmediatePropagation();
          event.target.click();
          return;
        }
        event.preventDefault();
        event.stopImmediatePropagation();
        if (event.key === "Escape") this.cancel();
        else void this.finish();
      },
      { capture: true, signal: this.abort.signal },
    );
    editor.world.changed.add(this.update);
    this.update();
  }
  private addButton(label: string, run: () => void): void {
    const button = document.createElement("button");
    button.textContent = label;
    button.onclick = () => {
      if (button.disabled) return;
      if (this.lease) run();
      else void toolCatalog(this.editor).activate({ reason: () => null, run });
    };
    this.root.append(button);
    this.buttons.set(label, button);
  }
  private reference(): PlaneFrame | null {
    const e = this.editor,
      targets = e.modeling.targets;
    const target = targets.length === 1 ? targets[0] : undefined;
    return (
      this.selectedPlane() ??
      (target?.kind === "face"
        ? e.store.data.bodies
            ?.find((b) => b.id === target.body)
            ?.faces.find((f) => f.id === target.face)?.plane
        : null) ??
      null
    );
  }
  private begin(): void {
    const e = this.editor;
    if (e.blocked || e.interactions.current || e.world.active) return;
    this.previous = structuredClone(e.world.crossSection);
    const frame = e.world.crossSection ?? this.reference();
    this.lease = e.interactions.acquire(
      "cross-section",
      () => this.cancel(),
      () => this.finish(),
      { navigation: "when-released" },
    );
    if (!this.lease) return;
    this.valid = true;
    this.placement.reset();
    if (frame) this.place(structuredClone(frame), !e.world.crossSection);
    else this.choose();
    this.lease.trackHistory(
      this.placement.root,
      () => e.world.crossSection,
      (saved) => {
        if (saved) this.place(saved, false);
        else this.choose();
      },
    );
  }
  private choose(): void {
    if (!this.lease) return;
    this.editor.world.crossSection = null;
    this.placement.reset();
    this.picker.start((frame) => this.place(frame));
    this.lease.history?.checkpoint();
    this.editor.notice = "Cross section · Pick a world plane, saved plane or planar face";
    this.editor.refresh();
  }
  private place(frame: PlaneFrame, orient = true): void {
    const cameraSide = this.editor.world.camera.position
      .clone()
      .sub(new THREE.Vector3(...frame.origin));
    if (orient && sectionClip(frame).normal.dot(cameraSide) > 0) frame = flipSectionFrame(frame);
    this.picker.stop();
    this.placement.reset();
    this.valid = true;
    this.editor.world.crossSection = frame;
    this.editor.notice =
      "Cross section · Move or rotate the plane · Flip side reverses the cut · Enter keeps view";
    this.editor.refresh();
  }
  private flip(): void {
    const frame = this.editor.world.crossSection;
    if (!frame || !this.valid) return;
    this.placement.reset();
    this.editor.world.crossSection = flipSectionFrame(frame);
    this.lease?.history?.checkpoint();
    this.editor.refresh();
  }
  private async finish(): Promise<boolean> {
    if (!this.valid) return false;
    if (!this.editor.world.crossSection) this.editor.world.crossSection = this.previous;
    this.end();
    return true;
  }
  private cancel(): void {
    if (!this.lease) return;
    this.editor.world.crossSection = this.previous;
    this.end();
  }
  private off(): void {
    this.editor.world.crossSection = null;
    this.end();
  }
  private end(): void {
    const lease = this.lease;
    this.lease = null;
    this.previous = null;
    this.valid = true;
    if (lease) this.picker.stop();
    this.placement.reset();
    this.editor.notice = "";
    this.editor.message = "";
    lease?.release();
    this.editor.refresh();
  }
  private update = (): void => {
    const e = this.editor,
      editing = !!this.lease,
      frame = e.world.crossSection;
    this.root.hidden = !!e.world.active || (!editing && !frame);
    const blocked = editing
      ? e.blocked || e.interactions.dragging
      : !!toolCatalog(e).reason({ reason: () => null });
    for (const [name, button] of this.buttons) {
      button.disabled = blocked;
      button.hidden = ["Done", "Cancel", "Choose section plane"].includes(name)
        ? !editing
        : name === "Adjust section"
          ? editing
          : !frame;
      if (name === "Done" || name === "Flip side") button.disabled ||= !this.valid;
    }
    this.placement.update();
    this.view.update(editing && !e.world.active ? frame : null);
  };
  dispose(): void {
    this.cancel();
    this.abort.abort();
    this.editor.world.changed.delete(this.update);
    this.placement.dispose();
    this.view.dispose();
    this.disposeTool();
    this.root.remove();
  }
}
