import { bodyRotationEntryRoute } from "./ui-body-rotation-entry.mjs";
import { withUiRuntimes } from "./ui-runtime.mjs";

await withUiRuntimes(
  async (page, name) => {
    await bodyRotationEntryRoute(page, name);
    await bodyRotationEntryRoute(page, name, "pointer release");
  },
  {
    allowed: ["chromium", "webkit"],
    viewport: { width: 1280, height: 800 },
  },
);
