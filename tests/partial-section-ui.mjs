import assert from "node:assert/strict";
import { project } from "./ui-blend-edit.mjs";
import { at, drag, inspect, reset } from "./ui-helpers.mjs";
import { findRaycastPoint } from "./ui-plane-targets.mjs";
import { withUiRuntimes } from "./ui-runtime.mjs";
import { cutawayRoute } from "./ui-sketch-cutaway.mjs";
import { chooseTool } from "./ui-tools.mjs";

// Selection-to-GPU composition and real solid previews cannot be proven by plane math alone.
await withUiRuntimes(
  async (page, name) => {
    await cutawayRoute(page, name);
    const facePoint = await project(page, [3.4, 6.4, 12]);
    await page.mouse.click(facePoint.x, facePoint.y);
    const faceState = await inspect(page);
    const faceTarget = faceState.modelingSelection[0];
    assert.equal(faceTarget?.kind, "face");
    assert.equal(faceState.partialSection, null, "Body faces do not trigger automatic sections");
    await page.getByRole("button", { name: "Select Sketch 1", exact: true }).click();
    let state = await inspect(page);
    const accepted = state.document;
    assert.equal(state.activePlane, null);
    assert.deepEqual(state.partialSection, accepted.sketches[0].plane);
    const slider = page.getByRole("slider", { name: "X-ray front opacity", exact: true });
    await page.getByRole("button", { name: "Application settings" }).click();
    assert.equal(await slider.inputValue(), "20");
    await slider.press("Home");
    await page.getByRole("button", { name: "Done", exact: true }).click();
    const clear = await linePixels(page);
    assert.ok(clear[0] < clear[1] - 30, `Zero front opacity reveals sketch ink: ${clear}`);
    await page.getByRole("button", { name: "Application settings" }).click();
    await slider.press("End");
    await page.getByRole("button", { name: "Done", exact: true }).click();
    const opaque = await linePixels(page);
    assert.ok(Math.abs(opaque[0] - opaque[1]) <= 3, `Full front opacity covers ink: ${opaque}`);
    await page.reload();
    await inspect(page);
    await page.getByRole("button", { name: "Application settings" }).click();
    assert.equal(await slider.inputValue(), "100", "Front opacity persists on this device");
    await slider.press("Home");
    await slider.press("PageUp");
    await slider.press("PageUp");
    assert.equal(await slider.inputValue(), "20");
    await page.getByRole("button", { name: "Done", exact: true }).click();
    assert.deepEqual((await inspect(page)).document, accepted, "Opacity never changes geometry");

    await reset(page);
    const point = await findRaycastPoint(page, "XY");
    await page.mouse.click(point.x, point.y);
    state = await inspect(page);
    assert.equal(state.partialSection, null, "Canonical planes do not trigger automatic sections");
    await chooseTool(page, "construction plane", "construction-plane");
    await page.keyboard.press("Enter");
    await inspect(page);
    await page.getByRole("button", { name: "Select Plane 1", exact: true }).click();
    state = await inspect(page);
    assert.equal(state.partialSection, null, "Saved planes do not trigger automatic sections");
    await page.keyboard.press("Escape");
    assert.equal(
      (await inspect(page)).partialSection,
      null,
      "Deselect clears the automatic cutaway",
    );

    await previewRoute(page);
    console.log(
      `${name}: sketch-only automatic sections, front-opacity pixels and persistence, extrusion/revolve lifetime passed`,
    );
  },
  { timeout: 20000 },
);

async function linePixels(page) {
  await page.getByRole("button", { name: "Application settings" }).hover();
  const points = await Promise.all(
    [
      [3.4, 4, 0],
      [3.4, 4.4, 0],
    ].map((p) => project(page, p)),
  );
  const png = await page.screenshot({ scale: "css" });
  return page.evaluate(
    async ({ data, points }) => {
      const image = new Image();
      image.src = `data:image/png;base64,${data}`;
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = image.width;
      canvas.height = image.height;
      const context = canvas.getContext("2d");
      context.drawImage(image, 0, 0);
      return points.map(
        (p) => context.getImageData(Math.round(p.x), Math.round(p.y), 1, 1).data[0],
      );
    },
    { data: png.toString("base64"), points },
  );
}

async function previewRoute(page) {
  await reset(page);
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  await page.keyboard.press("r");
  await drag(page, [5, -3], [12, 3]);
  const point = await at(page, 8, 1);
  await chooseTool(page, "return to modeling", "modeling");
  await page.mouse.click(point.x, point.y);
  const frame = (await inspect(page)).partialSection;
  assert.ok(frame, "Profile selection supplies the plane");
  await chooseTool(page, "extrude", "extrude");
  const distance = page.getByRole("textbox", { name: "Extrusion distance" });
  if (!(await distance.isVisible()))
    await page.getByRole("button", { name: "Drag extrusion", exact: true }).click();
  await distance.fill("5");
  await page.keyboard.press("Enter");
  let state = await inspect(page);
  assert.ok(state.preview.bodies.length);
  assert.deepEqual(state.partialSection, frame);
  await page.keyboard.press("Escape");
  await page.mouse.click(point.x, point.y);
  assert.equal((await inspect(page)).modelingSelection[0]?.kind, "profile");
  await chooseTool(page, "revolve", "revolve");
  const axis = await project(page, [0, -4, 0]);
  await page.mouse.click(axis.x, axis.y);
  state = await inspect(page);
  assert.equal(state.interaction?.kind, "revolve");
  assert.ok(state.preview?.bodies.length, "Real native revolution preview");
  assert.deepEqual(state.partialSection, frame);
  await page.getByRole("textbox", { name: "Revolution angle", exact: true }).fill("180");
  state = await inspect(page);
  assert.ok(state.preview?.bodies.length);
  assert.deepEqual(state.partialSection, frame);
  await page.keyboard.press("Escape");
  assert.equal((await inspect(page)).document.bodies?.length ?? 0, 0);
}
