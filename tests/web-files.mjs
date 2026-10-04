import assert from "node:assert/strict";
import { strToU8, unzipSync, zipSync } from "three/addons/libs/fflate.module.js";
import { inspect } from "./ui-helpers.mjs";
import { chooseTool } from "./ui-tools.mjs";

export async function browserFileFailures(page) {
  const before = JSON.stringify((await inspect(page)).document);
  await page.getByLabel("Open Makeshift file").setInputFiles({
    name: "broken.makeshift",
    mimeType: "application/octet-stream",
    buffer: Buffer.from("broken"),
  });
  assert.equal(JSON.stringify((await inspect(page)).document), before);
  // Picker cancellation and failed writes must never discard the accepted model.
  await page.evaluate(() => {
    window.showSaveFilePicker = async () => {
      throw new DOMException("Cancelled", "AbortError");
    };
  });
  await chooseTool(page, "save as", "save-as");
  assert.equal(JSON.stringify((await inspect(page)).document), before);
  await page.evaluate(() => {
    window.saveAborted = false;
    window.showSaveFilePicker = async () => ({
      name: "test.makeshift",
      createWritable: async () => ({
        write: async () => {
          throw new Error("Disk full");
        },
        close: async () => {
          throw new Error("Must not close failed write");
        },
        abort: async () => {
          window.saveAborted = true;
        },
      }),
    });
  });
  await chooseTool(page, "save as", "save-as");
  await page.waitForFunction(() => window.saveAborted);
  assert.equal(JSON.stringify((await inspect(page)).document), before);
  await browserFileRoundtrip(page, before);
}

async function browserFileRoundtrip(page, before) {
  // Exercise the real archive codec through the browser file-handle boundary.
  await page.evaluate(() => {
    window.showSaveFilePicker = async () => ({
      name: "test.makeshift",
      createWritable: async () => ({
        write: async (bytes) => {
          window.savedArchive = Array.from(bytes);
        },
        close: async () => {
          window.saveClosed = true;
        },
        abort: async () => {
          throw new Error("Unexpected abort");
        },
      }),
    });
  });
  await chooseTool(page, "save as", "save-as");
  await page.waitForFunction(() => window.saveClosed);
  const buffer = Buffer.from(await page.evaluate(() => window.savedArchive));
  await chooseTool(page, "new", "new");
  await page.getByLabel("Open Makeshift file").setInputFiles({
    name: "test.makeshift",
    mimeType: "application/octet-stream",
    buffer,
  });
  assert.equal(JSON.stringify((await inspect(page)).document), before);
  const model = JSON.parse(buffer.toString());
  const attached = {
    "workspace/notes.txt": strToU8("Keep these notes"),
    "conversations/codex/sessions/example.jsonl": strToU8('{"preserved":true}\n'),
  };
  const portable = Buffer.from(
    zipSync({
      "model.json": strToU8(JSON.stringify({ ...model, format: "makeshift", version: 2 })),
      ...attached,
    }),
  );
  await page.getByLabel("Open Makeshift file").setInputFiles({
    name: "portable.makeshift",
    mimeType: "application/octet-stream",
    buffer: portable,
  });
  await inspect(page);
  await page.evaluate(() => {
    window.saveClosed = false;
  });
  await chooseTool(page, "save as", "save-as");
  await page.waitForFunction(() => window.saveClosed);
  const roundtrip = unzipSync(new Uint8Array(await page.evaluate(() => window.savedArchive)));
  for (const [path, bytes] of Object.entries(attached)) assert.deepEqual(roundtrip[path], bytes);
  assert.equal(JSON.stringify((await inspect(page)).document), before);
  await page.evaluate(() => {
    window.showSaveFilePicker = undefined;
  });
}
