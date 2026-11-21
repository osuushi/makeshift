import type { BenchTab } from "../model/benches.js";
import { placeFloatingPanel } from "../preferences/panel-placement.js";

export function selectSource(
  benches: readonly BenchTab[],
  viewport: HTMLElement,
): Promise<string | null> {
  const dialog = document.createElement("dialog");
  dialog.className = "smart-object-dialog";
  const heading = document.createElement("h2");
  heading.id = "place-smart-object-title";
  heading.textContent = "Place smart object";
  dialog.setAttribute("aria-labelledby", heading.id);
  const label = document.createElement("label");
  label.htmlFor = "smart-object-source";
  label.textContent = "Source bench";
  const field = document.createElement("select");
  field.id = label.htmlFor;
  field.autofocus = true;
  for (const { id, name } of benches) field.add(new Option(name, id));
  const form = document.createElement("form");
  const actions = document.createElement("footer");
  const cancel = document.createElement("button");
  cancel.type = "button";
  cancel.textContent = "Cancel";
  const place = document.createElement("button");
  place.type = "submit";
  place.textContent = "Place";
  actions.append(cancel, place);
  form.append(label, field, actions);
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
      finish(field.value || null);
    };
    document.body.append(dialog);
    dialog.showModal();
    position();
    resize.observe(viewport);
  });
}
