import assert from "node:assert/strict";
import { plate } from "./ui-body-fillet.mjs";
import { at, close, drag, inspect, reset } from "./ui-helpers.mjs";
import { acceptedOperation, button, completed, cycle, field, ready } from "./ui-reopen-cycle.mjs";
import { chooseTool } from "./ui-tools.mjs";

export async function reopenShell(page, name) {
  const { center } = await plate(page);
  await page.mouse.click(center.x + 30, center.y + 30);
  const source = await inspect(page),
    before = source.document;
  const selection = [
    { body: before.bodies[0].id, faces: source.modelingSelection.map((target) => target.face) },
  ];
  await chooseTool(page, "shell", "shell");
  await field(page, "Shell thickness").fill("-1");
  close((await inspect(page)).preview.bodies[0].volume, 1084);
  await button(page, "Accept shell").click();
  await cycle(page, {
    before,
    kind: "shell",
    selection: source.modelingSelection,
    sketchSelection: source.selectionTargets,
    cancel: "Cancel shell",
    accept: "Accept shell",
    name,
    check: async ({ operation }) => {
      assert.equal(operation.thickness, -1);
      assert.deepEqual(operation.selection, selection);
      assert.equal(await field(page, "Shell thickness").inputValue(), "-1");
    },
    change: () => field(page, "Shell thickness").fill("-0.5"),
    validate: async (geometry, parameters, original) => {
      close(geometry.bodies[0].volume, 4000 - 19 ** 2 * 9.5, "independent half-mm shell volume");
      if (!parameters) assert.equal(await field(page, "Shell thickness").inputValue(), "-0.5");
      if (parameters)
        assert.deepEqual(parameters.operation, { ...original.operation, thickness: -0.5 });
    },
  });
}
export async function reopenErosion(page, name, method) {
  await plate(page);
  await button(page, "Select Body 1").click();
  const source = await inspect(page),
    before = source.document;
  await chooseTool(page, "erode", "erode");
  await page.getByRole("combobox", { name: "Erosion method", exact: true }).selectOption(method);
  await inspect(page);
  await field(page, "Erode by").fill("1");
  await ready(page, "Accept erosion");
  if (method === "accurate") {
    await field(page, "Extra thickness allowance").fill("0");
    await inspect(page);
  }
  await button(page, "Accept erosion").click();
  await cycle(page, {
    before,
    kind: "erode",
    selection: source.modelingSelection,
    sketchSelection: source.selectionTargets,
    cancel: "Cancel erosion",
    accept: "Accept erosion",
    name: `${name}-${method}`,
    check: async ({ operation }) => {
      assert.equal(operation.method, method);
      assert.deepEqual(
        operation.ids,
        before.bodies.map((body) => body.id),
      );
      assert.equal(operation.thickness, 1);
      assert.equal(operation.keepOriginals, true);
      if (method === "fast") {
        assert.equal(operation.meshDetail, "standard");
        assert.equal(operation.maxFaces, 128);
      }
      assert.equal(
        await page.getByRole("combobox", { name: "Erosion method", exact: true }).inputValue(),
        method,
      );
      assert.equal(await field(page, "Erode by").inputValue(), "1");
      if (method === "accurate") assert.equal(operation.allowance, 0);
    },
    change: () => field(page, "Erode by").fill("0.5"),
    validate: async (geometry, parameters, original, accepted) => {
      assert.equal(geometry.bodies.length, 2);
      assert.equal(
        geometry.bodies[0].brep,
        before.bodies[0].brep,
        "erosion preserves its original",
      );
      const derived = geometry.bodies[1],
        previous = accepted.bodies[1];
      assert.ok(
        derived.volume > previous.volume + 1,
        "smaller erosion retains materially more volume",
      );
      for (let axis = 0; axis < 3; axis++) {
        assert.ok(derived.bounds[axis] < previous.bounds[axis] - 0.1);
        assert.ok(derived.bounds[axis + 3] > previous.bounds[axis + 3] + 0.1);
      }
      if (method === "accurate") close(derived.volume, 19 * 19 * 9, "analytic eroded box volume");
      if (parameters)
        assert.deepEqual(parameters.operation, { ...original.operation, thickness: 0.5 });
    },
  });
}
export async function reopenFinish(page, name, mode) {
  await splitPlate(page);
  const source = await inspect(page),
    before = source.document;
  await chooseTool(page, mode, mode);
  const quantity = mode === "fillet" ? "Fillet radius" : "Chamfer distance";
  await field(page, quantity).fill("100");
  await ready(page, `Accept ${mode}`);
  const verified = Number(await field(page, quantity).inputValue());
  assert.ok(verified > 0 && verified < 100, "accepted size is a verified clamp");
  await page.waitForFunction(() => {
    const broom = document.querySelector(".body-edge-finish-widget .commit-cleanup");
    return broom?.getAttribute("aria-busy") === "false" && !broom.disabled;
  });
  await button(page, "Commit and clean up").click();
  await completed(page);
  const parameters = await acceptedOperation(page, "finish-edges");
  assert.equal(
    parameters.operation.size,
    verified,
    "accepted native clamp equals the focused field value",
  );
  assert.equal(parameters.cleanup, true);
  await cycle(page, {
    before,
    kind: "finish-edges",
    selection: source.modelingSelection,
    sketchSelection: source.selectionTargets,
    completionPanel: ".edge-finish-panel",
    cancel: `Cancel ${mode}`,
    accept: `Accept ${mode}`,
    name: `${name}-${mode}`,
    check: async ({ operation }) => {
      assert.equal(operation.mode, mode);
      assert.ok(operation.edges.length >= source.modelingSelection.length);
      for (const target of source.modelingSelection)
        assert.ok(
          operation.edges.some((edge) => edge.body === target.body && edge.edge === target.edge),
        );
      assert.equal(
        Number(await field(page, quantity).inputValue()),
        Number(parameters.operation.size.toPrecision(4)),
      );
      assert.equal(
        await page.getByRole("checkbox", { name: "Clean up on acceptance" }).isChecked(),
        true,
      );
    },
    change: async () => {
      await page.getByRole("checkbox", { name: "Clean up on acceptance" }).uncheck();
      await field(page, quantity).fill("1");
    },
    validate: async (geometry, changed, original, accepted) => {
      assert.ok(geometry.bodies[0].volume < before.bodies[0].volume);
      assert.ok(
        Math.abs(geometry.bodies[0].volume - accepted.bodies[0].volume) > 1,
        "size 1 differs materially from the clamp",
      );
      if (mode === "fillet") {
        const rounds = geometry.bodies[0].faces.filter((face) => face.blend || face.cylinder);
        assert.ok(rounds.length, "native topology recognizes the fillet surface radius");
        for (const face of rounds)
          close((face.blend ?? face.cylinder).radius, 1, "native fillet radius");
      }
      if (changed) {
        assert.deepEqual(changed.operation, { ...original.operation, size: 1 });
        assert.equal(changed.cleanup, undefined);
      }
    },
  });
}
export async function reopenRevolution(page, name) {
  await reset(page);
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  await page.mouse.move(640, 425);
  await page.keyboard.down("Control");
  await page.mouse.wheel(0, -90);
  await page.keyboard.up("Control");
  await page.waitForFunction(() => window.makeshiftInspect().camera.height < 40);
  await page.keyboard.press("r");
  await drag(page, [5, 0], [7, 2]);
  for (const label of ["Width", "Height"]) {
    await field(page, label).fill("2");
    await page.keyboard.press("Enter");
    await inspect(page);
  }
  const center = await at(page, 6, 1),
    axis = await at(page, 0, -4);
  await chooseTool(page, "return to modeling", "modeling");
  await page.mouse.click(center.x, center.y);
  const source = await inspect(page),
    before = source.document;
  await chooseTool(page, "revolve", "revolve");
  await page.mouse.click(axis.x, axis.y);
  await field(page, "Revolution angle").fill("90");
  await button(page, "New body").click();
  close((await ready(page, "Accept revolution")).preview.bodies[0].volume, 12 * Math.PI);
  await button(page, "Accept revolution").click();
  await cycle(page, {
    before,
    kind: "revolve",
    selection: source.modelingSelection,
    sketchSelection: source.selectionTargets,
    name,
    accept: "Accept revolution",
    check: async ({ revolution }) => {
      assert.equal(revolution.angle, 90);
      assert.equal(revolution.height, 0);
      assert.equal(revolution.mode, "new");
      assert.deepEqual(revolution.axis.direction, [0, 1, 0]);
      close(revolution.axis.origin[0], 0);
      close(revolution.axis.origin[2], 0);
      assert.equal(revolution.sources.length, 1);
      assert.equal(revolution.sources[0].sketch, before.sketches[0].id);
      assert.equal(typeof revolution.sources[0].profile, "string");
      assert.equal(await field(page, "Revolution angle").inputValue(), "90");
      assert.equal(await field(page, "Revolution height").inputValue(), "0");
    },
    change: () => field(page, "Revolution angle").fill("180"),
    validate: async (geometry, parameters, original) => {
      close(geometry.bodies[0].volume, 24 * Math.PI, "independent half-revolution volume");
      if (parameters)
        assert.deepEqual(parameters.revolution, { ...original.revolution, angle: 180 });
    },
  });
}

export async function splitPlate(page) {
  await reset(page);
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  await page.keyboard.press("l");
  const points = [
    [-10, -10],
    [0, -10],
    [10, -10],
    [10, 10],
    [-10, 10],
    [-10, -10],
  ];
  for (let i = 1; i < points.length; i++) await drag(page, points[i - 1], points[i]);
  const center = await at(page, 0, 0),
    edge = await at(page, -5, -10);
  await chooseTool(page, "return to modeling", "modeling");
  await page.mouse.click(center.x, center.y);
  await field(page, "Extrusion distance").fill("10");
  await ready(page, "Accept extrusion");
  await button(page, "Accept extrusion").click();
  close((await completed(page)).document.bodies[0].volume, 4000);
  await page.mouse.click(edge.x, edge.y);
  assert.equal((await inspect(page)).modelingSelection[0].kind, "edge");
}
