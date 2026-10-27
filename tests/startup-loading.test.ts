import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";

class Element extends EventTarget {
  inert = false;
  removed = false;
  textContent = "";
  className = "";
  classes = new Set<string>();
  classList = {
    add: (name: string) => this.classes.add(name),
    remove: (name: string) => this.classes.delete(name),
  };
  children: Element[] = [];
  querySelector(selector: string): Element | undefined {
    return selector === "video" ? video : status;
  }
  replaceChildren(): void {
    this.children = [];
  }
  append(...children: Element[]): void {
    this.children.push(...children);
  }
  remove(): void {
    this.removed = true;
  }
}
// The browser boundary owns media playback; the unit route controls its events/time.
let video: Element & {
  src: string;
  clientWidth: number;
  canPlayType(): string;
  pause(): void;
  play(): Promise<void>;
};
let status: Element;
function startup(
  reduced = false,
  rejectPlayback = false,
  mac = false,
  density = 1,
  animate = true,
) {
  const screen = new Element(),
    app = new Element(),
    window = new EventTarget();
  video = Object.assign(new Element(), {
    src: "",
    clientWidth: 1080,
    canPlayType: () => (mac ? "probably" : ""),
    pause: () => {},
    play: () =>
      rejectPlayback
        ? Promise.reject(Object.assign(new Error("Autoplay blocked"), { name: "NotAllowedError" }))
        : Promise.resolve(),
  });
  status = new Element();
  const timers = new Map<number, { at: number; run: () => void }>();
  let now = 0,
    sequence = 0;
  runInNewContext(readFileSync("assets/public/startup/loading.js", "utf8"), {
    HTMLElement: Element,
    window: Object.assign(window, {
      devicePixelRatio: density,
      makeshiftStartup: { animate, platform: mac ? "darwin" : "browser" },
    }),
    document: {
      documentElement: { dataset: { theme: "light" } },
      querySelector: (selector: string) => (selector === "#startup" ? screen : app),
      createElement: () => new Element(),
    },
    matchMedia: () => ({ matches: reduced }),
    setTimeout: (run: () => void, delay: number) => {
      timers.set(++sequence, { at: now + delay, run });
      return sequence;
    },
    clearTimeout: (id: number) => timers.delete(id),
  });
  const advance = (milliseconds: number) => {
    const end = now + milliseconds;
    for (;;) {
      const next = [...timers].sort((a, b) => a[1].at - b[1].at)[0];
      if (!next || next[1].at > end) break;
      now = next[1].at;
      timers.delete(next[0]);
      next[1].run();
    }
    now = end;
  };
  return { screen, app, window, video, advance, status };
}

test("fast startup fades for 500ms after the wordmark before releasing editor input", () => {
  const run = startup();
  run.window.dispatchEvent(new Event("makeshift-ready"));
  assert.equal(run.app.inert, true);
  run.video.dispatchEvent(new Event("ended"));
  run.advance(649);
  assert.equal(run.screen.removed, false);
  run.advance(1);
  assert.equal(run.screen.classes.has("is-dismissing"), true);
  assert.equal(run.screen.classes.has("is-waiting"), false);
  run.advance(499);
  assert.equal(run.screen.removed, false);
  assert.equal(run.app.inert, true);
  // Repeated readiness signals must not restart the exit fade.
  run.window.dispatchEvent(new Event("makeshift-ready"));
  run.advance(1);
  assert.equal(run.screen.removed, true);
  assert.equal(run.app.inert, false);
});

test("slow startup holds the completed wordmark and spinner until the model is ready", () => {
  const run = startup();
  run.video.dispatchEvent(new Event("ended"));
  run.advance(650);
  assert.equal(run.screen.removed, false);
  assert.equal(run.screen.classes.has("is-waiting"), true);
  run.window.dispatchEvent(new Event("makeshift-ready"));
  assert.equal(run.screen.removed, false);
  assert.equal(run.screen.classes.has("is-dismissing"), true);
  run.advance(500);
  assert.equal(run.screen.removed, true);
});

test("failed media and stalled media both release a ready editor", () => {
  for (const failure of ["error", "stalled"]) {
    const run = startup();
    run.window.dispatchEvent(new Event("makeshift-ready"));
    if (failure === "error") run.video.dispatchEvent(new Event("error"));
    run.advance(6150);
    assert.equal(run.screen.removed, true);
  }
});

test("blocked autoplay falls back to the wordmark", async () => {
  const run = startup(false, true);
  run.window.dispatchEvent(new Event("makeshift-ready"));
  await Promise.resolve();
  run.advance(1150);
  assert.equal(run.screen.removed, true);
});

test("Mac Retina prefers HEVC but decoder failures fall through full and small H.264", () => {
  const run = startup(false, false, true, 2);
  assert.ok(run.video.src.endsWith("print-light-hevc.mp4"));
  run.video.dispatchEvent(new Event("error"));
  assert.ok(run.video.src.endsWith("print-light.mp4"));
  assert.equal(run.screen.classes.has("is-wordmark"), false);
  run.video.dispatchEvent(new Event("error"));
  assert.ok(run.video.src.endsWith("print-light-small.mp4"));
  run.video.dispatchEvent(new Event("error"));
  assert.equal(run.screen.classes.has("is-wordmark"), true);
});

test("browser playback uses H.264 at a resolution appropriate to display density", () => {
  assert.ok(startup().video.src.endsWith("print-light-small.mp4"));
  assert.ok(startup(false, false, false, 2).video.src.endsWith("print-light.mp4"));
});

test("reduced motion does not impose the animation delay", () => {
  const run = startup(true);
  run.window.dispatchEvent(new Event("makeshift-ready"));
  run.advance(0);
  assert.equal(run.screen.removed, true);
});

test("additional desktop windows show a static loading mark without replaying the movie", () => {
  const run = startup(false, false, true, 2, false);
  assert.equal(run.video.src, "");
  assert.equal(run.screen.classes.has("is-static"), true);
  run.window.dispatchEvent(new Event("makeshift-ready"));
  run.advance(0);
  assert.equal(run.screen.removed, true);
});

test("startup failure presents an actionable error and cannot be dismissed by ready", () => {
  const run = startup();
  run.window.dispatchEvent(
    Object.assign(new Event("makeshift-startup-error"), { detail: "Kernel unavailable" }),
  );
  run.window.dispatchEvent(new Event("makeshift-ready"));
  run.advance(10000);
  assert.equal(run.screen.removed, false);
  assert.equal(
    run.status.children[0]?.children[0]?.textContent,
    "Makeshift could not start: Kernel unavailable",
  );
  assert.equal(run.status.children[0]?.children[1]?.textContent, "Reload");
});

test("a startup error during the exit fade restores the screen and keeps input blocked", () => {
  const run = startup();
  run.window.dispatchEvent(new Event("makeshift-ready"));
  run.video.dispatchEvent(new Event("ended"));
  run.advance(900);
  assert.equal(run.screen.classes.has("is-dismissing"), true);
  run.window.dispatchEvent(new Event("makeshift-startup-error"));
  run.advance(1000);
  assert.equal(run.screen.classes.has("is-dismissing"), false);
  assert.equal(run.screen.removed, false);
  assert.equal(run.app.inert, true);
});
