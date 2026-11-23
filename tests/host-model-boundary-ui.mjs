import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { hostModelBoundary } from "./host-model-boundary.mjs";
import { launchElectron, saveDocument } from "./native-documents.mjs";
import { drag, settled } from "./ui-helpers.mjs";
import { chooseTool } from "./ui-tools.mjs";

const root = await mkdtemp(join(tmpdir(), "makeshift-model-boundary-"));
let app;
try {
  app = await launchElectron({
    args: ["."],
    env: { ...process.env, MAKESHIFT_TEST_HIDDEN: "1", MAKESHIFT_DEV_URL: "" },
  });
  const desktop = await app.firstWindow();
  await settled(desktop);
  await chooseTool(desktop, "Sketch on XY", "sketch-xy");
  await desktop.keyboard.press("l");
  await drag(desktop, [0, 0], [20, 10]);
  await desktop.keyboard.press("Escape");
  await hostModelBoundary(desktop);
  await saveDocument(desktop, join(root, "Drawing.makeshift"));
  await hostModelBoundary(desktop);
  console.log("electron: raw replacement rejected before and after native Save");
} finally {
  await app?.close();
  await rm(root, { recursive: true, force: true });
}
