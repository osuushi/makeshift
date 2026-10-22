import assert from "node:assert/strict";
import { makePlate, worldClick } from "./ui-face-offset.mjs";
import { inspect, modalCompleted } from "./ui-helpers.mjs";
import { withUiRuntimes } from "./ui-runtime.mjs";

// Focus starts an offset interaction and used to overwrite the rounded widget text
// with raw geometry. Only real focus/keyboard dispatch covers this boundary.
await withUiRuntimes(async (page, name) => {
  await makePlate(page);
  await worldClick(page, [6, 6, 5]);
  const field = page.getByRole("textbox", { name: "Face thickness", exact: true });
  await field.fill("16.999999");
  assert.equal(await field.inputValue(), "16.999999", "Typed precision is retained");
  await inspect(page);
  await page.keyboard.press("Enter");
  await modalCompleted(page);
  await worldClick(page, [6, 6, 16.999999]);
  const original = (await inspect(page)).document;
  assert.equal(await field.inputValue(), "17");
  await page.keyboard.press("Tab");
  assert.equal(await field.evaluate((input) => input === document.activeElement), true);
  assert.equal(await field.inputValue(), "17", "Tab must retain rounded text");
  await page.keyboard.press("Enter");
  await modalCompleted(page);
  assert.deepEqual(
    (await inspect(page)).document,
    original,
    "Focus and Enter cannot round geometry",
  );
  await field.click();
  assert.equal(await field.inputValue(), "17", "Pointer focus matches Tab");
  await page.keyboard.press("Escape");
  assert.deepEqual((await inspect(page)).document, original);
  console.log(`${name}: face thickness stays rounded on Tab/click without changing geometry`);
});
