import { insertion, type Place, type Placement, placement, preference } from "./layout.js";
export interface PaneOptions {
  id: string;
  title: string;
  place: Place;
  height: number;
  width?: number;
  autoHide?: boolean;
  fitContent?: boolean;
  saved?: unknown;
  persist?: (state: Placement) => void;
  close?: () => void;
}
export function button(label: string, text: string) {
  const el = document.createElement("button");
  el.type = "button";
  el.title = label;
  el.setAttribute("aria-label", label);
  el.textContent = text;
  return el;
}
export function createPane(options: PaneOptions) {
  const root = document.createElement("section"),
    body = document.createElement("div"),
    bar = document.createElement("div");
  const title = button(options.title, options.title),
    menu = document.createElement("select"),
    grip = button(`Resize ${options.title}`, "");
  const state = placement(
    options.persist ? options.saved : preference(`item.${options.id}`, null),
    {
      place: options.place,
      width: options.width ?? 260,
      height: options.height,
      x: 24,
      y: 64,
      folded: false,
      hidden: false,
      autoHide: options.autoHide ?? false,
    },
  );
  root.className = "workspace-pane";
  root.dataset.pane = options.id;
  root.setAttribute("aria-label", `${options.title} pane`);
  bar.className = "pane-heading";
  body.className = "pane-content";
  title.className = "pane-title";
  grip.className = "pane-grip";
  menu.title = `${options.title} pane options`;
  menu.setAttribute("aria-label", menu.title);
  for (const [value, label] of [
    ["", "⋯"],
    ["left", "Dock left"],
    ["right", "Dock right"],
    ["floating", "Float"],
    ["hide", options.close ? "Close" : "Hide"],
    ...(options.autoHide !== undefined ? [["auto", "Toggle auto-hide when empty"]] : []),
  ])
    menu.add(new Option(label, value));
  bar.append(title, menu);
  root.append(bar, body, grip);
  return { root, body, bar, title, menu, grip, state, options, empty: false };
}
export type Pane = ReturnType<typeof createPane>;

export function populatePaneMenu(p: Pane, choices: HTMLOptionElement[]) {
  p.menu.querySelector("optgroup")?.remove();
  if (p.state.place === "floating") return;
  const group = document.createElement("optgroup");
  group.label = "Show in this dock";
  for (const option of choices) {
    option.value = `show/${option.value}`;
    group.append(option);
  }
  p.menu.append(group);
}

export function paintPane(p: Pane, app: HTMLElement) {
  const { root, state } = p,
    floating = state.place === "floating";
  root.hidden = state.hidden || (p.empty && state.autoHide);
  root.classList.toggle("floating", floating);
  root.classList.toggle("folded", state.folded);
  p.title.setAttribute("aria-expanded", String(!state.folded));
  if (p.menu.value === "") {
    const option = Array.from(p.menu.options).find((o) => o.value === "auto");
    if (option) option.text = state.autoHide ? "Keep visible when empty" : "Hide when empty";
  }
  const natural = !floating && p.options.fitContent && state.height === p.options.height;
  root.style.height = state.folded || natural ? "auto" : `${state.height}px`;
  if (floating) {
    const width = Math.min(app.clientWidth, Math.max(186, state.width));
    root.style.width = `${width}px`;
    root.style.left = `${Math.max(0, Math.min(app.clientWidth - width, state.x))}px`;
    root.style.top = `${Math.max(0, Math.min(app.clientHeight - root.offsetHeight, state.y))}px`;
  } else {
    root.style.width = root.style.left = root.style.top = "";
  }
  root.dataset.empty = String(p.empty);
  app.dispatchEvent(new Event("pane-layout"));
}

export function nextDockPane(p: Pane, items: Pane[], order: string[]) {
  const others = items.filter((q) => q !== p && !q.options.persist);
  const index = order.indexOf(p.options.id);
  let next = p.options.persist
    ? others[
        insertion(
          others.map((q) => q.options.id),
          p.state.before,
          p.state.after,
        )
      ]
    : others.find(
        (q) => index >= 0 && (order.indexOf(q.options.id) > index || !order.includes(q.options.id)),
      );
  if (p.options.persist) {
    const boundary = next ? items.indexOf(next) : items.length;
    let start = boundary;
    while (start > 0 && items[start - 1].options.persist) start--;
    next =
      items.slice(start, boundary).find((item) => (item.state.rank ?? 0) > (p.state.rank ?? 0)) ??
      next;
  }

  return next;
}
