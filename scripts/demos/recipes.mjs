import assert from "node:assert/strict";
import { orient } from "../../tests/ui-blend-edit.mjs";
import { decoratorCylinder } from "../../tests/ui-decorator-cylinder.mjs";
import { chooseTool } from "../../tests/ui-tools.mjs";
import { actions, solid } from "./actions.mjs";
import { knurling, threads } from "./decorators.mjs";
import { finishes } from "./finishes.mjs";
import { groundView, primitives } from "./primitives.mjs";
import { sketching } from "./sketching.mjs";

async function sketchSetup(page) {
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  await chooseTool(page, "grid snap", "grid");
}
async function completedSketch(page) {
  await sketchSetup(page);
  // Reuse the exact sketching route, through normal controls before capture.
  const live = {
    action: (operation) => operation(),
    hold: async () => {},
    frame: async () => {},
    fps: 30,
  };
  await sketching(page, live, actions(page, live, 0));
  await chooseTool(page, "return to modeling", "modeling");
  await groundView(page);
}

export const recipes = [
  {
    id: "primitives",
    title: "Primitives",
    description: "Place and resize a cube, cylinder, sphere and cone.",
    setup: groundView,
    focus: [-5, 3, 4],
    height: 60,
    record: primitives,
  },
  {
    id: "sketching",
    title: "Sketching",
    description: "Draw a profile, bow an edge into an arc, and round a corner.",
    setup: sketchSetup,
    record: sketching,
  },
  {
    id: "extrude",
    title: "Extrude",
    description: "Give the sketch from the previous demo depth, preserving its hole.",
    setup: completedSketch,
    focus: [0, 0, 6],
    async record(_page, c, a) {
      await a.click([7, 0, 0]);
      await a.dragHandle("Drag extrusion", [7, 0, 0], [7, 0, 12]);
      await a.fill("Extrusion distance", 12);
      const expected = (await a.state()).preview.bodies[0].volume;
      assert.ok(expected > 0);
      await c.hold(0.7);
      await a.accept();
      const body = await solid(a);
      assert.ok(Math.abs(body.volume - expected) < 1);
      assert.ok(
        body.faces.some((face) => face.cylinder && Math.abs(face.cylinder.radius - 4) < 1e-6),
      );
    },
  },
  {
    id: "revolve",
    title: "Revolve",
    description: "Sketch a rectangle, choose an axis and explore its revolution.",
    setup: sketchSetup,
    height: 54,
    async record(page, c, a) {
      await a.tool("rectangle");
      await a.draw([3, -7], [11, 7], 0.7);
      await a.tool("modeling", "return to modeling");
      await a.run(() => orient(page, [1, -0.5, 1]));
      await a.click([7, 0, 0]);
      await a.tool("revolve");
      await a.hover([0, -12, 0], 0.9);
      await a.click([0, -12, 0]);
      await c.hold(0.7);
      await a.fill("Revolution angle", 90);
      await a.fill("Revolution angle", 270);
      assert.ok((await a.state()).preview.bodies[0].volume > 0);
      await c.hold(0.7);
      await a.button("Accept revolution");
      const body = await solid(a);
      assert.ok(Math.abs(body.volume - Math.PI * (121 - 9) * 14 * 0.75) < 1);
    },
  },
  {
    id: "edge-finishes",
    title: "Fillet & chamfer",
    description: "Round the front corner, then bevel the entire top face.",
    setup: groundView,
    focus: [0, 0, 8],
    height: 50,
    record: finishes,
  },
  {
    id: "threads",
    title: "Threads",
    description: "Thread a cylinder and a matching drilled hole.",
    setup: groundView,
    focus: [0, 0, 5],
    height: 60,
    record: threads,
  },
  {
    id: "knurling",
    title: "Knurling",
    description: "Compare grip patterns on a larger cylinder.",
    setup: (page) => decoratorCylinder(page, 16, 24),
    height: 64,
    record: knurling,
  },
];
