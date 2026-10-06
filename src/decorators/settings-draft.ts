import type { InteractionLease } from "../sketch/active-interaction.js";
import type { SketchEditor } from "../sketch/editor.js";
import { isBuiltinDecorator } from "./builtins.js";
import { editDecorators } from "./edits.js";
import type { DecoratorEdit } from "./types.js";

type SettingsEdit = Extract<DecoratorEdit, { action: "settings" }>;
interface Draft {
  lease: InteractionLease;
  edit: SettingsEdit;
  valid: boolean;
  pending: Promise<void> | null;
}

/** One numeric gesture, shared by built-in and bundled decorator controls. */
export class DecoratorSettingsDraft {
  private current: Draft | null = null;
  private committing: Promise<boolean> | null = null;
  constructor(
    private editor: SketchEditor,
    private ended: () => void,
  ) {}
  get active(): boolean {
    return this.current !== null;
  }
  get waiting(): boolean {
    return this.current?.lease.phase === "waiting";
  }
  preview(edit: SettingsEdit): void {
    if (!this.current) {
      const lease = this.editor.interactions.acquire(
        "numeric",
        () => this.cancel(),
        () => this.commit(),
        { navigation: "when-released" },
      );
      if (!lease) return;
      this.current = { lease, edit, valid: false, pending: null };
    }
    const draft = this.current;
    if (draft.lease.phase !== "editing") return;
    draft.edit = edit;
    draft.valid = false;
    const custom = this.editor.store.data.decorators?.some(
      (d) => edit.ids.includes(d.id) && !isBuiltinDecorator(d.definition),
    );
    if (custom) {
      draft.pending ??= this.compute(draft);
    } else {
      try {
        draft.lease.show(editDecorators(this.editor.store.data, edit));
        draft.valid = true;
        this.editor.message = "";
      } catch (error) {
        draft.lease.show(null);
        this.editor.message = error instanceof Error ? error.message : String(error);
      }
    }
    this.editor.refresh();
  }
  private async compute(draft: Draft): Promise<void> {
    try {
      while (this.current === draft) {
        const edit = draft.edit,
          snapshot = this.editor.store.data;
        try {
          const decorators = await this.editor.store.draftDecorator(edit);
          if (this.current !== draft) return;
          if (this.editor.store.data !== snapshot) {
            this.cancel();
            return;
          }
          if (draft.edit !== edit) continue;
          draft.lease.show({ ...snapshot, decorators });
          draft.valid = true;
          this.editor.message = "";
        } catch (error) {
          if (this.current !== draft) return;
          if (draft.edit !== edit) continue;
          draft.valid = false;
          draft.lease.show(null);
          this.editor.message = error instanceof Error ? error.message : String(error);
        }
        this.editor.refresh();
        if (draft.edit === edit) return;
      }
    } finally {
      draft.pending = null;
    }
  }
  cancel(): void {
    const draft = this.current;
    this.current = null;
    this.ended();
    draft?.lease.release();
    this.editor.refresh();
  }
  async blur(): Promise<void> {
    const draft = this.current;
    if (draft?.lease.phase !== "editing") return;
    await this.commit();
  }
  commit(): Promise<boolean> {
    this.committing ??= this.acceptCurrent().finally(() => {
      this.committing = null;
    });
    return this.committing;
  }
  private async acceptCurrent(): Promise<boolean> {
    const draft = this.current;
    if (!draft) return true;
    if (!draft.lease.wait()) return false;
    this.editor.refresh();
    await draft.pending;
    if (this.current !== draft) return false;
    if (!draft.valid) {
      draft.lease.resume();
      this.editor.refresh();
      return false;
    }
    const accepted = await this.editor.store.request({ kind: "decorator", edit: draft.edit });
    if (this.current === draft) {
      if (accepted) this.cancel();
      else {
        draft.lease.resume();
        this.editor.message ||= "Could not apply these decorator settings";
        this.editor.refresh();
      }
    }
    return accepted;
  }
}
