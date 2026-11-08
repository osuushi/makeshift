import type { BugFile } from "./protocol.js";
import "./style.css";

export function bugPanel(parent: HTMLElement, stop: () => void, cancel: () => void) {
  const panel = document.createElement("div");
  panel.className = "bug-report-panel";
  panel.hidden = true;
  const status = document.createElement("span");
  status.setAttribute("role", "status");
  const save = document.createElement("button");
  save.textContent = "Save report";
  save.onclick = stop;
  const discard = document.createElement("button");
  discard.textContent = "Cancel recording";
  discard.onclick = cancel;
  const file = document.createElement("button");
  file.className = "bug-report-file";
  file.draggable = true;
  file.setAttribute("aria-label", "Drag bug report");
  file.ondragstart = (event) => {
    event.preventDefault();
    window.makeshiftBug?.drag();
  };
  file.onclick = () => window.makeshiftBug?.reveal();
  const path = document.createElement("input");
  path.readOnly = true;
  path.setAttribute("aria-label", "Bug report path");
  const close = document.createElement("button");
  close.textContent = "Dismiss report";
  close.onclick = () => {
    panel.hidden = true;
  };
  panel.append(status, save, discard, file, path, close);
  for (const kind of ["pointerdown", "click", "keydown"])
    panel.addEventListener(kind, (event) => event.stopPropagation());
  parent.append(panel);
  return {
    state(message: string, recording = false, cancellable = false) {
      status.textContent = message;
      panel.hidden = false;
      save.hidden = !recording;
      discard.hidden = !cancellable;
      file.hidden = path.hidden = true;
      close.hidden = cancellable;
    },
    saved(result: BugFile) {
      this.state("Bug report saved · drag to attach, or click to show in folder");
      file.hidden = path.hidden = false;
      file.textContent = result.name;
      path.value = result.path;
    },
    warning(message: string) {
      // A background buffer failure must not hide an already saved attachment.
      if (file.hidden) this.state(message);
      else status.textContent = message;
    },
    dispose() {
      panel.remove();
    },
  };
}
