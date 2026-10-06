import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readPortableArchive } from "../.build/host/model/portable-archive.js";
import { saveDocument } from "./native-documents.mjs";
import { decoratorCylinder } from "./ui-decorator-cylinder.mjs";
import { close, inspect, modalCompleted } from "./ui-helpers.mjs";
import { relativeOffsetInput } from "./ui-offset-input.mjs";
import { chooseTool } from "./ui-tools.mjs";

export async function savePreviewSwitchRoute(page, name) {
  await decoratorCylinder(page, 8);
  const original = (await inspect(page)).document;
  await page.getByRole("button", { name: "Offset faces", exact: true }).click();
  await (await relativeOffsetInput(page)).fill("1");
  const preview = await inspect(page);
  assert.equal(preview.interaction.kind, "face-offset");
  assert.deepEqual(preview.document, original);
  close(preview.preview.bodies[0].volume, 810 * Math.PI, "Offset preview volume");
  const directory = await mkdtemp(join(tmpdir(), "makeshift-mode-switch-save-"));
  try {
    // Existing helper uses actual Electron File → Save As and browser download controls.
    const path = join(directory, "accepted-preview.makeshift");
    await saveDocument(page, path);
    await modalCompleted(page);
    const accepted = (await inspect(page)).document;
    close(accepted.bodies[0].volume, 810 * Math.PI, "Accepted Offset volume");
    close(
      accepted.bodies[0].faces.find((face) => face.cylinder).cylinder.radius,
      9,
      "Accepted Offset radius",
    );
    const { bodies: savedBodies, ...savedFields } = readPortableArchive(
      await readFile(path),
    ).document;
    const { bodies: acceptedBodies, ...acceptedFields } = accepted;
    assert.deepEqual(savedFields, acceptedFields);
    assert.equal(savedBodies.length, acceptedBodies.length);
    for (let i = 0; i < savedBodies.length; i++) {
      const saved = savedBodies[i],
        body = acceptedBodies[i];
      assert.deepEqual(Object.keys(saved).sort(), ["brep", "edges", "faces", "id"]);
      assert.equal(saved.id, body.id);
      assert.equal(saved.brep, body.brep, "Saved accepted BRep is byte-identical");
      for (const kind of ["faces", "edges"]) {
        assert.equal(saved[kind].length, body[kind].length);
        for (let j = 0; j < saved[kind].length; j++) {
          assert.deepEqual(Object.keys(saved[kind][j]).sort(), ["id", "signature"]);
          assert.equal(saved[kind][j].id, body[kind][j].id);
          assert.deepEqual(saved[kind][j].signature, body[kind][j].signature);
        }
      }
    }
    await chooseTool(page, "undo", "undo");
    assert.deepEqual((await inspect(page)).document, original);
    await chooseTool(page, "redo", "redo");
    assert.deepEqual((await inspect(page)).document, accepted);
    console.log(
      `${name}: ordinary Save accepts released Offset, archives accepted geometry, exact Undo/Redo passed`,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
