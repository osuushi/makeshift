import assert from "node:assert/strict";
import { filletGuidePoint } from "./ui-fillet-guide-helpers.mjs";
import {
  at,
  click,
  close,
  drag,
  inspect,
  modalCompleted,
  pointEquals,
  reset,
} from "./ui-helpers.mjs";
import { switchUndoRedo } from "./ui-mode-switch-history.mjs";
import {
  browsePreview,
  knownPreviewHistory,
  rejectPreviewSwitch,
  undoPreview,
} from "./ui-mode-switch-preview-helpers.mjs";
import { chooseTool } from "./ui-tools.mjs";

async function line(page, from, to) {
  await page.keyboard.press("l");
  for (const position of [from, to]) {
    const point = await at(page, ...position);
    close(point.x, Math.round(point.x), "fixed seed client x");
    close(point.y, Math.round(point.y), "fixed seed client y");
  }
  await drag(page, from, to, ["Shift"]);
}
async function heldPreviewGuard(page, kind, before) {
  const handle =
    kind === "fillet"
      ? await filletGuidePoint(page)
      : await page.getByRole("button", { name: "Offset edge", exact: true }).boundingBox();
  const point =
    kind === "fillet"
      ? handle
      : { x: handle.x + handle.width / 2, y: handle.y + handle.height / 2 };
  await page.mouse.move(point.x, point.y);
  await page.mouse.down();
  try {
    assert.equal((await inspect(page)).interaction.kind, kind);
    await page.keyboard.press("Meta+f");
    assert.equal(await page.getByRole("dialog", { name: "Find a tool" }).isVisible(), false);
    await page.keyboard.press("r");
    const held = await inspect(page);
    assert.equal(held.interaction.kind, kind);
    assert.notEqual(held.tool, "rectangle");
    assert.deepEqual(held.document, before.document);
    const input = page.getByRole("textbox", {
      name: kind === "fillet" ? "Fillet radius" : "Offset distance",
      exact: true,
    });
    await input.fill(kind === "fillet" ? "-1" : "0");
    assert.equal((await inspect(page)).preview, null);
  } finally {
    await page.mouse.up();
  }
  if (kind === "offset") {
    assert.equal(
      (await inspect(page)).interaction.kind,
      "offset",
      "Invalid released Offset stays owned",
    );
    await page.keyboard.press("Escape");
  }
  await modalCompleted(page);
  const cancelled = await inspect(page);
  assert.deepEqual(cancelled.document, before.document);
  assert.deepEqual(cancelled.selectionTargets, before.selectionTargets);
}
async function setup(page, kind) {
  await reset(page);
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  if ((await inspect(page)).gridSnap) await chooseTool(page, "grid", "grid");
  assert.equal((await inspect(page)).gridSnap, false);
  if (kind === "fillet") {
    await line(page, [0, 0], [10, 0]);
    await line(page, [0, 0], [0, 10]);
    await page.keyboard.press("v");
    await click(page, 6, 0);
    await page.keyboard.down("Shift");
    try {
      await click(page, 0, 6);
    } finally {
      await page.keyboard.up("Shift");
    }
    const curves = (await inspect(page)).document.sketches[0].curves;
    assert.equal(curves.length, 2);
    pointEquals(curves[0].a, [0, 0]);
    pointEquals(curves[0].b, [10, 0]);
    pointEquals(curves[1].a, [0, 0]);
    pointEquals(curves[1].b, [0, 10]);
  } else {
    await line(page, [-8, 0], [8, 0]);
    const curves = (await inspect(page)).document.sketches[0].curves;
    assert.equal(curves.length, 1);
    pointEquals(curves[0].a, [-8, 0]);
    pointEquals(curves[0].b, [8, 0]);
  }
  const before = await inspect(page),
    history = await knownPreviewHistory(page, before);
  await heldPreviewGuard(page, kind, before);
  await chooseTool(
    page,
    kind === "fillet" ? "Fillet sketch corner" : "Offset sketch curves",
    `sketch-${kind}`,
  );
  const input = page.getByRole("textbox", {
    name: kind === "fillet" ? "Fillet radius" : "Offset distance",
    exact: true,
  });
  return { before, history, input };
}
function geometry(document, kind, original) {
  const result = document.sketches[0];
  assert.equal(document.sketches.length, 1);
  assert.equal(result.curves.length, kind === "fillet" ? 3 : 2);
  if (kind === "fillet") {
    pointEquals(result.curves[0].a, [2, 0]);
    pointEquals(result.curves[0].b, [10, 0]);
    pointEquals(result.curves[1].a, [0, 2]);
    pointEquals(result.curves[1].b, [0, 10]);
    const arc = result.curves.find((curve) => curve.kind === "arc");
    assert.ok(arc);
    pointEquals(arc.a, [2, 0]);
    pointEquals(arc.b, [0, 2]);
    close(arc.bulge, -Math.tan(Math.PI / 8), "quarter circle bulge");
    assert.equal(result.constraints.filter((c) => c.kind === "tangent").length, 2);
    assert.equal(result.constraints.filter((c) => c.kind === "coincident").length, 2);
    return [arc.id];
  }
  assert.deepEqual(result.curves[0], original.sketches[0].curves[0]);
  assert.deepEqual(result.constraints, original.sketches[0].constraints);
  pointEquals(result.curves[1].a, [-8, 2]);
  pointEquals(result.curves[1].b, [8, 2]);
  return [result.curves[1].id];
}
async function numericPreviewSwitch(page, name, kind) {
  const { before, history, input } = await setup(page, kind);
  await input.fill("2");
  geometry((await inspect(page)).preview, kind, before.document);
  await undoPreview(page, before, history);
  await chooseTool(
    page,
    kind === "fillet" ? "Fillet sketch corner" : "Offset sketch curves",
    `sketch-${kind}`,
  );
  await input.fill(kind === "fillet" ? "-1" : "0");
  assert.equal((await inspect(page)).preview, null);
  await chooseTool(page, "Rectangle", "rectangle");
  let state = await inspect(page);
  assert.deepEqual(state.document, before.document);
  assert.equal(state.interaction.kind, kind);
  assert.equal(state.interaction.phase, "editing");
  assert.notEqual(state.tool, "rectangle");
  assert.equal(await input.inputValue(), kind === "fillet" ? "-1" : "0");
  assert.equal(await input.getAttribute("aria-invalid"), "true");
  assert.ok(await page.locator(".local-feedback").textContent());
  await input.fill("2");
  const preview = (await inspect(page)).preview;
  const ids = geometry(preview, kind, before.document);
  await browsePreview(page, kind, before.document, preview, input);
  await rejectPreviewSwitch(page, kind, before, preview, input);
  await chooseTool(page, "Rectangle", "rectangle");
  await modalCompleted(page);
  state = await inspect(page);
  assert.equal(state.tool, "rectangle");
  geometry(state.document, kind, before.document);
  assert.deepEqual(state.document, preview);
  await switchUndoRedo(page, name, before, history.prior, state.document, "preview", {
    sketch: ids.map((curve) => ({ kind: "curve", curve })),
    modeling: [],
  });
  console.log(
    `${name}: numeric ${kind} invalid/rejected owner retention, Tools borrowing, ordinary acceptance and exact geometry/history passed`,
  );
}
export async function sketchFilletSwitchRoute(page, name) {
  await numericPreviewSwitch(page, name, "fillet");
}
export async function sketchOffsetSwitchRoute(page, name) {
  await numericPreviewSwitch(page, name, "offset");
}
