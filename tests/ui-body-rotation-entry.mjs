import assert from "node:assert/strict";
import { at, close, drag, inspect, reset } from "./ui-helpers.mjs";
import { chooseTool } from "./ui-tools.mjs";

async function selectedBody(page) {
  await reset(page);
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  if ((await inspect(page)).gridSnap) await chooseTool(page, "grid snap", "grid");
  await page.keyboard.press("r");
  await drag(page, [-10, -5], [10, 5]);
  const pick = await at(page, 3, 2);
  await chooseTool(page, "return to modeling", "modeling");
  await page.mouse.click(pick.x, pick.y);
  await page.getByRole("button", { name: "Drag extrusion", exact: true }).click();
  await page.getByRole("textbox", { name: "Extrusion distance" }).fill("5");
  await page.keyboard.press("Enter");
  await inspect(page);
  await page.keyboard.press("Enter");
  await inspect(page);
  await page.getByRole("button", { name: "Select Body 1", exact: true }).click();
  await page.keyboard.press("m");
  return (await inspect(page)).document;
}

export async function bodyRotationEntryRoute(page, name, held = false, finish = "Enter") {
  const original = await selectedBody(page);
  const handle = page.getByRole("button", { name: "Rotate body Z", exact: true });
  await handle.hover();
  const box = await handle.boundingBox();
  const x = box.x + box.width / 2,
    y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 30, y - 20, { steps: 6 });
  const input = page.getByRole("textbox", { name: "Body rotation Z", exact: true });
  const manual = Number(await input.inputValue());
  assert.ok(manual !== 0 && manual !== 90);
  if (!held) await page.mouse.up();
  let state = await inspect(page);
  assert.deepEqual(state.document, original, "release retains the rotation preview");
  assert.ok(state.preview);
  await page.keyboard.press("Tab");
  assert.ok(await input.evaluate((element) => element === document.activeElement));
  await page.keyboard.type("90");
  state = await inspect(page);
  assert.deepEqual(state.document, original, "typing only changes the preview");
  const expectedBounds = [-5, -10, 0, 5, 10, 5];
  assert.ok(state.preview);
  state.preview.bodies[0].bounds.forEach((value, i) => {
    close(value, expectedBounds[i]);
  });
  // Stationary modifiers and further pointer travel must not replace numeric input.
  await page.keyboard.press("Shift");
  await page.mouse.move(x + 45, y - 30);
  assert.equal(await input.inputValue(), "90");
  (await inspect(page)).preview.bodies[0].bounds.forEach((value, i) => {
    close(value, expectedBounds[i]);
  });
  if (held) {
    await page.mouse.up();
    assert.deepEqual(
      (await inspect(page)).document,
      original,
      "release keeps typed rotation pending",
    );
  }
  if (finish === "tool exit") await chooseTool(page, "select", "select");
  else await page.keyboard.press(finish);
  state = await inspect(page);
  if (finish === "Escape") {
    assert.deepEqual(state.document, original, "Escape discards the released rotation");
    assert.equal(state.preview, null);
    console.log(`${name}: released body rotation numeric refinement cancels with Escape`);
    return;
  }
  state.document.bodies[0].bounds.forEach((value, i) => {
    close(value, expectedBounds[i]);
  });
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document, original);
  await chooseTool(page, "redo", "redo");
  (await inspect(page)).document.bodies[0].bounds.forEach((value, i) => {
    close(value, expectedBounds[i]);
  });
  if (finish === "tool exit") await reselectAndDelete(page);
  console.log(
    `${name}: ${held ? "held" : "released"} body rotation → Tab → typed preview → ${finish}, Undo/Redo passed`,
  );
}

async function reselectAndDelete(page) {
  const accepted = (await inspect(page)).document;
  await page.getByRole("button", { name: "Select Body 1", exact: true }).click();
  await page.keyboard.press("m");
  await page.getByRole("button", { name: "Rotate body Z", exact: true }).click();
  await page.getByRole("textbox", { name: "Body rotation Z", exact: true }).fill("30");
  assert.deepEqual((await inspect(page)).document, accepted);
  await page.keyboard.press("Escape");
  assert.deepEqual((await inspect(page)).document, accepted);
  await page.getByRole("button", { name: "Select Body 1", exact: true }).click();
  await page.keyboard.press("Delete");
  assert.equal((await inspect(page)).document.bodies.length, 0);
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document, accepted);
  await reset(page);
}
