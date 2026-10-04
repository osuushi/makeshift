import { reopenCompositeGuard, reopenFocusGuards, reopenHostReload } from "./ui-reopen-guards.mjs";
import { withUiRuntimes } from "./ui-runtime.mjs";

await withUiRuntimes(
  async (page, name) => {
    await reopenFocusGuards(page, name);
    await reopenCompositeGuard(page, name);
    await reopenHostReload(page);
  },
  { timeout: 120000 },
);
