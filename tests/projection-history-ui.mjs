import { projectionHistoryRoute } from "./ui-projection-history.mjs";
import { withUiRuntimes } from "./ui-runtime.mjs";

await withUiRuntimes(projectionHistoryRoute, { timeout: 120000 });
