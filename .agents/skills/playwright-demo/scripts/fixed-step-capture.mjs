import { spawn } from "node:child_process";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";

/** Capture real browser frames while advancing animation time independently of wall time. */
export class FixedStepCapture {
  constructor(page, directory, fps = 30) {
    this.page = page;
    this.directory = directory;
    this.fps = fps;
    this.frames = 0;
    this.pumping = false;
  }

  async start() {
    await rm(this.directory, { recursive: true, force: true });
    await mkdir(this.directory, { recursive: true });
    // Use browser time: a reloaded installed clock can be ahead of the host clock.
    const browserNow = await this.page.evaluate(() => Date.now());
    await this.page.clock.pauseAt(new Date(browserNow + 1000));
    this.started = Date.now();
  }

  async frame() {
    const next = Math.floor(((this.frames + 1) * 1000) / this.fps);
    const previous = Math.floor((this.frames * 1000) / this.fps);
    await this.page.clock.runFor(next - previous);
    await this.page.screenshot({
      path: path.join(this.directory, `${String(this.frames).padStart(6, "0")}.jpg`),
      type: "jpeg",
      quality: 88,
    });
    this.frames++;
  }

  async hold(seconds) {
    const count = Math.round(seconds * this.fps);
    for (let i = 0; i < count; i++) await this.frame();
  }

  /** Await an ordinary UI operation while servicing the paused browser's timers and RAFs. */
  async action(operation, limitSeconds = 15) {
    if (this.pumping) throw new Error("Do not overlap capture actions");
    this.pumping = true;
    let done = false;
    let failure;
    let value;
    Promise.resolve()
      .then(operation)
      .then(
        (result) => {
          value = result;
          done = true;
        },
        (error) => {
          failure = error;
          done = true;
        },
      );
    try {
      for (let i = 0; !done && i < this.fps * limitSeconds; i++) await this.frame();
      if (!done)
        throw new Error(`UI action did not finish within ${limitSeconds}s of capture time`);
      if (failure) throw failure;
      return value;
    } finally {
      this.pumping = false;
    }
  }

  async export(filename) {
    await command("ffmpeg", [
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      "-framerate",
      String(this.fps),
      "-i",
      path.join(this.directory, "%06d.jpg"),
      "-an",
      "-c:v",
      "libx264",
      "-preset",
      "fast",
      "-crf",
      "20",
      "-pix_fmt",
      "yuv420p",
      "-movflags",
      "+faststart",
      filename,
    ]);
    const result = JSON.parse(
      await command("ffprobe", [
        "-v",
        "error",
        "-show_entries",
        "stream=avg_frame_rate,nb_frames,width,height",
        "-show_entries",
        "format=duration,size",
        "-of",
        "json",
        filename,
      ]),
    );
    if (Number(result.streams[0].nb_frames) !== this.frames)
      throw new Error("Video frame count mismatch");
    if (Math.abs(Number(result.format.duration) - this.frames / this.fps) > 0.01)
      throw new Error("Video duration mismatch");
    return {
      frames: this.frames,
      fps: this.fps,
      renderSeconds: (Date.now() - this.started) / 1000,
      ...result,
    };
  }
}

async function command(executable, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { stdio: ["ignore", "pipe", "inherit"] });
    let output = "";
    child.stdout.on("data", (data) => {
      output += data;
    });
    child.on("error", reject);
    child.on("exit", (code) =>
      code === 0 ? resolve(output) : reject(new Error(`${executable} exited ${code}`)),
    );
  });
}
