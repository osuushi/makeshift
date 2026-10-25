import "../preferences/panel-placement.css";
import { inspectorIcon } from "./inspector-icons.js";
import {
  InspectorPlacement,
  readInspectorLayout,
  saveInspectorLayout,
} from "./inspector-layout.js";
import "./inspector.css";

const titles = ["Constraints", "Measurements", "Gear groups", "Decorators"] as const;
type Title = (typeof titles)[number];

/** Hosts existing controls without taking ownership of selection or document edits. */
export class Inspector {
  private root = document.createElement("aside");
  private body = document.createElement("div");
  private layout = readInspectorLayout();
  private placement: InspectorPlacement;
  private observer: MutationObserver;
  private sections = new Map<
    Title,
    { root: HTMLElement; content: HTMLElement; toggle: HTMLButtonElement }
  >();
  constructor(app: HTMLElement) {
    this.root.className = "selection-readouts inspector";
    this.root.setAttribute("aria-label", "Inspector");
    const bar = document.createElement("div");
    bar.className = "inspector-bar";
    const move = this.button("Move Inspector", "");
    move.className = "parameter-panel-grip inspector-move";
    move.title = "Drag to move; arrow keys move, Shift + arrows resize";
    const collapse = this.button("Collapse Inspector", "");
    collapse.className = "inspector-collapse";
    collapse.append(inspectorIcon("chevron"));
    const reset = this.button("Reset Inspector layout", "");
    reset.append(inspectorIcon("reset"));
    const title = document.createElement("strong");
    title.textContent = "Inspector";
    this.body.className = "inspector-body";
    bar.append(title, reset, collapse);
    this.root.append(move, bar, this.body);
    app.append(this.root);
    const updateCollapse = () => {
      this.root.classList.toggle("collapsed", !!this.layout.collapsed);
      if (this.layout.collapsed) this.root.style.height = "auto";
      collapse.setAttribute(
        "aria-label",
        this.layout.collapsed ? "Expand Inspector" : "Collapse Inspector",
      );
      collapse.setAttribute("aria-expanded", String(!this.layout.collapsed));
      this.body.hidden = !!this.layout.collapsed;
    };
    collapse.onclick = () => {
      this.layout.collapsed = !this.layout.collapsed;
      updateCollapse();
      this.save();
    };
    for (const title of titles) this.add(title);
    this.reorder();
    updateCollapse();
    this.placement = new InspectorPlacement(this.root, app, this.layout, move);
    reset.onclick = () => {
      for (const key of Object.keys(this.layout))
        delete this.layout[key as keyof typeof this.layout];
      for (const section of this.sections.values()) this.expand(section, true);
      updateCollapse();
      this.reorder();
      this.save();
    };
    this.observer = new MutationObserver(() => this.update());
    for (const section of this.sections.values())
      this.observer.observe(section.content, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["hidden"],
      });
    this.update();
  }
  content(title: Title): HTMLElement {
    const section = this.sections.get(title);
    if (!section) throw new Error(`Missing Inspector section ${title}`);
    return section.content;
  }
  private button(label: string, text: string): HTMLButtonElement {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = text;
    button.setAttribute("aria-label", label);
    button.title = label;
    return button;
  }
  private add(title: Title): void {
    const root = document.createElement("section"),
      content = document.createElement("div");
    root.className = "inspector-section";
    root.dataset.section = title;
    const bar = document.createElement("div");
    bar.className = "inspector-section-bar";
    const toggle = this.button(title, title);
    toggle.className = "inspector-section-toggle";
    toggle.prepend(inspectorIcon("chevron"));
    const section = { root, content, toggle };
    this.sections.set(title, section);
    this.expand(section, !this.layout.closed?.includes(title));
    toggle.onclick = () => {
      this.expand(section, !!content.hidden);
      this.layout.closed = [...this.sections]
        .filter(([, value]) => value.content.hidden)
        .map(([name]) => name);
      this.save();
    };
    bar.append(toggle);
    for (const direction of [-1, 1]) {
      const name = direction === -1 ? "up" : "down";
      const button = this.button(`Move ${title} ${name}`, "");
      button.append(inspectorIcon(name));
      button.onclick = () => {
        const items = [...this.body.children] as HTMLElement[];
        const visible = items.filter((item) => !item.hidden);
        const target = visible[visible.indexOf(root) + direction];
        if (!target) return;
        if (direction < 0) this.body.insertBefore(root, target);
        else this.body.insertBefore(root, target.nextSibling);
        this.layout.order = [...this.body.children].map(
          (item) => (item as HTMLElement).dataset.section ?? "",
        );
        this.save();
      };
      bar.append(button);
    }
    root.append(bar, content);
    this.body.append(root);
  }
  private expand(
    section: { content: HTMLElement; toggle: HTMLButtonElement },
    open: boolean,
  ): void {
    section.content.hidden = !open;
    section.toggle.setAttribute("aria-expanded", String(open));
  }
  private reorder(): void {
    for (const title of new Set([...(this.layout.order ?? []), ...titles])) {
      const section = this.sections.get(title as Title);
      if (section) this.body.append(section.root);
    }
  }
  private update(): void {
    for (const section of this.sections.values())
      section.root.hidden = ![...section.content.children].some(
        (child) => !(child as HTMLElement).hidden,
      );
    this.root.hidden = [...this.sections.values()].every((section) => section.root.hidden);
    this.placement.schedule();
  }
  private save(): void {
    saveInspectorLayout(this.layout);
    this.placement.schedule();
  }
  dispose(): void {
    this.observer.disconnect();
    this.placement.dispose();
    this.root.remove();
  }
}
