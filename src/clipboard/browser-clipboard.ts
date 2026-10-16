/** HTTP tablet sessions have clipboard events, but no async Clipboard API. */
export async function copyBrowserText(text: string): Promise<void> {
  if (navigator.clipboard) return navigator.clipboard.writeText(text);
  const previous = document.activeElement;
  const field = document.createElement("textarea");
  field.value = text;
  field.setAttribute("aria-label", "Copy geometry");
  field.style.cssText = "position:fixed;left:-10000px;top:0";
  document.body.append(field);
  field.focus({ preventScroll: true });
  field.select();
  try {
    if (!document.execCommand("copy")) throw new Error("Safari could not copy the selection");
  } finally {
    field.remove();
    if (previous instanceof HTMLElement) previous.focus({ preventScroll: true });
  }
}

export function pasteBrowserText(signal: AbortSignal): Promise<string | null> {
  if (navigator.clipboard) return navigator.clipboard.readText();
  return new Promise((resolve) => {
    const dialog = document.createElement("dialog");
    dialog.setAttribute("aria-label", "Paste geometry");
    const label = document.createElement("label");
    label.textContent = "Paste geometry here with ⌘V or touch and hold, then Paste.";
    const field = document.createElement("textarea");
    field.setAttribute("aria-label", "Geometry from clipboard");
    label.append(field);
    const cancel = document.createElement("button");
    cancel.textContent = "Cancel";
    const previous = document.activeElement;
    const finish = (text: string | null) => {
      signal.removeEventListener("abort", abort);
      dialog.close();
      dialog.remove();
      if (previous instanceof HTMLElement) previous.focus({ preventScroll: true });
      resolve(text);
    };
    const abort = () => finish(null);
    cancel.onclick = abort;
    dialog.oncancel = (event) => {
      event.preventDefault();
      finish(null);
    };
    field.onpaste = (event) => {
      if (!event.clipboardData) return;
      event.preventDefault();
      finish(event.clipboardData.getData("text/plain"));
    };
    signal.addEventListener("abort", abort, { once: true });
    dialog.append(label, cancel);
    document.body.append(dialog);
    dialog.showModal();
    field.focus();
  });
}
