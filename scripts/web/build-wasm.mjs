import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { prepareHeaders, run } from "../native-inputs.mjs";
import { occtArchive, prepareOcctSource } from "../occt-source.mjs";
import { prepareSolverSource } from "../solver-source.mjs";
import { recordWebSdk, webRecipe } from "./sdk.mjs";

const root = resolve(import.meta.dirname, "../..");
const cache = resolve(root, ".cache/web");
const sdk = resolve(cache, "sdk");
const compiler = execFileSync("emcc", ["--version"], { encoding: "utf8" });
if (!/\b4\.0\.20\b/.test(compiler)) throw new Error("Use the pinned Emscripten 4.0.20 SDK");
const headers = await prepareHeaders();
const solverSource = await prepareSolverSource(resolve(cache, "solver-source"));
await mkdir(cache, { recursive: true });
// The exact adapted source used by desktop, compiled independently for wasm32.
const source = resolve(cache, "occt");
const recipe = await webRecipe();
const marker = resolve(cache, "source-recipe");
const archive = await occtArchive(cache);
if (!existsSync(marker) || (await readFile(marker, "utf8")) !== recipe) {
  await prepareOcctSource(source, archive);
  await rm(resolve(cache, "occt-build"), { recursive: true, force: true });
  await rm(sdk, { recursive: true, force: true });
  await writeFile(marker, recipe);
}
const configure = (args) => run("emcmake", ["cmake", ...args]);
const build = (directory) =>
  run("cmake", ["--build", directory, "--parallel", process.env.CMAKE_BUILD_PARALLEL_LEVEL ?? "4"]);
const occtBuild = resolve(cache, "occt-build");
configure([
  "-S",
  source,
  "-B",
  occtBuild,
  `-DCMAKE_INSTALL_PREFIX=${sdk}`,
  "-DCMAKE_BUILD_TYPE=Release",
  "-DBUILD_LIBRARY_TYPE=Static",
  "-DCMAKE_CXX_FLAGS=-fexceptions",
  "-DBUILD_ADDITIONAL_TOOLKITS=TKDESTEP",
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
]);
build(occtBuild);
run("cmake", ["--install", occtBuild]);
await recordWebSdk(sdk);
for (const kind of ["solver", "kernel"]) {
  const directory = resolve(root, `.build/web-${kind}`);
  configure([
    "-S",
    resolve(root, `native/${kind}`),
    "-B",
    directory,
    "-DCMAKE_BUILD_TYPE=Release",
    "-DCMAKE_CXX_FLAGS=-fexceptions",
    `-DCMAKE_PREFIX_PATH=${sdk}`,
    `-DOpenCASCADE_DIR=${resolve(sdk, "lib/cmake/opencascade")}`,
    `-DPLANEGCS_SOURCE=${solverSource}`,
    ...headers,
  ]);
  build(directory);
}
