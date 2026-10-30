import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { selectedPreviewSupports } from "../src/decorators/preview-selection.js";
import { threadPreviewFaces } from "../src/decorators/thread-preview-surface.js";
import type { DisplayDocument } from "../src/model/display-document.js";

test("thread body-wide occlusion does not turn unrelated face selection into a support pulse", () => {
  const { document } = JSON.parse(
    readFileSync("tests/fixtures/thread-texture-aliasing.json", "utf8"),
  ) as { document: DisplayDocument };
  const instances = document.decorators ?? [];
  const instance = instances[0];
  assert.ok(instance);
  const support = instance.faces[0];
  const unrelated = threadPreviewFaces(document, instance).find(
    (face) => face.body === support.body && !instance.faces.some((s) => s.face === face.face),
  );
  assert.ok(unrelated, "fixture includes an occluding face outside the thread supports");
  assert.deepEqual(selectedPreviewSupports(instances, [{ kind: "face", ...unrelated }]), new Set());
  assert.deepEqual(
    selectedPreviewSupports(instances, [{ kind: "face", ...support }]),
    new Set([instance.id]),
  );
  assert.deepEqual(
    selectedPreviewSupports(instances, [{ kind: "body", body: support.body }]),
    new Set([instance.id]),
  );
  assert.deepEqual(selectedPreviewSupports(instances, []), new Set());
});
