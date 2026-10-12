import { setTimeout } from "node:timers/promises";

/** Wait on host time: the capture clock is paused and cannot service RAF polling. */
export async function syncKernel(page, timeout = 30000) {
  const deadline = performance.now() + timeout;
  while (true) {
    const ready = await page.evaluate(() => {
      const state = window.makeshiftInspect?.();
      return state && !state.busy && !state.solving;
    });
    if (ready) return;
    if (performance.now() >= deadline) throw new Error("Kernel did not settle before demo frame");
    await setTimeout(10);
  }
}
