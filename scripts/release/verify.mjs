import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { open, readdir, readFile, realpath, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { dependencies, inspectMachO } from "./native.mjs";

const app = resolve(".build/packages/Makeshift-darwin-arm64/Makeshift.app");
const resources = join(app, "Contents/Resources");
const run = (command, args) => execFileSync(command, args, { encoding: "utf8" });
const metadata = JSON.parse(await readFile(join(resources, "build.json"), "utf8"));
const packaged = JSON.parse(await readFile(join(resources, "app/package.json"), "utf8"));
assert.equal(packaged.version, metadata.version, "Updater version must match the feed");
const info = JSON.parse(
  run("plutil", ["-convert", "json", "-o", "-", join(app, "Contents/Info.plist")]),
);
const documentType = info.CFBundleDocumentTypes.find((type) =>
  type.LSItemContentTypes?.includes("com.osuushi.makeshift.document"),
);
assert.equal(documentType?.CFBundleTypeRole, "Editor");
assert.equal(documentType?.LSHandlerRank, "Owner");
assert.equal(documentType?.CFBundleTypeIconFile, "makeshift-document.icns");
const exportedType = info.UTExportedTypeDeclarations.find(
  (type) => type.UTTypeIdentifier === "com.osuushi.makeshift.document",
);
assert.deepEqual(exportedType?.UTTypeTagSpecification["public.filename-extension"], [
  "makeshift",
  "freac",
]);
assert.equal(exportedType?.UTTypeIconFile, documentType.CFBundleTypeIconFile);
assert.notEqual(info.CFBundleIconFile, documentType.CFBundleTypeIconFile);
assert.deepEqual(
  await readFile(join(resources, documentType.CFBundleTypeIconFile)),
  await readFile("packaging/icons/makeshift-document.icns"),
  "The document association must reference the approved bundled icon",
);
const updateConfig = await readFile(join(resources, "updates.json"), "utf8").catch(() => null);
assert.equal(updateConfig !== null, process.env.MAKESHIFT_SIGN === "1");
if (updateConfig)
  assert.deepEqual(
    JSON.parse(updateConfig),
    JSON.parse(await readFile("packaging/updates.json", "utf8")),
  );
assert.equal(metadata.architecture, "arm64");
const inventory = JSON.parse(await readFile(join(resources, "licenses/inventory.json"), "utf8"));
for (const name of [
  "Open CASCADE Technology",
  "PlaneGCS (adapted FreeCAD solver)",
  "eigen",
  "boost",
  "Electron",
  "ghostty-web",
  "node-pty",
])
  assert(
    inventory.entries.some(
      (entry) =>
        (entry.name === name ||
          (name === "Open CASCADE Technology" && entry.name.startsWith(`${name} (`))) &&
        entry.text.length > 100,
    ),
    `Missing notices: ${name}`,
  );
let binaries = 0;
async function check(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isSymbolicLink()) {
      assert((await realpath(path)).startsWith(`${app}/`), `External bundle symlink: ${path}`);
      continue;
    }
    if (entry.isDirectory()) {
      await check(path);
      continue;
    }
    if (!entry.isFile()) continue;
    const handle = await open(path, "r");
    const magic = Buffer.alloc(4);
    try {
      await handle.read(magic, 0, 4, 0);
    } finally {
      await handle.close();
    }
    if (!["cffaedfe", "feedfacf", "cafebabe", "bebafeca"].includes(magic.toString("hex"))) continue;
    binaries++;
    assert.equal(run("lipo", ["-archs", path]).trim(), "arm64", `Unexpected architecture: ${path}`);
    for (const dependency of dependencies(path))
      assert(
        dependency.startsWith("@") ||
          dependency.startsWith("/usr/lib/") ||
          dependency.startsWith("/System/Library/"),
        `Build-machine dependency in ${path}: ${dependency}`,
      );
    const load = inspectMachO(path, "-l");
    for (const [, version] of load.matchAll(
      /cmd LC_(?:BUILD_VERSION|VERSION_MIN_MACOSX)\n(?:(?!Load command)[\s\S])*?\n\s+(?:minos|version) (\d+\.\d+(?:\.\d+)?)/g,
    ))
      assert(
        Number(version.split(".")[0]) * 100 + Number(version.split(".")[1]) <= 1400,
        `Minimum OS exceeds 14.0: ${path}: ${version}`,
      );
  }
}
await check(app);
assert(binaries >= 20, "Unexpectedly few native binaries");
for (const component of ["solver", "kernel", "mesh", "agent-scope"])
  assert((await stat(join(resources, "native", `makeshift-${component}`))).mode & 0o111);
if (process.env.MAKESHIFT_SIGN === "1") {
  run("codesign", ["--verify", "--deep", "--strict", "--verbose=2", app]);
  run("xcrun", ["stapler", "validate", app]);
  run("spctl", ["--assess", "--type", "execute", "--verbose=2", app]);
}
console.log(
  `Verified document association/icon, ${binaries} arm64 binaries, dependency paths, deployment targets and offline licenses`,
);
