import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";

export async function prepareSolverSource(
  source = resolve(import.meta.dirname, "../.cache/solver/source"),
) {
  const root = resolve(import.meta.dirname, "..");
  const commit = "78e4038a564e4c8bfebb40119b41d67531232223";
  const manifest = JSON.parse(await readFile(resolve(root, "native/solver/sources.json"), "utf8"));
  await mkdir(source, { recursive: true });
  for (const [path, hash] of Object.entries(manifest)) {
    const original = resolve(source, `${basename(path)}.upstream`);
    if (!existsSync(original)) {
      const response = await fetch(
        `https://raw.githubusercontent.com/FreeCAD/FreeCAD/${commit}/${path}`,
      );
      if (!response.ok) throw new Error(`Download failed: ${path} (${response.status})`);
      await writeFile(original, Buffer.from(await response.arrayBuffer()));
    }
    const data = await readFile(original);
    if (createHash("sha256").update(data).digest("hex") !== hash)
      throw new Error(`Pinned source hash mismatch: ${path}`);
    // Adapt the host boundary without changing solver mathematics.
    let adapted =
      "// Freac adaptation (2026-09-22): host includes/exports; WASM defers QR tasks (2026-10-03).\n" +
      data
        .toString()
        .replaceAll("../../SketcherGlobal.h", "SketcherGlobal.h")
        .replace("#include <Base/Tools.h>", '#include "p0_base_compat.h"')
        .replace("#include <Base/Console.h>", "")
        .replace("#include <FCConfig.h>", "");
    if (basename(path) === "GCS.cpp") {
      const launch = "auto fut = std::async(\n";
      if (adapted.split(launch).length !== 3) throw new Error("Pinned GCS QR launch sites changed");
      // Same QR work, deferred onto the current worker in a single-threaded WASM build.
      adapted = adapted.replaceAll(
        launch,
        `${launch}#ifdef __EMSCRIPTEN__\n            std::launch::deferred,\n#endif\n`,
      );
    }
    const destination = resolve(source, basename(path));
    if (!existsSync(destination) || (await readFile(destination, "utf8")) !== adapted)
      await writeFile(destination, adapted);
  }
  const exportsHeader = resolve(source, "SketcherGlobal.h");
  if (!existsSync(exportsHeader))
    await writeFile(exportsHeader, "#pragma once\n#define SketcherExport\n");
  return source;
}
