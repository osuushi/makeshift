import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("makeshiftSettingsWindow", {
  fit: (height: number) => ipcRenderer.invoke("settings-fit", height),
});
