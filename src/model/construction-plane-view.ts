import type { SketchEditor } from "../sketch/editor.js";
import type { PlaneFrame } from "../sketch/planes.js";
import { toolCatalog } from "../tools/catalog.js";
import type { ConstructionPlane } from "./construction-plane.js";
import { entityRows } from "./entity-presentation.js";
import { renameEntity } from "./entity-rename.js";
import { EntityReorder } from "./entity-reorder.js";
import { SavedPlaneView } from "./saved-plane-view.js";

export class ConstructionPlaneView {
  private patches: SavedPlaneView;
  private key = "";
  selected: string | null = null;
  private hovered: string | null = null;
  choosing = false;
  accepts: ((frame: PlaneFrame) => boolean) | undefined;
  constructor(
    private editor: SketchEditor,
    _overlay: HTMLElement,
    private rows: HTMLElement,
    private choose: (plane: ConstructionPlane) => void,
    private sketch: (plane: ConstructionPlane) => void,
  ) {
    this.patches = new SavedPlaneView(editor);
  }
  update(): void {
    this.patches.update(this.selected, this.hovered, this.accepts);
    const e = this.editor,
      planes = e.display.constructionPlanes ?? [];
    const key = JSON.stringify([
      planes,
      e.display.entityPresentation,
      this.choosing,
      planes.map((p) => !this.accepts || this.accepts(p.frame)),
      e.blocked,
      toolCatalog(e).switching,
      e.world.active,
      e.visibility.key,
      e.world.camera.matrixWorld.elements,
      e.world.height,
      e.world.canvas.clientWidth,
      e.world.canvas.clientHeight,
    ]);
    if (this.key === key) {
      this.selection();
      return;
    }
    this.key = key;
    this.rows.replaceChildren();
    const heading = document.createElement("h3");
    heading.textContent = `Planes (${planes.length})`;
    this.rows.append(heading);
    for (const row of entityRows(
      e.display,
      planes.map((p) => p.id),
      "Plane",
    )) {
      const plane = planes.find((p) => p.id === row.id);
      if (plane) this.add(plane, row.name);
    }
    this.selection();
  }
  hover(id: string | null): void {
    this.hovered = id;
    this.selection();
  }
  private selection(): void {
    this.patches.update(this.selected, this.hovered, this.accepts);
    for (const item of this.rows.querySelectorAll("[data-plane]"))
      item.setAttribute("aria-pressed", String(item.getAttribute("data-plane") === this.selected));
  }
  private add(plane: ConstructionPlane, name: string): void {
    const e = this.editor,
      visible = e.visibility.visible(plane.id),
      allowed = !this.accepts || this.accepts(plane.frame);
    const button = () => {
      const item = document.createElement("button");
      item.textContent = name;
      item.dataset.plane = plane.id;
      item.setAttribute("aria-label", `${this.choosing ? "Use" : "Select"} ${name}`);
      item.setAttribute("aria-pressed", String(this.selected === plane.id));
      item.disabled =
        (this.choosing ? e.blocked : !!toolCatalog(e).reason({ reason: () => null })) ||
        !visible ||
        !allowed;
      item.onclick = () => this.choose(plane);
      item.ondblclick = () => {
        if (!this.choosing) this.sketch(plane);
      };
      return item;
    };
    const row = document.createElement("div"),
      eye = document.createElement("button");
    row.className = "entity-row";
    eye.textContent = visible ? "◉" : "○";
    eye.setAttribute("aria-label", `${visible ? "Hide" : "Show"} ${name}`);
    eye.disabled = !!toolCatalog(e).reason({ reason: () => null });
    eye.onclick = () => {
      void toolCatalog(e).activate({
        reason: () => null,
        run: () => {
          if (!e.store.data.constructionPlanes?.some((p) => p.id === plane.id)) return;
          const visible = e.visibility.visible(plane.id);
          if (visible) e.visibility.hide(plane.id);
          else e.visibility.show(plane.id);
          if (visible && this.selected === plane.id) this.selected = null;
          e.refresh();
        },
      });
    };
    const labelButton = button();
    labelButton.ondblclick = () => renameEntity(e, labelButton, plane.id);
    new EntityReorder(e, row, labelButton, plane.id, "plane", () => this.choosing);
    row.append(labelButton, eye);
    this.rows.append(row);
  }
  dispose(): void {
    this.patches.dispose();
    this.rows.replaceChildren();
  }
}
