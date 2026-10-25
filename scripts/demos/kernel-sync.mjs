import { setTimeout } from "node:timers/promises";

/** Wait for geometry on host time; a delivered mesh lets capture service deferred RAFs. */
export async function syncKernel(page, timeout = 30000) {
  const deadline = performance.now() + timeout;
  while (true) {
    const ready = await page.evaluate(() => {
      const state = window.makeshiftInspect?.();
      // Staged previews need two paint frames before metadata can complete.
      // Capture their valid mesh so the next fixed clock step can release that wait.
      return state && ((!state.busy && !state.solving) || state.visualPreview?.bodies.length > 0);
    });
    if (ready) return;
    if (performance.now() >= deadline) throw new Error("Kernel did not settle before demo frame");
    await setTimeout(10);
  }
}
