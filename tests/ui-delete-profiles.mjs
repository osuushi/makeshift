import assert from "node:assert/strict";
import { project } from "./ui-blend-edit.mjs";
import { drag, inspect, reset, settled } from "./ui-helpers.mjs";
import { chooseTool } from "./ui-tools.mjs";

export async function deleteProfilesRoute(page, name) {
  for (const [points, expectedArea, expectedFaces] of [
    [[[24, 0]], 400 * Math.PI, 2],
    [[[0, 0]], 800 * Math.PI - (800 * Math.acos(0.6) - 384), 1],
    [
      [
        [24, 0],
        [0, 0],
      ],
      400 * Math.PI - (800 * Math.acos(0.6) - 384),
      1,
    ],
  ]) {
    await reset(page);
    await chooseTool(page, "Sketch on XY", "sketch-xy");
    await chooseTool(page, "circle", "circle");
    await drag(page, [-12, 0], [-32, 0], ["Shift"]);
    await page.keyboard.press("Escape");
    await page.keyboard.press("c");
    await drag(page, [12, 0], [32, 0], ["Shift"]);
    const before = (await inspect(page)).document;
    assert.equal(before.sketches[0].curves.length, 2);
    for (const curve of before.sketches[0].curves) assert.ok(Math.abs(curve.radius - 20) < 1e-7);
    await chooseTool(page, "return to modeling", "modeling");
    for (let i = 0; i < points.length; i++) {
      if (i) await page.keyboard.down("Shift");
      const p = await project(page, [...points[i], 0]);
      await page.mouse.click(p.x, p.y);
      if (i) await page.keyboard.up("Shift");
    }
    const selected = (await inspect(page)).modelingSelection;
    assert.equal(selected.length, points.length);
    assert.ok(selected.every((t) => t.kind === "profile"));
    await page.keyboard.press("Backspace");
    await settled(page);
    const after = (await inspect(page)).document;
    assert.notDeepEqual(after, before);
    assert.equal((await inspect(page)).modelingSelection.length, 0);
    // Select surviving faces through the viewport and sum their inspected analytic areas.
    let p = await project(page, [-24, 0, 0]);
    await page.mouse.click(p.x, p.y);
    let faces = (await inspect(page)).modelingSelection;
    if (expectedFaces === 2) {
      await page.keyboard.down("Shift");
      p = await project(page, [0, 0, 0]);
      await page.mouse.click(p.x, p.y);
      await page.keyboard.up("Shift");
      faces = (await inspect(page)).modelingSelection;
    }
    assert.equal(faces.length, expectedFaces);
    assert.ok(Math.abs(faces.reduce((sum, t) => sum + t.area, 0) - expectedArea) < 1e-5);
    // Undo may first restore selection clicks; navigate until the one geometry edit returns.
    for (
      let i = 0;
      i < 4 && JSON.stringify((await inspect(page)).document) !== JSON.stringify(before);
      i++
    ) {
      await chooseTool(page, "undo", "undo");
    }
    assert.deepEqual((await inspect(page)).document, before);
    assert.deepEqual((await inspect(page)).modelingSelection, selected);
    await chooseTool(page, "redo", "redo");
    assert.deepEqual((await inspect(page)).document, after);
    // Ordinary reselection and another Delete remain available on the trimmed geometry.
    await page.keyboard.press("Escape");
    p = await project(page, [-24, 0, 0]);
    await page.mouse.click(p.x, p.y);
    await chooseTool(page, "delete", "delete");
    assert.notDeepEqual((await inspect(page)).document, after);
  }
  console.log(
    `${name}: sketch face selection, Delete, region areas, Undo/Redo and reselection passed`,
  );
}
