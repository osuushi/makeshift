import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { DocumentOwner } from "../.cache/sketch-tests/src/backend/document-owner.js";
import { documentArchive } from "../.cache/sketch-tests/src/model/document-archive.js";
import { erosionSpecialCases } from "../.cache/sketch-tests/tests/erosion-special-fixtures.js";
import { openDocument } from "./native-documents.mjs";
import { bodyArchiveRoute } from "./ui-body-archive.mjs";
import { accurateErosion } from "./ui-erosion-method.mjs";
import { inspect } from "./ui-helpers.mjs";
import { withUiRuntimes } from "./ui-runtime.mjs";
import { chooseTool } from "./ui-tools.mjs";

const names = [
  "thin-round-branch",
  "double-torus",
  "sphere-plane-fillet",
  "sphere-cylinder-fillet",
  "merging-cavities",
  "cavity-breakthrough",
  "hollow-sphere",
];
const requested = process.env.MAKESHIFT_EROSION_CASE;
if (requested) assert.ok(names.includes(requested), `Unknown UI erosion case: ${requested}`);
const cases = erosionSpecialCases.filter(
  (entry) => names.includes(entry.name) && (!requested || entry.name === requested),
);
await mkdir(".cache/erosion-special", { recursive: true });
for (const entry of cases) {
  const owner = new DocumentOwner();
  try {
    await entry.build(owner);
    await writeFile(
      `.cache/erosion-special/ui-${entry.name}.makeshift`,
      documentArchive(owner.view.data),
    );
  } finally {
    owner.close();
  }
}
await withUiRuntimes(
  async (page, runtime) => {
    for (const entry of cases) {
      await page.keyboard.press("Escape");
      await openDocument(page, resolve(`.cache/erosion-special/ui-${entry.name}.makeshift`));
      await inspect(page);
      await page
        .getByRole("button", { name: /^Select Body / })
        .first()
        .click();
      await accurateErosion(page);
      await page
        .getByRole("textbox", { name: "Erode by", exact: true })
        .fill(String(entry.thickness));
      await page
        .getByRole("textbox", { name: "Extra thickness allowance", exact: true })
        .fill(String((entry.allowance / entry.thickness) * 100));
      let state = await inspect(page);
      assert.ok(state.preview, `${entry.name}: Erode must produce a preview`);
      assert.equal(state.preview.bodies.length, 2);
      await page.getByRole("button", { name: "Accept erosion", exact: true }).click();
      state = await inspect(page);
      const result = state.document.bodies[1];
      assert.ok(result && result.volume > 0);
      await chooseTool(page, "undo", "undo");
      assert.equal((await inspect(page)).document.bodies.length, 1);
      await chooseTool(page, "redo", "redo");
      assert.equal((await inspect(page)).document.bodies.length, 2);
      await page
        .getByRole("button", { name: /^Select Body / })
        .last()
        .click();
      await page.keyboard.press("m");
      await page.getByRole("button", { name: "Move body X", exact: true }).click();
      await page.locator(".body-transform-value").fill("1");
      await page.keyboard.press("Enter");
      state = await inspect(page);
      assert.ok(Math.abs(state.document.bodies[1].center[0] - result.center[0] - 1) < 1e-6);
      await page.screenshot({
        path: `.cache/sketch-review/${runtime}-erosion-special-${entry.name}.png`,
      });
      await bodyArchiveRoute(page, `${runtime}-erosion-special-${entry.name}`);
      console.log(
        `${runtime}: ${entry.name} preview, accept, Undo/Redo, move and Save/Open passed`,
      );
    }
  },
  { timeout: 60000 },
);
