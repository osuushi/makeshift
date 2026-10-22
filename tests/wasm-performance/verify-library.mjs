import { resolve } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { Client } from "../geometry-performance/client.mjs";
import { prepareBroadCases } from "./broad-cases.mjs";

const directory = process.argv[2];
if (!directory || process.platform !== "darwin")
  throw new Error("Usage on macOS: verify-library.mjs LIBRARY_DIRECTORY [CASE_REGEX]");
const filter = new RegExp(process.argv[3] ?? ".*");
const executable = resolve(".build/kernel/bin/makeshift-kernel");
const preparation = new Client(executable, 1);
let cases;
try {
  ({ cases } = await prepareBroadCases(preparation));
} finally {
  await preparation.close();
}
const original = new Client(executable, 1);
const candidate = new Client(
  executable,
  1,
  180_000,
  directory === "-" ? {} : { DYLD_LIBRARY_PATH: resolve(directory) },
);
try {
  for (const scenario of cases.filter((item) => filter.test(item.name))) {
    // Size-limit cases are composed of probes and compared by the main harness.
    if (scenario.limitDocument) continue;
    const before = await original.request(scenario.input);
    const after = await candidate.request(scenario.input);
    if (isDeepStrictEqual(after.reply, before.reply)) {
      console.log(`${scenario.name}: complete result matches`);
    } else {
      console.error(`${scenario.name}: complete result DIFFERS`);
      process.exitCode = 1;
    }
  }
} finally {
  await original.close();
  await candidate.close();
}
