import { planeAlignmentRoute } from "./ui-plane-alignment.mjs";
import { withUiRuntimes } from "./ui-runtime.mjs";

await withUiRuntimes(planeAlignmentRoute, { defaults: ["chromium", "webkit"], timeout: 20000 });
