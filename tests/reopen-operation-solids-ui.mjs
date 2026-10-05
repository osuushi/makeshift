import { reopenErosion, reopenFinish, reopenRevolution, reopenShell } from "./ui-reopen-solids.mjs";
import { withUiRuntimes } from "./ui-runtime.mjs";

await withUiRuntimes(
  async (page, name) => {
    await reopenRevolution(page, name);
    await reopenShell(page, name);
    for (const method of ["accurate", "fast"]) await reopenErosion(page, name, method);
    for (const mode of ["fillet", "chamfer"]) await reopenFinish(page, name, mode);
  },
  { timeout: 120000 },
);
