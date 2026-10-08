import { modalPlaneWidgetRoute } from "./ui-modal-plane-widgets.mjs";
import { withUiRuntimes } from "./ui-runtime.mjs";

await withUiRuntimes(modalPlaneWidgetRoute, { allowed: ["chromium", "webkit"], timeout: 30000 });
