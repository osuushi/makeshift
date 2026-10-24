import assert from "node:assert/strict";
import test from "node:test";
import { DocumentStore } from "../src/backend/document-store.js";
import { validateDocument } from "../src/backend/document-validation.js";
import { documentArchive, readArchive } from "../src/model/document-archive.js";
import { readPortableArchive, writePortableArchive } from "../src/model/portable-archive.js";
import { defaultSketchGrid, validateSketchGrid } from "../src/sketch/grid-settings.js";

test("grid preferences survive archives and geometry Undo without consuming an Undo step", () => {
  const store = new DocumentStore();
  store.setGrid({ ...defaultSketchGrid }, true);
  assert.equal(store.canUndo, false);
  const grid = { ...defaultSketchGrid, minor: 2, majorColor: "#cc2244", snap: false };
  store.accept({ ...store.data, bodies: [] }, { kind: "clear", parameters: {} });
  store.setGrid(grid);
  store.undo();
  assert.deepEqual(store.data.sketchGrid, grid);
  assert.equal(store.data.bodies, undefined);
  store.redo();
  assert.deepEqual(store.data.sketchGrid, grid);
  assert.deepEqual(store.data.bodies, []);
  store.setGrid({ ...defaultSketchGrid }, true);
  assert.deepEqual(store.data.sketchGrid, grid, "device defaults never replace document choices");
  assert.deepEqual(readArchive(documentArchive(store.data)).sketchGrid, grid);
  const bytes = writePortableArchive(documentArchive(store.data), {
    "workspace/note.txt": new Uint8Array([65]),
  });
  assert.deepEqual(readPortableArchive(bytes).document.sketchGrid, grid);
});

test("old documents remain valid, malformed grid preferences reject", () => {
  validateDocument({ units: "mm", sketches: [] });
  for (const minor of [0, -1, Infinity, NaN, 1e-8])
    assert.throws(() => validateSketchGrid({ ...defaultSketchGrid, minor }));
  assert.throws(() => validateSketchGrid({ ...defaultSketchGrid, majorColor: "red" }));
  assert.throws(() => validateSketchGrid({ ...defaultSketchGrid, snap: "yes" }));
});
