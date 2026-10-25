import assert from "node:assert/strict";

// Native label activation forwards a unit/gap click to its associated control.
// Model tests cannot detect accidentally associating the label with the R/Ø button.
export async function radialLabelClicks(input) {
  const label = input.locator("xpath=ancestor::label");
  const toggle = label.locator(".radial-toggle");
  const original = await input.inputValue();
  const mode = await toggle.getAttribute("aria-pressed");
  await label.locator("span").last().click();
  assert.equal(await toggle.getAttribute("aria-pressed"), mode, "unit click must not toggle R/Ø");
  assert.equal(await input.inputValue(), original);
  assert.equal(await input.evaluate((element) => element === document.activeElement), true);
  await label.click({ position: { x: 2, y: 2 } });
  assert.equal(await toggle.getAttribute("aria-pressed"), mode, "row padding must not toggle R/Ø");
  assert.equal(await input.inputValue(), original);
  await input.click();
  assert.equal(await toggle.getAttribute("aria-pressed"), mode);
  await toggle.click({ position: { x: 2, y: 2 } });
  assert.notEqual(await toggle.getAttribute("aria-pressed"), mode);
  assert.equal(await input.evaluate((element) => element === document.activeElement), true);
  await toggle.click();
  assert.equal(await toggle.getAttribute("aria-pressed"), mode);
  assert.equal(await input.inputValue(), original);
}
