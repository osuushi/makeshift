import { faceCutReferenceRoute } from "./ui-face-cut-reference.mjs";
import { planeFaceReferenceRoute } from "./ui-plane-face-reference.mjs";
import { withUiRuntimes } from "./ui-runtime.mjs";

await withUiRuntimes(
  async (page, name) => {
    await faceCutReferenceRoute(page, name);
    await planeFaceReferenceRoute(page, name);
  },
  { timeout: 30000 },
);
