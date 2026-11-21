import type { BenchTab } from "../model/benches.js";

export function selectSource(benches: readonly BenchTab[]): Promise<string | null> {
  const dialog = document.createElement("dialog");
  dialog.className = "smart-object-dialog";
  dialog.setAttribute("aria-label", "Insert bench");
  const heading = document.createElement("h2");
  heading.textContent = "Insert bench";
  const field = document.createElement("select");
  field.setAttribute("aria-label", "Source bench");
  for (const { id, name } of benches) field.add(new Option(name, id));
  const form = document.createElement("form");
  const actions = document.createElement("footer");
  const cancel = document.createElement("button");
  cancel.type = "button";
  cancel.textContent = "Cancel";
  const insert = document.createElement("button");
  insert.type = "submit";
  insert.textContent = "Insert linked bench";
  actions.append(cancel, insert);
  form.append(field, actions);
  dialog.append(heading, form);
  return new Promise((resolve) => {
    const finish = (result: string | null) => {
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
  });
}
