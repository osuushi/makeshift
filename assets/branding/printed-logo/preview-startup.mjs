import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright";
import { FixedStepCapture } from "../../../.agents/skills/playwright-demo/scripts/fixed-step-capture.mjs";

const directory = resolve(process.argv[2] ?? ".cache/printed-logo/startup-full/preview");
await mkdir(directory, { recursive: true });
const assets = pathToFileURL(`${resolve("assets/public")}/`).href;
const timing = JSON.parse(await readFile("assets/public/startup/source.json", "utf8"));
const html = (await readFile("src/sketch/index.html", "utf8"))
  .replaceAll('href="./', `href="${assets}`)
  .replaceAll('src="./', `src="${assets}`)
  .replace('<script type="module" src="/entry.ts"></script>', "")
  .replace("</head>", `<base href="${assets}"/></head>`);
await writeFile(`${directory}/index.html`, html);
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({
    viewport: { width: 1280, height: 850 },
    deviceScaleFactor: 2,
    colorScheme: "light",
  });
  await page.clock.install();
  await page.clock.pauseAt(new Date());
  await page.goto(pathToFileURL(`${directory}/index.html`).href);
  await page.evaluate(async () => {
    const video = document.querySelector("video");
    video.pause();
    if (video.readyState < 2)
      await new Promise((resolve) => video.addEventListener("loadeddata", resolve, { once: true }));
    await document.fonts.ready;
  });
  let frame = 0;
  const capture = new FixedStepCapture(page, `${directory}/frames`, timing.fps, async () => {
    if (frame < timing.frames) {
      await page.evaluate(
        async ({ frame, fps }) => {
          const video = document.querySelector("video");
          video.pause();
          const seek = new Promise((resolve) =>
            video.addEventListener("seeked", resolve, { once: true }),
          );
          video.currentTime = (frame + 0.1) / fps;
          await seek;
        },
        { frame, fps: timing.fps },
      );
    } else if (frame === timing.frames) {
      await page.evaluate(() => document.querySelector("video").dispatchEvent(new Event("ended")));
    }
    frame++;
  });
  // Startup timers begin at navigation; do not add the helper's one-second settling hold.
  capture.started = Date.now();
  await rm(`${directory}/frames`, { recursive: true, force: true });
  await mkdir(`${directory}/frames`, { recursive: true });
  await capture.hold(timing.frames / timing.fps + 1.5);
  const metadata = await capture.export(`${directory}/makeshift-loading-preview.mp4`);
  await writeFile(`${directory}/manifest.json`, JSON.stringify(metadata, null, 2));
  await page.screenshot({ path: `${directory}/wordmark.png` });
  console.log(JSON.stringify(metadata));
} finally {
  await browser.close();
}
