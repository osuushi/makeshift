import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { openDocument } from "./native-documents.mjs";
import { bodyArchiveRoute } from "./ui-body-archive.mjs";
import { inspect } from "./ui-helpers.mjs";
import { withUiRuntimes } from "./ui-runtime.mjs";
import { chooseTool } from "./ui-tools.mjs";

const fixture = JSON.parse(await readFile("tests/fixtures/erosion-pierced-fillet.json", "utf8"));
await withUiRuntimes(
  async (page, runtime) => {
    await openDocument(page, {
      name: "pierced-fillet.makeshift",
      mimeType: "application/json",
      buffer: Buffer.from(
        JSON.stringify({ format: "makeshift", version: 1, document: fixture.document }),
      ),
    });
    const before = (await inspect(page)).document;
    await page
      .getByRole("button", { name: /^Select Body / })
      .first()
      .click();
    await page.getByRole("button", { name: "More tools", exact: true }).click();
    await page.getByRole("combobox", { name: "Find a tool" }).fill("erode");
    await page.locator('[data-command="erode"]').click();
    assert.equal(
      await page.getByRole("combobox", { name: "Erosion method", exact: true }).inputValue(),
      "fast",
    );
    await page.getByRole("textbox", { name: "Erode by", exact: true }).fill("3.8");
    let state = await inspect(page);
    assert(state.preview, await page.locator(".erosion-status").textContent());
    assert.equal(state.preview.bodies.length, 5);
    assert.deepEqual(state.document, before);
    await page.screenshot({ path: `.cache/sketch-review/${runtime}-erosion-pierced-preview.png` });
    await page.getByRole("button", { name: "Accept erosion", exact: true }).click();
    const accepted = (await inspect(page)).document;
    assert.equal(accepted.bodies.length, 5);
    assert(accepted.bodies.slice(1).every((body) => body.faces.length <= 8 && body.volume > 0));
    await chooseTool(page, "undo", "undo");
    assert.deepEqual((await inspect(page)).document, before);
    await chooseTool(page, "redo", "redo");
    assert.deepEqual((await inspect(page)).document, accepted);
    await page
      .getByRole("button", { name: /^Select Body / })
      .nth(1)
      .click();
    await page.keyboard.press("m");
    await page.getByRole("button", { name: "Move body X", exact: true }).click();
    await page.locator(".body-transform-value").fill("0.2");
    await page.keyboard.press("Enter");
    state = await inspect(page);
    assert(
      Math.abs(state.document.bodies[1].center[0] - accepted.bodies[1].center[0] - 0.2) < 1e-6,
    );
    await bodyArchiveRoute(page, `${runtime}-erosion-pierced`);
    const reopened = (await inspect(page)).document;
    const buttons = page.getByRole("button", { name: /^Select Body / });
    await buttons.nth(0).click();
    for (let index = 1; index < reopened.bodies.length; index++)
      await buttons.nth(index).click({ modifiers: ["Meta"] });
    await chooseTool(page, "subtract", "subtract");
    state = await inspect(page);
    assert.equal(state.preview?.bodies.length, 1);
    const expected =
      reopened.bodies[0].volume -
      reopened.bodies.slice(1).reduce((sum, body) => sum + body.volume, 0);
    assert(Math.abs(state.preview.bodies[0].volume - expected) < 1e-3);
    await page.keyboard.press("Enter");
    await inspect(page);
    await bodyArchiveRoute(page, `${runtime}-erosion-pierced-wall`);
    console.log(
      `${runtime}: captured Remesh split, acceptance/history, body edit, Save/Open and subtraction passed`,
    );
  },
  { timeout: 60000 },
);
