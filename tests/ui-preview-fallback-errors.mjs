import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { orient } from "./ui-blend-edit.mjs";
import { holdPreviews } from "./ui-decorator-worker-control.mjs";
import { worldClick } from "./ui-face-offset.mjs";
import { inspect } from "./ui-helpers.mjs";
import {
  coloredFace,
  command,
  completed,
  cylinder,
  marker,
  releaseDetail,
  threads,
} from "./ui-preview-fallback-helpers.mjs";
import { clearSelection } from "./ui-reconnection-helpers.mjs";

export async function invalidAndRemoved(page, name) {
  await cylinder(page);
  const before = await threads(page);
  await holdPreviews(page);
  try {
    await page.getByRole("button", { name: "Select Body 1", exact: true }).click();
    await command(page, "transform", "transform");
    await page.locator(".transform-box-handle:not([hidden])").first().click();
    await page.getByRole("checkbox", { name: "Uniform scale", exact: true }).uncheck();
    await page.getByRole("textbox", { name: "Transform scale X", exact: true }).fill("1.5");
    let state = await inspect(page);
    assert.deepEqual(state.document, before);
    assert.match(state.preview.decorators[0].problem, /cylindrical/);
    assert.equal(state.decoratorFallbackBounds.length, 0);
    assert.equal(state.decoratorPreviewBounds.length, 0);
    await page.getByRole("button", { name: "Accept transform scale", exact: true }).click();
    const invalid = (await completed(page)).document;
    assert.match(invalid.decorators[0].problem, /cylindrical/);
    await page.getByText(invalid.decorators[0].problem, { exact: true }).first().waitFor();
    assert.equal(await page.locator(".decorator-preview-status").isVisible(), false);
    await page.screenshot({ path: `.cache/sketch-review/${name}-invalid-attachment-explicit.png` });
    await command(page, "undo", "undo");
    assert.deepEqual((await completed(page)).document, before);
    await marker(page, before);
    await releaseDetail(page, before);
    await clearSelection(page);
    await orient(page, [0, -1, 0.3]);
    await worldClick(page, [0, -8, 5]);
    await holdPreviews(page);
    await page
      .getByRole("button", { name: "Remove threads from selected faces", exact: true })
      .click();
    state = await completed(page);
    assert.equal(state.document.decorators.length, 0);
    assert.equal(state.decoratorFallbackBounds.length, 0);
    assert.equal(state.decoratorPreviewBounds.length, 0);
    assert.equal(await page.locator(".decorator-preview-status").isVisible(), false);
    await command(page, "undo", "undo");
    assert.deepEqual((await completed(page)).document, before);
    await marker(page, before);
    await command(page, "redo", "redo");
    state = await completed(page);
    assert.equal(state.document.decorators.length, 0);
    await holdPreviews(page, false);
    assert.equal((await inspect(page)).decoratorFallbackBounds.length, 0);
    assert.equal((await inspect(page)).decoratorPreviewBounds.length, 0);
  } finally {
    await holdPreviews(page, false);
  }
}

async function importControlledBundle(page, path) {
  await clearSelection(page);
  await orient(page, [1, -1, 1]);
  await worldClick(page, [2, -2, 10]);
  const selected = (await inspect(page)).modelingSelection;
  await command(page, "decorator library", "decorator-library");
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Import decorator bundle", exact: true }).click();
  await (await chooser).setFiles(path);
  await page
    .getByRole("button", { name: "Enable Preview fallback probe code", exact: true })
    .click();
  await completed(page);
  await page.getByRole("button", { name: "Apply Preview fallback probe", exact: true }).click();
  await completed(page);
  await page.getByRole("button", { name: "Close decorator library", exact: true }).click();
  const state = await inspect(page);
  assert.deepEqual(
    state.document.decorators[0].faces,
    selected.map(({ body, face }) => ({ body, face })),
  );
  return state.document;
}
async function customSettled(page, samplesBefore) {
  await page.waitForFunction(
    (samplesBefore) =>
      window.previewTest.samples.length > samplesBefore &&
      document.querySelector(".decorator-preview-status")?.hasAttribute("hidden"),
    samplesBefore,
  );
  return completed(page);
}
export async function emptyAndError(page, name) {
  const directory = await mkdtemp(join(tmpdir(), "makeshift-preview29-"));
  try {
    const bundle = JSON.parse(await readFile("examples/decorators/raised-pad.json", "utf8"));
    bundle.id = "example.preview-fallback-probe";
    bundle.name = "Preview fallback probe";
    bundle.source = bundle.source.replace(
      "preview(context) { return pad(context); }",
      `preview(context) {
        if (context.settings.height === 1) return { vertices: [[0,0,10],[1,0,10],[0,1,10]], triangles: [] };
        if (context.settings.height === 2) throw new Error("Controlled preview failure");
        return pad(context);
      }`,
    );
    const path = join(directory, "preview-fallback.json");
    await writeFile(path, JSON.stringify(bundle));
    await cylinder(page);
    const sampleCount = await page.evaluate(() => window.previewTest.samples.length);
    const initial = await importControlledBundle(page, path);
    await customSettled(page, sampleCount);
    await marker(page, initial, { busy: false });
    await coloredFace(page, `${name}-empty-custom-keeps-marker`, [2, -2, 10]);
    const height = page.getByRole("spinbutton", { name: "Height", exact: true });
    await height.fill("2");
    await height.press("Enter");
    await page
      .getByText("Decorator preview: Controlled preview failure", { exact: true })
      .waitFor();
    const errored = (await completed(page)).document;
    assert.deepEqual(errored.bodies, initial.bodies);
    assert.equal(errored.decorators[0].problem, undefined);
    await marker(page, errored, { busy: false });
    await coloredFace(page, `${name}-custom-error-keeps-marker`, [2, -2, 10]);
    await height.fill("3");
    await height.press("Enter");
    const recovered = (await completed(page)).document;
    assert.deepEqual(recovered.bodies, initial.bodies);
    await releaseDetail(page, recovered);
    const state = await inspect(page);
    assert.ok(state.decoratorPreviewBounds.some((mesh) => mesh.max[2] >= 13));
    await clearSelection(page);
    await worldClick(page, [2, -2, 10]);
    assert.equal((await inspect(page)).modelingSelection[0]?.kind, "face");
    assert.deepEqual((await inspect(page)).document, recovered);
  } finally {
    await holdPreviews(page, false);
    await rm(directory, { recursive: true, force: true });
  }
}
