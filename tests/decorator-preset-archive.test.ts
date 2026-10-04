import assert from "node:assert/strict";
import test from "node:test";
import { threadDefinition, threadSettings } from "../src/decorators/thread-settings.js";
import { readArchive } from "../src/model/document-archive.js";
import { planes } from "../src/sketch/planes.js";

const resolved = {
  preset: "print-sideways",
  pitch: 3.7,
  profile: "rounded",
  clearance: 0.37,
  tipTruncation: 0.12,
  hand: "left",
  cut: "hole",
  start: 0.4,
  end: 0.6,
  startTaper: 0.2,
  endTaper: 0.3,
  layerHeight: 0.23,
  nozzleDiameter: 0.71,
};

for (const preset of ["print-upright", "print-sideways"]) {
  test(`opening saved ${preset} changes only its label to Custom`, () => {
    const settings = { ...resolved, preset };
    const instance = {
      id: "legacy-thread",
      definition: threadDefinition,
      version: 1,
      settings,
      faces: [{ body: "saved-body", face: "saved-face" }],
      frame: planes.XY,
      axialReference: [0, 10],
    };
    const document = {
      units: "mm",
      sketches: [],
      bodies: [{ id: "saved-body", brep: "exact saved geometry" }],
      decorators: [instance],
    };
    const archive = JSON.stringify({ format: "makeshift", version: 1, document });
    const opened = readArchive(archive);
    assert.deepEqual(opened, {
      ...document,
      decorators: [{ ...instance, settings: { ...settings, preset: "custom" } }],
    });
    assert.deepEqual(threadSettings(opened.decorators?.[0].settings ?? {}), {
      ...settings,
      preset: "custom",
    });
    assert.equal(JSON.parse(archive).document.decorators[0].settings.preset, preset);
  });
}

test("archive normalization leaves other decorators and current settings intact", () => {
  const document = {
    units: "mm",
    sketches: [],
    decorators: [
      { definition: "example.custom", settings: resolved },
      { definition: threadDefinition, settings: { ...resolved, preset: "custom" } },
    ],
  };
  assert.deepEqual(
    readArchive(JSON.stringify({ format: "makeshift", version: 1, document })),
    document,
  );
});
