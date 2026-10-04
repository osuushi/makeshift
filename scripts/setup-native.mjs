import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { nativeFlags, prepareHeaders } from "./native-inputs.mjs";
import { prepareSolverSource } from "./solver-source.mjs";

const root = resolve(import.meta.dirname, "..");
const source = resolve(root, ".cache/solver/source");
const build = resolve(root, ".build/solver");
const headers = await prepareHeaders();
await prepareSolverSource();
for (const args of [
  [
    "-S",
    resolve(root, "native/solver"),
    "-B",
    build,
    `-DPLANEGCS_SOURCE=${source}`,
    "-DCMAKE_BUILD_TYPE=Release",
    ...headers,
    ...nativeFlags(),
  ],
  ["--build", build, "--config", "Release", "--parallel", "2"],
]) {
  const result = spawnSync("cmake", args, { stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
