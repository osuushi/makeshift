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
  const apply = page.getByRole("button", { name: "Accept Boolean", exact: true });
  assert.equal((await inspect(page)).interaction.kind, "body-boolean");
  assert.equal(await page.getByRole("button", { name: "Next", exact: true }).count(), 0);
  assert.equal(await apply.isDisabled(), true);
  const p = await project(page, [-10, 0, 5]);
  await page.mouse.click(p.x, p.y);
  assert.equal((await inspect(page)).interaction.kind, "body-boolean");
  assert.equal(await apply.isDisabled(), true);
  await page.getByRole("button", { name: "Select Body 2", exact: true }).click();
  await inspect(page);
  assert.equal(await apply.isEnabled(), true);
  assert.deepEqual((await inspect(page)).document, original);
  await page.keyboard.press("Escape");
  await chooseTool(page, "clear selection", "selection-clear");
  await chooseTool(page, "shell", "shell");
  await page.getByRole("textbox", { name: "Shell thickness", exact: true }).waitFor();
  assert.match(await page.locator(".shell-widget .tool-requirement").textContent(), /Select/);
  assert.equal(await step.isVisible(), false, "The requirement belongs to the normal panel only");
  assert.equal(
    await page
      .locator('.toolbox-item[data-tool="shell"]:visible')
      .first()
      .getAttribute("aria-pressed"),
    "true",
  );
  await page.screenshot({ path: ".cache/sketch-review/modal-shell-empty.png" });
  await page.getByRole("button", { name: "Cancel shell", exact: true }).click();
  assert.deepEqual((await inspect(page)).modelingSelection, []);
  await chooseTool(page, "shell", "shell");
  await page.getByRole("button", { name: "Select Body 1", exact: true }).click();
  await inspect(page);
  assert.equal(await step.count(), 0);
  assert.equal(
    await page.getByRole("button", { name: "Shell thickness handle", exact: true }).isVisible(),
    true,
  );
  await chooseTool(page, "clear selection", "selection-clear");
  await filletInputs(page, original);
  await sketchSelection(page, step);
  await customSelection(page, step);
});

async function sketchSelection(page, step) {
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
  assert.equal(await step.isVisible(), true);
  await page.mouse.click(secondLine.x, secondLine.y);
  await step.waitFor({ state: "detached" });
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

async function customSelection(page, step) {
  await chooseTool(page, "return to modeling", "modeling");
  await chooseTool(page, "clear selection", "selection-clear");
  // Asynchronous geometry inspection must automatically admit the chosen input.
  await chooseTool(page, "decorator library", "decorator-library");
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Import decorator bundle", exact: true }).click();
  await (await chooser).setFiles(resolve("examples/decorators/raised-pad.json"));
  await page.getByRole("button", { name: "Enable Raised pad code", exact: true }).click();
  await page.getByRole("button", { name: "Apply Raised pad", exact: true }).click();
  await step.waitFor();
  assert.equal(await step.isVisible(), true);
  await orient(page, [0, 0, 1]);
  assert.equal((await inspect(page)).interaction?.kind, "tool-selection");
  const top = await project(page, [-10, 0, 5]);
  await page.mouse.click(top.x, top.y);
  await step.waitFor({ state: "detached" });
  await page.waitForFunction(() => window.makeshiftInspect().document.decorators?.length === 1);
}

async function filletInputs(page, original) {
  await chooseTool(page, "fillet", "fillet");
  assert.equal((await inspect(page)).interaction.kind, "body-edge-finish");
  const radius = page.getByRole("textbox", { name: "Fillet radius", exact: true });
  await radius.waitFor();
  assert.match(
    await page.locator(".edge-finish-panel .tool-requirement").textContent(),
    /Select at least one/,
  );
  assert.equal(
    await page.getByRole("button", { name: "Fillet edges", exact: true }).isVisible(),
    false,
  );
  await page.screenshot({ path: ".cache/sketch-review/modal-fillet-empty.png" });
  await orient(page, [0, 0, 1]);
  const face = await project(page, [-10, 0, 5]);
  await page.mouse.click(face.x, face.y);
  await inspect(page);
  await radius.fill("0.5");
  assert.ok((await inspect(page)).preview);
  await page.keyboard.down("Meta");
  await page.keyboard.down("Alt");
  await page.mouse.click(face.x, face.y);
  await page.keyboard.up("Alt");
  await page.keyboard.up("Meta");
  await inspect(page);
  assert.equal(
    await page.getByRole("button", { name: "Fillet edges", exact: true }).isVisible(),
    false,
  );
  assert.equal(await radius.isVisible(), true);
  await page.mouse.click(face.x, face.y);
  assert.ok((await inspect(page)).preview);
  await page.screenshot({ path: ".cache/sketch-review/modal-fillet.png" });
  await page.keyboard.press("Escape");
  assert.deepEqual((await inspect(page)).document, original);
}
