import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { openDocument } from "./native-documents.mjs";
import { project } from "./ui-blend-edit.mjs";
import { at, inspect } from "./ui-helpers.mjs";
import { hold, releaseChoice } from "./ui-overlap-gesture.mjs";
import { withUiRuntimes } from "./ui-runtime.mjs";
import { chooseTool } from "./ui-tools.mjs";

const fixture = JSON.parse(await readFile("tests/fixtures/sketch-covered-face.json", "utf8"));
await withUiRuntimes(async (page) => {
  await openDocument(page, {
    name: "covered-face.makeshift",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({ format: "makeshift", version: 1, document: fixture.document }),
    ),
  });
  const before = (await inspect(page)).document;
  await page.getByRole("button", { name: "Select Sketch 2", exact: true }).click();
  await page.keyboard.press("Enter");
  await inspect(page);
  const point = await at(page, 4, 2);
  await hold(page, point);
  const panel = page.getByRole("dialog", { name: "Choose overlapping geometry" });
  await panel.waitFor({ state: "visible" });
  assert.ok(await panel.locator('[data-kind="sketch-hit"] svg path').count());
  await releaseChoice(page, "Face");
  let state = await inspect(page);
  assert.ok(state.activePlane);
  assert.equal(state.modelingSelection[0]?.kind, "face");
  assert.deepEqual(state.document, before);
  await chooseTool(page, "Project", "project");
  await page.getByRole("button", { name: "Accept projection", exact: true }).click();
  state = await inspect(page);
  assert.equal(state.document.sketches[1].curves.length, 2);
  assert.ok(
    state.document.sketches[1].curves.some(
      (c) => c.kind === "circle" && Math.abs(c.radius - 8) < 1e-6,
    ),
  );
  const accepted = state.document;
  await chooseTool(page, "undo", "undo");
  assert.deepEqual(
    (await inspect(page)).document,
    accepted,
    "Completion view Undo retains geometry",
  );
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document, before);

  await circleChoices(page);
  console.log(
    "Sketch hold face selection, boundary projection/Undo, visual circle choices and cancellation passed",
  );
});

async function circleChoices(page) {
  const panel = page.getByRole("dialog", { name: "Choose overlapping geometry" });
  // A second offset circle makes the same interior click ambiguous.
  await chooseTool(page, "Circle", "circle");
  const center = await at(page, 12, 0),
    rim = await at(page, 28, 0);
  await page.mouse.move(center.x, center.y);
  await page.mouse.down();
  await page.mouse.move(rim.x, rim.y, { steps: 8 });
  await page.mouse.up();
  await inspect(page);
  await chooseTool(page, "Select", "select");
  const overlap = await at(page, 6, 4);
  await page.mouse.click(overlap.x, overlap.y);
  const choices = page.locator(".overlap-chooser");
  await choices.waitFor({ state: "visible" });
  assert.equal(await choices.locator("button svg").count(), 2);
  assert.equal(await choices.getByText("Circle 1", { exact: true }).count(), 0);
  const paths = await choices
    .locator("button svg")
    .evaluateAll((nodes) => nodes.map((n) => n.innerHTML));
  assert.notEqual(paths[0], paths[1]);
  await page.screenshot({ path: ".cache/sketch-review/sketch-circle-choice.png" });
  await choices.locator("button").nth(1).click();
  assert.equal((await inspect(page)).selection.length, 1);
  await hold(page, overlap);
  await panel.waitFor({ state: "visible" });
  const firstCurve = panel.locator('[data-kind="sketch-hit"]').first();
  const key = await firstCurve.getAttribute("data-key");
  await firstCurve.hover();
  await page.mouse.up();
  assert.deepEqual((await inspect(page)).selectedCurves, [key]);
  await hold(page, overlap);
  await page.keyboard.press("Escape");
  await page.mouse.up();
  assert.equal(await panel.isVisible(), false);
  await page.mouse.move(overlap.x, overlap.y);
  await page.mouse.down();
  await page.waitForTimeout(100);
  await page.keyboard.press("Escape");
  await page.mouse.up();
  assert.equal(
    (await inspect(page)).interaction,
    null,
    "Pending hold cancellation releases the sketch drag",
  );
  await chooseTool(page, "return to modeling", "modeling");
  await hold(page, await project(page, [4, 2, 28]));
  await releaseChoice(page, "Body");
  assert.equal((await inspect(page)).modelingSelection[0]?.kind, "body");
}
