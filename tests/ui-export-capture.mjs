import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { strFromU8, unzipSync } from "three/addons/libs/fflate.module.js";
import { STLLoader } from "three/addons/loaders/STLLoader.js";
import { openDocument } from "./native-documents.mjs";
import { inspect } from "./ui-helpers.mjs";
import { chooseTool } from "./ui-tools.mjs";

export async function exportCapture(page, name, app) {
  const body = JSON.parse(await readFile("tests/fixtures/filleted-export.json", "utf8"));
  await openDocument(page, {
    name: "filleted-export.makeshift",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({
        format: "makeshift",
        version: 1,
        document: { units: "mm", sketches: [], bodies: [body] },
      }),
    ),
  });
  await page.waitForFunction(
    (id) => window.makeshiftInspect().document.bodies?.[0]?.id === id,
    body.id,
  );
  const before = await inspect(page);
  const triangleCount =
    before.document.bodies[0].faces.reduce((sum, face) => sum + face.vertices.length / 9, 0) - 6;
  for (const format of ["3mf", "stl"]) {
    const path = resolve(`.cache/sketch-review/${name}-filleted-export.${format}`);
    const waiting = app
      ? app.evaluate(
          ({ BrowserWindow }, path) =>
            new Promise((resolve, reject) => {
              BrowserWindow.getAllWindows()[0].webContents.session.once(
                "will-download",
                (_, item) => {
                  item.setSavePath(path);
                  item.once("done", (_, state) =>
                    state === "completed" ? resolve(item.getFilename()) : reject(new Error(state)),
                  );
                },
              );
            }),
          path,
        )
      : page.waitForEvent("download");
    await chooseTool(page, `export ${format}`, `export-${format}`);
    const download = await waiting;
    assert.equal(
      typeof download === "string" ? download : download.suggestedFilename(),
      `filleted-export.${format}`,
      "Export uses the opened document identity",
    );
    if (typeof download !== "string") await download.saveAs(path);
    const bytes = await readFile(path);
    if (format === "stl") {
      const geometry = new STLLoader().parse(
        bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
      );
      assert.equal(geometry.attributes.position.count, triangleCount * 3);
      assert.ok(Array.from(geometry.attributes.position.array).every(Number.isFinite));
      geometry.dispose();
    } else {
      const xml = strFromU8(unzipSync(bytes)["3D/3dmodel.model"]);
      assert.equal((xml.match(/<triangle /g) ?? []).length, triangleCount);
      assert.equal((xml.match(/<item /g) ?? []).length, 1);
    }
    assert.deepEqual((await inspect(page)).document, before.document);
  }
  console.log(
    `${name}: captured filleted body opens, remeshes and downloads STL/3MF without document changes`,
  );
}
