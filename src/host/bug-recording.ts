import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { app, nativeImage, session, shell, webContents } from "electron";
import type { BugReport } from "../bugs/protocol.js";
import { saveBugArchive } from "./bug-archive.js";
import type { DocumentIPC } from "./document-ipc.js";

const windows = new WeakSet<Electron.WebContents>();
const armed = new WeakSet<Electron.WebContents>();
let installed = false;
export function installBugRecording(
  ipc: DocumentIPC,
  window: Electron.BrowserWindow,
  icon: string,
): void {
  const contents = window.webContents;
  windows.add(contents);
  if (!installed) {
    installed = true;
    session.defaultSession.setDisplayMediaRequestHandler((request, callback) => {
      const frame = request.frame;
      const sender = frame && webContents.fromFrame(frame);
      if (
        !sender ||
        !windows.has(sender) ||
        !armed.has(sender) ||
        frame !== sender.mainFrame ||
        request.audioRequested
      ) {
        callback({});
        return;
      }
      armed.delete(sender);
      callback({ video: frame });
    });
  }
  let saved: string | undefined;
  let saving = false;
  ipc.handle("bug-prepare", () => {
    armed.add(contents);
  });
  ipc.handle("bug-save", async (_event, report: BugReport) => {
    if (saving) throw new Error("Already saving a bug report");
    saving = true;
    try {
      const result = await saveBugArchive(report, {
        source: await sourceVersion(),
        version: app.getVersion(),
        platform: process.platform,
        arch: process.arch,
        versions: process.versions,
        window: window.getContentBounds(),
      });
      saved = result.path;
      return result;
    } finally {
      saving = false;
    }
  });
  const drag = (event: Electron.IpcMainEvent) => {
    if (event.senderFrame !== contents.mainFrame || !saved) return;
    contents.startDrag({
      file: saved,
      icon: nativeImage.createFromPath(icon).resize({ width: 48, height: 48 }),
    });
  };
  const reveal = (event: Electron.IpcMainEvent) => {
    if (event.senderFrame === contents.mainFrame && saved) shell.showItemInFolder(saved);
  };
  contents.ipc.on("bug-drag", drag);
  contents.ipc.on("bug-reveal", reveal);
  contents.on("did-start-loading", () => armed.delete(contents));
  window.once("closed", () => {
    windows.delete(contents);
    armed.delete(contents);
  });
}

async function sourceVersion(): Promise<unknown> {
  try {
    if (app.isPackaged)
      return JSON.parse(await readFile(join(process.resourcesPath, "build.json"), "utf8"));
    const run = promisify(execFile);
    const options = { cwd: app.getAppPath(), timeout: 2000 };
    const [commit, status] = await Promise.all([
      run("git", ["rev-parse", "HEAD"], options),
      run("git", ["status", "--porcelain", "--untracked-files=no"], options),
    ]);
    return { commit: commit.stdout.trim(), dirty: !!status.stdout.trim(), development: true };
  } catch {
    return { unavailable: true };
  }
}
