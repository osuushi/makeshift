export interface BugEvent {
  time: number;
  kind: string;
  detail: Record<string, unknown>;
}
export interface BugMedia {
  name: string;
  start: number;
  end: number;
  bytes: ArrayBuffer;
}
export interface BugReport {
  startedAt: number;
  endedAt: number;
  fixtures: { start: unknown; end: unknown };
  events: BugEvent[];
  media: BugMedia[];
  warnings: string[];
}
export interface BugFile {
  name: string;
  path: string;
}
export interface BugHost {
  prepare(): Promise<void>;
  save(report: BugReport): Promise<BugFile>;
  drag(): void;
  reveal(): void;
}
declare global {
  interface Window {
    makeshiftBug?: BugHost;
  }
}
