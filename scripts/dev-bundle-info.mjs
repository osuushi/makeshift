import { join } from "node:path";
import { pathToFileURL } from "node:url";

export function devBundleInfo() {
  return {
    CFBundleIdentifier: "com.osuushi.makeshift.dev",
    CFBundleName: "Makeshift Dev",
    CFBundleDisplayName: "Makeshift Dev",
    CFBundleIconFile: "makeshift.icns",
    NSMicrophoneUsageDescription:
      "Record your narration when you start a Makeshift development bug report.",
    CFBundleDocumentTypes: [
      {
        CFBundleTypeName: "Makeshift Document",
        CFBundleTypeRole: "Editor",
        CFBundleTypeIconFile: "makeshift-document.icns",
        LSHandlerRank: "Alternate",
        LSItemContentTypes: ["com.osuushi.makeshift.document"],
      },
    ],
    UTImportedTypeDeclarations: [
      {
        UTTypeIdentifier: "com.osuushi.makeshift.document",
        UTTypeDescription: "Makeshift Document",
        UTTypeConformsTo: ["public.data"],
        UTTypeTagSpecification: { "public.filename-extension": ["makeshift", "freac"] },
      },
    ],
  };
}
export function devBootstrap(repository) {
  return [
    'const { app } = require("electron");',
    "const files = [];",
    "const opening = (event, path) => { event.preventDefault(); files.push(path); };",
    'app.on("open-file", opening);',
    'process.env.MAKESHIFT_DEV_BUNDLE = "1";',
    `process.chdir(${JSON.stringify(repository)});`,
    `app.setAppPath(${JSON.stringify(repository)});`,
    `import(${JSON.stringify(pathToFileURL(join(repository, ".build/host/main.js")).href)}).then(() => {`,
    '  app.removeListener("open-file", opening);',
    '  for (const path of files) app.emit("open-file", { preventDefault() {} }, path);',
    "}).catch(error => {",
    "  console.error(error);",
    '  require("electron").dialog.showErrorBox("Makeshift Dev could not start", "Run npm run build in the checkout first.\\n" + String(error));',
    "  app.exit(1);",
    "});",
  ].join("\n");
}
