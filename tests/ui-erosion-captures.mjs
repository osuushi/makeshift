import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { openDocument } from "./native-documents.mjs";
import { bodyArchiveRoute } from "./ui-body-archive.mjs";
import { accurateErosion } from "./ui-erosion-method.mjs";
import { inspect } from "./ui-helpers.mjs";
import { chooseTool } from "./ui-tools.mjs";

export async function erosionCapturesRoute(page, runtime) {
  for (const name of ["rounded-cylinder", "connected-cylinders"]) {
    const fixture = JSON.parse(await readFile(`tests/fixtures/erosion-${name}.json`, "utf8"));
    await page.keyboard.press("Escape");
    await openDocument(page, {
      name: `${name}.makeshift`,
      mimeType: "application/json",
      buffer: Buffer.from(
        JSON.stringify({ format: "makeshift", version: 1, document: fixture.document }),
      ),
    });
    await inspect(page);
    await page
      .getByRole("button", { name: /^Select Body / })
      .first()
      .click();
    await accurateErosion(page);
    await page
      .getByRole("textbox", { name: "Extra thickness allowance", exact: true })
      .fill(String((fixture.operation.allowance / fixture.operation.thickness) * 100));
    await page
      .getByRole("textbox", { name: "Erode by", exact: true })
      .fill(String(fixture.operation.thickness));
    const preview = await inspect(page);
    assert.ok(preview.preview, `${name}: ${await page.locator(".erosion-widget").textContent()}`);
    const initial = preview.document.bodies.length;
    assert.equal(preview.preview.bodies.length, initial + 1);
    await page.getByRole("button", { name: "Accept erosion" }).click();
    assert.equal((await inspect(page)).document.bodies.length, initial + 1);
    await chooseTool(page, "undo", "undo");
    assert.equal((await inspect(page)).document.bodies.length, initial);
    await chooseTool(page, "redo", "redo");
    assert.equal((await inspect(page)).document.bodies.length, initial + 1);
    await page.screenshot({ path: `.cache/sketch-review/${runtime}-erosion-${name}.png` });
    await bodyArchiveRoute(page, `${runtime}-erosion-${name}`);
  }
  console.log(
    `${runtime}: both captured Erode failures pass preview, acceptance, Undo/Redo and Save/Open`,
  );
}
