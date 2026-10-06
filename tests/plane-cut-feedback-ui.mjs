import { planeCutRoute } from "./ui-plane-cuts.mjs";
import { planeFaceReferenceRoute } from "./ui-plane-face-reference.mjs";
import { reopenCut } from "./ui-reopen-reference.mjs";
import { withUiRuntimes } from "./ui-runtime.mjs";

await withUiRuntimes(
  async (page, name) => {
    await planeCutRoute(page, name);
    await planeFaceReferenceRoute(page, name);
    await reopenCut(page, name);
    await reopenCut(page, name, true);
    console.log(`${name}: Split/Imprint Reopen, Cancel and reacceptance passed`);
  },
  { timeout: 30000 },
);
