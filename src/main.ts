import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { app, BrowserWindow, ipcMain, screen } from "electron";
import { DocumentOwner } from "./backend/document-owner.js";
import { MeshCalculator } from "./backend/mesh-calculator.js";
import { NativeSolver } from "./backend/native-solver.js";
import { AgentSession } from "./host/agent-session.js";
import { AppUpdates } from "./host/app-updates.js";
import { configureApplicationIdentity } from "./host/application-identity.js";
import { DocumentSession } from "./host/document-session.js";
import { installFixtureCapture } from "./host/fixture-capture.js";
import { lockInterfaceZoom } from "./host/interface-zoom.js";
import { IPadSession } from "./host/ipad-session.js";
import { nativeExecutable } from "./host/native-paths.js";
import { rememberWindowSize, restoreWindowSize } from "./host/window-size.js";

configureApplicationIdentity();
const directory = dirname(fileURLToPath(import.meta.url));
const icon = join(
  app.getAppPath(),
  app.isPackaged ? ".build/renderer" : "assets/public",
  "makeshift.png",
);
const owner = new DocumentOwner(
  new NativeSolver(nativeExecutable("solver")),
  nativeExecutable("kernel"),
);
let documents: DocumentSession;
let agent: AgentSession;
let ipad: IPadSession;
const meshCalculator = new MeshCalculator(nativeExecutable("mesh"));
ipcMain.handle("mesh-export", (event, input: ArrayBuffer) => {
  if (event.sender !== documentWindow?.webContents || event.senderFrame !== event.sender.mainFrame)
    throw new Error("Document window only");
  documents.checkDesktop();
  return meshCalculator.calculate(input);
});
ipcMain.handle("mesh-export-cancel", async (event) => {
  if (event.sender !== documentWindow?.webContents || event.senderFrame !== event.sender.mainFrame)
    throw new Error("Document window only");
  documents.checkDesktop();
  await meshCalculator.cancel();
});
app.on("will-quit", () => meshCalculator.close());
installFixtureCapture(() => documents.checkDesktop(), icon);
ipcMain.handle("sketch", (event, request: unknown) => {
  if (event.sender !== documentWindow?.webContents || event.senderFrame !== event.sender.mainFrame)
    throw new Error("Model requests require the document window");
  documents.checkDesktop();
  return documents.model(request);
});
app.on("will-quit", () => owner.close());
const hidden = process.env.MAKESHIFT_TEST_HIDDEN === "1";
let opening: Promise<void> | null = null;
let documentWindow: BrowserWindow | null = null;
function openWindow(): Promise<void> {
  const existing = documentWindow;
  if (existing) {
    if (!hidden) existing.show();
    return Promise.resolve();
  }
  if (!opening)
    opening = createWindow().finally(() => {
      opening = null;
    });
  return opening;
}
async function createWindow(): Promise<void> {
  await documents.reopen();
  const window = new BrowserWindow({
    title: "Makeshift",
    icon,
    ...restoreWindowSize(),
    show: !hidden,
    backgroundColor: "#f8f9fb",
    webPreferences: {
      preload: join(directory, "preload.cjs"),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      // Hidden acceptance windows should paint like foreground review windows.
      backgroundThrottling: !hidden,
      // Linux hidden windows throttle compositor frames even with backgroundThrottling off.
      offscreen: hidden && process.platform === "linux",
    },
  });
  documentWindow = window;
  lockInterfaceZoom(window.webContents);
  rememberWindowSize(window);
  window.on("rotate-gesture", (_event, rotation) => {
    if (documents.remote?.active() || !Number.isFinite(rotation)) return;
    const cursor = screen.getCursorScreenPoint();
    const content = window.getContentBounds();
    const zoom = window.webContents.getZoomFactor();
    window.webContents.send("navigation-rotate", -rotation, {
      x: (cursor.x - content.x) / zoom,
      y: (cursor.y - content.y) / zoom,
    });
  });

  window.webContents.on("did-start-loading", () => meshCalculator.close());
  window.webContents.on("render-process-gone", () => meshCalculator.close());
  window.on("closed", () => {
    meshCalculator.close();
    documentWindow = null;
  });
  documents.attach(window);
  agent.attach(window);
  ipad.attach(window);
  const url = process.env.MAKESHIFT_DEV_URL;
  if (url) await window.loadURL(url);
  else await window.loadFile(join(directory, "../renderer/index.html"));
}
app
  .whenReady()
  .then(async () => {
    if (process.platform === "darwin" && !app.isPackaged) app.dock?.setIcon(icon);
    if (hidden && process.platform === "darwin") app.dock?.hide();
    agent = new AgentSession();
    documents = new DocumentSession(owner, openWindow, agent);
    const updates = new AppUpdates(
      () => documents.restartForUpdate(),
      () => documents.updateInstallFailed(),
    );
    documents.updates = updates;
    ipad = new IPadSession(join(directory, "../renderer"), documents, agent);
    await documents.restore();
    await openWindow();
    await updates.start();
    app.on("activate", () => {
      if (!documentWindow) void openWindow();
    });
  })
  .catch((error: unknown) => {
    console.error(error);
    app.exit(1);
  });
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
