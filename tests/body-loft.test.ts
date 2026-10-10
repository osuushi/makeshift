import assert from "node:assert/strict";
import { test } from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import { sectionProfile } from "../src/model/sketch-section.js";
import { emptySketch, type Sketch } from "../src/sketch/document.js";
import { planes } from "../src/sketch/planes.js";
import { circle, draw, near, preview, rectangle } from "./loft-fixtures.js";

test("loft materializes an exact frustum with preview, Undo, archive and continued edits", async () => {
  const owner = new DocumentOwner();
  try {
    const sources = [await draw(owner, rectangle(0, 5)), await draw(owner, rectangle(20, 3))];
    const before = owner.view.data;
    for (const ruled of [false, true]) {
      const result = await preview(owner, sources, { ruled });
      near(result.volume, (20 / 3) * (100 + 60 + 36));
      near(result.bounds[2], 0);
      near(result.bounds[5], 20);
      assert.deepEqual(owner.view.data, before);
    }
    assert.equal((await owner.call({ kind: "accept" })).error, undefined);
    const accepted = owner.view.data;
    await owner.call({ kind: "undo" });
    assert.deepEqual(owner.view.data, before);
    await owner.call({ kind: "redo" });
    assert.deepEqual(owner.view.data, accepted);
    assert.equal((await owner.call({ kind: "open", document: accepted })).error, undefined);
    const body = owner.view.data.bodies?.[0];
    assert.ok(body);
    assert.equal(
      (
        await owner.call({
          kind: "transform-bodies",
          transform: {
            ids: [body.id],
            pivot: [0, 0, 0],
            axis: [0, 0, 1],
            angle: 0,
            translation: [3, 2, 1],
            duplicate: false,
          },
        })
      ).error,
      undefined,
    );
    near(owner.view.data.bodies?.[0].volume ?? 0, body.volume);
    const cap = owner.view.data.bodies?.[0].faces.find(
      (f) => f.plane && f.vertices.every((v, i) => i % 3 !== 2 || Math.abs(v - 21) < 1e-5),
    );
    assert.ok(cap);
    const extrusion = await owner.call({
      kind: "extrude",
      extrusion: { sources: [{ face: cap.id }], distance: 2, mode: "new" },
    });
    assert.equal(extrusion.error, undefined);
    near(extrusion.view.candidate?.bodies?.at(-1)?.volume ?? 0, 72);
    await owner.call({ kind: "discard" });
    await owner.call({ kind: "clear", sketchId: before.sketches[0].id });
    near(owner.view.data.bodies?.[0].volume ?? 0, body.volume);
  } finally {
    owner.close();
  }
});

test("ordered multi-section smooth and ruled lofts interpolate every section", async () => {
  const owner = new DocumentOwner();
  try {
    const sources = [
      await draw(owner, rectangle(0, 5)),
      await draw(owner, rectangle(10, 2, 1)),
      await draw(owner, rectangle(20, 4)),
    ];
    const ruled = await preview(owner, sources, { ruled: true });
    near(ruled.volume, (10 / 3) * (100 + 40 + 16 + 16 + 32 + 64));
    const smooth = await preview(owner, sources);
    assert.ok(Math.abs(smooth.volume - ruled.volume) > 1);
    await owner.call({ kind: "accept" });
    for (const [z, area] of [
      [0, 100],
      [10, 16],
      [20, 64],
    ]) {
      const sections = await owner.call({
        kind: "sections",
        frame: { ...planes.XY, origin: [0, 0, z] },
        bodies: [smooth.id],
      });
      assert.equal(sections.error, undefined);
      const section = sections.sections?.[0];
      assert.ok(section);
      const profile = sectionProfile(section, { ...planes.XY, origin: [0, 0, z] });
      assert.ok(profile);
      near(profile.area, area, 0.001);
    }
    const reverse = await preview(owner, [...sources].reverse(), { ruled: true });
    near(reverse.volume, ruled.volume);
  } finally {
    owner.close();
  }
});

test("curved, mixed topology, nonparallel sections and seam recovery", async () => {
  const owner = new DocumentOwner();
  try {
    const a = await draw(owner, rectangle(0, 4));
    const b = await draw(owner, circle(12, 3));
    const mixed = await preview(owner, [a, b]);
    assert.ok(mixed.volume > 100);
    const shifted = await preview(owner, [a, b], { alignment: [0, 1] });
    assert.ok(shifted.volume > 0);
    const aligned = await preview(owner, [a, b], { alignment: [0, 0] });
    near(aligned.volume, mixed.volume);
    const tilted: Sketch = {
      ...rectangle(24, 3),
      plane: { origin: [2, 0, 24], u: [Math.SQRT1_2, 0, Math.SQRT1_2], v: [0, 1, 0] },
    };
    const c = await draw(owner, tilted);
    const result = await preview(owner, [a, b, c], { ruled: true });
    assert.ok(result.volume > 0);
  } finally {
    owner.close();
  }
});

test("matched holes remain hollow; mismatched holes, duplicate/flat sections and bad alignment reject atomically", async () => {
  const owner = new DocumentOwner();
  try {
    const sources = [await draw(owner, circle(0, 5, 2)), await draw(owner, circle(10, 4, 1))];
    const result = await preview(owner, sources, { ruled: true });
    near(result.volume, ((Math.PI * 10) / 3) * (25 + 20 + 16 - 4 - 2 - 1));
    await owner.call({ kind: "accept" });
    const before = owner.view.data;
    const plain = await draw(owner, circle(20, 3));
    for (const operation of [
      { sources: [sources[0], plain] },
      { sources: [sources[0], sources[0]] },
      { sources, alignment: [0] },
      { sources, alignment: [0, NaN] },
      { sources, alignment: [0, 0.5] },
    ]) {
      const data = owner.view.data;
      const reply = await owner.call({
        kind: "loft",
        operation: { ruled: false, mode: "new", ...operation },
      });
      assert.ok(reply.error);
      assert.equal(reply.view.candidate, null);
      assert.deepEqual(owner.view.data, data);
    }
    near(before.bodies?.[0].volume ?? 0, result.volume);
    const coplanar = await draw(owner, circle(0, 3, 1));
    const failed = await owner.call({
      kind: "loft",
      operation: { sources: [sources[0], coplanar], ruled: true, mode: "new" },
    });
    assert.ok(failed.error);
    await preview(owner, sources);
    await owner.call({ kind: "cancel-preview" });
    assert.equal(owner.view.candidate, null);
  } finally {
    owner.close();
  }
});

test("loft shares automatic/explicit Boolean targets, hidden eligibility and planar face inputs", async () => {
  const owner = new DocumentOwner();
  try {
    const base = await draw(owner, rectangle(0, 5));
    assert.equal(
      (
        await owner.call({
          kind: "extrude",
          extrusion: { sources: [base], distance: 10, mode: "new" },
        })
      ).error,
      undefined,
    );
    await owner.call({ kind: "accept" });
    const stock = owner.view.data.bodies?.[0];
    assert.ok(stock);
    const a = await draw(owner, rectangle(2, 2));
    const b = await draw(owner, rectangle(8, 2));
    for (const [mode, expected] of [
      ["auto", 904],
      ["subtract", 904],
      ["intersect", 96],
      ["union", 1000],
    ] as const) {
      const cut = await preview(owner, [a, b], { mode, targets: [stock.id] });
      near(cut.volume, expected);
      if (mode === "union") assert.deepEqual(owner.view.booleanTools, []);
      else {
        const tool = owner.view.booleanTools?.[0];
        assert.ok(tool);
        near(tool.volume, 96);
      }
      assert.equal(owner.view.booleanMode, mode === "auto" ? "subtract" : mode);
      assert.deepEqual(owner.view.booleanTargets, [stock.id]);
    }
    const hidden = await preview(owner, [a, b], { mode: "auto", eligibleTargets: [] });
    near(hidden.volume, 96);
    assert.equal(owner.view.candidate?.bodies?.length, 2);
    assert.deepEqual(owner.view.booleanTargets, []);
    const cap = stock.faces.find(
      (face) =>
        face.plane &&
        face.vertices.every((value, index) => index % 3 !== 2 || Math.abs(value - 10) < 1e-6),
    );
    assert.ok(cap);
    const c = await draw(owner, rectangle(20, 3));
    const addition = await preview(owner, [{ face: cap.id }, c], { mode: "auto" });
    assert.equal(owner.view.booleanMode, "union");
    near(addition.volume, 1000 + (10 / 3) * (100 + 60 + 36));
    await owner.call({ kind: "accept" });
    const accepted = owner.view.data;
    await owner.call({ kind: "undo" });
    near(owner.view.data.bodies?.[0].volume ?? 0, 1000);
    await owner.call({ kind: "redo" });
    assert.deepEqual(owner.view.data, accepted);
  } finally {
    owner.close();
  }
});

test("multiple holes pair by section-local location; cubic boundaries stay exact", async () => {
  const owner = new DocumentOwner();
  try {
    const section = (z: number): Sketch => ({
      ...rectangle(z, 8),
      curves: [
        ...rectangle(z, 8).curves,
        { id: "left", kind: "circle", center: { x: -3, y: 0 }, radius: 1, construction: false },
        { id: "right", kind: "circle", center: { x: 3, y: 0 }, radius: 2, construction: false },
      ],
    });
    const sources = [await draw(owner, section(0)), await draw(owner, section(10))];
    const body = await preview(owner, sources, { ruled: true });
    near(body.volume, (256 - 5 * Math.PI) * 10);
    await owner.call({ kind: "accept" });
    const sections = await owner.call({
      kind: "sections",
      frame: { ...planes.XY, origin: [0, 0, 5] },
      bodies: [body.id],
    });
    assert.equal(sections.error, undefined);
    const exactSection = sections.sections?.[0];
    assert.ok(exactSection);
    const profile = sectionProfile(exactSection, { ...planes.XY, origin: [0, 0, 5] });
    assert.ok(profile);
    assert.equal(profile.holes.length, 2);
    near(profile.area, 256 - 5 * Math.PI, 0.001);
    const cubic = (z: number): Sketch => ({
      ...emptySketch({ ...planes.XY, origin: [0, 0, z] }),
      curves: [
        {
          id: "bend",
          kind: "bezier",
          a: { x: -3, y: 0 },
          c1: { x: -3, y: 4 },
          c2: { x: 3, y: 4 },
          b: { x: 3, y: 0 },
          construction: false,
        },
        { id: "base", kind: "segment", a: { x: 3, y: 0 }, b: { x: -3, y: 0 }, construction: false },
      ],
    });
    const curved = [await draw(owner, cubic(0)), await draw(owner, cubic(10))];
    const result = await preview(owner, curved, { ruled: true });
    // Integral of cubic y(t) x'(t): exact enclosed area is 14.4 mm².
    near(result.volume, 144);
  } finally {
    owner.close();
  }
});
