import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import type { GeometryQueries } from "../src/backend/geometry-queries.js";
import type { SolidCalculator } from "../src/backend/solid-calculator.js";
import type { SketchDocument } from "../src/sketch/document.js";
import type { ModelRequest } from "../src/sketch/model-api.js";

const fixture = JSON.parse(readFileSync("tests/fixtures/chamfer-segmented-shelf.json", "utf8")) as {
  document: SketchDocument;
};

for (const cancellation of ["cancel-edge-finish-targets", "cancel-preview"] as const) {
  test(`measurements bypass snap work; ${cancellation} clears active and queued searches`, async (context) => {
    const owner = new DocumentOwner();
    const queries = Reflect.get(owner, "queries") as GeometryQueries;
    const snaps = Reflect.get(queries, "snaps") as SolidCalculator;
    const calculate = snaps.calculate.bind(snaps);
    const cancel = snaps.cancel.bind(snaps);
    let enter = () => {},
      release = () => {};
    const entered = new Promise<void>((resolve) => {
      enter = resolve;
    });
    const completion = new Promise<void>((resolve) => {
      release = resolve;
    });
    let cancelled = false;
    let started = 0;
    // Hold publication even when a fast calculator has already finished. The
    // readout must not depend on elapsed time or on how quickly this fixture solves.
    const held = context.mock.method(
      snaps,
      "calculate",
      async (input: import("../src/backend/kernel-request.js").KernelRequest) => {
        started++;
        enter();
        const reply = await calculate(input);
        await completion;
        if (cancelled) throw new Error("Controlled snap completion cancelled");
        return reply;
      },
    );
    const cancellationBarrier = context.mock.method(snaps, "cancel", async () => {
      cancelled = true;
      await cancel();
      release();
    });
    try {
      assert.equal(
        (await owner.call({ kind: "open", document: fixture.document })).error,
        undefined,
      );
      const before = owner.view.data;
      const body = before.bodies?.[0],
        sketch = before.sketches[0];
      assert.ok(body && sketch);
      const request: ModelRequest = {
        kind: "edge-finish-targets",
        operation: {
          edges: [{ body: body.id, edge: "7876944f-4387-4579-8789-df0024e295a6" }],
          mode: "fillet",
        },
        points: [[20, 8, 25.5]],
      };
      let settled = false;
      const active = owner.call(request).then((reply) => {
        settled = true;
        return reply;
      });
      const queued = owner.call(request);
      await entered;
      const measured = await owner.call({
        kind: "measure",
        targets: [{ kind: "curve", sketch: sketch.id, curve: sketch.curves[0].id }],
      });
      assert.equal(measured.error, undefined);
      assert.ok(measured.measurement?.properties.length);
      assert.equal(
        settled,
        false,
        "Sketch measurement must finish before snap completion is released",
      );
      assert.equal((await owner.call({ kind: cancellation })).error, undefined);
      assert.match((await active).error ?? "", /cancel/i);
      assert.match((await queued).error ?? "", /cancel/i);
      assert.equal(started, 1, "Cancellation skips the queued search");
      held.mock.restore();
      cancellationBarrier.mock.restore();
      const restarted = await owner.call({ ...request, points: [] });
      assert.equal(restarted.error, undefined);
      assert.deepEqual(restarted.edgeFinishTargets, []);
      const solidMeasurement = await owner.call({
        kind: "measure",
        targets: [{ kind: "edge", body: body.id, edge: body.edges[0].id }],
      });
      assert.equal(solidMeasurement.error, undefined);
      assert.ok(solidMeasurement.measurement?.properties.length);
      assert.deepEqual(owner.view.data, before);
    } finally {
      release();
      owner.close();
    }
  });
}
