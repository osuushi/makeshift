import { existsSync } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { nativeFlags, prepareHeaders, run } from "./native-inputs.mjs";
import { occtArchive, prepareOcctSource } from "./occt-source.mjs";
import { sdkCacheKey } from "./release/cache-key.mjs";
import { recordSdk, verifySdk } from "./sdk-provenance.mjs";

const root = resolve(import.meta.dirname, "..");
const cache = resolve(root, ".cache/kernel");
const flags = nativeFlags();
const headers = await prepareHeaders();
let sdk = process.env.OCCT_ROOT;
if (sdk) await verifySdk(resolve(sdk));
else {
  const archive = await occtArchive(cache);
  const source = resolve(cache, "source"),
    build = resolve(cache, "build");
  sdk = resolve(cache, "sdk");
  const cacheKey = await sdkCacheKey();
  let cached = false;
  if (existsSync(resolve(sdk, ".freac-sdk"))) {
    try {
      const receipt = await verifySdk(sdk);
      cached = receipt.buildKey === cacheKey;
    } catch (error) {
      console.log(`Rebuilding OCCT SDK: ${error.message}`);
    }
  }
  if (!cached) {
    const adaptedSourceHash = await prepareOcctSource(source, archive);
    // A recipe/toolchain change must not retain objects from another build.
    await rm(build, { recursive: true, force: true });
    await rm(sdk, { recursive: true, force: true });
    await mkdir(build, { recursive: true });
    run("cmake", [
      "-S",
      source,
      "-B",
      build,
      `-DCMAKE_INSTALL_PREFIX=${sdk}`,
      "-DCMAKE_BUILD_TYPE=Release",
      "-DBUILD_LIBRARY_TYPE=Shared",
      "-DBUILD_ADDITIONAL_TOOLKITS=TKDESTEP",
      ...flags,
      ...["FoundationClasses", "ModelingData", "ModelingAlgorithms"].map(
        (m) => `-DBUILD_MODULE_${m}=ON`,
      ),
      ...["Visualization", "ApplicationFramework", "DataExchange", "DETools", "Draw"].map(
        (m) => `-DBUILD_MODULE_${m}=OFF`,
      ),
      "-DUSE_TBB=OFF",
      "-DUSE_FREETYPE=OFF",
      "-DUSE_XLIB=OFF",
      "-DBUILD_USE_PCH=OFF",
      // The calculator never installs OCCT signal-to-exception handlers.
      // Retain normal C++ exceptions while removing unused setjmp work.
      ...(process.platform === "win32" ? [] : ["-DCMAKE_CXX_FLAGS=-UOCC_CONVERT_SIGNALS"]),
    ]);
    run("cmake", [
      "--build",
      build,
      "--config",
      "Release",
      "--parallel",
      process.env.CMAKE_BUILD_PARALLEL_LEVEL ?? "4",
    ]);
    run("cmake", ["--install", build, "--config", "Release"]);
    await recordSdk(sdk, cacheKey, adaptedSourceHash);
  } else {
    console.log(`Using verified cached OCCT SDK ${cacheKey}`);
    // Matching upstream sources are needed by release notices/source packaging.
    if (!existsSync(resolve(source, "CMakeLists.txt"))) await prepareOcctSource(source, archive);
  }
}
const build = resolve(root, ".build/kernel");
run("cmake", [
  "-S",
  resolve(root, "native/kernel"),
  "-B",
  build,
  "-UOpenCASCADE_DIR",
  `-DCMAKE_PREFIX_PATH=${resolve(sdk)}`,
  "-DCMAKE_BUILD_TYPE=Release",
  ...flags,
  ...headers.filter((flag) => flag.startsWith("-DBOOST")),
]);
run("cmake", ["--build", build, "--config", "Release", "--parallel", "4"]);
