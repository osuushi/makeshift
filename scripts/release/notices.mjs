import { existsSync } from "node:fs";
import { cp, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { meshInputCache, meshInputs } from "../mesh-inputs.mjs";
import { inputCache, nativeInputs } from "../native-inputs.mjs";

const htmlEscape = (text) =>
  String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
async function licenseFiles(directory) {
  return (await readdir(directory)).filter((name) =>
    /^(licen[cs]e|copying|notice|copyright)(\b|[._-])/i.test(name),
  );
}
export async function generateNotices(destination, metadata) {
  await mkdir(destination, { recursive: true });
  const entries = [];
  async function add(name, version, license, files, source = "") {
    if (!files.length) throw new Error(`Missing license text for ${name}`);
    const texts = await Promise.all(
      files.map(async (file) => {
        let text = await readFile(file, "utf8");
        if (file.endsWith(".upstream")) {
          const end = text.indexOf("*/");
          text = end >= 0 ? text.slice(0, end + 2) : text.split("\n").slice(0, 18).join("\n");
        }
        return `${file.split("/").at(-1)}\n\n${text}`;
      }),
    );
    entries.push({ name, version, license, source, text: texts.join("\n\n") });
  }
  const lock = JSON.parse(await readFile("package-lock.json", "utf8"));
  for (const [path, data] of Object.entries(lock.packages)) {
    // Vite bundles only Manifold's core JS/WASM. Its npm CLI/image dependencies
    // are build-only and are not shipped in the application.
    const bundledManifold = path === "node_modules/manifold-3d";
    if (!path || (data.dev && !bundledManifold) || !existsSync(`${path}/package.json`)) continue;
    const pkg = JSON.parse(await readFile(`${path}/package.json`, "utf8"));
    if (!["MIT", "ISC", "Apache-2.0", "BSD-2-Clause", "BSD-3-Clause"].includes(pkg.license))
      throw new Error(`Review new runtime license/source obligations: ${pkg.name}: ${pkg.license}`);
    if (pkg.name === "ghostty-web" && pkg.version !== "0.4.0")
      throw new Error("Review embedded WASM notices when upgrading Ghostty");
    await add(
      pkg.name,
      pkg.version,
      pkg.license ?? "See notices",
      (await licenseFiles(path)).map((file) => join(path, file)),
      typeof pkg.repository === "string" ? pkg.repository : (pkg.repository?.url ?? ""),
    );
  }
  await upstreamNotices(add, metadata);
  await cp("node_modules/electron/dist/LICENSES.chromium.html", join(destination, "chromium.html"));
  entries.sort((a, b) => a.name.localeCompare(b.name));
  const runtime = JSON.parse(await readFile("packaging/runtime-sources.json", "utf8"));
  const runtimeSource = `https://github.com/${process.env.GITHUB_REPOSITORY ?? "osuushi/makeshift"}/releases/tag/${runtime.releaseTag}`;
  const intro = `Makeshift ${metadata.timestamp} (${metadata.commit}). This application uses Open CASCADE Technology and the FreeCAD PlaneGCS solver, covered by the GNU LGPL. Makeshift is provided without warranty. The matching Makeshift-${metadata.tag}-sources.tar.gz accompanies this release and contains Makeshift, adapted PlaneGCS and OCCT, Eigen and Boost sources and rebuild/replacement instructions. Keep that archive available to everyone receiving this app. You may modify and rebuild Makeshift and replace its LGPL components. Electron/Chromium corresponding sources (including FFmpeg and Blink/WebKit) are in the shared runtime source release: ${runtimeSource}`;
  await writeFile(
    join(destination, "inventory.json"),
    `${JSON.stringify({ metadata, entries }, null, 2)}\n`,
  );
  await writeFile(
    join(destination, "index.html"),
    `<!doctype html><html lang="en"><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'">
<title>Makeshift — Third-party licenses</title><style>body{font:16px system-ui;max-width:900px;margin:40px auto;padding:0 24px;color:#263243;background:#f8f9fb}h1{font-size:28px}summary{cursor:pointer;padding:14px 0}pre{white-space:pre-wrap;overflow-wrap:anywhere;font:12px ui-monospace}details{border-bottom:1px solid #d6dce5}a{color:#275bba}p{line-height:1.6}:root{color-scheme:light dark}@media(prefers-color-scheme:dark){body{color:#e4edf7;background:#161e29}details{border-color:#8598ae}a{color:#87c5ff}}</style>
<h1>Third-party licenses</h1><p>${htmlEscape(intro)}</p><p><a href="chromium.html">Chromium and Electron bundled component notices</a></p>
${entries.map((e) => `<details><summary>${htmlEscape(e.name)} — ${htmlEscape(e.version)} · ${htmlEscape(e.license)}</summary><p>${htmlEscape(e.source)}</p><pre>${htmlEscape(e.text)}</pre></details>`).join("\n")}</html>`,
  );
  console.log(`Generated notices for ${entries.length} components plus Chromium's inventory`);
}

async function upstreamNotices(add, metadata) {
  for (const [name, input] of Object.entries(meshInputs)) {
    const directory = join(meshInputCache, name);
    await add(
      `Native ${name}`,
      input.version,
      name === "tbb" ? "Apache-2.0 and included third-party notices" : "Apache-2.0",
      [
        ...(await licenseFiles(directory)).map((file) => join(directory, file)),
        ...(name === "tbb" ? [join(directory, "third-party-programs.txt")] : []),
      ],
      input.url,
    );
  }
  await add("Makeshift", metadata.timestamp, "LGPL-2.1-or-later", ["LICENSE", "COPYING.md"]);
  await add(
    "Open CASCADE Technology (Makeshift offset-join precision adaptation, 2026-09-23)",
    "7.9.3",
    "LGPL-2.1-only WITH OCCT-exception-1.0",
    [".cache/kernel/source/LICENSE_LGPL_21.txt", ".cache/kernel/source/OCCT_LGPL_EXCEPTION.txt"],
    "https://github.com/Open-Cascade-SAS/OCCT/tree/a016080bf6738d6aeae020badee4e888ad1540a5",
  );
  await add(
    "PlaneGCS (adapted FreeCAD solver)",
    "78e4038a564e4c8bfebb40119b41d67531232223",
    "LGPL-2.1-or-later",
    [
      "LICENSE",
      "native/solver/README.md",
      ...(await readdir(".cache/solver/source"))
        .filter((name) => name.endsWith(".upstream"))
        .map((name) => `.cache/solver/source/${name}`),
    ],
    "https://github.com/FreeCAD/FreeCAD/tree/78e4038a564e4c8bfebb40119b41d67531232223/src/Mod/Sketcher/App/planegcs",
  );
  for (const [name, input] of Object.entries(nativeInputs)) {
    const directory = join(inputCache, name);
    await add(
      name,
      input.version,
      name === "eigen" ? "MPL-2.0 and included permissive licenses" : "BSL-1.0",
      (await licenseFiles(directory)).map((file) => join(directory, file)),
      input.url,
    );
  }
  const electron = JSON.parse(await readFile("node_modules/electron/package.json", "utf8"));
  const runtime = JSON.parse(await readFile("packaging/runtime-sources.json", "utf8"));
  if (electron.version !== runtime.electronVersion) throw new Error("Update Electron source pins");
  await add(
    "Electron",
    electron.version,
    "MIT; Chromium and bundled component notices",
    ["node_modules/electron/dist/LICENSE"],
    "https://www.electronjs.org",
  );
  // Vite inserts its modulepreload helper in the renderer bundle.
  const vite = JSON.parse(await readFile("node_modules/vite/package.json", "utf8"));
  await add("Vite renderer helper", vite.version, "MIT", ["node_modules/vite/LICENSE.md"]);
  await add("Ghostty terminal engine", "5714ed07a1012573261b7b7e3ed2add9c1504496", "MIT", [
    "licenses/Ghostty-MIT.txt",
  ]);
  await add("Zig runtime", "0.15.2 toolchain used by upstream WASM build", "MIT", [
    "licenses/Zig-MIT.txt",
  ]);
  await add(
    "uucode / Unicode data",
    "31655fba3c638229989cc524363ef5e3c7b580c1",
    "See individual notices",
    (await readdir("licenses/uucode")).map((name) => `licenses/uucode/${name}`),
  );
}
