import assert from "node:assert/strict";
import { openDocument } from "./native-documents.mjs";
import { decoratorCylinder } from "./ui-decorator-cylinder.mjs";
import { worldClick } from "./ui-face-offset.mjs";
import { inspect } from "./ui-helpers.mjs";
import { relativeOffsetInput } from "./ui-offset-input.mjs";
import { previewActionReady } from "./ui-preview-readiness.mjs";
import { withUiRuntimes } from "./ui-runtime.mjs";
import { chooseTool } from "./ui-tools.mjs";

await withUiRuntimes(
  async (page, name) => {
    await decoratorCylinder(page, 10);
    await chooseTool(page, "threads", "threads");
    const before = (await inspect(page)).document.decorators[0];
    assert.equal(before.settings.preset, "fdm-fine");
    await page.getByRole("button", { name: "Offset faces", exact: true }).click();
    await (await relativeOffsetInput(page)).fill("-9.5");
    await previewActionReady(page, "Accept face offset");
    await page.getByRole("button", { name: "Accept face offset", exact: true }).click();
    const resized = (await inspect(page)).document;
    assert.match(resized.decorators[0].problem, /too deep/);
    await worldClick(page, [25, 0, 5]);
    const panel = page.getByRole("region", { name: "Decorators", exact: true });
    assert.equal(await panel.isVisible(), false);
    assert.equal(
      (await inspect(page)).bodyRendering.faces.filter((f) => f.decoratorInvalid).length,
      1,
    );
    await page.screenshot({ path: `.cache/sketch-review/${name}-thread-error-deselected.png` });
    await worldClick(page, [0, -0.5, 5]);
    assert.equal(await panel.isVisible(), true);
    assert.match(await panel.innerText(), /Threads need correction/);
    assert.equal(
      await page.getByRole("button", { name: "Use selected faces for these threads" }).count(),
      0,
    );
    assert.equal(
      await page.getByRole("spinbutton", { name: "Pitch", exact: true }).isVisible(),
      true,
    );
    await page.screenshot({ path: `.cache/sketch-review/${name}-thread-error-editor.png` });
    // Radius recovery must clear the error in both temporary and accepted geometry.
    await page.getByRole("button", { name: "Offset faces", exact: true }).click();
    await (await relativeOffsetInput(page)).fill("5");
    await previewActionReady(page, "Accept face offset");
    assert.equal((await inspect(page)).preview.decorators[0].problem, undefined);
    await page.getByRole("button", { name: "Accept face offset", exact: true }).click();
    const { camera, document: restored } = await inspect(page);
    assert.equal(restored.decorators[0].problem, undefined);
    assert.deepEqual(restored.decorators[0].settings, before.settings);
    assert.equal(
      (await inspect(page)).bodyRendering.faces.some((f) => f.decoratorInvalid),
      false,
    );
    for (const label of [
      "Select affected geometry",
      "Use selected faces for these threads",
      "Remove unresolved thread decorator",
    ])
      assert.equal(await page.getByRole("button", { name: label, exact: true }).count(), 0);
    await chooseTool(page, "undo", "undo");
    assert.deepEqual((await inspect(page)).document, resized);
    await chooseTool(page, "redo", "redo");
    assert.deepEqual((await inspect(page)).document, restored);
    await chooseTool(page, "undo", "undo");
    await page.getByRole("combobox", { name: "Preset", exact: true }).selectOption("metric");
    const corrected = (await inspect(page)).document;
    assert.equal(corrected.decorators[0].problem, undefined);
    assert.equal(
      (await inspect(page)).bodyRendering.faces.some((f) => f.decoratorInvalid),
      false,
    );
    assert.equal(corrected.decorators[0].id, before.id);
    assert.deepEqual(corrected.bodies, resized.bodies);
    await chooseTool(page, "undo", "undo");
    assert.deepEqual((await inspect(page)).document, resized);
    await chooseTool(page, "redo", "redo");
    assert.deepEqual((await inspect(page)).document, corrected);
    console.log(
      `${name}: invalid thread fields, radius recovery in preview/acceptance, no thread repair controls, settings correction and Undo/Redo passed`,
    );
    await orphanedThreadRepair(page, restored, camera);
  },
  { timeout: 30000 },
);

async function orphanedThreadRepair(page, document, camera) {
  // A saved orphan has no selectable face to bring up the ordinary thread editor.
  const original = document.decorators[0];
  const orphan = {
    ...original,
    faces: [{ body: original.faces[0].body, face: "removed-thread-face" }],
    frame: { ...original.frame, origin: [20, 0, 0] },
    problem: "The decorated faces were removed. Reassign or remove the decoration.",
  };
  await openDocument(page, {
    name: "orphaned-thread.makeshift",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({
        format: "makeshift",
        version: 1,
        camera,
        document: { ...document, decorators: [orphan] },
      }),
    ),
  });
  const repair = page.locator(".decorator-repair");
  const opened = await inspect(page);
  assert.deepEqual(opened.modelingSelection, []);
  await repair.getByText(/Threads · Body 1 · needs attention/).click();
  await repair.getByRole("button", { name: "Select affected geometry", exact: true }).click();
  assert.deepEqual((await inspect(page)).modelingSelection, [
    { kind: "body", body: original.faces[0].body },
  ]);
  await repair
    .getByRole("button", { name: "Use selected faces for these threads", exact: true })
    .click();
  await page.getByRole("group", { name: "Select tool inputs", exact: true }).waitFor();
  await worldClick(page, [0, -5.5, 5]);
  await page.waitForFunction(() => !window.makeshiftInspect().document.decorators[0].problem);
  const reassigned = (await inspect(page)).document.decorators[0];
  assert.equal(reassigned.id, original.id);
  assert.deepEqual(reassigned.faces, original.faces);
  assert.deepEqual(reassigned.settings, original.settings);
  assert.equal(reassigned.problem, undefined);
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document.decorators, opened.document.decorators);
  const remove = repair.getByRole("button", { name: "Remove unresolved thread decorator" });
  if (!(await remove.isVisible())) await repair.locator("summary").click();
  await remove.click();
  assert.deepEqual((await inspect(page)).document.decorators, []);
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document.decorators, opened.document.decorators);
  await chooseTool(page, "redo", "redo");
  assert.deepEqual((await inspect(page)).document.decorators, []);
}
