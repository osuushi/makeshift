import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import type { KernelRequest } from "../src/backend/kernel-request.js";
import { type KernelResult, materialize } from "../src/backend/kernel-result.js";
import { NativeCalculator } from "../src/backend/native-calculator.js";
import type { Body, BooleanMode } from "../src/model/body.js";
import { type ExactBody, exactBodies } from "../src/model/exact-body.js";
import type { Sketch } from "../src/sketch/document.js";
import { profilesFor } from "../src/sketch/profiles.js";

const fixture: {
  source: ExactBody;
  expected: ExactBody;
  expectedVolume: number;
  bottomEdges: string[];
  sketches: Sketch[];
} = JSON.parse(readFileSync("tests/fixtures/fillet-opposite-rims.json", "utf8"));
const calculator = () =>
  new NativeCalculator<KernelRequest, KernelResult<BooleanMode | "inspect">>(
    ".build/kernel/bin/makeshift-kernel",
    "Opposite rim regression",
    10000,
  );

function rim(body: Body, height: number) {
  const edges = body.edges.filter((e) => {
    const c = e.curve;
    return c?.kind === "arc" && [c.a, c.b, c.mid].every((p) => Math.abs(p[2] - height) < 1e-6);
  });
  assert.equal(edges.length, 2);
  return edges.map((e) => ({ body: body.id, edge: e.id }));
}
function check(body: Body) {
  assert.ok(Math.abs(body.volume - fixture.expectedVolume) < 1e-4);
  const holes = body.faces.filter((f) => f.cylinder?.outward === -1);
  assert.equal(holes.length, 1, "The through bore is one continuing cylindrical face");
  assert.ok(Math.abs((holes[0].cylinder?.radius ?? 0) - 2) < 1e-7);
  assert.equal(body.faces.length, 13, "Temporary section planes leave no faces or seams");
}
async function sameMaterial(
  kernel: ReturnType<typeof calculator>,
  body: Body,
  reference = fixture.expected,
) {
  for (const [a, b] of [
    [body, reference],
    [reference, body],
  ]) {
    const result = await kernel.calculate({
      kind: "boolean",
      bodies: exactBodies([a, b]),
      ids: [a.id, b.id],
      mode: "subtract",
      keepOriginals: false,
    });
    assert.equal(result.results.length, 0, "Neither solid has material absent from the other");
  }
}
async function original(owner: DocumentOwner, height = 27.5) {
  for (const [index, sketch] of fixture.sketches.entries()) {
    assert.equal((await owner.call({ kind: "edit", sketch })).error, undefined);
    const reply = await owner.call({
      kind: "extrude",
      extrusion: {
        sources: [{ sketch: sketch.id, profile: profilesFor(sketch)[0].key }],
        distance: index ? -41.5 : height,
        mode: index ? "subtract" : "new",
        eligibleTargets: owner.view.data.bodies?.map((b) => b.id) ?? [],
      },
    });
    assert.equal(reply.error, undefined);
    await owner.call({ kind: "accept" });
  }
  return owner.view.data;
}
async function finish(owner: DocumentOwner, heights: number[]) {
  const body = owner.view.data.bodies?.[0];
  assert.ok(body);
  const reply = await owner.call({
    kind: "finish-edges",
    operation: { edges: heights.flatMap((z) => rim(body, z)), size: 5, mode: "fillet" },
  });
  assert.equal(reply.error, undefined);
  assert.equal(reply.view.edgeSize, 5, "The requested radius must not be silently clamped");
  const result = reply.view.candidate?.bodies?.[0];
  assert.ok(result);
  await owner.call({ kind: "accept" });
  return result;
}

test("captured opposite rim fillets preserve the bore in either order and together", async () => {
  const kernel = calculator(),
    owner = new DocumentOwner();
  try {
    const source = materialize(
      [],
      await kernel.calculate({ kind: "inspect", bodies: [fixture.source] }),
    )[0];
    await owner.call({ kind: "open", document: { units: "mm", sketches: [], bodies: [source] } });
    const before = owner.view.data;
    const completed = await finish(owner, [0]);
    check(completed);
    const hole = source.faces.find((f) => f.cylinder?.outward === -1);
    assert.ok(hole);
    assert.equal(completed.faces.find((f) => f.cylinder?.outward === -1)?.id, hole.id);
    for (const face of source.faces.filter((f) => f.blend?.radius === 5))
      assert.equal(completed.faces.find((f) => f.id === face.id)?.blend?.radius, 5);
    await sameMaterial(kernel, completed);
    const accepted = owner.view.data;
    await owner.call({ kind: "undo" });
    assert.deepEqual(owner.view.data, before);
    await owner.call({ kind: "redo" });
    assert.deepEqual(owner.view.data, accepted);
    await owner.call({ kind: "new" });
    const stock = await original(owner);
    await finish(owner, [0]);
    const reversed = await finish(owner, [27.5]);
    check(reversed);
    await sameMaterial(kernel, reversed);
    await owner.call({ kind: "open", document: stock });
    const simultaneous = await finish(owner, [0, 27.5]);
    check(simultaneous);
    await sameMaterial(kernel, simultaneous);
  } finally {
    owner.close();
    await kernel.cancel();
    kernel.close();
  }
});

test("local rim construction follows a translated and rotated support plane", async () => {
  const kernel = calculator();
  try {
    const transform = {
      axis: [1, 2, 0] as [number, number, number],
      angle: 37,
      pivot: [0, 0, 0] as [number, number, number],
      translation: [20, -30, 40] as [number, number, number],
      duplicate: false,
    };
    const transformed = async (body: ExactBody) =>
      materialize(
        [],
        await kernel.calculate({
          kind: "transform",
          bodies: [body],
          ids: [body.id],
          ...transform,
        }),
      )[0];
    const source = await transformed(fixture.source),
      reference = await transformed(fixture.expected);
    const body = materialize(
      [source],
      await kernel.calculate({
        kind: "edge-finish",
        bodies: exactBodies([source]),
        size: 5,
        mode: "fillet",
        edges: fixture.bottomEdges.map((edge) => ({ body: source.id, edge })),
      }),
    )[0];
    check(body);
    await sameMaterial(kernel, body, reference);
  } finally {
    await kernel.cancel();
    kernel.close();
  }
});

test("independently feasible end rounds cannot be combined when their cuts overlap", async () => {
  const kernel = calculator(),
    owner = new DocumentOwner();
  try {
    const stock = await original(owner, 8),
      body = stock.bodies?.[0];
    assert.ok(body);
    const request = {
      kind: "edge-finish" as const,
      bodies: exactBodies([body]),
      size: 5,
      mode: "fillet" as const,
      edges: rim(body, 8),
    };
    const top = await kernel.calculate(request);
    assert.equal(top.results.length, 1, "A single 5 mm end round fits the 8 mm stock");
    await assert.rejects(
      kernel.calculate({ ...request, edges: [...rim(body, 0), ...rim(body, 8)] }),
      /Edge finish is not feasible at this size/,
    );
    assert.deepEqual(owner.view.data, stock);
  } finally {
    owner.close();
    await kernel.cancel();
    kernel.close();
  }
});
