import { type BrowserWindow, ipcMain } from "electron";

type Handler = (event: Electron.IpcMainInvokeEvent, ...args: unknown[]) => unknown;
const channels = new Map<string, WeakMap<Electron.WebContents, Handler>>();

/** Register each channel once; select its document from the actual IPC sender. */
export class DocumentIPC {
  private handlers = new Map<string, Handler>();
  handle<Args extends unknown[]>(
    channel: string,
    handler: (event: Electron.IpcMainInvokeEvent, ...args: Args) => unknown,
  ): void {
    this.handlers.set(channel, handler as Handler);
    if (channels.has(channel)) return;
    const documents = new WeakMap<Electron.WebContents, Handler>();
    channels.set(channel, documents);
    ipcMain.handle(channel, (event, ...args) => {
      const target = documents.get(event.sender);
      if (!target || event.senderFrame !== event.sender.mainFrame)
        throw new Error("IPC requires a document window");
      return target(event, ...args);
    });
  }
  attach(window: BrowserWindow): void {
    const contents = window.webContents;
    for (const [channel, handler] of this.handlers) channels.get(channel)?.set(contents, handler);
    window.once("closed", () => {
      for (const channel of this.handlers.keys()) channels.get(channel)?.delete(contents);
    });
  }
}
