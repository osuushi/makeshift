export interface PreviewRequest {
  action: "open" | "reload" | "read" | "trigger" | "eval" | "screenshot" | "close";
  directory?: string;
  title?: string;
  code?: string;
  name?: string;
  detail?: unknown;
}
export interface PreviewLayout {
  x: number;
  y: number;
  width: number;
  height: number;
  collapsed: boolean;
}
