import { planeCutRoute } from "./ui-plane-cuts.mjs";
import { planeFaceReferenceRoute } from "./ui-plane-face-reference.mjs";
import { withUiRuntimes } from "./ui-runtime.mjs";

await withUiRuntimes(
  async (page, name) => {
    await planeCutRoute(page, name);
    await planeFaceReferenceRoute(page, name);
  },
  { timeout: 30000 },
);
