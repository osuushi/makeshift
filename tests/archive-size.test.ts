import assert from "node:assert/strict";
import test, { afterEach, beforeEach } from "node:test";
import { strToU8 } from "three/addons/libs/fflate.module.js";
import { documentArchive } from "../src/model/document-archive.js";
import { readPortableArchive, writePortableArchive } from "../src/model/portable-archive.js";
import { archiveLimits } from "../src/model/portable-files.js";

// Exercise exact boundaries without allocating multi-gigabyte fixtures.
const productionBytes = archiveLimits.bytes;
beforeEach(() => {
  archiveLimits.bytes = 1024 * 1024;
});
afterEach(() => {
  archiveLimits.bytes = productionBytes;
});

function modelBytes(size: number): string {
  const document = { units: "mm" as const, sketches: [], padding: "" };
  const base = documentArchive(document);
  return base.replace('"padding":""', `"padding":"${"x".repeat(size - base.length)}"`);
}

test("model-only writer and raw reader agree at the expanded limit", () => {
  const atLimit = modelBytes(archiveLimits.bytes);
  const bytes = writePortableArchive(atLimit, {});
  assert.equal(bytes.length, archiveLimits.bytes);
  assert.equal(readPortableArchive(bytes).document.units, "mm");
  assert.throws(() => writePortableArchive(`${atLimit} `, {}), /2 GiB/);
  assert.throws(() => readPortableArchive(strToU8(`${atLimit} `)), /2 GiB/);
  assert.throws(
    () => writePortableArchive(atLimit.replace('"padding":"x', '"padding":"é'), {}),
    /2 GiB/,
  );
});

test("portable content and the model share one byte limit", () => {
  const files = { "workspace/one-byte.txt": new Uint8Array([120]) };
  assert.throws(() => writePortableArchive(modelBytes(archiveLimits.bytes), files), /2 GiB/);
  const bytes = writePortableArchive(modelBytes(archiveLimits.bytes - 1), files);
  const reopened = readPortableArchive(bytes);
  assert.deepEqual(reopened.files, files);
  assert.equal(reopened.document.units, "mm");
});
