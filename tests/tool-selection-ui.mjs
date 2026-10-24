import assert from "node:assert/strict";
import { resolve } from "node:path";
import { orient, project } from "./ui-blend-edit.mjs";
import { createOperands } from "./ui-body-boolean.mjs";
import { at, drag, inspect } from "./ui-helpers.mjs";
import { withUiRuntimes } from "./ui-runtime.mjs";
import { chooseTool } from "./ui-tools.mjs";

// The regression boundary is catalog -> captured pointer/Entities selection -> native tool.
// Category/count combinations belong in tool-selection.test.ts.
await withUiRuntimes(async (page) => {
  await createOperands(page);
  const original = (await inspect(page)).document;
  await page.getByRole("button", { name: "Select Body 1", exact: true }).click();
  await page
    .getByRole("button", { name: "Select Body 2", exact: true })
    .click({ modifiers: ["Shift"] });
  const sketch = page
    .locator(".entity-label")
    .filter({ hasText: /Sketch/ })
    .first();
  await sketch.click({ modifiers: ["Shift"] });
  assert.ok((await inspect(page)).modelingSelection.some((t) => t.kind === "sketch"));
  await chooseTool(page, "union", "union");
  assert.equal((await inspect(page)).interaction.kind, "body-boolean");
  assert.ok((await inspect(page)).modelingSelection.every((t) => t.kind === "body"));
  await page.keyboard.press("Escape");
  await chooseTool(page, "clear selection", "selection-clear");
  await chooseTool(page, "union", "union");
  const step = page.getByRole("group", { name: "Select tool inputs", exact: true });
  await step.waitFor();
  const next = step.getByRole("button", { name: "Next", exact: true });
  assert.equal(await next.isDisabled(), true);
  const p = await project(page, [-10, 0, 5]);
  await page.mouse.click(p.x, p.y);
  assert.equal((await inspect(page)).interaction.kind, "tool-selection");
  assert.equal(await next.isDisabled(), true);
  await page.getByRole("button", { name: "Select Body 2", exact: true }).click();
  assert.equal(await next.isEnabled(), true);
  const box = await next.boundingBox();
  const viewport = page.viewportSize();
  assert.ok(Math.abs(box.x + box.width / 2 - viewport.width / 2) < 2);
  assert.ok(box.y > viewport.height * 0.7);
  assert.deepEqual((await inspect(page)).document, original);
  await next.click();
  assert.equal((await inspect(page)).interaction.kind, "body-boolean");
  await page.keyboard.press("Escape");
  assert.deepEqual((await inspect(page)).document, original);
  await chooseTool(page, "clear selection", "selection-clear");
  await chooseTool(page, "shell", "shell");
  await step.waitFor();
  await page.getByRole("button", { name: "Select Body 1", exact: true }).click();
  await step.getByRole("button", { name: "Cancel", exact: true }).click();
  assert.deepEqual((await inspect(page)).modelingSelection, []);
  assert.deepEqual((await inspect(page)).document, original);
  await sketchSelection(page, step, next);
  await customSelection(page, step, next);
});

async function sketchSelection(page, step, next) {
  await chooseTool(page, "Sketch on XZ", "sketch-xz");
  await page.keyboard.press("l");
  await drag(page, [-15, 10], [0, 16]);
  await page.keyboard.press("Escape");
  await page.keyboard.press("l");
  await drag(page, [5, 10], [20, 14]);
  await page.keyboard.press("Escape");
  await chooseTool(page, "clear selection", "selection-clear");
  await chooseTool(page, "parallel", "constraint-parallel");
  await step.waitFor();
  const firstLine = await at(page, -8, 12.8);
  const secondLine = await at(page, 12, 11.8667);
  await page.mouse.click(firstLine.x, firstLine.y);
  assert.equal(await next.isDisabled(), true);
  await page.mouse.click(secondLine.x, secondLine.y);
  assert.equal(await next.isEnabled(), true);
  await next.click();
  await inspect(page);
  assert.ok(
    (await inspect(page)).document.sketches.some((s) =>
      s.constraints.some((c) => c.kind === "parallel"),
    ),
  );
  // Two lines cannot be narrowed to one by category; the user must choose it.
  await chooseTool(page, "horizontal", "constraint-horizontal");
  await step.waitFor();
  assert.equal((await inspect(page)).selectionTargets.length, 2);
  const state = await inspect(page);
  const selected = state.selectionTargets[0].curve;
  const line = state.document.sketches.flatMap((s) => s.curves).find((c) => c.id === selected);
  const middle = await at(page, (line.a.x + line.b.x) / 2, (line.a.y + line.b.y) / 2);
  await page.mouse.click(middle.x, middle.y);
  await page.waitForFunction(() => window.makeshiftInspect().interaction === null);
  assert.ok(
    (await inspect(page)).document.sketches.some((s) =>
      s.constraints.some((c) => c.kind === "horizontal"),
    ),
  );
}

async function customSelection(page, step, next) {
  await chooseTool(page, "return to modeling", "modeling");
  await chooseTool(page, "clear selection", "selection-clear");
  // An asynchronous custom eligibility check must update Next without losing the picker.
  await chooseTool(page, "decorator library", "decorator-library");
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Import decorator bundle", exact: true }).click();
  await (await chooser).setFiles(resolve("examples/decorators/raised-pad.json"));
  await page.getByRole("button", { name: "Enable Raised pad code", exact: true }).click();
  await page.getByRole("button", { name: "Apply Raised pad", exact: true }).click();
  await step.waitFor();
  assert.equal(await next.isDisabled(), true);
  await orient(page, [0, 0, 1]);
  assert.equal((await inspect(page)).interaction?.kind, "tool-selection");
  const top = await project(page, [-10, 0, 5]);
  await page.mouse.click(top.x, top.y);
  await page.waitForFunction(
    () => !document.querySelector(".tool-selection-step button:last-child")?.disabled,
  );
  await next.click();
  await page.waitForFunction(() => window.makeshiftInspect().document.decorators?.length === 1);
}
