import { reopenFinish } from "./ui-reopen-solids.mjs";
import { withUiRuntimes } from "./ui-runtime.mjs";

// Focused presentation rerun after the solids geometry/intent checkpoint.
await withUiRuntimes(
  async (page, name) => {
    for (const mode of ["fillet", "chamfer"]) await reopenFinish(page, name, mode);
  },
  { timeout: 120000 },
);
