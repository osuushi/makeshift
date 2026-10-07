import assert from "node:assert/strict";
import { orient, outwardDrag, project } from "./ui-blend-edit.mjs";
import { roundedPlate } from "./ui-edge-chain.mjs";
import { inspect } from "./ui-helpers.mjs";
import { relativeOffsetInput } from "./ui-offset-input.mjs";
import { chooseTool } from "./ui-tools.mjs";

export async function offsetChainRoute(page, name) {
  for (const chamfer of [false, true]) {
    await roundedPlate(page);
    const hard = (await inspect(page)).document;
    if (chamfer) {
      await page.keyboard.press("Shift+F");
      await page.getByRole("button", { name: "Chamfer edges", exact: true }).click();
      await page.getByRole("textbox", { name: "Chamfer distance" }).fill("2");
      await inspect(page);
      await page.getByRole("button", { name: "Accept chamfer" }).click();
      await inspect(page);
      await page.keyboard.press("Escape");
      assert.equal((await inspect(page)).modelingSelection.length, 0);
    }
    const original = (await inspect(page)).document;
    await orient(page, [0.3, 1, 0.6]);
    const point = await project(page, chamfer ? [0, 9, 9] : [0, 10, 5]);
    await page.mouse.click(point.x, point.y);
    let state = await inspect(page);
    assert.equal(state.modelingSelection.length, 1);
    const seed = state.document.bodies[0].faces.find(
      (f) => f.id === state.modelingSelection[0].face,
    );
    assert.equal(seed.offsetFaces.length, 3, "Only the straight/arc/straight tangent strip");
    const action = chamfer ? "Resize chamfer" : "Offset faces";
    if (chamfer) assert.deepEqual(new Set(seed.chamfer.faces), new Set(seed.offsetFaces));
    const handle = page.getByRole("button", { name: action, exact: true });
    await handle.click();
    state = await inspect(page);
    assert.equal(state.modelingSelection.length, 3);
    assert.deepEqual(
      new Set(state.modelingSelection.map((t) => t.face)),
      new Set(seed.offsetFaces),
    );
    assert.deepEqual(state.document, original);
    assert.equal(state.preview, null);
    const input = chamfer
      ? page.getByRole("textbox", { name: "Chamfer face distance", exact: true })
      : await relativeOffsetInput(page);
    await input.fill(chamfer ? "1" : "0.5");
    state = await inspect(page);
    assert.ok(state.preview.bodies[0].volume > original.bodies[0].volume);
    assert.equal(state.modelingSelection.length, 3);
    await page.screenshot({
      path: `.cache/sketch-review/${name}-${chamfer ? "chamfer" : "wall"}-offset-chain.png`,
    });
    await page.keyboard.press("Escape");
    assert.deepEqual((await inspect(page)).document, original);
    assert.equal((await inspect(page)).modelingSelection.length, 3);
    await page.keyboard.press("Escape");
    assert.equal((await inspect(page)).modelingSelection.length, 0);
    await page.mouse.click(point.x, point.y);
    assert.equal((await inspect(page)).modelingSelection.length, 1);
    const u = seed.plane.u,
      v = seed.plane.v;
    const normal = [
      u[1] * v[2] - u[2] * v[1],
      u[2] * v[0] - u[0] * v[2],
      u[0] * v[1] - u[1] * v[0],
    ];
    state = await outwardDrag(page, action, {
      offsetHandle: {
        center: chamfer ? [0, 9, 9] : [0, 10, 5],
        normal,
      },
    });
    assert.equal(state.modelingSelection.length, 3);
    if (!chamfer) await relativeOffsetInput(page);
    assert.ok(
      state.preview,
      JSON.stringify({ notice: state.notice, value: await input.inputValue() }),
    );
    await input.fill(chamfer ? "1" : "0.5");
    await inspect(page);
    await page.keyboard.press("Enter");
    assert.ok((await inspect(page)).document.bodies[0].volume > original.bodies[0].volume);
    await chooseTool(page, "undo", "undo");
    assert.deepEqual((await inspect(page)).document, original);
    if (chamfer) await healChamferStrip(page, handle, input, point, hard, original);
  }
  console.log(
    `${name}: wall and chamfer tangent face chains, entry/drag/highlight/cancel/Undo passed`,
  );
}

async function healChamferStrip(page, handle, input, point, hard, original) {
  await page.keyboard.press("Escape");
  await page.mouse.click(point.x, point.y);
  await handle.click();
  await input.fill("0");
  let state = await inspect(page);
  assert.equal(state.modelingSelection.length, 0, "Removed faces leave the preview selection");
  assert.ok(Math.abs(state.preview.bodies[0].volume - hard.bodies[0].volume) < 1e-6);
  await page.keyboard.press("Enter");
  state = await inspect(page);
  assert.equal(state.document.bodies[0].faces.length, hard.bodies[0].faces.length);
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document, original);
}
