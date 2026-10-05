import { reopenLoft } from "./ui-reopen-loft.mjs";
import { reopenEdgeMove, reopenFaceMove } from "./ui-reopen-topology.mjs";
import { withUiRuntimes } from "./ui-runtime.mjs";

await withUiRuntimes(
  async (page, name) => {
    await reopenLoft(page, name);
    await reopenFaceMove(page, name);
    await reopenEdgeMove(page, name);
  },
  { timeout: 120000 },
);
