import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("makeshiftSettingsWindow", {
  fitTab: (tab: string, scale: number) => ipcRenderer.invoke("settings-tab", tab, scale),
  tools: () => ipcRenderer.invoke("settings-tools"),
  onTools: (callback: (tools: unknown) => void) => {
    ipcRenderer.on("settings-tools", (_event, tools: unknown) => callback(tools));
  },
});
