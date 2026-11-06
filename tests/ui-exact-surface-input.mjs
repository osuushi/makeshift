import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { openDocument } from "./native-documents.mjs";
import { orient, outwardDrag } from "./ui-blend-edit.mjs";
import { worldClick } from "./ui-face-offset.mjs";
import { close, inspect } from "./ui-helpers.mjs";

const fixture = JSON.parse(readFileSync("tests/fixtures/offset-typed-diameter.json", "utf8"));

// A real native failure between keystrokes used to blur the field and replace 4
// with a searched diameter. Model tests cannot observe focus or subsequent typing.
export async function exactDiameterRoute(page, runtime) {
  await openDocument(page, {
    name: "typed-diameter.makeshift",
    buffer: Buffer.from(
      JSON.stringify({ format: "makeshift", version: 1, document: fixture.document }),
    ),
  });
  await orient(page, [1, -1, 0.4]);
  await worldClick(page, [17.5295, 0, 14.5]);
  const original = (await inspect(page)).document;
  const face = original.bodies[0].faces.find((f) => f.cylinder?.outward === 1);
  assert.equal((await inspect(page)).modelingSelection[0]?.face, face.id);
  await page.keyboard.press("o");
  const widget = page.locator(".face-offset-widget");
  await widget.getByRole("button", { name: /Switch to diameter/ }).click();
  const input = page.getByRole("textbox", { name: "Face diameter", exact: true });
  const accept = page.getByRole("button", { name: "Accept face offset", exact: true });
  await input.fill("4");
  let state = await inspect(page);
  assert.equal(await input.inputValue(), "4");
  assert.equal(await input.evaluate((element) => document.activeElement === element), true);
  assert.equal(await input.getAttribute("aria-invalid"), "true");
  assert.equal(await accept.isEnabled(), false);
  assert.equal(state.preview, null);
  assert.deepEqual(state.document, original);
  const nearest = widget.getByRole("button", { name: "Find Nearest", exact: true });
  assert.equal(await nearest.isVisible(), true);
  assert.ok(await widget.locator(".preview-error span").textContent());
  await page.screenshot({ path: `.cache/sketch-review/${runtime}-typed-diameter-error.png` });
  await input.pressSequentially("0");
  state = await inspect(page);
  assert.equal(await input.inputValue(), "40");
  assert.equal(await input.evaluate((element) => document.activeElement === element), true);
  close(state.preview.bodies[0].faces.find((f) => f.id === face.id).cylinder.radius, 20);
  assert.equal(await nearest.isVisible(), false);
  await input.fill("4");
  await inspect(page);
  await nearest.focus();
  await nearest.press("Enter");
  state = await inspect(page);
  const limited = state.preview.bodies[0].faces.find((f) => f.id === face.id).cylinder.radius;
  assert.ok(limited > 11 && limited < 11.01);
  assert.ok(Number(await input.inputValue()) > 22 && Number(await input.inputValue()) < 22.02);
  assert.equal(await accept.isEnabled(), true);
  assert.deepEqual(state.document, original);
  await input.fill("4");
  state = await inspect(page);
  assert.equal(
    state.preview,
    null,
    "Typing the same rejected value must not reuse its searched limit",
  );
  assert.equal(await input.inputValue(), "4");
  await input.pressSequentially("0");
  await inspect(page);
  await page.keyboard.press("Escape");
  assert.deepEqual((await inspect(page)).document, original);
  const dragged = await outwardDrag(
    page,
    "Offset faces",
    {
      offsetHandle: { center: [17.5295, 0, 14.5], normal: [1, 0, 0] },
    },
    -30,
    widget,
  );
  const dragRadius = dragged.preview.bodies[0].faces.find((f) => f.id === face.id).cylinder.radius;
  assert.ok(
    dragRadius > 11 && dragRadius < 11.01,
    "Dragging still searches to the verified boundary",
  );
  assert.equal(await accept.isEnabled(), true);
  await page.keyboard.press("Escape");
  await widget.getByRole("button", { name: /Switch to radius/ }).click();
  console.log(
    `${runtime}: captured 4 → 40 focus, inline error, explicit nearest, correction and drag limiting passed`,
  );
}

export async function exactFinishSize(page, input, accept) {
  await input.fill("100");
  const rejected = await inspect(page);
  assert.equal(rejected.preview, null);
  assert.equal(await input.inputValue(), "100");
  assert.equal(await input.evaluate((element) => document.activeElement === element), true);
  assert.equal(await accept.isEnabled(), false);
  await page.getByRole("button", { name: "Find Nearest", exact: true }).click();
  assert.ok((await inspect(page)).preview);
  assert.ok(Number(await input.inputValue()) > 0 && Number(await input.inputValue()) < 100);
  assert.equal(await accept.isEnabled(), true);
  await input.fill("1");
  await inspect(page);
}
