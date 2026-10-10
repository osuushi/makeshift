import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { app } from "electron";
import { AppUpdates } from "./host/app-updates.js";
import { configureApplicationIdentity } from "./host/application-identity.js";
import { DocumentApplication } from "./host/document-application.js";
import { installFixtureCapture } from "./host/fixture-capture.js";

configureApplicationIdentity();
const directory = dirname(fileURLToPath(import.meta.url));
const icon = join(
  app.getAppPath(),
  app.isPackaged ? ".build/renderer" : "assets/public",
  "makeshift.png",
);
const queuedFiles: string[] = [];
let documents: DocumentApplication | undefined;
let ready = false;
app.on("open-file", (event, path) => {
  event.preventDefault();
  if (ready && documents) void documents.open(path).catch((error) => documents?.error(error));
  else queuedFiles.push(path);
});
app
  .whenReady()
  .then(async () => {
    if (process.platform === "darwin" && !app.isPackaged) app.dock?.setIcon(icon);
    if (process.env.MAKESHIFT_TEST_HIDDEN === "1" && process.platform === "darwin")
      app.dock?.hide();
    const application = new DocumentApplication(directory, icon);
    documents = application;
    installFixtureCapture((sender) => application.checkDesktop(sender), icon);
    const updates = new AppUpdates(
      () => void application.quit(true),
      () => application.updateInstallFailed(),
    );
    documents.updates = updates;
    await documents.restore(queuedFiles.splice(0));
    ready = true;
    for (const path of queuedFiles.splice(0)) await documents.open(path);
    await updates.start();
  })
  .catch((error: unknown) => {
    console.error(error);
    app.exit(1);
  });
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
