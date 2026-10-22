// Isolated macOS research library built from existing native OCCT objects. No installed SDK or upstream checkout is edited.
// The generated file retains OCCT's LGPL-2.1 + exception notices. Redistributing
// that library requires the corresponding generated source and these modifications.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, symlink, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { webBuildConfig } from "../../scripts/web/config.mjs";

if (process.platform !== "darwin") throw new Error("This interposition experiment is macOS-only");
const cache = await readFile(".build/kernel/CMakeCache.txt", "utf8");
const config = /^OpenCASCADE_DIR:PATH=(.+)$/m.exec(cache)?.[1];
assert.ok(config, "Configure the native Release kernel first");
const sdk = resolve(config, "../../..");
const output = resolve(".cache/wasm-performance/particle-heap");
await mkdir(output, { recursive: true });
const source = await readFile(
  resolve(webBuildConfig().cache, "occt/src/Extrema/Extrema_GenExtCS.cxx"),
  "utf8",
);
assert.equal(
  createHash("sha256").update(source).digest("hex"),
  "74a050f7ba7be194276eda055006264eeea6beb4fb5dd47a2944d7f7a3b7f1ff",
  "Expected OCCT a016080bf6738d6aeae020badee4e888ad1540a5 Extrema_GenExtCS.cxx",
);
const initializer = "PSO_Particle* aParticle = aParticles.GetWorstParticle();";
assert.equal(source.split(initializer).length, 4);
let candidate = source.replace(
  "#include <math_PSOParticlesPool.hxx>",
  '#include <math_PSOParticlesPool.hxx>\n#include "particle-heap.hxx"',
);
candidate = candidate.replaceAll(
  initializer,
  "StableParticleHeap heap(aParticles, theNbParticles);\n  PSO_Particle* aParticle = heap.Worst();",
);
assert.equal(candidate.split("aParticle = aParticles.GetWorstParticle();").length, 4);
candidate = candidate.replaceAll(
  "aParticle = aParticles.GetWorstParticle();",
  "aParticle = heap.DecreasedWorst();",
);
const file = `${output}/Extrema_GenExtCS.cxx`;
await writeFile(file, candidate);
const control = `${output}/Extrema_GenExtCS.original.cxx`;
await writeFile(control, source);
const common = [
  "-O3",
  "-std=c++17",
  `-I${sdk}/include/opencascade`,
  `-I${resolve("tests/wasm-performance")}`,
  `-L${sdk}/lib`,
  `-Wl,-rpath,${sdk}/lib`,
];
const nativeRoot = resolve(sdk, "..");
assert.equal(
  await readFile(`${nativeRoot}/source/src/Extrema/Extrema_GenExtCS.cxx`, "utf8"),
  source,
  "Native SDK and WASM source must match",
);
const toolkit = resolve(nativeRoot, "build/src/TKGeomBase");
const objects = (await readFile(`${toolkit}/CMakeFiles/TKGeomBase.dir/objects1.rsp`, "utf8"))
  .match(/"[^"]+"|\S+/g)
  .map((name) => resolve(toolkit, name.replaceAll('"', "")));
assert.equal(objects.filter((name) => name.endsWith("/Extrema_GenExtCS.cxx.o")).length, 1);
for (const variant of ["plain", "trace", "control"]) {
  const directory = `${output}/${variant}`;
  await mkdir(directory, { recursive: true });
  const object = `${directory}/Extrema_GenExtCS.o`;
  execFileSync(
    "c++",
    [
      ...common,
      "-fPIC",
      "-DNDEBUG",
      "-DNo_Exception",
      ...(variant === "trace" ? ["-DMAKESHIFT_PARTICLE_TRACE"] : []),
      "-c",
      variant === "control" ? control : file,
      "-o",
      object,
    ],
    { stdio: "inherit" },
  );
  const replacement = objects.map((name) =>
    name.endsWith("/Extrema_GenExtCS.cxx.o") ? object : name,
  );
  await writeFile(
    `${directory}/objects.rsp`,
    replacement.map((name) => JSON.stringify(name)).join("\n"),
  );
  execFileSync(
    "c++",
    [
      ...common,
      "-dynamiclib",
      `@${directory}/objects.rsp`,
      "-compatibility_version",
      "7.9.0",
      "-current_version",
      "7.9.3",
      "-install_name",
      "@rpath/libTKGeomBase.7.9.dylib",
      "-lTKG3d",
      "-lTKG2d",
      "-lTKMath",
      "-lTKernel",
      "-o",
      `${directory}/libTKGeomBase.7.9.3.dylib`,
    ],
    { stdio: "inherit" },
  );
  await symlink("libTKGeomBase.7.9.3.dylib", `${directory}/libTKGeomBase.7.9.dylib`).catch(
    (error) => {
      if (error.code !== "EEXIST") throw error;
    },
  );
}
execFileSync(
  "c++",
  [
    ...common,
    "tests/wasm-performance/particle-heap-test.cpp",
    "-lTKMath",
    "-lTKernel",
    "-o",
    `${output}/heap-test`,
  ],
  { stdio: "inherit" },
);
execFileSync(`${output}/heap-test`, [], { stdio: "inherit" });
await writeFile(
  `${output}/provenance.json`,
  JSON.stringify(
    {
      upstreamCommit: "a016080bf6738d6aeae020badee4e888ad1540a5",
      sdk,
      compiler: execFileSync("c++", ["--version"], { encoding: "utf8" }).trim(),
      commonOptions: common,
      sourceSha256: createHash("sha256").update(source).digest("hex"),
      generatedSha256: createHash("sha256").update(candidate).digest("hex"),
      librarySha256: createHash("sha256")
        .update(await readFile(`${output}/plain/libTKGeomBase.7.9.3.dylib`))
        .digest("hex"),
      controlSha256: createHash("sha256")
        .update(await readFile(`${output}/control/libTKGeomBase.7.9.3.dylib`))
        .digest("hex"),
    },
    null,
    2,
  ),
);
console.log(
  `Built ${output}/plain/libTKGeomBase.7.9.3.dylib; use only with its matching native SDK`,
);
