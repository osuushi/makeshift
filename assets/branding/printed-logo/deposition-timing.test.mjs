import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  depositionPlan,
  prefixByVolume,
  segmentVolumes,
  startupTiming,
} from "./deposition-timing.mjs";
import { parseGcode } from "./gcode.mjs";

function path(z, areas) {
  return {
    z,
    height: 0.2,
    type: "Solid infill",
    points: Array.from({ length: areas.length + 1 }, (_, i) => [i * 10, 0, z]),
    widths: areas.map(() => 1),
    volumeWidths: areas.map((area) => area / 0.2 + 0.2 * (1 - Math.PI / 4)),
  };
}

test("volume-cut prefixes interpolate within segments rather than revealing mesh faces", () => {
  const source = path(0.2, [1, 3]);
  const volumes = segmentVolumes(source);
  assert.deepEqual(volumes, [10, 30]);
  const half = prefixByVolume(source, volumes, 20);
  assert.ok(Math.abs(half.points.at(-1)[0] - (10 + 10 / 3)) < 1e-10);
  assert.ok(Math.abs(segmentVolumes(half).reduce((a, b) => a + b, 0) - 20) < 1e-10);
  assert.deepEqual(half.widths, source.widths);
  assert.deepEqual(source.points.at(-1), [20, 0, 0.2]);
});

test("layer time is independent of layer volume while first layer receives 0.75s", () => {
  const plan = depositionPlan([path(0.2, [1]), path(0.4, [30]), path(0.6, [0.1])]);
  assert.equal(plan.layers[0].end, 0.75);
  assert.ok(Math.abs(plan.layers[1].end - plan.layers[1].start - 0.425) < 1e-10);
  assert.ok(Math.abs(plan.layers[2].end - plan.layers[2].start - 0.425) < 1e-10);
  assert.equal(plan.frames[104].completePaths, 1);
  assert.equal(plan.frames[104].partial, null);
  assert.equal(plan.frames.at(-1).completePaths, 3);
});

test("empty macro opening advances continuously into the unchanged layer sequence", () => {
  const paths = parseGcode(
    readFileSync(new URL("./icon.gcode", import.meta.url), "utf8"),
    1.75,
    0.0005,
  );
  const plan = depositionPlan(paths);
  assert.equal(plan.layers.length, 25);
  assert.equal(plan.frames.length, 156);
  assert.equal(plan.frames[0].depositedVolume, 0);
  assert.equal(plan.frames[0].completePaths, 0);
  assert.equal(plan.frames[0].partial, null);
  const macroFrames = startupTiming.macroSeconds * startupTiming.fps;
  let previous = 0;
  for (const frame of plan.frames.slice(1)) {
    assert.ok(frame.depositedVolume > previous, `Frame ${frame.frame} must add material`);
    if (frame.frame <= 45 + macroFrames) {
      assert.equal(frame.layerIndex, 0);
      const divisor = frame.frame <= macroFrames + 1 ? macroFrames : 1;
      assert.ok(
        Math.abs(frame.depositedVolume - previous - plan.layers[0].volume / 45 / divisor) < 1e-8,
      );
    }
    const completed = plan.volumes.slice(0, frame.completePaths).reduce((a, b) => a + b, 0);
    const partial = frame.partial ? segmentVolumes(frame.partial).reduce((a, b) => a + b, 0) : 0;
    assert.ok(
      Math.abs(completed + partial - frame.depositedVolume) < 1e-7,
      `Frame ${frame.frame} geometry must match its volume quota`,
    );
    previous = frame.depositedVolume;
  }
  const interval = (startupTiming.printSeconds - 0.75) / 24;
  for (const layer of plan.layers.slice(1)) {
    assert.ok(Math.abs(layer.end - layer.start - interval) < 1e-10);
    const samples = plan.frames.filter((frame) => frame.layerIndex === plan.layers.indexOf(layer));
    assert.ok(samples.length >= 2, "Each later layer has at least two 60fps samples");
    for (let i = 1; i < samples.length; i++)
      assert.ok(
        Math.abs(
          samples[i].depositedVolume -
            samples[i - 1].depositedVolume -
            layer.volume / interval / startupTiming.fps,
        ) < 1e-8,
      );
  }
  assert.equal(plan.frames.at(-1).completePaths, paths.length);
  assert.equal(plan.frames.at(-1).partial, null);
});
