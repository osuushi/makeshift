import assert from "node:assert/strict";
import { orient, project } from "./ui-blend-edit.mjs";
import { circularFinish, plate } from "./ui-body-fillet.mjs";
import { close, inspect } from "./ui-helpers.mjs";
import { relativeOffsetInput } from "./ui-offset-input.mjs";
import { button, completed, cycle, field, ready } from "./ui-reopen-cycle.mjs";
import { chooseTool } from "./ui-tools.mjs";

export async function reopenOffset(page, name, blend = false) {
  let face, before, selection, sketchSelection;
  if (blend) {
    await circularFinish(page, name);
    await completed(page);
    before = (await inspect(page)).document;
    face = before.bodies[0].faces.find((face) => face.blend);
    assert.ok(face?.offsetHandle);
    await page.keyboard.press("Escape");
    const { center, normal } = face.offsetHandle;
    await orient(page, [normal[0] - normal[1] * 0.6, normal[1] + normal[0] * 0.6, normal[2] + 0.3]);
    const p = await project(page, center);
    await page.mouse.click(p.x, p.y);
    const source = await inspect(page);
    selection = source.modelingSelection;
    sketchSelection = source.selectionTargets;
    assert.equal(selection[0].face, face.id);
    await button(page, "Resize fillet").click();
    await field(page, "Fillet face radius").fill("3");
  } else {
    const { center } = await plate(page);
    await page.mouse.click(center.x + 30, center.y + 30);
    const source = await inspect(page);
    before = source.document;
    selection = source.modelingSelection;
    sketchSelection = source.selectionTargets;
    face = before.bodies[0].faces.find((face) => face.id === source.modelingSelection[0].face);
    await chooseTool(page, "offset faces", "offset");
    await (await relativeOffsetInput(page)).fill("-100");
  }
  await ready(page, "Accept face offset");
  const quantity = blend ? "Fillet face radius" : "Face offset distance";
  const displayed = Number(await field(page, quantity).inputValue());
  if (!blend)
    assert.ok(displayed > -100 && displayed < 0, "offset overshoot clamps to verified distance");
  await button(page, "Accept face offset").click();
  await cycle(page, {
    before,
    kind: "offset-faces",
    selection,
    sketchSelection,
    completionPanel: ".face-offset-options",
    cancel: "Cancel face offset",
    accept: "Accept face offset",
    name: `${name}-${blend ? "radius" : "distance"}`,
    check: async ({ operation }) => {
      assert.ok(
        operation.faces.some(
          (target) => target.body === before.bodies[0].id && target.face === face.id,
        ),
      );
      if (blend) {
        assert.equal(operation.radius, 3);
        assert.equal(
          await field(page, quantity).inputValue(),
          "3",
          "radius intent is shown in the radius-labeled field",
        );
      } else {
        assert.equal(operation.radius, undefined);
        assert.equal(Number(operation.distance.toPrecision(4)), displayed);
        assert.equal(Number(await field(page, quantity).inputValue()), displayed);
      }
    },
    change: () => field(page, quantity).fill(blend ? "1.5" : "1"),
    validate: async (geometry, parameters, original, accepted) => {
      if (blend) {
        const blends = geometry.bodies[0].faces.filter((face) => face.blend);
        assert.ok(blends.length);
        for (const face of blends) close(face.blend.radius, 1.5, "native resized blend radius");
        assert.ok(Math.abs(geometry.bodies[0].volume - accepted.bodies[0].volume) > 1);
      } else close(geometry.bodies[0].volume, 4400, "independent outward-offset box volume");
      if (parameters)
        assert.deepEqual(parameters.operation, {
          ...original.operation,
          distance: blend ? (face.blend.radius - 1.5) * face.blend.outward : 1,
          ...(blend ? { radius: 1.5 } : {}),
        });
    },
  });
}
