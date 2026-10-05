import { reopenBodyMove, reopenMirror, reopenPlane, reopenScale } from "./ui-reopen-transforms.mjs";
import { withUiRuntimes } from "./ui-runtime.mjs";

await withUiRuntimes(
  async (page, name) => {
    await reopenScale(page, name);
    await reopenBodyMove(page, name);
    await reopenMirror(page, name, true);
    await reopenMirror(page, name);
    await reopenPlane(page, name);
  },
  { timeout: 120000 },
);
