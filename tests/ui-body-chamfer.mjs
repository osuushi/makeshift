import assert from "node:assert/strict";
import { bodyArchiveRoute } from "./ui-body-archive.mjs";
import { circularFinish, plate } from "./ui-body-fillet.mjs";
import { at, drag, inspect } from "./ui-helpers.mjs";
import { chooseTool } from "./ui-tools.mjs";

export async function bodyChamferRoute(page, name, electron) {
  await plate(page);
  const original = (await inspect(page)).document;
  assert.ok(await page.getByRole("button", { name: "Fillet edges", exact: true }).isVisible());
  await chooseTool(page, "chamfer", "chamfer");
  await page.getByRole("button", { name: "Chamfer edges", exact: true }).click();
  const input = page.getByRole("textbox", { name: "Chamfer distance", exact: true });
  await input.fill("2");
  let state = await inspect(page);
  assert.deepEqual(state.document, original);
  assert.ok(state.preview.bodies[0].volume < original.bodies[0].volume);
  assert.ok(state.preview.bodies[0].faces.every((f) => f.plane));
  await input.fill("100");
  await inspect(page);
  const limited = Number(await input.inputValue());
  assert.ok(limited > 2 && limited < 100);
  await input.fill("100");
  await inspect(page);
  assert.equal(
    Number(await input.inputValue()),
    limited,
    "Repeated oversized input still shows the legal value",
  );
  const accept = page.getByRole("button", { name: "Accept chamfer", exact: true });
  // The debounced cleanup query may temporarily disable controls after inspect.
  await page.waitForFunction(() => {
    const button = document.querySelector('[aria-label="Accept chamfer"]');
    return button && !button.disabled;
  });
  assert.ok(await accept.isEnabled());
  await page.screenshot({ path: `.cache/sketch-review/${name}-chamfer-limit.png` });
  await input.fill("-5");
  state = await inspect(page);
  assert.equal(Number(await input.inputValue()), 0);
  assert.deepEqual(state.preview, original);
  await page.keyboard.press("Enter");
  assert.deepEqual((await inspect(page)).document, original, "Zero size adds no edit");
  assert.equal((await inspect(page)).modelingSelection.length, 2);
  await dragLimit(page, "fillet");
  await dragLimit(page, "chamfer");
  await chooseTool(page, "chamfer", "chamfer");
  await page.getByRole("button", { name: "Chamfer edges", exact: true }).click();
  await input.fill("2");
  await inspect(page);
  await page.getByRole("button", { name: "Accept chamfer", exact: true }).click();
  const accepted = (await inspect(page)).document;
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document, original);
  await chooseTool(page, "redo", "redo");
  assert.deepEqual((await inspect(page)).document, accepted);
  await bodyArchiveRoute(page, `${name}-chamfer`, electron);
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  const point = await at(page, 6, -6);
  await chooseTool(page, "return to modeling", "modeling");
  await page.mouse.click(point.x, point.y);
  await page.keyboard.press("Enter");
  assert.ok((await inspect(page)).activePlane);
  await page.keyboard.press("l");
  await drag(page, [-3, 0], [3, 0]);
  assert.equal((await inspect(page)).document.sketches.length, 2);
  await circularFinish(page, name, "chamfer");
  console.log(
    `${name}: separate chamfer, verified numeric/drag limits and immediate reversal, zero, history/archive and face sketch passed`,
  );
}

async function dragLimit(page, mode) {
  await page.keyboard.press(mode === "fillet" ? "f" : "Shift+F");
  const name = mode === "fillet" ? "Fillet" : "Chamfer";
  const handle = page.getByRole("button", { name: `${name} edges`, exact: true });
  const input = page.getByRole("textbox", {
    name: `${name} ${mode === "fillet" ? "radius" : "distance"}`,
    exact: true,
  });
  const box = await handle.boundingBox();
  const y = box.y + box.height / 2,
    start = box.x + box.width / 2,
    end = start + 300;
  await page.mouse.move(start, y);
  await page.mouse.down();
  await page.mouse.move(end, y);
  await inspect(page);
  const maximum = Number(await input.inputValue());
  assert.ok(maximum > 2 && maximum < 15, "Pointer overshoot stops at the feasible size");
  await page.mouse.move(end - 20, y);
  await inspect(page);
  const back = Number(await input.inputValue());
  assert.ok(back < maximum - 0.5, "Reversing at a limit responds without dead cursor travel");
  await page.mouse.up();
  await inspect(page);
  await page.getByRole("button", { name: `Cancel ${mode}`, exact: true }).click();
  await inspect(page);
  assert.equal((await inspect(page)).modelingSelection.length, 2);
}
