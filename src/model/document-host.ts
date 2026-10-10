export type DocumentCommand =
  | "new"
  | "open"
  | "save"
  | "save-as"
  | "close"
  | "quit"
  | "restart-update"
  | "undo"
  | "redo";
export interface DocumentStatus {
  name: string;
  path: string | null;
  edited: boolean;
  warning?: string;
  camera?: CameraState;
}
export interface DocumentHost {
  command(
    command: DocumentCommand,
    camera?: CameraState,
  ): Promise<{ replaced: boolean; camera?: CameraState; error?: string }>;
  commandFinished?(command: DocumentCommand): Promise<void>;
  status(): Promise<DocumentStatus>;
  onCommand(callback: (command: DocumentCommand) => void): () => void;
  onStatus(callback: (status: DocumentStatus) => void): () => void;
}
declare global {
  interface Window {
    makeshiftDocument?: DocumentHost;
  }
}

import type { CameraState } from "./camera-state.js";
