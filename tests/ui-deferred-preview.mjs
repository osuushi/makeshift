export async function holdCompletion(page) {
  await page.evaluate(async (url) => {
    const { DeferredPreview } = await import(url);
    const original = DeferredPreview.prototype.run;
    let release;
    const held = new Promise((resolve) => {
      release = resolve;
    });
    window.deferredPresentation = {
      reached: false,
      timings: [],
      release,
      restore: () => {
        DeferredPreview.prototype.run = original;
      },
    };
    DeferredPreview.prototype.run = function (request, call, show) {
      const started = performance.now();
      return original.call(
        this,
        request,
        async (next) => {
          if (next.kind === "complete-preview" && !window.deferredPresentation.reached) {
            window.deferredPresentation.reached = true;
            await held;
            if (this.superseded) throw new Error("Preview superseded");
          }
          return call(next);
        },
        (reply) => {
          window.deferredPresentation.timings.push(performance.now() - started);
          show(reply);
        },
      );
    };
  }, "/deferred-preview.ts");
}
