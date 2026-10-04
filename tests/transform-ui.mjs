import { withUiRuntimes } from "./ui-runtime.mjs";
import { transformRoute } from "./ui-transform.mjs";

await withUiRuntimes(transformRoute, { allowed: ["webkit"], timeout: 30000 });
