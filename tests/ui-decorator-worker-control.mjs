/** Controlled delivery delay exercises pending/stale replies; it is not slower hardware. */
export async function installPreviewControl(page) {
  await page.addInitScript(() => {
    const Worker = window.Worker;
    const state = {
      hold: false,
      holdSettled: false,
      replies: [],
      posts: 0,
      samples: [],
      terminated: 0,
    };
    window.previewTest = state;
    window.Worker = class extends Worker {
      constructor(url, options) {
        super(url, options);
        this.decoratorPreview = String(url).includes("preview-worker");
      }
      postMessage(...args) {
        if (this.decoratorPreview) state.posts++;
        return super.postMessage(...args);
      }
      terminate() {
        if (this.decoratorPreview) state.terminated++;
        super.terminate();
      }
      set onmessage(handler) {
        super.onmessage = (event) => {
          if (this.decoratorPreview) {
            state.samples.push({ elapsedMs: event.data.elapsedMs, samples: event.data.samples });
            if (
              state.hold ||
              (state.holdSettled && event.data.samples?.some((sample) => !sample.live))
            ) {
              state.replies.push(() => handler.call(this, event));
              return;
            }
          }
          handler.call(this, event);
        };
      }
    };
  });
}
export async function holdPreviews(page, hold = true) {
  await page.evaluate((hold) => {
    window.previewTest.hold = hold;
    if (!hold) {
      window.previewTest.holdSettled = false;
      for (const release of window.previewTest.replies.splice(0)) release();
    }
  }, hold);
}
export async function previewReady(page) {
  await page.waitForFunction(() => {
    const view = window.makeshiftInspect();
    return (
      view.decoratorPreviewBounds.length &&
      !document.querySelector(".decorator-preview-status")?.matches(":not([hidden])")
    );
  });
}
export async function previewStats(page) {
  return page.evaluate(() => ({
    posts: window.previewTest.posts,
    terminated: window.previewTest.terminated,
    samples: window.previewTest.samples,
  }));
}
