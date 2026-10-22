import type { InteractionLease } from "../sketch/active-interaction.js";
import type { GuideToolSession } from "./tool-path.js";

/** A guide gesture borrows the tool's lease and restores its starting value on cancellation. */
export function guideToolSession(options: {
  lease: InteractionLease;
  initial: number;
  existing: boolean;
  queue(distance: number): void;
  settle(): Promise<void>;
  valid(): boolean;
  distance(): number;
  cancel(): Promise<void>;
}): GuideToolSession {
  return {
    lease: options.lease,
    preview: (distance) => options.queue(distance ?? options.initial),
    settled: async (distance) => {
      await options.settle();
      return (
        options.lease.phase === "editing" &&
        options.valid() &&
        Math.abs(options.distance() - distance) < 1e-7
      );
    },
    release: async (keep) => {
      if (!keep) {
        if (!options.existing) return options.cancel();
        options.queue(options.initial);
      }
      await options.settle();
    },
  };
}
