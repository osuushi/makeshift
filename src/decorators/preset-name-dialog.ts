import { checkedPresetName, type DecoratorPreset } from "./presets.js";
import "./preset-name-dialog.css";

/** Naming is a discrete action; the panel shows the selected name only once. */
export function presetNameDialog(
  title: "Save preset" | "Rename preset",
  current: string,
  presets: readonly DecoratorPreset[],
  exceptId: string | undefined,
  accept: (name: string) => Promise<string | undefined>,
): void {
  const root = document.createElement("dialog");
  root.className = "preset-name-dialog";
  root.setAttribute("aria-label", title);
  const heading = document.createElement("h2");
  heading.textContent = title;
  const form = document.createElement("form");
  const label = document.createElement("label");
  label.textContent = "Name";
  const input = document.createElement("input");
  input.value = current;
  input.required = true;
  input.maxLength = 200;
  input.enterKeyHint = "done";
  input.oninput = () => input.setCustomValidity("");
  label.append(input);
  const error = document.createElement("p");
  error.setAttribute("role", "status");
  const buttons = document.createElement("div");
  const cancel = document.createElement("button");
  cancel.type = "button";
  cancel.textContent = "Cancel";
  const submit = document.createElement("button");
  submit.textContent = title === "Save preset" ? "Save" : "Rename";
  let busy = false;
  const close = () => {
    root.close();
    root.remove();
  };
  cancel.onclick = close;
  root.oncancel = (event) => {
    event.preventDefault();
    if (!busy) close();
  };
  root.onkeydown = (event) => event.stopPropagation();
  form.onsubmit = async (event) => {
    event.preventDefault();
    if (busy) return;
    let name: string;
    try {
      name = checkedPresetName(presets, input.value, exceptId);
    } catch (reason) {
      input.setCustomValidity(reason instanceof Error ? reason.message : String(reason));
      input.reportValidity();
      return;
    }
    busy = input.disabled = cancel.disabled = submit.disabled = true;
    try {
      const message = await accept(name);
      if (!message) close();
      else error.textContent = message;
    } catch (reason) {
      error.textContent = reason instanceof Error ? reason.message : String(reason);
    } finally {
      busy = input.disabled = cancel.disabled = submit.disabled = false;
    }
  };
  buttons.append(cancel, submit);
  form.append(label, error, buttons);
  root.append(heading, form);
  document.body.append(root);
  root.showModal();
  input.focus();
  input.select();
}
