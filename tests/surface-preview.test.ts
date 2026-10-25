import assert from "node:assert/strict";
import test from "node:test";
import type { DecoratorSession } from "../src/backend/decorator-session.js";
import { DocumentOwner } from "../src/backend/document-owner.js";
import type { KernelRequest } from "../src/backend/kernel-request.js";
import { SolidCalculator } from "../src/backend/solid-calculator.js";
import type { SketchDocument } from "../src/sketch/document.js";
import { surfaceFixture, withValue } from "./surface-preview-fixtures.js";

for (const kind of ["offset", "fillet", "chamfer"] as const) {
  test(`${kind}: staged native mesh and completed exact metadata equal ordinary presentation`, async () => {
    const owner = new DocumentOwner(),
      kernel = new SolidCalculator();
    try {
      const { body, request } = await surfaceFixture(owner, kind);
      const input =
        request.kind === "offset-faces"
          ? { ...request.operation, kind: "offset-faces" as const, bodies: [body] }
          : { ...request.operation, kind: "edge-finish" as const, bodies: [body] };
      const expected = await kernel.calculate(input);
      const visual = await kernel.calculate({ ...input, presentation: "deferred" });
      assert.deepEqual(
        visual.results[0].faces,
        expected.results[0].faces.map((face) => face.vertices),
      );
      assert.equal("brep" in visual.results[0], false);
      assert.equal("volume" in visual.results[0], false);
      assert.deepEqual(
        await kernel.calculate({ kind: "complete-preview", bodies: [body] }),
        expected,
      );
    } finally {
      owner.close();
      kernel.close();
    }
  });

  test(`${kind}: feasibility probes defer metadata, retain the winning value, and accept one history step`, async (context) => {
    const owner = new DocumentOwner();
    try {
      const { body, request } = await surfaceFixture(owner, kind),
        before = owner.view.data;
      const kernel = Reflect.get(owner, "kernel") as SolidCalculator;
      const original = kernel.calculate.bind(kernel),
        calls: KernelRequest[] = [];
      context.mock.method(kernel, "calculate", (input: KernelRequest) => {
        calls.push(input);
        return original(input);
      });
      const overshoot = withValue(request, kind === "offset" ? -100 : 100);
      const prepared = await owner.call({ ...overshoot, presentation: "deferred" });
      assert.equal(prepared.error, undefined);
      assert.ok(prepared.view.visualPreview);
      assert.equal(prepared.view.candidate, null);
      assert.equal(prepared.view.data, before);
      assert.ok(calls.length > 1, "This request exercises real limit search");
      assert.ok(
        calls.every((input) => "presentation" in input && input.presentation === "deferred"),
      );
      const value = kind === "offset" ? prepared.view.offsetDistance : prepared.view.edgeSize;
      assert.ok(value !== undefined && Math.abs(value) > 0 && Math.abs(value) < 100);
      assert.match((await owner.call({ kind: "accept" })).error ?? "", /No valid edit/);
      const complete = await owner.call({ kind: "complete-preview" });
      assert.equal(complete.error, undefined);
      const candidate = complete.view.candidate?.bodies?.[0];
      assert.ok(candidate);
      assert.deepEqual(
        prepared.view.visualPreview.bodies[0].faces,
        candidate.faces.map((face) => face.vertices),
      );
      assert.equal(calls.at(-1)?.kind, "complete-preview");
      const firstBrep = candidate.brep;
      // Completing/smaller requests consume or replace the single native cache.
      assert.equal((await owner.call(withValue(request, 1))).error, undefined);
      const repeated = await owner.call({ ...overshoot, presentation: "deferred" });
      assert.equal(repeated.error, undefined);
      assert.ok(repeated.view.visualPreview);
      const repeatedComplete = await owner.call({ kind: "complete-preview" });
      assert.equal(repeatedComplete.error, undefined);
      if (kind !== "offset")
        assert.equal(repeatedComplete.view.candidate?.bodies?.[0].brep, firstBrep);
      const acceptedValue =
        kind === "offset" ? repeatedComplete.view.offsetDistance : repeatedComplete.view.edgeSize;
      assert.equal((await owner.call({ kind: "accept" })).error, undefined);
      const accepted = owner.view.data;
      const history = (await owner.call({ kind: "read-history" })).history;
      const parameters = history?.at(-1)?.operation.parameters.operation as {
        size?: number;
        distance?: number;
      };
      assert.equal(kind === "offset" ? parameters.distance : parameters.size, acceptedValue);
      await owner.call({ kind: "undo" });
      assert.equal(owner.view.data, before);
      await owner.call({ kind: "redo" });
      assert.equal(owner.view.data, accepted);
      await owner.call({ kind: "undo" });
      const zero = await owner.call({ ...withValue(request, 0), presentation: "deferred" });
      assert.equal(zero.error, undefined);
      assert.equal(zero.view.visualPreview, undefined);
      assert.equal(zero.view.candidate, before);
      assert.equal(zero.view.data.bodies?.[0].id, body.id);
    } finally {
      owner.close();
    }
  });
}

for (const kind of ["offset", "fillet"] as const) {
  test(`${kind}: newer input stops additional feasibility probes without interrupting current geometry`, async (context) => {
    const owner = new DocumentOwner();
    let release = () => {},
      enter = () => {};
    const entered = new Promise<void>((done) => {
      enter = done;
    });
    const held = new Promise<void>((done) => {
      release = done;
    });
    try {
      const { request } = await surfaceFixture(owner, kind);
      const kernel = Reflect.get(owner, "kernel") as SolidCalculator;
      const original = kernel.calculate.bind(kernel);
      let probes = 0;
      context.mock.method(kernel, "calculate", async (input: KernelRequest) => {
        probes++;
        try {
          return await original(input);
        } finally {
          if (probes === 1) {
            enter();
            await held;
          }
        }
      });
      const preparing = owner.call({
        ...withValue(request, kind === "offset" ? -100 : 100),
        presentation: "deferred",
      });
      await entered;
      await owner.call({ kind: "supersede-preview" });
      release();
      assert.match((await preparing).error ?? "", /Preview superseded/);
      assert.equal(probes, 1);
      assert.equal(owner.view.candidate, null);
      context.mock.restoreAll();
      assert.equal((await owner.call({ ...request, presentation: "deferred" })).error, undefined);
      assert.equal((await owner.call({ kind: "complete-preview" })).error, undefined);
    } finally {
      release();
      owner.close();
    }
  });

  test(`${kind}: new input cancels late completion and discard invalidates the exact cache`, async (context) => {
    const owner = new DocumentOwner();
    let release = () => {},
      enter = () => {};
    const entered = new Promise<void>((done) => {
      enter = done;
    });
    const held = new Promise<void>((done) => {
      release = done;
    });
    try {
      const { request } = await surfaceFixture(owner, kind),
        before = owner.view.data;
      assert.equal((await owner.call({ ...request, presentation: "deferred" })).error, undefined);
      const decorators = Reflect.get(owner, "decorators") as DecoratorSession;
      const original = decorators.continue.bind(decorators);
      context.mock.method(decorators, "continue", async (document: SketchDocument) => {
        const result = await original(document);
        enter();
        await held;
        return result;
      });
      const completing = owner.call({ kind: "complete-preview" });
      await entered;
      const superseding = owner.call({ kind: "supersede-preview", interrupt: true });
      release();
      assert.match((await completing).error ?? "", /Preview superseded/);
      await superseding;
      assert.equal(owner.view.candidate, null);
      assert.equal(owner.view.data, before);
      context.mock.restoreAll();
      assert.equal(
        (await owner.call({ ...withValue(request, 1), presentation: "deferred" })).error,
        undefined,
      );
      await owner.call({ kind: "discard" });
      assert.match((await owner.call({ kind: "complete-preview" })).error ?? "", /No preview/);
      assert.equal(
        (await owner.call({ ...withValue(request, 1), presentation: "deferred" })).error,
        undefined,
      );
      assert.equal((await owner.call({ kind: "complete-preview" })).error, undefined);
    } finally {
      release();
      owner.close();
    }
  });
}
