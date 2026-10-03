export interface AgentPreferences {
  preset: "codex" | "custom";
  executable: string;
  args: string[];
  env: Record<string, string>;
}
export interface CodexExecutable {
  path: string;
  version: string;
  source: "configured" | "standalone" | "application";
}
export interface CodexSetupStatus {
  phase: "idle" | "downloading" | "installing" | "verifying" | "ready" | "failed" | "cancelled";
  message: string;
  output: string;
  executable?: CodexExecutable;
}
export interface AgentStatus {
  running: boolean;
  workspace: string | null;
  exitCode?: number;
  error?: string;
}
export type AgentRequest =
  | { kind: "settings" }
  | { kind: "discover-codex"; preferences: AgentPreferences }
  | { kind: "install-codex" }
  | { kind: "cancel-codex-install" }
  | { kind: "configure"; preferences: AgentPreferences }
  | { kind: "browse" }
  | { kind: "recover" }
  | { kind: "attach"; name: string; base64: string }
  | { kind: "start"; cols: number; rows: number }
  | { kind: "read" }
  | { kind: "clipboard" }
  | { kind: "write"; data: string }
  | { kind: "resize"; cols: number; rows: number }
  | { kind: "focus"; focused: boolean }
  | { kind: "stop" };
export interface AgentReply extends AgentStatus {
  setup?: CodexSetupStatus;
  attachment?: string;
  output?: string;
  clipboardText?: string;
  preferences?: AgentPreferences;
  executable?: string;
  stateDirectory?: string;
}
export const attachmentWarningBytes = 20 * 1024 * 1024;
export interface AgentHost {
  request(request: AgentRequest): Promise<AgentReply>;
}
export const defaultAgentPreferences: AgentPreferences = {
  preset: "codex",
  executable: "codex",
  args: [],
  env: {},
};
declare global {
  interface Window {
    makeshiftAgent?: AgentHost;
  }
}
