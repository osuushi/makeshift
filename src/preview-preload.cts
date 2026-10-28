import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("preview", {
  read: () => ipcRenderer.invoke("preview-data", "read"),
  write: (value: unknown) => ipcRenderer.invoke("preview-data", "write", value),
  onTrigger: (callback: (name: string, detail: unknown) => void) => {
    const listener = (_event: unknown, name: string, detail: unknown) => callback(name, detail);
    ipcRenderer.on("preview-trigger", listener);
    return () => ipcRenderer.removeListener("preview-trigger", listener);
  },
});
