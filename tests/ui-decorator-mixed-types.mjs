import assert from "node:assert/strict";
import { orient } from "./ui-blend-edit.mjs";
import { openThreadAdvanced } from "./ui-decorator-advanced.mjs";
import { worldClick } from "./ui-face-offset.mjs";
import { inspect } from "./ui-helpers.mjs";
import { clearSelection } from "./ui-reconnection-helpers.mjs";
import { chooseTool } from "./ui-tools.mjs";

export async function mixedDecoratorTypesRoute(page) {
  const original = (await inspect(page)).document;
  const body = original.bodies[0];
  const cylinder = body.faces.find((f) => f.cylinder);
  const cap = body.faces.filter((f) => f.plane).sort((a, b) => b.signature[5] - a.signature[5])[0];
  const [cx, cy] = cylinder.cylinder.origin;
  const radial = cylinder.cylinder.radius / Math.sqrt(2);
  const side = [cx + radial, cy - radial, cylinder.signature[5]];
  const top = [cap.signature[3] + 2, cap.signature[4] - 2, cap.signature[5]];
  await clearSelection(page);
  await orient(page, [1, -1, 1]);
  await page.getByRole("button", { name: "Right Front Top view", exact: true }).focus();
  await page.keyboard.press("Enter");
  await inspect(page);
  await worldClick(page, side);
  const picked = await inspect(page);
  assert.deepEqual(
    picked.modelingSelection.map(({ kind, body, face }) => ({ kind, body, face })),
    [{ kind: "face", body: body.id, face: cylinder.id }],
    JSON.stringify({
      side,
      bounds: body.bounds,
      cylinder: cylinder.cylinder,
      camera: picked.camera,
      selection: picked.modelingSelection,
    }),
  );
  await chooseTool(page, "threads", "threads");
  const applied = (await inspect(page)).document;
  const pad = applied.decorators.find((d) => d.definition !== "freac.threads");
  const thread = applied.decorators.find((d) => d.definition === "freac.threads");
  await worldClick(page, top, true);
  await openThreadAdvanced(page);
  const pitch = page.getByRole("spinbutton", { name: "Pitch", exact: true });
  const height = page.getByRole("spinbutton", { name: "Height", exact: true });
  assert.equal(await pitch.count(), 1);
  assert.equal(await height.count(), 1);
  await pitch.fill("3");
  await pitch.press("Enter");
  let state = await inspect(page);
  assert.deepEqual(
    state.document.decorators.find((d) => d.id === pad.id),
    pad,
  );
  assert.equal(state.document.decorators.find((d) => d.id === thread.id).settings.pitch, 3);
  assert.equal(state.modelingSelection.length, 1);
  await chooseTool(page, "undo", "undo");
  await clearSelection(page);
  await worldClick(page, side);
  await worldClick(page, top, true);
  await page
    .getByRole("button", { name: "Remove thread decorator from selected faces", exact: true })
    .click();
  assert.deepEqual((await inspect(page)).document.decorators, [pad]);
  await chooseTool(page, "undo", "undo");
  await clearSelection(page);
  await worldClick(page, side);
  await worldClick(page, top, true);
  await height.fill("3");
  await height.press("Enter");
  state = await inspect(page);
  assert.deepEqual(
    state.document.decorators.find((d) => d.id === thread.id),
    thread,
  );
  assert.equal(state.document.decorators.find((d) => d.id === pad.id).settings.height, 3);
  assert.equal(state.modelingSelection.length, pad.faces.length);
  await chooseTool(page, "undo", "undo");
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document, original);
}
