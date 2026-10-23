import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("makeshiftSettingsWindow", {
  tools: () => ipcRenderer.invoke("settings-tools"),
  onTools: (callback: (tools: unknown) => void) => {
    ipcRenderer.on("settings-tools", (_event, tools: unknown) => callback(tools));
  },
  fit: (height: number) => ipcRenderer.invoke("settings-fit", height),
});
