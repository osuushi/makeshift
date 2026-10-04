import { execFileSync } from "node:child_process";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { nativeInputs } from "../native-inputs.mjs";

const htmlEscape = (value) =>
  value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll('"', "&quot;");
export async function webNotices(metadata) {
  const entries = [];
  const add = async (name, files) =>
    entries.push({
      name,
      text: (await Promise.all(files.map((file) => readFile(file, "utf8")))).join("\n\n"),
    });
  await add("Makeshift · LGPL-2.1-or-later", ["LICENSE", "COPYING.md"]);
  await add("Open CASCADE Technology 7.9.3 · LGPL-2.1 with OCCT exception", [
    ".cache/web/occt/LICENSE_LGPL_21.txt",
    ".cache/web/occt/OCCT_LGPL_EXCEPTION.txt",
  ]);
  const originals = (await readdir(".cache/web/solver-source")).filter((path) =>
    path.endsWith(".upstream"),
  );
  entries.push({
    name: "FreeCAD PlaneGCS · LGPL-2.1-or-later",
    text: (
      await Promise.all(
        originals.map(async (file) => {
          const text = await readFile(`.cache/web/solver-source/${file}`, "utf8");
          return `${file}\n${text.slice(0, text.indexOf("*/") + 2)}`;
        }),
      )
    ).join("\n\n"),
  });
  for (const name of Object.keys(nativeInputs)) {
    const directory = `.cache/release-inputs/${name}`;
    const licenses = (await readdir(directory)).filter((file) => /^(copying|license)/i.test(file));
    await add(
      `${name} ${nativeInputs[name].version}`,
      licenses.map((file) => `${directory}/${file}`),
    );
  }
  for (const name of [
    "three",
    "typescript",
    "manifold-3d",
    "quickjs-emscripten-core",
    "@jitl/quickjs-wasmfile-release-sync",
    "@jitl/quickjs-ffi-types",
    "vite",
  ]) {
    const directory = `node_modules/${name}`;
    const pkg = JSON.parse(await readFile(`${directory}/package.json`, "utf8"));
    const licenses = (await readdir(directory)).filter((file) =>
      /^(license|notice)(\b|[._-])/i.test(file),
    );
    if (!licenses.length) throw new Error(`Missing license for ${name}`);
    await add(
      `${name} ${pkg.version}`,
      licenses.map((file) => `${directory}/${file}`),
    );
  }
  const emscripten = resolve(process.env.EMSDK ?? ".cache/emsdk", "upstream/emscripten");
  await add("Emscripten 4.0.20 and compiled runtime libraries", [
    `${emscripten}/LICENSE`,
    `${emscripten}/system/lib/libc/musl/COPYRIGHT`,
    `${emscripten}/system/lib/libcxx/LICENSE.TXT`,
    `${emscripten}/system/lib/libcxxabi/LICENSE.TXT`,
    `${emscripten}/system/lib/compiler-rt/LICENSE.TXT`,
    `${emscripten}/system/lib/libunwind/LICENSE.TXT`,
    `${emscripten}/system/lib/llvm-libc/LICENSE.TXT`,
  ]);
  const source = metadata.tag
    ? `https://github.com/${metadata.repository}/releases/download/${metadata.tag}/makeshift-web-sources.tar.gz`
    : `https://github.com/${metadata.repository}/tree/${metadata.commit}`;
  const sourceLabel = metadata.tag
    ? "Matching source archive and rebuild instructions"
    : "Source checkout (local changes may differ)";
  const destination = ".build/web/licenses";
  await mkdir(destination, { recursive: true });
  await writeFile(
    `${destination}/index.html`,
    `<!doctype html><html lang="en"><meta charset="utf-8"><title>Makeshift licenses</title>
<style>body{font:16px system-ui;max-width:900px;margin:40px auto;padding:0 24px}pre{white-space:pre-wrap;overflow-wrap:anywhere}summary{cursor:pointer;padding:12px 0}</style>
<h1>Makeshift web · licenses</h1><p>Build ${htmlEscape(metadata.commit)}. Provided without warranty. You may modify and rebuild Makeshift and replace its LGPL components.</p>
<p><a href="${htmlEscape(source)}">${sourceLabel}</a> · <a href="../">Return to Makeshift</a></p>
${entries.map((entry) => `<details><summary>${htmlEscape(entry.name)}</summary><pre>${htmlEscape(entry.text)}</pre></details>`).join("\n")}</html>`,
  );
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await webNotices({
    repository: process.env.GITHUB_REPOSITORY ?? "osuushi/makeshift",
    commit: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
  });
}
