import type { WebContents } from "electron";

/** UI scale is renderer presentation; browser zoom must not alter its coordinate space. */
export function lockInterfaceZoom(contents: WebContents): void {
  contents.setZoomFactor(1);
  void contents.setVisualZoomLevelLimits(1, 1);
  contents.on("before-input-event", (event, input) => {
    if (
      (input.meta || input.control) &&
      (["+", "=", "-", "_", "0"].includes(input.key) ||
        ["NumpadAdd", "NumpadSubtract", "Numpad0"].includes(input.code))
    )
      event.preventDefault();
  });
  contents.on("zoom-changed", () => contents.setZoomFactor(1));
  contents.on("did-finish-load", () => contents.setZoomFactor(1));
}
