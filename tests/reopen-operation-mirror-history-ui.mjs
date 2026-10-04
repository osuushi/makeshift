import { mirrorParameterHistory } from "./ui-reopen-mirror-history.mjs";
import { withUiRuntimes } from "./ui-runtime.mjs";

await withUiRuntimes(
  async (page, name) => {
    await mirrorParameterHistory(page, name, true);
    await mirrorParameterHistory(page, name, false);
  },
  { timeout: 120000 },
);
