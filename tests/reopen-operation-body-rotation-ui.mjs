import { reopenBodyRotation } from "./ui-reopen-body-rotation.mjs";
import { withUiRuntimes } from "./ui-runtime.mjs";

await withUiRuntimes(
  async (page, name) => {
    await reopenBodyRotation(page, name);
    await reopenBodyRotation(page, name, true);
  },
  { timeout: 120000 },
);
