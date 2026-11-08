import { bugPrebuffer } from "../preferences/bug-recording.js";
import type { SketchEditor } from "../sketch/editor.js";
import { bugFixture } from "./fixture.js";
import { BugVideo, recordStream } from "./media.js";
import { bugPanel } from "./panel.js";
import type { BugReport } from "./protocol.js";
import { BugTimeline, recentSegments } from "./timeline.js";

export class BugSession {
  readonly timeline = new BugTimeline();
  readonly video = new BugVideo((error) => this.mediaFailed(error));
  readonly panel: ReturnType<typeof bugPanel>;
  state: "idle" | "starting" | "recording" | "saving" = "idle";
  private generation = 0;
  private audio?: ReturnType<typeof recordStream>;
  private microphone?: MediaStream;
  private audioStart = 0;
  private startedAt = 0;
  private startFixture: unknown;
  private warnings: string[] = [];
  private timeout?: ReturnType<typeof setTimeout>;
  private pending?: BugReport;
  private disposed = false;
  private buffering: Promise<void> = Promise.resolve();
  get cancellable(): boolean {
    return (
      this.state === "starting" ||
      this.state === "recording" ||
      (this.state === "idle" && !!this.pending)
    );
  }
  constructor(
    private editor: SketchEditor,
    parent: HTMLElement,
  ) {
    this.panel = bugPanel(
      parent,
      () => void this.toggle(),
      () => void this.cancel(),
    );
  }
  bufferChanged(): Promise<void> {
    this.buffering = this.buffering.then(async () => {
      if (this.state !== "idle" || this.disposed) return;
      try {
        if (bugPrebuffer()) await this.video.open();
        else {
          await this.video.close();
          this.timeline.clear();
        }
      } catch (error) {
        this.panel.warning(`Recent video unavailable: ${String(error)}`);
      }
    });
    return this.buffering;
  }
  async toggle(): Promise<void> {
    if (this.state === "recording") return this.finish();
    if (this.state !== "idle") return;
    if (this.pending) return this.save(this.pending);
    const generation = ++this.generation;
    this.state = "starting";
    this.startedAt = Date.now();
    this.startFixture = bugFixture(this.editor);
    this.warnings = [];
    this.timeline.add("report-start", {});
    this.timeline.recording = true;
    this.panel.state("Starting bug report… Escape cancels", false, true);
    try {
      await this.buffering;
      if (generation !== this.generation) return;
      this.video.segments = recentSegments(this.video.segments, this.startedAt);
      this.video.pinned = true;
      await this.video.open();
      if (generation !== this.generation) return;
      this.state = "recording";
      this.panel.state("Recording window · requesting microphone… Cmd/Ctrl-B saves", true, true);
      void this.startMicrophone(generation);
      this.timeout = setTimeout(() => {
        this.warnings.push("Stopped at the five-minute limit");
        void this.finish();
      }, 300000);
    } catch (error) {
      if (generation !== this.generation) return;
      await this.cancel();
      this.panel.state(`Bug recording failed: ${String(error)}`);
    }
  }
  private async startMicrophone(generation: number): Promise<void> {
    try {
      const microphone = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      if (generation !== this.generation) {
        for (const track of microphone.getTracks()) track.stop();
        return;
      }
      this.microphone = microphone;
      this.audioStart = Date.now();
      this.audio = recordStream(microphone, true);
      for (const track of microphone.getTracks())
        track.onended = () => {
          this.warnings.push("Microphone disconnected during recording");
          this.panel.state(
            "Recording window · microphone disconnected · Cmd/Ctrl-B saves",
            true,
            true,
          );
        };
    } catch (error) {
      if (generation !== this.generation) return;
      this.stopMicrophone();
      this.warnings.push(`Microphone unavailable: ${String(error)}`);
    }
    if (generation !== this.generation) return;
    this.panel.state(
      this.audio
        ? "Recording window + microphone · Cmd/Ctrl-B saves · Escape cancels"
        : "Recording window without microphone · Cmd/Ctrl-B saves · Escape cancels",
      true,
      true,
    );
  }
  private stopMicrophone(): void {
    for (const track of this.microphone?.getTracks() ?? []) {
      track.onended = null;
      track.stop();
    }
    this.microphone = undefined;
  }
  async finish(): Promise<void> {
    if (this.state !== "recording") return;
    this.state = "saving";
    ++this.generation;
    clearTimeout(this.timeout);
    const endedAt = Date.now(),
      endFixture = bugFixture(this.editor);
    this.timeline.add("report-stop", {});
    this.panel.state("Saving bug report…");
    try {
      const audio = this.audio;
      this.audio = undefined;
      const sound = audio
        ?.stop()
        .catch((error) => {
          this.warnings.push(`Microphone encoding failed: ${String(error)}`);
          return null;
        })
        .finally(() => this.stopMicrophone());
      if (!audio && !this.warnings.some((warning) => warning.startsWith("Microphone")))
        this.warnings.push("Microphone was not ready before the report stopped");
      if (!audio) this.stopMicrophone();
      await this.video.flush(false);
      const media = await Promise.all(
        this.video.segments.map(async (segment, index) => ({
          name: `video-${String(index).padStart(4, "0")}.webm`,
          start: segment.start,
          end: segment.end,
          bytes: await segment.blob.arrayBuffer(),
        })),
      );
      const narration = await sound;
      if (narration)
        media.push({
          name: "narration.webm",
          start: this.audioStart,
          end: endedAt,
          bytes: await narration.arrayBuffer(),
        });
      if (this.timeline.dropped)
        this.warnings.push(
          `${this.timeline.dropped} oldest diagnostic events dropped at the event limit`,
        );
      const report: BugReport = {
        startedAt: this.startedAt,
        endedAt,
        fixtures: { start: await this.startFixture, end: await endFixture },
        events: [...this.timeline.events],
        media,
        warnings: [...this.warnings],
      };
      await this.video.close();
      this.timeline.recording = false;
      this.timeline.clear();
      await this.save(report);
    } catch (error) {
      await this.cancel();
      this.panel.state(`Bug report could not be assembled: ${String(error)}`);
    }
  }
  private async save(report: BugReport): Promise<void> {
    this.state = "saving";
    this.pending = report;
    try {
      const result = await window.makeshiftBug?.save(report);
      if (!result) throw new Error("Desktop report host unavailable");
      this.pending = undefined;
      this.panel.saved(result);
    } catch (error) {
      this.panel.state(
        `Save failed: ${String(error)} · Cmd/Ctrl-B retries · Escape discards`,
        true,
        true,
      );
    } finally {
      this.state = "idle";
      await this.bufferChanged();
    }
  }
  async cancel(): Promise<void> {
    ++this.generation;
    clearTimeout(this.timeout);
    this.state = "saving";
    const audio = this.audio;
    this.audio = undefined;
    await audio?.stop().catch(() => {});
    this.stopMicrophone();
    await this.buffering;
    await this.video.close().catch(() => {});
    this.pending = undefined;
    this.timeline.recording = false;
    this.timeline.clear();
    this.state = "idle";
    this.panel.state("Bug recording cancelled");
    await this.bufferChanged();
  }
  private mediaFailed(error: unknown): void {
    this.warnings.push(String(error));
    if (this.state === "recording") void this.finish();
    else if (this.state === "idle") {
      void this.video.close().catch(() => {});
      this.panel.warning(`Recent video stopped: ${String(error)}`);
    }
  }
  dispose(): void {
    this.disposed = true;
    void this.cancel();
    this.panel.dispose();
  }
}
