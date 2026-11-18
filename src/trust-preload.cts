import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("makeshiftTrustPrompt", {
  read: () => ipcRenderer.invoke("trust-prompt-read"),
  choose: (response: number) => ipcRenderer.invoke("trust-prompt-choose", response),
});
