import { withUiRuntimes } from "./ui-runtime.mjs";
import { tabletEntryRoute } from "./ui-tablet-entry.mjs";

await withUiRuntimes(tabletEntryRoute, { allowed: ["chromium", "webkit"], hasTouch: true });
