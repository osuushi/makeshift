import type { SmartObjectSource } from "../model/smart-object.js";
import { placeFloatingPanel } from "../preferences/panel-placement.js";

function sourceOptions(benches: readonly SmartObjectSource[]) {
  const field = document.createElement("fieldset");
  field.className = "smart-object-sources";
  const legend = document.createElement("legend");
  legend.textContent = "Source bench";
  const list = document.createElement("div");
  list.className = "smart-object-source-list";
  const first = benches.find(({ wouldCycle }) => !wouldCycle);
  const tooltip = document.createElement("p");
  tooltip.id = "smart-object-source-cycle";
  tooltip.className = "smart-object-source-tooltip";
  tooltip.setAttribute("role", "tooltip");
  tooltip.textContent = first
    ? "This source already links to the bench you’re editing. Placing it would create a circular link."
    : "Placing any of these sources would create a circular link back to the bench you’re editing.";
  for (const { id, name, wouldCycle } of benches) {
    const row = document.createElement("label");
    const input = document.createElement("input");
    input.type = "radio";
    input.name = "source";
    input.value = id;
    input.checked = id === first?.id;
    input.autofocus = input.checked;
    input.disabled = wouldCycle;
    const caption = document.createElement("span");
    caption.textContent = name;
    row.append(input, caption);
    if (wouldCycle) {
      row.className = "smart-object-source-blocked";
      row.tabIndex = 0;
      row.setAttribute("aria-describedby", tooltip.id);
      input.setAttribute("aria-describedby", tooltip.id);
      row.onclick = (event) => {
        event.preventDefault();
        row.focus();
      };
    }
    list.append(row);
  }
  field.append(legend, list, tooltip);
  return { field, hasChoice: !!first };
}

export function selectSource(
  benches: readonly SmartObjectSource[],
  viewport: HTMLElement,
): Promise<string | null> {
  const dialog = document.createElement("dialog");
  dialog.className = "smart-object-dialog";
  const heading = document.createElement("h2");
  heading.id = "place-smart-object-title";
  heading.textContent = "Place smart object";
  dialog.setAttribute("aria-labelledby", heading.id);
  const { field, hasChoice } = sourceOptions(benches);
  const form = document.createElement("form");
  const actions = document.createElement("footer");
  const cancel = document.createElement("button");
  cancel.type = "button";
  cancel.textContent = "Cancel";
  cancel.autofocus = !hasChoice;
  const place = document.createElement("button");
  place.type = "submit";
  place.disabled = !hasChoice;
  place.textContent = "Place";
  actions.append(cancel, place);
  form.append(field, actions);
  dialog.append(heading, form);
  return new Promise((resolve) => {
    const position = () => {
      const bounds = viewport.getBoundingClientRect();
      const { offsetWidth: width, offsetHeight: height } = dialog;
      const left = bounds.left + (bounds.width - width) / 2;
      const top = bounds.top + (bounds.height - height) / 2;
      dialog.style.left = `${Math.max(24, Math.min(left, innerWidth - width - 24))}px`;
      dialog.style.top = `${Math.max(80, Math.min(top, innerHeight - height - 24))}px`;
      placeFloatingPanel(dialog);
    };
    const resize = new ResizeObserver(position);
    const finish = (result: string | null) => {
      resize.disconnect();
      dialog.close();
      dialog.remove();
      resolve(result);
    };
    cancel.onclick = () => finish(null);
    dialog.oncancel = (event) => {
      event.preventDefault();
      finish(null);
    };
    form.onsubmit = (event) => {
      event.preventDefault();
      const source = new FormData(form).get("source");
      if (typeof source === "string" && source) finish(source);
    };
    document.body.append(dialog);
    dialog.showModal();
    position();
    resize.observe(viewport);
  });
}
