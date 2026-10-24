/** Read-only counters around the real app's worker messages and displayed candidates. */
export function instrumentDrag() {
  const stats = { events: [], previews: [], input: [], started: 0, stopped: false };
  window.kernelDragStats = stats;
  const NativeWorker = window.Worker;
  window.Worker = class extends NativeWorker {
    constructor(...args) {
      super(...args);
      this.kernel = false;
      this.addEventListener("message", ({ data }) => {
        if (this.kernel)
          stats.events.push({
            event: "reply",
            time: performance.now(),
            error: data.error ?? data.result?.error,
          });
      });
    }
    postMessage(message, ...args) {
      if (message?.calculator === "kernel") {
        if (!this.kernel) stats.events.push({ event: "start", time: performance.now() });
        this.kernel = true;
        stats.events.push({ event: "request", time: performance.now(), kind: message.input.kind });
      }
      super.postMessage(message, ...args);
    }
    terminate() {
      if (this.kernel) stats.events.push({ event: "terminate", time: performance.now() });
      super.terminate();
    }
  };
  window.startKernelDragSampling = () => {
    stats.events = [];
    stats.previews = [];
    stats.input = [];
    stats.started = performance.now();
    stats.stopped = false;
    let previous;
    const sample = () => {
      if (stats.stopped) return;
      const state = window.makeshiftInspect();
      const bounds = state.preview?.bodies?.[0]?.bounds;
      const height = bounds ? bounds[5] - bounds[2] : null;
      if (height !== previous) {
        stats.previews.push({ time: performance.now(), height });
        previous = height;
      }
      // Sampling is fixed in wall time, without a virtual browser clock.
      setTimeout(() => requestAnimationFrame(sample), 50);
    };
    requestAnimationFrame(sample);
  };
  window.addEventListener("pointermove", (event) => {
    if (stats.started && !stats.stopped)
      stats.input.push({
        time: performance.now(),
        x: event.clientX,
        y: event.clientY,
        trusted: event.isTrusted,
      });
  });
}
