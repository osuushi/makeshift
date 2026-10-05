import { arcRoute } from "./ui-arc.mjs";
import { withUiRuntimes } from "./ui-runtime.mjs";

await withUiRuntimes(arcRoute, { timeout: 30000 });
