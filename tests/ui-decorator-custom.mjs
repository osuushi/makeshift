import assert from "node:assert/strict";
import { resolve } from "node:path";
import { orient } from "./ui-blend-edit.mjs";
import { worldClick } from "./ui-face-offset.mjs";
import { at, drag, inspect, reset } from "./ui-helpers.mjs";
import { clearSelection } from "./ui-reconnection-helpers.mjs";
import { chooseTool } from "./ui-tools.mjs";

export async function customDecoratorRoute(page) {
  await reset(page);
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  await page.keyboard.press("c");
  await drag(page, [0, 0], [8, 0]);
  const center = await at(page, 0, 0);
  await chooseTool(page, "return to modeling", "modeling");
  await page.mouse.click(center.x, center.y);
  await page.getByRole("button", { name: "Drag extrusion", exact: true }).click();
  await page.getByRole("textbox", { name: "Extrusion distance" }).fill("10");
  await page.keyboard.press("Enter");
  await inspect(page);
  await page.keyboard.press("Enter");
  await inspect(page);
  await orient(page, [1, -1, 1]);
  await worldClick(page, [2, -2, 10]);
  await chooseTool(page, "decorator library", "decorator-library");
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Import decorator bundle", exact: true }).click();
  await (await chooser).setFiles(resolve("examples/decorators/raised-pad.json"));
  await page.getByRole("button", { name: "Enable Raised pad code", exact: true }).waitFor();
  assert.equal(
    await page.getByRole("button", { name: "Apply Raised pad", exact: true }).isDisabled(),
    true,
  );
  await page.getByRole("button", { name: "Enable Raised pad code", exact: true }).click();
  await inspect(page);
  await clearSelection(page);
  await orient(page, [0, -1, 0.3]);
  await worldClick(page, [0, -8, 5]);
  await page.getByRole("button", { name: "Apply Raised pad", exact: true }).click();
  const step = page.getByRole("group", { name: "Select tool inputs", exact: true });
  await step.waitFor();
  assert.equal(await step.getByRole("button", { name: "Next", exact: true }).isDisabled(), true);
  await step.getByRole("button", { name: "Cancel", exact: true }).click();
  await clearSelection(page);
  await orient(page, [1, -1, 1]);
  await worldClick(page, [2, -2, 10]);
  await page.getByRole("button", { name: "Apply Raised pad", exact: true }).click();
  await inspect(page);
  await page.getByRole("button", { name: "Close decorator library", exact: true }).click();
  const height = page.getByRole("spinbutton", { name: "Height", exact: true });
  const beforeDraft = (await inspect(page)).document;
  await height.fill("4");
  await page.waitForFunction(
    () => window.makeshiftInspect().preview?.decorators?.[0]?.settings.height === 4,
  );
  assert.deepEqual((await inspect(page)).document, beforeDraft);
  await height.press("Escape");
  assert.equal((await inspect(page)).preview, null);
  assert.deepEqual((await inspect(page)).document, beforeDraft);
  await height.fill("-1");
  await height.press("Enter");
  assert.deepEqual((await inspect(page)).document, beforeDraft);
  await page.keyboard.press("Escape");
  await height.fill("2");
  await height.press("Enter");
  assert.equal((await inspect(page)).document.decorators[0].settings.height, 2);
  await chooseTool(page, "undo", "undo");
  assert.equal((await inspect(page)).document.decorators[0].settings.height, 1);
  await chooseTool(page, "redo", "redo");
  assert.equal((await inspect(page)).document.decorators[0].settings.height, 2);
  const width = page.getByRole("spinbutton", { name: "Width", exact: true });
  await width.fill("20");
  await width.press("Enter");
  await page.getByText("Pad width may extend beyond this face", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Show affected geometry", exact: true }).click();
  const highlighted = (await inspect(page)).modelingSelection;
  assert.equal(highlighted.filter((t) => t.kind === "face").length, 2);
  assert.ok(highlighted.some((t) => t.kind === "edge"));
  await width.fill("2");
  await width.press("Enter");
  await inspect(page);
  await customContinuationRoute(page);
}

async function customContinuationRoute(page) {
  const settings = (await inspect(page)).document.decorators[0].settings;
  await page.getByRole("button", { name: "Select Body 1", exact: true }).click();
  await chooseTool(page, "transform", "transform");
  await page.locator(".transform-box-handle:not([hidden])").first().click();
  await page.getByRole("checkbox", { name: "Uniform scale", exact: true }).check();
  await page.getByRole("textbox", { name: "Transform scale X", exact: true }).fill("1.5");
  assert.equal((await inspect(page)).preview.decorators[0].problem, undefined);
  await page.getByRole("button", { name: "Accept transform scale", exact: true }).click();
  assert.deepEqual((await inspect(page)).document.decorators[0].settings, settings);
  await chooseTool(page, "undo", "undo");
  await clearSelection(page);
  await chooseTool(page, "decorator library", "decorator-library");
  await page.getByRole("button", { name: "Disable Raised pad code", exact: true }).click();
  await inspect(page);
  await page.getByRole("button", { name: "Close decorator library", exact: true }).click();
  await page.getByRole("button", { name: "Select Body 1", exact: true }).click();
  await chooseTool(page, "transform", "transform");
  await page.locator(".transform-box-handle:not([hidden])").first().click();
  await page.getByRole("textbox", { name: "Transform scale X", exact: true }).fill("1.5");
  await inspect(page);
  await page.getByRole("button", { name: "Accept transform scale", exact: true }).click();
  assert.match((await inspect(page)).document.decorators[0].problem, /Enable bundled code/);
  await clearSelection(page);
  await page.getByRole("button", { name: "Select affected geometry", exact: true }).click();
  await page.getByRole("button", { name: "Enable Raised pad code", exact: true }).click();
  await inspect(page);
  await page
    .getByRole("button", { name: "Use selected faces for this decorator", exact: true })
    .click();
  assert.equal((await inspect(page)).document.decorators[0].problem, undefined);
}
