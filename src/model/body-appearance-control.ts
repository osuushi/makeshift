import type { SketchEditor } from "../sketch/editor.js";
import { toolCatalog } from "../tools/catalog.js";
import { defaultBodyAppearance } from "./body-appearance.js";

export function bodyAppearanceControl(
  editor: SketchEditor,
  id: string,
  name: string,
  refreshRows: (() => void)[],
): HTMLButtonElement {
  const button = document.createElement("button");
  button.className = "body-color-swatch";
  button.setAttribute("aria-label", `Color for ${name}`);
  button.title = "Body color and opacity";
  const chip = document.createElement("span");
  button.append(chip);
  refreshRows.push(() => {
    const appearance =
      editor.store.data.bodyAppearances?.find((entry) => entry.body === id) ??
      defaultBodyAppearance;
    chip.style.backgroundColor = appearance.color;
    chip.style.opacity = String(appearance.alpha);
    button.disabled = !!toolCatalog(editor).reason({ reason: () => null });
  });
  button.onclick = () =>
    void toolCatalog(editor).activate({
      reason: () => null,
      run: () => {
        if (editor.store.data.bodies?.some((body) => body.id === id))
          openAppearance(editor, id, name, button);
      },
    });
  return button;
}

function openAppearance(
  editor: SketchEditor,
  id: string,
  name: string,
  button: HTMLButtonElement,
): void {
  if (editor.blocked || editor.interactions.current) return;
  const appearance =
    editor.store.data.bodyAppearances?.find((entry) => entry.body === id) ?? defaultBodyAppearance;
  const dialog = document.createElement("dialog");
  dialog.className = "body-color-dialog";
  dialog.setAttribute("aria-label", `Appearance of ${name}`);
  const form = document.createElement("form");
  const heading = document.createElement("h2");
  heading.textContent = name;
  const color = document.createElement("input");
  color.type = "color";
  color.value = appearance.color;
  const alpha = document.createElement("input");
  alpha.type = "number";
  alpha.min = "0";
  alpha.max = "100";
  alpha.step = "1";
  alpha.required = true;
  alpha.value = String(Math.round(appearance.alpha * 100));
  for (const [text, input] of [
    ["Color", color],
    ["Opacity (%)", alpha],
  ] as const) {
    const label = document.createElement("label");
    label.append(text, input);
    form.append(label);
  }
  const apply = document.createElement("button");
  apply.type = "submit";
  apply.textContent = "Apply";
  const cancel = document.createElement("button");
  cancel.type = "button";
  cancel.textContent = "Cancel";
  cancel.onclick = () => dialog.close();
  dialog.onclose = () => {
    dialog.remove();
    button.focus();
  };
  dialog.onkeydown = (event) => event.stopPropagation();
  form.onsubmit = async (event) => {
    event.preventDefault();
    if (editor.blocked || editor.interactions.current || !form.reportValidity()) return;
    apply.disabled = cancel.disabled = color.disabled = alpha.disabled = true;
    dialog.setAttribute("aria-busy", "true");
    apply.textContent = "Applying…";
    await editor.store.request({
      kind: "body-appearance",
      appearance: {
        body: id,
        color: color.value,
        alpha: alpha.valueAsNumber / 100,
      },
    });
    dialog.close();
    editor.refresh();
  };
  form.prepend(heading);
  form.append(cancel, apply);
  dialog.append(form);
  document.body.append(dialog);
  dialog.showModal();
}
