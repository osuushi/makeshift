import assert from "node:assert/strict";
import { at, close, drag, inspect, reset } from "./ui-helpers.mjs";
import { chooseTool } from "./ui-tools.mjs";

async function createStock(page) {
  await reset(page);
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  await page.keyboard.press("r");
  await drag(page, [-20, -10], [-10, 10]);
  await drag(page, [10, -10], [20, 10]);
  const left = await at(page, -15, 3),
    right = await at(page, 15, 3);
  await chooseTool(page, "return to modeling", "modeling");
  await page.mouse.click(left.x, left.y);
  await page.keyboard.down("Shift");
  await page.mouse.click(right.x, right.y);
  await page.keyboard.up("Shift");
  assert.equal((await inspect(page)).modelingSelection.length, 2);
  if (!(await page.getByRole("textbox", { name: "Extrusion distance" }).isVisible()))
    await page.getByRole("button", { name: "Drag extrusion", exact: true }).click();
  await page.getByRole("textbox", { name: "Extrusion distance" }).fill("5");
  await page.keyboard.press("Enter");
  await inspect(page);
  await page.keyboard.press("Enter");
  const state = await inspect(page);
  assert.equal(state.document.bodies.length, 2);
  return { left, unchanged: state.document.bodies[1] };
}

export async function booleanTargetsRoute(page, hidden = false) {
  const { left, unchanged } = await createStock(page);
  let state;
  await page.mouse.click(left.x, left.y);
  await chooseTool(page, "sketch on face", "sketch-on-face");
  await page.keyboard.press("r");
  await drag(page, [-24, -6], [24, 6], ["Shift"]);
  const middle = await at(page, 0, 0);
  await chooseTool(page, "return to modeling", "modeling");
  if (hidden) {
    await page.getByRole("button", { name: "Hide Body 2", exact: true }).click();
    assert.equal(
      await page.getByRole("button", { name: "Select Body 2", exact: true }).isDisabled(),
      true,
    );
  }
  await page.mouse.click(middle.x, middle.y);
  if (!(await page.getByRole("textbox", { name: "Extrusion distance" }).isVisible()))
    await page.getByRole("button", { name: "Drag extrusion", exact: true }).click();
  await page.getByRole("textbox", { name: "Extrusion distance" }).fill("-10");
  await page.keyboard.press("Enter");
  await inspect(page);
  assert.equal(
    await page
      .getByRole("button", { name: "Target body 1", exact: true })
      .getAttribute("aria-pressed"),
    "true",
  );
  if (hidden) {
    assert.equal(await page.getByRole("button", { name: "Target body 2", exact: true }).count(), 0);
  } else {
    assert.equal(
      await page
        .getByRole("button", { name: "Target body 2", exact: true })
        .getAttribute("aria-pressed"),
      "true",
    );
    await page.getByRole("button", { name: "Target body 2", exact: true }).click();
  }
  state = await inspect(page);
  const tools = state.bodyRendering.booleanOperands;
  assert.ok(tools.length > 0, "Bundled subtraction shows its generated tool");
  assert.ok(
    tools.every((tool) => tool.role === "tool" && tool.opacity === 0.16 && !tool.depthTest),
  );
  assert.equal(state.preview.bodies.find((b) => b.id === unchanged.id).brep, unchanged.brep);
  close(
    state.preview.bodies.reduce((sum, b) => sum + b.volume, 0),
    1400,
  );
  if (hidden) {
    await page.getByRole("button", { name: "Target body 1", exact: true }).click();
    await inspect(page);
    await page.getByRole("button", { name: "Target body 1", exact: true }).click();
    await inspect(page);
  }
  await page.keyboard.press("i");
  if (!(await page.getByRole("textbox", { name: "Extrusion distance" }).isVisible()))
    await page.getByRole("button", { name: "Drag extrusion", exact: true }).click();
  await page.getByRole("textbox", { name: "Extrusion distance" }).fill("10");
  await page.keyboard.press("Enter");
  state = await inspect(page);
  assert.equal(state.preview.bodies.length, 1);
  assert.ok(state.bodyRendering.booleanOperands.length > 0);
  assert.ok(state.bodyRendering.booleanOperands.every((tool) => tool.role === "input"));
  assert.equal(state.preview.bodies[0].id, unchanged.id);
  await page.keyboard.press("Escape");
  state = await inspect(page);
  assert.equal(state.document.bodies.length, 2);
  assert.deepEqual(state.bodyRendering.booleanOperands, []);
}
