/** One disclosure per entity, shared by named geometry groups and saved guide points. */
export class EntityChildren {
  private expanded = new Set<string>();
  private known = new Map<string, Set<string>>();
  wrap(row: HTMLElement, owner: string, rows: HTMLElement[]): HTMLElement {
    const ids = rows.map((child) => child.dataset.childId ?? "");
    if (ids.some((id) => !this.known.get(owner)?.has(id))) this.expanded.add(owner);
    this.known.set(owner, new Set(ids));
    if (!rows.length) return row;
    const wrapper = document.createElement("div"),
      children = document.createElement("div"),
      toggle = document.createElement("button");
    children.className = "tag-children";
    children.hidden = !this.expanded.has(owner);
    toggle.className = "tag-disclosure";
    toggle.setAttribute(
      "aria-label",
      rows.some((child) => child.querySelector(".guide-item"))
        ? "Toggle groups and guide points"
        : "Toggle tagged groups",
    );
    toggle.innerHTML =
      '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 3 5 5-5 5"/></svg>';
    const display = () => toggle.setAttribute("aria-expanded", String(!children.hidden));
    toggle.onclick = () => {
      children.hidden = !children.hidden;
      if (children.hidden) this.expanded.delete(owner);
      else this.expanded.add(owner);
      display();
    };
    display();
    row.prepend(toggle);
    children.append(...rows);
    wrapper.append(row, children);
    return wrapper;
  }
}
