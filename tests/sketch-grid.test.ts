import assert from "node:assert/strict";
import test from "node:test";
import { DocumentStore } from "../src/backend/document-store.js";
import { validateDocument } from "../src/backend/document-validation.js";
import { documentArchive, readArchive } from "../src/model/document-archive.js";
import { readPortableArchive, writePortableArchive } from "../src/model/portable-archive.js";
import {
  defaultSketchGrid,
  validateSketchGrid,
  visibleSketchGrid,
} from "../src/sketch/grid-settings.js";

test("minor and major grids choose the smallest integer multiples at the pixel threshold", () => {
  for (const pixelsPerMm of [0.04, 0.2, 0.39, 0.4, 1, 7.999, 8, 20, 1000]) {
    const shown = visibleSketchGrid(defaultSketchGrid, pixelsPerMm, 4);
    for (const field of ["minor", "major"] as const) {
      assert.ok(shown[field] * pixelsPerMm >= 4 - 1e-10);
      assert.equal(
        shown[field] / defaultSketchGrid[field],
        Math.round(shown[field] / defaultSketchGrid[field]),
      );
      assert.ok(
        shown[field] === defaultSketchGrid[field] ||
          (shown[field] - defaultSketchGrid[field]) * pixelsPerMm < 4,
      );
    }
  }
  assert.deepEqual(visibleSketchGrid(defaultSketchGrid, 8, 4), {
    minor: 0.5,
    major: 10,
    hideMinor: false,
    snap: 0.5,
  });
  assert.equal(visibleSketchGrid(defaultSketchGrid, 4, 4).snap, 1);
  assert.equal(visibleSketchGrid(defaultSketchGrid, 0.4, 4).hideMinor, true);
});

test("common factors suppress a coarser minor grid, including non-multiples", () => {
  assert.deepEqual(visibleSketchGrid({ ...defaultSketchGrid, minor: 3 }, 0.4, 4), {
    minor: 12,
    major: 10,
    hideMinor: true,
    snap: 10,
  });
  assert.equal(visibleSketchGrid({ ...defaultSketchGrid, minor: 11 }, 1, 4).hideMinor, false);
  assert.equal(
    visibleSketchGrid({ ...defaultSketchGrid, minor: 0.3, major: 1 }, 4, 4).hideMinor,
    true,
  );
});

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
