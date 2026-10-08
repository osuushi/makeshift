import assert from "node:assert/strict";
import test from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import type { Body, BodyBoolean } from "../src/model/body.js";
import { emptySketch } from "../src/sketch/document.js";
import { planes } from "../src/sketch/planes.js";
import { profilesFor } from "../src/sketch/profiles.js";

async function box(owner: DocumentOwner, x: number, y: number, X: number, Y: number) {
  const points = [
    { x, y },
    { x: X, y },
    { x: X, y: Y },
    { x, y: Y },
  ];
  const sketch = {
    ...emptySketch(planes.XY),
    curves: points.map((a, i) => ({
      id: `edge${i}`,
      kind: "segment" as const,
      a,
      b: points[(i + 1) % 4],
      construction: false,
    })),
  };
  assert.equal((await owner.call({ kind: "edit", sketch })).error, undefined);
  assert.equal(
    (
      await owner.call({
        kind: "extrude",
        extrusion: {
          sources: [{ sketch: sketch.id, profile: profilesFor(sketch)[0].key }],
          distance: 10,
          mode: "new",
        },
      })
    ).error,
    undefined,
  );
  await owner.call({ kind: "accept" });
  return (owner.view.data.bodies as Body[]).at(-1) as Body;
}
async function preview(
  owner: DocumentOwner,
  ids: string[],
  mode: BodyBoolean["mode"],
  keepOriginals = false,
) {
  const reply = await owner.call({
    kind: "boolean-bodies",
    operation: { ids, mode, keepOriginals },
  });
  assert.equal(reply.error, undefined);
  assert.ok(reply.view.candidate);
  return reply.view.candidate.bodies ?? [];
}
function volume(bodies: readonly Body[]) {
  return bodies.reduce((sum, b) => sum + b.volume, 0);
}
function near(a: number, b: number) {
  assert.ok(Math.abs(a - b) < 1e-6, `${a} != ${b}`);
}
function identities(bodies: readonly Body[]) {
  const ids = bodies.flatMap((b) => [
    b.id,
    ...b.faces.map((f) => f.id),
    ...b.edges.map((e) => e.id),
  ]);
  assert.equal(new Set(ids).size, ids.length, "Every body, face and edge owns a unique identity");
}

test("standalone Booleans preview overlaps, preserve originals, reject invalid input and reopen", async () => {
  const owner = new DocumentOwner();
  try {
    const a = await box(owner, 0, 0, 10, 10),
      b = await box(owner, 5, 0, 15, 10);
    const untouched = await box(owner, 30, 0, 31, 1);
    const original = owner.view.data;
    for (const mode of ["union", "intersect", "subtract"] as const) {
      const result = await preview(owner, [a.id, b.id], mode);
      near(volume(result), (mode === "union" ? 1500 : 500) + 10);
      assert.equal(
        result.find((body) => body.id === untouched.id),
        untouched,
      );
      assert.deepEqual(owner.view.data, original);
      const reverse = await preview(owner, [b.id, a.id], mode);
      near(volume(reverse), volume(result));
      const output = reverse.filter((body) => body.id !== untouched.id)[0];
      if (mode === "subtract") near(output.bounds[0], 10);
      const kept = await preview(owner, [a.id, b.id], mode, true);
      identities(kept);
      assert.deepEqual(
        kept.find((body) => body.id === b.id),
        b,
      );
      near(volume(kept), mode === "union" ? 3510 : mode === "intersect" ? 2510 : 1510);
    }
    await owner.call({ kind: "accept" });
    const saved = owner.view.data;
    await owner.call({ kind: "undo" });
    assert.deepEqual(owner.view.data, original);
    await owner.call({ kind: "redo" });
    assert.deepEqual(owner.view.data, saved);
    assert.equal(
      (await owner.call({ kind: "open", document: JSON.parse(JSON.stringify(saved)) })).error,
      undefined,
    );
    near(volume(owner.view.data.bodies ?? []), 1510);
    identities(owner.view.data.bodies ?? []);
    for (const ids of [[b.id], [b.id, b.id], [b.id, "missing"]]) {
      assert.ok(
        (
          await owner.call({
            kind: "boolean-bodies",
            operation: { ids, mode: "union", keepOriginals: false },
          })
        ).error,
      );
      assert.equal(owner.view.candidate, null);
    }
  } finally {
    owner.close();
  }
});

test("standalone subtraction retains every split solid, multiple cutters and optional tools", async () => {
  const owner = new DocumentOwner();
  try {
    const a = await box(owner, 0, 0, 10, 10),
      b = await box(owner, 4, -1, 6, 11),
      c = await box(owner, 8, -1, 9, 11);
    const result = await preview(owner, [a.id, b.id, c.id], "subtract");
    assert.equal(result.length, 3);
    near(volume(result), 700);
    assert.deepEqual(
      result.map((s) => Math.round(s.volume)).sort((a, b) => a - b),
      [100, 200, 400],
    );
    identities(result);
    const kept = await preview(owner, [a.id, b.id, c.id], "subtract", true);
    assert.equal(kept.length, 5);
    near(volume(kept), 1060);
    identities(kept);
    await owner.call({ kind: "discard" });
    assert.equal(owner.view.data.bodies?.length, 3);
  } finally {
    owner.close();
  }
});

test("disjoint and touching Booleans distinguish successful empty solid results from errors", async () => {
  const owner = new DocumentOwner();
  try {
    const a = await box(owner, 0, 0, 10, 10),
      b = await box(owner, 10, 0, 20, 10),
      c = await box(owner, 30, 0, 40, 10);
    let result = await preview(owner, [a.id, b.id], "union");
    assert.equal(result.length, 2);
    near(volume(result), 3000);
    result = await preview(owner, [a.id, c.id], "union");
    assert.equal(result.length, 3);
    near(volume(result), 3000);
    for (const ids of [
      [a.id, b.id],
      [a.id, c.id],
      [a.id, b.id, c.id],
    ]) {
      result = await preview(owner, ids, "intersect");
      assert.equal(result.length, 3 - ids.length);
    }
    await owner.call({ kind: "accept" });
    assert.equal(owner.view.data.bodies?.length, 0);
    await owner.call({ kind: "undo" });
    assert.equal(owner.view.data.bodies?.length, 3);
    result = await preview(owner, [a.id, c.id], "subtract");
    near(volume(result), 2000);
  } finally {
    owner.close();
  }
});

test("sweep eligibility excludes bodies even from explicit targets", async () => {
  const owner = new DocumentOwner();
  try {
    const hidden = await box(owner, 0, 0, 10, 10);
    const sketch = owner.view.data.sketches[0];
    for (const mode of ["auto", "union", "subtract", "intersect"] as const) {
      const reply = await owner.call({
        kind: "extrude",
        extrusion: {
          sources: [{ sketch: sketch.id, profile: profilesFor(sketch)[0].key }],
          distance: 5,
          mode,
          targets: [hidden.id],
          eligibleTargets: [],
        },
      });
      assert.deepEqual(owner.view.data.bodies, [hidden]);
      if (mode === "auto" || mode === "union") {
        assert.equal(reply.error, undefined);
        assert.equal(owner.view.candidate?.bodies?.length, 2);
        assert.deepEqual(
          owner.view.candidate?.bodies?.find((b) => b.id === hidden.id),
          hidden,
        );
      } else assert.match(reply.error ?? "", /target body/);
      await owner.call({ kind: "cancel-preview" });
    }
  } finally {
    owner.close();
  }
});

test("implicit sweep intersection retains multiple targets and matches explicit results", async () => {
  const owner = new DocumentOwner();
  try {
    const a = await box(owner, 0, 0, 10, 10),
      b = await box(owner, 8, 0, 18, 10),
      untouched = await box(owner, 30, 0, 40, 10);
    const original = owner.view.data;
    const sketch = original.sketches[1];
    const extrusion = {
      sources: [{ sketch: sketch.id, profile: profilesFor(sketch)[0].key }],
      distance: 5,
      mode: "intersect" as const,
    };
    const summarize = (bodies: readonly Body[]) =>
      bodies.map((body) => ({
        volume: body.volume,
        bounds: body.bounds,
        faces: body.faces.length,
        edges: body.edges.length,
      }));
    const implicit = await owner.call({ kind: "extrude", extrusion });
    assert.equal(implicit.error, undefined);
    const results = implicit.view.candidate?.bodies ?? [];
    assert.equal(results.length, 3);
    near(volume(results), 1600);
    assert.equal(
      results.find((body) => body.id === untouched.id),
      untouched,
    );
    identities(results);
    assert.deepEqual(owner.view.data, original);
    const expected = summarize(results);
    await owner.call({ kind: "cancel-preview" });
    const explicit = await owner.call({
      kind: "extrude",
      extrusion: { ...extrusion, targets: [a.id, b.id] },
    });
    assert.equal(explicit.error, undefined);
    assert.deepEqual(summarize(explicit.view.candidate?.bodies ?? []), expected);
    await owner.call({ kind: "accept" });
    const saved = owner.view.data;
    await owner.call({ kind: "undo" });
    assert.deepEqual(owner.view.data, original);
    await owner.call({ kind: "redo" });
    assert.deepEqual(owner.view.data, saved);
    assert.equal((await owner.call({ kind: "open", document: saved })).error, undefined);
    near(volume(owner.view.data.bodies ?? []), 1600);
  } finally {
    owner.close();
  }
});

test("Auto retains explicitly selected disjoint targets when another target overlaps", async () => {
  const owner = new DocumentOwner();
  try {
    const a = await box(owner, 0, 0, 10, 10),
      disjoint = await box(owner, 30, 0, 40, 10);
    const original = owner.view.data;
    const sketch = original.sketches[0];
    const reply = await owner.call({
      kind: "extrude",
      extrusion: {
        sources: [{ sketch: sketch.id, profile: profilesFor(sketch)[0].key }],
        distance: 5,
        mode: "auto",
        targets: [a.id, disjoint.id],
      },
    });
    assert.equal(reply.error, undefined);
    assert.equal(reply.view.booleanMode, "subtract");
    const results = reply.view.candidate?.bodies ?? [];
    assert.equal(results.length, 2);
    near(volume(results), 1500);
    const retained = results.find((body) => body.bounds[0] === 30);
    assert.ok(retained);
    near(retained.volume, disjoint.volume);
    assert.deepEqual(retained.bounds, disjoint.bounds);
    identities(results);
    assert.deepEqual(owner.view.data, original);
    await owner.call({ kind: "accept" });
    await owner.call({ kind: "undo" });
    assert.deepEqual(owner.view.data, original);
  } finally {
    owner.close();
  }
});
