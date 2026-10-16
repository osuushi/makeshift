let localText: string | null = null;

export function hasLocalClipboard(): boolean {
  return localText !== null;
}

export async function pasteBrowserText(): Promise<string> {
  if (navigator.clipboard) return navigator.clipboard.readText();
  if (localText !== null) return localText;
  throw new Error("Copy geometry in Makeshift first; system clipboard access requires HTTPS");
}

/** HTTP tablet sessions have clipboard events, but no async Clipboard API. */
export async function copyBrowserText(text: string): Promise<void> {
  localText = text;
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
    document.execCommand("copy");
  } catch {
    // The user-authorized local clipboard remains available on HTTP.
  } finally {
    field.remove();
    if (previous instanceof HTMLElement) previous.focus({ preventScroll: true });
  }
}
