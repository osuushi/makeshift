import type { SketchEditor } from "../sketch/editor.js";
import { toolCatalog } from "../tools/catalog.js";
import { defaultBodyAppearance } from "./body-appearance.js";
import { openBodyAppearance } from "./body-appearance-control.js";
import { toggleBodyXray } from "./body-xray-controls.js";
import "../sketch/control-menu.css";
import "./body-menu.css";

/** Row-local actions leave selection alone and borrow the existing view/edit owners. */
export function bodyMenu(
  editor: SketchEditor,
  id: string,
  name: string,
  refreshRows: (() => void)[],
): HTMLElement {
  const root = document.createElement("div");
  root.className = "body-menu-control";
  const trigger = document.createElement("button");
  trigger.className = "body-menu-trigger";
  trigger.setAttribute("aria-label", `Actions for ${name}`);
  trigger.title = `Actions for ${name}`;
  trigger.setAttribute("aria-haspopup", "menu");
  trigger.setAttribute("aria-expanded", "false");
  trigger.innerHTML = `<svg width="18" height="18" viewBox="0 0 18 18" fill="currentColor" aria-hidden="true"><circle cx="3" cy="9" r="1.5"/><circle cx="9" cy="9" r="1.5"/><circle cx="15" cy="9" r="1.5"/></svg>`;
  const menu = document.createElement("div");
  menu.className = "control-menu body-menu";
  menu.popover = "auto";
  menu.id = `body-menu-${id}`;
  menu.setAttribute("role", "menu");
  menu.setAttribute("aria-label", `Actions for ${name}`);
  trigger.setAttribute("aria-controls", menu.id);
  const close = () => {
    menu.hidePopover();
    trigger.focus({ preventScroll: true });
  };
  const action = (label: string, run: () => void) => {
    const button = document.createElement("button");
    button.textContent = label;
    button.setAttribute("role", "menuitem");
    button.onclick = () => {
      close();
      void toolCatalog(editor).activate({
        reason: () => null,
        run: () => {
          if (editor.store.data.bodies?.some((body) => body.id === id)) run();
        },
      });
    };
    menu.append(button);
    return button;
  };
  const color = action("Color", () => openBodyAppearance(editor, id, name, trigger));
  const chip = document.createElement("span");
  chip.className = "body-menu-swatch";
  chip.setAttribute("aria-hidden", "true");
  color.append(chip);
  const xray = action("X-ray", () => toggleBodyXray(editor, [id]));
  xray.setAttribute("role", "menuitemcheckbox");
  menu.append(document.createElement("hr"));
  const isolate = action("Isolate", () => {
    editor.bodiesVisible = true;
    editor.visibility.isolate([id]);
    editor.modeling.hover = null;
    editor.refresh();
  });
  const actions = [color, xray, isolate];
  installMenuInput(trigger, menu, actions, close);
  refreshRows.push(() => {
    const disabled = !!toolCatalog(editor).reason({ reason: () => null });
    trigger.disabled = disabled;
    for (const action of actions) action.disabled = disabled;
    const appearance =
      editor.store.data.bodyAppearances?.find((a) => a.body === id) ?? defaultBodyAppearance;
    chip.style.backgroundColor = appearance.color;
    chip.style.opacity = String(appearance.alpha);
    xray.setAttribute("aria-checked", String(editor.visibility.xray.has(id)));
    if (menu.matches(":popover-open")) positionMenu(trigger, menu);
  });
  root.append(trigger, menu);
  return root;
}

function positionMenu(trigger: HTMLElement, menu: HTMLElement): void {
  const bounds = trigger.getBoundingClientRect();
  const panel = trigger.closest(".entity-viewer")?.getBoundingClientRect();
  if (panel && (bounds.bottom <= panel.top || bounds.top >= panel.bottom)) {
    menu.hidePopover();
    return;
  }
  menu.style.left = `${Math.max(8, Math.min(bounds.right - menu.offsetWidth, window.innerWidth - menu.offsetWidth - 8))}px`;
  menu.style.top = `${Math.max(8, Math.min(bounds.bottom + 4, window.innerHeight - menu.offsetHeight - 8))}px`;
}

function installMenuInput(
  trigger: HTMLButtonElement,
  menu: HTMLElement,
  actions: HTMLButtonElement[],
  close: () => void,
): void {
  const open = (last = false) => {
    menu.showPopover();
    trigger.setAttribute("aria-expanded", "true");
    positionMenu(trigger, menu);
    (last ? actions.at(-1) : actions[0])?.focus({ preventScroll: true });
  };
  trigger.onclick = () => (menu.matches(":popover-open") ? close() : open());
  trigger.onkeydown = (event) => {
    if (!["ArrowDown", "ArrowUp"].includes(event.key)) return;
    event.preventDefault();
    event.stopPropagation();
    open(event.key === "ArrowUp");
  };
  menu.ontoggle = () =>
    trigger.setAttribute("aria-expanded", String(menu.matches(":popover-open")));
  menu.onkeydown = (event) => {
    event.stopPropagation();
    if (event.key === "Tab") return close();
    if (event.key === "Escape") {
      event.preventDefault();
      close();
      return;
    }
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const index = actions.indexOf(document.activeElement as HTMLButtonElement);
    const next =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? actions.length - 1
          : (index + (event.key === "ArrowDown" ? 1 : -1) + actions.length) % actions.length;
    actions[next]?.focus();
  };
}
