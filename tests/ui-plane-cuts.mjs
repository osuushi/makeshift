import assert from "node:assert/strict";
import { resolve } from "node:path";
import { openDocument, saveDocument } from "./native-documents.mjs";
import { orient } from "./ui-blend-edit.mjs";
import { worldClick } from "./ui-face-offset.mjs";
import { at, drag, inspect, modalCompleted, reset, settled } from "./ui-helpers.mjs";
import { planeHover } from "./ui-plane-hover.mjs";
import { pickPlane } from "./ui-plane-targets.mjs";
import { previewActionReady } from "./ui-preview-readiness.mjs";
import { chooseTool, toolEnabled } from "./ui-tools.mjs";

async function startCut(page, mode) {
  const requests = [];
  const observe = (request) => {
    if (request.url().endsWith("/sketch-api")) requests.push(request.postDataJSON()?.kind);
  };
  page.on("request", observe);
  await chooseTool(page, mode, mode === "Imprint" ? "imprint" : "split");
  await settled(page);
  page.off("request", observe);
  assert.ok(
    !requests.includes("check-plane-cut"),
    "Picking references must not run native trial cuts",
  );
  assert.equal(await page.locator(".plane-widget").count(), 0);
  assert.equal(await page.locator(".plane-cut-widget").isVisible(), true);
  assert.equal(
    await page.getByRole("button", { name: `Accept ${mode}`, exact: true }).isDisabled(),
    true,
  );
  assert.match(await page.locator(".plane-cut-inputs").textContent(), /Target · Body 1/);
  assert.match(
    await page.locator(".plane-cut-inputs").textContent(),
    /Cutter · Choose a reference/,
  );
  const state = await inspect(page);
  assert.ok(state.bodyRendering.planeCutTargets.length, "Targets stay visible while picking");
  assert.ok(await page.locator(".plane-candidate-outlines polyline").count());
  assert.equal(
    (await inspect(page)).planeTargets.find((p) => p.id === "XY").visible,
    false,
    "Coplanar world plane excluded",
  );
}
export async function planeCutRoute(page, name) {
  await reset(page);
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  await page.keyboard.press("r");
  await drag(page, [-10, -10], [10, 10]);
  const center = await at(page, 0, 0);
  await chooseTool(page, "return to modeling", "modeling");
  await page.mouse.click(center.x, center.y);
  await page.getByRole("textbox", { name: "Extrusion distance", exact: true }).fill("20");
  await settled(page);
  await previewActionReady(page, "Accept extrusion");
  await page.getByRole("button", { name: "Accept extrusion", exact: true }).click();
  await modalCompleted(page);
  await worldClick(page, [0, 0, 20]);
  assert.equal((await inspect(page)).modelingSelection[0]?.kind, "face");
  await chooseTool(page, "construction plane", "construction-plane");
  let state = await inspect(page);
  assert.equal(
    state.document.constructionPlanes.length,
    1,
    "Selected planar face creates immediately",
  );
  assert.equal(state.preview, null);
  assert.equal(await page.locator(".plane-widget").count(), 0);
  await orient(page, [1, -1, 1]);
  await chooseTool(page, "transform", "transform");
  await page.getByRole("button", { name: "Move plane Z", exact: true }).click();
  await page.getByRole("textbox", { name: "Plane translation Z", exact: true }).fill("-10");
  await page.keyboard.press("Enter");
  const original = (await inspect(page)).document;
  await page.getByRole("button", { name: "Select Body 1", exact: true }).click();
  assert.equal(!(await toolEnabled(page, "imprint", "imprint")), true);
  await falsePositiveReference(page, original);
  await faceSubset(page, original, name);
  const imprinted = (await inspect(page)).document;
  const path = resolve(`.cache/plane-probe/${name}-imprint.makeshift`);
  await saveDocument(page, path);
  await openDocument(page, path);
  assert.deepEqual(
    (await inspect(page)).document.bodies[0].edges.map((e) => e.id),
    imprinted.bodies[0].edges.map((e) => e.id),
  );
  await page.getByRole("button", { name: "Hide Plane 1", exact: true }).click();
  await orient(page, [0, -1, 0]);
  await worldClick(page, [0, -10, 10]);
  state = await inspect(page);
  assert.equal(state.modelingSelection[0]?.kind, "edge");
  assert.ok(!original.bodies[0].edges.some((e) => e.id === state.modelingSelection[0].edge));
  await chooseTool(page, "transform", "transform");
  await page.getByRole("button", { name: "Move edges Z", exact: true }).click();
  await page.getByRole("textbox", { name: "Edge translation Z", exact: true }).fill("2");
  await settled(page);
  assert.ok((await inspect(page)).preview, await page.getByRole("status").textContent());
  await page.getByRole("button", { name: "Accept edge movement", exact: true }).click();
  assert.notEqual((await inspect(page)).document.bodies[0].brep, imprinted.bodies[0].brep);
  await chooseTool(page, "undo", "undo");
  await openDocument(page, path);
  await splitBody(page, name);
  console.log(name, "direct plane cuts passed");
}
async function faceSubset(page, original, name) {
  await page.keyboard.press("Escape");
  await orient(page, [1, -1, 1]);
  // Pick exposed portions of these faces, above the saved plane and away from world planes.
  await worldClick(page, [3, -10, 12]);
  await worldClick(page, [10, -3, 12], true);
  assert.equal((await inspect(page)).modelingSelection.length, 2);
  await chooseTool(page, "imprint", "imprint");
  await page.keyboard.press("Escape");
  assert.deepEqual((await inspect(page)).document, original, "Escape exits reference picking");
  await startCut(page, "Imprint");
  await page.screenshot({ path: `.cache/plane-probe/${name}-candidates.png` });
  await planeHover(page, [16, -16, 10], `${name}-saved`);
  await worldClick(page, [16, -16, 10]);
  let s = await inspect(page);
  assert.equal(s.preview.bodies[0].faces.length, 8);
  assert.deepEqual(s.document, original);
  assert.equal(
    s.bodyRendering.planeCutTargets.length,
    2,
    "Only Imprint's selected faces are tinted",
  );
  await assertFeedback(page, s, "Plane 1");
  await page.screenshot({ path: `.cache/plane-probe/${name}-imprint-preview.png` });
  await planeHover(page, [0, -16, 16], `${name}-world`);
  await worldClick(page, [0, -16, 16]);
  assert.equal(
    (await inspect(page)).preview.bodies[0].faces.length,
    7,
    "Another reference replaces the preview",
  );
  await page.getByRole("button", { name: "Use Plane 1", exact: true }).first().click();
  assert.equal((await inspect(page)).preview.bodies[0].faces.length, 8);
  await chooseTool(page, "undo", "undo");
  assert.equal((await inspect(page)).preview.bodies[0].faces.length, 7);
  assert.match(await page.locator(".plane-cut-inputs").textContent(), /Cutter · YZ world plane/);
  await chooseTool(page, "redo", "redo");
  await assertFeedback(page, await inspect(page), "Plane 1");
  await page.getByRole("button", { name: "Cancel plane cut", exact: true }).click();
  assert.deepEqual((await inspect(page)).document, original);
  assert.equal((await inspect(page)).modelingSelection.length, 2);
  assert.equal(await page.locator(".plane-cut-widget").isVisible(), false);
  assert.deepEqual((await inspect(page)).bodyRendering.planeCutEdges, []);
  await hideCanonicalReferences(page);
  await startCut(page, "Imprint");
  await page.getByRole("button", { name: "Use Plane 1", exact: true }).first().click();
  await settled(page);
  await page.mouse.click(300, 750);
  s = await inspect(page);
  assert.equal(s.document.bodies[0].faces.length, 8, "Deselect accepts preview");
  assert.equal(s.modelingSelection.length, 0);
  await page.getByRole("button", { name: "Application settings" }).click();
  await page.getByRole("button", { name: "Reset grid display" }).click();
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document, original);
  await chooseTool(page, "redo", "redo");
  assert.equal((await inspect(page)).document.bodies[0].faces.length, 8);
}
async function hideCanonicalReferences(page) {
  // Full-view references occupy the old blank corner. Hide them to exercise
  // the actual empty-canvas deselection/acceptance route.
  await page.getByRole("button", { name: "Application settings" }).click();
  await page.getByRole("slider", { name: "Grid opacity", exact: true }).press("Home");
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await settled(page);
}
async function splitBody(page, name) {
  await settled(page);
  const show = page.getByRole("button", { name: "Show Plane 1", exact: true });
  if (await show.count()) await show.click();
  await page.getByRole("button", { name: "Select Body 1", exact: true }).click();
  await startCut(page, "Split Body");
  await orient(page, [1, -1, 1]);
  assert.equal((await inspect(page)).preview, null, "Orbit while picking does not choose a plane");
  await worldClick(page, [16, -16, 10]);
  assert.equal((await inspect(page)).preview.bodies.length, 2);
  await page.keyboard.press("Escape");
  assert.equal((await inspect(page)).document.bodies.length, 1);
  await startCut(page, "Split Body");
  await page.getByRole("button", { name: "Use Plane 1", exact: true }).first().click();
  assert.equal((await inspect(page)).preview.bodies.length, 2);
  const preview = await inspect(page);
  await assertFeedback(page, preview, "Plane 1");
  await page.screenshot({ path: `.cache/plane-probe/${name}-split-preview.png` });
  await page.getByRole("button", { name: "Accept Split Body", exact: true }).click();
  const accepted = await inspect(page);
  assert.equal(accepted.modelingSelection.length, preview.bodyRendering.planeCutEdges.length);
  assert.ok(
    accepted.modelingSelection.every((target) => target.kind === "edge"),
    "Apply keeps section edges selected",
  );
  assert.match(await page.getByRole("status").textContent(), /Split Body applied/);
  assert.equal(await page.locator(".plane-cut-inputs").count(), 0);
  assert.deepEqual(accepted.bodyRendering.planeCutTargets, []);
  const split = (await inspect(page)).document;
  assert.equal(split.bodies.length, 2);
  assert.ok(Math.abs(split.bodies.reduce((n, b) => n + b.volume, 0) - 8000) < 1e-6);
  await chooseTool(page, "undo", "undo");
  assert.equal((await inspect(page)).document.bodies.length, 1);
  await chooseTool(page, "redo", "redo");
  assert.equal((await inspect(page)).document.bodies.length, 2);
  await page.screenshot({ path: `.cache/plane-probe/${name}-cuts.png` });
  await page.getByRole("button", { name: "Select Body 1", exact: true }).click();
  await chooseTool(page, "clear selection", "selection-clear");
  assert.deepEqual((await inspect(page)).modelingSelection, []);
  assert.deepEqual((await inspect(page)).document, split);
  await page.getByRole("button", { name: "Select Body 1", exact: true }).click();
  await page.keyboard.press("Delete");
  await settled(page);
  assert.equal((await inspect(page)).document.bodies.length, 1, "Result bodies remain deletable");
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document, split, "Undo restores both split bodies");
}

async function falsePositiveReference(page, original) {
  await orient(page, [1, -1, 1]);
  await page.keyboard.press("Escape");
  await worldClick(page, [5, 5, 20]);
  assert.equal((await inspect(page)).modelingSelection[0]?.kind, "face");
  await startCut(page, "Imprint");
  await page.getByRole("button", { name: "Use Plane 1", exact: true }).first().click();
  await settled(page);
  assert.deepEqual(
    (await inspect(page)).document,
    original,
    "Broad-phase false positive preserves geometry",
  );
  assert.match(await page.locator(".plane-cut-status").textContent(), /no valid preview/);
  assert.equal(
    await page.getByRole("button", { name: "Accept Imprint", exact: true }).isDisabled(),
    true,
  );
  assert.deepEqual((await inspect(page)).bodyRendering.planeCutEdges, []);
  await pickPlane(page, "YZ");
  assert.equal(
    (await inspect(page)).preview.bodies[0].faces.length,
    7,
    "Can recover with a plane crossing the selected cap",
  );
  await page.keyboard.press("Escape");
  assert.deepEqual((await inspect(page)).document, original);
}

async function assertFeedback(page, state, cutter) {
  assert.match(
    await page.locator(".plane-cut-inputs").textContent(),
    new RegExp(`Cutter · ${cutter}`),
  );
  assert.match(
    await page.locator(".plane-cut-status").textContent(),
    /Preview · [1-9]\d* section edges highlighted/,
  );
  const highlighted = state.bodyRendering.planeCutEdges;
  assert.ok(highlighted.length);
  for (const target of highlighted) {
    const edge = state.preview.bodies
      .find((b) => b.id === target.body)
      .edges.find((e) => e.id === target.edge);
    assert.ok(edge, "Each highlight identifies an exact selectable result edge");
    for (let i = 2; i < edge.points.length; i += 3) assert.ok(Math.abs(edge.points[i] - 10) < 1e-5);
  }
  assert.equal(
    await page
      .getByRole("button", { name: "Use Plane 1", exact: true })
      .evaluate((button) => button.closest(".entity-row").dataset.booleanRole),
    "tool",
    "Saved cutter has the same role coloring as Boolean cutters",
  );
}
