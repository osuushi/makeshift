import type { BugEvent } from "./protocol.js";

/** Keep complete independently decodable segments, including the boundary segment. */
export function recentSegments<T extends { end: number }>(segments: T[], now: number): T[] {
  return segments.filter((segment) => segment.end > now - 15000);
}
export class BugTimeline {
  events: BugEvent[] = [];
  recording = false;
  dropped = 0;
  add(kind: string, detail: Record<string, unknown>, time = Date.now()): void {
    this.events.push({ time, kind, detail });
    if (!this.recording) this.events = this.events.filter((event) => event.time >= time - 20000);
    if (this.events.length > 20000) {
      this.dropped += this.events.length - 20000;
      this.events.splice(0, this.events.length - 20000);
    }
  }
  clear(): void {
    this.events = [];
    this.dropped = 0;
  }
}
