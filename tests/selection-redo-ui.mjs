import { withUiRuntimes } from "./ui-runtime.mjs";
import { selectionGeometryRedoRoute } from "./ui-selection-geometry-redo.mjs";

await withUiRuntimes(selectionGeometryRedoRoute, { timeout: 15000 });
