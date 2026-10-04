import type { CapturedFixture } from "./fixture-host.js";

/** Diagnostic output stays independent of the active modeling gesture. */
export function fixtureResult(parent: HTMLElement) {
  const output = document.createElement("div");
  output.className = "fixture-result";
  output.hidden = true;
  const file = document.createElement("a");
  file.className = "fixture-file";
  file.draggable = true;
  file.setAttribute("aria-label", "Download captured fixture");
  const hint = document.createElement("span");
  hint.textContent = window.makeshiftFixtureFile
    ? "Drag file to attach · click to download"
    : "Download file to attach";
  const result = document.createElement("input");
  result.readOnly = true;
  result.setAttribute("aria-label", "Captured fixture path");
  const copy = document.createElement("button");
  copy.textContent = "Copy fixture path";
  copy.onclick = async () => {
    try {
      await navigator.clipboard.writeText(result.value);
    } catch {
      result.focus();
      result.select();
    }
  };
  const reveal = document.createElement("button");
  reveal.textContent = "Show in folder";
  reveal.hidden = !window.makeshiftFixtureFile;
  reveal.onclick = () => window.makeshiftFixtureFile?.reveal();
  const close = document.createElement("button");
  close.textContent = "Dismiss";
  close.onclick = () => {
    output.hidden = true;
  };
  // Stop modeling input without preventing the browser's native drag initiation.
  output.addEventListener("pointerdown", (event) => event.stopPropagation());
  output.addEventListener("click", (event) => event.stopPropagation());
  file.ondragstart = (event) => {
    if (window.makeshiftFixtureFile) {
      event.preventDefault();
      window.makeshiftFixtureFile.drag();
    }
  };
  output.append(file, hint, result, copy, reveal, close);
  parent.append(output);
  let url: string | null = null;
  return {
    show(saved: CapturedFixture) {
      if (url) URL.revokeObjectURL(url);
      url = URL.createObjectURL(new Blob([saved.contents], { type: "application/json" }));
      file.href = url;
      file.download = saved.name;
      file.textContent = saved.name;
      result.value = saved.path;
      result.hidden = !saved.path;
      copy.hidden = !saved.path;
      output.hidden = false;
    },
    dispose() {
      if (url) URL.revokeObjectURL(url);
      output.remove();
    },
  };
}
