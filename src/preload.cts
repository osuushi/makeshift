import { contextBridge, ipcRenderer } from "electron";
import type { InspectionView } from "./agent/inspection-protocol.js";
import type { AgentRequest } from "./agent/protocol.js";
import type { HostModelRequest } from "./host/model-request.js";
import type { IPadStatus } from "./ipad/protocol.js";
import type { ModelView } from "./sketch/model-api.js";

contextBridge.exposeInMainWorld("makeshiftMesh", {
  integrate: (input: ArrayBuffer) => ipcRenderer.invoke("mesh-export", input),
  cancel: () => ipcRenderer.invoke("mesh-export-cancel"),
});

contextBridge.exposeInMainWorld("makeshiftFixture", (snapshot: unknown) =>
  ipcRenderer.invoke("capture-fixture", snapshot),
);

contextBridge.exposeInMainWorld("makeshiftFixtureFile", {
  drag: () => ipcRenderer.send("drag-fixture"),
  reveal: () => ipcRenderer.send("reveal-fixture"),
});

contextBridge.exposeInMainWorld("makeshiftIPad", {
  status: () => ipcRenderer.invoke("ipad-status"),
  start: () => ipcRenderer.invoke("ipad-start"),
  stop: () => ipcRenderer.invoke("ipad-stop"),
  onStatus: (callback: (status: IPadStatus) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, status: IPadStatus) => callback(status);
    ipcRenderer.on("ipad-status", listener);
    return () => ipcRenderer.removeListener("ipad-status", listener);
  },
});

contextBridge.exposeInMainWorld("makeshiftScript", {
  cancel: () => ipcRenderer.invoke("agent-script-cancel"),
  onState: (callback: (state: { running: boolean; view: ModelView }) => void) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      state: { running: boolean; view: ModelView },
    ) => callback(state);
    ipcRenderer.on("agent-script-state", listener);
    return () => ipcRenderer.removeListener("agent-script-state", listener);
  },
});

contextBridge.exposeInMainWorld("makeshiftInspection", {
  onRequest: (
    callback: (
      render: boolean,
      acquireScript?: boolean,
      selection?: string,
      settings?: string,
    ) => InspectionView,
  ) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      request: {
        id: string;
        render: boolean;
        acquireScript?: boolean;
        selection?: string;
        settings?: string;
      },
    ) => {
      try {
        ipcRenderer.send("agent-inspection-reply", {
          id: request.id,
          view: callback(
            request.render,
            request.acquireScript,
            request.selection,
            request.settings,
          ),
        });
      } catch (error) {
        ipcRenderer.send("agent-inspection-reply", {
          id: request.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    };
    ipcRenderer.on("agent-inspection-read", listener);
    return () => ipcRenderer.removeListener("agent-inspection-read", listener);
  },
});

contextBridge.exposeInMainWorld("makeshiftAgent", {
  request: (request: AgentRequest) => ipcRenderer.invoke("agent", request),
});

contextBridge.exposeInMainWorld("makeshiftModel", (request: HostModelRequest) =>
  ipcRenderer.invoke("sketch", request),
);

contextBridge.exposeInMainWorld("makeshiftDocument", {
  command: (command: string, camera?: unknown) =>
    ipcRenderer.invoke("document-command", command, camera),
  status: () => ipcRenderer.invoke("document-status"),
  onCommand: (callback: (command: string) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, command: string) => callback(command);
    ipcRenderer.on("document-command", listener);
    return () => ipcRenderer.removeListener("document-command", listener);
  },
  onStatus: (callback: (status: unknown) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, status: unknown) => callback(status);
    ipcRenderer.on("document-status", listener);
    return () => ipcRenderer.removeListener("document-status", listener);
  },
});

contextBridge.exposeInMainWorld("makeshiftNavigation", {
  onRotate: (callback: (degrees: number, pointer: { x: number; y: number }) => void) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      degrees: number,
      pointer: { x: number; y: number },
    ) => callback(degrees, pointer);
    ipcRenderer.on("navigation-rotate", listener);
    return () => ipcRenderer.removeListener("navigation-rotate", listener);
  },
});
