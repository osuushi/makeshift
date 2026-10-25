import assert from "node:assert/strict";
import { displaySettings } from "./ui-decorator-display.mjs";
import { previewReady, previewStats } from "./ui-decorator-worker-control.mjs";
import { inspect } from "./ui-helpers.mjs";
import { pickThreadFace } from "./ui-preview-fallback-helpers.mjs";
import { chooseTool } from "./ui-tools.mjs";

export async function displayOverrideRoute(page, original) {
  await pickThreadFace(page, original);
  const display = page.getByRole("combobox", { name: "Decorator display", exact: true });
  const acceptedDisplay = (mode) =>
    page.waitForFunction(
      (mode) => (window.makeshiftInspect().document.decorators[0].display ?? "default") === mode,
      mode,
    );
  const chooseDisplay = async (mode) => {
    await display.selectOption(mode);
    // Native edits are asynchronous; a previously ready preview is not the new mode's result.
    await acceptedDisplay(mode);
  };
  assert.equal(await display.inputValue(), "default");
  const defaultMode = (mode) =>
    displaySettings(page, (dialog) =>
      dialog
        .getByRole("combobox", { name: "Default decorator display", exact: true })
        .selectOption(mode),
    );
  await chooseDisplay("detailed");
  await previewReady(page);
  let state = await inspect(page);
  assert.equal(state.document.decorators[0].display, "detailed");
  const geometryTriangles = state.decoratorPreviewBounds[0].triangles;
  await defaultMode("color-only");
  await previewReady(page);
  state = await inspect(page);
  assert.equal(
    state.decoratorPreviewBounds[0].triangles,
    geometryTriangles,
    "An explicit Geometry override ignores the application default",
  );
  await chooseDisplay("texture");
  await previewReady(page);
  state = await inspect(page);
  const face = original.bodies[0].faces.find((face) => face.cylinder);
  assert.equal(
    state.decoratorPreviewBounds[0].triangles,
    face.vertices.length / 9,
    "Texture still generates while the default is Color only",
  );
  await chooseDisplay("default");
  state = await inspect(page);
  assert.equal(state.document.decorators[0].display, undefined);
  assert.equal(state.decoratorPreviewBounds.length, 0);
  await chooseTool(page, "undo", "undo");
  await acceptedDisplay("texture");
  await previewReady(page);
  assert.equal((await inspect(page)).document.decorators[0].display, "texture");
  await chooseTool(page, "redo", "redo");
  await acceptedDisplay("default");
  assert.equal((await inspect(page)).decoratorPreviewBounds.length, 0);
  await chooseDisplay("color-only");
  await inspect(page);
  const posts = (await previewStats(page)).posts;
  await defaultMode("texture");
  state = await inspect(page);
  assert.equal(state.decoratorPreviewBounds.length, 0);
  assert.equal(
    (await previewStats(page)).posts,
    posts,
    "Color only never schedules expensive jobs",
  );
  await chooseDisplay("default");
  await previewReady(page);
  assert.deepEqual((await inspect(page)).document, original);
}
