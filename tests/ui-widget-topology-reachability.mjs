import assert from "node:assert/strict";
import { project } from "./ui-blend-edit.mjs";
import { edgeFinishPrism, pickWorld } from "./ui-edge-finish-fixtures.mjs";
import { inspect } from "./ui-helpers.mjs";
import { chooseTool } from "./ui-tools.mjs";
import { deliveredAxisDelta } from "./ui-widget-delivered-input.mjs";
import { dragPixels, sweepWidgets } from "./ui-widget-reachability.mjs";

const button = (page, name) => page.getByRole("button", { name, exact: true });
const gizmo =
  ".body-gizmo:not([hidden]) > button:not([hidden]), .body-gizmo:not([hidden]) > input:not([hidden])";

export async function topologyReachability(page, name) {
  for (const kind of ["faces", "edges"]) {
    const before = await edgeFinishPrism(page);
    await pickWorld(page, kind === "faces" ? [0, 0, 10] : [10, 10, 5]);
    await chooseTool(page, "transform", "transform");
    await sweepWidgets(page, before.bodies[0].center, gizmo, `Move ${kind}`);
    const axis = kind === "faces" ? "Z" : "X";
    const a = await project(page, [0, 0, 0]),
      b = await project(page, axis === "Z" ? [0, 0, 1] : [1, 0, 0]);
    const state = await dragPixels(page, button(page, `Move ${kind} ${axis}`), {
      x: b.x - a.x,
      y: b.y - a.y,
    });
    const unit = { x: b.x - a.x, y: b.y - a.y };
    const delivered = deliveredAxisDelta(state.widgetGesture, unit);
    const geometry = (body) => ({
      id: body.id,
      volume: body.volume,
      bounds: body.bounds,
      center: body.center,
    });
    console.log(
      `${name}: topology input ${JSON.stringify({
        kind,
        unit,
        delivered,
        requested: 1,
        expected:
          kind === "faces"
            ? { volume: 4000 + 400 * delivered, maxZ: 10 + delivered }
            : { maxX: 10 + delivered },
        before: geometry(before.bodies[0]),
        actual: geometry(state.preview?.bodies?.[0] ?? {}),
        gesture: state.widgetGesture,
      })}`,
    );
    assert.ok(state.preview?.bodies?.length);
    assert.notDeepEqual(state.preview.bodies[0], before.bodies[0]);
    if (kind === "faces")
      assert.ok(Math.abs(state.preview.bodies[0].volume - (4000 + 400 * delivered)) < 0.001);
    else {
      assert.ok(Math.abs(state.preview.bodies[0].bounds[3] - (10 + delivered)) < 0.001);
      assert.ok(Math.abs(state.preview.bodies[0].bounds[0] + 10) < 0.001);
      assert.ok(state.preview.bodies[0].volume > before.bodies[0].volume);
    }
    await page
      .getByRole("textbox", {
        name: `${kind === "faces" ? "Face" : "Edge"} translation ${axis}`,
        exact: true,
      })
      .fill("1");
    const exact = (await inspect(page)).preview.bodies[0];
    if (kind === "faces") {
      assert.ok(Math.abs(exact.volume - 4400) < 0.001);
      assert.ok(Math.abs(exact.bounds[5] - 11) < 0.001);
    } else {
      assert.ok(Math.abs(exact.bounds[3] - 11) < 0.001);
      assert.ok(Math.abs(exact.bounds[0] + 10) < 0.001);
    }
    await continueAfterNumeric(page, kind, axis, unit);
    await page.keyboard.press("Escape");
    assert.deepEqual((await inspect(page)).document, before);
  }
  console.log(`${name}: docked face/edge Move and native geometry cancellation passed`);
}

async function continueAfterNumeric(page, kind, axis, unit) {
  const state = await dragPixels(page, button(page, `Move ${kind} ${axis}`), unit);
  const amount = 1 + deliveredAxisDelta(state.widgetGesture, unit);
  const body = state.preview.bodies[0];
  if (kind === "faces") {
    assert.ok(Math.abs(body.volume - (4000 + 400 * amount)) < 0.001);
    assert.ok(Math.abs(body.bounds[5] - (10 + amount)) < 0.001);
  } else {
    assert.ok(Math.abs(body.bounds[3] - (10 + amount)) < 0.001);
    assert.ok(Math.abs(body.bounds[0] + 10) < 0.001);
  }
}
