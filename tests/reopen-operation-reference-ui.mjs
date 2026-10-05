import { reopenOffset } from "./ui-reopen-offsets.mjs";
import { reopenCleanup, reopenCut, reopenProjection } from "./ui-reopen-reference.mjs";
import { withUiRuntimes } from "./ui-runtime.mjs";

await withUiRuntimes(
  async (page, name) => {
    await reopenOffset(page, name);
    await reopenOffset(page, name, true);
    await reopenCut(page, name);
    await reopenCut(page, name, true);
    await reopenProjection(page, name);
    await reopenCleanup(page, name);
  },
  { timeout: 120000 },
);
