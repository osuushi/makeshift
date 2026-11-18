import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld(
  "makeshiftSecurity",
  Object.fromEntries(
    ["info", "rename", "forget", "trust", "exportKey", "importKey"].map((method) => [
      method,
      (...args: unknown[]) => ipcRenderer.invoke("signing-" + method, ...args),
    ]),
  ),
);
contextBridge.exposeInMainWorld("makeshiftSettingsWindow", {
  close: () => ipcRenderer.invoke("settings-close"),
  availableSize: () => ipcRenderer.invoke("settings-space"),
  fitTab: (size: unknown) => ipcRenderer.invoke("settings-tab", size),
  tools: () => ipcRenderer.invoke("settings-tools"),
  onTools: (callback: (tools: unknown) => void) => {
    ipcRenderer.on("settings-tools", (_event, tools: unknown) => callback(tools));
  },
});
