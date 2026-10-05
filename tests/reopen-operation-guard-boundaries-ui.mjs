import { reopenReplacementGuards } from "./ui-reopen-file-guards.mjs";
import {
  reopenBusyGuard,
  reopenModalGuards,
  reopenModifierGuards,
  reopenNavigationGuard,
} from "./ui-reopen-guard-boundaries.mjs";
import { withUiRuntimes } from "./ui-runtime.mjs";

await withUiRuntimes(
  async (page, name) => {
    await reopenModifierGuards(page, name);
    await reopenModalGuards(page, name);
    await reopenNavigationGuard(page, name);
    await reopenBusyGuard(page, name);
    await reopenReplacementGuards(page, name);
  },
  { timeout: 120000 },
);
