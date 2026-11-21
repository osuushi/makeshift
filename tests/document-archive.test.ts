import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import { singleBench } from "../src/model/benches.js";
import {
  archivedDrawing,
  documentArchive,
  drawingArchive,
  readArchive,
  readFileArchive,
} from "../src/model/document-archive.js";
import { readPortableArchive, writePortableArchive } from "../src/model/portable-archive.js";
import type { PortableFiles } from "../src/model/portable-files.js";
import { planes } from "../src/sketch/planes.js";

test("Makeshift writes its name and opens the previous JSON format without rewriting data", () => {
  const document = { units: "mm" as const, sketches: [] };
  const legacy = JSON.stringify({ format: "freac", version: 1, document });
  assert.deepEqual(readArchive(legacy), document);
  assert.equal(JSON.parse(documentArchive(readArchive(legacy))).format, "makeshift");
  assert.throws(() => readArchive(legacy.replace('"freac"', '"unrelated"')), /Unsupported/);
});

test("recognizes a real prototype archive before attempting JSON parsing", () => {
  const archive = readFileSync("tests/fixtures/legacy-archives/legacy-v4-rectangles.bin", "utf8");
  assert.throws(() => readArchive(archive), /older Freac prototype/);
});

test("current document archives retain their round trip", () => {
  const document = { units: "mm" as const, sketches: [] };
  assert.deepEqual(readArchive(documentArchive(document)), document);
  const camera = {
    position: [10, -20, 30] as [number, number, number],
    target: [2, 3, 4] as [number, number, number],
    up: [0, 0, 1] as [number, number, number],
    height: 42,
  };
  assert.deepEqual(readFileArchive(documentArchive(document, camera)), { document, camera });
  assert.deepEqual(readFileArchive(documentArchive(document)), { document });
  assert.throws(
    () =>
      readFileArchive(
        JSON.stringify({
          format: "makeshift",
          version: 1,
          document,
          camera: { ...camera, height: null },
        }),
      ),
    /Invalid saved camera/,
  );
});

test("plain and portable drawings preserve ordered benches, names and the saved active camera", () => {
  const document = { units: "mm" as const, sketches: [] };
  const drawing = {
    activeBench: "detail",
    benches: [
      ...singleBench(document).benches,
      {
        id: "detail",
        name: "Detail",
        document: { ...document, constructionPlanes: [{ id: "saved", frame: planes.XZ }] },
      },
    ],
  };
  const camera = {
    position: [12, -20, 24],
    target: [0, 0, 0],
    up: [0, 0, 1],
    height: 30,
  } satisfies import("../src/model/camera-state.js").CameraState;
  const data = drawingArchive(drawing, camera);
  assert.equal(JSON.parse(data).version, 4);
  const examples: PortableFiles[] = [{}, { "workspace/notes": new Uint8Array([1, 2, 3]) }];
  for (const files of examples) {
    const archive = readPortableArchive(writePortableArchive(data, files));
    assert.deepEqual(archivedDrawing(archive), drawing);
    assert.deepEqual(archive.camera, camera);
    assert.deepEqual(archive.files, files);
  }
  assert.equal(JSON.parse(drawingArchive(singleBench(document))).version, 1);
  assert.deepEqual(
    archivedDrawing(readFileArchive(documentArchive(document))),
    singleBench(document),
  );
  assert.throws(
    () => readFileArchive(data.replace('"id":"detail"', '"id":"main"')),
    /Invalid drawing bench/,
  );
});

test("an invalid inactive bench leaves the current drawing intact on Open", async () => {
  const owner = new DocumentOwner();
  try {
    await owner.call({ kind: "bench", edit: { action: "create" } });
    const before = owner.drawing;
    const broken = {
      ...before,
      benches: [
        ...before.benches,
        {
          id: "invalid",
          name: "Invalid",
          document: {
            units: "mm" as const,
            sketches: [],
            constructionPlanes: [
              { id: "duplicate", frame: planes.XY },
              { id: "duplicate", frame: planes.XZ },
            ],
          },
        },
      ],
    };
    const reply = await owner.call({ kind: "open", drawing: broken });
    assert.match(reply.error ?? "", /duplicate document identity/);
    assert.deepEqual(owner.drawing, before);
  } finally {
    owner.close();
  }
});
