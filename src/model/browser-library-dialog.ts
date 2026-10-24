import "./browser-library.css";
import { type BrowserDrawing, browserLibrary } from "./browser-library.js";

function dialog(title: string): HTMLDialogElement {
  const root = document.createElement("dialog");
  root.className = "browser-library";
  root.setAttribute("aria-label", title);
  const heading = document.createElement("h2");
  heading.textContent = title;
  root.append(heading);
  document.body.append(root);
  return root;
}

export function drawingName(current: string): Promise<string | null> {
  return new Promise((resolve) => {
    const root = dialog("Save drawing");
    const form = document.createElement("form");
    const label = document.createElement("label");
    label.textContent = "Name";
    const input = document.createElement("input");
    input.value = current.replace(/\.makeshift$/i, "");
    input.required = true;
    input.maxLength = 160;
    label.append(input);
    const save = document.createElement("button");
    save.textContent = "Save";
    const cancel = document.createElement("button");
    cancel.textContent = "Cancel";
    cancel.type = "button";
    const finish = (name: string | null) => {
      root.close();
      root.remove();
      resolve(name);
    };
    form.onsubmit = (event) => {
      event.preventDefault();
      if (input.value.trim())
        finish(`${input.value.trim().replace(/\.makeshift$/i, "")}.makeshift`);
    };
    cancel.onclick = () => finish(null);
    root.oncancel = (event) => {
      event.preventDefault();
      finish(null);
    };
    form.append(label, save, cancel);
    root.append(form);
    root.showModal();
    input.select();
  });
}

export function chooseDrawing(): Promise<BrowserDrawing | "import" | null> {
  return new Promise((resolve) => {
    const root = dialog("Open drawing");
    const hint = document.createElement("p");
    hint.textContent =
      "Saved in this browser. Download a copy to keep a backup or use another device. Clearing site data removes these drawings.";
    const list = document.createElement("div");
    list.className = "browser-drawings";
    list.textContent = "Loading drawings…";
    const finish = (value: BrowserDrawing | "import" | null) => {
      root.close();
      root.remove();
      resolve(value);
    };
    const upload = document.createElement("button");
    upload.textContent = "Import file…";
    upload.onclick = () => finish("import");
    const cancel = document.createElement("button");
    cancel.textContent = "Cancel";
    cancel.onclick = () => finish(null);
    root.oncancel = (event) => {
      event.preventDefault();
      finish(null);
    };
    root.append(hint, list, upload, cancel);
    root.showModal();
    void browserLibrary.list().then(
      (entries) => {
        list.textContent = entries.length ? "" : "No saved drawings yet.";
        for (const entry of entries) {
          const button = document.createElement("button");
          button.textContent = `${entry.name.replace(/\.makeshift$/i, "")} · ${new Date(entry.modified).toLocaleString()}`;
          button.onclick = () => finish(entry);
          list.append(button);
        }
      },
      (error: unknown) => {
        list.textContent = `Could not load drawings: ${String(error)}`;
      },
    );
  });
}
