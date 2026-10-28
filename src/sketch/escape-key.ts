/** Folio keyboards lack Escape. Normalize before CAD's capture listeners run. */
export function installEscapeAlias(): void {
  window.addEventListener(
    "keydown",
    (event) => {
      if (
        event.isComposing ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        !["`", "~"].includes(event.key)
      )
        return;
      const target = event.target;
      if (
        target instanceof Element &&
        target.closest(
          ".agent-dock, .preview-pane, textarea, [contenteditable='true'], input:not([type='number']):not([inputmode='decimal']):not([inputmode='numeric'])",
        )
      )
        return;
      const dialog = target instanceof Element ? target.closest("dialog[open]") : null;
      if (dialog instanceof HTMLDialogElement) {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (dialog.dispatchEvent(new Event("cancel", { cancelable: true }))) dialog.close();
        return;
      }
      // Keep the original target and propagation so numeric fields and modal owners agree.
      Object.defineProperty(event, "key", { value: "Escape" });
      event.preventDefault();
    },
    { capture: true },
  );
}
