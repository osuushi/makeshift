// Run after `npx tsc -p tsconfig.test.json`; each native request has a 5 s deadline.
import { writeFile } from "node:fs/promises";
import {
  FinishProbe,
  finishCases,
  finishVolume,
} from "../.cache/sketch-tests/tests/edge-finish-fuzz-fixtures.js";

const count = Number(process.argv[2] ?? 160),
  seed = Number(process.argv[3] ?? 0x57eefa84);
if (!Number.isInteger(count) || count < 1 || count > 1000 || !Number.isInteger(seed))
  throw Error("Use a count of 1–1000 and an integer seed");
const probe = new FinishProbe(),
  incorrect = [],
  rejected = [];
let accepted = 0,
  resizeAccepted = 0;
const check = (index, parameters, body, path) => {
  const error = Math.abs(body.volume - finishVolume(parameters));
  if (!Number.isFinite(error) || error > 0.005 || body.faces.filter((f) => f.plane).length !== 2)
    incorrect.push({ index, parameters, error, faces: body.faces.length, path });
};
try {
  for (const [index, parameters] of finishCases(seed, count).entries()) {
    let path = "direct";
    try {
      const { body, mouth } = await probe.run(parameters);
      accepted++;
      check(index, parameters, body, path);
      if (index % 4 < 2) {
        path = "resize";
        const start = Math.min(parameters.size / 2, 4);
        const small = await probe.finish(mouth, 40, start, parameters.mode);
        const resized = await probe.resize(small, start, parameters.size, parameters.mode);
        resizeAccepted++;
        check(index, parameters, resized, path);
      }
    } catch (error) {
      const item = { index, parameters, path, error: String(error) };
      if (
        /not feasible|Could not recover|Could not identify|Could not remove|Cannot classify/.test(
          String(error),
        )
      )
        rejected.push(item);
      else incorrect.push(item);
    }
    if ((index + 1) % 20 === 0)
      console.log(
        `${index + 1}/${count}: ${accepted} accepted, ${resizeAccepted} resized, ${rejected.length} rejected, ${incorrect.length} incorrect/errors`,
      );
  }
} finally {
  await probe.close();
}
const result = { seed, count, accepted, resizeAccepted, rejected, incorrect };
await writeFile(".cache/edge-finish-fuzz-results.json", JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
process.exitCode = incorrect.length ? 1 : 0;
