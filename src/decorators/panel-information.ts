import type { SketchEditor } from "../sketch/editor.js";
import { hasSettingsProblem } from "./edits.js";
import { threadInformation } from "./thread-information.js";
import type { DecoratorInstance } from "./types.js";

export function appendThreadInformation(
  root: HTMLElement,
  editor: SketchEditor,
  instances: DecoratorInstance[],
): void {
  for (const instance of instances) {
    if (instance.problem) continue;
    const { warnings } = threadInformation(editor.store.data.bodies ?? [], instance);
    for (const warning of warnings) {
      const text = document.createElement("p");
      text.className = "decorator-warning";
      text.textContent = warning.message;
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = "Show affected faces";
      button.onclick = () => {
        editor.modeling.targets = warning.faces.map((f) => ({ kind: "face", ...f }));
        editor.refresh();
      };
      root.append(text, button);
    }
  }
}

export function appendThreadProblem(root: HTMLElement, instances: DecoratorInstance[]) {
  const problem = instances.find((d) => d.problem)?.problem;
  if (problem) {
    const note = document.createElement("p");
    note.className = "decorator-warning";
    note.setAttribute("role", "status");
    note.textContent = `⚠ Threads need correction: ${problem}.`;
    if (instances.every((d) => !d.problem || hasSettingsProblem(d)))
      note.textContent += " Adjust the settings below.";
    root.append(note);
  }
  return problem;
}
