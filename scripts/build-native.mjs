import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { compilerCacheFlags } from "./native-build-cache.mjs";
import { nativeFlags } from "./native-inputs.mjs";

const root = resolve(import.meta.dirname, "..");
const cacheFlags = compilerCacheFlags(root);

if (process.platform !== "win32") {
  const source = resolve(import.meta.dirname, "../native/host");
  const build = resolve(import.meta.dirname, "../.build/host-native");
  const options = [
    ...(process.platform === "darwin" ? ["-DCMAKE_OSX_DEPLOYMENT_TARGET=14.0"] : []),
    ...nativeFlags(),
    ...cacheFlags,
  ];
  for (const args of [
    ["-S", source, "-B", build, "-DCMAKE_BUILD_TYPE=Release", ...options],
    ["--build", build, "--parallel", "2"],
  ]) {
    const result = spawnSync("cmake", args, { stdio: "inherit" });
    if (result.error) throw result.error;
    if (result.status !== 0) process.exit(result.status ?? 1);
  }
}

for (const component of ["solver", "kernel", "mesh"]) {
  const build = resolve(import.meta.dirname, `../.build/${component}`);
  if (!existsSync(resolve(build, "CMakeCache.txt"))) {
    console.error(
      `Native ${component} is not configured. Run npm run ${component === "solver" ? "setup:native" : `setup:${component}`} (see README.md).`,
    );
    process.exit(1);
  }
  // Refresh launcher settings even for checkouts configured before caching existed.
  const configured = readFileSync(resolve(build, "CMakeCache.txt"), "utf8");
  const launcher = configured.match(/^CMAKE_CXX_COMPILER_LAUNCHER:[^=]+=(.*)$/m)?.[1];
  if (cacheFlags.length && cacheFlags[0] !== `-DCMAKE_CXX_COMPILER_LAUNCHER=${launcher}`) {
    const configure = spawnSync(
      "cmake",
      ["-S", resolve(root, `native/${component}`), "-B", build, ...cacheFlags],
      { stdio: "inherit" },
    );
    if (configure.error) throw configure.error;
    if (configure.status !== 0) process.exit(configure.status ?? 1);
  }
  const result = spawnSync("cmake", ["--build", build, "--config", "Release", "--parallel", "2"], {
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
