import assert from "node:assert/strict";
import { orient, project } from "./ui-blend-edit.mjs";
import { close, drag, inspect, reset } from "./ui-helpers.mjs";
import { button, completed, cycle, field, ready } from "./ui-reopen-cycle.mjs";
import { chooseTool } from "./ui-tools.mjs";
export async function reopenLoft(page, name) {
  await reset(page);
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  for (let index = 0; index < 3; index++) {
    if (index) {
      await button(page, `Select Sketch ${index}`).click();
      await chooseTool(page, "New sketch on this plane", "new-sketch-on-plane");
    }
    await page.keyboard.press("r");
    const center = (index - 1) * 12,
      half = [5, 2, 4][index];
    await drag(page, [center - half, -half], [center + half, half], ["Shift"]);
    for (const label of ["Width", "Height"]) {
      await field(page, label).fill(String(half * 2));
      await page.keyboard.press("Enter");
      await inspect(page);
    }
    await chooseTool(page, "return to modeling", "modeling");
    await completed(page);
    if (index) {
      await orient(page, [1, 1, 1]);
      await button(page, `Select Sketch ${index + 1}`).click();
      await chooseTool(page, "transform", "transform");
      await button(page, "Move sketch Z").click();
      await field(page, "Translation Z").fill("10");
      await page.keyboard.press("Enter");
      await completed(page);
      await page.keyboard.press("Escape");
    }
  }
  const before = (await inspect(page)).document;
  const source = await orderedProfiles(page, before);
  await chooseTool(page, "loft", "loft");
  await page.getByRole("combobox", { name: "Loft shape", exact: true }).selectOption("ruled");
  const state = await ready(page, "Accept loft");
  const expected = (10 / 3) * (100 + 40 + 16 + 16 + 32 + 64);
  assert.ok(Math.abs(state.preview.bodies[0].volume - expected) < 1e-5);
  await button(page, "Accept loft").click();
  await cycle(page, {
    before,
    kind: "loft",
    selection: source.modelingSelection,
    sketchSelection: source.selectionTargets,
    cancel: "Cancel loft",
    accept: "Accept loft",
    name,
    check: async ({ operation: loft }) => {
      assert.deepEqual(
        loft.sources.map((source) => source.sketch),
        before.sketches.toReversed().map((sketch) => sketch.id),
      );
      assert.equal(loft.ruled, true);
      assert.equal(
        await page.getByRole("combobox", { name: "Loft shape", exact: true }).inputValue(),
        "ruled",
      );
      assert.equal(await page.locator(".loft-controls li").count(), 3);
    },
    change: () =>
      page.getByRole("combobox", { name: "Loft shape", exact: true }).selectOption("smooth"),
    validate: async (geometry, parameters, original, accepted) => {
      assert.ok(
        Math.abs(geometry.bodies[0].volume - accepted.bodies[0].volume) > 1,
        "smooth shape differs materially from ruled",
      );
      if (parameters)
        assert.deepEqual(parameters.operation, { ...original.operation, ruled: false });
    },
  });
}

/** Pick separate filled sections in reverse order, preserving actual UI selection intent. */
async function orderedProfiles(page, before) {
  await page.keyboard.press("Escape");
  await orient(page, [0, 0, 1]);
  const centers = before.sketches.map((sketch, index) => {
    const points = sketch.curves.flatMap((curve) => {
      assert.equal(curve.kind, "segment");
      return [curve.a, curve.b];
    });
    const xs = points.map((point) => point.x),
      ys = points.map((point) => point.y);
    const bounds = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
    close(bounds[2] - bounds[0], [10, 4, 8][index], "independent section width");
    close(bounds[3] - bounds[1], [10, 4, 8][index], "independent section height");
    close(sketch.plane.origin[2], index * 10, "independent section elevation");
    const x = (bounds[0] + bounds[2]) / 2,
      y = (bounds[1] + bounds[3]) / 2;
    return sketch.plane.origin.map(
      (value, i) => value + sketch.plane.u[i] * x + sketch.plane.v[i] * y,
    );
  });
  for (let index = 2; index >= 0; index--) {
    const point = await project(page, centers[index]);
    assert.equal(
      await page
        .locator("#world canvas")
        .evaluate((canvas, p) => document.elementFromPoint(p.x, p.y) === canvas, point),
      true,
      "section center is reachable through the actual canvas",
    );
    if (index < 2) await page.keyboard.down("Shift");
    await page.mouse.click(point.x, point.y);
    if (index < 2) await page.keyboard.up("Shift");
    const state = await inspect(page);
    assert.ok(state.modelingSelection.every((target) => target.kind === "profile" && target.key));
    for (const [offset, target] of state.modelingSelection.entries()) {
      close(target.area, [100, 16, 64][2 - offset], "independent ordered selected section area");
      assert.equal(target.holes, 0);
    }
    assert.deepEqual(
      state.modelingSelection.map((target) => target.sketch),
      before.sketches
        .slice(index)
        .toReversed()
        .map((sketch) => sketch.id),
    );
  }
  const source = await inspect(page);
  assert.equal(source.commands.find((command) => command.id === "loft").unavailable, null);
  return source;
}
