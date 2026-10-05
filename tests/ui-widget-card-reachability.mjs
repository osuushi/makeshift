import assert from "node:assert/strict";
import { orient } from "./ui-blend-edit.mjs";
import { edgeFinishPrism, pickWorld } from "./ui-edge-finish-fixtures.mjs";
import { inspect } from "./ui-helpers.mjs";
import { chooseTool } from "./ui-tools.mjs";
import { sweepWidgets } from "./ui-widget-reachability.mjs";
import { panTo } from "./ui-widget-wheel.mjs";

const button = (page, name) => page.getByRole("button", { name, exact: true });
export async function projectedCardReachability(page, name) {
  await edgeFinishPrism(page);
  await button(page, "Select Body 1").click();
  await chooseTool(page, "duplicate bodies", "duplicate");
  await button(page, "Move body X").click();
  await page.getByRole("textbox", { name: "Body translation X", exact: true }).fill("5");
  await page.keyboard.press("Enter");
  const before = (await inspect(page)).document;
  assert.equal(before.bodies.length, 2);
  await button(page, "Select Body 1").click();
  await page.keyboard.down("Shift");
  await button(page, "Select Body 2").click();
  await page.keyboard.up("Shift");
  await chooseTool(page, "union", "union");
  const state = await inspect(page);
  assert.ok(Math.abs(state.preview.bodies[0].volume - 5000) < 1e-5);
  await sweepWidgets(page, [2.5, 0, 5], ".boolean-widget:not([hidden])", "Boolean card");
  await button(page, "Cancel Boolean").click();
  assert.deepEqual((await inspect(page)).document, before);

  await button(page, "Select Body 1").click();
  await chooseTool(page, "mirror", "mirror");
  await sweepWidgets(
    page,
    [0, 0, 5],
    ".mirror-widget:not([hidden])",
    "Mirror plane collection card",
  );
  await button(page, "Cancel mirror").click();
  assert.deepEqual((await inspect(page)).document, before);

  await button(page, "Select Body 1").click();
  await chooseTool(page, "clean up", "cleanup");
  await inspect(page);
  await sweepWidgets(page, [0, 0, 5], ".cleanup-widget:not([hidden])", "Cleanup card");
  await page.keyboard.press("Escape");
  assert.deepEqual((await inspect(page)).document, before);

  await page.keyboard.press("Escape");
  await chooseTool(page, "loft", "loft");
  await sweepWidgets(
    page,
    [0, 0, 0],
    ".loft-controls:not([hidden])",
    "Loft section collection card",
  );
  await loftCardGeometry(page, before);
  await button(page, "Cancel loft").click();
  assert.deepEqual((await inspect(page)).document, before);
  console.log(
    `${name}: projected Boolean/Mirror/Cleanup/Loft cards, native union volume and ordinary collection/Cancel passed`,
  );
}

async function loftCardGeometry(page, before) {
  const canvas = await page.locator("#world canvas").boundingBox();
  await panTo(page, [0, 0, 5], { x: canvas.width / 2, y: canvas.height / 2 });
  await orient(page, [1, 1, -1]);
  await pickWorld(page, [-8, 0, 0]);
  await orient(page, [1, 1, 1]);
  await pickWorld(page, [12, 0, 10]);
  assert.equal(await page.locator(".loft-controls li").count(), 2);
  await button(page, "Add loft sections").click();
  await page.getByRole("combobox", { name: "Loft shape", exact: true }).selectOption("ruled");
  await button(page, "New body").click();
  const state = await inspect(page);
  const result = state.preview.bodies.find(
    (body) => !before.bodies.some((old) => old.id === body.id),
  );
  // Congruent 20×20 sections separated by 10: lateral displacement preserves volume.
  assert.ok(Math.abs(result.volume - 4000) < 1e-5);
  assert.deepEqual(state.document, before);
  assert.deepEqual(
    state.preview.bodies.filter((body) => body.id !== result.id),
    before.bodies,
  );
  await button(page, "Union").click();
  await inspect(page);
  await sweepWidgets(page, [0, 0, 0], ".loft-controls:not([hidden])", "Loft sections and targets");
}
