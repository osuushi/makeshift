import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { decoratorTexture } from "../src/decorators/decorator-texture.js";
import { previewMeshTransfers } from "../src/decorators/preview-wire.js";
import type { DisplayDocument } from "../src/model/display-document.js";

test("captured fine-pitch thread transports only the support and analytic parameters", () => {
  const { document } = JSON.parse(
    readFileSync("tests/fixtures/thread-texture-aliasing.json", "utf8"),
  ) as { document: DisplayDocument };
  const instance = document.decorators?.[0];
  assert.ok(instance);
  const textures = decoratorTexture(document, instance);
  assert.ok(textures);
  assert.equal(textures.length, 1);
  const face = document.bodies?.[0].faces.find((face) => face.id === instance.faces[0].face);
  assert.ok(face);
  assert.equal(textures[0].positions.length, face.vertices.length);
  assert.equal(textures[0].parameters.settings.pitch, 1);
  assert.deepEqual(textures[0].parameters.bounds, [0, 41.5]);
  const packed = { positions: new Float32Array(), indices: new Uint32Array(), textures };
  assert.ok(previewMeshTransfers(packed).includes(textures[0].positions.buffer));
  const edited = decoratorTexture(document, {
    ...instance,
    settings: { ...instance.settings, pitch: 1.5 },
  });
  assert.ok(edited);
  assert.equal(edited[0].parameters.settings.pitch, 1.5);
  assert.equal(decoratorTexture(document, { ...instance, definition: "custom" }), undefined);
});
