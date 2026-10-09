import { bodyRotationEntryRoute } from "./ui-body-rotation-entry.mjs";
import { withUiRuntimes } from "./ui-runtime.mjs";

await withUiRuntimes(
  async (page, name) => {
    await bodyRotationEntryRoute(page, name);
    await bodyRotationEntryRoute(page, name, true);
    await bodyRotationEntryRoute(page, name, false, "Escape");
  },
  {
    allowed: ["chromium", "webkit"],
    viewport: { width: 1280, height: 800 },
  },
);
