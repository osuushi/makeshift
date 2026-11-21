import type { Body } from "../model/body.js";
import { topologyOrigins } from "../model/body-correspondence.js";
import { exactBodies } from "../model/exact-body.js";
import type { ProfileEditView, ProfileSelection } from "../model/revolved-profile.js";
import { continuingBodies, materialize } from "./kernel-result.js";
import type { profileGeometry } from "./profile-region.js";
import type { SolidCalculator } from "./solid-calculator.js";

type Geometry = ReturnType<typeof profileGeometry>;
type Preview = Pick<ProfileEditView, "preview" | "pending" | "removedDimples" | "error">;
export interface RestoredProfileBody {
  key: string;
  preview: Body;
  removedDimples: number;
}

function removedDimples(before: Body, preview: Body): number {
  const continued = new Set([...(topologyOrigins.get(preview)?.faces?.values() ?? [])].flat());
  return before.faces.filter((face) => face.sphere?.outward === -1 && !continued.has(face.id))
    .length;
}

/** One immutable calculation at a time, with at most the latest sketch waiting behind it. */
export class ProfileRebuild {
  private target?: Geometry;
  private running?: Promise<void>;
  key: string | undefined;
  view: Preview;

  constructor(
    private calculator: SolidCalculator,
    private source: ProfileSelection,
    private body: Body,
    private original: string,
    private restored?: RestoredProfileBody,
  ) {
    this.key = restored?.key ?? original;
    this.view = {
      preview: restored?.preview,
      pending: false,
      removedDimples: restored?.removedDimples ?? 0,
    };
  }

  update(geometry: Geometry | undefined, key: string | undefined, error?: string): void {
    if (geometry && key === this.key && !this.view.error) return;
    this.key = key;
    const restored = this.restored?.key === key ? this.restored : undefined;
    if (!geometry || key === this.original || restored) {
      this.target = undefined;
      this.view = {
        preview: restored?.preview,
        pending: false,
        removedDimples: restored?.removedDimples ?? 0,
        error,
      };
      return;
    }
    this.target = geometry;
    this.view = { ...this.view, pending: true, error: undefined };
    this.start();
  }

  private start(): void {
    if (this.running || !this.target) return;
    this.running = this.calculate(this.target).finally(() => {
      this.running = undefined;
      this.start();
    });
  }

  private async calculate(target: Geometry): Promise<void> {
    let result: Preview;
    try {
      const bodies = [this.body];
      const reply = await this.calculator.calculate({
        kind: "replace-revolved-profile",
        ...this.source,
        ...target,
        bodies: exactBodies(bodies),
      });
      const [preview] = continuingBodies(bodies, materialize(bodies, reply));
      result = { preview, pending: false, removedDimples: removedDimples(this.body, preview) };
    } catch (error) {
      result = {
        pending: false,
        removedDimples: 0,
        error: error instanceof Error ? error.message : String(error),
      };
    }
    if (this.target !== target) return;
    this.target = undefined;
    this.view = result;
  }

  async settle(): Promise<void> {
    while (this.running && this.target) await this.running;
  }

  dispose(): void {
    this.target = undefined;
    this.calculator.close();
  }
}
