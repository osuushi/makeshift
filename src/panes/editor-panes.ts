import { DecoratorSelectionWidget } from "../decorators/selection-widget.js";
import type { SketchEditor } from "../sketch/editor.js";
import { installToolSurfaces } from "../tools/surfaces.js";
import { WorkspacePanes } from "./workspace.js";
import "../tools/inspector.css";
import "./editor-panes.css";

const sections = ["Measurements", "Decorators", "Gear groups", "Constraints"] as const;
type Section = (typeof sections)[number];

/** Slots for long-lived editor controls. The controls retain selection and model ownership. */
export class EditorPanes extends WorkspacePanes {
  readonly entities = this.slot("Entities", "left", 282);
  readonly tools = this.slot("Tools", "left", 358);
  readonly status = this.register({
    id: "Status",
    title: "Status",
    place: "left",
    height: 38,
    fitContent: true,
  }).body;
  private orientation = this.slot("Orientation", "right", 176);
  private sections = new Map<Section, HTMLElement>();
  private observers: (MutationObserver | ResizeObserver)[] = [];
  constructor(app: HTMLElement) {
    super(app);
    for (const title of sections) {
      const pane = this.register({
        id: title,
        title,
        place: "right",
        height: title === "Measurements" ? 84 : 208,
        autoHide: title !== "Measurements",
      });
      this.sections.set(title, pane.body);
      const update = () =>
        pane.setEmpty(!Array.from(pane.body.children).some((el) => !(el as HTMLElement).hidden));
      const observer = new MutationObserver(update);
      observer.observe(pane.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["hidden"],
      });
      this.observers.push(observer);
      update();
    }
  }
  private slot(title: string, place: "left" | "right", height: number) {
    return this.register({ id: title, title, place, height }).body;
  }
  mountControls(editor: SketchEditor, entities: HTMLElement, status: HTMLElement) {
    this.entities.append(entities);
    this.status.append(status);
    this.mountOrientation();
    const disposeTools = installToolSurfaces(editor, this.app, this.tools);
    const widget = new DecoratorSelectionWidget(editor, editor.world.overlay, () =>
      queueMicrotask(() => this.reveal("Decorators")),
    );
    return () => {
      widget.dispose();
      disposeTools();
    };
  }
  private mountOrientation() {
    const viewport = document.createElement("div");
    viewport.className = "cube-viewport";
    const cube = this.app.querySelector(".orientation-cube");
    if (cube) viewport.append(cube);
    this.orientation.append(
      viewport,
      ...this.app.querySelectorAll(".view-options-trigger,.exit-isolation"),
    );
    const pane = this.orientation.parentElement;
    if (!pane) return;
    const limit = new ResizeObserver(() => {
      if (!viewport.clientWidth) return;
      const chrome = pane.offsetHeight - viewport.offsetHeight;
      pane.style.maxHeight = `min(100%, ${chrome + viewport.clientWidth}px)`;
    });
    limit.observe(viewport);
    this.observers.push(limit);
  }
  content(section: Section) {
    const body = this.sections.get(section);
    if (!body) throw new Error(`Missing editor pane ${section}`);
    return body;
  }
  override dispose() {
    for (const observer of this.observers) observer.disconnect();
    super.dispose();
  }
}
