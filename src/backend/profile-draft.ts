import type { Body } from "../model/body.js";
import type { ProfileEditView, ProfileSelection } from "../model/revolved-profile.js";
import type { Sketch, SketchDocument } from "../sketch/document.js";
import type { Profile } from "../sketch/profiles.js";
import { ProfileRebuild, type RestoredProfileBody } from "./profile-rebuild.js";
import { profileGeometry, profileGeometryKey, profileRegion } from "./profile-region.js";
import type { SolidCalculator } from "./solid-calculator.js";

interface ProfileDraftInput {
  source: ProfileSelection;
  height: number;
  endGuides: boolean;
  initial: string;
  origins: ReadonlyMap<string, string>;
}

export interface ReopenProfile extends ProfileDraftInput {
  sketch: Sketch;
  key: string;
  removedDimples: number;
}

/** A single temporary sketch and its sketch-only Undo and Redo history. */
export class ProfileDraft {
  private past: Sketch[] = [];
  private future: Sketch[] = [];
  readonly rebuild: ProfileRebuild;
  draft?: Sketch;

  constructor(
    readonly body: Body,
    readonly input: ProfileDraftInput,
    public sketch: Sketch,
    private region: Profile | undefined,
    calculator: SolidCalculator,
    readonly reopened?: { document: SketchDocument; result: RestoredProfileBody },
  ) {
    this.rebuild = new ProfileRebuild(
      calculator,
      input.source,
      body,
      input.initial,
      reopened?.result,
    );
  }

  get view(): ProfileEditView {
    return {
      body: this.body.id,
      height: this.input.height,
      endGuides: this.input.endGuides,
      sketch: this.sketch,
      region: this.region,
      draft: this.draft,
      canUndo: !!this.past.length,
      canRedo: !!this.future.length,
      ...this.rebuild.view,
    };
  }

  change(sketch: Sketch, checkpoint = true): void {
    if (checkpoint && JSON.stringify(this.sketch) !== JSON.stringify(sketch)) {
      this.past.push(this.sketch);
      this.future.length = 0;
    }
    this.sketch = sketch;
    this.draft = undefined;
    try {
      this.region = profileRegion(sketch, this.input);
      if (!this.region) throw new Error("Close a region to apply the profile");
      const geometry = profileGeometry(this.region, sketch, this.input.origins);
      this.rebuild.update(geometry, profileGeometryKey(geometry));
    } catch (error) {
      this.rebuild.update(
        undefined,
        undefined,
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  history(direction: "undo" | "redo"): void {
    const from = direction === "undo" ? this.past : this.future;
    const to = direction === "undo" ? this.future : this.past;
    const target = from.pop();
    if (!target) return;
    to.push(this.sketch);
    this.change(target, false);
  }

  snapshot(): ReopenProfile {
    const key = this.rebuild.key;
    if (key === undefined) throw new Error("Could not retain the applied profile");
    return {
      ...this.input,
      sketch: this.sketch,
      key,
      removedDimples: this.rebuild.view.removedDimples,
    };
  }
}
