import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { openDocument, saveDocument } from "./native-documents.mjs";
import { orient, project } from "./ui-blend-edit.mjs";
import { at, inspect, reset } from "./ui-helpers.mjs";
import { pickPlane } from "./ui-plane-targets.mjs";
import { projectionRoute } from "./ui-projection.mjs";
import { projectionFacesRoute } from "./ui-projection-faces.mjs";
import { projectionSourcesRoute } from "./ui-projection-sources.mjs";
import { withUiRuntimes } from "./ui-runtime.mjs";
import { chooseTool } from "./ui-tools.mjs";

const fixture = JSON.parse(await readFile("tests/fixtures/projection-tilted-plane.json", "utf8"));
await withUiRuntimes(async (page, name) => {
  await tiltedPlaneRoute(page, name);
  if (process.env.MAKESHIFT_FEEDBACK_ONLY) return;
  await projectionSourcesRoute(page, name);
  // Existing routes use odd millimeter grid positions.
  await page.setViewportSize({ width: 1280, height: 2000 });
  await projectionRoute(page, name);
  await projectionFacesRoute(page, name);
});

async function tiltedPlaneRoute(page, name) {
  await reset(page);
  await openDocument(page, {
    name: "projection-tilted-plane.makeshift",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({ format: "makeshift", version: 1, document: fixture.document }),
    ),
  });
  await orient(page, [1, -2, 1]);
  const before = (await inspect(page)).document;
  const source = await project(page, [0, -20, 0]);
  await page.mouse.click(source.x, source.y);
  assert.ok((await inspect(page)).modelingSelection.length);
  await chooseTool(page, "Project", "project");
  assert.equal(await page.locator('[data-project="sources"], [data-project="target"]').count(), 0);
  // Empty space produces readable feedback, with acceptance still disabled.
  await page.mouse.click(1100, 700);
  await inspect(page);
  assert.equal(
    await page.getByRole("button", { name: "Accept projection", exact: true }).isEnabled(),
    false,
  );
  const feedback = await page.locator(".status.error-feedback").boundingBox();
  assert.ok(feedback);
  assert.ok(feedback.x < 40 && feedback.y > 650, "Failure stays in the lower-left footer");
  await page.mouse.move(700, 200);
  assert.deepEqual(await page.locator(".status.error-feedback").boundingBox(), feedback);
  assert.equal(await page.locator(".local-feedback").count(), 0);
  await page.getByRole("button", { name: "Dismiss error" }).click();
  assert.equal(await page.locator(".status.error-feedback").count(), 0);
  await page.mouse.click(1100, 700);
  await inspect(page);
  assert.equal(await page.locator(".status.error-feedback").count(), 1);
  await page.screenshot({ path: `.cache/sketch-review/${name}-projection-feedback.png` });
  await page.keyboard.press("g");
  assert.equal(await page.locator(".status.error-feedback").count(), 0);
  await page.keyboard.press("g");
  await page.mouse.click(1100, 700);
  await inspect(page);
  assert.equal(await page.locator(".status.error-feedback").count(), 1);
  // A different target can be replaced directly, without mode buttons.
  await pickPlane(page, "XZ");
  assert.ok((await inspect(page)).preview);
  await page.getByRole("button", { name: "Use Plane 1", exact: true }).click();
  let state = await inspect(page);
  assert.equal(await page.locator(".status.error-feedback").isHidden(), true);
  assert.deepEqual(state.document, before);
  const projected = state.preview.sketches.find((s) => s.id !== before.sketches[0].id);
  assert.ok(projected);
  assert.deepEqual(projected.plane, before.constructionPlanes[0].frame);
  assertEllipse(projected);
  await page.screenshot({ path: `.cache/sketch-review/${name}-tilted-projection-preview.png` });
  await page.getByRole("button", { name: "Cancel projection", exact: true }).click();
  assert.deepEqual((await inspect(page)).document, before);
  assert.ok((await inspect(page)).modelingSelection.length);
  if (process.env.MAKESHIFT_FEEDBACK_ONLY) {
    console.log(
      `${name}: fixed error box, hover persistence, dismiss, keyboard and next-action clearing passed`,
    );
    return;
  }
  const target = await project(page, [0, 0, 26]);
  await emptySelectionRoute(page, source, target, before);
  await page.mouse.click(source.x, source.y);
  await chooseTool(page, "Project", "project");
  await page.mouse.click(target.x, target.y);
  await inspect(page);
  await page.keyboard.press("Enter");
  state = await inspect(page);
  const accepted = state.document;
  assert.equal(state.activeSketch, accepted.sketches[1].id);
  assertEllipse(accepted.sketches[1]);
  await chooseTool(page, "Undo", "undo");
  assert.deepEqual((await inspect(page)).document, before);
  await chooseTool(page, "Redo", "redo");
  assert.deepEqual((await inspect(page)).document, accepted);
  await editAndReopen(page, name, accepted);
  console.log(
    `${name}: captured tilted plane, target replacement, readable feedback, cancel, Enter, Undo/Redo, cubic edit and archive passed`,
  );
}

async function emptySelectionRoute(page, source, target, before) {
  await page.mouse.click(1100, 100);
  assert.equal((await inspect(page)).modelingSelection.length, 0);
  await chooseTool(page, "Project", "project");
  await page.mouse.click(source.x, source.y);
  assert.equal((await inspect(page)).preview, null);
  await page.mouse.click(target.x, target.y);
  assert.ok((await inspect(page)).preview);
  await page.keyboard.down("Shift");
  await page.mouse.click(source.x, source.y);
  await page.keyboard.up("Shift");
  assert.equal((await inspect(page)).preview, null, "Removing the last source clears preview");
  await page.mouse.click(source.x, source.y);
  assert.ok((await inspect(page)).preview, "Readding a source restores the chosen destination");
  await page.keyboard.press("Escape");
  assert.deepEqual((await inspect(page)).document, before);
  assert.equal((await inspect(page)).modelingSelection.length, 0);
}

function assertEllipse(sketch) {
  assert.ok(sketch.curves.length > 1 && sketch.curves.every((c) => c.kind === "bezier"));
  // Orthogonal projection of R20 XY onto this frame: center (13,0), axes (20 cos30°,20).
  for (const c of sketch.curves)
    for (let i = 0; i <= 60; i++) {
      const t = i / 60,
        s = 1 - t;
      const value = (axis) =>
        s ** 3 * c.a[axis] +
        3 * s ** 2 * t * c.c1[axis] +
        3 * s * t ** 2 * c.c2[axis] +
        t ** 3 * c.b[axis];
      assert.ok(
        Math.abs(Math.hypot((value("x") - 13) / (10 * Math.sqrt(3)), value("y") / 20) - 1) <
          0.001 / (10 * Math.sqrt(3)),
      );
    }
}

async function editAndReopen(page, name, accepted) {
  const cubic = accepted.sketches[1].curves[0];
  const handle = page.locator(`[data-handle="c1"][data-curve="${cubic.id}"]`);
  const box = await handle.boundingBox();
  assert.ok(box, "Projected curve exposes its editing handles");
  const destination = await at(page, cubic.c1.x + 2, cubic.c1.y + 1);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.keyboard.down("Shift");
  await page.mouse.down();
  await page.mouse.move(destination.x, destination.y, { steps: 8 });
  await page.mouse.up();
  await page.keyboard.up("Shift");
  const edited = (await inspect(page)).document;
  assert.notDeepEqual(edited.sketches[1].curves[0].c1, cubic.c1);
  assert.deepEqual(edited.sketches[0], accepted.sketches[0]);
  await chooseTool(page, "Undo", "undo");
  assert.deepEqual((await inspect(page)).document, accepted);
  const path = resolve(`.cache/sketch-review/${name}-tilted-projection.makeshift`);
  await saveDocument(page, path);
  await reset(page);
  await openDocument(page, path);
  assert.deepEqual((await inspect(page)).document, accepted);
}
