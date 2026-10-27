import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const input = resolve(process.argv[2] ?? ".cache/printed-logo/startup-full");
const output = resolve("assets/public/startup");
const timing = JSON.parse(readFileSync(`${input}/source.json`, "utf8"));
mkdirSync(output, { recursive: true });
const variants = [
  { suffix: "", size: timing.resolution, codec: "libx264", crf: 20, level: "5.2" },
  { suffix: "-small", size: 1200, codec: "libx264", crf: 21, level: "4.2" },
  { suffix: "-hevc", size: timing.resolution, codec: "libx265", crf: 24, level: "5.1" },
];
const encodings = [];
for (const [theme, background] of [
  ["light", "f8f9fb"],
  ["dark", "161e29"],
]) {
  for (const variant of variants) {
    const filename = `print-${theme}${variant.suffix}.mp4`;
    encode(background, variant, filename);
    encodings.push({
      file: filename,
      codec: variant.codec === "libx265" ? "HEVC/hvc1" : "H.264/avc1",
      width: variant.size,
      height: variant.size,
      crf: variant.crf,
      bytes: statSync(`${output}/${filename}`).size,
    });
  }
}
writeFileSync(`${output}/source.json`, JSON.stringify({ ...timing, encodings }, null, 2));
const formatted = spawnSync(
  resolve("node_modules/.bin/biome"),
  ["format", "--write", `${output}/source.json`],
  { stdio: "inherit" },
);
if (formatted.error) throw formatted.error;
if (formatted.status !== 0) throw new Error("Startup metadata formatting failed");

function encode(background, variant, filename) {
  const hevc = variant.codec === "libx265";
  const result = spawnSync(
    process.env.FFMPEG ?? "ffmpeg",
    [
      "-y",
      "-v",
      "error",
      "-f",
      "lavfi",
      "-i",
      `color=c=0x${background}:s=${timing.resolution}x${timing.resolution}:r=${timing.fps}:d=${timing.frames / timing.fps},format=rgba`,
      "-framerate",
      String(timing.fps),
      "-start_number",
      "1",
      "-i",
      `${input}/frames/frame-%04d.png`,
      "-filter_complex",
      `[0:v][1:v]overlay=shortest=1:format=auto,scale=${variant.size}:${variant.size}:flags=lanczos:out_color_matrix=bt709:out_range=tv,format=yuv420p`,
      "-frames:v",
      String(timing.frames),
      "-c:v",
      variant.codec,
      "-preset",
      "slow",
      "-crf",
      String(variant.crf),
      "-profile:v",
      hevc ? "main" : "high",
      "-level:v",
      variant.level,
      ...(hevc
        ? ["-tag:v", "hvc1", "-x265-params", "pools=4:frame-threads=2:log-level=error"]
        : []),
      "-colorspace",
      "bt709",
      "-color_primaries",
      "bt709",
      "-color_trc",
      "bt709",
      "-movflags",
      "+faststart",
      "-an",
      `${output}/${filename}`,
    ],
    { stdio: "inherit" },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error("Startup encoding failed");
}
