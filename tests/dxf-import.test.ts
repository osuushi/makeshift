import assert from "node:assert/strict";
import test from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import { writeClipboard } from "../src/clipboard/geometry.js";
import { documentArchive, readArchive } from "../src/model/document-archive.js";
import { readDxf } from "../src/model/dxf-import.js";
import { arcCircle, arcDomain } from "../src/sketch/arc-geometry.js";
import { planes } from "../src/sketch/planes.js";
import { profilesFor } from "../src/sketch/profiles.js";

const dxf = (entities: (string | number)[], units = 4) =>
  [
    0,
    "SECTION",
    2,
    "HEADER",
    9,
    "$INSUNITS",
    70,
    units,
    0,
    "ENDSEC",
    0,
    "SECTION",
    2,
    "ENTITIES",
    ...entities,
    0,
    "ENDSEC",
    0,
    "EOF",
  ].join("\n");
const line = [0, "LINE", 10, 0, 20, 0, 11, 2, 21, 0];
const box = [
  0,
  "LWPOLYLINE",
  90,
  4,
  70,
  1,
  10,
  0,
  20,
  0,
  10,
  20,
  20,
  0,
  10,
  20,
  20,
  10,
  10,
  0,
  20,
  10,
];

test("DXF declared units, circle dimensions and wrapped CCW arc preserve exact geometry", () => {
  const result = readDxf(
    dxf(
      [...line, 0, "CIRCLE", 10, 3, 20, 4, 40, 2, 0, "ARC", 10, 0, 20, 0, 40, 2, 50, 270, 51, 180],
      1,
    ),
  );
  const [segment, circle, arc] = result.sketch.curves;
  assert.equal(segment.kind, "segment");
  if (segment.kind === "segment") assert.equal(segment.b.x, 50.8);
  assert.equal(circle.kind, "circle");
  if (circle.kind === "circle") assert.equal(circle.radius, 50.8);
  assert.equal(arc.kind, "arc");
  if (arc.kind === "arc") {
    assert.ok(Math.abs(arcDomain(arc).sweep - Math.PI * 1.5) < 1e-12);
    assert.ok(Math.abs(arcCircle(arc).radius - 50.8) < 1e-10);
  }
  assert.equal(readDxf(dxf(line, 0)).unitless, true);
  assert.equal(readDxf(dxf([999, "Exported sketch", ...line])).sketch.curves.length, 1);
});

test("DXF classic and lightweight polylines preserve signed bulges and closure", () => {
  for (const entities of [
    [0, "LWPOLYLINE", 90, 2, 70, 1, 10, 0, 20, 0, 42, -1, 10, 10, 20, 0],
    [
      0,
      "POLYLINE",
      70,
      1,
      0,
      "VERTEX",
      10,
      0,
      20,
      0,
      42,
      -1,
      0,
      "VERTEX",
      10,
      10,
      20,
      0,
      0,
      "SEQEND",
    ],
  ]) {
    const { curves } = readDxf(dxf(entities)).sketch;
    assert.equal(curves.length, 2);
    assert.equal(curves[0].kind, "arc");
    if (curves[0].kind === "arc") assert.equal(curves[0].bulge, -1);
    assert.equal(curves[1].kind, "segment");
  }
});

test("DXF rejects incomplete, unsupported, nonplanar and invalid geometry before acceptance", () => {
  for (const entities of [
    [...line, 0, "INSERT", 2, "block"],
    [...line, 30, 1],
    [...line, 230, -1],
    [0, "LINE", 10, "NaN", 20, 0, 11, 2, 21, 0],
    [0, "CIRCLE", 10, 0, 20, 0, 40, -1],
    [0, "LWPOLYLINE", 90, 4, 10, 0, 20, 0],
    [0, "POLYLINE", 70, 8, 0, "SEQEND"],
  ])
    assert.throws(() => readDxf(dxf(entities)));
  assert.throws(() => readDxf(dxf(line).replace(/0\nEOF$/, "")));
  assert.throws(() => readDxf(dxf(line, 99)));
  assert.throws(() => readDxf("AutoCAD Binary DXF\0"));
  assert.equal(readDxf(dxf([...line, 0, "TEXT", 1, "note"])).skipped, 1);
});

test("imported closed DXF forms a region and appends on a chosen plane in one Undo step", async () => {
  const owner = new DocumentOwner();
  try {
    const { sketch } = readDxf(dxf(box));
    const text = writeClipboard({ sketches: [sketch], bodies: [] });
    const target = { id: "imported", plane: planes.XZ };
    const before = owner.view.data;
    assert.equal((await owner.call({ kind: "paste-geometry", text, target })).error, undefined);
    const imported = owner.view.data;
    assert.deepEqual(readArchive(documentArchive(imported)), imported);
    assert.deepEqual(imported.sketches[0].plane, planes.XZ);
    assert.equal(profilesFor(imported.sketches[0]).length, 1);
    assert.equal(imported.sketches[0].curves.length, 4);
    assert.ok(imported.sketches[0].curves.every((c) => !sketch.curves.some((s) => s.id === c.id)));
    await owner.call({ kind: "undo" });
    assert.deepEqual(owner.view.data, before);
    await owner.call({ kind: "redo" });
    assert.deepEqual(owner.view.data, imported);
    assert.equal((await owner.call({ kind: "paste-geometry", text, target })).error, undefined);
    assert.equal(owner.view.data.sketches[0].curves.length, 8);
    await owner.call({ kind: "undo" });
    assert.deepEqual(owner.view.data, imported);
  } finally {
    owner.close();
  }
});
