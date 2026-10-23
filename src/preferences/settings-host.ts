import type { ToolboxTool } from "../tools/toolbox-row.js";
export function nativeSettings(): { open(tools: ToolboxTool[]): Promise<void> } | undefined {
  return (window as Window & { makeshiftSettings?: { open(tools: ToolboxTool[]): Promise<void> } })
    .makeshiftSettings;
}
