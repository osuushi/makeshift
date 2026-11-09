import { recentSegments } from "./timeline.js";

export interface VideoSegment {
  start: number;
  end: number;
  blob: Blob;
}
/** Each recording has its own WebM header; timeslice fragments alone are not playable. */
export function recordStream(stream: MediaStream, audio = false) {
  const mimeType = audio ? "audio/webm;codecs=opus" : "video/webm;codecs=vp8";
  const recorder = new MediaRecorder(stream, {
    mimeType,
    ...(audio ? { audioBitsPerSecond: 64000 } : { videoBitsPerSecond: 4000000 }),
  });
  const chunks: Blob[] = [];
  let failure: Error | undefined;
  recorder.ondataavailable = (event) => {
    if (event.data.size) chunks.push(event.data);
  };
  recorder.onerror = () => {
    failure = new Error("Media encoder failed");
  };
  const finished = new Promise<Blob>((resolve, reject) => {
    recorder.onstop = () =>
      failure ? reject(failure) : resolve(new Blob(chunks, { type: mimeType }));
  });
  // A device failure may stop the recorder before its owner requests stop.
  void finished.catch(() => {});
  recorder.start(1000);
  return {
    stop: () => {
      if (recorder.state !== "inactive") recorder.stop();
      return finished;
    },
  };
}

export class BugVideo {
  private stream?: MediaStream;
  private opening?: Promise<void>;
  private current?: ReturnType<typeof recordStream>;
  private timer?: ReturnType<typeof setTimeout>;
  private start = 0;
  private rotating: Promise<void> = Promise.resolve();
  segments: VideoSegment[] = [];
  pinned = false;
  constructor(private failed: (error: unknown) => void) {}
  async open(): Promise<void> {
    if (this.stream) return;
    if (this.opening) return this.opening;
    this.opening = this.acquire();
    try {
      await this.opening;
    } finally {
      this.opening = undefined;
    }
  }
  private async acquire(): Promise<void> {
    await window.makeshiftBug?.prepare();
    this.stream = await navigator.mediaDevices.getDisplayMedia({
      audio: false,
      video: {
        frameRate: { ideal: 8, max: 8 },
        width: { ideal: 1920, max: 1920 },
        height: { ideal: 1200, max: 1200 },
      },
    });
    for (const track of this.stream.getTracks())
      track.onended = () => this.failed(new Error("Window capture ended"));
    this.begin();
  }
  private begin(): void {
    if (!this.stream) return;
    this.start = Date.now();
    this.current = recordStream(this.stream);
    this.timer = setTimeout(() => {
      void this.flush().catch(this.failed);
    }, 5000);
  }
  async flush(restart = true): Promise<void> {
    clearTimeout(this.timer);
    await this.rotating;
    const current = this.current;
    if (!current) return;
    this.current = undefined;
    const start = this.start,
      end = Date.now();
    // Start the next encoder before awaiting delivery of the previous final chunk.
    if (restart) this.begin();
    this.rotating = current
      .stop()
      .then((blob) => {
        if (blob.size) this.segments.push({ start, end, blob });
        if (!this.pinned) this.segments = recentSegments(this.segments, end);
        if (
          this.segments.reduce((size, segment) => size + segment.blob.size, 0) >
          100 * 1024 * 1024
        )
          this.failed(new Error("Recording reached the 100 MB video limit"));
      })
      .catch(this.failed);
    await this.rotating;
  }
  async close(): Promise<void> {
    clearTimeout(this.timer);
    if (this.opening) await this.opening.catch(() => {});
    try {
      await this.flush(false);
    } finally {
      for (const track of this.stream?.getTracks() ?? []) {
        track.onended = null;
        track.stop();
      }
      this.stream = undefined;
      this.segments = [];
      this.pinned = false;
      this.rotating = Promise.resolve();
    }
  }
}
